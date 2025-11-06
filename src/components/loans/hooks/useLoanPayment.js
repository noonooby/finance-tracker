import { useState, useCallback } from 'react';
import { dbOperation, updateBankAccountBalance } from '../../../utils/db';
import { logActivity } from '../../../utils/activityLogger';
import { formatCurrency, predictNextDate } from '../../../utils/helpers';
import { saveLoanPaymentContext } from '../../../utils/formContexts';

/**
 * Payment Validation Hook
 */
const usePaymentValidation = () => {
  const validatePayment = useCallback((loan, paymentAmount, sourceType, sourceId, sourceData) => {
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return { valid: false, error: 'Please enter a valid payment amount' };
    }

    const loanBalance = parseFloat(loan.balance) || 0;
    if (paymentAmount > loanBalance + 0.01) {
      return { 
        valid: false, 
        error: `Payment amount (${formatCurrency(paymentAmount)}) exceeds balance (${formatCurrency(loanBalance)})`,
        warning: true
      };
    }

    if (sourceType === 'bank_account') {
      const account = sourceData;
      const currentBalance = parseFloat(account?.balance) || 0;
      if (paymentAmount > currentBalance) {
        return { 
          valid: false, 
          error: `Insufficient funds in ${account?.name}. Available: ${formatCurrency(currentBalance)}` 
        };
      }
    } else if (sourceType === 'cash_in_hand') {
      const currentCash = sourceData || 0;
      if (paymentAmount > currentCash) {
        return { 
          valid: false, 
          error: `Insufficient cash in hand. Available: ${formatCurrency(currentCash)}` 
        };
      }
    }

    return { valid: true, error: null };
  }, []);

  return { validatePayment };
};

/**
 * Payment Source Handler Hook
 */
const usePaymentSourceHandler = () => {
  const processBankAccountPayment = useCallback(async (account, paymentAmount, paymentDate) => {
    const currentBalance = parseFloat(account.balance) || 0;
    const updatedBalance = Math.max(0, currentBalance - paymentAmount);
    
    await updateBankAccountBalance(account.id, updatedBalance);

    return {
      paymentMethod: 'bank_account',
      paymentMethodId: account.id,
      paymentMethodName: account.name,
      sourceName: account.name,
      bankAdjustments: [{
        accountId: account.id,
        accountName: account.name,
        previousBalance: currentBalance,
        newBalance: updatedBalance,
        amount: paymentAmount
      }]
    };
  }, []);

  const processCreditCardPayment = useCallback(async (card, paymentAmount, paymentDate) => {
    const currentBalance = parseFloat(card.balance) || 0;
    const updatedCard = { ...card, balance: currentBalance + paymentAmount };
    
    await dbOperation('creditCards', 'put', updatedCard, { skipActivityLog: true });

    return {
      paymentMethod: 'credit_card',
      paymentMethodId: card.id,
      paymentMethodName: card.name,
      sourceName: card.name,
      cardEffect: {
        cardId: card.id,
        previousBalance: currentBalance,
        newBalance: currentBalance + paymentAmount,
        delta: paymentAmount
      }
    };
  }, []);

  const processCashInHandPayment = useCallback(async (cashInHand, paymentAmount, onUpdateCashInHand) => {
    const currentCash = cashInHand || 0;
    const newCashInHand = currentCash - paymentAmount;
    
    if (onUpdateCashInHand) await onUpdateCashInHand(newCashInHand);

    return {
      paymentMethod: 'cash_in_hand',
      paymentMethodId: null,
      paymentMethodName: 'Cash in Hand',
      sourceName: 'cash in hand',
      cashEffect: {
        previousCash: currentCash,
        newCash: newCashInHand
      }
    };
  }, []);

  const processCashPayment = useCallback(async (availableCash, paymentAmount, onUpdateCash) => {
    const newCash = availableCash - paymentAmount;
    await onUpdateCash(newCash);

    return {
      paymentMethod: 'cash',
      paymentMethodId: null,
      paymentMethodName: 'Cash',
      sourceName: 'cash'
    };
  }, []);

  return {
    processBankAccountPayment,
    processCreditCardPayment,
    processCashInHandPayment,
    processCashPayment
  };
};

/**
 * Transaction Creator Hook
 */
const useTransactionCreator = () => {
  const createPaymentTransaction = useCallback(async (loan, paymentAmount, paymentDate, paymentResult, categoryId) => {
    const transaction = {
      type: 'payment',
      loan_id: loan.id,
      card_id: paymentResult.cardEffect ? paymentResult.cardEffect.cardId : null,
      amount: paymentAmount,
      date: paymentDate,
      category_id: categoryId || 'loan_payment',
      category_name: 'Loan Payment',
      payment_method: paymentResult.paymentMethod,
      payment_method_id: paymentResult.paymentMethodId,
      payment_method_name: paymentResult.paymentMethodName,
      description: `Payment for '${loan.name}' from ${paymentResult.sourceName}`,
      created_at: new Date().toISOString(),
      status: 'active',
      undone_at: null
    };

    const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });
    return savedTransaction;
  }, []);

  return { createPaymentTransaction };
};

/**
 * Payment Activity Logger Hook
 */
const usePaymentActivity = () => {
  const logPaymentActivity = useCallback(async (
    loan,
    originalLoan,
    updatedLoan,
    paymentAmount,
    paymentDate,
    paymentResult,
    transactionId,
    previousCash,
    newCash
  ) => {
    const snapshot = {
      entity: { ...originalLoan, id: loan.id },
      updatedLoan: { ...updatedLoan, id: loan.id },
      paymentAmount,
      date: paymentDate,
      previousCash,
      newCash,
      source: {
        type: paymentResult.paymentMethod,
        id: paymentResult.paymentMethodId,
        name: paymentResult.sourceName
      },
      paymentMethodName: paymentResult.paymentMethodName,
      bankAdjustments: paymentResult.bankAdjustments || [],
      cardEffect: paymentResult.cashEffect || null,
      cashEffect: paymentResult.cashEffect || null,
      transactionId,
      isManualPayment: true
    };

    const previousBalance = parseFloat(originalLoan.balance) || 0;
    const newBalance = parseFloat(updatedLoan.balance) || 0;

    await logActivity(
      'payment',
      'loan',
      loan.id,
      loan.name,
      `Made payment of ${formatCurrency(paymentAmount)} for '${loan.name}' from ${paymentResult.sourceName} - Balance ${formatCurrency(previousBalance)} → ${formatCurrency(newBalance)}`,
      snapshot
    );
  }, []);

  return { logPaymentActivity };
};

/**
 * Main Loan Payment Hook
 */
export const useLoanPayment = ({
  loans,
  bankAccounts,
  creditCards,
  availableCash,
  cashInHand,
  onUpdateCash,
  onUpdateCashInHand,
  hasMigratedToBankAccounts
}) => {
  const [processing, setProcessing] = useState(false);
  
  const { validatePayment } = usePaymentValidation();
  const {
    processBankAccountPayment,
    processCreditCardPayment,
    processCashInHandPayment,
    processCashPayment
  } = usePaymentSourceHandler();
  const { createPaymentTransaction } = useTransactionCreator();
  const { logPaymentActivity } = usePaymentActivity();

  const findBankAccountById = useCallback((accountId) => {
    if (!accountId) return null;
    return bankAccounts.find((acc) => String(acc.id) === String(accountId)) || null;
  }, [bankAccounts]);

  const findCreditCardById = useCallback((cardId) => {
    if (!cardId) return null;
    return creditCards?.find((card) => String(card.id) === String(cardId)) || null;
  }, [creditCards]);

  const processPayment = useCallback(async ({
    loanId,
    paymentAmount,
    paymentDate,
    sourceValue,
    categoryId,
    amountMode
  }) => {
    if (processing) return { success: false, error: 'Already processing a payment' };

    setProcessing(true);

    try {
      const loan = loans.find(l => l.id === loanId);
      if (!loan) {
        throw new Error('Loan not found');
      }

      const [sourceType, sourceId] = sourceValue.includes(':') 
        ? sourceValue.split(':') 
        : [sourceValue, null];

      let sourceData = null;
      if (sourceType === 'bank_account') {
        sourceData = findBankAccountById(sourceId);
        if (!sourceData) throw new Error('Bank account not found');
      } else if (sourceType === 'credit_card') {
        sourceData = findCreditCardById(sourceId);
        if (!sourceData) throw new Error('Credit card not found');
      } else if (sourceType === 'cash_in_hand') {
        sourceData = cashInHand;
      }

      const validation = validatePayment(loan, paymentAmount, sourceType, sourceId, sourceData);
      if (!validation.valid) {
        if (validation.warning) {
          const proceed = window.confirm(`${validation.error}\n\nContinue anyway?`);
          if (!proceed) {
            setProcessing(false);
            return { success: false, error: 'Payment cancelled by user' };
          }
        } else {
          throw new Error(validation.error);
        }
      }

      const originalLoan = { ...loan };
      const loanBalance = parseFloat(loan.balance) || 0;
      const previousCash = availableCash;

      const updatedLoan = {
        ...loan,
        balance: Math.max(0, loanBalance - paymentAmount),
        last_payment_date: paymentDate,
        last_auto_payment_date: new Date().toISOString().split('T')[0]
      };

      let shouldContinue = true;
      const nextDate = predictNextDate(paymentDate, loan.frequency);

      if (loan.recurring_duration_type === 'occurrences') {
        const completed = (loan.recurring_occurrences_completed || 0) + 1;
        updatedLoan.recurring_occurrences_completed = completed;
        const total = loan.recurring_occurrences_total || 0;
        if (total && completed >= total) shouldContinue = false;
      }

      if (loan.recurring_duration_type === 'until_date' && loan.recurring_until_date) {
        const endDate = new Date(loan.recurring_until_date);
        const nextDateObj = new Date(nextDate);
        if (nextDateObj > endDate) shouldContinue = false;
      }

      updatedLoan.next_payment_date = shouldContinue ? nextDate : null;

      await dbOperation('loans', 'put', updatedLoan, { skipActivityLog: true });

      let paymentResult;
      let newCash = previousCash;

      if (sourceType === 'bank_account') {
        paymentResult = await processBankAccountPayment(sourceData, paymentAmount, paymentDate);
        if (hasMigratedToBankAccounts) {
          await onUpdateCash(null, { syncOnly: true });
        } else {
          newCash = previousCash - paymentAmount;
          await onUpdateCash(newCash);
        }
      } else if (sourceType === 'credit_card') {
        paymentResult = await processCreditCardPayment(sourceData, paymentAmount, paymentDate);
        newCash = previousCash;
        await onUpdateCash(newCash);
      } else if (sourceType === 'cash_in_hand') {
        paymentResult = await processCashInHandPayment(sourceData, paymentAmount, onUpdateCashInHand);
        newCash = previousCash;
        await onUpdateCash(newCash);
      } else {
        paymentResult = await processCashPayment(availableCash, paymentAmount, onUpdateCash);
        newCash = previousCash - paymentAmount;
      }

      const transaction = await createPaymentTransaction(
        loan,
        paymentAmount,
        paymentDate,
        paymentResult,
        categoryId
      );

      await logPaymentActivity(
        loan,
        originalLoan,
        updatedLoan,
        paymentAmount,
        paymentDate,
        paymentResult,
        transaction?.id,
        previousCash,
        newCash
      );

      saveLoanPaymentContext(loanId, {
        paymentSource: sourceType,
        paymentSourceId: sourceId,
        amountMode: amountMode
      }).catch(err => console.warn('Failed to save loan payment context:', err));

      return {
        success: true,
        data: {
          loanId,
          loanName: loan.name,
          amount: paymentAmount,
          sourceName: paymentResult.sourceName,
          newBalance: updatedLoan.balance
        }
      };

    } catch (error) {
      console.error('Payment processing error:', error);
      return {
        success: false,
        error: error.message || 'Payment failed'
      };
    } finally {
      setProcessing(false);
    }
  }, [
    loans,
    availableCash,
    cashInHand,
    onUpdateCash,
    onUpdateCashInHand,
    hasMigratedToBankAccounts,
    processing,
    validatePayment,
    processBankAccountPayment,
    processCreditCardPayment,
    processCashInHandPayment,
    processCashPayment,
    createPaymentTransaction,
    logPaymentActivity,
    findBankAccountById,
    findCreditCardById
  ]);

  return {
    processPayment,
    processing
  };
};
