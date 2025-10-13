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
// ============================================

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, X, Building2, ArrowRightLeft, Star, AlertCircle, ListFilter } from 'lucide-react';
import { formatCurrency, generateId, validateBankAccountData, getAccountTypeIcon, sortBankAccounts } from '../utils/helpers';
import {
  //getAllBankAccounts,
  upsertBankAccount,
  deleteBankAccount,
  transferBetweenAccounts
} from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import SmartInput from './SmartInput';

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
  onNavigateToTransactions
}) {
  // ============================================
  // STATE MANAGEMENT
  // ============================================

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form data for add/edit
  const [formData, setFormData] = useState({
    name: '',
    balance: '',
    account_type: 'checking',
    is_primary: false,
    institution: ''
  });

  // Transfer form data
  const [transferData, setTransferData] = useState({
    fromAccount: '',
    toAccount: '',
    amount: '',
    description: 'Account Transfer'
  });

  // Refs for scrolling to focused account
  const accountRefs = useRef({});

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
      institution: ''
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
      institution: account.institution || ''
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
      alert(errors.join('\n'));
      return;
    }

    setSaving(true);

    try {
      const accountId = editingItem?.id || generateId();
      const balance = parseFloat(formData.balance) || 0;

      const accountPayload = {
        id: accountId,
        name: formData.name.trim(),
        balance: balance,
        account_type: formData.account_type,
        is_primary: formData.is_primary,
        institution: formData.institution.trim(),
        created_at: editingItem?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('💾 Saving bank account:', accountPayload.name);
      const savedAccount = await upsertBankAccount(accountPayload);

      // Log activity for undo capability
      if (editingItem) {
        await logActivity(
          'edit',
          'bank_account',
          savedAccount.id,
          savedAccount.name,
          `Updated bank account: ${savedAccount.name}`,
          {
            previous: editingItem,
            updated: savedAccount
          }
        );
      } else {
        await logActivity(
          'add',
          'bank_account',
          savedAccount.id,
          savedAccount.name,
          `Added bank account: ${savedAccount.name} with balance ${formatCurrency(balance)}`,
          savedAccount
        );
      }

      // Refresh parent state
      await onUpdate();
      resetForm();

      console.log('✅ Bank account saved successfully');
    } catch (error) {
      console.error('❌ Error saving bank account:', error);
      alert(`Failed to save bank account: ${error.message}`);
    } finally {
      setSaving(false);
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
      alert('Cannot delete the primary account.\n\nTo reduce the balance: Click the Edit button and change the balance to $0.\nTo delete this account: First set another account as primary, then delete this one.');
      return;
    }

    if (!window.confirm(`Delete bank account "${account.name}"?\n\nThis action cannot be undone. Any reserved funds or income linked to this account will be unlinked.`)) {
      return;
    }

    try {
      console.log('🗑️ Deleting bank account:', account.name);

      // Log activity BEFORE deletion (for undo capability)
      await logActivity(
        'delete',
        'bank_account',
        accountId,
        account.name,
        `Deleted bank account: ${account.name} (Balance: ${formatCurrency(account.balance)})`,
        account
      );

      await deleteBankAccount(accountId);
      await onUpdate();

      console.log('✅ Bank account deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting bank account:', error);
      alert(`Failed to delete bank account: ${error.message}`);
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
        `Set ${account.name} as primary account`,
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
      alert('Please select both source and destination accounts');
      return;
    }

    if (transferData.fromAccount === transferData.toAccount) {
      alert('Cannot transfer to the same account');
      return;
    }

    const rawAmount = parseFloat(transferData.amount);
    const amount = Math.round(rawAmount * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid transfer amount');
      return;
    }

    const sourceAccount = bankAccounts.find(
      (account) => String(account.id) === String(transferData.fromAccount)
    );
    const destinationAccount = bankAccounts.find(
      (account) => String(account.id) === String(transferData.toAccount)
    );

    if (!sourceAccount || !destinationAccount) {
      alert('Unable to load selected accounts. Please refresh and try again.');
      return;
    }

    const sourceBalance = Number(sourceAccount.balance) || 0;
    const destinationBalance = Number(destinationAccount.balance) || 0;

    if (sourceBalance < amount) {
      alert(
        `Insufficient funds in ${sourceAccount.name}. `
        + `Available: ${formatCurrency(sourceBalance)}, Requested: ${formatCurrency(amount)}`
      );
      return;
    }

    setSaving(true);

    try {
      console.log('💸 Processing transfer:', transferData);

      const result = await transferBetweenAccounts(
        transferData.fromAccount,
        transferData.toAccount,
        amount,
        transferData.description
      );

      // Log activity
      await logActivity(
        'transfer',
        'bank_account',
        result.fromAccountId || transferData.fromAccount,
        result.fromAccount,
        `Transferred ${formatCurrency(result.amount)} from ${result.fromAccount} to ${result.toAccount}`,
        {
          fromAccount: result.fromAccountId || transferData.fromAccount,
          toAccount: result.toAccountId || transferData.toAccount,
          amount: result.amount,
          description: transferData.description,
          transactionId: result.transactionId,
          fromPreviousBalance: sourceBalance,
          toPreviousBalance: destinationBalance,
          fromNewBalance: result.fromBalance,
          toNewBalance: result.toBalance
        }
      );

      await onUpdate();

      // Reset transfer form
      setTransferData({
        fromAccount: '',
        toAccount: '',
        amount: '',
        description: 'Account Transfer'
      });
      setShowTransferForm(false);

      console.log('✅ Transfer completed successfully');
      alert(`Successfully transferred ${formatCurrency(amount)} from ${result.fromAccount} to ${result.toAccount}`);
    } catch (error) {
      console.error('❌ Transfer failed:', error);
      alert(`Transfer failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // CALCULATIONS
  // ============================================

  const totalBalance = bankAccounts.reduce((sum, acc) => sum + (parseFloat(acc.balance) || 0), 0);
  const sortedAccounts = sortBankAccounts(bankAccounts);

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-4">
      {/* Header with Total Balance */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Building2 size={24} />
            Bank Accounts
          </h2>
          <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Total Balance: <span className="font-semibold">{formatCurrency(totalBalance)}</span>
          </p>
        </div>
        <div className="flex gap-2">
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
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
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
            <button
              onClick={handleTransfer}
              disabled={saving}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Processing...' : 'Transfer Money'}
            </button>
            <button
              onClick={() => {
                setTransferData({
                  fromAccount: '',
                  toAccount: '',
                  amount: '',
                  description: 'Account Transfer'
                });
                setShowTransferForm(false);
              }}
              className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} py-2 rounded-lg font-medium`}
            >
              Cancel
            </button>
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
            placeholder="e.g., Chase Checking"
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
                <option value="checking">🏦 Checking</option>
                <option value="savings">💰 Savings</option>
                <option value="investment">📈 Investment</option>
                <option value="cash">💵 Cash</option>
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

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingItem ? 'Update Account' : 'Add Account'}
            </button>
            <button
              onClick={resetForm}
              className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} py-2 rounded-lg font-medium`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Accounts List */}
      <div className="space-y-3">
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
                      <span className="text-2xl">{getAccountTypeIcon(account.account_type)}</span>
                      <h3 className="font-bold text-lg">{account.name}</h3>
                      {account.is_primary && (
                        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                          <Star size={12} fill="currentColor" />
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="text-2xl font-bold text-blue-600 mt-1">
                      {formatCurrency(account.balance)}
                    </div>
                    {account.institution && (
                      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                        {account.institution}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!account.is_primary && (
                      <button
                        onClick={() => handleSetPrimary(account)}
                        className={`p-2 rounded ${darkMode ? 'text-yellow-400 hover:bg-gray-700' : 'text-yellow-600 hover:bg-yellow-50'}`}
                        title="Set as primary account"
                      >
                        <Star size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => onNavigateToTransactions && onNavigateToTransactions({ bankAccount: account.id })}
                      className={`p-2 rounded ${darkMode ? 'text-purple-400 hover:bg-gray-700' : 'text-purple-600 hover:bg-purple-50'}`}
                      title="View transactions"
                    >
                      <ListFilter size={18} />
                    </button>
                    <button
                      onClick={() => handleEdit(account)}
                      className={`p-2 rounded ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'}`}
                      title="Edit account"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(account.id)}
                      className={`p-2 rounded ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'}`}
                      title="Delete account"
                      disabled={account.is_primary}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Account Type Badge */}
                <div className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                  darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                }`}>
                  {account.account_type.charAt(0).toUpperCase() + account.account_type.slice(1)} Account
                </div>
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
            The primary account is used as the default for transactions. You can set a different account as primary at any time.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// END OF BANK ACCOUNTS COMPONENT
// ============================================
