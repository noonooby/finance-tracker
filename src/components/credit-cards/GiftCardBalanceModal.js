import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { formatCurrency, defaultBankAccount } from '../../utils/helpers';
import ActionButton from '../shared/ActionButton';
import { showToast } from '../../utils/toast';
import { localDate } from '../../utils/helpers';

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
  categories = []
}) {
  const account = defaultBankAccount(bankAccounts);
  const [formData, setFormData] = useState({
    amount: '',
    amountPaid: '', // Different from amount when bonus is applied
    date: localDate(),
    paymentMethod: account ? 'bank_account' : '',
    paymentMethodId: account?.id || null,
    category: operation === 'add' ? 'gift_card_purchase' : '',
    notes: ''
  });

  const isAddOperation = operation === 'add';
  
  const getPaymentSources = () => {
    const sources = [
      { value: '', label: 'Choose how you paid' }
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
    if (!value.includes(':')) {
      setFormData({ ...formData, paymentMethod: '', paymentMethodId: null });
    } else {
      const [method, id] = value.split(':');
      setFormData({ ...formData, paymentMethod: method, paymentMethodId: id });
    }
  };

  const handleSubmit = () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      showToast.error('Please enter a valid amount');
      return;
    }
    
    if (operation === 'use' && !formData.category) {
      showToast.error('Please select a category for this expense');
      return;
    }

    if (operation === 'add' && !formData.paymentMethodId) {
      showToast.error('Choose how you paid');
      return;
    }
    
    onConfirm(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${isAddOperation ? 'Add balance' : 'Use balance'}: ${giftCard.name}`}
        className={`bg-surface rounded-2xl p-6 max-w-md w-full`}
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
              <p className={`text-sm text-muted`}>
                {giftCard.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`text-2xl leading-none text-muted hover:text-fg`}
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* Current Balance */}
          <div className={`p-3 rounded-2xl bg-surface-2`}>
            <div className={`text-xs text-muted mb-1`}>
              Current Balance
            </div>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(giftCard.balance)}
            </div>
          </div>

          {/* Amount Added to Card */}
          <div>
            <label className={`block text-sm font-medium mb-1 text-fg`}>
              Amount Added to Card *
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
              autoFocus
            />
          </div>

          {/* Amount Paid (optional, for bonus scenarios) */}
          {isAddOperation && (
            <div>
              <label className={`block text-sm font-medium mb-1 text-fg`}>
                Amount Paid (optional)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="Same as amount added"
                value={formData.amountPaid}
                onChange={(e) => setFormData({ ...formData, amountPaid: e.target.value })}
                className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
              />
              <p className={`text-xs mt-1 text-muted`}>
                For bonus scenarios: e.g., paid $50 but got $55 loaded
              </p>
            </div>
          )}

          {/* Date */}
          <div>
            <label className={`block text-sm font-medium mb-1 text-fg`}>
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
            />
          </div>

          {/* Payment Source (only for Add Balance) */}
          {isAddOperation && (
            <div>
              <label className={`block text-sm font-medium mb-1 text-fg`}>
                Payment Source *
              </label>
              <select
                value={formData.paymentMethodId ? `${formData.paymentMethod}:${formData.paymentMethodId}` : ''}
                onChange={(e) => handlePaymentMethodChange(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
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
              <label className={`block text-sm font-medium mb-1 text-fg`}>
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
              >
                <option value="">Select category</option>
                {categories.filter(c => !c.is_income).map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <p className={`text-xs mt-1 text-muted`}>
                What did you buy with this gift card?
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={`block text-sm font-medium mb-1 text-fg`}>
              Notes (optional)
            </label>
            <input
              type="text"
              placeholder={isAddOperation ? 'e.g., Birthday gift' : 'e.g., Coffee at Starbucks'}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
            />
          </div>

          {/* Preview */}
          {formData.amount && parseFloat(formData.amount) > 0 && (
            <div className={`p-3 rounded-lg bg-accent-soft border border-accent/30`}>
              <div className={`text-xs font-medium mb-1 text-accent`}>
                Preview:
              </div>
              <div className={`text-sm text-accent`}>
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
