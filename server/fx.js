// Exchange rates for purchases in another currency: the European Central Bank's daily rate for a day
// (the last published rate on or before it), from frankfurter.dev, which needs no key. One lookup per currency pair
// and day, kept in the meta table. Only the currencies and the date are sent.
const HOME = (process.env.HOME_CURRENCY || 'CAD').toUpperCase();
const CODE = /^[A-Z]{3}$/;

function err(status, message) { const e = new Error(message); e.status = status; return e; }

// -> { rate, date (the rate's own day), from, to }
async function rate(db, from, to = HOME, day) {
  from = String(from || '').toUpperCase(); to = String(to || '').toUpperCase();
  if (!CODE.test(from) || !CODE.test(to)) throw err(400, 'Choose a currency, for example USD.');
  if (from === to) return { rate: 1, date: day || null, from, to };
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) ? day : 'latest';
  const k = `fx:${from}:${to}:${d}`;
  const hit = d !== 'latest' && db.prepare('SELECT v FROM meta WHERE k = ?').get(k);
  if (hit) return JSON.parse(hit.v);
  if (process.env.FX_STUB) return { rate: Number(process.env.FX_STUB), date: d, from, to };
  let j;
  try {
    const r = await fetch(`https://api.frankfurter.dev/v1/${d}?base=${from}&symbols=${to}`, { signal: AbortSignal.timeout(10000) });
    j = await r.json().catch(() => ({}));
    if (r.status === 404 || r.status === 422) throw err(400, `No exchange rate is published for ${from}. Enter the amount in ${to} yourself.`);
    if (!r.ok) throw err(502, 'Could not look up the exchange rate right now. Enter the amount yourself or try again.');
  } catch (e) {
    if (e.status) throw e;
    throw err(502, 'Could not reach the exchange rate service. Enter the amount yourself or try again.');
  }
  const v = Number(j && j.rates && j.rates[to]);
  if (!(v > 0)) throw err(400, `No exchange rate is published for ${from}. Enter the amount in ${to} yourself.`);
  const out = { rate: v, date: j.date || d, from, to };
  if (d !== 'latest') db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run(k, JSON.stringify(out));
  return out;
}

const convert = (amount, r) => Math.round(Number(amount) * r * 100) / 100;

module.exports = { rate, convert, HOME };
