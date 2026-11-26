// Everything that does not match, in one list. Each entry says what disagrees and carries the fixes that can be
// done in place. A new kind of mismatch is one more block here: the screens only draw what this returns.
//   fix.do: 'correct' | 'dismiss' (a balance check), 'amount' (type today's figure for an account), 'ticker'
//           (name the holding), 'same' (the figure is still right today), 'go' (open a page), 'leave' (stay quiet until the figures change).
import { cardSplit } from './finance';

const money = (n) => `$${(Math.round(Number(n) * 100) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TARGET = { bank: 'bank_account', cash: 'bank_account', card: 'credit_card', card_credit: 'credit_card', gift_card: 'credit_card', loan: 'loan', mortgage: 'loan', investment: 'investment', asset: 'asset' };
const leave = (label = 'Leave it') => ({ do: 'leave', label });

export function issues({ checks = [], stale = [], creditCards = [], loans = [], investments = [], rooms = [], taxMissing = [], quiet = {}, today = '' } = {}) {
  const out = [];
  const add = (x) => { if (quiet[x.id] !== x.sig) out.push(x); };

  // 1. A balance seen on a day that the app's lines do not explain.
  for (const s of checks) {
    const left = s.left, history = s.status === 'open_history', now = s.app_now;
    const fixes = [];
    if ((!history || !left) && now != null) fixes.push({ do: 'correct', label: left ? `Correct to ${money(s.value)}` : 'Mark as matching', snap: s.id });
    if (left) fixes.push({ do: 'go', label: 'Add the missing lines from a picture', to: '/screenshot' }, { do: 'go', label: 'See its lines', to: '/transactions' });
    fixes.push({ do: 'dismiss', label: 'Leave it', snap: s.id });
    out.push({ id: `check:${s.id}`, sig: String(left), kind: 'check', ref: String(s.account_id), title: `${s.name} does not add up`,
      text: `On ${s.date} the ${s.source || 'snapshot'} showed ${money(s.value)}; ${history ? "the app's history gives" : 'the app has'} ${now == null ? 'no account' : money(now)}${left ? `, ${money(Math.abs(left))} ${left > 0 ? 'more than' : 'less than'} the app` : ', which now matches'}.`,
      fixes });
  }

  // 2. Payment plans inside a card that add up to more than the card shows.
  for (const c of creditCards) {
    if (c.is_gift_card) continue;
    const split = cardSplit(c, loans);
    if (!split.over) continue;
    add({ id: `plans:${c.id}`, sig: `${Number(c.balance) || 0}:${split.inPlans}`, kind: 'plans', ref: String(c.id), title: `${c.name}: the plans add up to more than the card`,
      text: `The plans inside it add up to ${money(split.inPlans)}; the card shows ${money(Math.max(0, Number(c.balance) || 0))}. One of the figures is out of date.`,
      fixes: [
        { do: 'amount', label: 'Update the card balance', ask: `What ${c.name} owes today`, start: split.inPlans, target: `credit_card:${c.id}` },
        ...split.plans.map((p) => ({ do: 'amount', label: `Change ${p.name}`, ask: `What is left on ${p.name} (0 if it is paid off)`, start: p.balance, target: `loan:${p.id}` })),
        leave(),
      ] });
  }

  // 3. A holding whose units are known but whose market price is not.
  for (const inv of investments) {
    (Array.isArray(inv.holdings) ? inv.holdings : []).forEach((h, index) => {
      if (!h || h.symbol || !(Number(h.units) > 0)) return;
      const name = h.name || h.shown || 'A holding';
      add({ id: `price:${inv.id}:${h.shown || h.name}`, sig: 'kept', kind: 'price', ref: String(inv.id), title: `${name} in ${inv.name} has no market price`,
        text: `It stays at ${h.value != null ? money(h.value) : 'the value last given'} until it is matched to a ticker.`,
        fixes: [{ do: 'ticker', label: 'Give its ticker', ask: 'Ticker, for example VEQT.TO', inv: inv.id, index }, leave('Keep it at this value')] });
    });
  }

  // 4. Room in a registered account: more went in than allowed, or the figure is from an earlier year.
  for (const r of rooms) {
    if (!r.known) continue;
    if (r.over > 0) add({ id: `room-over:${r.kind}`, sig: String(r.room), kind: 'room', ref: r.kind, title: `${r.kind}: more went in than the room allows`,
      text: `${money(r.over)} over, taxed at 1% a month (about ${money(r.cost_month)}) while it stays in. If the room figure is old, enter the latest one.`,
      fixes: [{ do: 'go', label: 'Enter the latest figure', to: '/room' }, { do: 'go', label: 'Add a picture of it', to: '/screenshot' }, leave()] });
    else if (r.stale) add({ id: `room-old:${r.kind}`, sig: String(r.as_of), kind: 'room', ref: r.kind, title: `${r.kind} room is from ${String(r.as_of).slice(0, 4)}`,
      text: 'New room comes with each notice of assessment, so this year\'s is not counted yet.',
      fixes: [{ do: 'go', label: 'Enter the latest figure', to: '/room' }, { do: 'go', label: 'Add a picture of the notice', to: '/screenshot' }, leave()] });
  }

  // 5. A tax year missing between the years on record.
  for (const y of taxMissing) add({ id: `taxyear:${y}`, sig: 'none', kind: 'tax', ref: String(y), title: `No ${y} tax year on record`,
    text: 'The years before and after it are here, so what follows from them has a gap.',
    fixes: [{ do: 'go', label: 'Add a picture of the return or notice', to: '/screenshot' }, { do: 'go', label: 'Enter the year', to: '/tax' }, leave('There was no return that year')] });

  // 6. A balance not updated for a while. Left alone, it is asked about again the next month.
  for (const x of stale) {
    const target = TARGET[x.kind];
    if (!target) continue;
    add({ id: `stale:${target}:${x.id}`, sig: `${x.asOf || 'never'}:${String(today).slice(0, 7)}`, kind: 'stale', ref: String(x.id), title: `${x.name} is out of date`,
      text: `${x.asOf ? `Last updated ${String(x.label || '').toLowerCase()}` : 'Never updated'}. It shows ${money(x.value)}.`,
      fixes: [{ do: 'amount', label: 'Update it', ask: `Today's figure for ${x.name}`, start: x.signed != null ? x.signed : x.value, target: `${target}:${x.id}` },
        ...(x.signed != null ? [{ do: 'same', label: 'It is still right', target: `${target}:${x.id}`, value: x.signed }] : []),
        { do: 'go', label: 'Add a picture', to: '/screenshot' }, leave()] });
  }
  return out;
}
