import { dbOperation } from './db';
import { logActivity } from './activityLogger';
import { formatCurrency, predictNextDate, getDaysUntil } from './helpers';

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

export const processOverdueLoans = async (loans, reservedFunds, availableCash, onUpdateCash) => {
  const { date: today, iso: todayIso } = todayInfo();

  const results = {
    processed: [],
    failed: [],
    skipped: []
  };

  for (const loan of loans) {
    const loanName = loan?.name || 'Unknown Loan';

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

    const singleLinkedFund = reservedFunds.find(
      (fund) =>
        !fund.is_lumpsum &&
        fund.linked_to?.type === 'loan' &&
        String(fund.linked_to?.id) === String(loan.id) &&
        !hasRecurringEnded(fund, today) &&
        fundAvailableOnOrBeforeDueDate(fund, loan.next_payment_date)
    );
    const lumpsumFund = reservedFunds.find(
      (fund) =>
        fund.is_lumpsum &&
        Array.isArray(fund.linked_items) &&
        fund.linked_items.some((item) => item.type === 'loan' && String(item.id) === String(loan.id)) &&
        !hasRecurringEnded(fund, today) &&
        fundAvailableOnOrBeforeDueDate(fund, loan.next_payment_date)
    );

    const singleAmount = Number(singleLinkedFund?.amount) || 0;
    const lumpsumAmount = Number(lumpsumFund?.amount) || 0;

    let fundToUse = null;
    let fundSnapshot = null;
    let fundType = null;

    if (singleLinkedFund && singleAmount >= paymentAmount) {
      fundToUse = singleLinkedFund;
      fundSnapshot = { ...singleLinkedFund };
      fundType = 'single';
    } else if (lumpsumFund && lumpsumAmount >= paymentAmount) {
      fundToUse = lumpsumFund;
      fundSnapshot = { ...lumpsumFund };
      fundType = 'lumpsum';
    } else {
      results.failed.push({
        loan: loanName,
        reason: `Insufficient reserved funds. Required: ${formatCurrency(paymentAmount)}, Available: ${formatCurrency(Math.max(singleAmount, lumpsumAmount))}`
      });
      continue;
    }

    try {
      const updatedLoan = {
        ...loan,
        balance: Math.max(0, (Number(loan.balance) || 0) - paymentAmount),
        last_payment_date: todayIso,
        last_auto_payment_date: todayIso
      };

      let shouldContinueLoan = true;
      const nextLoanDue = predictNextDate(todayIso, loan.frequency || 'monthly');

      if (loan.recurring_duration_type === 'occurrences') {
        const completed = (loan.recurring_occurrences_completed || 0) + 1;
        updatedLoan.recurring_occurrences_completed = completed;
        const total = loan.recurring_occurrences_total || 0;
        if (total && completed >= total) {
          shouldContinueLoan = false;
        }
      }

      if (loan.recurring_duration_type === 'until_date' && loan.recurring_until_date) {
        const endDate = new Date(loan.recurring_until_date);
        const nextDueObj = new Date(nextLoanDue);
        if (nextDueObj > endDate) {
          shouldContinueLoan = false;
        }
      }

      updatedLoan.next_payment_date = shouldContinueLoan ? nextLoanDue : null;

      await dbOperation('loans', 'put', updatedLoan, { skipActivityLog: true });
      loan.balance = updatedLoan.balance;
      loan.recurring_occurrences_completed = updatedLoan.recurring_occurrences_completed;
      loan.next_payment_date = updatedLoan.next_payment_date;

      const transaction = {
        type: 'payment',
        loan_id: loan.id,
        amount: paymentAmount,
        date: todayIso,
        category_id: 'loan_payment',
        category_name: 'Loan Payment',
        payment_method: 'loan',
        payment_method_id: loan.id,
        payment_method_name: loanName,
        description: `Auto-payment for loan ${loanName} from reserved fund ${fundToUse.name}`,
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

      const previousCash = availableCash;
      const newCash = previousCash - paymentAmount;
      if (typeof onUpdateCash === 'function') {
        await onUpdateCash(newCash);
      }
      availableCash = newCash;

      await logActivity(
        'payment',
        'loan',
        loan.id,
        loanName,
        `Auto-payment of ${formatCurrency(paymentAmount)} for ${loanName} from reserved fund ${fundToUse.name}`,
        {
          entity: { ...loan },
          paymentAmount,
          date: todayIso,
          previousCash,
          affectedFund: fundSnapshot,
          transactionId: savedTransaction?.id,
          isAutoPayment: true
        }
      );

      results.processed.push({
        loan: loanName,
        amount: paymentAmount,
        fund: fundToUse.name
      });
    } catch (error) {
      console.error(`Error processing loan ${loanName}:`, error);
      results.failed.push({
        loan: loanName,
        reason: error.message || 'Unknown error'
      });
    }
  }

  return results;
};

export const processOverdueCreditCards = async (creditCards, reservedFunds, availableCash, onUpdateCash) => {
  const { date: today, iso: todayIso } = todayInfo();

  const results = {
    processed: [],
    failed: [],
    skipped: []
  };

  for (const card of creditCards) {
    const cardName = card?.name || 'Unnamed Card';

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

    try {
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
          affectedFund: fundSnapshot,
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
        await onUpdateCash(newCash);
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
