import React, { useCallback } from 'react';
import { Gift } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import { localDate } from '../../utils/helpers';

/**
 * Gift Card Form Component
 * Renders the form fields specific to gift cards
 * Extracted from CreditCards.js for modularity
 */
export default function GiftCardForm({
  darkMode,
  formData,
  onFormDataChange,
  bankAccounts,
  creditCards,
  recentGiftCards,
  onSelectGiftCard,
  giftCardNameInputRef,
  editingItem
}) {
  
  // Track if user manually edited purchase amount paid
  const [manuallyEditedPaid, setManuallyEditedPaid] = React.useState(false);
  
  // Auto-fill purchase amount paid when original value changes
  const handleOriginalValueChange = useCallback((value) => {
    const updates = {
      ...formData,
      purchaseAmount: value
    };
    
    // Only auto-fill if user hasn't manually edited it
    if (!manuallyEditedPaid) {
      updates.purchaseAmountPaid = value;
    }
    
    onFormDataChange(updates);
  }, [formData, onFormDataChange, manuallyEditedPaid]);
  
  // Handle manual edit of purchase amount paid
  const handlePurchaseAmountPaidChange = useCallback((value) => {
    setManuallyEditedPaid(true);
    onFormDataChange({
      ...formData,
      purchaseAmountPaid: value
    });
  }, [formData, onFormDataChange]);

  return (
    <>
      {/* Quick-Select Buttons for Recent Gift Cards */}
      {recentGiftCards.length > 0 && !editingItem && (
        <div>
          <label className={`block text-sm font-medium mb-2 text-fg`}>
            Recent Gift Cards
          </label>
          <div className="flex gap-2 flex-wrap">
            {recentGiftCards.map(giftCard => (
              <button
                key={giftCard.id || giftCard.card_name}
                type="button"
                onClick={() => onSelectGiftCard(giftCard)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  formData.name === giftCard.card_name
                    ? 'press bg-accent text-accent-contrast'
                    : 'bg-positive/10 text-positive hover:bg-positive/10 border border-positive/30'
                }`}
              >
                <Gift size={14} />
                {giftCard.card_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Original Gift Card Value */}
      <div>
        <label className={`block text-sm font-medium mb-1 text-fg`}>
          Original Gift Card Value *
        </label>
        <input
          ref={giftCardNameInputRef}
          type="number"
          step="0.01"
          placeholder="e.g., 50.00"
          value={formData.purchaseAmount}
          onChange={(e) => handleOriginalValueChange(e.target.value)}
          className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
          required
        />
        <p className={`text-xs mt-1 text-muted`}>
          What is this gift card worth?
        </p>
      </div>

      {/* Purchase Amount Paid */}
      <div>
        <label className={`block text-sm font-medium mb-1 text-fg`}>
          Purchase Amount Paid *
        </label>
        <input
          type="number"
          step="0.01"
          placeholder="e.g., 45.00"
          value={formData.purchaseAmountPaid}
          onChange={(e) => handlePurchaseAmountPaidChange(e.target.value)}
          className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
          required
        />
        <p className={`text-xs mt-1 text-muted`}>
          How much did you actually pay? (defaults to original value)
        </p>
      </div>

      {/* Payment Source */}
      <div>
        <label className={`block text-sm font-medium mb-1 text-fg`}>
          How are you paying for this gift card? *
        </label>
        <select
          value={formData.giftCardPaymentMethodId 
            ? `${formData.giftCardPaymentMethod}:${formData.giftCardPaymentMethodId}` 
            : ''}
          onChange={(e) => {
            const value = e.target.value;
            if (!value.includes(':')) {
              onFormDataChange({ ...formData, giftCardPaymentMethod: '', giftCardPaymentMethodId: null });
            } else {
              const [method, id] = value.split(':');
              onFormDataChange({ 
                ...formData, 
                giftCardPaymentMethod: method,  // Store ONLY the type
                giftCardPaymentMethodId: id      // Store ID separately
              });
            }
          }}
          className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
        >
          <option value="">Choose how you paid</option>
          
          {bankAccounts && bankAccounts.length > 0 && (
            <optgroup label="Accounts">
              {bankAccounts.map(account => (
                <option key={account.id} value={`bank_account:${account.id}`}>
                  {account.name} ({formatCurrency(account.balance)} available)
                </option>
              ))}
            </optgroup>
          )}
          
          {creditCards && creditCards.filter(c => !c.is_gift_card).length > 0 && (
            <optgroup label="Credit Cards">
              {creditCards.filter(card => !card.is_gift_card).map(card => (
                <option key={card.id} value={`credit_card:${card.id}`}>
                  {card.name}
                </option>
              ))}
            </optgroup>
          )}
          
          {creditCards && creditCards.filter(c => c.is_gift_card && c.balance > 0).length > 0 && (
            <optgroup label="Gift Cards">
              {creditCards.filter(card => card.is_gift_card && card.balance > 0).map(card => (
                <option key={card.id} value={`credit_card:${card.id}`}>
                  {card.name} ({formatCurrency(card.balance)} available)
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      
      {/* Purchase Date */}
      <div>
        <label className={`block text-sm font-medium mb-1 text-fg`}>
          Purchase Date *
        </label>
        <input
          type="date"
          value={formData.purchaseDate}
          onChange={(e) => onFormDataChange({ ...formData, purchaseDate: e.target.value })}
          className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
        />
      </div>
      
      {/* Expiry Date Toggle */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.hasExpiry}
            onChange={(e) => onFormDataChange({ 
              ...formData, 
              hasExpiry: e.target.checked,
              expiryDate: e.target.checked ? formData.expiryDate : ''
            })}
            className="w-4 h-4"
          />
          <span className={`text-sm text-muted`}>
            This gift card has an expiry date
          </span>
        </label>
      </div>
      
      {/* Expiry Date Input */}
      {formData.hasExpiry && (
        <div>
          <label className={`block text-sm font-medium mb-1 text-fg`}>
            Expiry Date *
          </label>
          <input
            type="date"
            value={formData.expiryDate}
            onChange={(e) => onFormDataChange({ ...formData, expiryDate: e.target.value })}
            className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
            min={localDate()}
          />
        </div>
      )}
    </>
  );
}
