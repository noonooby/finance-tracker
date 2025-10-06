import { supabase } from './supabase';
import { dbOperation } from './db';

export const logActivity = async (actionType, entityType, entityId, entityName, description, snapshot = null) => {
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
      description: description,
      snapshot: snapshot,
      created_at: new Date().toISOString()
    };

    await supabase.from('activities').insert(activity);
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

export const undoActivity = async (activity, onUpdate) => {
  try {
    const { action_type, entity_type, entity_id, snapshot } = activity;

    switch (action_type) {
      case 'add':
        // Delete the added item
        await dbOperation(getStoreNameFromEntityType(entity_type), 'delete', entity_id);
        break;

      case 'edit':
        // Restore the previous state
        if (snapshot) {
          await dbOperation(getStoreNameFromEntityType(entity_type), 'put', snapshot);
        }
        break;

      case 'delete':
        // Restore the deleted item
        if (snapshot) {
          await dbOperation(getStoreNameFromEntityType(entity_type), 'put', snapshot);
        }
        break;

      case 'payment':
        // Reverse the payment
        if (snapshot) {
          // Restore card/loan balance
          await dbOperation(getStoreNameFromEntityType(entity_type), 'put', snapshot.entity);
          
          // Restore available cash
          if (snapshot.previousCash !== undefined) {
            await dbOperation('settings', 'put', { key: 'availableCash', value: snapshot.previousCash });
          }
          
          // Restore reserved fund if it was affected
          if (snapshot.affectedFund) {
            await dbOperation('reservedFunds', 'put', snapshot.affectedFund);
          }
        }
        break;

      default:
        console.error('Unknown action type for undo:', action_type);
        return false;
    }

    // Delete the activity record after successful undo
    await supabase.from('activities').delete().eq('id', activity.id);

    // Trigger data reload
    if (onUpdate) await onUpdate();

    return true;
  } catch (error) {
    console.error('Error undoing activity:', error);
    throw error;
  }
};

const getStoreNameFromEntityType = (entityType) => {
  const map = {
    'card': 'creditCards',
    'loan': 'loans',
    'fund': 'reservedFunds',
    'income': 'income'
  };
  return map[entityType] || entityType;
};
