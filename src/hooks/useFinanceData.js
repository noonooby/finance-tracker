import { useContext } from 'react';
import { FinanceDataContext } from '../contexts/FinanceDataContext';

/**
 * Custom hook to access financial data context
 * @returns {Object} Financial data state and methods
 * @property {Array} creditCards - List of credit cards
 * @property {Array} loans - List of loans
 * @property {Array} reservedFunds - List of reserved funds
 * @property {Array} income - List of income sources
 * @property {Array} transactions - List of transactions
 * @property {Array} categories - List of categories
 * @property {Array} bankAccounts - List of bank accounts
 * @property {number} availableCash - Available cash amount
 * @property {number} cashInHand - Cash in hand amount
 * @property {boolean} dataLoading - Whether data is loading
 * @property {boolean} isMigrating - Whether migration is in progress
 * @property {Array} latestActivities - Latest activity log entries
 * @property {Function} loadAllData - Reload all financial data
 * @property {Function} handleUpdateCash - Update cash balances
 * @property {Function} updateCashInHand - Update cash in hand
 * @property {number} totalReserved - Total reserved funds amount
 * @property {number} displayAvailableCash - Display cash (bank + hand)
 * @property {number} trueAvailable - True available after reserved
 * @property {number} totalCreditCardDebt - Total credit card debt
 * @property {number} totalLoanDebt - Total loan debt
 */
export function useFinanceData() {
  const context = useContext(FinanceDataContext);
  
  if (!context) {
    throw new Error('useFinanceData must be used within a FinanceDataProvider');
  }
  
  return context;
}
