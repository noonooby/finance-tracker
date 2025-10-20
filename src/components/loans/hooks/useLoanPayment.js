import { useState, useCallback } from 'react';
import { dbOperation, updateBankAccountBalance } from '../../../utils/db';
import { logActivity } from '../../../utils/activityLogger';
import { formatCurrency, predictNextDate } from '../../../utils/helpers';
import { saveLoanPaymentContext } from '../../../utils/formContexts';

/**
 * Payment Validation Hook
 * Validates payment amount and source availability
 */
const usePaymentValidation = () => {
  const validatePayment = useCallback((loan, paymentAmount, sourceType, sourceId, sourceData) => {
    // Validate amount
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return { valid: false, error: 'Please enter a valid payment amount' };
    }

    const loanBalance = parseFloat(loan.balance) || 0;
    if (paymentAmount > loanBalance + 0.01) {
      return { 
        valid: false, 
        error: `Payment amount (${formatCurrency(paymentAmount)}) exceeds balance (${formatCurrency(loanBalance)})`,
        warning: true // Indicates this is a warning, not a hard error
      };
    }

    // Validate source availability
    if (sourceType === 'reserved_fund') {
      const fund = sourceData;
      const currentAmount = parseFloat(fund?.amount) || 0;
      if (paymentAmount > currentAmount) {
        return { 
          valid: false, 
          error: `Insufficient funds in ${fund?.name}. Available: ${formatCurrency(currentAmount)}` 
        };
      }
    } else if (sourceType === 'bank_account') {
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
 * Processes payment from different source types
 */
const usePaymentSourceHandler = () => {
  const resolveFundId = (fund) => {
    if (!fund) return null;
    if (fund.id !== undefined && fund.id !== null) return String(fund.id);
    if (fund.fund_id !== undefined && fund.fund_id !== null) return String(fund.fund_id);
    return null;
  };

  const processReservedFundPayment = useCallback(async (fund, paymentAmount, paymentDate) => {
    const currentAmount = parseFloat(fund.amount) || 0;
    const fundSnapshot = JSON.parse(JSON.stringify(fund));
    let wasFundDeleted = false;

    if (fund.recurring) {
      const updatedFund = {
        ...fund,
        amount: Math.max(0, currentAmount - paymentAmount),
        last_paid_date: paymentDate
      };

      let continueFund = true;
      const nextFundDue = predictNextDate(fund.due_date, fund.frequency || 'monthly');

      if (fund.recurring_duration_type === 'occurrences') {
        const completed = (fund.recurring_occurrences_completed || 0) + 1;
        updatedFund.recurring_occurrences_completed = completed;
        const total = fund.recurring_occurrences_total || 0;
        if (total && completed >= total) continueFund = false;
      }

      if (fund.recurring_duration_type === 'until_date' && fund.recurring_until_date) {
        const fundEndDate = new Date(fund.recurring_until_date);
        const nextFundDate = new Date(nextFundDue);
        if (nextFundDate > fundEndDate) continueFund = false;
      }

      if (continueFund) {
        updatedFund.due_date = nextFundDue;
      } else {
        updatedFund.recurring = false;
        updatedFund.due_date = fund.recurring_until_date || fund.due_date;
      }

      await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
    } else if (fund.is_lumpsum) {
      const updatedAmount = Math.max(0, currentAmount - paymentAmount);
      const updatedFund = {
        ...fund,
        amount: updatedAmount,
        last_paid_date: paymentDate
      };

      if (fund.recurring_duration_type === 'occurrences') {
        const completed = (fund.recurring_occurrences_completed || 0) + 1;
        updatedFund.recurring_occurrences_completed = completed;
        const total = fund.recurring_occurrences_total || 0;
        if (total && completed >= total) updatedFund.recurring = false;
      }

      await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
    } else {
      const remaining = currentAmount - paymentAmount;
      if (remaining <= 0.0001) {
        await dbOperation('reservedFunds', 'delete', resolveFundId(fund), { skipActivityLog: true });
        wasFundDeleted = true;
      } else {
        const updatedFund = {
          ...fund,
          amount: remaining,
          last_paid_date: paymentDate
        };
        await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
      }
    }

    return {
      paymentMethod: 'reserved_fund',
      paymentMethodId: resolveFundId(fund),
      paymentMethodName: fund.name,
      sourceName: fund.name,
      affectedFunds: [{
        fund: fundSnapshot,
        amountUsed: paymentAmount,
        wasDeleted: wasFundDeleted
      }]
    };
  }, []);

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
    processReservedFundPayment,
    processBankAccountPayment,
    processCreditCardPayment,
    processCashInHandPayment,
    processCashPayment
  };
};

/**
 * Transaction Creator Hook
 * Creates transaction records for payments
 */
const useTransactionCreator = () => {
  const createPaymentTransaction = useCallback(async (loan, paymentAmount, paymentDate, paymentResult, categoryId) => {
    const transaction = {
      type: 'payment',
      loan_id: loan.id,
      card_id: paymentResult.cardEffect ? paymentResult.cardEffect.cardId : null, // ← Link to credit card if used
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
 * Logs payment activities with complete snapshots
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
      affectedFund: paymentResult.affectedFunds?.[0]?.fund || null,
      affectedFunds: paymentResult.affectedFunds || [],
      bankAdjustments: paymentResult.bankAdjustments || [],
      cardEffect: paymentResult.cardEffect || null,
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
 * Orchestrates the complete loan payment flow
 */
export const useLoanPayment = ({
  loans,
  reservedFunds,
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
    processReservedFundPayment,
    processBankAccountPayment,
    processCreditCardPayment,
    processCashInHandPayment,
    processCashPayment
  } = usePaymentSourceHandler();
  const { createPaymentTransaction } = useTransactionCreator();
  const { logPaymentActivity } = usePaymentActivity();

  const resolveFundId = (fund) => {
    if (!fund) return null;
    if (fund.id !== undefined && fund.id !== null) return String(fund.id);
    if (fund.fund_id !== undefined && fund.fund_id !== null) return String(fund.fund_id);
    return null;
  };

  const findReservedFundById = useCallback((fundId) => {
    if (!fundId) return null;
    return reservedFunds.find((fund) => resolveFundId(fund) === String(fundId)) || null;
  }, [reservedFunds]);

  const findBankAccountById = useCallback((accountId) => {
    if (!accountId) return null;
    return bankAccounts.find((acc) => String(acc.id) === String(accountId)) || null;
  }, [bankAccounts]);

  const findCreditCardById = useCallback((cardId) => {
    if (!cardId) return null;
    return creditCards?.find((card) => String(card.id) === String(cardId)) || null;
  }, [creditCards]);

  /**
   * Process a loan payment
   */
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

      // Parse source
      const [sourceType, sourceId] = sourceValue.includes(':') 
        ? sourceValue.split(':') 
        : [sourceValue, null];

      // Get source data
      let sourceData = null;
      if (sourceType === 'reserved_fund') {
        sourceData = findReservedFundById(sourceId);
        if (!sourceData) throw new Error('Reserved fund not found');
      } else if (sourceType === 'bank_account') {
        sourceData = findBankAccountById(sourceId);
        if (!sourceData) throw new Error('Bank account not found');
      } else if (sourceType === 'credit_card') {
        sourceData = findCreditCardById(sourceId);
        if (!sourceData) throw new Error('Credit card not found');
      } else if (sourceType === 'cash_in_hand') {
        sourceData = cashInHand;
      }

      // Validate payment
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

      // Capture original state
      const originalLoan = { ...loan };
      const loanBalance = parseFloat(loan.balance) || 0;
      const previousCash = availableCash;

      // Update loan
      const updatedLoan = {
        ...loan,
        balance: Math.max(0, loanBalance - paymentAmount),
        last_payment_date: paymentDate,
        last_auto_payment_date: new Date().toISOString().split('T')[0]
      };

      // Handle recurring schedule
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

      // Save updated loan
      await dbOperation('loans', 'put', updatedLoan, { skipActivityLog: true });

      // Process payment from source
      let paymentResult;
      let newCash = previousCash;

      if (sourceType === 'reserved_fund') {
        paymentResult = await processReservedFundPayment(sourceData, paymentAmount, paymentDate);
        await onUpdateCash(null, { syncOnly: true });
      } else if (sourceType === 'bank_account') {
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

      // Create transaction
      const transaction = await createPaymentTransaction(
        loan,
        paymentAmount,
        paymentDate,
        paymentResult,
        categoryId
      );

      // Log activity
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

      // Save payment context
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
    processReservedFundPayment,
    processBankAccountPayment,
    processCreditCardPayment,
    processCashInHandPayment,
    processCashPayment,
    createPaymentTransaction,
    logPaymentActivity,
    findReservedFundById,
    findBankAccountById,
    findCreditCardById
  ]);

  return {
    processPayment,
    processing
  };
};
