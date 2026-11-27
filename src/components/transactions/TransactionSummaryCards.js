import React from 'react';
import { Card, Num } from '../shared/ui';

// What the lines shown add up to: money in, money spent, and payments on cards and loans.
export default function TransactionSummaryCards({ totals, formatCurrency }) {
  // A large total drops its cents so the whole figure fits on a phone.
  const whole = (v) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v || 0);
  const fit = (v) => (Math.abs(Number(v) || 0) >= 10000 ? whole(v) : formatCurrency(v));
  const cell = (label, value, tone) => (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-base font-semibold tabular-nums truncate ${tone}`}><Num value={value} format={fit} /></div>
    </div>
  );
  return (
    <Card className="grid grid-cols-3 divide-x divide-line">
      {cell('In', totals.income, 'text-positive')}
      {cell('Spent', totals.expense, 'text-fg')}
      {cell('Payments', totals.payment, 'text-accent')}
    </Card>
  );
}
