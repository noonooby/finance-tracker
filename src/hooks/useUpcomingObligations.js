import { useMemo } from 'react';
import { getDaysUntil } from '../utils/helpers';

/**
 * Custom hook to calculate upcoming financial obligations
 * Returns sorted list of upcoming payments from credit cards, loans, and reserved funds
 */
export function useUpcomingObligations(creditCards, loans, reservedFunds, alertSettings) {
  return useMemo(() => {
    const normalizeId = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'object') {
        if (value.id !== undefined) return String(value.id);
        if (value.value !== undefined) return String(value.value);
        return null;
      }
      return String(value);
    };

    const obligations = [];
    const warningDays = alertSettings?.defaultDays || 7;
    const upcomingWindow = alertSettings?.upcomingDays || 30;
    
    // Add credit card obligations
    creditCards.forEach(card => {
      if (card.balance > 0 && card.due_date) {
        const days = getDaysUntil(card.due_date);
        obligations.push({
          type: 'credit_card',
          name: card.name,
          amount: card.balance,
          dueDate: card.due_date,
          days,
          urgent: days <= warningDays && days >= 0,
          id: normalizeId(card.id)
        });
      }
    });
    
    // Add loan obligations
    loans.forEach(loan => {
      if (loan.next_payment_date) {
        const days = getDaysUntil(loan.next_payment_date);
        obligations.push({
          type: 'loan',
          name: loan.name,
          amount: loan.payment_amount,
          dueDate: loan.next_payment_date,
          days,
          urgent: days <= warningDays && days >= 0,
          id: normalizeId(loan.id)
        });
      }
    });
    
    // Add reserved fund obligations
    reservedFunds.forEach(fund => {
      if (!fund?.due_date) return;
      const days = getDaysUntil(fund.due_date);
      obligations.push({
        type: 'reserved_fund',
        name: fund.name,
        amount: fund.amount,
        dueDate: fund.due_date,
        days,
        urgent: days <= warningDays && days >= 0,
        id: normalizeId(fund.id)
      });
    });
    
    // Filter and sort
    return obligations
      .filter(obligation => obligation.days >= 0 && (obligation.urgent || obligation.days <= upcomingWindow))
      .sort((a, b) => a.days - b.days);
  }, [creditCards, loans, reservedFunds, alertSettings]);
}
