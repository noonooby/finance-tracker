import React, { useEffect, useRef, useState } from 'react';
import { Plus, Edit2, X, Calendar, Copy } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, predictNextDate, generateId } from '../utils/helpers';
import { dbOperation } from '../utils/db';
import { logActivity } from '../utils/activityLogger';

export default function ReservedFunds({ 
  darkMode, 
  reservedFunds,
  creditCards,
  loans,
  totalReserved,
  onUpdate,
  focusTarget,
  onClearFocus
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    dueDate: '',
    recurring: false,
    frequency: 'monthly',
    linkedTo: null,
    isLumpsum: false,
    linkedItems: [],
    recurringDurationType: 'indefinite',
    recurringUntilDate: '',
    recurringOccurrences: ''
  });

  const resolveFundId = (fund) => {
    if (!fund) return null;
    const rawId = typeof fund === 'object' ? fund.id ?? fund.fund_id ?? fund.uuid ?? null : fund;
    if (!rawId) return null;
    if (typeof rawId === 'string' || typeof rawId === 'number') return String(rawId);
    if (typeof rawId === 'object') {
      if (typeof rawId.id === 'string' || typeof rawId.id === 'number') return String(rawId.id);
      if (typeof rawId.value === 'string' || typeof rawId.value === 'number') return String(rawId.value);
    }
    return null;
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

  const fundRefs = useRef({});

  useEffect(() => {
    if (focusTarget?.type === 'fund' && focusTarget.id) {
      const key = String(normalizeId(focusTarget.id));
      const node = fundRefs.current[key];
      if (node?.scrollIntoView) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const timer = setTimeout(() => onClearFocus?.(), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [focusTarget, onClearFocus]);

  const handleAdd = async () => {
    if (!formData.name || !formData.amount || !formData.dueDate) {
      alert('Please fill in required fields: Name, Amount, and Due Date');
      return;
    }

    if (formData.recurring) {
      if (formData.recurringDurationType === 'until_date' && !formData.recurringUntilDate) {
        alert('Please specify the end date for this recurring fund');
        return;
      }
      if (
        formData.recurringDurationType === 'occurrences' &&
        (!formData.recurringOccurrences || parseInt(formData.recurringOccurrences, 10) < 1)
      ) {
        alert('Please specify the number of times this fund will recur');
        return;
      }
    }

    if (formData.isLumpsum && formData.linkedItems.length === 0) {
      alert('Lumpsum must be linked to at least one loan/card');
      return;
    }
    
    const fundPayload = {
      name: formData.name,
      amount: parseFloat(formData.amount) || 0,
      original_amount: editingItem?.original_amount || (parseFloat(formData.amount) || 0),
      due_date: formData.dueDate,
      recurring: formData.recurring,
      frequency: formData.frequency,
      linked_to: formData.isLumpsum ? null : formData.linkedTo,
      is_lumpsum: formData.isLumpsum,
      linked_items: formData.isLumpsum ? formData.linkedItems : [],
      recurring_duration_type: formData.recurring ? formData.recurringDurationType : null,
      recurring_until_date: formData.recurring && formData.recurringDurationType === 'until_date' ? formData.recurringUntilDate : null,
      recurring_occurrences_total:
        formData.recurring && formData.recurringDurationType === 'occurrences'
          ? parseInt(formData.recurringOccurrences, 10) || null
          : null,
      recurring_occurrences_completed: editingItem?.recurring_occurrences_completed || 0,
      created_at: editingItem?.created_at || new Date().toISOString()
    };
    const existingId = resolveFundId(editingItem);
    fundPayload.id = existingId || generateId();
    
    const savedFund = await dbOperation('reservedFunds', 'put', fundPayload, { skipActivityLog: true });
    if (!editingItem) {
      await logActivity('add', 'fund', savedFund.id, savedFund.name, `Added fund: ${savedFund.name} ($${savedFund.amount})`, null);
    } else {
      await logActivity('edit', 'fund', savedFund.id, savedFund.name, `Updated fund: ${savedFund.name}`, null);
    }
    await onUpdate();
    resetForm();
  };

  const handleUseTemplate = (fund) => {
    setFormData({
      name: fund.name,
      amount: fund.original_amount?.toString() || fund.amount.toString(),
      dueDate: predictNextDate(fund.due_date, fund.frequency || 'monthly'),
      recurring: fund.recurring || false,
      frequency: fund.frequency || 'monthly',
      linkedTo: fund.linked_to || null,
      isLumpsum: fund.is_lumpsum || false,
      linkedItems: fund.linked_items || [],
      recurringDurationType: fund.recurring_duration_type || 'indefinite',
      recurringUntilDate: fund.recurring_until_date || '',
      recurringOccurrences: fund.recurring_occurrences_total?.toString() || ''
    });
    setShowAddForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      amount: '',
      dueDate: '',
      recurring: false,
      frequency: 'monthly',
      linkedTo: null,
      isLumpsum: false,
      linkedItems: [],
      recurringDurationType: 'indefinite',
      recurringUntilDate: '',
      recurringOccurrences: ''
    });
    setShowAddForm(false);
    setEditingItem(null);
  };

  const handleEdit = (fund) => {
    setFormData({
      name: fund.name,
      amount: fund.amount.toString(),
      dueDate: fund.due_date,
      recurring: fund.recurring || false,
      frequency: fund.frequency || 'monthly',
      linkedTo: fund.linked_to || null,
      isLumpsum: fund.is_lumpsum || false,
      linkedItems: fund.linked_items || [],
      recurringDurationType: fund.recurring_duration_type || 'indefinite',
      recurringUntilDate: fund.recurring_until_date || '',
      recurringOccurrences: fund.recurring_occurrences_total?.toString() || ''
    });
    setEditingItem({ ...fund, id: resolveFundId(fund) || fund.id });
    setShowAddForm(true);
  };

  const handleMarkPaid = async (fundId) => {
    const fund = reservedFunds.find(f => resolveFundId(f) === fundId);
    if (!fund) return;
    const normalizedFund = { ...fund, id: fundId };
    
    const transaction = {
      type: 'reserved_fund_paid',
      amount: fund.amount,
      date: new Date().toISOString().split('T')[0],
      description: `Reserved fund paid: ${fund.name}`,
      notes: `Auto-generated from reserved fund ${fund.name}`,
      payment_method: 'reserved_fund',
      payment_method_id: resolveFundId(fund),
      status: 'active',
      undone_at: null
    };
    await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });
    
    if (fund.recurring) {
      const todayIso = new Date().toISOString().split('T')[0];
      const updatedFund = {
        ...normalizedFund,
        amount: normalizedFund.original_amount || normalizedFund.amount,
        last_paid_date: todayIso
      };

      let shouldContinue = true;
      const nextDueDate = predictNextDate(normalizedFund.due_date, normalizedFund.frequency || 'monthly');

      if (normalizedFund.recurring_duration_type === 'occurrences') {
        const completed = (normalizedFund.recurring_occurrences_completed || 0) + 1;
        updatedFund.recurring_occurrences_completed = completed;
        const total = normalizedFund.recurring_occurrences_total || 0;
        if (total && completed >= total) {
          shouldContinue = false;
        }
      }

      if (normalizedFund.recurring_duration_type === 'until_date' && normalizedFund.recurring_until_date) {
        const endDate = new Date(normalizedFund.recurring_until_date);
        const nextDateObj = new Date(nextDueDate);
        if (nextDateObj > endDate) {
          shouldContinue = false;
        }
      }

      if (shouldContinue) {
        updatedFund.due_date = nextDueDate;
      } else {
        updatedFund.recurring = false;
        updatedFund.due_date = normalizedFund.recurring_duration_type === 'until_date' && normalizedFund.recurring_until_date
          ? normalizedFund.recurring_until_date
          : normalizedFund.due_date;
      }

      await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
      Object.assign(fund, updatedFund);
    } else {
      await dbOperation('reservedFunds', 'delete', fundId);
    }
    
    await onUpdate();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this reserved fund?')) {
      const fund = reservedFunds.find(f => resolveFundId(f) === id);
      if (!fund) return;
    
      await logActivity('delete', 'fund', id, fund.name, `Deleted fund: ${fund.name}`, fund);
      await dbOperation('reservedFunds', 'delete', id, { skipActivityLog: true });
      await onUpdate();
    }
  };

  const getLinkedName = (linkedTo) => {
    if (!linkedTo) return null;
    
    if (linkedTo.type === 'credit_card') {
      const card = creditCards.find(c => c.id === linkedTo.id);
      return card ? `Card: ${card.name}` : 'Linked item not found';
    } else if (linkedTo.type === 'loan') {
      const loan = loans.find(l => l.id === linkedTo.id);
      return loan ? `Loan: ${loan.name}` : 'Linked item not found';
    }
    return null;
  };

  const getLinkedItemsNames = (linkedItems) => {
    return linkedItems.map(item => {
      if (item.type === 'credit_card') {
        const card = creditCards.find(c => c.id === item.id);
        return card ? card.name : 'Unknown';
      } else if (item.type === 'loan') {
        const loan = loans.find(l => l.id === item.id);
        return loan ? loan.name : 'Unknown';
      }
      return 'Unknown';
    }).join(', ');
  };

  const toggleLinkedItem = (type, id) => {
    const itemKey = `${type}-${id}`;
    const exists = formData.linkedItems.some(item => `${item.type}-${item.id}` === itemKey);
    
    if (exists) {
      setFormData({
        ...formData,
        linkedItems: formData.linkedItems.filter(item => `${item.type}-${item.id}` !== itemKey)
      });
    } else {
      setFormData({
        ...formData,
        linkedItems: [...formData.linkedItems, { type, id }]
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Reserved Funds</h2>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Reserved: {formatCurrency(totalReserved)}</p>
        </div>
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
          {showAddForm ? 'Cancel' : 'Add Fund'}
        </button>
      </div>

      {showAddForm && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          <input
            type="text"
            placeholder="Fund Name (e.g., Rent, Insurance) *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Amount *"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Due Date *</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.recurring}
              onChange={(e) => setFormData({ ...formData, recurring: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm">Recurring payment</span>
          </label>
          {formData.recurring && (
            <>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
                <option value="bimonthly">Bi-monthly</option>
              </select>

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
          
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isLumpsum}
              onChange={(e) => setFormData({ ...formData, isLumpsum: e.target.checked, linkedTo: null })}
              className="w-4 h-4"
            />
            <span className="text-sm">Lumpsum (link to multiple items)</span>
          </label>

          {formData.isLumpsum ? (
            <div>
              <label className={`block text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Select items to link:</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {creditCards.map(card => (
                  <label key={card.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.linkedItems.some(item => item.type === 'credit_card' && item.id === card.id)}
                      onChange={() => toggleLinkedItem('credit_card', card.id)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Card: {card.name}</span>
                  </label>
                ))}
                {loans.map(loan => (
                  <label key={loan.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.linkedItems.some(item => item.type === 'loan' && item.id === loan.id)}
                      onChange={() => toggleLinkedItem('loan', loan.id)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Loan: {loan.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Link to (optional)</label>
              <select
                value={formData.linkedTo ? `${formData.linkedTo.type}-${formData.linkedTo.id}` : ''}
                onChange={(e) => {
                  if (!e.target.value) {
                    setFormData({ ...formData, linkedTo: null });
                  } else {
                    const [type, id] = e.target.value.split('-');
                    setFormData({ ...formData, linkedTo: { type, id } });
                  }
                }}
                className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
              >
                <option value="">None</option>
                <optgroup label="Credit Cards">
                  {creditCards.map(card => (
                    <option key={card.id} value={`credit_card-${card.id}`}>{card.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Loans">
                  {loans.map(loan => (
                    <option key={loan.id} value={`loan-${loan.id}`}>{loan.name}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium">
              {editingItem ? 'Update Fund' : 'Add Fund'}
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

      <div className="space-y-3">
        {reservedFunds.length === 0 ? (
          <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <Calendar size={48} className="mx-auto mb-3 opacity-30" />
            <p>No reserved funds yet</p>
          </div>
        ) : (
          reservedFunds.map((fund, index) => {
                const resolvedId = resolveFundId(fund) || `${fund.name || 'fund'}-${fund.due_date || index}-${index}`;
                const fundKey = String(normalizeId(resolvedId));
                const isHighlighted = focusTarget?.type === 'fund' && normalizeId(focusTarget.id) === normalizeId(resolvedId);
                return (
                <div
                  key={fundKey}
                  ref={(el) => {
                    if (el) fundRefs.current[fundKey] = el;
                  }}
                  className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 ${isHighlighted ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                >
                <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">{fund.name}</h3>
                    {fund.is_lumpsum && (
                      <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-800'}`}>
                        Lumpsum
                      </span>
                    )}
                  </div>
                  <div className="text-xl font-bold text-purple-600 mt-1">{formatCurrency(fund.amount)}</div>
                  {fund.is_lumpsum && fund.original_amount && fund.amount < fund.original_amount && (
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                      Original: {formatCurrency(fund.original_amount)}
                    </div>
                  )}
                  {(fund.recurring || fund.recurring_duration_type) && (
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                      <span className="capitalize">Recurring: {fund.frequency}</span>
                      {fund.recurring_duration_type && (
                        <span className="ml-2">
                          {fund.recurring_duration_type === 'until_date' && fund.recurring_until_date && (
                            <>• Until {formatDate(fund.recurring_until_date)}</>
                          )}
                          {fund.recurring_duration_type === 'occurrences' && fund.recurring_occurrences_total && (
                            <>• {fund.recurring_occurrences_completed || 0}/{fund.recurring_occurrences_total} times</>
                          )}
                          {fund.recurring_duration_type === 'indefinite' && <>• Indefinite</>}
                        </span>
                      )}
                    </div>
                  )}
                  {fund.is_lumpsum && fund.linked_items?.length > 0 && (
                    <div className={`text-xs ${darkMode ? 'text-blue-400' : 'text-blue-600'} mt-1`}>
                      Linked to: {getLinkedItemsNames(fund.linked_items)}
                    </div>
                  )}
                  {!fund.is_lumpsum && fund.linked_to && (
                    <div className={`text-xs ${darkMode ? 'text-blue-400' : 'text-blue-600'} mt-1`}>
                      {getLinkedName(fund.linked_to)}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUseTemplate(fund)}
                    className={`p-2 ${darkMode ? 'text-green-400 hover:bg-gray-700' : 'text-green-600 hover:bg-green-50'} rounded`}
                    title="Use as template"
                  >
                    <Copy size={18} />
                  </button>
                  <button
                    onClick={() => handleEdit(fund)}
                    className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded`}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(resolvedId)}
                    className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className={`flex justify-between items-center text-sm mb-3 pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Due Date:</span>
                <div className="text-right">
                  <div className="font-medium">{formatDate(fund.due_date)}</div>
                  {getDaysUntil(fund.due_date) >= 0 && (
                    <div className={`text-xs ${getDaysUntil(fund.due_date) <= 7 ? 'text-red-600 font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {getDaysUntil(fund.due_date) === 0 ? 'Due Today!' : `${getDaysUntil(fund.due_date)} days`}
                    </div>
                  )}
                </div>
              </div>

              {!fund.linked_to && !fund.is_lumpsum && (
                <button
                  onClick={() => handleMarkPaid(resolvedId)}
                  className="w-full bg-green-600 text-white py-2 rounded-lg font-medium"
                >
                  Mark as Paid
                </button>
              )}
            </div>
          );
          })
        )}
      </div>
    </div>
  );
}
