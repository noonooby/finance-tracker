import React, { useRef } from 'react';
import ActionButton from '../shared/ActionButton';

export default function LoanForm({
  darkMode,
  formData,
  setFormData,
  editingItem,
  recentLoanNames,
  handleSelectLoanName,
  handleLoanNameChange,
  handleLoanNameBlur,
  handleAdd,
  resetForm,
  isProcessing,
  alertSettings,
  creditCards = [],
  bankAccounts = []
}) {
  const loanNameInputRef = useRef(null);

  // Get all available payment sources for auto-payment connection
  const getAvailablePaymentSources = () => {
    const sources = [
      { value: '', label: 'None (Manual Payment)' }
    ];

    // Add bank accounts (primary payment method)
    if (bankAccounts && bankAccounts.length > 0) {
      bankAccounts.forEach(account => {
        sources.push({
          value: `bank_account:${account.id}`,
          label: `Bank Account: ${account.name}${account.is_primary ? ' (Primary)' : ''}`
        });
      });
    }

    // Add credit cards
    if (creditCards && creditCards.length > 0) {
      creditCards.forEach(card => {
        sources.push({
          value: `credit_card:${card.id}`,
          label: `Credit Card: ${card.name}`
        });
      });
    }

    // Add cash in hand
    sources.push({
      value: 'cash_in_hand',
      label: 'Cash in Hand'
    });

    return sources;
  };

  const handlePaymentSourceChange = (value) => {
    if (!value) {
      setFormData(prev => ({
        ...prev,
        connectedPaymentSource: null,
        connectedPaymentSourceId: null
      }));
    } else {
      const [sourceType, sourceId] = value.includes(':') ? value.split(':') : [value, null];
      setFormData(prev => ({
        ...prev,
        connectedPaymentSource: sourceType,
        connectedPaymentSourceId: sourceId
      }));
    }
  };

  const getCurrentPaymentSourceValue = () => {
    if (!formData.connectedPaymentSource) return '';
    if (formData.connectedPaymentSource === 'cash_in_hand') return 'cash_in_hand';
    return `${formData.connectedPaymentSource}:${formData.connectedPaymentSourceId}`;
  };

  return (
    <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
      
      {/* Recent Loan Templates */}
      {recentLoanNames.length > 0 && !editingItem && (
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Recent Loans
          </label>
          <div className="flex gap-2 flex-wrap">
            {recentLoanNames.map(loanTemplate => (
              <button
                key={loanTemplate.loan_name}
                type="button"
                onClick={() => handleSelectLoanName(loanTemplate)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  formData.name === loanTemplate.loan_name
                    ? 'bg-blue-600 text-white'
                    : darkMode 
                      ? 'bg-blue-900 text-blue-200 hover:bg-blue-800 border border-blue-700'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'
                }`}
              >
                {loanTemplate.loan_name}
                {loanTemplate.usage_count > 10 && ' ⭐'}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Loan Name */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {recentLoanNames.length > 0 ? 'Or Type New Loan Name *' : 'Loan Name *'}
        </label>
        <input
          ref={loanNameInputRef}
          type="text"
          value={formData.name}
          onChange={(e) => handleLoanNameChange(e.target.value)}
          onBlur={handleLoanNameBlur}
          placeholder="e.g., Car Loan, Student Loan"
          className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          required
          autoFocus={!editingItem && recentLoanNames.length === 0}
        />
      </div>

      {/* Principal */}
      <input
        type="number"
        placeholder="Principal *"
        value={formData.principal}
        onChange={(e) => setFormData({ ...formData, principal: e.target.value })}
        className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
      />

      {/* Current Balance */}
      <input
        type="number"
        placeholder="Current Balance *"
        value={formData.balance}
        onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
        className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
      />

      {/* Interest Rate */}
      <input
        type="number"
        placeholder="Interest Rate %"
        value={formData.interestRate}
        onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
        className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
      />

      {/* Payment Amount */}
      <input
        type="number"
        placeholder="Payment Amount *"
        value={formData.paymentAmount}
        onChange={(e) => setFormData({ ...formData, paymentAmount: e.target.value })}
        className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
      />

      {/* Payment Frequency */}
      <div>
        <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Payment Frequency *
        </label>
        <select
          value={formData.frequency}
          onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
        >
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="bimonthly">Bi-Monthly</option>
        </select>
      </div>

      {/* NEW: Connected Payment Source */}
      <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-blue-50'}`}>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Auto-Payment Source (Optional)
        </label>
        <select
          value={getCurrentPaymentSourceValue()}
          onChange={(e) => handlePaymentSourceChange(e.target.value)}
          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} rounded-lg`}
        >
          {getAvailablePaymentSources().map(source => (
            <option key={source.value} value={source.value}>
              {source.label}
            </option>
          ))}
        </select>
        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          This source will be used when processing overdue payments automatically
        </p>
      </div>

      {/* Recurring Duration */}
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
          <option value="indefinite">Indefinite (Until Balance Cleared)</option>
          <option value="until_date">Until Specific Date</option>
          <option value="occurrences">For Specific Number of Payments</option>
        </select>
      </div>

      {/* End Date (conditional) */}
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

      {/* Number of Payments (conditional) */}
      {formData.recurringDurationType === 'occurrences' && (
        <div>
          <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Number of Payments *
          </label>
          <input
            type="number"
            min="1"
            placeholder="e.g., 24 payments"
            value={formData.recurringOccurrences}
            onChange={(e) => setFormData({ ...formData, recurringOccurrences: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          {editingItem && editingItem.recurring_occurrences_completed > 0 && (
            <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Completed: {editingItem.recurring_occurrences_completed} of {editingItem.recurring_occurrences_total || formData.recurringOccurrences || '?'}
            </p>
          )}
        </div>
      )}

      {/* Next Payment Date */}
      <div>
        <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Next Payment Date *
        </label>
        <input
          type="date"
          value={formData.nextPaymentDate}
          onChange={(e) => setFormData({ ...formData, nextPaymentDate: e.target.value })}
          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <ActionButton
          onClick={handleAdd}
          processing={isProcessing}
          variant="primary"
          processingText={editingItem ? 'Updating Loan...' : 'Adding Loan...'}
          idleText={editingItem ? 'Update Loan' : 'Add Loan'}
          fullWidth
        />
        <ActionButton
          onClick={resetForm}
          variant="secondary"
          idleText="Cancel"
          fullWidth
        />
      </div>
    </div>
  );
}
