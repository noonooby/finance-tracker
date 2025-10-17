import React from 'react';
import { ChevronRight } from 'lucide-react';
import { formatCurrency, formatDate } from '../../../utils/helpers';

/**
 * Next Income Widget
 * Displays the next expected income payment
 */
export default function NextIncomeWidget({
  darkMode,
  nextIncome,
  compactMode,
  onNavigate
}) {
  if (!nextIncome) return null;
  
  return (
    <div className={`${darkMode ? 'bg-green-900 border-green-700' : 'bg-green-50 border-green-200'} border rounded-lg ${compactMode ? 'p-2' : 'p-4'}`}>
      <h3 className={`font-semibold ${darkMode ? 'text-green-200' : 'text-green-800'} ${compactMode ? 'mb-1' : 'mb-2'}`}>
        Next Income
      </h3>
      <div className="flex justify-between items-center">
        <div>
          <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {nextIncome.source}
          </div>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {formatDate(nextIncome.date)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('income')}
          className="flex items-center gap-2 text-right text-left md:text-right"
        >
          <div className={`${compactMode ? 'text-base' : 'text-lg'} font-bold ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
            {formatCurrency(nextIncome.amount)}
          </div>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {nextIncome.days} days
          </div>
          <ChevronRight size={16} className={darkMode ? 'text-green-200' : 'text-green-600'} />
        </button>
      </div>
    </div>
  );
}
