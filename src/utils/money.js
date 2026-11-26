// The one way the app changes a balance.
// Each function builds the balance changes ("legs") and the records for one money event and sends them to the server,
// which saves all of them together or none of them. Undo is reverseTransaction: it puts back exactly what was moved,
// on the same accounts, whatever kind of event it was.
//
// Signs, per balance:
//   bank account  balance = money in the account           (money out: negative)
//   cash          a bank account of kind 'cash'; never below zero
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

// "bank_account:ID" / "credit_card:ID" / { type, id } -> { type, id }. Cash is a bank account of kind cash.
export function parseSource(source, id) {
  if (source && typeof source === 'object') return { type: source.type, id: source.id };
  const s = String(source || '');
  if (s === 'cash_in_hand' || s === 'cash') throw new Error('Cash is an account now: choose Cash from the list, or add it under Accounts.');
  const i = s.indexOf(':');
  if (i > 0) return { type: s.slice(0, i), id: s.slice(i + 1) };
  return { type: s, id: id ?? null };
}

// Where a payment comes from, as the forms give it: the kind and the id separately (paymentSource, paymentSourceId),
// or "kind:id" in one. -> { sourceType, sourceId, source, sourceName }
export function paymentSourceOf(formData, { bankAccounts = [], creditCards = [] } = {}) {
  const raw = String(formData.paymentSource || '');
  const [sourceType, inline] = raw.includes(':') ? raw.split(':') : [raw, null];
  const sourceId = inline || (formData.paymentSourceId != null && formData.paymentSourceId !== '' ? String(formData.paymentSourceId) : null);
  const list = sourceType === 'bank_account' ? bankAccounts : sourceType === 'credit_card' ? creditCards : null;
  if (!list || !sourceId) throw new Error('Choose the account it is paid from.');
  const hit = (list || []).find((x) => String(x.id) === sourceId);
  if (!hit) throw new Error(sourceType === 'bank_account' ? 'That bank account no longer exists.' : 'That card no longer exists.');
  return { sourceType, sourceId: hit.id, source: `${sourceType}:${hit.id}`, sourceName: hit.name };
}

// The leg that takes `amount` out of a source of money (paying with it).
// accounts = { bankAccounts, creditCards } so the right limit can be checked.
export function payFrom(source, amount, { bankAccounts = [], creditCards = [] } = {}) {
  const { type, id } = parseSource(source);
  if (type === 'investment') return { table: 'investments', id, delta: -amount, floor: 0 };
  // Money taken from a line of credit: what is owed on it goes up.
  if (type === 'loan') return { table: 'loans', id, delta: amount };
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
  if (type === 'investment') return { table: 'investments', id, delta: amount };
  if (type === 'bank_account') return { table: 'bank_accounts', id, delta: amount };
  if (type === 'credit_card') {
    const c = creditCards.find((x) => String(x.id) === String(id));
    // A refund to a credit card lowers what is owed; to a gift card it adds value.
    return { table: 'credit_cards', id, delta: c && c.is_gift_card ? amount : -amount };
  }
  throw new Error('Choose where the money goes.');
}

// The other side of a payment or transfer when it is an account the app does not hold: only the side the app
// holds changes, and the line still says where the money came from or went.
export const OUTSIDE = 'outside';
const sourceName = (source, { bankAccounts = [], creditCards = [], investments = [], loans = [] }) => {
  const { type, id } = parseSource(source);
  if (type === OUTSIDE) return 'An account not in the app';
  const list = type === 'bank_account' ? bankAccounts : type === 'investment' ? investments : type === 'loan' ? loans : creditCards;
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
// parts (from payParts): the same income landing in more than one account. It stays one line, so one undo puts all of it back.
export async function recordIncome({ amount, target, date, description, source_name, notes, key, incomeRow, extra, updates, parts }, accounts) {
  const a = toAmount(amount);
  const many = Array.isArray(parts) && parts.length > 1;
  if (many && round2(parts.reduce((s, p) => s + p.amount, 0)) !== a) throw new Error('The parts do not add up to the pay.');
  const rows = [];
  if (incomeRow) rows.push({ table: 'income', values: { amount: a, date, source: source_name || description, ...incomeRow } });
  const more = many ? { deposits: parts.map(({ id, name, amount: part }) => ({ account_id: id, name, amount: part })), payment_method_name: parts.map((p) => p.name).join(', ') } : {};
  rows.push({ table: 'transactions', values: { ...txRow({ type: 'income', amount: a, date, description: description || source_name, notes, ...extra }, many ? parts[0].target : target, accounts), ...more } });
  return send(key, many ? parts.map((p) => payInto(p.target, p.amount, accounts)) : [payInto(target, a, accounts)], rows, withUpdates(updates));
}

// Pay that lands in more than one account: fixed amounts go to the others, the rest to the main one.
// splits: [{ account_id, amount }], two at most. A split whose account is gone, is the main one or is named twice is
// left out, so its share stays in the main account.
// -> [{ target, id, name, amount }], the main account first. Throws when the fixed amounts leave nothing for it.
export function payParts(amount, mainId, splits, bankAccounts = []) {
  const total = toAmount(amount);
  const find = (id) => bankAccounts.find((x) => String(x.id) === String(id));
  const main = find(mainId);
  if (!main) throw new Error('Choose the account the income goes into.');
  const seen = new Set([String(main.id)]);
  const others = [];
  for (const sp of (Array.isArray(splits) ? splits : []).slice(0, 2)) {
    const acc = sp && find(sp.account_id);
    const part = round2(sp && sp.amount);
    if (!acc || seen.has(String(acc.id)) || !(part > 0)) continue;
    seen.add(String(acc.id));
    others.push({ target: `bank_account:${acc.id}`, id: acc.id, name: acc.name, amount: part });
  }
  const rest = round2(total - others.reduce((s, p) => s + p.amount, 0));
  if (!(rest > 0)) throw new Error('The amounts sent to other accounts must leave something for the main account.');
  return [{ target: `bank_account:${main.id}`, id: main.id, name: main.name, amount: rest }, ...others];
}

// A payment charged to a card through a service that takes a fee (Chexy and the like): the fee is its own purchase
// on that card, so it counts as spending and can be undone on its own. item: the loan or bill (name, paid_through, fee_percent).
// -> the saved step, or null when no fee applies (no fee set, or not paid by card).
export async function recordThroughFee({ item, amount, source, date, forId, key }, accounts) {
  const pct = Number(item && item.fee_percent) || 0;
  if (!(pct > 0) || parseSource(source).type !== 'credit_card') return null;
  const fee = round2(round2(amount) * pct / 100);
  if (!(fee > 0)) return null;
  const service = String(item.paid_through || '').trim() || 'Service';
  return recordExpense({ amount: fee, source, date, description: `${service} fee for ${item.name}`, category_id: null, category_name: 'Fees', key,
    extra: { through_fee_for: forId || item.id } }, accounts);
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
  if (card.is_gift_card) throw new Error('A gift card is not paid off. To add value to it, use Manage Balance on the card.');
  const from = parseSource(source);
  if (from.type === 'credit_card') {
    if (String(from.id) === String(card.id)) throw new Error('A card cannot pay itself. Choose the account the payment comes from.');
    const other = (accounts.creditCards || []).find((c) => String(c.id) === String(from.id));
    if (other && other.is_gift_card) throw new Error('A gift card cannot pay a credit card. Choose a bank account.');
  }
  const rows = [];
  if (paymentRow) rows.push({ table: 'credit_card_payments', values: { card_id: card.id, amount: a, payment_date: date, ...paymentRow } });
  rows.push({ table: 'transactions', values: txRow({ type: 'credit_card_payment', amount: a, date, description: description || `Payment to ${card.name}`, ...extra, card_id: card.id }, source, accounts) });
  return send(key, [...(from.type === OUTSIDE ? [] : [payFrom(source, a, accounts)]), { table: 'credit_cards', id: card.id, delta: -a }], rows, withUpdates(updates));
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

// Moving money between two of your own places (bank to bank, or to and from the Cash account).
export async function recordTransfer({ amount, from, to, date, description, key, extra }, accounts) {
  const a = toAmount(amount);
  const f = parseSource(from), t = parseSource(to);
  if (f.type === t.type && String(f.id) === String(t.id)) throw new Error(f.type === OUTSIDE ? 'Choose at least one account that is in the app.' : 'Choose two different accounts.');
  return send(key, [...(f.type === OUTSIDE ? [] : [payFrom(from, a, accounts)]), ...(t.type === OUTSIDE ? [] : [payInto(to, a, accounts)])], [
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
  const leg = { table: { bank_account: 'bank_accounts', loan: 'loans', investment: 'investments', asset: 'assets' }[type] || 'credit_cards', id, delta };
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

// Lines that were put on the wrong account go to the right one, of the same kind. lines: [{ id, from: 'bank_account:ID' }].
// Moving them back is the same call the other way.
export const moveLines = (lines, to) => api('/api/lines/move', { moves: lines.map((l) => ({ id: l.id, from: l.from })), to });

// The balance you saw on a day (a screenshot, the bank app, counting cash). The server compares it with the app.
// apply: the difference is recorded as an undoable adjustment and the day becomes the account's snapshot date, so lines
// dated before it are kept as history and can't move today's balance again. Without apply a difference stays open to explain.
const SNAP_TABLE = { bank_account: 'bank_accounts', credit_card: 'credit_cards', loan: 'loans', investment: 'investments', asset: 'assets' };
export async function recordSnapshot({ target, value, date, source, apply = true, picture }) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('Enter a number.');
  const { type, id } = parseSource(target);
  const where = { table: SNAP_TABLE[type], id };
  if (!where.table) throw new Error('That account can not take a balance.');
  return api('/api/snapshot', { ...where, value: Math.round(n * 100) / 100, date, source, apply, ...(picture ? { picture } : {}) });
}
export const resolveSnapshot = (id, action) => api(`/api/snapshots/${id}/resolve`, { action });

// A card's due date after a payment you record yourself. The payment settles the bill that is due when it is made
// within 25 days before the due date (or after it): the due date then moves to the same day of the next month.
// A card that pays itself keeps its date (the automatic payment moves it), unless the payment cleared the card.
// -> the new due date (YYYY-MM-DD), or null when it stays as it is.
export function cardDueAfterPayment(card, payDate, balanceAfter) {
  const at = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const due = at(card && card.due_date), paid = at(payDate);
  if (!due || !paid || card.is_gift_card) return null;
  if (card.connected_payment_source && card.connected_payment_source_id && round2(balanceAfter) > 0) return null;
  if ((due - paid) / 864e5 > 25) return null;
  const day = due.getDate();
  let d = due;
  do {
    const last = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
    d = new Date(d.getFullYear(), d.getMonth() + 1, Math.min(day, last));
  } while (d <= paid);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
