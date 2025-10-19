// Utility functions for formatting and calculations
import { dbOperation } from './db';
export const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);
};

export const formatDate = (date) => {
  if (!date) return '';
  // Parse date string as local date (YYYY-MM-DD) without timezone conversion
  const [year, month, day] = date.split('T')[0].split('-');
  const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return localDate.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const getDaysUntil = (date) => {
  if (!date) return 0;
  // Parse dates without timezone conversion
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [year, month, day] = date.split('T')[0].split('-');
  const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  targetDate.setHours(0, 0, 0, 0);
  
  const diffTime = targetDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const predictNextDate = (lastDate, frequency) => {
  const [year, month, day] = lastDate.split('T')[0].split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'bimonthly':
      date.setMonth(date.getMonth() + 2);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().split('T')[0];
};

export const DEFAULT_CATEGORIES = [
  { id: 'groceries', name: 'Groceries', color: '#10b981', icon: 'ShoppingCart', is_income: false },
  { id: 'utilities', name: 'Utilities', color: '#f59e0b', icon: 'Lightbulb', is_income: false },
  { id: 'transportation', name: 'Transportation', color: '#3b82f6', icon: 'Car', is_income: false },
  { id: 'entertainment', name: 'Entertainment', color: '#8b5cf6', icon: 'Gamepad2', is_income: false },
  { id: 'healthcare', name: 'Healthcare', color: '#ef4444', icon: 'Heart', is_income: false },
  { id: 'dining', name: 'Dining', color: '#ec4899', icon: 'Utensils', is_income: false },
  { id: 'shopping', name: 'Shopping', color: '#06b6d4', icon: 'ShoppingBag', is_income: false },
  { id: 'other', name: 'Other', color: '#6b7280', icon: 'Package', is_income: false },
  { id: 'salary', name: 'Salary', color: '#10b981', icon: 'DollarSign', is_income: true },
  { id: 'freelance', name: 'Freelance', color: '#8b5cf6', icon: 'Briefcase', is_income: true },
  { id: 'investment', name: 'Investment', color: '#f59e0b', icon: 'TrendingUp', is_income: true },
  { id: 'other_income', name: 'Other Income', color: '#6b7280', icon: 'Banknote', is_income: true }
];

// ============================================
// LEGACY AVAILABLE CASH FUNCTIONS
// ============================================
// WARNING: These functions are from the old system before bank accounts were implemented.
// They calculate "availableCash" based on transaction history, which doesn't properly
// account for bank account transfers and other modern features.
//
// KNOWN ISSUES:
// - Doesn't account for bank account transfers
// - Doesn't sync with actual bank account balances
// - May produce incorrect results in apps using bank accounts
//
// RECOMMENDATION: These should eventually be deprecated or replaced with bank-account-aware logic
// ============================================

// Recalculate available cash based on all transactions
// NOTE: This is imported by activityLogger, so we cannot import it here to avoid circular dependency
export const recalculateAvailableCash = async () => {
  try {
    // Get the current value BEFORE making changes (for undo capability)
    const previousCashSetting = await dbOperation('settings', 'get', 'availableCash');
    const previousCash = previousCashSetting?.value || 0;

    const transactions = await dbOperation('transactions', 'getAll');
    const sortedTransactions = transactions.sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    let calculatedCash = 0;

    for (const transaction of sortedTransactions) {
      switch (transaction.type) {
        case 'income':
          calculatedCash += transaction.amount;
          break;
        case 'expense':
          if (transaction.payment_method === 'cash') {
            calculatedCash -= transaction.amount;
          }
          break;
        case 'payment':
        case 'loan_payment':
        case 'credit_card_payment':
          calculatedCash -= transaction.amount;
          break;
        default:
          console.warn(`Unknown transaction type: ${transaction.type}`);
          break;
      }
    }

    await dbOperation('settings', 'put', {
      key: 'availableCash',
      value: calculatedCash
    });

    console.log(`Available cash recalculated: $${calculatedCash.toFixed(2)}`);

    // Return both old and new values for activity logging
    return {
      newCash: calculatedCash,
      previousCash: previousCash
    };

  } catch (error) {
    console.error('Error recalculating available cash:', error);
    throw error;
  }
};

export const validateAvailableCash = async () => {
  try {
    const transactions = await dbOperation('transactions', 'getAll');
    const sortedTransactions = transactions.sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    let expectedCash = 0;

    for (const transaction of sortedTransactions) {
      switch (transaction.type) {
        case 'income':
          expectedCash += transaction.amount;
          break;
        case 'expense':
          if (transaction.payment_method === 'cash') {
            expectedCash -= transaction.amount;
          }
          break;
        case 'payment':
        case 'loan_payment':
        case 'credit_card_payment':
          expectedCash -= transaction.amount;
          break;
        default:
          // Unknown transaction type, skip it
          break;
      }
    }

    const cashSetting = await dbOperation('settings', 'get', 'availableCash');
    const actualCash = cashSetting?.value || 0;

    const difference = actualCash - expectedCash;
    const isValid = Math.abs(difference) < 0.01;

    return {
      isValid,
      expected: expectedCash,
      actual: actualCash,
      difference,
      message: isValid 
        ? 'Available cash is correct' 
        : `Mismatch: Expected $${expectedCash.toFixed(2)}, but found $${actualCash.toFixed(2)}`
    };

  } catch (error) {
    console.error('Error validating available cash:', error);
    throw error;
  }
};

// ============================================
// BANK ACCOUNT HELPER FUNCTIONS
// Phase 2B: Helper functions for bank account operations
//
// PURPOSE:
// - Utility functions for working with bank accounts
// - Balance calculations and validations
// - Display formatting
//
// SAFETY: These are pure utility functions that don't modify data
// ============================================

/**
 * Calculate total balance across all bank accounts
 * Replaces the old single "Available Cash" value
 *
 * @param {Array} bankAccounts - Array of bank account objects
 * @returns {number} Total balance across all accounts
 */
export function calculateTotalBankBalance(bankAccounts) {
  if (!bankAccounts || !Array.isArray(bankAccounts)) {
    console.warn('⚠️ calculateTotalBankBalance: Invalid input, returning 0');
    return 0;
  }

  const total = bankAccounts.reduce((sum, account) => {
    const balance = parseFloat(account.balance) || 0;
    return sum + balance;
  }, 0);

  return total;
}

/**
 * Calculate true available cash (total bank balance minus reserved funds)
 * This is the new version of the "True Available" calculation
 *
 * FORMULA: Total Bank Balance - Total Reserved = True Available
 *
 * @param {Array} bankAccounts - Array of bank account objects
 * @param {Array} reservedFunds - Array of reserved fund objects
 * @returns {number} True available amount (can be negative if over-allocated)
 */
export function calculateTrueAvailable(bankAccounts, reservedFunds) {
  const totalBankBalance = calculateTotalBankBalance(bankAccounts);

  const totalReserved = reservedFunds.reduce((sum, fund) => {
    return sum + (parseFloat(fund.amount) || 0);
  }, 0);

  const trueAvailable = totalBankBalance - totalReserved;

  return trueAvailable;
}

/**
 * Get account balance by ID
 * Safe getter that returns 0 if account not found
 *
 * @param {Array} bankAccounts - Array of bank account objects
 * @param {string} accountId - Account ID to find
 * @returns {number} Account balance or 0 if not found
 */
export function getAccountBalance(bankAccounts, accountId) {
  if (!bankAccounts || !accountId) return 0;

  const account = bankAccounts.find(acc => acc.id === accountId);
  return account ? (parseFloat(account.balance) || 0) : 0;
}

/**
 * Get primary account from bank accounts array
 * Returns the account marked as is_primary: true
 *
 * @param {Array} bankAccounts - Array of bank account objects
 * @returns {Object|null} Primary account or null if none exists
 */
export function getPrimaryAccountFromArray(bankAccounts) {
  if (!bankAccounts || !Array.isArray(bankAccounts)) return null;

  return bankAccounts.find(account => account.is_primary === true) || null;
}

/**
 * Validate if account has sufficient balance for a transaction
 *
 * @param {Array} bankAccounts - Array of bank account objects
 * @param {string} accountId - Account ID to check
 * @param {number} amount - Amount needed
 * @returns {boolean} True if sufficient funds, false otherwise
 */
export function hasSufficientFunds(bankAccounts, accountId, amount) {
  const balance = getAccountBalance(bankAccounts, accountId);
  return balance >= amount;
}

/**
 * Format account display name with institution (if available)
 * Examples:
 * - "Primary Checking (Chase)"
 * - "Savings Account"
 *
 * @param {Object} account - Bank account object
 * @returns {string} Formatted account name
 */
export function formatAccountName(account) {
  if (!account) return 'Unknown Account';

  if (account.institution && account.institution.trim()) {
    return `${account.name} (${account.institution})`;
  }

  return account.name;
}

/**
 * Get human-readable account type display name
 *
 * @param {string} accountType - Account type code ('checking', 'savings', etc.)
 * @returns {string} Display name
 */
export function getAccountTypeDisplay(accountType) {
  const types = {
    'checking': 'Checking',
    'savings': 'Savings',
    'investment': 'Investment',
    'cash': 'Cash'
  };

  return types[accountType] || 'Other';
}

/**
 * Get account type icon name (Lucide icon)
 * Visual indicator for different account types
 *
 * @param {string} accountType - Account type code
 * @returns {string} Lucide icon name
 */
export function getAccountTypeIcon(accountType) {
  const icons = {
    'checking': 'Building2',
    'savings': 'PiggyBank',
    'investment': 'TrendingUp',
    'cash': 'Banknote'
  };

  return icons[accountType] || 'Building2';
}

/**
 * Validate bank account data before saving
 * Returns array of validation errors (empty if valid)
 *
 * @param {Object} accountData - Account data to validate
 * @returns {Array<string>} Array of error messages (empty if valid)
 */
export function validateBankAccountData(accountData) {
  const errors = [];

  if (!accountData.name || accountData.name.trim() === '') {
    errors.push('Account name is required');
  }

  if (accountData.balance === undefined || accountData.balance === null) {
    errors.push('Account balance is required');
  }

  if (isNaN(parseFloat(accountData.balance))) {
    errors.push('Account balance must be a valid number');
  }

  if (!accountData.account_type) {
    errors.push('Account type is required');
  }

  const validTypes = ['checking', 'savings', 'investment', 'cash'];
  if (accountData.account_type && !validTypes.includes(accountData.account_type)) {
    errors.push(`Account type must be one of: ${validTypes.join(', ')}`);
  }

  return errors;
}

/**
 * Sort bank accounts for display
 * Primary account first, then by creation date
 *
 * @param {Array} bankAccounts - Array of bank account objects
 * @returns {Array} Sorted array (does not mutate original)
 */
export function sortBankAccounts(bankAccounts) {
  if (!bankAccounts || !Array.isArray(bankAccounts)) return [];

  return [...bankAccounts].sort((a, b) => {
    // Primary account always first
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;

    // Then sort by creation date (oldest first)
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

// ============================================
// END OF BANK ACCOUNT HELPER FUNCTIONS
// ============================================
