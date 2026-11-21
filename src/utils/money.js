// The one way the app changes a balance.
// Each function builds the balance changes ("legs") and the records for one money event and sends them to the server,
// which saves all of them together or none of them. Undo is reverseTransaction: it puts back exactly what was moved,
// on the same accounts, whatever kind of event it was.
//
// Signs, per balance:
//   bank account  balance = money in the account           (money out: negative)
//   cash in hand  setting cashInHand = money held          (money out: negative)
//   credit card   balance = amount owed                    (purchase: positive, payment: negative)
//   gift card     balance = value left on the card         (purchase with it: negative)
//   loan          balance = amount owed                    (payment: negative)
import { moveMoney, reverseTransaction, api } from './server';
import { periodicRate } from './finance';

export { reverseTransaction };

const round2 = (n) => Math.round(Number(n) * 100) / 100;

export function toAmount(value) {
  const n = round2(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter an amount above zero.');
  return n;
}

// "bank_account:ID" / "credit_card:ID" / "cash_in_hand" / { type, id } -> { type, id }
export function parseSource(source, id) {
  if (source && typeof source === 'object') return { type: source.type, id: source.id };
  const s = String(source || '');
  if (s === 'cash_in_hand' || s === 'cash') return { type: 'cash_in_hand', id: null };
  const i = s.indexOf(':');
  if (i > 0) return { type: s.slice(0, i), id: s.slice(i + 1) };
  return { type: s, id: id ?? null };
}

// The leg that takes `amount` out of a source of money (paying with it).
// accounts = { bankAccounts, creditCards } so the right limit can be checked.
export function payFrom(source, amount, { bankAccounts = [], creditCards = [] } = {}) {
  const { type, id } = parseSource(source);
  if (type === 'cash_in_hand') return { table: 'settings', key: 'cashInHand', delta: -amount, floor: 0 };
  if (type === 'investment') return { table: 'investments', id, delta: -amount, floor: 0 };
  if (type === 'bank_account') {
    const a = bankAccounts.find((x) => String(x.id) === String(id));
    if (!a) throw new Error('That bank account no longer exists.');
    return { table: 'bank_accounts', id: a.id, delta: -amount, floor: a.allows_overdraft ? -(Number(a.overdraft_limit) || 0) : 0 };
  }
  if (type === 'credit_card') {
    const c = creditCards.find((x) => String(x.id) === String(id));
    if (!c) throw new Error('That card no longer exists.');
    if (c.is_gift_card) return { table: 'credit_cards', id: c.id, delta: -amount, floor: 0 };
    return { table: 'credit_cards', id: c.id, delta: amount };
  }
  throw new Error('Choose how it was paid.');
}

// The leg that puts `amount` into a place money can land (income, refund, transfer in).
export function payInto(target, amount, { creditCards = [] } = {}) {
  const { type, id } = parseSource(target);
  if (type === 'cash_in_hand') return { table: 'settings', key: 'cashInHand', delta: amount };
  if (type === 'investment') return { table: 'investments', id, delta: amount };
  if (type === 'bank_account') return { table: 'bank_accounts', id, delta: amount };
  if (type === 'credit_card') {
    const c = creditCards.find((x) => String(x.id) === String(id));
    // A refund to a credit card lowers what is owed; to a gift card it adds value.
    return { table: 'credit_cards', id, delta: c && c.is_gift_card ? amount : -amount };
  }
  throw new Error('Choose where the money goes.');
}

const sourceName = (source, { bankAccounts = [], creditCards = [], investments = [] }) => {
  const { type, id } = parseSource(source);
  if (type === 'cash_in_hand') return 'Cash in hand';
  const list = type === 'bank_account' ? bankAccounts : type === 'investment' ? investments : creditCards;
  return (list.find((x) => String(x.id) === String(id)) || {}).name || null;
};

function txRow(base, source, accounts) {
  const { type, id } = parseSource(source);
  return {
    status: 'active',
    undone_at: null,
    payment_method: type,
    payment_method_id: id,
    payment_method_name: sourceName(source, accounts),
    card_id: type === 'credit_card' ? id : null,
    ...base,
  };
}

let pendingReplace = null;
const send = (key, legs, rows, extra = {}) =>
  moveMoney({ key, legs, rows, ...(pendingReplace ? { replace: [pendingReplace] } : {}), ...extra }).then((r) => ({ ...r, transaction: (r.rows || []).find((x) => x.type) || (r.rows || [])[0] || null }));

// updates: [{ table, id, values }] plain row changes the server saves in the same step (e.g. moving a schedule's next date).
const withUpdates = (updates) => (updates && updates.length ? { updates } : {});

// A purchase or bill paid from one source.
export async function recordExpense({ amount, source, date, description, notes, category_id, category_name, key, extra }, accounts) {
  const a = toAmount(amount);
  return send(key, [payFrom(source, a, accounts)], [
    { table: 'transactions', values: txRow({ type: 'expense', amount: a, date, description, notes, category_id, category_name, ...extra }, source, accounts) },
  ]);
}

// Money received into a bank account or cash. incomeRow (optional) is the matching row in the income table.
export async function recordIncome({ amount, target, date, description, source_name, notes, key, incomeRow, extra, updates }, accounts) {
  const a = toAmount(amount);
  const rows = [];
  if (incomeRow) rows.push({ table: 'income', values: { amount: a, date, source: source_name || description, ...incomeRow } });
  rows.push({ table: 'transactions', values: txRow({ type: 'income', amount: a, date, description: description || source_name, notes, ...extra }, target, accounts) });
  return send(key, [payInto(target, a, accounts)], rows, withUpdates(updates));
}

// A refund of an earlier purchase: money comes back to where it was paid from.
export async function recordRefund({ amount, target, date, description, key, extra }, accounts) {
  const a = toAmount(amount);
  return send(key, [payInto(target, a, accounts)], [
    { table: 'transactions', values: txRow({ type: 'refund', amount: a, date, description, ...extra }, target, accounts) },
  ]);
}

// Paying a credit card from a bank account or cash. Overpaying leaves a credit on the card.
export async function recordCardPayment({ cardId, amount, source, date, description, key, paymentRow, extra, updates }, accounts) {
  const a = toAmount(amount);
  const card = (accounts.creditCards || []).find((c) => String(c.id) === String(cardId));
  if (!card) throw new Error('That card no longer exists.');
  const rows = [];
  if (paymentRow) rows.push({ table: 'credit_card_payments', values: { card_id: card.id, amount: a, payment_date: date, ...paymentRow } });
  rows.push({ table: 'transactions', values: txRow({ type: 'credit_card_payment', amount: a, date, description: description || `Payment to ${card.name}`, ...extra, card_id: card.id }, source, accounts) });
  return send(key, [payFrom(source, a, accounts), { table: 'credit_cards', id: card.id, delta: -a }], rows, withUpdates(updates));
}

// Paying a loan. A payment larger than what is owed is refused.
export async function recordLoanPayment({ loanId, amount, source, date, description, key, paymentRow, extra, updates }, accounts) {
  const a = toAmount(amount);
  const loan = (accounts.loans || []).find((l) => String(l.id) === String(loanId));
  if (!loan) throw new Error('That loan no longer exists.');
  const rows = [];
  if (paymentRow) rows.push({ table: 'loan_payments', values: { loan_id: loan.id, amount: a, payment_date: date, ...paymentRow } });
  rows.push({ table: 'transactions', values: txRow({ type: 'loan_payment', amount: a, date, description: description || `Payment to ${loan.name}`, loan_id: loan.id, ...extra }, source, accounts) });
  // With an interest rate on the loan, the server takes the period's interest off first and only the rest lowers the balance.
  const rate = periodicRate(loan);
  const loanLeg = { table: 'loans', id: loan.id, delta: -a, floor: 0, ...(rate > 0 ? { periodic_rate: rate } : {}) };
  return send(key, [payFrom(source, a, accounts), loanLeg], rows, withUpdates(updates));
}

// Moving money between two of your own places (bank to bank, bank to cash, cash to bank).
export async function recordTransfer({ amount, from, to, date, description, key, extra }, accounts) {
  const a = toAmount(amount);
  const f = parseSource(from), t = parseSource(to);
  if (f.type === t.type && String(f.id) === String(t.id)) throw new Error('Choose two different accounts.');
  return send(key, [payFrom(from, a, accounts), payInto(to, a, accounts)], [
    { table: 'transactions', values: txRow({ type: 'transfer', amount: a, date, description: description || `Transfer to ${sourceName(to, accounts) || 'account'}`,
      from_account_id: f.id, to_account_id: t.id, transfer_to: t.type, ...extra }, from, accounts) },
  ]);
}

// Buying a gift card: money leaves the source and the gift card gains value.
export async function recordGiftCardPurchase({ giftCardId, amount, cost, source, date, description, key, extra }, accounts) {
  const value = toAmount(amount), paid = toAmount(cost ?? amount);
  return send(key, [payFrom(source, paid, accounts), { table: 'credit_cards', id: giftCardId, delta: value }], [
    { table: 'transactions', values: txRow({ type: 'expense', amount: paid, date, description: description || 'Gift card purchase', gift_card_id: giftCardId, ...extra }, source, accounts) },
  ]);
}

// Stating what a balance really is (counting the cash, reading the bank app). Recorded as an adjustment so it can be undone.
export async function recordAdjustment({ target, newBalance, current, date, description, key }, accounts) {
  const delta = round2(Number(newBalance) - Number(current || 0));
  if (!Number.isFinite(delta)) throw new Error('Enter a number.');
  if (!delta) return Promise.resolve({ legs: [], rows: [] });
  const { type, id } = parseSource(target);
  const leg = type === 'cash_in_hand' ? { table: 'settings', key: 'cashInHand', delta }
    : { table: { bank_account: 'bank_accounts', loan: 'loans', investment: 'investments', asset: 'assets' }[type] || 'credit_cards', id, delta };
  return send(key, [leg], [
    { table: 'transactions', values: txRow({ type: 'adjustment', amount: Math.abs(delta), direction: delta > 0 ? 'up' : 'down', date, description: description || 'Balance correction' }, target, accounts) },
  ]);
}

// Changing an existing transaction: the old one is reversed and the new one recorded in the same step,
// so if the new one is refused the old one stays exactly as it was.
// Usage: replaceTransaction(old.id, () => recordExpense({...}, accounts))
export function replaceTransaction(oldId, recordNew) {
  pendingReplace = oldId;
  try { return recordNew(); } finally { pendingReplace = null; }
}

// The balance you saw on a day (a screenshot, the bank app, counting cash). The server compares it with the app.
// apply: the difference is recorded as an undoable adjustment and the day becomes the account's snapshot date, so lines
// dated before it are kept as history and can't move today's balance again. Without apply a difference stays open to explain.
const SNAP_TABLE = { bank_account: 'bank_accounts', credit_card: 'credit_cards', loan: 'loans', investment: 'investments', asset: 'assets' };
export async function recordSnapshot({ target, value, date, source, apply = true }) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('Enter a number.');
  const { type, id } = parseSource(target);
  const where = type === 'cash_in_hand' ? { table: 'settings', key: 'cashInHand' } : { table: SNAP_TABLE[type], id };
  if (!where.table) throw new Error('That account can not take a balance.');
  return api('/api/snapshot', { ...where, value: Math.round(n * 100) / 100, date, source, apply });
}
export const resolveSnapshot = (id, action) => api(`/api/snapshots/${id}/resolve`, { action });
