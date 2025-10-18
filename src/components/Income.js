import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, DollarSign, Edit2, X, ListFilter, AlertCircle } from 'lucide-react';
import { formatCurrency, formatDate, predictNextDate, getDaysUntil, generateId, getPrimaryAccountFromArray } from '../utils/helpers';
import { formatFrequency } from '../utils/sentenceCase';
import { dbOperation } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import { autoDepositDueIncome } from '../utils/autoPay';
import useAsyncAction from '../hooks/useAsyncAction';
import ActionButton from './shared/ActionButton';
import { showToast } from '../utils/toast';
import {
  getIncomeSourceContext,
  saveIncomeSourceContext,
  getRecentIncomeSources,
  getLastUsedIncomeContext,
  applyIncomeContext
} from '../utils/formContexts';

export default function Income({
  darkMode,
  income,
  availableCash,
  onUpdate,
  onUpdateCash,
  focusTarget,
  onClearFocus,
  bankAccounts,
  onNavigateToTransactions,
  cashInHand,
  onUpdateCashInHand
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    source: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    frequency: 'onetime',
    reservedAmount: '',
    recurringDurationType: 'indefinite',
    recurringUntilDate: '',
    recurringOccurrences: '',
    depositTarget: 'bank',
    depositAccountId: ''
  });
  const [recentSources, setRecentSources] = useState([]);
  const sourceInputRef = useRef(null);
  const incomeRefs = useRef({});
  const [predictionCount, setPredictionCount] = useState(8);
  
  // Async action hook for handling all async operations
  const { executeAction, isProcessing: isActionProcessing } = useAsyncAction();

  const normalizeId = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') {
      if (value.id !== undefined) return String(value.id);
      if (value.value !== undefined) return String(value.value);
      return null;
    }
    return String(value);
  };

  // Load income contexts on mount
  const loadIncomeContexts = useCallback(async () => {
    try {
      const recent = await getRecentIncomeSources(5);
      setRecentSources(recent);
      
      if (!editingItem) {
        const lastContext = await getLastUsedIncomeContext();
        if (lastContext) {
          const contextData = applyIncomeContext(lastContext);
          setFormData(prev => ({
            ...prev,
            source: lastContext.source_name,
            ...contextData
          }));
          
          setTimeout(() => {
            if (sourceInputRef.current) {
              sourceInputRef.current.select();
              sourceInputRef.current.focus();
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error('Error loading income contexts:', error);
    }
  }, [editingItem]);

  useEffect(() => {
    loadIncomeContexts();
  }, [loadIncomeContexts]);

  // Handle quick-select button click
  const handleSelectSource = useCallback(async (sourceContext) => {
    try {
      const contextData = applyIncomeContext(sourceContext);
      setFormData(prev => ({
        ...prev,
        source: sourceContext.source_name,
        ...contextData
      }));
      setTimeout(() => {
        const amountInput = document.querySelector('input[placeholder="Amount Received *"]');
        if (amountInput) amountInput.focus();
      }, 50);
    } catch (error) {
      console.error('Error applying context:', error);
    }
  }, []);

  // Handle source input change
  const handleSourceChange = (value) => {
    setFormData(prev => ({ ...prev, source: value }));
  };

  // Load context when user leaves source field
  const handleSourceBlur = useCallback(async () => {
    if (!formData.source?.trim()) return;
    try {
      const context = await getIncomeSourceContext(formData.source);
      if (context) {
        const contextData = applyIncomeContext(context);
        setFormData(prev => ({ ...prev, ...contextData }));
        console.log('✅ Applied context for:', formData.source);
      }
    } catch (error) {
      console.error('Error loading context:', error);
    }
  }, [formData.source]);

  useEffect(() => {
    if (focusTarget?.type === 'income' && focusTarget.id) {
      const key = String(normalizeId(focusTarget.id));
      const node = incomeRefs.current[key];
      if (node?.scrollIntoView) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const timer = setTimeout(() => onClearFocus?.(), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [focusTarget, onClearFocus]);

  const handleAdd = async () => {
    if (!formData.source || !formData.amount || !formData.date) {
      showToast.error('Please fill in required fields: Source, Amount, and Date');
      return;
    }

    if (formData.frequency !== 'onetime') {
      if (formData.recurringDurationType === 'until_date' && !formData.recurringUntilDate) {
        showToast.error('Please specify the end date for recurring income');
        return;
      }
      if (
        formData.recurringDurationType === 'occurrences' &&
        (!formData.recurringOccurrences || parseInt(formData.recurringOccurrences, 10) < 1)
      ) {
        showToast.error('Please specify the number of times this income will occur');
        return;
      }
    }
    
    const actionId = editingItem ? `edit-income-${editingItem.id}` : 'add-income';
    
    const result = await executeAction(actionId, async () => {
    
    const isEditing = !!editingItem;
    const newAmount = parseFloat(formData.amount) || 0;
    
    const incomeEntry = {
      ...(editingItem?.id ? { id: editingItem.id } : { id: generateId() }),
      source: formData.source,
      amount: newAmount,
      date: formData.date,
      frequency: formData.frequency,
      recurring_duration_type: formData.frequency === 'onetime' ? null : formData.recurringDurationType,
      recurring_until_date: formData.recurringDurationType === 'until_date' ? formData.recurringUntilDate : null,
      recurring_occurrences_total:
        formData.recurringDurationType === 'occurrences'
          ? parseInt(formData.recurringOccurrences, 10) || null
          : null,
      recurring_occurrences_completed: editingItem?.recurring_occurrences_completed || 0,
      deposit_account_id: formData.depositTarget === 'bank' ? (formData.depositAccountId || null) : null
    };
    
    const savedIncome = await dbOperation('income', 'put', incomeEntry, { skipActivityLog: true });
    const incomeId = savedIncome?.id || editingItem?.id;
    
    if (isEditing) {
      // Build detailed description for EDIT
      const oldSource = editingItem.source || '';
      const newSource = savedIncome?.source || incomeEntry.source || '';
      const oldAmount = parseFloat(editingItem.amount) || 0;
      const oldFrequency = editingItem.frequency || 'onetime';
      const newFrequency = savedIncome?.frequency || incomeEntry.frequency || 'onetime';
      const oldDate = editingItem.date || '';
      const newDate = savedIncome?.date || incomeEntry.date || '';
      const oldDepositAccount = editingItem.deposit_account_id || null;
      const newDepositAccount = savedIncome?.deposit_account_id || incomeEntry.deposit_account_id || null;
      
      // Get account names for display
      const oldAccountName = oldDepositAccount 
        ? bankAccounts.find(a => a.id === oldDepositAccount)?.name || 'Unknown Account'
        : 'None';
      const newAccountName = newDepositAccount
        ? bankAccounts.find(a => a.id === newDepositAccount)?.name || 'Unknown Account'
        : 'None';

      let details = '';
      if (oldSource !== newSource) {
        details += `Source "${oldSource}" → "${newSource}" • `;
      }
      if (oldAmount !== newAmount) {
        details += `Amount ${formatCurrency(oldAmount)} → ${formatCurrency(newAmount)} • `;
      }
      if (oldFrequency !== newFrequency) {
        details += `Frequency ${oldFrequency} → ${newFrequency} • `;
      }
      if (oldDate !== newDate) {
        details += `Date ${formatDate(oldDate)} → ${formatDate(newDate)} • `;
      }
      if (oldDepositAccount !== newDepositAccount) {
        details += `Deposit account ${oldAccountName} → ${newAccountName} • `;
      }
      
      // Remove trailing bullet
      details = details.replace(/ • $/, '');

      const description = details
        ? `Updated income '${savedIncome?.source || incomeEntry.source}' - ${details}`
        : `Updated income '${savedIncome?.source || incomeEntry.source}'`;

      await logActivity(
        'edit',
        'income',
        incomeId,
        savedIncome?.source || incomeEntry.source,
        description,
        {
          previous: { ...editingItem, id: editingItem?.id || incomeId },
          updated: { ...savedIncome, id: savedIncome?.id || incomeId }
        }
      );
    }

    if (!isEditing) {
      const previousCash = availableCash;

      const transaction = {
        type: 'income',
        amount: newAmount,
        date: formData.date,
        income_source: formData.source,
        payment_method: 'cash',
        payment_method_id: incomeId,
        status: 'active',
        undone_at: null
      };
      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });
      
      // Handle cash vs bank deposit
      let newCash = availableCash + newAmount;
      if (formData.reservedAmount && parseFloat(formData.reservedAmount) > 0) {
        newCash -= parseFloat(formData.reservedAmount);
      }
      
      if (formData.depositTarget === 'cash_in_hand') {
        // Add to cash in hand
        const currentCashInHand = cashInHand || 0;
        const updatedCashInHand = currentCashInHand + newAmount;
        if (onUpdateCashInHand) await onUpdateCashInHand(updatedCashInHand);
      } else {
        // Add to bank account
        await onUpdateCash(newCash, {
          accountId: formData.depositAccountId || undefined
        });
      }

      // Get deposit destination for activity description
      const depositDestination = formData.depositTarget === 'cash_in_hand'
        ? 'cash in hand'
        : (formData.depositAccountId
            ? bankAccounts.find(a => a.id === formData.depositAccountId)?.name || null
            : null);

      // Build detailed description for ADD
      let description = `Added income '${formData.source}' - Amount ${formatCurrency(newAmount)} • Frequency ${formatFrequency(formData.frequency)} • Date ${formatDate(formData.date)}`;
      if (depositDestination) {
        description += formData.depositTarget === 'cash_in_hand'
          ? ` • Kept as cash in hand`
          : ` • Deposited to ${depositDestination}`;
      }

      await logActivity(
        'income',
        'income',
        incomeId,
        formData.source,
        description,
        {
          amount: newAmount,
          source: formData.source,
          frequency: formData.frequency,
          date: formData.date,
          depositTarget: formData.depositTarget,
          depositAccountId: formData.depositAccountId,
          depositDestination,
          previousCash,
          newCash,
          transactionId: savedTransaction?.id,
          incomeId
        }
      );

      // Save context for future use (non-blocking)
      if (formData.source) {
        saveIncomeSourceContext(formData.source, {
          depositTarget: formData.depositTarget,
          depositAccountId: formData.depositAccountId,
          frequency: formData.frequency
        }).catch(err => console.warn('Failed to save income context:', err));
      }
    }

    await onUpdate();
    resetForm();
    
    return {
      source: formData.source,
      amount: newAmount,
      isNew: !isEditing
    };
  });
  
  if (result.success) {
    const action = result.data.isNew ? 'logged' : 'updated';
    showToast.success(`Income from '${result.data.source}' ${action} successfully`);
  } else {
    showToast.error(`Failed to save income: ${result.error.message}`);
  }
};

  const handleEdit = (inc) => {
    const primaryAccount = getPrimaryAccountFromArray(bankAccounts);
    setFormData({
      source: inc.source,
      amount: inc.amount.toString(),
      date: inc.date,
      frequency: inc.frequency,
      reservedAmount: '',
      recurringDurationType: inc.recurring_duration_type || 'indefinite',
      recurringUntilDate: inc.recurring_until_date || '',
      recurringOccurrences: inc.recurring_occurrences_total?.toString() || '',
      depositTarget: inc.deposit_account_id ? 'bank' : 'cash_in_hand',
      depositAccountId: inc.deposit_account_id || primaryAccount?.id || ''
    });
    setEditingItem(inc);
    setShowAddForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this income entry?')) {
      return;
    }
    
    const inc = income.find(i => String(i.id) === String(id));
    if (!inc) return;
    
    const result = await executeAction(`delete-income-${id}`, async () => {

      const previousCash = availableCash;
      let relatedTransactions = [];
      try {
        const transactions = await dbOperation('transactions', 'getAll');
        relatedTransactions = (transactions || []).filter(
          (t) => t.type === 'income' && (String(t.payment_method_id) === String(id))
        );
      } catch (error) {
        console.warn('Unable to fetch linked transactions for income deletion:', error);
      }

      const linkedSnapshots = relatedTransactions.map(trx => ({
        ...trx,
        status: 'active',
        undone_at: null
      }));

      // Get deposit account name for activity description
      const depositAccountName = inc.deposit_account_id
        ? bankAccounts.find(a => a.id === inc.deposit_account_id)?.name || null
        : null;

      // Build detailed description for DELETE
      let description = `Deleted income '${inc.source}' - Amount ${formatCurrency(inc.amount)} • Frequency ${formatFrequency(inc.frequency) || 'One Time'}`;
      if (depositAccountName) {
        description += ` • Was deposited to ${depositAccountName}`;
      }

      await logActivity(
        'delete',
        'income',
        id,
        inc.source,
        description,
        {
          ...inc,
          depositAccountName,
          previousCash,
          linkedTransactions: linkedSnapshots
        }
      );

      const newCash = previousCash - inc.amount;
      await onUpdateCash(newCash, {
        accountId: inc.deposit_account_id || undefined
      });
      await dbOperation('income', 'delete', id, { skipActivityLog: true });

      for (const trx of relatedTransactions) {
        try {
          await dbOperation('transactions', 'delete', trx.id, { skipActivityLog: true });
        } catch (error) {
          console.warn('Unable to remove linked transaction during income deletion:', error);
        }
      }

      await onUpdate();
      
      return { source: inc.source, amount: inc.amount };
    });
    
    if (result.success) {
      showToast.success(`Income from '${result.data.source}' deleted successfully`);
    } else {
      showToast.error(`Failed to delete income: ${result.error.message}`);
    }
  };

  const resetForm = () => {
    const primaryAccount = getPrimaryAccountFromArray(bankAccounts);
    setFormData({
      source: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      frequency: 'onetime',
      reservedAmount: '',
      recurringDurationType: 'indefinite',
      recurringUntilDate: '',
      recurringOccurrences: '',
      depositTarget: 'bank',
      depositAccountId: primaryAccount?.id || ''
    });
    setShowAddForm(false);
    setEditingItem(null);
    loadIncomeContexts().catch(console.error);
  };

  useEffect(() => {
    const checkAndDepositIncome = async () => {
      try {
        const results = await autoDepositDueIncome(income, availableCash, onUpdateCash);
        if (results.deposited.length > 0) {
          console.log('🎉 Auto-deposited income:', results.deposited);
          if (onUpdate) {
            await onUpdate();
          }
        }
      } catch (error) {
        console.error('Error in auto-deposit check:', error);
      }
    };

    if (income.length > 0) {
      checkAndDepositIncome();
    }
  }, [income.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPredictedIncome = () => {
    if (income.length === 0) return [];
    
    const recurringIncomes = income.filter(inc =>
      inc.frequency && inc.frequency !== 'onetime'
    );

    if (recurringIncomes.length === 0) return [];

    const allPredictions = [];
    recurringIncomes.forEach(inc => {
      let currentDate = inc.date;
      const generateCount = Math.max(predictionCount * 2, 20);
      const totalOccurrences = inc.recurring_occurrences_total || null;
      const completedOccurrences = inc.recurring_occurrences_completed || 0;
      const remainingOccurrences = totalOccurrences ? Math.max(totalOccurrences - completedOccurrences, 0) : null;
      let futureCount = 0;

      for (let i = 0; i < generateCount; i++) {
        currentDate = predictNextDate(currentDate, inc.frequency);
        const daysUntil = getDaysUntil(currentDate);

        if (daysUntil >= 0) {
          futureCount += 1;

          if (remainingOccurrences !== null && futureCount > remainingOccurrences) {
            break;
          }

          if (inc.recurring_duration_type === 'until_date' && inc.recurring_until_date) {
            const endDate = new Date(inc.recurring_until_date);
            const predictionDate = new Date(currentDate);
            if (predictionDate > endDate) {
              break;
            }
          }

          allPredictions.push({
            date: currentDate,
            amount: Number(inc.amount) || 0,
            source: inc.source,
            frequency: inc.frequency,
            days: daysUntil,
            sortDate: new Date(currentDate).getTime(),
            incomeId: inc.id
          });
        }
      }
    });
    
    allPredictions.sort((a, b) => a.sortDate - b.sortDate);
    
    return allPredictions.slice(0, predictionCount);
  };

  const predictedIncome = getPredictedIncome();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Income</h2>
        <button
          onClick={() => {
            if (showAddForm) {
              resetForm();
            } else {
              setShowAddForm(true);
            }
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          <Plus size={20} />
          {showAddForm ? 'Cancel' : 'Log Income'}
        </button>
      </div>

      {showAddForm && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          
          {/* Quick-Select Buttons */}
          {recentSources.length > 0 && !editingItem && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Recent Sources
              </label>
              <div className="flex gap-2 flex-wrap">
                {recentSources.map(source => (
                  <button
                    key={source.source_name}
                    type="button"
                    onClick={() => handleSelectSource(source)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      formData.source === source.source_name
                        ? 'bg-blue-600 text-white'
                        : darkMode 
                          ? 'bg-blue-900 text-blue-200 hover:bg-blue-800 border border-blue-700'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'
                    }`}
                  >
                    {source.source_name}
                    {source.usage_count > 10 && ' ⭐'}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Source Input */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {recentSources.length > 0 ? 'Or type new source *' : 'Source *'}
            </label>
            <input
              ref={sourceInputRef}
              type="text"
              value={formData.source}
              onChange={(e) => handleSourceChange(e.target.value)}
              onBlur={handleSourceBlur}
              placeholder="e.g., Salary, Bonus, Freelance"
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              required
              autoFocus={!editingItem && recentSources.length === 0}
            />
          </div>

          <input
            type="number"
            step="0.01"
            placeholder="Amount Received *"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          
          {/* Deposit Destination */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Where is this money going? *
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="depositTarget"
                  value="bank"
                  checked={formData.depositTarget === 'bank'}
                  onChange={(e) => setFormData({ ...formData, depositTarget: e.target.value })}
                  className="w-4 h-4"
                />
                <span className="text-sm">Deposit to Bank Account</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="depositTarget"
                  value="cash_in_hand"
                  checked={formData.depositTarget === 'cash_in_hand'}
                  onChange={(e) => setFormData({ ...formData, depositTarget: e.target.value })}
                  className="w-4 h-4"
                />
                <span className="text-sm">Keep as Cash in Hand</span>
              </label>
              
              {/* Warning for cash in hand */}
              {formData.depositTarget === 'cash_in_hand' && (
                <div className={`flex items-start gap-2 p-2 rounded ${darkMode ? 'bg-yellow-900/20 border border-yellow-800' : 'bg-yellow-50 border border-yellow-200'}`}>
                  <AlertCircle size={14} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className={`text-xs ${darkMode ? 'text-yellow-300' : 'text-yellow-800'}`}>
                    Tip: For better tracking and safety, consider depositing income to a bank account instead of keeping as cash.
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Bank Account Selection (conditional) */}
          {formData.depositTarget === 'bank' && bankAccounts && bankAccounts.length > 0 && (
            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Select Account *
              </label>
              <select
                value={formData.depositAccountId}
                onChange={(e) => setFormData({ ...formData, depositAccountId: e.target.value })}
                className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
              >
                <option value="">Select account</option>
                {bankAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} {account.is_primary ? '(Primary)' : ''} - {formatCurrency(account.balance)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Date Received *</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
            />
          </div>
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Frequency</label>
            <select
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
              className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="onetime">One-time</option>
            </select>
          </div>
          {formData.frequency !== 'onetime' && (
            <>
              <div>
                <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Recurring Duration
                </label>
                <select
                  value={formData.recurringDurationType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      recurringDurationType: e.target.value,
                      recurringUntilDate: '',
                      recurringOccurrences: ''
                    })
                  }
                  className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                >
                  <option value="indefinite">Indefinite (continues forever)</option>
                  <option value="until_date">Until specific date</option>
                  <option value="occurrences">For specific number of times</option>
                </select>
              </div>

              {formData.recurringDurationType === 'until_date' && (
                <div>
                  <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.recurringUntilDate}
                    onChange={(e) => setFormData({ ...formData, recurringUntilDate: e.target.value })}
                    className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              )}

              {formData.recurringDurationType === 'occurrences' && (
                <div>
                  <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Number of Times *
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g., 12 for 12 months"
                    value={formData.recurringOccurrences}
                    onChange={(e) => setFormData({ ...formData, recurringOccurrences: e.target.value })}
                    className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                  />
                  {editingItem && editingItem.recurring_occurrences_completed > 0 && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Completed: {editingItem.recurring_occurrences_completed} of{' '}
                      {editingItem.recurring_occurrences_total || formData.recurringOccurrences || '?'}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {!editingItem && (
            <input
              type="number"
              step="0.01"
              placeholder="Amount to Reserve (optional)"
              value={formData.reservedAmount}
              onChange={(e) => setFormData({ ...formData, reservedAmount: e.target.value })}
              className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
            />
          )}
          <div className="flex gap-2">
            <ActionButton
              onClick={handleAdd}
              processing={isActionProcessing(editingItem ? `edit-income-${editingItem.id}` : 'add-income')}
              variant="primary"
              processingText={editingItem ? 'Updating Income...' : 'Logging Income...'}
              idleText={editingItem ? 'Update Income' : 'Log Income'}
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

      {predictedIncome.length > 0 && (
        <div className={`${darkMode ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'} border rounded-lg p-4`}>
          <div className="flex justify-between items-center mb-3">
            <h3 className={`font-semibold ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>
              Predicted Income
            </h3>
            <div className="flex items-center gap-2">
              <label className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                Show next:
              </label>
              <select
                value={predictionCount}
                onChange={(e) => setPredictionCount(parseInt(e.target.value, 10))}
                className={`px-2 py-1 text-sm rounded border ${
                  darkMode 
                    ? 'bg-blue-800 border-blue-600 text-blue-200' 
                    : 'bg-white border-blue-300 text-blue-900'
                }`}
              >
                <option value="5">5</option>
                <option value="8">8</option>
                <option value="10">10</option>
                <option value="15">15</option>
                <option value="20">20</option>
                <option value="30">30</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            {predictedIncome.map((pred, idx) => (
              <div key={idx} className={`flex justify-between items-center text-sm ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}>
                <div>
                  <div className="font-medium">{pred.source}</div>
                  <div className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                    {formatDate(pred.date)} • {formatFrequency(pred.frequency)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(pred.amount)}</div>
                  <div className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                    {pred.days === 0 ? 'Due today' : pred.days === 1 ? 'Tomorrow' : `${pred.days} days`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {income.length === 0 ? (
          <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <DollarSign size={48} className="mx-auto mb-3 opacity-30" />
            <p>No income logged yet</p>
          </div>
        ) : (
          [...income].sort((a, b) => new Date(b.date) - new Date(a.date)).map(inc => {
            const incomeKey = String(normalizeId(inc.id));
            const isHighlighted = focusTarget?.type === 'income' && normalizeId(focusTarget.id) === normalizeId(inc.id);
            return (
            <div
              key={incomeKey}
              ref={(el) => {
                if (el) incomeRefs.current[incomeKey] = el;
              }}
              className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 ${isHighlighted ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold">{inc.source}</h3>
                  <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    <span>{formatFrequency(inc.frequency)}</span>
                    {inc.frequency !== 'onetime' && inc.recurring_duration_type && (
                      <span className="ml-2">
                        {inc.recurring_duration_type === 'until_date' && inc.recurring_until_date && (
                          <>• Until {formatDate(inc.recurring_until_date)}</>
                        )}
                        {inc.recurring_duration_type === 'occurrences' && inc.recurring_occurrences_total && (
                          <>
                            • {inc.recurring_occurrences_completed || 0}/{inc.recurring_occurrences_total} times
                          </>
                        )}
                        {inc.recurring_duration_type === 'indefinite' && <>• Indefinite</>}
                      </span>
                    )}
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
                    {formatDate(inc.date)}
                    {getDaysUntil(inc.date) === 0 && (
                      <span className="ml-2 text-green-600 font-medium">• Received today</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(inc.amount)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onNavigateToTransactions && onNavigateToTransactions({ incomeSource: inc.id })}
                      className={`p-2 ${darkMode ? 'text-purple-400 hover:bg-gray-700' : 'text-purple-600 hover:bg-purple-50'} rounded`}
                      title="View transactions"
                    >
                      <ListFilter size={18} />
                    </button>
                    <button
                      onClick={() => handleEdit(inc)}
                      className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded`}
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(inc.id)}
                      className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
          })
        )}
      </div>
    </div>
  );
}
