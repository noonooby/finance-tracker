import React, { useEffect, useRef, useState } from 'react';
import { Plus, DollarSign, Edit2, X } from 'lucide-react';
import { formatCurrency, formatDate, predictNextDate, getDaysUntil, generateId } from '../utils/helpers';
import { dbOperation } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import SmartInput from './SmartInput';
import { autoDepositDueIncome } from '../utils/autoPay';
export default function Income({ 
  darkMode, 
  income,
  availableCash,
  onUpdate,
  onUpdateCash,
  focusTarget,
  onClearFocus
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    source: 'Salary',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    frequency: 'biweekly',
    reservedAmount: '',
    recurringDurationType: 'indefinite',
    recurringUntilDate: '',
    recurringOccurrences: ''
  });
  const incomeRefs = useRef({});
  const [predictionCount, setPredictionCount] = useState(8);

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
      alert('Please fill in required fields: Source, Amount, and Date');
      return;
    }

    if (formData.frequency !== 'onetime') {
      if (formData.recurringDurationType === 'until_date' && !formData.recurringUntilDate) {
        alert('Please specify the end date for recurring income');
        return;
      }
      if (
        formData.recurringDurationType === 'occurrences' &&
        (!formData.recurringOccurrences || parseInt(formData.recurringOccurrences, 10) < 1)
      ) {
        alert('Please specify the number of times this income will occur');
        return;
      }
    }
    
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
      recurring_occurrences_completed: editingItem?.recurring_occurrences_completed || 0
    };
    
    const savedIncome = await dbOperation('income', 'put', incomeEntry, { skipActivityLog: true });
    const incomeId = savedIncome?.id || editingItem?.id;
    if (isEditing) {
      await logActivity('edit', 'income', incomeId, savedIncome?.source || incomeEntry.source,
        `Updated income: ${savedIncome?.source || incomeEntry.source} to $${newAmount.toFixed(2)}`, null);
    }

    if (!isEditing) {
      const previousCash = availableCash;

      const transaction = {
        type: 'income',
        amount: newAmount,
        date: formData.date,
        income_source: formData.source,     // ✅ CORRECT FIELD NAME
        payment_method: 'cash',             // ✅ REQUIRED FIELD
        payment_method_id: incomeId,
        status: 'active',
        undone_at: null
      };
      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });
      
      let newCash = availableCash + newAmount;
      if (formData.reservedAmount && parseFloat(formData.reservedAmount) > 0) {
        newCash -= parseFloat(formData.reservedAmount);
      }
      await onUpdateCash(newCash);

      await logActivity(
        'income',
        'income',
        incomeId,
        formData.source,
        `Income: ${formatCurrency(newAmount)} from ${formData.source}`,
        {
          amount: newAmount,
          source: formData.source,
          previousCash,
          newCash,
          transactionId: savedTransaction?.id,
          incomeId
        }
      );
    }

    await onUpdate();
    resetForm();
  };

  const handleEdit = (inc) => {
    setFormData({
      source: inc.source,
      amount: inc.amount.toString(),
      date: inc.date,
      frequency: inc.frequency,
      reservedAmount: '',
      recurringDurationType: inc.recurring_duration_type || 'indefinite',
      recurringUntilDate: inc.recurring_until_date || '',
      recurringOccurrences: inc.recurring_occurrences_total?.toString() || ''
    });
    setEditingItem(inc);
    setShowAddForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this income entry?')) {
      const inc = income.find(i => String(i.id) === String(id));
      if (!inc) return;

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

      await logActivity(
        'delete',
        'income',
        id,
        inc.source,
        `Deleted income: ${inc.source} ($${inc.amount})`,
        {
          ...inc,
          previousCash,
          linkedTransactions: linkedSnapshots
        }
      );

      const newCash = previousCash - inc.amount;
      await onUpdateCash(newCash);
      await dbOperation('income', 'delete', id, { skipActivityLog: true });

      for (const trx of relatedTransactions) {
        try {
          await dbOperation('transactions', 'delete', trx.id, { skipActivityLog: true });
        } catch (error) {
          console.warn('Unable to remove linked transaction during income deletion:', error);
        }
      }

      await onUpdate();
    }
  };

  const resetForm = () => {
    setFormData({
      source: 'Salary',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      frequency: 'biweekly',
      reservedAmount: '',
      recurringDurationType: 'indefinite',
      recurringUntilDate: '',
      recurringOccurrences: ''
    });
    setShowAddForm(false);
    setEditingItem(null);
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
          <SmartInput
            type="income_source"
            value={formData.source}
            onChange={(value) => setFormData({ ...formData, source: value })}
            label="Source *"
            placeholder="e.g., Salary, Bonus, Freelance"
            darkMode={darkMode}
            required={true}
          />
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
            <button onClick={handleAdd} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium">
              {editingItem ? 'Update Income' : 'Log Income'}
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
                    {formatDate(pred.date)} • {pred.frequency}
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
                    <span className="capitalize">{inc.frequency}</span>
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
