// Everything that does not match, in one list. Each entry says what disagrees and carries the fixes that can be
// done in place. A new kind of mismatch is one more block here: the screens only draw what this returns.
//   fix.do: 'correct' | 'dismiss' (a balance check), 'amount' (type today's figure for an account), 'ticker'
//           (name the holding), 'same' (set a known figure), 'unlink' (the plan is not inside this card), 'go' (open a page), 'leave' (stay quiet until the figures change).
import { cardSplit } from './finance';
import { planHome, looksLikePlan } from './cards';
import { keptIn, lineTerms, bankName } from './accounts';
import { ledger, ledgerGaps } from './ledger';

const money = (n) => `$${(Math.round(Number(n) * 100) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TARGET = { bank: 'bank_account', cash: 'bank_account', card: 'credit_card', card_credit: 'credit_card', gift_card: 'credit_card', loan: 'loan', mortgage: 'loan', investment: 'investment', asset: 'asset' };
const leave = (label = 'Leave it') => ({ do: 'leave', label });
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const day10 = (d) => { const x = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null; };
const nice = (d) => (d ? new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'an unknown day');
// Where a figure came from, in a few words.
const from = (picture, day, source) => `${picture ? 'from a picture' : source === 'you' ? 'typed in' : source === 'statement' ? 'from a statement' : 'recorded'}${day ? `, ${nice(day)}` : ''}`;

export function issues({ checks = [], transactions = [], stale = [], snapshots = [], bankAccounts = [], creditCards = [], loans = [], investments = [], rooms = [], taxMissing = [], quiet = {}, today = '' } = {}) {
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

  // 1b. Two checkpoints of one account whose saved lines do not add up to the change between them. The balance may
  //     have been corrected since, but the lines of that stretch are still missing, doubled or on another account.
  const nice2 = (d) => { const x = new Date(`${d}T12:00:00`); return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  for (const g of ledgerGaps(ledger({ snapshots, transactions }))) {
    const up = g.expected >= 0;
    add({ id: `gap:${g.table}:${g.id}:${g.to}`, sig: String(g.gap), kind: 'check', ref: String(g.id), title: `${g.name}: ${money(Math.abs(g.gap))} between ${nice2(g.from)} and ${nice2(g.to)} is not on record`,
      text: `It showed ${money(g.start)} on ${nice2(g.from)} and ${money(g.end)} on ${nice2(g.to)}: ${g.expected === 0 ? 'no change' : `${up ? 'up' : 'down'} ${money(Math.abs(g.expected))}`}. The ${g.lines} ${g.lines === 1 ? 'line' : 'lines'} saved for those days add up to ${money(g.moved)}. So ${money(Math.abs(g.gap))} is not explained: a line is missing, saved twice, or sits on another account.`,
      sums: [{ label: `Shown on ${nice2(g.from)}`, value: g.start }, { label: `Saved lines, ${nice2(g.from)} to ${nice2(g.to)}`, value: g.moved }, { label: `Shown on ${nice2(g.to)}`, value: g.end, total: true }, { label: 'Not explained', value: Math.abs(g.gap), tone: 'warning' }],
      pictures: g.picture ? [{ id: g.picture, label: `Read on ${nice2(g.to)}` }] : undefined,
      fixes: [{ do: 'go', label: 'Add a picture of those days', to: '/screenshot' }, { do: 'go', label: 'See its lines', to: '/transactions' }, leave()] });
  }

  // 2. Payment plans inside a card that add up to more than the card shows. The sums are laid out line by line, each
  //    with the day and the picture it came from, so the figure that is wrong can be seen and tapped.
  for (const c of creditCards) {
    if (c.is_gift_card) continue;
    const split = cardSplit(c, loans);
    if (!split.over) continue;
    const bal = Math.max(0, Number(c.balance) || 0);
    const snap = snapshots.filter((x) => x.account_table === 'credit_cards' && String(x.account_id) === String(c.id) && (x.status === 'ok' || x.status === 'corrected'))
      .sort((x, y) => String(y.date).localeCompare(String(x.date)) || String(y.created_at).localeCompare(String(x.created_at)))[0] || null;
    const cardDay = day10(c.balance_as_of || (snap && snap.date));
    const cardPic = snap && snap.picture && day10(snap.date) === cardDay ? snap.picture : null;
    const plans = split.plans.map((p) => { const l = loans.find((x) => String(x.id) === String(p.id)) || {}; return { ...p, day: day10(l.balance_as_of || l.created_at), picture: l.from_screenshot || null, billed: day10(l.last_billed) }; });
    const older = plans.filter((p) => p.day && cardDay && p.day < cardDay), newest = plans.map((p) => p.day).filter(Boolean).sort().pop();
    const why = cardDay && newest && cardDay < newest
      ? `The card balance is from ${nice(cardDay)}, before the plans were read (${nice(newest)}). It is the likely one to be out of date: a fresh picture of the card settles it.`
      : older.length
        ? `${older.map((p) => p.name).join(' and ')} ${older.length === 1 ? 'was' : 'were'} last read before the card balance (${nice(cardDay)}). If ${older.length === 1 ? 'it has' : 'they have'} been paid down or paid off since, set what is left.`
        : 'The figures are from the same day. Either a plan belongs to another card, or the balance on the card screen leaves its plans out.';
    add({ id: `plans:${c.id}`, sig: `${bal}:${split.inPlans}`, kind: 'plans', ref: String(c.id), title: `${c.name}: the plans add up to more than the card`,
      text: `The plans inside it come to ${money(split.inPlans)}, but the card shows ${money(bal)}: ${money(split.over)} short. Tap the figure that is wrong.`,
      sums: [
        ...plans.map((p) => ({ label: p.name, value: p.balance, from: from(p.picture, p.day), note: p.billed && p.billed >= (p.day || '') ? `installment billed ${nice(p.billed)}` : null,
          fix: { do: 'amount', label: `Change ${p.name}`, ask: `What is left on ${p.name}`, start: p.balance, target: `loan:${p.id}`,
            more: [{ do: 'same', label: 'It is paid off', target: `loan:${p.id}`, value: 0 }, { do: 'unlink', label: 'Not on this card', loan: p.id }] } })),
        { label: 'Plans together', value: split.inPlans, total: true },
        { label: `${c.name} balance`, value: bal, from: from(cardPic, cardDay, snap && snap.source), fix: { do: 'amount', label: 'Change the card balance', ask: `What ${c.name} owes today`, start: split.inPlans, target: `credit_card:${c.id}` } },
        { label: 'Short by', value: split.over, total: true, tone: 'warning' },
      ],
      why,
      pictures: [...new Map([...plans.map((p) => [p.picture, `${p.name}, ${nice(p.day)}`]), [cardPic, `${c.name}, ${nice(cardDay)}`]].filter(([id]) => id)).entries()].map(([id, label]) => ({ id, label })),
      fixes: [
        { do: 'go', label: 'Add a fresh picture', to: '/screenshot' },
        { do: 'same', label: 'The card figure leaves the plans out', target: `credit_card:${c.id}`, value: Math.round((bal + split.inPlans) * 100) / 100 },
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

  // 6. What is not known yet about an account, one entry per account. Each missing thing can be typed in place or
  //    filled by a picture that shows it. Only things that change what the app works out are asked for.
  // The most ever owed on an account whose limit no statement shows: the limit is at least that.
  const cad = (n) => `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const least = (x) => (Number(x.limit_at_least) > 0 ? Number(x.limit_at_least) : null);
  const ask = (table, row, what, rows, uses) => {
    const missing = rows.filter((r) => r.missing);
    if (!missing.length) return;
    add({ id: `need:${table}:${row.id}`, sig: missing.map((r) => r.field).join(','), kind: 'need', ref: String(row.id), title: missing.length === 1 && missing[0].atLeast ? `${row.name}: ${missing[0].short} is not confirmed (at least ${cad(missing[0].atLeast)})`
        : `${row.name}: ${list(missing.map((r) => r.short))} ${missing.length === 1 ? 'is' : 'are'} not known`,
      text: `The app cannot work out ${list(missing.map((r) => r.use))} without ${missing.length === 1 ? 'it' : 'them'}. Type ${missing.length === 1 ? 'it' : 'each one'} in, or add a picture that shows ${missing.length === 1 ? 'it' : 'them'}.`,
      sums: missing.map((r) => ({ label: r.label, value: null, ...(r.atLeast ? { unknown: `at least ${cad(r.atLeast)}` } : {}), fix: { do: 'field', label: `Add ${r.short}`, ask: r.ask, input: r.input, table, id: row.id, field: r.field, ...(r.suggest ? { suggest: r.suggest } : {}) } })),
      fixes: [{ do: 'go', label: `Add a picture of ${what}`, to: '/screenshot' }, leave('Not needed')] });
  };
  const blank = (v) => v == null || v === '' || !(Number(v) > 0);
  // An account with no bank on record: a picture from any bank could be taken for it, so it is asked for once.
  // One tap answers it: the banks you already use come first, then the common ones.
  const banks = [...new Set([...[...bankAccounts, ...creditCards, ...investments].map((x) => bankName(x.institution)).filter(Boolean), 'Scotiabank', 'TD', 'RBC', 'BMO', 'CIBC', 'Wealthsimple', 'Tangerine', 'EQ Bank'])].slice(0, 8);
  for (const a of bankAccounts) {
    if (a.account_type === 'cash') continue;
    ask('bank_accounts', a, 'the account', [
      { field: 'institution', missing: !String(a.institution || '').trim(), label: 'Bank', short: 'the bank', use: 'which pictures belong to it', ask: `The bank ${a.name} is at`, input: 'text', suggest: banks },
    ]);
  }
  for (const c of creditCards) {
    if (c.is_gift_card) continue;
    ask('credit_cards', c, 'the card', [
      { field: 'credit_limit', missing: blank(c.credit_limit), atLeast: least(c), label: 'Credit limit', short: 'the limit', use: 'how much of the limit is used', ask: `Credit limit of ${c.name}`, input: 'number' },
      { field: 'due_date', missing: Number(c.balance) > 0 && !day10(c.due_date), label: 'Next payment due', short: 'the due date', use: 'when the payment is due', ask: `Day the next payment on ${c.name} is due`, input: 'date' },
    ]);
  }
  for (const l of loans) {
    if (!(Number(l.balance) > 0)) continue;
    // A line of credit has no fixed payment: what matters is its limit and its rate.
    const line = !l.on_card_id && lineTerms(l, investments);
    if (line) {
      ask('loans', l, 'the line of credit', [
        { field: 'credit_limit', missing: line.limit == null, atLeast: least(l), label: 'Limit', short: 'the limit', use: 'how much is left to take', ask: `Limit of ${l.name}`, input: 'number' },
        { field: 'interest_rate', missing: line.rate == null, label: 'Interest % a year', short: 'the rate', use: 'what it costs each month', ask: `Yearly rate on ${l.name}, in percent`, input: 'number' },
      ]);
      continue;
    }
    ask('loans', l, l.on_card_id ? 'the plan' : 'the loan', [
      { field: 'payment_amount', missing: blank(l.payment_amount), label: 'Payment each time', short: 'the payment', use: 'what it takes each month', ask: `Payment on ${l.name}`, input: 'number' },
      { field: 'next_payment_date', missing: !day10(l.next_payment_date), label: 'Next payment day', short: 'the next payment day', use: 'when it is paid down', ask: `Day of the next payment on ${l.name}`, input: 'date' },
    ]);
  }
  // An account below the balance that keeps its monthly fee away.
  for (const a of bankAccounts) {
    const k = keptIn(a);
    if (!(k.short > 0)) continue;
    add({ id: `need:bank_accounts:min:${a.id}`, sig: `${String(today).slice(0, 7)}:${k.min}`, kind: 'need', ref: String(a.id), title: `${a.name} is ${money(k.short)} below what keeps its fee away`,
      text: `${a.name} charges ${money(k.fee)} a month unless ${money(k.min)} stays in it every day of the month. It holds ${money(Number(a.balance) || 0)} now, so this month's fee is charged unless it was above that all month.`,
      fixes: [{ do: 'go', label: 'Move money in', to: '/bank-accounts' }, { do: 'set', label: 'I pay the fee instead', table: 'bank_accounts', id: a.id, values: { keep_minimum: false } }, leave()] });
  }
  // A payment plan that stands on its own although one of your cards is known to hold plans from that store: inside
  // the card it is part of the card's balance; on its own it is counted as a second debt.
  for (const l of loans) {
    if (l.on_card_id || !(Number(l.balance) > 0) || !(l.loan_type === 'plan' || looksLikePlan(l.name))) continue;
    const card = planHome(l.name, creditCards);
    if (!card) continue;
    add({ id: `planhome:${l.id}`, sig: String(card.id), kind: 'need', ref: String(l.id), title: `${l.name} looks like a plan inside ${card.name}`,
      text: `${card.name} is known to hold equal payment plans from this store, with no interest. Inside the card, the plan is part of the card's balance and is billed on it. On its own, it is counted as a separate debt on top of the card.`,
      fixes: [{ do: 'set', label: `Put it inside ${card.name}`, table: 'loans', id: l.id, values: { on_card_id: card.id, loan_type: 'plan' } }, leave('It is a separate loan')] });
  }
  for (const r of rooms) {
    if (r.known || !(r.accounts || []).length) continue;
    add({ id: `need:room:${r.kind}`, sig: 'room', kind: 'need', ref: r.kind, title: `${r.kind}: the room left is not known`,
      text: `You have ${r.accounts.length === 1 ? 'a' : r.accounts.length} ${r.kind} account${r.accounts.length === 1 ? '' : 's'} here, but not the room the tax agency shows. One figure is enough; what goes in and out after it is counted for you.`,
      fixes: [{ do: 'go', label: 'Add a picture of your CRA account or notice', to: '/screenshot' }, { do: 'go', label: 'Enter the figure', to: '/room' }, leave('Not needed')] });
  }

  // 7. A balance not updated for a while. Left alone, it is asked about again the next month.
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

// Before a picture is saved: the plans it puts inside a card, together with the ones already there, against that
// card's balance (the one on the picture when it shows one, else the app's). -> one entry per card that falls short.
//   loanDrafts: the plans read ({ id, name, balance, on, on_card_ref })   drafts: accounts the picture adds
//   balances: balances the picture shows for accounts already in the app ({ account: { type, id }, shown })
export function plansOnPicture({ loanDrafts = [], drafts = [], balances = [], creditCards = [], loans = [] } = {}) {
  const out = [];
  const mine = loanDrafts.filter((l) => l.on && l.on_card_ref && Number(l.balance) > 0);
  for (const ref of [...new Set(mine.map((l) => l.on_card_ref))]) {
    const fresh = String(ref).startsWith('new:');
    const id = fresh ? null : String(ref).replace(/^credit_card:/, '');
    const card = fresh ? drafts.find((d) => d.id === ref) : creditCards.find((c) => String(c.id) === id);
    if (!card) continue;
    const seen = fresh ? null : balances.find((b) => b.account && b.account.type === 'credit_card' && String(b.account.id) === id);
    const shown = fresh ? card.balance : seen ? seen.shown : null;
    const onPicture = shown !== '' && shown != null && Number.isFinite(Number(shown));
    if (fresh && !onPicture) continue;
    const bal = Math.max(0, Number(onPicture ? shown : card.balance) || 0);
    const already = fresh ? [] : cardSplit(card, loans).plans;
    const here = mine.filter((l) => l.on_card_ref === ref);
    const together = Math.round((already.reduce((t, p) => t + p.balance, 0) + here.reduce((t, l) => t + Number(l.balance), 0)) * 100) / 100;
    if (together <= bal + 0.005) continue;
    const over = Math.round((together - bal) * 100) / 100;
    out.push({ ref, name: card.name, over,
      text: `The plans inside ${card.name} come to ${money(together)}, but the card ${onPicture ? 'on this picture' : 'in the app'} shows ${money(bal)}: ${money(over)} short.`,
      sums: [
        ...here.map((l) => ({ label: l.name, value: Number(l.balance), from: 'on this picture', fix: { do: 'edit', label: `Change ${l.name}`, draft: l.id } })),
        ...already.map((p) => ({ label: p.name, value: p.balance, from: 'already in the app' })),
        { label: 'Plans together', value: together, total: true },
        { label: `${card.name} balance`, value: bal, from: onPicture ? 'on this picture' : `in the app${day10(card.balance_as_of) ? `, ${nice(day10(card.balance_as_of))}` : ''}` },
        { label: 'Short by', value: over, total: true, tone: 'warning' },
      ],
      why: already.length ? 'A plan already in the app may be the same as one on this picture under another name, or may be paid off by now.'
        : onPicture ? 'A plan amount may be misread, a plan may belong to another card, or the balance on the card screen leaves its plans out.'
          : `The balance in the app may be older than this picture. A picture of ${card.name} itself brings it up to date.` });
  }
  return out;
}
