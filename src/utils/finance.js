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
export function defaultCompounding(loan) {
  return loan && (loan.loan_type === 'mortgage' || loan.is_mortgage) ? 'semiannual' : 'monthly';
}

// The yearly rate actually paid, from the quoted yearly rate (percent) and how often interest is added.
export function effectiveAnnualRate(ratePercent, compounding = 'monthly') {
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

// One payment split into interest and principal, from the balance before it.
export function splitPayment(balance, payment, rate) {
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
    if (n === 24) return d.getDate() < 15 ? new Date(d.getFullYear(), d.getMonth(), 15) : new Date(d.getFullYear(), d.getMonth() + 1, 1);
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
  const label = days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 60 ? `${days} days ago` : `on ${iso(d)}`;
  return { days, stale: days > STALE_DAYS, label };
}

// Where you stand today: what you have, what you owe, net worth, and which figures are out of date.
// The mortgage is counted in net worth but shown apart from other debt (as the Telegram bot does).
export function position({ bankAccounts = [], cash = 0, cashAsOf = null, creditCards = [], loans = [], investments = [], assets = [] }, today = new Date()) {
  const line = (kind, row, value) => ({ kind, id: row.id, name: row.name, value: round2(value), asOf: row.balance_as_of || null, ...freshness(row.balance_as_of, today) });
  const have = [], owe = [];
  for (const a of bankAccounts) {
    const v = Number(a.balance) || 0;
    (v >= 0 ? have : owe).push(line('bank', a, Math.abs(v)));
  }
  if (Number(cash)) have.push({ kind: 'cash', id: 'cash', name: 'Cash in hand', value: round2(cash), asOf: cashAsOf, ...freshness(cashAsOf, today) });
  for (const c of creditCards) {
    const v = Number(c.balance) || 0;
    if (c.is_gift_card) { if (v) have.push(line('gift_card', c, v)); continue; }
    if (v > 0) owe.push(line('card', c, v)); else if (v < 0) have.push(line('card_credit', c, -v));
  }
  for (const i of investments) have.push(line('investment', i, Number(i.balance) || 0));
  for (const a of assets) have.push(line('asset', a, Number(a.balance) || 0));
  for (const l of loans) {
    const v = Number(l.balance) || 0;
    if (v > 0) owe.push(line(l.loan_type === 'mortgage' ? 'mortgage' : 'loan', l, v));
  }
  const sum = (xs) => round2(xs.reduce((s, x) => s + x.value, 0));
  const totalHave = sum(have), totalOwe = sum(owe);
  const mortgage = sum(owe.filter((x) => x.kind === 'mortgage'));
  const liquid = sum(have.filter((x) => x.kind === 'bank' || x.kind === 'cash')) - sum(owe.filter((x) => x.kind === 'bank'));
  const all = [...have, ...owe];
  return {
    have, owe, totalHave, totalOwe, netWorth: round2(totalHave - totalOwe),
    mortgage, debtExcludingMortgage: round2(totalOwe - mortgage),
    investments: sum(have.filter((x) => x.kind === 'investment')),
    liquid: round2(liquid),
    stale: all.filter((x) => x.stale && x.value),
    upToDate: all.every((x) => !x.stale || !x.value),
  };
}

// The month ahead, as the bot works it out: money you can spend now, plus pay due before the end of the month,
// minus scheduled loan and card payments due before then.
export function monthEnd({ liquid, incomeSchedules = [], loans = [], creditCards = [] }, today = new Date()) {
  const end = iso(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const t = iso(today);
  const due = (d) => d && d >= t && d <= end;
  const coming = incomeSchedules.filter((s) => s.is_active !== false && due(s.next_date)).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const going = loans.filter((l) => due(l.next_payment_date)).reduce((s, l) => s + (Number(l.payment_amount) || 0), 0)
    + creditCards.filter((c) => !c.is_gift_card && Number(c.balance) > 0 && due(c.due_date)).reduce((s, c) => s + (Number(c.minimum_payment || c.payment_amount) || Number(c.balance) || 0), 0);
  return { end, now: round2(liquid), coming: round2(coming), going: round2(going), atEnd: round2(liquid + coming - going) };
}
