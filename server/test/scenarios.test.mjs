// Personal finance scenarios, run against a throwaway database through the same code the app uses
// (src/utils/money.js and src/utils/server.js talking to server/server.js). No Google, no Gemini: the screenshot
// reader is given a fixed reading. Run: npm run test:scenarios
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.NODE_ENV = 'development';
process.env.DEV_USER = 'scenario@test.local';
process.env.READER_STUB = path.join(tmp, 'reading.json');
delete process.env.GEMINI_API_KEY;
delete process.env.ALLOWED_EMAILS;
process.env.GEMINI_CHECK_STUB = 'GOODKEY_abcdefghijklmnopqrstuvwxyz';

const require = createRequire(import.meta.url);
const { server } = require(path.join(root, 'server', 'server.js'));
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

// The browser code, loaded as-is in a module copy, with fetch pointed at the test server.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const realFetch = globalThis.fetch;
globalThis.fetch = (u, o) => realFetch(String(u).startsWith('/') ? base + u : u, o);
const lib = path.join(tmp, 'lib'); fs.mkdirSync(lib);
for (const f of ['server.js', 'money.js', 'helpers.js', 'finance.js']) {
  const src = fs.readFileSync(path.join(root, 'src', 'utils', f), 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.mjs'");
  fs.writeFileSync(path.join(lib, f.replace('.js', '.mjs')), src);
}
const { server: client, api } = await import(pathToFileURL(path.join(lib, 'server.mjs')));
const M = await import(pathToFileURL(path.join(lib, 'money.mjs')));
const F = await import(pathToFileURL(path.join(lib, 'finance.mjs')));
await client.auth.devSignIn();

const db = client;
const get = async (t, id) => (await db.from(t).select('*').eq('id', id).single()).data;
let cashAcct;
const cash = async () => Number((await get('bank_accounts', cashAcct.id)).balance);
const CASH = () => `bank_account:${cashAcct.id}`;
async function accounts() {
  const [b, c, l] = await Promise.all(['bank_accounts', 'credit_cards', 'loans'].map((t) => db.from(t).select('*')));
  return { bankAccounts: b.data, creditCards: c.data, loans: l.data };
}
const add = async (t, v) => (await db.from(t).insert(v).select().single()).data;

let chq, sav, card, gift, loan;
test('setup: accounts with opening balances', async () => {
  chq = await add('bank_accounts', { name: 'Chequing', balance: 1000, allows_overdraft: true, overdraft_limit: 200, is_primary: true });
  sav = await add('bank_accounts', { name: 'Savings', balance: 5000, allows_overdraft: false });
  card = await add('credit_cards', { name: 'Visa', balance: 0, credit_limit: 3000, last4: '4321' });
  gift = await add('credit_cards', { name: 'Coffee gift card', balance: 25, is_gift_card: true });
  cashAcct = await add('bank_accounts', { name: 'Cash', account_type: 'cash', balance: 0 });
  loan = await add('loans', { name: 'Car loan', balance: 8000, payment_amount: 400, frequency: 'monthly', next_payment_date: '2026-11-01' });
  await M.recordAdjustment({ target: CASH(), newBalance: 60, current: 0, date: '2026-11-01' }, await accounts());
  assert.equal(await cash(), 60);
});

test('expense from a bank account lowers it once; amounts add up in cents', async () => {
  const a = await accounts();
  await M.recordExpense({ amount: 0.1, source: `bank_account:${chq.id}`, date: '2026-11-02', description: 'Gum' }, a);
  await M.recordExpense({ amount: 0.2, source: `bank_account:${chq.id}`, date: '2026-11-02', description: 'Gum' }, a);
  assert.equal((await get('bank_accounts', chq.id)).balance, 999.7);
});

test('card purchase raises what is owed; card payment from bank lowers both', async () => {
  let a = await accounts();
  await M.recordExpense({ amount: 120.55, source: `credit_card:${card.id}`, date: '2026-11-03', description: 'Groceries' }, a);
  assert.equal((await get('credit_cards', card.id)).balance, 120.55);
  a = await accounts();
  await M.recordCardPayment({ cardId: card.id, amount: 100, source: `bank_account:${chq.id}`, date: '2026-11-04' }, a);
  assert.equal((await get('credit_cards', card.id)).balance, 20.55);
  assert.equal((await get('bank_accounts', chq.id)).balance, 899.7);
});

test('overpaying a card leaves a credit on the card', async () => {
  await M.recordCardPayment({ cardId: card.id, amount: 30.55, source: `bank_account:${chq.id}`, date: '2026-11-05' }, await accounts());
  assert.equal((await get('credit_cards', card.id)).balance, -10);
});

test('refund to a card lowers what is owed', async () => {
  await M.recordRefund({ amount: 5, target: `credit_card:${card.id}`, date: '2026-11-05', description: 'Returned item' }, await accounts());
  assert.equal((await get('credit_cards', card.id)).balance, -15);
});

test('gift card cannot be spent below zero; nothing is saved when refused', async () => {
  const before = (await db.from('transactions').select('*')).data.length;
  await assert.rejects(M.recordExpense({ amount: 30, source: `credit_card:${gift.id}`, date: '2026-11-06', description: 'Coffee' }, await accounts()), /below its limit/);
  assert.equal((await get('credit_cards', gift.id)).balance, 25);
  assert.equal((await db.from('transactions').select('*')).data.length, before);
});

test('overdraft: allowed up to the limit, refused past it', async () => {
  const a = await accounts();
  await M.recordExpense({ amount: 1000, source: `bank_account:${chq.id}`, date: '2026-11-06', description: 'Rent' }, a); // 869.15 -> -130.85
  assert.equal((await get('bank_accounts', chq.id)).balance, -130.85);
  await assert.rejects(M.recordExpense({ amount: 100, source: `bank_account:${chq.id}`, date: '2026-11-06', description: 'Too much' }, a), /below its limit/);
  assert.equal((await get('bank_accounts', chq.id)).balance, -130.85);
});

test('savings without overdraft refuses going below zero', async () => {
  await assert.rejects(M.recordExpense({ amount: 6000, source: `bank_account:${sav.id}`, date: '2026-11-06' }, await accounts()), /below its limit/);
});

test('cash: spend, cannot go below zero', async () => {
  const a = await accounts();
  await M.recordExpense({ amount: 15, source: CASH(), date: '2026-11-07', description: 'Lunch' }, a);
  assert.equal(await cash(), 45);
  await assert.rejects(M.recordExpense({ amount: 50, source: CASH(), date: '2026-11-07' }, a), /below its limit/);
  // The server keeps cash at zero or more even when the request carries no limit.
  await assert.rejects(api('/api/money', { legs: [{ table: 'bank_accounts', id: cashAcct.id, delta: -500 }], rows: [] }), /below its limit/);
  // The old cash setting is gone as a way to move money.
  assert.throws(() => M.parseSource('cash_in_hand'), /Cash is an account now/);
});

test('income into a bank account, and the same scheduled occurrence twice deposits once', async () => {
  const a = await accounts();
  const step = { amount: 2500, target: `bank_account:${chq.id}`, date: '2026-11-15', source_name: 'Salary', key: 'income-schedule:s1:2026-11-15' };
  const [r1, r2] = await Promise.all([M.recordIncome(step, a), M.recordIncome(step, a)]); // two tabs at once
  assert.equal((await get('bank_accounts', chq.id)).balance, 2369.15);
  assert.equal([r1, r2].filter((r) => r.repeated).length, 1);
});

test('transfer between accounts moves both sides together', async () => {
  await M.recordTransfer({ amount: 300, from: `bank_account:${chq.id}`, to: `bank_account:${sav.id}`, date: '2026-11-16' }, await accounts());
  assert.equal((await get('bank_accounts', chq.id)).balance, 2069.15);
  assert.equal((await get('bank_accounts', sav.id)).balance, 5300);
  await assert.rejects(M.recordTransfer({ amount: 1, from: `bank_account:${sav.id}`, to: `bank_account:${sav.id}` }, await accounts()), /two different/);
});

test('loan payment lowers the loan; paying more than owed is refused', async () => {
  const a = await accounts();
  await M.recordLoanPayment({ loanId: loan.id, amount: 400, source: `bank_account:${sav.id}`, date: '2026-11-17' }, a);
  assert.equal((await get('loans', loan.id)).balance, 7600);
  await assert.rejects(M.recordLoanPayment({ loanId: loan.id, amount: 9000, source: `bank_account:${sav.id}`, date: '2026-11-17' }, a), /below its limit/);
  assert.equal((await get('bank_accounts', sav.id)).balance, 4900);
});

test('undo puts money back on the original account, not the primary one, and is safe to repeat', async () => {
  const r = await M.recordIncome({ amount: 50, target: `bank_account:${sav.id}`, date: '2026-11-18', source_name: 'Side job' }, await accounts());
  assert.equal((await get('bank_accounts', sav.id)).balance, 4950);
  await M.reverseTransaction(r.transaction.id);
  await M.reverseTransaction(r.transaction.id);
  assert.equal((await get('bank_accounts', sav.id)).balance, 4900);
  assert.equal((await get('bank_accounts', chq.id)).balance, 2069.15);
  assert.equal((await get('transactions', r.transaction.id)).status, 'undone');
});

test('undo of a payment that took an account into overdraft is not clamped at zero', async () => {
  const before = (await get('bank_accounts', chq.id)).balance;
  const r = await M.recordExpense({ amount: 2200, source: `bank_account:${chq.id}`, date: '2026-11-18' }, await accounts());
  assert.equal((await get('bank_accounts', chq.id)).balance, -130.85);
  await M.reverseTransaction(r.transaction.id);
  assert.equal((await get('bank_accounts', chq.id)).balance, before);
});

test('editing an amount reverses the old one and records the new one in one step', async () => {
  const a = await accounts();
  const r = await M.recordExpense({ amount: 40, source: `bank_account:${sav.id}`, date: '2026-11-19', description: 'Dinner' }, a);
  await M.replaceTransaction(r.transaction.id, () => M.recordExpense({ amount: 45, source: `bank_account:${sav.id}`, date: '2026-11-19', description: 'Dinner' }, a));
  assert.equal((await get('bank_accounts', sav.id)).balance, 4855);
  // A refused edit leaves the old transaction in place.
  const r2 = await M.recordExpense({ amount: 10, source: CASH(), date: '2026-11-19' }, a);
  await assert.rejects(M.replaceTransaction(r2.transaction.id, () => M.recordExpense({ amount: 999, source: CASH(), date: '2026-11-19' }, a)));
  assert.equal((await get('transactions', r2.transaction.id)).status, 'active');
  assert.equal(await cash(), 35);
});

test('a transaction that moved money cannot be deleted without undoing it', async () => {
  const r = await M.recordExpense({ amount: 1, source: CASH(), date: '2026-11-19' }, await accounts());
  const { error } = await db.from('transactions').delete().eq('id', r.transaction.id);
  assert.match(error.message, /Undo this transaction first/);
});

test('users cannot see or change each other\'s rows', async () => {
  const { token } = await api('/api/dev-login', { email: 'someone.else@test.local' });
  const as = (body, url = '/api/db') => realFetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
  assert.equal((await as({ table: 'bank_accounts', action: 'select' })).data.length, 0);
  assert.equal((await as({ table: 'bank_accounts', action: 'update', filters: [['id', 'eq', chq.id]], values: { balance: 0 } })).data.length, 0);
  assert.equal((await as({ legs: [{ table: 'bank_accounts', id: chq.id, delta: -100 }] }, '/api/money')).status, 404);
  assert.equal((await as({ table: 'bank_accounts', action: 'insert', values: { id: chq.id, name: 'x' } })).status, 409);
  assert.equal((await as({ table: 'users', action: 'select' })).status, 400);
  const anon = await realFetch(base + '/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'bank_accounts', action: 'select' }) });
  assert.equal(anon.status, 401);
  assert.equal((await get('bank_accounts', chq.id)).balance, 2069.15);
});

test('screenshot: lines matched by card number, repeats in one shot kept, overlap with an earlier shot not double counted', async () => {
  const reading = {
    kind: 'transactions',
    accounts: [{ name: 'VISA', last4: '4321', type: 'credit_card', balance: 33.5 }],
    lines: [
      { date: '2026-11-20', merchant: 'Tim Hortons', amount: 2.5, direction: 'out', pending: false, last4: '4321' },
      { date: '2026-11-20', merchant: 'Tim Hortons', amount: 2.5, direction: 'out', pending: false, last4: '4321' },
      { date: '2026-11-20', merchant: 'Uber', amount: 18, direction: 'out', pending: true, last4: '4321' },
    ],
  };
  fs.writeFileSync(process.env.READER_STUB, JSON.stringify(reading));
  const p = await api('/api/read-screenshot', { image: 'aGVsbG8=', mime: 'image/png' });
  assert.equal(p.lines.length, 3);
  assert.ok(p.lines.every((l) => l.account && String(l.account.id) === String(card.id)));
  assert.notEqual(p.lines[0].key, p.lines[1].key);
  const record = async (lines) => {
    for (const l of lines.filter((x) => x.action === 'record')) {
      await M.recordExpense({ amount: l.amount, source: `credit_card:${l.account.id}`, date: l.date, description: l.merchant, key: l.key, extra: { pending: l.pending } }, await accounts());
    }
  };
  await record(p.lines);
  const owed = (await get('credit_cards', card.id)).balance;
  assert.equal(owed, -15 + 23);
  // The next screenshot overlaps: same two coffees, and the Uber line has posted two days later.
  reading.lines[2] = { date: '2026-11-22', merchant: 'Uber', amount: 18, direction: 'out', pending: false, last4: '4321' };
  reading.lines.push({ date: '2026-11-22', merchant: 'Pharmacy', amount: 12, direction: 'out', pending: false, last4: '4321' });
  fs.writeFileSync(process.env.READER_STUB, JSON.stringify(reading));
  const p2 = await api('/api/read-screenshot', { image: 'aGVsbG8y', mime: 'image/png' });
  assert.equal(p2.lines.find((l) => l.merchant === 'Uber').action, 'mark_posted');
  await record(p2.lines); // the coffees come back with the same keys: once-only
  assert.equal((await get('credit_cards', card.id)).balance, owed + 12);
  // The card's balance on the screenshot differs from the app's: offered as a correction.
  assert.equal(p2.balances.length, 1);
});

test('screenshot without a Gemini key says so plainly', async () => {
  const saved = process.env.READER_STUB; delete process.env.READER_STUB;
  await assert.rejects(api('/api/read-screenshot', { image: 'aGVsbG8=', mime: 'image/png' }), /not set up/);
  process.env.READER_STUB = saved;
  await assert.rejects(api('/api/read-screenshot', { image: 'aGVsbG8=', mime: 'application/zip' }), /statement PDF/);
});


test('mortgage: semi-annual compounding, each payment splits into interest and principal, undo puts back only what moved', async () => {
  // 400,000 at 5% compounded twice a year, paid monthly: monthly rate (1.025)^(1/6)-1 = 0.4123915%
  const mtg = await add('loans', { name: 'Mortgage', loan_type: 'mortgage', balance: 400000, interest_rate: 5, frequency: 'monthly', payment_amount: 2326.38, next_payment_date: '2026-12-01' });
  const rate = F.periodicRate(mtg);
  assert.ok(Math.abs(rate - 0.004123915) < 1e-8);
  const big = await add('bank_accounts', { name: 'Joint', balance: 10000 });
  const r = await M.recordLoanPayment({ loanId: mtg.id, amount: 2326.38, source: `bank_account:${big.id}`, date: '2026-12-01' }, await accounts());
  assert.equal(r.transaction.interest_amount, 1649.57);
  assert.equal(r.transaction.principal_amount, 676.81);
  assert.equal((await get('loans', mtg.id)).balance, 399323.19);
  assert.equal((await get('bank_accounts', big.id)).balance, 7673.62);
  await M.reverseTransaction(r.transaction.id);
  assert.equal((await get('loans', mtg.id)).balance, 400000);
  assert.equal((await get('bank_accounts', big.id)).balance, 10000);
  // That payment pays the mortgage off in about 25 years.
  const plan = F.amortize({ ...mtg, balance: 400000 });
  assert.ok(plan.rows.length >= 299 && plan.rows.length <= 301, 'payments: ' + plan.rows.length);
  assert.equal(plan.neverPaysOff, false);
  // A payment smaller than the interest never pays off; the plan says so.
  assert.equal(F.amortize({ ...mtg, payment_amount: 1000 }).neverPaysOff, true);
});

test('a loan without a rate: the whole payment lowers the balance', async () => {
  assert.equal(F.periodicRate(loan), 0);
});

test('investments: contributions move money, market value is a dated snapshot with history', async () => {
  const T = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  const tfsa = await add('investments', { name: 'TFSA', kind: 'tfsa', balance: 20000, balance_as_of: '2026-10-01' });
  assert.equal(tfsa.balance_as_of, '2026-10-01');
  await M.recordTransfer({ amount: 500, from: `bank_account:${sav.id}`, to: `investment:${tfsa.id}`, date: '2026-11-20' }, await accounts());
  assert.equal((await get('investments', tfsa.id)).balance, 20500);
  // The market moved: the user states the new value from the broker app.
  await db.from('investments').update({ balance: 21234.56, balance_as_of: T }).eq('id', tfsa.id);
  const pts = (await db.from('balance_points').select('*').eq('account_id', tfsa.id).order('date')).data;
  // One point per day, the day's last figure wins: the October opening value, then today's stated value.
  assert.deepEqual(pts.map((p) => [p.date, p.value]), [['2026-10-01', 20000], [T, 21234.56]]);
  const { error } = await db.from('balance_points').insert({ account_id: 'x', value: 1 });
  assert.match(error.message, /kept by the server/);
});

test('where you stand: net worth, mortgage apart from other debt, out-of-date figures flagged', async () => {
  await add('assets', { name: 'House', kind: 'property', balance: 650000, balance_as_of: '2026-06-01' });
  const a = await accounts();
  const [inv, as] = await Promise.all(['investments', 'assets'].map((t) => db.from(t).select('*')));
  const p = F.position({ ...a, investments: inv.data, assets: as.data }, new Date(2026, 10, 21));
  const owed = a.loans.reduce((s, l) => s + l.balance, 0) + a.creditCards.filter((c) => !c.is_gift_card && c.balance > 0).reduce((s, c) => s + c.balance, 0)
    + a.bankAccounts.filter((b) => b.balance < 0).reduce((s, b) => s - b.balance, 0);
  assert.equal(Math.round(p.totalOwe * 100), Math.round(owed * 100));
  assert.equal(p.netWorth, Math.round((p.totalHave - p.totalOwe) * 100) / 100);
  assert.equal(p.mortgage, 400000);
  assert.equal(p.debtExcludingMortgage, Math.round((p.totalOwe - 400000) * 100) / 100);
  assert.ok(p.stale.some((x) => x.name === 'House'), 'the house value from June is out of date');
  assert.ok(!p.stale.some((x) => x.name === 'TFSA'), 'the TFSA was updated today');
  assert.equal(p.upToDate, false);
  // Every account touched by a money step today carries today's date.
  assert.ok(a.bankAccounts.every((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.balance_as_of)));
});

test('month end: spendable now, plus pay due, minus payments due', async () => {
  const m = F.monthEnd({ liquid: 1000, incomeSchedules: [{ amount: 2500, next_date: '2026-11-28' }, { amount: 99, next_date: '2026-12-02' }],
    loans: [{ payment_amount: 400, next_payment_date: '2026-11-25' }], creditCards: [{ balance: 300, due_date: '2026-11-30', minimum_payment: 25 }] }, new Date(2026, 10, 21));
  assert.deepEqual([m.coming, m.going, m.atEnd], [2500, 425, 3075]);
});

test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('gemini key: owner sets it once, others refused, never returned', async () => {
  const GOOD = process.env.GEMINI_CHECK_STUB;
  const call = async (token, method, body) => {
    const r = await realFetch(base + '/api/gemini-key', { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body && JSON.stringify(body) });
    return { status: r.status, text: await r.text() };
  };
  const login = async (email) => (await (await realFetch(base + '/api/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })).json()).token;
  const owner = await login('scenario@test.local');
  const other = await login('someone.else@test.local');
  const keyFile = path.join(path.dirname(process.env.DB_PATH), 'gemini.key');
  try { fs.unlinkSync(keyFile); } catch {}

  assert.deepEqual(JSON.parse((await call(owner, 'GET')).text), { set: false, canSet: true });
  assert.deepEqual(JSON.parse((await call(other, 'GET')).text), { set: false, canSet: false });
  // Not the owner: refused.
  assert.equal((await call(other, 'POST', { key: GOOD })).status, 403);
  // A key Google would not accept: refused, nothing kept.
  assert.equal((await call(owner, 'POST', { key: 'BADKEY_abcdefghijklmnopqrstuvwxyz' })).status, 400);
  assert.equal(fs.existsSync(keyFile), false);
  // The owner sets it once.
  const ok = await call(owner, 'POST', { key: GOOD });
  assert.equal(ok.status, 200);
  assert.equal((fs.statSync(keyFile).mode & 0o777), 0o600);
  // A second set or change is refused, even by the owner.
  assert.equal((await call(owner, 'POST', { key: GOOD + 'x' })).status, 409);
  assert.equal(fs.readFileSync(keyFile, 'utf8'), GOOD);
  // No response carries the key or a piece of it.
  const cfg = await (await realFetch(base + '/api/config')).text();
  for (const t of [ok.text, cfg, (await call(owner, 'GET')).text, (await call(other, 'GET')).text, (await call(owner, 'POST', { key: GOOD })).text]) {
    assert.ok(!t.includes(GOOD.slice(0, 8)) && !t.includes(GOOD.slice(-8)), t);
  }
  assert.deepEqual(JSON.parse(cfg).ai, true);
  assert.deepEqual(JSON.parse((await call(owner, 'GET')).text), { set: true, canSet: false });
  fs.unlinkSync(keyFile);
});

test('screenshot draft: new card, salary, card payment, transfer, already recorded from the other side', () => {
  const { plan } = require(path.join(root, 'server', 'reader.js'));
  const ctx = {
    bankAccounts: [{ id: 'chq', name: 'Everyday Chequing', last4: '1111', balance: 2000 }, { id: 'sav', name: 'Savings', last4: '2222', balance: 5000 }],
    creditCards: [],
    transactions: [{ id: 't1', type: 'transfer', amount: 300, date: '2026-11-10', status: 'active', payment_method_id: 'chq', to_account_id: 'sav', description: 'Transfer' }],
  };
  // A card app the app does not know yet.
  const card = plan({ kind: 'transactions', accounts: [{ name: 'Amex Cobalt', last4: '3005', type: 'credit_card', balance: 812.4, credit_limit: 5000, due_date: '2026-12-05' }],
    lines: [
      { date: '2026-11-18', merchant: 'LOBLAWS', amount: 84.2, direction: 'out', type: 'purchase', category: 'Groceries' },
      { date: '2026-11-15', merchant: 'PAYMENT THANK YOU', amount: 500, direction: 'in', type: 'card_payment', other_account: 'Chequing 1111' },
    ] }, ctx, 's1');
  assert.equal(card.new_accounts.length, 1);
  assert.deepEqual([card.new_accounts[0].type, card.new_accounts[0].last4, card.new_accounts[0].balance, card.new_accounts[0].credit_limit, card.new_accounts[0].due_date], ['credit_card', '3005', 812.4, 5000, '2026-12-05']);
  assert.equal(card.lines[0].account.id, 'new:0');
  assert.equal(card.lines[0].kind, 'purchase');
  assert.equal(card.lines[0].category_guess, 'Groceries');
  assert.equal(card.lines[1].kind, 'card_payment');
  assert.equal(card.lines[1].other.id, 'chq');
  assert.ok(card.lines[0].key_rest);

  // A bank screenshot: pay is income with Salary, a move to savings is a transfer already recorded from the other account.
  const bank = plan({ kind: 'transactions', accounts: [{ name: 'Everyday Chequing', last4: '1111', type: 'chequing', balance: 2000 }],
    lines: [
      { date: '2026-11-14', merchant: 'ACME CORP PAYROLL', amount: 2500, direction: 'in', type: 'income', category: 'Salary' },
      { date: '2026-11-11', merchant: 'TFR TO SAVINGS', amount: 300, direction: 'out', type: 'transfer', other_account: 'Savings 2222' },
      { date: '2026-11-12', merchant: 'UNKNOWN', amount: 20, direction: 'out' },
    ] }, ctx, 's2');
  assert.equal(bank.new_accounts.length, 0);
  assert.deepEqual([bank.lines[0].kind, bank.lines[0].category_guess, bank.lines[0].account.id], ['income', 'Salary', 'chq']);
  assert.deepEqual([bank.lines[1].kind, bank.lines[1].other.id, bank.lines[1].action], ['transfer', 'sav', 'already']);
  assert.equal(bank.lines[2].kind, 'purchase');
  assert.equal(bank.lines[2].category_guess, null);
});

test('snapshots: the balance you saw is fixed; older lines are history; gaps are shown, not hidden', async () => {
  const T = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  const ago = (n) => { const d = new Date(T + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
  const acct = await add('bank_accounts', { name: 'Snap chequing', balance: 1000 });
  const src = `bank_account:${acct.id}`;
  // Seen 900 today: the 100 difference becomes an adjustment and today is the snapshot day.
  const s1 = await M.recordSnapshot({ target: src, value: 900, date: T, source: 'screenshot' });
  assert.equal(s1.snapshot.gap, -100);
  assert.equal(s1.snapshot.status, 'corrected');
  let a = await get('bank_accounts', acct.id);
  assert.deepEqual([a.balance, a.snapshot_date], [900, T]);
  // A purchase from five days ago, found later on a statement: kept as history, today's balance stays as seen.
  const old = await M.recordExpense({ amount: 50, source: src, date: ago(5), description: 'Old purchase' }, await accounts());
  assert.equal((await get('bank_accounts', acct.id)).balance, 900);
  assert.equal(old.transaction.history_only[0].amount, -50);
  await M.reverseTransaction(old.transaction.id);
  assert.equal((await get('bank_accounts', acct.id)).balance, 900);
  // A purchase today added by hand still counts; one from today's screenshot does not.
  await M.recordExpense({ amount: 20, source: src, date: T, description: 'Lunch' }, await accounts());
  assert.equal((await get('bank_accounts', acct.id)).balance, 880);
  await M.recordExpense({ amount: 7, source: src, date: T, description: 'Coffee', extra: { in_snapshot: true } }, await accounts());
  assert.equal((await get('bank_accounts', acct.id)).balance, 880);
  // Seen 870 without correcting: the balance stays, the 10 gap is open, the snapshot day does not move.
  const s2 = await M.recordSnapshot({ target: src, value: 870, date: T, source: 'bank app', apply: false });
  assert.deepEqual([s2.snapshot.status, s2.snapshot.gap], ['open', -10]);
  assert.equal((await get('bank_accounts', acct.id)).balance, 880);
  // The missing 10 is found and added: correcting now moves nothing more and closes the gap.
  await M.recordExpense({ amount: 10, source: src, date: T, description: 'Parking' }, await accounts());
  const r = await M.resolveSnapshot(s2.snapshot.id, 'correct');
  assert.equal(r.snapshot.status, 'ok');
  assert.equal((await get('bank_accounts', acct.id)).balance, 870);
  // A line recorded before the snapshot existed, then removed after it: today's balance stays as seen.
  const acct2 = await add('bank_accounts', { name: 'Snap two', balance: 500 });
  const early = await M.recordExpense({ amount: 30, source: `bank_account:${acct2.id}`, date: ago(3), description: 'Wrong line' }, await accounts());
  assert.equal((await get('bank_accounts', acct2.id)).balance, 470);
  await M.recordSnapshot({ target: `bank_account:${acct2.id}`, value: 470, date: T, source: 'bank app' });
  await M.reverseTransaction(early.transaction.id, { remove: true });
  assert.equal((await get('bank_accounts', acct2.id)).balance, 470);
  // A balance from an older statement never changes today's figure; it is checked against the app's history for that day.
  // Worked back from 870: minus today's lines (-20, -10 by hand; the in-snapshot coffee -7 as history), minus the corrections
  // (-100 on day T, then +0), plus the old purchase undone (nothing) -> 1000 + 7 = 1007 on that day.
  const s3 = await M.recordSnapshot({ target: src, value: 1234, date: ago(40), source: 'statement' });
  assert.equal(s3.snapshot.status, 'open_history');
  assert.equal(s3.snapshot.app_value, 1007);
  assert.equal(s3.snapshot.gap, 227);
  const s4 = await M.recordSnapshot({ target: src, value: 1007, date: ago(40), source: 'statement' });
  assert.equal(s4.snapshot.status, 'ok_history');
  assert.equal((await get('bank_accounts', acct.id)).balance, 870);
  // Snapshots are kept by the server only.
  const w = await db.from('snapshots').insert({ account_id: acct.id, value: 1 });
  assert.ok(w.error);
  // Cash works the same way.
  const c = await M.recordSnapshot({ target: CASH(), value: 75, date: T, source: 'counted' });
  assert.equal(c.snapshot.status, 'corrected');
  assert.equal(await cash(), 75);
});

test('debts: card plans are inside the card, cost of debt, what is coming up', () => {
  const today = new Date(2026, 10, 21);
  const cards = [
    { id: 'c1', name: 'Visa', balance: 3000, interest_rate: 20.99, connected_payment_source: 'bank_account', connected_payment_source_id: 'b1', autopay_mode: 'minimum', minimum_payment: 90, due_date: '2026-12-05', annual_fee: 120 },
    { id: 'c2', name: 'Amex', balance: 500, interest_rate: 21.99, connected_payment_source: 'bank_account', connected_payment_source_id: 'b1', autopay_mode: 'statement', due_date: '2026-11-30' },
    { id: 'c3', name: 'Promo card', balance: 1000, interest_rate: 19.99, promo_rate: 0, promo_end: '2026-12-15', due_date: '2026-12-01' },
  ];
  const loans = [
    { id: 'p1', name: 'Phone plan', balance: 1200, payment_amount: 100, frequency: 'monthly', next_payment_date: '2026-12-05', on_card_id: 'c1', loan_type: 'plan', interest_rate: 0 },
    { id: 'k1', name: 'Klarna', balance: 300, payment_amount: 75, frequency: 'biweekly', next_payment_date: '2026-11-28', loan_type: 'bnpl', interest_rate: 0 },
  ];
  const banks = [{ id: 'b1', name: 'Chequing', balance: -200, allows_overdraft: true, overdraft_limit: 500, overdraft_rate: 21, overdraft_monthly_fee: 4 }];
  // The plan is part of the Visa balance: owed is 3000 + 500 + 1000 + Klarna 300 + overdraft 200, not 1200 more.
  const p = F.position({ bankAccounts: banks, creditCards: cards, loans }, today);
  assert.equal(p.totalOwe, 5000);
  // Cost: Visa interest on the 1800 not in the plan (autopay pays only the minimum), its fee, nothing on Amex (paid in full),
  // nothing on the promo card until it ends, nothing on 0% Klarna, overdraft 200 at 21% plus 4.
  const cost = F.monthlyCost({ creditCards: cards, loans, bankAccounts: banks }, today);
  const by = Object.fromEntries(cost.items.map((i) => [i.name + ':' + i.why.split(' ')[0], i.amount]));
  assert.equal(by['Visa:interest'], 31.49);
  assert.equal(by['Visa:annual'], 10);
  assert.equal(by['Chequing:overdraft'], 7.5);
  assert.ok(!cost.items.some((i) => i.name === 'Amex' || i.name === 'Promo card' || i.name === 'Klarna'));
  // Coming up: Klarna (you pay), Amex (autopay, full), Visa minimum 90, the plan billed on Visa, the promo card and its promo ending.
  const up = F.upcoming({ creditCards: cards, loans, bankAccounts: banks }, today, 30);
  const row = (n, k) => up.find((x) => x.name === n && x.kind === k);
  assert.deepEqual([row('Klarna', 'loan').amount, row('Klarna', 'loan').auto], [75, false]);
  assert.deepEqual([row('Amex', 'card').amount, row('Amex', 'card').from], [500, 'Chequing']);
  assert.equal(row('Visa', 'card').amount, 90);
  assert.deepEqual([row('Phone plan', 'plan').from, row('Phone plan', 'plan').auto], ['Visa', true]);
  assert.ok(row('Promo card', 'promo_end'));
  assert.deepEqual(up.map((x) => x.date), [...up.map((x) => x.date)].sort());
  // Month end does not pay the plan twice.
  const m = F.monthEnd({ liquid: 1000, loans, creditCards: [] }, today);
  assert.equal(m.going, 75);
});

test('statement: its lines, its closing balance, and app lines it does not show', () => {
  const { plan } = require(path.join(root, 'server', 'reader.js'));
  const ctx = {
    bankAccounts: [], creditCards: [{ id: 'v1', name: 'Visa', last4: '4321', balance: 900, snapshot_date: '2026-11-20' }],
    transactions: [
      { id: 'a', type: 'expense', amount: 42, date: '2026-10-05', status: 'active', payment_method_id: 'v1', card_id: 'v1', description: 'Shell' },
      { id: 'b', type: 'expense', amount: 19.99, date: '2026-10-12', status: 'active', payment_method_id: 'v1', card_id: 'v1', description: 'Netflix twice?' },
      { id: 'c', type: 'expense', amount: 10, date: '2026-11-02', status: 'active', payment_method_id: 'v1', card_id: 'v1', description: 'After the period' },
    ],
  };
  const p = plan({ kind: 'statement', statement: { account_name: 'Visa', last4: '4321', period_start: '2026-10-01', period_end: '2026-10-31', opening_balance: 300, closing_balance: 361.99 },
    accounts: [{ name: 'Visa', last4: '4321', type: 'credit_card', balance: 361.99 }],
    lines: [
      { date: '2026-10-05', merchant: 'SHELL', amount: 42, direction: 'out', type: 'purchase' },
      { date: '2026-10-20', merchant: 'LOBLAWS', amount: 20, direction: 'out', type: 'purchase' },
    ] }, ctx, 's9');
  assert.equal(p.statement.account.id, 'v1');
  assert.equal(p.statement.closing_balance, 361.99);
  assert.deepEqual(p.statement.not_on_statement.map((t) => t.id), ['b']);
  // The statement's balance is not offered as today's balance.
  assert.equal(p.balances.length, 0);
});

test('rate lookup sends only the product name and returns a dated suggestion', async () => {
  process.env.LOOKUP_STUB = JSON.stringify({ found: true, purchase_rate: 20.99, cash_rate: 22.99, annual_fee: 155.88, source_url: 'https://example.test/card' });
  const r = await api('/api/lookup-rates', { kind: 'credit_card', name: 'Amex Cobalt' });
  assert.deepEqual([r.found, r.purchase_rate, r.annual_fee, r.product], [true, 20.99, 155.88, 'Amex Cobalt']);
  assert.match(r.checked, /^\d{4}-\d{2}-\d{2}$/);
  await assert.rejects(api('/api/lookup-rates', { kind: 'credit_card', name: 'x' }), /product name/);
  await assert.rejects(api('/api/lookup-rates', { kind: 'other', name: 'Amex Cobalt' }), /product name/);
  delete process.env.LOOKUP_STUB;
});
