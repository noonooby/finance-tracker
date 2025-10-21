import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import ActionButton from '../shared/ActionButton';

/**
 * Gift Card Balance Operations Modal
 * Handles both "Add Balance" (purchase/reload) and "Use Balance" (spend)
 */
export default function GiftCardBalanceModal({
  darkMode,
  giftCard,
  operation, // 'add' or 'use'
  onClose,
  onConfirm,
  processing,
  bankAccounts = [],
  creditCards = [],
  cashInHand = 0,
  categories = []
}) {
  const [formData, setFormData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash_in_hand',
    paymentMethodId: null,
    category: operation === 'add' ? 'gift_card_purchase' : '',
    notes: ''
  });

  const isAddOperation = operation === 'add';
  
  const getPaymentSources = () => {
    const sources = [
      { value: 'cash_in_hand', label: `Cash in Hand (${formatCurrency(cashInHand)})` }
    ];
    
    if (bankAccounts.length > 0) {
      bankAccounts.forEach(acc => {
        sources.push({
          value: `bank_account:${acc.id}`,
          label: `${acc.name} (${formatCurrency(acc.balance)})`
        });
      });
    }
    
    if (creditCards.filter(c => !c.is_gift_card).length > 0) {
      creditCards.filter(c => !c.is_gift_card).forEach(card => {
        sources.push({
          value: `credit_card:${card.id}`,
          label: card.name
        });
      });
    }
    
    return sources;
  };

  const handlePaymentMethodChange = (value) => {
    if (value === 'cash_in_hand') {
      setFormData({ ...formData, paymentMethod: 'cash_in_hand', paymentMethodId: null });
    } else {
      const [method, id] = value.split(':');
      setFormData({ ...formData, paymentMethod: method, paymentMethodId: id });
    }
  };

  const handleSubmit = () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    if (operation === 'use' && !formData.category) {
      alert('Please select a category for this expense');
      return;
    }
    
    onConfirm(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 max-w-md w-full`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-full ${isAddOperation ? 'bg-green-100 dark:bg-green-900/20' : 'bg-orange-100 dark:bg-orange-900/20'}`}>
              {isAddOperation ? <Plus size={24} className="text-green-600" /> : <Minus size={24} className="text-orange-600" />}
            </div>
            <div>
              <h3 className="text-lg font-bold">
                {isAddOperation ? 'Add Balance' : 'Use Balance'}
              </h3>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {giftCard.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`text-2xl leading-none ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`}
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* Current Balance */}
          <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
              Current Balance
            </div>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(giftCard.balance)}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Amount *
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              autoFocus
            />
          </div>

          {/* Date */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
            />
          </div>

          {/* Payment Source (only for Add Balance) */}
          {isAddOperation && (
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Payment Source *
              </label>
              <select
                value={formData.paymentMethodId ? `${formData.paymentMethod}:${formData.paymentMethodId}` : formData.paymentMethod}
                onChange={(e) => handlePaymentMethodChange(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                {getPaymentSources().map(source => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category (only for Use Balance) */}
          {!isAddOperation && (
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="">Select category</option>
                {categories.filter(c => !c.is_income).map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                What did you buy with this gift card?
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Notes (optional)
            </label>
            <input
              type="text"
              placeholder={isAddOperation ? 'e.g., Birthday gift' : 'e.g., Coffee at Starbucks'}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
            />
          </div>

          {/* Preview */}
          {formData.amount && parseFloat(formData.amount) > 0 && (
            <div className={`p-3 rounded-lg ${darkMode ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
              <div className={`text-xs font-medium mb-1 ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                Preview:
              </div>
              <div className={`text-sm ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}>
                {giftCard.name}: {formatCurrency(giftCard.balance)} → {formatCurrency(
                  giftCard.balance + (isAddOperation ? 1 : -1) * parseFloat(formData.amount)
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <ActionButton
            onClick={onClose}
            variant="secondary"
            idleText="Cancel"
            fullWidth
          />
          <ActionButton
            onClick={handleSubmit}
            processing={processing}
            variant={isAddOperation ? 'success' : 'primary'}
            processingText={isAddOperation ? 'Adding Balance...' : 'Recording Usage...'}
            idleText={isAddOperation ? 'Add Balance' : 'Use Balance'}
            fullWidth
          />
        </div>
      </div>
    </div>
  );
}
