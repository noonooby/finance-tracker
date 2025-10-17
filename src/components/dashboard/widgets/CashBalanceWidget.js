import React from 'react';
import { formatCurrency, calculateTotalBankBalance } from '../../../utils/helpers';
import { Wallet } from 'lucide-react';

/**
 * Cash Balance Widget
 * Displays total available cash with breakdown
 */
export default function CashBalanceWidget({
  darkMode,
  availableCash,
  totalReserved,
  trueAvailable,
  cashInHand,
  bankAccounts,
  showCashInDashboard,
  compactMode,
  onCashOperation
}) {
  return (
    <div className={`${darkMode ? 'bg-blue-900' : 'bg-gradient-to-r from-blue-600 to-blue-700'} rounded-lg ${compactMode ? 'p-2' : 'p-6'} text-white`}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium opacity-90">Total Available</h2>
        <button
          onClick={onCashOperation}
          className={`flex items-center gap-1 px-3 py-1 text-xs rounded ${darkMode ? 'bg-blue-800 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-500'} text-white`}
          title="Cash Operations"
        >
          <Wallet size={14} />
          Cash
        </button>
      </div>
      <div className={`${compactMode ? 'text-2xl' : 'text-4xl'} font-bold mb-1`}>
        {formatCurrency(availableCash)}
      </div>
      
      {showCashInDashboard && (
        <div className={`text-sm opacity-90 ${compactMode ? 'mt-0.5' : 'mt-2'} ${compactMode ? 'space-y-0.5' : 'space-y-1'}`}>
          <div>💵 Cash in Hand: {formatCurrency(cashInHand || 0)}</div>
          <div>🏦 Bank Accounts: {formatCurrency(calculateTotalBankBalance(bankAccounts || []))}</div>
        </div>
      )}
      
      <div className={`text-sm opacity-90 ${compactMode ? 'mt-0.5' : 'mt-2'}`}>
        Reserved: {formatCurrency(totalReserved)}
      </div>
      <div className={`${compactMode ? 'mt-1 pt-1' : 'mt-3 pt-3'} ${darkMode ? 'border-blue-800' : 'border-blue-500'} border-t`}>
        <div className={`${compactMode ? 'text-sm' : 'text-lg'} font-semibold`}>
          True Available: {formatCurrency(trueAvailable)}
        </div>
      </div>
    </div>
  );
}
