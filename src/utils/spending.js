// Spending arithmetic that changes nothing: what each category cost in a period (split purchases count per part,
// refunds count back), budgets for a month, and bills that repeat, found in your own history.
// Pure functions, so Home, Settings and the scenario tests use the same rules.
import { mkey } from './categoryRules';

const round2 = (n) => Math.round(n * 100) / 100;
const parse = (d) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const live = (t) => t && t.status !== 'undone' && t.status !== 'deleted';

// The category parts of one line: its split parts when it has them, else the whole amount in its category.
// -> [{ category_id, category_name, amount }]
export function categoryParts(t) {
  const parts = Array.isArray(t.splits) && t.splits.length ? t.splits : [{ category_id: t.category_id, category_name: t.category_name, amount: t.amount }];
  return parts.map((p) => ({ category_id: p.category_id ? String(p.category_id) : '', category_name: p.category_name || '', amount: Number(p.amount) || 0 }));
}

// What each category cost between two days (inclusive): purchases add, refunds take away. -> { [category_id]: amount }
export function spentByCategory(transactions, from, to) {
  const out = {};
  for (const t of transactions || []) {
    if (!live(t) || (t.type !== 'expense' && t.type !== 'refund')) continue;
    const d = String(t.date || '').slice(0, 10);
    if (d < from || d > to) continue;
    const sign = t.type === 'refund' ? -1 : 1;
    for (const p of categoryParts(t)) { const k = p.category_id || 'none'; out[k] = round2((out[k] || 0) + sign * p.amount); }
  }
  return out;
}

export const monthRange = (month) => {
  const [y, m] = month.split('-').map(Number);
  return [`${month}-01`, iso(new Date(y, m, 0))];
};
export const monthOf = (d = new Date()) => iso(d).slice(0, 7);
export const prevMonth = (month, back = 1) => { const [y, m] = month.split('-').map(Number); return monthOf(new Date(y, m - 1 - back, 1)); };

// Budgets for one month: each category with a limit, what it cost, and how far through the month you are.
// budgets: { [category_id]: monthly limit }. -> [{ category_id, name, limit, spent, left, pct, pace, over }] (most used first)
export function budgetMonth(transactions, budgets, categories, month, today = new Date()) {
  const [from, to] = monthRange(month);
  const spent = spentByCategory(transactions, from, to);
  const t = iso(today);
  const [, , lastDay] = to.split('-').map(Number);
  const dayOf = t < from ? 0 : t > to ? lastDay : Number(t.slice(8, 10));
  const pace = dayOf / lastDay; // share of the month gone
  const out = [];
  for (const [id, raw] of Object.entries(budgets || {})) {
    const limit = Number(raw) || 0;
    if (limit <= 0) continue;
    const s = Math.max(0, spent[String(id)] || 0);
    const cat = (categories || []).find((c) => String(c.id) === String(id));
    out.push({ category_id: String(id), name: cat ? cat.name : 'Deleted category', limit, spent: s, left: round2(limit - s), pct: s / limit, pace, over: s > limit, ahead: s / limit > pace + 0.1 && s <= limit });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

// ---------- bills that repeat ----------
const FREQS = [
  { frequency: 'weekly', days: 7, slack: 2 },
  { frequency: 'biweekly', days: 14, slack: 3 },
  { frequency: 'monthly', days: 30.4, slack: 5 },
  { frequency: 'quarterly', days: 91, slack: 10 },
  { frequency: 'yearly', days: 365, slack: 20 },
];
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

// The day after `date` that a bill with this frequency falls on.
export function nextBillDate(date, frequency) {
  const d = parse(date);
  if (!d) return null;
  const day = d.getDate();
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[frequency];
  if (months) {
    const n = new Date(d.getFullYear(), d.getMonth() + months, 1);
    n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
    return iso(n);
  }
  d.setDate(d.getDate() + (frequency === 'weekly' ? 7 : 14));
  return iso(d);
}
// The first due day on or after today, stepping from a known date.
export function rollForward(date, frequency, today = new Date()) {
  let d = String(date || '').slice(0, 10);
  const t = iso(today);
  for (let i = 0; d && d < t && i < 600; i++) d = nextBillDate(d, frequency);
  return d;
}

// Purchases from the same merchant at a steady interval with steady amounts: at least 3 times (2 for yearly),
// the gaps within a few days of one frequency, every amount within 15% of the usual one, and the last one recent enough
// that the next has not been missed twice. bills: ones already tracked or turned down (same merchant key), left out.
// -> [{ key, name, amount, frequency, next_date, count, last_date, category_id, category_name, payment_method, payment_method_id, payment_method_name }]
export function findRecurring(transactions, bills = [], today = new Date()) {
  const known = new Set((bills || []).map((b) => b.key));
  const groups = new Map();
  for (const t of transactions || []) {
    if (!live(t) || t.type !== 'expense' || !t.description) continue;
    const k = mkey(t.description);
    if (k.length < 3 || known.has(k)) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = [];
  const t0 = today.getTime();
  for (const [key, list] of groups) {
    // one per day (a split or a duplicate on the same day is one bill)
    const byDay = new Map();
    for (const t of list) { const d = String(t.date).slice(0, 10); if (!byDay.has(d)) byDay.set(d, t); }
    const rows = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, t]) => ({ d, t, at: parse(d).getTime(), amount: Number(t.amount) || 0 }));
    if (rows.length < 2) continue;
    const gaps = rows.slice(1).map((r, i) => (r.at - rows[i].at) / 864e5);
    const g = median(gaps);
    const f = FREQS.find((x) => Math.abs(g - x.days) <= x.slack);
    if (!f || rows.length < (f.frequency === 'yearly' ? 2 : 3)) continue;
    if (gaps.some((x) => Math.abs(x - f.days) > f.slack * 2)) continue;
    const usual = median(rows.map((r) => r.amount));
    // Steady amounts: every one within 15% of the usual amount, except that the latest may differ (a price change).
    const off = rows.map((r) => Math.abs(r.amount - usual) > usual * 0.15);
    if (!(usual > 0) || off.slice(0, -1).some(Boolean)) continue;
    const last = rows[rows.length - 1];
    if ((t0 - last.at) / 864e5 > f.days * 2 + f.slack) continue; // stopped
    const lt = last.t;
    out.push({ key, name: lt.description, amount: round2(last.amount), frequency: f.frequency, next_date: rollForward(nextBillDate(last.d, f.frequency), f.frequency, today),
      count: rows.length, last_date: last.d, category_id: lt.category_id || null, category_name: lt.category_name || null,
      payment_method: lt.payment_method || null, payment_method_id: lt.payment_method_id || null, payment_method_name: lt.payment_method_name || null });
  }
  return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Whether a tracked bill's due day already has its purchase recorded (same merchant, within a few days, amount within 15%).
export function billPaid(bill, transactions, date) {
  const at = parse(date);
  if (!at) return null;
  return (transactions || []).find((t) => live(t) && t.type === 'expense' && mkey(t.description) === bill.key
    && Math.abs((parse(t.date) - at) / 864e5) <= 4 && Math.abs((Number(t.amount) || 0) - Number(bill.amount)) <= Number(bill.amount) * 0.15) || null;
}
