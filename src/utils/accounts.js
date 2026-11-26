// What the app knows about bank account packages and lines of credit before you tell it anything: the monthly fee,
// the balance that has to stay in the account for the fee not to be charged, whether overdraft protection is
// included, and how a line of credit works. It is part of the app, so it is there after a fresh start.
// A figure you set on an account or a loan yourself always comes first.
import { plainName } from './merchants';

export const CHECKED = '2026-11-26';
// The prime rate the big banks use, which lines of credit follow.
export const PRIME = { rate: 4.7, as_of: '2026-10-29' };

// match: words that must all be in the account's name or bank.  fee: a month.  min: the daily balance that waives it.
// overdraft: fee a month for the protection (0 when the package includes it) and the yearly rate on what is overdrawn.
const PACKAGES = [
  { id: 'scotia_ultimate', label: 'Scotiabank Ultimate Package', match: [['ultimate', 'package'], ['scotia', 'ultimate']], fee: 30.95, min: 6000, overdraft: { fee: 0, rate: 21 },
    note: 'The monthly fee is not charged when at least $6,000 stays in the account every day of the month. Overdraft protection is included at no fee; interest is still charged on what is overdrawn.' },
  { id: 'scotia_preferred', label: 'Scotiabank Preferred Package', match: [['preferred', 'package'], ['scotia', 'preferred']], fee: 16.95, min: 4000, overdraft: { fee: 5, rate: 21 },
    note: 'The monthly fee is not charged when at least $4,000 stays in the account every day of the month.' },
  { id: 'bmo_premium', label: 'BMO Premium Plan', match: [['bmo', 'premium']], fee: 30.95, min: 6000, overdraft: { fee: 0, rate: 21 },
    note: 'The monthly fee is not charged when at least $6,000 stays in the account every day of the month.' },
  { id: 'bmo_performance', label: 'BMO Performance Plan', match: [['bmo', 'performance']], fee: 17.95, min: 4000, overdraft: { fee: 5, rate: 21 },
    note: 'The monthly fee is not charged when at least $4,000 stays in the account every day of the month.' },
  { id: 'td_all_inclusive', label: 'TD All-Inclusive Banking Plan', match: [['all', 'inclusive']], fee: 29.95, min: 5000, overdraft: { fee: 0, rate: 21 },
    note: 'The monthly fee is not charged when at least $5,000 stays in the account every day of the month.' },
  { id: 'td_unlimited', label: 'TD Unlimited Chequing Account', match: [['td', 'unlimited']], fee: 17.95, min: 4000, overdraft: { fee: 5, rate: 21 },
    note: 'The monthly fee is not charged when at least $4,000 stays in the account every day of the month.' },
  { id: 'cibc_smart_plus', label: 'CIBC Smart Plus Account', match: [['smart', 'plus']], fee: 29.95, min: 6000, overdraft: { fee: 0, rate: 21 },
    note: 'The monthly fee is not charged when at least $6,000 stays in the account every day of the month.' },
];
const words = (s) => new Set(plainName(s).split(' ').filter(Boolean));
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const round2 = (n) => Math.round(Number(n) * 100) / 100;

export function accountPackage(account) {
  if (!account || account.account_type === 'cash') return null;
  const have = words(`${account.name || ''} ${account.institution || ''}`);
  return PACKAGES.find((p) => p.match.some((all) => all.every((w) => have.has(w)))) || null;
}

// What an account costs and what it asks for: your own figures first, then the known package.
// -> { fee, min, overdraftFee, overdraftRate, pkg, yours: true when any figure is your own }
export function accountTerms(account) {
  const p = accountPackage(account), a = account || {};
  // A zero on the account is an empty field, not a figure of yours.
  const own = (v, known) => (num(v) > 0 ? num(v) : known == null ? null : known);
  return {
    pkg: p, fee: own(a.account_monthly_fee, p && p.fee), min: own(a.fee_waiver_min, p && p.min),
    overdraftFee: own(a.overdraft_monthly_fee, p && p.overdraft && p.overdraft.fee), overdraftRate: own(a.overdraft_rate, p && p.overdraft && p.overdraft.rate),
    yours: [a.account_monthly_fee, a.fee_waiver_min, a.overdraft_monthly_fee, a.overdraft_rate].some((v) => num(v) > 0),
  };
}

// Money that sits in an account only so its monthly fee is not charged. It is yours and counts in what you have,
// but spending it brings the fee back, so it is left out of what you can spend. Switch it off on the account
// (keep_minimum false) when you would rather pay the fee.
// -> { kept, usable, short (how far below the minimum, when the fee will be charged), fee, min }
export function keptIn(account) {
  const t = accountTerms(account), bal = Number(account && account.balance) || 0;
  const on = t.min > 0 && t.fee > 0 && account.keep_minimum !== false;
  const kept = on && bal >= t.min ? t.min : 0;
  return { kept: round2(kept), usable: round2(bal - kept), short: on && bal < t.min ? round2(t.min - bal) : 0, fee: t.fee || 0, min: t.min || 0, on };
}
export const keptTotal = (bankAccounts = []) => round2((bankAccounts || []).reduce((s, a) => s + keptIn(a).kept, 0));

// ---------- lines of credit ----------
// spread: what is added to prime.  share: the part of the investments securing it that can be borrowed.
const LINES = [
  { id: 'wealthsimple_portfolio', label: 'Wealthsimple Portfolio Line of Credit', match: [['portfolio', 'line'], ['wealthsimple', 'line'], ['wealthsimple', 'credit'], ['ploc']], spread: 0.5, share: 0.35, secured: 'investments',
    note: 'Borrowed against your Wealthsimple investments, which stay invested. The limit is up to 35% of the accounts that secure it and moves with their value. The rate follows prime: prime plus 0.5% on Core, prime on Premium, prime less 0.5% on Generation. Interest is charged only on what is used, and there is no fixed payment.' },
  { id: 'heloc', label: 'Home equity line of credit', match: [['home', 'equity'], ['heloc'], ['step']], spread: null, share: null, secured: 'home',
    note: 'Borrowed against your home. The rate follows prime plus a margin set by the lender. Interest is charged only on what is used, and the least you pay each month is the interest.' },
  { id: 'line', label: 'Line of credit', match: [['line', 'of', 'credit'], ['scotialine'], ['credit', 'line']], spread: null, share: null, secured: null,
    note: 'Money you can take and pay back as you like, up to a limit. The rate follows prime plus a margin set for you. Interest is charged only on what is used, and the least you pay each month is usually the interest.' },
];
export const isLine = (loan) => !!loan && (loan.loan_type === 'line_of_credit' || LINES.some((l) => l.match.some((all) => all.every((w) => words(loan.name).has(w)))));
export function knownLine(loan) {
  if (!isLine(loan)) return null;
  const have = words(`${loan.name || ''} ${loan.lender || ''} ${loan.institution || ''}`);
  return LINES.find((l) => l.match.some((all) => all.every((w) => have.has(w)))) || LINES[LINES.length - 1];
}
// A line of credit as it stands: the rate (yours, else prime plus the known margin), the limit (yours, else the known
// share of the investments that secure it), what is used and what is left to take.
// -> { rate, rate_from, limit, limit_from, used, left, note, label } or null when the loan is not a line of credit
export function lineTerms(loan, investments = []) {
  const k = knownLine(loan);
  if (!k) return null;
  const own = num(loan.interest_rate) > 0 ? num(loan.interest_rate) : null;
  const rate = own != null ? own : k.spread != null ? round2(PRIME.rate + k.spread) : null;
  const ids = Array.isArray(loan.secured_by) ? loan.secured_by.map(String) : [];
  const pool = k.secured === 'investments' ? (investments || []).filter((i) => (ids.length ? ids.includes(String(i.id)) : /wealthsimple/i.test(`${i.name || ''} ${i.institution || ''} ${i.provider || ''}`))) : [];
  const ownLimit = num(loan.credit_limit) > 0 ? num(loan.credit_limit) : null;
  const worked = k.share && pool.length ? round2(pool.reduce((s, i) => s + (Number(i.balance) || 0), 0) * k.share) : null;
  const limit = ownLimit != null ? ownLimit : worked, used = round2(Math.max(0, Number(loan.balance) || 0));
  return { label: k.label, note: k.note, rate, rate_from: own != null ? 'set by you' : rate != null ? `prime (${PRIME.rate}%) plus ${k.spread}%` : null,
    limit, limit_from: ownLimit != null ? 'set by you' : worked != null ? `${Math.round(k.share * 100)}% of ${pool.map((i) => i.name).join(', ')}` : null,
    used, left: limit == null ? null : round2(Math.max(0, limit - used)), month: rate != null ? round2(used * rate / 100 / 12) : null };
}
