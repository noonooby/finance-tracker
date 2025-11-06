import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, DollarSign, Edit2, X, ListFilter, AlertCircle, Zap, CheckCircle, Calendar, Pause, Play, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, getPrimaryAccountFromArray, predictNextDate } from '../utils/helpers';
import { formatFrequency } from '../utils/sentenceCase';
import { processDueIncomeSchedules, getIncomeSchedules, toggleIncomeSchedule, deleteIncomeSchedule, updateIncomeSchedule } from '../utils/schedules';
import useAsyncAction from '../hooks/useAsyncAction';
import ActionButton from './shared/ActionButton';
import { showToast } from '../utils/toast';
import {
  useIncomeOperations,
  useIncomeContexts,
  useIncomeValidation,
  useIncomePredictions
} from '../hooks/transactions';

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
  const sourceInputRef = useRef(null);
  const incomeRefs = useRef({});
  const [predictionCount, setPredictionCount] = useState(8);
  const [checkingDueIncome, setCheckingDueIncome] = useState(false);
  const [showDepositConfirmation, setShowDepositConfirmation] = useState(false);
  const [pendingDeposits, setPendingDeposits] = useState([]);
  
  // New: Income schedules state
  const [schedules, setSchedules] = useState([]);
  const [showSchedules, setShowSchedules] = useState(true);
  
  // Use extracted hooks
  const { addIncome, deleteIncome } = useIncomeOperations();
  const { recentSources, handleSelectSource, handleSourceBlur } = useIncomeContexts(editingItem);
  const { getDefaultFormData, validateIncomeForm } = useIncomeValidation();
  const { predictedIncome, pendingDeposits: pendingDepositsFromHook, pendingTodayCount } = useIncomePredictions(income, predictionCount);
  
  const [formData, setFormData] = useState(() => getDefaultFormData(bankAccounts));
  
  const { executeAction, isProcessing: isActionProcessing } = useAsyncAction();

  // Load income schedules
  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      const loadedSchedules = await getIncomeSchedules();
      setSchedules(loadedSchedules || []);
    } catch (error) {
      console.error('Error loading income schedules:', error);
    }
  };

  const normalizeId = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') {
      if (value.id !== undefined) return String(value.id);
      if (value.value !== undefined) return String(value.value);
      return null;
    }
    return String(value);
  };

  const handleSelectSourceClick = useCallback(async (sourceContext) => {
    const contextData = await handleSelectSource(sourceContext);
    if (contextData) {
      setFormData(prev => ({ ...prev, ...contextData }));
      setTimeout(() => {
        const amountInput = document.querySelector('input[placeholder="Amount Received *"]');
        if (amountInput) amountInput.focus();
      }, 50);
    }
  }, [handleSelectSource]);

  const handleSourceChange = (value) => {
    setFormData(prev => ({ ...prev, source: value }));
  };

  const handleSourceBlurEvent = useCallback(async () => {
    if (!formData.source?.trim()) return;
    const contextData = await handleSourceBlur(formData.source);
    if (contextData) {
      setFormData(prev => ({ ...prev, ...contextData }));
    }
  }, [formData.source, handleSourceBlur]);

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
    // Validate form
    const validation = validateIncomeForm(formData);
    if (!validation.isValid) {
      showToast.error(validation.errors[0]);
      return;
    }
    
    const actionId = editingItem ? `edit-income-${editingItem.id}` : 'add-income';
    
    const result = await executeAction(actionId, async () => {
      return await addIncome({
        formData,
        editingItem,
        availableCash,
        onUpdateCash,
        bankAccounts,
        cashInHand,
        onUpdateCashInHand,
        onUpdate
      });
    });
    
    if (result?.success) {
      const action = result.data.isNew ? 'created' : 'updated';
      const itemType = formData.frequency !== 'onetime' ? 'schedule' : 'income';
      showToast.success(`Income ${itemType} from '${result.data.source}' ${action} successfully`);
      resetForm();
      await loadSchedules();
    } else if (result?.error) {
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

  const handleDelete = async (id, isSchedule = false) => {
    if (!window.confirm(`Delete this ${isSchedule ? 'income schedule' : 'income entry'}?`)) {
      return;
    }
    
    if (isSchedule) {
      try {
        await deleteIncomeSchedule(id);
        showToast.success('Income schedule deleted successfully');
        await loadSchedules();
        if (onUpdate) await onUpdate();
      } catch (error) {
        showToast.error(`Failed to delete schedule: ${error.message}`);
      }
    } else {
      const result = await executeAction(`delete-income-${id}`, async () => {
        return await deleteIncome({
          incomeId: id,
          income,
          availableCash,
          onUpdateCash,
          bankAccounts,
          cashInHand,
          onUpdateCashInHand,
          onUpdate
        });
      });
      
      if (result?.success) {
        showToast.success(`Income from '${result.data.source}' deleted successfully`);
      } else if (result?.error) {
        showToast.error(`Failed to delete income: ${result.error.message}`);
      }
    }
  };

  const handleToggleSchedule = async (scheduleId, pause) => {
    try {
      await toggleIncomeSchedule(scheduleId, pause);
      showToast.success(pause ? 'Schedule paused' : 'Schedule resumed');
      await loadSchedules();
    } catch (error) {
      showToast.error(`Failed to ${pause ? 'pause' : 'resume'} schedule: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData(getDefaultFormData(bankAccounts));
    setShowAddForm(false);
    setEditingItem(null);
  };

  useEffect(() => {
    const checkAndDepositIncome = async () => {
      try {
        const results = await processDueIncomeSchedules();
        if (results.deposited.length > 0) {
          console.log('🎉 Auto-deposited income:', results.deposited);
          const sources = results.deposited.map(d => d.source).join(', ');
          showToast.success(`Auto-deposited income from: ${sources}`);
          
          if (onUpdate) {
            await onUpdate();
          }
          await loadSchedules();
        }
      } catch (error) {
        console.error('Error in auto-deposit check:', error);
      }
    };

    checkAndDepositIncome();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckDueIncome = async () => {
    setCheckingDueIncome(true);
    
    try {
      const results = await processDueIncomeSchedules();
      
      if (results.deposited.length > 0) {
        const totalAmount = results.deposited.reduce((sum, d) => sum + d.amount, 0);
        const sources = results.deposited.map(d => d.source).join(', ');
        showToast.success(
          `Successfully deposited ${formatCurrency(totalAmount)} from: ${sources}`
        );
        
        if (onUpdate) await onUpdate();
        await loadSchedules();
      } else {
        showToast.info('No income is due for auto-deposit today');
      }
    } catch (error) {
      console.error('Error checking due income:', error);
      showToast.error(`Failed to deposit income: ${error.message}`);
    } finally {
      setCheckingDueIncome(false);
    }
  };

  // Separate manual income from schedule occurrences
  const manualIncome = income.filter(inc => inc.is_manual || inc.frequency === 'onetime');
  const scheduleOccurrences = income.filter(inc => inc.schedule_id);

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
            {showAddForm ? 'Cancel' : 'Add Income'}
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          <h3 className="font-semibold text-lg">{editingItem ? 'Edit Income' : 'Add Income'}</h3>
          
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
                    onClick={() => handleSelectSourceClick(source)}
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
              onBlur={handleSourceBlurEvent}
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
              <option value="onetime">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          
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
          
          <div className="flex gap-2">
            <ActionButton
              onClick={handleAdd}
              processing={isActionProcessing(editingItem ? `edit-income-${editingItem.id}` : 'add-income')}
              variant="primary"
              processingText={editingItem ? 'Updating...' : formData.frequency !== 'onetime' ? 'Creating Schedule...' : 'Logging Income...'}
              idleText={editingItem ? 'Update Income' : formData.frequency !== 'onetime' ? 'Create Schedule' : 'Log Income'}
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

      {/* Income Schedules Section */}
      {schedules.length > 0 && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Calendar size={20} />
              Recurring Income Schedules ({schedules.filter(s => s.is_active).length} active)
            </h3>
            <button
              onClick={() => setShowSchedules(!showSchedules)}
              className={`text-sm ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}
            >
              {showSchedules ? 'Hide' : 'Show'}
            </button>
          </div>

          {showSchedules && (
            <div className="space-y-2">
              {schedules.map(schedule => {
                const nextDate = schedule.next_date;
                const daysUntil = getDaysUntil(nextDate);
                const isOverdue = daysUntil < 0;
                const isDueToday = daysUntil === 0;
                const depositAccountName = schedule.deposit_account_id
                  ? bankAccounts.find(a => a.id === schedule.deposit_account_id)?.name || 'Unknown Account'
                  : 'Cash in Hand';
                
                return (
                  <div
                    key={schedule.id}
                    className={`${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} border rounded-lg p-3 ${
                      !schedule.is_active ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold">{schedule.source}</h4>
                          {!schedule.is_active && (
                            <span className={`text-xs px-2 py-0.5 rounded ${darkMode ? 'bg-gray-600 text-gray-300' : 'bg-gray-300 text-gray-700'}`}>
                              Paused
                            </span>
                          )}
                          {schedule.auto_deposit && schedule.is_active && (
                            <span className={`text-xs px-2 py-0.5 rounded ${darkMode ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-700'}`}>
                              Auto-Deposit
                            </span>
                          )}
                        </div>
                        <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                          <div>
                            {formatCurrency(schedule.amount)} • {formatFrequency(schedule.frequency)}
                          </div>
                          <div>
                            Next: {formatDate(nextDate)} 
                            {isDueToday && <span className="text-green-600 font-medium ml-2">• Due today!</span>}
                            {isOverdue && <span className="text-red-600 font-medium ml-2">• Overdue!</span>}
                            {!isDueToday && !isOverdue && <span className="ml-2">• {daysUntil} days</span>}
                          </div>
                          <div>Deposits to: {depositAccountName}</div>
                          {schedule.recurring_duration_type !== 'indefinite' && (
                            <div>
                              {schedule.recurring_duration_type === 'until_date' && `Until ${formatDate(schedule.recurring_until_date)}`}
                              {schedule.recurring_duration_type === 'occurrences' && `${schedule.recurring_occurrences_completed || 0}/${schedule.recurring_occurrences_total} times`}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleToggleSchedule(schedule.id, !schedule.is_active)}
                          className={`p-2 ${darkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-200'} rounded`}
                          title={schedule.is_active ? 'Pause schedule' : 'Resume schedule'}
                        >
                          {schedule.is_active ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <button
                          onClick={() => handleDelete(schedule.id, true)}
                          className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-600' : 'text-red-600 hover:bg-red-50'} rounded`}
                          title="Delete schedule"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Manual Income Section */}
      {manualIncome.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Manual Income</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {manualIncome.map(inc => (
              <div
                key={inc.id}
                className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <h3 className="font-bold">{inc.source}</h3>
                    <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {formatDate(inc.date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(inc.amount)}</div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => onNavigateToTransactions && onNavigateToTransactions({ incomeSource: inc.id })}
                        className={`p-2 ${darkMode ? 'text-purple-400 hover:bg-gray-700' : 'text-purple-600 hover:bg-purple-50'} rounded`}
                      >
                        <ListFilter size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(inc.id, false)}
                        className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
