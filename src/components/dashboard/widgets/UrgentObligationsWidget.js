import React from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../../utils/helpers';

/**
 * Urgent Obligations Widget
 * Displays urgent payments that need attention
 */
export default function UrgentObligationsWidget({
  darkMode,
  obligations,
  compactMode,
  onObligationClick
}) {
  const urgentObligations = obligations.filter(o => o.urgent);
  
  if (urgentObligations.length === 0) return null;
  
  return (
    <div className={`${darkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border rounded-lg ${compactMode ? 'p-1.5' : 'p-4'}`}>
      <div className={`flex items-center ${compactMode ? 'gap-1' : 'gap-2'} ${darkMode ? 'text-red-200' : 'text-red-800'} font-semibold ${compactMode ? 'mb-0.5' : 'mb-3'}`}>
        <AlertCircle size={compactMode ? 14 : 20} />
        <span className={compactMode ? 'text-xs' : ''}>Urgent Obligations</span>
      </div>
      <div className={compactMode ? 'space-y-0.5' : 'space-y-2'}>
        {urgentObligations.map(obl => (
          <button
            key={obl.id}
            type="button"
            onClick={() => onObligationClick(obl)}
            className={`w-full flex justify-between items-center ${compactMode ? 'text-xs' : 'text-sm'} rounded-lg ${compactMode ? 'px-1.5 py-0.5' : 'px-3 py-2'} transition-colors hover:bg-red-100/60 dark:hover:bg-red-800/40`}
          >
            <span className="font-medium truncate">{obl.name}</span>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <div className="text-right">
                <div className="font-semibold">{formatCurrency(obl.amount)}</div>
                <div className={`${compactMode ? 'text-[10px]' : 'text-xs'} ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                  {obl.days === 0 ? 'Today' : obl.days === 1 ? 'Tomorrow' : `${obl.days}d`}
                </div>
              </div>
              <ChevronRight size={compactMode ? 12 : 16} className={darkMode ? 'text-red-200' : 'text-red-500'} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
