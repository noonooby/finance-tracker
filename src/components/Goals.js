import React, { useEffect, useMemo, useState } from 'react';
import { ask } from '../utils/confirm';
import { Target } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { server } from '../utils/server';
import { showToast } from '../utils/toast';
import { goalsProgress, goalsThisMonth } from '../utils/plans';
import { formatCurrency, parseDay } from '../utils/helpers';
import { Card, Section, Button, Field, Badge, EmptyState } from './shared/ui';

// Savings goals: an amount, an optional date and where the money is kept. The app never moves money for a goal:
// it reads the balance of the account the goal is kept in, or the amount you type.
const day = (d) => { const x = parseDay(d); return x ? x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };

function GoalForm({ goal, places, onSave, onCancel, saving }) {
  const [v, setV] = useState({ name: goal.name || '', target: goal.target ?? '', date: goal.date || '', kept_in: goal.kept_in || '', saved: goal.saved ?? '' });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="What it is for" value={v.name} onChange={set('name')} required maxLength={60} />
        <Field label="Amount to reach" type="number" inputMode="decimal" step="0.01" min="0" value={v.target} onChange={set('target')} required />
        <Field label="By when (optional)" type="date" value={v.date} onChange={set('date')} />
        <Field label="Kept in" as="select" value={v.kept_in} onChange={set('kept_in')} hint="The balance of this account counts toward the goal.">
          <option value="">No account: I type the amount</option>
          {places.map((p) => <option key={p.ref} value={p.ref}>{p.name}</option>)}
        </Field>
        {!v.kept_in && <Field label="Saved so far" type="number" inputMode="decimal" step="0.01" min="0" value={v.saved} onChange={set('saved')} />}
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={saving}>Save</Button>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

export default function Goals() {
  const d = useFinanceData();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // goal id, or 'new'
  const [saving, setSaving] = useState(false);
  const load = async () => {
    const { data, error } = await server.from('goals').select('*');
    if (error) showToast.error(error.message);
    setGoals(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const places = useMemo(() => [
    ...(d.bankAccounts || []).map((a) => ({ ref: `bank_account:${a.id}`, name: a.name })),
    ...(d.investments || []).map((a) => ({ ref: `investment:${a.id}`, name: a.name })),
  ], [d.bankAccounts, d.investments]);
  const today = useMemo(() => new Date(), []);
  const list = useMemo(() => goalsProgress(goals, { bankAccounts: d.bankAccounts, investments: d.investments }, today), [goals, d.bankAccounts, d.investments, today]);
  const monthly = goalsThisMonth(list);

  const save = async (v, goal) => {
    const row = { name: String(v.name).trim().slice(0, 60), target: Math.round(Number(v.target) * 100) / 100, date: v.date || null, kept_in: v.kept_in || null,
      saved: v.kept_in ? null : Math.round((Number(v.saved) || 0) * 100) / 100 };
    setSaving(true);
    const { error } = goal
      ? await server.from('goals').update(row).eq('id', goal.id)
      : await server.from('goals').insert({ ...row, created_at: new Date().toISOString() });
    setSaving(false);
    if (error) return showToast.error(error.message);
    setEditing(null);
    load();
  };
  const remove = async (g) => {
    if (!(await ask(`Remove the goal ${g.name}? No money is moved.`))) return;
    const { error } = await server.from('goals').delete().eq('id', g.id);
    if (error) return showToast.error(error.message);
    setEditing(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Savings goals</h1>
        <p className="text-sm text-muted mt-1">What you are saving for and how far along it is. A goal reads the balance of the account it is kept in; you move the money yourself.</p>
      </div>

      <Section title="Goals" action={monthly > 0 ? <span className="text-xs text-muted">{formatCurrency(monthly)} a month to stay on time</span> : null}>
        <Card padded={false} className="divide-y divide-line">
          {!loading && list.length === 0 && editing !== 'new' && (
            <EmptyState icon={Target} title="No goals yet" text="Add one: a trip, a down payment, an emergency fund." />
          )}
          {list.map((g) => (editing === g.id ? (
            <div key={g.id} className="p-4">
              <GoalForm goal={g} places={places} saving={saving} onCancel={() => setEditing(null)} onSave={(v) => save(v, g)} />
              <div className="flex gap-2 mt-3 pt-3 border-t border-line">
                <Button size="sm" variant="secondary" onClick={() => remove(g)}>Remove goal</Button>
              </div>
            </div>
          ) : (
            <button key={g.id} type="button" onClick={() => setEditing(g.id)} className="row press w-full px-4 py-3 text-left hover:bg-surface-2 space-y-1.5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium truncate">{g.name}</span>
                <span className="tabular-nums text-sm">{formatCurrency(g.saved)} <span className="text-xs text-muted">of {formatCurrency(g.target)}</span></span>
              </span>
              <span className="block relative h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <span className={`absolute inset-y-0 left-0 rounded-full ${g.done ? 'bg-positive' : g.late ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${Math.min(100, g.pct * 100)}%` }} />
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {g.done ? <Badge tone="positive">Reached</Badge> : <span>{formatCurrency(g.left)} to go</span>}
                {!g.done && g.date && <span>· by {day(g.date)}</span>}
                {!g.done && g.late && <Badge tone="warning">Date passed</Badge>}
                {!g.done && !g.late && g.monthly > 0 && <span>· {formatCurrency(g.monthly)} a month</span>}
                {g.missing && <Badge tone="warning">Its account was removed</Badge>}
              </span>
            </button>
          )))}
          {editing === 'new' && (
            <div className="p-4">
              <GoalForm goal={{}} places={places} saving={saving} onCancel={() => setEditing(null)} onSave={(v) => save(v)} />
            </div>
          )}
        </Card>
        {editing !== 'new' && <Button variant="secondary" className="mt-3" onClick={() => setEditing('new')}>Add a goal</Button>}
      </Section>
    </div>
  );
}
