import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, DollarSign, Edit2, X, ListFilter, AlertCircle, Zap, CheckCircle } from 'lucide-react';
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
    depositAccountId: '',
    autoDeposit: true
  });
  const [recentSources, setRecentSources] = useState([]);
  const sourceInputRef = useRef(null);
  const incomeRefs = useRef({});
  const [predictionCount, setPredictionCount] = useState(8);
  const [checkingDueIncome, setCheckingDueIncome] = useState(false);
  const [showDepositConfirmation, setShowDepositConfirmation] = useState(false);
  const [pendingDeposits, setPendingDeposits] = useState([]);
  
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

  const handleSourceChange = (value) => {
    setFormData(prev => ({ ...prev, source: value }));
  };

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
      deposit_account_id: formData.depositTarget === 'bank' ? (formData.depositAccountId || null) : null,
      auto_deposit: formData.frequency !== 'onetime' ? formData.autoDeposit : false
    };
    
    const savedIncome = await dbOperation('income', 'put', incomeEntry, { skipActivityLog: true });
    const incomeId = savedIncome?.id || editingItem?.id;
    
    if (isEditing) {
      const oldSource = editingItem.source || '';
      const newSource = savedIncome?.source || incomeEntry.source || '';
      const oldAmount = parseFloat(editingItem.amount) || 0;
      const oldFrequency = editingItem.frequency || 'onetime';
      const newFrequency = savedIncome?.frequency || incomeEntry.frequency || 'onetime';
      const oldDate = editingItem.date || '';
      const newDate = savedIncome?.date || incomeEntry.date || '';
      const oldDepositAccount = editingItem.deposit_account_id || null;
      const newDepositAccount = savedIncome?.deposit_account_id || incomeEntry.deposit_account_id || null;
      
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
      
      let newCash = availableCash + newAmount;
      if (formData.reservedAmount && parseFloat(formData.reservedAmount) > 0) {
        newCash -= parseFloat(formData.reservedAmount);
      }
      
      if (formData.depositTarget === 'cash_in_hand') {
        const currentCashInHand = cashInHand || 0;
        const updatedCashInHand = currentCashInHand + newAmount;
        if (onUpdateCashInHand) await onUpdateCashInHand(updatedCashInHand);
      } else {
        await onUpdateCash(newCash, {
          accountId: formData.depositAccountId || undefined
        });
      }

      const depositDestination = formData.depositTarget === 'cash_in_hand'
        ? 'cash in hand'
        : (formData.depositAccountId
            ? bankAccounts.find(a => a.id === formData.depositAccountId)?.name || null
            : null);

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
      amount: (parseFloat(inc.amount) || 0).toFixed(2),
      date: inc.date,
      frequency: inc.frequency,
      reservedAmount: '',
      recurringDurationType: inc.recurring_duration_type || 'indefinite',
      recurringUntilDate: inc.recurring_until_date || '',
      recurringOccurrences: inc.recurring_occurrences_total?.toString() || '',
      depositTarget: inc.deposit_account_id ? 'bank' : 'cash_in_hand',
      depositAccountId: inc.deposit_account_id || primaryAccount?.id || '',
      autoDeposit: inc.auto_deposit !== false
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

      const depositAccountName = inc.deposit_account_id
        ? bankAccounts.find(a => a.id === inc.deposit_account_id)?.name || null
        : null;

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
      depositAccountId: primaryAccount?.id || '',
      autoDeposit: true
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
          const sources = results.deposited.map(d => d.source).join(', ');
          showToast.success(`Auto-deposited income from: ${sources}`);
          
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

  const getPendingDeposits = () => {
    return income.filter(inc => {
      if (!inc.frequency || inc.frequency === 'onetime') return false;
      if (inc.auto_deposit === false) return false;
      
      const nextDate = predictNextDate(inc.date, inc.frequency);
      const daysUntil = getDaysUntil(nextDate);
      
      return daysUntil === 0;
    });
  };

  const handleCheckDueIncome = async () => {
    const pending = getPendingDeposits();
    
    if (pending.length === 0) {
      showToast.info('No income is due for auto-deposit today');
      return;
    }
    
    setPendingDeposits(pending);
    setShowDepositConfirmation(true);
  };

  const handleConfirmDeposit = async () => {
    setCheckingDueIncome(true);
    setShowDepositConfirmation(false);
    
    try {
      const results = await autoDepositDueIncome(income, availableCash, onUpdateCash);
      
      if (results.deposited.length > 0) {
        const totalAmount = results.deposited.reduce((sum, d) => sum + d.amount, 0);
        const sources = results.deposited.map(d => d.source).join(', ');
        showToast.success(
          `Successfully deposited ${formatCurrency(totalAmount)} from: ${sources}`
        );
        
        if (onUpdate) {
          await onUpdate();
        }
      } else {
        showToast.info('No income was deposited');
      }
    } catch (error) {
      console.error('Error checking due income:', error);
      showToast.error(`Failed to deposit income: ${error.message}`);
    } finally {
      setCheckingDueIncome(false);
      setPendingDeposits([]);
    }
  };

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
            incomeId: inc.id,
            autoDeposit: inc.auto_deposit !== false
          });
        }
      }
    });
    
    allPredictions.sort((a, b) => a.sortDate - b.sortDate);
    
    return allPredictions.slice(0, predictionCount);
  };

  const predictedIncome = getPredictedIncome();
  const pendingTodayCount = getPendingDeposits().length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-4">
        <h2 className="text-xl md:text-2xl font-bold">Income</h2>
        <div className="flex gap-2">
          <button
            onClick={handleCheckDueIncome}
            disabled={checkingDueIncome}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base rounded-lg font-medium ${
              checkingDueIncome
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            } text-white relative`}
            title="Check for income due today and deposit automatically"
          >
            <Zap size={20} />
            {checkingDueIncome ? 'Checking...' : 'Check Due Income'}
            {pendingTodayCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                {pendingTodayCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              if (showAddForm) {
                resetForm();
              } else {
                setShowAddForm(true);
              }
            }}
            className="flex items-center gap-1 sm:gap-2 bg-blue-600 text-white px-3 sm:px-4 py-2 text-sm sm:text-base rounded-lg"
          >
            <Plus size={20} />
            {showAddForm ? 'Cancel' : 'Log Income'}
          </button>
        </div>
      </div>

      {/* Deposit Confirmation Modal */}
      {showDepositConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowDepositConfirmation(false)}>
          <div 
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 max-w-md w-full`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-full">
                <DollarSign size={24} className="text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Auto-Deposit Due Income</h3>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {pendingDeposits.length} income source{pendingDeposits.length !== 1 ? 's' : ''} due today
                </p>
              </div>
            </div>
            
            <div className="space-y-2 mb-6">
              {pendingDeposits.map(inc => (
                <div key={inc.id} className={`p-3 rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-semibold">{inc.source}</div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {formatFrequency(inc.frequency)}
                      </div>
                    </div>
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(inc.amount)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={`p-3 rounded-lg mb-4 ${darkMode ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
              <p className={`text-sm ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                Total to deposit: <strong>{formatCurrency(pendingDeposits.reduce((sum, inc) => sum + (parseFloat(inc.amount) || 0), 0))}</strong>
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDepositConfirmation(false)}
                className={`flex-1 px-4 py-2 rounded-lg font-medium ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeposit}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
              >
                Confirm Deposit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          
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
              
              {/* Auto-Deposit Toggle */}
              <div className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-3`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.autoDeposit}
                    onChange={(e) => setFormData({ ...formData, autoDeposit: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Enable Auto-Deposit
                    </div>
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                      Automatically deposit this income when it becomes due
                    </div>
                  </div>
                </label>
              </div>
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

      {/* Pending Deposits Alert */}
      {pendingTodayCount > 0 && (
        <div className={`${darkMode ? 'bg-green-900/20 border-green-700' : 'bg-green-50 border-green-200'} border rounded-lg p-4`}>
          <div className={`flex items-center gap-2 ${darkMode ? 'text-green-200' : 'text-green-800'} font-semibold mb-2`}>
            <CheckCircle size={20} />
            <span>Pending Auto-Deposits Today</span>
          </div>
          <div className="space-y-2">
            {getPendingDeposits().map(inc => (
              <div key={inc.id} className={`flex justify-between items-center text-sm ${darkMode ? 'text-green-100' : 'text-green-900'}`}>
                <div className="font-medium">{inc.source}</div>
                <div className="font-semibold">{formatCurrency(inc.amount)}</div>
              </div>
            ))}
          </div>
          <p className={`text-xs ${darkMode ? 'text-green-300' : 'text-green-700'} mt-2`}>
            Click "Check Due Income" to review and deposit these amounts
          </p>
        </div>
      )}

      {/* Predicted Income */}
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
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{pred.source}</span>
                    {pred.days === 0 && pred.autoDeposit && (
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${darkMode ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-700'}`}>
                        Auto-deposits today
                      </span>
                    )}
                  </div>
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

      {/* Income Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold">{inc.source}</h3>
                    {inc.frequency !== 'onetime' && inc.auto_deposit !== false && (
                      <span className={`text-xs px-2 py-0.5 rounded ${darkMode ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-700'}`}>
                        Auto-Deposit
                      </span>
                    )}
                  </div>
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
                  <div className="flex gap-1 sm:gap-2">
                    <button
                      onClick={() => onNavigateToTransactions && onNavigateToTransactions({ incomeSource: inc.id })}
                      className={`p-1.5 sm:p-2 min-h-[44px] sm:min-h-0 ${darkMode ? 'text-purple-400 hover:bg-gray-700' : 'text-purple-600 hover:bg-purple-50'} rounded`}
                      title="View transactions"
                    >
                      <ListFilter size={16} className="sm:w-[18px] sm:h-[18px]" />
                    </button>
                    <button
                      onClick={() => handleEdit(inc)}
                      className={`p-1.5 sm:p-2 min-h-[44px] sm:min-h-0 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded`}
                    >
                      <Edit2 size={16} className="sm:w-[18px] sm:h-[18px]" />
                    </button>
                    <button
                      onClick={() => handleDelete(inc.id)}
                      className={`p-1.5 sm:p-2 min-h-[44px] sm:min-h-0 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}
                    >
                      <X size={16} className="sm:w-[18px] sm:h-[18px]" />
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
