import React from 'react';
import { formatCurrency } from '../../../utils/helpers';

/**
 * Debt Summary Widget
 * Displays credit card and loan totals
 */
export default function DebtSummaryWidget({
  darkMode,
  totalCreditCardDebt,
  totalLoanDebt,
  creditCardsCount,
  loansCount,
  compactMode,
  onNavigate
}) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${compactMode ? 'gap-1.5' : 'gap-4'}`}>
      <button
        type="button"
        onClick={() => onNavigate('cards')}
        className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border ${compactMode ? 'p-1.5' : 'p-4'} text-left hover:bg-gray-100/60 dark:hover:bg-gray-700/40 transition-colors`}
      >
        <div className={`${compactMode ? 'text-xs' : 'text-sm'} ${darkMode ? 'text-gray-400' : 'text-gray-600'} ${compactMode ? 'mb-0.5' : 'mb-1'}`}>
          Credit Cards
        </div>
        <div className={`${compactMode ? 'text-base' : 'text-2xl'} font-bold`}>
          {formatCurrency(totalCreditCardDebt)}
        </div>
        <div className={`${compactMode ? 'text-[10px]' : 'text-xs'} ${darkMode ? 'text-gray-500' : 'text-gray-500'} ${compactMode ? 'mt-0.5' : 'mt-1'}`}>
          {creditCardsCount} {creditCardsCount === 1 ? 'card' : 'cards'}
        </div>
      </button>
      
      <button
        type="button"
        onClick={() => onNavigate('loans')}
        className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border ${compactMode ? 'p-1.5' : 'p-4'} text-left hover:bg-gray-100/60 dark:hover:bg-gray-700/40 transition-colors`}
      >
        <div className={`${compactMode ? 'text-xs' : 'text-sm'} ${darkMode ? 'text-gray-400' : 'text-gray-600'} ${compactMode ? 'mb-0.5' : 'mb-1'}`}>
          Loans
        </div>
        <div className={`${compactMode ? 'text-base' : 'text-2xl'} font-bold`}>
          {formatCurrency(totalLoanDebt)}
        </div>
        <div className={`${compactMode ? 'text-[10px]' : 'text-xs'} ${darkMode ? 'text-gray-500' : 'text-gray-500'} ${compactMode ? 'mt-0.5' : 'mt-1'}`}>
          {loansCount} {loansCount === 1 ? 'loan' : 'loans'}
        </div>
      </button>
    </div>
  );
}
