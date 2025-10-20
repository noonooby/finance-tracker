import { dbOperation, getBankAccount, updateBankAccountBalance } from './db';
import { logActivity } from './activityLogger';
import { formatCurrency, predictNextDate, getDaysUntil } from './helpers';

/**
 * Enhanced Auto-Payment System
 * Supports multiple payment sources: Reserved Funds, Credit Cards, Bank Accounts, Cash in Hand
 * Completely revamped with better error handling and audit trails
 */

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const todayInfo = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return { date: today, iso: today.toISOString().split('T')[0] };
};

const hasRecurringEnded = (entity, today) => {
  if (!entity) return false;

  if (entity.recurring_duration_type === 'until_date' && entity.recurring_until_date) {
    const endDate = new Date(entity.recurring_until_date);
    endDate.setHours(0, 0, 0, 0);
    if (today > endDate) {
      return true;
    }
  }

  if (entity.recurring_duration_type === 'occurrences') {
    const total = entity.recurring_occurrences_total || 0;
    const completed = entity.recurring_occurrences_completed || 0;
    if (total && completed >= total) {
      return true;
    }
  }

  return false;
};

const fundAvailableOnOrBeforeDueDate = (fund, dueDateIso) => {
  if (!fund || !dueDateIso) return false;
  const dueDate = normalizeDate(dueDateIso);
  if (!dueDate) return false;

  const created = normalizeDate(fund.created_at || fund.last_paid_date || fund.updated_at || fund.due_date);
  if (!created) return true;

  return created <= dueDate;
};

const adjustBankAccountForFund = async (fund, amount) => {
  if (!fund?.source_account_id || !amount || amount <= 0) return null;
  try {
    const account = await getBankAccount(fund.source_account_id);
    if (!account) return null;
    const currentBalance = parseFloat(account.balance) || 0;
    const newBalance = Math.max(0, currentBalance - amount);
    await updateBankAccountBalance(account.id, newBalance);
    console.log(`🏦 Bank account updated for ${fund.name}: ${currentBalance} → ${newBalance}`);
    return {
      accountId: account.id,
      accountName: account.name,
      previousBalance: currentBalance,
      newBalance,
      amountUsed: amount
    };
  } catch (error) {
    console.error('❌ Failed to update bank account balance:', error);
    return null;
  }
};

const resolveFundId = (fund) => {
  if (!fund) return null;
  if (fund.id !== undefined && fund.id !== null) return String(fund.id);
  if (fund.fund_id !== undefined && fund.fund_id !== null) return String(fund.fund_id);
  if (fund.uuid !== undefined && fund.uuid !== null) return String(fund.uuid);
  return null;
};

const findReservedFundById = (reservedFunds, fundId) => {
  if (!fundId) return null;
  return reservedFunds.find((fund) => resolveFundId(fund) === String(fundId)) || null;
};

/**
 * Process payment from Credit Card
 */
const processPaymentFromCreditCard = async (loan, card, paymentAmount, todayIso) => {
  if (!card) {
    throw new Error('Credit card not found');
  }

  const previousCardBalance = parseFloat(card.balance) || 0;
  const newCardBalance = previousCardBalance + paymentAmount; // Credit card balance increases

  // Update credit card
  await dbOperation('creditCards', 'put', {
    ...card,
    balance: newCardBalance,
    last_payment_date: todayIso
  }, { skipActivityLog: true });

  return {
    paymentMethod: 'credit_card',
    paymentMethodId: card.id,
    paymentMethodName: card.name,
    sourceName: card.name,
    sourceType: 'credit_card',
    cardEffect: {
      cardId: card.id,
      previousBalance: previousCardBalance,
      newBalance: newCardBalance,
      delta: paymentAmount
    }
  };
};

/**
 * Process payment from Bank Account
 */
const processPaymentFromBankAccount = async (loan, account, paymentAmount, todayIso) => {
  if (!account) {
    throw new Error('Bank account not found');
  }

  const currentBalance = parseFloat(account.balance) || 0;
  
  if (paymentAmount > currentBalance) {
    throw new Error(`Insufficient funds in ${account.name}. Available: ${formatCurrency(currentBalance)}, Required: ${formatCurrency(paymentAmount)}`);
  }

  const newBalance = currentBalance - paymentAmount;

  // Update bank account
  await updateBankAccountBalance(account.id, newBalance);

  return {
    paymentMethod: 'bank_account',
    paymentMethodId: account.id,
    paymentMethodName: account.name,
    sourceName: account.name,
    sourceType: 'bank_account',
    bankAdjustments: [{
      accountId: account.id,
      accountName: account.name,
      previousBalance: currentBalance,
      newBalance,
      amount: paymentAmount
    }]
  };
};

/**
 * Process payment from Cash in Hand
 */
const processPaymentFromCashInHand = async (loan, cashInHand, paymentAmount, todayIso, onUpdateCashInHand) => {
  const currentCash = cashInHand || 0;
  
  if (paymentAmount > currentCash) {
    throw new Error(`Insufficient cash in hand. Available: ${formatCurrency(currentCash)}, Required: ${formatCurrency(paymentAmount)}`);
  }

  const newCash = currentCash - paymentAmount;
  
  if (onUpdateCashInHand) {
    await onUpdateCashInHand(newCash);
  }

  return {
    paymentMethod: 'cash_in_hand',
    paymentMethodId: null,
    paymentMethodName: 'Cash in Hand',
    sourceName: 'Cash in Hand',
    sourceType: 'cash_in_hand',
    cashEffect: {
      previousCash: currentCash,
      newCash
    }
  };
};

/**
 * Process payment from Reserved Fund (existing logic enhanced)
 */
const processPaymentFromReservedFund = async (loan, fund, paymentAmount, todayIso, reservedFunds) => {
  if (!fund) {
    throw new Error('Reserved fund not found');
  }

  const currentAmount = parseFloat(fund.amount) || 0;
  
  if (paymentAmount > currentAmount) {
    throw new Error(`Insufficient funds in ${fund.name}. Available: ${formatCurrency(currentAmount)}, Required: ${formatCurrency(paymentAmount)}`);
  }

  const fundSnapshot = JSON.parse(JSON.stringify(fund));
  let wasFundDeleted = false;

  // Handle different fund types
  if (fund.recurring) {
    const updatedFund = {
      ...fund,
      amount: fund.original_amount || fund.amount,
      last_paid_date: todayIso
    };

    let shouldContinue = true;
    const nextDueDate = predictNextDate(fund.due_date, fund.frequency || 'monthly');

    if (fund.recurring_duration_type === 'occurrences') {
      const completed = (fund.recurring_occurrences_completed || 0) + 1;
      updatedFund.recurring_occurrences_completed = completed;
      const total = fund.recurring_occurrences_total || 0;
      if (total && completed >= total) {
        shouldContinue = false;
      }
    }

    if (fund.recurring_duration_type === 'until_date' && fund.recurring_until_date) {
      const endDate = new Date(fund.recurring_until_date);
      const nextDateObj = new Date(nextDueDate);
      if (nextDateObj > endDate) {
        shouldContinue = false;
      }
    }

    if (shouldContinue) {
      updatedFund.due_date = nextDueDate;
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
      last_paid_date: todayIso
    };

    if (fund.recurring_duration_type === 'occurrences') {
      const completed = (fund.recurring_occurrences_completed || 0) + 1;
      updatedFund.recurring_occurrences_completed = completed;
      const total = fund.recurring_occurrences_total || 0;
      if (total && completed >= total) {
        updatedFund.recurring = false;
      }
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
        last_paid_date: todayIso
      };
      await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
    }
  }

  // Adjust linked bank account if exists
  const adjustmentInfo = await adjustBankAccountForFund(fund, paymentAmount);
  const snapshotFund = adjustmentInfo
    ? { ...fundSnapshot, source_account_name: adjustmentInfo.accountName }
    : fundSnapshot;

  return {
    paymentMethod: 'reserved_fund',
    paymentMethodId: resolveFundId(fund),
    paymentMethodName: fund.name,
    sourceName: fund.name,
    sourceType: 'reserved_fund',
    affectedFunds: [{
      fund: snapshotFund,
      amountUsed: paymentAmount,
      wasDeleted: wasFundDeleted
    }],
    bankAdjustments: adjustmentInfo ? [adjustmentInfo] : []
  };
};

/**
 * Enhanced processOverdueLoans with multi-source support
 */
export const processOverdueLoans = async (
  loans, 
  reservedFunds, 
  availableCash, 
  onUpdateCash,
  creditCards = [],
  bankAccounts = [],
  cashInHand = 0,
  onUpdateCashInHand = null
) => {
  const { date: today, iso: todayIso } = todayInfo();

  const results = {
    processed: [],
    failed: [],
    skipped: []
  };

  console.log('🔄 Starting enhanced loan auto-payment processing...');

  for (const loan of loans) {
    const loanName = loan?.name || 'Unknown Loan';

    try {
      // Validation checks
      if (!loan?.next_payment_date) {
        results.skipped.push({ loan: loanName, reason: 'No next payment date set' });
        continue;
      }

      if (hasRecurringEnded(loan, today)) {
        results.skipped.push({ loan: loanName, reason: 'Recurring period ended' });
        continue;
      }

      const dueDate = normalizeDate(loan.next_payment_date);
      if (!dueDate) {
        results.failed.push({ loan: loanName, reason: 'Invalid next payment date' });
        continue;
      }

      if (dueDate > today) {
        results.skipped.push({ loan: loanName, reason: 'Not due yet' });
        continue;
      }

      const paymentAmount = Number(loan.payment_amount) || 0;
      if (paymentAmount <= 0) {
        results.skipped.push({ loan: loanName, reason: 'No payment amount configured' });
        continue;
      }

      console.log(`💳 Processing loan: ${loanName}, Amount: ${formatCurrency(paymentAmount)}`);

      // Determine payment source with priority order
      let paymentResult = null;
      let paymentSource = null;

      // Priority 1: Check for connected payment source
      if (loan.connected_payment_source && loan.connected_payment_source_id) {
        console.log(`🔗 Loan has connected source: ${loan.connected_payment_source}`);
        
        try {
          if (loan.connected_payment_source === 'credit_card') {
            const card = creditCards.find(c => String(c.id) === String(loan.connected_payment_source_id));
            if (card) {
              paymentResult = await processPaymentFromCreditCard(loan, card, paymentAmount, todayIso);
              paymentSource = 'connected_credit_card';
              console.log(`✅ Paid from connected credit card: ${card.name}`);
            } else {
              console.warn(`⚠️ Connected credit card not found, falling back...`);
            }
          } else if (loan.connected_payment_source === 'bank_account') {
            const account = bankAccounts.find(a => String(a.id) === String(loan.connected_payment_source_id));
            if (account) {
              paymentResult = await processPaymentFromBankAccount(loan, account, paymentAmount, todayIso);
              paymentSource = 'connected_bank_account';
              console.log(`✅ Paid from connected bank account: ${account.name}`);
            } else {
              console.warn(`⚠️ Connected bank account not found, falling back...`);
            }
          } else if (loan.connected_payment_source === 'reserved_fund') {
            const fund = findReservedFundById(reservedFunds, loan.connected_payment_source_id);
            if (fund && !hasRecurringEnded(fund, today)) {
              paymentResult = await processPaymentFromReservedFund(loan, fund, paymentAmount, todayIso, reservedFunds);
              paymentSource = 'connected_reserved_fund';
              console.log(`✅ Paid from connected reserved fund: ${fund.name}`);
            } else {
              console.warn(`⚠️ Connected reserved fund not available, falling back...`);
            }
          } else if (loan.connected_payment_source === 'cash_in_hand') {
            paymentResult = await processPaymentFromCashInHand(loan, cashInHand, paymentAmount, todayIso, onUpdateCashInHand);
            paymentSource = 'connected_cash_in_hand';
            console.log(`✅ Paid from connected cash in hand`);
          }
        } catch (connectedError) {
          console.warn(`⚠️ Failed to use connected source: ${connectedError.message}, falling back...`);
        }
      }

      // Priority 2: Fallback to Reserved Funds (single linked)
      if (!paymentResult) {
        const singleLinkedFund = reservedFunds.find(
          (fund) =>
            !fund.is_lumpsum &&
            fund.linked_to?.type === 'loan' &&
            String(fund.linked_to?.id) === String(loan.id) &&
            !hasRecurringEnded(fund, today) &&
            fundAvailableOnOrBeforeDueDate(fund, loan.next_payment_date)
        );

        if (singleLinkedFund) {
          const fundAmount = Number(singleLinkedFund.amount) || 0;
          if (fundAmount >= paymentAmount) {
            try {
              paymentResult = await processPaymentFromReservedFund(loan, singleLinkedFund, paymentAmount, todayIso, reservedFunds);
              paymentSource = 'linked_reserved_fund';
              console.log(`✅ Paid from linked reserved fund: ${singleLinkedFund.name}`);
            } catch (fundError) {
              console.warn(`⚠️ Failed to use linked fund: ${fundError.message}`);
            }
          }
        }
      }

      // Priority 3: Fallback to Lumpsum Funds
      if (!paymentResult) {
        const lumpsumFund = reservedFunds.find(
          (fund) =>
            fund.is_lumpsum &&
            Array.isArray(fund.linked_items) &&
            fund.linked_items.some((item) => item.type === 'loan' && String(item.id) === String(loan.id)) &&
            !hasRecurringEnded(fund, today) &&
            fundAvailableOnOrBeforeDueDate(fund, loan.next_payment_date)
        );

        if (lumpsumFund) {
          const lumpsumAmount = Number(lumpsumFund.amount) || 0;
          if (lumpsumAmount >= paymentAmount) {
            try {
              paymentResult = await processPaymentFromReservedFund(loan, lumpsumFund, paymentAmount, todayIso, reservedFunds);
              paymentSource = 'lumpsum_fund';
              console.log(`✅ Paid from lumpsum fund: ${lumpsumFund.name}`);
            } catch (fundError) {
              console.warn(`⚠️ Failed to use lumpsum fund: ${fundError.message}`);
            }
          }
        }
      }

      // If no payment source worked, mark as failed
      if (!paymentResult) {
        results.failed.push({
          loan: loanName,
          reason: 'No available payment source with sufficient funds'
        });
        continue;
      }

      // Update loan
      const originalLoan = { ...loan };
      const loanBalance = parseFloat(loan.balance) || 0;

      const updatedLoan = {
        ...loan,
        balance: Math.max(0, loanBalance - paymentAmount),
        last_payment_date: todayIso,
        last_auto_payment_date: todayIso
      };

      let shouldContinue = true;
      const nextDate = predictNextDate(loan.next_payment_date, loan.frequency || 'monthly'); // Use original due date, not today

      if (loan.recurring_duration_type === 'occurrences') {
        const completed = (loan.recurring_occurrences_completed || 0) + 1;
        updatedLoan.recurring_occurrences_completed = completed;
        const total = loan.recurring_occurrences_total || 0;
        if (total && completed >= total) {
          shouldContinue = false;
        }
      }

      if (loan.recurring_duration_type === 'until_date' && loan.recurring_until_date) {
        const endDate = new Date(loan.recurring_until_date);
        const nextDateObj = new Date(nextDate);
        if (nextDateObj > endDate) {
          shouldContinue = false;
        }
      }

      updatedLoan.next_payment_date = shouldContinue ? nextDate : null;

      await dbOperation('loans', 'put', updatedLoan, { skipActivityLog: true });

      // Create transaction
      const transaction = {
        type: 'payment',
        loan_id: loan.id,
        card_id: paymentResult.sourceType === 'credit_card' ? paymentResult.paymentMethodId : null, // ← Link to credit card
        amount: paymentAmount,
        date: todayIso,
        category_id: 'loan_payment',
        category_name: 'Loan Payment',
        payment_method: paymentResult.paymentMethod,
        payment_method_id: paymentResult.paymentMethodId,
        payment_method_name: paymentResult.paymentMethodName,
        description: `Auto-payment for ${loanName} from ${paymentResult.sourceName}`,
        created_at: new Date().toISOString(),
        status: 'active',
        undone_at: null,
        auto_generated: true
      };
      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

      // Update cash if needed (for accounting purposes)
      if (paymentResult.sourceType === 'bank_account') {
        if (onUpdateCash) {
          await onUpdateCash(null, { syncOnly: true });
        }
      }

      // Log activity
      const activitySnapshot = {
        entity: { ...originalLoan, id: loan.id },
        updatedLoan: { ...updatedLoan, id: loan.id },
        paymentAmount,
        date: todayIso,
        source: {
          type: paymentResult.sourceType,
          id: paymentResult.paymentMethodId,
          name: paymentResult.sourceName
        },
        paymentMethodName: paymentResult.paymentMethodName,
        transactionId: savedTransaction?.id,
        isAutoPayment: true,
        paymentSourceUsed: paymentSource,
        ...paymentResult
      };

      const previousBalance = parseFloat(originalLoan.balance) || 0;
      const newBalance = parseFloat(updatedLoan.balance) || 0;

      await logActivity(
        'payment',
        'loan',
        loan.id,
        loanName,
        `Auto-payment of ${formatCurrency(paymentAmount)} for ${loanName} from ${paymentResult.sourceName} - Balance ${formatCurrency(previousBalance)} → ${formatCurrency(newBalance)}`,
        activitySnapshot
      );

      results.processed.push({
        loan: loanName,
        amount: paymentAmount,
        source: paymentResult.sourceName,
        sourceType: paymentResult.sourceType
      });

      console.log(`✅ Successfully processed: ${loanName}`);

    } catch (error) {
      console.error(`❌ Error processing loan ${loanName}:`, error);
      results.failed.push({
        loan: loanName,
        reason: error.message || 'Unknown error'
      });
    }
  }

  console.log('✅ Loan auto-payment processing complete');
  console.log(`📊 Results: ${results.processed.length} processed, ${results.failed.length} failed, ${results.skipped.length} skipped`);

  return results;
};

/**
 * Enhanced processOverdueCreditCards (keeping existing logic)
 */
export const processOverdueCreditCards = async (creditCards, reservedFunds, availableCash, onUpdateCash) => {
  const { date: today, iso: todayIso } = todayInfo();

  const results = {
    processed: [],
    failed: [],
    skipped: []
  };

  for (const card of creditCards) {
    const cardName = card?.name || 'Unnamed Card';

    try {
      if (!card?.due_date) {
        results.skipped.push({ card: cardName, reason: 'No due date set' });
        continue;
      }

      const dueDate = normalizeDate(card.due_date);
      if (!dueDate) {
        results.failed.push({ card: cardName, reason: 'Invalid due date' });
        continue;
      }

      if (dueDate > today) {
        results.skipped.push({ card: cardName, reason: 'Not due yet' });
        continue;
      }

      const cardBalance = Number(card.balance) || 0;
      if (cardBalance <= 0) {
        results.skipped.push({ card: cardName, reason: 'No outstanding balance' });
        continue;
      }

      const linkedFund = reservedFunds.find(
        (fund) =>
          !fund.is_lumpsum &&
          fund.linked_to?.type === 'credit_card' &&
          String(fund.linked_to?.id) === String(card.id) &&
          !hasRecurringEnded(fund, today) &&
          fundAvailableOnOrBeforeDueDate(fund, card.due_date)
      );
      const lumpsumFund = reservedFunds.find(
        (fund) =>
          fund.is_lumpsum &&
          Array.isArray(fund.linked_items) &&
          fund.linked_items.some((item) => item.type === 'credit_card' && String(item.id) === String(card.id)) &&
          !hasRecurringEnded(fund, today) &&
          fundAvailableOnOrBeforeDueDate(fund, card.due_date)
      );

      const linkedAmount = Number(linkedFund?.amount) || 0;
      const lumpsumAmount = Number(lumpsumFund?.amount) || 0;

      let fundToUse = null;
      let fundSnapshot = null;
      let fundType = null;
      let paymentAmount = 0;

      if (linkedFund && linkedAmount > 0) {
        fundToUse = linkedFund;
        fundSnapshot = { ...linkedFund };
        fundType = 'single';
        paymentAmount = Math.min(cardBalance, linkedAmount);
      } else if (lumpsumFund && lumpsumAmount > 0) {
        fundToUse = lumpsumFund;
        fundSnapshot = { ...lumpsumFund };
        fundType = 'lumpsum';
        paymentAmount = Math.min(cardBalance, lumpsumAmount);
      } else {
        results.failed.push({
          card: cardName,
          reason: 'No reserved funds available'
        });
        continue;
      }

      if (paymentAmount <= 0) {
        results.failed.push({
          card: cardName,
          reason: 'Reserved fund balance is zero'
        });
        continue;
      }

      await dbOperation('creditCards', 'put', {
        ...card,
        balance: Math.max(0, cardBalance - paymentAmount),
        last_payment_date: todayIso,
        last_auto_payment_date: todayIso
      }, { skipActivityLog: true });

      const transaction = {
        type: 'payment',
        card_id: card.id,
        amount: paymentAmount,
        date: todayIso,
        payment_method: 'credit_card',
        payment_method_id: card.id,
        payment_method_name: cardName,
        category_id: 'credit_card_payment',
        category_name: 'Credit Card Payment',
        description: `Auto-payment for ${cardName} from reserved fund ${fundToUse.name}`,
        created_at: new Date().toISOString(),
        status: 'active',
        undone_at: null,
        auto_generated: true
      };
      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

      if (fundType === 'single') {
        if (fundToUse.recurring) {
          const updatedFund = {
            ...fundToUse,
            amount: fundToUse.original_amount || fundToUse.amount,
            last_paid_date: todayIso
          };

          let shouldContinue = true;
          const nextDueDate = predictNextDate(fundToUse.due_date, fundToUse.frequency || 'monthly');

          if (fundToUse.recurring_duration_type === 'occurrences') {
            const completed = (fundToUse.recurring_occurrences_completed || 0) + 1;
            updatedFund.recurring_occurrences_completed = completed;
            const total = fundToUse.recurring_occurrences_total || 0;
            if (total && completed >= total) {
              shouldContinue = false;
            }
          }

          if (fundToUse.recurring_duration_type === 'until_date' && fundToUse.recurring_until_date) {
            const endDate = new Date(fundToUse.recurring_until_date);
            const nextDateObj = new Date(nextDueDate);
            if (nextDateObj > endDate) {
              shouldContinue = false;
            }
          }

          if (shouldContinue) {
            updatedFund.due_date = nextDueDate;
          } else {
            updatedFund.recurring = false;
            updatedFund.due_date = fundToUse.recurring_until_date || fundToUse.due_date;
          }

          await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
          Object.assign(fundToUse, updatedFund);
        } else {
          await dbOperation('reservedFunds', 'delete', fundToUse.id, { skipActivityLog: true });
        }

        const fundTransaction = {
          type: 'reserved_fund_paid',
          amount: paymentAmount,
          date: todayIso,
          description: `Reserved fund applied: ${fundToUse.name}`,
          notes: `Auto payment for ${cardName}`,
          created_at: new Date().toISOString(),
          status: 'active',
          undone_at: null,
          payment_method: 'reserved_fund',
          payment_method_id: fundToUse.id,
          auto_generated: true
        };
        await dbOperation('transactions', 'put', fundTransaction, { skipActivityLog: true });
      } else if (fundType === 'lumpsum') {
        const updatedFund = {
          ...fundToUse,
          amount: Math.max(0, lumpsumAmount - paymentAmount),
          last_paid_date: todayIso
        };

        if (fundToUse.recurring_duration_type === 'occurrences') {
          const completed = (fundToUse.recurring_occurrences_completed || 0) + 1;
          updatedFund.recurring_occurrences_completed = completed;
          const total = fundToUse.recurring_occurrences_total || 0;
          if (total && completed >= total) {
            updatedFund.recurring = false;
          }
        }

        await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
        Object.assign(fundToUse, updatedFund);
      }

      await adjustBankAccountForFund(fundToUse, paymentAmount);

      const previousCash = availableCash;
      const newCash = previousCash - paymentAmount;
      if (typeof onUpdateCash === 'function') {
        await onUpdateCash(newCash);
      }
      availableCash = newCash;

      await logActivity(
        'payment',
        'card',
        card.id,
        cardName,
        `Auto-payment of ${formatCurrency(paymentAmount)} for ${cardName} from reserved fund ${fundToUse.name}`,
        {
          entity: { ...card },
          paymentAmount,
          date: todayIso,
          previousCash,
          source: {
            type: 'reserved_fund',
            id: fundToUse?.id,
            name: fundToUse?.name
          },
          affectedFund: fundSnapshot,
          affectedFunds: [
            {
              fund: fundSnapshot,
              amountUsed: paymentAmount
            }
          ],
          paymentMethodName: 'Reserved Fund',
          transactionId: savedTransaction?.id,
          isAutoPayment: true
        }
      );

      results.processed.push({
        card: cardName,
        amount: paymentAmount,
        fund: fundToUse.name
      });
    } catch (error) {
      console.error(`Error processing card ${cardName}:`, error);
      results.failed.push({
        card: cardName,
        reason: error.message || 'Unknown error'
      });
    }
  }

  return results;
};

/**
 * Auto-deposit due income (keeping existing logic)
 */
export const autoDepositDueIncome = async (income, availableCash, onUpdateCash) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayString = today.toISOString().split('T')[0];

  const results = {
    deposited: [],
    skipped: []
  };

  const recurringIncomes = income.filter(inc =>
    inc.frequency && inc.frequency !== 'onetime'
  );

  if (recurringIncomes.length === 0) {
    return results;
  }

  for (const inc of recurringIncomes) {
    try {
      // Skip if auto-deposit is disabled
      if (inc.auto_deposit === false) {
        console.log(`⏭️ Income ${inc.source} has auto-deposit disabled, skipping`);
        results.skipped.push({
          source: inc.source,
          reason: 'Auto-deposit disabled'
        });
        continue;
      }
      
      const nextDate = predictNextDate(inc.date, inc.frequency);
      const daysUntil = getDaysUntil(nextDate);

      if (daysUntil !== 0) {
        continue;
      }

      if (inc.recurring_duration_type === 'until_date' && inc.recurring_until_date) {
        const endDate = new Date(inc.recurring_until_date);
        endDate.setHours(0, 0, 0, 0);
        if (today > endDate) {
          console.log(`⏹️ Income ${inc.source} has ended (reached end date)`);
          results.skipped.push({
            source: inc.source,
            reason: 'Recurring period ended (reached end date)'
          });
          continue;
        }
      }

      if (inc.recurring_duration_type === 'occurrences') {
        const completed = inc.recurring_occurrences_completed || 0;
        const total = inc.recurring_occurrences_total || 0;
        if (total && completed >= total) {
          console.log(`⏹️ Income ${inc.source} has ended (${completed}/${total} occurrences completed)`);
          results.skipped.push({
            source: inc.source,
            reason: `Recurring period ended (${completed}/${total} occurrences)`
          });
          continue;
        }
      }

      const amount = parseFloat(inc.amount) || 0;

      const transaction = {
        type: 'income',
        amount,
        date: todayString,
        income_source: inc.source,
        payment_method: 'cash',
        payment_method_id: inc.id,
        description: `${inc.source} (Auto-deposited)`,
        status: 'active',
        undone_at: null,
        created_at: new Date().toISOString()
      };
      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

      const updatedIncome = {
        ...inc,
        date: todayString
      };

      if (inc.recurring_duration_type === 'occurrences') {
        updatedIncome.recurring_occurrences_completed = (inc.recurring_occurrences_completed || 0) + 1;
      }

      await dbOperation('income', 'put', updatedIncome, { skipActivityLog: true });

      const previousCash = availableCash;
      const newCash = previousCash + amount;
      if (typeof onUpdateCash === 'function') {
        await onUpdateCash(newCash, {
          accountId: inc.deposit_account_id || undefined
        });
      }
      availableCash = newCash;

      await logActivity(
        'income',
        'income',
        inc.id,
        inc.source,
        `Income: ${formatCurrency(amount)} from ${inc.source} (Auto-deposited)`,
        {
          amount,
          source: inc.source,
          previousCash,
          newCash,
          transactionId: savedTransaction?.id,
          incomeId: inc.id,
          isAutoDeposit: true
        }
      );

      results.deposited.push({
        source: inc.source,
        amount,
        date: todayString,
        incomeId: inc.id
      });

      console.log(`✅ Auto-deposited: ${inc.source} - ${formatCurrency(amount)}`);
    } catch (error) {
      console.error(`❌ Error auto-depositing income ${inc.source}:`, error);
      results.skipped.push({
        source: inc.source,
        reason: error.message || 'Unknown error'
      });
    }
  }

  return results;
};
