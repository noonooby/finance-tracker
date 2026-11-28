// History from a reconciled ledger: accounts with the balance each one has on a stated day, and every line before it.
// plan() only works things out (no database), so the rules can be tested on their own:
//  - every line is dated on or before its account's balance day, so it is kept as history and moves no balance;
//  - two lines that are the two sides of one movement between your own accounts become one line (a transfer, or a
//    card or loan payment when the money lands on a card or loan), never income or spending;
//  - a line marked as a transfer with no other side in the file is a transfer to or from an account not in the app;
//  - anything else is a purchase (money out), income (money in, in a category that is mostly money in) or a refund.
// file: { accounts: [{ key, name, kind, balance, balance_date, closed, ... }], lines: [{ id, date, account, description,
//         amount (above zero is money into that account), currency, category, transfer_id }], assets: [{ name, value }] }

const DEFAULTS = [
  ['groceries', 'Groceries', '#10b981', 'ShoppingCart', false], ['utilities', 'Utilities', '#f59e0b', 'Lightbulb', false],
  ['transportation', 'Transportation', '#3b82f6', 'Car', false], ['entertainment', 'Entertainment', '#8b5cf6', 'Gamepad2', false],
  ['healthcare', 'Healthcare', '#ef4444', 'Heart', false], ['dining', 'Dining', '#ec4899', 'Utensils', false],
  ['shopping', 'Shopping', '#06b6d4', 'ShoppingBag', false], ['housing', 'Housing', '#84cc16', 'Home', false],
  ['insurance', 'Insurance', '#6366f1', 'Shield', false], ['loan_payments', 'Loan payments', '#f97316', 'Landmark', false],
  ['other', 'Other', '#6b7280', 'Package', false], ['salary', 'Salary', '#10b981', 'Briefcase', true],
  ['freelance', 'Freelance', '#3b82f6', 'Laptop', true], ['investment', 'Investment', '#8b5cf6', 'TrendingUp', true],
  ['other_income', 'Other income', '#6b7280', 'Plus', true],
];
// Ledger names that mean the same as a category the app starts with.
const SAME_AS = {
  'groceries': 'groceries', 'restaurants & delivery': 'dining', 'utilities & telecom': 'utilities', 'internet (home)': 'utilities',
  'transport: rideshare & transit': 'transportation', 'transport: car': 'transportation', 'health & pharmacy': 'healthcare',
  'insurance': 'insurance', 'shopping: general': 'shopping', 'housing: rent': 'housing', 'income: payroll': 'salary',
  'uncategorized spending': 'other', 'uncategorized inflow': 'other_income',
};
const COLOURS = ['#0ea5e9', '#14b8a6', '#a855f7', '#f43f5e', '#eab308', '#22c55e', '#f97316', '#6366f1', '#d946ef', '#64748b'];
const NEITHER = /^(transfer|investment activity)\b|^loan proceeds$|^home purchase/i;
const DEBT = /^debt:/i;
const REFUND = /^refunds? (&|and) credits$/i;
const TABLE = { chequing: 'bank_accounts', checking: 'bank_accounts', savings: 'bank_accounts', cash: 'bank_accounts', other: 'bank_accounts',
  credit_card: 'credit_cards', loan: 'loans', bnpl: 'loans', investment: 'investments' };
const METHOD = { bank_accounts: 'bank_account', credit_cards: 'credit_card', loans: 'loan', investments: 'investment' };
const OUTSIDE = { method: 'outside', id: null, name: 'An account not in the app' };
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
// The same merchant key as reader.js and the browser: letters only, card-processor prefixes removed.
const mkey = (m) => String(m || '').toLowerCase().replace(/^(sq|sp|tst|klarna|paypal|pp)\s*\*\s*/, '').replace(/[^a-z]/g, '').slice(0, 24);
const cents = (v) => Math.round(Number(v || 0) * 100);
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
const investmentKind = (name) => (/\btfsa\b/i.test(name) ? 'TFSA' : /\bfhsa\b/i.test(name) ? 'FHSA' : /\b(rrsp|lira)\b/i.test(name) ? 'RRSP'
  : /crypto/i.test(name) ? 'Crypto' : /pension/i.test(name) ? 'Pension' : /non-registered|margin|brokerage/i.test(name) ? 'Brokerage' : 'Other');

// known: what each of the ledger's categories already is here (true when it is income), so a file holding only part of the
// history cannot turn a spending category into income because the few rows it holds are money in.
function plan(file, uid, known) {
  const u8 = String(uid).slice(0, 8), problems = [], accounts = [], byKey = new Map();
  if (!file || !Array.isArray(file.accounts) || !Array.isArray(file.lines)) throw new Error('The file needs accounts and lines.');

  for (const a of file.accounts) {
    const kind = String(a.kind || '').toLowerCase(), key = slug(a.key);
    let table = TABLE[kind];
    if (!key || !table || !String(a.name || '').trim()) { problems.push(`Account left out (no key, name or known kind): ${a.key || a.name}`); continue; }
    if (byKey.has(a.key)) { problems.push(`Account listed twice: ${a.key}`); continue; }
    if (!isDay(a.balance_date)) { problems.push(`Account left out (no balance day): ${a.key}`); continue; }
    let balance = cents(a.balance) / 100;
    // An investment account that is below zero is money owed (a line of credit against the portfolio): it is kept as a loan.
    if (table === 'investments' && balance < 0) table = 'loans';
    const owes = table === 'credit_cards' || table === 'loans';
    if (table === 'loans' && kind === 'investment') balance = -balance;
    const v = { id: `h_${key}_${u8}`, name: String(a.name).trim().slice(0, 80), balance, institution: a.institution || '', last4: a.last4 || null,
      external_key: String(a.key), snapshot_date: a.balance_date, balance_as_of: a.balance_date, archived: !!a.closed, ...(a.closed ? { info_off: true } : {}), source: 'import',
      ...(a.currency && a.currency !== 'CAD' ? { currency: String(a.currency).slice(0, 3) } : {}), ...(a.note ? { notes: String(a.note).slice(0, 300) } : {}),
      ...(a.opening_balance && Number.isFinite(Number(a.opening_balance.amount)) ? { opening_balance: Number(a.opening_balance.amount), opening_note: String(a.opening_balance.note || '').slice(0, 200) } : {}),
      ...(a.autopay != null ? { autopay: !!a.autopay } : {}) };
    if (table === 'bank_accounts') v.account_type = kind === 'savings' ? 'savings' : kind === 'cash' ? 'cash' : 'checking';
    if (table === 'credit_cards') Object.assign(v, { credit_limit: Number(a.credit_limit) || 0, due_date: isDay(a.next_due) ? a.next_due : null });
    if (table === 'loans') Object.assign(v, { principal: balance, interest_rate: Number(a.rate) || 0, payment_amount: Number(a.payment_amount) || 0, frequency: a.frequency || 'monthly',
      next_payment_date: isDay(a.next_due) ? a.next_due : null,
      loan_type: kind === 'bnpl' ? 'plan' : /mortgage/i.test(a.name) ? 'mortgage' : /\bloc\b|line of credit/i.test(a.name) ? 'line_of_credit' : 'loan',
      ...(Number(a.credit_limit) > 0 ? { credit_limit: Number(a.credit_limit) } : {}) });
    if (Number(a.limit_at_least) > 0) v.limit_at_least = Number(a.limit_at_least);
    if (table === 'investments') v.kind = investmentKind(a.name);
    const acct = { key: a.key, table, owes, id: v.id, name: v.name, day: a.balance_date, values: v };
    accounts.push(acct); byKey.set(a.key, acct);
  }

  // Lines that can be used, oldest first.
  const lines = [];
  const seen = new Set();
  for (const l of file.lines) {
    const a = byKey.get(l.account), c = cents(l.amount);
    if (!a) { problems.push(`Line ${l.id} left out: its account ${l.account} is not in the file`); continue; }
    if (l.id == null || seen.has(String(l.id))) { problems.push(`Line left out (no id, or the id is used twice): ${l.id}`); continue; }
    if (!isDay(l.date)) { problems.push(`Line ${l.id} left out: ${l.date} is not a day`); continue; }
    if (!Number.isFinite(c) || !c) { problems.push(`Line ${l.id} left out: it has no amount`); continue; }
    if (l.date > a.day) { problems.push(`Line ${l.id} left out: it is dated after the balance day of ${a.name}`); continue; }
    seen.add(String(l.id));
    lines.push({ ...l, id: String(l.id), a, c, category: String(l.category || '').trim() });
  }
  lines.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

  // Whether a category is mostly money in (income) or money out, from the lines that are not transfers.
  const paysLoan = (file.rules && file.rules.loan_payments) || {};
  // Categories the file says are neither income nor spending (money to and from people, say), and ones whose money in
  // lowers spending (a friend paying back their share). Each is the start of a category name.
  const starts = (list, cat) => (list || []).some((p) => p && cat.toLowerCase().startsWith(String(p).toLowerCase()));
  const outside = (cat) => NEITHER.test(cat) || starts(file.rules && file.rules.outside, cat);
  const givesBack = (cat) => REFUND.test(cat) || starts(file.rules && file.rules.refunds, cat);
  const tally = new Map();
  for (const l of lines) {
    if (l.transfer_id || !l.category || outside(l.category) || DEBT.test(l.category) || (l.c < 0 && paysLoan[l.category])) continue;
    const t = tally.get(l.category) || { in: 0, out: 0 };
    if (l.c > 0) t.in++; else t.out++;
    tally.set(l.category, t);
  }
  const categories = DEFAULTS.map(([id, name, color, icon, is_income]) => ({ id: `${id}_${u8}`, name, color, icon, is_income, is_system: false }));
  const catOf = new Map();
  let n = 0;
  for (const [name, t] of [...tally].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const same = SAME_AS[name.toLowerCase()];
    const is_income = givesBack(name) ? false : known && known.has(name) ? known.get(name) : t.in > t.out;
    if (same) { const d = categories.find((c) => c.id === `${same}_${u8}`); catOf.set(name, { id: d.id, name: d.name, is_income: d.is_income }); continue; }
    const shown = name.replace(/^income:\s*/i, '').slice(0, 60);
    const twin = categories.find((c) => c.is_income === is_income && c.name.toLowerCase() === shown.toLowerCase());
    if (twin) { catOf.set(name, { id: twin.id, name: twin.name, is_income }); continue; }
    const c = { id: `h_${slug(name)}_${u8}`, name: shown, color: COLOURS[n++ % COLOURS.length], icon: 'Tag', is_income, is_system: false };
    categories.push(c); catOf.set(name, { id: c.id, name: c.name, is_income });
  }

  const rows = [], counts = {};
  const noteOf = new Map((file.lines || []).filter((l) => l && l.note).map((l) => [String(l.id), String(l.note).trim().slice(0, 140)]));
  const side = (a) => ({ method: METHOD[a.table], id: a.id, name: a.name });
  // What a line did to the balance as the app keeps it: a card or loan holds what is owed, so money in lowers it.
  const moved = (a, c) => ({ table: a.table, id: a.id, amount: (a.owes ? -c : c) / 100 });
  const row = (first, ids, values) => {
    const v = { id: `h_${first.id}_${u8}`, status: 'active', undone_at: null, date: first.date, source: 'import', external_id: first.id,
      ...(ids.length > 1 ? { external_ids: ids } : {}), ledger_category: first.category || null, in_snapshot: true, created_at: `${first.date}T12:00:00.000Z`,
      ...(first.currency && first.currency !== 'CAD' ? { currency: String(first.currency).slice(0, 3) } : {}), ...(first.texts ? { texts: first.texts } : {}), ...values };
    // What the file notes about any of the line's rows (which instalment it was, say) is kept under the line.
    const said = [...new Set(ids.map((x) => noteOf.get(String(x))).filter(Boolean))];
    if (said.length) v.notes = [v.notes, ...said].filter(Boolean).join(' · ').slice(0, 300);
    counts[v.type] = (counts[v.type] || 0) + 1;
    rows.push(v);
  };
  const from = (s) => ({ payment_method: s.method, payment_method_id: s.id, payment_method_name: s.name, card_id: s.method === 'credit_card' ? s.id : null });
  const words = (l) => String(l.description || '').trim().slice(0, 200) || 'No description';

  // Money that went from one place to another: a payment when it lands on a card or loan, else a transfer.
  const movement = (first, ids, a, b, c, hist, text) => {
    const amount = Math.abs(c) / 100, src = a ? side(a) : OUTSIDE;
    if (b && b.table === 'credit_cards') return row(first, ids, { type: 'payment', amount, description: `${b.name} payment`, notes: text, ...from(src), card_id: b.id,
      category_id: 'credit_card_payment', category_name: 'Credit card payment', history_only: hist });
    if (b && b.table === 'loans') return row(first, ids, { type: 'loan_payment', amount, description: `${b.name} payment`, notes: text, ...from(src), loan_id: b.id, history_only: hist });
    return row(first, ids, { type: 'transfer', amount, description: text, ...from(src), from_account_id: a ? a.id : null, to_account_id: b ? b.id : null,
      transfer_to: b ? METHOD[b.table] : 'outside', history_only: hist });
  };
  const alone = (l) => {
    const a = l.a, amount = Math.abs(l.c) / 100, hist = [moved(a, l.c)], cat = l.category;
    const pays = paysLoan[cat] ? byKey.get(paysLoan[cat]) : null;
    if (pays && l.c < 0) return movement(l, [l.id], a, pays, l.c, hist, words(l));
    // Money back from a debt (a deposit returned at the end) is not income and lowers no spending.
    if (l.transfer_id || outside(cat) || (DEBT.test(cat) && l.c > 0)) return l.c > 0 ? movement(l, [l.id], null, a, l.c, hist, words(l)) : movement(l, [l.id], a, null, l.c, hist, words(l));
    if (DEBT.test(cat) && l.c < 0) return row(l, [l.id], { type: 'loan_payment', amount, description: words(l), ...from(side(a)), loan_id: null, category_name: cat.replace(DEBT, '').trim(), history_only: hist });
    const c = catOf.get(cat) || null;
    const type = l.c < 0 ? 'expense' : c && c.is_income ? 'income' : 'refund';
    return row(l, [l.id], { type, amount, description: words(l), ...from(side(a)), category_id: c ? c.id : null, category_name: c ? c.name : null, history_only: hist,
      ...(l.counterparty ? { notes: String(l.counterparty).slice(0, 80) } : {}) });
  };

  const groups = new Map();
  for (const l of lines) if (l.transfer_id) { const g = groups.get(l.transfer_id) || []; g.push(l); groups.set(l.transfer_id, g); }
  const done = new Set();
  for (const l of lines) {
    if (done.has(l.id)) continue;
    const g = l.transfer_id ? groups.get(l.transfer_id) : null;
    if (!g || g.length < 2) { alone(l); done.add(l.id); continue; }
    const outs = g.filter((x) => x.c < 0), ins = g.filter((x) => x.c > 0);
    // One side on one account and the other side on other accounts: one line for each account the money went to or came from.
    const one = outs.length === 1 ? outs[0] : ins.length === 1 ? ins[0] : null;
    const rest = one ? (one.c < 0 ? ins : outs) : [];
    if (!one || !rest.length || rest.some((x) => x.a === one.a)) { for (const x of g) { alone(x); done.add(x.id); } continue; }
    const per = new Map();
    for (const x of rest) { const p = per.get(x.a) || []; p.push(x); per.set(x.a, p); }
    let left = one.c;
    const parts = [...per];
    parts.forEach(([other, xs], i) => {
      const sum = xs.reduce((s, x) => s + x.c, 0);
      // The single side's own figure is shared out so its parts add up to it exactly (the two sides can differ by a fee or a rate).
      const mine = i === parts.length - 1 ? left : -sum; left -= mine;
      const ids = [...(i === 0 ? [one.id] : []), ...xs.map((x) => x.id)];
      const first = one.c < 0 ? { ...one, id: i === 0 ? one.id : xs[0].id } : { ...xs[0] };
      const hist = [moved(one.a, mine), moved(other, sum)];
      const said = [...new Set([one, ...xs].map(words))];
      if (said.length > 1) first.texts = said;
      if (one.c < 0) movement(first, ids, one.a, other, mine, hist, words(one));
      else movement(first, ids, other, one.a, sum, hist, words(xs[0]));
    });
    for (const x of g) done.add(x.id);
  }

  // What repeats. A card's schedule sets its due day, its minimum and, when the statement is out, the statement balance.
  // A bill or subscription becomes a bill. Pay becomes a pay day that is expected but never added by itself: the picture
  // of the deposit records it. A loan's own payment is already on its account; one with no account here becomes a bill.
  const bills = [], pay = [];
  const newest = rows.reduce((d, r) => (r.date > d ? r.date : d), '');
  const since = newest ? new Date(Date.parse(newest) - 200 * 864e5).toISOString().slice(0, 10) : '';
  const FREQ = { weekly: 'weekly', biweekly: 'biweekly', monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly', annual: 'yearly', once: 'once' };
  const tail = (s) => (String(s || '').match(/(\d{4})\D*$/) || [])[1] || null;
  const named = (name) => accounts.find((a) => a.name.toLowerCase() === String(name || '').trim().toLowerCase());
  for (const s of file.schedules || []) {
    if (!s || !s.id || !isDay(s.next)) continue;
    const amount = cents(s.amount) / 100;
    if (s.kind === 'card') {
      // The account the file names for the schedule, else the card whose last digits end the schedule's id.
      const card = accounts.find((a) => a.table === 'credit_cards' && s.account && a.key === String(s.account))
        || accounts.find((a) => a.table === 'credit_cards' && tail(s.id) && (a.values.last4 === tail(s.id) || tail(a.key) === tail(s.id)));
      if (!card) { problems.push(`Schedule ${s.id}: no card matches it`); continue; }
      const known = s.amount_kind === 'statement' && s.amount != null && s.conf !== 'estimate';
      Object.assign(card.values, { due_date: s.next, ...(Number(s.minimum) > 0 ? { minimum_payment: Number(s.minimum) } : {}), ...(s.autopay != null ? { autopay: !!s.autopay } : {}),
        statement_due: s.next, statement_balance: known ? amount : null });
      continue;
    }
    if (s.kind === 'income') {
      if (!(amount > 0) || !FREQ[s.every] || s.every === 'once') continue;
      const parts = Object.entries(s.splits || (s.bank ? { [s.bank]: amount } : {})).map(([name, a]) => ({ a: named(name), amount: cents(a) / 100 })).filter((x) => x.a && x.a.table === 'bank_accounts' && x.amount > 0)
        .sort((x, y) => y.amount - x.amount).slice(0, 3);
      if (!parts.length) { problems.push(`Schedule ${s.id}: the account the pay lands in is not in the file`); continue; }
      pay.push({ id: `h_${slug(s.id)}_${u8}`, source: String(s.payee || s.name).slice(0, 60), amount, frequency: FREQ[s.every], start_date: s.next, next_date: s.next, deposit_target: 'bank',
        deposit_account_id: parts[0].a.id, splits: parts.slice(1).map((x) => ({ account_id: x.a.id, amount: x.amount })), auto_deposit: false, recurring_duration_type: 'indefinite',
        recurring_occurrences_completed: 0, is_active: true, notes: s.amount_kind === 'varies' ? 'The amount varies.' : null });
      continue;
    }
    const mine = (s.kind === 'loan' || s.kind === 'bnpl') && accounts.some((a) => a.table === 'loans' && s.payee && a.name.toLowerCase().includes(String(s.payee).toLowerCase()));
    if (mine || !(amount > 0) || !FREQ[s.every]) continue;
    // A bill is tied to its payments by the merchant's key: the one its recent purchases carry, when one fits the payee and no
    // other bill has it (a merchant has one tracked bill).
    const want = mkey(String(s.payee || s.name).split('(')[0]);
    const seenKeys = new Map();
    if (want.length >= 4) for (const r of rows) if (r.type === 'expense' && r.date >= since) { const k = mkey(r.description); if (k.startsWith(want)) seenKeys.set(k, (seenKeys.get(k) || 0) + 1); }
    const best = [...seenKeys].sort((x, y) => y[1] - x[1])[0];
    const key = best && !bills.some((b) => b.key === best[0]) ? best[0] : `import:${slug(s.id)}`;
    // A bill charged to a card is paid when the card is paid: it is tied to that card, so it is not counted as money leaving the bank again.
    const paidBy = String(s.pay_from || '').toLowerCase();
    const onCard = s.via_card ? accounts.filter((a) => a.table === 'credit_cards' && paidBy.startsWith(a.name.toLowerCase())).sort((x, y) => y.name.length - x.name.length)[0] : null;
    bills.push({ id: `h_${slug(s.id)}_${u8}`, key, name: String(s.name).slice(0, 60), amount, frequency: FREQ[s.every], next_date: s.next, status: 'active', remind: s.remind === true,
      ...(onCard ? { payment_method: 'credit_card', payment_method_id: onCard.id, payment_method_name: onCard.name } : {}),
      source: 'import', notes: [s.pay_from ? `Paid from ${String(s.pay_from).slice(0, 80)}${s.autopay ? ', by itself' : ''}.` : '', isDay(s.until) ? `Ends ${s.until}.` : '', String(s.note || '').slice(0, 220)].filter(Boolean).join(' ') || null });
  }

  // Bills the file says have ended.
  const ended = ((file.rules && file.rules.ended_bills) || []).map((id) => `h_${slug(id)}_${u8}`);

  return { accounts, categories, rows, counts, problems, bills, pay, ended, assets: (file.assets || []).filter((x) => x && x.name && Number(x.value) > 0)
    .map((x) => ({ id: `h_${slug(x.name)}_${u8}`, name: String(x.name).slice(0, 80), kind: /home|condo|house|\bpl\b/i.test(x.name) ? 'Home' : 'Other', balance: cents(x.value) / 100,
      notes: x.basis ? String(x.basis).slice(0, 200) : undefined, source: 'import' })) };
}

module.exports = { plan, DEFAULTS };
