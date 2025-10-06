import { supabase } from './supabase';

const TABLE_MAP = {
  creditCards: 'credit_cards',
  loans: 'loans',
  reservedFunds: 'reserved_funds',
  income: 'income',
  transactions: 'transactions',
  categories: 'categories',
  settings: 'settings'
};

export const dbOperation = async (storeName, operation, data = null) => {
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
          
          // Convert settings format
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
          // Check if settings exist
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
          
          // Remove undefined values
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
        
        // Add user_id to data
        const insertData = { ...data, user_id: user.id };
        
        const { data: result, error } = await supabase
          .from(tableName)
          .upsert(insertData)
          .select()
          .single();
        
        if (error) throw error;
        return result;
      }

      case 'delete': {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', data)
          .eq('user_id', user.id);
        
        if (error) throw error;
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

// For backward compatibility with IndexedDB
export const initDB = async () => {
  // No-op for Supabase
  return Promise.resolve();
};
