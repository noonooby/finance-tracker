import React from 'react';
import ActionButton from '../shared/ActionButton';
import { formatCurrency } from '../../utils/helpers';

/**
 * Loan Payment Form Component
 * Modal form for making loan payments
 */
export default function LoanPaymentForm({
  darkMode,
  loan,
  paymentForm,
  setPaymentForm,
  sourceOptions,
  onSourceChange,
  onSubmit,
  onCancel,
  processing,
  categories
}) {
  const recommended = loan.payment_amount || loan.balance;
  const showRecommended = paymentForm.amountMode === 'recommended' && Number.isFinite(recommended);

  return (
    <div className="space-y-3">
      {/* Payment Source */}
      <div>
        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
          Payment Source *
        </label>
        <select
          value={paymentForm.source}
          onChange={(e) => onSourceChange(e.target.value)}
          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
        >
          {sourceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Payment Amount */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={`block text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
            Payment Amount *
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!Number.isFinite(recommended)}
              onClick={() => {
                if (!Number.isFinite(recommended)) return;
                setPaymentForm((prev) => ({
                  ...prev,
                  amountMode: 'recommended',
                  amount: recommended.toFixed(2)
                }));
              }}
              className={`px-2 py-1 text-xs rounded border ${
                paymentForm.amountMode === 'recommended' 
                  ? 'bg-blue-600 text-white border-blue-600' 
                  : darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-600'
              } ${!Number.isFinite(recommended) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Suggested
            </button>
            <button
              type="button"
              onClick={() => setPaymentForm((prev) => ({ ...prev, amountMode: 'custom' }))}
              className={`px-2 py-1 text-xs rounded border ${
                paymentForm.amountMode === 'custom' 
                  ? 'bg-blue-600 text-white border-blue-600' 
                  : darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-600'
              }`}
            >
              Custom
            </button>
          </div>
        </div>
        <input
          type="number"
          step="0.01"
          placeholder="Payment Amount"
          value={paymentForm.amount}
          disabled={paymentForm.amountMode === 'recommended'}
          onChange={(e) => setPaymentForm({ ...paymentForm, amountMode: 'custom', amount: e.target.value })}
          className={`w-full px-3 py-2 border ${
            paymentForm.amountMode === 'recommended' ? 'opacity-60 cursor-not-allowed' : ''
          } ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
        />
        {showRecommended && (
          <p className={`mt-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Suggested amount: {formatCurrency(recommended)}
          </p>
        )}
      </div>

      {/* Payment Date */}
      <div>
        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
          Payment Date *
        </label>
        <input
          type="date"
          value={paymentForm.date}
          onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
        />
      </div>

      {/* Category */}
      <div>
        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
          Category
        </label>
        <select
          value={paymentForm.category}
          onChange={(e) => setPaymentForm({ ...paymentForm, category: e.target.value })}
          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <ActionButton
          onClick={onSubmit}
          processing={processing}
          variant="success"
          processingText="Processing Payment..."
          idleText="Confirm Payment"
          fullWidth
        />
        <ActionButton
          onClick={onCancel}
          variant="secondary"
          idleText="Cancel"
          fullWidth
        />
      </div>
    </div>
  );
}
