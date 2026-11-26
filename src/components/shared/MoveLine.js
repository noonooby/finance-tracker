import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { server } from '../../utils/server';
import { moveLines } from '../../utils/money';
import { showToast } from '../../utils/toast';
import { formatCurrency, formatDate, generateId } from '../../utils/helpers';
import { Picture } from './Picture';

// The accounts a saved line is on: where it was paid from or went to, and for a payment or transfer the other side.
export function sidesOf(t, { bankAccounts = [], creditCards = [] } = {}) {
  const out = [];
  const add = (type, id) => {
    if (id == null || id === '') return;
    const list = type === 'bank_account' ? bankAccounts : type === 'credit_card' ? creditCards : null;
    const a = list && list.find((x) => String(x.id) === String(id));
    if (a && !out.some((o) => o.ref === `${type}:${a.id}`)) out.push({ ref: `${type}:${a.id}`, name: a.name, type });
  };
  if (!t) return out;
  add(t.payment_method, t.payment_method_id);
  add('credit_card', t.card_id);
  add(t.transfer_to || 'bank_account', t.to_account_id);
  add('bank_account', t.from_account_id);
  return out;
}
const live = (t) => t && t.status !== 'undone' && t.status !== 'deleted' && t.type !== 'adjustment';
export const canMove = (t, accounts) => live(t) && sidesOf(t, accounts).length > 0;

// "Wrong account": one line, or every line that came from the same picture, goes to the account you pick.
//   line: the saved line. from: the account it is shown under, when the screen knows ('bank_account:ID').
//   transactions: every saved line, to find the others from the same picture.
export default function MoveLine({ line, from, transactions = [], bankAccounts = [], creditCards = [], onClose, onDone }) {
  const accounts = useMemo(() => ({ bankAccounts, creditCards }), [bankAccounts, creditCards]);
  const sides = sidesOf(line, accounts);
  const [side, setSide] = useState(from && sides.some((s) => s.ref === from) ? from : sides.length === 1 ? sides[0].ref : '');
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const type = side.split(':')[0];
  const same = useMemo(() => (line.from_screenshot && side
    ? transactions.filter((t) => live(t) && t.from_screenshot === line.from_screenshot && sidesOf(t, accounts).some((s) => s.ref === side)) : []), [transactions, line, side, accounts]);
  const group = all && same.length > 1 ? same : [line];
  const taken = new Set(group.flatMap((t) => sidesOf(t, accounts).map((s) => s.ref)));
  const choices = (type === 'credit_card' ? creditCards.filter((c) => !c.is_gift_card) : bankAccounts.filter((a) => a.account_type !== 'cash'))
    .map((a) => ({ ref: `${type}:${a.id}`, name: a.name, bank: a.institution })).filter((a) => !taken.has(a.ref));
  const nameOf = (ref) => (sides.find((s) => s.ref === ref) || {}).name || 'that account';

  const go = async (to, toName) => {
    setBusy(true);
    try {
      const moved = group.map((t) => ({ id: t.id, from: side }));
      await moveLines(moved, to);
      const back = async () => { try { await moveLines(moved.map((m) => ({ id: m.id, from: to })), side); await onDone(); showToast.success('Put back.'); } catch (e) { showToast.error(e.message); } };
      toast((t) => (
        <span className="flex items-center gap-3 text-sm">{moved.length === 1 ? 'Moved' : `${moved.length} lines moved`} to {toName}
          <button type="button" className="font-medium text-accent" onClick={() => { toast.dismiss(t.id); back(); }}>Undo</button>
        </span>
      ), { duration: 8000 });
      await onDone();
      onClose();
    } catch (e) { showToast.error(e.message); } finally { setBusy(false); }
  };
  const addNew = async (e) => {
    e.preventDefault();
    const n = name.trim().slice(0, 60);
    if (!n) return;
    setBusy(true);
    try {
      const id = generateId();
      const row = type === 'credit_card' ? { id, name: n, balance: 0, credit_limit: 0, created_at: new Date().toISOString() }
        : { id, name: n, balance: 0, account_type: 'checking', institution: '', created_at: new Date().toISOString() };
      const { error } = await server.from(type === 'credit_card' ? 'credit_cards' : 'bank_accounts').insert(row);
      if (error) throw new Error(error.message);
      await go(`${type}:${id}`, n);
    } catch (err) { showToast.error(err.message); setBusy(false); }
  };
  const chip = 'press px-3 py-2 rounded-full border border-line bg-surface text-sm font-medium disabled:opacity-50';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="Wrong account" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface border border-line p-4 space-y-4 page-enter">
        <div>
          <h2 className="text-lg font-semibold">Wrong account</h2>
          <p className="text-sm text-muted mt-1">{line.description || 'This line'} · {formatCurrency(Number(line.amount) || 0)} · {formatDate(line.date)}</p>
        </div>
        {line.from_screenshot && <Picture id={line.from_screenshot} label="The picture it came from" />}
        {sides.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Which account is wrong?</p>
            <div className="flex flex-wrap gap-2">
              {sides.map((s) => <button key={s.ref} type="button" className={`${chip} ${side === s.ref ? 'chip-on' : ''}`} onClick={() => { setSide(s.ref); setAll(false); }}>{s.name}</button>)}
            </div>
          </div>
        )}
        {side && same.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${chip} ${!all ? 'chip-on' : ''}`} onClick={() => setAll(false)}>Just this line</button>
            <button type="button" className={`${chip} ${all ? 'chip-on' : ''}`} onClick={() => setAll(true)}>All {same.length} lines from the same picture</button>
          </div>
        )}
        {side && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{group.length === 1 ? 'It is' : `These ${group.length} lines are`} under {nameOf(side)}. Which account {group.length === 1 ? 'does it' : 'do they'} belong to?</p>
            <div className="flex flex-wrap gap-2">
              {choices.map((a) => <button key={a.ref} type="button" disabled={busy} className={chip} onClick={() => go(a.ref, a.name)}>{a.name}{a.bank ? <span className="text-muted font-normal"> · {a.bank}</span> : null}</button>)}
              {!adding && <button type="button" disabled={busy} className="press px-3 py-2 rounded-full border border-dashed border-line text-sm font-medium text-accent" onClick={() => setAdding(true)}>A new account</button>}
            </div>
            {adding && (
              <form onSubmit={addNew} className="flex gap-2">
                <input className="flex-1 min-w-0 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base text-fg" aria-label="Name of the new account" placeholder="Name of the new account" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
                <button type="submit" disabled={busy || !name.trim()} className="press px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-50">Add and move</button>
              </form>
            )}
            <p className="text-xs text-muted">Both balances follow. A line dated before the day an account's balance was last seen is kept as history there and does not change it. You can undo this.</p>
          </div>
        )}
        <button type="button" className="press w-full py-2.5 rounded-xl border border-line text-sm font-medium" onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body
  );
}
