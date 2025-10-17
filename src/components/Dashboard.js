import React, { useEffect, useState } from 'react';
import { AlertCircle, Settings as SettingsIcon, Eye, EyeOff, Wallet, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { formatCurrency } from '../utils/helpers';
import { withdrawCashFromBank, depositCashToBank } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import {
  getUserPreferences,
  toggleDashboardSection,
  updateDashboardWidgets,
  toggleCompactMode
} from '../utils/userPreferencesManager';

// Dashboard Widgets
import {
  CashBalanceWidget,
  UrgentObligationsWidget,
  UpcomingObligationsWidget,
  NextIncomeWidget,
  DebtSummaryWidget,
  BankAccountsWidget,
  LatestUpdatesWidget
} from './dashboard/widgets';

// Dashboard Sections
import AlertSettingsSection from './dashboard/AlertSettingsSection';

export default function Dashboard({
  darkMode,
  availableCash,
  totalReserved,
  trueAvailable,
  upcomingObligations,
  nextIncome,
  totalCreditCardDebt,
  totalLoanDebt,
  creditCards,
  loans,
  alertSettings,
  onNavigate,
  onUpdateAlertSettings,
  bankAccounts,
  cashInHand,
  showCashInDashboard,
  onUpdateCashInHand,
  onToggleCashDisplay,
  onReloadAll,
  latestActivities
}) {
  const upcomingDays = alertSettings?.upcomingDays || 30;
  
  // Dashboard preferences
  const [collapsedSections, setCollapsedSections] = useState([]);
  const [visibleWidgets, setVisibleWidgets] = useState([
    'cash_balance',
    'urgent_obligations',
    'upcoming_obligations',
    'next_income',
    'debt_summary',
    'bank_accounts',
    'latest_updates'
  ]);
  const [compactMode, setCompactMode] = useState(false);
  const [showCustomization, setShowCustomization] = useState(false);
  
  // Cash operations modal state
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashOperation, setCashOperation] = useState('withdraw');
  const [cashFormData, setCashFormData] = useState({
    accountId: '',
    amount: ''
  });
  const [processingCash, setProcessingCash] = useState(false);
  
  // Get accounts in overdraft
  const overdraftAccounts = (bankAccounts || []).filter(acc => (Number(acc.balance) || 0) < 0);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const prefs = await getUserPreferences();
      setCollapsedSections(prefs.collapsed_dashboard_sections || []);
      setVisibleWidgets(prefs.visible_dashboard_widgets || [
        'cash_balance',
        'urgent_obligations',
        'upcoming_obligations',
        'next_income',
        'debt_summary',
        'bank_accounts',
        'latest_updates'
      ]);
      setCompactMode(prefs.dashboard_compact_mode || false);
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const handleToggleSection = async (sectionId) => {
    try {
      const newCollapsed = collapsedSections.includes(sectionId)
        ? collapsedSections.filter(id => id !== sectionId)
        : [...collapsedSections, sectionId];
      
      setCollapsedSections(newCollapsed);
      await toggleDashboardSection(sectionId);
    } catch (error) {
      console.error('Error toggling section:', error);
    }
  };

  const handleToggleWidget = async (widgetId) => {
    try {
      const newVisible = visibleWidgets.includes(widgetId)
        ? visibleWidgets.filter(id => id !== widgetId)
        : [...visibleWidgets, widgetId];
      
      setVisibleWidgets(newVisible);
      await updateDashboardWidgets(newVisible);
    } catch (error) {
      console.error('Error toggling widget:', error);
    }
  };

  const handleToggleCompactMode = async () => {
    try {
      const newCompactMode = !compactMode;
      setCompactMode(newCompactMode);
      await toggleCompactMode(newCompactMode);
    } catch (error) {
      console.error('Error toggling compact mode:', error);
    }
  };

  const isWidgetVisible = (widgetId) => visibleWidgets.includes(widgetId);
  const isSectionCollapsed = (sectionId) => collapsedSections.includes(sectionId);

  const handleObligationClick = (obligation) => {
    if (!obligation || !onNavigate) return;
    const id = obligation.id;
    switch (obligation.type) {
      case 'credit_card':
        onNavigate({ view: 'cards', focus: { type: 'card', id } });
        break;
      case 'loan':
        onNavigate({ view: 'loans', focus: { type: 'loan', id } });
        break;
      case 'reserved_fund':
        onNavigate({ view: 'reserved', focus: { type: 'fund', id } });
        break;
      default:
        break;
    }
  };

  const handleSummaryNavigate = (view) => {
    if (!onNavigate) return;
    onNavigate({ view });
  };
  
  const handleCashOperation = async () => {
    if (!cashFormData.accountId || !cashFormData.amount) {
      alert('Please select an account and enter an amount');
      return;
    }
    
    const amount = parseFloat(cashFormData.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    setProcessingCash(true);
    
    try {
      let result;
      
      if (cashOperation === 'withdraw') {
        result = await withdrawCashFromBank(cashFormData.accountId, amount);
        
        await logActivity(
          'cash_withdrawal',
          'bank_account',
          result.accountId,
          result.accountName,
          `Withdrew ${formatCurrency(result.amount)} from '${result.accountName}' to cash in hand`,
          {
            accountId: result.accountId,
            accountName: result.accountName,
            amount: result.amount,
            previousBankBalance: result.previousBankBalance,
            newBankBalance: result.newBankBalance,
            previousCashInHand: result.previousCashInHand,
            newCashInHand: result.newCashInHand,
            transactionId: result.transactionId
          }
        );
        
        alert(`Successfully withdrew ${formatCurrency(amount)} from ${result.accountName} to cash in hand`);
      } else {
        result = await depositCashToBank(cashFormData.accountId, amount);
        
        await logActivity(
          'cash_deposit',
          'bank_account',
          result.accountId,
          result.accountName,
          `Deposited ${formatCurrency(result.amount)} from cash in hand to '${result.accountName}'`,
          {
            accountId: result.accountId,
            accountName: result.accountName,
            amount: result.amount,
            previousBankBalance: result.previousBankBalance,
            newBankBalance: result.newBankBalance,
            previousCashInHand: result.previousCashInHand,
            newCashInHand: result.newCashInHand,
            transactionId: result.transactionId
          }
        );
        
        alert(`Successfully deposited ${formatCurrency(amount)} from cash in hand to ${result.accountName}`);
      }
      
      if (onReloadAll) await onReloadAll();
      
      setCashFormData({ accountId: '', amount: '' });
      setShowCashModal(false);
    } catch (error) {
      console.error('Cash operation failed:', error);
      alert(error.message || 'Cash operation failed');
    } finally {
      setProcessingCash(false);
    }
  };

  const availableWidgets = [
    { id: 'cash_balance', label: 'Cash Balance', icon: '💵' },
    { id: 'urgent_obligations', label: 'Urgent Obligations', icon: '⚠️' },
    { id: 'upcoming_obligations', label: 'Upcoming Obligations', icon: '📅' },
    { id: 'next_income', label: 'Next Income', icon: '💰' },
    { id: 'debt_summary', label: 'Debt Summary', icon: '💳' },
    { id: 'bank_accounts', label: 'Bank Accounts', icon: '🏦' },
    { id: 'latest_updates', label: 'Latest Updates', icon: '📋' }
  ];

  return (
    <div className="space-y-4">
      {/* Dashboard Customization Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowCustomization(true)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            darkMode
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          <SettingsIcon size={18} />
          Customize Dashboard
        </button>
      </div>

      {/* Customization Panel */}
      {showCustomization && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowCustomization(false)}>
          <div 
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <SettingsIcon size={24} />
                Customize Dashboard
              </h3>
              <button
                onClick={() => setShowCustomization(false)}
                className={`text-2xl leading-none ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`}
              >
                ×
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Compact Mode */}
              <div>
                <h4 className="font-semibold mb-3">Display Mode</h4>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={compactMode}
                    onChange={handleToggleCompactMode}
                    className="w-4 h-4"
                  />
                  <div>
                    <div className="font-medium">Compact Mode</div>
                    <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Reduce spacing and padding for a denser view
                    </div>
                  </div>
                </label>
              </div>
              
              {/* Widget Visibility */}
              <div>
                <h4 className="font-semibold mb-3">Visible Widgets</h4>
                <div className="space-y-2">
                  {availableWidgets.map(widget => (
                    <label key={widget.id} className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                      <input
                        type="checkbox"
                        checked={isWidgetVisible(widget.id)}
                        onChange={() => handleToggleWidget(widget.id)}
                        className="w-4 h-4"
                      />
                      <span className="text-xl">{widget.icon}</span>
                      <span className="flex-1">{widget.label}</span>
                      {isWidgetVisible(widget.id) ? (
                        <Eye size={16} className="text-green-600" />
                      ) : (
                        <EyeOff size={16} className="text-gray-400" />
                      )}
                    </label>
                  ))}
                </div>
              </div>
              
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'} border`}>
                <p className="text-sm">
                  💡 <strong>Tip:</strong> Your dashboard preferences are saved automatically and will sync across all your devices.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCustomization(false)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overdraft Warning Banner */}
      {overdraftAccounts.length > 0 && (
        <div className={`${darkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border rounded-lg p-4`}>
          <div className={`flex items-center gap-2 ${darkMode ? 'text-red-200' : 'text-red-800'} font-semibold mb-2`}>
            <AlertCircle size={20} />
            <span>Overdraft Alert</span>
          </div>
          <div className="space-y-1">
            {overdraftAccounts.map(acc => (
              <div key={acc.id} className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                '{acc.name}' is in overdraft by {formatCurrency(Math.abs(acc.balance))}. Resolve soon to avoid fees.
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Cash Balance Widget */}
      {isWidgetVisible('cash_balance') && (
        <CashBalanceWidget
          darkMode={darkMode}
          availableCash={availableCash}
          totalReserved={totalReserved}
          trueAvailable={trueAvailable}
          cashInHand={cashInHand}
          bankAccounts={bankAccounts}
          showCashInDashboard={showCashInDashboard}
          compactMode={compactMode}
          onCashOperation={() => setShowCashModal(true)}
        />
      )}

      {/* Alert Settings */}
      <AlertSettingsSection
        darkMode={darkMode}
        alertSettings={alertSettings}
        compactMode={compactMode}
        isCollapsed={isSectionCollapsed('alert_settings')}
        onToggleCollapse={() => handleToggleSection('alert_settings')}
        onSave={onUpdateAlertSettings}
      />

      {/* Urgent Obligations Widget */}
      {isWidgetVisible('urgent_obligations') && (
        <UrgentObligationsWidget
          darkMode={darkMode}
          obligations={upcomingObligations}
          compactMode={compactMode}
          onObligationClick={handleObligationClick}
        />
      )}

      {/* Upcoming Obligations Widget */}
      {isWidgetVisible('upcoming_obligations') && (
        <UpcomingObligationsWidget
          darkMode={darkMode}
          obligations={upcomingObligations}
          upcomingDays={upcomingDays}
          compactMode={compactMode}
          isCollapsed={isSectionCollapsed('upcoming_obligations')}
          onToggleCollapse={() => handleToggleSection('upcoming_obligations')}
          onObligationClick={handleObligationClick}
        />
      )}

      {/* Next Income Widget */}
      {isWidgetVisible('next_income') && (
        <NextIncomeWidget
          darkMode={darkMode}
          nextIncome={nextIncome}
          compactMode={compactMode}
          onNavigate={handleSummaryNavigate}
        />
      )}

      {/* Debt Summary Widget */}
      {isWidgetVisible('debt_summary') && (
        <DebtSummaryWidget
          darkMode={darkMode}
          totalCreditCardDebt={totalCreditCardDebt}
          totalLoanDebt={totalLoanDebt}
          creditCardsCount={creditCards.length}
          loansCount={loans.length}
          compactMode={compactMode}
          onNavigate={handleSummaryNavigate}
        />
      )}

      {/* Bank Accounts Widget */}
      {isWidgetVisible('bank_accounts') && (
        <BankAccountsWidget
          darkMode={darkMode}
          bankAccounts={bankAccounts}
          compactMode={compactMode}
          onNavigate={handleSummaryNavigate}
        />
      )}
      
      {/* Latest Updates Widget */}
      {isWidgetVisible('latest_updates') && (
        <LatestUpdatesWidget
          darkMode={darkMode}
          activities={latestActivities}
          compactMode={compactMode}
          isCollapsed={isSectionCollapsed('latest_updates')}
          onToggleCollapse={() => handleToggleSection('latest_updates')}
          onViewAll={() => onNavigate?.({ view: 'activity' })}
        />
      )}
      
      {/* Cash Operations Modal */}
      {showCashModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCashModal(false)}>
          <div 
            className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-6 max-w-md w-full m-4`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Wallet size={20} />
                Cash Operations
              </h3>
              <button
                onClick={() => setShowCashModal(false)}
                className={`text-2xl leading-none ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`}
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Operation Type */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Operation Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCashOperation('withdraw')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${cashOperation === 'withdraw'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                      : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <ArrowDownToLine size={18} />
                    Withdraw
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashOperation('deposit')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${cashOperation === 'deposit'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                      : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <ArrowUpFromLine size={18} />
                    Deposit
                  </button>
                </div>
              </div>
              
              {/* Account Selection */}
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Select Account *
                </label>
                <select
                  value={cashFormData.accountId}
                  onChange={(e) => setCashFormData({ ...cashFormData, accountId: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                >
                  <option value="">Choose account</option>
                  {(bankAccounts || []).map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name} - {formatCurrency(account.balance)}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Amount */}
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={cashFormData.amount}
                  onChange={(e) => setCashFormData({ ...cashFormData, amount: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                />
              </div>
              
              {/* Preview */}
              {cashFormData.accountId && cashFormData.amount && (() => {
                const selectedAccount = bankAccounts.find(acc => acc.id === cashFormData.accountId);
                const amount = parseFloat(cashFormData.amount) || 0;
                if (!selectedAccount || amount <= 0) return null;
                
                const currentBankBalance = Number(selectedAccount.balance) || 0;
                const currentCash = Number(cashInHand) || 0;
                const newBankBalance = cashOperation === 'withdraw' 
                  ? currentBankBalance - amount
                  : currentBankBalance + amount;
                const newCashInHand = cashOperation === 'withdraw'
                  ? currentCash + amount
                  : currentCash - amount;
                
                return (
                  <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <div className={`text-xs font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Preview:</div>
                    <div className={`text-sm space-y-1 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      <div>💵 Cash in Hand: {formatCurrency(currentCash)} → {formatCurrency(newCashInHand)}</div>
                      <div>🏦 {selectedAccount.name}: {formatCurrency(currentBankBalance)} → {formatCurrency(newBankBalance)}</div>
                    </div>
                  </div>
                );
              })()}
              
              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCashOperation}
                  disabled={processingCash}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {processingCash ? 'Processing...' : cashOperation === 'withdraw' ? 'Withdraw Cash' : 'Deposit Cash'}
                </button>
                <button
                  onClick={() => {
                    setShowCashModal(false);
                    setCashFormData({ accountId: '', amount: '' });
                  }}
                  className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} py-2 rounded-lg font-medium`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
