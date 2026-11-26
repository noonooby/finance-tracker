// Market prices for what an investment account holds (shares, funds, crypto), so its value follows the market.
// Only the ticker, or the fund's name when no ticker is shown, is sent: never units, values or anything about the person.
// A price is kept for five minutes. A holding with no price found keeps the last value it had.
const fx = require('./fx');

const HOME = fx.HOME;
const SYMBOL = /^[A-Z0-9^][A-Z0-9.^=-]{0,14}$/;
const FRESH = 5 * 60e3, MISSING = 24 * 3600e3;
const COINS = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'LTC', 'BCH', 'DOT', 'AVAX', 'LINK', 'MATIC', 'POL', 'UNI', 'XLM', 'ATOM', 'USDT', 'USDC', 'SHIB', 'BNB', 'TRX', 'NEAR', 'ALGO']);
const KINDS = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'CRYPTOCURRENCY']);
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const num = (v) => { const n = typeof v === 'string' ? Number(v.replace(/[,$\s]/g, '')) : Number(v); return Number.isFinite(n) ? n : null; };
const stub = () => { try { return process.env.PRICE_STUB ? JSON.parse(process.env.PRICE_STUB) : null; } catch { return {}; } };
const sym = (v) => String(v == null ? '' : v).toUpperCase().replace(/\s+/g, '').replace(/^\$/, '').slice(0, 15);
const text = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : '');

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`status ${r.status}`);
  return r.json();
}

// -> { symbol, price, currency, name, at, stale? } or null when there is no such ticker.
async function quote(db, symbol) {
  symbol = sym(symbol);
  if (!SYMBOL.test(symbol)) return null;
  const k = `px:${symbol}`;
  const hit = db.prepare('SELECT v FROM meta WHERE k = ?').get(k);
  let old = null;
  try { old = hit ? JSON.parse(hit.v) : null; } catch { old = null; }
  if (old && Date.now() - old.t < (old.none ? MISSING : FRESH)) return old.none ? null : old;
  let q = null;
  const fixed = stub();
  try {
    if (fixed) {
      const f = fixed[symbol];
      q = f ? { price: num(f.price), currency: String(f.currency || HOME).toUpperCase(), name: text(f.name, 80), at: new Date().toISOString() } : null;
    } else {
      const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
      const m = j && j.chart && Array.isArray(j.chart.result) && j.chart.result[0] && j.chart.result[0].meta;
      if (m) {
        let price = num(m.regularMarketPrice), currency = String(m.currency || '');
        if (currency === 'GBp') { price = price / 100; currency = 'GBP'; }
        q = { price, currency: currency.toUpperCase(), name: text(m.longName || m.shortName, 80), at: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : new Date().toISOString() };
      }
    }
  } catch {
    // The service did not answer: the last price stands, marked as old.
    return old && !old.none ? { ...old, stale: true } : null;
  }
  if (q && !(q.price > 0 && /^[A-Z]{3}$/.test(q.currency))) q = null;
  const out = q ? { symbol, ...q, t: Date.now() } : { symbol, none: true, t: Date.now() };
  db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run(k, JSON.stringify(out));
  return q ? out : null;
}

const near = (a, b, by) => a > 0 && b > 0 && Math.abs(a - b) / b <= by;

// Which ticker a holding is. A price shown on the screen proves the match; with no price to prove it, a ticker is
// taken only when it can mean one thing. -> { quote } or { quote: null, choices: [quotes] }
async function find(db, h) {
  const shown = sym(h.symbol), cur = /^[A-Z]{3}$/.test(String(h.currency || '').toUpperCase()) ? String(h.currency).toUpperCase() : null;
  const units = num(h.units), value = num(h.value);
  const price = units > 0 && value > 0 ? value / units : num(h.price);
  // One ticker can be a Canadian listing, a US listing or a coin. The Canadian one is its main market (Toronto, else
  // the smaller ones); a coin is tried when the ticker is a known coin, the account is a crypto one, or nothing else is.
  const stocks = [], coins = [];
  if (SYMBOL.test(shown)) {
    if (/[.=^-]/.test(shown)) { const q = await quote(db, shown); if (q) stocks.push(q); } else {
      for (const n of [`${shown}.TO`, `${shown}.NE`, `${shown}.V`]) { const q = await quote(db, n); if (q) { stocks.push(q); break; } }
      const us = await quote(db, shown);
      if (us) stocks.push(us);
      const coin = h.crypto || COINS.has(shown);
      if (coin || price > 0 || !stocks.length) for (const c of [...new Set([cur || HOME, HOME, 'USD'])]) { const q = await quote(db, `${shown}-${c}`); if (q) coins.push(q); }
      if (coin && coins.length) return { quote: (price > 0 && coins.find((q) => near(q.price, price, 0.12))) || coins[0] };
    }
  }
  const found = [...stocks, ...coins];
  if (price > 0) {
    const pick = found.find((q) => (!cur || q.currency === cur) && near(q.price, price, 0.12)) || found.find((q) => near(q.price, price, 0.12));
    if (pick) return { quote: pick };
  }
  const pool = stocks.length ? stocks : coins.slice(0, 1);
  const mine = cur ? pool.filter((q) => q.currency === cur) : pool;
  if (mine.length === 1) return { quote: mine[0] };
  if (pool.length === 1) return { quote: pool[0] };
  // No ticker shown: look the fund up by its name, and take a match only when its price agrees with the screen.
  const name = text(h.name, 60);
  if (!pool.length && name.length >= 4 && price > 0 && !stub()) {
    try {
      const j = await get(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(name)}&quotesCount=6&newsCount=0`);
      for (const c of ((j && j.quotes) || []).filter((x) => x && KINDS.has(x.quoteType)).slice(0, 5)) {
        const q = await quote(db, c.symbol);
        if (q && (!cur || q.currency === cur) && near(q.price, price, 0.05)) return { quote: q };
      }
    } catch { /* not found by name: the holding keeps the value shown */ }
  }
  return { quote: null, choices: pool };
}

const rateMemo = new Map();
async function toHome(db, currency) {
  if (currency === HOME) return 1;
  const hit = rateMemo.get(currency);
  if (hit && Date.now() - hit.t < 3600e3) return hit.rate;
  try {
    const r = await fx.rate(db, currency, HOME);
    if (r.rate > 0) { rateMemo.set(currency, { rate: r.rate, t: Date.now() }); return r.rate; }
  } catch { /* fall through to the last rate */ }
  return hit ? hit.rate : null;
}

// What is given for an account's holdings, in one known shape. Each needs a name or ticker, and units or a value.
function clean(listIn) {
  const out = [];
  for (const h of Array.isArray(listIn) ? listIn.slice(0, 200) : []) {
    if (!h || typeof h !== 'object') continue;
    const units = num(h.units), value = num(h.value), price = num(h.price);
    const shown = sym(h.shown || h.symbol), name = text(h.name, 80);
    const cur = String(h.currency || '').toUpperCase();
    if (!shown && !name) continue;
    if (!(units > 0) && !(value > 0)) continue;
    out.push({ shown: SYMBOL.test(shown) ? shown : '', symbol: SYMBOL.test(sym(h.symbol)) && h.symbol_set ? sym(h.symbol) : null, name,
      units: units > 0 && units < 1e12 ? units : null, price: price > 0 ? price : null, currency: /^[A-Z]{3}$/.test(cur) ? cur : null,
      value: value > 0 && value < 1e12 ? round2(value) : null });
  }
  return out;
}

// Gives each holding its ticker. One already matched keeps it; one the person typed in full is used as typed.
async function settle(db, listIn, before = [], crypto = false) {
  const out = [], unsure = [];
  for (const h of clean(listIn)) {
    const was = before.find((b) => b && b.symbol && ((h.shown && b.shown === h.shown) || (!h.shown && h.name && b.name === h.name)));
    let q = null;
    if (h.symbol) q = await quote(db, h.symbol);
    if (!q && was) q = await quote(db, was.symbol);
    let choices = [];
    if (!q) { const f = await find(db, { symbol: h.shown, name: h.name, units: h.units, value: h.value, price: h.price, currency: h.currency, crypto }); q = f.quote; choices = f.choices || []; }
    const n = { shown: h.shown, symbol: q ? q.symbol : null, name: h.name || (q && q.name) || h.shown, units: h.units, price: h.price, currency: h.currency, value: h.value, live: false };
    if (!q && h.units > 0 && h.price > 0 && n.value == null) n.value = round2(h.units * h.price);
    if (!q) unsure.push({ shown: h.shown, name: n.name, choices: choices.map((c) => ({ symbol: c.symbol, name: c.name, price: c.price, currency: c.currency })) });
    out.push(n);
  }
  return { holdings: out, unsure };
}

// What an account is worth now: each priced holding at the market price in the home currency, the rest at the value
// they last had, plus the cash in the account.
async function worth(db, row) {
  const holdings = [];
  let total = 0, live = 0;
  for (const h of (Array.isArray(row && row.holdings) ? row.holdings : []).filter((x) => x && typeof x === 'object')) {
    const n = { ...h, live: false };
    if (h.symbol && h.units > 0) {
      const q = await quote(db, h.symbol);
      const r = q ? await toHome(db, q.currency) : null;
      if (q && r > 0) {
        n.price = q.price; n.currency = q.currency; n.value = round2(h.units * q.price * r); n.at = q.at; n.live = !q.stale;
        if (!n.name) n.name = q.name;
        live += 1;
      }
    }
    total += Number(n.value) || 0;
    holdings.push(n);
  }
  return { holdings, balance: round2(total + (num(row && row.cash) || 0)), live };
}

module.exports = { quote, find, clean, settle, worth, HOME };
