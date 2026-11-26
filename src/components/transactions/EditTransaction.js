import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { server } from '../../utils/server';
import { recordExpense, replaceTransaction } from '../../utils/money';
import { showToast } from '../../utils/toast';
import { Button, Field } from '../shared/ui';
import MoveLine, { canMove } from '../shared/MoveLine';

// Changing a saved line. The description, category and notes change in place. For a plain purchase the amount, date
// and account can change too: the server takes the old line back and records the new one in one step, so the balances
// always match. Other kinds of line (payments, transfers, split or foreign purchases) keep their money as it was.
export const plainPurchase = (t, creditCards = []) => !!t && t.type === 'expense' && t.status !== 'undone' && t.status !== 'deleted'
  && !t.loan_id && !t.gift_card_id && !t.original_currency && !(Array.isArray(t.splits) && t.splits.length)
  && (t.payment_method === 'bank_account' || t.payment_method === 'credit_card') && t.payment_method_id != null
  && !(t.payment_method === 'credit_card' && (creditCards.find((c) => String(c.id) === String(t.payment_method_id)) || {}).is_gift_card);

export default function EditTransaction({ transaction: t, transactions = [], categories = [], bankAccounts = [], creditCards = [], loans = [], onClose, onSaved }) {
  const [moving, setMoving] = useState(false);
  const money = plainPurchase(t, creditCards);
  const split = Array.isArray(t.splits) && t.splits.length > 0;
  const [v, setV] = useState({ description: t.description || '', notes: t.notes || '', category_id: t.category_id ? String(t.category_id) : '',
    amount: String(t.amount ?? ''), date: String(t.date || '').slice(0, 10), source: `${t.payment_method}:${t.payment_method_id}` });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const pool = categories.filter((c) => (t.type === 'income' ? c.is_income : !c.is_income));
  const sources = [
    ...bankAccounts.map((a) => ({ ref: `bank_account:${a.id}`, name: a.name })),
    ...creditCards.filter((c) => !c.is_gift_card).map((c) => ({ ref: `credit_card:${c.id}`, name: c.name })),
  ];

  const save = async (e) => {
    e.preventDefault();
    const description = v.description.trim().slice(0, 120);
    if (!description) return showToast.error('Enter a description.');
    const cat = pool.find((c) => String(c.id) === v.category_id);
    const plain = { description, notes: v.notes.trim() || null, ...(split ? {} : { category_id: cat ? cat.id : null, category_name: cat ? cat.name : null }) };
    const moved = money && (Number(v.amount) !== Number(t.amount) || v.date !== String(t.date || '').slice(0, 10) || v.source !== `${t.payment_method}:${t.payment_method_id}`);
    setSaving(true);
    try {
      if (moved) {
        if (!sources.some((s) => s.ref === v.source)) throw new Error('Choose the account it was paid from.');
        await replaceTransaction(t.id, () => recordExpense({ amount: v.amount, source: v.source, date: v.date, ...plain,
          extra: { pending: t.pending || undefined, edited_from: t.id } }, { bankAccounts, creditCards, loans }));
      } else {
        const { error } = await server.from('transactions').update(plain).eq('id', t.id);
        if (error) throw error;
      }
      showToast.success('Saved.');
      await onSaved();
      onClose();
    } catch (err) {
      showToast.error(err.message);
    } finally { setSaving(false); }
  };

  if (moving) return <MoveLine line={t} transactions={transactions} bankAccounts={bankAccounts} creditCards={creditCards} onClose={() => setMoving(false)} onDone={async () => { await onSaved(); onClose(); }} />;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="Change this line" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface border border-line p-4 space-y-3">
        <h2 className="text-lg font-semibold">Change this line</h2>
        <Field label="Description" value={v.description} onChange={set('description')} required maxLength={120} />
        {!split && pool.length > 0 && (
          <Field label="Category" as="select" value={v.category_id} onChange={set('category_id')}>
            <option value="">No category</option>
            {pool.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Field>
        )}
        {money ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount" type="number" inputMode="decimal" step="0.01" min="0" value={v.amount} onChange={set('amount')} required />
              <Field label="Date" type="date" value={v.date} onChange={set('date')} required />
            </div>
            <Field label="Paid from" as="select" value={v.source} onChange={set('source')}>
              {!sources.some((s) => s.ref === v.source) && <option value={v.source}>An account that was removed</option>}
              {sources.map((s) => <option key={s.ref} value={s.ref}>{s.name}</option>)}
            </Field>
          </>
        ) : (
          <p className="text-xs text-muted">The amount and date of this kind of line stay as they are. To change them, delete the line and record it again.</p>
        )}
        <Field label="Notes" value={v.notes} onChange={set('notes')} maxLength={200} />
        {canMove(t, { bankAccounts, creditCards }) && <button type="button" className="press text-sm font-medium text-accent" onClick={() => setMoving(true)}>On the wrong account? Move it</button>}
        <div className="flex gap-2">
          <Button type="submit" loading={saving}>Save</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>,
    document.body
  );
}
