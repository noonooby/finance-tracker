// ============================================
// BANK ACCOUNTS COMPONENT
// Phase 3: Main UI for managing bank accounts
//
// PURPOSE:
// - View all bank accounts
// - Add/edit/delete accounts
// - Transfer between accounts
// - Set primary account
// - View total balance
//
// FEATURES:
// - SmartInput for account names
// - Activity logging for all operations
// - Dark mode support
// - Undo capability through activity feed
// - Pin accounts for quick access
// ============================================

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, X, Building2, ArrowRightLeft, Star, AlertCircle, ListFilter, Wallet, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import * as Icons from 'lucide-react';
import { formatCurrency, generateId, validateBankAccountData, getAccountTypeIcon, formatDate } from '../utils/helpers';
import RecentTransactions from './shared/RecentTransactions';
import useAsyncAction from '../hooks/useAsyncAction';
import ActionButton from './shared/ActionButton';
import { showToast } from '../utils/toast';
import {
  upsertBankAccount,
  deleteBankAccount,
  transferBetweenAccounts,
  withdrawCashFromBank,
  depositCashToBank,
  dbOperation
} from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import SmartInput from './SmartInput';
import {
  getUserPreferences,
  togglePinnedBankAccount
} from '../utils/userPreferencesManager';
import {
  saveTransferContext,
  getRecentTransferDescriptions
} from '../utils/formContexts';

/**
 * BankAccounts Component
 *
 * @param {boolean} darkMode - Dark mode flag
 * @param {Array} bankAccounts - Array of bank account objects (from parent state)
 * @param {Function} onUpdate - Callback to refresh parent state after changes
 * @param {Object} focusTarget - Target account to highlight/scroll to
 * @param {Function} onClearFocus - Clear focus target callback
 * @param {Function} onNavigateToTransactions - Navigate to transaction history with filters
 */
export default function BankAccounts({
  darkMode,
  bankAccounts,
  onUpdate,
  focusTarget,
  onClearFocus,
  onNavigateToTransactions,
  cashInHand,
  onUpdateCashInHand,
  onReloadAll
}) {
  // ============================================
  // STATE MANAGEMENT
  // ============================================

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pinnedAccounts, setPinnedAccounts] = useState([]);
  
  // Async action hook for handling all async operations
  const { executeAction, isProcessing: isActionProcessing } = useAsyncAction();
  
  // Cash operations modal state
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashOperation, setCashOperation] = useState('withdraw');
  const [cashFormData, setCashFormData] = useState({
    accountId: '',
    amount: ''
  });

  // Form data for add/edit
  const [formData, setFormData] = useState({
    name: '',
    balance: '',
    account_type: 'checking',
    is_primary: false,
    institution: '',
    allows_overdraft: false,
    overdraft_limit: ''
  });

  // Transfer form data
  const [transferData, setTransferData] = useState({
    fromAccount: '',
    toAccount: '',
    amount: '',
    description: 'Account Transfer',
    date: new Date().toISOString().split('T')[0]
  });
  const [recentTransfers, setRecentTransfers] = useState([]);

  // Refs for scrolling to focused account
  const accountRefs = useRef({});

  // Load pinned accounts
  useEffect(() => {
    loadPinnedAccounts();
    loadRecentTransfers();
  }, []);
  
  const loadRecentTransfers = async () => {
    try {
      const recent = await getRecentTransferDescriptions(5);
      setRecentTransfers(recent);
    } catch (error) {
      console.error('Error loading recent transfers:', error);
    }
  };
  
  const loadPinnedAccounts = async () => {
    try {
      const prefs = await getUserPreferences();
      setPinnedAccounts(prefs.pinned_bank_accounts || []);
    } catch (error) {
      console.error('Error loading pinned accounts:', error);
    }
  };
  
  const handleTogglePin = async (accountId) => {
    try {
      await togglePinnedBankAccount(accountId);
      await loadPinnedAccounts();
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };
  
  // Sort accounts: primary first, then pinned, then others
  const sortedAccounts = [...bankAccounts].sort((a, b) => {
    // Primary always first
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    
    // Then pinned accounts
    const aIsPinned = pinnedAccounts.includes(a.id);
    const bIsPinned = pinnedAccounts.includes(b.id);
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    
    return 0;
  });

  // ============================================
  // FOCUS HANDLING (for navigation from Dashboard)
  // Pattern: Same as CreditCards.js and Loans.js
  // ============================================

  const normalizeId = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') {
      if (value.id !== undefined) return String(value.id);
      if (value.value !== undefined) return String(value.value);
      return null;
    }
    return String(value);
  };

  useEffect(() => {
    if (focusTarget?.type === 'bank_account' && focusTarget.id) {
      const key = String(normalizeId(focusTarget.id));
      const node = accountRefs.current[key];
      if (node?.scrollIntoView) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const timer = setTimeout(() => onClearFocus?.(), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [focusTarget, onClearFocus]);

  // ============================================
  // FORM HANDLERS
  // ============================================

  /**
   * Reset form to initial state
   * Used after successful save or cancel
   */
  const resetForm = () => {
    setFormData({
      name: '',
      balance: '',
      account_type: 'checking',
      is_primary: false,
      institution: '',
      allows_overdraft: false,
      overdraft_limit: ''
    });
    setShowAddForm(false);
    setEditingItem(null);
  };

  /**
   * Open edit form with existing account data
   * @param {Object} account - Account to edit
   */
  const handleEdit = (account) => {
    setFormData({
      name: account.name,
      balance: account.balance.toString(),
      account_type: account.account_type || 'checking',
      is_primary: account.is_primary || false,
      institution: account.institution || '',
      allows_overdraft: account.allows_overdraft || false,
      overdraft_limit: account.overdraft_limit?.toString() || ''
    });
    setEditingItem(account);
    setShowAddForm(true);
  };

  /**
   * Add or update bank account
   *
   * SAFETY FEATURES:
   * - Validates all required fields
   * - Validates data format
   * - Logs activity for undo capability
   * - Prevents duplicate primary accounts
   * - Warns if balance change doesn't match transactions (traceability)
   */
  const handleAdd = async () => {
    if (saving) return;

    // Validate required fields
    const errors = validateBankAccountData({
      name: formData.name,
      balance: formData.balance,
      account_type: formData.account_type
    });

    if (errors.length > 0) {
      showToast.error(errors.join('\n'));
      return;
    }
    
    // Check for balance traceability if editing an existing account
    if (editingItem) {
      const oldBalance = parseFloat(editingItem.balance) || 0;
      const newBalance = parseFloat(formData.balance) || 0;
      const balanceChange = newBalance - oldBalance;
      
      if (Math.abs(balanceChange) > 0.01) {
        // Significant balance change - check if it matches transaction history
        try {
          const transactions = await dbOperation('transactions', 'getAll');
          
          // Find transactions that affected this account
          const accountTransactions = (transactions || []).filter(t => 
            t.payment_method_id === editingItem.id ||
            t.from_account_id === editingItem.id ||
            t.to_account_id === editingItem.id
          );
          
          if (accountTransactions.length > 0 && Math.abs(balanceChange) > 1) {
            const proceed = window.confirm(
              `⚠️ Balance Traceability Warning\n\n` +
              `You're changing the balance by ${formatCurrency(Math.abs(balanceChange))}.\n\n` +
              `This account has ${accountTransactions.length} transaction(s) in history.\n` +
              `Manual balance changes may cause discrepancies in your records.\n\n` +
              `Consider:\n` +
              `- Adding income if you received money\n` +
              `- Using Transfer if moving between accounts\n` +
              `- Using Cash Operations if withdrawing/depositing\n\n` +
              `Continue with manual balance change?`
            );
            
            if (!proceed) {
              return;
            }
          }
        } catch (error) {
          console.warn('Unable to validate balance change:', error);
        }
      }
    }

    setSaving(true);
    
    const actionId = editingItem ? `edit-account-${editingItem.id}` : 'add-account';

    const result = await executeAction(actionId, async () => {
      const accountId = editingItem?.id || generateId();
      const balance = parseFloat(formData.balance) || 0;

      const accountPayload = {
        id: accountId,
        name: formData.name.trim(),
        balance: balance,
        account_type: formData.account_type,
        is_primary: formData.is_primary,
        institution: formData.institution.trim(),
        allows_overdraft: formData.allows_overdraft || false,
        overdraft_limit: formData.allows_overdraft ? (parseFloat(formData.overdraft_limit) || 0) : 0,
        created_at: editingItem?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('💾 Saving bank account:', accountPayload.name);
      const savedAccount = await upsertBankAccount(accountPayload);

      // Log activity for undo capability
      if (editingItem) {
        // Build detailed description of changes
        const oldBalance = parseFloat(editingItem.balance) || 0;
        const newBalance = parseFloat(savedAccount.balance) || 0;
        const oldType = editingItem.account_type || 'checking';
        const newType = savedAccount.account_type || 'checking';
        const oldInstitution = editingItem.institution || '';
        const newInstitution = savedAccount.institution || '';
        const oldName = editingItem.name || '';
        const newName = savedAccount.name || '';
        const oldPrimary = editingItem.is_primary || false;
        const newPrimary = savedAccount.is_primary || false;
        const oldAllowsOverdraft = editingItem.allows_overdraft || false;
        const newAllowsOverdraft = savedAccount.allows_overdraft || false;
        const oldOverdraftLimit = parseFloat(editingItem.overdraft_limit) || 0;
        const newOverdraftLimit = parseFloat(savedAccount.overdraft_limit) || 0;

        let details = '';
        if (oldName !== newName) {
          details += `Name "${oldName}" → "${newName}" • `;
        }
        if (oldBalance !== newBalance) {
          details += `Balance ${formatCurrency(oldBalance)} → ${formatCurrency(newBalance)} • `;
        }
        if (oldType !== newType) {
          details += `Type ${oldType} → ${newType} • `;
        }
        if (oldInstitution !== newInstitution) {
          if (oldInstitution && newInstitution) {
            details += `Institution "${oldInstitution}" → "${newInstitution}" • `;
          } else if (newInstitution) {
            details += `Institution added "${newInstitution}" • `;
          } else if (oldInstitution) {
            details += `Institution removed "${oldInstitution}" • `;
          }
        }
        if (oldPrimary !== newPrimary) {
          details += newPrimary ? 'Set as primary account • ' : 'Removed primary status • ';
        }
        if (oldAllowsOverdraft !== newAllowsOverdraft) {
          details += newAllowsOverdraft ? 'Enabled overdraft • ' : 'Disabled overdraft • ';
        }
        if (newAllowsOverdraft && oldOverdraftLimit !== newOverdraftLimit) {
          details += `Overdraft limit ${formatCurrency(oldOverdraftLimit)} → ${formatCurrency(newOverdraftLimit)} • `;
        }
        
        // Remove trailing bullet
        details = details.replace(/ • $/, '');

        const description = details
          ? `Updated bank account '${savedAccount.name}' - ${details.trim()}`
          : `Updated bank account '${savedAccount.name}'`;

        await logActivity(
          'edit',
          'bank_account',
          savedAccount.id,
          savedAccount.name,
          description,
          {
            previous: { ...editingItem, id: editingItem?.id || savedAccount.id, name: editingItem?.name || savedAccount.name },
            updated: { ...savedAccount, id: savedAccount?.id, name: savedAccount?.name }
          }
        );
      } else {
        // Build detailed description for ADD
        let description = `Added bank account '${savedAccount.name}' - Balance ${formatCurrency(balance)} • Type ${savedAccount.account_type}`;
        if (savedAccount.institution) {
          description += ` • Institution ${savedAccount.institution}`;
        }
        if (savedAccount.is_primary) {
          description += ` • Primary account`;
        }

        await logActivity(
          'add',
          'bank_account',
          savedAccount.id,
          savedAccount.name,
          description,
          savedAccount
        );
      }

      // Refresh parent state
      await onUpdate();
      resetForm();

      console.log('✅ Bank account saved successfully');
      
      setSaving(false);
      
      return {
        accountName: savedAccount.name,
        isNew: !editingItem
      };
    });
    
    if (result.success) {
    const action = result.data.isNew ? 'added' : 'updated';
    showToast.success(`Bank account '${result.data.accountName}' ${action} successfully`);
  } else {
    showToast.error(`Failed to save account: ${result.error.message}`);
  }
};
  
  /**
   * Handle cash operations (withdraw/deposit)
   */
  const handleCashOperation = async () => {
    if (!cashFormData.accountId || !cashFormData.amount) {
      showToast.error('Please select an account and enter an amount');
      return;
    }
    
    const amount = parseFloat(cashFormData.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast.error('Please enter a valid amount');
      return;
    }
    
    const actionId = `cash-${cashOperation}-${cashFormData.accountId}`;
    
    const actionResult = await executeAction(actionId, async () => {
      let opResult;
      
      if (cashOperation === 'withdraw') {
        opResult = await withdrawCashFromBank(cashFormData.accountId, amount);
        
        await logActivity(
          'cash_withdrawal',
          'bank_account',
          opResult.accountId,
          opResult.accountName,
          `Withdrew ${formatCurrency(opResult.amount)} from '${opResult.accountName}' to cash in hand`,
          {
            accountId: opResult.accountId,
            accountName: opResult.accountName,
            amount: opResult.amount,
            previousBankBalance: opResult.previousBankBalance,
            newBankBalance: opResult.newBankBalance,
            previousCashInHand: opResult.previousCashInHand,
            newCashInHand: opResult.newCashInHand,
            transactionId: opResult.transactionId
          }
        );
      } else {
        opResult = await depositCashToBank(cashFormData.accountId, amount);
        
        await logActivity(
          'cash_deposit',
          'bank_account',
          opResult.accountId,
          opResult.accountName,
          `Deposited ${formatCurrency(opResult.amount)} from cash in hand to '${opResult.accountName}'`,
          {
            accountId: opResult.accountId,
            accountName: opResult.accountName,
            amount: opResult.amount,
            previousBankBalance: opResult.previousBankBalance,
            newBankBalance: opResult.newBankBalance,
            previousCashInHand: opResult.previousCashInHand,
            newCashInHand: opResult.newCashInHand,
            transactionId: opResult.transactionId
          }
        );
      }
      
      if (onReloadAll) await onReloadAll();
      
      setCashFormData({ accountId: '', amount: '' });
      setShowCashModal(false);
      
      return {
        operation: cashOperation,
        accountName: opResult.accountName,
        amount: opResult.amount
      };
    });
    
    if (actionResult.success) {
      const operationText = actionResult.data.operation === 'withdraw' ? 'withdrawn from' : 'deposited to';
      showToast.success(
        `${formatCurrency(actionResult.data.amount)} ${operationText} ${actionResult.data.accountName}`
      );
    } else {
      showToast.error(`Cash operation failed: ${actionResult.error.message}`);
    }
  };

  /**
   * Delete bank account
   *
   * SAFETY FEATURES:
   * - Cannot delete primary account (must set another as primary first)
   * - Confirms deletion with user
   * - Logs activity for undo capability
   * - Foreign key constraints handle orphaned records safely
   *
   * @param {string} accountId - Account ID to delete
   */
  const handleDelete = async (accountId) => {
    const account = bankAccounts.find(acc => acc.id === accountId);
    if (!account) return;

    // SAFETY CHECK: Don't allow deleting primary account
    if (account.is_primary) {
      showToast.error('Cannot delete the primary account. Set another account as primary first, then delete this one.');
      return;
    }

    if (!window.confirm(`Delete bank account "${account.name}"?\n\nThis action cannot be undone. Any reserved funds or income linked to this account will be unlinked.`)) {
      return;
    }
    
    const result = await executeAction(`delete-account-${accountId}`, async () => {
      console.log('🗑️ Deleting bank account:', account.name);

      // Build detailed description for DELETE
      let description = `Deleted bank account '${account.name}' - Balance ${formatCurrency(account.balance)} • Type ${account.account_type}`;
      if (account.institution) {
        description += ` • Institution ${account.institution}`;
      }

      // Log activity BEFORE deletion (for undo capability)
      await logActivity(
        'delete',
        'bank_account',
        accountId,
        account.name,
        description,
        account
      );

      await deleteBankAccount(accountId);
      await onUpdate();

      console.log('✅ Bank account deleted successfully');
      
      return { accountName: account.name };
    });
    
    if (result.success) {
      showToast.success(`${result.data.accountName} deleted successfully`);
    } else {
      showToast.error(`Failed to delete account: ${result.error.message}`);
    }
  };

  /**
   * Set an account as primary
   * Only one account can be primary at a time
   *
   * @param {Object} account - Account to set as primary
   */
  const handleSetPrimary = async (account) => {
    if (account.is_primary) {
      // Already primary
      return;
    }

    try {
      console.log('⭐ Setting primary account:', account.name);

      const updatedAccount = {
        ...account,
        is_primary: true
      };

      await upsertBankAccount(updatedAccount);

      await logActivity(
        'edit',
        'bank_account',
        account.id,
        account.name,
        `Set '${account.name}' as primary account`,
        { previous: account, updated: updatedAccount }
      );

      await onUpdate();

      console.log('✅ Primary account updated');
    } catch (error) {
      console.error('❌ Error setting primary account:', error);
      alert(`Failed to set primary account: ${error.message}`);
    }
  };

  /**
   * Transfer money between accounts
   *
   * FEATURES:
   * - Validates sufficient funds
   * - Updates both account balances
   * - Creates transaction record
   * - Logs activity
   */
  const handleTransfer = async () => {
    if (saving) return;

    // Validate transfer data
    if (!transferData.fromAccount || !transferData.toAccount) {
      showToast.error('Please select both source and destination accounts');
      return;
    }

    if (transferData.fromAccount === transferData.toAccount) {
      showToast.error('Cannot transfer to the same account');
      return;
    }

    const rawAmount = parseFloat(transferData.amount);
    const amount = Math.round(rawAmount * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast.error('Please enter a valid transfer amount');
      return;
    }

    const sourceAccount = bankAccounts.find(
      (account) => String(account.id) === String(transferData.fromAccount)
    );
    const destinationAccount = bankAccounts.find(
      (account) => String(account.id) === String(transferData.toAccount)
    );

    if (!sourceAccount || !destinationAccount) {
      showToast.error('Unable to load selected accounts. Please refresh and try again.');
      return;
    }

    const sourceBalance = Number(sourceAccount.balance) || 0;
    const destinationBalance = Number(destinationAccount.balance) || 0;

    if (sourceBalance < amount) {
      showToast.error(
        `Insufficient funds in ${sourceAccount.name}. Available: ${formatCurrency(sourceBalance)}`
      );
      return;
    }

    setSaving(true);
    
    const result = await executeAction('transfer-accounts', async () => {
    console.log('💸 Processing transfer:', transferData);

    const transferResult = await transferBetweenAccounts(
        transferData.fromAccount,
        transferData.toAccount,
        amount,
        transferData.description,
        transferData.date
      );

      // Use the date from the form
      const transferDate = transferData.date;

      // Build detailed description for TRANSFER
      const description = `Transferred ${formatCurrency(transferResult.amount)} from '${transferResult.fromAccount}' to '${transferResult.toAccount}' on ${formatDate(transferDate)}${transferData.description !== 'Account Transfer' ? ` - Note: ${transferData.description}` : ''}`;

      // Log activity
      await logActivity(
        'transfer',
        'bank_account',
        transferResult.fromAccountId || transferData.fromAccount,
        transferResult.fromAccount,
        description,
        {
          fromAccount: transferResult.fromAccountId || transferData.fromAccount,
          toAccount: transferResult.toAccountId || transferData.toAccount,
          fromAccountName: transferResult.fromAccount,
          toAccountName: transferResult.toAccount,
          amount: transferResult.amount,
          description: transferData.description,
          date: transferDate,
          transactionId: transferResult.transactionId,
          fromPreviousBalance: sourceBalance,
          toPreviousBalance: destinationBalance,
          fromNewBalance: transferResult.fromBalance,
          toNewBalance: transferResult.toBalance
        }
      );

      await onUpdate();

      // Reset transfer form
      setTransferData({
        fromAccount: '',
        toAccount: '',
        amount: '',
        description: 'Account Transfer',
        date: new Date().toISOString().split('T')[0]
      });
      setShowTransferForm(false);

      console.log('✅ Transfer completed successfully');
      
      // Save transfer context
      if (transferData.description) {
        saveTransferContext(transferData.description, {
          fromAccountId: transferData.fromAccount,
          toAccountId: transferData.toAccount,
          fromAccountName: transferResult.fromAccount,
          toAccountName: transferResult.toAccount
        }).catch(err => console.warn('Failed to save transfer context:', err));
      }
      
      return {
        amount: transferResult.amount,
        fromAccount: transferResult.fromAccount,
        toAccount: transferResult.toAccount
      };
    });
    
    setSaving(false);
    
    if (result.success) {
      showToast.success(
        `${formatCurrency(result.data.amount)} transferred from ${result.data.fromAccount} to ${result.data.toAccount}`
      );
    } else {
      showToast.error(`Transfer failed: ${result.error.message}`);
    }
  };

  // ============================================
  // CALCULATIONS
  // ============================================

  const totalBalance = bankAccounts.reduce((sum, acc) => sum + (parseFloat(acc.balance) || 0), 0);

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-4">
      {/* Header with Total Balance */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Building2 size={24} />
            Bank Accounts
          </h2>
          <div className={`text-sm mt-1 space-y-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <div>
              Total Balance: <span className="font-semibold">{formatCurrency(totalBalance)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Wallet size={14} />
              Cash in Hand: <span className="font-semibold text-green-600">{formatCurrency(cashInHand || 0)}</span>
            </div>
            <div className="font-bold text-blue-600">
              Combined Total: {formatCurrency(totalBalance + (cashInHand || 0))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCashModal(!showCashModal)}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base ${
              showCashModal
                ? darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            <Wallet size={20} />
            {showCashModal ? 'Cancel' : 'Cash'}
          </button>
          <button
            onClick={() => setShowTransferForm(!showTransferForm)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
              showTransferForm
                ? darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            <ArrowRightLeft size={20} />
            {showTransferForm ? 'Cancel' : 'Transfer'}
          </button>
          <button
            onClick={() => {
              if (showAddForm) {
                resetForm();
              } else {
                setShowAddForm(true);
              }
            }}
            className="flex items-center gap-1 sm:gap-2 bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 text-sm sm:text-base"
          >
            <Plus size={20} />
            {showAddForm ? 'Cancel' : 'Add Account'}
          </button>
        </div>
      </div>

      {/* Transfer Form */}
      {showTransferForm && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          <h3 className="font-semibold flex items-center gap-2">
            <ArrowRightLeft size={18} />
            Transfer Between Accounts
          </h3>
          
          {/* Recent Transfer Quick-Select */}
          {recentTransfers.length > 0 && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Recent Transfers
              </label>
              <div className="flex gap-2 flex-wrap">
                {recentTransfers.map(transfer => (
                  <button
                    key={transfer.id}
                    type="button"
                    onClick={() => {
                      setTransferData(prev => ({
                        ...prev,
                        description: transfer.description,
                        fromAccount: transfer.from_account_id || prev.fromAccount,
                        toAccount: transfer.to_account_id || prev.toAccount
                      }));
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      transferData.description === transfer.description
                        ? 'bg-blue-600 text-white'
                        : darkMode 
                          ? 'bg-blue-900 text-blue-200 hover:bg-blue-800 border border-blue-700'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'
                    }`}
                  >
                    {transfer.description}
                    {transfer.usage_count > 10 && ' ⭐'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                From Account *
              </label>
              <select
                value={transferData.fromAccount}
                onChange={(e) => setTransferData({ ...transferData, fromAccount: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="">Select account</option>
                {sortedAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} - {formatCurrency(account.balance)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                To Account *
              </label>
              <select
                value={transferData.toAccount}
                onChange={(e) => setTransferData({ ...transferData, toAccount: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="">Select account</option>
                {sortedAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} - {formatCurrency(account.balance)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Amount *
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={transferData.amount}
              onChange={(e) => setTransferData({ ...transferData, amount: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
            />
          </div>
          
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Transfer Date *
            </label>
            <input
              type="date"
              value={transferData.date}
              onChange={(e) => setTransferData({ ...transferData, date: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
            />
          </div>

          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Description (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g., Moving to savings"
              value={transferData.description}
              onChange={(e) => setTransferData({ ...transferData, description: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <ActionButton
              onClick={handleTransfer}
              processing={isActionProcessing('transfer-accounts')}
              variant="success"
              processingText="Transferring..."
              idleText="Transfer Money"
              fullWidth
            />
            <ActionButton
              onClick={() => {
                setTransferData({
                  fromAccount: '',
                  toAccount: '',
                  amount: '',
                  description: 'Account Transfer',
                  date: new Date().toISOString().split('T')[0]
                });
                setShowTransferForm(false);
              }}
              variant="secondary"
              idleText="Cancel"
              fullWidth
            />
          </div>
        </div>
      )}
      
      {/* Cash Operations Form */}
      {showCashModal && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          <h3 className="font-semibold flex items-center gap-2">
            <Wallet size={18} />
            Cash Operations
          </h3>
          
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
          
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Select Account *
            </label>
            <select
              value={cashFormData.accountId}
              onChange={(e) => setCashFormData({ ...cashFormData, accountId: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
            >
              <option value="">Choose account</option>
              {sortedAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} - {formatCurrency(account.balance)}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
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
                  <div className="flex items-center gap-2">
                    <Wallet size={14} className="text-gray-500" />
                    Cash in Hand: {formatCurrency(currentCash)} → {formatCurrency(newCashInHand)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 size={14} className="text-gray-500" />
                    {selectedAccount.name}: {formatCurrency(currentBankBalance)} → {formatCurrency(newBankBalance)}
                  </div>
                </div>
              </div>
            );
          })()}
          
          <div className="flex gap-2 pt-2">
            <ActionButton
              onClick={handleCashOperation}
              processing={isActionProcessing(`cash-${cashOperation}-${cashFormData.accountId}`)}
              variant="warning"
              processingText={cashOperation === 'withdraw' ? 'Withdrawing...' : 'Depositing...'}
              idleText={cashOperation === 'withdraw' ? 'Withdraw Cash' : 'Deposit Cash'}
              fullWidth
            />
            <ActionButton
              onClick={() => {
                setCashFormData({ accountId: '', amount: '' });
                setShowCashModal(false);
              }}
              variant="secondary"
              idleText="Cancel"
              fullWidth
            />
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          <h3 className="font-semibold">
            {editingItem ? 'Edit Bank Account' : 'Add Bank Account'}
          </h3>

          <SmartInput
            type="bank_account"
            value={formData.name}
            onChange={(value) => setFormData({ ...formData, name: value })}
            label="Account Name *"
            placeholder="e.g., Tangerine Checking"
            darkMode={darkMode}
            required={true}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Balance *
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              />
            </div>

            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Account Type *
              </label>
              <select
                value={formData.account_type}
                onChange={(e) => setFormData({ ...formData, account_type: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="investment">Investment</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>

          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Institution (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g., Chase, Bank of America"
              value={formData.institution}
              onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_primary}
              onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm">Set as primary account</span>
          </label>
          
          {/* Overdraft Settings */}
          <div className={`pt-3 mt-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <h4 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Overdraft Settings</h4>
            
            <label className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={formData.allows_overdraft}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  allows_overdraft: e.target.checked,
                  overdraft_limit: e.target.checked ? formData.overdraft_limit : ''
                })}
                className="w-4 h-4"
              />
              <span className="text-sm">Allow overdraft</span>
            </label>
            
            {formData.allows_overdraft && (
              <div>
                <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Overdraft Limit *
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g., 500.00"
                  value={formData.overdraft_limit}
                  onChange={(e) => setFormData({ ...formData, overdraft_limit: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                />
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Maximum negative balance allowed before transactions are blocked
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <ActionButton
              onClick={handleAdd}
              processing={isActionProcessing(editingItem ? `edit-account-${editingItem.id}` : 'add-account')}
              variant="primary"
              processingText={editingItem ? 'Updating Account...' : 'Adding Account...'}
              idleText={editingItem ? 'Update Account' : 'Add Account'}
              fullWidth
            />
            <ActionButton
              onClick={resetForm}
              variant="secondary"
              idleText="Cancel"
              fullWidth
            />
          </div>
        </div>
      )}

      {/* Accounts List + Cash in Hand */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Cash in Hand Card - Always first */}
        <div className={`${darkMode ? 'bg-gradient-to-br from-green-900/20 to-green-800/10 border-green-700' : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'} rounded-lg border-2 p-4`}>
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Wallet size={20} className="text-green-600" />
                <h3 className="font-bold text-base sm:text-lg">Cash in Hand</h3>
                <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-green-900/40 text-green-300' : 'bg-green-200 text-green-800'}`}>
                  Physical Cash
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-bold mt-1 text-green-600">
                {formatCurrency(cashInHand || 0)}
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                Money outside bank accounts
              </div>
            </div>
            <div className="flex gap-1 sm:gap-2">
              <button
                onClick={() => {
                  setCashFormData({ accountId: '', amount: '' });
                  setShowCashModal(true);
                }}
                className={`p-2 rounded ${darkMode ? 'text-green-400 hover:bg-gray-700' : 'text-green-600 hover:bg-green-50'}`}
                title="Withdraw or Deposit cash"
              >
                <ArrowRightLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
              </button>
              <button
                onClick={async () => {
                  const newAmount = prompt(`Enter new cash in hand amount:`, (cashInHand || 0).toString());
                  if (newAmount === null) return;
                  
                  const amount = parseFloat(newAmount);
                  if (isNaN(amount) || amount < 0) {
                    showToast.error('Please enter a valid amount');
                    return;
                  }
                  
                  const oldAmount = cashInHand || 0;
                  await onUpdateCashInHand(amount);
                  
                  await logActivity(
                    'edit_setting',
                    'cash_in_hand',
                    'cash-in-hand',
                    'Cash in Hand',
                    `Updated cash in hand from ${formatCurrency(oldAmount)} to ${formatCurrency(amount)}`,
                    {
                      settingKey: 'cashInHand',
                      previousValue: oldAmount,
                      newValue: amount
                    }
                  );
                  
                  showToast.success('Cash in hand updated');
                }}
                className={`p-2 rounded ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'}`}
                title="Edit cash amount"
              >
                <Edit2 size={16} className="sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>
          </div>
          
          {/* Quick actions for cash */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => {
                setCashOperation('withdraw');
                setShowCashModal(true);
              }}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm ${darkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
            >
              <ArrowDownToLine size={16} />
              Withdraw
            </button>
            <button
              onClick={() => {
                setCashOperation('deposit');
                setShowCashModal(true);
              }}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm ${darkMode ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
            >
              <ArrowUpFromLine size={16} />
              Deposit
            </button>
          </div>
        </div>
        
        {/* Bank Accounts */}
        {sortedAccounts.length === 0 ? (
          <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <Building2 size={48} className="mx-auto mb-3 opacity-30" />
            <p>No bank accounts added yet</p>
            <p className="text-sm mt-2">Add your first account to get started</p>
          </div>
        ) : (
          sortedAccounts.map(account => {
            const accountKey = String(normalizeId(account.id));
            const isHighlighted = focusTarget?.type === 'bank_account' && normalizeId(focusTarget.id) === normalizeId(account.id);
            const isPinned = pinnedAccounts.includes(account.id);

            return (
              <div
                key={accountKey}
                ref={(el) => {
                  if (el) accountRefs.current[accountKey] = el;
                }}
                className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 ${isHighlighted ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {(() => {
                        const iconName = getAccountTypeIcon(account.account_type);
                        const IconComponent = Icons[iconName] || Icons.Building2;
                        return <IconComponent size={20} className="text-gray-500" />;
                      })()}
                      <h3 className="font-bold text-base sm:text-lg">{account.name}</h3>
                      {account.is_primary && (
                        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                          <Star size={12} fill="currentColor" />
                          Primary
                        </span>
                      )}
                      {isPinned && !account.is_primary && (
                        <Star size={16} className="text-yellow-500 fill-current" title="Pinned" />
                      )}
                    </div>
                    <div className={`text-xl sm:text-2xl font-bold mt-1 ${
                      (Number(account.balance) || 0) < 0
                        ? 'text-red-600'  // Overdraft
                        : 'text-blue-600'  // Positive
                    }`}>
                      {(Number(account.balance) || 0) < 0 ? 'Overdraft: ' : ''}{formatCurrency(account.balance)}
                    </div>
                    
                    {/* Overdraft Warning */}
                    {(Number(account.balance) || 0) < 0 && account.allows_overdraft && (
                      <div className="text-xs text-red-600 mt-1 space-y-1">
                        <div>⚠️ Limit: {formatCurrency(account.overdraft_limit || 0)}</div>
                        <div>Available: {formatCurrency((account.overdraft_limit || 0) + (Number(account.balance) || 0))}</div>
                        <div className="font-medium">⚠️ Resolve by end of day to avoid fees</div>
                      </div>
                    )}
                    
                    {account.institution && (
                      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                        {account.institution}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 sm:gap-2">
                    {!account.is_primary && (
                      <>
                        <button
                          onClick={() => handleTogglePin(account.id)}
                          className={`p-1.5 sm:p-2 rounded min-h-[44px] sm:min-h-0 flex items-center justify-center ${
                            isPinned
                              ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                              : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'
                          }`}
                          title={isPinned ? 'Unpin account' : 'Pin account'}
                        >
                          <Star size={16} className={`sm:w-[18px] sm:h-[18px] ${isPinned ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleSetPrimary(account)}
                          className={`p-2 rounded ${darkMode ? 'text-yellow-400 hover:bg-gray-700' : 'text-yellow-600 hover:bg-yellow-50'}`}
                          title="Set as primary account"
                        >
                          <Star size={16} className="sm:w-[18px] sm:h-[18px]" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => onNavigateToTransactions && onNavigateToTransactions({ bankAccount: account.id })}
                      className={`p-2 rounded ${darkMode ? 'text-purple-400 hover:bg-gray-700' : 'text-purple-600 hover:bg-purple-50'}`}
                      title="View transactions"
                    >
                      <ListFilter size={16} className="sm:w-[18px] sm:h-[18px]" />
                    </button>
                    <button
                      onClick={() => handleEdit(account)}
                      className={`p-2 rounded ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'}`}
                      title="Edit account"
                    >
                      <Edit2 size={16} className="sm:w-[18px] sm:h-[18px]" />
                    </button>
                    <button
                      onClick={() => handleDelete(account.id)}
                      className={`p-2 rounded ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'}`}
                      title="Delete account"
                      disabled={account.is_primary}
                    >
                      <X size={16} className="sm:w-[18px] sm:h-[18px]" />
                    </button>
                  </div>
                </div>

                {/* Account Type Badge */}
                <div className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded mb-3 ${
                  darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                }`}>
                  {account.account_type.charAt(0).toUpperCase() + account.account_type.slice(1)} Account
                </div>
                
                {/* Recent Transactions */}
                <RecentTransactions
                  darkMode={darkMode}
                  entityType="bank_account"
                  entityId={account.id}
                  entityName={account.name}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Help Text */}
      {sortedAccounts.length > 0 && (
        <div className={`flex items-start gap-2 p-3 rounded-lg ${darkMode ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
          <AlertCircle size={16} className={darkMode ? 'text-blue-400 mt-0.5' : 'text-blue-600 mt-0.5'} />
          <p className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
            The primary account is used as the default for transactions. Pin your favorite accounts for quick access.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// END OF BANK ACCOUNTS COMPONENT
// ============================================
