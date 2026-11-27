import { nextDue } from './spending';
// Utility functions for formatting and calculations
export const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);
};

// A stored date ("2026-11-21") as a local date. new Date("2026-11-21") would be UTC midnight: the day before, west of UTC.
export const parseDay = (value) => {
  if (value instanceof Date) return value;
  const s = String(value || '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
};

export const formatDate = (date) => {
  if (!date) return '';
  // Parse date string as local date (YYYY-MM-DD) without timezone conversion
  const [year, month, day] = date.split('T')[0].split('-');
  const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return localDate.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const getDaysUntil = (date, now = new Date()) => {
  if (!date) return 0;
  // Parse dates without timezone conversion
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  
  const [year, month, day] = date.split('T')[0].split('-');
  const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  targetDate.setHours(0, 0, 0, 0);
  
  const diffTime = targetDate - today;
  // Rounded, not rounded up: the day the clocks change is 23 or 25 hours long.
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// A date as YYYY-MM-DD in the user's own timezone (toISOString would give the UTC date, a day off near midnight).
export const localDate = (d = new Date()) => {
  const x = d instanceof Date ? d : new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
};

// The same day n months later; a 29th-31st falls on the last day of a shorter month and returns to the anchor day after.
export const addMonths = (date, n, anchorDay = date.getDate()) => {
  const y = date.getFullYear();
  const mo = date.getMonth() + n;
  const last = new Date(y, mo + 1, 0).getDate();
  return new Date(y, mo, Math.min(anchorDay, last));
};

// The next date for a loan payment or a pay day (the shared rule in spending.js).
export const predictNextDate = (lastDate, frequency, anchorDay) => nextDue(String(lastDate).split('T')[0], frequency, anchorDay);

export const DEFAULT_CATEGORIES = [
  { id: 'groceries', name: 'Groceries', color: '#10b981', icon: 'ShoppingCart', is_income: false },
  { id: 'utilities', name: 'Utilities', color: '#f59e0b', icon: 'Lightbulb', is_income: false },
  { id: 'transportation', name: 'Transportation', color: '#3b82f6', icon: 'Car', is_income: false },
  { id: 'entertainment', name: 'Entertainment', color: '#8b5cf6', icon: 'Gamepad2', is_income: false },
  { id: 'healthcare', name: 'Healthcare', color: '#ef4444', icon: 'Heart', is_income: false },
  { id: 'dining', name: 'Dining', color: '#ec4899', icon: 'Utensils', is_income: false },
  { id: 'shopping', name: 'Shopping', color: '#06b6d4', icon: 'ShoppingBag', is_income: false },
  { id: 'housing', name: 'Housing', color: '#0ea5e9', icon: 'Home', is_income: false },
  { id: 'insurance', name: 'Insurance', color: '#14b8a6', icon: 'Shield', is_income: false },
  { id: 'loan_payments', name: 'Loan payments', color: '#a855f7', icon: 'Landmark', is_income: false },
  { id: 'other', name: 'Other', color: '#6b7280', icon: 'Package', is_income: false },
  { id: 'salary', name: 'Salary', color: '#10b981', icon: 'DollarSign', is_income: true },
  { id: 'freelance', name: 'Freelance', color: '#8b5cf6', icon: 'Briefcase', is_income: true },
  { id: 'investment', name: 'Investment', color: '#f59e0b', icon: 'TrendingUp', is_income: true },
  { id: 'other_income', name: 'Other income', color: '#6b7280', icon: 'Banknote', is_income: true }
];

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
    console.warn('calculateTotalBankBalance: Invalid input, returning 0');
    return 0;
  }

  const total = bankAccounts.reduce((sum, account) => {
    const balance = parseFloat(account.balance) || 0;
    return sum + balance;
  }, 0);

  return total;
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
 * Parse smart input that supports math expressions
 * Examples: "25+10", "100/4", "10*5", "50-5"
 * Returns null if invalid
 *
 * @param {string} input - User input string
 * @returns {number|null} Calculated value or null if invalid
 */
export function parseSmartInput(input) {
  if (!input || typeof input !== 'string') return null;
  
  const trimmed = input.trim();
  if (!trimmed) return null;
  
  try {
    // Check if it's a simple number first
    const simpleNumber = parseFloat(trimmed);
    if (!isNaN(simpleNumber) && trimmed === simpleNumber.toString()) {
      return simpleNumber;
    }
    
    // Check if it contains only numbers, operators, parentheses, and decimal points
    if (!/^[0-9+\-*/().\s]+$/.test(trimmed)) {
      return null;
    }
    
    // Evaluate the expression safely
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + trimmed + ')')();
    
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return result;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// ============================================
// END OF BANK ACCOUNT HELPER FUNCTIONS
// ============================================
// The account picked by default: the primary account, else the first that is not cash, else cash, else none.
export function defaultBankAccount(bankAccounts) {
  const list = bankAccounts || [];
  return list.find((a) => a.is_primary) || list.find((a) => a.account_type !== 'cash') || list[0] || null;
}

// A day written out in full, for example November 26, 2026.
export const longDay = (d) => { const x = parseDay(d); return x ? x.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : d; };
