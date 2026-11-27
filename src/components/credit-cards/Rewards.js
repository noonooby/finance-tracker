import React from 'react';
import { useFinanceData } from '../../hooks/useFinanceData';
import { rewardsEarned, rewardRate, ownRewards } from '../../utils/plans';
import { cardProgram, CHECKED } from '../../utils/cards';
import { monthOf, prevMonth } from '../../utils/spending';
import { formatCurrency, longDay } from '../../utils/helpers';
import { Hint } from '../shared/ui';

// About what each card gave back this month and last, from what was charged to it. A card with no rate of its own
// uses what the app knows about that card; a card that can hold payment plans says so.
export default function Rewards({ creditCards = [] }) {
  const { transactions } = useFinanceData();
  const cards = creditCards.filter((c) => !c.is_gift_card && (ownRewards(c) || cardProgram(c)));
  if (!cards.length) return null;
  const now = monthOf(), last = prevMonth(now);
  const builtIn = cards.some((c) => !ownRewards(c) && cardProgram(c) && cardProgram(c).base != null);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[0.9375rem] font-semibold text-fg">Rewards, about</div>
        <Hint label="About rewards" align="right">Worked out from what was charged to each card. A rate you set on a card is used first. A card with no rate of its own uses the published rates for that card. Yearly caps and welcome offers are not counted, so the card's own statement is the real count.</Hint>
      </div>
      <ul className="divide-y divide-line mt-1">
        {cards.map((c) => {
          const p = cardProgram(c), own = ownRewards(c), earns = own || (p && p.base != null);
          return (
            <li key={c.id} className="py-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{c.name}</span>
                {earns && <span className="tabular-nums shrink-0">{formatCurrency(rewardsEarned(c, transactions, now))} <span className="text-xs text-muted">this month · {formatCurrency(rewardsEarned(c, transactions, last))} last</span></span>}
              </div>
              {own
                ? <div className="text-xs text-muted">{p && p.kind ? `${p.kind}. ` : ''}{rewardRate(c)}%{rewardRate(c, true) !== rewardRate(c) ? ` · ${rewardRate(c, true)}% on bill payments` : ''}{(c.reward_rules || []).length ? ` · ${c.reward_rules.length} ${c.reward_rules.length === 1 ? 'category has its' : 'categories have their'} own rate` : ''}, set by you.</div>
                : p && p.base != null && <div className="text-xs text-muted">{p.kind}. {p.note}</div>}
              {p && p.plans && <div className="text-xs text-muted">Can hold equal payment plans with no interest from {p.plans.split(',').slice(0, 3).map((s) => s.trim().replace(/\b\w/g, (ch) => ch.toUpperCase())).join(', ')}{p.plans.split(',').length > 3 ? ' and others' : ''}. A plan is part of the card's balance.</div>}
            </li>
          );
        })}
      </ul>
      {builtIn && <p className="text-xs text-muted mt-1">Published rates, checked {longDay(CHECKED)}. Set a rate on a card to use your own.</p>}
    </div>
  );
}
