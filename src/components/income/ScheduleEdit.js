import React, { useState } from 'react';
import { X } from 'lucide-react';
import { server } from '../../utils/server';
import { payParts } from '../../utils/money';
import { showToast } from '../../utils/toast';
import { Button, Field } from '../shared/ui';

// Changing a pay schedule: who it is from, how much, how often, the next pay day and the accounts it lands in.
// Pay already deposited stays as it is; the change applies from the next pay day.
const FREQ = { weekly: 'Every week', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Every month', bimonthly: 'Every 2 months', quarterly: 'Every 3 months', yearly: 'Every year' };

export default function ScheduleEdit({ schedule, bankAccounts = [], onSaved, onCancel }) {
  const [v, setV] = useState({ source: schedule.source || '', amount: String(schedule.amount ?? ''), frequency: schedule.frequency || 'biweekly',
    next_date: String(schedule.next_date || '').slice(0, 10), deposit_account_id: schedule.deposit_account_id ? String(schedule.deposit_account_id) : '',
    auto_deposit: schedule.auto_deposit !== false,
    splits: (schedule.splits || []).map((s) => ({ account_id: String(s.account_id), amount: String(s.amount) })) });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setSplit = (i, change) => setV({ ...v, splits: v.splits.map((x, j) => (j === i ? { ...x, ...change } : x)) });

  const save = async (e) => {
    e.preventDefault();
    if (v.splits.some((s) => !s.account_id || !(Number(s.amount) > 0))) return showToast.error('Finish each extra account (an amount and an account), or remove it.');
    setSaving(true);
    try {
      const parts = payParts(v.amount, v.deposit_account_id, v.splits, bankAccounts);
      const next = v.next_date;
      const row = { source: v.source.trim().slice(0, 60), amount: Math.round(Number(v.amount) * 100) / 100, frequency: v.frequency, next_date: next,
        deposit_target: 'bank', deposit_account_id: parts[0].id, auto_deposit: v.auto_deposit,
        splits: parts.slice(1).map((p) => ({ account_id: p.id, amount: p.amount })),
        // A new pay day becomes the day later dates are counted from.
        ...(next !== String(schedule.next_date || '').slice(0, 10) ? { start_date: next } : {}),
        updated_at: new Date().toISOString() };
      const { error } = await server.from('income_schedules').update(row).eq('id', schedule.id);
      if (error) throw error;
      showToast.success('Saved. It applies from the next pay day.');
      await onSaved();
    } catch (err) {
      showToast.error(err.message);
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={save} className="space-y-3 mt-3 pt-3 border-t border-line">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Who pays" value={v.source} onChange={set('source')} required maxLength={60} />
        <Field label="Amount each time" type="number" inputMode="decimal" step="0.01" min="0" value={v.amount} onChange={set('amount')} required />
        <Field label="How often" as="select" value={v.frequency} onChange={set('frequency')}>
          {Object.entries(FREQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Field>
        <Field label="Next pay day" type="date" value={v.next_date} onChange={set('next_date')} required />
        <Field label="Goes into" as="select" value={v.deposit_account_id} onChange={set('deposit_account_id')} required className="sm:col-span-2">
          <option value="">Choose an account</option>
          {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Field>
      </div>
      {v.splits.map((sp, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="Amount" aria-label={`Amount for extra account ${i + 1}`}
            value={sp.amount} onChange={(e) => setSplit(i, { amount: e.target.value })} className="w-28 px-3 py-2 border border-line bg-surface text-fg rounded-xl" />
          <select aria-label={`Extra account ${i + 1}`} value={sp.account_id} onChange={(e) => setSplit(i, { account_id: e.target.value })}
            className="flex-1 min-w-0 px-3 py-2 border border-line bg-surface text-fg rounded-xl">
            <option value="">To which account</option>
            {bankAccounts.filter((a) => String(a.id) !== String(v.deposit_account_id) && !v.splits.some((x, j) => j !== i && String(x.account_id) === String(a.id)))
              .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button type="button" aria-label={`Remove extra account ${i + 1}`} className="text-muted p-1" onClick={() => setV({ ...v, splits: v.splits.filter((_, j) => j !== i) })}><X size={16} /></button>
        </div>
      ))}
      {v.splits.length > 0 && <p className="text-xs text-muted">The rest goes to the account chosen above.</p>}
      {bankAccounts.length > 1 && v.splits.length < 2 && (
        <button type="button" className="text-sm font-medium text-accent" onClick={() => setV({ ...v, splits: [...v.splits, { account_id: '', amount: '' }] })}>Send part of it to another account</button>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.auto_deposit} onChange={set('auto_deposit')} /> Add it by itself on each pay day</label>
      <div className="flex gap-2">
        <Button type="submit" loading={saving}>Save</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
