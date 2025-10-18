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
    <div className={`${darkMode ? 'bg-green-900 border-green-700' : 'bg-green-50 border-green-200'} border rounded-lg ${compactMode ? 'p-1.5' : 'p-4'}`}>
      <h3 className={`font-semibold ${darkMode ? 'text-green-200' : 'text-green-800'} ${compactMode ? 'mb-0.5 text-xs' : 'mb-2'}`}>
        Next Income
      </h3>
      <div className="flex justify-between items-center">
        <div className="truncate flex-1 mr-2">
          <div className={`${compactMode ? 'text-xs' : 'text-sm'} ${darkMode ? 'text-gray-300' : 'text-gray-600'} truncate`}>
            {nextIncome.source}
          </div>
          <div className={`${compactMode ? 'text-[10px]' : 'text-xs'} ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {formatDate(nextIncome.date)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('income')}
          className="flex items-center gap-1 text-right flex-shrink-0"
        >
          <div>
            <div className={`${compactMode ? 'text-sm' : 'text-lg'} font-bold ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
              {formatCurrency(nextIncome.amount)}
            </div>
            <div className={`${compactMode ? 'text-[10px]' : 'text-xs'} ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {nextIncome.days}d
            </div>
          </div>
          <ChevronRight size={compactMode ? 12 : 16} className={darkMode ? 'text-green-200' : 'text-green-600'} />
        </button>
      </div>
    </div>
  );
}
