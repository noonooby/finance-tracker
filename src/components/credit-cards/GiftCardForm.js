import React, { useRef, useCallback } from 'react';
import { Gift } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';

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
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
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
                    ? 'bg-green-600 text-white'
                    : darkMode 
                      ? 'bg-green-900/30 text-green-200 hover:bg-green-800/50 border border-green-700'
                      : 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300'
                }`}
              >
                <Gift size={14} />
                {giftCard.card_name}
                {giftCard.usage_count > 10 && (
                  <span className="text-yellow-500">★</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Original Gift Card Value */}
      <div>
        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Original Gift Card Value *
        </label>
        <input
          ref={giftCardNameInputRef}
          type="number"
          step="0.01"
          placeholder="e.g., 50.00"
          value={formData.purchaseAmount}
          onChange={(e) => handleOriginalValueChange(e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          required
        />
        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          What is this gift card worth?
        </p>
      </div>

      {/* Purchase Amount Paid */}
      <div>
        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Purchase Amount Paid *
        </label>
        <input
          type="number"
          step="0.01"
          placeholder="e.g., 45.00"
          value={formData.purchaseAmountPaid}
          onChange={(e) => handlePurchaseAmountPaidChange(e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          required
        />
        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          How much did you actually pay? (defaults to original value)
        </p>
      </div>

      {/* Payment Source */}
      <div>
        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          How are you paying for this gift card? *
        </label>
        <select
          value={(() => {
            const val = formData.giftCardPaymentMethodId 
              ? `${formData.giftCardPaymentMethod}:${formData.giftCardPaymentMethodId}` 
              : formData.giftCardPaymentMethod;
            console.log('🔍 Select value:', val);
            console.log('  giftCardPaymentMethod:', formData.giftCardPaymentMethod);
            console.log('  giftCardPaymentMethodId:', formData.giftCardPaymentMethodId);
            return val;
          })()}
          onChange={(e) => {
            const value = e.target.value;
            console.log('💳 Payment method selected:', value);
            if (value === 'cash_in_hand') {
              console.log('  Setting to cash in hand');
              onFormDataChange({ 
                ...formData, 
                giftCardPaymentMethod: 'cash_in_hand',
                giftCardPaymentMethodId: null
              });
            } else if (value.includes(':')) {
              const [method, id] = value.split(':');
              console.log('  Parsed method:', method, 'ID:', id);
              onFormDataChange({ 
                ...formData, 
                giftCardPaymentMethod: method,  // Store ONLY the type
                giftCardPaymentMethodId: id      // Store ID separately
              });
            }
          }}
          className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
        >
          <option value="cash_in_hand">Cash in Hand</option>
          
          {bankAccounts && bankAccounts.length > 0 && (
            <optgroup label="Bank Accounts">
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
        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Purchase Date *
        </label>
        <input
          type="date"
          value={formData.purchaseDate}
          onChange={(e) => onFormDataChange({ ...formData, purchaseDate: e.target.value })}
          className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
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
          <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            This gift card has an expiry date
          </span>
        </label>
      </div>
      
      {/* Expiry Date Input */}
      {formData.hasExpiry && (
        <div>
          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Expiry Date *
          </label>
          <input
            type="date"
            value={formData.expiryDate}
            onChange={(e) => onFormDataChange({ ...formData, expiryDate: e.target.value })}
            className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
      )}
    </>
  );
}
