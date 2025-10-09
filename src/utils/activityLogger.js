import { supabase } from './supabase';
import { dbOperation } from './db';

/**
 * Logs an activity to the Supabase "activities" table.
 * @param {string} actionType - add | edit | delete | payment
 * @param {string} entityType - card | loan | fund | income
 * @param {string} entityId - affected record ID
 * @param {string} entityName - human-readable entity name
 * @param {string} description - readable description for activity feed
 * @param {object|null} snapshot - optional object with previous state for undo
 */
export const logActivity = async (
  actionType,
  entityType,
  entityId,
  entityName,
  description,
  snapshot = null
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const activity = {
      id: crypto.randomUUID(),
      user_id: user.id,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      description,
      snapshot,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('activities').insert(activity);
    if (error) throw error;

  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

/**
 * Undoes a previously logged activity by restoring or deleting data
 * depending on the original action.
 * Used when the user clicks "Undo" in the Activity Feed.
 */
export const undoActivity = async (activity, onUpdate) => {
  try {
    const { action_type, entity_type, entity_id, snapshot } = activity;

    const markTransactionUndone = async (transactionId) => {
      if (!transactionId) return;
      try {
        const transaction = await dbOperation('transactions', 'get', transactionId);
        if (transaction) {
          await dbOperation('transactions', 'put', {
            ...transaction,
            status: 'undone',
            undone_at: new Date().toISOString()
          }, { skipActivityLog: true });
        }
      } catch (transactionError) {
        console.warn('Unable to mark transaction as undone:', transactionError);
      }
    };

    switch (action_type) {
      case 'add':
        // Undo add = delete the newly created item
        await dbOperation(getStoreNameFromEntityType(entity_type), 'delete', entity_id, { skipActivityLog: true });
        break;

      case 'edit':
        // Undo edit = restore previous snapshot
        if (snapshot) {
          await dbOperation(getStoreNameFromEntityType(entity_type), 'put', snapshot, { skipActivityLog: true });
        }
        break;

      case 'delete':
        // Undo delete = reinsert deleted snapshot
        if (snapshot) {
          let snapshotData = snapshot;
          if (entity_type === 'income') {
            const { previousCash, linkedTransactions, ...restoredIncome } = snapshot;
            snapshotData = restoredIncome;
          }

          await dbOperation(getStoreNameFromEntityType(entity_type), 'put', snapshotData, { skipActivityLog: true });

          if (entity_type === 'transaction') {
            await applyTransactionEffects(snapshot);
          }

          if (entity_type === 'income') {
            if (snapshot.linkedTransactions?.length) {
              for (const trx of snapshot.linkedTransactions) {
                try {
                  await dbOperation('transactions', 'put', {
                    ...trx,
                    status: 'active',
                    undone_at: null
                  }, { skipActivityLog: true });
                } catch (transactionError) {
                  console.warn('Failed to restore linked income transaction:', transactionError);
                }
              }
            }
            if (snapshot.previousCash !== undefined) {
              await dbOperation('settings', 'put', {
                key: 'availableCash',
                value: snapshot.previousCash,
              });
            }
          }
        }
        break;

      case 'expense':
        if (snapshot) {
          if (entity_type === 'card' && snapshot.cardId) {
            try {
              const card = await dbOperation('creditCards', 'get', snapshot.cardId);
              if (card) {
                const previousBalance = snapshot.previousBalance;
                const amount = Number(snapshot.amount) || 0;
                const currentBalance = Number(card.balance) || 0;
                const newBalance = previousBalance !== undefined
                  ? Number(previousBalance)
                  : Math.max(0, currentBalance - amount);
                await dbOperation('creditCards', 'put', { ...card, balance: newBalance }, { skipActivityLog: true });
              }
            } catch (cardError) {
              console.warn('Unable to restore card balance while undoing expense:', cardError);
            }
          }

          if (snapshot.previousCash !== undefined) {
            await dbOperation('settings', 'put', {
              key: 'availableCash',
              value: snapshot.previousCash,
            });
          }

          if (snapshot.transactionId) {
            await markTransactionUndone(snapshot.transactionId);
          }
        }
        break;

      case 'income':
        await dbOperation('income', 'delete', entity_id, { skipActivityLog: true });
        if (snapshot) {
          if (snapshot.previousCash !== undefined) {
            await dbOperation('settings', 'put', {
              key: 'availableCash',
              value: snapshot.previousCash,
            });
          }

          if (snapshot.transactionId) {
            await markTransactionUndone(snapshot.transactionId);
          }
        }
        break;

      case 'payment':
        // Undo payment = restore loan, reserved fund, and cash
        if (snapshot) {
          // Restore the loan or card entity
          if (snapshot.entity) {
            await dbOperation(getStoreNameFromEntityType(entity_type), 'put', snapshot.entity, { skipActivityLog: true });
          }

          // Restore the user's available cash
          if (snapshot.previousCash !== undefined) {
            await dbOperation('settings', 'put', {
              key: 'availableCash',
              value: snapshot.previousCash,
            });
          }

          // Restore any affected reserved fund
          if (snapshot.affectedFund) {
            await dbOperation('reservedFunds', 'put', snapshot.affectedFund, { skipActivityLog: true });
          }

          // Mark related transaction as undone for visibility in history
          if (snapshot.transactionId) {
            await markTransactionUndone(snapshot.transactionId);
          }
        }
        break;

      default:
        console.warn('Unknown action type for undo:', action_type);
        return false;
    }

    // Remove the activity entry after undo
    await supabase.from('activities').delete().eq('id', activity.id);

    // Refresh UI
    if (onUpdate) await onUpdate();

    return true;
  } catch (error) {
    console.error('Error undoing activity:', error);
    throw error;
  }
};

/**
 * Maps entity_type (as stored in activity logs) back to dbOperation store names.
 */
const getStoreNameFromEntityType = (entityType) => {
  const map = {
    card: 'creditCards',
    loan: 'loans',
    fund: 'reservedFunds',
    income: 'income',
    transaction: 'transactions',
  };
  return map[entityType] || entityType;
};

const isPaymentType = (type) =>
  type === 'payment' || type === 'loan_payment' || type === 'credit_card_payment';

const resolvePaymentSubtype = (transaction) => {
  if (transaction.subtype) return transaction.subtype;
  if (transaction.type === 'credit_card_payment') return 'credit_card';
  if (transaction.type === 'loan_payment') return 'loan';
  if (transaction.payment_method === 'credit_card') return 'credit_card';
  if (transaction.payment_method === 'loan') return 'loan';
  return null;
};

const applyTransactionEffects = async (transaction) => {
  if (!transaction || transaction.status === 'undone') return;
  const amount = Number(transaction.amount) || 0;
  if (amount <= 0) return;

  const normalizeBalance = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const updateCardBalance = async (cardId, delta) => {
    if (!cardId) return;
    let card = null;
    try {
      card = await dbOperation('creditCards', 'get', cardId);
    } catch (cardError) {
      console.warn('Unable to load card while restoring transaction:', cardError);
    }
    if (!card) return;
    const currentBalance = normalizeBalance(card.balance);
    const newBalance = Math.max(0, currentBalance + delta);
    await dbOperation('creditCards', 'put', { ...card, balance: newBalance }, { skipActivityLog: true });
  };

  const updateLoanBalance = async (loanId, delta) => {
    if (!loanId) return;
    let loan = null;
    try {
      loan = await dbOperation('loans', 'get', loanId);
    } catch (loanError) {
      console.warn('Unable to load loan while restoring transaction:', loanError);
    }
    if (!loan) return;
    const currentBalance = normalizeBalance(loan.balance);
    const newBalance = currentBalance + delta;
    await dbOperation('loans', 'put', { ...loan, balance: newBalance }, { skipActivityLog: true });
  };

  let cashDelta = 0;

  if (transaction.type === 'income') {
    cashDelta += amount;
  } else if (transaction.type === 'expense') {
    if (transaction.payment_method === 'cash') {
      cashDelta -= amount;
    } else if (transaction.payment_method === 'credit_card') {
      const cardId = transaction.card_id || transaction.payment_method_id;
      await updateCardBalance(cardId, amount);
    }
  } else if (isPaymentType(transaction.type)) {
    const paymentSubtype = resolvePaymentSubtype(transaction);
    if (paymentSubtype === 'credit_card') {
      const cardId = transaction.card_id || transaction.payment_method_id;
      await updateCardBalance(cardId, -amount);
      cashDelta -= amount;
    } else if (paymentSubtype === 'loan') {
      const loanId = transaction.loan_id || transaction.payment_method_id;
      await updateLoanBalance(loanId, -amount);
      cashDelta -= amount;
    } else if (transaction.payment_method === 'cash') {
      cashDelta -= amount;
    }
  } else {
    if (transaction.payment_method === 'cash') {
      cashDelta -= amount;
    } else if (transaction.payment_method === 'credit_card') {
      const cardId = transaction.card_id || transaction.payment_method_id;
      await updateCardBalance(cardId, amount);
    } else if (transaction.payment_method === 'loan') {
      const loanId = transaction.loan_id || transaction.payment_method_id;
      await updateLoanBalance(loanId, -amount);
      cashDelta -= amount;
    }
  }

  if (cashDelta !== 0) {
    let currentCash = 0;
    try {
      const currentCashSetting = await dbOperation('settings', 'get', 'availableCash');
      if (currentCashSetting && currentCashSetting.value !== undefined) {
        currentCash = Number(currentCashSetting.value) || 0;
      }
    } catch (cashError) {
      console.warn('Unable to load cash balance while restoring transaction:', cashError);
    }
    const newCash = currentCash + cashDelta;
    await dbOperation('settings', 'put', { key: 'availableCash', value: newCash });
  }
};
