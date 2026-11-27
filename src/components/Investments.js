import React, { useEffect, useState } from 'react';
import { ask } from '../utils/confirm';
import { useNavigate } from 'react-router-dom';
import { Trash2, X } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { server, api } from '../utils/server';
import { recordTransfer } from '../utils/money';
import { formatCurrency, generateId, localDate } from '../utils/helpers';
import { freshness } from '../utils/finance';
import { showToast } from '../utils/toast';
import UpdateValue from './position/UpdateValue';
import { Issues } from './shared/Issues';

// What one investment account holds. Each holding with a ticker follows the market price; the account's value is
// the holdings plus its cash. Adding one checks the ticker first, so nothing is saved without a price.
const sent = (h) => ({ symbol: h.symbol || h.shown, symbol_set: !!h.symbol, shown: h.shown, name: h.name, units: h.units, price: h.price, currency: h.currency, value: h.value });
function Holdings({ row, onDone }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ symbol: '', units: '' });
  const [choices, setChoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [units, setUnits] = useState(null);           // { i, value } while the units of one holding are being changed
  const list = Array.isArray(row.holdings) ? row.holdings : [];
  const save = async (holdings, cash) => {
    setBusy(true);
    try { await api('/api/holdings', { id: row.id, holdings, ...(cash === undefined ? {} : { cash }) }); await onDone(); return true; }
    catch (e) { showToast.error(e.message); return false; } finally { setBusy(false); }
  };
  const addOne = async (q) => {
    if (await save([...list.map(sent), { symbol: q.symbol, symbol_set: true, shown: q.symbol, name: q.name, units: Number(form.units) }])) { setForm({ symbol: '', units: '' }); setChoices([]); setOpen(false); }
  };
  const add = async (e) => {
    e.preventDefault();
    if (!(Number(form.units) > 0)) return showToast.error('Enter how many units you hold.');
    setBusy(true); setChoices([]);
    try {
      const r = await api('/api/quote', { symbol: form.symbol, crypto: row.kind === 'Crypto' });
      if (r.quote) { setBusy(false); return addOne(r.quote); }
      if (r.choices.length) setChoices(r.choices);
      else showToast.error(`No price found for ${form.symbol.toUpperCase()}. Check the ticker, for example VEQT.TO.`);
    } catch (err) { showToast.error(err.message); } finally { setBusy(false); }
  };
  const field = 'px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg text-sm';
  return (
    <div className="mt-2 space-y-1.5">
      {list.map((h, i) => (
        <div key={`${h.symbol || h.name}-${i}`} className="flex items-baseline gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{h.symbol || h.shown || h.name} {units && units.i === i ? (
            <form className="inline-flex items-center gap-2" onSubmit={async (e) => { e.preventDefault(); if (!(Number(units.value) > 0)) return showToast.error('Enter how many units you hold.'); if (await save(list.map((x, j) => ({ ...sent(x), ...(j === i ? { units: Number(units.value), value: null } : {}) })))) setUnits(null); }}>
              <input className="w-24 px-2 py-1 border rounded-xl border-line bg-surface-2 text-fg text-sm" type="number" step="any" inputMode="decimal" value={units.value} onChange={(e) => setUnits({ i, value: e.target.value })} aria-label={`Units of ${h.symbol || h.name}`} autoFocus />
              <button type="submit" disabled={busy} className="text-xs font-medium text-accent">Save</button>
              <button type="button" className="text-xs text-muted" onClick={() => setUnits(null)}>Cancel</button>
            </form>
          ) : h.units ? <button type="button" className="text-xs text-accent" onClick={() => setUnits({ i, value: String(h.units) })}>{h.units} units</button> : null} <span className="text-xs text-muted">{h.symbol && h.price ? ` at ${h.price} ${h.currency || ''}` : ''}{!h.symbol ? ' · no market price, kept as given' : !h.live ? ' · last price' : ''}</span></span>
          <span className="tabular-nums shrink-0">{h.value != null ? formatCurrency(h.value) : ''}</span>
          <button type="button" disabled={busy} onClick={() => ask(`Remove ${h.symbol || h.name} from ${row.name}?`).then((yes) => yes && save(list.filter((_, j) => j !== i).map(sent)))} aria-label={`Remove ${h.symbol || h.name}`} className="text-muted"><X size={14} /></button>
        </div>
      ))}
      {list.length > 0 && Number(row.cash) > 0 && <div className="flex items-baseline justify-between text-sm"><span className="text-muted">Cash in the account</span><span className="tabular-nums">{formatCurrency(row.cash)}</span></div>}
      {!open ? (
        <button type="button" className="text-xs font-medium text-accent" onClick={() => setOpen(true)}>{list.length ? 'Add a holding' : 'List what it holds, so the value follows the market'}</button>
      ) : (
        <form onSubmit={add} className="space-y-2">
          <div className="flex gap-2">
            <input className={`${field} flex-1 min-w-0`} placeholder="Ticker, for example VEQT" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} aria-label="Ticker" required autoCapitalize="characters" />
            <input className={`${field} w-24`} type="number" step="any" inputMode="decimal" placeholder="Units" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} aria-label="Units" required />
          </div>
          {choices.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted">More than one match. Which is it?</p>
              {choices.map((c) => <button key={c.symbol} type="button" disabled={busy} onClick={() => addOne(c)} className="block w-full text-left text-sm rounded-xl border border-line px-3 py-2">{c.symbol} <span className="text-muted">{c.name} · {c.price} {c.currency}</span></button>)}
            </div>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="text-xs font-medium text-accent">{busy ? 'Checking...' : 'Add'}</button>
            <button type="button" className="text-xs text-muted" onClick={() => { setOpen(false); setChoices([]); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// Investments (RRSP, TFSA, brokerage) and property (home, car): dated values, updated when you check them.
export default function Investments() {
  const d = useFinanceData();
  const [form, setForm] = useState({ table: 'investments', name: '', kind: 'TFSA', balance: '' });
  const [move, setMove] = useState({ to: '', from: '', amount: '' });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { loadAllData } = d;
  // Holdings follow the market: prices are brought up to date when the page opens and every minute while it is open.
  useEffect(() => {
    let off = false;
    const tick = () => { if (document.visibilityState === 'visible') api('/api/prices', {}).then((r) => { if (!off && r && r.changed) loadAllData(); }).catch(() => {}); };
    tick();
    const t = setInterval(tick, 60000);
    return () => { off = true; clearInterval(t); };
  }, [loadAllData]);
  const card = `rounded-2xl border p-4 bg-surface border-line`;
  const input = `field`;
  const muted = 'text-muted';
  const accounts = { bankAccounts: d.bankAccounts, creditCards: d.creditCards, loans: d.loans, investments: d.investments };

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showToast.error('Enter a name.');
    setBusy(true);
    try {
      const { error } = await server.from(form.table).insert({ id: generateId(), name: form.name.trim(), kind: form.kind, balance: Number(form.balance) || 0, created_at: new Date().toISOString() });
      if (error) throw error;
      setForm({ ...form, name: '', balance: '' });
      await d.loadAllData();
    } catch (err) { showToast.error(err.message); } finally { setBusy(false); }
  };

  const contribute = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await recordTransfer({ amount: move.amount, from: move.from, to: `investment:${move.to}`, date: localDate(), description: 'Contribution' }, accounts);
      setMove({ to: '', from: '', amount: '' });
      showToast.success('Contribution recorded.');
      await d.loadAllData();
    } catch (err) { showToast.error(err.message); } finally { setBusy(false); }
  };

  const remove = async (table, row) => {
    if (!(await ask(`Remove ${row.name}? Its past values stay in the net worth history.`))) return;
    const { error } = await server.from(table).delete().eq('id', row.id);
    if (error) return showToast.error(error.message);
    await d.loadAllData();
  };

  // Called as a plain function, so the rows keep their state (an open form) when the page draws again.
  const list = ({ title, table, rows, kind }) => (
    <section className={card}>
      <h2 className="font-semibold">{title}</h2>
      {!rows.length && <p className={`text-sm ${muted}`}>None yet.</p>}
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const f = freshness(r.balance_as_of);
          const follows = Array.isArray(r.holdings) && r.holdings.some((h) => h && h.symbol);
          return (
            <li key={r.id} className="py-2">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className={`text-xs ${!follows && f.stale ? 'text-warning' : muted}`}>{[r.kind, r.institution].filter(Boolean).join(' · ')} · {follows ? `follows the market${r.priced_at ? `, priced ${new Date(r.priced_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}` : `value ${r.balance_as_of ? `as of ${f.label}` : 'never updated'}${f.stale ? ' · out of date' : ''}`}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{formatCurrency(r.balance)}</div>
                  {!follows && <UpdateValue line={{ kind, id: r.id, name: r.name }} signed={Number(r.balance) || 0} accounts={accounts} onDone={d.loadAllData} />}
                </div>
                <button type="button" onClick={() => remove(table, r)} aria-label={`Remove ${r.name}`} className={muted}><Trash2 size={16} /></button>
              </div>
              {table === 'investments' && <Holdings row={r} onDone={d.loadAllData} />}
              {table === 'investments' && <Issues compact only={(i) => i.kind === 'price' && i.ref === String(r.id)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Investments and property</h1>
      <p className={`text-sm ${muted}`}>List what an account holds and its value follows the market. Otherwise enter what it is worth when you check it. Money you put in from a bank account is recorded as a contribution.</p>
      {d.investments.some((i) => ['TFSA', 'RRSP', 'FHSA'].includes(String(i.kind || '').toUpperCase())) && (
        <button type="button" onClick={() => navigate('/room')} className={`${card} w-full text-left`}>
          <span className="font-semibold block">Room left in your TFSA, RRSP and FHSA</span>
          <span className={`text-sm ${muted}`}>How much more you can put in this year, and what is still needed to work it out.</span>
        </button>
      )}
      {list({ title: 'Investments', table: 'investments', rows: d.investments, kind: 'investment' })}
      {list({ title: 'Property', table: 'assets', rows: d.assets, kind: 'asset' })}

      {d.investments.length > 0 && (
        <form onSubmit={contribute} className={`${card} space-y-2`}>
          <h2 className="font-semibold">Put money in</h2>
          <select className={input} value={move.to} onChange={(e) => setMove({ ...move, to: e.target.value })} required aria-label="Investment">
            <option value="">Into which investment</option>
            {d.investments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select className={input} value={move.from} onChange={(e) => setMove({ ...move, from: e.target.value })} required aria-label="From">
            <option value="">From</option>
            {d.bankAccounts.map((a) => <option key={a.id} value={`bank_account:${a.id}`}>{a.name}</option>)}
          </select>
          <input className={input} type="number" step="0.01" inputMode="decimal" placeholder="Amount" value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} required />
          <button type="submit" disabled={busy} className="w-full bg-accent text-accent-contrast rounded-xl py-2 font-medium">Record contribution</button>
        </form>
      )}

      <form onSubmit={add} className={`${card} space-y-2`}>
        <h2 className="font-semibold">Add one</h2>
        <select className={input} value={form.table} onChange={(e) => setForm({ ...form, table: e.target.value, kind: e.target.value === 'assets' ? 'Home' : 'TFSA' })} aria-label="Investment or property">
          <option value="investments">Investment</option>
          <option value="assets">Property</option>
        </select>
        <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Kind">
          {(form.table === 'assets' ? ['Home', 'Car', 'Other'] : ['TFSA', 'RRSP', 'FHSA', 'RESP', 'Brokerage', 'Pension', 'Crypto', 'Other']).map((k) => <option key={k}>{k}</option>)}
        </select>
        <input className={input} placeholder="Name, for example Wealthsimple TFSA" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={input} type="number" step="0.01" inputMode="decimal" placeholder="What it is worth today" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
        <button type="submit" disabled={busy} className="w-full bg-accent text-accent-contrast rounded-xl py-2 font-medium">Add</button>
      </form>
    </div>
  );
}
