// Unified Transaction Hooks - Routes to specialized business logic based on transaction type

import { useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { dbOperation } from '../utils/db';
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

// Helper function to update bank account balance inline
async function updateBankAccountBalance(accountId, newBalance) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('bank_accounts')
    .update({
      balance: newBalance,
      updated_at: new Date().toISOString()
    })
    .eq('id', accountId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Transaction operations for AddTransaction modal
export function useTransactionOperations({
  creditCards,
  loans,
  reservedFunds,
  bankAccounts,
  cashInHand,
  onUpdateCashInHand,
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
        result = await processExpense(formData, {
          creditCards, bankAccounts, cashInHand, onUpdateCashInHand,
          availableCash, onUpdateCash, categories
        });
      } else if (formData.type === 'payment') {
        if (formData.paymentMethod === 'credit_card') {
          result = await processCardPayment(formData, {
            creditCards, reservedFunds, bankAccounts, cashInHand, 
            onUpdateCashInHand, availableCash, onUpdateCash
          });
        } else if (formData.paymentMethod === 'loan') {
          result = await processLoanPayment(formData, {
            loans, reservedFunds, bankAccounts, creditCards, cashInHand,
            onUpdateCashInHand, availableCash, onUpdateCash
          });
        }
      }

      if (result?.success) {
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
  }, [creditCards, loans, reservedFunds, bankAccounts, cashInHand, onUpdateCashInHand, availableCash, onUpdateCash, categories, onUpdate]);

  return { processTransaction, processing };
}

// Expense processing
async function processExpense(formData, { creditCards, bankAccounts, cashInHand, onUpdateCashInHand, categories }) {
  const amount = parseFloat(formData.amount);
  const category = categories?.find(c => c.id === formData.categoryId);
  
  const transaction = {
    type: 'expense',
    amount,
    date: formData.date,
    description: formData.description,
    notes: formData.notes,
    category_id: formData.categoryId || null,
    category_name: category?.name || null,
    payment_method: formData.paymentMethod,
    payment_method_id: formData.paymentMethodId,
    payment_method_name: null,
    card_id: null,
    status: 'active',
    undone_at: null
  };

  let activityDetails = null;
  let paymentMethodString = null;

  if (formData.paymentMethod === 'credit_card') {
    const card = creditCards?.find(c => c.id === formData.paymentMethodId);
    if (!card) throw new Error('Credit card not found');

    const previousBalance = card.balance;
    const newBalance = card.is_gift_card 
      ? Math.max(0, card.balance - amount)
      : card.balance + amount;

    await dbOperation('creditCards', 'put', {
      ...card,
      balance: newBalance
    }, { skipActivityLog: true });

    transaction.card_id = card.id;
    transaction.payment_method_name = card.name;
    paymentMethodString = `credit_card:${card.id}`;

    activityDetails = {
      actionType: 'expense',
      entityType: 'card',
      entityId: card.id,
      entityName: card.name,
      description: `Expense '${formData.description}' for ${formatCurrency(amount)} using '${card.name}' - Balance ${formatCurrency(previousBalance)} → ${formatCurrency(newBalance)}`,
      snapshot: {
        amount,
        category: category?.name,
        description: formData.description,
        cardId: card.id,
        previousBalance: previousBalance,
        paymentMethodName: card.name,
        isGiftCard: card.is_gift_card
      }
    };

  } else if (formData.paymentMethod === 'bank_account') {
    const account = bankAccounts?.find(a => a.id === formData.paymentMethodId);
    if (!account) throw new Error('Bank account not found');
    
    const currentBalance = Number(account.balance) || 0;
    const newBalance = currentBalance - amount;
    
    if (newBalance < 0) {
      if (!account.allows_overdraft) {
        throw new Error(
          `Insufficient funds in '${account.name}'.\nAvailable: ${formatCurrency(currentBalance)}\nRequired: ${formatCurrency(amount)}\n\nThis account does not allow overdraft.`
        );
      }
      
      const overdraftAmount = Math.abs(newBalance);
      if (overdraftAmount > (account.overdraft_limit || 0)) {
        throw new Error(
          `Insufficient funds in '${account.name}'.\nThis would exceed your overdraft limit.\n\nAvailable: ${formatCurrency(currentBalance)}\nOverdraft: ${formatCurrency(account.overdraft_limit)}\nTotal: ${formatCurrency(currentBalance + account.overdraft_limit)}\nRequired: ${formatCurrency(amount)}`
        );
      }
    }
    
    await updateBankAccountBalance(account.id, newBalance);
    transaction.payment_method_name = account.name;
    paymentMethodString = `bank_account:${account.id}`;
    
    activityDetails = {
      actionType: 'expense',
      entityType: 'bank_account',
      entityId: account.id,
      entityName: account.name,
      description: `Expense '${formData.description}' for ${formatCurrency(amount)} using '${account.name}' - Balance ${formatCurrency(currentBalance)} → ${formatCurrency(newBalance)}`,
      snapshot: {
        amount,
        category: category?.name,
        description: formData.description,
        accountId: account.id,
        previousBalance: currentBalance,
        newBalance,
        paymentMethodName: account.name
      }
    };

  } else if (formData.paymentMethod === 'cash_in_hand') {
    const currentCash = cashInHand || 0;
    if (amount > currentCash) {
      throw new Error(`Insufficient cash in hand.\nAvailable: ${formatCurrency(currentCash)}\nRequired: ${formatCurrency(amount)}`);
    }
    
    const newCash = currentCash - amount;
    await onUpdateCashInHand(newCash);
    
    transaction.payment_method_name = 'Cash in Hand';
    paymentMethodString = 'cash_in_hand';

    activityDetails = {
      actionType: 'expense',
      entityType: 'cash',
      entityId: 'cash-in-hand',
      entityName: 'Cash in Hand',
      description: `Expense '${formData.description}' for ${formatCurrency(amount)} using Cash in Hand - Balance ${formatCurrency(currentCash)} → ${formatCurrency(newCash)}`,
      snapshot: {
        amount,
        category: category?.name,
        description: formData.description,
        previousCash: currentCash,
        newCash,
        paymentMethodName: 'Cash in Hand'
      }
    };
  }

  const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

  if (activityDetails) {
    const snapshotWithTransaction = {
      ...(activityDetails.snapshot || {}),
      transactionId: savedTransaction?.id
    };
    await logActivity(
      activityDetails.actionType,
      activityDetails.entityType,
      activityDetails.entityId,
      activityDetails.entityName,
      activityDetails.description,
      snapshotWithTransaction
    );
  }

  if (formData.description) {
    saveExpenseContext(formData.description, {
      categoryId: formData.categoryId,
      paymentMethod: formData.paymentMethod,
      paymentMethodId: formData.paymentMethodId
    }).catch(console.warn);
  }

  return { 
    success: true, 
    transactionId: savedTransaction?.id,
    paymentMethodString,
    description: formData.description 
  };
}

// Card payment processing
async function processCardPayment(formData, { creditCards, reservedFunds, bankAccounts, cashInHand, onUpdateCashInHand, onUpdateCash }) {
  const card = creditCards?.find(c => c.id === formData.paymentMethodId);
  if (!card) throw new Error('Credit card not found');

  const amount = parseFloat(formData.amount);
  const [sourceType, sourceId] = formData.paymentSource?.includes(':') 
    ? formData.paymentSource.split(':') 
    : [formData.paymentSource || 'cash_in_hand', null];

  const previousBalance = card.balance;
  const newBalance = Math.max(0, card.balance - amount);
  
  await dbOperation('creditCards', 'put', {
    ...card,
    balance: newBalance,
    last_payment_date: formData.date,
    last_payment_amount: amount
  }, { skipActivityLog: true });

  let sourceName = 'Cash in Hand';
  let paymentMethod = 'cash_in_hand';
  let paymentMethodId = null;

  if (sourceType === 'cash_in_hand') {
    const currentCash = cashInHand || 0;
    if (amount > currentCash) {
      throw new Error(`Insufficient cash in hand. Available: ${formatCurrency(currentCash)}`);
    }
    const newCash = currentCash - amount;
    await onUpdateCashInHand(newCash);
    sourceName = 'Cash in Hand';

  } else if (sourceType === 'bank_account' && sourceId) {
    const account = bankAccounts?.find(a => a.id === sourceId);
    if (!account) throw new Error('Bank account not found');
    
    const currentBalance = Number(account.balance) || 0;
    if (amount > currentBalance) {
      throw new Error(`Insufficient funds in ${account.name}. Available: ${formatCurrency(currentBalance)}`);
    }
    
    await updateBankAccountBalance(account.id, currentBalance - amount);
    await onUpdateCash(null, { syncOnly: true });
    sourceName = account.name;
    paymentMethod = 'bank_account';
    paymentMethodId = account.id;

  } else if (sourceType === 'reserved_fund' && sourceId) {
    const fund = reservedFunds?.find(f => f.id === sourceId);
    if (!fund) throw new Error('Reserved fund not found');
    
    const fundAmount = Number(fund.amount) || 0;
    if (amount > fundAmount) {
      throw new Error(`Insufficient funds in ${fund.name}. Available: ${formatCurrency(fundAmount)}`);
    }
    
    await dbOperation('reservedFunds', 'put', {
      ...fund,
      amount: fundAmount - amount,
      last_paid_date: formData.date
    }, { skipActivityLog: true });
    sourceName = fund.name;
    paymentMethod = 'reserved_fund';
    paymentMethodId = fund.id;
  }

  const transaction = {
    type: 'payment',
    card_id: card.id,
    amount,
    date: formData.date,
    category_id: formData.category || 'credit_card_payment',
    category_name: 'Credit Card Payment',
    payment_method: paymentMethod,
    payment_method_id: paymentMethodId,
    payment_method_name: sourceName,
    description: `Payment for '${card.name}' from ${sourceName}`,
    status: 'active',
    undone_at: null
  };

  const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

  await logActivity(
    'payment',
    'card',
    card.id,
    card.name,
    `Made payment of ${formatCurrency(amount)} for '${card.name}' from ${sourceName} - Balance ${formatCurrency(previousBalance)} → ${formatCurrency(newBalance)}`,
    {
      entity: { ...card, id: card.id, name: card.name },
      paymentAmount: amount,
      date: formData.date,
      previousBalance: previousBalance,
      paymentSource: sourceType,
      paymentSourceId: sourceId,
      paymentSourceName: sourceName,
      paymentMethodName: card.name,
      transactionId: savedTransaction?.id,
      isManualPayment: true
    }
  );

  saveCardPaymentContext(card.id, {
    paymentSource: sourceType,
    paymentSourceId: sourceId,
    amountMode: formData.amountMode
  }).catch(console.warn);

  return { 
    success: true, 
    transactionId: savedTransaction?.id,
    cardName: card.name,
    amount 
  };
}

// Loan payment processing
async function processLoanPayment(formData, { loans, reservedFunds, bankAccounts, creditCards, cashInHand, onUpdateCashInHand, onUpdateCash }) {
  const loan = loans?.find(l => l.id === formData.paymentMethodId);
  if (!loan) throw new Error('Loan not found');

  const amount = parseFloat(formData.amount);
  const [sourceType, sourceId] = formData.paymentSource?.includes(':') 
    ? formData.paymentSource.split(':') 
    : [formData.paymentSource || 'cash_in_hand', null];

  const previousBalance = loan.balance;
  const newBalance = Math.max(0, loan.balance - amount);
  
  const { predictNextDate } = await import('../utils/helpers');
  let nextPaymentDate = loan.next_payment_date;
  if (loan.frequency && loan.frequency !== 'onetime') {
    nextPaymentDate = predictNextDate(loan.next_payment_date, loan.frequency);
    
    let occurrencesCompleted = (loan.recurring_occurrences_completed || 0) + 1;
    if (loan.recurring_duration_type === 'occurrences' && 
        loan.recurring_occurrences_total && 
        occurrencesCompleted >= loan.recurring_occurrences_total) {
      nextPaymentDate = null;
    }
  }
  
  await dbOperation('loans', 'put', {
    ...loan,
    balance: newBalance,
    next_payment_date: nextPaymentDate,
    last_payment_date: formData.date,
    last_payment_amount: amount,
    recurring_occurrences_completed: loan.frequency && loan.frequency !== 'onetime' 
      ? (loan.recurring_occurrences_completed || 0) + 1 
      : loan.recurring_occurrences_completed
  }, { skipActivityLog: true });

  let sourceName = 'Cash in Hand';
  let paymentMethod = 'cash_in_hand';
  let paymentMethodId = null;

  if (sourceType === 'cash_in_hand') {
    const currentCash = cashInHand || 0;
    if (amount > currentCash) {
      throw new Error(`Insufficient cash in hand. Available: ${formatCurrency(currentCash)}`);
    }
    const newCash = currentCash - amount;
    await onUpdateCashInHand(newCash);
    sourceName = 'Cash in Hand';

  } else if (sourceType === 'bank_account' && sourceId) {
    const account = bankAccounts?.find(a => a.id === sourceId);
    if (!account) throw new Error('Bank account not found');
    
    const currentBalance = Number(account.balance) || 0;
    if (amount > currentBalance) {
      throw new Error(`Insufficient funds in ${account.name}. Available: ${formatCurrency(currentBalance)}`);
    }
    
    await updateBankAccountBalance(account.id, currentBalance - amount);
    await onUpdateCash(null, { syncOnly: true });
    sourceName = account.name;
    paymentMethod = 'bank_account';
    paymentMethodId = account.id;

  } else if (sourceType === 'reserved_fund' && sourceId) {
    const fund = reservedFunds?.find(f => f.id === sourceId);
    if (!fund) throw new Error('Reserved fund not found');
    
    const fundAmount = Number(fund.amount) || 0;
    if (amount > fundAmount) {
      throw new Error(`Insufficient funds in ${fund.name}. Available: ${formatCurrency(fundAmount)}`);
    }
    
    await dbOperation('reservedFunds', 'put', {
      ...fund,
      amount: fundAmount - amount,
      last_paid_date: formData.date
    }, { skipActivityLog: true });
    sourceName = fund.name;
    paymentMethod = 'reserved_fund';
    paymentMethodId = fund.id;

  } else if (sourceType === 'credit_card' && sourceId) {
    const paymentCard = creditCards?.find(c => c.id === sourceId);
    if (!paymentCard) throw new Error('Payment card not found');
    
    const cardPreviousBalance = paymentCard.balance;
    const cardNewBalance = paymentCard.balance + amount;
    
    await dbOperation('creditCards', 'put', {
      ...paymentCard,
      balance: cardNewBalance
    }, { skipActivityLog: true });
    
    sourceName = paymentCard.name;
    paymentMethod = 'credit_card';
    paymentMethodId = paymentCard.id;
  }

  const transaction = {
    type: 'payment',
    loan_id: loan.id,
    amount,
    date: formData.date,
    category_id: formData.category || 'loan_payment',
    category_name: 'Loan Payment',
    payment_method: paymentMethod,
    payment_method_id: paymentMethodId,
    payment_method_name: sourceName,
    description: `Payment for '${loan.name}' from ${sourceName}`,
    status: 'active',
    undone_at: null
  };

  const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

  await logActivity(
    'payment',
    'loan',
    loan.id,
    loan.name,
    `Made payment of ${formatCurrency(amount)} for '${loan.name}' from ${sourceName} - Balance ${formatCurrency(previousBalance)} → ${formatCurrency(newBalance)}`,
    {
      entity: { ...loan, id: loan.id, name: loan.name },
      paymentAmount: amount,
      date: formData.date,
      previousBalance: previousBalance,
      newBalance: newBalance,
      paymentSource: sourceType,
      paymentSourceId: sourceId,
      paymentSourceName: sourceName,
      paymentMethodName: loan.name,
      transactionId: savedTransaction?.id,
      nextPaymentDate: nextPaymentDate
    }
  );

  saveLoanPaymentContext(loan.id, {
    paymentSource: sourceType,
    paymentSourceId: sourceId,
    amountMode: formData.amountMode
  }).catch(console.warn);

  return { 
    success: true, 
    transactionId: savedTransaction?.id,
    loanName: loan.name,
    amount 
  };
}
