import { dbOperation, updateBankAccountBalance } from '../../../utils/db';
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
 * @param {number} params.cashInHand - Current cash in hand balance
 * @param {Function} params.onUpdateCashInHand - Update cash in hand callback
 * @param {Function} params.onUpdateCash - Update total cash callback
 */
export function useGiftCardPurchase({
  creditCards,
  bankAccounts,
  cashInHand,
  onUpdateCashInHand,
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
      const paymentMethodRaw = paymentMethodId ? `${paymentMethodType}:${paymentMethodId}` : paymentMethodType;
      
      console.log('🎁 Creating gift card purchase transaction:');
      console.log('  Payment method type:', paymentMethodType);
      console.log('  Payment method ID:', paymentMethodId);
      console.log('  Payment method (combined):', paymentMethodRaw);
      console.log('  Amount paid:', purchaseAmountPaid);
      
      const transaction = {
        id: crypto.randomUUID(),
        type: 'expense',
        amount: purchaseAmountPaid,
        date: formData.purchaseDate,
        description: `Gift Card Purchase: ${formData.name}`,
        status: 'active',
        undone_at: null
      };
      
      // Handle different payment sources
      let sourceBalanceDetails = null;
      
      if (paymentMethodRaw === 'cash_in_hand') {
        transaction.payment_method = 'cash_in_hand';
        transaction.payment_method_id = null;
        transaction.payment_method_name = 'Cash in Hand';
        
        const currentCash = cashInHand || 0;
        if (purchaseAmountPaid > currentCash) {
          showToast.error(`Insufficient cash in hand. Available: ${formatCurrency(currentCash)}`);
          return null;
        }
        const newCash = currentCash - purchaseAmountPaid;
        if (onUpdateCashInHand) await onUpdateCashInHand(newCash);
        
        sourceBalanceDetails = {
          sourceName: 'Cash in Hand',
          previousBalance: currentCash,
          newBalance: newCash
        };
        
      } else if (paymentMethodRaw.startsWith('bank_account:')) {
        const bankAccountId = paymentMethodRaw.replace('bank_account:', '');
        const paymentAccount = bankAccounts.find(a => a.id === bankAccountId);
        
        if (!paymentAccount) {
          showToast.error('Selected bank account not found');
          return null;
        }
        
        const previousBalance = parseFloat(paymentAccount.balance) || 0;
        if (previousBalance < purchaseAmountPaid) {
          showToast.error(`Insufficient balance in ${paymentAccount.name}. Available: ${formatCurrency(paymentAccount.balance)}`);
          return null;
        }
        
        transaction.payment_method = 'bank_account';
        transaction.payment_method_id = bankAccountId;
        transaction.payment_method_name = paymentAccount.name;
        
        const newBalance = previousBalance - purchaseAmountPaid;
        await updateBankAccountBalance(bankAccountId, newBalance);
        await onUpdateCash(null, { syncOnly: true });
        
        sourceBalanceDetails = {
          sourceName: paymentAccount.name,
          previousBalance,
          newBalance
        };
        
      } else if (paymentMethodRaw.startsWith('credit_card:')) {
        const cardIdToCharge = paymentMethodRaw.replace('credit_card:', '');
        const paymentCard = creditCards.find(c => c.id === cardIdToCharge);
        
        if (!paymentCard) {
          showToast.error('Selected payment card not found');
          return null;
        }
        
        const previousBalance = parseFloat(paymentCard.balance) || 0;
        
        // If it's a gift card, check sufficient balance
        if (paymentCard.is_gift_card && previousBalance < purchaseAmountPaid) {
          showToast.error(`Insufficient balance on ${paymentCard.name}. Available: ${formatCurrency(paymentCard.balance)}`);
          return null;
        }
        
        transaction.payment_method = 'credit_card';
        transaction.payment_method_id = cardIdToCharge;
        transaction.payment_method_name = paymentCard.name;
        transaction.card_id = cardIdToCharge;
        
        // Gift cards: SUBTRACT. Credit cards: ADD
        const newBalance = paymentCard.is_gift_card
          ? previousBalance - purchaseAmountPaid
          : previousBalance + purchaseAmountPaid;
        
        await dbOperation('creditCards', 'put', {
          ...paymentCard,
          balance: Math.max(0, newBalance)
        }, { skipActivityLog: true });
        
        sourceBalanceDetails = {
          sourceName: paymentCard.name,
          previousBalance,
          newBalance,
          isGiftCard: paymentCard.is_gift_card
        };
      } else {
        // Fallback: Invalid payment method
        console.error('Invalid payment method:', paymentMethodRaw);
        showToast.error('Invalid payment method selected');
        return null;
      }
      
      // Validate transaction has required fields before saving
      if (!transaction.payment_method) {
        console.error('Transaction missing payment_method:', transaction);
        showToast.error('Transaction creation failed - missing payment method');
        return null;
      }
      
      // Save transaction to database
      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

      // Log activity with enhanced description including source balance changes
      const originalValue = parseFloat(formData.purchaseAmount) || 0;
      const balanceDetails = sourceBalanceDetails 
        ? ` - ${sourceBalanceDetails.sourceName} ${formatCurrency(sourceBalanceDetails.previousBalance)} → ${formatCurrency(sourceBalanceDetails.newBalance)}`
        : '';
      
      await logActivity(
        'add',
        'card',
        savedCard?.id,
        formData.name,
        `Purchased gift card '${formData.name}' for ${formatCurrency(purchaseAmountPaid)} using ${transaction.payment_method_name}${balanceDetails}`,
        {
          amount: purchaseAmountPaid,
          originalValue,
          currentBalance: parseFloat(formData.balance) || 0,
          paymentMethod: transaction.payment_method_name,
          paymentMethodId: transaction.payment_method_id,
          paymentMethodType: transaction.payment_method,
          sourceBalanceDetails,
          transactionId: savedTransaction?.id,
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

      console.log('✅ Gift card purchase transaction created');
      
      return {
        transactionId: savedTransaction?.id,
        amount: purchaseAmountPaid,
        paymentMethod: transaction.payment_method_name
      };
      
    } catch (error) {
      console.error('Error creating gift card purchase transaction:', error);
      showToast.error('Gift card added but transaction creation failed');
      return null;
    }
  };

  return {
    createGiftCardPurchaseTransaction
  };
}
