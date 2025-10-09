import { supabase } from './supabase';
import { logActivity } from './activityLogger';

const TABLE_MAP = {
  creditCards: 'credit_cards',
  loans: 'loans',
  reservedFunds: 'reserved_funds',
  income: 'income',
  transactions: 'transactions',
  categories: 'categories',
  settings: 'settings'
};

const ENTITY_TYPE_MAP = {
  creditCards: 'card',
  loans: 'loan',
  reservedFunds: 'fund',
  income: 'income',
  transactions: 'transaction'
};

export const dbOperation = async (storeName, operation, data = null, logOptions = {}) => {
  const tableName = TABLE_MAP[storeName] || storeName;
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  try {
    switch (operation) {
      case 'getAll': {
        if (tableName === 'settings') {
          const { data: result, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('user_id', user.id)
            .single();
          
          if (error && error.code !== 'PGRST116') throw error;
          
          if (result) {
            return [
              { key: 'availableCash', value: result.available_cash },
              { key: 'darkMode', value: result.dark_mode },
              { key: 'alertSettings', value: result.alert_settings }
            ];
          }
          return [];
        }
        
        const { data: results, error } = await supabase
          .from(tableName)
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        return results || [];
      }

      case 'get': {
        if (tableName === 'settings') {
          const { data: result, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('user_id', user.id)
            .single();
          
          if (error && error.code !== 'PGRST116') throw error;
          
          if (result && data === 'availableCash') {
            return { key: 'availableCash', value: result.available_cash };
          }
          return null;
        }
        
        const { data: result, error } = await supabase
          .from(tableName)
          .select('*')
          .eq('id', data)
          .eq('user_id', user.id)
          .single();
        
        if (error) throw error;
        return result;
      }

      case 'put': {
        if (tableName === 'settings') {
          const { data: existing } = await supabase
            .from(tableName)
            .select('user_id')
            .eq('user_id', user.id)
            .single();
          
          const settingsData = {
            user_id: user.id,
            available_cash: data.key === 'availableCash' ? data.value : undefined,
            dark_mode: data.key === 'darkMode' ? data.value : undefined,
            alert_settings: data.key === 'alertSettings' ? data.value : undefined
          };
          
          Object.keys(settingsData).forEach(key => 
            settingsData[key] === undefined && delete settingsData[key]
          );
          
          if (existing) {
            const { error } = await supabase
              .from(tableName)
              .update(settingsData)
              .eq('user_id', user.id);
            
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from(tableName)
              .insert(settingsData);
            
            if (error) throw error;
          }
          return data;
        }
        
        // Check if item exists for edit tracking
        let isNew = true;
        let previousData = null;
        
        if (data.id && !logOptions.skipActivityLog) {
          const { data: existing } = await supabase
            .from(tableName)
            .select('*')
            .eq('id', data.id)
            .eq('user_id', user.id)
            .single();
          
          if (existing) {
            isNew = false;
            previousData = existing;
          }
        }
        
        const insertData = { ...data, user_id: user.id };
        
        const { data: result, error } = await supabase
          .from(tableName)
          .upsert(insertData)
          .select()
          .single();
        
        if (error) throw error;
        
        // Log activity
        if (!logOptions.skipActivityLog && ENTITY_TYPE_MAP[storeName]) {
          const entityName = data.name || data.source || 'Item';
          const entityType = ENTITY_TYPE_MAP[storeName];
          
          if (isNew) {
            await logActivity(
              'add',
              entityType,
              result.id,
              entityName,
              `Added ${entityType}: ${entityName}`,
              null
            );
          } else {
            await logActivity(
              'edit',
              entityType,
              result.id,
              entityName,
              `Edited ${entityType}: ${entityName}`,
              previousData
            );
          }
        }
        
        return result;
      }

      case 'delete': {
        // Get the item before deleting for snapshot
        let deletedItem = null;
        if (!logOptions.skipActivityLog && ENTITY_TYPE_MAP[storeName]) {
          const { data: item } = await supabase
            .from(tableName)
            .select('*')
            .eq('id', data)
            .eq('user_id', user.id)
            .single();
          
          deletedItem = item;
        }
        
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', data)
          .eq('user_id', user.id);
        
        if (error) throw error;
        
        // Log activity
        if (deletedItem && !logOptions.skipActivityLog) {
          const entityType = ENTITY_TYPE_MAP[storeName];
          let entityName = deletedItem.name || deletedItem.source || 'Item';
          if (entityType === 'transaction') {
            entityName = deletedItem.description ||
              deletedItem.income_source ||
              deletedItem.category_name ||
              deletedItem.type ||
              `Transaction ${deletedItem.id || ''}`.trim();
          }
          let amountText = '';
          if (deletedItem.amount !== undefined && deletedItem.amount !== null && deletedItem.amount !== '') {
            const numericAmount = Number(deletedItem.amount);
            if (!Number.isNaN(numericAmount) && numericAmount !== 0) {
              amountText = ` (${numericAmount.toFixed(2)})`;
            }
          }
          const description = entityType === 'transaction'
            ? `Deleted transaction: ${entityName}${amountText}`
            : `Deleted ${entityType}: ${entityName}`;

          await logActivity(
            'delete',
            entityType,
            deletedItem.id,
            entityName,
            description,
            deletedItem
          );
        }
        
        return true;
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    console.error(`Database operation error (${operation} on ${tableName}):`, error);
    throw error;
  }
};

export const initDB = async () => {
  return Promise.resolve();
};

export const deleteAllUserData = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const tables = ['credit_cards', 'loans', 'reserved_funds', 'income', 'transactions', 'categories', 'activities'];

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('user_id', user.id);

    if (error && error.code !== 'PGRST116') throw error;
  }

  await supabase
    .from('settings')
    .delete()
    .eq('user_id', user.id);
};
