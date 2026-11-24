import React, { useMemo, useState } from 'react';
import { TrendingDown } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { payoffPlan } from '../utils/plans';
import { cardRate, PAYMENTS_PER_YEAR } from '../utils/finance';
import { formatCurrency } from '../utils/helpers';
import { Card, Section, Field, Stat, EmptyState } from './shared/ui';

// Paying debt down: which one to put extra money on, when each one ends, and what it saves. Nothing here moves money.
const monthLabel = (n, today) => new Date(today.getFullYear(), today.getMonth() + n, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
const round2 = (n) => Math.round(n * 100) / 100;

export default function Payoff() {
  const d = useFinanceData();
  const [extra, setExtra] = useState('');
  const [order, setOrder] = useState('rate');
  const [withMortgage, setWithMortgage] = useState(false);
  const today = useMemo(() => new Date(), []);

  const hasMortgage = (d.loans || []).some((l) => l.loan_type === 'mortgage' && Number(l.balance) > 0);
  const debts = useMemo(() => {
    const out = [];
    for (const l of d.loans || []) {
      if (!(Number(l.balance) > 0) || l.on_card_id || (l.loan_type === 'mortgage' && !withMortgage)) continue;
      // With no payment known there is nothing to plan from; it is named below instead.
      if (!(Number(l.payment_amount) > 0)) continue;
      const perYear = PAYMENTS_PER_YEAR[l.frequency || 'monthly'] || 12;
      out.push({ id: `loan:${l.id}`, name: l.name, balance: Number(l.balance), rate: Number(l.interest_rate) || 0, min: round2((Number(l.payment_amount) || 0) * perYear / 12) });
    }
    for (const c of d.creditCards || []) {
      const bal = Number(c.balance) || 0;
      if (c.is_gift_card || !(bal > 0)) continue;
      // A card that pays itself in full each month carries no debt.
      if (c.connected_payment_source && (c.autopay_mode || 'statement') === 'statement') continue;
      out.push({ id: `card:${c.id}`, name: c.name, balance: bal, rate: cardRate(c, today), min: Number(c.minimum_payment) || Math.min(bal, Math.max(10, round2(bal * 0.03))) });
    }
    return out;
  }, [d.loans, d.creditCards, withMortgage, today]);

  const more = Math.max(0, Number(extra) || 0);
  const plan = useMemo(() => payoffPlan(debts, more, order, true), [debts, more, order]);
  const base = useMemo(() => payoffPlan(debts, 0, order, false), [debts, order]);
  const other = useMemo(() => payoffPlan(debts, more, order === 'rate' ? 'small' : 'rate', true), [debts, more, order]);
  const saved = plan.months != null && base.months != null ? round2(base.interest - plan.interest) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paying debt down</h1>
        <p className="text-sm text-muted mt-1">Which debt to put extra money on, when each one ends and what it saves. It works from the balances, rates and payments already in the app.</p>
      </div>

      {debts.length === 0 ? (
        <Card><EmptyState icon={TrendingDown} title="No debt to plan" text="Loans with a balance and cards that carry a balance show here." /></Card>
      ) : (
        <>
          <Card className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Extra you can pay each month" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" value={extra} onChange={(e) => setExtra(e.target.value)} />
              <Field label="Put the extra on" as="select" value={order} onChange={(e) => setOrder(e.target.value)}>
                <option value="rate">The highest interest first (costs least)</option>
                <option value="small">The smallest balance first (clears debts soonest)</option>
              </Field>
            </div>
            {hasMortgage && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withMortgage} onChange={(e) => setWithMortgage(e.target.checked)} /> Include the mortgage</label>}
          </Card>

          <Card>
            {plan.months == null ? (
              <p className="text-sm text-negative">With these payments {plan.stuck.join(', ')} would never be paid off: the payment does not cover the interest. Add to the extra, or raise that payment.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Debt free" value={monthLabel(plan.months, today)} sub={`${plan.months} ${plan.months === 1 ? 'month' : 'months'}`} />
                <Stat label="Interest from here" value={formatCurrency(plan.interest)} />
                <Stat label="Saved" value={saved != null && saved > 0 ? formatCurrency(saved) : formatCurrency(0)} sub="against usual payments" tone={saved > 0 ? 'positive' : undefined} />
              </div>
            )}
            {plan.months != null && base.months != null && base.months > plan.months && (
              <p className="text-xs text-muted mt-3">With the usual payments only, the last debt ends in {monthLabel(base.months, today)}: {base.months - plan.months} {base.months - plan.months === 1 ? 'month' : 'months'} later.</p>
            )}
            {plan.months != null && base.months == null && <p className="text-xs text-muted mt-3">With the usual payments only, {base.stuck.join(', ')} would never be paid off.</p>}
            {plan.months != null && other.months != null && Math.abs(other.interest - plan.interest) >= 1 && (
              <p className="text-xs text-muted mt-1">The other order would {other.interest > plan.interest ? `cost ${formatCurrency(other.interest - plan.interest)} more` : `cost ${formatCurrency(plan.interest - other.interest)} less`} in interest.</p>
            )}
          </Card>

          <Section title="In this order">
            <Card padded={false} className="divide-y divide-line">
              {[...debts].sort((a, b) => (order === 'small' ? a.balance - b.balance || b.rate - a.rate : b.rate - a.rate || a.balance - b.balance)).map((x, i) => {
                const done = plan.cleared.find((c) => c.id === x.id);
                return (
                  <div key={x.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="shrink-0 w-7 h-7 rounded-full bg-accent-soft text-accent text-sm font-semibold grid place-items-center">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate">{x.name}</span>
                      <span className="block text-xs text-muted">{x.rate}% · {formatCurrency(x.min)} a month{done ? ` · ends ${monthLabel(done.month, today)}` : ' · never ends at this payment'}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatCurrency(x.balance)}</span>
                  </div>
                );
              })}
            </Card>
            {(d.loans || []).filter((l) => Number(l.balance) > 0 && !l.on_card_id && !(Number(l.payment_amount) > 0)).length > 0 && (
              <p className="text-xs text-muted mt-2">Left out because the payment is not known yet: {(d.loans || []).filter((l) => Number(l.balance) > 0 && !l.on_card_id && !(Number(l.payment_amount) > 0)).map((l) => l.name).join(', ')}.</p>
            )}
            <p className="text-xs text-muted mt-2">A card with no minimum payment entered is taken at 3% of its balance, $10 at least. When a debt ends, what you paid on it moves to the next one.</p>
          </Section>
        </>
      )}
    </div>
  );
}
