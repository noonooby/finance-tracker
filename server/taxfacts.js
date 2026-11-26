// The yearly figures the room sums need (Canada), each from the Canada Revenue Agency's own pages.
// The figures below were checked against those pages. A later year that is not listed here is looked up once it is
// announced, taken only from canada.ca and only when it fits how the limit is set, and is marked as looked up.
const CRA = 'https://www.canada.ca/en/revenue-agency/services/tax';
const SOURCES = {
  limits: `${CRA}/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html`,
  tfsa: `${CRA}/individuals/topics/tax-free-savings-account/contributing/calculate-room.html`,
  tfsa_over: `${CRA}/individuals/topics/tax-free-savings-account/contributing/overcontribute.html`,
  rrsp: `${CRA}/individuals/topics/rrsps-related-plans/contributing-a-rrsp-prpp/contributions-affect-your-rrsp-prpp-deduction-limit.html`,
  rrsp_over: `${CRA}/individuals/topics/rrsps-related-plans/contributing-a-rrsp-prpp/what-happens-you-over-your-rrsp-prpp-deduction-limit.html`,
  fhsa: `${CRA}/individuals/topics/first-home-savings-account/contributing-your-fhsa.html`,
  fhsa_over: `${CRA}/individuals/topics/first-home-savings-account/what-happens-contribute-transfer-too-much.html`,
};
const TFSA = { 2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000, 2013: 5500, 2014: 5500, 2015: 10000, 2016: 5500, 2017: 5500, 2018: 5500,
  2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000, 2023: 6500, 2024: 7000, 2025: 7000, 2026: 7000 };
const RRSP = { 2023: 30780, 2024: 31560, 2025: 32490, 2026: 33810, 2027: 35390, 2028: 36390 };
const FHSA = { yearly: 8000, carry: 8000, lifetime: 40000, first_year: 2023, years_open: 15 };
const CHECKED = '2026-11-26';

const lastYear = (t) => Math.max(...Object.keys(t).map(Number));
// A new TFSA limit is the old one or the next step of 500 above it; anything else is not taken.
const fits = (limit, before) => Number.isInteger(limit) && limit % 500 === 0 && limit >= before && limit <= before + 1000;
const official = (u) => { try { const h = new URL(u).hostname; return h === 'canada.ca' || h.endsWith('.canada.ca') || h.endsWith('.gc.ca'); } catch { return false; } };

function saved(db) {
  const out = {};
  for (const r of db.prepare("SELECT k, v FROM meta WHERE k LIKE 'tax:tfsa:%'").all()) {
    try { const j = JSON.parse(r.v); const y = Number(r.k.slice(9)); if (y > lastYear(TFSA) && Number.isInteger(j.limit)) out[y] = j; } catch { /* not a figure */ }
  }
  return out;
}

function facts(db) {
  const extra = db ? saved(db) : {};
  const tfsa = { ...TFSA }, looked_up = {};
  for (const y of Object.keys(extra).map(Number).sort()) {
    if (tfsa[y - 1] == null || !fits(extra[y].limit, tfsa[y - 1])) break;
    tfsa[y] = extra[y].limit; looked_up[y] = { source: extra[y].source, checked: extra[y].checked };
  }
  return { country: 'CA', checked: CHECKED, tfsa, tfsa_looked_up: looked_up, rrsp: { ...RRSP }, rrsp_share: 0.18, rrsp_buffer: 2000, fhsa: { ...FHSA }, over_rate: 0.01, sources: SOURCES };
}

// Asks for the TFSA limit of a year that is not known yet. At most once a day; nothing about the person is sent.
async function learn(db, year, today) {
  const f = facts(db);
  if (f.tfsa[year] != null || f.tfsa[year - 1] == null) return null;
  const tryKey = `tax:try:tfsa:${year}`;
  const last = db.prepare('SELECT v FROM meta WHERE k = ?').get(tryKey);
  if (last && last.v === today) return null;
  db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run(tryKey, today);
  let o = {};
  if (process.env.TAX_STUB) { try { o = JSON.parse(process.env.TAX_STUB); } catch { o = {}; } }
  else {
    const key = require('./keystore').get();
    if (!key) return null;
    const prompt = `Has the Canada Revenue Agency published the TFSA annual dollar limit for ${year}? Use only pages on canada.ca.
Reply with JSON only, no other text: {"published":true|false,"limit":whole number of dollars or null,"source_url":"the canada.ca page that states it"}
A forecast, an estimate or a news article is not published: set published to false unless a canada.ca page states the ${year} limit.`;
    try {
      const text = await require('./gemini').generate(key,
        { contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } },
        { what: 'look up a tax limit', timeoutMs: 45000 });
      const m = text.match(/\{[\s\S]*\}/);
      o = m ? JSON.parse(m[0]) : {};
    } catch { return null; }
  }
  const limit = Number(o.limit);
  if (o.published !== true || !fits(limit, f.tfsa[year - 1]) || !official(o.source_url)) return null;
  const row = { limit, source: String(o.source_url).slice(0, 300), checked: today };
  db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run(`tax:tfsa:${year}`, JSON.stringify(row));
  return row;
}

// The year whose limit should be known by now: this year, and next year from November on (when it is announced).
const wanted = (today) => { const y = Number(today.slice(0, 4)); return Number(today.slice(5, 7)) >= 11 ? y + 1 : y; };
async function keepUp(db, today) {
  const to = wanted(today);
  for (let y = lastYear(TFSA) + 1; y <= to; y++) if (facts(db).tfsa[y] == null && !(await learn(db, y, today))) break;
}

module.exports = { facts, learn, keepUp, fits, official };
