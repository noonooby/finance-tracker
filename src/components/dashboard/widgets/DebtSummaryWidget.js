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
    <div className={`grid grid-cols-2 ${compactMode ? 'gap-2' : 'gap-4'}`}>
      <button
        type="button"
        onClick={() => onNavigate('cards')}
        className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border ${compactMode ? 'p-2' : 'p-4'} text-left hover:bg-gray-100/60 dark:hover:bg-gray-700/40 transition-colors`}
      >
        <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
          Credit Cards
        </div>
        <div className={`${compactMode ? 'text-lg' : 'text-2xl'} font-bold`}>
          {formatCurrency(totalCreditCardDebt)}
        </div>
        <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
          {creditCardsCount} {creditCardsCount === 1 ? 'card' : 'cards'}
        </div>
      </button>
      
      <button
        type="button"
        onClick={() => onNavigate('loans')}
        className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border ${compactMode ? 'p-3' : 'p-4'} text-left hover:bg-gray-100/60 dark:hover:bg-gray-700/40 transition-colors`}
      >
        <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
          Loans
        </div>
        <div className={`${compactMode ? 'text-xl' : 'text-2xl'} font-bold`}>
          {formatCurrency(totalLoanDebt)}
        </div>
        <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
          {loansCount} {loansCount === 1 ? 'loan' : 'loans'}
        </div>
      </button>
    </div>
  );
}
