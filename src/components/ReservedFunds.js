import React, { useState } from 'react';
import { Plus, Edit2, X, Calendar, Copy } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, generateId, predictNextDate } from '../utils/helpers';
import { dbOperation } from '../utils/db';

export default function ReservedFunds({ 
  darkMode, 
  reservedFunds,
  creditCards,
  loans,
  totalReserved,
  onUpdate
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
    linkedItems: []
  });

  const handleAdd = async () => {
    if (!formData.name || !formData.amount || !formData.dueDate) {
      alert('Please fill in required fields: Name, Amount, and Due Date');
      return;
    }

    if (formData.isLumpsum && formData.linkedItems.length === 0) {
      alert('Lumpsum must be linked to at least one loan/card');
      return;
    }
    
    const newFund = {
      id: editingItem?.id || generateId(),
      name: formData.name,
      amount: parseFloat(formData.amount) || 0,
      originalAmount: parseFloat(formData.amount) || 0,
      dueDate: formData.dueDate,
      recurring: formData.recurring,
      frequency: formData.frequency,
      linkedTo: formData.isLumpsum ? null : formData.linkedTo,
      isLumpsum: formData.isLumpsum,
      linkedItems: formData.isLumpsum ? formData.linkedItems : [],
      createdAt: editingItem?.createdAt || new Date().toISOString()
    };
    
    await dbOperation('reservedFunds', 'put', newFund);
    await onUpdate();
    resetForm();
  };

  const handleUseTemplate = (fund) => {
    setFormData({
      name: fund.name,
      amount: fund.originalAmount?.toString() || fund.amount.toString(),
      dueDate: predictNextDate(fund.dueDate, fund.frequency || 'monthly'),
      recurring: fund.recurring || false,
      frequency: fund.frequency || 'monthly',
      linkedTo: fund.linkedTo || null,
      isLumpsum: fund.isLumpsum || false,
      linkedItems: fund.linkedItems || []
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
      linkedItems: []
    });
    setShowAddForm(false);
    setEditingItem(null);
  };

  const handleEdit = (fund) => {
    setFormData({
      name: fund.name,
      amount: fund.amount.toString(),
      dueDate: fund.dueDate,
      recurring: fund.recurring || false,
      frequency: fund.frequency || 'monthly',
      linkedTo: fund.linkedTo || null,
      isLumpsum: fund.isLumpsum || false,
      linkedItems: fund.linkedItems || []
    });
    setEditingItem(fund);
    setShowAddForm(true);
  };

  const handleMarkPaid = async (fundId) => {
    const fund = reservedFunds.find(f => f.id === fundId);
    
    const transaction = {
      id: generateId(),
      type: 'reserved_fund_paid',
      fundId,
      fundName: fund.name,
      amount: fund.amount,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };
    await dbOperation('transactions', 'put', transaction);
    
    if (fund.recurring) {
      await dbOperation('reservedFunds', 'put', {
        ...fund,
        amount: fund.originalAmount || fund.amount,
        dueDate: predictNextDate(fund.dueDate, fund.frequency || 'monthly'),
        lastPaidDate: new Date().toISOString().split('T')[0]
      });
    } else {
      await dbOperation('reservedFunds', 'delete', fundId);
    }
    
    await onUpdate();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this reserved fund?')) {
      await dbOperation('reservedFunds', 'delete', id);
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
          reservedFunds.map(fund => (
            <div key={fund.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">{fund.name}</h3>
                    {fund.isLumpsum && (
                      <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-800'}`}>
                        Lumpsum
                      </span>
                    )}
                  </div>
                  <div className="text-xl font-bold text-purple-600 mt-1">{formatCurrency(fund.amount)}</div>
                  {fund.isLumpsum && fund.originalAmount && fund.amount < fund.originalAmount && (
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                      Original: {formatCurrency(fund.originalAmount)}
                    </div>
                  )}
                  {fund.recurring && (
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1 capitalize`}>
                      Recurring: {fund.frequency}
                    </div>
                  )}
                  {fund.isLumpsum && fund.linkedItems?.length > 0 && (
                    <div className={`text-xs ${darkMode ? 'text-blue-400' : 'text-blue-600'} mt-1`}>
                      Linked to: {getLinkedItemsNames(fund.linkedItems)}
                    </div>
                  )}
                  {!fund.isLumpsum && fund.linkedTo && (
                    <div className={`text-xs ${darkMode ? 'text-blue-400' : 'text-blue-600'} mt-1`}>
                      {getLinkedName(fund.linkedTo)}
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
                    onClick={() => handleDelete(fund.id)}
                    className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className={`flex justify-between items-center text-sm mb-3 pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Due Date:</span>
                <div className="text-right">
                  <div className="font-medium">{formatDate(fund.dueDate)}</div>
                  {getDaysUntil(fund.dueDate) >= 0 && (
                    <div className={`text-xs ${getDaysUntil(fund.dueDate) <= 7 ? 'text-red-600 font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {getDaysUntil(fund.dueDate) === 0 ? 'Due Today!' : `${getDaysUntil(fund.dueDate)} days`}
                    </div>
                  )}
                </div>
              </div>

              {!fund.linkedTo && !fund.isLumpsum && (
                <button
                  onClick={() => handleMarkPaid(fund.id)}
                  className="w-full bg-green-600 text-white py-2 rounded-lg font-medium"
                >
                  Mark as Paid
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
