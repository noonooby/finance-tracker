/**
 * GIFT CARD TRANSACTION DUPLICATION DEBUG
 * 
 * This file contains debugging utilities to identify why "Add Transaction" 
 * creates duplicate transactions for gift cards while "Use Balance" doesn't.
 * 
 * HOW TO USE:
 * 1. Add the debugging code below to AddTransaction.js
 * 2. Test both flows and compare the console logs
 * 3. Check the database directly to see duplicate records
 */

// ADD THIS TO AddTransaction.js around line 595 (credit card expense handling):

const debugGiftCardTransaction = async (stage, data) => {
  if (formData.paymentMethod === 'credit_card' && card?.is_gift_card) {
    console.log(`🐛 [GIFT CARD DEBUG - ${stage}]`, {
      timestamp: new Date().toISOString(),
      stage,
      cardId: card?.id,
      cardName: card?.name,
      amount,
      formData: {
        type: formData.type,
        paymentMethod: formData.paymentMethod,
        paymentMethodId: formData.paymentMethodId
      },
      ...data
    });
  }
};

// REPLACE the existing credit card handling section with this debug version:

if (formData.paymentMethod === 'credit_card') {
  const card = creditCards.find(c => c.id === formData.paymentMethodId);
  if (!card) {
    showToast.error('Please select a credit card');
    setSaving(false);
    return;
  }

  await debugGiftCardTransaction('CARD_FOUND', { card });

  const previousCardBalance = card.balance;
  
  // Gift cards: SUBTRACT (spend). Credit cards: ADD (charge)
  const newCardBalance = card.is_gift_card 
    ? card.balance - amount  // Gift card spending reduces balance
    : card.balance + amount; // Credit card charging increases balance

  await debugGiftCardTransaction('BALANCE_CALCULATED', { 
    previousCardBalance, 
    newCardBalance 
  });

  await dbOperation('creditCards', 'put', {
    ...card,
    balance: Math.max(0, newCardBalance)
  }, { skipActivityLog: true });

  await debugGiftCardTransaction('CARD_UPDATED', { 
    newBalance: Math.max(0, newCardBalance) 
  });

  transaction.card_id = card.id;
  transaction.payment_method_name = card.name;
  paymentMethodString = `credit_card:${card.id}`;

  await debugGiftCardTransaction('TRANSACTION_PREPARED', { 
    transaction: { ...transaction } 
  });

  activityDetails = {
    actionType: 'expense',
    entityType: 'card',
    entityId: card.id,
    entityName: card.name,
    description: `Expense '${formData.description}' for ${formatCurrency(amount)} using '${card.name}' - Balance ${formatCurrency(previousCardBalance)} → ${formatCurrency(newCardBalance)}`,
    snapshot: {
      amount,
      category: category?.name,
      description: formData.description,
      cardId: card.id,
      previousBalance: previousCardBalance,
      paymentMethodName: card.name,
      isGiftCard: card.is_gift_card
    }
  };

  await debugGiftCardTransaction('ACTIVITY_DETAILS_SET', { activityDetails });
}

// ALSO ADD THIS around line 701 (after transaction creation):

const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

await debugGiftCardTransaction('TRANSACTION_SAVED', { 
  savedTransactionId: savedTransaction?.id,
  transactionObject: { ...transaction }
});

// ... rest of the code

if (activityDetails) {
  const snapshotWithTransaction = {
    ...(activityDetails.snapshot || {}),
    transactionId: savedTransaction?.id
  };
  
  await debugGiftCardTransaction('BEFORE_LOG_ACTIVITY', { 
    snapshotWithTransaction,
    activityDetails 
  });
  
  await logActivity(
    activityDetails.actionType,
    activityDetails.entityType,
    activityDetails.entityId,
    activityDetails.entityName,
    activityDetails.description,
    snapshotWithTransaction
  );
  
  await debugGiftCardTransaction('AFTER_LOG_ACTIVITY', { 
    activityLogged: true 
  });
}

/**
 * DATABASE QUERY TO CHECK FOR DUPLICATES:
 * 
 * Run this in Supabase SQL editor after testing:
 * 
 * SELECT 
 *   id, 
 *   type, 
 *   amount, 
 *   description, 
 *   card_id, 
 *   payment_method, 
 *   payment_method_id,
 *   created_at,
 *   status
 * FROM transactions 
 * WHERE card_id IS NOT NULL 
 *   AND type = 'expense'
 *   AND status = 'active'
 * ORDER BY created_at DESC 
 * LIMIT 20;
 * 
 * Look for:
 * 1. Two transactions with same card_id, amount, and similar created_at times
 * 2. Different transaction IDs but identical other fields
 * 3. Any patterns in the duplicate records
 */

/**
 * COMPARISON TEST PROCEDURE:
 * 
 * 1. Test "Use Balance" flow:
 *    - Go to gift card → click "Manage Balance" → "Use Balance" 
 *    - Enter amount, category, notes
 *    - Check console logs (should show clean single transaction)
 * 
 * 2. Test "Add Transaction" flow:
 *    - Click "+" → "Expense" → select gift card as payment method
 *    - Enter same amount, category, description 
 *    - Check console logs (should show where duplicates occur)
 * 
 * 3. Compare database records:
 *    - Run the SQL query above
 *    - Count how many transactions each flow created
 * 
 * 4. Check undo behavior:
 *    - Try undoing both transactions
 *    - See which one properly reverses vs which leaves orphaned records
 */