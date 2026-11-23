// Savings goals, bill price changes and the credit score log: worked out from what is already recorded. Nothing here moves money.
import { mkey } from './categoryRules';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const parse = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const live = (t) => t && t.status !== 'undone' && t.status !== 'deleted';
const PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 };

// What a bill costs over a year.
export const yearlyCost = (bill) => round2((Number(bill.amount) || 0) * (PER_YEAR[bill.frequency] || 12));

// Where each goal stands. A goal kept in an account counts that account's balance; goals that share an account are
// filled in the order they were made, so the same dollar is never counted twice. A goal with no account uses the
// amount you typed. With a date, `monthly` is what to put aside each month to get there.
// -> [{ ...goal, saved, left, pct, done, monthly, late, missing }]
export function goalsProgress(goals, accounts = {}, today = new Date()) {
  const pool = {};
  const balance = (ref) => {
    const [kind, id] = String(ref).split(':');
    const list = kind === 'investment' ? accounts.investments : accounts.bankAccounts;
    const a = (list || []).find((x) => String(x.id) === String(id));
    return a ? Math.max(0, Number(a.balance) || 0) : null;
  };
  return [...(goals || [])].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))).map((g) => {
    const target = Math.max(0, Number(g.target) || 0);
    let saved = 0, missing = false;
    if (g.kept_in) {
      if (!(g.kept_in in pool)) pool[g.kept_in] = balance(g.kept_in);
      if (pool[g.kept_in] == null) missing = true;
      else { saved = Math.min(target, pool[g.kept_in]); pool[g.kept_in] = round2(pool[g.kept_in] - saved); }
    } else saved = Math.min(target, Math.max(0, Number(g.saved) || 0));
    saved = round2(saved);
    const left = round2(target - saved);
    const by = parse(g.date);
    let monthly = null, late = false;
    if (by && left > 0) {
      const days = (by - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5;
      late = days < 0;
      monthly = round2(left / Math.max(1, Math.round(days / 30.44)));
    }
    return { ...g, target, saved, left, pct: target > 0 ? saved / target : 0, done: target > 0 && left <= 0, monthly, late, missing };
  });
}
// What the goals with a date ask for this month, in total.
export const goalsThisMonth = (progress) => round2((progress || []).reduce((s, g) => s + (g.done ? 0 : g.monthly || 0), 0));

// Tracked bills whose latest charge is not the usual amount (by 2% and at least 50 cents), until you answer it:
// "use the new amount" changes the bill, "keep" remembers the charge so it is not offered again.
// -> [{ bill, was, now, date, up }]
export function priceChanges(bills, transactions) {
  const out = [];
  for (const b of bills || []) {
    if (b.status !== 'active' || !b.key) continue;
    const last = (transactions || []).filter((t) => live(t) && t.type === 'expense' && mkey(t.description) === b.key)
      .sort((x, y) => String(y.date).localeCompare(String(x.date)))[0];
    if (!last) continue;
    const was = round2(b.amount), now = round2(last.amount);
    if (!(now > 0) || Math.abs(now - was) < Math.max(0.5, was * 0.02)) continue;
    if (b.price_seen != null && round2(b.price_seen) === now) continue;
    out.push({ bill: b, was, now, date: String(last.date).slice(0, 10), up: now > was });
  }
  return out;
}

// The latest score from each bureau and how it moved since the one before. -> [{ bureau, score, date, change, count }]
export function scoreSummary(scores) {
  const by = new Map();
  for (const s of scores || []) {
    const k = String(s.bureau || '').trim();
    if (!k) continue;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(s);
  }
  return [...by.entries()].map(([bureau, list]) => {
    list.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return { bureau, score: Number(list[0].score), date: String(list[0].date).slice(0, 10), change: list[1] ? Number(list[0].score) - Number(list[1].score) : null, count: list.length };
  }).sort((a, b) => a.bureau.localeCompare(b.bureau));
}
// The usual bands lenders in Canada use.
export const scoreBand = (n) => (n >= 760 ? 'Excellent' : n >= 725 ? 'Very good' : n >= 660 ? 'Good' : n >= 560 ? 'Fair' : 'Poor');

// What is free at month end once the rest of each budget and this month's goals are allowed for.
// A bill still to come that belongs to a budgeted category is already in the month end, so it is not taken off twice.
// budgets: from budgetMonth; unpaidBills: [{ category_id, amount }] still due this month. -> { free, budgetLeft, goalNeed }
export function freeAtMonthEnd({ atEnd, budgets = [], unpaidBills = [], goalNeed = 0 }) {
  const budgetLeft = round2(budgets.reduce((s, b) => {
    const bills = unpaidBills.filter((x) => x.category_id != null && String(x.category_id) === String(b.category_id)).reduce((t, x) => t + (Number(x.amount) || 0), 0);
    return s + Math.max(0, (Number(b.left) || 0) - bills);
  }, 0));
  return { free: round2((Number(atEnd) || 0) - budgetLeft - (Number(goalNeed) || 0)), budgetLeft, goalNeed: round2(goalNeed) };
}
