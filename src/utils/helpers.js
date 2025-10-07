// Utility functions for formatting and calculations
import { dbOperation } from './db';
export const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const getDaysUntil = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const predictNextDate = (lastDate, frequency) => {
  const date = new Date(lastDate);
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
  { id: 'groceries', name: 'Groceries', color: '#10b981' },
  { id: 'utilities', name: 'Utilities', color: '#f59e0b' },
  { id: 'transportation', name: 'Transportation', color: '#3b82f6' },
  { id: 'entertainment', name: 'Entertainment', color: '#8b5cf6' },
  { id: 'healthcare', name: 'Healthcare', color: '#ef4444' },
  { id: 'dining', name: 'Dining', color: '#ec4899' },
  { id: 'shopping', name: 'Shopping', color: '#06b6d4' },
  { id: 'other', name: 'Other', color: '#6b7280' }
];

/**
 * Recalculates available cash based on all transactions
 * This ensures cash is accurate by processing all income and expenses chronologically
 */
export const recalculateAvailableCash = async () => {
  try {
    // Get all transactions sorted by date (oldest first)
    const transactions = await dbOperation('transactions', 'getAll');
    const sortedTransactions = transactions.sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    let calculatedCash = 0;

    // Process each transaction chronologically
    for (const transaction of sortedTransactions) {
      switch (transaction.type) {
        case 'income':
          // Add income to cash
          calculatedCash += transaction.amount;
          break;

        case 'expense':
          // Subtract cash expenses only (credit card expenses don't affect cash)
          if (transaction.payment_method === 'cash') {
            calculatedCash -= transaction.amount;
          }
          break;

        case 'payment':
          // Subtract payments to credit cards/loans from cash
          calculatedCash -= transaction.amount;
          break;

        default:
          console.warn(`Unknown transaction type: ${transaction.type}`);
      }
    }

    // Update the available cash in settings
    await dbOperation('settings', 'put', { 
      key: 'availableCash', 
      value: calculatedCash 
    });

    console.log(`Available cash recalculated: $${calculatedCash.toFixed(2)}`);
    return calculatedCash;

  } catch (error) {
    console.error('Error recalculating available cash:', error);
    throw error;
  }
};

/**
 * Validates if available cash matches transaction history
 * Returns object with { isValid, expected, actual, difference }
 */
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
          expectedCash -= transaction.amount;
          break;
      }
    }

    const cashSetting = await dbOperation('settings', 'get', 'availableCash');
    const actualCash = cashSetting?.value || 0;

    const difference = actualCash - expectedCash;
    const isValid = Math.abs(difference) < 0.01; // Allow for rounding errors

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