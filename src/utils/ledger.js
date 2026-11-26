// The checkpoint ledger. Every balance you showed the app (a picture, a statement, a figure you typed) is a checkpoint
// for that account on that day. Between two checkpoints the saved lines must add up to the change in the balance.
// When they do not, something is missing, saved twice or on the wrong account, and the gap says how much and between
// which days. Line matching still stops a line being saved twice, and a statement that adds up is the strongest
// checkpoint of all: the three work on the same records, so they cannot disagree.
const cents = (n) => Math.round((Number(n) || 0) * 100);
const day10 = (d) => { const x = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null; };
const live = (t) => t && t.status !== 'undone' && t.status !== 'deleted';
const COUNTS = new Set(['ok', 'corrected', 'ok_history', 'open', 'open_history']);
const TYPE = { bank_accounts: 'bank_account', credit_cards: 'credit_card', loans: 'loan', investments: 'investment', assets: 'asset' };

// What a line did to one account, in cents: what it moved, plus what it is kept as history for.
function effect(t, table, id) {
  let c = 0, hit = false;
  for (const l of t._legs || []) if (l.table === table && String(l.id) === String(id)) { c += cents(l.delta); hit = true; }
  for (const h of t.history_only || []) if (h.table === table && String(h.id) === String(id)) { c += cents(h.amount); hit = true; }
  return hit ? c : null;
}

// -> { 'bank_accounts:ID': { table, id, type, name, points, first, checked_to, intervals: [{ from, to, start, end, expected, moved, gap, lines, statement, open }] } }
export function ledger({ snapshots = [], transactions = [] } = {}) {
  const by = new Map();
  for (const s of snapshots || []) {
    const d = day10(s.date);
    if (!d || !COUNTS.has(s.status) || !s.account_table || s.account_id == null) continue;
    const k = `${s.account_table}:${s.account_id}`;
    if (!by.has(k)) by.set(k, new Map());
    const was = by.get(k).get(d);
    // Two checkpoints on one day: the one recorded last is what the account showed.
    if (!was || String(s.created_at || '') >= String(was.created_at || '')) by.get(k).set(d, s);
  }
  const out = {};
  for (const [k, days] of by) {
    const points = [...days.values()].sort((a, b) => day10(a.date).localeCompare(day10(b.date)));
    const [table, ...rest] = k.split(':'), id = rest.join(':');
    const mine = (transactions || []).filter((t) => live(t) && t.type !== 'adjustment' && day10(t.date)).map((t) => ({ d: day10(t.date), c: effect(t, table, id) })).filter((x) => x.c != null);
    const intervals = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], from = day10(a.date), to = day10(b.date);
      const inside = mine.filter((x) => x.d > from && x.d < to), onFrom = mine.filter((x) => x.d === from), onTo = mine.filter((x) => x.d === to);
      const sum = (xs) => xs.reduce((s, x) => s + x.c, 0);
      const expected = cents(b.value) - cents(a.value), mid = sum(inside);
      // A line dated on a checkpoint's own day may or may not be in the balance shown that day. Any reading of those
      // two days that makes the sums agree is taken as agreeing.
      const tries = [mid + sum(onTo), mid + sum(onTo) + sum(onFrom), mid, mid + sum(onFrom)];
      const moved = tries.find((m) => m === expected) != null ? expected : tries[0];
      intervals.push({ from, to, start: cents(a.value) / 100, end: cents(b.value) / 100, expected: expected / 100, moved: moved / 100, gap: (expected - moved) / 100,
        lines: inside.length + onTo.length, statement: /statement/i.test(String(b.source || '')), open: b.status === 'open' || b.status === 'open_history', picture: b.picture || null });
    }
    const last = points[points.length - 1];
    out[k] = { table, id, type: TYPE[table] || table, name: last.name || '', points: points.length, first: day10(points[0].date), checked_to: day10(last.date), intervals };
  }
  return out;
}

// The stretches that do not add up, newest first. A stretch that ends in an open check is left out: that check already says so.
export function ledgerGaps(book) {
  const out = [];
  for (const a of Object.values(book || {})) for (const i of a.intervals) if (i.gap && !i.open) out.push({ ...i, table: a.table, id: a.id, type: a.type, name: a.name });
  return out.sort((x, y) => y.to.localeCompare(x.to));
}
