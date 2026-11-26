import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Check, ArrowRight, Camera, PenLine } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { api } from '../utils/server';
import { savePending } from '../utils/pendingScan';
import { recordExpense, recordIncome, recordTransfer, recordCardPayment, recordLoanPayment } from '../utils/money';
import { pickCategory, usualSource, mkey } from '../utils/categoryRules';
import { loanFor } from '../utils/cards';
import { formatCurrency, generateId, localDate, defaultBankAccount } from '../utils/helpers';
import { showToast } from '../utils/toast';
import { Button } from './shared/ui';

// The quick way to add one line: an amount, what it was, and where the money came from. The category and the usual
// account are filled in from what the app knows and what you did before; both can be changed with a tap.
// A sentence can be typed instead: it goes through the same check-before-saving screen as a picture.
const KINDS = [['spent', 'Spent'], ['received', 'Received'], ['moved', 'Moved']];
const field = 'w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-fg placeholder:text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/30';
const remember = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* not kept */ } };
const recall = (k) => { try { return window.localStorage.getItem(k) || ''; } catch { return ''; } };
const dayBefore = (d) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() - 1); return x.toLocaleDateString('en-CA'); };

// The part of the screen that is not under the keyboard, so the sheet always sits above it.
function useVisible() {
  const [box, setBox] = useState(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const set = () => setBox({ height: vv.height, top: vv.offsetTop });
    set();
    vv.addEventListener('resize', set); vv.addEventListener('scroll', set);
    return () => { vv.removeEventListener('resize', set); vv.removeEventListener('scroll', set); };
  }, []);
  return box;
}

function Chips({ options, value, onChange, label }) {
  // The chosen one is brought into view when it was chosen for you and sits off to the side.
  const row = useRef(null);
  useEffect(() => {
    const el = row.current && row.current.querySelector('[aria-checked="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [value]);
  return (
    <div>
      <div className="text-xs text-muted mb-1.5 px-1">{label}</div>
      <div ref={row} className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 no-bar" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={`press shrink-0 text-left rounded-2xl px-3.5 py-2 border transition-colors ${value === o.value ? 'bg-accent text-accent-contrast border-accent' : 'bg-surface-2 border-line text-fg'}`}>
            <div className="text-sm font-medium whitespace-nowrap">{o.label}</div>
            {o.sub && <div className={`text-xs whitespace-nowrap tabular-nums ${value === o.value ? 'opacity-80' : 'text-muted'}`}>{o.sub}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function QuickAdd({ onClose, onFullForm }) {
  const { bankAccounts = [], creditCards = [], loans = [], investments = [], categories = [], categoryRules = [], transactions = [], loadAllData } = useFinanceData();
  const navigate = useNavigate();
  const box = useVisible();
  const today = localDate();
  const [mode, setMode] = useState('form');            // 'form' | 'sentence'
  const [kind, setKind] = useState('spent');
  const [amount, setAmount] = useState('');
  const [what, setWhat] = useState('');
  const [source, setSource] = useState('');
  const [sourceSet, setSourceSet] = useState(false);   // you chose it, so typing no longer changes it
  const [category, setCategory] = useState('');
  const [categorySet, setCategorySet] = useState(false);
  const [to, setTo] = useState('');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  const [key, setKey] = useState(() => `quick:${generateId()}`);
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState(null);
  const amountBox = useRef(null);

  const accounts = useMemo(() => ({ bankAccounts, creditCards, loans, investments }), [bankAccounts, creditCards, loans, investments]);
  const cards = useMemo(() => creditCards.filter((c) => !c.is_gift_card), [creditCards]);
  const lines = useMemo(() => loans.filter((l) => !l.on_card_id && l.loan_type === 'line_of_credit'), [loans]);
  const owed = useMemo(() => loans.filter((l) => !l.on_card_id && Number(l.balance) > 0), [loans]);
  const pool = useMemo(() => categories.filter((c) => (kind === 'received' ? c.is_income : !c.is_income)), [categories, kind]);

  const bankChips = bankAccounts.map((a) => ({ value: `bank_account:${a.id}`, label: a.name, sub: formatCurrency(a.balance) }));
  const cardChips = cards.map((c) => ({ value: `credit_card:${c.id}`, label: c.name, sub: `${formatCurrency(c.balance)} owed` }));
  const lineChips = lines.map((l) => ({ value: `loan:${l.id}`, label: l.name, sub: `${formatCurrency(l.balance)} owed` }));
  const outside = { value: 'outside', label: 'Not in the app' };
  const fromChips = kind === 'spent' ? [...bankChips, ...cardChips] : kind === 'received' ? bankChips : [...bankChips, ...lineChips, outside];
  const toChips = [...bankChips, ...cardChips.map((c) => ({ ...c, label: `Pay ${c.label}` })), ...owed.map((l) => ({ value: `loan:${l.id}`, label: `Pay ${l.name}`, sub: `${formatCurrency(l.balance)} owed` })), outside].filter((o) => o.value !== source || o.value === 'outside');

  // Where it starts: the account used last time here, else the main account.
  useEffect(() => {
    const ok = (v) => v && fromChips.some((o) => o.value === v);
    if (ok(source)) return;
    const last = recall(`quick_from_${kind}`);
    const main = defaultBankAccount(bankAccounts);
    setSource(ok(last) ? last : main && ok(`bank_account:${main.id}`) ? `bank_account:${main.id}` : (fromChips[0] || {}).value || '');
    setSourceSet(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, bankAccounts.length, creditCards.length, loans.length]);
  useEffect(() => { if (kind === 'moved' && to && to === source && to !== 'outside') setTo(''); }, [kind, to, source]);

  // What you type fills the rest: the category from what the app knows, and the account you paid this place with before.
  useEffect(() => {
    if (kind === 'moved') return;
    if (!categorySet) setCategory(what.trim().length >= 3 ? pickCategory({ merchant: what, income: kind === 'received', amount: Number(amount) || null, rules: categoryRules, transactions, pool }) : '');
    if (kind === 'spent' && !sourceSet) { const usual = usualSource(what, transactions, accounts); if (usual) setSource(usual); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [what, kind, amount, pool.length]);

  useEffect(() => { const t = setTimeout(() => { if (amountBox.current) amountBox.current.focus(); }, 60); return () => clearTimeout(t); }, [mode]);
  useEffect(() => { const esc = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);

  // Names you used before that start the way this one does.
  const names = useMemo(() => {
    const q = mkey(what);
    if (kind === 'moved' || q.length < 2) return [];
    const seen = new Set(), out = [];
    for (const t of [...transactions].sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
      const d = String(t.description || '').trim(), k = mkey(d);
      if (!d || !k.startsWith(q) || k === q || seen.has(k) || t.type !== (kind === 'received' ? 'income' : 'expense')) continue;
      seen.add(k); out.push(d);
      if (out.length === 3) break;
    }
    return out;
  }, [what, transactions, kind]);

  // A line to a lender you have a loan with is a payment on it, not spending.
  const pays = kind === 'spent' ? loanFor(what, loans) : null;
  const asPayment = () => { setKind('moved'); setTo(`loan:${pays.id}`); if (source.startsWith('credit_card:')) { const main = defaultBankAccount(bankAccounts); setSource(main ? `bank_account:${main.id}` : ''); } };

  const n = Number(amount);
  const fault = !(n > 0) ? 'Enter the amount' : !source ? (kind === 'received' ? 'Choose where it went' : 'Choose where it came from') : kind === 'moved' && !to ? 'Choose where it went' : kind === 'moved' && source === 'outside' && to === 'outside' ? 'Choose at least one account that is in the app' : kind === 'moved' && source === 'outside' && to.startsWith('loan:') ? 'Choose what paid the loan' : null;
  const nameOf = (v) => [...bankChips, ...cardChips, ...lineChips, ...owed.map((l) => ({ value: `loan:${l.id}`, label: l.name }))].find((o) => o.value === v)?.label || 'an account not in the app';
  const cat = pool.find((c) => String(c.id) === String(category));

  const save = async (again) => {
    if (fault || busy) return;
    setBusy(true);
    try {
      const common = { amount: n, date, key };
      if (kind === 'spent') await recordExpense({ ...common, source, description: what.trim() || (cat ? cat.name : 'Purchase'), category_id: cat ? cat.id : null, category_name: cat ? cat.name : null }, accounts);
      else if (kind === 'received') await recordIncome({ ...common, target: source, description: what.trim() || 'Money in', source_name: what.trim() || 'Money in', extra: cat ? { category_id: cat.id, category_name: cat.name } : {} }, accounts);
      else if (to.startsWith('credit_card:')) await recordCardPayment({ ...common, cardId: to.split(':')[1], source, description: what.trim() || undefined }, accounts);
      else if (to.startsWith('loan:')) await recordLoanPayment({ ...common, loanId: to.split(':').slice(1).join(':'), source, description: what.trim() || undefined }, accounts);
      else await recordTransfer({ ...common, from: source, to, description: what.trim() || undefined }, accounts);
      remember(`quick_from_${kind}`, source);
      if (loadAllData) await loadAllData();
      if (again) { setSaved((c) => c + 1); setAmount(''); setWhat(''); setCategory(''); setCategorySet(false); setSourceSet(false); setKey(`quick:${generateId()}`); if (amountBox.current) amountBox.current.focus(); }
      else { showToast.success(kind === 'moved' ? `${formatCurrency(n)} moved to ${nameOf(to)}` : `${formatCurrency(n)} saved`); onClose(); }
    } catch (err) {
      showToast.error(err.message || 'That could not be saved.');
    } finally { setBusy(false); }
  };

  const send = async () => {
    const q = text.trim().slice(0, 300);
    if (!q || busy) return;
    setBusy(true); setAnswer(null);
    try {
      const r = await api('/api/ask', { text: q, today });
      if (r.kind === 'record') {
        await savePending({ image: { typed: true, pdf: true, text: q, name: `You typed: ${q}`, url: '', type: 'text/plain' }, note: '', proposal: r.proposal });
        onClose(); navigate('/screenshot');
        return;
      }
      setAnswer({ text: r.text });
    } catch (err) { setAnswer({ text: err.message, error: true }); } finally { setBusy(false); }
  };

  const none = bankAccounts.length === 0 && creditCards.length === 0;
  const go = (path) => { onClose(); navigate(path); };

  return (
    <div className="fixed left-0 right-0 z-50 flex flex-col justify-end" style={box ? { top: box.top, height: box.height } : { top: 0, bottom: 0 }}>
      <button type="button" aria-label="Close" className="sheet-back absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Add" className="sheet-panel relative w-full max-w-lg mx-auto bg-surface text-fg rounded-t-3xl shadow-2xl border-t border-line flex flex-col max-h-full">
        <div className="shrink-0 pt-2.5 pb-1 flex justify-center"><span className="w-10 h-1 rounded-full bg-line" aria-hidden="true" /></div>
        <div className="shrink-0 px-5 pb-3 flex items-center gap-3">
          {mode === 'form' && !none ? (
            <div className="flex-1 grid grid-cols-3 p-1 rounded-2xl bg-surface-2 border border-line" role="tablist">
              {KINDS.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                  className={`press rounded-xl py-2 text-sm font-medium transition-colors ${kind === k ? 'bg-surface shadow-sm text-fg' : 'text-muted'}`}>{label}</button>
              ))}
            </div>
          ) : <h2 className="flex-1 text-lg font-semibold">{none ? 'Add' : 'Say it in a sentence'}</h2>}
          <button type="button" onClick={onClose} aria-label="Close" className="press w-10 h-10 rounded-full bg-surface-2 border border-line flex items-center justify-center text-muted"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 pb-5 space-y-4" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
          {none && mode === 'form' ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted">There is no account yet. A picture of your banking app adds the account and its lines in one go. Or say it in a sentence: an account you name is added for you.</p>
              <Button onClick={() => go('/screenshot')} className="w-full"><Camera size={18} aria-hidden="true" /> Add a picture</Button>
              <Button variant="secondary" onClick={() => setMode('sentence')} className="w-full"><PenLine size={18} aria-hidden="true" /> Say it in a sentence</Button>
              <Button variant="secondary" onClick={() => go('/bank-accounts')} className="w-full">Add an account by hand</Button>
            </div>
          ) : mode === 'sentence' ? (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <textarea ref={amountBox} rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} className={field}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Groceries 84.20 at Loblaws on my Visa yesterday" aria-label="What to record" />
              <p className="text-xs text-muted px-1">Say what happened, or what changed: "paid 340.86 for the car lease from chequing", "my line of credit rate went up to 5.45%". An account you name that is not here is added. You check everything before it is saved.</p>
              {answer && <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${answer.error ? 'bg-negative/10 text-negative' : 'bg-surface-2 border border-line'}`} aria-live="polite">{answer.text}</div>}
              <Button type="submit" loading={busy} disabled={!text.trim()} className="w-full">Check it <ArrowRight size={18} aria-hidden="true" /></Button>
              {!none && <button type="button" className="w-full text-sm font-medium text-accent py-1" onClick={() => setMode('form')}>Back to the quick form</button>}
            </form>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(false); }}>
              <label className="block text-center">
                <span className="sr-only">Amount</span>
                <span className="inline-flex items-baseline justify-center gap-1 w-full">
                  <span className={`text-3xl font-semibold ${amount ? 'text-fg' : 'text-muted'}`} aria-hidden="true">$</span>
                  <input ref={amountBox} type="text" inputMode="decimal" autoComplete="off" enterKeyHint="next" placeholder="0.00" value={amount}
                    onChange={(e) => { const v = e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''); if (/^\d{0,9}(\.\d{0,2})?$/.test(v)) setAmount(v); }}
                    className="amount-big bg-transparent font-bold tabular-nums tracking-tight text-fg placeholder:text-muted/50 text-center"
                    style={{ width: `${Math.max(4, (amount || '0.00').length)}ch` }} />
                </span>
              </label>

              {kind !== 'moved' && (
                <div className="space-y-2">
                  <input type="text" value={what} maxLength={80} onChange={(e) => setWhat(e.target.value)} className={field} autoCapitalize="words" enterKeyHint="done"
                    placeholder={kind === 'spent' ? 'What was it? Loblaws, rent, coffee' : 'Who from? Pay, a refund, a friend'} aria-label={kind === 'spent' ? 'What it was' : 'Who it came from'} />
                  {names.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto no-bar -mx-5 px-5">
                      {names.map((d) => <button key={d} type="button" onClick={() => setWhat(d)} className="press shrink-0 text-sm px-3 py-1.5 rounded-xl bg-accent-soft text-accent whitespace-nowrap">{d}</button>)}
                    </div>
                  )}
                  {pays && (
                    <button type="button" onClick={asPayment} className="press w-full text-left text-sm rounded-2xl px-4 py-2.5 bg-accent-soft text-accent">
                      This looks like a payment on {pays.name}. Tap to record it as one, so what you owe goes down.
                    </button>
                  )}
                  {pool.length > 0 && (
                    <label className="flex items-center gap-2 text-sm px-1">
                      <span className="text-muted shrink-0">Category</span>
                      <select value={category} onChange={(e) => { setCategory(e.target.value); setCategorySet(true); }} className="flex-1 min-w-0 bg-transparent font-medium text-fg outline-none text-right" aria-label="Category">
                        <option value="">None</option>
                        {pool.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}

              <Chips label={kind === 'received' ? 'Into' : 'From'} options={fromChips} value={source} onChange={(v) => { setSource(v); setSourceSet(true); }} />
              {kind === 'moved' && <Chips label="To" options={toChips} value={to} onChange={setTo} />}

              <div className="flex items-center gap-2">
                {[[today, 'Today'], [dayBefore(today), 'Yesterday']].map(([d, label]) => (
                  <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={date === d}
                    className={`press rounded-xl px-3.5 py-2 text-sm font-medium border transition-colors ${date === d ? 'bg-accent-soft text-accent border-accent/40' : 'bg-surface-2 border-line text-muted'}`}>{label}</button>
                ))}
                <input type="date" max={today} value={date} onChange={(e) => { if (e.target.value && e.target.value <= today) setDate(e.target.value); }} aria-label="Another day"
                  className={`flex-1 min-w-0 rounded-xl px-3 py-2 text-sm border bg-surface-2 outline-none ${date !== today && date !== dayBefore(today) ? 'border-accent/40 text-accent' : 'border-line text-muted'}`} />
              </div>

              <div className="space-y-2 pt-1">
                <Button type="submit" loading={busy} disabled={!!fault} className="w-full">{fault || (<><Check size={18} aria-hidden="true" /> Save</>)}</Button>
                <div className="flex items-center justify-between text-sm">
                  <button type="button" disabled={!!fault || busy} onClick={() => save(true)} className="font-medium text-accent disabled:opacity-40 py-1">Save and add another{saved > 0 ? ` (${saved} saved)` : ''}</button>
                  <button type="button" onClick={() => setMode('sentence')} className="font-medium text-accent py-1">Say it in a sentence</button>
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <button type="button" onClick={() => go('/screenshot')} className="py-1 underline underline-offset-2">Add a picture</button>
                  <button type="button" onClick={() => { onClose(); onFullForm(); }} className="py-1 underline underline-offset-2">More options</button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
