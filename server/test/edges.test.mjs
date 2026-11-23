// Edge cases for the small server modules, run directly (no server, no network): exchange rates, the rate lookup,
// matching a screenshot to an account, the scan note, and what counts as due for a reminder.
// Every outside call is replaced with a fixed answer. Run: npm run test:scenarios
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

delete process.env.FX_STUB;
delete process.env.LOOKUP_STUB;
delete process.env.HOME_CURRENCY;

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const mod = (f) => require(path.join(here, '..', f));
const fx = mod('fx.js');
const rates = mod('rates.js');
const reader = mod('reader.js');
const push = mod('push.js');
const keystore = mod('keystore.js');
const gemini = mod('gemini.js');

const memDb = () => { const d = new DatabaseSync(':memory:'); d.exec('CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)'); return d; };
const realFetch = globalThis.fetch;
// Replace fetch for one call; returns the list of URLs asked for.
async function withFetch(answer, run) {
  const asked = [];
  globalThis.fetch = async (u) => { asked.push(String(u)); return answer(String(u)); };
  try { await run(asked); } finally { globalThis.fetch = realFetch; }
}
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

// ---------- exchange rates ----------
test('exchange rate: the same currency is 1 and asks nobody', async () => {
  await withFetch(() => { throw new Error('should not be called'); }, async (asked) => {
    assert.deepEqual(await fx.rate(memDb(), 'cad', 'CAD', '2026-11-20'), { rate: 1, date: '2026-11-20', from: 'CAD', to: 'CAD' });
    assert.equal(asked.length, 0);
  });
});

test('exchange rate: codes must be three letters, and the message says what to do', async () => {
  for (const bad of ['', 'US', 'USDX', 'U$D', null, '123']) {
    await assert.rejects(fx.rate(memDb(), bad, 'CAD', '2026-11-20'), (e) => e.status === 400 && /Choose a currency/.test(e.message));
  }
  await assert.rejects(fx.rate(memDb(), 'USD', 'C', '2026-11-20'), (e) => e.status === 400);
});

test('exchange rate: a dated rate is looked up once and then kept; only currencies and the date are sent', async () => {
  const db = memDb();
  await withFetch(() => reply(200, { date: '2026-11-19', rates: { CAD: 1.3712 } }), async (asked) => {
    const a = await fx.rate(db, 'usd', 'cad', '2026-11-20');
    const b = await fx.rate(db, 'USD', 'CAD', '2026-11-20');
    assert.deepEqual(a, { rate: 1.3712, date: '2026-11-19', from: 'USD', to: 'CAD' }); // the rate's own day (last published)
    assert.deepEqual(b, a);
    assert.deepEqual(asked, ['https://api.frankfurter.dev/v1/2026-11-20?base=USD&symbols=CAD']);
  });
});

test('exchange rate: without a usable date the latest rate is used and not kept', async () => {
  const db = memDb();
  await withFetch(() => reply(200, { date: '2026-11-21', rates: { CAD: 1.4 } }), async (asked) => {
    for (const day of [undefined, 'yesterday', '2026-1-5', '20261120']) await fx.rate(db, 'USD', 'CAD', day);
    assert.equal(asked.length, 4);
    assert.ok(asked.every((u) => u.includes('/v1/latest?')));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM meta').get().n, 0);
  });
});

test('exchange rate: an unknown currency, a failing service and an unreachable service each say so', async () => {
  const db = memDb();
  for (const status of [404, 422]) {
    await withFetch(() => reply(status, {}), async () => {
      await assert.rejects(fx.rate(db, 'XXX', 'CAD', '2026-11-20'), (e) => e.status === 400 && /No exchange rate is published for XXX/.test(e.message));
    });
  }
  await withFetch(() => reply(500, {}), async () => {
    await assert.rejects(fx.rate(db, 'USD', 'CAD', '2026-11-20'), (e) => e.status === 502 && /right now/.test(e.message));
  });
  await withFetch(() => { throw new TypeError('fetch failed'); }, async () => {
    await assert.rejects(fx.rate(db, 'USD', 'CAD', '2026-11-20'), (e) => e.status === 502 && /Could not reach/.test(e.message));
  });
  // Nothing wrong was kept for later.
  assert.equal(db.prepare('SELECT COUNT(*) n FROM meta').get().n, 0);
});

test('exchange rate: an answer without a positive rate is refused, not saved as zero', async () => {
  const db = memDb();
  for (const body of [{}, { rates: {} }, { rates: { CAD: 0 } }, { rates: { CAD: -1 } }, { rates: { CAD: 'abc' } }, { rates: { EUR: 0.9 } }]) {
    await withFetch(() => reply(200, body), async () => {
      await assert.rejects(fx.rate(db, 'USD', 'CAD', '2026-11-20'), (e) => e.status === 400);
    });
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM meta').get().n, 0);
});

test('converting rounds to whole cents', () => {
  assert.equal(fx.convert(10, 1.4), 14);
  assert.equal(fx.convert(10.25, 1.4), 14.35);
  assert.equal(fx.convert(19.99, 1.3712), 27.41);
  assert.equal(fx.convert(0, 1.4), 0);
  assert.equal(fx.convert('12.50', 2), 25);
  assert.equal(fx.convert(0.01, 0.4), 0); // less than half a cent
  assert.equal(fx.convert(1234567.89, 1.4), 1728395.05);
});

// ---------- rate lookup ----------
test('rate lookup: needs a known kind and a real product name', async () => {
  for (const [kind, name] of [['mortgage', 'TD Fixed'], ['credit_card', ''], ['credit_card', 'ab'], ['loan', '@@@@@@'], [undefined, 'Amex Cobalt']]) {
    await assert.rejects(rates.lookup(kind, name), (e) => e.status === 400 && /Enter the product name/.test(e.message));
  }
});

test('rate lookup: without the key it says where to set it', async () => {
  const get = keystore.get; keystore.get = () => null;
  try { await assert.rejects(rates.lookup('credit_card', 'Amex Cobalt'), (e) => e.status === 503 && /Settings/.test(e.message)); }
  finally { keystore.get = get; }
});

test('rate lookup: the answer is cleaned (numbers in range, https source only, short text) and only the name is sent', async () => {
  const get = keystore.get, generate = gemini.generate;
  let sent = '';
  keystore.get = () => 'test-key';
  try {
    gemini.generate = async (key, body) => { sent = JSON.stringify(body); return 'Here you go:\n```json\n' + JSON.stringify({
      found: true, product: 'P'.repeat(200), issuer: 'I'.repeat(200), purchase_rate: 21.99, cash_rate: '22.99', annual_fee: -5,
      overdraft_rate: 1e9, rate_low: 'n/a', rate_high: null, setup_fee: 0, offers_plans: 'yes', source_url: 'http://not-secure.example/x', notes: 'N'.repeat(500),
    }) + '\n```'; };
    const o = await rates.lookup('credit_card', 'Amex <script>Cobalt</script> "Card"; balance 5000$');
    assert.equal(o.found, true);
    assert.equal(o.product.length, 80); assert.equal(o.issuer.length, 60); assert.equal(o.notes.length, 200);
    assert.deepEqual([o.purchase_rate, o.cash_rate, o.annual_fee, o.overdraft_rate, o.rate_low, o.setup_fee], [21.99, 22.99, null, null, null, 0]);
    assert.equal(o.offers_plans, null);   // only a real yes/no counts
    assert.equal(o.source_url, null);     // not https
    assert.match(o.checked, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!/[<>"$;]/.test(sent.match(/the credit card \\"(.*?)\\" in Canada/)[1]), 'the name is sent without markup or symbols');

    gemini.generate = async () => 'Sorry, I could not find that.';
    const none = await rates.lookup('loan', 'Some Loan');
    assert.deepEqual([none.found, none.product, none.source_url, none.purchase_rate], [false, 'Some Loan', null, null]);

    gemini.generate = async () => '{"found": true, "purchase_rate": 19.99,';   // cut off
    assert.equal((await rates.lookup('loan', 'Some Loan')).found, false);
  } finally { keystore.get = get; gemini.generate = generate; }
});

// ---------- which account a screenshot belongs to ----------
const ACCTS = [
  { id: 1, name: 'TD Chequing', last4: '1111' },
  { id: 2, name: 'TD Savings', last4: '2222' },
  { id: 3, name: 'Amex Cobalt', last_four: '3333' },
  { id: 4, name: 'Visa', card_number: '4500 0000 0000 4444' },
  { id: 5, name: 'Old Visa', last4: '4444' },
];

test('account match: card digits win when they point at one account, the name decides otherwise', () => {
  assert.equal(reader.resolveAccount(ACCTS, { last4: '1111' }).id, 1);
  assert.equal(reader.resolveAccount(ACCTS, { last4: '3333', name: 'something else' }).id, 3);
  assert.equal(reader.resolveAccount(ACCTS, { last4: 'xxxx-2222' }).id, 2);       // longer text ending in the digits
  assert.equal(reader.resolveAccount(ACCTS, { last4: '4444', name: 'Old Visa' }).id, 5); // two accounts share the digits: name decides
  assert.equal(reader.resolveAccount(ACCTS, { last4: '4444' }), null);            // shared digits and no name: not guessed
  assert.equal(reader.resolveAccount(ACCTS, { last4: '9999', name: 'amex-cobalt' }).id, 3);
});

test('account match: names ignore case and punctuation; anything that fits two accounts is not guessed', () => {
  assert.equal(reader.resolveAccount(ACCTS, { name: 'td  CHEQUING!' }).id, 1);
  assert.equal(reader.resolveAccount(ACCTS, { name: 'Cobalt' }).id, 3);                       // part of one name
  assert.equal(reader.resolveAccount(ACCTS, { name: 'American Express Amex Cobalt Card' }).id, 3); // name inside a longer one
  assert.equal(reader.resolveAccount(ACCTS, { name: 'TD' }), null);                           // fits chequing and savings
  assert.equal(reader.resolveAccount(ACCTS, { name: 'Visa' }).id, 4);                         // exact beats "Old Visa"
  assert.equal(reader.resolveAccount(ACCTS, { name: 'Scotia' }), null);
  assert.equal(reader.resolveAccount(ACCTS, { name: '' }), null);
  assert.equal(reader.resolveAccount(ACCTS, { name: '***' }), null);
  assert.equal(reader.resolveAccount(ACCTS, {}), null);
  assert.equal(reader.resolveAccount([], { last4: '1111', name: 'TD Chequing' }), null);
  assert.equal(reader.resolveAccount([{ id: 9, name: '' }], { name: 'Anything' }), null);     // an unnamed account matches nothing
});

test('merchant key: payment-app prefixes, store numbers and case do not make a new merchant', () => {
  const same = ['SQ *Blue Bottle Coffee', 'sq*BLUE BOTTLE COFFEE #1234', 'Blue Bottle Coffee 0042', 'PAYPAL * Blue Bottle Coffee'];
  assert.equal(new Set(same.map(reader.mkey)).size, 1);
  assert.equal(reader.mkey('SQ *Blue Bottle Coffee'), 'bluebottlecoffee');
  assert.notEqual(reader.mkey('Square One Mall'), reader.mkey('One Mall'));   // "sq" only counts before a star
  assert.equal(reader.mkey('A Very Long Merchant Name That Keeps Going On').length, 24);
  assert.equal(reader.mkey(''), ''); assert.equal(reader.mkey(null), ''); assert.equal(reader.mkey('12345'), '');
});

test('scan note: stays one plain line of at most 300 characters', () => {
  assert.equal(reader.cleanNote('  card ending\n\t4321,\r\n   only the Amazon lines  '), 'card ending 4321, only the Amazon lines');
  assert.equal(reader.cleanNote('a>>>b<<<c >> d'), 'a b c d');
  assert.equal(reader.cleanNote('2 < 3 and 5 > 4'), '2 < 3 and 5 > 4');   // a single bracket is ordinary text
  assert.equal(reader.cleanNote('x'.repeat(1000)).length, 300);
  for (const empty of [undefined, null, '', '   ', '\n\n', '>>>']) assert.equal(reader.cleanNote(empty), '');
  assert.equal(reader.cleanNote(4321), '4321');
});

// ---------- what is due ----------
const TODAY = '2026-11-21', SOON = '2026-11-23';
const due = (tables) => push.dueFor((t) => tables[t] || [], TODAY, SOON);
const titles = (tables) => due(tables).map((x) => x.title);

test('due: a card is reminded only when you pay it yourself and something is owed', () => {
  const list = due({ credit_cards: [
    { id: 1, name: 'Today', balance: 50, due_date: TODAY, minimum_payment: 10 },
    { id: 2, name: 'Soon', balance: 50, due_date: `${SOON}T00:00:00.000Z` },
    { id: 3, name: 'Tomorrow', balance: 50, due_date: '2026-11-22' },
    { id: 4, name: 'Yesterday', balance: 50, due_date: '2026-11-20' },
    { id: 5, name: 'Paid off', balance: 0, due_date: TODAY },
    { id: 6, name: 'In credit', balance: -20, due_date: TODAY },
    { id: 7, name: 'Gift', balance: 50, due_date: TODAY, is_gift_card: true },
    { id: 8, name: 'Autopay', balance: 50, due_date: TODAY, connected_payment_source: 'bank_account' },
    { id: 9, name: 'No date', balance: 50 },
  ] });
  assert.deepEqual(list.map((x) => x.title), ['Today payment due today', 'Soon payment due in 2 days']);
  assert.match(list[0].body, /50\.00.*minimum.*10\.00/);
  assert.doesNotMatch(list[1].body, /minimum/);
  assert.deepEqual(list.map((x) => x.id), [`card:1:${TODAY}:0`, `card:2:${SOON}:2`]); // a different id for each of the two reminders
  assert.ok(list.every((x) => x.url === '/cards'));
});

test('due: a loan asks for its payment, or what is left when that is less; plans on a card and automatic ones are skipped', () => {
  const list = due({ loans: [
    { id: 1, name: 'Car', balance: 5000, payment_amount: 400, next_payment_date: TODAY },
    { id: 2, name: 'Last one', balance: 120, payment_amount: 400, next_payment_date: SOON },
    { id: 3, name: 'No amount', balance: 300, next_payment_date: TODAY },
    { id: 4, name: 'On card', balance: 300, payment_amount: 50, next_payment_date: TODAY, on_card_id: 7 },
    { id: 5, name: 'Auto', balance: 300, payment_amount: 50, next_payment_date: TODAY, connected_payment_source: 'bank_account' },
    { id: 6, name: 'Done', balance: 0, payment_amount: 50, next_payment_date: TODAY },
  ] });
  assert.deepEqual(list.map((x) => x.title), ['Car payment due today', 'Last one payment due in 2 days', 'No amount payment due today']);
  assert.match(list[0].body, /400\.00 to pay/); assert.match(list[1].body, /120\.00 to pay/); assert.match(list[2].body, /300\.00 to pay/);
});

test('due: a bill is brought forward from an old date by its own rhythm', () => {
  const bill = (name, frequency, next_date, more = {}) => ({ id: name, name, key: name.toLowerCase(), amount: 60, frequency, next_date, status: 'active', ...more });
  assert.deepEqual(titles({ bills: [
    bill('Weekly', 'weekly', '2026-10-31'),        // +7 x3 = Nov 21
    bill('Biweekly', 'biweekly', '2026-10-26'),    // +14 x2 = Nov 23
    bill('Monthly', 'monthly', '2026-08-21'),
    bill('Quarterly', 'quarterly', '2026-05-23'),
    bill('Yearly', 'yearly', '2024-11-21'),
    bill('Offbeat', 'weekly', '2026-11-01'),       // lands on Nov 22: not today, not in 2 days
    bill('Later', 'monthly', '2026-12-21'),        // a future date is left alone
  ] }), ['Weekly due today', 'Biweekly due in 2 days', 'Monthly due today', 'Quarterly due in 2 days', 'Yearly due today']);
});

test('due: stopped bills, bills with reminders off and bills without a date stay quiet', () => {
  const b = { id: 1, name: 'Hydro', key: 'hydro', amount: 60, frequency: 'monthly', next_date: TODAY, status: 'active' };
  assert.deepEqual(titles({ bills: [b] }), ['Hydro due today']);
  assert.deepEqual(titles({ bills: [{ ...b, status: 'stopped' }, { ...b, remind: false }, { ...b, next_date: null }, { ...b, next_date: '' }] }), []);
  assert.deepEqual(titles({ bills: [{ ...b, remind: true }, { ...b, id: 2, remind: undefined }] }), ['Hydro due today', 'Hydro due today']);
  assert.match(due({ bills: [{ ...b, payment_method_name: 'TD Chequing' }] })[0].body, /60\.00 from TD Chequing/);
});

test('due: a bill already recorded is quiet only when merchant, date and amount all fit', () => {
  const b = { id: 1, name: 'Hydro', key: 'hydroone', amount: 100, frequency: 'monthly', next_date: TODAY, status: 'active' };
  const tx = (more) => ({ type: 'expense', description: 'HYDRO ONE #4411', amount: 100, date: TODAY, status: 'active', ...more });
  const quiet = (t) => titles({ bills: [b], transactions: [t] }).length === 0;
  assert.ok(quiet(tx({})));
  assert.ok(quiet(tx({ date: '2026-11-17', amount: 115 })));        // 4 days early, 15% more
  assert.ok(quiet(tx({ date: '2026-11-25', amount: 85 })));         // 4 days late, 15% less
  assert.ok(!quiet(tx({ date: '2026-11-16' })), '5 days away is last month\'s or another payment');
  assert.ok(!quiet(tx({ amount: 116 })), 'more than 15% off is a different charge');
  assert.ok(!quiet(tx({ amount: 84 })));
  assert.ok(!quiet(tx({ description: 'Enbridge Gas' })));
  assert.ok(!quiet(tx({ status: 'undone' })));
  assert.ok(!quiet(tx({ status: 'deleted' })));
  assert.ok(!quiet(tx({ type: 'income' })));
  assert.ok(!quiet(tx({ date: null })));
});

test('due: a bill on the 31st falls on the last day of a shorter month and returns to the 31st after it', () => {
  const b = { id: 1, name: 'Rent', key: 'rent', amount: 1500, frequency: 'monthly', next_date: '2026-01-31', status: 'active' };
  const on = (day) => push.dueFor((t) => (t === 'bills' ? [b] : []), day, 'never').length === 1;
  assert.ok(on('2026-02-28'), 'February has no 31st: due on the 28th');
  assert.ok(on('2026-04-30'), 'April has no 31st: due on the 30th');
  assert.ok(on('2026-03-31'), 'March has a 31st: due on the 31st again, not the 28th');
  assert.ok(!on('2026-03-28'));
});

test('due: nothing set up means nothing due', () => {
  assert.deepEqual(due({}), []);
  assert.deepEqual(due({ credit_cards: [], loans: [], bills: [], transactions: [] }), []);
});

// ---------- reports (the app's own code, loaded as-is) ----------
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = path.join(here, '..', '..');
const cache = path.join(root, 'node_modules', '.cache');
fs.mkdirSync(cache, { recursive: true });
const lib = fs.mkdtempSync(path.join(cache, 'finance-edges-'));
for (const f of ['reportHelpers.js', 'helpers.js', 'spending.js', 'categoryRules.js']) {
  const src = fs.readFileSync(path.join(root, 'src', 'utils', f), 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.mjs'");
  fs.writeFileSync(path.join(lib, f.replace('.js', '.mjs')), src);
}
const R = await import(pathToFileURL(path.join(lib, 'reportHelpers.mjs')));
test.after(() => fs.rmSync(lib, { recursive: true, force: true }));

test('report periods: last month is the calendar month before, on any day of the month', () => {
  const on = (y, m, d) => R.getDateRangePreset('lastMonth', new Date(y, m - 1, d));
  assert.deepEqual(on(2026, 3, 31), { startDate: '2026-02-01', endDate: '2026-02-28' });
  assert.deepEqual(on(2026, 3, 1), { startDate: '2026-02-01', endDate: '2026-02-28' });
  assert.deepEqual(on(2026, 5, 31), { startDate: '2026-04-01', endDate: '2026-04-30' });
  assert.deepEqual(on(2026, 1, 15), { startDate: '2025-12-01', endDate: '2025-12-31' });
  assert.deepEqual(on(2028, 3, 30), { startDate: '2028-02-01', endDate: '2028-02-29' });
  assert.deepEqual(R.getDateRangePreset('thisMonth', new Date(2026, 1, 10)), { startDate: '2026-02-01', endDate: '2026-02-28' });
  assert.deepEqual(R.getDateRangePreset('thisYear', new Date(2026, 6, 4)), { startDate: '2026-01-01', endDate: '2026-12-31' });
  assert.deepEqual(R.getDateRangePreset('allTime', new Date(2026, 10, 23)), { startDate: '2000-01-01', endDate: '2026-11-23' });
  assert.deepEqual(R.getDateRangePreset('nonsense', new Date(2026, 10, 23)), R.getDateRangePreset('last30', new Date(2026, 10, 23)));
});

test('reports count a transaction once: undone and replaced ones are left out, and the last day of the range is in', () => {
  const tx = (more) => ({ type: 'expense', amount: 10, date: '2026-11-23', status: 'active', ...more });
  const list = [tx({ id: 1 }), tx({ id: 2, status: 'undone' }), tx({ id: 3, status: 'deleted' }), tx({ id: 4, date: '2026-11-23T18:30:00.000Z' }),
    tx({ id: 5, date: '2026-11-24' }), tx({ id: 6, date: '2026-10-31' }), tx({ id: 7, date: '2026-11-01' })];
  const got = R.filterTransactions(list, { startDate: '2026-11-01', endDate: '2026-11-23' }).map((t) => t.id);
  assert.deepEqual(got, [1, 4, 7]);
});

test('chart axis money stays readable for small and large amounts', () => {
  assert.deepEqual([0, 40, 149.6, 999, 1000, 1250, 9960, 15000, 125400, -75, -2500].map(R.axisMoney),
    ['$0', '$40', '$150', '$999', '$1k', '$1.3k', '$10k', '$15k', '$125k', '-$75', '-$2.5k']);
  assert.equal(R.axisMoney('abc'), '$0');
});

test('scan: a purchase in another currency that is already saved is recognised, whichever amount the picture shows', () => {
  const ctx = { bankAccounts: [], creditCards: [{ id: 'v1', name: 'Visa', last4: '4321' }], transactions: [
    { id: 't1', status: 'active', type: 'expense', payment_method_id: 'v1', description: 'AMAZON.COM', amount: 14, original_amount: 10, original_currency: 'USD', date: '2026-11-21' },
    { id: 't2', status: 'active', type: 'expense', payment_method_id: 'v1', description: 'STEAM', amount: 20, date: '2026-11-21' },
  ] };
  const read = (lines) => reader.plan({ kind: 'transactions', accounts: [{ name: 'Visa', last4: '4321', type: 'credit_card' }], lines }, ctx, 'src').lines;
  const line = (more) => ({ date: '2026-11-21', merchant: 'AMAZON.COM', amount: 10, direction: 'out', type: 'purchase', currency: 'USD', ...more });
  const [onlyUsd, both, otherAmount, otherCurrency, plain] = read([line({}), line({ amount: 14.3, original_amount: 10 }), line({ amount: 11 }), line({ currency: 'EUR' }),
    { date: '2026-11-21', merchant: 'STEAM', amount: 10, direction: 'out', type: 'purchase' }]);
  assert.deepEqual([onlyUsd.action, onlyUsd.existing_id], ['already', 't1']);        // shown only in USD
  assert.deepEqual([both.action, both.existing_id], ['already', 't1']);              // the card charged a little more than the day's rate
  assert.equal(otherAmount.action, 'record');                                         // a different purchase
  assert.equal(otherCurrency.action, 'record');                                       // 10 EUR is not 10 USD
  assert.equal(plain.action, 'record');                                               // 10 CAD is not the 20 CAD already saved
});

test('due: a date left in the past comes round again (a card each month, a loan by its rhythm)', () => {
  const on = (tables, day) => push.dueFor((t) => tables[t] || [], day, 'never').map((x) => x.date);
  const card = { credit_cards: [{ id: 1, name: 'Visa', balance: 80, due_date: '2026-08-31' }] };
  assert.deepEqual(on(card, '2026-09-30'), ['2026-09-30']);   // September has no 31st
  assert.deepEqual(on(card, '2026-10-31'), ['2026-10-31']);   // and it returns to the 31st
  assert.deepEqual(on(card, '2026-10-30'), []);
  const loan = (more) => ({ loans: [{ id: 1, name: 'Car', balance: 500, payment_amount: 100, next_payment_date: '2026-10-02', ...more }] });
  assert.deepEqual(on(loan({ frequency: 'biweekly' }), '2026-11-13'), ['2026-11-13']);
  assert.deepEqual(on(loan({ frequency: 'monthly' }), '2026-12-02'), ['2026-12-02']);
  assert.deepEqual(on(loan({ frequency: 'bimonthly' }), '2026-12-02'), ['2026-12-02']);
  assert.deepEqual(on(loan({ frequency: 'bimonthly' }), '2026-11-02'), []);
  assert.deepEqual(on(loan({}), '2026-11-02'), ['2026-11-02']);
});

test('reports: refunds come off spending, gift card loads are not spending, and a card payment is not taken off twice', () => {
  const tx = [
    { type: 'income', amount: 3000, date: '2026-11-01' },
    { type: 'expense', amount: 200, date: '2026-11-02', category_id: 'g', category_name: 'Groceries' },
    { type: 'refund', amount: 50, date: '2026-11-03', category_id: 'g', category_name: 'Groceries' },
    { type: 'expense', amount: 40, date: '2026-11-04', category_id: 'd', category_name: 'Dining' },
    { type: 'refund', amount: 40, date: '2026-11-05', category_id: 'd', category_name: 'Dining' },
    { type: 'expense', amount: 100, date: '2026-11-06', gift_card_id: 'gc', category_id: 's', category_name: 'Shopping' },
    { type: 'credit_card_payment', amount: 150, date: '2026-11-10', card_id: 'v' },
    { type: 'payment', amount: 60, date: '2026-11-11', card_id: 'v' },
    { type: 'loan_payment', amount: 400, date: '2026-11-12', loan_id: 'l' },
    { type: 'payment', amount: 100, date: '2026-11-13', loan_id: 'l' },
    { type: 'expense', amount: 999, date: '2026-11-14', status: 'undone', category_id: 'g' },
  ];
  const sum = R.calculateSummary(tx);
  assert.deepEqual([sum.totalIncome, sum.totalExpenses, sum.totalPayments, sum.cardPayments, sum.netCashflow], [3000, 150, 710, 210, 2350]);
  assert.deepEqual(R.groupByCategory(tx, []).map((c) => [c.name, c.total]), [['Groceries', 150]]);
  const month = R.groupByTimePeriod(tx, 'monthly')[0];
  assert.deepEqual([month.income, month.expenses, month.payments, month.net], [3000, 150, 710, 2350]);
});

test('reports by payment method: spending and payments only, refunds come off, transfers are left out', () => {
  const tx = [
    { type: 'expense', amount: 100, payment_method: 'credit_card' },
    { type: 'refund', amount: 30, payment_method: 'credit_card' },
    { type: 'transfer', amount: 500, payment_method: 'bank_account' },
    { type: 'adjustment', amount: 20, payment_method: 'bank_account' },
    { type: 'income', amount: 900, payment_method: 'bank_account' },
    { type: 'loan_payment', amount: 250, payment_method: 'bank_account' },
  ];
  assert.deepEqual(R.groupByPaymentMethod(tx).map((m) => [m.method, m.total]), [['bank_account', 250], ['credit_card', 70]]);
});

test('days until a date are whole calendar days, also across the day the clocks change', async () => {
  const was = process.env.TZ;
  process.env.TZ = 'America/Toronto';
  try {
    const H = await import(pathToFileURL(path.join(lib, 'helpers.mjs')));
    // Clocks go back on 1 November 2026 and forward on 14 March 2027.
    assert.equal(H.getDaysUntil('2026-11-03', new Date(2026, 9, 30, 15)), 4);
    assert.equal(H.getDaysUntil('2026-10-30', new Date(2026, 10, 3, 9)), -4);
    assert.equal(H.getDaysUntil('2027-03-16', new Date(2027, 2, 12, 23)), 4);
    assert.equal(H.getDaysUntil('2027-03-12', new Date(2027, 2, 16)), -4);
    assert.equal(H.getDaysUntil('2026-11-23T00:00:00.000Z', new Date(2026, 10, 23, 22)), 0);
    assert.equal(H.getDaysUntil('2026-11-24', new Date(2026, 10, 23)), 1);
  } finally { if (was === undefined) delete process.env.TZ; else process.env.TZ = was; }
});

test('pay slip: deposits are matched to accounts, the remainder is the main one, and percentages become amounts', () => {
  const reader = mod('reader.js');
  const accounts = [{ id: 'a', name: 'TD Chequing', last4: '1234' }, { id: 'b', name: 'EQ Savings' }, { id: 'c', name: 'Tangerine' }];
  const p = reader.planPay({ employer: 'Acme Corp', net_pay: 2000, gross_pay: 2900, pay_date: '2026-11-20', frequency: 'biweekly',
    deposits: [{ bank: 'EQ Bank', last4: null, amount: 300 }, { bank: 'Toronto Dominion', last4: '991234', remainder: true }, { bank: 'Unknown CU', last4: '7777', percent: 10 }] }, accounts);
  assert.deepEqual([p.source, p.amount, p.gross, p.date, p.frequency], ['Acme Corp', 2000, 2900, '2026-11-20', 'biweekly']);
  assert.deepEqual(p.parts.map((x) => [x.account && x.account.id, x.amount, x.rest]), [['a', 1500, true], [null, 300, false], [null, 200, false]]);
  assert.equal(p.parts[2].hint, 'Unknown CU ending 7777');
  // With no remainder marked the largest is the main one; a rhythm or date that is not clear is left for the person.
  const q = reader.planPay({ net_pay: 1000, pay_date: 'Friday', frequency: 'fortnightly', deposits: [{ bank: 'Tangerine', amount: 200 }, { bank: 'EQ Savings', amount: 800 }] }, accounts);
  assert.deepEqual([q.date, q.frequency, q.source], [null, null, null]);
  assert.deepEqual(q.parts.map((x) => [x.account.id, x.amount]), [['b', 800], ['c', 200]]);
  assert.deepEqual(reader.planPay({}, accounts).parts, []);
});

test('bank files (CSV): lines come straight from the file, whatever its layout', () => {
  const csv = mod('csv.js');
  // No header, money out and money in in their own columns, then the balance (TD).
  const td = csv.parse('11/03/2026,TIM HORTONS #12,4.50,,995.50\n11/04/2026,"PAYROLL, ACME",,2000.00,2995.50\n11/15/2026,RENT,1500.00,,1495.50\n');
  assert.deepEqual(td.lines.map((l) => [l.date, l.merchant, l.amount, l.direction]),
    [['2026-11-03', 'TIM HORTONS #12', 4.5, 'out'], ['2026-11-04', 'PAYROLL, ACME', 2000, 'in'], ['2026-11-15', 'RENT', 1500, 'out']]);
  // A header and one signed amount, newest first, with a running balance that settles which sign is spending.
  const one = csv.parse('Date,Description,Amount,Balance\n2026-11-05,Refund,"$20.00","$1,015.50"\n2026-11-04,Groceries,-80.00,995.50\n2026-11-03,Coffee,(4.50),"1,075.50"\n');
  assert.deepEqual(one.lines.map((l) => [l.merchant, l.amount, l.direction]), [['Refund', 20, 'in'], ['Groceries', 80, 'out'], ['Coffee', 4.5, 'out']]);
  assert.match(one.notes.join(' '), /running balance/);
  // A card file where purchases carry no minus sign: most lines are spending.
  const card = csv.parse('Transaction Date;Posted Date;Merchant;Amount\n20/11/2026;21/11/2026;UBER;12,00\n');
  assert.equal(card.lines.length, 0); // a decimal comma is not read as dollars: the row is left out, not guessed
  const amex = csv.parse('Date,Description,Amount\n13/11/2026,UBER,12.00\n14/11/2026,NETFLIX,18.99\n15/11/2026,PAYMENT RECEIVED,-500.00\n');
  assert.deepEqual(amex.lines.map((l) => [l.date, l.direction]), [['2026-11-13', 'out'], ['2026-11-14', 'out'], ['2026-11-15', 'in']]); // the day comes first: 13 cannot be a month
  assert.match(amex.notes.join(' '), /without a minus sign/);
  // Dates that could be read two ways are read month first, and the person is told.
  assert.match(csv.parse('Date,Description,Debit,Credit\n03/04/2026,Shop,5.00,\n').notes.join(' '), /month\/day\/year/);
  // Rows with no date or amount are counted, not invented.
  const good = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')},Shop ${i},5.00,`).join('\n');
  const rough = csv.parse(`Date,Description,Debit,Credit\n${good}\n2026-02-30,Bad day,5.00,\nTotal,,150.00,\n2026-11-02,No amount,,\n`);
  assert.deepEqual([rough.lines.length, rough.skipped], [30, 3]);
  assert.match(csv.parse('Name,Note\nA,B\n').notes.join(' '), /No column of dates/);
  assert.deepEqual(csv.parse('').lines, []);
  assert.deepEqual([csv.money('1,234.56'), csv.money('(12.00)'), csv.money('12.00 CR'), csv.money('$-3'), csv.money('abc'), csv.money('')], [1234.56, -12, 12, -3, null, null]);
});

test('statement: the opening balance and the lines must give the closing balance', () => {
  const reader = mod('reader.js');
  const ctx = { bankAccounts: [{ id: 'chq', name: 'TD Chequing', balance: 0 }], creditCards: [{ id: 'visa', name: 'TD Visa', balance: 0 }], transactions: [] };
  const lines = [{ date: '2026-10-03', merchant: 'Shop', amount: 40, direction: 'out' }, { date: '2026-10-10', merchant: 'Pay', amount: 100, direction: 'in' }];
  const st = (name, open, close) => ({ kind: 'statement', statement: { account_name: name, period_start: '2026-10-01', period_end: '2026-10-31', opening_balance: open, closing_balance: close }, accounts: [], lines });
  assert.deepEqual(reader.plan(st('TD Chequing', 500, 560), ctx, 's').statement.check, { adds_up: true, expected: 560, off: 0, lines: 2 });
  assert.deepEqual(reader.plan(st('TD Chequing', 500, 548.01), ctx, 's').statement.check, { adds_up: false, expected: 560, off: -11.99, lines: 2 });
  // A card: charges raise what is owed, payments lower it.
  assert.deepEqual(reader.plan(st('TD Visa', 300, 240), ctx, 's').statement.check, { adds_up: true, expected: 240, off: 0, lines: 2 });
  assert.equal(reader.plan(st('TD Visa', null, 240), ctx, 's').statement.check, undefined);
});
