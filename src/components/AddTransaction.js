import React, { useState, useEffect } from 'react';
import { X, Plus, CreditCard, Wallet, TrendingUp, Calendar } from 'lucide-react';
import { dbOperation } from '../utils/db';
import { generateId } from '../utils/helpers';
import { logActivity } from '../utils/activityLogger';

export default function AddTransaction({ 
  darkMode, 
  onClose, 
  onUpdate,
  categories,
  creditCards,
  loans,
  reservedFunds,
  availableCash,
  onUpdateCash,
  preselectedCard = null,
  preselectedLoan = null,
  preselectedType = 'expense'
}) {
  const [formData, setFormData] = useState({
    type: preselectedType,
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    notes: '',
    categoryId: '',
    paymentMethod: preselectedCard ? 'credit_card' : preselectedLoan ? 'loan' : 'cash',
    paymentMethodId: preselectedCard?.id || preselectedLoan?.id || null,
    incomeSource: ''
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (preselectedCard) {
      setFormData(prev => ({
        ...prev,
        paymentMethod: 'credit_card',
        paymentMethodId: preselectedCard.id
      }));
    }
    if (preselectedLoan) {
      setFormData(prev => ({
        ...prev,
        paymentMethod: 'loan',
        paymentMethodId: preselectedLoan.id
      }));
    }
  }, [preselectedCard, preselectedLoan]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const amount = parseFloat(formData.amount);
      
      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount');
        setSaving(false);
        return;
      }

      const category = categories.find(c => c.id === formData.categoryId);
      
      // Create transaction record
      const transaction = {
        id: generateId(),
        user_id: null, // Will be set by dbOperation
        type: formData.type,
        amount: amount,
        date: formData.date,
        description: formData.description,
        notes: formData.notes,
        category_id: formData.categoryId || null,
        category_name: category?.name || null,
        payment_method: formData.paymentMethod,
        payment_method_id: formData.paymentMethodId,
        payment_method_name: null,
        card_id: null,
        loan_id: null,
        fund_id: null,
        income_source: formData.incomeSource || null,
        is_cleared: false,
        created_at: new Date().toISOString()
      };

      // Handle different transaction types
      if (formData.type === 'expense') {
        if (formData.paymentMethod === 'credit_card') {
          const card = creditCards.find(c => c.id === formData.paymentMethodId);
          if (!card) {
            alert('Please select a credit card');
            setSaving(false);
            return;
          }

          // Increase card balance
          await dbOperation('creditCards', 'put', {
            ...card,
            balance: card.balance + amount
          }, { skipActivityLog: true });

          transaction.card_id = card.id;
          transaction.payment_method_name = card.name;

          await logActivity(
            'expense',
            'card',
            card.id,
            card.name,
            `Expense: $${amount.toFixed(2)} on ${card.name} - ${formData.description}`,
            { amount, category: category?.name, description: formData.description }
          );

        } else if (formData.paymentMethod === 'cash') {
          // Deduct from available cash
          const newCash = availableCash - amount;
          await onUpdateCash(newCash);
          transaction.payment_method_name = 'Cash';

          await logActivity(
            'expense',
            'income',
            transaction.id,
            'Cash',
            `Cash expense: $${amount.toFixed(2)} - ${formData.description}`,
            { amount, category: category?.name, description: formData.description }
          );
        }

      } else if (formData.type === 'income') {
        // Add to available cash
        const newCash = availableCash + amount;
        await onUpdateCash(newCash);
        transaction.payment_method = 'cash';
        transaction.payment_method_name = 'Cash';
        transaction.income_source = formData.incomeSource;

        await logActivity(
          'income',
          'income',
          transaction.id,
          formData.incomeSource || 'Income',
          `Income: $${amount.toFixed(2)} - ${formData.incomeSource}`,
          { amount, source: formData.incomeSource }
        );

      } else if (formData.type === 'payment') {
        // Payment to credit card or loan
        if (formData.paymentMethod === 'credit_card') {
          const card = creditCards.find(c => c.id === formData.paymentMethodId);
          if (!card) {
            alert('Please select a credit card');
            setSaving(false);
            return;
          }

          // Decrease card balance
          await dbOperation('creditCards', 'put', {
            ...card,
            balance: Math.max(0, card.balance - amount)
          }, { skipActivityLog: true });

          // Deduct from cash
          const newCash = availableCash - amount;
          await onUpdateCash(newCash);

          transaction.card_id = card.id;
          transaction.payment_method_name = card.name;

          await logActivity(
            'payment',
            'card',
            card.id,
            card.name,
            `Payment: $${amount.toFixed(2)} to ${card.name}`,
            { 
              entity: card,
              previousCash: availableCash,
              amount 
            }
          );

        } else if (formData.paymentMethod === 'loan') {
          const loan = loans.find(l => l.id === formData.paymentMethodId);
          if (!loan) {
            alert('Please select a loan');
            setSaving(false);
            return;
          }

          // Decrease loan balance
          await dbOperation('loans', 'put', {
            ...loan,
            balance: Math.max(0, loan.balance - amount)
          }, { skipActivityLog: true });

          // Deduct from cash
          const newCash = availableCash - amount;
          await onUpdateCash(newCash);

          transaction.loan_id = loan.id;
          transaction.payment_method_name = loan.name;

          await logActivity(
            'payment',
            'loan',
            loan.id,
            loan.name,
            `Payment: $${amount.toFixed(2)} to ${loan.name}`,
            { 
              entity: loan,
              previousCash: availableCash,
              amount 
            }
          );
        }
      }

      // Save transaction
      await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

      await onUpdate();
      onClose();
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('Error adding transaction. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const getPaymentMethodOptions = () => {
    if (formData.type === 'expense') {
      return [
        { value: 'cash', label: 'Cash', icon: <Wallet size={18} /> },
        { value: 'credit_card', label: 'Credit Card', icon: <CreditCard size={18} /> }
      ];
    } else if (formData.type === 'payment') {
      return [
        { value: 'credit_card', label: 'Credit Card', icon: <CreditCard size={18} /> },
        { value: 'loan', label: 'Loan', icon: <TrendingUp size={18} /> }
      ];
    } else if (formData.type === 'income') {
      return [
        { value: 'cash', label: 'Cash', icon: <Wallet size={18} /> }
      ];
    }
    return [];
  };

  const getPaymentMethodItems = () => {
    if (formData.paymentMethod === 'credit_card') {
      return creditCards;
    } else if (formData.paymentMethod === 'loan') {
      return loans;
    }
    return [];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto`}>
        <div className={`sticky top-0 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b p-4 flex justify-between items-center`}>
          <h2 className="text-xl font-bold">Add Transaction</h2>
          <button onClick={onClose} className={`${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Transaction Type */}
          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'expense', paymentMethod: 'cash', paymentMethodId: null })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  formData.type === 'expense'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'income', paymentMethod: 'cash', paymentMethodId: null })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  formData.type === 'income'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                Income
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'payment', paymentMethod: 'credit_card', paymentMethodId: null })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  formData.type === 'payment'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                Payment
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium mb-2">Amount *</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              placeholder="0.00"
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium mb-2">Date *</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {formData.type === 'income' ? 'Source' : 'Description'} *
            </label>
            <input
              type="text"
              value={formData.type === 'income' ? formData.incomeSource : formData.description}
              onChange={(e) => setFormData({ 
                ...formData, 
                [formData.type === 'income' ? 'incomeSource' : 'description']: e.target.value 
              })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              placeholder={formData.type === 'income' ? 'Salary, Freelance, etc.' : 'Coffee, Gas, etc.'}
              required
            />
          </div>

          {/* Category (only for expenses) */}
          {formData.type === 'expense' && (
            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="">Select category</option>
                {categories.filter(c => !c.is_income).map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium mb-2">Payment Method *</label>
            <div className="space-y-2">
              {getPaymentMethodOptions().map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, paymentMethod: option.value, paymentMethodId: null })}
                  className={`w-full p-3 rounded-lg border-2 flex items-center gap-2 transition-colors ${
                    formData.paymentMethod === option.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Specific Card/Loan Selection */}
          {(formData.paymentMethod === 'credit_card' || formData.paymentMethod === 'loan') && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Select {formData.paymentMethod === 'credit_card' ? 'Card' : 'Loan'} *
              </label>
              <select
                value={formData.paymentMethodId || ''}
                onChange={(e) => setFormData({ ...formData, paymentMethodId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                required
              >
                <option value="">Select {formData.paymentMethod === 'credit_card' ? 'card' : 'loan'}</option>
                {getPaymentMethodItems().map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} - ${item.balance.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-2">Notes (Optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              rows="3"
              placeholder="Additional details..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-2 rounded-lg border ${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
