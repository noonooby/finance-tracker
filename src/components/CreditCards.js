import React, { useState } from 'react';
import { Plus, Edit2, X, CreditCard, ShoppingBag } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, generateId } from '../utils/helpers';
import { dbOperation } from '../utils/db';
import AddTransaction from './AddTransaction';
import { logActivity } from '../utils/activityLogger';

export default function CreditCards({ 
  darkMode, 
  creditCards, 
  categories,
  availableCash,
  reservedFunds,
  alertSettings,
  onUpdate,
  onUpdateCash
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    balance: '',
    creditLimit: '',
    dueDate: '',
    statementDay: '',
    interestRate: '',
    alertDays: alertSettings.defaultDays || 7
  });
  const [paymentForm, setPaymentForm] = useState({ 
    amount: '', 
    date: new Date().toISOString().split('T')[0], 
    category: 'other' 
  });
  const [payingCard, setPayingCard] = useState(null);

  const handleAddExpense = (card) => {
    setSelectedCard(card);
    setShowAddExpense(true);
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.balance || !formData.dueDate) {
      alert('Please fill in required fields: Name, Balance, and Due Date');
      return;
    }
    
    const newCard = {
      id: editingItem?.id || generateId(),
      name: formData.name,
      balance: parseFloat(formData.balance) || 0,
      credit_limit: parseFloat(formData.creditLimit) || 0,
      due_date: formData.dueDate,
      statement_day: parseInt(formData.statementDay) || 0,
      interest_rate: parseFloat(formData.interestRate) || 0,
      alert_days: parseInt(formData.alertDays) || alertSettings.defaultDays,
      created_at: editingItem?.created_at || new Date().toISOString()
    };
    
    await dbOperation('creditCards', 'put', newCard);
    if (!editingItem) {
      await logActivity('add', 'card', newCard.id, newCard.name, `Added card: ${newCard.name}`, null);
    } else {
      await logActivity('edit', 'card', newCard.id, newCard.name, `Updated card: ${newCard.name}`, null);
    }
    await onUpdate();
    resetForm();
  };

  const resetForm = () => {
    setFormData({ 
      name: '', 
      balance: '', 
      creditLimit: '', 
      dueDate: '', 
      statementDay: '', 
      interestRate: '', 
      alertDays: alertSettings.defaultDays || 7 
    });
    setShowAddForm(false);
    setEditingItem(null);
  };

  const handleEdit = (card) => {
    setFormData({
      name: card.name,
      balance: card.balance.toString(),
      creditLimit: card.credit_limit?.toString() || '',
      dueDate: card.due_date,
      statementDay: card.statement_day?.toString() || '',
      interestRate: card.interest_rate?.toString() || '',
      alertDays: card.alert_days || alertSettings.defaultDays
    });
    setEditingItem(card);
    setShowAddForm(true);
  };

  const handlePayment = async (cardId) => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }
    
    const card = creditCards.find(c => c.id === cardId);
    const paymentAmount = parseFloat(paymentForm.amount);
    
    await dbOperation('creditCards', 'put', {
      ...card,
      balance: card.balance - paymentAmount
    });
    
    const transaction = {
      id: generateId(),
      card_id: cardId,
      card_name: card.name,
      amount: paymentAmount,
      date: paymentForm.date,
      category: paymentForm.category,
      type: 'credit_card_payment',
      created_at: new Date().toISOString()
    };
    await dbOperation('transactions', 'put', transaction);
    
    const linkedFund = reservedFunds.find(f => f.linked_to?.type === 'credit_card' && f.linked_to?.id === cardId);
    if (linkedFund) {
      const fundTransaction = {
        id: generateId(),
        fund_id: linkedFund.id,
        fund_name: linkedFund.name,
        amount: linkedFund.amount,
        date: paymentForm.date,
        type: 'reserved_fund_paid',
        created_at: new Date().toISOString()
      };
      await dbOperation('transactions', 'put', fundTransaction);
      
      if (linkedFund.recurring) {
        const { predictNextDate } = await import('../utils/helpers');
        await dbOperation('reservedFunds', 'put', {
          ...linkedFund,
          due_date: predictNextDate(linkedFund.due_date, linkedFund.frequency || 'monthly'),
          last_paid_date: paymentForm.date
        });
      } else {
        await dbOperation('reservedFunds', 'delete', linkedFund.id);
      }
    }
    
    const lumpsumFund = reservedFunds.find(f => 
      f.is_lumpsum && 
      f.linked_items?.some(item => item.type === 'credit_card' && item.id === cardId)
    );
    
    if (lumpsumFund && lumpsumFund.amount >= paymentAmount) {
      await dbOperation('reservedFunds', 'put', {
        ...lumpsumFund,
        amount: lumpsumFund.amount - paymentAmount
      });
    }
    
    await onUpdateCash(availableCash - paymentAmount);
    await onUpdate();
    
    setPayingCard(null);
    setPaymentForm({ amount: '', date: new Date().toISOString().split('T')[0], category: 'other' });
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this credit card?')) {
      const card = creditCards.find(c => c.id === id);
      await logActivity('delete', 'card', id, card.name, `Deleted card: ${card.name}`, card);
      await dbOperation('creditCards', 'delete', id);
      await onUpdate();
    }
  };

  return (
    <div className="space-y-4">
      {showAddExpense && (
        <AddTransaction
          darkMode={darkMode}
          onClose={() => {
            setShowAddExpense(false);
            setSelectedCard(null);
          }}
          onUpdate={onUpdate}
          categories={categories}
          creditCards={creditCards}
          loans={[]}
          reservedFunds={reservedFunds}
          availableCash={availableCash}
          onUpdateCash={onUpdateCash}
          preselectedCard={selectedCard}
          preselectedType="expense"
        />
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Credit Cards</h2>
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
          {showAddForm ? 'Cancel' : 'Add Card'}
        </button>
      </div>

      {showAddForm && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          <input
            type="text"
            placeholder="Card Name (e.g., Rogers Mastercard) *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Current Balance *"
            value={formData.balance}
            onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Credit Limit (optional)"
            value={formData.creditLimit}
            onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Payment Due Date *</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
            />
          </div>
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Statement Day (optional, e.g., 15 for 15th of month)</label>
            <input
              type="number"
              placeholder="e.g., 15"
              value={formData.statementDay}
              onChange={(e) => setFormData({ ...formData, statementDay: e.target.value })}
              className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
            />
          </div>
          <input
            type="number"
            step="0.01"
            placeholder="Interest Rate % (optional)"
            value={formData.interestRate}
            onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Alert Me (days before due)</label>
            <input
              type="number"
              value={formData.alertDays}
              onChange={(e) => setFormData({ ...formData, alertDays: e.target.value })}
              className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium">
              {editingItem ? 'Update Card' : 'Add Card'}
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
        {creditCards.length === 0 ? (
          <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <CreditCard size={48} className="mx-auto mb-3 opacity-30" />
            <p>No credit cards added yet</p>
          </div>
        ) : (
          creditCards.map(card => (
            <div key={card.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg">{card.name}</h3>
                  <div className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(card.balance)}</div>
                  {card.credit_limit > 0 && (
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                      Limit: {formatCurrency(card.credit_limit)} ({((card.balance / card.credit_limit) * 100).toFixed(1)}% used)
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(card)}
                    className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded`}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(card.id)}
                    className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {card.due_date && (
                <div className={`flex justify-between items-center mb-3 text-sm pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Due Date:</span>
                  <div className="text-right">
                    <div className="font-medium">{formatDate(card.due_date)}</div>
                    {getDaysUntil(card.due_date) >= 0 && (
                      <div className={`text-xs ${getDaysUntil(card.due_date) <= (card.alert_days || 7) ? 'text-red-600 font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {getDaysUntil(card.due_date) === 0 ? 'Due Today!' : `${getDaysUntil(card.due_date)} days`}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {payingCard === card.id ? (
                <div className="space-y-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Payment Amount"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                  />
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                    className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                  />
                  <select
                    value={paymentForm.category}
                    onChange={(e) => setPaymentForm({ ...paymentForm, category: e.target.value })}
                    className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => handlePayment(card.id)} className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium">
                      Confirm Payment
                    </button>
                    <button
                      onClick={() => setPayingCard(null)}
                      className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} py-2 rounded-lg font-medium`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAddExpense(card)}
                    className="flex items-center justify-center gap-2 bg-orange-600 text-white py-2 rounded-lg font-medium"
                  >
                    <ShoppingBag size={18} />
                    Add Expense
                  </button>
                  <button
                    onClick={() => setPayingCard(card.id)}
                    className="bg-blue-600 text-white py-2 rounded-lg font-medium"
                  >
                    Make Payment
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
