import { supabase } from './supabase';

// Default settings structure
export const DEFAULT_SETTINGS = {
  // Display & Appearance
  theme: 'auto',
  currency: 'USD',
  currencySymbol: '$',
  dateFormat: 'MM/DD/YYYY',
  firstDayOfWeek: 'sunday',
  numberFormat: 'comma',
  
  // Notifications & Alerts
  defaultAlertDays: 7,
  creditCardAlertDays: 7,
  loanAlertDays: 7,
  lowBalanceAlerts: true,
  lowBalanceThreshold: 100,
  cashInHandLowThreshold: 50,
  emailNotifications: false,
  reminderTime: '09:00',
  
  // Financial Preferences
  defaultPaymentMethod: 'cash_in_hand',
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
  autoMarkClearedDays: 0, // 0 = disabled, otherwise days until auto-clear
  smartSuggestions: true,
  
  // Transaction Defaults
  defaultTransactionTime: 'now', // 'now' or 'custom'
  customTransactionTime: '12:00',
  requireNotesForExpensesOver: 0, // 0 = disabled, otherwise amount threshold
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
  defaultAlertDays: 'default_alert_days',
  creditCardAlertDays: 'credit_card_alert_days',
  loanAlertDays: 'loan_alert_days',
  lowBalanceAlerts: 'low_balance_alerts',
  lowBalanceThreshold: 'low_balance_threshold',
  cashInHandLowThreshold: 'cash_in_hand_low_threshold',
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
  // Automation & Recurring
  autoProcessDuePayments: 'auto_process_due_payments',
  autoMarkClearedDays: 'auto_mark_cleared_days',
  smartSuggestions: 'smart_suggestions',
  // Transaction Defaults
  defaultTransactionTime: 'default_transaction_time',
  customTransactionTime: 'custom_transaction_time',
  requireNotesForExpensesOver: 'require_notes_for_expenses_over',
  requireNotesForPayments: 'require_notes_for_payments',
  confirmLargeTransactions: 'confirm_large_transactions',
  largeTransactionThreshold: 'large_transaction_threshold',
  transactionTemplates: 'transaction_templates',
};

/**
 * Get all settings from the database
 * @returns {Promise<Object>} All settings merged with defaults
 */
export async function getAllSettings() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (error && error.code !== 'PGRST116') throw error;

    // Start with defaults
    const settings = { ...DEFAULT_SETTINGS };

    // Merge database values
    if (data) {
      Object.keys(SETTINGS_COLUMN_MAP).forEach(jsKey => {
        const dbKey = SETTINGS_COLUMN_MAP[jsKey];
        if (data[dbKey] !== undefined && data[dbKey] !== null) {
          settings[jsKey] = data[dbKey];
        }
      });
    }

    return settings;
  } catch (error) {
    console.error('Error getting all settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Get a specific setting value
 * @param {string} key - Setting key (JavaScript camelCase)
 * @param {*} defaultValue - Default value if setting doesn't exist
 * @returns {Promise<*>} Setting value
 */
export async function getSetting(key, defaultValue = null) {
  try {
    const allSettings = await getAllSettings();
    return allSettings[key] !== undefined ? allSettings[key] : (defaultValue !== null ? defaultValue : DEFAULT_SETTINGS[key]);
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue !== null ? defaultValue : DEFAULT_SETTINGS[key];
  }
}

/**
 * Set a setting value in the database
 * @param {string} key - Setting key (JavaScript camelCase)
 * @param {*} value - Setting value
 * @returns {Promise<void>}
 */
export async function setSetting(key, value) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const dbColumn = SETTINGS_COLUMN_MAP[key];
    if (!dbColumn) {
      throw new Error(`Unknown setting key: ${key}`);
    }

    // Check if settings row exists
    const { data: existing } = await supabase
      .from('settings')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const updateData = {
      [dbColumn]: value,
      updated_at: new Date().toISOString()
    };

    if (existing) {
      // Update existing row
      const { error } = await supabase
        .from('settings')
        .update(updateData)
        .eq('user_id', user.id);
      
      if (error) throw error;
    } else {
      // Insert new row with all defaults
      const insertData = {
        user_id: user.id,
        ...updateData
      };
      
      const { error } = await supabase
        .from('settings')
        .insert(insertData);
      
      if (error) throw error;
    }
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
    throw error;
  }
}

/**
 * Set multiple settings at once
 * @param {Object} settings - Object with setting key-value pairs (JavaScript camelCase)
 * @returns {Promise<void>}
 */
export async function setMultipleSettings(settings) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if settings row exists
    const { data: existing } = await supabase
      .from('settings')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // Convert JavaScript keys to database columns
    const updateData = {};
    Object.entries(settings).forEach(([jsKey, value]) => {
      const dbColumn = SETTINGS_COLUMN_MAP[jsKey];
      if (dbColumn) {
        updateData[dbColumn] = value;
      }
    });
    updateData.updated_at = new Date().toISOString();

    if (existing) {
      // Update existing row
      const { error } = await supabase
        .from('settings')
        .update(updateData)
        .eq('user_id', user.id);
      
      if (error) throw error;
    } else {
      // Insert new row
      const insertData = {
        user_id: user.id,
        ...updateData
      };
      
      const { error } = await supabase
        .from('settings')
        .insert(insertData);
      
      if (error) throw error;
    }
  } catch (error) {
    console.error('Error setting multiple settings:', error);
    throw error;
  }
}

/**
 * Reset all settings to defaults
 * @returns {Promise<void>}
 */
export async function resetAllSettings() {
  try {
    await setMultipleSettings(DEFAULT_SETTINGS);
  } catch (error) {
    console.error('Error resetting settings:', error);
    throw error;
  }
}

/**
 * Get category budget
 * @param {string} categoryId - Category ID
 * @returns {Promise<number>} Budget amount (0 if not set)
 */
export async function getCategoryBudget(categoryId) {
  try {
    const budgets = await getSetting('categoryBudgets', {});
    return budgets[categoryId] || 0;
  } catch (error) {
    console.error(`Error getting category budget for ${categoryId}:`, error);
    return 0;
  }
}

/**
 * Set category budget
 * @param {string} categoryId - Category ID
 * @param {number} amount - Budget amount
 * @returns {Promise<void>}
 */
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

/**
 * Delete category budget
 * @param {string} categoryId - Category ID
 * @returns {Promise<void>}
 */
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
