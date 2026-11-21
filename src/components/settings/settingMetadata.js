import { formatCurrency } from '../../utils/helpers';

/**
 * Setting metadata for activity logging.
 * undoable: true logs with a snapshot so the change can be undone.
 */
const toggle = (label) => (oldVal, newVal) => (newVal ? `Enabled ${label}` : `Disabled ${label}`);

export const SETTING_METADATA = {
  currency: {
    undoable: true,
    formatDescription: (oldVal, newVal) => `Changed currency from ${oldVal} to ${newVal}`,
    displayName: 'Currency'
  },
  monthlyBudgetAmount: {
    undoable: true,
    formatDescription: (oldVal, newVal) => `Updated monthly budget from ${formatCurrency(oldVal)} to ${formatCurrency(newVal)}`,
    displayName: 'Monthly Budget'
  },
  defaultOverdraftLimit: {
    undoable: true,
    formatDescription: (oldVal, newVal) => `Updated default overdraft limit from ${formatCurrency(oldVal)} to ${formatCurrency(newVal)}`,
    displayName: 'Default Overdraft Limit'
  },
  lowBalanceThreshold: {
    undoable: true,
    formatDescription: (oldVal, newVal) => `Updated bank account low balance threshold from ${formatCurrency(oldVal)} to ${formatCurrency(newVal)}`,
    displayName: 'Low Balance Threshold'
  },

  dateFormat: {
    undoable: false,
    formatDescription: (oldVal, newVal) => `Changed date format from ${oldVal} to ${newVal}`,
    displayName: 'Date Format'
  },
  firstDayOfWeek: {
    undoable: false,
    formatDescription: (oldVal, newVal) => `Changed first day of week from ${oldVal} to ${newVal}`,
    displayName: 'First Day of Week'
  },
  numberFormat: {
    undoable: false,
    formatDescription: (oldVal, newVal) => `Changed number format from ${oldVal === 'comma' ? '1,234.56' : '1.234,56'} to ${newVal === 'comma' ? '1,234.56' : '1.234,56'}`,
    displayName: 'Number Format'
  },
  defaultPaymentMethod: {
    undoable: false,
    formatDescription: (oldVal, newVal) => {
      const labels = { bank_account: 'Account', credit_card: 'Credit Card' };
      return `Changed default payment method from ${labels[oldVal] || oldVal} to ${labels[newVal] || newVal}`;
    },
    displayName: 'Default Payment Method'
  },
  autoCategorization: { undoable: false, formatDescription: toggle('auto-categorization'), displayName: 'Auto-Categorization' },
  roundUpTransactions: { undoable: false, formatDescription: toggle('round up transactions'), displayName: 'Round Up Transactions' },
  monthlyBudgetEnabled: { undoable: false, formatDescription: toggle('monthly budget'), displayName: 'Monthly Budget' },
  budgetAlertAt80: { undoable: false, formatDescription: toggle('80% budget alert'), displayName: '80% Budget Alert' },
  budgetAlertAt90: { undoable: false, formatDescription: toggle('90% budget alert'), displayName: '90% Budget Alert' },
  budgetAlertAt100: { undoable: false, formatDescription: toggle('100% budget alert'), displayName: '100% Budget Alert' },
  defaultOverdraftAllowed: { undoable: false, formatDescription: toggle('allow overdraft by default'), displayName: 'Default Overdraft Allowed' },
  autoProcessDuePayments: { undoable: false, formatDescription: toggle('auto-process due payments'), displayName: 'Auto-Process Payments' },
  autoMarkClearedDays: {
    undoable: false,
    formatDescription: (oldVal, newVal) => (newVal > 0 ? `Enabled auto-mark cleared after ${newVal} days` : 'Disabled auto-mark cleared'),
    displayName: 'Auto-Mark Cleared'
  },
  smartSuggestions: { undoable: false, formatDescription: toggle('smart suggestions'), displayName: 'Smart Suggestions' },
  defaultTransactionTime: {
    undoable: false,
    formatDescription: (oldVal, newVal) => `Changed transaction timestamp from ${oldVal === 'now' ? 'current time' : 'custom time'} to ${newVal === 'now' ? 'current time' : 'custom time'}`,
    displayName: 'Transaction Timestamp'
  },
  customTransactionTime: {
    undoable: false,
    formatDescription: (oldVal, newVal) => `Changed custom transaction time from ${oldVal} to ${newVal}`,
    displayName: 'Custom Transaction Time'
  },
  requireNotesForExpensesOver: {
    undoable: false,
    formatDescription: (oldVal, newVal) => (newVal > 0 ? `Set require notes for expenses over ${formatCurrency(newVal)}` : 'Disabled require notes for large expenses'),
    displayName: 'Require Notes for Expenses'
  },
  requireNotesForPayments: {
    undoable: false,
    formatDescription: (oldVal, newVal) => (newVal ? 'Enabled require notes for all payments' : 'Disabled require notes for payments'),
    displayName: 'Require Notes for Payments'
  },
  confirmLargeTransactions: { undoable: false, formatDescription: toggle('confirm large transactions'), displayName: 'Confirm Large Transactions' },
  largeTransactionThreshold: {
    undoable: false,
    formatDescription: (oldVal, newVal) => `Changed large transaction threshold from ${formatCurrency(oldVal)} to ${formatCurrency(newVal)}`,
    displayName: 'Large Transaction Threshold'
  },
  defaultAlertDays: {
    undoable: false,
    formatDescription: (oldVal, newVal) => `Changed default alert days from ${oldVal} to ${newVal} days`,
    displayName: 'Default Alert Days'
  },
  creditCardAlertDays: {
    undoable: false,
    formatDescription: (oldVal, newVal) => `Changed credit card alert days from ${oldVal} to ${newVal} days`,
    displayName: 'Credit Card Alert Days'
  },
  loanAlertDays: {
    undoable: false,
    formatDescription: (oldVal, newVal) => `Changed loan alert days from ${oldVal} to ${newVal} days`,
    displayName: 'Loan Alert Days'
  },
  lowBalanceAlerts: { undoable: false, formatDescription: toggle('low balance alerts'), displayName: 'Low Balance Alerts' },
};
