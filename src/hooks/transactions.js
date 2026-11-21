// Unified Transaction Hooks - Routes to specialized business logic based on transaction type

import { useState, useCallback } from 'react';
import { recordExpense, recordCardPayment, recordLoanPayment } from '../utils/money';
import { logActivity } from '../utils/activityLogger';
import { formatCurrency } from '../utils/helpers';
import {
  addRecentTransaction,
  addRecentCategory, 
  addRecentPaymentMethod
} from '../utils/userPreferencesManager';
import {
  saveExpenseContext,
  saveCardPaymentContext,
  saveLoanPaymentContext
} from '../utils/formContexts';

// Re-export income hooks from the transactions folder
export { useIncomeOperations, useIncomeContexts, useIncomeValidation, useIncomePredictions } from './transactions/index';

// Transaction operations for AddTransaction modal
export function useTransactionOperations({
  creditCards,
  loans,
  bankAccounts,
  availableCash,
  onUpdateCash,
  categories,
  onUpdate
}) {
  const [processing, setProcessing] = useState(false);

  const processTransaction = useCallback(async (formData) => {
    setProcessing(true);
    try {
      let result;
      
      if (formData.type === 'expense') {
        result = await processExpense(formData, { creditCards, bankAccounts, categories });
      } else if (formData.type === 'payment') {
        if (formData.paymentMethod === 'credit_card') {
          result = await processCardPayment(formData, { creditCards, bankAccounts, loans });
        } else if (formData.paymentMethod === 'loan') {
          result = await processLoanPayment(formData, { loans, bankAccounts, creditCards });
        }
      }

      if (result?.success) {
        // Balances changed on the server; reload them rather than setting figures here.
        if (onUpdateCash) await onUpdateCash(null, { syncOnly: true });
        await onUpdate();
        
        if (result.transactionId) {
          addRecentTransaction(result.transactionId).catch(console.warn);
        }
        if (formData.categoryId) {
          addRecentCategory(formData.categoryId).catch(console.warn);
        }
        if (result.paymentMethodString) {
          addRecentPaymentMethod(result.paymentMethodString).catch(console.warn);
        }
      }

      return result;
    } catch (error) {
      console.error('Transaction processing error:', error);
      return { success: false, error: error.message };
    } finally {
      setProcessing(false);
    }
  }, [creditCards, loans, bankAccounts, onUpdateCash, categories, onUpdate]);

  return { processTransaction, processing };
}

// Expense processing
async function processExpense(formData, { creditCards, bankAccounts, categories }) {
  const amount = parseFloat(formData.amount);
  const category = categories?.find(c => c.id === formData.categoryId);
  const method = formData.paymentMethod;
  const source = `${method}:${formData.paymentMethodId}`;

  let entity;
  if (method === 'credit_card') {
    const card = creditCards?.find(c => c.id === formData.paymentMethodId);
    if (!card) throw new Error('Credit card not found');
    entity = { type: 'card', id: card.id, name: card.name, snap: { cardId: card.id, previousBalance: card.balance, isGiftCard: card.is_gift_card } };
  } else if (method === 'bank_account') {
    const account = bankAccounts?.find(a => a.id === formData.paymentMethodId);
    if (!account) throw new Error('Bank account not found');
    entity = { type: 'bank_account', id: account.id, name: account.name, snap: { accountId: account.id, previousBalance: Number(account.balance) || 0 } };
  } else {
    throw new Error('Choose how it was paid.');
  }

  // The server applies the change and refuses it if it would pass the account's floor (overdraft, gift card value, cash).
  const res = await recordExpense({
    amount,
    source,
    date: formData.date,
    description: formData.description,
    notes: formData.notes,
    category_id: formData.categoryId || null,
    category_name: category?.name || null,
    extra: formData.extra
  }, { bankAccounts, creditCards });
  const transactionId = res.transaction?.id;

  await logActivity(
    'expense',
    entity.type,
    entity.id,
    entity.name,
    `Expense '${formData.description}' for ${formatCurrency(amount)} using '${entity.name}'`,
    {
      amount,
      category: category?.name,
      description: formData.description,
      paymentMethodName: entity.name,
      ...entity.snap,
      transactionId
    }
  );

  if (formData.description) {
    saveExpenseContext(formData.description, {
      categoryId: formData.categoryId,
      paymentMethod: formData.paymentMethod,
      paymentMethodId: formData.paymentMethodId
    }).catch(console.warn);
  }

  return {
    success: true,
    transactionId,
    paymentMethodString: source,
    description: formData.description
  };
}

// Where a payment comes from: the money.js source and its display name.
function paymentSourceOf(formData, { bankAccounts, creditCards }) {
  const [sourceType, sourceId] = formData.paymentSource?.includes(':')
    ? formData.paymentSource.split(':')
    : [formData.paymentSource || '', null];
  if (sourceType === 'bank_account' && sourceId) {
    const account = bankAccounts?.find(a => a.id === sourceId);
    if (!account) throw new Error('Bank account not found');
    return { sourceType, sourceId, source: `bank_account:${sourceId}`, sourceName: account.name };
  }
  if (sourceType === 'credit_card' && sourceId) {
    const card = creditCards?.find(c => c.id === sourceId);
    if (!card) throw new Error('Payment card not found');
    return { sourceType, sourceId, source: `credit_card:${sourceId}`, sourceName: card.name };
  }
  throw new Error('Choose the account it is paid from.');
}

// Card payment processing
async function processCardPayment(formData, { creditCards, bankAccounts, loans }) {
  const card = creditCards?.find(c => c.id === formData.paymentMethodId);
  if (!card) throw new Error('Credit card not found');

  const amount = parseFloat(formData.amount);
  const { sourceType, sourceId, source, sourceName } = paymentSourceOf(formData, { bankAccounts, creditCards });

  const res = await recordCardPayment({
    cardId: card.id,
    amount,
    source,
    date: formData.date,
    description: `Payment for '${card.name}' from ${sourceName}`,
    updates: [{ table: 'credit_cards', id: card.id, values: { last_payment_date: formData.date, last_payment_amount: amount } }],
    extra: {
      type: 'payment',
      category_id: formData.category || 'credit_card_payment',
      category_name: 'Credit Card Payment',
      payment_method_name: sourceName
    }
  }, { bankAccounts, creditCards, loans });
  const transactionId = res.transaction?.id;

  await logActivity(
    'payment',
    'card',
    card.id,
    card.name,
    `Made payment of ${formatCurrency(amount)} for '${card.name}' from ${sourceName}`,
    {
      entity: { ...card, id: card.id, name: card.name },
      paymentAmount: amount,
      date: formData.date,
      previousBalance: card.balance,
      paymentSource: sourceType,
      paymentSourceId: sourceId,
      paymentSourceName: sourceName,
      paymentMethodName: card.name,
      transactionId,
      isManualPayment: true
    }
  );

  saveCardPaymentContext(card.id, {
    paymentSource: sourceType,
    paymentSourceId: sourceId,
    amountMode: formData.amountMode
  }).catch(console.warn);

  return { success: true, transactionId, cardName: card.name, amount };
}

// Loan payment processing
async function processLoanPayment(formData, { loans, bankAccounts, creditCards }) {
  const loan = loans?.find(l => l.id === formData.paymentMethodId);
  if (!loan) throw new Error('Loan not found');

  const amount = parseFloat(formData.amount);
  const { sourceType, sourceId, source, sourceName } = paymentSourceOf(formData, { bankAccounts, creditCards });

  const { predictNextDate } = await import('../utils/helpers');
  const recurring = loan.frequency && loan.frequency !== 'onetime';
  let nextPaymentDate = loan.next_payment_date;
  if (recurring) {
    nextPaymentDate = predictNextDate(loan.next_payment_date, loan.frequency);
    const occurrencesCompleted = (loan.recurring_occurrences_completed || 0) + 1;
    if (loan.recurring_duration_type === 'occurrences' &&
        loan.recurring_occurrences_total &&
        occurrencesCompleted >= loan.recurring_occurrences_total) {
      nextPaymentDate = null;
    }
  }

  const res = await recordLoanPayment({
    loanId: loan.id,
    amount,
    source,
    date: formData.date,
    description: `Payment for '${loan.name}' from ${sourceName}`,
    updates: [{
      table: 'loans', id: loan.id, values: {
        next_payment_date: nextPaymentDate,
        last_payment_date: formData.date,
        last_payment_amount: amount,
        recurring_occurrences_completed: recurring
          ? (loan.recurring_occurrences_completed || 0) + 1
          : loan.recurring_occurrences_completed
      }
    }],
    extra: {
      type: 'payment',
      category_id: formData.category || 'loan_payment',
      category_name: 'Loan Payment',
      payment_method_name: sourceName
    }
  }, { bankAccounts, creditCards, loans });
  const transactionId = res.transaction?.id;

  await logActivity(
    'payment',
    'loan',
    loan.id,
    loan.name,
    `Made payment of ${formatCurrency(amount)} for '${loan.name}' from ${sourceName}`,
    {
      entity: { ...loan, id: loan.id, name: loan.name },
      paymentAmount: amount,
      date: formData.date,
      previousBalance: loan.balance,
      paymentSource: sourceType,
      paymentSourceId: sourceId,
      paymentSourceName: sourceName,
      paymentMethodName: loan.name,
      transactionId,
      nextPaymentDate
    }
  );

  saveLoanPaymentContext(loan.id, {
    paymentSource: sourceType,
    paymentSourceId: sourceId,
    amountMode: formData.amountMode
  }).catch(console.warn);

  return { success: true, transactionId, loanName: loan.name, amount };
}
