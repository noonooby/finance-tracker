import { recordExpense } from '../../../utils/money';
import { logActivity } from '../../../utils/activityLogger';
import { formatCurrency } from '../../../utils/helpers';
import { showToast } from '../../../utils/toast';
import { saveGiftCardPurchaseContext } from '../../../utils/formContexts';

/**
 * Custom hook for handling gift card purchase transactions
 * Extracted from CreditCards.js to reduce file size
 * 
 * @param {Object} params
 * @param {Array} params.creditCards - All credit cards
 * @param {Array} params.bankAccounts - All bank accounts
 * @param {Function} params.onUpdateCash - Update total cash callback
 */
export function useGiftCardPurchase({
  creditCards,
  bankAccounts,
  onUpdateCash
}) {
  
  /**
   * Create purchase transaction when a new gift card is added
   * This handles payment from various sources (cash, bank, card, etc.)
   * 
   * @param {Object} savedCard - The saved gift card from database
   * @param {Object} formData - Form data with purchase details
   * @returns {Promise<Object>} Transaction details
   */
  const createGiftCardPurchaseTransaction = async (savedCard, formData) => {
    try {
      // Use the amount actually PAID, not the card's original value
      const purchaseAmountPaid = parseFloat(formData.purchaseAmountPaid) || parseFloat(formData.purchaseAmount) || 0;
      
      // Reconstruct payment method from type + ID
      const paymentMethodType = formData.giftCardPaymentMethod;
      const paymentMethodId = formData.giftCardPaymentMethodId;
      const paymentMethodRaw = String(paymentMethodId ? `${paymentMethodType}:${paymentMethodId}` : (paymentMethodType || ''));
      
      
      let sourceName;
      if (paymentMethodRaw === 'cash_in_hand') {
        sourceName = 'Cash in Hand';
      } else if (paymentMethodRaw.startsWith('bank_account:')) {
        sourceName = bankAccounts.find(a => a.id === paymentMethodId)?.name;
      } else if (paymentMethodRaw.startsWith('credit_card:')) {
        sourceName = creditCards.find(c => c.id === paymentMethodId)?.name;
      }
      if (!sourceName) {
        showToast.error('Selected payment method not found');
        return null;
      }

      // The gift card was saved with its value already, so only the payment leaves the source here.
      // The server refuses it if the source would go past its floor (bank overdraft, gift card value, cash).
      const res = await recordExpense({
        amount: purchaseAmountPaid,
        source: paymentMethodRaw,
        date: formData.purchaseDate,
        description: `Gift Card Purchase: ${formData.name}`,
        extra: { gift_card_id: savedCard?.id, payment_method_name: sourceName }
      }, { bankAccounts, creditCards });
      const transactionId = res.transaction?.id;
      if (onUpdateCash) await onUpdateCash(null, { syncOnly: true });

      // Log activity with enhanced description including source balance changes
      const originalValue = parseFloat(formData.purchaseAmount) || 0;
      await logActivity(
        'add',
        'card',
        savedCard?.id,
        formData.name,
        `Purchased gift card '${formData.name}' for ${formatCurrency(purchaseAmountPaid)} using ${sourceName}`,
        {
          amount: purchaseAmountPaid,
          originalValue,
          currentBalance: parseFloat(formData.balance) || 0,
          paymentMethod: sourceName,
          paymentMethodId: paymentMethodId || null,
          paymentMethodType: paymentMethodType,
          transactionId,
          giftCardId: savedCard?.id,
          isGiftCard: true
        }
      );
      
      // Save gift card purchase context (non-blocking)
      if (formData.name) {
        saveGiftCardPurchaseContext(formData.name, {
          originalValue: parseFloat(formData.purchaseAmount) || 0,
          purchaseAmount: purchaseAmountPaid,
          paymentSource: paymentMethodRaw,
          paymentSourceId: paymentMethodId
        }).catch(err => console.warn('Failed to save gift card context:', err));
      }

      
      return {
        transactionId,
        amount: purchaseAmountPaid,
        paymentMethod: sourceName
      };
      
    } catch (error) {
      console.error('Error creating gift card purchase transaction:', error);
      showToast.error(`Gift card added but its payment was not recorded: ${error.message}`);
      return null;
    }
  };

  return {
    createGiftCardPurchaseTransaction
  };
}
