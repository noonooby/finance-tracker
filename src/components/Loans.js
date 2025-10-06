import React, { useState } from 'react';
import { Plus, Edit2, X, TrendingUp } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, generateId, predictNextDate } from '../utils/helpers';
import { dbOperation } from '../utils/db';

export default function Loans({ 
  darkMode, 
  loans, 
  categories,
  availableCash,
  reservedFunds,
  alertSettings,
  onUpdate,
  onUpdateCash
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    principal: '',
    balance: '',
    interestRate: '',
    paymentAmount: '',
    frequency: 'monthly',
    nextPaymentDate: '',
    alertDays: alertSettings.defaultDays || 7
  });
  const [paymentForm, setPaymentForm] = useState({ 
    amount: '', 
    date: new Date().toISOString().split('T')[0],
    category: 'other'
  });
  const [payingLoan, setPayingLoan] = useState(null);

  const handleAdd = async () => {
    if (!formData.name || !formData.principal || !formData.balance || !formData.paymentAmount || !formData.nextPaymentDate) {
      alert('Please fill in all required fields');
      return;
    }
    
    const newLoan = {
      id: editingItem?.id || generateId(),
      name: formData.name,
      principal: parseFloat(formData.principal) || 0,
      balance: parseFloat(formData.balance) || 0,
      interestRate: parseFloat(formData.interestRate) || 0,
      paymentAmount: parseFloat(formData.paymentAmount) || 0,
      frequency: formData.frequency,
      nextPaymentDate: formData.nextPaymentDate,
      alertDays: parseInt(formData.alertDays) || alertSettings.defaultDays,
      createdAt: editingItem?.createdAt || new Date().toISOString()
    };
    
    await dbOperation('loans', 'put', newLoan);
    await onUpdate();
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      principal: '',
      balance: '',
      interestRate: '',
      paymentAmount: '',
      frequency: 'monthly',
      nextPaymentDate: '',
      alertDays: alertSettings.defaultDays || 7
    });
    setShowAddForm(false);
    setEditingItem(null);
  };

  const handleEdit = (loan) => {
    setFormData({
      name: loan.name,
      principal: loan.principal.toString(),
      balance: loan.balance.toString(),
      interestRate: loan.interestRate?.toString() || '',
      paymentAmount: loan.paymentAmount.toString(),
      frequency: loan.frequency,
      nextPaymentDate: loan.nextPaymentDate,
      alertDays: loan.alertDays || alertSettings.defaultDays
    });
    setEditingItem(loan);
    setShowAddForm(true);
  };

  const handlePayment = async (loanId) => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }
    
    const loan = loans.find(l => l.id === loanId);
    const paymentAmount = parseFloat(paymentForm.amount);
    
    // Update loan balance and next payment date
    await dbOperation('loans', 'put', {
      ...loan,
      balance: loan.balance - paymentAmount,
      lastPaymentDate: paymentForm.date,
      nextPaymentDate: predictNextDate(paymentForm.date, loan.frequency)
    });
    
    // Log transaction
    const transaction = {
      id: generateId(),
      type: 'loan_payment',
      loanId,
      loanName: loan.name,
      amount: paymentAmount,
      date: paymentForm.date,
      category: paymentForm.category,
      createdAt: new Date().toISOString()
    };
    await dbOperation('transactions', 'put', transaction);
    
    // Check for single linked reserved fund
    const linkedFund = reservedFunds.find(f => f.linkedTo?.type === 'loan' && f.linkedTo?.id === loanId);
    if (linkedFund) {
      const fundTransaction = {
        id: generateId(),
        type: 'reserved_fund_paid',
        fundId: linkedFund.id,
        fundName: linkedFund.name,
        amount: linkedFund.amount,
        date: paymentForm.date,
        createdAt: new Date().toISOString()
      };
      await dbOperation('transactions', 'put', fundTransaction);
      
      if (linkedFund.recurring) {
        await dbOperation('reservedFunds', 'put', {
          ...linkedFund,
          dueDate: predictNextDate(linkedFund.dueDate, linkedFund.frequency || 'monthly'),
          lastPaidDate: paymentForm.date
        });
      } else {
        await dbOperation('reservedFunds', 'delete', linkedFund.id);
      }
    }
    
    // Check for lumpsum funds that include this loan
    const lumpsumFund = reservedFunds.find(f => 
      f.isLumpsum && 
      f.linkedItems?.some(item => item.type === 'loan' && item.id === loanId)
    );
    
    if (lumpsumFund && lumpsumFund.amount >= paymentAmount) {
      await dbOperation('reservedFunds', 'put', {
        ...lumpsumFund,
        amount: lumpsumFund.amount - paymentAmount
      });
    }
    
    // Update available cash
    await onUpdateCash(availableCash - paymentAmount);
    await onUpdate();
    
    setPayingLoan(null);
    setPaymentForm({ amount: '', date: new Date().toISOString().split('T')[0], category: 'other' });
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this loan?')) {
      await dbOperation('loans', 'delete', id);
      await onUpdate();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Loans</h2>
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
          {showAddForm ? 'Cancel' : 'Add Loan'}
        </button>
      </div>

      {showAddForm && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          <input
            type="text"
            placeholder="Loan Name (e.g., Car Loan) *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Original Principal *"
            value={formData.principal}
            onChange={(e) => setFormData({ ...formData, principal: e.target.value })}
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
            placeholder="Interest Rate % (optional)"
            value={formData.interestRate}
            onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Payment Amount *"
            value={formData.paymentAmount}
            onChange={(e) => setFormData({ ...formData, paymentAmount: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Payment Frequency *</label>
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
          </div>
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Next Payment Date *</label>
            <input
              type="date"
              value={formData.nextPaymentDate}
              onChange={(e) => setFormData({ ...formData, nextPaymentDate: e.target.value })}
              className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
            />
          </div>
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
              {editingItem ? 'Update Loan' : 'Add Loan'}
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
        {loans.length === 0 ? (
          <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
            <p>No loans added yet</p>
          </div>
        ) : (
          loans.map(loan => (
            <div key={loan.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg">{loan.name}</h3>
                  <div className="text-2xl font-bold text-orange-600 mt-1">{formatCurrency(loan.balance)}</div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                    of {formatCurrency(loan.principal)} ({((loan.balance / loan.principal) * 100).toFixed(1)}% remaining)
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(loan)}
                    className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded`}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(loan.id)}
                    className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className={`grid grid-cols-2 gap-3 text-sm mb-3 pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div>
                  <div className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Payment Amount</div>
                  <div className="font-semibold">{formatCurrency(loan.paymentAmount)}</div>
                </div>
                <div>
                  <div className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Frequency</div>
                  <div className="font-semibold capitalize">{loan.frequency}</div>
                </div>
              </div>

              {loan.nextPaymentDate && (
                <div className={`flex justify-between items-center mb-3 text-sm pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Next Payment:</span>
                  <div className="text-right">
                    <div className="font-medium">{formatDate(loan.nextPaymentDate)}</div>
                    {getDaysUntil(loan.nextPaymentDate) >= 0 && (
                      <div className={`text-xs ${getDaysUntil(loan.nextPaymentDate) <= (loan.alertDays || 7) ? 'text-red-600 font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {getDaysUntil(loan.nextPaymentDate) === 0 ? 'Due Today!' : `${getDaysUntil(loan.nextPaymentDate)} days`}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {payingLoan === loan.id ? (
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
                    <button onClick={() => handlePayment(loan.id)} className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium">
                      Confirm Payment
                    </button>
                    <button
                      onClick={() => setPayingLoan(null)}
                      className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} py-2 rounded-lg font-medium`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setPayingLoan(loan.id)}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium"
                >
                  Make Payment
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
