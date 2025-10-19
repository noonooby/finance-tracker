import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  AlertCircle, 
  Trash2, 
  Database, 
  Wallet, 
  Edit2,
  Palette, 
  Bell, 
  DollarSign, 
  ChevronDown, 
  ChevronUp, 
  Target, 
  X, 
  TrendingUp, 
  Grid,
  Lightbulb
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { deleteAllUserData } from '../utils/db';
import CategoryManager from './CategoryManager';
import BudgetHistory from './BudgetHistory';
import { fetchAllKnownEntities, deleteKnownEntity } from '../utils/knownEntities';
import { formatCurrency } from '../utils/helpers';
import { getAllSettings, setSetting, setCategoryBudget, deleteCategoryBudget } from '../utils/settingsManager';
import { fetchCategories } from '../utils/categories';
import { logActivity } from '../utils/activityLogger';
import { trackCurrentMonth, checkAndFinalizePreviousMonths } from '../utils/budgetTrackingManager';
import {
  getUserPreferences,
  toggleSettingsSection,
  updateCollapsedSettingsSections
} from '../utils/userPreferencesManager';

export default function Settings({ 
  darkMode, 
  onUpdate, 
  onReloadCategories, 
  cashInHand, 
  showCashInDashboard, 
  onUpdateCashInHand, 
  onToggleCashDisplay,
  categories: categoriesProp = []
}) {
  const [deletingAll, setDeletingAll] = useState(false);
  const [knownEntities, setKnownEntities] = useState({});
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [showEntities, setShowEntities] = useState(false);
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState('');
  
  // Settings state
  const [settings, setSettings] = useState({});
  
  // Category budgets state
  const [categoryBudgetInputs, setCategoryBudgetInputs] = useState({});
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  
  // Local categories state (fallback if prop not loaded)
  const [localCategories, setLocalCategories] = useState([]);
  
  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    appearance: false,
    notifications: false,
    financial: false,
    automation: false,
    transactionDefaults: false,
    categories: false,
    categoryBudgets: false,
    budgetHistory: false,
    suggestions: false,
    cash: false,
    danger: false
  });

  // Load settings and categories on mount
  useEffect(() => {
    loadSettings();
    loadLocalCategories();
    loadSettingsUIPreferences();
  }, []);

  // Check and finalize previous month budgets on mount
  useEffect(() => {
    if (settings.categoryBudgets && Object.keys(settings.categoryBudgets).length > 0) {
      checkAndFinalizePreviousMonths(settings.categoryBudgets).catch(err => {
        console.warn('Failed to finalize previous months:', err);
      });
    }
  }, [settings.categoryBudgets]);

  const loadSettings = async () => {
    try {
      const allSettings = await getAllSettings();
      setSettings(allSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadLocalCategories = async () => {
    try {
      const cats = await fetchCategories();
      setLocalCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadSettingsUIPreferences = async () => {
    try {
      const prefs = await getUserPreferences();
      const collapsed = prefs.collapsed_settings_sections || [];
      
      // If this is first load (empty array), initialize with all sections collapsed
      if (collapsed.length === 0) {
        // Set all sections to collapsed in database
        const allSections = [
          'appearance', 'notifications', 'financial', 'automation',
          'transactionDefaults', 'categories', 'categoryBudgets', 
          'budgetHistory', 'suggestions', 'cash', 'danger'
        ];
        await updateCollapsedSettingsSections(allSections);
        // Keep UI collapsed (default state already set)
        return;
      }
      
      // Build expanded state from database
      const newExpandedState = {
        appearance: false,
        notifications: false,
        financial: false,
        automation: false,
        transactionDefaults: false,
        categories: false,
        categoryBudgets: false,
        budgetHistory: false,
        suggestions: false,
        cash: false,
        danger: false
      };
      
      // Mark sections as expanded only if they're NOT in the collapsed array
      Object.keys(newExpandedState).forEach(section => {
        newExpandedState[section] = !collapsed.includes(section);
      });
      
      setExpandedSections(newExpandedState);
    } catch (error) {
      console.error('Error loading Settings UI preferences:', error);
    }
  };

  const toggleSection = async (section) => {
    const newState = !expandedSections[section];
    console.log(`🔄 Toggling ${section}: ${expandedSections[section]} → ${newState}`);
    
    setExpandedSections(prev => ({
      ...prev,
      [section]: newState
    }));
    
    // Persist to database
    try {
      await toggleSettingsSection(section);
      console.log(`✅ Persisted ${section} to database`);
    } catch (error) {
      console.error('Error persisting section state:', error);
    }
  };
  
  const handleCollapseAll = async () => {
    const allSections = Object.keys(expandedSections);
    
    // Set all sections to collapsed
    const newExpandedState = {};
    allSections.forEach(section => {
      newExpandedState[section] = false;
    });
    
    setExpandedSections(newExpandedState);
    
    // Persist all sections as collapsed
    try {
      await updateCollapsedSettingsSections(allSections);
      console.log('✅ All sections collapsed');
    } catch (error) {
      console.error('Error collapsing all sections:', error);
    }
  };
  
  const handleExpandAll = async () => {
    const allSections = Object.keys(expandedSections);
    
    // Set all sections to expanded
    const newExpandedState = {};
    allSections.forEach(section => {
      newExpandedState[section] = true;
    });
    
    setExpandedSections(newExpandedState);
    
    // Persist no sections as collapsed (empty array)
    try {
      await updateCollapsedSettingsSections([]);
      console.log('✅ All sections expanded');
    } catch (error) {
      console.error('Error expanding all sections:', error);
    }
  };

  /**
   * Setting metadata for activity logging
   * Defines which settings are undoable vs view-only
   */
  const SETTING_METADATA = {
    // HIGH/MEDIUM PRIORITY - Undoable (with snapshot)
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
    cashInHandLowThreshold: {
      undoable: true,
      formatDescription: (oldVal, newVal) => `Updated cash in hand low threshold from ${formatCurrency(oldVal)} to ${formatCurrency(newVal)}`,
      displayName: 'Cash Low Threshold'
    },
    
    // LOW PRIORITY - View-only (no snapshot/undo)
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
        const labels = { cash_in_hand: 'Cash in Hand', bank_account: 'Bank Account', credit_card: 'Credit Card' };
        return `Changed default payment method from ${labels[oldVal] || oldVal} to ${labels[newVal] || newVal}`;
      },
      displayName: 'Default Payment Method'
    },
    autoCategorization: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled auto-categorization' : 'Disabled auto-categorization',
      displayName: 'Auto-Categorization'
    },
    roundUpTransactions: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled round up transactions' : 'Disabled round up transactions',
      displayName: 'Round Up Transactions'
    },
    monthlyBudgetEnabled: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled monthly budget' : 'Disabled monthly budget',
      displayName: 'Monthly Budget'
    },
    budgetAlertAt80: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled 80% budget alert' : 'Disabled 80% budget alert',
      displayName: '80% Budget Alert'
    },
    budgetAlertAt90: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled 90% budget alert' : 'Disabled 90% budget alert',
      displayName: '90% Budget Alert'
    },
    budgetAlertAt100: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled 100% budget alert' : 'Disabled 100% budget alert',
      displayName: '100% Budget Alert'
    },
    defaultOverdraftAllowed: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled allow overdraft by default' : 'Disabled allow overdraft by default',
      displayName: 'Default Overdraft Allowed'
    },
    autoProcessDuePayments: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled auto-process due payments' : 'Disabled auto-process due payments',
      displayName: 'Auto-Process Payments'
    },
    autoMarkClearedDays: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal > 0 ? `Enabled auto-mark cleared after ${newVal} days` : 'Disabled auto-mark cleared',
      displayName: 'Auto-Mark Cleared'
    },
    smartSuggestions: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled smart suggestions' : 'Disabled smart suggestions',
      displayName: 'Smart Suggestions'
    },
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
      formatDescription: (oldVal, newVal) => newVal > 0 ? `Set require notes for expenses over ${formatCurrency(newVal)}` : 'Disabled require notes for large expenses',
      displayName: 'Require Notes for Expenses'
    },
    requireNotesForPayments: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled require notes for all payments' : 'Disabled require notes for payments',
      displayName: 'Require Notes for Payments'
    },
    confirmLargeTransactions: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled confirm large transactions' : 'Disabled confirm large transactions',
      displayName: 'Confirm Large Transactions'
    },
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
    lowBalanceAlerts: {
      undoable: false,
      formatDescription: (oldVal, newVal) => newVal ? 'Enabled low balance alerts' : 'Disabled low balance alerts',
      displayName: 'Low Balance Alerts'
    },
  };

  const updateSetting = async (key, value) => {
    try {
      const oldValue = settings[key];
      await setSetting(key, value);
      setSettings(prev => ({ ...prev, [key]: value }));
      
      // Log activity if metadata exists for this setting
      const metadata = SETTING_METADATA[key];
      if (metadata) {
        const description = metadata.formatDescription(oldValue, value);
        
        if (metadata.undoable) {
          // HIGH/MEDIUM priority - log with snapshot for undo
          await logActivity(
            'edit_setting',
            key,
            `setting-${key}`,
            metadata.displayName,
            description,
            {
              settingKey: key,
              previousValue: oldValue,
              newValue: value
            }
          );
        } else {
          // LOW priority - log without snapshot (view-only)
          await logActivity(
            'setting_change',
            key,
            `setting-${key}`,
            metadata.displayName,
            description,
            null  // No snapshot = no undo button
          );
        }
      }
      
      // Silent success (consistent with rest of app)
    } catch (error) {
      console.error(`Error updating setting ${key}:`, error);
      alert('Failed to update setting. Please try again.');
    }
  };
  
  const handleSetCategoryBudget = async (categoryId) => {
    const amount = parseFloat(categoryBudgetInputs[categoryId]);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid budget amount');
      return;
    }

    try {
      setLoadingBudgets(true);
      
      // Get category name for description
      const category = categories.find(c => c.id === categoryId);
      const categoryName = category?.name || 'Category';
      
      // Get previous budget (if any)
      const previousBudget = categoryBudgets[categoryId] || 0;
      
      await setCategoryBudget(categoryId, amount);
      
      // Update local state
      const updatedBudgets = { ...(settings.categoryBudgets || {}), [categoryId]: amount };
      setSettings(prev => ({ ...prev, categoryBudgets: updatedBudgets }));
      
      // Clear input
      setCategoryBudgetInputs(prev => ({ ...prev, [categoryId]: '' }));
      
      // Log activity with snapshot for undo
      const description = previousBudget > 0
        ? `Updated ${categoryName} budget from ${formatCurrency(previousBudget)} to ${formatCurrency(amount)} per month`
        : `Set ${categoryName} budget to ${formatCurrency(amount)} per month`;
      
      await logActivity(
        'set_budget',
        'category_budget',
        categoryId,
        categoryName,
        description,
        {
          settingKey: 'categoryBudgets',
          categoryId,
          amount,
          previousBudget,
          categoryName
        }
      );
      
      // Track budget for current month (background operation)
      trackCurrentMonth(categoryId, amount).catch(err => {
        console.warn('Failed to track budget:', err);
      });
      
      console.log('✅ Category budget saved');
    } catch (error) {
      console.error('Error setting category budget:', error);
      alert('Failed to save category budget');
    } finally {
      setLoadingBudgets(false);
    }
  };

  const handleDeleteCategoryBudget = async (categoryId) => {
    if (!window.confirm('Remove budget for this category?')) return;

    try {
      setLoadingBudgets(true);
      
      // Get category name and current budget for description
      const category = categories.find(c => c.id === categoryId);
      const categoryName = category?.name || 'Category';
      const previousBudget = categoryBudgets[categoryId] || 0;
      
      await deleteCategoryBudget(categoryId);
      
      // Update local state
      const updatedBudgets = { ...(settings.categoryBudgets || {}) };
      delete updatedBudgets[categoryId];
      setSettings(prev => ({ ...prev, categoryBudgets: updatedBudgets }));
      
      // Note: We keep historical budget data even when budget is deleted
      // This preserves historical trends for analysis
      
      // Log activity with snapshot for undo
      await logActivity(
        'delete_budget',
        'category_budget',
        categoryId,
        categoryName,
        `Removed ${categoryName} budget (was ${formatCurrency(previousBudget)} per month)`,
        {
          settingKey: 'categoryBudgets',
          categoryId,
          previousBudget,
          categoryName
        }
      );
      
      console.log('✅ Category budget removed');
    } catch (error) {
      console.error('Error deleting category budget:', error);
      alert('Failed to remove category budget');
    } finally {
      setLoadingBudgets(false);
    }
  };
  
  const handleDeleteAllData = async () => {
    if (!window.confirm('This will permanently delete all of your data for this account. This action cannot be undone. Continue?')) {
      return;
    }

    setDeletingAll(true);

    try {
      await deleteAllUserData();
      alert('All data deleted successfully');
      if (onUpdate) await onUpdate();
      if (onReloadCategories) await onReloadCategories();
    } catch (error) {
      console.error('Error deleting data:', error);
      alert('Failed to delete data. Please try again.');
    } finally {
      setDeletingAll(false);
    }
  };

  const handleLoadEntities = async () => {
    setLoadingEntities(true);
    try {
      const entities = await fetchAllKnownEntities();
      setKnownEntities(entities);
      setShowEntities(true);
    } catch (error) {
      console.error('Error loading entities:', error);
      alert('Error loading suggestions. Please try again.');
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleDeleteEntity = async (entityId, entityType) => {
    if (!window.confirm('Delete this suggestion?')) return;
  
    try {
      await deleteKnownEntity(entityId);
      await handleLoadEntities();
      console.log('✅ Suggestion deleted');
    } catch (error) {
      console.error('Error deleting entity:', error);
      alert('Error deleting suggestion');
    }
  };
  
  const handleEditCash = () => {
    setCashInput((cashInHand || 0).toString());
    setEditingCash(true);
  };
  
  const handleSaveCash = async () => {
    const newAmount = parseFloat(cashInput);
    if (isNaN(newAmount) || newAmount < 0) {
      alert('Please enter a valid amount (0 or positive)');
      return;
    }
    
    try {
      const oldAmount = cashInHand || 0;
      
      if (onUpdateCashInHand) {
        await onUpdateCashInHand(newAmount);
        
        // Log activity with snapshot for undo (HIGH PRIORITY)
        await logActivity(
          'edit_setting',
          'cash_in_hand',
          'cash-in-hand',
          'Cash in Hand',
          `Updated cash in hand from ${formatCurrency(oldAmount)} to ${formatCurrency(newAmount)}`,
          {
            settingKey: 'cashInHand',
            previousValue: oldAmount,
            newValue: newAmount
          }
        );
        
        console.log('✅ Cash in hand updated');
      }
      setEditingCash(false);
      setCashInput('');
    } catch (error) {
      console.error('Error updating cash in hand:', error);
      alert('Error updating cash in hand');
    }
  };
  
  const handleCancelEditCash = () => {
    setEditingCash(false);
    setCashInput('');
  };

  const handleToggleCashDisplay = async (show) => {
    if (onToggleCashDisplay) {
      await onToggleCashDisplay(show);
      
      // Log as view-only activity (LOW PRIORITY)
      await logActivity(
        'setting_change',
        'showCashInDashboard',
        'setting-showCashInDashboard',
        'Cash Display',
        show ? 'Enabled cash breakdown on dashboard' : 'Disabled cash breakdown on dashboard',
        null  // No snapshot = no undo
      );
      
      console.log('✅ Cash display toggled');
    }
  };

  const SectionHeader = ({ title, icon: Icon, section }) => (
    <button
      onClick={() => toggleSection(section)}
      className={`w-full flex items-center justify-between p-4 rounded-lg transition-colors ${
        darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon size={20} className={darkMode ? 'text-gray-300' : 'text-gray-700'} />
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      {expandedSections[section] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>
  );

  // Use either prop categories or locally loaded categories
  const categories = categoriesProp.length > 0 ? categoriesProp : localCategories;
  const expenseCategories = categories.filter(cat => !cat.is_income);
  const categoryBudgets = settings.categoryBudgets || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon size={24} />
          Settings
        </h2>
        
        {/* Collapse/Expand All Button */}
        <button
          onClick={() => {
            // Check if any sections are expanded
            const anyExpanded = Object.values(expandedSections).some(val => val === true);
            if (anyExpanded) {
              handleCollapseAll();
            } else {
              handleExpandAll();
            }
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            darkMode
              ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {Object.values(expandedSections).some(val => val === true) ? (
            <>
              <ChevronUp size={18} />
              Collapse All
            </>
          ) : (
            <>
              <ChevronDown size={18} />
              Expand All
            </>
          )}
        </button>
      </div>

      {/* Display & Appearance */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden`}>
        <SectionHeader title="Display & Appearance" icon={Palette} section="appearance" />
        
        {expandedSections.appearance && (
          <div className="p-6 space-y-4 border-t border-gray-700">
            {/* Currency Settings */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Default Currency
              </label>
              <select
                value={settings.currency || 'CAD'}
                onChange={(e) => {
                  const curr = e.target.value;
                  const symbols = { USD: '$', CAD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' };
                  updateSetting('currency', curr);
                  updateSetting('currencySymbol', symbols[curr] || '$');
                }}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="CAD">CAD - Canadian Dollar ($)</option>
                <option value="USD">USD - US Dollar ($)</option>
                <option value="EUR">EUR - Euro (€)</option>
                <option value="GBP">GBP - British Pound (£)</option>
                <option value="INR">INR - Indian Rupee (₹)</option>
                <option value="JPY">JPY - Japanese Yen (¥)</option>
              </select>
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                This will be used for all monetary displays throughout the app
              </p>
            </div>

            {/* Date Format */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Date Format
              </label>
              <select
                value={settings.dateFormat || 'MM/DD/YYYY'}
                onChange={(e) => updateSetting('dateFormat', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</option>
              </select>
            </div>

            {/* First Day of Week */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                First Day of Week
              </label>
              <select
                value={settings.firstDayOfWeek || 'sunday'}
                onChange={(e) => updateSetting('firstDayOfWeek', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="sunday">Sunday</option>
                <option value="monday">Monday</option>
              </select>
            </div>

            {/* Number Format */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Number Format
              </label>
              <select
                value={settings.numberFormat || 'comma'}
                onChange={(e) => updateSetting('numberFormat', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="comma">1,234.56 (Comma for thousands)</option>
                <option value="period">1.234,56 (Period for thousands)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Notifications & Alerts */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden`}>
        <SectionHeader title="Notifications & Alerts" icon={Bell} section="notifications" />
        
        {expandedSections.notifications && (
          <div className="p-6 space-y-4 border-t border-gray-700">
            {/* Default Alert Days */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Default Alert Days (General)
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={settings.defaultAlertDays || 7}
                onChange={(e) => updateSetting('defaultAlertDays', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              />
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Alert me this many days before due dates
              </p>
            </div>

            {/* Credit Card Alert Days */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Credit Card Payment Alert Days
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={settings.creditCardAlertDays || 7}
                onChange={(e) => updateSetting('creditCardAlertDays', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              />
            </div>

            {/* Loan Alert Days */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Loan Payment Alert Days
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={settings.loanAlertDays || 7}
                onChange={(e) => updateSetting('loanAlertDays', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              />
            </div>

            {/* Low Balance Alerts */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={settings.lowBalanceAlerts !== false}
                  onChange={(e) => updateSetting('lowBalanceAlerts', e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Enable Low Balance Alerts
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    Alert when bank account balance falls below threshold
                  </div>
                </div>
              </label>

              {settings.lowBalanceAlerts !== false && (
                <div className="space-y-3 mt-3">
                  <div>
                    <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Bank Account Low Balance Threshold
                    </label>
                    <input
                      type="number"
                      step="10"
                      value={settings.lowBalanceThreshold || 100}
                      onChange={(e) => updateSetting('lowBalanceThreshold', parseFloat(e.target.value))}
                      className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Cash in Hand Low Threshold
                    </label>
                    <input
                      type="number"
                      step="10"
                      value={settings.cashInHandLowThreshold || 50}
                      onChange={(e) => updateSetting('cashInHandLowThreshold', parseFloat(e.target.value))}
                      className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Financial Preferences */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden`}>
        <SectionHeader title="Financial Preferences" icon={DollarSign} section="financial" />
        
        {expandedSections.financial && (
          <div className="p-6 space-y-4 border-t border-gray-700">
            {/* Default Payment Method */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Default Payment Method
              </label>
              <select
                value={settings.defaultPaymentMethod || 'cash_in_hand'}
                onChange={(e) => updateSetting('defaultPaymentMethod', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="cash_in_hand">Cash in Hand</option>
                <option value="bank_account">Bank Account</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>

            {/* Auto Categorization */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoCategorization !== false}
                  onChange={(e) => updateSetting('autoCategorization', e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Enable Auto-Categorization
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    Automatically suggest categories based on transaction description
                  </div>
                </div>
              </label>
            </div>

            {/* Round Up Transactions */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.roundUpTransactions === true}
                  onChange={(e) => updateSetting('roundUpTransactions', e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Round Up Transactions
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    Automatically round expenses to the nearest dollar
                  </div>
                </div>
              </label>
            </div>

            {/* Monthly Budget */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={settings.monthlyBudgetEnabled === true}
                  onChange={(e) => updateSetting('monthlyBudgetEnabled', e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Enable Monthly Budget
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    Set an overall monthly spending limit
                  </div>
                </div>
              </label>

              {settings.monthlyBudgetEnabled === true && (
                <div className="space-y-3 mt-3">
                  <div>
                    <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Monthly Budget Amount
                    </label>
                    <input
                      type="number"
                      step="100"
                      value={settings.monthlyBudgetAmount || 0}
                      onChange={(e) => updateSetting('monthlyBudgetAmount', parseFloat(e.target.value))}
                      className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                      placeholder="e.g., 3000"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={`block text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Budget Alerts
                    </label>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.budgetAlertAt80 !== false}
                        onChange={(e) => updateSetting('budgetAlertAt80', e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Alert at 80% of budget
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.budgetAlertAt90 !== false}
                        onChange={(e) => updateSetting('budgetAlertAt90', e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Alert at 90% of budget
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.budgetAlertAt100 !== false}
                        onChange={(e) => updateSetting('budgetAlertAt100', e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Alert when budget exceeded
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Default Overdraft Settings */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={settings.defaultOverdraftAllowed === true}
                  onChange={(e) => updateSetting('defaultOverdraftAllowed', e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Allow Overdraft by Default
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    New bank accounts will allow overdraft up to limit
                  </div>
                </div>
              </label>

              {settings.defaultOverdraftAllowed === true && (
                <div>
                  <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Default Overdraft Limit
                  </label>
                  <input
                    type="number"
                    step="100"
                    value={settings.defaultOverdraftLimit || 0}
                    onChange={(e) => updateSetting('defaultOverdraftLimit', parseFloat(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                    placeholder="e.g., 500"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Automation & Recurring */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden`}>
        <SectionHeader title="Automation & Recurring" icon={SettingsIcon} section="automation" />
        
        {expandedSections.automation && (
          <div className="p-6 space-y-4 border-t border-gray-700">
            {/* Auto Process Due Payments */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoProcessDuePayments !== false}
                  onChange={(e) => updateSetting('autoProcessDuePayments', e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Auto-Process Due Payments
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    Automatically process overdue credit card and loan payments from linked reserved funds
                  </div>
                </div>
              </label>
            </div>

            {/* Auto Mark Cleared */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={settings.autoMarkClearedDays > 0}
                  onChange={(e) => updateSetting('autoMarkClearedDays', e.target.checked ? 7 : 0)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Auto-Mark Transactions as Cleared
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    Automatically mark transactions as cleared after specified days
                  </div>
                </div>
              </label>

              {settings.autoMarkClearedDays > 0 && (
                <div>
                  <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Days Until Auto-Clear
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={settings.autoMarkClearedDays || 7}
                    onChange={(e) => updateSetting('autoMarkClearedDays', parseInt(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                    placeholder="e.g., 7"
                  />
                </div>
              )}
            </div>

            {/* Smart Suggestions */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.smartSuggestions !== false}
                  onChange={(e) => updateSetting('smartSuggestions', e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Enable Smart Suggestions
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    Show intelligent suggestions for budgeting and financial planning
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Defaults */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden`}>
        <SectionHeader title="Transaction Defaults" icon={Wallet} section="transactionDefaults" />
        
        {expandedSections.transactionDefaults && (
          <div className="p-6 space-y-4 border-t border-gray-700">
            {/* Default Transaction Time */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Transaction Timestamp
              </label>
              <select
                value={settings.defaultTransactionTime || 'now'}
                onChange={(e) => updateSetting('defaultTransactionTime', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="now">Use Current Time</option>
                <option value="custom">Use Custom Time</option>
              </select>
            </div>

            {settings.defaultTransactionTime === 'custom' && (
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Custom Transaction Time
                </label>
                <input
                  type="time"
                  value={settings.customTransactionTime || '12:00'}
                  onChange={(e) => updateSetting('customTransactionTime', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                />
              </div>
            )}

            {/* Require Notes for Large Expenses */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={settings.requireNotesForExpensesOver > 0}
                  onChange={(e) => updateSetting('requireNotesForExpensesOver', e.target.checked ? 100 : 0)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Require Notes for Large Expenses
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    Make notes mandatory for expenses over a certain amount
                  </div>
                </div>
              </label>

              {settings.requireNotesForExpensesOver > 0 && (
                <div>
                  <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Amount Threshold
                  </label>
                  <input
                    type="number"
                    step="10"
                    value={settings.requireNotesForExpensesOver || 100}
                    onChange={(e) => updateSetting('requireNotesForExpensesOver', parseFloat(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                    placeholder="e.g., 100"
                  />
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Notes will be required for expenses over ${formatCurrency(settings.requireNotesForExpensesOver || 100)}
                  </p>
                </div>
              )}
            </div>

            {/* Require Notes for Payments */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.requireNotesForPayments === true}
                  onChange={(e) => updateSetting('requireNotesForPayments', e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Require Notes for All Payments
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    Make notes mandatory when making credit card or loan payments
                  </div>
                </div>
              </label>
            </div>

            {/* Confirm Large Transactions */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={settings.confirmLargeTransactions !== false}
                  onChange={(e) => updateSetting('confirmLargeTransactions', e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Confirm Large Transactions
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    Show confirmation dialog for transactions over a certain amount
                  </div>
                </div>
              </label>

              {settings.confirmLargeTransactions !== false && (
                <div>
                  <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Large Transaction Threshold
                  </label>
                  <input
                    type="number"
                    step="50"
                    value={settings.largeTransactionThreshold || 500}
                    onChange={(e) => updateSetting('largeTransactionThreshold', parseFloat(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                    placeholder="e.g., 500"
                  />
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Confirm transactions over ${formatCurrency(settings.largeTransactionThreshold || 500)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Category Manager Section */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden`}>
        <SectionHeader title="Categories" icon={Grid} section="categories" />
        
        {expandedSections.categories && (
          <div className="p-6 border-t border-gray-700">
            <CategoryManager
              darkMode={darkMode}
              onUpdate={() => {
                onReloadCategories();
                loadLocalCategories();
              }}
            />
          </div>
        )}
      </div>

      {/* Budget History Section */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden`}>
        <SectionHeader title="Budget History" icon={TrendingUp} section="budgetHistory" />
        
        {expandedSections.budgetHistory && (
          <div className="p-6 border-t border-gray-700">
            <BudgetHistory
              darkMode={darkMode}
              categories={categories}
              categoryBudgets={categoryBudgets}
            />
          </div>
        )}
      </div>

      {/* Category Budgets Section */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden`}>
        <SectionHeader title="Category Budgets" icon={Target} section="categoryBudgets" />
        
        {expandedSections.categoryBudgets && (
          <div className="p-6 space-y-4 border-t border-gray-700">
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Set monthly spending limits for each expense category to track and control your spending.
            </p>

            {expenseCategories.length === 0 ? (
              <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <Target size={48} className="mx-auto mb-3 opacity-30" />
                <p>Loading categories...</p>
                <p className="text-sm mt-1">If categories don't appear, add them in the Categories section above</p>
              </div>
            ) : (
              <div className="space-y-3">
                {expenseCategories.map(category => {
                  const currentBudget = categoryBudgets[category.id];
                  const hasBudget = currentBudget && currentBudget > 0;

                  return (
                    <div
                      key={category.id}
                      className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const iconName = category.icon || 'Package';
                            const IconComponent = Icons[iconName] || Icons.Package;
                            return <IconComponent size={20} className="text-gray-500" />;
                          })()}
                          <div>
                            <div className={`font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                              {category.name}
                            </div>
                            {hasBudget && (
                              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                Monthly Budget: {formatCurrency(currentBudget)}
                              </div>
                            )}
                          </div>
                        </div>
                        {hasBudget && (
                          <button
                            onClick={() => handleDeleteCategoryBudget(category.id)}
                            className={`p-2 rounded ${darkMode ? 'hover:bg-gray-600 text-red-400' : 'hover:bg-gray-200 text-red-600'}`}
                            title="Remove budget"
                            disabled={loadingBudgets}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>

                      {!hasBudget && (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="number"
                            step="10"
                            placeholder="Monthly budget amount"
                            value={categoryBudgetInputs[category.id] || ''}
                            onChange={(e) => setCategoryBudgetInputs(prev => ({
                              ...prev,
                              [category.id]: e.target.value
                            }))}
                            className={`flex-1 px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                          />
                          <button
                            onClick={() => handleSetCategoryBudget(category.id)}
                            disabled={loadingBudgets || !categoryBudgetInputs[category.id]}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Set
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className={`${darkMode ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-200'} border rounded-lg p-3 mt-4`}>
              <p className={`text-xs flex items-center gap-2 ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                <Lightbulb size={14} className="flex-shrink-0" />
                <span><strong>Tip:</strong> Category budgets are tracked automatically! View your spending trends and history in the "Budget History" section above.</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Manage Suggestions Section */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden`}>
        <button
          onClick={() => toggleSection('suggestions')}
          className={`w-full flex items-center justify-between p-4 rounded-lg transition-colors ${
            darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <Database size={20} className={darkMode ? 'text-gray-300' : 'text-gray-700'} />
            <h3 className="text-lg font-semibold">Manage Learned Suggestions</h3>
          </div>
          {expandedSections.suggestions ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        
        {expandedSections.suggestions && (
          <div className="p-6 space-y-4 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                View and manage suggestions that the app has learned from your inputs.
              </p>
              <button
                onClick={handleLoadEntities}
                disabled={loadingEntities}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${darkMode ? 'border-blue-500 text-blue-400 hover:bg-blue-900/30' : 'border-blue-600 text-blue-600 hover:bg-blue-50'}`}
              >
                <Database size={20} />
                <span>{loadingEntities ? 'Loading...' : showEntities ? 'Refresh' : 'View'}</span>
              </button>
            </div>

            {showEntities && Object.keys(knownEntities).length > 0 && (
              <div className="space-y-4 mt-4">
                {Object.entries(knownEntities).map(([type, entities]) => (
                  <div key={type} className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
                    <h4 className="font-semibold mb-2 capitalize">{type.replace('_', ' ')}s ({entities.length})</h4>
                    <div className="space-y-2">
                      {entities.map(entity => (
                        <div
                          key={entity.id}
                          className={`flex items-center justify-between p-2 rounded ${
                            darkMode ? 'bg-gray-700' : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex-1">
                            <span className="font-medium">{entity.name}</span>
                            <span className={`text-sm ml-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              (used {entity.usage_count} {entity.usage_count === 1 ? 'time' : 'times'})
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteEntity(entity.id, type)}
                            className={`p-2 rounded ${darkMode ? 'hover:bg-gray-600 text-red-400' : 'hover:bg-gray-200 text-red-600'}`}
                            title="Delete suggestion"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showEntities && Object.keys(knownEntities).length === 0 && (
              <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
              }`}>
                <Database size={20} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
                <div className="flex-1">
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    No learned suggestions yet. The SmartInput feature will automatically learn from your entries as you use the app.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Cash Management Section */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden`}>
        <button
          onClick={() => toggleSection('cash')}
          className={`w-full flex items-center justify-between p-4 rounded-lg transition-colors ${
            darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <Wallet size={20} className={darkMode ? 'text-gray-300' : 'text-gray-700'} />
            <h3 className="text-lg font-semibold">Cash Management</h3>
          </div>
          {expandedSections.cash ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        
        {expandedSections.cash && (
          <div className="p-6 space-y-4 border-t border-gray-700">
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Manage physical cash separate from bank accounts.
            </p>
            
            {/* Cash in Hand Balance */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Cash in Hand</span>
                {!editingCash && (
                  <button
                    onClick={handleEditCash}
                    className={`p-1 rounded ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'}`}
                    title="Edit cash in hand"
                  >
                    <Edit2 size={16} />
                  </button>
                )}
              </div>
              
              {editingCash ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    className={`flex-1 px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                    placeholder="0.00"
                  />
                  <button
                    onClick={handleSaveCash}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelEditCash}
                    className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'}`}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(cashInHand || 0)}
                </div>
              )}
            </div>
            
            {/* Display Toggle */}
            <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCashInDashboard || false}
                  onChange={(e) => handleToggleCashDisplay(e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Show Cash in Hand on Dashboard</div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    Display cash breakdown (cash in hand + bank accounts) on Dashboard
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className={`${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'} rounded-lg overflow-hidden`}>
        <button
          onClick={() => toggleSection('danger')}
          className={`w-full flex items-center justify-between p-4 rounded-lg transition-colors ${
            darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
          }`}
        >
          <h3 className="text-lg font-semibold text-red-600">Danger Zone</h3>
          {expandedSections.danger ? <ChevronUp size={20} className="text-red-600" /> : <ChevronDown size={20} className="text-red-600" />}
        </button>
        
        {expandedSections.danger && (
          <div className="p-6 space-y-3 border-t border-gray-700">
            <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Delete all data associated with this account, including cards, loans, reserved funds, income, transactions, categories, and activity history.
            </p>
            <button
              onClick={handleDeleteAllData}
              disabled={deletingAll}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg ${deletingAll ? 'bg-red-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'} text-white`}
            >
              <AlertCircle size={20} />
              <span>{deletingAll ? 'Deleting...' : 'Delete All Data'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
