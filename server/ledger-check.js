// Checks that what the app holds agrees with the ledger file it was filled from.
// Usage: node server/ledger-check.js <ledger file> <export file>
// The export file is what GET /api/export returns. Prints what differs and ends with 1 when anything does.
const fs = require('fs');

const cents = (n) => Math.round(Number(n) * 100);

function check(ledger, live) {
  const out = { differences: [], ledger_rows: ledger.lines.length, lines: 0, added_since: 0, changed_since: 0 };
  const say = (s) => { if (out.differences.length < 60) out.differences.push(s); else out.more = (out.more || 0) + 1; };
  const known = new Map(ledger.accounts.map((a) => [String(a.key), a]));
  const here = new Map(live.accounts.filter((a) => a.key).map((a) => [String(a.key), a]));

  // Every account in the file is here, with the balance the file states.
  for (const [key, a] of known) {
    const h = here.get(key);
    if (!h) { say(`account missing: ${key}`); continue; }
    if (Math.abs(cents(h.balance)) !== Math.abs(cents(a.balance))) (out.balances = out.balances || []).push(`${key}: file ${a.balance}, app ${h.balance}`);
    if (!!h.archived !== !!a.closed) say(`account open or closed differs: ${key}`);
    if (a.credit_limit && h.credit_limit && cents(a.credit_limit) !== cents(h.credit_limit)) say(`limit differs: ${key}: file ${a.credit_limit}, app ${h.credit_limit}`);
  }

  // Every row of the file is on exactly one line, and each account's rows add up to what its lines moved.
  const seen = new Map();
  const moved = new Map();
  const add = (k, c) => moved.set(k, (moved.get(k) || 0) + c);
  let withIds = true;
  for (const l of live.lines) {
    if (l.source !== 'import') { out.added_since++; continue; }
    if (l.updated_at || l.undone) out.changed_since++;
    if (l.undone) continue;
    out.lines++;
    if (!Array.isArray(l.external_ids)) withIds = false;
    for (const x of l.external_ids || [l.external_id]) seen.set(String(x), (seen.get(String(x)) || 0) + 1);
    if (l.updated_at) continue;
    for (const m of l.moves || []) if (m.account_key) add(String(m.account_key), cents(m.amount));
  }
  const want = new Map();
  const changedRows = new Set();
  for (const l of live.lines) if (l.source === 'import' && (l.updated_at || l.undone)) for (const x of l.external_ids || [l.external_id]) changedRows.add(String(x));
  let missing = 0;
  for (const r of ledger.lines) {
    const n = seen.get(String(r.id)) || 0;
    // A row of nothing moves no money and is not kept as a line.
    if (!cents(r.amount) && !n) { out.empty_rows = (out.empty_rows || 0) + 1; continue; }
    if (withIds && n !== 1 && !changedRows.has(String(r.id))) { missing++; if (missing <= 10) say(`row ${r.id} (${r.date}, ${r.account}, ${r.amount}) is on ${n} lines`); }
    if (changedRows.has(String(r.id)) || (withIds && !n)) continue;
    want.set(String(r.account), (want.get(String(r.account)) || 0) + cents(r.amount));
  }
  if (missing > 10) say(`${missing} rows in all are not on exactly one line`);
  if (!withIds) out.note = 'This export does not say which rows a line stands for: only account sums were checked.';
  for (const key of new Set([...want.keys(), ...moved.keys()])) {
    const a = want.get(key) || 0;
    const b = moved.get(key) || 0;
    // A loan kept from an investment account below zero counts the other way round.
    if (a !== b && a !== -b) say(`${key}: the file's rows add to ${(a / 100).toFixed(2)}, the app's lines moved ${(b / 100).toFixed(2)}`);
  }
  // Balances can only be compared while nothing has been added since the file was made.
  if (out.balances && !out.added_since && !out.changed_since) for (const b of out.balances) say(`balance differs: ${b}`);
  delete out.balances;
  out.ok = !out.differences.length;
  return out;
}

module.exports = { check };

if (require.main === module) {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) { console.error('Usage: node server/ledger-check.js <ledger file> <export file>'); process.exit(2); }
  const out = check(JSON.parse(fs.readFileSync(a, 'utf8')), JSON.parse(fs.readFileSync(b, 'utf8')));
  console.log(JSON.stringify(out, null, 1));
  process.exit(out.ok ? 0 : 1);
}
