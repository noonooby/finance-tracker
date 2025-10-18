import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { formatCurrency } from '../../../utils/helpers';

/**
 * Upcoming Obligations Widget
 * Displays non-urgent upcoming payments
 */
export default function UpcomingObligationsWidget({
  darkMode,
  obligations,
  upcomingDays,
  compactMode,
  isCollapsed,
  onToggleCollapse,
  onObligationClick
}) {
  const upcomingObligations = obligations.filter(o => !o.urgent);
  
  return (
    <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border ${compactMode ? 'p-1.5' : 'p-4'}`}>
      <button
        onClick={onToggleCollapse}
        className={`w-full flex items-center ${compactMode ? 'gap-0.5 mb-0.5' : 'gap-2 mb-3'}`}
      >
        {isCollapsed ? (
          <ChevronRight size={compactMode ? 14 : 18} className="text-gray-500" />
        ) : (
          <ChevronDown size={compactMode ? 14 : 18} className="text-gray-500" />
        )}
        <h3 className={`font-semibold ${compactMode ? 'text-xs' : ''}`}>Upcoming Obligations ({upcomingDays}d)</h3>
      </button>
      
      {!isCollapsed && (
        <div className={compactMode ? 'space-y-0.5' : 'space-y-3'}>
          {upcomingObligations.length === 0 ? (
            <p className={`${compactMode ? 'text-xs' : 'text-sm'} ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              No upcoming obligations
            </p>
          ) : (
            upcomingObligations.map(obl => (
              <button
                key={obl.id}
                type="button"
                onClick={() => onObligationClick(obl)}
                className={`w-full flex justify-between items-center ${compactMode ? 'pb-0.5' : 'pb-3'} border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'} last:border-0 text-left hover:bg-gray-100/60 dark:hover:bg-gray-700/40 rounded-lg ${compactMode ? 'px-1' : 'px-2'}`}
              >
                <div className={compactMode ? 'py-0.5' : 'py-1'}>
                  <div className={`font-medium truncate ${compactMode ? 'text-xs' : ''}`}>{obl.name}</div>
                  <div className={`${compactMode ? 'text-[10px]' : 'text-xs'} ${darkMode ? 'text-gray-400' : 'text-gray-500'} capitalize`}>
                    {obl.type.replace('_', ' ')}
                  </div>
                </div>
                <div className={`flex items-center ${compactMode ? 'gap-0.5' : 'gap-2'} flex-shrink-0 ml-2`}>
                  <div className="text-right">
                    <div className={`font-semibold ${compactMode ? 'text-xs' : ''}`}>{formatCurrency(obl.amount)}</div>
                    <div className={`${compactMode ? 'text-[10px]' : 'text-xs'} ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {obl.days}d
                    </div>
                  </div>
                  <ChevronRight size={compactMode ? 12 : 16} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
