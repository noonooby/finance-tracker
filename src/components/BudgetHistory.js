import React, { useMemo } from 'react';
import { useFinanceData } from '../hooks/useFinanceData';
import { budgetMonth, monthOf, prevMonth } from '../utils/spending';
import { formatCurrency } from '../utils/helpers';

// Each budget over the last six months, worked out from the transactions themselves (split purchases count per part,
// refunds count back), so the history is always current, even for months before the budget was set.
const label = (m) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString(undefined, { month: 'short' });

export default function BudgetHistory({ categories = [], categoryBudgets = {} }) {
  const { transactions } = useFinanceData();
  const months = useMemo(() => { const now = monthOf(); return [5, 4, 3, 2, 1, 0].map((b) => prevMonth(now, b)); }, []);
  const rows = useMemo(() => {
    const per = months.map((m) => budgetMonth(transactions, categoryBudgets, categories, m));
    return Object.keys(categoryBudgets).filter((id) => Number(categoryBudgets[id]) > 0).map((id) => {
      const cells = per.map((list) => list.find((x) => x.category_id === String(id)) || { spent: 0, limit: Number(categoryBudgets[id]), pct: 0 });
      const past = cells.slice(0, -1);
      return { id, name: cells[0].name || (categories.find((c) => String(c.id) === String(id)) || {}).name || 'Deleted category', limit: Number(categoryBudgets[id]),
        cells, overCount: past.filter((c) => c.spent > c.limit).length, avg: past.reduce((s, c) => s + c.spent, 0) / past.length };
    });
  }, [transactions, categoryBudgets, categories, months]);

  if (!rows.length) return <p className="text-sm text-muted">Set a budget for a category below and its last six months show here.</p>;
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.id} className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{r.name}</span>
            <span className="text-xs text-muted">{formatCurrency(r.limit)} a month · average {formatCurrency(r.avg)} · over in {r.overCount} of 5</span>
          </div>
          <div className="grid grid-cols-6 gap-2 items-end h-20" role="img" aria-label={`${r.name}: ${r.cells.map((c, i) => `${label(months[i])} ${formatCurrency(c.spent)}`).join(', ')}`}>
            {r.cells.map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-1 h-full justify-end">
                <div className={`w-full rounded-t ${c.spent > c.limit ? 'bg-negative' : 'bg-accent'}`} style={{ height: `${Math.max(2, Math.min(100, (c.spent / (r.limit * 1.5)) * 100))}%` }} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-6 gap-2 text-center text-[11px] text-muted tabular-nums">
            {r.cells.map((c, i) => <div key={i}><div>{label(months[i])}</div><div className={c.spent > c.limit ? 'text-negative' : ''}>{formatCurrency(c.spent).replace(/\.\d\d$/, '')}</div></div>)}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted">Bars turn red in a month the budget was passed. The last bar is this month so far.</p>
    </div>
  );
}
