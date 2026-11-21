import { loadPrefs, savePrefs } from './prefs';

// Default settings structure
export const DEFAULT_SETTINGS = {
  // Display & Appearance
  theme: 'auto',
  currency: 'CAD',
  currencySymbol: '$',
  dateFormat: 'MM/DD/YYYY',
  firstDayOfWeek: 'sunday',
  numberFormat: 'comma',
  showViewOnlyActivities: true,
  
  // Notifications & Alerts
  defaultAlertDays: 7,
  creditCardAlertDays: 7,
  loanAlertDays: 7,
  lowBalanceAlerts: true,
  lowBalanceThreshold: 100,
  emailNotifications: false,
  reminderTime: '09:00',
  
  // Financial Preferences
  defaultPaymentMethod: 'bank_account',
  autoCategorization: true,
  roundUpTransactions: false,
  monthlyBudgetEnabled: false,
  monthlyBudgetAmount: 0,
  budgetAlertAt80: true,
  budgetAlertAt90: true,
  budgetAlertAt100: true,
  defaultOverdraftAllowed: false,
  defaultOverdraftLimit: 0,
  
  // Automation & Recurring
  autoProcessDuePayments: true,
  autoMarkClearedDays: 0,
  smartSuggestions: true,
  
  // Transaction Defaults
  defaultTransactionTime: 'now',
  customTransactionTime: '12:00',
  requireNotesForExpensesOver: 0,
  requireNotesForPayments: false,
  confirmLargeTransactions: true,
  largeTransactionThreshold: 500,
  
  // Category budgets (stored as JSONB)
  categoryBudgets: {},
  
  // Transaction templates (stored as JSONB)
  transactionTemplates: [],
};

// Map JavaScript property names to snake_case database columns
const SETTINGS_COLUMN_MAP = {
  theme: 'theme',
  currency: 'currency',
  currencySymbol: 'currency_symbol',
  dateFormat: 'date_format',
  firstDayOfWeek: 'first_day_of_week',
  numberFormat: 'number_format',
  showViewOnlyActivities: 'show_view_only_activities',
  defaultAlertDays: 'default_alert_days',
  creditCardAlertDays: 'credit_card_alert_days',
  loanAlertDays: 'loan_alert_days',
  lowBalanceAlerts: 'low_balance_alerts',
  lowBalanceThreshold: 'low_balance_threshold',
  emailNotifications: 'email_notifications',
  reminderTime: 'reminder_time',
  defaultPaymentMethod: 'default_payment_method',
  autoCategorization: 'auto_categorization',
  roundUpTransactions: 'round_up_transactions',
  monthlyBudgetEnabled: 'monthly_budget_enabled',
  monthlyBudgetAmount: 'monthly_budget_amount',
  budgetAlertAt80: 'budget_alert_at_80',
  budgetAlertAt90: 'budget_alert_at_90',
  budgetAlertAt100: 'budget_alert_at_100',
  defaultOverdraftAllowed: 'default_overdraft_allowed',
  defaultOverdraftLimit: 'default_overdraft_limit',
  categoryBudgets: 'category_budgets',
  autoProcessDuePayments: 'auto_process_due_payments',
  autoMarkClearedDays: 'auto_mark_cleared_days',
  smartSuggestions: 'smart_suggestions',
  defaultTransactionTime: 'default_transaction_time',
  customTransactionTime: 'custom_transaction_time',
  requireNotesForExpensesOver: 'require_notes_for_expenses_over',
  requireNotesForPayments: 'require_notes_for_payments',
  confirmLargeTransactions: 'confirm_large_transactions',
  largeTransactionThreshold: 'large_transaction_threshold',
  transactionTemplates: 'transaction_templates',
};

export async function getAllSettings() {
  try {
    const data = await loadPrefs();
    const settings = { ...DEFAULT_SETTINGS };
    Object.keys(SETTINGS_COLUMN_MAP).forEach((jsKey) => {
      const v = data[SETTINGS_COLUMN_MAP[jsKey]];
      if (v !== undefined && v !== null) settings[jsKey] = v;
    });
    return settings;
  } catch (error) {
    console.error('Error getting all settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function getSetting(key, defaultValue = null) {
  try {
    const allSettings = await getAllSettings();
    return allSettings[key] !== undefined ? allSettings[key] : (defaultValue !== null ? defaultValue : DEFAULT_SETTINGS[key]);
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue !== null ? defaultValue : DEFAULT_SETTINGS[key];
  }
}

export async function setSetting(key, value) {
  const dbColumn = SETTINGS_COLUMN_MAP[key];
  if (!dbColumn) throw new Error(`Unknown setting key: ${key}`);
  await savePrefs({ [dbColumn]: value });
}

export async function setMultipleSettings(settings) {
  const patch = {};
  for (const [jsKey, value] of Object.entries(settings)) if (SETTINGS_COLUMN_MAP[jsKey]) patch[SETTINGS_COLUMN_MAP[jsKey]] = value;
  await savePrefs(patch);
}

export async function resetAllSettings() {
  try {
    await setMultipleSettings(DEFAULT_SETTINGS);
  } catch (error) {
    console.error('Error resetting settings:', error);
    throw error;
  }
}

export async function getCategoryBudget(categoryId) {
  try {
    const budgets = await getSetting('categoryBudgets', {});
    return budgets[categoryId] || 0;
  } catch (error) {
    console.error(`Error getting category budget for ${categoryId}:`, error);
    return 0;
  }
}

export async function setCategoryBudget(categoryId, amount) {
  try {
    const budgets = await getSetting('categoryBudgets', {});
    budgets[categoryId] = amount;
    await setSetting('categoryBudgets', budgets);
  } catch (error) {
    console.error(`Error setting category budget for ${categoryId}:`, error);
    throw error;
  }
}

export async function deleteCategoryBudget(categoryId) {
  try {
    const budgets = await getSetting('categoryBudgets', {});
    delete budgets[categoryId];
    await setSetting('categoryBudgets', budgets);
  } catch (error) {
    console.error(`Error deleting category budget for ${categoryId}:`, error);
    throw error;
  }
}
