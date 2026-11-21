// Public rates for a named product (a credit card, a bank account's overdraft, a loan), looked up by Gemini with Google Search.
// Only the product name and kind are sent: never balances, limits or anything about the person.
// The answer is a suggestion with its source; the person confirms it, and a personal rate always wins.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const ASK = {
  credit_card: 'the credit card "NAME" in Canada: standard purchase interest rate (percent a year), cash advance rate, annual fee in CAD, and whether it offers equal payment / instalment plans',
  bank_account: 'the bank account "NAME" in Canada: its overdraft protection interest rate (percent a year), monthly overdraft fee, per-use overdraft fee, and the account monthly fee',
  loan: 'the loan or financing product "NAME" in Canada: typical interest rate range (percent a year) and any setup or origination fee',
};

function clean(n) { const x = Number(n); return Number.isFinite(x) && x >= 0 && x < 100000 ? x : null; }

async function lookup(kind, name) {
  const what = ASK[kind];
  const product = String(name || '').replace(/[^\w\s&'().,+-]/g, '').trim().slice(0, 80);
  if (!what || product.length < 3) { const e = new Error('Enter the product name, for example "Amex Cobalt" or "TD Unlimited Chequing".'); e.status = 400; throw e; }
  if (process.env.LOOKUP_STUB) return { ...JSON.parse(process.env.LOOKUP_STUB), product, checked: new Date().toISOString().slice(0, 10) };
  const key = require('./keystore').get();
  if (!key) { const e = new Error('Looking up rates needs the Gemini key (set once in Settings).'); e.status = 503; throw e; }
  const prompt = `Find the current published figures for ${what.replace('NAME', product)}. Use the issuer's own website when possible.
Reply with JSON only, no other text:
{"found":true|false,"product":"official name","issuer":"","purchase_rate":number or null,"cash_rate":number or null,"annual_fee":number or null,
"overdraft_rate":number or null,"overdraft_monthly_fee":number or null,"overdraft_use_fee":number or null,"account_monthly_fee":number or null,
"rate_low":number or null,"rate_high":number or null,"setup_fee":number or null,"offers_plans":true|false|null,"source_url":"the page you used","notes":"short"}
If you are not sure it is the same product, set found to false.`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(45000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('Could not look up rates right now. Try again in a minute.'); e.status = 502; throw e; }
  const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  let o = {};
  try { o = m ? JSON.parse(m[0]) : {}; } catch { o = {}; }
  const src = String(o.source_url || '').startsWith('https://') ? String(o.source_url).slice(0, 300) : null;
  const out = { found: !!o.found, product: String(o.product || product).slice(0, 80), issuer: String(o.issuer || '').slice(0, 60), source_url: src, notes: String(o.notes || '').slice(0, 200), checked: new Date().toISOString().slice(0, 10) };
  for (const f of ['purchase_rate', 'cash_rate', 'annual_fee', 'overdraft_rate', 'overdraft_monthly_fee', 'overdraft_use_fee', 'account_monthly_fee', 'rate_low', 'rate_high', 'setup_fee']) out[f] = clean(o[f]);
  out.offers_plans = typeof o.offers_plans === 'boolean' ? o.offers_plans : null;
  return out;
}

module.exports = { lookup };
