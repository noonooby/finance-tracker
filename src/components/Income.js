import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, X, ListFilter, Zap, Calendar, Pause, Play, Trash2, Camera, Pencil } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, predictNextDate } from '../utils/helpers';
import { api } from '../utils/server';
import ScheduleEdit from './income/ScheduleEdit';
import { formatFrequency } from '../utils/sentenceCase';
import { processDueIncomeSchedules, getIncomeSchedules, toggleIncomeSchedule, deleteIncomeSchedule } from '../utils/schedules';
import useAsyncAction from '../hooks/useAsyncAction';
import ActionButton from './shared/ActionButton';
import { showToast } from '../utils/toast';
import {
  useIncomeOperations,
  useIncomeContexts,
  useIncomeValidation,
  useIncomePredictions
} from '../hooks/transactions';
import { localDate } from '../utils/helpers';

export default function Income({
  darkMode,
  income,
  availableCash,
  onUpdate,
  onUpdateCash,
  focusTarget,
  onClearFocus,
  bankAccounts,
  onNavigateToTransactions
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const sourceInputRef = useRef(null);
  const incomeRefs = useRef({});
  const predictionCount = 8;
  const [checkingDueIncome, setCheckingDueIncome] = useState(false);
  
  // New: Income schedules state
  const [schedules, setSchedules] = useState([]);
  const [showSchedules, setShowSchedules] = useState(true);
  
  // Use extracted hooks
  const { addIncome, deleteIncome } = useIncomeOperations();
  const { recentSources, handleSelectSource, handleSourceBlur } = useIncomeContexts(editingItem);
  const { getDefaultFormData, validateIncomeForm } = useIncomeValidation();
  useIncomePredictions(income, predictionCount);
  
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

  // A pay slip or payroll screenshot fills the form: who pays, how much, when, and which accounts it lands in.
  // Nothing is saved until you press the button below.
  const [readingPay, setReadingPay] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [payNote, setPayNote] = useState('');
  const readPaySlip = async (e, given) => {
    const file = given ? null : e.target.files && e.target.files[0];
    if (!given) e.target.value = '';
    if (!file && !given) return;
    setReadingPay(true); setPayNote('');
    try {
      const image = given ? given.url : await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('That file could not be opened.')); r.readAsDataURL(file); });
      const today = localDate();
      const p = await api('/api/read-pay', { image, mime: given ? given.type : file.type, today });
      // A slip from a past pay day: the schedule starts at the next one.
      let date = p.date || '';
      for (let i = 0; date && date < today && p.frequency && i < 200; i++) date = predictNextDate(date, p.frequency);
      const main = p.parts[0] && p.parts[0].account;
      const others = p.parts.slice(1);
      const matched = others.filter((x) => x.account && x.amount > 0).slice(0, 2);
      setFormData((prev) => ({ ...prev,
        source: p.source || prev.source, amount: p.amount != null ? String(p.amount) : prev.amount,
        date: date && date >= today ? date : prev.date, frequency: p.frequency || prev.frequency,
        depositTarget: 'bank', depositAccountId: main ? main.id : prev.depositAccountId,
        splits: matched.map((x) => ({ account_id: x.account.id, amount: String(x.amount) })) }));
      const unmatched = [...(p.parts[0] && !main ? [p.parts[0]] : []), ...others.filter((x) => !matched.includes(x))];
      const notes = ['Check each field before saving.'];
      if (p.date && !(date >= today)) notes.push(`The slip is dated ${formatDate(p.date)}: set the next pay day.`);
      if (!p.frequency) notes.push('Choose how often the pay comes.');
      if (unmatched.length) notes.push(`Not matched to an account here: ${unmatched.map((x) => `${x.hint || 'an account'}${x.amount ? ` (${formatCurrency(x.amount)})` : ''}`).join('; ')}.`);
      setPayNote(notes.join(' '));
    } catch (err) {
      showToast.error(err.message);
    } finally { setReadingPay(false); }
  };
  // A pay slip sent over from Scan is read here as soon as the screen opens.
  const handed = useLocation().state;
  useEffect(() => {
    if (handed && handed.paySlip) { window.history.replaceState({}, ''); readPaySlip(null, handed.paySlip); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    if ((formData.splits || []).some((sp) => !sp.account_id || !(Number(sp.amount) > 0))) {
      showToast.error('Finish each extra account (an amount and an account), or remove it.');
      return;
    }
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
        onUpdate
      });
    });
    
    if (result?.success) {
      const action = result.data.isNew ? 'created' : 'updated';
      const itemType = formData.frequency !== 'onetime' ? 'schedule' : 'income';
      showToast.success(`Income ${itemType} from '${result.data.source}' ${action}`);
      resetForm();
      await loadSchedules();
    } else if (result?.error) {
      showToast.error(`Failed to save income: ${result.error.message}`);
    }
  };

  const handleDelete = async (id, isSchedule = false) => {
    if (!window.confirm(`Delete this ${isSchedule ? 'income schedule' : 'income entry'}?`)) {
      return;
    }
    
    if (isSchedule) {
      try {
        await deleteIncomeSchedule(id);
        showToast.success('Income schedule deleted');
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
          onUpdate
        });
      });
      
      if (result?.success) {
        showToast.success(`Income from '${result.data.source}' deleted`);
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
                ? 'bg-surface-2 text-muted border border-line cursor-not-allowed'
                : 'press bg-surface-2 text-fg border border-line hover:bg-line/60'
            } relative`}
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
                // Start from the accounts as they are now (they may have loaded after this screen opened).
                setFormData(getDefaultFormData(bankAccounts));
                setShowAddForm(true);
              }
            }}
            className="flex items-center gap-1 sm:gap-2 bg-accent text-accent-contrast px-3 sm:px-4 py-2 text-sm sm:text-base rounded-lg"
          >
            <Plus size={20} />
            {showAddForm ? 'Cancel' : 'Add Income'}
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className={`bg-surface border-line rounded-2xl border p-4 space-y-3`}>
          <h3 className="font-semibold text-lg">{editingItem ? 'Edit Income' : 'Add Income'}</h3>

          {!editingItem && (
            <div className="space-y-1">
              <label className="press inline-flex items-center gap-2 text-sm font-medium text-accent cursor-pointer">
                <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={readPaySlip} disabled={readingPay} />
                <Camera size={16} aria-hidden="true" />
                {readingPay ? 'Reading the pay slip' : 'Fill in from a pay slip or Workday screenshot'}
              </label>
              {payNote && <p className="text-xs text-muted">{payNote}</p>}
            </div>
          )}
          
          {recentSources.length > 0 && !editingItem && (
            <div>
              <label className={`block text-sm font-medium mb-2 text-fg`}>
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
                        ? 'bg-accent text-accent-contrast'
                        : 'bg-accent-soft text-accent hover:bg-accent-soft border border-accent/30'
                    }`}
                  >
                    {source.source_name}
                    {source.usage_count > 10 && ' (frequent)'}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div>
            <label className={`block text-sm font-medium mb-2 text-fg`}>
              {recentSources.length > 0 ? 'Or type new source *' : 'Source *'}
            </label>
            <input
              ref={sourceInputRef}
              type="text"
              value={formData.source}
              onChange={(e) => handleSourceChange(e.target.value)}
              onBlur={handleSourceBlurEvent}
              placeholder="e.g., Salary, Bonus, Freelance"
              className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
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
            className={`w-full px-3 py-2 border border-line bg-surface-2 text-fg rounded-xl`}
          />
          
          <div>
            <label className={`block text-sm mb-1 text-muted`}>Date Received *</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className={`w-full px-3 py-2 border border-line bg-surface-2 text-fg rounded-xl`}
            />
          </div>
          
          <div>
            <label className={`block text-sm mb-1 text-muted`}>Frequency</label>
            <select
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
              className={`w-full px-3 py-2 border border-line bg-surface-2 text-fg rounded-xl`}
            >
              <option value="onetime">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          
          <div>
            <label className={`block text-sm font-medium mb-2 text-fg`}>
              Where is this money going? *
            </label>
            {bankAccounts && bankAccounts.length > 0 ? (
              <>
              <select
                value={formData.depositAccountId}
                onChange={(e) => setFormData({ ...formData, depositTarget: 'bank', depositAccountId: e.target.value })}
                className={`w-full px-3 py-2 border border-line bg-surface-2 text-fg rounded-xl`}
              >
                <option value="">Choose an account</option>
                {bankAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} {account.is_primary ? '(Primary)' : ''} - {formatCurrency(account.balance)}
                  </option>
                ))}
              </select>
              {!editingItem && (formData.splits || []).map((sp, i) => {
                const setSplit = (change) => setFormData({ ...formData, splits: formData.splits.map((x, j) => (j === i ? { ...x, ...change } : x)) });
                return (
                  <div key={i} className="flex items-center gap-2 mt-2">
                    <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="Amount" aria-label={`Amount for extra account ${i + 1}`}
                      value={sp.amount} onChange={(e) => setSplit({ amount: e.target.value })}
                      className="w-28 px-3 py-2 border border-line bg-surface-2 text-fg rounded-xl" />
                    <select aria-label={`Extra account ${i + 1}`} value={sp.account_id} onChange={(e) => setSplit({ account_id: e.target.value })}
                      className="flex-1 min-w-0 px-3 py-2 border border-line bg-surface-2 text-fg rounded-xl">
                      <option value="">To which account</option>
                      {bankAccounts.filter((a) => String(a.id) !== String(formData.depositAccountId)
                        && !formData.splits.some((x, j) => j !== i && String(x.account_id) === String(a.id))).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <button type="button" aria-label={`Remove extra account ${i + 1}`} className="text-muted p-1"
                      onClick={() => setFormData({ ...formData, splits: formData.splits.filter((_, j) => j !== i) })}><X size={16} /></button>
                  </div>
                );
              })}
              {!editingItem && (formData.splits || []).length > 0 && <p className="text-xs text-muted mt-1">The rest goes to the account chosen above.</p>}
              {!editingItem && bankAccounts.length > 1 && (formData.splits || []).length < 2 && (
                <button type="button" className="mt-2 text-sm font-medium text-accent"
                  onClick={() => setFormData({ ...formData, splits: [...(formData.splits || []), { account_id: '', amount: '' }] })}>Send part of it to another account</button>
              )}
              </>
            ) : (
              <p className="text-sm text-muted">Add an account under Accounts first (cash is an account too).</p>
            )}
          </div>

          {formData.frequency !== 'onetime' && (
            <>
              <div>
                <label className={`block text-sm mb-1 text-muted`}>
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
                  className={`w-full px-3 py-2 border border-line bg-surface-2 text-fg rounded-xl`}
                >
                  <option value="indefinite">Indefinite (continues forever)</option>
                  <option value="until_date">Until specific date</option>
                  <option value="occurrences">For specific number of times</option>
                </select>
              </div>

              {formData.recurringDurationType === 'until_date' && (
                <div>
                  <label className={`block text-sm mb-1 text-muted`}>
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.recurringUntilDate}
                    onChange={(e) => setFormData({ ...formData, recurringUntilDate: e.target.value })}
                    className={`w-full px-3 py-2 border border-line bg-surface-2 text-fg rounded-xl`}
                    min={localDate()}
                  />
                </div>
              )}

              {formData.recurringDurationType === 'occurrences' && (
                <div>
                  <label className={`block text-sm mb-1 text-muted`}>
                    Number of Times *
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g., 12 for 12 months"
                    value={formData.recurringOccurrences}
                    onChange={(e) => setFormData({ ...formData, recurringOccurrences: e.target.value })}
                    className={`w-full px-3 py-2 border border-line bg-surface-2 text-fg rounded-xl`}
                  />
                </div>
              )}
              
              {/* Auto-Deposit Toggle */}
              <div className={`border border-line rounded-lg p-3`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.autoDeposit}
                    onChange={(e) => setFormData({ ...formData, autoDeposit: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className={`text-sm font-medium text-fg`}>
                      Enable Auto-Deposit
                    </div>
                    <div className={`text-xs text-muted mt-1`}>
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
        <div className={`bg-surface border-line rounded-2xl border p-4`}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Calendar size={20} />
              Recurring Income Schedules ({schedules.filter(s => s.is_active).length} active)
            </h3>
            <button
              onClick={() => setShowSchedules(!showSchedules)}
              className={`text-sm text-accent`}
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
                  : 'No account';
                
                return (
                  <div
                    key={schedule.id}
                    className={`bg-surface-2 border-line border rounded-2xl p-3 ${
                      !schedule.is_active ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold">{schedule.source}</h4>
                          {!schedule.is_active && (
                            <span className={`text-xs px-2 py-0.5 rounded bg-line text-fg`}>
                              Paused
                            </span>
                          )}
                          {schedule.auto_deposit && schedule.is_active && (
                            <span className={`text-xs px-2 py-0.5 rounded bg-positive/10 text-positive`}>
                              Auto-Deposit
                            </span>
                          )}
                        </div>
                        <div className={`text-sm text-muted mt-1`}>
                          <div>
                            {formatCurrency(schedule.amount)} • {formatFrequency(schedule.frequency)}
                          </div>
                          <div>
                            Next: {formatDate(nextDate)} 
                            {isDueToday && <span className="text-green-600 font-medium ml-2">· Due today</span>}
                            {isOverdue && <span className="text-red-600 font-medium ml-2">· Overdue</span>}
                            {!isDueToday && !isOverdue && <span className="ml-2">• {daysUntil} days</span>}
                          </div>
                          <div>Deposits to: {depositAccountName}{(schedule.splits || []).map((sp) => {
                            const acc = bankAccounts.find((a) => String(a.id) === String(sp.account_id));
                            return acc ? ` · ${formatCurrency(sp.amount)} to ${acc.name}` : '';
                          }).join('')}</div>
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
                          onClick={() => setEditingSchedule(editingSchedule === schedule.id ? null : schedule.id)}
                          className="p-2 hover:bg-line/60 rounded"
                          title="Change schedule"
                          aria-label={`Change the pay schedule for ${schedule.source}`}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleToggleSchedule(schedule.id, !schedule.is_active)}
                          className={`p-2 hover:bg-line/60 rounded`}
                          title={schedule.is_active ? 'Pause schedule' : 'Resume schedule'}
                        >
                          {schedule.is_active ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <button
                          onClick={() => handleDelete(schedule.id, true)}
                          className={`p-2 text-negative hover:bg-negative/10 rounded`}
                          title="Delete schedule"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    {editingSchedule === schedule.id && (
                      <ScheduleEdit schedule={schedule} bankAccounts={bankAccounts} onCancel={() => setEditingSchedule(null)}
                        onSaved={async () => { setEditingSchedule(null); await loadSchedules(); if (onUpdate) await onUpdate(); }} />
                    )}
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
                className={`bg-surface border-line rounded-2xl border p-4`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <h3 className="font-bold">{inc.source}</h3>
                    <div className={`text-sm text-muted`}>
                      {formatDate(inc.date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(inc.amount)}</div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => onNavigateToTransactions && onNavigateToTransactions({ incomeSource: inc.id })}
                        className={`p-2 text-accent hover:bg-accent-soft rounded`}
                      >
                        <ListFilter size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(inc.id, false)}
                        className={`p-2 text-negative hover:bg-negative/10 rounded`}
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
