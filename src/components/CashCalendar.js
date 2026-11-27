import React, { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { position, upcoming } from '../utils/finance';
import { dueDatesBetween, dayOfMonth } from '../utils/spending';
import { cashCalendar } from '../utils/plans';
import { formatCurrency, parseDay } from '../utils/helpers';
import { Card, Section, Stat, EmptyState } from './shared/ui';

// The weeks ahead, day by day: what comes in, what goes out of your accounts, and what is left after each day.
const day = (d) => { const x = parseDay(d); return x ? x.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : ''; };
const iso = (d) => d.toLocaleDateString('en-CA');

export default function CashCalendar() {
  const d = useFinanceData();
  const [days, setDays] = useState(45);
  const today = useMemo(() => new Date(), []);
  const cal = useMemo(() => {
    const p = position({ bankAccounts: d.bankAccounts, creditCards: d.creditCards, loans: d.loans, investments: d.investments, assets: d.assets }, today);
    const items = upcoming({ creditCards: d.creditCards, loans: d.loans, bankAccounts: d.bankAccounts, bills: d.bills, transactions: d.transactions }, today, days);
    const from = iso(today), to = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));
    const pay = (d.incomeSchedules || []).filter((s) => s.is_active !== false && s.next_date).map((s) => {
      let dates = dueDatesBetween(s.next_date, s.frequency || 'monthly', dayOfMonth(s.start_date) || dayOfMonth(s.next_date), from, to);
      if (s.recurring_duration_type === 'until_date' && s.recurring_until_date) dates = dates.filter((x) => x <= String(s.recurring_until_date).slice(0, 10));
      if (s.recurring_duration_type === 'occurrences' && s.recurring_occurrences_total) dates = dates.slice(0, Math.max(0, s.recurring_occurrences_total - (s.recurring_occurrences_completed || 0)));
      return { name: s.source || 'Pay', amount: Number(s.amount) || 0, dates };
    });
    return { ...cashCalendar({ items, pay, liquid: p.liquid }, today), start: p.liquid };
  }, [d, days, today]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">The weeks ahead</h1>
        <p className="text-sm text-muted mt-1">Pay coming in and payments going out of your accounts, day by day, with what is left after each day. Everyday spending is not guessed.</p>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="In your accounts today" value={formatCurrency(cal.start)} />
          <Stat label="Lowest point" value={formatCurrency(cal.lowest.balance)} sub={cal.lowest.balance < cal.start ? day(cal.lowest.date) : 'today'} tone={cal.lowest.balance < 0 ? 'negative' : undefined} />
        </div>
        {cal.lowest.balance < 0 && <p className="text-sm text-negative mt-3">On {day(cal.lowest.date)} there would be {formatCurrency(-cal.lowest.balance)} too little. Move a payment, or move money in before then.</p>}
      </Card>

      <Section title={`Next ${days} days`} action={
        <select aria-label="How far ahead" value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-xs rounded-xl border border-line bg-surface px-2 py-1 text-fg">
          <option value={30}>30 days</option><option value={45}>45 days</option><option value={90}>90 days</option>
        </select>}>
        <Card padded={false} className="divide-y divide-line">
          {cal.days.length === 0 && <EmptyState icon={CalendarDays} title="Nothing coming" text="Pay schedules, bills, card and loan payments show here." />}
          {cal.days.map((x) => (
            <div key={x.date} className="px-4 py-3 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">{day(x.date)}</span>
                <span className={`text-xs tabular-nums ${x.balance < 0 ? 'text-negative font-medium' : 'text-muted'}`}>{formatCurrency(x.balance)} left</span>
              </div>
              {x.entries.map((e, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{e.name} <span className="text-xs text-muted">{e.note}</span></span>
                  <span className={`tabular-nums shrink-0 ${e.amount > 0 ? 'text-positive' : e.amount === 0 ? 'text-muted' : ''}`}>{e.amount > 0 ? '+' : ''}{e.amount === 0 ? 'no cash' : formatCurrency(e.amount)}</span>
                </div>
              ))}
            </div>
          ))}
        </Card>
      </Section>
    </div>
  );
}
