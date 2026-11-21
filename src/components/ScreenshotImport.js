import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/server';
import { recordExpense, recordIncome, recordRefund, recordAdjustment } from '../utils/money';
import { server } from '../utils/server';
import { formatCurrency } from '../utils/helpers';
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

export default function ScreenshotImport({ darkMode, bankAccounts = [], creditCards = [], loans = [], categories = [], onUpdate }) {
  const [image, setImage] = useState(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState(null);
  const [rows, setRows] = useState([]);
  const [fixes, setFixes] = useState([]);
  const [done, setDone] = useState(null);
  const [aiReady, setAiReady] = useState(true);
  useEffect(() => { server.auth.config().then((c) => setAiReady(c.ai !== false)); }, []);

  const accountOptions = useMemo(() => [
    ...bankAccounts.map((a) => ({ value: `bank_account:${a.id}`, label: a.name })),
    ...creditCards.map((c) => ({ value: `credit_card:${c.id}`, label: c.name })),
    { value: 'cash_in_hand', label: 'Cash in hand' },
  ], [bankAccounts, creditCards]);
  const expenseCategories = categories.filter((c) => !c.is_income);

  const card = darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-600';
  const input = `px-2 py-1.5 rounded border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`;

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setProposal(null); setDone(null);
    try { setImage({ ...(await prepare(file)), name: file.name }); } catch (err) { setError(err.message); }
  };

  const read = async () => {
    setReading(true); setError(''); setDone(null);
    try {
      const p = await api('/api/read-screenshot', { image: image.url, mime: image.type, today: new Date().toLocaleDateString('en-CA') });
      setProposal(p);
      setRows(p.lines.map((l) => ({
        ...l,
        on: l.action === 'record' || l.action === 'mark_posted',
        target: l.account ? `${l.account.type}:${l.account.id}` : '',
        category_id: '',
      })));
      setFixes(p.balances.map((b) => ({ ...b, on: false })));
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(false);
    }
  };

  const setRow = (i, patch) => setRows((rs) => rs.map((r) => (r.i === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true); setError('');
    const accounts = { bankAccounts, creditCards, loans };
    const result = { recorded: 0, posted: 0, repeated: 0, corrected: 0, failed: [] };
    for (const r of rows.filter((x) => x.on)) {
      try {
        if (r.action === 'mark_posted') {
          const { error: e } = await server.from('transactions').update({ pending: false, date: r.date }).eq('id', r.existing_id);
          if (e) throw new Error(e.message);
          result.posted += 1;
          continue;
        }
        if (!r.target) throw new Error('Choose the account');
        const cat = categories.find((c) => String(c.id) === String(r.category_id));
        const common = { amount: r.amount, date: r.date, description: r.merchant, key: r.key, extra: { pending: r.pending, from_screenshot: proposal.source_id } };
        let res;
        if (r.direction === 'out') {
          res = await recordExpense({ ...common, source: r.target, category_id: cat ? cat.id : null, category_name: cat ? cat.name : null }, accounts);
        } else if (r.target.startsWith('credit_card:')) {
          res = await recordRefund({ ...common, target: r.target }, accounts);
        } else {
          res = await recordIncome({ ...common, target: r.target, source_name: r.merchant }, accounts);
        }
        if (res.repeated) result.repeated += 1; else result.recorded += 1;
      } catch (err) {
        result.failed.push(`${r.merchant} ${formatCurrency(r.amount)}: ${err.message}`);
      }
    }
    for (const f of fixes.filter((x) => x.on)) {
      try {
        await recordAdjustment({ target: `${f.account.type}:${f.account.id}`, newBalance: f.shown, current: f.current,
          date: new Date().toLocaleDateString('en-CA'), description: 'Balance from screenshot' }, accounts);
        result.corrected += 1;
      } catch (err) {
        result.failed.push(`${f.account.name}: ${err.message}`);
      }
    }
    setDone(result);
    setSaving(false);
    if (onUpdate) await onUpdate();
    if (!result.failed.length) { setProposal(null); setImage(null); }
  };

  const chosen = rows.filter((r) => r.on).length + fixes.filter((f) => f.on).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Scan</h1>
        <p className={`text-sm ${muted}`}>
          Take a photo of a receipt, or choose a screenshot of your bank or card app. The app reads it and lists what it found.
          Nothing is saved until you tick the lines you want and tap Record.
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
          <label className="press cursor-pointer flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 py-5 font-medium">
            <ImageIcon size={26} aria-hidden="true" />
            Choose a screenshot
            <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" onChange={pick} className="sr-only" />
          </label>
        </div>
        {image && (
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <img src={image.url} alt="The screenshot to read" className="max-h-64 rounded border border-gray-300" />
            <button type="button" onClick={read} disabled={reading}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
              {reading ? 'Reading...' : 'Read screenshot'}
            </button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>

      {proposal && (
        <div className={`border rounded-lg p-4 space-y-3 ${card}`}>
          <h2 className="font-semibold">What the screenshot shows</h2>
          {proposal.notes && <p className={`text-sm ${muted}`}>{proposal.notes}</p>}
          {proposal.unknown_accounts.length > 0 && (
            <p className="text-sm text-amber-600">
              Not in the app yet: {proposal.unknown_accounts.map((a) => a.name + (a.last4 ? ` (ending ${a.last4})` : '')).join(', ')}.
              Add it under Banks or Cards, then read the screenshot again, or choose an account for each line below.
            </p>
          )}
          {rows.length === 0 && <p className={`text-sm ${muted}`}>No transactions found in this screenshot.</p>}
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((r) => (
              <li key={r.i} className="py-2 flex flex-wrap items-center gap-2">
                <input type="checkbox" checked={r.on} disabled={r.action === 'skip'} aria-label={`Record ${r.merchant}`}
                  onChange={(e) => setRow(r.i, { on: e.target.checked })} />
                <div className="flex-1 min-w-[10rem]">
                  <div className="font-medium">{r.merchant}</div>
                  <div className={`text-xs ${muted}`}>
                    {r.date}{r.pending ? ', pending' : ''} - {STATUS_TEXT[r.action] || r.action}
                  </div>
                </div>
                <span className={r.direction === 'in' ? 'text-green-600 font-medium' : 'font-medium'}>
                  {r.direction === 'in' ? '+' : '-'}{formatCurrency(r.amount)}
                </span>
                {r.action !== 'mark_posted' && r.action !== 'skip' && (
                  <>
                    <select className={input} value={r.target} aria-label="Account" onChange={(e) => setRow(r.i, { target: e.target.value, on: true })}>
                      <option value="">Choose account</option>
                      {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {r.direction === 'out' && (
                      <select className={input} value={r.category_id} aria-label="Category" onChange={(e) => setRow(r.i, { category_id: e.target.value })}>
                        <option value="">No category</option>
                        {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {fixes.length > 0 && (
            <div className="space-y-1">
              <h3 className="font-semibold text-sm">Balances that differ from the app</h3>
              {fixes.map((f, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.on} onChange={(e) => setFixes((fs) => fs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                  Set {f.account.name} to {formatCurrency(f.shown)} (the app shows {formatCurrency(f.current)})
                </label>
              ))}
              <p className={`text-xs ${muted}`}>Record the lines first, then correct a balance only if it still differs.</p>
            </div>
          )}
          <button type="button" onClick={save} disabled={saving || !chosen}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Recording...' : `Record ${chosen} ${chosen === 1 ? 'item' : 'items'}`}
          </button>
        </div>
      )}

      {done && (
        <div role="status" className={`border rounded-lg p-4 text-sm ${card}`}>
          Recorded {done.recorded}. Pending lines marked as posted: {done.posted}.
          {done.repeated > 0 && ` Already recorded from an earlier screenshot, skipped: ${done.repeated}.`}
          {done.corrected > 0 && ` Balances corrected: ${done.corrected}.`}
          {done.failed.length > 0 && (
            <ul className="mt-2 text-red-600 list-disc pl-5">{done.failed.map((f) => <li key={f}>{f}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
