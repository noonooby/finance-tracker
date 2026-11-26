import React from 'react';
import { useFinanceData } from '../../hooks/useFinanceData';
import { lineTerms, PRIME } from '../../utils/accounts';
import { formatCurrency, longDay } from '../../utils/helpers';
import { Hint } from '../shared/ui';

// Under a line of credit: what is used, what is left to take, the rate it follows and what the interest comes to a month.
export default function LineNote({ loan }) {
  const { investments = [] } = useFinanceData();
  const t = lineTerms(loan, investments);
  if (!t) return null;
  return (
    <div className="mt-2 rounded-xl bg-surface-2 px-3 py-2.5 space-y-1 text-xs">
      <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-muted">
        {t.label}
        <Hint label="About this line of credit">{t.note} Prime is {PRIME.rate}% as of {longDay(PRIME.as_of)}. A rate or limit you set on the loan is used first. To take money from it, use Move money on the Accounts page and choose this line as where it comes from.</Hint>
      </div>
      {t.limit != null
        ? <div><b>{formatCurrency(t.left)}</b> left to take of {formatCurrency(t.limit)} ({t.limit_from}).</div>
        : <div>The limit is not known. Set it on the loan to see what is left to take.</div>}
      {t.rate != null
        ? <div>About {t.rate}% a year ({t.rate_from}){t.used > 0 ? `: about ${formatCurrency(t.month)} of interest a month on what is used` : '. Nothing is used, so no interest is charged'}.</div>
        : <div>The rate is not known. It follows prime ({PRIME.rate}%) plus a margin: set it on the loan.</div>}
    </div>
  );
}
