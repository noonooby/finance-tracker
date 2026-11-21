import { useMemo } from 'react';
import { getDaysUntil, predictNextDate, parseDay } from '../utils/helpers';

/**
 * Custom hook to calculate next expected income
 * Returns the next recurring income payment details
 */
export function useNextIncome(income) {
  return useMemo(() => {
    if (!income || income.length === 0) return null;
    
    const sortedIncome = [...income].sort((a, b) => parseDay(b.date) - parseDay(a.date));
    const lastIncome = sortedIncome[0];
    
    if (lastIncome.frequency && lastIncome.frequency !== 'onetime') {
      const nextDate = predictNextDate(lastIncome.date, lastIncome.frequency);
      return {
        amount: lastIncome.amount,
        date: nextDate,
        source: lastIncome.source,
        days: getDaysUntil(nextDate)
      };
    }
    
    return null;
  }, [income]);
}
