import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { server } from '../utils/server';
import { recordTransfer } from '../utils/money';
import { formatCurrency, generateId, localDate } from '../utils/helpers';
import { freshness } from '../utils/finance';
import { showToast } from '../utils/toast';
import UpdateValue from './position/UpdateValue';

// Investments (RRSP, TFSA, brokerage) and property (home, car): dated values, updated when you check them.
export default function Investments({ darkMode }) {
  const d = useFinanceData();
  const [form, setForm] = useState({ table: 'investments', name: '', kind: 'TFSA', balance: '' });
  const [move, setMove] = useState({ to: '', from: '', amount: '' });
  const [busy, setBusy] = useState(false);
  const card = `rounded-2xl border p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`;
  const input = `w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`;
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
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
    if (!window.confirm(`Remove ${row.name}? Its past values stay in the net worth history.`)) return;
    const { error } = await server.from(table).delete().eq('id', row.id);
    if (error) return showToast.error(error.message);
    await d.loadAllData();
  };

  const List = ({ title, table, rows, kind }) => (
    <section className={card}>
      <h2 className="font-semibold">{title}</h2>
      {!rows.length && <p className={`text-sm ${muted}`}>None yet.</p>}
      <ul className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
        {rows.map((r) => {
          const f = freshness(r.balance_as_of);
          return (
            <li key={r.id} className="py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.name}</div>
                <div className={`text-xs ${f.stale ? 'text-amber-600 dark:text-amber-400' : muted}`}>{r.kind} · value {r.balance_as_of ? `as of ${f.label}` : 'never updated'}{f.stale ? ' · out of date' : ''}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">{formatCurrency(r.balance)}</div>
                <UpdateValue line={{ kind, id: r.id, name: r.name }} signed={Number(r.balance) || 0} accounts={accounts} onDone={d.loadAllData} darkMode={darkMode} />
              </div>
              <button type="button" onClick={() => remove(table, r)} aria-label={`Remove ${r.name}`} className={muted}><Trash2 size={16} /></button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Investments and property</h1>
      <p className={`text-sm ${muted}`}>Enter what each one is worth when you check it. Money you put in from a bank account is recorded as a contribution; growth is the difference when you update the value.</p>
      <List title="Investments" table="investments" rows={d.investments} kind="investment" />
      <List title="Property" table="assets" rows={d.assets} kind="asset" />

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
            <option value="cash_in_hand">Cash in hand</option>
          </select>
          <input className={input} type="number" step="0.01" inputMode="decimal" placeholder="Amount" value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} required />
          <button type="submit" disabled={busy} className="w-full bg-blue-600 text-white rounded-lg py-2 font-medium">Record contribution</button>
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
        <button type="submit" disabled={busy} className="w-full bg-blue-600 text-white rounded-lg py-2 font-medium">Add</button>
      </form>
    </div>
  );
}
