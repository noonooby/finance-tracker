import React, { useMemo } from 'react';
import { amortize, periodicRate } from '../../utils/finance';
import { formatCurrency, formatDate } from '../../utils/helpers';

// What the next payment does and when the loan is paid off, from the balance, rate and payment.
export default function PayoffSummary({ loan }) {
  const plan = useMemo(() => amortize(loan), [loan]);
  const muted = 'text-muted';
  if (!(Number(loan.balance) > 0) || !(Number(loan.payment_amount) > 0)) return null;
  if (!(periodicRate(loan) > 0)) {
    return plan.payoffDate ? <div className={`text-xs mt-1 ${muted}`}>Paid off around {formatDate(plan.payoffDate)} (no interest rate set)</div> : null;
  }
  if (plan.neverPaysOff) {
    return <div className="text-xs mt-1 text-negative">The payment does not cover the interest, so this never gets paid off.</div>;
  }
  const next = plan.rows[0];
  return (
    <div className={`text-xs mt-1 space-y-0.5 ${muted}`}>
      {loan.loan_type === 'mortgage' && <div className="font-medium text-accent">Mortgage</div>}
      <div>Next payment: {formatCurrency(next.interest)} interest, {formatCurrency(next.principal)} off what you owe</div>
      <div>Paid off around {formatDate(plan.payoffDate)}, {plan.rows.length} payments, {formatCurrency(plan.totalInterest)} interest still to pay</div>
    </div>
  );
}
