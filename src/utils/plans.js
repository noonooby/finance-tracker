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

// Charges in the last 14 days worth a second look. -> [{ id, kind, title, text, date, amount }]
//  - unusual: at least twice what you usually pay that merchant (three or more earlier purchases), and at least $20 more
//  - double: the same merchant, amount and account twice on one day
// seen: ids already answered ("Seen"), left out.
export function chargesToCheck(transactions, today = new Date(), seen = []) {
  const done = new Set(seen || []);
  const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const recent = (t) => { const d = parse(t.date); return d && (day0 - d) / 864e5 <= 14 && d <= day0; };
  const spend = (transactions || []).filter((t) => live(t) && t.type === 'expense' && Number(t.amount) > 0 && mkey(t.description).length >= 3);
  const by = new Map();
  for (const t of spend) { const k = mkey(t.description); if (!by.has(k)) by.set(k, []); by.get(k).push(t); }
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const out = [];
  for (const list of by.values()) {
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    list.forEach((t, i) => {
      if (!recent(t)) return;
      const before = list.slice(0, i).map((x) => Number(x.amount));
      const usual = before.length >= 3 ? median(before) : null;
      const amount = round2(t.amount);
      if (usual && amount >= usual * 2 && amount - usual >= 20) {
        out.push({ id: `unusual:${t.id}`, kind: 'unusual', title: t.description, date: String(t.date).slice(0, 10), amount, usual: round2(usual) });
      }
    });
    const pairs = new Map();
    for (const t of list.filter(recent)) {
      if (Array.isArray(t.splits) && t.splits.length) continue;
      const k = [String(t.date).slice(0, 10), round2(t.amount), t.payment_method_id || ''].join('|');
      if (!pairs.has(k)) pairs.set(k, []);
      pairs.get(k).push(t);
    }
    for (const same of pairs.values()) {
      if (same.length < 2) continue;
      out.push({ id: `double:${same.map((t) => t.id).sort().join('+')}`, kind: 'double', title: same[0].description, date: String(same[0].date).slice(0, 10), amount: round2(same[0].amount), count: same.length });
    }
  }
  return out.filter((x) => !done.has(x.id)).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

// ---------- Card rewards, and payments made through a service that charges a fee ----------
// What a card gives back, in percent: its everyday rate, or its rate on bill payments when it has one.
export const rewardRate = (card, forBills = false) => {
  const bills = card && card.reward_bills_percent;
  return Number(forBills && bills != null && bills !== '' ? bills : card && card.reward_percent) || 0;
};
// A bill or loan payment made through a service such as Chexy: the fee, what the card is charged, and for each card
// what it gives back on that charge and whether you come out ahead (net above zero) or behind.
// -> { fee, charged, options: [{ id, name, rate, reward, net }] best first, best }
export function throughCost(amount, feePercent, cards = []) {
  const a = round2(amount), fee = round2(a * (Number(feePercent) || 0) / 100), charged = round2(a + fee);
  const options = (cards || []).filter((c) => !c.is_gift_card).map((c) => {
    const rate = rewardRate(c, true), reward = round2(charged * rate / 100);
    return { id: c.id, name: c.name, rate, reward, net: round2(reward - fee) };
  }).sort((x, y) => y.net - x.net || String(x.name).localeCompare(String(y.name)));
  return { fee, charged, options, best: options.length && options[0].rate > 0 ? options[0] : null };
}
// About what a card gave back in a month (YYYY-MM): purchases on it less refunds at its everyday rate,
// and loan payments charged to it at its bill-payment rate. An estimate: the card issuer's own count is the real one.
export function rewardsEarned(card, transactions, month) {
  let cents = 0;
  for (const t of transactions || []) {
    if (!live(t) || String(t.date || '').slice(0, 7) !== month) continue;
    if (t.payment_method !== 'credit_card' || String(t.payment_method_id) !== String(card.id)) continue;
    const a = Number(t.amount) || 0;
    if (t.type === 'expense') cents += a * rewardRate(card, !!t.through_fee_for);
    else if (t.type === 'refund') cents -= a * rewardRate(card);
    else if (t.loan_id && (t.type === 'loan_payment' || t.type === 'payment')) cents += a * rewardRate(card, true);
  }
  return round2(cents / 100);
}
