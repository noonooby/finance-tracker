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
process.env.FX_STUB = '1.4';
process.env.PUSH_STUB = '1';
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
for (const f of ['server.js', 'money.js', 'helpers.js', 'finance.js', 'spending.js', 'categoryRules.js']) {
  const src = fs.readFileSync(path.join(root, 'src', 'utils', f), 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.mjs'");
  fs.writeFileSync(path.join(lib, f.replace('.js', '.mjs')), src);
}
const { server: client, api } = await import(pathToFileURL(path.join(lib, 'server.mjs')));
const M = await import(pathToFileURL(path.join(lib, 'money.mjs')));
const F = await import(pathToFileURL(path.join(lib, 'finance.mjs')));
const S = await import(pathToFileURL(path.join(lib, 'spending.mjs')));
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
  await assert.rejects(M.recordExpense({ amount: 30, source: `credit_card:${gift.id}`, date: '2026-11-06', description: 'Coffee' }, await accounts()), /more than (that|it can pay)|overdraft limit/);
  assert.equal((await get('credit_cards', gift.id)).balance, 25);
  assert.equal((await db.from('transactions').select('*')).data.length, before);
});

test('overdraft: allowed up to the limit, refused past it', async () => {
  const a = await accounts();
  await M.recordExpense({ amount: 1000, source: `bank_account:${chq.id}`, date: '2026-11-06', description: 'Rent' }, a); // 869.15 -> -130.85
  assert.equal((await get('bank_accounts', chq.id)).balance, -130.85);
  await assert.rejects(M.recordExpense({ amount: 100, source: `bank_account:${chq.id}`, date: '2026-11-06', description: 'Too much' }, a), /more than (that|it can pay)|overdraft limit/);
  assert.equal((await get('bank_accounts', chq.id)).balance, -130.85);
});

test('savings without overdraft refuses going below zero', async () => {
  await assert.rejects(M.recordExpense({ amount: 6000, source: `bank_account:${sav.id}`, date: '2026-11-06' }, await accounts()), /more than (that|it can pay)|overdraft limit/);
});

test('cash: spend, cannot go below zero', async () => {
  const a = await accounts();
  await M.recordExpense({ amount: 15, source: CASH(), date: '2026-11-07', description: 'Lunch' }, a);
  assert.equal(await cash(), 45);
  await assert.rejects(M.recordExpense({ amount: 50, source: CASH(), date: '2026-11-07' }, a), /more than (that|it can pay)|overdraft limit/);
  // The server keeps cash at zero or more even when the request carries no limit.
  await assert.rejects(api('/api/money', { legs: [{ table: 'bank_accounts', id: cashAcct.id, delta: -500 }], rows: [] }), /more than (that|it can pay)|overdraft limit/);
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
  await assert.rejects(M.recordLoanPayment({ loanId: loan.id, amount: 9000, source: `bank_account:${sav.id}`, date: '2026-11-17' }, a), /more than (that|it can pay)|overdraft limit/);
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

test('categories are learned per merchant; a rule you fixed stays; learning can be turned off', async () => {
  const a = await accounts();
  const cat1 = await add('categories', { name: 'Coffee', is_income: false });
  const cat2 = await add('categories', { name: 'Treats', is_income: false });
  await M.recordExpense({ amount: 4, source: `bank_account:${chq.id}`, date: '2026-11-20', description: 'Tim Hortons #123', category_id: cat1.id, category_name: 'Coffee' }, a);
  let rules = (await db.from('category_rules').select('*')).data;
  const r = rules.find((x) => x.key === 'timhortons');
  assert.ok(r && r.category_id === cat1.id && r.source === 'learned');
  // You fix it to another category: learning from a later purchase does not change it.
  await db.from('category_rules').update({ category_id: cat2.id, source: 'set' }).eq('id', r.id);
  await M.recordExpense({ amount: 5, source: `bank_account:${chq.id}`, date: '2026-11-21', description: 'Tim Hortons', category_id: cat1.id }, a);
  assert.equal((await get('category_rules', r.id)).category_id, cat2.id);
  // Learning off: a new merchant is not learned.
  await db.from('settings').upsert({ key: 'learn_categories', value: false }, { onConflict: 'key' });
  await M.recordExpense({ amount: 6, source: `bank_account:${chq.id}`, date: '2026-11-21', description: 'Second Cup', category_id: cat1.id }, a);
  rules = (await db.from('category_rules').select('*')).data;
  assert.ok(!rules.some((x) => x.key === 'secondcup'));
  await db.from('settings').upsert({ key: 'learn_categories', value: true }, { onConflict: 'key' });
});

test('a split purchase moves the money once, counts each part in its category, and must add up', async () => {
  const a = await accounts();
  const before = Number((await get('bank_accounts', chq.id)).balance);
  const splits = [{ category_id: 'groceries', category_name: 'Groceries', amount: 60.25 }, { category_id: 'household', category_name: 'Household', amount: 19.75 }];
  const res = await M.recordExpense({ amount: 80, source: `bank_account:${chq.id}`, date: '2026-11-21', description: 'Costco', category_id: 'groceries', extra: { splits } }, a);
  assert.equal(Number((await get('bank_accounts', chq.id)).balance), Math.round((before - 80) * 100) / 100);
  const t = res.rows.find((x) => x.description === 'Costco');
  assert.deepEqual(t.splits.map((p) => p.amount), [60.25, 19.75]);
  const spent = S.spentByCategory([t], '2026-11-01', '2026-11-30');
  assert.deepEqual([spent.groceries, spent.household], [60.25, 19.75]);
  // Parts that do not add up are refused and nothing moves.
  await assert.rejects(M.recordExpense({ amount: 80, source: `bank_account:${chq.id}`, date: '2026-11-21', description: 'Costco', extra: { splits: [{ category_id: 'groceries', amount: 50 }, { category_id: 'household', amount: 20 }] } }, a), /add up to 70.00, not the amount of 80.00/);
  assert.equal(Number((await get('bank_accounts', chq.id)).balance), Math.round((before - 80) * 100) / 100);
  await assert.rejects(db.from('transactions').update({ splits: [{ category_id: 'x', amount: 80 }] }).eq('id', t.id).then((r) => { if (r.error) throw new Error(r.error.message); }), /2 to 20 parts/);
});

test('budgets count purchases minus refunds for the month, ignore undone lines, and show the pace', () => {
  const tx = [
    { type: 'expense', amount: 120, date: '2026-11-03', category_id: 'dining' },
    { type: 'refund', amount: 20, date: '2026-11-04', category_id: 'dining' },
    { type: 'expense', amount: 500, date: '2026-11-05', category_id: 'dining', status: 'undone' },
    { type: 'expense', amount: 90, date: '2026-10-30', category_id: 'dining' },
    { type: 'expense', amount: 300, date: '2026-11-10', category_id: 'groceries' },
  ];
  const b = S.budgetMonth(tx, { dining: 200, groceries: 250, travel: 0 }, [{ id: 'dining', name: 'Dining' }, { id: 'groceries', name: 'Groceries' }], '2026-11', new Date(2026, 10, 15));
  assert.deepEqual(b.map((x) => [x.category_id, x.spent, x.left, x.over]), [['groceries', 300, -50, true], ['dining', 100, 100, false]]);
  assert.equal(b[1].pace, 0.5);
});

test('bills that repeat are found from history; one-offs, uneven ones and stopped ones are not', () => {
  const mk = (d, desc, amt) => ({ type: 'expense', date: d, description: desc, amount: amt, payment_method: 'credit_card', payment_method_name: 'Visa' });
  const tx = [
    mk('2026-08-03', 'NETFLIX.COM', 16.49), mk('2026-09-03', 'NETFLIX.COM', 16.49), mk('2026-10-03', 'NETFLIX.COM', 16.49), mk('2026-11-03', 'NETFLIX.COM', 18.99),
    mk('2026-09-10', 'Rogers', 85), mk('2026-10-11', 'Rogers', 85.4), mk('2026-11-09', 'Rogers', 85),
    mk('2026-09-01', 'Costco', 40), mk('2026-10-01', 'Costco', 210), mk('2026-11-01', 'Costco', 75),
    mk('2026-01-05', 'Gym', 30), mk('2026-02-05', 'Gym', 30), mk('2026-03-05', 'Gym', 30),
    mk('2026-11-12', 'Shell', 50),
  ];
  const r = S.findRecurring(tx, [], new Date(2026, 10, 21));
  assert.deepEqual(r.map((x) => [x.name, x.frequency, x.next_date]).sort(), [['NETFLIX.COM', 'monthly', '2026-12-03'], ['Rogers', 'monthly', '2026-12-09']]);
  assert.equal(r.find((x) => x.name === 'NETFLIX.COM').amount, 18.99);
  // A bill you already track or turned down is not offered again.
  assert.equal(S.findRecurring(tx, [{ key: 'netflixcom' }], new Date(2026, 10, 21)).length, 1);
  // Tracked bills appear in the next 30 days, marked recorded when their purchase is there.
  const bills = [{ status: 'active', key: 'rogers', name: 'Rogers', amount: 85, frequency: 'monthly', next_date: '2026-10-09', payment_method: 'bank_account' }];
  const up = F.upcoming({ bills, transactions: tx }, new Date(2026, 10, 8), 30);
  assert.deepEqual(up.map((x) => [x.date, x.paid]), [['2026-11-09', true]]);
  assert.deepEqual(F.upcoming({ bills, transactions: [] }, new Date(2026, 10, 10), 30).map((x) => [x.date, x.paid]), [['2026-11-09', false], ['2026-12-09', false]]); // a day late and not recorded: still shown
  // A bill on a card is not a separate payment (the card payment covers it); one from a bank account is.
  const cardBill = F.upcoming({ bills: [{ ...bills[0], payment_method: 'credit_card' }], transactions: [] }, new Date(2026, 10, 8), 30)[0];
  assert.equal(cardBill.auto, true);
  const me = F.monthEnd({ liquid: 1000, bills, transactions: [] }, new Date(2026, 10, 8));
  assert.equal(me.going, 85);
});

test('another currency: the rate for the day converts, and a scan line shown only in USD is converted', async () => {
  const r = await api('/api/fx?from=usd&date=2026-11-20', null, 'GET');
  assert.deepEqual([r.from, r.to, r.rate], ['USD', 'CAD', 1.4]);
  await assert.rejects(api('/api/fx?from=US&date=2026-11-20', null, 'GET'), /Choose a currency/);
  fs.writeFileSync(process.env.READER_STUB, JSON.stringify({ kind: 'transactions', accounts: [{ name: 'Visa', last4: '4321', type: 'credit_card' }], lines: [
    { date: '2026-11-19', merchant: 'AMAZON.COM', amount: 10, direction: 'out', type: 'purchase', currency: 'USD' },
    { date: '2026-11-19', merchant: 'STEAM', amount: 14.3, original_amount: 10, direction: 'out', type: 'purchase', currency: 'USD' },
  ] }));
  const p = await api('/api/read-screenshot', { image: 'data:image/png;base64,iVBORw0KGgo=', today: '2026-11-21' });
  const [amz, steam] = p.lines;
  assert.deepEqual([amz.amount, amz.original_amount, amz.original_currency, amz.fx_rate], [14, 10, 'USD', 1.4]);
  assert.deepEqual([steam.amount, steam.original_amount, steam.fx_rate], [14.3, 10, undefined]);
});

test('reminders: a browser subscribes; payments you make yourself are reminded once, two days before and on the day', async () => {
  const { runReminders } = require(path.join(root, 'server', 'server.js'));
  const k = await api('/api/push/key', null, 'GET');
  assert.equal(Buffer.from(k.key, 'base64url').length, 65);
  await assert.rejects(api('/api/push/subscribe', { subscription: { endpoint: 'http://x' } }), /usable subscription/);
  await api('/api/push/subscribe', { subscription: { endpoint: 'https://push.example.test/abc', keys: { p256dh: k.key, auth: 'AAAAAAAAAAAAAAAAAAAAAA' } } });
  // The browser cannot write subscriptions through the data API.
  assert.ok((await db.from('push_subscriptions').insert({ endpoint: 'https://evil.test' })).error);
  await add('credit_cards', { name: 'Remind Visa', balance: 120, due_date: '2026-11-23' });
  await add('credit_cards', { name: 'Auto Visa', balance: 120, due_date: '2026-11-23', connected_payment_source: 'bank_account', connected_payment_source_id: chq.id });
  await add('bills', { name: 'Hydro', key: 'hydro', amount: 60, frequency: 'monthly', next_date: '2026-10-21', status: 'active' });
  global.__pushed = [];
  const at = new Date('2026-11-21T15:00:00Z'); // 10:00 in Toronto
  await runReminders(at);
  const titles = global.__pushed.map((x) => x.message.title).sort();
  assert.deepEqual(titles, ['Hydro due today', 'Remind Visa payment due in 2 days']);
  await runReminders(at); // never twice
  assert.equal(global.__pushed.length, 2);
  global.__pushed = [];
  await runReminders(new Date('2026-11-21T03:00:00Z')); // 22:00 the day before in Toronto: quiet hours
  assert.equal(global.__pushed.length, 0);
});

test('reminder messages are encrypted so only the subscribed browser can read them', () => {
  const push = require(path.join(root, 'server', 'push.js'));
  const crypto = require('node:crypto');
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const sub = { keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
  const body = push.encrypt(sub, '{"title":"hi"}');
  const salt = body.subarray(0, 16), idlen = body.readUInt8(20), asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  assert.equal(body.readUInt32BE(16), 4096);
  const shared = ua.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain.subarray(0, -1).toString(), '{"title":"hi"}');
  assert.equal(plain.at(-1), 2);
  // The VAPID token is signed with the server key and verifies against the public key the browser was given.
  const { db: sdb } = require(path.join(root, 'server', 'server.js'));
  const h = push.vapid(sdb, 'https://fcm.googleapis.com/fcm/send/x', 'https://finance.example.test');
  const [, jwt, kk] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  const [hh, pp, sg] = jwt.split('.');
  const pub = Buffer.from(kk, 'base64url');
  const key = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
  assert.ok(crypto.verify('sha256', Buffer.from(`${hh}.${pp}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sg, 'base64url')));
  assert.equal(JSON.parse(Buffer.from(pp, 'base64url')).aud, 'https://fcm.googleapis.com');
});

test('delete all data: needs the exact phrase, removes only this person\'s rows, keeps the sign-in', async () => {
  const other = await fetch(`${base}/api/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'other@test.local' }) }).then((r) => r.json());
  const call = (p, body, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  await call('/api/db', { table: 'bank_accounts', action: 'insert', values: { name: 'Throwaway', balance: 5 } }, other.token);
  assert.equal((await call('/api/reset', { confirm: 'yes' }, other.token)).status, 400);
  const r = await call('/api/reset', { confirm: 'DELETE ALL MY DATA' }, other.token);
  assert.ok(r.body.rows >= 1);
  assert.equal((await call('/api/db', { table: 'bank_accounts', action: 'select', filters: [] }, other.token)).body.data.length, 0);
  assert.equal((await call('/api/me', {}, other.token)).status, 404); // /api/me is GET; the token itself still works below
  assert.ok((await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${other.token}` } })).ok);
  // The main test user's data is untouched.
  assert.ok((await db.from('bank_accounts').select('*')).data.length > 0);
});

test('reminder encryption matches the Web Push standard example byte for byte (RFC 8291, appendix A)', () => {
  const push = require(path.join(root, 'server', 'push.js'));
  const crypto = require('node:crypto');
  const b = (s) => Buffer.from(s, 'base64url');
  const as = crypto.createECDH('prime256v1'); as.setPrivateKey(b('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'));
  const sub = { keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } };
  const out = push.encrypt(sub, 'When I grow up, I want to be a watermelon', { salt: b('DGv6ra1nlYgDCS1FRnbzlw'), server: as }).toString('base64url');
  assert.equal(out, 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('a restored backup keeps each transaction undoable and refuses rows of another account', async () => {
  const a = await accounts();
  const res = await M.recordExpense({ amount: 12, source: `bank_account:${chq.id}`, date: '2026-11-21', description: 'Restore me' }, a);
  const t = (await db.from('transactions').select('*').eq('id', res.transaction.id)).data[0];
  const before = Number((await get('bank_accounts', chq.id)).balance);
  // The data API strips _legs; the backup file is made from the server copy, which has them.
  const { db: sdb } = require(path.join(root, 'server', 'server.js'));
  const full = JSON.parse(sdb.prepare("SELECT data FROM rows WHERE tbl='transactions' AND id=?").get(String(t.id)).data);
  assert.ok(full._legs.length);
  await api('/api/restore', { table: 'transactions', rows: [{ ...full, description: 'Restored' }] });
  await M.reverseTransaction(t.id);
  assert.equal(Number((await get('bank_accounts', chq.id)).balance), Math.round((before + 12) * 100) / 100);
  await assert.rejects(api('/api/restore', { table: 'balance_points', rows: [] }), /cannot be restored/);
});

test('a bill already recorded gets no reminder', () => {
  const push = require(path.join(root, 'server', 'push.js'));
  const bill = { id: 'b1', status: 'active', key: 'rogers', name: 'Rogers', amount: 85, frequency: 'monthly', next_date: '2026-11-21' };
  const rows = (paid) => (t) => (t === 'bills' ? [bill] : t === 'transactions' && paid ? [{ type: 'expense', description: 'Rogers', amount: 85, date: '2026-11-20' }] : []);
  assert.equal(push.dueFor(rows(false), '2026-11-21', '2026-11-23').length, 1);
  assert.equal(push.dueFor(rows(true), '2026-11-21', '2026-11-23').length, 0);
});

test('a bill on the 31st shows on the last day of shorter months and on the 31st in the others', () => {
  const b = { id: 'rent', name: 'Rent', key: 'rent', amount: 1500, frequency: 'monthly', next_date: '2026-01-31', status: 'active' };
  assert.equal(S.rollForward('2026-01-31', 'monthly', new Date(2026, 1, 1)), '2026-02-28');
  assert.equal(S.rollForward('2026-01-31', 'monthly', new Date(2026, 2, 1)), '2026-03-31');
  assert.equal(S.rollForward('2024-02-29', 'yearly', new Date(2028, 0, 1)), '2028-02-29');
  const days = F.billDates([b], [], new Date(2026, 1, 5), '2026-05-31').map((x) => x.date);
  assert.deepEqual(days, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
});

test('tables kept by the server cannot be written through a money step, and a refused step changes nothing', async () => {
  const k = await api('/api/push/key', null, 'GET');
  await api('/api/push/subscribe', { subscription: { endpoint: 'https://push.example.test/keep', keys: { p256dh: k.key, auth: 'AAAAAAAAAAAAAAAAAAAAAA' } } });
  const acct = await add('bank_accounts', { name: 'Guard', balance: 100 });
  const count = async (t) => (await db.from(t).select('*')).data.length;
  const before = { subs: await count('push_subscriptions'), snaps: await count('snapshots'), points: await count('balance_points') };
  const leg = { table: 'bank_accounts', id: acct.id, delta: -10 };
  for (const [table, values] of [
    ['push_subscriptions', { endpoint: 'http://127.0.0.1:9/internal', keys: { p256dh: k.key, auth: 'AAAAAAAAAAAAAAAAAAAAAA' } }],
    ['snapshots', { account_table: 'bank_accounts', account_id: acct.id, value: 1, status: 'ok' }],
    ['balance_points', { account_table: 'bank_accounts', account_id: acct.id, date: '2020-01-01', value: 999999 }],
  ]) await assert.rejects(api('/api/money', { legs: [leg], rows: [{ table, values }] }), /kept by the server/);
  const sub = (await db.from('push_subscriptions').select('*')).data[0];
  await assert.rejects(api('/api/money', { legs: [leg], rows: [], updates: [{ table: 'push_subscriptions', id: sub.id, values: { endpoint: 'http://127.0.0.1:9/internal' } }] }), /kept by the server/);
  await assert.rejects(api('/api/money', { legs: [leg], rows: [], updates: [{ table: 'no_such_table', id: 'x', values: { a: 1 } }] }), /Unknown table/);
  assert.equal((await get('push_subscriptions', sub.id)).endpoint, sub.endpoint);
  assert.equal(Number((await get('bank_accounts', acct.id)).balance), 100); // the money did not move in any refused step
  assert.deepEqual({ subs: await count('push_subscriptions'), snaps: await count('snapshots'), points: await count('balance_points') }, before);
  // An ordinary step with an ordinary update still works.
  await api('/api/money', { legs: [leg], rows: [], updates: [{ table: 'bank_accounts', id: acct.id, values: { institution: 'Test Bank' } }] });
  const after = await get('bank_accounts', acct.id);
  assert.deepEqual([Number(after.balance), after.institution], [90, 'Test Bank']);
});

test('a reminder that could not be delivered is tried again, and is still sent only once', async () => {
  const { runReminders } = require(path.join(root, 'server', 'server.js'));
  const k = await api('/api/push/key', null, 'GET');
  await api('/api/push/subscribe', { subscription: { endpoint: 'https://push.example.test/retry', keys: { p256dh: k.key, auth: 'AAAAAAAAAAAAAAAAAAAAAA' } } });
  await add('credit_cards', { name: 'Retry Visa', balance: 80, due_date: '2027-03-10' });
  const at = new Date('2027-03-10T15:00:00Z');
  const got = () => (global.__pushed || []).filter((x) => /Retry Visa/.test(x.message.title) && x.endpoint.endsWith('/retry')).length;
  global.__pushed = [];
  process.env.PUSH_STUB = 'fail';
  try { await runReminders(at); } finally { process.env.PUSH_STUB = '1'; }
  assert.equal(got(), 0);
  await runReminders(new Date(at.getTime() + 15 * 60e3));
  assert.equal(got(), 1, 'sent on the next pass');
  await runReminders(new Date(at.getTime() + 30 * 60e3));
  assert.equal(got(), 1, 'not sent again');
});

test('a refused payment says in plain words what the account has and how far short it is', async () => {
  const wallet = await add('bank_accounts', { name: 'Wallet', balance: 60, account_type: 'cash' });
  const od = await add('bank_accounts', { name: 'Overdraft acct', balance: 20, allows_overdraft: true, overdraft_limit: 100 });
  const owed = await add('loans', { name: 'Small loan', balance: 300 });
  const rich = await add('bank_accounts', { name: 'Rich', balance: 5000 });
  const a = await accounts();
  await assert.rejects(M.recordExpense({ amount: 100, source: `bank_account:${wallet.id}`, date: '2026-11-23', description: 'x' }, a),
    /Wallet has \$60\.00\. \$100\.00 is \$40\.00 more than it can pay\.$/);
  await assert.rejects(M.recordExpense({ amount: 150, source: `bank_account:${od.id}`, date: '2026-11-23', description: 'x' }, a),
    /Overdraft acct would be \$130\.00 below zero\. Its overdraft limit is \$100\.00\.$/);
  await assert.rejects(M.recordLoanPayment({ loanId: owed.id, amount: 400, source: `bank_account:${rich.id}`, date: '2026-11-23' }, a),
    /You owe \$300\.00 on Small loan\. \$400\.00 is more than that\.$/);
});

test('bills: one tracked bill per merchant, each with a name, an amount, a rhythm and a date; a turned-down one can be added later', async () => {
  const bill = (more) => ({ name: 'Bell Internet', key: 'bellinternet', amount: 80, frequency: 'monthly', next_date: '2026-12-05', status: 'active', ...more });
  const ins = (v) => db.from('bills').insert(v).select().single();
  const first = (await ins(bill())).data;
  assert.ok(first.id);
  assert.match((await ins(bill({ name: 'BELL internet again' }))).error.message, /Bell Internet is already tracked/);
  for (const [bad, why] of [[{ key: 'gymmembership', name: 'Gym', amount: 0 }, /above zero/], [{ key: 'gymmembership', name: 'Gym', amount: -5 }, /above zero/],
    [{ key: 'ab', name: 'ab' }, /at least 3 letters/], [{ key: 'gymmembership', name: '   ' }, /at least 3 letters/],
    [{ key: 'gymmembership', name: 'Gym', frequency: 'daily' }, /how often/], [{ key: 'gymmembership', name: 'Gym', next_date: 'soon' }, /next due date/]]) {
    assert.match((await ins(bill(bad))).error.message, why);
  }
  assert.equal((await db.from('bills').select('*').eq('key', 'gymmembership')).data.length, 0);
  // An edit is held to the same rule, and cannot turn one bill into a second copy of another.
  const other = (await ins(bill({ name: 'Rogers', key: 'rogers' }))).data;
  assert.match((await db.from('bills').update({ amount: 0 }).eq('id', other.id)).error.message, /above zero/);
  assert.match((await db.from('bills').update({ key: 'bellinternet' }).eq('id', other.id)).error.message, /already tracked/);
  assert.equal((await get('bills', other.id)).amount, 80);
  // Stop tracking, then add it again by hand: the same row is tracked again, not a second one.
  assert.equal((await db.from('bills').update({ status: 'ignored' }).eq('id', other.id)).error, null);
  const again = (await ins(bill({ name: 'Rogers', key: 'rogers', amount: 95 }))).data;
  assert.deepEqual([again.id, again.status, again.amount], [other.id, 'active', 95]);
  assert.equal((await db.from('bills').select('*').eq('key', 'rogers')).data.length, 1);
});

test('a card payment comes from somewhere else: not the card itself, not a gift card, and a gift card is not paid off', async () => {
  const visa = await add('credit_cards', { name: 'Pay Visa', balance: 200 });
  const giftc = await add('credit_cards', { name: 'Pay Gift', balance: 50, is_gift_card: true });
  const bank = await add('bank_accounts', { name: 'Pay Bank', balance: 500 });
  const a = await accounts();
  const pay = (cardId, source) => M.recordCardPayment({ cardId, amount: 20, source, date: '2026-11-23' }, a);
  await assert.rejects(pay(visa.id, `credit_card:${visa.id}`), /cannot pay itself/);
  await assert.rejects(pay(visa.id, `credit_card:${giftc.id}`), /gift card cannot pay/);
  await assert.rejects(pay(giftc.id, `bank_account:${bank.id}`), /gift card is not paid off/);
  assert.deepEqual([Number((await get('credit_cards', visa.id)).balance), Number((await get('credit_cards', giftc.id)).balance), Number((await get('bank_accounts', bank.id)).balance)], [200, 50, 500]);
  const ok = await pay(visa.id, `bank_account:${bank.id}`);
  assert.equal(ok.transaction.description, 'Payment to Pay Visa');
  assert.deepEqual([Number((await get('credit_cards', visa.id)).balance), Number((await get('bank_accounts', bank.id)).balance)], [180, 480]);
});

test('the payment form names its source account by kind and id, together or apart, as text or number', () => {
  const lists = { bankAccounts: [{ id: 'chq1', name: 'Chequing' }, { id: 7, name: 'Old numbered' }], creditCards: [{ id: 'v1', name: 'Visa' }] };
  const src = (f) => M.paymentSourceOf(f, lists);
  assert.deepEqual(src({ paymentSource: 'bank_account', paymentSourceId: 'chq1' }), { sourceType: 'bank_account', sourceId: 'chq1', source: 'bank_account:chq1', sourceName: 'Chequing' });
  assert.equal(src({ paymentSource: 'bank_account:chq1' }).source, 'bank_account:chq1');
  assert.equal(src({ paymentSource: 'bank_account', paymentSourceId: '7' }).sourceName, 'Old numbered');
  assert.equal(src({ paymentSource: 'credit_card', paymentSourceId: 'v1' }).sourceName, 'Visa');
  for (const f of [{}, { paymentSource: 'bank_account' }, { paymentSource: 'bank_account', paymentSourceId: '' }, { paymentSource: '', paymentSourceId: 'chq1' }, { paymentSource: 'loan', paymentSourceId: 'x' }]) {
    assert.throws(() => src(f), /Choose the account it is paid from/);
  }
  assert.throws(() => src({ paymentSource: 'bank_account', paymentSourceId: 'gone' }), /no longer exists/);
});

test('undoing a payment also puts back the dates the payment moved, unless they were changed again since', async () => {
  const src = await add('bank_accounts', { name: 'Undo Bank', balance: 3000 });
  const mk = () => add('loans', { name: 'Undo loan', balance: 1000, payment_amount: 100, next_payment_date: '2026-12-01' });
  const payIt = async (loan) => M.recordLoanPayment({ loanId: loan.id, amount: 100, source: `bank_account:${src.id}`, date: '2026-11-23',
    updates: [{ table: 'loans', id: loan.id, values: { next_payment_date: '2027-01-01', last_payment_date: '2026-11-23' } }] }, await accounts());
  const one = await mk();
  const paid = await payIt(one);
  let row = await get('loans', one.id);
  assert.deepEqual([row.next_payment_date, row.last_payment_date], ['2027-01-01', '2026-11-23']);
  await M.reverseTransaction(paid.transaction.id);
  row = await get('loans', one.id);
  assert.deepEqual([row.next_payment_date, row.last_payment_date ?? null], ['2026-12-01', null]);
  await M.reverseTransaction(paid.transaction.id); // safe to repeat
  assert.equal((await get('loans', one.id)).next_payment_date, '2026-12-01');
  // The date was changed by hand after the payment: undo leaves that newer date alone.
  const two = await mk();
  const paid2 = await payIt(two);
  await db.from('loans').update({ next_payment_date: '2027-02-15' }).eq('id', two.id);
  await M.reverseTransaction(paid2.transaction.id);
  row = await get('loans', two.id);
  assert.deepEqual([row.next_payment_date, row.last_payment_date ?? null], ['2027-02-15', null]);
  // A balance cannot be slipped in next to a payment, and nothing of that step is saved.
  await assert.rejects(M.recordLoanPayment({ loanId: two.id, amount: 100, source: `bank_account:${src.id}`, date: '2026-11-23',
    updates: [{ table: 'loans', id: two.id, values: { balance: 5 } }] }, await accounts()), /cannot be set inside a payment/);
  assert.equal(Number((await get('loans', two.id)).balance), 1000);
  // The browser cannot write the undo record itself.
  const t = await add('transactions', { type: 'expense', amount: 1, date: '2026-11-23', description: 'x', status: 'active', _undo: [{ table: 'loans', id: two.id, before: { name: 'hacked' }, set: { name: 'Undo loan' } }] });
  assert.equal((await get('transactions', t.id))._undo, undefined);
});

test('categories: a name is needed, and the same name cannot be used twice for the same kind', async () => {
  const ins = (v) => db.from('categories').insert(v).select().single();
  const a = (await ins({ name: 'Pets', is_income: false })).data;
  assert.ok(a.id);
  assert.match((await ins({ name: ' pets ', is_income: false })).error.message, /already have a category called Pets/);
  assert.match((await ins({ name: '  ', is_income: false })).error.message, /Give the category a name/);
  const inc = (await ins({ name: 'Pets', is_income: true })).data;   // the income side may reuse the name
  assert.ok(inc.id);
  const b = (await ins({ name: 'Vet', is_income: false })).data;
  assert.match((await db.from('categories').update({ name: 'PETS' }).eq('id', b.id)).error.message, /already have a category called Pets/);
  assert.equal((await db.from('categories').update({ name: 'Pets', color: '#111111' }).eq('id', a.id)).error, null); // saving its own name is fine
  assert.equal((await get('categories', b.id)).name, 'Vet');
});

test('restoring a backup: everything comes back as it was, and a bad file changes nothing', async () => {
  const names = ['bank_accounts', 'credit_cards', 'loans', 'transactions', 'categories', 'bills', 'balance_points', 'snapshots', 'settings'];
  const dump = async () => Object.fromEntries(await Promise.all(names.map(async (t) => [t, ((await db.from(t).select('*')).data || []).sort((x, y) => String(x.id).localeCompare(String(y.id)))])));
  const before = await dump();
  assert.ok(before.transactions.length > 5 && before.balance_points.length > 0);
  // Bad files: nothing is removed.
  await assert.rejects(api('/api/restore-all', { confirm: 'REPLACE ALL MY DATA', data: {} }), /nothing in it/);
  await assert.rejects(api('/api/restore-all', { confirm: 'REPLACE ALL MY DATA', data: { transactions: 'x' } }), /not a backup/);
  await assert.rejects(api('/api/restore-all', { confirm: 'no', data: before }), /Confirm/);
  // A file that fails part way (a split that does not add up) leaves everything as it was.
  const broken = { ...before, transactions: [...before.transactions, { id: 'bad-split', type: 'expense', amount: 10, splits: [{ amount: 3 }, { amount: 4 }] }] };
  await assert.rejects(api('/api/restore-all', { confirm: 'REPLACE ALL MY DATA', data: broken }), /add up/);
  assert.deepEqual(await dump(), before);
  // Records made after the backup go; the backup comes back whole, with the balance history.
  const extra = await add('bank_accounts', { name: 'After the backup', balance: 5 });
  const done = await api('/api/restore-all', { confirm: 'REPLACE ALL MY DATA', data: before });
  assert.equal(done.restored.transactions, before.transactions.length);
  assert.equal(await get('bank_accounts', extra.id), null);
  assert.deepEqual(await dump(), before);
});

test('a card payment you record moves the due date to next month when it settles the bill that is due', () => {
  const c = (more) => ({ id: 'c', name: 'Visa', balance: 300, due_date: '2026-11-28', ...more });
  const f = M.cardDueAfterPayment;
  assert.equal(f(c(), '2026-11-23', 100), '2026-12-28');                 // paid a few days before it is due
  assert.equal(f(c(), '2026-11-30', 0), '2026-12-28');                   // paid late
  assert.equal(f(c({ due_date: '2026-08-28' }), '2026-11-23', 0), '2026-11-28'); // a date long past: the next one after the payment
  assert.equal(f(c({ due_date: '2027-01-31' }), '2027-01-20', 0), '2027-02-28'); // short month
  assert.equal(f(c({ due_date: '2026-12-28' }), '2026-11-23', 100), null); // more than 25 days ahead: an extra payment
  assert.equal(f(c({ due_date: null }), '2026-11-23', 0), null);
  assert.equal(f(c({ is_gift_card: true }), '2026-11-23', 0), null);
  const auto = { connected_payment_source: 'bank_account', connected_payment_source_id: 'b1' };
  assert.equal(f(c(auto), '2026-11-23', 100), null);                     // the automatic payment will take the rest
  assert.equal(f(c(auto), '2026-11-23', 0), '2026-12-28');               // nothing left for it to take
});

test('repeating dates: one rule for weekly, every two weeks, twice a month, every 2 months and monthly', () => {
  const n = S.nextDue;
  assert.equal(n('2026-11-23', 'weekly'), '2026-11-30');
  assert.equal(n('2026-11-23', 'biweekly'), '2026-12-07');
  assert.equal(n('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(n('2026-02-28', 'monthly', 31), '2026-03-31');
  assert.equal(n('2026-11-23', 'bimonthly'), '2027-01-23');
  // Twice a month: the 5th and the 20th, whichever of the two it starts on.
  assert.equal(n('2026-11-05', 'semimonthly'), '2026-11-20');
  assert.equal(n('2026-11-20', 'semimonthly'), '2026-12-05');
  assert.equal(n('2026-11-20', 'semimonthly', 5), '2026-12-05');
  // The 15th and the 30th: February ends early, March returns to the 30th.
  assert.equal(n('2026-02-15', 'semimonthly'), '2026-02-28');
  assert.equal(n('2026-02-28', 'semimonthly', 30), '2026-03-15');
  assert.equal(n('2026-03-15', 'semimonthly', 30), '2026-03-30');
  assert.equal(n('2026-01-31', 'semimonthly'), '2026-02-16');
  assert.equal(n('not a date', 'monthly'), null);
  assert.deepEqual(S.dueDatesBetween('2026-11-06', 'biweekly', undefined, '2026-11-10', '2026-11-30'), ['2026-11-20']);
});

test('month end counts pay and loan payments every time they fall in the month, and never more than is owed', () => {
  const today = new Date(2026, 10, 2);
  const m = F.monthEnd({ liquid: 0,
    incomeSchedules: [
      { amount: 1000, frequency: 'biweekly', next_date: '2026-11-06' },                    // the 6th and the 20th
      { amount: 500, frequency: 'weekly', next_date: '2026-11-03', recurring_duration_type: 'occurrences', recurring_occurrences_total: 5, recurring_occurrences_completed: 3 }, // two left
      { amount: 70, frequency: 'weekly', next_date: '2026-11-03', recurring_duration_type: 'until_date', recurring_until_date: '2026-11-10' }, // the 3rd and the 10th
      { amount: 9, frequency: 'monthly', next_date: '2026-11-15', is_active: false },
    ],
    loans: [
      { payment_amount: 100, frequency: 'weekly', next_payment_date: '2026-11-04', balance: 250 },   // 100 + 100 + 50
      { payment_amount: 40, frequency: 'semimonthly', next_payment_date: '2026-11-05', balance: 1000 }, // the 5th and the 20th
      { payment_amount: 300, frequency: 'monthly', next_payment_date: '2026-11-25', balance: 0 },    // paid off
    ] }, today);
  assert.deepEqual([m.coming, m.going], [2000 + 1000 + 140, 250 + 80]);
});

test('undo still works after one of the accounts was removed: the money goes back to the one that is left', async () => {
  const bank = await add('bank_accounts', { name: 'Stays', balance: 500 });
  const old = await add('credit_cards', { name: 'Closed card', balance: 200, credit_limit: 1000 });
  const paid = await M.recordCardPayment({ cardId: old.id, amount: 150, source: `bank_account:${bank.id}`, date: '2026-11-23' }, await accounts());
  assert.equal(Number((await get('bank_accounts', bank.id)).balance), 350);
  await db.from('credit_cards').delete().eq('id', old.id);
  await M.reverseTransaction(paid.transaction.id);
  assert.equal(Number((await get('bank_accounts', bank.id)).balance), 500);
  assert.equal((await get('transactions', paid.transaction.id)).status, 'undone');
  await M.reverseTransaction(paid.transaction.id); // repeating changes nothing
  assert.equal(Number((await get('bank_accounts', bank.id)).balance), 500);
});

test('a plain edit cannot change the amount, kind, account or status of a transaction that moved money', async () => {
  const bank = await add('bank_accounts', { name: 'Edit Bank', balance: 500 });
  const spent = await M.recordExpense({ amount: 40, source: `bank_account:${bank.id}`, date: '2026-11-23', description: 'Edit test' }, await accounts());
  const id = spent.transaction.id;
  const edit = async (values) => (await db.from('transactions').update(values).eq('id', id)).error;
  for (const values of [{ amount: 4 }, { type: 'income' }, { payment_method_id: 'other' }, { status: 'undone' }])
    assert.match((await edit(values)).message, /moved money/);
  // What does not touch the money can be changed, and saving the same amount again is fine.
  assert.equal(await edit({ description: 'Edit test, renamed', notes: 'x', amount: 40, date: '2026-11-22' }), null);
  const t = await get('transactions', id);
  assert.deepEqual([t.amount, t.description, t.status], [40, 'Edit test, renamed', 'active']);
  assert.equal(Number((await get('bank_accounts', bank.id)).balance), 460);
  // Undo still works, and afterwards the line is only history.
  await M.reverseTransaction(id);
  assert.equal(Number((await get('bank_accounts', bank.id)).balance), 500);
});

test('money is recorded on a real day', async () => {
  const bank = await add('bank_accounts', { name: 'Date Bank', balance: 100 });
  const spend = async (date) => M.recordExpense({ amount: 1, source: `bank_account:${bank.id}`, date, description: 'Date test' }, await accounts());
  for (const bad of ['2026-02-31', '2026-13-01', 'yesterday', '23/11/2026']) await assert.rejects(spend(bad), /does not exist/);
  assert.equal(Number((await get('bank_accounts', bank.id)).balance), 100);
  assert.equal((await spend('2028-02-29')).transaction.date, '2028-02-29');
  assert.match((await spend(undefined)).transaction.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('the server holds every balance to its own limit, whatever limit the browser sends', async () => {
  const plain = await add('bank_accounts', { name: 'No overdraft', balance: 100 });
  const od = await add('bank_accounts', { name: 'Overdraft 200', balance: 100, allows_overdraft: true, overdraft_limit: 200 });
  const gift = await add('credit_cards', { name: 'Gift 50', balance: 50, is_gift_card: true });
  const owed = await add('loans', { name: 'Small loan', balance: 80, payment_amount: 40 });
  const visa = await add('credit_cards', { name: 'Limit Visa', balance: 10, credit_limit: 500 });
  const out = (table, id, amount, more = {}) => api('/api/money', { legs: [{ table, id, delta: -amount, ...more }],
    rows: [{ table: 'transactions', values: { type: 'expense', amount, date: '2026-11-23', description: 'Limit test', status: 'active' } }] });
  // No limit sent, or a generous one: the account's own rule still applies.
  await assert.rejects(out('bank_accounts', plain.id, 150), /more than it can pay/);
  await assert.rejects(out('bank_accounts', plain.id, 150, { floor: -1000 }), /more than it can pay/);
  await assert.rejects(out('bank_accounts', od.id, 301, { floor: -5000 }), /overdraft limit/);
  await assert.rejects(out('credit_cards', gift.id, 51), /more than it can pay/);
  await assert.rejects(out('loans', owed.id, 81), /more than that/);
  assert.deepEqual([Number((await get('bank_accounts', plain.id)).balance), Number((await get('credit_cards', gift.id)).balance)], [100, 50]);
  // Inside the limits it goes through; a card payment above what is owed leaves the card in credit, as before.
  await out('bank_accounts', od.id, 300);
  assert.equal(Number((await get('bank_accounts', od.id)).balance), -200);
  await out('credit_cards', visa.id, 30);
  assert.equal(Number((await get('credit_cards', visa.id)).balance), -20);
  // Undo is not held to the limit: taking back a deposit may leave an account below zero.
  const dep = await M.recordIncome({ amount: 500, target: `bank_account:${plain.id}`, date: '2026-11-23', description: 'Deposit' }, await accounts());
  await out('bank_accounts', plain.id, 550);
  await M.reverseTransaction(dep.transaction.id);
  assert.equal(Number((await get('bank_accounts', plain.id)).balance), -450);
});

test('next 30 days lists every loan payment in the window, down to what is still owed', () => {
  const up = F.upcoming({ loans: [
    { id: 'w', name: 'Weekly', balance: 250, payment_amount: 100, frequency: 'weekly', next_payment_date: '2026-11-25' },
    { id: 'm', name: 'Monthly', balance: 5000, payment_amount: 300, frequency: 'monthly', next_payment_date: '2026-12-01' },
    { id: 'l', name: 'Late', balance: 900, payment_amount: 50, frequency: 'biweekly', next_payment_date: '2026-11-10' },
    { id: 'z', name: 'Paid off', balance: 0, payment_amount: 50, frequency: 'weekly', next_payment_date: '2026-11-25' },
  ] }, new Date(2026, 10, 23), 30);
  const of = (n) => up.filter((x) => x.name === n).map((x) => [x.date, x.amount, x.note]);
  assert.deepEqual(of('Weekly'), [['2026-11-25', 100, null], ['2026-12-02', 100, null], ['2026-12-09', 50, null]]);
  assert.deepEqual(of('Monthly'), [['2026-12-01', 300, null]]);
  assert.deepEqual(of('Late'), [['2026-11-10', 50, 'past due'], ['2026-11-24', 50, null], ['2026-12-08', 50, null], ['2026-12-22', 50, null]]);
  assert.deepEqual(of('Paid off'), []);
});

test('another account cannot see, change, move, undo or wipe this account\'s data', async () => {
  const mine = await add('bank_accounts', { name: 'Mine only', balance: 700 });
  const spent = await M.recordExpense({ amount: 20, source: `bank_account:${mine.id}`, date: '2026-11-23', description: 'Mine' }, await accounts());
  const { token } = await (await realFetch(base + '/api/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'stranger@test.local' }) })).json();
  const as = async (path, body) => {
    const r = await realFetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const q = (table, action, more = {}) => as('/api/db', { table, action, filters: [['id', 'eq', mine.id]], or: [], order: [], ...more });
  // Reading: nothing of mine comes back, by id or in a full list.
  assert.deepEqual((await q('bank_accounts', 'select')).body.data, []);
  assert.equal(((await as('/api/db', { table: 'transactions', action: 'select', filters: [], or: [], order: [] })).body.data || []).length, 0);
  // Changing and deleting by id touch nothing.
  await q('bank_accounts', 'update', { values: { balance: 1, name: 'Taken' } });
  await q('bank_accounts', 'delete');
  // Writing a row under my id is refused.
  assert.equal((await as('/api/db', { table: 'bank_accounts', action: 'insert', values: { id: mine.id, name: 'Clash', balance: 0 }, filters: [], or: [], order: [] })).status, 409);
  assert.equal((await as('/api/db', { table: 'bank_accounts', action: 'upsert', values: { id: mine.id, name: 'Clash', balance: 0 }, filters: [], or: [], order: [] })).status, 409);
  // Money cannot be moved on my account, my transaction cannot be undone, my rows cannot be restored over.
  assert.equal((await as('/api/money', { legs: [{ table: 'bank_accounts', id: mine.id, delta: -5 }], rows: [] })).status, 404);
  assert.equal((await as(`/api/transactions/${spent.transaction.id}/reverse`, {})).status, 404);
  assert.equal((await as('/api/restore', { table: 'bank_accounts', rows: [{ id: mine.id, name: 'Clash', balance: 0 }] })).status, 409);
  assert.equal((await as('/api/restore-all', { confirm: 'REPLACE ALL MY DATA', data: { bank_accounts: [{ id: mine.id, name: 'Clash', balance: 0 }] } })).status, 409);
  // Their own reset and restore leave my data alone.
  assert.equal((await as('/api/restore-all', { confirm: 'REPLACE ALL MY DATA', data: { bank_accounts: [{ id: 'theirs-1', name: 'Theirs', balance: 3 }] } })).status, 200);
  assert.equal((await as('/api/reset', { confirm: 'DELETE ALL MY DATA' })).status, 200);
  const row = await get('bank_accounts', mine.id);
  assert.deepEqual([row.name, Number(row.balance)], ['Mine only', 680]);
  assert.equal((await get('transactions', spent.transaction.id)).status, 'active');
  // No token, or a made-up one: nothing.
  const bare = await realFetch(base + '/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer nope' }, body: JSON.stringify({ table: 'bank_accounts', action: 'select', filters: [] }) });
  assert.equal(bare.status, 401);
});
