import React, { useMemo, useState } from 'react';
import { Repeat, Bell, BellOff } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { server } from '../utils/server';
import { showToast } from '../utils/toast';
import { findRecurring, rollForward, billPaid } from '../utils/spending';
import { mkey } from '../utils/categoryRules';
import { priceChanges, yearlyCost } from '../utils/plans';
import ThroughNote from './shared/ThroughNote';
import { formatCurrency, parseDay } from '../utils/helpers';
import { Card, Section, Button, Field, Badge, EmptyState } from './shared/ui';

// Bills that repeat. The app finds them in your purchases (the same merchant at a steady interval and amount) and
// offers each once; you track it or turn it down. Tracked bills show in the next 30 days on Home, count in the month end,
// and get reminders. Everything about a bill can be changed, and a bill is never paid by the app: you record the payment.
const FREQ = { weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month', quarterly: 'Every 3 months', yearly: 'Every year' };
const PER_MONTH = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
const day = (d) => { const x = parseDay(d); return x ? x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
const today = () => new Date().toLocaleDateString('en-CA');

function BillForm({ bill, onSave, onCancel, saving }) {
  const [v, setV] = useState({ name: bill.name || '', amount: bill.amount ?? '', frequency: bill.frequency || 'monthly', next_date: bill.next_date || today(), remind: bill.remind !== false, paid_through: bill.paid_through || '', fee_percent: bill.fee_percent ? String(bill.fee_percent) : '' });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name" value={v.name} onChange={set('name')} required maxLength={60} />
        <Field label="Usual amount" type="number" inputMode="decimal" step="0.01" min="0" value={v.amount} onChange={set('amount')} required />
        <Field label="How often" as="select" value={v.frequency} onChange={set('frequency')}>
          {Object.entries(FREQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Field>
        <Field label="Next due" type="date" value={v.next_date} onChange={set('next_date')} required />
        <Field label="Paid through (optional)" value={v.paid_through} onChange={set('paid_through')} maxLength={40} placeholder="For example Chexy" />
        <Field label="Its fee %" type="number" inputMode="decimal" step="0.01" min="0" max="10" value={v.fee_percent} onChange={set('fee_percent')} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.remind} onChange={set('remind')} /> Remind me (when reminders are on in Settings)</label>
      <div className="flex gap-2">
        <Button type="submit" loading={saving}>Save</Button>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

export default function Bills() {
  const { bills = [], setBills, transactions, creditCards = [] } = useFinanceData();
  const [editing, setEditing] = useState(null); // bill id, or 'new'
  const [saving, setSaving] = useState(false);
  const now = useMemo(() => new Date(), []);
  const found = useMemo(() => findRecurring(transactions, bills, now), [transactions, bills, now]);
  const active = bills.filter((b) => b.status === 'active').map((b) => ({ ...b, due: rollForward(b.next_date, b.frequency, now) }))
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const ignored = bills.filter((b) => b.status === 'ignored');
  const changed = useMemo(() => priceChanges(bills, transactions), [bills, transactions]);
  const yearly = active.reduce((s, b) => s + yearlyCost(b), 0);
  const monthly = active.reduce((s, b) => s + (Number(b.amount) || 0) * (PER_MONTH[b.frequency] || 1), 0);

  const insert = async (row) => {
    const { data, error } = await server.from('bills').insert(row).select().single();
    if (error) { showToast.error(error.message); return null; }
    setBills([...bills.filter((x) => x.id !== data.id), data]);
    return data;
  };
  const update = async (b, change) => {
    const { error } = await server.from('bills').update(change).eq('id', b.id);
    if (error) { showToast.error(error.message); return false; }
    setBills(bills.map((x) => (x.id === b.id ? { ...x, ...change } : x)));
    return true;
  };
  const remove = async (b) => {
    const { error } = await server.from('bills').delete().eq('id', b.id);
    if (error) return showToast.error(error.message);
    setBills(bills.filter((x) => x.id !== b.id));
  };
  const clean = (v) => ({ name: String(v.name).trim().slice(0, 60), amount: Math.round(Number(v.amount) * 100) / 100, frequency: v.frequency, next_date: v.next_date, remind: !!v.remind,
    paid_through: String(v.paid_through || '').trim().slice(0, 40) || null, fee_percent: Number(v.fee_percent) || 0 });
  // The same check for a new bill and an edited one. A bill you added yourself is matched by its name, so its key follows the name;
  // one found in your history keeps the merchant it was found by.
  const checked = (v, bill) => {
    const c = clean(v);
    const key = bill && bill.source === 'found' && bill.key ? bill.key : mkey(c.name);
    if (!(c.amount > 0) || key.length < 3) { showToast.error('Enter a name with at least 3 letters and an amount above zero.'); return null; }
    return { ...c, key };
  };

  const track = (f) => insert({ key: f.key, name: f.name, amount: f.amount, frequency: f.frequency, next_date: f.next_date, category_id: f.category_id, category_name: f.category_name,
    payment_method: f.payment_method, payment_method_id: f.payment_method_id, payment_method_name: f.payment_method_name, status: 'active', remind: true, source: 'found' });
  const turnDown = (f) => insert({ key: f.key, name: f.name, status: 'ignored', source: 'found' });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bills</h1>
        <p className="text-sm text-muted mt-1">Payments that repeat. Tracked bills show on Home in the next 30 days, count in the month end and get reminders. You still record each payment.</p>
      </div>

      {found.length > 0 && (
        <Section title="Found in your purchases">
          <Card padded={false} className="divide-y divide-line">
            {found.map((f) => (
              <div key={f.key} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{f.name}</div>
                    <div className="text-xs text-muted">{FREQ[f.frequency]} · seen {f.count} times · last {day(f.last_date)}{f.payment_method_name ? ` · ${f.payment_method_name}` : ''}</div>
                    <div className="text-xs text-muted">Next expected {day(f.next_date)}</div>
                  </div>
                  <div className="font-semibold tabular-nums">{formatCurrency(f.amount)}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => track(f)}>Track</Button>
                  <Button size="sm" variant="secondary" onClick={() => turnDown(f)}>Not a bill</Button>
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {changed.length > 0 && (
        <Section title="Price changes">
          <Card padded={false} className="divide-y divide-line">
            {changed.map((c) => (
              <div key={c.bill.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.bill.name}</div>
                    <div className="text-xs text-muted">Charged {formatCurrency(c.now)} on {day(c.date)}. The usual amount is {formatCurrency(c.was)}.</div>
                  </div>
                  <Badge tone={c.up ? 'warning' : 'positive'}>{c.up ? 'Up' : 'Down'} {formatCurrency(Math.abs(c.now - c.was))}</Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => update(c.bill, { amount: c.now, price_seen: c.now })}>Use {formatCurrency(c.now)} from now on</Button>
                  <Button size="sm" variant="secondary" onClick={() => update(c.bill, { price_seen: c.now })}>Keep {formatCurrency(c.was)}</Button>
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Tracked" action={active.length ? <span className="text-xs text-muted">about {formatCurrency(monthly)} a month · {formatCurrency(yearly)} a year</span> : null}>
        <Card padded={false} className="divide-y divide-line">
          {active.length === 0 && editing !== 'new' && (
            <EmptyState icon={Repeat} title="No bills tracked yet" text="Track one found above, or add one yourself." />
          )}
          {active.map((b) => {
            const paid = billPaid(b, transactions, b.due);
            return editing === b.id ? (
              <div key={b.id} className="p-4">
                <BillForm bill={b} saving={saving} onCancel={() => setEditing(null)} onSave={async (v) => { const c = checked(v, b); if (!c) return; setSaving(true); const ok = await update(b, c); setSaving(false); if (ok) setEditing(null); }} />
                <div className="flex gap-2 mt-3 pt-3 border-t border-line">
                  <Button size="sm" variant="secondary" onClick={() => { update(b, { status: 'ignored' }); setEditing(null); }}>Stop tracking</Button>
                </div>
              </div>
            ) : (
              <button key={b.id} type="button" onClick={() => setEditing(b.id)} className="row press w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{b.name}</span>
                  <span className="block text-xs text-muted truncate">{FREQ[b.frequency]} · next {day(b.due)}{b.payment_method_name ? ` · ${b.payment_method_name}` : ''}</span>
                  <ThroughNote item={b} amount={b.amount} cards={creditCards} />
                </span>
                {paid && <Badge tone="positive">Recorded</Badge>}
                {b.remind === false ? <BellOff size={14} className="text-muted" aria-label="No reminder" /> : <Bell size={14} className="text-muted" aria-label="Reminder on" />}
                <span className="font-semibold tabular-nums">{formatCurrency(b.amount)}</span>
              </button>
            );
          })}
          {editing === 'new' && (
            <div className="p-4">
              <BillForm bill={{}} saving={saving} onCancel={() => setEditing(null)} onSave={async (v) => {
                const c = checked(v);
                if (!c) return;
                setSaving(true); const ok = await insert({ ...c, status: 'active', source: 'added' }); setSaving(false);
                if (ok) setEditing(null);
              }} />
            </div>
          )}
        </Card>
        {editing !== 'new' && <Button variant="secondary" className="mt-3" onClick={() => setEditing('new')}>Add a bill</Button>}
      </Section>

      {ignored.length > 0 && (
        <Section title="Not bills">
          <Card padded={false} className="divide-y divide-line">
            {ignored.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-sm truncate">{b.name}</span>
                <button type="button" className="text-xs font-medium text-accent" onClick={() => remove(b)}>Offer again</button>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </div>
  );
}
