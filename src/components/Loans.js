import React, { useEffect, useRef, useState } from 'react';
import { Plus, Edit2, X, TrendingUp } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, predictNextDate, generateId } from '../utils/helpers';
import { dbOperation } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import SmartInput from './SmartInput';

export default function Loans({ 
  darkMode, 
  loans, 
  categories,
  availableCash,
  reservedFunds,
  alertSettings,
  onUpdate,
  onUpdateCash,
  focusTarget,
  onClearFocus
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
  const loanRefs = useRef({});
  const [savingLoan, setSavingLoan] = useState(false);

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
    if (focusTarget?.type === 'loan' && focusTarget.id) {
      const key = String(normalizeId(focusTarget.id));
      const node = loanRefs.current[key];
      if (node?.scrollIntoView) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const timer = setTimeout(() => onClearFocus?.(), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [focusTarget, onClearFocus]);

  const handleAdd = async () => {
    if (savingLoan) return;
    if (!formData.name || !formData.principal || !formData.balance || !formData.paymentAmount || !formData.nextPaymentDate) {
      alert('Please fill in all required fields');
      return;
    }

    setSavingLoan(true);

    const loanId = editingItem?.id || generateId();

    const loanPayload = {
      id: loanId,
      name: formData.name,
      principal: parseFloat(formData.principal) || 0,
      balance: parseFloat(formData.balance) || 0,
      interest_rate: parseFloat(formData.interestRate) || 0,
      payment_amount: parseFloat(formData.paymentAmount) || 0,
      frequency: formData.frequency,
      next_payment_date: formData.nextPaymentDate,
      alert_days: parseInt(formData.alertDays) || alertSettings.defaultDays,
      created_at: editingItem?.created_at || new Date().toISOString()
    };

    try {
      const savedLoan = await dbOperation('loans', 'put', loanPayload, { skipActivityLog: true });
      const effectiveId = savedLoan?.id || loanId;

      if (editingItem) {
        await logActivity('edit', 'loan', effectiveId, savedLoan?.name || loanPayload.name, `Updated loan: ${savedLoan?.name || loanPayload.name}`, null);
      } else {
        await logActivity('add', 'loan', effectiveId, savedLoan?.name || loanPayload.name, `Added loan: ${savedLoan?.name || loanPayload.name}`, null);
      }

      await onUpdate();
      resetForm();
    } catch (error) {
      console.error('Error saving loan:', error);
      alert('Failed to save loan. Please try again.');
    } finally {
      setSavingLoan(false);
    }
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
      interestRate: loan.interest_rate?.toString() || '',
      paymentAmount: loan.payment_amount.toString(),
      frequency: loan.frequency,
      nextPaymentDate: loan.next_payment_date,
      alertDays: loan.alert_days || alertSettings.defaultDays
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
    const paymentDate = paymentForm.date;

    // 1️⃣ Update the loan balance
    await dbOperation('loans', 'put', {
      ...loan,
      balance: loan.balance - paymentAmount,
      last_payment_date: paymentDate,
      next_payment_date: predictNextDate(paymentDate, loan.frequency)
    });

    // 2️⃣ Record a transaction for payment
    const transaction = {
      type: 'payment',
      loan_id: loanId,
      amount: paymentAmount,
      date: paymentDate,
      category_id: paymentForm.category || 'loan_payment',
      category_name: 'Loan Payment',
      payment_method: 'loan',
      payment_method_id: loanId,
      payment_method_name: loan.name,
      description: `Payment for loan ${loan.name}`,
      created_at: new Date().toISOString(),
      status: 'active',
      undone_at: null
    };
    const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

    // 3️⃣ Deduct from linked reserved fund
    const linkedFund = reservedFunds.find(f => f.linked_to?.type === 'loan' && f.linked_to?.id === loanId);
    if (linkedFund) {
      const deductedAmount = Math.min(paymentAmount, linkedFund.amount);
      await dbOperation('reservedFunds', 'put', {
        ...linkedFund,
        amount: linkedFund.amount - deductedAmount,
        last_paid_date: paymentDate,
        due_date: linkedFund.recurring
          ? predictNextDate(linkedFund.due_date, linkedFund.frequency || 'monthly')
          : linkedFund.due_date
      });
      if (!linkedFund.recurring && linkedFund.amount - deductedAmount <= 0) {
        await dbOperation('reservedFunds', 'delete', linkedFund.id);
      }
    }

    // 4️⃣ Deduct from lump-sum fund
    const lumpsumFund = reservedFunds.find(f =>
      f.is_lumpsum && f.linked_items?.some(item => item.type === 'loan' && item.id === loanId)
    );
    if (lumpsumFund && lumpsumFund.amount >= paymentAmount) {
      await dbOperation('reservedFunds', 'put', {
        ...lumpsumFund,
        amount: lumpsumFund.amount - paymentAmount
      });
    }

    // 5️⃣ Update available cash
    await onUpdateCash(availableCash - paymentAmount);

    // 6️⃣ Log activity
    await logActivity(
      'payment',
      'loan',
      loanId,
      loan.name,
      `Made payment of ${formatCurrency(paymentAmount)} for ${loan.name}`,
      {
        entity: { ...loan },
        paymentAmount,
        date: paymentDate,
        previousCash: availableCash,
        affectedFund: linkedFund ? { ...linkedFund } : lumpsumFund ? { ...lumpsumFund } : null,
        transactionId: savedTransaction?.id
      }
    );

    // 7️⃣ Refresh UI
    await onUpdate();

    // 8️⃣ Reset
    setPayingLoan(null);
    setPaymentForm({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      category: 'other'
    });
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
          onClick={() => (showAddForm ? resetForm() : setShowAddForm(true))}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          <Plus size={20} />
          {showAddForm ? 'Cancel' : 'Add Loan'}
        </button>
      </div>

      {showAddForm && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          <SmartInput
            type="loan"
            value={formData.name}
            onChange={(value) => setFormData({ ...formData, name: value })}
            label="Loan Name *"
            placeholder="e.g., Car Loan, Student Loan"
            darkMode={darkMode}
            required={true}
          />
          <input
            type="number"
            placeholder="Principal *"
            value={formData.principal}
            onChange={(e) => setFormData({ ...formData, principal: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="number"
            placeholder="Current Balance *"
            value={formData.balance}
            onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="number"
            placeholder="Interest Rate %"
            value={formData.interestRate}
            onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="number"
            placeholder="Payment Amount *"
            value={formData.paymentAmount}
            onChange={(e) => setFormData({ ...formData, paymentAmount: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="date"
            value={formData.nextPaymentDate}
            onChange={(e) => setFormData({ ...formData, nextPaymentDate: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
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
            <div
              key={String(normalizeId(loan.id))}
              ref={(el) => {
                const key = String(normalizeId(loan.id));
                if (el) {
                  loanRefs.current[key] = el;
                }
              }}
              className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 ${focusTarget?.type === 'loan' && normalizeId(focusTarget.id) === normalizeId(loan.id) ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg">{loan.name}</h3>
                  <div className="text-2xl font-bold text-orange-600 mt-1">{formatCurrency(loan.balance)}</div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                    of {formatCurrency(loan.principal)} ({((loan.balance / loan.principal) * 100).toFixed(1)}% remaining)
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(loan)} className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded`}>
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => handleDelete(loan.id)} className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}>
                    <X size={18} />
                  </button>
                </div>
              </div>

              {loan.next_payment_date && (
                <div className={`flex justify-between items-center mb-3 text-sm pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Next Payment:</span>
                  <div className="text-right">
                    <div className="font-medium">{formatDate(loan.next_payment_date)}</div>
                    {getDaysUntil(loan.next_payment_date) >= 0 && (
                      <div className={`text-xs ${getDaysUntil(loan.next_payment_date) <= (loan.alert_days || 7) ? 'text-red-600 font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {getDaysUntil(loan.next_payment_date) === 0 ? 'Due Today!' : `${getDaysUntil(loan.next_payment_date)} days`}
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
                    <button onClick={() => setPayingLoan(null)} className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} py-2 rounded-lg font-medium`}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setPayingLoan(loan.id)} className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium">
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
