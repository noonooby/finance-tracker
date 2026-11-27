import { nextBillDate, billPaid, dayOfMonth, nextDue, dueDatesBetween } from './spending';
import { keptTotal, accountTerms, lineTerms } from './accounts';
// Money arithmetic that does not change anything: interest, amortization, how current each figure is, and where you stand.
// Pure functions, so the screens and the scenario tests use the same rules.

// A balance older than this many days is marked out of date (the Telegram bot uses the same 35 days).
export const STALE_DAYS = 35;

export const PAYMENTS_PER_YEAR = { weekly: 52, biweekly: 26, accelerated_biweekly: 26, semimonthly: 24, monthly: 12, bimonthly: 6, quarterly: 4, yearly: 1 };

const round2 = (n) => Math.round(n * 100) / 100;
const dayMs = 864e5;
const parse = (d) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Canadian fixed mortgages compound twice a year; most other loans and lines compound monthly.
function defaultCompounding(loan) {
  return loan && (loan.loan_type === 'mortgage' || loan.is_mortgage) ? 'semiannual' : 'monthly';
}

// The yearly rate actually paid, from the quoted yearly rate (percent) and how often interest is added.
function effectiveAnnualRate(ratePercent, compounding = 'monthly') {
  const r = Number(ratePercent) / 100;
  if (!(r > 0)) return 0;
  const n = { annual: 1, semiannual: 2, quarterly: 4, monthly: 12, daily: 365 }[compounding] || 12;
  return Math.pow(1 + r / n, n) - 1;
}

// Interest for one payment period, as a fraction of the balance.
export function periodicRate(loan) {
  const ear = effectiveAnnualRate(loan && loan.interest_rate, (loan && loan.compounding) || defaultCompounding(loan));
  if (!ear) return 0;
  const n = PAYMENTS_PER_YEAR[(loan && loan.frequency) || 'monthly'] || 12;
  return Math.pow(1 + ear, 1 / n) - 1;
}

// How many days one payment period lasts.
export const periodDays = (loan) => Math.round(365 / (PAYMENTS_PER_YEAR[(loan && loan.frequency) || 'monthly'] || 12));

// One payment split into interest and principal, from the balance before it.
function splitPayment(balance, payment, rate) {
  const interest = Math.min(round2(payment), Math.max(0, round2(Number(balance) * rate)));
  return { interest, principal: round2(payment - interest) };
}

// The payments ahead until the loan is paid off (at most 50 years of payments).
// -> { rows: [{ n, date, payment, interest, principal, balance }], payoffDate, totalInterest, neverPaysOff }
export function amortize(loan, { from } = {}) {
  let bal = round2(Number(loan.balance) || 0);
  const pay = round2(Number(loan.payment_amount) || 0);
  const rate = periodicRate(loan);
  const freq = loan.frequency || 'monthly';
  const n = PAYMENTS_PER_YEAR[freq] || 12;
  let date = parse(loan.next_payment_date || from) || new Date();
  const anchor = date.getDate();
  const step = (d) => {
    if (n === 52) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    if (n === 26) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14);
    if (n === 24) return parse(nextDue(iso(d), 'semimonthly', anchor));
    const months = 12 / n;
    const last = new Date(d.getFullYear(), d.getMonth() + months + 1, 0).getDate();
    return new Date(d.getFullYear(), d.getMonth() + months, Math.min(anchor, last));
  };
  const rows = [];
  let totalInterest = 0;
  if (!(pay > 0) || bal <= 0) return { rows, payoffDate: bal <= 0 ? iso(date) : null, totalInterest: 0, neverPaysOff: bal > 0 };
  if (round2(bal * rate) >= pay) return { rows, payoffDate: null, totalInterest: null, neverPaysOff: true };
  for (let i = 1; bal > 0 && i <= n * 50; i++) {
    const { interest } = splitPayment(bal, pay, rate);
    const payment = Math.min(pay, round2(bal + interest));
    const principal = round2(payment - interest);
    bal = round2(bal - principal);
    totalInterest = round2(totalInterest + interest);
    rows.push({ n: i, date: iso(date), payment, interest, principal, balance: bal });
    if (bal > 0) date = step(date);
  }
  return { rows, payoffDate: rows.length ? rows[rows.length - 1].date : null, totalInterest, neverPaysOff: bal > 0 };
}

// How current a figure is: { days, stale, label }
export function freshness(asOf, today = new Date()) {
  const d = parse(asOf);
  if (!d) return { days: null, stale: true, label: 'No date' };
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((t - d) / dayMs);
  const label = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 60 ? `${days} days ago` : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  return { days, stale: days > STALE_DAYS, label };
}

// Where you stand today: what you have, what you owe, net worth, and which figures are out of date.
// The mortgage is counted in net worth but shown apart from other debt (as the Telegram bot does).
export function position({ bankAccounts = [], creditCards = [], loans = [], investments = [], assets = [] }, today = new Date()) {
  const line = (kind, row, value) => ({ kind, id: row.id, name: row.name, value: round2(value), asOf: row.balance_as_of || null, ...freshness(row.balance_as_of, today) });
  const have = [], owe = [];
  for (const a of bankAccounts) {
    const v = Number(a.balance) || 0;
    (v >= 0 ? have : owe).push(line(a.account_type === 'cash' ? 'cash' : 'bank', a, Math.abs(v)));
  }
  for (const c of creditCards) {
    const v = Number(c.balance) || 0;
    if (c.is_gift_card) { if (v) have.push(line('gift_card', c, v)); continue; }
    if (v > 0) owe.push(line('card', c, v)); else if (v < 0) have.push(line('card_credit', c, -v));
  }
  for (const i of investments) have.push(line('investment', i, Number(i.balance) || 0));
  for (const a of assets) have.push(line('asset', a, Number(a.balance) || 0));
  for (const l of loans) {
    const v = Number(l.balance) || 0;
    // A plan inside a credit card is already counted in that card's balance.
    if (l.on_card_id) continue;
    if (v > 0) owe.push(line(l.loan_type === 'mortgage' ? 'mortgage' : 'loan', l, v));
  }
  const sum = (xs) => round2(xs.reduce((s, x) => s + x.value, 0));
  const totalHave = sum(have), totalOwe = sum(owe);
  const mortgage = sum(owe.filter((x) => x.kind === 'mortgage'));
  // Money kept in an account so its monthly fee is not charged is yours, but not there to spend.
  const kept = keptTotal(bankAccounts);
  const liquid = sum(have.filter((x) => x.kind === 'bank' || x.kind === 'cash')) - sum(owe.filter((x) => x.kind === 'bank')) - kept;
  const all = [...have, ...owe];
  return {
    have, owe, totalHave, totalOwe, netWorth: round2(totalHave - totalOwe),
    mortgage, debtExcludingMortgage: round2(totalOwe - mortgage),
    investments: sum(have.filter((x) => x.kind === 'investment')),
    liquid: round2(liquid), kept,
    stale: all.filter((x) => x.stale && x.value),
    upToDate: all.every((x) => !x.stale || !x.value),
  };
}

// What a card's next payment takes. A card that pays itself takes what its automatic payment is set to (the whole
// balance unless set to the minimum or a fixed amount); one you pay yourself is counted at its minimum.
function cardPaymentDue(c) {
  const bal = Number(c.balance) || 0;
  if (bal <= 0) return 0;
  const min = Number(c.minimum_payment || c.payment_amount) || 0;
  if (!c.connected_payment_source) return Math.min(bal, min || bal);
  const mode = c.autopay_mode || 'statement';
  if (mode === 'fixed') return Math.min(bal, Number(c.autopay_fixed) || bal);
  if (mode === 'minimum') return Math.min(bal, min || Math.max(10, round2(bal * 0.03)));
  return bal;
}

// The month ahead, as the bot works it out: money you can spend now, plus pay due before the end of the month,
// minus scheduled loan and card payments due before then, and tracked bills paid from a bank account that are not recorded yet
// (a bill on a card is counted when the card is paid).
export function monthEnd({ liquid, incomeSchedules = [], loans = [], creditCards = [], bills = [], transactions = [] }, today = new Date()) {
  const end = iso(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const t = iso(today);
  const due = (d) => d && d >= t && d <= end;
  // Pay and loan payments that repeat inside the month count each time they fall (weekly pay comes four times, not once).
  const times = (next, frequency, start) => dueDatesBetween(next, frequency || 'monthly', dayOfMonth(start) || dayOfMonth(next), t, end);
  const coming = incomeSchedules.filter((s) => s.is_active !== false).reduce((sum, x) => {
    let dates = times(x.next_date, x.frequency, x.start_date);
    if (x.recurring_duration_type === 'until_date' && x.recurring_until_date) dates = dates.filter((d) => d <= String(x.recurring_until_date).slice(0, 10));
    if (x.recurring_duration_type === 'occurrences' && x.recurring_occurrences_total) dates = dates.slice(0, Math.max(0, x.recurring_occurrences_total - (x.recurring_occurrences_completed || 0)));
    return sum + dates.length * (Number(x.amount) || 0);
  }, 0);
  const going = loans.filter((l) => !l.on_card_id).reduce((sum, l) => {
    // Never more than is still owed (when the balance is known).
    let left = l.balance == null ? Infinity : Math.max(0, Number(l.balance) || 0);
    for (let i = times(l.next_payment_date, l.frequency, l.start_date).length; i > 0 && left > 0; i--) {
      const pay = Math.min(Number(l.payment_amount) || 0, left);
      sum += pay; left -= pay;
    }
    return sum;
  }, 0)
    + creditCards.filter((c) => !c.is_gift_card && Number(c.balance) > 0 && due(String(c.due_date || '').slice(0, 10))).reduce((s, c) => s + cardPaymentDue(c), 0)
    + billDates(bills, transactions, today, end).filter((x) => !x.paid && x.bill.payment_method !== 'credit_card').reduce((s, x) => s + (Number(x.bill.amount) || 0), 0);
  return { end, now: round2(liquid), coming: round2(coming), going: round2(going), atEnd: round2(liquid + coming - going) };
}

// The month-end figure for the app's loaded data. Every screen that shows it uses this, so they always agree.
export const monthEndFor = (d, liquid, today = new Date()) =>
  monthEnd({ liquid, incomeSchedules: d.incomeSchedules, loans: d.loans, creditCards: d.creditCards, bills: d.bills, transactions: d.transactions }, today);

// The rate a card charges today: a promo rate while it lasts, otherwise the purchase rate.
export function cardRate(card, today = new Date()) {
  const t = iso(today);
  if (card.promo_rate != null && card.promo_rate !== '' && (!card.promo_end || card.promo_end >= t)) return Number(card.promo_rate) || 0;
  return Number(card.interest_rate) || 0;
}

// What a card's balance is made of: each payment plan inside it (a loan with on_card_id) and the rest, which is the
// part that is charged the card's rate when carried. over: the plans add up to more than the card shows, so one of
// the figures is out of date.
export function cardSplit(card, loans = []) {
  const bal = Math.max(0, Number(card && card.balance) || 0);
  const plans = loans.filter((l) => card && l.on_card_id != null && l.on_card_id !== '' && String(l.on_card_id) === String(card.id) && Number(l.balance) > 0)
    .map((l) => ({ id: l.id, name: l.name, balance: round2(Number(l.balance)), payment: round2((Number(l.payment_amount) || 0) * (PAYMENTS_PER_YEAR[l.frequency || 'monthly'] || 12) / 12), rate: Number(l.interest_rate) || 0, next: l.next_payment_date ? String(l.next_payment_date).slice(0, 10) : null }));
  const inPlans = round2(plans.reduce((s, p) => s + p.balance, 0));
  return { plans, inPlans, rest: round2(Math.max(0, bal - inPlans)), over: inPlans > bal ? round2(inPlans - bal) : 0, payments: round2(plans.reduce((s, p) => s + p.payment, 0)) };
}

// What carrying your debt costs in a month, line by line, roughly: card interest (none when autopay pays the full balance),
// loan interest, overdraft interest and fees, and annual fees spread over the year.
export function monthlyCost({ creditCards = [], loans = [], bankAccounts = [] }, today = new Date()) {
  const items = [];
  const add = (name, amount, why) => { const a = round2(amount); if (a > 0) items.push({ name, amount: a, why }); };
  for (const c of creditCards) {
    if (c.is_gift_card) continue;
    const bal = Number(c.balance) || 0;
    const revolving = bal > 0 ? cardSplit(c, loans).rest : 0;
    const paidInFull = c.connected_payment_source && (c.autopay_mode || 'statement') === 'statement';
    if (revolving > 0 && !paidInFull) add(c.name, revolving * cardRate(c, today) / 100 / 12, `interest at ${cardRate(c, today)}% if the balance is carried`);
    if (Number(c.annual_fee) > 0) add(c.name, Number(c.annual_fee) / 12, 'annual fee, per month');
  }
  for (const l of loans) {
    const bal = Number(l.balance) || 0;
    if (bal <= 0) continue;
    const n = PAYMENTS_PER_YEAR[l.frequency || 'monthly'] || 12;
    // A line of credit with no rate of its own follows prime (see accounts.js).
    const line = !(Number(l.interest_rate) > 0) && lineTerms(l);
    if (line && line.rate != null) add(l.name, line.month, `interest at about ${line.rate}%, ${line.rate_from}`);
    else add(l.name, bal * periodicRate(l) * n / 12, Number(l.interest_rate) > 0 ? `interest at ${l.interest_rate}%` : 'no interest');
  }
  for (const a of bankAccounts) {
    const bal = Number(a.balance) || 0;
    if (bal >= 0 || !a.allows_overdraft) continue;
    const t = accountTerms(a);
    add(a.name, (-bal) * (t.overdraftRate || 0) / 100 / 12 + (t.overdraftFee || 0), t.overdraftFee ? 'overdraft interest and monthly fee' : `overdraft interest${t.overdraftRate ? ` at ${t.overdraftRate}%` : ''}, no fee for the protection`);
  }
  items.sort((x, y) => y.amount - x.amount);
  return { total: round2(items.reduce((s, x) => s + x.amount, 0)), items };
}

// Everything due in the next `days` days, soonest first, and whether it pays itself or you pay it.
// -> [{ date, name, amount, kind: 'card'|'loan'|'plan'|'bill'|'promo_end', auto, from, note, cash }]  cash: it takes money out of an account
export function upcoming({ creditCards = [], loans = [], bankAccounts = [], bills = [], transactions = [] }, today = new Date(), days = 30) {
  const t = iso(today), end = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));
  const inWindow = (d) => d && d >= t && d <= end;
  const late = (d) => d && d < t;
  const nameOf = (src, id) => ((bankAccounts.find((b) => String(b.id) === String(id)) || {}).name || 'an account');
  const out = [];
  for (const c of creditCards) {
    if (c.is_gift_card) continue;
    const bal = Number(c.balance) || 0;
    const d = c.due_date && String(c.due_date).slice(0, 10);
    if (bal > 0 && (inWindow(d) || late(d))) {
      const mode = c.autopay_mode || 'statement';
      const min = Number(c.minimum_payment) || Math.min(bal, Math.max(10, round2(bal * 0.03)));
      // The statement for this due day, when it is known: that is what is asked for, and it leaves out what was charged since.
      const onStatement = c.statement_due && String(c.statement_due).slice(0, 10) === d;
      const stated = onStatement && c.statement_balance != null && c.statement_balance !== '' ? Math.min(bal, Number(c.statement_balance) || 0) : null;
      const amount = mode === 'fixed' ? Math.min(bal, Number(c.autopay_fixed) || bal) : mode === 'minimum' ? min : stated != null ? stated : bal;
      out.push({ date: d, name: c.name, amount: round2(amount), kind: 'card', cash: true, auto: !!c.connected_payment_source, from: c.connected_payment_source ? nameOf(c.connected_payment_source, c.connected_payment_source_id) : null,
        note: late(d) ? 'past due' : stated != null && mode === 'statement' ? `statement balance · minimum ${round2(Math.min(min, stated))}` : onStatement && mode === 'statement' ? 'statement not out yet · this is the whole balance'
          : !c.connected_payment_source ? `minimum ${round2(min)}` : mode === 'minimum' ? 'autopay pays the minimum; interest applies on the rest' : null });
    }
    if (c.promo_end && inWindow(c.promo_end) && c.promo_rate != null && c.promo_rate !== '') {
      out.push({ date: c.promo_end, name: c.name, amount: null, kind: 'promo_end', auto: false, note: `promo rate of ${c.promo_rate}% ends; then ${Number(c.interest_rate) || 0}%` });
    }
  }
  for (const l of loans) {
    let left = Number(l.balance) || 0;
    const first = l.next_payment_date && String(l.next_payment_date).slice(0, 10);
    if (left <= 0 || !(inWindow(first) || late(first))) continue;
    const card = l.on_card_id && creditCards.find((c) => String(c.id) === String(l.on_card_id));
    // Every payment that falls in the window (a weekly loan has four or five), never more than is still owed.
    for (const d of dueDatesBetween(first, l.frequency || 'monthly', dayOfMonth(l.start_date) || dayOfMonth(first), late(first) ? first : t, end)) {
      if (left <= 0) break;
      const amount = Math.min(left, Number(l.payment_amount) || left);
      left = round2(left - amount);
      if (l.on_card_id) {
        out.push({ date: d, name: l.name, amount: round2(amount), kind: 'plan', cash: false, auto: true, from: card ? card.name : 'the card', note: 'installment billed on the card' });
      } else {
        out.push({ date: d, name: l.name, amount: round2(amount), kind: 'loan', cash: l.connected_payment_source !== 'credit_card', auto: !!l.connected_payment_source,
          from: l.connected_payment_source ? nameOf(l.connected_payment_source, l.connected_payment_source_id) : null, note: late(d) ? 'past due' : null });
      }
    }
  }
  for (const { bill: b, date, paid } of billDates(bills, transactions, today, end)) {
    // A bill charged to a card is paid when the card is paid, so it is not another payment you make.
    const onCard = b.payment_method === 'credit_card';
    out.push({ date, name: b.name, amount: round2(Number(b.amount) || 0), kind: 'bill', cash: !paid && !onCard, auto: !!paid || onCard, paid: !!paid, from: b.payment_method_name || null,
      note: paid ? 'recorded' : onCard ? `charged to the card, repeats ${b.frequency}` : `repeats ${b.frequency}` });
  }
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// Each due day of the tracked bills from today to `end`, and whether its purchase is already recorded.
export function billDates(bills, transactions, today, end) {
  const t = iso(today), out = [];
  for (const b of bills || []) {
    if (b.status !== 'active' || !b.next_date) continue;
    // the last due day before today counts when it is not recorded yet (it may be a day or two late)
    let d = String(b.next_date).slice(0, 10), prev = null;
    const anchor = dayOfMonth(d);
    for (let i = 0; d < t && i < 600; i++) { prev = d; d = nextBillDate(d, b.frequency, anchor); }
    if (prev && (today - parse(prev)) / dayMs <= 3 && !billPaid(b, transactions, prev)) out.push({ bill: b, date: prev, paid: null });
    for (let i = 0; d && d <= end && i < 60; i++) { out.push({ bill: b, date: d, paid: billPaid(b, transactions, d) }); d = nextBillDate(d, b.frequency, anchor); }
  }
  return out;
}
