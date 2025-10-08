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
          await dbOperation(getStoreNameFromEntityType(entity_type), 'put', snapshot, { skipActivityLog: true });
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