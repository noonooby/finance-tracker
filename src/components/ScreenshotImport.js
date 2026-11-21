import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/server';
import { recordExpense, recordIncome, recordRefund, recordTransfer, recordCardPayment, recordSnapshot, reverseTransaction } from '../utils/money';
import { server } from '../utils/server';
import { formatCurrency, generateId } from '../utils/helpers';
import { Camera, Image as ImageIcon } from 'lucide-react';

const readFile = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Could not open that file.'));
  r.readAsDataURL(file);
});

// Phone photos are large: shrink to at most 2000 px on the long side as JPEG before sending.
// Small text stays readable at that size. If the browser can't draw the image, the original is sent.
async function prepare(file) {
  const original = await readFile(file);
  if (file.type === 'application/pdf') return { url: original, type: 'application/pdf', pdf: true };
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = original; });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 3_000_000 && file.type !== 'image/heic' && file.type !== 'image/heif') return { url: original, type: file.type || 'image/jpeg' };
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { url: c.toDataURL('image/jpeg', 0.85), type: 'image/jpeg' };
  } catch {
    return { url: original, type: file.type || 'image/jpeg' };
  }
}

const STATUS_TEXT = {
  record: 'New',
  mark_posted: 'Posts a pending line',
  already: 'Looks already recorded',
  choose_account: 'Choose the account',
  skip: 'Could not read',
};
const KIND_TEXT = { purchase: 'Purchase', income: 'Money in', refund: 'Refund', card_payment: 'Card payment', transfer: 'Transfer' };

// Same merchant key as the server (server/reader.js mkey), used to find how a merchant was categorised before.
const mkey = (m) => String(m || '').toLowerCase().replace(/^(sq|sp|tst|klarna|paypal|pp)\s*\*\s*/, '').replace(/[^a-z]/g, '').slice(0, 24);
async function sha32(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
// A new account (not saved yet) is referred to by its draft id, e.g. "new:0".
const ref = (a) => (!a ? '' : String(a.id).startsWith('new:') ? String(a.id) : `${a.type}:${a.id}`);

// How one line changes the balance of one account (bank: money in it; card: owed).
function effectOn(row, accountRef, isCard) {
  const a = Number(row.amount) || 0;
  if (row.kind === 'transfer') {
    if (row.from === accountRef) return isCard ? a : -a;
    if (row.to === accountRef) return isCard ? -a : a;
    return 0;
  }
  if (row.kind === 'card_payment') {
    if (row.card === accountRef) return -a;
    if (row.source === accountRef) return isCard ? a : -a;
    return 0;
  }
  if (row.target !== accountRef) return 0;
  if (row.kind === 'purchase') return isCard ? a : -a;
  return isCard ? -a : a; // income or refund
}

export default function ScreenshotImport({ darkMode, bankAccounts = [], creditCards = [], loans = [], categories = [], transactions = [], onUpdate }) {
  const [image, setImage] = useState(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState(null);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [fixes, setFixes] = useState([]);
  const [removals, setRemovals] = useState({});
  const [open, setOpen] = useState(null);
  const [done, setDone] = useState(null);
  const [aiReady, setAiReady] = useState(true);
  useEffect(() => { server.auth.config().then((c) => setAiReady(c.ai !== false)); }, []);

  const expenseCategories = categories.filter((c) => !c.is_income);
  const incomeCategories = categories.filter((c) => c.is_income);
  const catsFor = (kind) => (kind === 'purchase' ? expenseCategories : kind === 'income' ? incomeCategories : []);
  const accountOptions = useMemo(() => [
    ...drafts.filter((d) => d.on).map((d) => ({ value: d.id, label: `New: ${d.name}` })),
    ...bankAccounts.map((a) => ({ value: `bank_account:${a.id}`, label: a.name })),
    ...creditCards.filter((c) => !c.is_gift_card).map((c) => ({ value: `credit_card:${c.id}`, label: c.name })),
    ...creditCards.filter((c) => c.is_gift_card).map((c) => ({ value: `credit_card:${c.id}`, label: `${c.name} (gift card)` })),
    { value: 'cash_in_hand', label: 'Cash in hand' },
  ], [drafts, bankAccounts, creditCards]);
  const nameOf = (v) => (accountOptions.find((o) => o.value === v) || {}).label || 'Choose';
  const isCardRef = (v) => v.startsWith('credit_card:') || (v.startsWith('new:') && (drafts.find((d) => d.id === v) || {}).type === 'credit_card');

  const card = 'bg-surface border-line text-fg';
  const muted = 'text-muted';
  const input = `px-2 py-1.5 rounded border text-sm w-full bg-surface border-line text-fg`;

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setProposal(null); setDone(null);
    try { setImage({ ...(await prepare(file)), name: file.name }); } catch (err) { setError(err.message); }
  };

  // A category for a purchase: how this merchant was categorised before, else the reader's guess matched to your categories.
  const suggestCategory = (merchant, guess, income = false) => {
    const pool = income ? incomeCategories : expenseCategories;
    const k = mkey(merchant);
    const past = k && [...transactions].sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .find((t) => t.category_id && mkey(t.description) === k);
    if (past && pool.some((c) => String(c.id) === String(past.category_id))) return String(past.category_id);
    const g = String(guess || '').toLowerCase();
    const hit = (g && pool.find((c) => c.name.toLowerCase() === g))
      || (g && pool.find((c) => c.name.toLowerCase().includes(g) || g.includes(c.name.toLowerCase())));
    return hit ? String(hit.id) : '';
  };

  const read = async () => {
    setReading(true); setError(''); setDone(null); setOpen(null);
    try {
      const p = await api('/api/read-screenshot', { image: image.url, mime: image.type, today: new Date().toLocaleDateString('en-CA') });
      setProposal(p);
      setDrafts((p.new_accounts || []).map((d) => ({ ...d, on: true, balance: d.balance == null ? '' : String(d.balance),
        credit_limit: d.credit_limit == null ? '' : String(d.credit_limit), due_date: d.due_date || '' })));
      setRows(p.lines.map((l) => {
        const acct = ref(l.account), oth = ref(l.other);
        const out = l.direction === 'out';
        const kind = l.kind || (out ? 'purchase' : 'income');
        const r = { ...l, kind, on: l.action === 'record' || l.action === 'mark_posted', target: acct, category_id: kind === 'purchase' || kind === 'income' ? suggestCategory(l.merchant, l.category_guess, kind === 'income') : '' };
        if (kind === 'transfer') { r.from = out ? acct : oth; r.to = out ? oth : acct; }
        if (kind === 'card_payment') {
          const acctIsCard = acct.startsWith('credit_card:') || (l.account && l.account.type === 'credit_card');
          r.card = acctIsCard ? acct : oth; r.source = acctIsCard ? oth : acct;
        }
        return r;
      }));
      setFixes(p.balances.map((b) => ({ ...b, on: true })));
      setRemovals({});
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(false);
    }
  };

  const setRow = (i, patch) => setRows((rs) => rs.map((r) => (r.i === i ? { ...r, ...patch } : r)));
  const setDraft = (id, patch) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const changeKind = (r, kind) => {
    const base = r.target || r.from || r.card || r.source || '';
    const patch = { kind };
    if (kind === 'transfer') { patch.from = r.direction === 'in' ? (r.other_ref || '') : base; patch.to = r.direction === 'in' ? base : ''; }
    else if (kind === 'card_payment') { patch.card = isCardRef(base) ? base : ''; patch.source = isCardRef(base) ? '' : base; }
    else patch.target = base;
    if (kind === 'purchase' || kind === 'income') patch.category_id = suggestCategory(r.merchant, r.category_guess, kind === 'income');
    setRow(r.i, patch);
  };

  // What still needs an answer before a line can be saved.
  const missing = (r) => {
    if (r.action === 'mark_posted' || r.action === 'skip') return null;
    if (!(Number(r.amount) > 0)) return 'Enter the amount';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) return 'Enter the date';
    if (r.kind === 'transfer') return !r.from || !r.to ? 'Choose both accounts' : r.from === r.to ? 'Choose two different accounts' : null;
    if (r.kind === 'card_payment') return !r.card ? 'Choose the card' : !r.source ? 'Choose what paid it' : null;
    return r.target ? null : 'Choose the account';
  };

  const save = async () => {
    setSaving(true); setError('');
    const result = { recorded: 0, posted: 0, repeated: 0, corrected: 0, created: [], gaps: [], failed: [] };
    const chosenRows = rows.filter((x) => x.on);
    const banks = [...bankAccounts], cards = [...creditCards];
    const realRef = {};
    // 1. New accounts. The opening balance is set so that, after the lines below are recorded, it equals the balance on the screenshot.
    for (const d of drafts.filter((x) => x.on)) {
      try {
        const shown = d.balance === '' ? null : Number(d.balance);
        const effect = chosenRows.reduce((s, r) => s + effectOn(r, d.id, d.type === 'credit_card'), 0);
        if (shown == null || !Number.isFinite(shown)) throw new Error('Enter its balance today');
        const opening = Math.round((shown - effect) * 100) / 100;
        const id = generateId();
        const table = d.type === 'credit_card' ? 'credit_cards' : 'bank_accounts';
        const row = d.type === 'credit_card'
          ? { id, name: d.name.trim(), balance: opening, last4: d.last4 || null, credit_limit: Number(d.credit_limit) || 0, due_date: d.due_date || null,
            minimum_payment: d.minimum_payment || null, is_gift_card: false, created_at: new Date().toISOString() }
          : { id, name: d.name.trim(), balance: opening, last4: d.last4 || null, account_type: d.account_type || 'checking', institution: '', created_at: new Date().toISOString() };
        const { error: e } = await server.from(table).insert(row);
        if (e) throw new Error(e.message);
        (d.type === 'credit_card' ? cards : banks).push(row);
        realRef[d.id] = `${d.type}:${id}`;
        result.created.push(d.name);
      } catch (err) { result.failed.push(`${d.name}: ${err.message}`); }
    }
    const accounts = { bankAccounts: banks, creditCards: cards, loans };
    const real = (v) => (v && v.startsWith('new:') ? realRef[v] || null : v);
    // 2. The lines.
    for (const r0 of chosenRows) {
      const label = `${r0.merchant} ${formatCurrency(r0.amount)}`;
      try {
        if (r0.action === 'mark_posted') {
          const { error: e } = await server.from('transactions').update({ pending: false, date: r0.date }).eq('id', r0.existing_id);
          if (e) throw new Error(e.message);
          result.posted += 1;
          continue;
        }
        const why = missing(r0);
        if (why) throw new Error(why);
        const r = { ...r0, target: real(r0.target), from: real(r0.from), to: real(r0.to), card: real(r0.card), source: real(r0.source) };
        if ([r.target, r.from, r.to, r.card, r.source].some((v, k) => v === null && [r0.target, r0.from, r0.to, r0.card, r0.source][k])) throw new Error('Its new account was not added');
        let key = r.key;
        if (r0.account && String(r0.account.id).startsWith('new:') && r.key_rest) {
          const id = (realRef[String(r0.account.id)] || '').split(':')[1];
          if (id) key = 'shot:' + await sha32(`${id}|${r.key_rest}`);
        }
        const common = { amount: Number(r.amount), date: r.date, description: r.merchant, key, extra: { pending: r.pending, from_screenshot: proposal.source_id, in_snapshot: true } };
        let res;
        if (r.kind === 'purchase') {
          const cat = categories.find((c) => String(c.id) === String(r.category_id));
          res = await recordExpense({ ...common, source: r.target, category_id: cat ? cat.id : null, category_name: cat ? cat.name : null }, accounts);
        } else if (r.kind === 'refund') res = await recordRefund({ ...common, target: r.target }, accounts);
        else if (r.kind === 'income') {
          const cat = categories.find((c) => String(c.id) === String(r.category_id));
          res = await recordIncome({ ...common, target: r.target, source_name: r.merchant, extra: { ...common.extra, category_id: cat ? cat.id : null, category_name: cat ? cat.name : null } }, accounts);
        }
        else if (r.kind === 'transfer') res = await recordTransfer({ ...common, from: r.from, to: r.to }, accounts);
        else if (r.kind === 'card_payment') res = await recordCardPayment({ ...common, cardId: r.card.split(':')[1], source: r.source }, accounts);
        if (res && res.repeated) result.repeated += 1; else result.recorded += 1;
      } catch (err) {
        result.failed.push(`${label}: ${err.message}`);
      }
    }
    // 3. The balances on the screenshot, after the lines: each is a snapshot. The server compares it with the app;
    // a difference the lines don't explain is corrected (undoable) when ticked, or left open on Where you stand.
    const day = new Date().toLocaleDateString('en-CA');
    const snaps = [
      ...fixes.map((f) => ({ target: `${f.account.type}:${f.account.id}`, name: f.account.name, value: f.shown, apply: f.on })),
      ...drafts.filter((d) => d.on && realRef[d.id]).map((d) => ({ target: realRef[d.id], name: d.name, value: Number(d.balance), apply: true })),
    ];
    // A statement: its closing balance is a snapshot for the last day of the period. If it is the newest thing known about
    // the account it sets the balance for that day; if not, it is checked against the app's history for that day.
    const st = proposal.statement;
    if (st && st.account && st.closing_balance != null) {
      const target = String(st.account.id).startsWith('new:') ? realRef[st.account.id] : `${st.account.type}:${st.account.id}`;
      if (target) snaps.push({ target, name: `${st.account.name} statement to ${st.period_end}`, value: st.closing_balance, apply: true, date: st.period_end, source: 'statement' });
    }
    for (const t of (st && st.not_on_statement) || []) {
      if (!removals[t.id]) continue;
      try { await reverseTransaction(t.id, { remove: true }); result.removed = (result.removed || 0) + 1; } catch (err) { result.failed.push(`${t.description}: ${err.message}`); }
    }
    for (const sn of snaps) {
      try {
        const out = await recordSnapshot({ target: sn.target, value: sn.value, date: sn.date || day, source: sn.source || 'screenshot', apply: sn.apply });
        const gap = Number(out.snapshot.gap) || 0;
        if (out.snapshot.status === 'corrected') { result.corrected += 1; result.gaps.push(`${sn.name}: the lines did not explain ${formatCurrency(Math.abs(gap))}; corrected to ${formatCurrency(sn.value)} (undo from Activity)`); }
        else if (out.snapshot.status === 'open') result.gaps.push(`${sn.name}: off by ${formatCurrency(Math.abs(gap))}; left open on Where you stand`);
        else if (out.snapshot.status === 'open_history') result.gaps.push(`${sn.name}: the app's history gives ${formatCurrency(out.snapshot.app_value)} for that day, ${formatCurrency(Math.abs(gap))} off. Today's balance is unchanged; see Checks on Where you stand.`);
        else if (out.snapshot.status === 'ok_history') result.gaps.push(`${sn.name}: matches the app's history`);
      } catch (err) {
        result.failed.push(`${sn.name}: ${err.message}`);
      }
    }
    setDone(result);
    setSaving(false);
    if (onUpdate) await onUpdate();
    if (!result.failed.length) { setProposal(null); setImage(null); setDrafts([]); }
  };

  const chosen = rows.filter((r) => r.on).length + fixes.length + drafts.filter((d) => d.on).length;
  const draftNeeds = (d) => (!d.on ? null : !d.name.trim() ? 'Enter a name' : d.balance === '' || !Number.isFinite(Number(d.balance)) ? `Not on the screenshot: enter ${d.type === 'credit_card' ? 'what you owe on it' : 'its balance'} today` : null);
  const blocked = rows.filter((r) => r.on && missing(r)).length + drafts.filter(draftNeeds).length;
  const snapDay = (v) => {
    if (!v) return null;
    const [t, id] = v.split(':');
    const a = (t === 'bank_account' ? bankAccounts : t === 'credit_card' ? creditCards : []).find((x) => String(x.id) === id);
    return a && a.snapshot_date;
  };
  const historyOnly = (r) => [r.target, r.from, r.to, r.card, r.source].map(snapDay).find((d) => d && r.date < d);
  const lineSummary = (r) => {
    if (r.kind === 'transfer') return `${nameOf(r.from)} to ${nameOf(r.to)}`;
    if (r.kind === 'card_payment') return `${nameOf(r.source)} pays ${nameOf(r.card)}`;
    return nameOf(r.target);
  };
  const Select = ({ value, onChange, label, cards }) => (
    <label className="block text-xs">
      <span className={muted}>{label}</span>
      <select className={input} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose</option>
        {accountOptions.filter((o) => cards === undefined || isCardRef(o.value) === cards).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className={`text-2xl font-bold text-fg`}>Scan</h1>
        <p className={`text-sm ${muted}`}>
          Take a photo of a receipt, or choose a screenshot of your bank or card app, or a statement PDF. The app fills in everything it can: new accounts, the account for each line,
          the kind of line and a category. Check it, change anything with Edit, then tap Confirm. Nothing is saved before that.
        </p>
      </div>

      <div className={`border rounded-lg p-4 space-y-3 ${card}`}>
        {!aiReady && (
          <p role="status" className="text-sm rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 px-3 py-2">
            Reading photos needs a Gemini key. The owner of the app adds it once in Settings. Until then you can add transactions with the + button.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="press cursor-pointer flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700 py-5 text-blue-700 dark:text-blue-300 font-medium">
            <Camera size={26} aria-hidden="true" />
            Take a photo
            <input type="file" accept="image/*" capture="environment" onChange={pick} className="sr-only" />
          </label>
          <label className="press cursor-pointer flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line py-5 font-medium">
            <ImageIcon size={26} aria-hidden="true" />
            Screenshot or statement
            <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf" onChange={pick} className="sr-only" />
          </label>
        </div>
        {image && (
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            {image.pdf ? <div className="text-sm font-medium">{image.name}</div> : <img src={image.url} alt="The screenshot to read" className="max-h-64 rounded border border-line" />}
            <button type="button" onClick={read} disabled={reading}
              className="px-4 py-2 rounded-lg bg-accent text-accent-contrast font-medium hover:bg-blue-700 disabled:opacity-50">
              {reading ? 'Reading...' : image.pdf ? 'Read statement' : 'Read screenshot'}
            </button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>

      {proposal && (
        <div className={`border rounded-lg p-4 space-y-4 ${card}`}>
          <h2 className="font-semibold">Check before saving</h2>
          {proposal.notes && <p className={`text-sm ${muted}`}>{proposal.notes}</p>}
          {proposal.statement && (
            <section className="space-y-1 text-sm">
              <h3 className="font-semibold">Statement</h3>
              <div>{proposal.statement.account ? proposal.statement.account.name : 'Account not found'}{proposal.statement.period_start ? `, ${proposal.statement.period_start} to ${proposal.statement.period_end}` : `, to ${proposal.statement.period_end}`}
                {proposal.statement.closing_balance != null && `, closing balance ${formatCurrency(proposal.statement.closing_balance)}`}</div>
              <p className={`text-xs ${muted}`}>Lines before your latest balance are added as history and don't change today's balance. The closing balance is checked against the app after saving.</p>
              {proposal.statement.not_on_statement.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="font-medium text-amber-600">In the app for this period but not on the statement</div>
                  {proposal.statement.not_on_statement.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={!!removals[t.id]} onChange={(e) => setRemovals((m) => ({ ...m, [t.id]: e.target.checked }))} />
                      Remove {t.description} {formatCurrency(t.amount)} on {t.date}
                    </label>
                  ))}
                  <p className={`text-xs ${muted}`}>Leave unticked if it belongs elsewhere (another card, cash). Removed lines can be found in Activity.</p>
                </div>
              )}
            </section>
          )}

          {drafts.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">New accounts to add</h3>
              {drafts.map((d) => (
                <div key={d.id} className={`rounded-lg border p-3 space-y-2 border-line`}>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={d.on} onChange={(e) => setDraft(d.id, { on: e.target.checked })} />
                    Add {d.name}{d.last4 ? ` (ending ${d.last4})` : ''}
                  </label>
                  {d.on && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs"><span className={muted}>Name</span>
                        <input className={input} value={d.name} onChange={(e) => setDraft(d.id, { name: e.target.value })} /></label>
                      <label className="block text-xs"><span className={muted}>Kind</span>
                        <select className={input} value={d.type === 'credit_card' ? 'credit_card' : d.account_type} onChange={(e) => setDraft(d.id, e.target.value === 'credit_card' ? { type: 'credit_card' } : { type: 'bank_account', account_type: e.target.value })}>
                          <option value="checking">Chequing</option><option value="savings">Savings</option><option value="credit_card">Credit card</option>
                        </select></label>
                      <label className="block text-xs"><span className={muted}>Last 4 digits</span>
                        <input className={input} inputMode="numeric" maxLength={4} value={d.last4 || ''} onChange={(e) => setDraft(d.id, { last4: e.target.value.replace(/\D/g, '') })} /></label>
                      <label className="block text-xs"><span className={muted}>{d.type === 'credit_card' ? 'Owed today' : 'Balance today'}</span>
                        <input className={input} type="number" step="0.01" inputMode="decimal" value={d.balance} placeholder="Not shown" onChange={(e) => setDraft(d.id, { balance: e.target.value })} /></label>
                      {d.type === 'credit_card' && (<>
                        <label className="block text-xs"><span className={muted}>Credit limit</span>
                          <input className={input} type="number" step="0.01" inputMode="decimal" value={d.credit_limit} placeholder="Optional" onChange={(e) => setDraft(d.id, { credit_limit: e.target.value })} /></label>
                        <label className="block text-xs"><span className={muted}>Payment due</span>
                          <input className={input} type="date" value={d.due_date} onChange={(e) => setDraft(d.id, { due_date: e.target.value })} /></label>
                      </>)}
                    </div>
                  )}
                  {draftNeeds(d) && <div className="text-xs text-amber-600">{draftNeeds(d)}</div>}
                </div>
              ))}
              <p className={`text-xs ${muted}`}>The lines below are recorded on the new account and its balance ends at the figure above.</p>
            </section>
          )}
          {proposal.unknown_accounts.length > 0 && (
            <p className="text-sm text-amber-600">Also on the screenshot but not added: {proposal.unknown_accounts.map((a) => a.name).join(', ')}. Add loans under More, Loans.</p>
          )}

          <section className="space-y-1">
            <h3 className="text-sm font-semibold">Lines</h3>
            {rows.length === 0 && <p className={`text-sm ${muted}`}>No transactions found in this screenshot.</p>}
            <ul className={`divide-y divide-line`}>
              {rows.map((r) => {
                const need = r.on && missing(r);
                const cat = catsFor(r.kind).find((c) => String(c.id) === String(r.category_id));
                const editable = r.action !== 'mark_posted' && r.action !== 'skip';
                return (
                  <li key={r.i} className="py-2 space-y-2">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={r.on} disabled={r.action === 'skip'} aria-label={`Save ${r.merchant}`}
                        onChange={(e) => setRow(r.i, { on: e.target.checked })} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{r.merchant}</div>
                        <div className={`text-xs ${muted}`}>
                          {r.date}{r.pending ? ', pending' : ''} · {KIND_TEXT[r.kind] || r.kind} · {lineSummary(r)}{cat ? ` · ${cat.name}` : ''}
                        </div>
                        {r.action !== 'record' && r.action !== 'choose_account' && <div className={`text-xs ${muted}`}>{r.why || STATUS_TEXT[r.action]}</div>}
                        {need && <div className="text-xs text-amber-600">{need}</div>}
                        {historyOnly(r) && <div className={`text-xs ${muted}`}>Before your snapshot of {historyOnly(r)}: kept as history, today's balance does not change</div>}
                      </div>
                      <div className="text-right">
                        <div className={r.kind === 'purchase' ? 'font-medium' : 'font-medium text-green-600'}>{formatCurrency(r.amount)}</div>
                        {editable && <button type="button" className="text-xs font-medium text-blue-600 dark:text-blue-400" onClick={() => setOpen(open === r.i ? null : r.i)} aria-expanded={open === r.i}>{open === r.i ? 'Done' : 'Edit'}</button>}
                      </div>
                    </div>
                    {editable && open === r.i && (
                      <div className="grid grid-cols-2 gap-2 pl-6">
                        <label className="block text-xs col-span-2"><span className={muted}>Description</span>
                          <input className={input} value={r.merchant} onChange={(e) => setRow(r.i, { merchant: e.target.value })} /></label>
                        <label className="block text-xs"><span className={muted}>Amount</span>
                          <input className={input} type="number" step="0.01" inputMode="decimal" value={r.amount} onChange={(e) => setRow(r.i, { amount: e.target.value })} /></label>
                        <label className="block text-xs"><span className={muted}>Date</span>
                          <input className={input} type="date" value={r.date} onChange={(e) => setRow(r.i, { date: e.target.value })} /></label>
                        <label className="block text-xs col-span-2"><span className={muted}>What it is</span>
                          <select className={input} value={r.kind} onChange={(e) => changeKind(r, e.target.value)}>
                            {Object.entries(KIND_TEXT).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                          </select></label>
                        {r.kind === 'transfer' && (<>
                          <Select label="From" value={r.from} onChange={(v) => setRow(r.i, { from: v })} />
                          <Select label="To" value={r.to} onChange={(v) => setRow(r.i, { to: v })} />
                        </>)}
                        {r.kind === 'card_payment' && (<>
                          <Select label="Card paid" value={r.card} cards onChange={(v) => setRow(r.i, { card: v })} />
                          <Select label="Paid from" value={r.source} cards={false} onChange={(v) => setRow(r.i, { source: v })} />
                        </>)}
                        {!['transfer', 'card_payment'].includes(r.kind) && (
                          <Select label={r.kind === 'purchase' ? 'Paid with' : 'Into'} value={r.target} onChange={(v) => setRow(r.i, { target: v })} />
                        )}
                        {catsFor(r.kind).length > 0 && (
                          <label className="block text-xs"><span className={muted}>Category</span>
                            <select className={input} value={r.category_id} onChange={(e) => setRow(r.i, { category_id: e.target.value })}>
                              <option value="">No category</option>
                              {catsFor(r.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select></label>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {fixes.length > 0 && (
            <section className="space-y-1">
              <h3 className="font-semibold text-sm">Balances on the screenshot</h3>
              {fixes.map((f, i) => (
                <div key={i} className="text-sm">
                  <div>{f.account.name}: {formatCurrency(f.shown)} today{f.differs ? ` (the app has ${formatCurrency(f.current)} before these lines)` : ', matches the app'}</div>
                  <label className={`flex items-center gap-2 text-xs ${muted}`}>
                    <input type="checkbox" checked={f.on} onChange={(e) => setFixes((fs) => fs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                    If the lines don't explain it, correct it to the screenshot (you can undo it)
                  </label>
                </div>
              ))}
              <p className={`text-xs ${muted}`}>The balance is checked after the lines are saved. Anything that still doesn't add up is shown, never hidden. Unticked, the difference stays open on Where you stand.</p>
            </section>
          )}
          <button type="button" onClick={save} disabled={saving || !chosen || blocked > 0}
            className="w-full px-4 py-2.5 rounded-lg bg-accent text-accent-contrast font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : blocked ? `Answer ${blocked} ${blocked === 1 ? 'question' : 'questions'} above first` : `Confirm and save ${chosen} ${chosen === 1 ? 'item' : 'items'}`}
          </button>
        </div>
      )}

      {done && (
        <div role="status" className={`border rounded-lg p-4 text-sm ${card}`}>
          {done.created.length > 0 && <div>Accounts added: {done.created.join(', ')}.</div>}
          Saved {done.recorded}. Pending lines marked as posted: {done.posted}.
          {done.repeated > 0 && ` Already saved from an earlier screenshot, skipped: ${done.repeated}.`}
          {done.removed > 0 && ` Removed as not on the statement: ${done.removed}.`}
          {done.gaps.length > 0 && <ul className="mt-1 list-disc pl-5">{done.gaps.map((g) => <li key={g}>{g}</li>)}</ul>}
          {done.failed.length > 0 && (
            <ul className="mt-2 text-red-600 list-disc pl-5">{done.failed.map((f) => <li key={f}>{f}</li>)}</ul>
          )}
          <div className={`mt-1 ${muted}`}>Each saved line can be undone from Transactions or Activity.</div>
        </div>
      )}
    </div>
  );
}
