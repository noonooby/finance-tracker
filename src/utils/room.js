// Room left in registered accounts (TFSA, RRSP, FHSA), worked out from one figure you give (your room on a day)
// and the money recorded going in and out since. The yearly figures come from the server (see server/taxfacts.js).
export const ROOM_KINDS = ['TFSA', 'RRSP', 'FHSA'];
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const live = (t) => t && t.status !== 'undone' && t.status !== 'deleted';

// Money into (+) and out of (-) the accounts of one kind. Moving between two accounts of the same kind is neither.
export function movements(kind, investments = [], transactions = []) {
  const ids = new Set(investments.filter((i) => String(i.kind || '').toUpperCase() === kind).map((i) => String(i.id)));
  const out = [];
  if (!ids.size) return out;
  for (const t of transactions) {
    if (!live(t) || t.type !== 'transfer' || !isDay(String(t.date).slice(0, 10))) continue;
    const amount = Number(t.amount);
    if (!(amount > 0)) continue;
    const into = t.transfer_to === 'investment' && ids.has(String(t.to_account_id));
    const from = t.payment_method === 'investment' && ids.has(String(t.payment_method_id));
    if (into === from) continue;
    out.push({ date: String(t.date).slice(0, 10), amount: into ? amount : -amount });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// The last day to put money in an RRSP for a tax year: the 60th day of the next year, moved to Monday on a weekend.
export function rrspDeadline(year) {
  const d = new Date(Number(year) + 1, 0, 60);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA');
}

// stated: { room, as_of, used? }. A figure dated January 1 is the room at the start of that day; any other day's
// figure already counts what went in that day.
export function room(kind, stated, moves, facts, today) {
  const amount = stated ? Number(stated.room) : NaN;
  if (!stated || stated.room === '' || stated.room == null || !Number.isFinite(amount) || !isDay(stated.as_of) || !isDay(today) || stated.as_of > today || !facts) return { kind, known: false };
  const first = stated.as_of.slice(5) === '01-01';
  const counts = (m) => (first ? m.date >= stated.as_of : m.date > stated.as_of) && m.date <= today;
  const list = (moves || []).filter(counts);
  const year = (d) => Number(d.slice(0, 4));
  const put = (y) => round2(list.filter((m) => m.amount > 0 && year(m.date) === y).reduce((s, m) => s + m.amount, 0));
  const took = (y) => round2(list.filter((m) => m.amount < 0 && year(m.date) === y).reduce((s, m) => s - m.amount, 0));
  const from = year(stated.as_of), now = year(today);
  const out = { kind, known: true, as_of: stated.as_of, stated: round2(amount), put_in: put(now), taken_out: took(now), missing: [], stale: false, next: null, notes: [] };
  let r = amount;

  if (kind === 'TFSA') {
    for (let y = from; y < now; y++) {
      const limit = facts.tfsa[y + 1];
      if (limit == null) out.missing.push(y + 1);
      r = r - put(y) + took(y) + (limit || 0);
    }
    r -= put(now);
    const limit = facts.tfsa[now + 1];
    out.next = { date: `${now + 1}-01-01`, adds: limit == null ? null : round2(limit + took(now)), back: took(now), limit: limit == null ? null : limit };
  } else if (kind === 'FHSA') {
    const f = facts.fhsa;
    let used = stated.used === '' || stated.used == null || !Number.isFinite(Number(stated.used)) ? null : Number(stated.used);
    const cap = (x) => (used == null ? x : Math.min(x, Math.max(0, f.lifetime - used)));
    for (let y = from; y < now; y++) {
      const c = put(y);
      if (used != null) used += c;
      r = cap(Math.min(f.carry, r - c) + f.yearly);
    }
    r -= put(now);
    if (used != null) { used += put(now); out.lifetime_left = round2(Math.max(0, f.lifetime - used)); }
    const after = Math.min(f.carry, r) + f.yearly;
    out.next = { date: `${now + 1}-01-01`, room: round2(used == null ? after : Math.min(after, Math.max(0, f.lifetime - used))) };
  } else {
    // RRSP: new room depends on last year's earned income and comes on the notice of assessment.
    for (let y = from; y <= now; y++) r -= put(y);
    out.put_in = round2(list.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0));
    out.stale = from < now;
    out.deadline = rrspDeadline(now);
    out.yearly_limit = facts.rrsp[now + 1] != null ? facts.rrsp[now + 1] : null;
  }
  out.room = round2(r);
  const buffer = kind === 'RRSP' ? facts.rrsp_buffer : 0;
  out.over = out.room < -buffer ? round2(-out.room - buffer) : 0;
  out.cost_month = out.over ? round2(out.over * facts.over_rate) : 0;
  return out;
}

// Every kind you have an account for or gave a figure for, with its room, and what is still needed to work it out.
export function rooms({ stated = {}, investments = [], transactions = [], facts, today }) {
  const have = new Set(investments.map((i) => String(i.kind || '').toUpperCase()));
  return ROOM_KINDS.filter((k) => have.has(k) || (stated[k] && stated[k].room != null && stated[k].room !== ''))
    .map((k) => ({ ...room(k, stated[k], movements(k, investments, transactions), facts, today), accounts: investments.filter((i) => String(i.kind || '').toUpperCase() === k) }));
}

// ---------- tax years: what the returns on record say, and what follows from them ----------
export const TAX_FIELDS = [
  ['total_income', 'Total income'], ['employment_income', 'Employment income'], ['net_income', 'Net income'], ['taxable_income', 'Taxable income'],
  ['rrsp_deducted', 'RRSP deduction claimed'], ['pension_adjustment', 'Pension adjustment'], ['refund', 'Refund'], ['balance_owing', 'Balance owing'],
  ['rrsp_limit_next', 'RRSP limit for the next year'], ['unused_rrsp', 'Unused RRSP contributions'], ['tuition_carry', 'Tuition carried forward'],
];
const has = (v) => v !== '' && v != null && Number.isFinite(Number(v));

// The day a return is due: April 30 of the next year, moved to Monday on a weekend.
export function filingDeadline(year) {
  const d = new Date(Number(year) + 1, 3, 30);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA');
}

// What comes next, from the years on record. Every figure that is assumed is named with where it came from, and
// each can be set by the person (assume: { earned, pa } for the current year).
//   rrspNow: room('RRSP', ...) for today, when known.
export function taxNext({ years = [], rrspNow = null, facts, today, assume = {} }) {
  const now = Number(String(today).slice(0, 4));
  const list = years.filter((y) => Number.isInteger(Number(y.year))).map((y) => ({ ...y, year: Number(y.year) })).sort((a, b) => b.year - a.year);
  const last = list[0] || null;
  const out = { years: list, last, missing: [], results: [], rrsp: null, due: [] };
  if (list.length) {
    const first = list[list.length - 1].year;
    for (let y = first; y < now; y++) if (!list.some((x) => x.year === y)) out.missing.push(y);
  } else out.missing.push(now - 1);
  // Returns still to come: last year's while it is not on record, and this year's.
  if (!list.some((x) => x.year === now - 1)) out.due.push({ year: now - 1, date: filingDeadline(now - 1), late: filingDeadline(now - 1) < today });
  out.due.push({ year: now, date: filingDeadline(now), late: false });
  // How the last returns ended, newest first.
  out.results = list.filter((y) => has(y.refund) || has(y.balance_owing)).slice(0, 5).map((y) => ({ year: y.year, amount: round2(has(y.refund) && Number(y.refund) > 0 ? Number(y.refund) : -(Number(y.balance_owing) || 0)) }));
  // Next year's RRSP room: what is unused now, plus 18% of this year's earned income up to the yearly limit, less the
  // pension adjustment. Earned income and the pension adjustment are assumed the same as the last return unless set.
  if (facts) {
    const from = (field) => list.find((y) => has(y[field]));
    const eRow = from('employment_income') || from('total_income');
    const earned = has(assume.earned) ? Number(assume.earned) : eRow ? Number(has(eRow.employment_income) ? eRow.employment_income : eRow.total_income) : null;
    const pRow = from('pension_adjustment');
    const pa = has(assume.pa) ? Number(assume.pa) : pRow ? Number(pRow.pension_adjustment) : 0;
    const cap = facts.rrsp[now + 1] != null ? facts.rrsp[now + 1] : null;
    if (earned != null && cap != null) {
      const adds = round2(Math.max(0, Math.min(earned * facts.rrsp_share, cap) - pa));
      const base = rrspNow && rrspNow.known ? rrspNow.room : null;
      out.rrsp = { year: now + 1, earned: round2(earned), earned_from: has(assume.earned) ? 'set by you' : `your ${eRow.year} return`, pa: round2(pa), pa_from: has(assume.pa) ? 'set by you' : pRow ? `your ${pRow.year} return` : 'none on record',
        cap, adds, base, estimate: base == null ? null : round2(base + adds) };
    }
  }
  return out;
}
