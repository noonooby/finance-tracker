import React from 'react';
import { throughCost } from '../../utils/plans';
import { formatCurrency } from '../../utils/helpers';

// One line under a bill or loan that is paid through a service with a fee: what the fee is each time, and which
// card comes out best once its rewards are counted.
export default function ThroughNote({ item, amount, cards = [] }) {
  const pct = Number(item && item.fee_percent) || 0;
  if (!(pct > 0) || !(Number(amount) > 0)) return null;
  const c = throughCost(amount, pct, cards);
  const name = (item.paid_through || '').trim() || 'the service';
  return (
    <div className="text-xs text-muted mt-1">
      Through {name}: {formatCurrency(c.fee)} fee each time ({pct}%).{' '}
      {c.best
        ? `Best on ${c.best.name}: ${formatCurrency(c.best.reward)} back, ${c.best.net >= 0 ? `${formatCurrency(c.best.net)} ahead` : `${formatCurrency(-c.best.net)} behind`}.`
        : 'Add the rewards rate to a card to see which one comes out best.'}
    </div>
  );
}
