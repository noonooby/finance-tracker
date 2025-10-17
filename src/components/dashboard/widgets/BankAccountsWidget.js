import React from 'react';
import { formatCurrency, calculateTotalBankBalance } from '../../../utils/helpers';

/**
 * Bank Accounts Widget
 * Displays total bank account balance
 */
export default function BankAccountsWidget({
  darkMode,
  bankAccounts,
  compactMode,
  onNavigate
}) {
  if (!bankAccounts || bankAccounts.length === 0) return null;
  
  return (
    <button
      type="button"
      onClick={() => onNavigate('bank-accounts')}
      className={`w-full ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border ${compactMode ? 'p-2' : 'p-4'} text-left hover:bg-gray-100/60 dark:hover:bg-gray-700/40 transition-colors`}
    >
      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
        Bank Accounts
      </div>
      <div className={`${compactMode ? 'text-lg' : 'text-2xl'} font-bold`}>
        {formatCurrency(calculateTotalBankBalance(bankAccounts))}
      </div>
      <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
        {bankAccounts.length} {bankAccounts.length === 1 ? 'account' : 'accounts'}
      </div>
    </button>
  );
}
