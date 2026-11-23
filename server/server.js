// Finance tracker server. Run: node --experimental-sqlite server/server.js
// Plain Node http + built-in SQLite, no dependencies.
// Every row belongs to one user; the server sets and checks user_id itself, the browser cannot choose it.
// Every balance change goes through /api/money, which applies all of its changes and its records in one database transaction.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'finance.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), last_used INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rows (tbl TEXT NOT NULL, id TEXT NOT NULL, user_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (tbl, id));
CREATE INDEX IF NOT EXISTS rows_user ON rows (user_id, tbl);
CREATE TABLE IF NOT EXISTS money_keys (user_id TEXT NOT NULL, k TEXT NOT NULL, result TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, k));
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
`);
const SESSION_MS = 30 * 864e5;

const TABLES = new Set(['snapshots', 'activities', 'alert_history', 'bank_accounts', 'budget_tracking', 'categories', 'credit_card_payments', 'credit_cards',
  'income', 'income_schedules', 'known_entities', 'loan_payments', 'loans', 'report_templates', 'saved_filters', 'scheduled_payments',
  'settings', 'transactions', 'user_preferences', 'uploads', 'investments', 'assets', 'balance_points',
  // remembered form entries (descriptions, sources), used for suggestions
  'card_payment_contexts', 'expense_description_contexts', 'gift_card_purchase_contexts', 'income_source_contexts',
  'loan_creation_contexts', 'loan_payment_contexts', 'transfer_description_contexts',
  // merchant -> category, learned from what you record or set by you
  'category_rules',
  // bills that repeat (found in your history or added by you); browsers that get reminders
  'bills', 'push_subscriptions',
  // savings goals; credit scores you typed in, by bureau and day
  'goals', 'credit_scores']);
// Tables whose balance /api/money may change, and the fields it may change.
const MONEY_FIELDS = { bank_accounts: ['balance'], credit_cards: ['balance'], loans: ['balance'], investments: ['balance'], assets: ['balance'] };
// Tables only the server writes.
const SERVER_ONLY = new Set(['balance_points', 'snapshots', 'push_subscriptions']);
// The user's calendar day (balances are dated by it). APP_TZ defaults to Toronto, like the Telegram bot.
const APP_TZ = process.env.APP_TZ || 'America/Toronto';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: APP_TZ });
// A real calendar day written YYYY-MM-DD (February 31st is not one).
const isDay = (d) => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, day));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === day;
};

class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const fail = (s, m) => { throw new HttpError(s, m); };
const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const now = () => new Date().toISOString();
// Money is added up in whole cents so 0.1 + 0.2 stays 0.30.
const cents = (v) => Math.round(Number(v || 0) * 100);
const fromCents = (c) => c / 100;
const COL = /^[a-z_][a-z0-9_]*$/;
const col = (c) => { if (!COL.test(String(c))) fail(400, 'Unknown field: ' + c); return `json_extract(data, '$.${c}')`; };

// ---------- sign-in ----------
function authUser(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const u = t && db.prepare('SELECT u.id, u.name, u.email, s.last_used FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(t);
  if (!u || Date.now() - u.last_used > SESSION_MS) { if (u) db.prepare('DELETE FROM sessions WHERE token = ?').run(t); fail(401, 'Not signed in'); }
  if (Date.now() - u.last_used > 3600e3) db.prepare('UPDATE sessions SET last_used = ? WHERE token = ?').run(Date.now(), t);
  delete u.last_used;
  return u;
}
function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, last_used) VALUES (?, ?, ?)').run(token, userId, Date.now());
  db.prepare('DELETE FROM sessions WHERE last_used < ?').run(Date.now() - SESSION_MS);
  return token;
}
function userFor(email, name) {
  email = String(email).toLowerCase();
  let u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!u) {
    u = { id: crypto.randomUUID() };
    db.prepare('INSERT INTO users (id, name, email) VALUES (?,?,?)').run(u.id, String(name || email.split('@')[0]).slice(0, 60), email);
  }
  return u.id;
}
// Who may sign in: ALLOWED_EMAILS (comma separated). Empty means anyone with a Google account.
const ALLOWED = String(process.env.ALLOWED_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

// ---------- rows (the data API the app's tables use) ----------
const rowOut = (r) => JSON.parse(r.data);
function where(uid, tbl, filters = [], orGroups = []) {
  const parts = ['tbl = ?', 'user_id = ?'], args = [tbl, uid];
  const one = ([c, op, v]) => {
    const x = col(c);
    switch (op) {
      case 'eq': return v === null ? [`${x} IS NULL`, []] : [`${x} = ?`, [typeof v === 'boolean' ? (v ? 1 : 0) : v]];
      case 'neq': return v === null ? [`${x} IS NOT NULL`, []] : [`(${x} IS NULL OR ${x} != ?)`, [typeof v === 'boolean' ? (v ? 1 : 0) : v]];
      case 'gt': return [`${x} > ?`, [v]];
      case 'gte': return [`${x} >= ?`, [v]];
      case 'lt': return [`${x} < ?`, [v]];
      case 'lte': return [`${x} <= ?`, [v]];
      case 'is': return v === null ? [`${x} IS NULL`, []] : [`${x} = ?`, [v ? 1 : 0]];
      case 'not_is': return v === null ? [`${x} IS NOT NULL`, []] : [`${x} != ?`, [v ? 1 : 0]];
      case 'like': return [`${x} LIKE ?`, [v]];
      case 'ilike': return [`lower(${x}) LIKE lower(?)`, [v]];
      case 'in': if (!Array.isArray(v) || !v.length) return ['0', []]; return [`${x} IN (${v.map(() => '?').join(',')})`, v];
      case 'contains': return [`${x} LIKE ?`, ['%' + JSON.stringify(v).replace(/^[[{]|[\]}]$/g, '') + '%']];
      default: fail(400, 'Unknown filter: ' + op);
    }
  };
  for (const f of filters) { const [s, a] = one(f); parts.push(s); args.push(...a); }
  for (const g of orGroups) {
    if (!g.length) continue;
    const ss = []; for (const f of g) { const [s, a] = one(f); ss.push(s); args.push(...a); }
    parts.push('(' + ss.join(' OR ') + ')');
  }
  return [parts.join(' AND '), args];
}
function selectRows(uid, q) {
  const [w, args] = where(uid, q.table, q.filters, q.or);
  let sql = `SELECT data FROM rows WHERE ${w}`;
  if (q.order && q.order.length) sql += ' ORDER BY ' + q.order.map(([c, asc]) => `${col(c)} ${asc === false ? 'DESC' : 'ASC'}`).join(', ');
  if (q.limit != null) sql += ` LIMIT ${Math.max(0, Math.min(10000, +q.limit | 0))}`;
  if (q.offset) sql += ` OFFSET ${Math.max(0, +q.offset | 0)}`;
  return db.prepare(sql).all(...args).map(rowOut);
}
// Every balance carries the day it was last known (balance_as_of) and leaves a dated point in balance_points,
// one per account per day (the last figure of the day wins). That history drives net worth over time and
// investment snapshots; the date tells the user how current each figure is.
function stamp(uid, tbl, row, field, day) {
  if (!MONEY_FIELDS[tbl] || !MONEY_FIELDS[tbl].includes(field)) return row;
  const d = isDay(day) ? day : today();
  const acct = tbl;
  row.balance_as_of = d;
  db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify(row), tbl, String(row.id), uid);
  const pid = `${acct}:${row.id}:${d}`;
  const point = { id: pid, user_id: uid, account_table: acct, account_id: row.id, date: d, value: Number(row[field]) || 0, updated_at: now() };
  db.prepare('INSERT INTO rows (tbl, id, user_id, data) VALUES (?,?,?,?) ON CONFLICT(tbl, id) DO UPDATE SET data = excluded.data WHERE rows.user_id = excluded.user_id')
    .run('balance_points', pid, uid, JSON.stringify(point));
  return row;
}

function clean(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail(400, 'A row must be an object');
  const v = { ...values };
  for (const k of Object.keys(v)) if (!COL.test(k)) fail(400, 'Unknown field: ' + k);
  delete v._legs; // only /api/money writes the record of what a transaction moved
  delete v._undo; // and the record of the plain fields it changed along the way
  return v;
}
// A purchase split across categories: 2 to 20 parts, each a positive amount, adding up to the purchase to the cent.
// The money moves once for the whole amount; the parts only say which categories it was for.
function checkSplits(t) {
  if (t.splits == null) return;
  if (!Array.isArray(t.splits) || t.splits.length < 2 || t.splits.length > 20) fail(400, 'A split needs 2 to 20 parts.');
  t.splits = t.splits.map((p) => {
    const a = cents(p && p.amount);
    if (!(a > 0)) fail(400, 'Every part of a split needs an amount above zero.');
    return { category_id: p.category_id ? String(p.category_id) : null, category_name: p.category_name ? String(p.category_name).slice(0, 60) : null,
      amount: fromCents(a), ...(p.note ? { note: String(p.note).slice(0, 80) } : {}) };
  });
  const sum = t.splits.reduce((x, p) => x + cents(p.amount), 0);
  if (sum !== cents(t.amount)) fail(400, `The parts add up to ${fromCents(sum).toFixed(2)}, not the amount of ${fromCents(cents(t.amount)).toFixed(2)}.`);
}
// A tracked bill: a name its payments can be matched by, an amount above zero, a known rhythm, a real date,
// and only one tracked bill per merchant (two would both remind and both count in the month end).
const BILL_FREQ = new Set(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']);
function checkBill(uid, b) {
  if (b.status !== 'active') return;
  if (!String(b.name || '').trim() || String(b.key || '').length < 3) fail(400, 'Give the bill a name with at least 3 letters.');
  if (!(cents(b.amount) > 0)) fail(400, 'Enter the usual amount, above zero.');
  if (!BILL_FREQ.has(b.frequency)) fail(400, 'Choose how often the bill repeats.');
  if (!isDay(String(b.next_date || '').slice(0, 10))) fail(400, 'Choose the next due date.');
  const twin = selectRows(uid, { table: 'bills', filters: [['key', 'eq', b.key], ['status', 'eq', 'active']] }).find((x) => String(x.id) !== String(b.id));
  if (twin) fail(409, `${twin.name} is already tracked. Change that one instead.`);
}
// Figures on an account, card or loan are numbers: a balance may be below zero, the rest may not.
const AMOUNTS = ['credit_limit', 'overdraft_limit', 'payment_amount', 'minimum_payment', 'interest_rate', 'annual_fee', 'autopay_fixed', 'principal'];
// A transaction's date, however it is saved, is a real calendar day.
function checkWhen(v) {
  if (v.date == null || v.date === '') return;
  if (!isDay(String(v.date).slice(0, 10))) fail(400, 'That date does not exist. Choose the day it happened.');
}
// A savings goal: a name, an amount above zero, a real date when one is given.
function checkGoal(g) {
  if (!String(g.name || '').trim()) fail(400, 'Give the goal a name.');
  if (!(cents(g.target) > 0)) fail(400, 'Enter the amount to reach, above zero.');
  if (g.date != null && g.date !== '' && !isDay(String(g.date).slice(0, 10))) fail(400, 'That date does not exist. Choose a real day.');
  if (g.saved != null && g.saved !== '' && !(Number(g.saved) >= 0)) fail(400, 'Enter what is saved so far as a number, zero or more.');
}
// A credit score: which bureau, a whole number from 300 to 900, and the day it was checked (not in the future).
function checkScore(s) {
  const n = Number(s.score);
  if (!String(s.bureau || '').trim()) fail(400, 'Say which bureau the score is from.');
  if (!Number.isInteger(n) || n < 300 || n > 900) fail(400, 'A credit score is a whole number from 300 to 900.');
  const d = String(s.date || '').slice(0, 10);
  if (!isDay(d)) fail(400, 'Choose the day you checked it.');
  if (d > today()) fail(400, 'That day has not come yet.');
}
function checkFigures(tbl, v) {
  if (!MONEY_FIELDS[tbl]) return;
  for (const f of MONEY_FIELDS[tbl]) {
    if (!(f in v) || v[f] == null || v[f] === '') continue;
    if (!Number.isFinite(Number(v[f]))) fail(400, 'Enter the balance as a number.');
    v[f] = fromCents(cents(v[f]));
  }
  for (const f of AMOUNTS) {
    if (!(f in v) || v[f] == null || v[f] === '') continue;
    if (!Number.isFinite(Number(v[f])) || Number(v[f]) < 0) fail(400, `Enter ${f.replace(/_/g, ' ')} as a number, zero or more.`);
  }
  // Due dates on cards and loans are real calendar days (reminders and month end step from them).
  for (const f of ['due_date', 'next_payment_date', 'start_date']) {
    if (!(f in v) || v[f] == null || v[f] === '') continue;
    if (!isDay(String(v[f]).slice(0, 10))) fail(400, 'That date does not exist. Choose a real day.');
  }
}
// Pay that repeats: who it is from, an amount above zero, a known rhythm and a real next day (while it is running).
const PAY_FREQ = new Set(['weekly', 'biweekly', 'semimonthly', 'monthly', 'bimonthly', 'quarterly', 'yearly']);
function checkSchedule(sc) {
  if (sc.is_active === false) return;
  if (!String(sc.source || '').trim()) fail(400, 'Say who the pay is from.');
  if (!(cents(sc.amount) > 0)) fail(400, 'Enter the pay amount, above zero.');
  if (!PAY_FREQ.has(sc.frequency)) fail(400, 'Choose how often the pay comes.');
  if (!isDay(String(sc.next_date || '').slice(0, 10))) fail(400, 'Choose the next pay day.');
  // Part of the pay sent to other accounts: two at most, each its own account and an amount above zero, and something left for the main one.
  if (sc.splits != null) {
    if (!Array.isArray(sc.splits) || sc.splits.length > 2) fail(400, 'Pay can be sent to two other accounts at most.');
    const ids = sc.splits.map((x) => String((x && x.account_id) || ''));
    if (ids.some((x) => !x) || new Set(ids).size !== ids.length || ids.includes(String(sc.deposit_account_id || ''))) fail(400, 'Choose a different account for each part of the pay.');
    if (sc.splits.some((x) => !(cents(x.amount) > 0))) fail(400, 'Enter an amount above zero for each part of the pay.');
    if (sc.splits.reduce((s, x) => s + cents(x.amount), 0) >= cents(sc.amount)) fail(400, 'The amounts sent to other accounts must leave something for the main account.');
  }
}
// Only one account is the main one: making an account the main one takes the mark off the others.
function onePrimary(uid, row) {
  if (!row || !row.is_primary) return;
  for (const x of selectRows(uid, { table: 'bank_accounts', filters: [] })) {
    if (String(x.id) === String(row.id) || !x.is_primary) continue;
    db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify({ ...x, is_primary: false, updated_at: now() }), 'bank_accounts', String(x.id), uid);
  }
}
// A category needs a name, and only one category of each kind (spending or income) may carry that name.
function checkCategory(uid, c) {
  const name = String(c.name || '').trim().toLowerCase();
  if (!name) fail(400, 'Give the category a name.');
  const twin = selectRows(uid, { table: 'categories', filters: [] })
    .find((x) => String(x.id) !== String(c.id) && !!x.is_income === !!c.is_income && String(x.name || '').trim().toLowerCase() === name);
  if (twin) fail(409, `You already have a category called ${twin.name}.`);
}
function insertRow(uid, tbl, values, upsertOn) {
  const v = clean(values);
  if (tbl === 'transactions') { checkSplits(v); checkWhen(v); }
  v.user_id = uid;
  if (tbl === 'categories') checkCategory(uid, v);
  if (tbl === 'income_schedules') checkSchedule(v);
  if (tbl === 'goals') checkGoal(v);
  if (tbl === 'credit_scores') checkScore(v);
  checkFigures(tbl, v);
  if (tbl === 'bills') {
    checkBill(uid, v);
    // A merchant you turned down earlier and now add yourself: that row becomes the tracked bill.
    const old = v.key && v.id == null && selectRows(uid, { table: 'bills', filters: [['key', 'eq', v.key]], limit: 1 })[0];
    if (old) return updateRows(uid, tbl, [['id', 'eq', old.id]], v)[0];
  }
  if (upsertOn && upsertOn !== 'id') {
    const keys = upsertOn.split(',').map(s => s.trim());
    const ex = selectRows(uid, { table: tbl, filters: keys.map(k => [k, 'eq', v[k] ?? null]), limit: 1 })[0];
    if (ex) return updateRows(uid, tbl, [['id', 'eq', ex.id]], v)[0];
  }
  if (v.id != null) {
    const ex = db.prepare('SELECT user_id, data FROM rows WHERE tbl = ? AND id = ?').get(tbl, String(v.id));
    if (ex && ex.user_id !== uid) fail(409, 'That id is taken');
    if (ex && !upsertOn) fail(409, 'That row already exists');
    if (ex) return updateRows(uid, tbl, [['id', 'eq', v.id]], v)[0];
  }
  if (v.id == null) v.id = crypto.randomUUID();
  v.created_at = v.created_at || now(); v.updated_at = v.updated_at || v.created_at;
  db.prepare('INSERT INTO rows (tbl, id, user_id, data) VALUES (?,?,?,?)').run(tbl, String(v.id), uid, JSON.stringify(v));
  for (const f of MONEY_FIELDS[tbl] || []) if (f in v) stamp(uid, tbl, v, f, values.balance_as_of);
  if (tbl === 'transactions') learnCategory(uid, v);
  if (tbl === 'bank_accounts') onePrimary(uid, v);
  return v;
}
// ---------- learning categories ----------
// Every saved purchase or income with a category teaches the app that merchant's category (one rule per merchant,
// keyed like the screenshot reader's merchant key). A rule you set yourself (source 'set') is never changed by learning.
// Learning stops when the setting learn_categories is false. Rules are plain rows you can edit or delete.
function learnCategory(uid, t) {
  // A split purchase teaches the category of its largest part.
  if (Array.isArray(t.splits) && t.splits.length) {
    const big = [...t.splits].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
    t = { ...t, category_id: big.category_id, category_name: big.category_name };
  }
  if (!t || !t.category_id || !t.description || t.status === 'undone' || t.status === 'deleted') return;
  if (!['expense', 'income', 'refund'].includes(t.type)) return;
  const key = require('./reader').mkey(t.description);
  if (key.length < 3) return;
  const off = selectRows(uid, { table: 'settings', filters: [['key', 'eq', 'learn_categories']], limit: 1 })[0];
  if (off && (off.value === false || off.value === 'false')) return;
  const id = `rule:${uid}:${key}`;
  const ex = selectRows(uid, { table: 'category_rules', filters: [['id', 'eq', id]], limit: 1 })[0];
  if (ex && ex.source === 'set') return;
  const row = { key, merchant: String(t.description).slice(0, 60), category_id: t.category_id, category_name: t.category_name || null,
    source: 'learned', uses: ex && String(ex.category_id) === String(t.category_id) ? (Number(ex.uses) || 0) + 1 : 1, last_date: t.date || today() };
  if (ex) db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify({ ...ex, ...row, updated_at: now() }), 'category_rules', id, uid);
  else db.prepare('INSERT INTO rows (tbl, id, user_id, data) VALUES (?,?,?,?)').run('category_rules', id, uid, JSON.stringify({ id, user_id: uid, ...row, created_at: now(), updated_at: now() }));
}
function updateRows(uid, tbl, filters, values, orGroups) {
  const v = clean(values); delete v.user_id; delete v.id;
  checkFigures(tbl, v);
  const out = [];
  // A plain edit that sets a balance is the user stating the figure (opening balance or a correction from the edit form).
  // Purchases, payments, income and transfers change balances only through /api/money.
  for (const r of selectRows(uid, { table: tbl, filters, or: orGroups })) {
    const n = { ...r, ...v, id: r.id, user_id: uid, updated_at: now() };
    if (r._legs) n._legs = r._legs;
    if (r._undo) n._undo = r._undo;
    if (tbl === 'transactions' && ('splits' in v || 'amount' in v)) checkSplits(n);
    if (tbl === 'transactions' && 'date' in v) checkWhen(v);
    // A transaction that moved money keeps its amount, kind and account in a plain edit: the balances it moved would no
    // longer match. Undoing it (which puts the money back) and recording it again is the way to change those.
    if (tbl === 'transactions' && Array.isArray(r._legs) && r._legs.length && r.status !== 'undone' && r.status !== 'deleted') {
      const fixed = ['amount', 'type', 'payment_method', 'payment_method_id', 'card_id', 'loan_id', 'status'];
      const same = (x, y) => (x == null && y == null) || String(x) === String(y) || (x !== '' && y !== '' && Number(x) === Number(y));
      if (fixed.some((k) => k in v && !same(v[k], r[k]))) fail(409, 'This transaction moved money. Undo it and record it again to change the amount, kind or account.');
    }
    if (tbl === 'bills') checkBill(uid, n);
    if (tbl === 'income_schedules') checkSchedule(n);
    if (tbl === 'goals') checkGoal(n);
    if (tbl === 'credit_scores') checkScore(n);
    // Checked when the name or kind really changes, so two that shared a name before this rule can still be edited.
    const nm = (x) => String(x || '').trim().toLowerCase();
    if (tbl === 'categories' && (nm(n.name) !== nm(r.name) || !!n.is_income !== !!r.is_income || !nm(n.name))) checkCategory(uid, n);
    db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify(n), tbl, String(r.id), uid);
    // Stating a balance (even the same figure) confirms it as of today, or as of the date given.
    for (const f of MONEY_FIELDS[tbl] || []) if (f in v) stamp(uid, tbl, n, f, values.balance_as_of);
    if (tbl === 'transactions' && ('category_id' in v || 'splits' in v)) learnCategory(uid, n);
    if (tbl === 'bank_accounts' && 'is_primary' in v) onePrimary(uid, n);
    out.push(n);
  }
  return out;
}
function deleteRows(uid, tbl, filters, orGroups) {
  const rs = selectRows(uid, { table: tbl, filters, or: orGroups });
  for (const r of rs) {
    if (tbl === 'transactions' && r._legs && r.status !== 'undone' && r.status !== 'deleted') fail(409, 'Undo this transaction first so its money goes back');
    db.prepare('DELETE FROM rows WHERE tbl = ? AND id = ? AND user_id = ?').run(tbl, String(r.id), uid);
    // A loan or card that was paid automatically from an account that is gone goes back to "you pay it yourself"
    // (so its reminders come back), instead of failing quietly at every due date.
    if (tbl === 'bank_accounts' || tbl === 'credit_cards') {
      for (const t of ['loans', 'credit_cards']) {
        for (const x of selectRows(uid, { table: t, filters: [['connected_payment_source_id', 'eq', String(r.id)]] })) {
          const n = { ...x, connected_payment_source: null, connected_payment_source_id: null, updated_at: now() };
          db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify(n), t, String(x.id), uid);
        }
      }
    }
    // What was learned for a category goes with it, so a new purchase is not filed under a category that is gone.
    if (tbl === 'categories') db.prepare("DELETE FROM rows WHERE tbl = 'category_rules' AND user_id = ? AND json_extract(data, '$.category_id') = ?").run(uid, String(r.id));
  }
  return rs;
}
// The one rule for anything the browser asks to write, whichever route it comes through.
function mayWrite(table) {
  if (!TABLES.has(table)) fail(400, 'Unknown table');
  if (SERVER_ONLY.has(table)) fail(403, 'That table is kept by the server');
}
function runQuery(uid, q) {
  if (!TABLES.has(q.table)) fail(400, 'Unknown table');
  if (q.action !== 'select') mayWrite(q.table);
  const filters = q.filters || [], orG = q.or || [];
  switch (q.action) {
    case 'select': {
      if (q.head) { const [w, a] = where(uid, q.table, filters, orG); return { data: null, count: db.prepare(`SELECT COUNT(*) n FROM rows WHERE ${w}`).get(...a).n }; }
      const data = selectRows(uid, { ...q, filters, or: orG });
      return { data, count: q.count ? data.length : null };
    }
    case 'insert': case 'upsert': {
      const list = Array.isArray(q.values) ? q.values : [q.values];
      return { data: tx(() => list.map(v => insertRow(uid, q.table, v, q.action === 'upsert' ? (q.onConflict || 'id') : null))) };
    }
    case 'update': return { data: tx(() => updateRows(uid, q.table, filters, q.values, orG)) };
    case 'delete': return { data: tx(() => deleteRows(uid, q.table, filters, orG)) };
    default: fail(400, 'Unknown action');
  }
}

// ---------- money: one step, all or nothing ----------
// body: { key?, legs: [{ table, id? | key?, field?, delta, floor? }], rows: [{ table, values }], note? }
//  - a leg adds delta to one balance; floor (optional) refuses the whole step if the new balance would fall below it
//  - cash is an ordinary bank account (account_type 'cash'); the server never lets it go below zero
//  - rows are inserted in the same transaction; a 'transactions' row gets _legs, the record used to reverse it exactly
//  - key makes the step happen once: the same key again returns the first result and changes nothing (schedules, double clicks)
function legTarget(uid, l) {
  if (!MONEY_FIELDS[l.table]) fail(400, 'That table has no balance');
  const field = l.field || MONEY_FIELDS[l.table][0];
  if (!MONEY_FIELDS[l.table].includes(field)) fail(400, 'That field is not a balance');
  const r = selectRows(uid, { table: l.table, filters: [['id', 'eq', l.id]], limit: 1 })[0];
  if (!r) fail(404, 'That account no longer exists');
  return { r, field };
}
// A confirmed snapshot (the balance you saw on a given day) already includes every line dated before it.
// Such a line is kept as history and does not move the balance again. A line on the snapshot's own day counts
// only when it says it was part of that snapshot (in_snapshot); anything you add for today by hand still counts.
const coveredBySnapshot = (r, line) => !!(line && isDay(line.date) && isDay(r.snapshot_date) && line.type !== 'adjustment'
  && (line.date < r.snapshot_date || (line.date === r.snapshot_date && line.in_snapshot)));
const isCash = (table, r) => table === 'bank_accounts' && r && r.account_type === 'cash';
// How low a balance may go when money leaves it, worked out here from the account as it is now (never from what the
// browser sent): a bank account stops at zero or at its overdraft limit, cash and a gift card at zero, and a loan or an
// investment cannot give more than it holds. A credit card has no such limit here. -> a figure, or null for no limit.
function lowest(table, r) {
  if (table === 'bank_accounts') return isCash(table, r) || !r.allows_overdraft ? 0 : -(Number(r.overdraft_limit) || 0);
  if (table === 'credit_cards') return r.is_gift_card ? 0 : null;
  if (table === 'loans' || table === 'investments') return 0;
  return null;
}
function applyLegs(uid, legs, line, opts = {}) {
  const done = [];
  for (const l of legs || []) {
    const d = cents(l.delta);
    if (!Number.isFinite(d)) fail(400, 'Amount is not a number');
    if (!d) continue;
    const { r, field } = legTarget(uid, l);
    if (coveredBySnapshot(r, line)) {
      done.push({ table: l.table, id: r.id, field, delta: 0, history_only: fromCents(d), before: fromCents(cents(r[field])), after: fromCents(cents(r[field])) });
      continue;
    }
    const before = cents(r[field]);
    let delta = d, interest = 0;
    // A payment on a loan with interest: the interest for the period comes off first, worked out here from the balance
    // as it stands inside this step (never from a figure the browser had). Only the rest lowers what is owed.
    if (l.periodic_rate != null && l.table === 'loans' && d < 0) {
      const rate = Number(l.periodic_rate);
      if (!(rate >= 0 && rate < 1)) fail(400, 'Interest rate is not valid');
      const pay = -d;
      interest = Math.min(pay, Math.max(0, Math.round(before * rate)));
      delta = -(pay - interest);
    }
    const after = before + delta;
    // Cash can't go below zero, whatever the browser sent; only a stated balance (adjustment) may set it.
    // In a money step the limit is the server's own; a stated balance (adjustment) and an undo are not held to it.
    const own = opts.limits && delta < 0 && !(line && line.type === 'adjustment') ? lowest(l.table, r) : null;
    const floor = own != null ? own : isCash(l.table, r) && delta < 0 && !(line && line.type === 'adjustment') ? Math.max(Number(l.floor ?? 0), 0) : l.floor;
    if (floor != null && after < cents(floor)) {
      const name = r.name || 'This account', m = (c) => `$${(Math.abs(c) / 100).toFixed(2)}`;
      if (l.table === 'loans') fail(409, `You owe ${m(before)} on ${name}. ${m(delta)} is more than that.`);
      if (cents(floor) >= 0 && before >= 0) fail(409, `${name} has ${m(before)}. ${m(delta)} is ${m(after - cents(floor))} more than it can pay.`);
      fail(409, `${name} would be ${m(after)} below zero. Its overdraft limit is ${m(cents(floor))}.`);
    }
    const n = { ...r, [field]: fromCents(after), updated_at: now() };
    db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify(n), l.table, String(r.id), uid);
    stamp(uid, l.table, n, field, l.as_of);
    done.push({ table: l.table, id: r.id, field, delta: fromCents(delta), before: fromCents(before), after: fromCents(after),
      ...(interest ? { interest: fromCents(interest), principal: fromCents(-delta) } : {}) });
  }
  return done;
}
function money(uid, b) {
  const key = b.key ? String(b.key).slice(0, 200) : null;
  return tx(() => {
    if (key) {
      const seen = db.prepare('SELECT result FROM money_keys WHERE user_id = ? AND k = ?').get(uid, key);
      if (seen) return { ...JSON.parse(seen.result || '{}'), repeated: true };
    }
    for (const x of [...(b.rows || []), ...(b.updates || [])]) mayWrite(x && x.table);
    // replace: an edit undoes the old transaction in the same step, so a failed edit leaves the old one as it was
    const replaced = (b.replace || []).map(id => reverseInner(uid, String(id), { remove: true }));
    const line = ((b.rows || []).find(x => x.table === 'transactions') || {}).values;
    // Money is recorded on a real day; with no date given it is today.
    if (line) {
      // Every line is for an amount above zero (which way the money went is in its kind, not its sign).
      if (!Number.isFinite(Number(line.amount)) || !(cents(line.amount) > 0)) fail(400, 'Enter an amount above zero.');
      if (line.date == null || line.date === '') line.date = today();
      else if (!isDay(String(line.date).slice(0, 10))) fail(400, 'That date does not exist. Choose the day it happened.');
    }
    const legs = applyLegs(uid, b.legs, line, { limits: true });
    const rows = (b.rows || []).map(({ table, values }) => {
      const v = insertRow(uid, table, values);
      const split = legs.find(x => x.interest != null);
      if (table === 'transactions' && split) { v.interest_amount = split.interest; v.principal_amount = split.principal; }
      if (table === 'transactions' && legs.length) {
        v._legs = legs.map(({ table, id, key, field, delta }) => ({ table, id, key, field, delta }));
        const hist = legs.filter(x => x.history_only != null);
        if (hist.length) v.history_only = hist.map(x => ({ table: x.table, id: x.id, amount: x.history_only }));
        db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ?').run(JSON.stringify(v), table, String(v.id));
      }
      return v;
    });
    // Plain fields changed in the same step (a loan's next payment date, a card's last payment): what each was before is
    // kept on the transaction, so undoing the transaction puts those back too.
    const undo = [];
    for (const u of b.updates || []) {
      // In a money step a balance moves only by the step's own amounts, never by a field written alongside.
      if (u.values && (MONEY_FIELDS[u.table] || []).some((f) => f in u.values)) fail(400, 'A balance cannot be set inside a payment. Record the amount instead.');
      const was = selectRows(uid, { table: u.table, filters: [['id', 'eq', u.id]], limit: 1 })[0];
      updateRows(uid, u.table, [['id', 'eq', u.id]], u.values);
      if (!was || !u.values || typeof u.values !== 'object') continue;
      const keys = Object.keys(u.values).filter((k) => COL.test(k) && k !== 'id' && k !== 'user_id' && !(MONEY_FIELDS[u.table] || []).includes(k));
      if (keys.length) undo.push({ table: u.table, id: was.id, before: Object.fromEntries(keys.map((k) => [k, was[k] ?? null])), set: Object.fromEntries(keys.map((k) => [k, u.values[k] ?? null])) });
    }
    const line0 = rows.find((r) => r && r.type && r._legs) || rows.find((r) => r && r.type);
    if (undo.length && line0) {
      line0._undo = undo;
      db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify(line0), 'transactions', String(line0.id), uid);
    }
    const result = { legs, rows, replaced: replaced.map(r => r.transaction.id) };
    if (key) db.prepare('INSERT INTO money_keys (user_id, k, result) VALUES (?,?,?)').run(uid, key, JSON.stringify(result));
    return result;
  });
}
// Undo a transaction: every balance it moved moves back by the same amount, on the same account, never clamped.
function reverseInner(uid, id, b = {}) {
    const t = selectRows(uid, { table: 'transactions', filters: [['id', 'eq', id]], limit: 1 })[0];
    if (!t) fail(404, 'Transaction not found');
    if (t.status === 'undone' || t.status === 'deleted') return { transaction: t, legs: [], repeated: true };
    // Undoing a line dated before the account's snapshot leaves today's balance as seen (the snapshot is the truth).
    // An account removed since has no balance to put back: its part is left out, the rest still goes back.
    const there = (l) => l && MONEY_FIELDS[l.table] && selectRows(uid, { table: l.table, filters: [['id', 'eq', l.id]], limit: 1 })[0];
    const legs = applyLegs(uid, (t._legs || []).filter(there).map(l => ({ ...l, delta: -l.delta })), t);
    // Fields the step changed go back to what they were, unless something changed them again since.
    for (const u of t._undo || []) {
      if (!TABLES.has(u.table) || SERVER_ONLY.has(u.table)) continue;
      const row = selectRows(uid, { table: u.table, filters: [['id', 'eq', u.id]], limit: 1 })[0];
      if (!row) continue;
      let changed = false;
      for (const [k, v] of Object.entries(u.set || {})) {
        if ((MONEY_FIELDS[u.table] || []).includes(k) || JSON.stringify(row[k] ?? null) !== JSON.stringify(v)) continue;
        const was = (u.before || {})[k];
        if (was == null) delete row[k]; else row[k] = was;
        changed = true;
      }
      if (changed) db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify({ ...row, updated_at: now() }), u.table, String(row.id), uid);
    }
    const n = { ...t, status: b.remove ? 'deleted' : 'undone', undone_at: now(), updated_at: now() };
    db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify(n), 'transactions', String(id), uid);
    return { transaction: n, legs };
}
const reverse = (uid, id, b) => tx(() => reverseInner(uid, id, b));

// ---------- snapshots: the balance you saw, on a day ----------
// body: { table, id | key, value, date?, source?, apply? }
//  - records what the account showed and how far the app was from it (gap)
//  - apply: the gap is recorded as an adjustment (undoable) so the balance equals what you saw, and the day becomes the
//    account's snapshot date: older lines added later are history only and cannot move today's balance again
//  - without apply, or for a day older than the account's snapshot, nothing changes; the gap stays open to be explained
// The balance an account had at the end of a day, worked back from today: today's balance minus everything dated after
// that day, including lines kept as history (a later snapshot already counted them).
function balanceAt(uid, table, id, day) {
  const r = legTarget(uid, { table, id }).r;
  const field = MONEY_FIELDS[table][0];
  let c = cents(r[field]);
  const acctId = String(id);
  for (const t of selectRows(uid, { table: 'transactions', filters: [['date', 'gt', day]] })) {
    if (t.status === 'undone' || t.status === 'deleted') continue;
    for (const l of t._legs || []) if (l.table === table && String(l.id) === String(acctId)) c -= cents(l.delta);
    for (const h of t.history_only || []) if (h.table === table && String(h.id) === String(acctId)) c -= cents(h.amount);
  }
  return c;
}
function snapshot(uid, b) {
  return tx(() => {
    const day = isDay(b.date) ? b.date : today();
    const value = cents(b.value);
    if (!Number.isFinite(value)) fail(400, 'Enter a number');
    const { r, field } = legTarget(uid, { table: b.table, id: b.id });
    const current = cents(r[field]);
    const newer = isDay(r.snapshot_date) && r.snapshot_date > day;
    // An older balance (a past statement) is compared with the app's history for that day, never applied to today.
    const atDay = balanceAt(uid, b.table, r.id, day);
    const gap = value - atDay;
    let adjustment = null, status = gap ? 'open' : 'ok';
    if (!newer && b.apply && gap) {
      const legs = applyLegs(uid, [{ table: b.table, id: r.id, delta: fromCents(gap), as_of: day }]);
      const t = insertRow(uid, 'transactions', { type: 'adjustment', amount: Math.abs(fromCents(gap)), direction: gap > 0 ? 'up' : 'down', date: day,
        description: `Balance from ${b.source || 'a snapshot'}`, status: 'active', payment_method: ({ bank_accounts: 'bank_account', credit_cards: 'credit_card', loans: 'loan', investments: 'investment', assets: 'asset' }[b.table]),
        payment_method_id: r.id, payment_method_name: r.name || '' });
      t._legs = legs.map(({ table, id, field, delta }) => ({ table, id, field, delta }));
      db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ?').run(JSON.stringify(t), 'transactions', String(t.id));
      adjustment = t; status = 'corrected';
    }
    if (!newer && (status === 'ok' || status === 'corrected')) {
      const fresh = legTarget(uid, { table: b.table, id: b.id, key: b.key }).r;
      const n = { ...fresh, snapshot_date: day, snapshot_value: fromCents(value) };
      db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify(n), b.table, String(r.id), uid);
      stamp(uid, b.table, n, field, day);
    }
    const snap = insertRow(uid, 'snapshots', { account_table: b.table, account_id: r.id, name: r.name || '', date: day,
      value: fromCents(value), app_value: fromCents(atDay), gap: fromCents(gap), status: newer ? (gap ? 'open_history' : 'ok_history') : status, source: String(b.source || '').slice(0, 60),
      adjustment_id: adjustment ? adjustment.id : null, created_at: now() });
    return { snapshot: snap, adjustment };
  });
}

// ---------- routes ----------
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:\w+/g, '([\\w-]+)') + '$'), fn });
route('GET', '/api/me', (req) => ({ user: authUser(req) }));
route('POST', '/api/logout', (req) => { const t = (req.headers.authorization || '').replace('Bearer ', ''); db.prepare('DELETE FROM sessions WHERE token = ?').run(t); return { ok: true }; });
route('POST', '/api/db', (req, b) => runQuery(authUser(req).id, b));
route('POST', '/api/money', (req, b) => money(authUser(req).id, b));
route('POST', '/api/lookup-rates', async (req, b) => { authUser(req); try { return await require('./rates').lookup(String(b.kind || ''), b.name); } catch (e) { if (e.status) fail(e.status, e.message); throw e; } });
// Exchange rate for a day (purchases in another currency are recorded in the home currency, keeping the original).
route('GET', '/api/fx', async (req, b, m, url) => { authUser(req); try { return await require('./fx').rate(db, url.searchParams.get('from'), url.searchParams.get('to') || undefined, url.searchParams.get('date')); } catch (e) { if (e.status) fail(e.status, e.message); throw e; } });
// Reminders: the public key browsers need, and each browser's subscription (kept per user, replaced by endpoint).
route('GET', '/api/push/key', (req) => { authUser(req); return { key: require('./push').publicKey(db) }; });
route('POST', '/api/push/subscribe', (req, b) => {
  const uid = authUser(req).id;
  const s = b.subscription || {};
  if (!/^https:\/\//.test(String(s.endpoint || '')) || !s.keys || !s.keys.p256dh || !s.keys.auth) fail(400, 'That browser did not give a usable subscription.');
  // Reminders are sent to the browser maker's push service on the internet, never to an address on a private network.
  let host = ''; try { host = new URL(String(s.endpoint)).hostname.toLowerCase(); } catch { /* refused below */ }
  if (!host || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[') || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host))
    fail(400, 'That browser did not give a usable subscription.');
  const id = 'push:' + crypto.createHash('sha256').update(String(s.endpoint)).digest('hex').slice(0, 32);
  if (db.prepare("SELECT COUNT(*) n FROM rows WHERE tbl = 'push_subscriptions' AND user_id = ? AND id != ?").get(uid, id).n >= 10) fail(400, 'Reminders are on for 10 devices already. Turn them off on one first.');
  const row = { id, endpoint: String(s.endpoint).slice(0, 1000), keys: { p256dh: String(s.keys.p256dh).slice(0, 200), auth: String(s.keys.auth).slice(0, 100) },
    device: String(b.device || '').slice(0, 80), created_at: now() };
  tx(() => { db.prepare("DELETE FROM rows WHERE tbl = 'push_subscriptions' AND id = ?").run(id); db.prepare("INSERT INTO rows (tbl, id, user_id, data) VALUES ('push_subscriptions', ?, ?, ?)").run(id, uid, JSON.stringify({ ...row, user_id: uid })); });
  return { ok: true, id };
});
route('POST', '/api/push/unsubscribe', (req, b) => {
  const uid = authUser(req).id;
  const id = 'push:' + crypto.createHash('sha256').update(String(b.endpoint || '')).digest('hex').slice(0, 32);
  db.prepare("DELETE FROM rows WHERE tbl = 'push_subscriptions' AND id = ? AND user_id = ?").run(id, uid);
  return { ok: true };
});
route('POST', '/api/push/test', async (req) => {
  const uid = authUser(req).id;
  const subs = selectRows(uid, { table: 'push_subscriptions', filters: [] });
  if (!subs.length) fail(400, 'This account has no device set up for reminders yet.');
  const push = require('./push');
  const res = [];
  for (const s of subs) {
    const r = await push.send(db, s, { title: 'Reminders are on', body: 'Payments you make yourself will show here two days before they are due.', url: '/' }, PUBLIC_URL);
    if (r === 'gone') db.prepare("DELETE FROM rows WHERE tbl = 'push_subscriptions' AND id = ? AND user_id = ?").run(String(s.id), uid);
    res.push(r);
  }
  if (!res.includes('sent')) fail(502, 'The reminder could not be delivered. Turn reminders off and on again on this device.');
  return { sent: res.filter((x) => x === 'sent').length };
});
route('POST', '/api/snapshot', (req, b) => snapshot(authUser(req).id, b));
// Open checks with the difference as it stands now (adding the missing lines closes them).
route('GET', '/api/checks', (req) => {
  const uid = authUser(req).id;
  return selectRows(uid, { table: 'snapshots', filters: [] }).filter(s => s.status === 'open' || s.status === 'open_history').map(s => {
    let now = null;
    try { now = fromCents(balanceAt(uid, s.account_table, s.account_id, s.date)); } catch { /* account removed */ }
    return { ...s, app_now: now, left: now == null ? null : Math.round((Number(s.value) - now) * 100) / 100 };
  });
});
// Leave an open gap as it is, or correct it now (the balance moves by today's difference).
route('POST', '/api/snapshots/:id/resolve', (req, b, [id]) => {
  const uid = authUser(req).id;
  const s = selectRows(uid, { table: 'snapshots', filters: [['id', 'eq', id]], limit: 1 })[0];
  if (!s) fail(404, 'Not found');
  if (s.status === 'open_history') {
    db.prepare("UPDATE rows SET data = json_set(data, '$.status', ?) WHERE tbl = 'snapshots' AND id = ? AND user_id = ?").run(b.action === 'correct' ? 'ok_history' : 'dismissed', String(id), uid);
    return { ok: true };
  }
  if (s.status !== 'open') return { snapshot: s };
  if (b.action === 'correct') {
    const out = snapshot(uid, { table: s.account_table, id: s.account_id, value: s.value, date: s.date, source: s.source || 'a snapshot', apply: true });
    db.prepare("UPDATE rows SET data = json_set(data, '$.status', 'replaced') WHERE tbl = 'snapshots' AND id = ? AND user_id = ?").run(String(id), uid);
    return out;
  }
  db.prepare("UPDATE rows SET data = json_set(data, '$.status', 'dismissed') WHERE tbl = 'snapshots' AND id = ? AND user_id = ?").run(String(id), uid);
  return { ok: true };
});
// Delete everything this person has recorded, in one step (the sign-in stays). The browser must send the exact phrase.
route('POST', '/api/reset', (req, b) => {
  const uid = authUser(req).id;
  if (b.confirm !== 'DELETE ALL MY DATA') fail(400, 'Type the phrase to confirm.');
  return tx(() => ({ rows: Number(db.prepare('DELETE FROM rows WHERE user_id = ?').run(uid).changes), keys: Number(db.prepare('DELETE FROM money_keys WHERE user_id = ?').run(uid).changes) }));
});
// Restore rows from a backup file, as they were: ids, dates and each transaction's record of what it moved (_legs),
// so undo still works afterwards. Balances come from the restored account rows; nothing is applied again.
// A row id that belongs to someone else is refused. Only legs on this person's own balance tables are kept.
function restoreRows(uid, table, list) {
  let n = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(400, 'The backup has a row that cannot be read');
    const legs = raw._legs, undo = raw._undo;
    const v = clean(raw);
    if (v.id == null) v.id = crypto.randomUUID();
    if (table === 'transactions') {
      checkSplits(v);
      if (Array.isArray(legs)) v._legs = legs.filter((l) => l && MONEY_FIELDS[l.table] && Number.isFinite(Number(l.delta)))
        .map((l) => ({ table: l.table, id: l.id, field: MONEY_FIELDS[l.table].includes(l.field) ? l.field : MONEY_FIELDS[l.table][0], delta: Number(l.delta) }));
    }
    // The plain fields a payment changed (see _undo in the money step), so undo still puts them back after a restore.
    if (table === 'transactions' && Array.isArray(undo)) {
      const keep = undo.filter((u) => u && TABLES.has(u.table) && !SERVER_ONLY.has(u.table) && u.id != null && u.set && typeof u.set === 'object')
        .map((u) => ({ table: u.table, id: u.id, before: u.before && typeof u.before === 'object' ? u.before : {}, set: u.set }));
      if (keep.length) v._undo = keep;
    }
    const ex = db.prepare('SELECT user_id FROM rows WHERE tbl = ? AND id = ?').get(table, String(v.id));
    if (ex && ex.user_id !== uid) fail(409, 'A row in the backup belongs to another account');
    v.user_id = uid;
    db.prepare('INSERT INTO rows (tbl, id, user_id, data) VALUES (?,?,?,?) ON CONFLICT(tbl, id) DO UPDATE SET data = excluded.data').run(table, String(v.id), uid, JSON.stringify(v));
    n++;
  }
  return n;
}
route('POST', '/api/restore', (req, b) => {
  const uid = authUser(req).id;
  try { mayWrite(b.table); } catch { fail(400, 'That table cannot be restored'); }
  if (!Array.isArray(b.rows) || b.rows.length > 1000) fail(400, 'Send up to 1000 rows at a time');
  return tx(() => ({ restored: restoreRows(uid, b.table, b.rows) }));
});
// Replace everything with a backup file, in one step: either the whole backup is in, or nothing has changed.
// The balance history and the balances you checked come back with it. The devices that get reminders are kept as they are.
const KEPT_ON_RESTORE = 'push_subscriptions';
route('POST', '/api/restore-all', (req, b) => {
  const uid = authUser(req).id;
  if (b.confirm !== 'REPLACE ALL MY DATA') fail(400, 'Confirm the replacement.');
  const data = b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : null;
  if (!data) fail(400, 'That file is not a backup from this app.');
  const tables = Object.keys(data).filter((t) => TABLES.has(t) && t !== KEPT_ON_RESTORE);
  for (const t of tables) if (!Array.isArray(data[t])) fail(400, 'That file is not a backup from this app.');
  if (!tables.some((t) => data[t].length)) fail(400, 'The backup has nothing in it. Nothing was changed.');
  return tx(() => {
    db.prepare('DELETE FROM rows WHERE user_id = ? AND tbl <> ?').run(uid, KEPT_ON_RESTORE);
    db.prepare('DELETE FROM money_keys WHERE user_id = ?').run(uid);
    const restored = {};
    for (const t of tables) restored[t] = restoreRows(uid, t, data[t]);
    return { restored, total: Object.values(restored).reduce((x, y) => x + y, 0) };
  });
});
route('POST', '/api/transactions/:id/reverse', (req, b, [id]) => reverse(authUser(req).id, id, b));
route('GET', '/api/config', () => ({ google: !!(G_ID && G_SECRET), dev: !!DEV_USER, ai: require('./keystore').isSet() }));
// The Gemini key: whether it is set and whether this user may set it. Never the key itself.
route('GET', '/api/gemini-key', (req) => { const u = authUser(req); const ks = require('./keystore'); return { set: ks.isSet(), canSet: !ks.isSet() && ks.mayManage(db, u) }; });
route('POST', '/api/gemini-key', async (req, b) => { const u = authUser(req); await require('./keystore').set(db, u, b.key, fail); return { set: true }; });
// The text assistant: a question is answered from the person's own figures; a typed note becomes lines to check and save.
route('POST', '/api/ask', async (req, b) => {
  const uid = authUser(req).id;
  const all = (t) => selectRows(uid, { table: t, filters: [] });
  const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const ctx = { bankAccounts: all('bank_accounts'), creditCards: all('credit_cards'), loans: all('loans'), investments: all('investments'), bills: all('bills'),
    schedules: all('income_schedules'), goals: all('goals'), scores: all('credit_scores'),
    transactions: selectRows(uid, { table: 'transactions', filters: [['date', 'gte', since]] }), today: isDay(b.today) ? b.today : today(), db };
  try { return await require('./assistant').ask(uid, b, ctx); } catch (e) { if (e.status) fail(e.status, e.message); throw e; }
});
// A pay slip or a payroll screen (Workday and the like): what the pay is and which accounts it lands in. Nothing is saved.
route('POST', '/api/read-pay', async (req, b) => {
  const uid = authUser(req).id;
  try { return await require('./reader').readPay(b, { bankAccounts: selectRows(uid, { table: 'bank_accounts', filters: [] }), today: b.today }); }
  catch (e) { if (e.status) fail(e.status, e.message); throw e; }
});
route('POST', '/api/read-screenshot', async (req, b) => {
  const uid = authUser(req).id;
  const all = (t) => selectRows(uid, { table: t, filters: [] });
  const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const ctx = { bankAccounts: all('bank_accounts'), creditCards: all('credit_cards'), transactions: selectRows(uid, { table: 'transactions', filters: [['date', 'gte', since]] }), today: b.today, db };
  try { return await require('./reader').read(uid, b, ctx); } catch (e) { if (e.status) fail(e.status, e.message); throw e; }
});
// Local testing only: DEV_USER signs in without Google. Refused unless NODE_ENV is development.
const DEV_USER = process.env.NODE_ENV === 'development' ? (process.env.DEV_USER || '') : '';
route('POST', '/api/dev-login', (req, b) => { if (!DEV_USER) fail(404, 'Not found'); return { token: newSession(userFor(b.email ? String(b.email) : DEV_USER, 'Test user')) }; });

// ---------- Google sign-in ----------
const G_ID = process.env.GOOGLE_CLIENT_ID || '', G_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://finance.nobodystack.com';
const G_REDIRECT = PUBLIC_URL + '/auth/google/callback';
const cookie = (req, n) => (String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).find(([k]) => k === n) || [])[1];
async function googleAuth(req, res, url) {
  const page = (script) => { res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'ft_g=; Path=/auth/google; Max-Age=0', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><meta charset="utf-8"><script>${script};location.replace('/')</script>`); };
  const back = (msg) => page(`sessionStorage.setItem('finance_err', ${JSON.stringify(msg)})`);
  if (!G_ID || !G_SECRET) { res.writeHead(404); return res.end(); }
  if (url.pathname === '/auth/google') {
    const state = crypto.randomBytes(16).toString('hex');
    res.writeHead(302, { 'Set-Cookie': `ft_g=${state}; Path=/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: G_ID, redirect_uri: G_REDIRECT, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' }) });
    return res.end();
  }
  const state = url.searchParams.get('state'), want = cookie(req, 'ft_g');
  if (!state || !want || state !== want) return back('Google sign-in expired. Try again.');
  try {
    const t = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: G_ID, client_secret: G_SECRET, redirect_uri: G_REDIRECT, grant_type: 'authorization_code' }) });
    const tj = await t.json();
    // The ID token came straight from Google over TLS in exchange for our secret, so its claims can be read directly.
    const c = JSON.parse(Buffer.from(String(tj.id_token || '').split('.')[1] || '', 'base64url').toString() || '{}');
    if (!t.ok || c.aud !== G_ID || !c.email || !c.email_verified) return back('Google sign-in did not work. Try again.');
    if (ALLOWED.length && !ALLOWED.includes(String(c.email).toLowerCase())) return back('This Google account is not allowed to use this app.');
    page(`localStorage.setItem('finance_token', ${JSON.stringify(newSession(userFor(c.email, c.name)))})`);
  } catch { back('Could not reach Google. Try again.'); }
}

// ---------- server ----------
const STATIC = process.env.STATIC_DIR || path.join(__dirname, '..', 'build');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.map': 'application/json', '.txt': 'text/plain' };
const LIMIT = 12_000_000; // screenshots arrive as base64 in JSON

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (url.pathname === '/auth/google' || url.pathname === '/auth/google/callback') return googleAuth(req, res, url);
  if (!url.pathname.startsWith('/api/')) {
    const file = path.join(STATIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    const index = path.join(STATIC, 'index.html');
    if (!file.startsWith(STATIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (!fs.existsSync(index)) { res.writeHead(404); return res.end('Build the app first: npm run build'); }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' }); return fs.createReadStream(index).pipe(res);
    }
    const hashed = /\/static\//.test(url.pathname);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache' });
    return fs.createReadStream(file).pipe(res);
  }
  const send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  try {
    let raw = '', size = 0;
    for await (const c of req) { size += c.length; if (size > LIMIT) { res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' }); res.end('{"error":"That request is too large."}'); req.destroy(); return; } raw += c; }
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { fail(400, 'That request is not valid JSON.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'That request is not valid JSON.');
    for (const r of routes) {
      const m = r.method === req.method && url.pathname.match(r.re);
      if (m) return send(200, await r.fn(req, body, m.slice(1), url));
    }
    send(404, { error: 'Not found' });
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    send(e.status || 500, { error: e instanceof HttpError ? e.message : 'Server error' });
  }
});
// Cash used to be a setting (cashInHand). Any amount still held there becomes a Cash account, once.
function moveCashSettingToAccount() {
  const rows = db.prepare("SELECT user_id, id, data FROM rows WHERE tbl = 'settings' AND json_extract(data, '$.key') = 'cashInHand' AND json_extract(data, '$.moved_to_account') IS NULL").all();
  for (const row of rows) {
    const v = JSON.parse(row.data);
    const amount = Number(v.value) || 0;
    tx(() => {
      const has = selectRows(row.user_id, { table: 'bank_accounts', filters: [['account_type', 'eq', 'cash']], limit: 1 })[0];
      if (!has && amount) insertRow(row.user_id, 'bank_accounts', { name: 'Cash', account_type: 'cash', balance: amount, institution: '', balance_as_of: v.balance_as_of || today(), created_at: now() });
      db.prepare("UPDATE rows SET data = json_set(data, '$.value', 0, '$.moved_to_account', 1) WHERE tbl = 'settings' AND id = ? AND user_id = ?").run(String(row.id), row.user_id);
    });
  }
}
moveCashSettingToAccount();

// Preferences (theme, alerts, budgets...) live in one settings row with key 'prefs'. Older versions kept them in a row
// without a key, and some saves spread them onto the key/value rows too. Once per person, every such field is gathered
// (newest save wins) into the 'prefs' row. Nothing is deleted.
function gatherPrefs() {
  const SKIP = new Set(['id', 'user_id', 'key', 'value', 'created_at', 'updated_at', 'moved_to_account']);
  const users = db.prepare("SELECT DISTINCT user_id FROM rows WHERE tbl = 'settings'").all().map((r) => r.user_id);
  for (const uid of users) {
    const list = selectRows(uid, { table: 'settings', filters: [] });
    if (list.some((r) => r.key === 'prefs')) continue;
    const prefs = {};
    for (const r of list.sort((a, b) => String(a.updated_at || a.created_at || '').localeCompare(String(b.updated_at || b.created_at || '')))) {
      for (const [k, v] of Object.entries(r)) if (!SKIP.has(k) && v !== undefined && v !== null) prefs[k] = v;
    }
    tx(() => insertRow(uid, 'settings', { ...prefs, key: 'prefs' }));
  }
}
gatherPrefs();

// Learned categories start from the history you already have, once per person (flag: settings rules_seeded).
function seedCategoryRules() {
  const users = db.prepare("SELECT DISTINCT user_id FROM rows WHERE tbl = 'transactions'").all().map((r) => r.user_id);
  for (const uid of users) {
    if (selectRows(uid, { table: 'settings', filters: [['key', 'eq', 'rules_seeded']], limit: 1 })[0]) continue;
    tx(() => {
      // Someone whose purchases were all saved by this version already has their rules: counting them again would double the counts.
      const has = selectRows(uid, { table: 'category_rules', filters: [], limit: 1 })[0];
      const list = has ? [] : selectRows(uid, { table: 'transactions', filters: [] }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      for (const t of list) learnCategory(uid, t);
      insertRow(uid, 'settings', { key: 'rules_seeded', value: true });
    });
  }
}
seedCategoryRules();

// Reminders go out from a check every 15 minutes (each one once; see server/push.js).
const runReminders = (at) => require('./push').remind(db, { selectRows, tz: APP_TZ, subject: PUBLIC_URL, now: at }).catch((e) => { console.error('reminders:', e.message); return 0; });
if (require.main === module) {
  server.listen(PORT, () => console.log(`Finance tracker running on http://localhost:${PORT}`));
  setTimeout(runReminders, 60e3);
  setInterval(runReminders, 15 * 60e3).unref();
}
module.exports = { server, db, money, reverse, runQuery, runReminders };
