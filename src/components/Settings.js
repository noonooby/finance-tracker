import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, AlertCircle, Trash2, Database, CheckCircle, Wallet, Edit2,
  Palette, Bell, DollarSign, ChevronDown, ChevronUp
} from 'lucide-react';
import { deleteAllUserData, dbOperation } from '../utils/db';
import CategoryManager from './CategoryManager';
import { fetchAllKnownEntities, deleteKnownEntity } from '../utils/knownEntities';
import { formatCurrency } from '../utils/helpers';
import { getAllSettings, setSetting, setMultipleSettings, setCategoryBudget, getCategoryBudget } from '../utils/settingsManager';

export default function Settings({ 
  darkMode, 
  onUpdate, 
  onReloadCategories, 
  cashInHand, 
  showCashInDashboard, 
  onUpdateCashInHand, 
  onToggleCashDisplay,
  categories = []
}) {
  const [message, setMessage] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [knownEntities, setKnownEntities] = useState({});
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [showEntities, setShowEntities] = useState(false);
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState('');
  
  // Settings state
  const [settings, setSettings] = useState({});
  const [loadingSettings, setLoadingSettings] = useState(true);
  
  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    appearance: false,
    notifications: false,
    financial: false,
    automation: false,
    transactionDefaults: false,
    categories: true,
    suggestions: false,
    cash: false,
    danger: false
  });

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const allSettings = await getAllSettings();
      setSettings(allSettings);
      setLoadingSettings(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      showMessage('error', 'Failed to load settings');
      setLoadingSettings(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const updateSetting = async (key, value) => {
    try {
      await setSetting(key, value);
      setSettings(prev => ({ ...prev, [key]: value }));
      showMessage('success', 'Setting updated successfully');
      
      // Note: Alert days are just defaults for new items, no need to reload existing data
    } catch (error) {
      console.error(`Error updating setting ${key}:`, error);
      showMessage('error', 'Failed to update setting');
    }
  };
  
  const handleDeleteAllData = async () => {
    if (!window.confirm('This will permanently delete all of your data for this account. This action cannot be undone. Continue?')) {
      return;
    }

    setDeletingAll(true);
    setMessage(null);

    try {
      await deleteAllUserData();
      showMessage('success', 'All data deleted successfully');
      if (onUpdate) await onUpdate();
      if (onReloadCategories) await onReloadCategories();
    } catch (error) {
      console.error('Error deleting data:', error);
      showMessage('error', 'Failed to delete data. Please try again.');
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
      showMessage('error', 'Error loading suggestions. Please try again.');
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleDeleteEntity = async (entityId, entityType) => {
    if (!window.confirm('Delete this suggestion?')) return;
  
    try {
      await deleteKnownEntity(entityId);
      await handleLoadEntities();
      showMessage('success', 'Suggestion deleted successfully');
    } catch (error) {
      console.error('Error deleting entity:', error);
      showMessage('error', 'Error deleting suggestion');
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
      if (onUpdateCashInHand) {
        await onUpdateCashInHand(newAmount);
        showMessage('success', 'Cash in hand updated successfully');
      }
      setEditingCash(false);
      setCashInput('');
    } catch (error) {
      console.error('Error updating cash in hand:', error);
      showMessage('error', 'Error updating cash in hand');
    }
  };
  
  const handleCancelEditCash = () => {
    setEditingCash(false);
    setCashInput('');
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <SettingsIcon size={24} />
        Settings
      </h2>

      {message && (
        <div className={`p-4 rounded-lg flex items-start gap-3 ${
          message.type === 'success' ? 'bg-green-50 text-green-800' :
          message.type === 'warning' ? 'bg-yellow-50 text-yellow-800' :
          'bg-red-50 text-red-800'
        }`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <p>{message.text}</p>
        </div>
      )}

      {/* Display & Appearance */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden`}>
        <SectionHeader title="Display & Appearance" icon={Palette} section="appearance" />
        
        {expandedSections.appearance && (
          <div className="p-6 space-y-4 border-t border-gray-700">
            {/* Currency Settings */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Currency
              </label>
              <select
                value={settings.currency || 'USD'}
                onChange={(e) => {
                  const curr = e.target.value;
                  const symbols = { USD: '$', CAD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' };
                  updateSetting('currency', curr);
                  updateSetting('currencySymbol', symbols[curr] || '$');
                }}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="USD">USD - US Dollar ($)</option>
                <option value="CAD">CAD - Canadian Dollar ($)</option>
                <option value="EUR">EUR - Euro (€)</option>
                <option value="GBP">GBP - British Pound (£)</option>
                <option value="INR">INR - Indian Rupee (₹)</option>
                <option value="JPY">JPY - Japanese Yen (¥)</option>
              </select>
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
                <option value="cash_in_hand">💵 Cash in Hand</option>
                <option value="bank_account">🏦 Bank Account</option>
                <option value="credit_card">💳 Credit Card</option>
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
        <button
          onClick={() => toggleSection('categories')}
          className={`w-full flex items-center justify-between p-4 rounded-lg transition-colors ${
            darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
          }`}
        >
          <h3 className="text-lg font-semibold">Categories</h3>
          {expandedSections.categories ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        
        {expandedSections.categories && (
          <div className="p-6 border-t border-gray-700">
            <CategoryManager
              darkMode={darkMode}
              onUpdate={onReloadCategories}
            />
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
                View and manage suggestions that Claude has learned from your inputs.
              </p>
              <button
                onClick={handleLoadEntities}
                disabled={loadingEntities}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-blue-600 text-blue-600 hover:bg-blue-50"
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
                  onChange={(e) => {
                    if (onToggleCashDisplay) {
                      onToggleCashDisplay(e.target.checked);
                      showMessage('success', e.target.checked ? 'Cash breakdown will now show on Dashboard' : 'Cash breakdown hidden from Dashboard');
                    }
                  }}
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
