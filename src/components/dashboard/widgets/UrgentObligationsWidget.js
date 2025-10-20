import React, { useState } from 'react';
import { AlertCircle, ChevronRight, Zap } from 'lucide-react';
import { formatCurrency } from '../../../utils/helpers';

/**
 * Urgent Obligations Widget
 * Displays urgent payments that need attention with auto-process capability
 */
export default function UrgentObligationsWidget({
  darkMode,
  obligations,
  compactMode,
  onObligationClick,
  onProcessDuePayments
}) {
  const [processing, setProcessing] = useState(false);
  
  const urgentObligations = obligations.filter(o => o.urgent);
  const overdueLoans = urgentObligations.filter(o => o.type === 'loan' && o.days < 0);
  
  if (urgentObligations.length === 0) return null;
  
  const handleProcessPayments = async () => {
    if (processing || !onProcessDuePayments) return;
    
    setProcessing(true);
    try {
      await onProcessDuePayments();
    } catch (error) {
      console.error('Error processing payments:', error);
    } finally {
      setProcessing(false);
    }
  };
  
  return (
    <div className={`${darkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border rounded-lg ${compactMode ? 'p-1.5' : 'p-4'}`}>
      <div className={`flex items-center justify-between ${compactMode ? 'mb-0.5' : 'mb-3'}`}>
        <div className={`flex items-center ${compactMode ? 'gap-1' : 'gap-2'} ${darkMode ? 'text-red-200' : 'text-red-800'} font-semibold`}>
          <AlertCircle size={compactMode ? 14 : 20} />
          <span className={compactMode ? 'text-xs' : ''}>Urgent Obligations</span>
        </div>
        
        {/* Process Due Payments Button */}
        {overdueLoans.length > 0 && onProcessDuePayments && (
          <button
            onClick={handleProcessPayments}
            disabled={processing}
            className={`flex items-center ${compactMode ? 'gap-0.5 px-1.5 py-0.5 text-[10px]' : 'gap-1 px-2 py-1 text-xs'} rounded-lg font-medium transition-colors ${
              processing
                ? 'bg-gray-400 cursor-not-allowed'
                : darkMode
                ? 'bg-green-700 hover:bg-green-600 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
            title="Automatically process all overdue loan payments from connected sources"
          >
            <Zap size={compactMode ? 10 : 14} />
            {processing ? 'Processing...' : 'Auto-Pay'}
          </button>
        )}
      </div>
      
      <div className={compactMode ? 'space-y-0.5' : 'space-y-2'}>
        {urgentObligations.map(obl => (
          <button
            key={obl.id}
            type="button"
            onClick={() => onObligationClick(obl)}
            className={`w-full flex justify-between items-center ${compactMode ? 'text-xs' : 'text-sm'} rounded-lg ${compactMode ? 'px-1.5 py-0.5' : 'px-3 py-2'} transition-colors hover:bg-red-100/60 dark:hover:bg-red-800/40`}
          >
            <div className="flex items-center gap-2 truncate">
              <span className="font-medium truncate">{obl.name}</span>
              {obl.type === 'loan' && obl.hasAutoPayment && (
                <span className={`${compactMode ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5'} rounded ${
                  darkMode ? 'bg-green-900/40 text-green-300' : 'bg-green-200 text-green-800'
                }`}>
                  AUTO
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <div className="text-right">
                <div className="font-semibold">{formatCurrency(obl.amount)}</div>
                <div className={`${compactMode ? 'text-[10px]' : 'text-xs'} ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                  {obl.days === 0 ? 'Today' : obl.days === 1 ? 'Tomorrow' : obl.days < 0 ? `${Math.abs(obl.days)}d overdue` : `${obl.days}d`}
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
