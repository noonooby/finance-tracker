import React from 'react';
import { CreditCard as CreditCardIcon, Gift, Star } from 'lucide-react';
import ActionButton from '../shared/ActionButton';
import GiftCardForm from './GiftCardForm';
import { paymentSourceOptions, paymentSourceValue } from './cardMath';

/**
 * Add or edit form for a credit or gift card. `mode` is 'add' or 'edit'.
 */
export default function CreditCardForm({
  mode,
  darkMode,
  card,
  formData,
  setFormData,
  editingItem,
  recentCardNames = [],
  recentGiftCards,
  onSelectCardName,
  onSelectGiftCard,
  giftCardNameInputRef,
  cardNameInputRef,
  onPaymentSourceChange,
  bankAccounts,
  creditCards,
  onSubmit,
  onCancel,
  submitting
}) {
  const isEdit = mode === 'edit';
  const inputClass = `w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`;
  const smallLabel = `block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`;
  const mainLabel = `block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const typeButton = (active, activeClass) => `flex-1 px-3 py-2 rounded-lg border-2 transition-colors font-medium flex items-center justify-center gap-2 ${
    active
      ? activeClass
      : darkMode ? 'border-gray-600 hover:border-gray-500 text-gray-300' : 'border-gray-300 hover:border-gray-400 text-gray-700'
  }`;

  return (
    <>
      {isEdit && (
        <h3 className="font-semibold text-lg mb-3">Edit {card.is_gift_card ? 'Gift Card' : 'Credit Card'}</h3>
      )}

      {!isEdit && recentCardNames.length > 0 && !editingItem && (
        <div>
          <label className={mainLabel}>Recent Cards</label>
          <div className="flex gap-2 flex-wrap">
            {recentCardNames.map(cardEntity => (
              <button
                key={cardEntity.id}
                type="button"
                onClick={() => onSelectCardName(cardEntity)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  formData.name === cardEntity.name
                    ? 'bg-blue-600 text-white'
                    : darkMode
                      ? 'bg-blue-900 text-blue-200 hover:bg-blue-800 border border-blue-700'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'
                }`}
              >
                {cardEntity.name}
                {cardEntity.usage_count > 10 && <Star size={12} className="inline ml-1" aria-label="Frequently used" />}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {isEdit ? 'Card Name *' : recentCardNames.length > 0 ? 'Or type new card name *' : 'Card Name *'}
        </label>
        <input
          ref={isEdit ? undefined : cardNameInputRef}
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Rogers Mastercard"
          className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          required={!isEdit}
          autoFocus={isEdit || (!editingItem && recentCardNames.length === 0)}
        />
      </div>

      <div>
        <label className={smallLabel}>Card Type</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFormData({ ...formData, isGiftCard: false })}
            className={typeButton(!formData.isGiftCard, 'border-blue-600 bg-blue-600 text-white')}
          >
            <CreditCardIcon size={18} />
            Credit Card
          </button>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, isGiftCard: true })}
            className={typeButton(formData.isGiftCard, 'border-green-600 bg-green-600 text-white')}
          >
            <Gift size={18} />
            Gift Card
          </button>
        </div>
      </div>

      <input
        type="number"
        step="0.01"
        placeholder="Current Balance *"
        value={formData.balance}
        onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
        className={inputClass}
      />

      {!formData.isGiftCard ? (
        <>
          <input
            type="number"
            step="0.01"
            placeholder="Credit Limit (optional)"
            value={formData.creditLimit}
            onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
            className={inputClass}
          />
          <div>
            <label className={smallLabel}>Payment Due Date *</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={smallLabel}>
              {isEdit ? 'Statement Day (optional)' : 'Statement Day (optional, e.g., 15 for 15th of month)'}
            </label>
            <input
              type="number"
              placeholder="e.g., 15"
              value={formData.statementDay}
              onChange={(e) => setFormData({ ...formData, statementDay: e.target.value })}
              className={inputClass}
            />
          </div>
          <input
            type="number"
            step="0.01"
            placeholder="Interest Rate % (optional)"
            value={formData.interestRate}
            onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
            className={inputClass}
          />
          <div>
            <label className={smallLabel}>{isEdit ? 'Alert Days' : 'Alert Me (days before due)'}</label>
            <input
              type="number"
              value={formData.alertDays}
              onChange={(e) => setFormData({ ...formData, alertDays: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-blue-50'}`}>
            <label className={mainLabel}>Auto-Payment Source (Optional)</label>
            <select
              value={paymentSourceValue(formData)}
              onChange={(e) => onPaymentSourceChange(e.target.value)}
              className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} rounded-lg`}
            >
              {paymentSourceOptions(bankAccounts).map(source => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
            <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              With an account chosen, the card is paid from it on the due date. Leave it on none if you pay it yourself.
            </p>
            {formData.connectedPaymentSource && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className={smallLabel}>Autopay pays
                  <select value={formData.autopayMode || 'statement'} onChange={(e) => setFormData({ ...formData, autopayMode: e.target.value })} className={inputClass}>
                    <option value="statement">The full balance</option>
                    <option value="minimum">The minimum payment</option>
                    <option value="fixed">A fixed amount</option>
                  </select>
                </label>
                {formData.autopayMode === 'fixed' && (
                  <label className={smallLabel}>Amount
                    <input type="number" step="0.01" inputMode="decimal" value={formData.autopayFixed} onChange={(e) => setFormData({ ...formData, autopayFixed: e.target.value })} className={inputClass} />
                  </label>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className={smallLabel}>Minimum payment
              <input type="number" step="0.01" inputMode="decimal" placeholder="From the statement" value={formData.minimumPayment} onChange={(e) => setFormData({ ...formData, minimumPayment: e.target.value })} className={inputClass} />
            </label>
            <label className={smallLabel}>Annual fee
              <input type="number" step="0.01" inputMode="decimal" placeholder="0.00" value={formData.annualFee} onChange={(e) => setFormData({ ...formData, annualFee: e.target.value })} className={inputClass} />
            </label>
            <label className={smallLabel}>Cash advance rate %
              <input type="number" step="0.01" inputMode="decimal" placeholder="Optional" value={formData.cashRate} onChange={(e) => setFormData({ ...formData, cashRate: e.target.value })} className={inputClass} />
            </label>
            <label className={smallLabel}>Promo rate %
              <input type="number" step="0.01" inputMode="decimal" placeholder="e.g. 0" value={formData.promoRate} onChange={(e) => setFormData({ ...formData, promoRate: e.target.value })} className={inputClass} />
            </label>
            {formData.promoRate !== '' && (
              <label className={smallLabel}>Promo ends
                <input type="date" value={formData.promoEnd} onChange={(e) => setFormData({ ...formData, promoEnd: e.target.value })} className={inputClass} />
              </label>
            )}
          </div>
        </>
      ) : (
        <GiftCardForm
          darkMode={darkMode}
          formData={formData}
          onFormDataChange={setFormData}
          bankAccounts={bankAccounts}
          creditCards={creditCards}
          recentGiftCards={recentGiftCards}
          onSelectGiftCard={onSelectGiftCard}
          giftCardNameInputRef={giftCardNameInputRef}
          editingItem={editingItem}
        />
      )}

      <div className={`flex gap-2${isEdit ? ' pt-2' : ''}`}>
        <ActionButton
          onClick={onSubmit}
          processing={submitting}
          variant="primary"
          processingText={isEdit ? 'Updating...' : editingItem ? 'Updating Card...' : 'Adding Card...'}
          idleText={isEdit || editingItem ? 'Update Card' : 'Add Card'}
          fullWidth
        />
        <ActionButton
          onClick={onCancel}
          variant="secondary"
          idleText="Cancel"
          fullWidth
        />
      </div>
    </>
  );
}
