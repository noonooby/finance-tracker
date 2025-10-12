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

const ACTIVITY_AMOUNT_FIELDS = [
  'amount',
  'balance',
  'payment_amount',
  'original_amount',
  'purchase_amount',
  'credit_limit',
  'available_cash',
  'total'
];

const formatAmountText = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `$${numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const findRecordAmount = (record = {}) => {
  for (const field of ACTIVITY_AMOUNT_FIELDS) {
    if (record[field] !== undefined && record[field] !== null) {
      const numeric = Number(record[field]);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }
  return null;
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
          const entityName = (result?.name ?? data.name) || (result?.source ?? data.source) || 'Item';
          const entityType = ENTITY_TYPE_MAP[storeName];
          const currentAmount = findRecordAmount(result);
          const previousAmount = previousData ? findRecordAmount(previousData) : null;
          const currentAmountText = formatAmountText(currentAmount);
          const previousAmountText = formatAmountText(previousAmount);
          
          if (isNew) {
            const descriptionSuffix = currentAmountText ? ` (${currentAmountText})` : '';
            await logActivity(
              'add',
              entityType,
              result.id,
              entityName,
              `Added ${entityType}: ${entityName}${descriptionSuffix}`,
              null
            );
          } else {
            let editDescription = `Edited ${entityType}: ${entityName}`;
            if (currentAmountText) {
              if (previousAmount !== null && previousAmount !== currentAmount && previousAmountText) {
                editDescription += ` (${previousAmountText} → ${currentAmountText})`;
              } else if (!editDescription.includes(currentAmountText)) {
                editDescription += ` (${currentAmountText})`;
              }
            }
            await logActivity(
              'edit',
              entityType,
              result.id,
              entityName,
              editDescription,
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

/**
 * ============================================
 * BANK ACCOUNTS OPERATIONS
 * Phase 1: Database layer for bank accounts
 *
 * SAFETY NOTES:
 * - These functions are NEW and don't modify existing operations
 * - They use the same dbOperation pattern as existing code
 * - They follow existing authentication patterns
 * - No existing functions are modified
 * ============================================
 */

/**
 * Get all bank accounts for the current user
 * @returns {Promise<Array>} Array of bank account objects
 * @throws {Error} If not authenticated or database error
 */
export async function getAllBankAccounts() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false }) // Primary account first
      .order('created_at', { ascending: true });

    if (error) throw error;

    console.log('📊 Loaded bank accounts:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching bank accounts:', error);
    throw error;
  }
}

/**
 * Get a single bank account by ID
 * @param {string} accountId - The bank account ID
 * @returns {Promise<Object>} Bank account object
 * @throws {Error} If account not found or not authorized
 */
export async function getBankAccount(accountId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('❌ Error fetching bank account:', error);
    throw error;
  }
}

/**
 * Get the primary bank account
 * Used as default for transactions when no account is specified
 * @returns {Promise<Object|null>} Primary bank account or null if none exists
 */
export async function getPrimaryBankAccount() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .maybeSingle(); // Use maybeSingle() to avoid error when no rows

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('❌ Error fetching primary bank account:', error);
    return null;
  }
}

/**
 * Create or update a bank account
 * IMPORTANT: If setting as primary, this will unset other primary accounts
 *
 * @param {Object} accountData - Bank account data
 * @param {string} accountData.id - Account ID (required for updates)
 * @param {string} accountData.name - Account name
 * @param {number} accountData.balance - Account balance
 * @param {string} accountData.account_type - 'checking', 'savings', 'investment', 'cash'
 * @param {boolean} accountData.is_primary - Whether this is the primary account
 * @param {string} [accountData.institution] - Bank name (optional)
 * @param {string} [accountData.notes] - Additional notes (optional)
 * @returns {Promise<Object>} Created/updated bank account
 */
export async function upsertBankAccount(accountData) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // SAFETY CHECK: If setting as primary, unset other primary accounts first
    if (accountData.is_primary) {
      await supabase
        .from('bank_accounts')
        .update({ is_primary: false })
        .eq('user_id', user.id)
        .neq('id', accountData.id || 'new-account'); // Don't affect current account
    }

    const payload = {
      ...accountData,
      user_id: user.id,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('bank_accounts')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Bank account saved:', data.name);
    return data;
  } catch (error) {
    console.error('❌ Error upserting bank account:', error);
    throw error;
  }
}

/**
 * Delete a bank account
 *
 * IMPORTANT SAFETY CHECKS:
 * - Cannot delete primary account (must set another as primary first)
 * - Foreign key constraints will set related records to NULL:
 *   - reserved_funds.source_account_id → NULL
 *   - income.deposit_account_id → NULL
 *
 * @param {string} accountId - The bank account ID to delete
 * @throws {Error} If trying to delete primary account
 */
export async function deleteBankAccount(accountId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // SAFETY CHECK: Don't allow deleting primary account
    const account = await getBankAccount(accountId);
    if (account?.is_primary) {
      throw new Error('Cannot delete primary account. Set another account as primary first.');
    }

    const { error } = await supabase
      .from('bank_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', user.id);

    if (error) throw error;

    console.log('🗑️ Bank account deleted:', account.name);
  } catch (error) {
    console.error('❌ Error deleting bank account:', error);
    throw error;
  }
}

/**
 * Update bank account balance
 * Used for deposits, withdrawals, and balance corrections
 *
 * @param {string} accountId - The bank account ID
 * @param {number} newBalance - The new balance
 * @returns {Promise<Object>} Updated bank account
 */
export async function updateBankAccountBalance(accountId, newBalance) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('bank_accounts')
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', accountId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    console.log('💰 Balance updated:', data.name, '→', newBalance);
    return data;
  } catch (error) {
    console.error('❌ Error updating bank account balance:', error);
    throw error;
  }
}

/**
 * Get total balance across all bank accounts
 * This replaces the old single "availableCash" concept
 *
 * @returns {Promise<number>} Total balance across all accounts
 */
export async function getTotalBankBalance() {
  try {
    const accounts = await getAllBankAccounts();
    const total = accounts.reduce((sum, account) => {
      return sum + (parseFloat(account.balance) || 0);
    }, 0);

    console.log('💵 Total bank balance:', total);
    return total;
  } catch (error) {
    console.error('❌ Error calculating total bank balance:', error);
    return 0;
  }
}

/**
 * Transfer money between bank accounts
 * Creates a transaction record and updates both account balances
 *
 * @param {string} fromAccountId - Source account ID
 * @param {string} toAccountId - Destination account ID
 * @param {number} amount - Amount to transfer
 * @param {string} [description] - Transfer description
 * @returns {Promise<Object>} Transfer details
 * @throws {Error} If insufficient funds or accounts not found
 */
export async function transferBetweenAccounts(fromAccountId, toAccountId, amount, description = 'Account Transfer') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      throw new Error('Transfer amount must be a positive number');
    }

    // Get both accounts
    const fromAccount = await getBankAccount(fromAccountId);
    const toAccount = await getBankAccount(toAccountId);

    if (!fromAccount || !toAccount) {
      throw new Error('One or both accounts not found');
    }

    const fromBalance = Number(fromAccount.balance) || 0;
    const toBalance = Number(toAccount.balance) || 0;
    const normalizedAmount = Math.round(amountValue * 100) / 100;

    // Check sufficient funds
    if (fromBalance < normalizedAmount) {
      throw new Error(
        `Insufficient funds in ${fromAccount.name}. `
        + `Available: $${fromBalance.toFixed(2)}, Requested: $${normalizedAmount.toFixed(2)}`
      );
    }

    const newFromBalance = Math.max(0, Math.round((fromBalance - normalizedAmount) * 100) / 100);
    const newToBalance = Math.round((toBalance + normalizedAmount) * 100) / 100;

    // Update balances and capture updated records
    const updatedFromAccount = await updateBankAccountBalance(fromAccountId, newFromBalance);
    const updatedToAccount = await updateBankAccountBalance(toAccountId, newToBalance);

    // Create transaction record for audit trail
    const transaction = {
      type: 'transfer',
      amount: normalizedAmount,
      date: new Date().toISOString().split('T')[0],
      description: description,
      notes: `Transfer from ${fromAccount.name} to ${toAccount.name}`,
      payment_method: 'transfer',
      payment_method_id: fromAccountId,
      payment_method_name: fromAccount.name,
      status: 'active',
      undone_at: null
    };

    const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

    console.log('💸 Transfer complete:', fromAccount.name, '→', toAccount.name, normalizedAmount);

    return {
      fromAccount: updatedFromAccount?.name || fromAccount.name,
      toAccount: updatedToAccount?.name || toAccount.name,
      fromAccountId,
      toAccountId,
      fromBalance: Number(updatedFromAccount?.balance) || newFromBalance,
      toBalance: Number(updatedToAccount?.balance) || newToBalance,
      transactionId: savedTransaction?.id,
      amount: normalizedAmount,
      description
    };
  } catch (error) {
    console.error('❌ Error transferring between accounts:', error);
    throw error;
  }
}

// ============================================
// END OF BANK ACCOUNTS OPERATIONS
// ============================================
