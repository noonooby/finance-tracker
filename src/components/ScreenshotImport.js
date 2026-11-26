import { createPortal } from 'react-dom';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/server';
import { recordExpense, recordIncome, recordRefund, recordTransfer, recordCardPayment, recordSnapshot, reverseTransaction } from '../utils/money';
import { server } from '../utils/server';
import { formatCurrency, formatDate, generateId } from '../utils/helpers';
import { loadPending, savePending, clearPending } from '../utils/pendingScan';
import { useFinanceData } from '../hooks/useFinanceData';
import { suggestCategoryId } from '../utils/categoryRules';
import { TAX_FIELDS } from '../utils/room';
import { Camera, Image as ImageIcon } from 'lucide-react';

// The part of a picture a question is about: a strip around the line, with the line marked when its place is known.
// Tapping it opens the whole picture.
function Snip({ url, y, mark, onOpen }) {
  if (!url) return null;
  const at = y != null && Number.isFinite(Number(y)) ? Math.min(100, Math.max(0, Number(y))) : null;
  return (
    <button type="button" onClick={onOpen} aria-label="Look at the whole picture" className="press relative block w-full h-36 overflow-hidden rounded-xl border border-line bg-surface-2">
      <img src={url} alt="" className="w-full h-full object-cover" style={{ objectPosition: `50% ${at == null ? 0 : at}%` }} />
      {at != null && mark && <span aria-hidden="true" className="absolute inset-x-0 h-10 border-y-2 border-amber-500 bg-amber-400/20" style={{ top: `calc(${at}% - 20px)` }} />}
    </button>
  );
}
// Answers to tap, one each.
function Chips({ options, onPick, disabled }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => <button key={o.value} type="button" disabled={disabled} onClick={() => onPick(o.value)} className="press px-3 py-2 rounded-full border border-line bg-surface text-sm font-medium disabled:opacity-50">{o.label}</button>)}
    </div>
  );
}

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
  const [changes, setChanges] = useState([]);
  const [billDrafts, setBillDrafts] = useState([]);
  const navigate = useNavigate();
  const [scoreDraft, setScoreDraft] = useState(null);
  // What accounts hold (so their value follows the market) and contribution room stated by the tax agency.
  const [heldDrafts, setHeldDrafts] = useState([]);
  const [roomDrafts, setRoomDrafts] = useState([]);
  const [taxDraft, setTaxDraft] = useState(null);
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
  const nameOf = (v) => (v === 'outside' ? 'An account not in the app' : (accountOptions.find((o) => o.value === v) || {}).label || 'Choose');
  const isCardRef = (v) => v.startsWith('credit_card:') || (v.startsWith('new:') && (drafts.find((d) => d.id === v) || {}).type === 'credit_card');

  const card = 'bg-surface border-line text-fg';
  const muted = 'text-muted';
  const input = `px-2 py-1.5 rounded border text-sm w-full bg-surface border-line text-fg`;

  const [csvAccount, setCsvAccount] = useState('');
  // Several pictures can be chosen at once. The first is shown; the others wait their turn, each with its own note,
  // and each comes up once the one before it is saved or removed.
  const MAX_WAITING = 40, MAX_KEPT = 60_000_000;
  const [noteOpen, setNoteOpen] = useState(false);
  // The fields of something found are folded away until Edit is tapped.
  const [edit, setEdit] = useState({});
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
    if (current) savePending({ queue: q, image: current, note: current === image ? note : '', proposal: current === image ? proposal : undefined });
    if (bad.length) setError(bad.join(' '));
    // Reading starts by itself. A bank file waits, because it needs to be told which account it is from.
    if (current && !current.csv && !current.typed && !proposal && !reading) readTogether(current, current === image ? note : '', q);
  };

  // The picture on screen is finished with (saved or removed): the next one waiting comes up.
  const advance = (readIt) => {
    const [next, ...rest] = queueRef.current;
    putQueue(rest); setNoteOpen(false);
    setProposal(null); setDrafts([]); setRows([]); setFixes([]); setLoanDrafts([]); setInvDrafts([]); setHeldDrafts([]); setRoomDrafts([]); setTaxDraft(null); setScoreDraft(null); setChanges([]); setBillDrafts([]); setError(''); setResumed(false);
    if (!next) { setImage(null); setNote(''); clearPending(); return; }
    setImage(next.image); setNote(next.note || '');
    savePending({ queue: rest, image: next.image, note: next.note || '' });
    if (readIt && !next.image.csv) readTogether(next.image, next.note || '', rest, true);
  };
  const removePicture = () => advance(false);
  // Pictures chosen together are read together: each is read, then the ones that belong together (screens of the same
  // accounts) are shown as one thing to check and save once. A statement, a receipt, a bill and the like keep their own turn.
  const [readCount, setReadCount] = useState(null);
  // Lines whose account could not be told are kept on the server. A later picture that shows the account files them;
  // until then they wait here and can be filed by hand.
  const [held, setHeld] = useState([]);
  const [kept, setKept] = useState(0);
  const loadHeld = async () => {
    try { const { data } = await server.from('held_lines').select('*'); setHeld((data || []).sort((a, b) => String(b.date).localeCompare(String(a.date)))); } catch { /* shown next time */ }
    try { setKept((await api('/api/scans', {})).count || 0); } catch { /* only a count */ }
  };
  useEffect(() => { loadHeld(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const [filing, setFiling] = useState(false);
  // Kept pictures, fetched to show next to a line that is waiting: { source_id: url }.
  const [keptPics, setKeptPics] = useState({});
  useEffect(() => {
    if (image) return;
    const want = [...new Set(held.map((h) => h.source_id).filter((id) => id && !(id in keptPics)))].slice(0, 12);
    if (!want.length) return;
    let live = true;
    Promise.all(want.map(async (id) => { try { const r = await api('/api/scan-picture', { id }); return [id, `data:${r.mime};base64,${r.picture}`]; } catch { return [id, null]; } }))
      .then((got) => { if (live) setKeptPics((m) => ({ ...m, ...Object.fromEntries(got) })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, image]);
  // While something is being read, saved or filed the app does not load a newer version of itself.
  useEffect(() => { window.financeBusy = reading || saving || filing; return () => { window.financeBusy = false; }; }, [reading, saving, filing]);
  const fileHeld = async (list, to) => {
    if (!to || filing) return;
    setFiling(true); setError('');
    const accounts = { bankAccounts, creditCards, loans };
    const onCard = to.startsWith('credit_card:');
    for (const h of list) {
      try {
        const common = { amount: Number(h.amount), date: h.date, description: h.merchant, key: h.key || `held:${h.id}`, extra: { pending: !!h.pending, from_screenshot: h.source_id || 'held', in_snapshot: true } };
        const cat = (income) => { const id = suggestCategory(h.merchant, h.category_guess, income); const c = categories.find((x) => String(x.id) === String(id)); return c ? { category_id: c.id, category_name: c.name } : { category_id: null, category_name: null }; };
        if (h.kind === 'card_payment' && onCard) await recordCardPayment({ ...common, cardId: to.split(':')[1], source: 'outside' }, accounts);
        else if (h.kind === 'card_payment' || h.kind === 'transfer') await recordTransfer({ ...common, from: h.direction === 'in' ? 'outside' : to, to: h.direction === 'in' ? to : 'outside' }, accounts);
        else if (h.kind === 'refund' || (h.direction === 'in' && onCard)) await recordRefund({ ...common, target: to }, accounts);
        else if (h.direction === 'in') await recordIncome({ ...common, target: to, source_name: h.merchant, extra: { ...common.extra, ...cat(true) } }, accounts);
        else await recordExpense({ ...common, source: to, ...cat(false) }, accounts);
        await server.from('held_lines').delete().eq('id', h.id);
      } catch (err) { setError(`${h.merchant}: ${err.message}`); break; }
    }
    setFiling(false);
    await loadHeld();
    if (onUpdate) await onUpdate();
  };
  const dropHeld = async (h) => { await server.from('held_lines').delete().eq('id', h.id); loadHeld(); };
  const today = () => new Date().toLocaleDateString('en-CA');
  const readTogether = async (image0, note0, queue0, keepDone, fresh) => {
    const img = image0 || image, nt = typeof note0 === 'string' ? note0 : note, waiting = queue0 || queueRef.current;
    const { set: joined = [], ...first } = img;
    const pics = [{ image: first, note: nt }, ...joined, ...waiting.filter((q) => !q.image.csv && !q.image.pdf)];
    if (first.csv || first.pdf || first.typed || pics.length < 2) return readOne(img, nt, keepDone, fresh);
    setReading(true); setError(''); if (!keepDone) setDone(null); setOpen(null); setReadCount({ done: 0, of: pics.length });
    try {
      const got = new Array(pics.length);
      let at = 0;
      await Promise.all([0, 1, 2].map(async () => {
        while (at < pics.length) {
          const k = at++;
          try { got[k] = await api('/api/read-screenshot', { image: pics[k].image.url, mime: pics[k].image.type, note: (pics[k].note || '').trim() || undefined, fresh: fresh || undefined, today: today() }); } catch (err) { got[k] = { error: err.message }; }
          setReadCount((c) => (c ? { ...c, done: c.done + 1 } : c));
        }
      }));
      if (got[0].error) throw new Error(got[0].error);
      // Each picture remembers what it was read as, so a question about a line can show the picture it is on.
      pics.forEach((x, k) => { if (got[k] && got[k].source_id) x.image.sid = got[k].source_id; });
      const ok = pics.map((p, k) => ({ p, g: got[k] })).filter((x) => !x.g.error && !x.g.alone);
      let set = null;
      if (!got[0].alone && ok.length > 1) {
        try { set = await api('/api/read-set', { ids: ok.map((x) => ({ id: x.g.source_id, note: (x.p.note || '').trim() || undefined })), today: today() }); } catch { set = null; }
      }
      const used = set && set.proposal && set.used.includes(got[0].source_id) ? ok.filter((x) => set.used.includes(x.g.source_id)) : [];
      const inSet = (x) => used.some((u) => u.p.image === x.image);
      // Pictures not put together go back to wait their turn, the ones that were joined before first.
      const rest = [...joined.filter((x) => !inSet(x)), ...queueRef.current.filter((x) => !inSet(x))];
      const shown = used.length > 1 ? { ...first, set: used.slice(1).map((u) => ({ image: u.p.image, note: u.p.note || '' })) } : first;
      const p = used.length > 1 ? set.proposal : got[0];
      putQueue(rest); setImage(shown);
      applyProposal(p);
      savePending({ queue: rest, image: shown, note: nt, proposal: p });
    } catch (err) {
      setError(`${err.message} Your pictures are kept here, so you can try again without choosing them again.`);
      savePending({ queue: queueRef.current, image: img, note: nt });
    } finally {
      setReading(false); setReadCount(null);
    }
  };
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

  const readOne = async (image, note, keepDone, fresh) => {
    setReading(true); setError(''); if (!keepDone) setDone(null); setOpen(null);
    try {
      if (image.csv && !csvAccount) throw new Error('Choose which account the file is from.');
      // Something you typed to the assistant is read again by the assistant.
      const p = image.typed ? (await api('/api/ask', { text: image.text, today: new Date().toLocaleDateString('en-CA') })).proposal || { lines: [], balances: [], new_accounts: [], unknown_accounts: [], notes: 'Nothing to record was found in what you typed.' } : await api('/api/read-screenshot', { image: image.url, mime: image.type, note: note.trim() || undefined, fresh: fresh || undefined, account: image.csv ? csvAccount : undefined, today: new Date().toLocaleDateString('en-CA') });
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
        // A line with no clear amount or date is asked about, not dropped: the answer makes it a line like any other.
        const unclear = l.action === 'skip' && l.why === 'No clear amount or date';
        const late = l.action === 'skip' && l.why === 'Dated after today';
        if (unclear || late) l = { ...l, action: l.account ? 'record' : 'choose_account' };
        const r = { ...l, kind, on: !late && (l.action === 'record' || l.action === 'mark_posted' || l.action === 'choose_account'), target: acct, category_id: kind === 'purchase' || kind === 'income' ? suggestCategory(l.merchant, l.category_guess, kind === 'income') : '' };
        // The other side of a payment or transfer, when it is not one of your accounts, is an account not in the app:
        // only your side changes. It can be changed on the line.
        if (kind === 'transfer') { r.from = out ? acct : oth; r.to = out ? oth : acct; if (r.from && !r.to) r.to = 'outside'; else if (r.to && !r.from) r.from = 'outside'; }
        if (kind === 'card_payment') {
          const acctIsCard = acct.startsWith('credit_card:') || (l.account && l.account.type === 'credit_card');
          r.card = acctIsCard ? acct : oth; r.source = acctIsCard ? oth : acct;
          if (r.card && !r.source) r.source = 'outside';
          if (!r.card && r.source) { r.kind = 'transfer'; r.from = r.source; r.to = 'outside'; }
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
      setChanges((p.updates || []).flatMap((u) => u.changes.map((c) => ({ ...c, account: u.account, key: `${u.account.type}:${u.account.id}:${c.field}`, on: true }))));
      setBillDrafts((p.new_bills || []).map((b) => ({ ...b, on: true, amount: b.amount == null ? '' : String(b.amount), next_date: b.next_date || '' })));
      setInvDrafts((p.new_investments || []).map((x) => ({ ...x, on: true, balance: x.balance == null ? '' : String(x.balance) })));
      setHeldDrafts((p.holdings_updates || []).map((h) => ({ ...h, on: true })));
      setRoomDrafts((p.tax_room || []).map((r) => ({ ...r, on: true })));
      setTaxDraft(p.tax_year ? { ...p.tax_year, on: !p.tax_year.same } : null);
      setScoreDraft(p.credit_score ? { on: !p.credit_score.same, bureau: p.credit_score.bureau || '', score: String(p.credit_score.score), date: p.credit_score.date || new Date().toLocaleDateString('en-CA') } : null);
      setLoanDrafts((p.new_loans || []).map((l) => ({ ...l, on_card_ref: l.on_card ? (String(l.on_card.id).startsWith('new:') ? l.on_card.id : `credit_card:${l.on_card.id}`) : '', on: true, balance: l.balance == null ? '' : String(l.balance), payment_amount: l.payment_amount == null ? '' : String(l.payment_amount),
        next_payment_date: l.next_payment_date || '', interest_rate: l.interest_rate == null ? '' : String(l.interest_rate) })));
      setRemovals({}); setEdit({});
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
  // The account the picture was matched to can be wrong: every line and balance on it moves to the one chosen.
  const REF_FIELDS = ['target', 'from', 'to', 'card', 'source'];
  const usedRefs = [...new Set([...rows.flatMap((r) => REF_FIELDS.map((f) => r[f])), ...fixes.map((f) => `${f.account.type}:${f.account.id}`)].filter(Boolean))];
  const moveAll = (old, next) => {
    if (!next || next === old) return;
    const label = (accountOptions.find((o) => o.value === next) || {}).label || '';
    const [type, ...rest] = next.split(':');
    const account = { type, id: rest.join(':'), name: label.replace(/^New: /, '') };
    setRows((rs) => rs.map((r) => {
      if (!REF_FIELDS.some((f) => r[f] === old)) return r;
      const out = { ...r };
      for (const f of REF_FIELDS) {
        if (r[f] !== old) continue;
        // A card payment needs a card on one side and an account on the other; a choice that does not fit is left to choose.
        out[f] = (f === 'card' && !isCardRef(next)) || (f === 'source' && isCardRef(next)) ? '' : next;
      }
      if (r.account && `${r.account.type}:${r.account.id}` === old) out.account = account;
      else if (r.account && r.account.id === old) out.account = account;
      return out;
    }));
    if (!next.startsWith('new:')) setFixes((fs) => fs.map((f) => (`${f.account.type}:${f.account.id}` === old ? { ...f, account } : f)));
    // A new account nothing points to any more is not added.
    if (old.startsWith('new:')) setDrafts((ds) => ds.map((d) => (d.id === old ? { ...d, on: false } : d)));
  };
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
    if (r.kind === 'transfer') return !r.from || !r.to ? 'Choose both accounts' : r.from === r.to ? (r.from === 'outside' ? 'One of the two must be an account in the app' : 'Choose two different accounts') : null;
    if (r.kind === 'card_payment') return !r.card ? 'Choose the card' : !r.source ? 'Choose what paid it' : null;
    return r.target ? null : 'Choose the account';
  };

  const save = async () => {
    setSaving(true); setError('');
    const result = { recorded: 0, posted: 0, repeated: 0, corrected: 0, created: [], gaps: [], failed: [], left: 0, held: 0 };
    // What is ready is saved. A line whose account is not known is kept to be filed later, by a picture that shows the
    // account or by hand. Nothing holds the rest back.
    const homeless = (x) => ['Choose the account', 'Choose the card', 'Choose both accounts'].includes(missing(x));
    for (const r of rows.filter((x) => x.on && homeless(x))) {
      try {
        const { error: e } = await server.from('held_lines').insert({ id: generateId(), date: r.date, merchant: String(r.merchant || '').slice(0, 80), amount: Number(r.amount), direction: r.direction, kind: r.kind, pending: !!r.pending,
          hint: r.shown || r.other_hint || null, key: r.key || null, source_id: r.src || proposal.source_id, y: r.y == null ? null : r.y, category_guess: r.category_guess || null, created_at: new Date().toISOString() });
        if (e) throw new Error(e.message);
        result.held += 1;
      } catch (err) { result.failed.push(`${r.merchant}: ${err.message}`); }
    }
    const leftRows = rows.filter((x) => x.on && missing(x) && !homeless(x));
    const chosenRows = rows.filter((x) => x.on && !missing(x));
    const leftDrafts = drafts.filter(draftNeeds), leftLoans = loanDrafts.filter(loanNeeds), leftInv = invDrafts.filter(invNeeds), leftBills = billDrafts.filter(billNeeds), leftScore = !!scoreNeeds(scoreDraft);
    result.left = leftRows.length + leftDrafts.length + leftLoans.length + leftInv.length + leftBills.length + (leftScore ? 1 : 0);
    const banks = [...bankAccounts], cards = [...creditCards];
    const realRef = {};
    // 1. New accounts. The opening balance is set so that, after the lines below are recorded, it equals the balance on the screenshot.
    for (const d of drafts.filter((x) => x.on && !draftNeeds(x))) {
      try {
        const shown = d.balance === '' || !Number.isFinite(Number(d.balance)) ? null : Number(d.balance);
        const effect = chosenRows.reduce((s, r) => s + effectOn(r, d.id, d.type === 'credit_card'), 0);
        // With no balance on the picture the account starts from nothing and its lines make its balance.
        const opening = shown == null ? 0 : Math.round((shown - effect) * 100) / 100;
        // Already in the app under the same last four digits (added a moment ago, or on another device): that one is used.
        const twin = d.last4 && (d.type === 'credit_card' ? cards : banks).find((a) => String(a.last4 || a.last_four || '').slice(-4) === String(d.last4).slice(-4));
        if (twin) { realRef[d.id] = `${d.type}:${twin.id}`; continue; }
        const id = generateId();
        const table = d.type === 'credit_card' ? 'credit_cards' : 'bank_accounts';
        const row = d.type === 'credit_card'
          ? { id, name: d.name.trim(), balance: opening, last4: d.last4 || null, credit_limit: Number(d.credit_limit) || 0, due_date: d.due_date || null,
            minimum_payment: d.minimum_payment || null, statement_balance: d.statement_balance ?? null, autopay_mode: d.autopay ? 'statement' : null,
            is_gift_card: !!d.gift, created_at: new Date().toISOString() }
          : { id, name: d.name.trim(), balance: opening, last4: d.last4 || null, account_type: d.account_type || 'checking', institution: '', created_at: new Date().toISOString() };
        const { error: e } = await server.from(table).insert(row);
        if (e) throw new Error(e.message);
        (d.type === 'credit_card' ? cards : banks).push(row);
        realRef[d.id] = `${d.type}:${id}`;
        result.created.push(d.name);
      } catch (err) { result.failed.push(`${d.name}: ${err.message}`); }
    }
    // 1b. Loans, leases and pay-later plans found on the picture.
    for (const l of loanDrafts.filter((x) => x.on && !loanNeeds(x))) {
      try {
        const owed = Math.round((Number(l.balance) || 0) * 100) / 100;
        const { error: e } = await server.from('loans').insert({ id: generateId(), name: l.name.trim(), principal: owed, balance: owed, interest_rate: Number(l.interest_rate) || 0,
          loan_type: l.loan_type || 'loan', on_card_id: (() => { const r = l.on_card_ref ? (realRef[l.on_card_ref] || l.on_card_ref) : ''; return r.startsWith('credit_card:') ? r.slice(12) : null; })(), payment_amount: Math.round((Number(l.payment_amount) || 0) * 100) / 100, frequency: l.frequency || 'monthly', next_payment_date: /^\d{4}-\d{2}-\d{2}$/.test(l.next_payment_date || '') ? l.next_payment_date : null,
          fee_percent: 0, setup_fee: 0, alert_days: 3, recurring_duration_type: 'indefinite', recurring_occurrences_completed: 0, from_screenshot: proposal.source_id, created_at: new Date().toISOString() });
        if (e) throw new Error(e.message);
        result.created.push(l.name);
      } catch (err) { result.failed.push(`${l.name}: ${err.message}`); }
    }
    // 1c. Investments and a credit score found on the picture.
    for (const x of invDrafts.filter((v) => v.on && !invNeeds(v))) {
      try {
        const newId = generateId();
        const { error: e } = await server.from(x.table === 'assets' ? 'assets' : 'investments').insert({ id: newId, name: x.name.trim(), kind: x.kind || 'Other', balance: Math.round((Number(x.balance) || 0) * 100) / 100, created_at: new Date().toISOString() });
        if (e) throw new Error(e.message);
        if (x.table !== 'assets' && (x.holdings || []).length) await api('/api/holdings', { id: newId, holdings: x.holdings, ...(x.cash != null ? { cash: x.cash } : {}) });
        result.created.push(x.name);
      } catch (err) { result.failed.push(`${x.name}: ${err.message}`); }
    }
    for (const h of heldDrafts.filter((v) => v.on)) {
      try { await api('/api/holdings', { id: h.id, holdings: h.holdings, ...(h.cash != null ? { cash: h.cash } : {}) }); result.created.push(`what ${h.name} holds`); }
      catch (err) { result.failed.push(`${h.name}: ${err.message}`); }
    }
    if (taxDraft && taxDraft.on) {
      try {
        // Only what this picture shows is written, so figures from an earlier picture of the same year stay.
        const { on: _on, same: _same, existing_id, ...row } = taxDraft;
        const { error: e } = existing_id ? await server.from('tax_years').update(row).eq('id', existing_id)
          : await server.from('tax_years').insert({ id: generateId(), ...row, from_screenshot: proposal.source_id, created_at: new Date().toISOString() });
        if (e) throw new Error(e.message);
        result.created.push(`tax year ${row.year}`);
      } catch (err) { result.failed.push(`Tax year: ${err.message}`); }
    }
    if (roomDrafts.some((r) => r.on)) {
      try {
        const { data: had } = await server.from('settings').select('*').eq('key', 'tax_room').maybeSingle();
        const value = { ...((had && had.value) || {}) };
        for (const r of roomDrafts.filter((v) => v.on)) value[r.kind] = { ...(value[r.kind] || {}), room: r.room, as_of: r.as_of };
        const { error: e } = await server.from('settings').upsert({ key: 'tax_room', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (e) throw new Error(e.message);
        result.created.push(`${roomDrafts.filter((v) => v.on).map((r) => r.kind).join(', ')} room`);
      } catch (err) { result.failed.push(`Room: ${err.message}`); }
    }
    // 1d. Details that changed on things the app already has, and bills.
    const byThing = new Map();
    for (const c of changes.filter((x) => x.on)) byThing.set(`${c.account.type}:${c.account.id}`, [...(byThing.get(`${c.account.type}:${c.account.id}`) || []), c]);
    for (const list of byThing.values()) {
      const { type, id, name } = list[0].account;
      try {
        const patch = Object.fromEntries(list.map((c) => [c.field, c.to]));
        // A limit that moved keeps what it was and the day it was seen, so the card can show it.
        const lim = list.find((c) => c.field === 'credit_limit');
        if (lim) { patch.credit_limit_before = lim.from; patch.credit_limit_changed_at = new Date().toLocaleDateString('en-CA'); }
        const { error: e } = await server.from({ credit_card: 'credit_cards', bank_account: 'bank_accounts', loan: 'loans', bill: 'bills' }[type]).update(patch).eq('id', id);
        if (e) throw new Error(e.message);
        result.changed = (result.changed || 0) + list.length;
      } catch (err) { result.failed.push(`${name}: ${err.message}`); }
    }
    for (const b of billDrafts.filter((x) => x.on && !billNeeds(x))) {
      try {
        const { error: e } = await server.from('bills').insert({ key: `scan:${b.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: b.name.trim(), amount: Math.round((Number(b.amount) || 0) * 100) / 100, frequency: b.frequency || 'monthly', next_date: /^\d{4}-\d{2}-\d{2}$/.test(b.next_date || '') ? b.next_date : null,
          status: 'active', remind: true, source: 'scan' });
        if (e) throw new Error(e.message);
        result.created.push(b.name);
      } catch (err) { result.failed.push(`${b.name}: ${err.message}`); }
    }
    if (scoreDraft && scoreDraft.on && !leftScore) {
      try {
        const same = proposal.credit_score && proposal.credit_score.existing_id && scoreDraft.date === proposal.credit_score.date && scoreDraft.bureau.trim().toLowerCase() === String(proposal.credit_score.bureau || '').toLowerCase();
        const { error: e } = same
          ? await server.from('credit_scores').update({ score: Number(scoreDraft.score) }).eq('id', proposal.credit_score.existing_id)
          : await server.from('credit_scores').insert({ bureau: scoreDraft.bureau.trim().slice(0, 40) || 'Not stated', score: Number(scoreDraft.score), date: scoreDraft.date, note: null, created_at: new Date().toISOString() });
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
        if (r0.held_id) await server.from('held_lines').delete().eq('id', r0.held_id);
      } catch (err) {
        result.failed.push(`${label}: ${err.message}`);
      }
    }
    // 3. The balances on the screenshot, after the lines: each is a snapshot. The server compares it with the app;
    // a difference the lines don't explain is corrected (undoable) when ticked, or left open on Where you stand.
    const day = new Date().toLocaleDateString('en-CA');
    const snaps = [
      ...fixes.map((f) => ({ target: `${f.account.type}:${f.account.id}`, name: f.account.name, value: f.shown, apply: f.on })),
      ...drafts.filter((d) => d.on && realRef[d.id] && d.balance !== '' && Number.isFinite(Number(d.balance))).map((d) => ({ target: realRef[d.id], name: d.name, value: Number(d.balance), apply: true })),
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
    for (const id of proposal.held_done || []) { try { await server.from('held_lines').delete().eq('id', id); } catch { /* it is matched again next time */ } }
    setDone(result);
    setSaving(false);
    loadHeld();
    if (onUpdate) await onUpdate();
    if (result.failed.length) return;
    if (!result.left) return advance(true);
    // Only what was left stays on the screen, pointing at the accounts just added.
    const ids = new Set(leftRows.map((r) => r.i)), has = (list) => new Set(list.map((x) => x.id));
    const lines = [];
    for (const l of proposal.lines.filter((x) => ids.has(x.i))) {
      const made = l.account && String(l.account.id).startsWith('new:') ? realRef[String(l.account.id)] : null;
      if (!made) { lines.push(l); continue; }
      const id = made.split(':')[1];
      lines.push({ ...l, account: { ...l.account, id }, key: l.key_rest ? 'shot:' + await sha32(`${id}|${l.key_rest}`) : l.key });
    }
    const rest = { ...proposal, lines, balances: [], updates: [], statement: null, receipt: null, pay_slip: false, unknown_accounts: [],
      new_accounts: (proposal.new_accounts || []).filter((x) => has(leftDrafts).has(x.id)), new_loans: (proposal.new_loans || []).filter((x) => has(leftLoans).has(x.id)),
      new_investments: (proposal.new_investments || []).filter((x) => has(leftInv).has(x.id)), new_bills: (proposal.new_bills || []).filter((x) => has(leftBills).has(x.id)),
      credit_score: leftScore ? proposal.credit_score : null };
    applyProposal(rest);
    savePending({ queue: queueRef.current, image, note, proposal: rest });
  };

  const setLoan = (id, patch) => setLoanDrafts((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  // Only a name is needed to add anything. What the picture does not show stays empty and a later picture fills it in.
  const loanNeeds = (l) => (!l.on ? null : !l.name.trim() ? 'Enter a name' : null);
  const billNeeds = (b) => (!b.on ? null : !b.name.trim() ? 'Enter a name' : null);
  const showValue = (c, v) => (v == null ? 'not set' : c.kind === 'text' ? String(v) : c.kind === 'money' ? formatCurrency(v) : c.kind === 'later' ? (formatDate(v) || v) : `${v}%`);
  const invNeeds = (x) => (!x.on ? null : !x.name.trim() ? 'Enter a name' : null);
  const scoreNeeds = (x) => (!x || !x.on ? null : !(Number.isInteger(Number(x.score)) && Number(x.score) >= 300 && Number(x.score) <= 900) ? 'A score is a whole number from 300 to 900' : !/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? 'Choose the day' : null);
  const chosen = rows.filter((r) => r.on).length + fixes.length + drafts.filter((d) => d.on).length + loanDrafts.filter((l) => l.on).length + invDrafts.filter((x) => x.on).length + heldDrafts.filter((x) => x.on).length + roomDrafts.filter((x) => x.on).length + (taxDraft && taxDraft.on ? 1 : 0) + (scoreDraft && scoreDraft.on ? 1 : 0) + changes.filter((c) => c.on).length + billDrafts.filter((b) => b.on).length;
  const draftNeeds = (d) => (!d.on ? null : !d.name.trim() ? 'Enter a name' : null);
  const homelessRow = (r) => ['Choose the account', 'Choose the card', 'Choose both accounts'].includes(missing(r));
  const blocked = rows.filter((r) => r.on && missing(r) && !homelessRow(r)).length + drafts.filter(draftNeeds).length + loanDrafts.filter(loanNeeds).length + invDrafts.filter(invNeeds).length + (scoreNeeds(scoreDraft) ? 1 : 0) + billDrafts.filter(billNeeds).length;
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
  const Select = ({ value, onChange, label, cards, outside, big: large }) => (
    <label className={`block ${large ? 'text-sm' : 'text-xs'}`}>
      <span className={muted}>{label}</span>
      <select className={`${input} ${large ? 'mt-1 py-2.5 text-base' : ''}`} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose</option>
        {accountOptions.filter((o) => cards === undefined || isCardRef(o.value) === cards).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {outside && <option value="outside">An account not in the app</option>}
      </select>
    </label>
  );
  // What has to be answered before saving, gathered in one place. Lines missing the same thing are answered together.
  const ASKS = [
    ['Choose what paid it', 'source', (n) => (n === 1 ? 'One card payment: which account paid it?' : `${n} card payments: which account paid them?`), { cards: false, outside: true }],
    ['Choose the card', 'card', (n) => (n === 1 ? 'Which card was paid?' : `${n} card payments: which card was paid?`), { cards: true }],
    ['Choose the account', 'target', (n) => (n === 1 ? 'Which account or card is this on?' : `${n} lines: which account or card are they on?`), {}],
    ['Choose both accounts', 'side', (n) => (n === 1 ? 'Which of your accounts is this transfer on?' : `${n} transfers: which of your accounts are they on?`), {}],
  ];
  const waiting = rows.filter((r) => r.on && missing(r) && !homelessRow(r));
  const homeless = rows.filter((r) => r.on && homelessRow(r));
  // Lines missing the same thing on the same picture are one question.
  const asks = ASKS.flatMap(([why, field, text, opts]) => { const by = new Map(); homeless.filter((r) => missing(r) === why).forEach((r) => by.set(r.src || '', [...(by.get(r.src || '') || []), r])); return [...by].map(([src, list]) => ({ why, field, opts, text, src, list })); });
  const shownPics = image ? [image, ...(image.set || []).map((x) => x.image)].filter((x) => !x.pdf && !x.csv && !x.typed) : [];
  const picUrl = (src) => { const hit = shownPics.find((x) => x.sid && x.sid === src) || (shownPics.length === 1 ? shownPics[0] : null); return hit ? hit.url : (keptPics[src] || null); };
  const leaveOut = (list) => { const ids = new Set(list.map((r) => r.i)); setRows((rs) => rs.map((r) => (ids.has(r.i) ? { ...r, on: false } : r))); };
  const otherWaiting = waiting;
  const answerAll = (a, v) => { if (!v) return; const ids = new Set(a.list.map((r) => r.i)); setRows((rs) => rs.map((r) => (!ids.has(r.i) ? r : a.field === 'side' ? { ...r, from: r.direction === 'in' ? 'outside' : v, to: r.direction === 'in' ? v : 'outside' } : { ...r, [a.field]: v }))); };
  const showLine = (i) => { setOpen(i); setTimeout(() => { const el = document.getElementById(`scan-line-${i}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className={`text-2xl font-bold text-fg`}>Scan</h1>
        <p className={`text-sm ${muted}`}>
          Choose screenshots of your bank or card app (as many as you like), a statement, a receipt or a bank file. Reading starts by itself. Check it and tap Save.
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
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[{ image }, ...(image.set || []), ...queue].map((x, i) => (x.image.pdf || x.image.csv || x.image.typed
                ? <div key={i} className="shrink-0 w-20 h-20 rounded-xl border border-line bg-surface-2 p-2 text-xs text-muted break-all overflow-hidden">{x.image.typed ? 'Typed' : x.image.name}</div>
                : <button key={i} type="button" className="press shrink-0" aria-label={`Look at picture ${i + 1} closely`} onClick={() => setBig(x.image.url)}><img src={x.image.url} alt="" className="w-20 h-20 object-cover rounded-xl border border-line" /></button>))}
            </div>
            {(image.pdf || image.csv || image.typed) && <button type="button" onClick={removePicture} className="press text-sm text-muted underline">{image.typed ? 'Discard' : 'Remove file'}</button>}
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
              {!image.csv && !image.typed && !noteOpen && !note && proposal && <button type="button" className="press text-sm font-medium text-accent" onClick={() => setNoteOpen(true)}>Read wrong? Add a note</button>}
              {!image.csv && !image.typed && (noteOpen || !!note) && <label className="block text-sm">
                <span className="text-muted">A word or two is enough, such as the bank or card name. Then tap Read again.</span>
                <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="For example: this is my Visa ending 1234, or only the grocery lines"
                  className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-fg placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none" />
              </label>}
            </div>
          </div>
        )}
        {kept > 0 && !image && <p className="text-xs text-muted">{kept === 1 ? 'One picture is' : `${kept} pictures are`} kept with what was read from {kept === 1 ? 'it' : 'them'}.</p>}
        {held.length > 0 && !image && (
          <div className="space-y-3 border-t border-line pt-3 text-sm">
            <p className="font-semibold text-base">{held.length === 1 ? 'One line is waiting for its account' : `${held.length} lines are waiting for their account`}</p>
            <p className="text-muted">A later picture that shows the account files {held.length === 1 ? 'it' : 'them'}. Or tap the account.</p>
            {held.map((h) => {
              const url = keptPics[h.source_id] || null;
              return (
                <div key={h.id} className="rounded-xl border border-line p-3 space-y-3">
                  <Snip url={url} y={h.y} mark onOpen={() => setBig(url)} />
                  <div>
                    <div className="flex items-baseline justify-between gap-3 font-medium"><span className="min-w-0 truncate">{h.merchant || 'No name'}</span><span className="tabular-nums shrink-0">{h.direction === 'in' ? '+' : ''}{formatCurrency(Number(h.amount) || 0)}</span></div>
                    <div className="text-muted">{formatDate(h.date) || h.date}{h.hint ? ` · shown as ${h.hint}` : ''}</div>
                  </div>
                  <Chips disabled={filing} options={accountOptions.filter((o) => !o.value.startsWith('new:'))} onPick={(v) => fileHeld([h], v)} />
                  <button type="button" className="press text-sm text-muted underline" onClick={() => dropHeld(h)}>Not mine: remove it</button>
                </div>
              );
            })}
            {held.length > 1 && (
              <label className="block"><span className="text-muted">Or all of them are on</span>
                <select className={`${input} mt-1 py-2.5 text-base`} value="" disabled={filing} onChange={(e) => fileHeld(held, e.target.value)}>
                  <option value="">Choose</option>
                  {accountOptions.filter((o) => !o.value.startsWith('new:')).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        {reading && (
          <div role="status" className="rounded-xl border border-line bg-surface-2 px-3 py-3 space-y-1">
            <p className="font-medium">{readCount ? `Reading ${readCount.of} pictures: ${readCount.done} done` : 'Reading'} ({secs}s)</p>
            {secs >= 25 && <p className="text-sm text-muted">Still reading. A busy reading service is tried again by itself, which can take a minute or two.</p>}
          </div>
        )}
        {error && <p role="alert" className="text-base text-negative">{error}</p>}
      </div>

      {proposal && (
        <div className={`border rounded-lg p-4 space-y-4 ${card}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Found</h2>
            {queue.length > 0 && <span className="text-sm text-muted shrink-0">{queue.length} more waiting</span>}
          </div>
          {chosen === 0 && <p role="status" className="text-sm rounded-lg bg-accent-soft text-accent px-3 py-2">There is nothing to save from this one. {queue.length > 0 ? 'Tap Skip to the next at the bottom, or add a note and read it again.' : 'Tap Close at the bottom, or add a note and read it again.'}</p>}
          {image.set && image.set.length > 0 && <p className="text-sm">{image.set.length + 1} pictures were read together as one.</p>}
          {(asks.length > 0 || otherWaiting.length > 0) && (
            <section id="scan-questions" className="space-y-3" style={{ scrollMarginTop: 80 }}>
              <h3 className="font-semibold text-base">{asks.length + otherWaiting.length === 1 ? 'One question' : `${asks.length + otherWaiting.length} questions`}</h3>
              <p className={`text-sm ${muted}`}>Tap an answer if you know it. Anything you leave is kept, and everything else can be saved now.</p>
              {asks.map((a) => {
                const url = picUrl(a.src), one = a.list.length === 1;
                const ys = a.list.map((r) => r.y).filter((v) => v != null);
                return (
                  <div key={`${a.why}|${a.src}`} className="rounded-xl border border-line p-3 space-y-3">
                    <Snip url={url} y={ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : null} mark={one} onOpen={() => setBig(url)} />
                    <div>
                      <p className="font-medium">{a.text(a.list.length)}</p>
                      <p className={`text-sm ${muted}`}>{a.list.slice(0, 3).map((r) => `${r.merchant || 'No name'} ${formatCurrency(Number(r.amount) || 0)}`).join(', ')}{a.list.length > 3 ? ` and ${a.list.length - 3} more` : ''}{one && a.list[0].shown ? ` · shown as ${a.list[0].shown}` : ''}</p>
                    </div>
                    <Chips options={[...accountOptions.filter((o) => a.opts.cards === undefined || isCardRef(o.value) === a.opts.cards), ...(a.opts.outside ? [{ value: 'outside', label: 'Not in the app' }] : [])]} onPick={(v) => answerAll(a, v)} />
                    <button type="button" className={`press text-sm underline ${muted}`} onClick={() => leaveOut(a.list)}>{one ? 'Not mine: leave it out' : 'Not mine: leave them out'}</button>
                  </div>
                );
              })}
              {otherWaiting.map((r) => {
                const url = picUrl(r.src), need = missing(r);
                return (
                  <div key={r.i} className="rounded-xl border border-line p-3 space-y-3">
                    <Snip url={url} y={r.y} mark onOpen={() => setBig(url)} />
                    <div>
                      <p className="font-medium">{need === 'Enter the amount' ? 'How much was this?' : need === 'Enter the date' ? 'What day was this?' : need === 'Choose what paid it' ? 'Which account paid this card?' : need}</p>
                      <p className={`text-sm ${muted}`}>{r.merchant || 'No name'}{Number(r.amount) > 0 ? ` ${formatCurrency(Number(r.amount))}` : ''}{/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? ` · ${formatDate(r.date) || r.date}` : ''}</p>
                    </div>
                    {need === 'Enter the amount' && <input className={`${input} py-2.5 text-base`} type="number" step="0.01" min="0" inputMode="decimal" aria-label="Amount" placeholder="Amount" value={Number(r.amount) > 0 || r.typing ? r.amount : ''} onChange={(e) => setRow(r.i, { amount: e.target.value, typing: true })} />}
                    {need === 'Enter the date' && <input className={`${input} py-2.5 text-base`} type="date" aria-label="Date" value={r.date || ''} onChange={(e) => setRow(r.i, { date: e.target.value })} />}
                    {need === 'Choose what paid it' && <Chips options={[...accountOptions.filter((o) => !isCardRef(o.value)), { value: 'outside', label: 'Not in the app' }]} onPick={(v) => setRow(r.i, { source: v })} />}
                    <div className="flex items-center gap-4">
                      {!['Enter the amount', 'Enter the date', 'Choose what paid it'].includes(need) && <button type="button" className="press px-3 py-2 rounded-lg border border-line bg-surface text-sm font-medium" onClick={() => showLine(r.i)}>Answer on the line</button>}
                      <button type="button" className={`press text-sm underline ${muted}`} onClick={() => leaveOut([r])}>Leave it out</button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
          {blocked > waiting.length && <p className="text-sm text-amber-600">{blocked - waiting.length === 1 ? 'One thing' : `${blocked - waiting.length} things`} to add below {blocked - waiting.length === 1 ? 'needs' : 'need'} a name: look for the amber text, or untick {blocked - waiting.length === 1 ? 'it' : 'them'}.</p>}
          {usedRefs.some((ref) => accountOptions.some((o) => o.value === ref)) && accountOptions.length > 1 && (
            <details className="text-sm">
              <summary className="font-medium text-accent py-2 cursor-pointer">On the wrong account?</summary>
              {usedRefs.filter((ref) => accountOptions.some((o) => o.value === ref)).map((ref) => (
                <label key={ref} className="block">
                  <span className={muted}>Everything shown on {nameOf(ref)} belongs to</span>
                  <select className={`${input} mt-1 py-2.5 text-base`} value={ref} onChange={(e) => moveAll(ref, e.target.value)}>
                    {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              ))}
              <p className={`text-xs ${muted}`}>One line on a different account: tap Edit on that line.</p>
            </details>
          )}
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
                  {d.on && <div className="flex items-center justify-between gap-3 text-sm text-muted"><span className="min-w-0 truncate">{`${d.type === 'credit_card' ? 'Card' : 'Bank account'}${d.balance !== '' ? ` · ${formatCurrency(Number(d.balance))}${d.type === 'credit_card' ? ' owed' : ''}` : ''}`}</span><button type="button" className="press shrink-0 font-medium text-accent" aria-expanded={!!edit[d.id]} onClick={() => setEdit((e) => ({ ...e, [d.id]: !e[d.id] }))}>{edit[d.id] ? 'Done' : 'Edit'}</button></div>}
                  {d.on && (edit[d.id] || !!draftNeeds(d)) && (
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
            </section>
          )}
          {proposal.pay_slip && (
            <section className="rounded-lg border border-line p-3 space-y-2">
              <h3 className="text-base font-semibold">This is a pay slip</h3>
              <p className={`text-sm ${muted}`}>Pay is set up on the Income screen: who pays, how much, how often and which accounts it lands in. It is read there from this same picture.</p>
              <button type="button" className="press px-4 py-2.5 rounded-xl bg-accent text-accent-contrast font-medium" onClick={() => navigate('/income', { state: { paySlip: { url: image.url, type: image.type } } })}>Set up this pay</button>
            </section>
          )}
          {changes.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-base font-semibold">Details that changed</h3>
              <div className="rounded-lg border border-line divide-y divide-line">
                {changes.map((c) => (
                  <label key={c.key} className="flex items-start gap-3 p-3">
                    <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0" checked={c.on} onChange={(e) => setChanges((cs) => cs.map((x) => (x.key === c.key ? { ...x, on: e.target.checked } : x)))} />
                    <span className="min-w-0">
                      <span className="block text-base font-medium">{c.account.name}: {c.label.toLowerCase()}</span>
                      <span className={`block text-sm ${muted}`}>{showValue(c, c.from)} in the app, {showValue(c, c.to)} on the picture{c.field === 'credit_limit' && c.from != null ? (c.to > c.from ? `: raised by ${formatCurrency(c.to - c.from)}` : `: lowered by ${formatCurrency(c.from - c.to)}`) : ''}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className={`text-sm ${muted}`}>Ticked ones are updated when you save.</p>
            </section>
          )}
          {billDrafts.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-base font-semibold">Bills to add</h3>
              {billDrafts.map((b) => {
                const setBill = (patch) => setBillDrafts((bs) => bs.map((y) => (y.id === b.id ? { ...y, ...patch } : y)));
                return (
                  <div key={b.id} className="rounded-lg border p-3 space-y-2 border-line">
                    <label className="flex items-center gap-3 text-base font-medium">
                      <input type="checkbox" className="w-5 h-5" checked={b.on} onChange={(e) => setBill({ on: e.target.checked })} />
                      Track {b.name}
                    </label>
                  {b.on && <div className="flex items-center justify-between gap-3 text-sm text-muted"><span className="min-w-0 truncate">{`${Number(b.amount) > 0 ? formatCurrency(Number(b.amount)) : 'Amount not known yet'}${b.next_date ? ` · due ${formatDate(b.next_date) || b.next_date}` : ''}`}</span><button type="button" className="press shrink-0 font-medium text-accent" aria-expanded={!!edit[b.id]} onClick={() => setEdit((e) => ({ ...e, [b.id]: !e[b.id] }))}>{edit[b.id] ? 'Done' : 'Edit'}</button></div>}
                    {b.on && (edit[b.id] || !!billNeeds(b)) && (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-sm col-span-2"><span className={muted}>Name</span>
                          <input className={input} value={b.name} maxLength={60} onChange={(e) => setBill({ name: e.target.value })} /></label>
                        <label className="block text-sm"><span className={muted}>Amount</span>
                          <input className={input} type="number" step="0.01" min="0" inputMode="decimal" value={b.amount} placeholder="Not shown" onChange={(e) => setBill({ amount: e.target.value })} /></label>
                        <label className="block text-sm"><span className={muted}>How often</span>
                          <select className={input} value={b.frequency} onChange={(e) => setBill({ frequency: e.target.value })}>
                            <option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option><option value="quarterly">Every 3 months</option><option value="yearly">Yearly</option>
                          </select></label>
                        <label className="block text-sm col-span-2"><span className={muted}>Next due</span>
                          <input className={input} type="date" value={b.next_date} onChange={(e) => setBill({ next_date: e.target.value })} /></label>
                      </div>
                    )}
                    {billNeeds(b) && <div className="text-sm text-amber-600">{billNeeds(b)}</div>}
                  </div>
                );
              })}
              <p className={`text-sm ${muted}`}>A tracked bill shows on Home and gets a reminder. Who it is paid through can be set under More, Bills.</p>
            </section>
          )}
          {heldDrafts.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-base font-semibold">What your investments hold</h3>
              {heldDrafts.map((h) => (
                <div key={h.id} className="rounded-lg border p-3 space-y-1 border-line">
                  <label className="flex items-center gap-3 text-base font-medium">
                    <input type="checkbox" className="w-5 h-5" checked={h.on} onChange={(e) => setHeldDrafts((xs) => xs.map((y) => (y.id === h.id ? { ...y, on: e.target.checked } : y)))} />
                    Set what {h.name} holds
                  </label>
                  {h.holdings.map((x, i) => <div key={i} className="flex justify-between gap-3 text-sm text-muted"><span className="min-w-0 truncate">{x.symbol || x.name}</span><span className="shrink-0 tabular-nums">{x.units != null ? `${x.units} units` : formatCurrency(x.value)}</span></div>)}
                </div>
              ))}
              <p className={`text-sm ${muted}`}>The account's value then follows the market price of each holding.</p>
            </section>
          )}
          {taxDraft && (
            <section className="space-y-2">
              <h3 className="text-base font-semibold">Tax year</h3>
              <div className="rounded-lg border p-3 space-y-1 border-line">
                <label className="flex items-center gap-3 text-base font-medium">
                  <input type="checkbox" className="w-5 h-5" checked={taxDraft.on} onChange={(e) => setTaxDraft({ ...taxDraft, on: e.target.checked })} />
                  {taxDraft.existing_id ? `Add to your ${taxDraft.year} tax year` : `Keep your ${taxDraft.year} tax year`}
                </label>
                {TAX_FIELDS.filter(([k]) => taxDraft[k] != null).map(([k, label]) => <div key={k} className="flex justify-between gap-3 text-sm text-muted"><span>{label}</span><span className="tabular-nums">{formatCurrency(taxDraft[k])}</span></div>)}
                {taxDraft.same && <p className={`text-sm ${muted}`}>The same figures are already on record.</p>}
              </div>
              <p className={`text-sm ${muted}`}>Kept under More, Tax years, where each figure can be changed.</p>
            </section>
          )}
          {roomDrafts.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-base font-semibold">Contribution room</h3>
              {roomDrafts.map((r) => (
                <label key={r.kind} className="flex items-center gap-3 rounded-lg border p-3 border-line text-base">
                  <input type="checkbox" className="w-5 h-5" checked={r.on} onChange={(e) => setRoomDrafts((xs) => xs.map((y) => (y.kind === r.kind ? { ...y, on: e.target.checked } : y)))} />
                  <span className="min-w-0"><span className="font-medium">{r.kind} room {formatCurrency(r.room)}</span><span className={`block text-sm ${muted}`}>as of {formatDate(r.as_of) || r.as_of}</span></span>
                </label>
              ))}
              <p className={`text-sm ${muted}`}>Kept under More, Room left, where what you put in after that day is taken off.</p>
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
                  {scoreDraft.on && <div className="flex items-center justify-between gap-3 text-sm text-muted"><span className="min-w-0 truncate">{`${scoreDraft.score}${scoreDraft.bureau ? ` · ${scoreDraft.bureau}` : ''}`}</span><button type="button" className="press shrink-0 font-medium text-accent" aria-expanded={!!edit['score']} onClick={() => setEdit((e) => ({ ...e, score: !e.score }))}>{edit['score'] ? 'Done' : 'Edit'}</button></div>}
                {scoreDraft.on && (edit['score'] || !!scoreNeeds(scoreDraft)) && (
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
              <h3 className="text-base font-semibold">Investments and property to add</h3>
              {invDrafts.map((x) => {
                const setInv = (patch) => setInvDrafts((xs) => xs.map((y) => (y.id === x.id ? { ...y, ...patch } : y)));
                return (
                  <div key={x.id} className="rounded-lg border p-3 space-y-2 border-line">
                    <label className="flex items-center gap-3 text-base font-medium">
                      <input type="checkbox" className="w-5 h-5" checked={x.on} onChange={(e) => setInv({ on: e.target.checked })} />
                      Add {x.name}
                    </label>
                  {x.on && <div className="flex items-center justify-between gap-3 text-sm text-muted"><span className="min-w-0 truncate">{`${x.kind || 'Other'} · ${x.balance !== '' ? formatCurrency(Number(x.balance)) : 'Value not known yet'}${(x.holdings || []).length ? ` · ${x.holdings.length === 1 ? '1 holding' : `${x.holdings.length} holdings`}, follows the market` : ''}`}</span><button type="button" className="press shrink-0 font-medium text-accent" aria-expanded={!!edit[x.id]} onClick={() => setEdit((e) => ({ ...e, [x.id]: !e[x.id] }))}>{edit[x.id] ? 'Done' : 'Edit'}</button></div>}
                    {x.on && (edit[x.id] || !!invNeeds(x)) && (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-sm"><span className={muted}>Name</span>
                          <input className={input} value={x.name} maxLength={60} onChange={(e) => setInv({ name: e.target.value })} /></label>
                        <label className="block text-sm"><span className={muted}>Kind</span>
                          <select className={input} value={x.kind} onChange={(e) => setInv({ kind: e.target.value })}>
                            {(x.table === 'assets' ? ['Home', 'Car', 'Other'] : ['TFSA', 'RRSP', 'FHSA', 'RESP', 'Brokerage', 'Pension', 'Crypto', 'Other']).map((k) => <option key={k}>{k}</option>)}
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
                  {l.on && <div className="flex items-center justify-between gap-3 text-sm text-muted"><span className="min-w-0 truncate">{`${l.on_card_ref ? 'Inside a card · ' : ''}${l.balance !== '' ? `${formatCurrency(Number(l.balance))} owed` : 'Balance not known yet'}${Number(l.payment_amount) > 0 ? ` · ${formatCurrency(Number(l.payment_amount))} each payment` : ''}`}</span><button type="button" className="press shrink-0 font-medium text-accent" aria-expanded={!!edit[l.id]} onClick={() => setEdit((e) => ({ ...e, [l.id]: !e[l.id] }))}>{edit[l.id] ? 'Done' : 'Edit'}</button></div>}
                  {l.on && (edit[l.id] || !!loanNeeds(l)) && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-sm"><span className={muted}>Name</span>
                        <input className={input} value={l.name} maxLength={60} onChange={(e) => setLoan(l.id, { name: e.target.value })} /></label>
                      <label className="block text-sm"><span className={muted}>Kind</span>
                        <select className={input} value={l.loan_type} onChange={(e) => setLoan(l.id, { loan_type: e.target.value })}>
                          <option value="loan">Loan</option><option value="mortgage">Mortgage</option><option value="line_of_credit">Line of credit</option><option value="car_lease">Car lease or car loan</option>
                          <option value="bnpl">Pay later</option><option value="plan">Equal payment plan</option><option value="student">Student loan</option>
                        </select></label>
                      <label className="block text-sm col-span-2"><span className={muted}>Inside a card (its balance already includes this)</span>
                        <select className={input} value={l.on_card_ref || ''} onChange={(e) => setLoan(l.id, { on_card_ref: e.target.value, ...(e.target.value ? { loan_type: 'plan' } : {}) })}>
                          <option value="">No, a debt of its own</option>
                          {creditCards.filter((c) => !c.is_gift_card).map((c) => <option key={c.id} value={`credit_card:${c.id}`}>{c.name}</option>)}
                          {drafts.filter((x) => x.on && x.type === 'credit_card' && !x.gift).map((x) => <option key={x.id} value={x.id}>{x.name} (being added)</option>)}
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
                  <li key={r.i} id={`scan-line-${r.i}`} style={{ scrollMarginTop: 80 }} className="py-3 space-y-2">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" className="mt-1 w-5 h-5 shrink-0" checked={r.on} disabled={r.action === 'skip'} aria-label={`Save ${r.merchant}`}
                        onChange={(e) => setRow(r.i, { on: e.target.checked })} />
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-medium break-words">{r.merchant}</div>
                        <div className={`text-sm ${muted}`}>
                          {formatDate(r.date) || r.date}{r.pending ? ', pending' : ''} · {KIND_TEXT[r.kind] || r.kind} · {lineSummary(r)}{cat ? ` · ${cat.name}` : ''}
                        </div>
                        {r.action !== 'record' && r.action !== 'choose_account' && <div className={`text-xs ${muted}`}>{r.why || STATUS_TEXT[r.action]}</div>}
                        {need && (homelessRow(r) ? <div className={`text-xs ${muted}`}>No account yet: kept for later</div> : <div className="text-sm text-amber-600">{need}</div>)}
                        {!r.on && r.why === 'Dated after today' && <div className={`text-xs ${muted}`}>Dated after today: tick it if it has happened</div>}
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
                        {picUrl(r.src) && <div className="col-span-2"><Snip url={picUrl(r.src)} y={r.y} mark onOpen={() => setBig(picUrl(r.src))} /></div>}
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
                          <Select label="From" value={r.from} outside onChange={(v) => setRow(r.i, { from: v })} />
                          <Select label="To" value={r.to} outside onChange={(v) => setRow(r.i, { to: v })} />
                        </>)}
                        {r.kind === 'card_payment' && (<>
                          <Select label="Card paid" value={r.card} cards onChange={(v) => setRow(r.i, { card: v })} />
                          <Select label="Paid from" value={r.source} cards={false} outside onChange={(v) => setRow(r.i, { source: v })} />
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
                    Correct the app to this if the lines do not explain it
                  </label>
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {big && createPortal(
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" role="dialog" aria-modal="true" aria-label="The picture, large">
          <div className="flex justify-end p-3">{(big === image?.url || queue.some((q) => q.image.url === big)) && <button type="button" className="press rounded-xl border border-white/60 text-white px-4 py-2 font-medium mr-2" onClick={() => { if (big === image.url) removePicture(); else { putQueue(queueRef.current.filter((q) => q.image.url !== big)); keepWaiting(); } setBig(null); }}>Remove</button>}<button type="button" className="press rounded-xl bg-white text-black px-4 py-2 font-medium" onClick={() => setBig(null)}>Close</button></div>
          <div className="flex-1 overflow-auto px-2 pb-6" style={{ touchAction: 'pinch-zoom pan-x pan-y' }}><img src={big} alt="The picture, large" className="w-full max-w-3xl mx-auto" /></div>
        </div>
      , document.body)}
      {image && createPortal(
        <div className="fixed inset-x-0 z-20 border-t border-line bg-background/95 backdrop-blur-md" style={{ bottom: 'calc(58px + env(safe-area-inset-bottom))' }}>
          <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2">
          <button type="button" onClick={() => readTogether(image, note, null, false, !!proposal)} disabled={reading || saving}
            className={`press px-4 py-3 rounded-xl font-medium disabled:opacity-50 ${proposal ? 'border border-line bg-surface text-fg' : 'flex-1 bg-accent text-accent-contrast hover:opacity-90'}`}>
            {reading ? 'Reading...' : proposal ? 'Read again' : image.typed ? 'Read again' : queue.length > 0 ? `Start reading (${queue.length + 1} chosen)` : image.csv ? 'Read file' : image.pdf ? 'Read statement' : 'Read screenshot'}
          </button>
          {proposal && chosen - blocked <= 0 && (
            <button data-skip type="button" onClick={() => { setDone(null); advance(true); }} disabled={saving || reading}
              className="press flex-1 px-4 py-3 rounded-xl bg-accent text-accent-contrast font-medium hover:opacity-90 disabled:opacity-50">
              {queue.length > 0 ? `Skip to the next (${queue.length} waiting)` : 'Close'}
            </button>
          )}
          {proposal && chosen - blocked > 0 && queue.length > 0 && (
            <button type="button" onClick={() => { setDone(null); advance(true); }} disabled={saving || reading} className="press px-3 py-3 rounded-xl border border-line bg-surface text-fg font-medium disabled:opacity-50">Skip</button>
          )}
          {proposal && chosen - blocked > 0 && (
            <button type="button" onClick={save} disabled={saving || reading}
              className="press flex-1 px-4 py-3 rounded-xl bg-accent text-accent-contrast font-medium hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving...' : `Save ${chosen - blocked} ${chosen - blocked === 1 ? 'item' : 'items'}`}
            </button>
          )}
          </div>
        </div>
      , document.body)}

      {image && <div className="h-20" aria-hidden="true" />}
      {done && (
        <div role="status" className={`border rounded-lg p-4 text-sm ${card}`}>
          {done.created.length > 0 && <div>Accounts added: {done.created.join(', ')}.</div>}
          {done.recorded > 0 || !done.created.length ? `Saved ${done.recorded} ${done.recorded === 1 ? 'line' : 'lines'}.` : ''}{done.changed > 0 ? ` Details updated: ${done.changed}.` : ''}{done.posted > 0 && ` Pending lines marked as posted: ${done.posted}.`}
          {done.repeated > 0 && ` Already saved from an earlier screenshot, skipped: ${done.repeated}.`}
          {done.removed > 0 && ` Removed as not on the statement: ${done.removed}.`}
          {done.gaps.length > 0 && <ul className="mt-1 list-disc pl-5">{done.gaps.map((g) => <li key={g}>{g}</li>)}</ul>}
          {done.held > 0 && <div className="mt-1">{done.held === 1 ? 'One line has' : `${done.held} lines have`} no account yet. {done.held === 1 ? 'It is' : 'They are'} kept under "Waiting for an account" and filed when a later picture shows it.</div>}
          {done.left > 0 && <div className="mt-1">{done.left === 1 ? 'One thing was' : `${done.left} things were`} left because a detail is missing. {done.left === 1 ? 'It stays' : 'They stay'} above until you fill {done.left === 1 ? 'it' : 'them'} in, or tap {queue.length > 0 ? 'Skip to the next' : 'Close'} to leave {done.left === 1 ? 'it' : 'them'}.</div>}
          {done.failed.length > 0 && (
            <ul className="mt-2 text-red-600 list-disc pl-5">{done.failed.map((f) => <li key={f}>{f}</li>)}</ul>
          )}
          <div className={`mt-1 ${muted}`}>Each saved line can be undone from Transactions or Activity.</div>
        </div>
      )}
    </div>
  );
}
