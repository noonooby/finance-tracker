import { createPortal } from 'react-dom';
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/server';
import { recordExpense, recordIncome, recordRefund, recordTransfer, recordCardPayment, recordSnapshot, reverseTransaction } from '../utils/money';
import { server } from '../utils/server';
import { formatCurrency, formatDate, generateId } from '../utils/helpers';
import { loadPending, savePending, clearPending } from '../utils/pendingScan';
import { useFinanceData } from '../hooks/useFinanceData';
import { suggestCategoryId } from '../utils/categoryRules';
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
  // A file exported by the bank (CSV): sent as it is and read line by line.
  if (/\.csv$/i.test(file.name || '') || file.type === 'text/csv') return { url: `data:text/csv;base64,${original.slice(original.indexOf(',') + 1)}`, type: 'text/csv', pdf: true, csv: true };
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = original; });
    // Every picture is made smaller before it is read or kept: 1600 pixels on the long side, JPEG. Text stays sharp.
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 400_000 && file.type !== 'image/heic' && file.type !== 'image/heif') return { url: original, type: file.type || 'image/jpeg' };
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { url: c.toDataURL('image/jpeg', 0.82), type: 'image/jpeg' };
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
  const [note, setNote] = useState('');
  const [resumed, setResumed] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState(null);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [fixes, setFixes] = useState([]);
  const [loanDrafts, setLoanDrafts] = useState([]);
  const [invDrafts, setInvDrafts] = useState([]);
  const [scoreDraft, setScoreDraft] = useState(null);
  const [removals, setRemovals] = useState({});
  const [open, setOpen] = useState(null);
  const [done, setDone] = useState(null);
  const [aiReady, setAiReady] = useState(true);
  const { categoryRules } = useFinanceData();
  useEffect(() => { server.auth.config().then((c) => setAiReady(c.ai !== false)); }, []);

  const expenseCategories = categories.filter((c) => !c.is_income);
  const incomeCategories = categories.filter((c) => c.is_income);
  const catsFor = (kind) => (kind === 'purchase' ? expenseCategories : kind === 'income' ? incomeCategories : []);
  const accountOptions = useMemo(() => [
    ...drafts.filter((d) => d.on).map((d) => ({ value: d.id, label: `New: ${d.name}` })),
    ...bankAccounts.map((a) => ({ value: `bank_account:${a.id}`, label: a.name })),
    ...creditCards.filter((c) => !c.is_gift_card).map((c) => ({ value: `credit_card:${c.id}`, label: c.name })),
    ...creditCards.filter((c) => c.is_gift_card).map((c) => ({ value: `credit_card:${c.id}`, label: `${c.name} (gift card)` })),
  ], [drafts, bankAccounts, creditCards]);
  const nameOf = (v) => (accountOptions.find((o) => o.value === v) || {}).label || 'Choose';
  const isCardRef = (v) => v.startsWith('credit_card:') || (v.startsWith('new:') && (drafts.find((d) => d.id === v) || {}).type === 'credit_card');

  const card = 'bg-surface border-line text-fg';
  const muted = 'text-muted';
  const input = `px-2 py-1.5 rounded border text-sm w-full bg-surface border-line text-fg`;

  const [csvAccount, setCsvAccount] = useState('');
  // Several pictures can be chosen at once. The first is shown; the others wait their turn, each with its own note,
  // and each comes up once the one before it is saved or removed.
  const MAX_WAITING = 40, MAX_KEPT = 60_000_000;
  const [showWaiting, setShowWaiting] = useState(false);
  const [big, setBig] = useState(null);
  // While a picture is being read: how long it has been.
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!reading) return undefined;
    setSecs(0);
    const t = setInterval(() => setSecs((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [reading]);
  const [queue, setQueue] = useState([]);
  const queueRef = React.useRef([]);
  const putQueue = (q) => { queueRef.current = q; setQueue(q); };
  const pick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setError(''); setDone(null);
    const got = [], bad = [];
    for (const file of files) {
      try { got.push({ image: { ...(await prepare(file)), name: file.name }, note: '' }); } catch (err) { bad.push(files.length > 1 ? `${file.name}: ${err.message}` : err.message); }
    }
    let current = image;
    if (!current && got.length) {
      const first = got.shift();
      current = first.image;
      setImage(current); setNote(''); setProposal(null); setResumed(false);
    }
    // As many as fit: a count, and a size this device can keep.
    const q = [...queueRef.current];
    let size = q.reduce((n, x) => n + x.image.url.length, 0), left = 0;
    for (const g of got) { if (q.length < MAX_WAITING && size + g.image.url.length <= MAX_KEPT) { q.push(g); size += g.image.url.length; } else left += 1; }
    if (left) bad.push(`${left} ${left === 1 ? 'was' : 'were'} left out: ${MAX_WAITING} can wait at a time, fewer when the files are large. Choose ${left === 1 ? 'it' : 'them'} again once these are saved.`);
    putQueue(q);
    if (q.length) setShowWaiting(true);
    if (current) savePending({ queue: q, image: current, note: current === image ? note : '', proposal: current === image ? proposal : undefined });
    if (bad.length) setError(bad.join(' '));
  };

  // The picture on screen is finished with (saved or removed): the next one waiting comes up.
  const advance = (readIt) => {
    const [next, ...rest] = queueRef.current;
    putQueue(rest); setShowWaiting(false);
    setProposal(null); setDrafts([]); setRows([]); setFixes([]); setLoanDrafts([]); setInvDrafts([]); setScoreDraft(null); setError(''); setResumed(false);
    if (!next) { setImage(null); setNote(''); clearPending(); return; }
    setImage(next.image); setNote(next.note || '');
    savePending({ queue: rest, image: next.image, note: next.note || '' });
    if (readIt && !next.image.csv) read(next.image, next.note || '', true);
  };
  const removePicture = () => advance(false);
  const setWaiting = (i, change) => putQueue(queueRef.current.map((x, j) => (j === i ? { ...x, ...change } : x)));
  const keepWaiting = () => { if (image) savePending({ queue: queueRef.current, image, note, proposal }); };

  // A category for a purchase: how this merchant was categorised before, else the reader's guess matched to your categories.
  const suggestCategory = (merchant, guess, income = false) => {
    const pool = income ? incomeCategories : expenseCategories;
    const learned = suggestCategoryId(categoryRules, merchant, pool);
    if (learned) return learned;
    const k = mkey(merchant);
    const past = k && [...transactions].sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .find((t) => t.category_id && mkey(t.description) === k);
    if (past && pool.some((c) => String(c.id) === String(past.category_id))) return String(past.category_id);
    const g = String(guess || '').toLowerCase();
    const hit = (g && pool.find((c) => c.name.toLowerCase() === g))
      || (g && pool.find((c) => c.name.toLowerCase().includes(g) || g.includes(c.name.toLowerCase())));
    return hit ? String(hit.id) : '';
  };

  const read = async (image0, note0, keepDone) => {
    // Called with nothing for the picture on screen, or with the next picture just after a save.
    const img = image0 && image0.url !== undefined ? image0 : image, nt = typeof note0 === 'string' ? note0 : note;
    return readOne(img, nt, keepDone === true);
  };
  const readOne = async (image, note, keepDone) => {
    setReading(true); setError(''); if (!keepDone) setDone(null); setOpen(null);
    try {
      if (image.csv && !csvAccount) throw new Error('Choose which account the file is from.');
      // Something you typed to the assistant is read again by the assistant.
      const p = image.typed ? (await api('/api/ask', { text: image.text, today: new Date().toLocaleDateString('en-CA') })).proposal || { lines: [], balances: [], new_accounts: [], unknown_accounts: [], notes: 'Nothing to record was found in what you typed.' } : await api('/api/read-screenshot', { image: image.url, mime: image.type, note: note.trim() || undefined, account: image.csv ? csvAccount : undefined, today: new Date().toLocaleDateString('en-CA') });
      applyProposal(p);
      savePending({ queue: queueRef.current, image, note, proposal: p });
    } catch (err) {
      setError(`${err.message} Your picture is kept here, so you can try again without choosing it again.`);
      savePending({ queue: queueRef.current, image, note });
    } finally {
      setReading(false);
    }
  };

  // Receipt items given their own categories become a split purchase: items are grouped by category (an item with no
  // category of its own goes with the purchase's category) and anything the items do not cover (tax, discounts)
  // goes to the largest part, so the parts always add up to what was charged.
  function receiptSplits(r) {
    if (!r.items || !r.items.some((x) => x.category_id && String(x.category_id) !== String(r.category_id))) return {};
    const groups = new Map();
    for (const x of r.items) { const c = String(x.category_id || r.category_id || ''); groups.set(c, (groups.get(c) || 0) + Math.round(x.amount * 100)); }
    const list = [...groups.entries()].map(([c, v]) => ({ c, v })).sort((a, b) => b.v - a.v);
    list[0].v += Math.round(Number(r.amount) * 100) - list.reduce((s, x) => s + x.v, 0);
    if (list.length < 2 || list.some((x) => x.v <= 0)) return {};
    const name = (id) => (categories.find((c) => String(c.id) === id) || {}).name || null;
    return { splits: list.map((x) => ({ category_id: x.c || null, category_name: name(x.c), amount: x.v / 100 })) };
  }

  // Shows a reading (fresh, or kept from before) as editable lines.
  function applyProposal(p) {
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
      }).map((r, _, all) => {
        // A receipt's items go with its purchase line (the one with the receipt's total, or the only purchase).
        const items = (p.receipt && Array.isArray(p.receipt.items) ? p.receipt.items : []).filter((x) => x && x.name && Number(x.amount) > 0);
        if (!items.length || r.kind !== 'purchase') return r;
        const buys = all.filter((x) => x.kind === 'purchase');
        const mine = buys.find((x) => Math.abs(Number(x.amount) - Number(p.receipt.total)) < 0.02) || (buys.length === 1 ? buys[0] : null);
        return mine === r ? { ...r, items: items.map((x) => ({ name: String(x.name).slice(0, 60), amount: Math.round(Number(x.amount) * 100) / 100, category_id: '' })) } : r;
      }));
      setFixes(p.balances.map((b) => ({ ...b, on: true })));
      setInvDrafts((p.new_investments || []).map((x) => ({ ...x, on: true, balance: x.balance == null ? '' : String(x.balance) })));
      setScoreDraft(p.credit_score ? { on: true, bureau: p.credit_score.bureau || '', score: String(p.credit_score.score), date: p.credit_score.date || new Date().toLocaleDateString('en-CA') } : null);
      setLoanDrafts((p.new_loans || []).map((l) => ({ ...l, on: true, balance: l.balance == null ? '' : String(l.balance), payment_amount: l.payment_amount == null ? '' : String(l.payment_amount),
        next_payment_date: l.next_payment_date || '', interest_rate: l.interest_rate == null ? '' : String(l.interest_rate) })));
      setRemovals({});
  }

  // The note is kept with the picture as it is typed.
  const loadedRef = React.useRef(false);
  useEffect(() => {
    if (!loadedRef.current || !image) return;
    const t = setTimeout(() => savePending({ queue: queueRef.current, image, note, proposal }), 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  // Pick up a scan kept from before (after an error, a reload, or leaving the page).
  useEffect(() => {
    let live = true;
    loadPending().then((v) => {
      loadedRef.current = true;
      if (!live || !v) return;
      setImage(v.image); setNote(v.note || ''); setResumed(true); putQueue(Array.isArray(v.queue) ? v.queue : []);
      if (v.proposal) applyProposal(v.proposal);
    });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            minimum_payment: d.minimum_payment || null, statement_balance: d.statement_balance ?? null, autopay_mode: d.autopay ? 'statement' : null,
            is_gift_card: false, created_at: new Date().toISOString() }
          : { id, name: d.name.trim(), balance: opening, last4: d.last4 || null, account_type: d.account_type || 'checking', institution: '', created_at: new Date().toISOString() };
        const { error: e } = await server.from(table).insert(row);
        if (e) throw new Error(e.message);
        (d.type === 'credit_card' ? cards : banks).push(row);
        realRef[d.id] = `${d.type}:${id}`;
        result.created.push(d.name);
      } catch (err) { result.failed.push(`${d.name}: ${err.message}`); }
    }
    // 1b. Loans, leases and pay-later plans found on the picture.
    for (const l of loanDrafts.filter((x) => x.on)) {
      try {
        const why = loanNeeds(l);
        if (why) throw new Error(why);
        const owed = Math.round(Number(l.balance) * 100) / 100;
        const { error: e } = await server.from('loans').insert({ id: generateId(), name: l.name.trim(), principal: owed, balance: owed, interest_rate: Number(l.interest_rate) || 0,
          loan_type: l.loan_type || 'loan', payment_amount: Math.round(Number(l.payment_amount) * 100) / 100, frequency: l.frequency || 'monthly', next_payment_date: l.next_payment_date,
          fee_percent: 0, setup_fee: 0, alert_days: 3, recurring_duration_type: 'indefinite', recurring_occurrences_completed: 0, from_screenshot: proposal.source_id, created_at: new Date().toISOString() });
        if (e) throw new Error(e.message);
        result.created.push(l.name);
      } catch (err) { result.failed.push(`${l.name}: ${err.message}`); }
    }
    // 1c. Investments and a credit score found on the picture.
    for (const x of invDrafts.filter((v) => v.on)) {
      try {
        if (!x.name.trim() || !Number.isFinite(Number(x.balance)) || x.balance === '') throw new Error('Enter its name and value');
        const { error: e } = await server.from('investments').insert({ id: generateId(), name: x.name.trim(), kind: x.kind || 'Other', balance: Math.round(Number(x.balance) * 100) / 100, created_at: new Date().toISOString() });
        if (e) throw new Error(e.message);
        result.created.push(x.name);
      } catch (err) { result.failed.push(`${x.name}: ${err.message}`); }
    }
    if (scoreDraft && scoreDraft.on) {
      try {
        const { error: e } = await server.from('credit_scores').insert({ bureau: scoreDraft.bureau.trim().slice(0, 40), score: Number(scoreDraft.score), date: scoreDraft.date, note: null, created_at: new Date().toISOString() });
        if (e) throw new Error(e.message);
        result.created.push(`credit score ${scoreDraft.score}`);
      } catch (err) { result.failed.push(`Credit score: ${err.message}`); }
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
        const common = { amount: Number(r.amount), date: r.date, description: r.merchant, key, extra: { pending: r.pending, from_screenshot: proposal.source_id, in_snapshot: true,
          ...(r.original_currency ? { original_amount: r.original_amount, original_currency: r.original_currency, fx_rate: r.fx_rate || null } : {}),
          ...(r.items ? { items: r.items.map(({ name, amount }) => ({ name, amount })) } : {}),
          ...(r.kind === 'purchase' ? receiptSplits(r) : {}) } };
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
    if (!result.failed.length) advance(true);
  };

  // In plain words, what the reading made of the picture: what it is, whose it is, and what will happen to each part.
  const understood = (p, rs, ds, fx) => {
    const out = [];
    const what = { statement: 'A statement', receipt: 'A receipt', transactions: 'A list of transactions', balance: 'A balance', credit_score: 'A credit score', other: 'Not clearly a statement, a receipt or a list of transactions' }[p.kind] || 'A picture';
    out.push(`It is: ${what.charAt(0).toLowerCase()}${what.slice(1)}.`);
    const names = [...new Set([...(p.statement && p.statement.account ? [p.statement.account.name] : []), ...rs.map((r) => r.account && r.account.name).filter(Boolean)])];
    const isCard = (n) => creditCards.some((c) => c.name === n) || ds.some((d) => d.name === n && d.type === 'credit_card');
    if (names.length) out.push(`${names.length === 1 ? 'Account' : 'Accounts'}: ${names.map((n) => `${n} (${isCard(n) ? 'card' : 'bank account'}${ds.some((d) => d.name === n) ? ', new' : ''})`).join(', ')}${p.note_account ? `. Your note pointed to ${p.note_account}` : ''}.`);
    else out.push(rs.length ? 'Account: not clear from the picture. Choose it on each line, or add a note with the bank or card name and read again.' : loanDrafts.length || invDrafts.length || scoreDraft || fx.length ? 'No bank account or card is shown.' : 'No account was recognised.');
    const n = (a) => rs.filter((r) => r.action === a).length;
    const parts = [[n('record'), 'new, to be recorded'], [n('mark_posted'), 'already here as pending, to be marked posted'], [n('already'), 'look already recorded, left alone'], [n('choose_account'), 'need you to choose the account'], [n('skip'), 'could not be read']]
      .filter(([c]) => c > 0).map(([c, t]) => `${c} ${t}`);
    out.push(rs.length ? `Lines found: ${rs.length}${parts.length ? `. ${parts.join('; ')}` : ''}.` : 'Lines found: none.');
    if (fx.length) out.push(`${fx.length === 1 ? 'A balance was' : `${fx.length} balances were`} read and will be checked against the app.`);
    if (scoreDraft) out.push(`A credit score was read: ${scoreDraft.score}${scoreDraft.bureau ? ` from ${scoreDraft.bureau}` : ''}.`);
    if (invDrafts.length) out.push(`${invDrafts.length === 1 ? 'An investment was' : `${invDrafts.length} investments were`} found that the app does not have: ${invDrafts.map((x) => x.name).join(', ')}.`);
    if (loanDrafts.length) out.push(`${loanDrafts.length === 1 ? 'A loan was' : `${loanDrafts.length} loans were`} found that the app does not have: ${loanDrafts.map((l) => l.name).join(', ')}. Fill in what the picture does not show, below.`);
    if (ds.length) out.push(`${ds.length === 1 ? 'One account is' : `${ds.length} accounts are`} not in the app yet and will be added if you leave ${ds.length === 1 ? 'it' : 'them'} ticked.`);
    return out;
  };
  const setLoan = (id, patch) => setLoanDrafts((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const loanNeeds = (l) => (!l.on ? null : !l.name.trim() ? 'Enter a name' : !(Number(l.balance) > 0) ? 'Enter what is still owed' : !(Number(l.payment_amount) > 0) ? 'Not on the picture: enter the amount of each payment'
    : !/^\d{4}-\d{2}-\d{2}$/.test(l.next_payment_date || '') ? 'Not on the picture: enter the next payment day' : null);
  const invNeeds = (x) => (!x.on ? null : !x.name.trim() ? 'Enter a name' : x.balance === '' || !Number.isFinite(Number(x.balance)) ? 'Not on the picture: enter its value today' : null);
  const scoreNeeds = (x) => (!x || !x.on ? null : !x.bureau.trim() ? 'Not on the picture: say which bureau it is from' : !(Number.isInteger(Number(x.score)) && Number(x.score) >= 300 && Number(x.score) <= 900) ? 'A score is a whole number from 300 to 900' : !/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? 'Choose the day' : null);
  const chosen = rows.filter((r) => r.on).length + fixes.length + drafts.filter((d) => d.on).length + loanDrafts.filter((l) => l.on).length + invDrafts.filter((x) => x.on).length + (scoreDraft && scoreDraft.on ? 1 : 0);
  const draftNeeds = (d) => (!d.on ? null : !d.name.trim() ? 'Enter a name' : d.balance === '' || !Number.isFinite(Number(d.balance)) ? `Not on the screenshot: enter ${d.type === 'credit_card' ? 'what you owe on it' : 'its balance'} today` : null);
  const blocked = rows.filter((r) => r.on && missing(r)).length + drafts.filter(draftNeeds).length + loanDrafts.filter(loanNeeds).length + invDrafts.filter(invNeeds).length + (scoreNeeds(scoreDraft) ? 1 : 0);
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
          Take a photo of a receipt, or choose screenshots of your bank or card app (several at once if you like), a statement PDF, or a file exported by your bank (CSV). The app fills in everything it can: new accounts, the account for each line,
          the kind of line and a category. Check it, change anything with Edit, then tap Save. Nothing is saved before that.
        </p>
      </div>

      <div className={`border rounded-lg p-4 space-y-3 ${card}`}>
        {!aiReady && (
          <p role="status" className="text-sm rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 px-3 py-2">
            Reading photos needs a Gemini key. The owner of the app adds it once in Settings. Until then you can add transactions from Home.
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
            <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf,text/csv,.csv" multiple onChange={pick} className="sr-only" />
          </label>
        </div>
        {image && resumed && !image.typed && <p className="text-sm text-muted">Picked up where you left off. This picture was kept on this device.</p>}
        {image && (
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <div className="space-y-2">
              {image.pdf ? <div className="text-sm font-medium">{image.name}</div> : <button type="button" className="press block" aria-label="Look at it closely" onClick={() => setBig(image.url)}><img src={image.url} alt="The screenshot to read" className="max-h-64 rounded-xl border border-line" /></button>}
              {!image.pdf && !image.typed && <p className="text-xs text-muted">Tap it to see it large.</p>}
              <button type="button" onClick={removePicture} className="press text-sm text-muted underline">{image.typed ? 'Discard' : image.pdf ? 'Remove file' : 'Remove picture'}</button>
            </div>
            <div className="w-full space-y-2">
              {image.csv && (
                <label className="block text-sm">
                  <span className="text-muted">Which account is this file from</span>
                  <select value={csvAccount} onChange={(e) => setCsvAccount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-fg focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none">
                    <option value="">Choose an account</option>
                    {bankAccounts.map((a) => <option key={a.id} value={`bank_account:${a.id}`}>{a.name}</option>)}
                    {creditCards.filter((c) => !c.is_gift_card).map((c) => <option key={c.id} value={`credit_card:${c.id}`}>{c.name}</option>)}
                  </select>
                </label>
              )}
              {!image.csv && !image.typed && <label className="block text-sm">
                <span className="text-muted">Note about this picture (optional)</span>
                <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="For example: this is my Visa ending 1234, or only the grocery lines"
                  className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-fg placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none" />
              </label>}
            </div>
          </div>
        )}
        {queue.length > 0 && (
          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">Waiting their turn: {queue.length}</p>
              <button type="button" className="press text-sm font-medium text-accent" aria-expanded={showWaiting} onClick={() => setShowWaiting(!showWaiting)}>{showWaiting ? 'Hide' : 'Show, add notes'}</button>
            </div>
            {!proposal && !reading && <p role="status" className="text-sm rounded-lg bg-accent-soft text-accent px-3 py-2">Nothing is read yet. Add notes if you want, then tap Start reading at the bottom. After you save one, the next is read by itself.</p>}
            {showWaiting && <p className="text-sm text-muted">A note can be short: the name of the bank or card is enough.</p>}
            {showWaiting && queue.map((q, i) => (
              <div key={i} className="flex items-start gap-3">
                {q.image.pdf || q.image.csv ? <div className="w-20 shrink-0 text-xs text-muted break-all">{q.image.name}</div>
                  : <button type="button" className="press shrink-0" aria-label={`Look at waiting number ${i + 1} closely`} onClick={() => setBig(q.image.url)}><img src={q.image.url} alt="" className="w-20 h-20 object-cover rounded-lg border border-line" /></button>}
                <div className="flex-1 min-w-0 space-y-1">
                  {!q.image.csv && <input type="text" maxLength={300} value={q.note || ''} aria-label={`Note about waiting picture ${i + 1}`} placeholder="Note (optional)"
                    onChange={(e) => setWaiting(i, { note: e.target.value })} onBlur={keepWaiting}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fg placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none" />}
                  <button type="button" className="press text-sm text-muted underline" onClick={() => { putQueue(queueRef.current.filter((_, j) => j !== i)); keepWaiting(); }}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {reading && (
          <div role="status" className="rounded-xl border border-line bg-surface-2 px-3 py-3 space-y-1">
            <p className="font-medium">Reading{image && image.name ? ` ${image.name}` : ''} ({secs}s)</p>
            <p className="text-sm text-muted">{secs < 4 ? 'Sending it.' : secs < 25 ? 'Working out what it shows: which account or card, each line, and any balance. Then each line is matched to your accounts and to what is already recorded.'
              : 'Still reading. When the reading service is busy it is tried again by itself, which can take up to a minute or two.'}</p>
          </div>
        )}
        {error && <p role="alert" className="text-base text-negative">{error}</p>}
      </div>

      {proposal && (
        <div className={`border rounded-lg p-4 space-y-4 ${card}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Check before saving</h2>
            {queue.length > 0 && <span className="text-sm text-muted shrink-0">{queue.length} more waiting</span>}
          </div>
          {chosen === 0 && <p role="status" className="text-sm rounded-lg bg-accent-soft text-accent px-3 py-2">There is nothing to save from this one. {queue.length > 0 ? 'Tap Skip to the next at the bottom, or add a note and read it again.' : 'Tap Close at the bottom, or add a note and read it again.'}</p>}
          {!image.pdf && !image.typed && <button type="button" className="press text-sm font-medium text-accent" onClick={() => setBig(image.url)}>See the picture large</button>}
          <section className="rounded-xl border border-line bg-surface-2 px-3 py-3 space-y-1 text-sm">
            <h3 className="font-semibold text-base">What was understood</h3>
            {understood(proposal, rows, drafts, fixes).map((t) => <p key={t}>{t}</p>)}
          </section>
          {proposal.notes && <p className={`text-sm ${muted}`}>{proposal.notes}</p>}
          {proposal.statement && (
            <section className="space-y-1 text-sm">
              <h3 className="font-semibold">Statement</h3>
              <div>{proposal.statement.account ? proposal.statement.account.name : 'Account not found'}{proposal.statement.period_start ? `, ${proposal.statement.period_start} to ${proposal.statement.period_end}` : `, to ${proposal.statement.period_end}`}
                {proposal.statement.closing_balance != null && `, closing balance ${formatCurrency(proposal.statement.closing_balance)}`}</div>
              {proposal.statement.check && (proposal.statement.check.adds_up
                ? <p className="text-xs text-positive">The opening balance and the {proposal.statement.check.lines} lines read give the closing balance exactly: nothing was missed.</p>
                : <p role="alert" className="text-sm text-negative">The lines read do not add up to the closing balance: they are {formatCurrency(Math.abs(proposal.statement.check.off))} {proposal.statement.check.off > 0 ? 'short' : 'over'}. A line was missed or misread. Read it again, or check the lines against the statement before saving.</p>)}
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
                      {d.type === 'credit_card' && (d.statement_balance != null || d.autopay != null) && (
                        <p className={`col-span-full text-xs ${muted}`}>
                          {d.statement_balance != null && `Statement balance ${formatCurrency(d.statement_balance)}. `}
                          {d.autopay === true && 'Autopay is on: after saving, choose the account it pays from under Cards.'}
                          {d.autopay === false && 'Autopay is off.'}
                        </p>
                      )}
                    </div>
                  )}
                  {draftNeeds(d) && <div className="text-xs text-amber-600">{draftNeeds(d)}</div>}
                </div>
              ))}
              <p className={`text-xs ${muted}`}>The lines below are recorded on the new account and its balance ends at the figure above.</p>
            </section>
          )}
          {scoreDraft && (
            <section className="space-y-2">
              <h3 className="text-base font-semibold">Credit score</h3>
              <div className="rounded-lg border p-3 space-y-2 border-line">
                <label className="flex items-center gap-3 text-base font-medium">
                  <input type="checkbox" className="w-5 h-5" checked={scoreDraft.on} onChange={(e) => setScoreDraft({ ...scoreDraft, on: e.target.checked })} />
                  Save this score
                </label>
                {scoreDraft.on && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm"><span className={muted}>Score</span>
                      <input className={input} type="number" step="1" min="300" max="900" inputMode="numeric" value={scoreDraft.score} onChange={(e) => setScoreDraft({ ...scoreDraft, score: e.target.value })} /></label>
                    <label className="block text-sm"><span className={muted}>Bureau</span>
                      <input className={input} list="scan-bureaus" maxLength={40} placeholder="Equifax, TransUnion" value={scoreDraft.bureau} onChange={(e) => setScoreDraft({ ...scoreDraft, bureau: e.target.value })} />
                      <datalist id="scan-bureaus"><option value="Equifax" /><option value="TransUnion" /><option value="Experian" /></datalist></label>
                    <label className="block text-sm col-span-2"><span className={muted}>Day</span>
                      <input className={input} type="date" value={scoreDraft.date} onChange={(e) => setScoreDraft({ ...scoreDraft, date: e.target.value })} /></label>
                  </div>
                )}
                {scoreNeeds(scoreDraft) && <div className="text-sm text-amber-600">{scoreNeeds(scoreDraft)}</div>}
              </div>
            </section>
          )}
          {invDrafts.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-base font-semibold">Investments to add</h3>
              {invDrafts.map((x) => {
                const setInv = (patch) => setInvDrafts((xs) => xs.map((y) => (y.id === x.id ? { ...y, ...patch } : y)));
                return (
                  <div key={x.id} className="rounded-lg border p-3 space-y-2 border-line">
                    <label className="flex items-center gap-3 text-base font-medium">
                      <input type="checkbox" className="w-5 h-5" checked={x.on} onChange={(e) => setInv({ on: e.target.checked })} />
                      Add {x.name}
                    </label>
                    {x.on && (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-sm"><span className={muted}>Name</span>
                          <input className={input} value={x.name} maxLength={60} onChange={(e) => setInv({ name: e.target.value })} /></label>
                        <label className="block text-sm"><span className={muted}>Kind</span>
                          <select className={input} value={x.kind} onChange={(e) => setInv({ kind: e.target.value })}>
                            {['TFSA', 'RRSP', 'FHSA', 'RESP', 'Brokerage', 'Pension', 'Crypto', 'Other'].map((k) => <option key={k}>{k}</option>)}
                          </select></label>
                        <label className="block text-sm col-span-2"><span className={muted}>Value today</span>
                          <input className={input} type="number" step="0.01" inputMode="decimal" value={x.balance} placeholder="Not shown" onChange={(e) => setInv({ balance: e.target.value })} /></label>
                      </div>
                    )}
                    {invNeeds(x) && <div className="text-sm text-amber-600">{invNeeds(x)}</div>}
                  </div>
                );
              })}
            </section>
          )}
          {loanDrafts.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-base font-semibold">Loans to add</h3>
              {loanDrafts.map((l) => (
                <div key={l.id} className="rounded-lg border p-3 space-y-2 border-line">
                  <label className="flex items-center gap-3 text-base font-medium">
                    <input type="checkbox" className="w-5 h-5" checked={l.on} onChange={(e) => setLoan(l.id, { on: e.target.checked })} />
                    Add {l.name}
                  </label>
                  {l.on && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-sm"><span className={muted}>Name</span>
                        <input className={input} value={l.name} maxLength={60} onChange={(e) => setLoan(l.id, { name: e.target.value })} /></label>
                      <label className="block text-sm"><span className={muted}>Kind</span>
                        <select className={input} value={l.loan_type} onChange={(e) => setLoan(l.id, { loan_type: e.target.value })}>
                          <option value="loan">Loan</option><option value="mortgage">Mortgage</option><option value="line_of_credit">Line of credit</option><option value="car_lease">Car lease or car loan</option>
                          <option value="bnpl">Pay later</option><option value="plan">Equal payment plan</option><option value="student">Student loan</option>
                        </select></label>
                      <label className="block text-sm"><span className={muted}>Still owed</span>
                        <input className={input} type="number" step="0.01" min="0" inputMode="decimal" value={l.balance} onChange={(e) => setLoan(l.id, { balance: e.target.value })} /></label>
                      <label className="block text-sm"><span className={muted}>Each payment</span>
                        <input className={input} type="number" step="0.01" min="0" inputMode="decimal" value={l.payment_amount} placeholder="Not shown" onChange={(e) => setLoan(l.id, { payment_amount: e.target.value })} /></label>
                      <label className="block text-sm"><span className={muted}>How often</span>
                        <select className={input} value={l.frequency} onChange={(e) => setLoan(l.id, { frequency: e.target.value })}>
                          <option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="semimonthly">Twice a month</option><option value="monthly">Monthly</option>
                        </select></label>
                      <label className="block text-sm"><span className={muted}>Next payment day</span>
                        <input className={input} type="date" value={l.next_payment_date} onChange={(e) => setLoan(l.id, { next_payment_date: e.target.value })} /></label>
                      <label className="block text-sm"><span className={muted}>Interest % a year</span>
                        <input className={input} type="number" step="0.01" min="0" max="100" inputMode="decimal" value={l.interest_rate} placeholder="0 if none" onChange={(e) => setLoan(l.id, { interest_rate: e.target.value })} /></label>
                    </div>
                  )}
                  {loanNeeds(l) && <div className="text-sm text-amber-600">{loanNeeds(l)}</div>}
                </div>
              ))}
              <p className={`text-sm ${muted}`}>Untick one to leave it out. More details (who it is paid through, autopay) can be set later under More, Loans.</p>
            </section>
          )}
          {proposal.unknown_accounts.length > 0 && (
            <p className="text-sm text-amber-600">Also on the screenshot but not added: {proposal.unknown_accounts.map((a) => a.name).join(', ')}.</p>
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
                  <li key={r.i} className="py-3 space-y-2">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" className="mt-1 w-5 h-5 shrink-0" checked={r.on} disabled={r.action === 'skip'} aria-label={`Save ${r.merchant}`}
                        onChange={(e) => setRow(r.i, { on: e.target.checked })} />
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-medium break-words">{r.merchant}</div>
                        <div className={`text-sm ${muted}`}>
                          {formatDate(r.date) || r.date}{r.pending ? ', pending' : ''} · {KIND_TEXT[r.kind] || r.kind} · {lineSummary(r)}{cat ? ` · ${cat.name}` : ''}
                        </div>
                        {r.action !== 'record' && r.action !== 'choose_account' && <div className={`text-xs ${muted}`}>{r.why || STATUS_TEXT[r.action]}</div>}
                        {need && <div className="text-sm text-amber-600">{need}</div>}
                        {historyOnly(r) && <div className={`text-xs ${muted}`}>Before your snapshot of {historyOnly(r)}: kept as history, today's balance does not change</div>}
                        {r.fx_note && <div className={`text-xs ${r.fx_failed ? 'text-warning' : muted}`}>{r.fx_note}</div>}
                        {r.items && <div className={`text-xs ${muted}`}>{r.items.length} items from the receipt{receiptSplits(r).splits ? `, split into ${receiptSplits(r).splits.length} categories` : ''}. Open Edit to give items their own category.</div>}
                      </div>
                      <div className="text-right">
                        <div className={r.kind === 'purchase' ? 'text-base font-semibold tabular-nums' : 'text-base font-semibold tabular-nums text-green-600'}>{formatCurrency(r.amount)}</div>
                        {editable && <button type="button" className="press text-sm font-medium py-1 text-blue-600 dark:text-blue-400" onClick={() => setOpen(open === r.i ? null : r.i)} aria-expanded={open === r.i}>{open === r.i ? 'Done' : 'Edit'}</button>}
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
                        {r.items && (
                          <div className="col-span-2 space-y-1">
                            <div className={`text-xs ${muted}`}>Items on the receipt. Give an item a category to split this purchase; tax and other differences go to the largest part.</div>
                            {r.items.map((x, k) => (
                              <div key={k} className="flex items-center gap-2 text-xs">
                                <span className="flex-1 min-w-0 truncate">{x.name}</span>
                                <span className="tabular-nums">{formatCurrency(x.amount)}</span>
                                <select aria-label={`Category for ${x.name}`} className={`${input} w-32`} value={x.category_id}
                                  onChange={(e) => setRow(r.i, { items: r.items.map((y, j) => (j === k ? { ...y, category_id: e.target.value } : y)) })}>
                                  <option value="">Same as purchase</option>
                                  {catsFor('purchase').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
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
        </div>
      )}

      {big && createPortal(
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" role="dialog" aria-modal="true" aria-label="The picture, large">
          <div className="flex justify-end p-3"><button type="button" className="press rounded-xl bg-white text-black px-4 py-2 font-medium" onClick={() => setBig(null)}>Close</button></div>
          <div className="flex-1 overflow-auto px-2 pb-6" style={{ touchAction: 'pinch-zoom pan-x pan-y' }}><img src={big} alt="The picture, large" className="w-full max-w-3xl mx-auto" /></div>
        </div>
      , document.body)}
      {image && createPortal(
        <div className="fixed inset-x-0 z-20 border-t border-line bg-background/95 backdrop-blur-md" style={{ bottom: 'calc(58px + env(safe-area-inset-bottom))' }}>
          <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2">
          <button type="button" onClick={read} disabled={reading || saving}
            className={`press px-4 py-3 rounded-xl font-medium disabled:opacity-50 ${proposal ? 'border border-line bg-surface text-fg' : 'flex-1 bg-accent text-accent-contrast hover:opacity-90'}`}>
            {reading ? 'Reading...' : proposal ? 'Read again' : image.typed ? 'Read again' : queue.length > 0 ? `Start reading (${queue.length + 1} chosen)` : image.csv ? 'Read file' : image.pdf ? 'Read statement' : 'Read screenshot'}
          </button>
          {proposal && chosen === 0 && (
            <button type="button" onClick={() => { setDone(null); advance(true); }} disabled={saving || reading}
              className="press flex-1 px-4 py-3 rounded-xl bg-accent text-accent-contrast font-medium hover:opacity-90 disabled:opacity-50">
              {queue.length > 0 ? `Skip to the next (${queue.length} waiting)` : 'Close'}
            </button>
          )}
          {proposal && chosen > 0 && queue.length > 0 && (
            <button type="button" onClick={() => { setDone(null); advance(true); }} disabled={saving || reading} className="press px-3 py-3 rounded-xl border border-line bg-surface text-fg font-medium disabled:opacity-50">Skip</button>
          )}
          {proposal && chosen > 0 && (
            <button type="button" onClick={save} disabled={saving || reading || !chosen || blocked > 0}
              className="press flex-1 px-4 py-3 rounded-xl bg-accent text-accent-contrast font-medium hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving...' : blocked ? `Answer ${blocked} ${blocked === 1 ? 'question' : 'questions'} first` : `Save ${chosen} ${chosen === 1 ? 'item' : 'items'}`}
            </button>
          )}
          </div>
        </div>
      , document.body)}

      {image && <div className="h-20" aria-hidden="true" />}
      {done && (
        <div role="status" className={`border rounded-lg p-4 text-sm ${card}`}>
          {done.created.length > 0 && <div>Accounts added: {done.created.join(', ')}.</div>}
          {done.recorded > 0 || !done.created.length ? `Saved ${done.recorded} ${done.recorded === 1 ? 'line' : 'lines'}.` : ''}{done.posted > 0 && ` Pending lines marked as posted: ${done.posted}.`}
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
