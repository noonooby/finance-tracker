import { server } from './server';
import { dbOperation } from './db';
import { reverseTransaction } from './money';

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
    const { data: { user } } = await server.auth.getUser();
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

    const { error } = await server.from('activities').insert(activity);
    if (error) throw error;

  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

/**
 * Undoes a previously logged activity.
 * Anything that moved money is undone by reversing its transaction on the server: exactly what it moved
 * goes back, on the same accounts. Records that are not money (accounts, categories, schedules, settings)
 * are restored or removed as before.
 */
export const undoActivity = async (activity, onUpdate) => {
  try {
    const { action_type, entity_type, entity_id, snapshot } = activity;

    const reverseMoney = async () => {
      if (snapshot?.transactionId) await reverseTransaction(snapshot.transactionId);
      for (const id of snapshot?.fundTransactionIds || []) {
        if (id) await reverseTransaction(id);
      }
    };
    const hasMoney = !!(snapshot?.transactionId || snapshot?.fundTransactionIds?.length);
    const warnNoRecord = () =>
      console.warn('This entry has no recorded transaction, so balances were not changed by undo:', action_type, entity_id);

    switch (action_type) {
      case 'add':
        if (entity_type === 'bank_account') {
          const { deleteBankAccount } = await import('./db');
          await deleteBankAccount(entity_id);
        } else if (entity_type === 'income') {
          if (hasMoney) await reverseMoney(); else if (snapshot?.amount) warnNoRecord();
          await dbOperation('income', 'delete', entity_id, { skipActivityLog: true });
        } else if (entity_type === 'card' && snapshot?.isGiftCard) {
          if (hasMoney) await reverseMoney(); else if (snapshot.amount) warnNoRecord();
          await dbOperation('creditCards', 'delete', entity_id, { skipActivityLog: true });
        } else {
          await dbOperation(getStoreNameFromEntityType(entity_type), 'delete', entity_id, { skipActivityLog: true });
        }
        break;

      case 'edit':
        // Undo edit = restore previous snapshot
        if (snapshot) {
          if (entity_type === 'bank_account' && snapshot.previous) {
            const { upsertBankAccount } = await import('./db');
            await upsertBankAccount(snapshot.previous);
          } else {
            // Determine correct snapshot to restore (some edits use {previous, updated})
            const restored = { ...(snapshot.previous || snapshot) };
            if (!restored.id && entity_id) restored.id = entity_id;
            if (!restored.name && activity.entity_name) restored.name = activity.entity_name;
            await dbOperation(getStoreNameFromEntityType(entity_type), 'put', restored, { skipActivityLog: true });
          }
        }
        break;

      case 'delete':
        // Undo delete = put the record back. Money that the deletion returned is not moved again here:
        // a deleted transaction comes back marked 'undone', so it shows in history without changing balances.
        if (snapshot) {
          let snapshotData = snapshot;
          if (entity_type === 'income') {
            const {
              previousCash, linkedTransactions, depositTarget, depositAccountId, depositAccountName,
              depositDestination, previousBalance, newBalance, incomeId, transactionId,
              ...restoredIncome
            } = snapshot;
            snapshotData = restoredIncome;
          }

          if (entity_type === 'bank_account') {
            const { upsertBankAccount } = await import('./db');
            await upsertBankAccount(snapshotData);
          } else {
            const restored = { ...snapshotData };
            if (!restored.id && entity_id) restored.id = entity_id;
            if (entity_type === 'transaction') {
              restored.status = 'undone';
              restored.undone_at = restored.undone_at || new Date().toISOString();
            }
            await dbOperation(getStoreNameFromEntityType(entity_type), 'put', restored, { skipActivityLog: true });
          }
        }
        break;

      case 'income_occurrence': {
        const { undoIncomeOccurrence } = await import('./schedules');
        await undoIncomeOccurrence(entity_id);
        break;
      }

      case 'create_income_schedule': {
        const { deleteIncomeSchedule } = await import('./schedules');
        await deleteIncomeSchedule(entity_id);
        break;
      }

      case 'loan_payment': {
        const { undoLoanPayment } = await import('./schedules');
        await undoLoanPayment(entity_id);
        break;
      }

      case 'credit_card_payment': {
        const { undoCreditCardPayment } = await import('./schedules');
        await undoCreditCardPayment(entity_id);
        break;
      }

      case 'income':
        if (snapshot?.isAutoDeposit && snapshot?.scheduleId) {
          const { undoIncomeOccurrence } = await import('./schedules');
          await undoIncomeOccurrence(entity_id);
        } else {
          if (hasMoney) await reverseMoney(); else warnNoRecord();
          await dbOperation('income', 'delete', entity_id, { skipActivityLog: true });
        }
        break;

      case 'payment':
        if (hasMoney) await reverseMoney(); else warnNoRecord();
        break;

      case 'expense':
      case 'transfer':
      case 'cash_withdrawal':
      case 'cash_deposit':
      case 'gift_card_reload':
      case 'gift_card_usage':
        if (hasMoney) await reverseMoney(); else warnNoRecord();
        break;

      case 'recalculate_cash':
        if (snapshot && snapshot.previousValue !== undefined) {
          await dbOperation('settings', 'put', { key: 'availableCash', value: snapshot.previousValue });
        }
        break;

      case 'edit_setting':
      case 'set_budget':
      case 'delete_budget':
        if (snapshot && snapshot.settingKey) {
          const { setSetting, setCategoryBudget, deleteCategoryBudget } = await import('./settingsManager');
          if (action_type === 'edit_setting') {
            if (snapshot.previousValue !== undefined) await setSetting(snapshot.settingKey, snapshot.previousValue);
          } else if (action_type === 'set_budget') {
            const previousBudget = snapshot.previousBudget || 0;
            if (previousBudget > 0) await setCategoryBudget(snapshot.categoryId, previousBudget);
            else await deleteCategoryBudget(snapshot.categoryId);
          } else if (snapshot.categoryId && snapshot.previousBudget) {
            await setCategoryBudget(snapshot.categoryId, snapshot.previousBudget);
          }
        }
        break;

      default:
        if (hasMoney) { await reverseMoney(); break; }
        console.warn('Unknown action type for undo:', action_type);
        return false;
    }

    // Remove the activity entry after undo
    await server.from('activities').delete().eq('id', activity.id);

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
    bank_account: 'bankAccounts',
  };
  return map[entityType] || entityType;
};
