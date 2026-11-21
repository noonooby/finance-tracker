// Finance tracker server. Run: node --experimental-sqlite server/server.js
// Plain Node http + built-in SQLite, no dependencies (same pattern as Evenly).
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

const TABLES = new Set(['activities', 'alert_history', 'bank_accounts', 'budget_tracking', 'categories', 'credit_card_payments', 'credit_cards',
  'income', 'income_schedules', 'known_entities', 'loan_payments', 'loans', 'report_templates', 'saved_filters', 'scheduled_payments',
  'settings', 'transactions', 'user_preferences', 'uploads']);
// Tables whose balance /api/money may change, and the fields it may change.
const MONEY_FIELDS = { bank_accounts: ['balance'], credit_cards: ['balance'], loans: ['balance'], settings: ['value'] };

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
function clean(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail(400, 'A row must be an object');
  const v = { ...values };
  for (const k of Object.keys(v)) if (!COL.test(k)) fail(400, 'Unknown field: ' + k);
  delete v._legs; // only /api/money writes the record of what a transaction moved
  return v;
}
function insertRow(uid, tbl, values, upsertOn) {
  const v = clean(values);
  v.user_id = uid;
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
  return v;
}
function updateRows(uid, tbl, filters, values, orGroups) {
  const v = clean(values); delete v.user_id; delete v.id;
  const out = [];
  // A plain edit that sets a balance is the user stating the figure (opening balance or a correction from the edit form).
  // Purchases, payments, income and transfers change balances only through /api/money.
  for (const r of selectRows(uid, { table: tbl, filters, or: orGroups })) {
    const n = { ...r, ...v, id: r.id, user_id: uid, updated_at: now() };
    if (r._legs) n._legs = r._legs;
    db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify(n), tbl, String(r.id), uid);
    out.push(n);
  }
  return out;
}
function deleteRows(uid, tbl, filters, orGroups) {
  const rs = selectRows(uid, { table: tbl, filters, or: orGroups });
  for (const r of rs) {
    if (tbl === 'transactions' && r._legs && r.status !== 'undone' && r.status !== 'deleted') fail(409, 'Undo this transaction first so its money goes back');
    db.prepare('DELETE FROM rows WHERE tbl = ? AND id = ? AND user_id = ?').run(tbl, String(r.id), uid);
  }
  return rs;
}
function runQuery(uid, q) {
  if (!TABLES.has(q.table)) fail(400, 'Unknown table');
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
//  - settings legs name the setting by key (cashInHand)
//  - rows are inserted in the same transaction; a 'transactions' row gets _legs, the record used to reverse it exactly
//  - key makes the step happen once: the same key again returns the first result and changes nothing (schedules, double clicks)
function legTarget(uid, l) {
  if (!MONEY_FIELDS[l.table]) fail(400, 'That table has no balance');
  const field = l.field || MONEY_FIELDS[l.table][0];
  if (!MONEY_FIELDS[l.table].includes(field)) fail(400, 'That field is not a balance');
  let r;
  if (l.table === 'settings') {
    r = selectRows(uid, { table: 'settings', filters: [['key', 'eq', String(l.key || '')]], limit: 1 })[0];
    if (!r) r = insertRow(uid, 'settings', { key: String(l.key), value: 0 });
  } else r = selectRows(uid, { table: l.table, filters: [['id', 'eq', l.id]], limit: 1 })[0];
  if (!r) fail(404, 'That account no longer exists');
  return { r, field };
}
function applyLegs(uid, legs) {
  const done = [];
  for (const l of legs || []) {
    const d = cents(l.delta);
    if (!Number.isFinite(d)) fail(400, 'Amount is not a number');
    if (!d) continue;
    const { r, field } = legTarget(uid, l);
    const before = cents(r[field]), after = before + d;
    if (l.floor != null && after < cents(l.floor)) {
      fail(409, `${r.name || 'Cash in hand'} would go to ${(after / 100).toFixed(2)}, below its limit of ${Number(l.floor).toFixed(2)}`);
    }
    const n = { ...r, [field]: fromCents(after), updated_at: now() };
    db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify(n), l.table, String(r.id), uid);
    done.push({ table: l.table, id: r.id, key: l.table === 'settings' ? r.key : undefined, field, delta: fromCents(d), before: fromCents(before), after: fromCents(after) });
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
    const legs = applyLegs(uid, b.legs);
    const rows = (b.rows || []).map(({ table, values }) => {
      if (!TABLES.has(table)) fail(400, 'Unknown table');
      const v = insertRow(uid, table, values);
      if (table === 'transactions' && legs.length) {
        v._legs = legs.map(({ table, id, key, field, delta }) => ({ table, id, key, field, delta }));
        db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ?').run(JSON.stringify(v), table, String(v.id));
      }
      return v;
    });
    for (const u of b.updates || []) updateRows(uid, u.table, [['id', 'eq', u.id]], u.values);
    const result = { legs, rows };
    if (key) db.prepare('INSERT INTO money_keys (user_id, k, result) VALUES (?,?,?)').run(uid, key, JSON.stringify(result));
    return result;
  });
}
// Undo a transaction: every balance it moved moves back by the same amount, on the same account, never clamped.
function reverse(uid, id, b = {}) {
  return tx(() => {
    const t = selectRows(uid, { table: 'transactions', filters: [['id', 'eq', id]], limit: 1 })[0];
    if (!t) fail(404, 'Transaction not found');
    if (t.status === 'undone' || t.status === 'deleted') return { transaction: t, legs: [], repeated: true };
    const legs = applyLegs(uid, (t._legs || []).map(l => ({ ...l, delta: -l.delta })));
    const n = { ...t, status: b.remove ? 'deleted' : 'undone', undone_at: now(), updated_at: now() };
    db.prepare('UPDATE rows SET data = ? WHERE tbl = ? AND id = ? AND user_id = ?').run(JSON.stringify(n), 'transactions', String(id), uid);
    return { transaction: n, legs };
  });
}

// ---------- routes ----------
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:\w+/g, '([\\w-]+)') + '$'), fn });
route('GET', '/api/me', (req) => ({ user: authUser(req) }));
route('POST', '/api/logout', (req) => { const t = (req.headers.authorization || '').replace('Bearer ', ''); db.prepare('DELETE FROM sessions WHERE token = ?').run(t); return { ok: true }; });
route('POST', '/api/db', (req, b) => runQuery(authUser(req).id, b));
route('POST', '/api/money', (req, b) => money(authUser(req).id, b));
route('POST', '/api/transactions/:id/reverse', (req, b, [id]) => reverse(authUser(req).id, id, b));
route('GET', '/api/config', () => ({ google: !!(G_ID && G_SECRET), dev: !!DEV_USER, ai: !!process.env.GEMINI_API_KEY }));
route('POST', '/api/read-screenshot', async (req, b) => require('./reader').read(authUser(req).id, b));
// Local testing only: DEV_USER signs in without Google. Refused unless NODE_ENV is development.
const DEV_USER = process.env.NODE_ENV === 'development' ? (process.env.DEV_USER || '') : '';
route('POST', '/api/dev-login', () => { if (!DEV_USER) fail(404, 'Not found'); return { token: newSession(userFor(DEV_USER, 'Test user')) }; });

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
if (require.main === module) server.listen(PORT, () => console.log(`Finance tracker running on http://localhost:${PORT}`));
module.exports = { server, db, money, reverse, runQuery };
