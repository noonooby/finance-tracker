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
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const MAX_BYTES = 8_000_000;

const PROMPT = `You read one screenshot from a banking app, credit card app, or a receipt. Report only what is visible; never guess.
Return JSON:
{"kind":"transactions"|"receipt"|"balance"|"other",
 "accounts":[{"name":"as shown","last4":"1234 or null","type":"chequing|savings|credit_card|loan|other","balance":number or null,"available":number or null}],
 "lines":[{"date":"YYYY-MM-DD","merchant":"as shown","amount":number,"direction":"out"|"in","pending":true|false,"account_name":"as shown or null","last4":"or null"}],
 "receipt":{"merchant":"","date":"YYYY-MM-DD","total":number,"items":[{"name":"","amount":number}]} or null,
 "notes":"anything unclear, short"}
Rules: amounts are positive numbers; direction "out" is money spent or charged, "in" is money received, refunds and payments to the card.
A year missing from a date: use YEAR_NOW unless that puts the date in the future, then the year before. Today is TODAY.`;

const mkey = (m) => String(m || '').toLowerCase().replace(/^(sq|sp|tst|klarna|paypal|pp)\s*\*\s*/, '').replace(/[^a-z]/g, '').slice(0, 24);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const dayDiff = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 864e5);

async function callGemini(mime, b64, today) {
  if (process.env.READER_STUB) return JSON.parse(require('node:fs').readFileSync(process.env.READER_STUB, 'utf8'));
  const key = process.env.GEMINI_API_KEY;
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
  const only = (reading.accounts || []).length === 1 ? resolveAccount(all, reading.accounts[0]) : null;
  const seen = new Map();
  const lines = (reading.lines || []).map((l, i) => {
    const amount = Math.round(Math.abs(Number(l.amount)) * 100) / 100;
    const acct = resolveAccount(all, { last4: l.last4, name: l.account_name }) || only;
    const sig = [acct ? acct.id : '?', l.date, mkey(l.merchant), amount.toFixed(2)].join('|');
    const n = seen.get(sig) || 0; seen.set(sig, n + 1);
    const key = 'shot:' + crypto.createHash('sha256').update(sig + '|' + n).digest('hex').slice(0, 32);
    const out = {
      i, date: l.date, merchant: l.merchant, amount, direction: l.direction === 'in' ? 'in' : 'out', pending: !!l.pending,
      account: acct ? { type: acct._type, id: acct.id, name: acct.name } : null, key, action: 'record',
    };
    if (!(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(String(l.date || ''))) { out.action = 'skip'; out.why = 'No clear amount or date'; return out; }
    if (!acct) { out.action = 'choose_account'; out.why = 'Choose which account this is'; }
    // Already recorded by hand (same account, amount, merchant, within a day): offered unticked.
    const same = acct && transactions.find(t => t.status !== 'undone' && t.status !== 'deleted' && String(t.payment_method_id) === String(acct.id)
      && Math.abs(Number(t.amount) - amount) < 0.005 && dayDiff(t.date, l.date) <= 1 && mkey(t.description) && mkey(t.description) === mkey(l.merchant));
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
    return shown === has ? null : { account: { type: acct._type, id: acct.id, name: acct.name }, shown, current: has };
  }).filter(Boolean);
  const unknown = (reading.accounts || []).filter(a => !resolveAccount(all, a)).map(a => ({ name: a.name, last4: a.last4 || null, type: a.type || null }));
  return { source_id: sourceId, kind: reading.kind || 'other', lines, balances, unknown_accounts: unknown, receipt: reading.receipt || null, notes: reading.notes || '' };
}

// body: { image: base64 (no data: prefix) or data URL, mime }
async function read(uid, body, ctx) {
  let b64 = String(body.image || ''), mime = String(body.mime || '');
  const m = b64.match(/^data:([\w/+.-]+);base64,(.*)$/s);
  if (m) { mime = m[1]; b64 = m[2]; }
  if (!TYPES.has(mime)) { const e = new Error('Send a PNG, JPEG, WebP or HEIC screenshot.'); e.status = 400; throw e; }
  if (Buffer.byteLength(b64, 'base64') > MAX_BYTES) { const e = new Error('That image is too large (8 MB at most).'); e.status = 413; throw e; }
  const sourceId = crypto.createHash('sha256').update(b64).digest('hex').slice(0, 16);
  const today = ctx.today || new Date().toLocaleDateString('en-CA');
  const reading = await callGemini(mime, b64, today);
  return plan(reading, ctx, sourceId);
}

module.exports = { read, plan, resolveAccount, mkey };
