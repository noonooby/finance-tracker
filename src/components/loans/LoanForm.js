import React, { useRef } from 'react';
import RateLookup from '../shared/RateLookup';
import ActionButton from '../shared/ActionButton';
import { localDate } from '../../utils/helpers';

export default function LoanForm({
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
      { value: '', label: 'None, I pay it myself' }
    ];

    // Add accounts (cash is one of them)
    if (bankAccounts && bankAccounts.length > 0) {
      bankAccounts.forEach(account => {
        sources.push({
          value: `bank_account:${account.id}`,
          label: `Account: ${account.name}${account.is_primary ? ' (main)' : ''}`
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
    // A source with no account (cash before it was an account) counts as none.
    if (!formData.connectedPaymentSource || !formData.connectedPaymentSourceId) return '';
    return `${formData.connectedPaymentSource}:${formData.connectedPaymentSourceId}`;
  };

  return (
    <div className="bg-surface border-line rounded-2xl border p-4 space-y-3">
      
      {/* Recent Loan Templates */}
      {recentLoanNames.length > 0 && !editingItem && (
        <div>
          <label className="block text-sm font-medium mb-2 text-fg">
            Recent loans
          </label>
          <div className="flex gap-2 flex-wrap">
            {recentLoanNames.map(loanTemplate => (
              <button
                key={loanTemplate.loan_name}
                type="button"
                onClick={() => handleSelectLoanName(loanTemplate)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                  formData.name === loanTemplate.loan_name
                    ? 'bg-accent text-accent-contrast'
                    : 'bg-accent-soft text-accent hover:bg-accent-soft border border-accent/30'
                }`}
              >
                {loanTemplate.loan_name}
                {loanTemplate.usage_count > 10 && ' (often used)'}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Loan Name */}
      <div>
        <label className="block text-sm font-medium mb-2 text-fg">
          {recentLoanNames.length > 0 ? 'Or type a new name' : 'Name'}
        </label>
        <input
          ref={loanNameInputRef}
          type="text"
          value={formData.name}
          onChange={(e) => handleLoanNameChange(e.target.value)}
          onBlur={handleLoanNameBlur}
          placeholder="Car loan"
          className="field"
          required
          autoFocus={!editingItem && recentLoanNames.length === 0}
        />
      </div>

      {/* Principal */}
      <input
        type="number"
        placeholder="Principal"
        value={formData.principal}
        onChange={(e) => setFormData({ ...formData, principal: e.target.value })}
        className="field"
      />

      {/* Current Balance */}
      <input
        type="number"
        placeholder="Current balance"
        value={formData.balance}
        onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
        className="field"
      />

      {/* Interest Rate */}
      <input
        type="number"
        placeholder="Interest rate %"
        value={formData.interestRate}
        onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
        className="field"
      />

      {/* Paid by card through a service that charges a fee */}
      <div className="grid grid-cols-2 gap-3 items-end">
        <input
          type="text"
          maxLength={40}
          placeholder="Paid through (for example Chexy)"
          aria-label="Service the payment goes through"
          value={formData.paidThrough || ''}
          onChange={(e) => setFormData({ ...formData, paidThrough: e.target.value })}
          className="field"
        />
        <input
          type="number"
          step="0.01"
          min="0"
          max="10"
          inputMode="decimal"
          placeholder="Its fee %"
          aria-label="Fee the service charges, in percent"
          value={formData.feePercent || ''}
          onChange={(e) => setFormData({ ...formData, feePercent: e.target.value })}
          className="field"
        />
      </div>

      {/* Payment Amount */}
      <input
        type="number"
        placeholder="Payment amount"
        value={formData.paymentAmount}
        onChange={(e) => setFormData({ ...formData, paymentAmount: e.target.value })}
        className="field"
      />

      <div className="grid grid-cols-2 gap-3 items-end">
        <label className="block text-sm text-muted">
          Kind
          <select value={formData.loanType || 'loan'} onChange={(e) => setFormData({ ...formData, loanType: e.target.value })} className="mt-1 field">
            <option value="loan">Loan</option>
            <option value="mortgage">Mortgage</option>
            <option value="line_of_credit">Line of credit</option>
            <option value="car_lease">Car lease or car loan</option>
            <option value="bnpl">Pay later (Klarna, Affirm, PayPal)</option>
            <option value="plan">Equal payment plan</option>
            <option value="student">Student loan</option>
          </select>
        </label>
        <label className="block text-sm text-muted">
          Interest added
          <select value={formData.compounding || ''} onChange={(e) => setFormData({ ...formData, compounding: e.target.value })} className="mt-1 field">
            <option value="">{formData.loanType === 'mortgage' ? 'Twice a year (usual for mortgages)' : 'Monthly (usual)'}</option>
            <option value="monthly">Monthly</option>
            <option value="semiannual">Twice a year</option>
            <option value="annual">Once a year</option>
            <option value="daily">Daily</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
        <label className="block text-sm text-muted">
          Lender or provider
          <input value={formData.provider || ''} onChange={(e) => setFormData({ ...formData, provider: e.target.value })} placeholder="Affirm, TD" className="mt-1 field" />
        </label>
        <label className="block text-sm text-muted">
          Setup fee
          <input type="number" step="0.01" inputMode="decimal" value={formData.setupFee || ''} onChange={(e) => setFormData({ ...formData, setupFee: e.target.value })} placeholder="0.00" className="mt-1 field" />
        </label>
      </div>
      {formData.provider && (
        <RateLookup kind="loan" name={formData.provider} onUse={(r) => setFormData({ ...formData,
          interestRate: formData.interestRate || (r.rate_low != null && r.rate_low === r.rate_high ? String(r.rate_low) : formData.interestRate),
          setupFee: formData.setupFee || (r.setup_fee != null ? String(r.setup_fee) : '') })} />
      )}
      {(formData.loanType === 'plan' || formData.loanType === 'bnpl') && (
        <label className="block text-sm text-muted">
          Where it lives
          <select value={formData.onCardId || ''} onChange={(e) => setFormData({ ...formData, onCardId: e.target.value })} className="mt-1 field">
            <option value="">On its own (paid separately)</option>
            {creditCards.filter((c) => !c.is_gift_card).map((c) => <option key={c.id} value={c.id}>Inside {c.name} (billed on the card)</option>)}
          </select>
          <span className="block text-xs mt-1 text-muted">A plan inside a card is part of the card's balance. Each installment is billed on the card, so no separate payment is made.</span>
        </label>
      )}
      <p className="text-xs text-muted">With a rate set, each payment is split into interest and the part that lowers what you owe.</p>

      {/* Payment Frequency */}
      <div>
        <label className="block text-sm mb-1 text-muted">
          Payment frequency
        </label>
        <select
          value={formData.frequency}
          onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
          className="field"
        >
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="semimonthly">Twice a month</option>
          <option value="monthly">Monthly</option>
          <option value="bimonthly">Every 2 months</option>
        </select>
      </div>

      {/* NEW: Connected Payment Source */}
      <div className="p-3 rounded-xl bg-accent-soft">
        <label className="block text-sm font-medium mb-2 text-fg">
          Pay it automatically from (optional)
        </label>
        <select
          value={getCurrentPaymentSourceValue()}
          onChange={(e) => handlePaymentSourceChange(e.target.value)}
          className="field"
        >
          {getAvailablePaymentSources().map(source => (
            <option key={source.value} value={source.value}>
              {source.label}
            </option>
          ))}
        </select>
        <p className="text-xs mt-1 text-muted">
          This source will be used when processing overdue payments automatically
        </p>
      </div>

      {/* Recurring Duration */}
      <div>
        <label className="block text-sm mb-1 text-muted">
          Recurring duration
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
          className="field"
        >
          <option value="indefinite">Until it is paid off</option>
          <option value="until_date">Until specific date</option>
          <option value="occurrences">For specific number of payments</option>
        </select>
      </div>

      {/* End Date (conditional) */}
      {formData.recurringDurationType === 'until_date' && (
        <div>
          <label className="block text-sm mb-1 text-muted">
            End date
          </label>
          <input
            type="date"
            value={formData.recurringUntilDate}
            onChange={(e) => setFormData({ ...formData, recurringUntilDate: e.target.value })}
            className="field"
            min={localDate()}
          />
        </div>
      )}

      {/* Number of Payments (conditional) */}
      {formData.recurringDurationType === 'occurrences' && (
        <div>
          <label className="block text-sm mb-1 text-muted">
            Number of payments
          </label>
          <input
            type="number"
            min="1"
            placeholder="24 payments"
            value={formData.recurringOccurrences}
            onChange={(e) => setFormData({ ...formData, recurringOccurrences: e.target.value })}
            className="field"
          />
          {editingItem && editingItem.recurring_occurrences_completed > 0 && (
            <p className="text-xs mt-1 text-muted">
              Completed: {editingItem.recurring_occurrences_completed} of {editingItem.recurring_occurrences_total || formData.recurringOccurrences || '?'}
            </p>
          )}
        </div>
      )}

      {/* Next Payment Date */}
      <div>
        <label className="block text-sm mb-1 text-muted">
          Next payment date
        </label>
        <input
          type="date"
          value={formData.nextPaymentDate}
          onChange={(e) => setFormData({ ...formData, nextPaymentDate: e.target.value })}
          className="field"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <ActionButton
          onClick={handleAdd}
          processing={isProcessing}
          variant="primary"
          processingText="Saving..."
          idleText={editingItem ? 'Save' : 'Add loan'}
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
