// Reads a screenshot of a bank or card app (or a receipt) and proposes what to record. It never changes money itself:
// the app shows the proposal, the user confirms lines, and the app records them through /api/money.
// The rules follow the Telegram money bot (ledger.py):
//  - every line in one screenshot is kept (two identical coffees on one day are two purchases)
//  - overlapping screenshots of the same account do not double count: each line gets a once-only key from
//    (account, date, merchant, amount, how many times that same line appeared before it in this screenshot)
//  - a posted line replaces its own pending version (same account, merchant, amount, within 7 days)
//  - a line is matched to an account by its card number (last 4) when exactly one account has it, else by name
//  - a balance the screenshot shows is offered as a correction when it differs from the app's figure
const crypto = require('node:crypto');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
const MAX_BYTES = 8_000_000;

const PROMPT = `You read one screenshot or statement (PDF) from a banking app, credit card app, or a receipt. Report only what is visible; never guess.
Return JSON:
{"kind":"transactions"|"statement"|"receipt"|"balance"|"other",
 "statement":{"account_name":"","last4":"or null","period_start":"YYYY-MM-DD","period_end":"YYYY-MM-DD","opening_balance":number,"closing_balance":number} or null (only for a statement),
 "accounts":[{"name":"as shown","last4":"1234 or null","type":"chequing|savings|credit_card|loan|other","balance":number or null,"available":number or null,"credit_limit":number or null,"due_date":"YYYY-MM-DD or null","minimum_payment":number or null}],
 "lines":[{"date":"YYYY-MM-DD","merchant":"as shown","amount":number,"direction":"out"|"in","pending":true|false,"account_name":"as shown or null","last4":"or null",
   "type":"purchase|income|refund|card_payment|transfer|fee|interest","other_account":"for card_payment or transfer: the other account's name or last 4 digits as shown, else null",
   "category":"one short category: for a purchase or fee (Groceries, Dining, Transport, Fuel, Bills, Utilities, Phone, Shopping, Entertainment, Health, Travel, Subscriptions, Rent, Insurance, Education, Personal care, Gifts, Fees); for income (Salary, Freelance, Interest, Government, Refund, Other income); else null"}],
 "receipt":{"merchant":"","date":"YYYY-MM-DD","total":number,"items":[{"name":"","amount":number}]} or null,
 "notes":"anything unclear, short"}
Rules: payroll, salary or direct deposit from an employer is income with category Salary; a payment to a credit card (e.g. "PAYMENT THANK YOU", "VISA PAYMENT") is card_payment; money moved between the person's own accounts is transfer; pay and deposits are income.
For a statement, list every transaction in the period and report the closing balance as the account's balance; for a credit card, balances are what is owed.
Amounts are positive numbers; direction "out" is money spent or charged, "in" is money received, refunds and payments to the card.
A year missing from a date: use YEAR_NOW unless that puts the date in the future, then the year before. Today is TODAY.`;

const mkey = (m) => String(m || '').toLowerCase().replace(/^(sq|sp|tst|klarna|paypal|pp)\s*\*\s*/, '').replace(/[^a-z]/g, '').slice(0, 24);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const dayDiff = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 864e5);

async function callGemini(mime, b64, today) {
  if (process.env.READER_STUB) return JSON.parse(require('node:fs').readFileSync(process.env.READER_STUB, 'utf8'));
  const key = require('./keystore').get();
  if (!key) { const e = new Error('Screenshot reading is not set up on this server (no Gemini key).'); e.status = 503; throw e; }
  const prompt = PROMPT.replace('YEAR_NOW', today.slice(0, 4)).replace('TODAY', today);
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('Could not read the screenshot right now. Try again in a minute.'); e.status = 502; throw e; }
  const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
  try { return JSON.parse(text); } catch { return { kind: 'other', lines: [], accounts: [], notes: 'The reading could not be understood.' }; }
}

// Which of the user's accounts a screenshot line belongs to. -> { type, id, name } or null
function resolveAccount(accounts, { last4, name }) {
  if (last4) {
    const hit = accounts.filter(a => String(a.last4 || a.last_four || a.card_number || '').slice(-4) === String(last4).slice(-4));
    if (hit.length === 1) return hit[0];
  }
  const n = norm(name);
  if (!n) return null;
  const exact = accounts.filter(a => norm(a.name) === n);
  if (exact.length === 1) return exact[0];
  const part = accounts.filter(a => norm(a.name) && (norm(a.name).includes(n) || n.includes(norm(a.name))));
  return part.length === 1 ? part[0] : null;
}

function plan(reading, ctx, sourceId) {
  const { bankAccounts, creditCards, transactions } = ctx;
  const all = [
    ...bankAccounts.map(a => ({ ...a, _type: 'bank_account' })),
    ...creditCards.map(c => ({ ...c, _type: 'credit_card' })),
  ];
  // Accounts on the screenshot that are not in the app yet become drafts the person confirms ("new:0", "new:1").
  const drafts = [];
  for (const a of reading.accounts || []) {
    if (resolveAccount(all, a)) continue;
    const t = a.type === 'credit_card' ? 'credit_card' : a.type === 'loan' ? null : 'bank_account';
    if (!t) continue;
    drafts.push({ id: 'new:' + drafts.length, _type: t, name: String(a.name || (t === 'credit_card' ? 'Credit card' : 'Bank account')).slice(0, 60),
      last4: a.last4 ? String(a.last4).slice(-4) : null, account_type: a.type === 'savings' ? 'savings' : 'checking',
      credit_limit: Number(a.credit_limit) > 0 ? Number(a.credit_limit) : null, due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(a.due_date || '')) ? a.due_date : null,
      minimum_payment: Number(a.minimum_payment) > 0 ? Number(a.minimum_payment) : null,
      balance: a.balance == null || !Number.isFinite(Number(a.balance)) ? null : Math.round(Math.abs(Number(a.balance)) * 100) / 100 });
  }
  const withDrafts = [...all, ...drafts];
  const only = (reading.accounts || []).length === 1 ? resolveAccount(withDrafts, reading.accounts[0]) : (!(reading.accounts || []).length && drafts.length === 1 ? drafts[0] : null);
  const KINDS = new Set(['purchase', 'income', 'refund', 'card_payment', 'transfer', 'fee', 'interest']);
  const seen = new Map();
  const lines = (reading.lines || []).map((l, i) => {
    const amount = Math.round(Math.abs(Number(l.amount)) * 100) / 100;
    const acct = resolveAccount(withDrafts, { last4: l.last4, name: l.account_name }) || only;
    let kind = KINDS.has(l.type) ? l.type : (l.direction === 'in' ? 'income' : 'purchase');
    if (kind === 'fee' || kind === 'interest') kind = l.direction === 'in' ? 'income' : 'purchase';
    if (kind === 'income' && acct && acct._type === 'credit_card') kind = 'refund';
    const otherRef = l.other_account ? { name: l.other_account, last4: (String(l.other_account).match(/\d{4}(?!.*\d)/) || [])[0] } : null;
    let other = otherRef ? resolveAccount(withDrafts.filter(x => !acct || x.id !== acct.id), otherRef) : null;
    // A card payment seen from the card's side: the card is this account; the other side is the bank it came from.
    if (kind === 'card_payment' && acct && acct._type !== 'credit_card' && other && other._type !== 'credit_card') kind = 'transfer';
    const sig = [acct ? acct.id : '?', l.date, mkey(l.merchant), amount.toFixed(2)].join('|');
    const n = seen.get(sig) || 0; seen.set(sig, n + 1);
    const key = 'shot:' + crypto.createHash('sha256').update(sig + '|' + n).digest('hex').slice(0, 32);
    const out = {
      i, date: l.date, merchant: l.merchant, amount, direction: l.direction === 'in' ? 'in' : 'out', pending: !!l.pending,
      account: acct ? { type: acct._type, id: acct.id, name: acct.name } : null, key, action: 'record',
      // For a line on a new account the browser rebuilds the key with the saved account's id, so a later scan matches it.
      key_rest: `${l.date}|${mkey(l.merchant)}|${amount.toFixed(2)}|${n}`,
      kind, other: other ? { type: other._type, id: other.id, name: other.name } : null, other_hint: l.other_account || null,
      category_guess: (kind === 'purchase' || kind === 'income') && l.category ? String(l.category).slice(0, 40) : null,
    };
    if (!(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(String(l.date || ''))) { out.action = 'skip'; out.why = 'No clear amount or date'; return out; }
    if (!acct) { out.action = 'choose_account'; out.why = 'Choose which account this is'; }
    // Already recorded by hand (same account, amount, merchant, within a day): offered unticked.
    const same = acct && transactions.find(t => t.status !== 'undone' && t.status !== 'deleted' && String(t.payment_method_id) === String(acct.id)
      && Math.abs(Number(t.amount) - amount) < 0.005 && dayDiff(t.date, l.date) <= 1 && mkey(t.description) && mkey(t.description) === mkey(l.merchant));
    const ids = [acct && acct.id, other && other.id].filter(Boolean).map(String);
    const samePair = !same && (kind === 'card_payment' || kind === 'transfer') && ids.length && transactions.find(t => t.status !== 'undone' && t.status !== 'deleted'
      && (t.type === 'credit_card_payment' || t.type === 'transfer') && Math.abs(Number(t.amount) - amount) < 0.005 && dayDiff(t.date, l.date) <= 3
      && [t.payment_method_id, t.card_id, t.to_account_id, t.from_account_id].filter(Boolean).map(String).some(x => ids.includes(x)));
    if (samePair) { out.action = 'already'; out.existing_id = samePair.id; out.why = 'Looks already recorded from the other account'; }
    if (same && !l.pending && same.pending) { out.action = 'mark_posted'; out.existing_id = same.id; out.why = 'Posts the pending line already recorded'; }
    else if (same) { out.action = 'already'; out.existing_id = same.id; out.why = 'Looks already recorded'; }
    // A posted line whose pending version is recorded from an earlier screenshot (date may move a few days).
    if (out.action === 'record' && acct && !l.pending) {
      const pend = transactions.find(t => t.pending && t.status === 'active' && String(t.payment_method_id) === String(acct.id)
        && Math.abs(Number(t.amount) - amount) < 0.005 && mkey(t.description) === mkey(l.merchant) && dayDiff(t.date, l.date) <= 7);
      if (pend) { out.action = 'mark_posted'; out.existing_id = pend.id; out.why = 'Posts the pending line already recorded'; }
    }
    return out;
  });
  const balances = (reading.accounts || []).map(a => {
    const acct = resolveAccount(all, a);
    if (!acct || a.balance == null || !Number.isFinite(Number(a.balance))) return null;
    const shown = Math.round(Math.abs(Number(a.balance)) * 100) / 100, has = Math.round(Number(acct.balance || 0) * 100) / 100;
    // Every balance the screenshot shows is offered as a snapshot; the server works out any difference after the lines are saved.
    return { account: { type: acct._type, id: acct.id, name: acct.name }, shown, current: has, differs: shown !== has, snapshot_date: acct.snapshot_date || null };
  }).filter(Boolean);
  // A statement is the authority for its period: its closing balance is checked against the app's history for that day,
  // and lines the app has in the period that are not on the statement are listed to review.
  let statement = null;
  const st = reading.statement;
  if (st && /^\d{4}-\d{2}-\d{2}$/.test(String(st.period_end || ''))) {
    const acct = resolveAccount(withDrafts, { last4: st.last4, name: st.account_name }) || only;
    const inPeriod = (d) => d && (!st.period_start || d >= st.period_start) && d <= st.period_end;
    const onStatement = (t) => lines.some(l => l.action !== 'skip' && Math.abs(Number(t.amount) - l.amount) < 0.005 && dayDiff(t.date, l.date) <= 3);
    const notOn = acct && !String(acct.id).startsWith('new:') ? transactions.filter(t => t.status !== 'undone' && t.status !== 'deleted' && t.type !== 'adjustment'
      && [t.payment_method_id, t.card_id, t.to_account_id].map(String).includes(String(acct.id)) && inPeriod(t.date) && !onStatement(t))
      .map(t => ({ id: t.id, date: t.date, description: t.description, amount: Number(t.amount), type: t.type })) : [];
    statement = { account: acct ? { type: acct._type, id: acct.id, name: acct.name } : null, period_start: st.period_start || null, period_end: st.period_end,
      opening_balance: Number.isFinite(Number(st.opening_balance)) ? Number(st.opening_balance) : null,
      closing_balance: Number.isFinite(Number(st.closing_balance)) ? Math.abs(Number(st.closing_balance)) : null, not_on_statement: notOn };
  }
  const unknown = (reading.accounts || []).filter(a => !resolveAccount(withDrafts, a)).map(a => ({ name: a.name, last4: a.last4 || null, type: a.type || null }));
  const new_accounts = drafts.map(({ _type, ...d }) => ({ ...d, type: _type }));
  return { source_id: sourceId, kind: reading.kind || 'other', statement, lines, balances: statement ? balances.filter(b => !statement.account || String(b.account.id) !== String(statement.account.id)) : balances, new_accounts, unknown_accounts: unknown, receipt: reading.receipt || null, notes: reading.notes || '' };
}

// body: { image: base64 (no data: prefix) or data URL, mime }
async function read(uid, body, ctx) {
  let b64 = String(body.image || ''), mime = String(body.mime || '');
  const m = b64.match(/^data:([\w/+.-]+);base64,(.*)$/s);
  if (m) { mime = m[1]; b64 = m[2]; }
  if (!TYPES.has(mime)) { const e = new Error('Send a screenshot or photo (PNG, JPEG, WebP, HEIC) or a statement PDF.'); e.status = 400; throw e; }
  if (Buffer.byteLength(b64, 'base64') > MAX_BYTES) { const e = new Error('That file is too large (8 MB at most).'); e.status = 413; throw e; }
  const sourceId = crypto.createHash('sha256').update(b64).digest('hex').slice(0, 16);
  const today = ctx.today || new Date().toLocaleDateString('en-CA');
  const reading = await callGemini(mime, b64, today);
  return plan(reading, ctx, sourceId);
}

module.exports = { read, plan, resolveAccount, mkey };
