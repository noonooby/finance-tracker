import React, { useState } from 'react';
import { Plus, DollarSign, Edit2, X } from 'lucide-react';
import { formatCurrency, formatDate, generateId, predictNextDate, getDaysUntil } from '../utils/helpers';
import { dbOperation } from '../utils/db';

export default function Income({ 
  darkMode, 
  income,
  availableCash,
  onUpdate,
  onUpdateCash
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    source: 'Salary',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    frequency: 'biweekly',
    reservedAmount: ''
  });

  const handleAdd = async () => {
    if (!formData.source || !formData.amount || !formData.date) {
      alert('Please fill in required fields: Source, Amount, and Date');
      return;
    }
    
    const isEditing = !!editingItem;
    const oldAmount = editingItem?.amount || 0;
    const newAmount = parseFloat(formData.amount) || 0;
    
    const incomeEntry = {
      id: editingItem?.id || generateId(),
      source: formData.source,
      amount: newAmount,
      date: formData.date,
      frequency: formData.frequency,
    };
    
    await dbOperation('income', 'put', incomeEntry);
    
    if (!isEditing) {
      // ✅ FIXED TRANSACTION OBJECT
      const transaction = {
        type: 'income',
        amount: newAmount,
        date: formData.date,
        income_source: formData.source,     // ✅ CORRECT FIELD NAME
        payment_method: 'cash',             // ✅ REQUIRED FIELD
      };
      try {
        await dbOperation('transactions', 'put', transaction);
        console.log('✅ Transaction saved successfully');
      } catch (error) {
        console.error('❌ Failed to save transaction:', error);
        throw error;
      }
      
      let newCash = availableCash + newAmount;
      if (formData.reservedAmount && parseFloat(formData.reservedAmount) > 0) {
        newCash -= parseFloat(formData.reservedAmount);
      }
      await onUpdateCash(newCash);
    }
  };

  const handleEdit = (inc) => {
    setFormData({
      source: inc.source,
      amount: inc.amount.toString(),
      date: inc.date,
      frequency: inc.frequency,
      reservedAmount: ''
    });
    setEditingItem(inc);
    setShowAddForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this income entry?')) {
      const inc = income.find(i => i.id === id);
      await onUpdateCash(availableCash - inc.amount);
      await dbOperation('income', 'delete', id);
      await onUpdate();
    }
  };

  const resetForm = () => {
    setFormData({
      source: 'Salary',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      frequency: 'biweekly',
      reservedAmount: ''
    });
    setShowAddForm(false);
    setEditingItem(null);
  };

  const getPredictedIncome = () => {
    if (income.length === 0) return [];
    
    const sortedIncome = [...income].sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastIncome = sortedIncome[0];
    
    if (!lastIncome.frequency || lastIncome.frequency === 'onetime') return [];
    
    const predictions = [];
    let currentDate = lastIncome.date;
    
    for (let i = 0; i < 5; i++) {
      currentDate = predictNextDate(currentDate, lastIncome.frequency);
      predictions.push({
        date: currentDate,
        amount: lastIncome.amount,
        source: lastIncome.source,
        days: getDaysUntil(currentDate)
      });
    }
    
    return predictions;
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
          <input
            type="text"
            placeholder="Source (e.g., Salary, Bonus) *"
            value={formData.source}
            onChange={(e) => setFormData({ ...formData, source: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
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
          <h3 className={`font-semibold mb-3 ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>Predicted Income (Next 5)</h3>
          <div className="space-y-2">
            {predictedIncome.map((pred, idx) => (
              <div key={idx} className={`flex justify-between items-center text-sm ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}>
                <div>
                  <div className="font-medium">{pred.source}</div>
                  <div className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>{formatDate(pred.date)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(pred.amount)}</div>
                  <div className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>{pred.days} days</div>
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
          [...income].sort((a, b) => new Date(b.date) - new Date(a.date)).map(inc => (
            <div key={inc.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold">{inc.source}</h3>
                  <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} capitalize`}>{inc.frequency}</div>
                  <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>{formatDate(inc.date)}</div>
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
          ))
        )}
      </div>
    </div>
  );
}
