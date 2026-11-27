// Saving a purchase, a card payment or a loan payment, with everything that goes with it: the due date that moves on,
// the next payment day, a service fee, and the entry in the activity list. Every form that records one of these
// goes through here.
import { recordExpense, recordCardPayment, recordLoanPayment, recordThroughFee, paymentSourceOf, cardDueAfterPayment } from './money';
import { logActivity } from './activityLogger';
import { showToast } from './toast';
import { formatCurrency, predictNextDate } from './helpers';

// A purchase from a bank account or on a card.
export async function saveExpense(formData, { creditCards, bankAccounts, categories }) {
  const amount = parseFloat(formData.amount);
  const category = categories?.find(c => String(c.id) === String(formData.categoryId));
  const method = formData.paymentMethod;
  const source = `${method}:${formData.paymentMethodId}`;

  let entity;
  if (method === 'credit_card') {
    const card = creditCards?.find(c => String(c.id) === String(formData.paymentMethodId));
    if (!card) throw new Error('Credit card not found');
    entity = { type: 'card', id: card.id, name: card.name, snap: { cardId: card.id, previousBalance: card.balance, isGiftCard: card.is_gift_card } };
  } else if (method === 'bank_account') {
    const account = bankAccounts?.find(a => String(a.id) === String(formData.paymentMethodId));
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
    extra: formData.extra,
    key: formData.key
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


  return {
    success: true,
    transactionId,
    paymentMethodString: source,
    description: formData.description
  };
}

// The balance an account ended on in a saved money step (from what the server reports it moved).
const balanceAfter = (res, table, id) => (res?.legs || []).find((l) => l.table === table && String(l.id) === String(id))?.after;

// A payment on a card: what is owed goes down and the due date moves on once the statement is covered.
export async function saveCardPayment(formData, { creditCards, bankAccounts, loans }) {
  const card = creditCards?.find(c => String(c.id) === String(formData.paymentMethodId));
  if (!card) throw new Error('Credit card not found');

  const amount = parseFloat(formData.amount);
  const { sourceType, sourceId, source, sourceName } = paymentSourceOf(formData, { bankAccounts, creditCards });

  const nextDue = cardDueAfterPayment(card, formData.date, (Number(card.balance) || 0) - amount);
  const res = await recordCardPayment({
    cardId: card.id,
    amount,
    source,
    date: formData.date,
    key: formData.key,
    description: formData.description || `${card.name} payment`,
    updates: [{ table: 'credit_cards', id: card.id, values: { last_payment_date: formData.date, last_payment_amount: amount,
      ...(nextDue ? { due_date: nextDue } : {}) } }],
    extra: {
      type: 'payment',
      category_id: formData.category || 'credit_card_payment',
      category_name: 'Credit card payment',
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
      newBalance: balanceAfter(res, 'credit_cards', card.id),
      paymentSource: sourceType,
      paymentSourceId: sourceId,
      paymentSourceName: sourceName,
      paymentMethodName: sourceName,
      transactionId,
      isManualPayment: true
    }
  );


  return { success: true, transactionId, cardName: card.name, amount };
}

// Loan payment processing
export async function saveLoanPayment(formData, { loans, bankAccounts, creditCards }) {
  const loan = loans?.find(l => String(l.id) === String(formData.paymentMethodId));
  if (!loan) throw new Error('Loan not found');

  const amount = parseFloat(formData.amount);
  const { sourceType, sourceId, source, sourceName } = paymentSourceOf(formData, { bankAccounts, creditCards });

  // A smaller extra payment is not the regular one: it leaves the next due day and the count where they are.
  const regular = !(Number(loan.payment_amount) > 0) || amount >= Number(loan.payment_amount) - 0.005;
  const recurring = regular && loan.frequency && loan.frequency !== 'onetime';
  let nextPaymentDate = loan.next_payment_date;
  if (recurring) {
    // The day of the month comes from the loan's start, so a short month does not shift later payments.
    const startDay = loan.start_date ? Number(String(loan.start_date).slice(8, 10)) || undefined : undefined;
    nextPaymentDate = predictNextDate(loan.next_payment_date, loan.frequency, startDay);
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
    key: formData.key,
    description: formData.description || `${loan.name} payment`,
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
      category_name: 'Loan payment',
      payment_method_name: sourceName
    }
  }, { bankAccounts, creditCards, loans });
  const transactionId = res.transaction?.id;
  // Paid by card through a service that charges a fee: the fee is recorded as its own purchase on that card.
  try {
    await recordThroughFee({ item: loan, amount, source, date: formData.date, forId: transactionId }, { bankAccounts, creditCards });
  } catch (e) {
    showToast.error(`The payment is saved, but the fee was not: ${e.message} Add it as a purchase.`);
  }

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
      newBalance: balanceAfter(res, 'loans', loan.id),
      paymentSource: sourceType,
      paymentSourceId: sourceId,
      paymentSourceName: sourceName,
      paymentMethodName: sourceName,
      transactionId,
      nextPaymentDate
    }
  );


  return { success: true, transactionId, loanName: loan.name, amount };
}
