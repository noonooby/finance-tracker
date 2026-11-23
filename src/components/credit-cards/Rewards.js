import React from 'react';
import { useFinanceData } from '../../hooks/useFinanceData';
import { rewardsEarned, rewardRate } from '../../utils/plans';
import { monthOf, prevMonth } from '../../utils/spending';
import { formatCurrency } from '../../utils/helpers';

// About what each card with a rewards rate gave back this month and last, from what was charged to it.
export default function Rewards({ creditCards = [] }) {
  const { transactions } = useFinanceData();
  const cards = creditCards.filter((c) => !c.is_gift_card && (rewardRate(c) > 0 || rewardRate(c, true) > 0));
  if (!cards.length) return null;
  const now = monthOf(), last = prevMonth(now);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Rewards, about</div>
      <ul className="divide-y divide-line mt-1">
        {cards.map((c) => (
          <li key={c.id} className="py-2 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{c.name} <span className="text-xs text-muted">{rewardRate(c)}%{rewardRate(c, true) !== rewardRate(c) ? ` · ${rewardRate(c, true)}% on bill payments` : ''}</span></span>
            <span className="tabular-nums shrink-0">{formatCurrency(rewardsEarned(c, transactions, now))} <span className="text-xs text-muted">this month · {formatCurrency(rewardsEarned(c, transactions, last))} last</span></span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted mt-1">Worked out from what was charged to each card. The card's own statement is the real count.</p>
    </div>
  );
}
