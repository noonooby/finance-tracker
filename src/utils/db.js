import { server, api } from './server';
import { loadPrefs, savePrefs } from './prefs';
import { logActivity } from './activityLogger';
import { localDate } from './helpers';
import { recordTransfer, recordAdjustment } from './money';

const TABLE_MAP = {
  creditCards: 'credit_cards',
  loans: 'loans',
  income: 'income',
  transactions: 'transactions',
  categories: 'categories',
  settings: 'settings'
};

const ENTITY_TYPE_MAP = {
  creditCards: 'card',
  loans: 'loan',
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
  const { data: { user } } = await server.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  try {
    switch (operation) {
      case 'getAll': {
        if (tableName === 'settings') {
          const p = await loadPrefs();
          return [
            { key: 'darkMode', value: p.dark_mode },
            { key: 'alertSettings', value: p.alert_settings },
          ];
        }
        
        const { data: results, error } = await server
          .from(tableName)
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        return results || [];
      }

      case 'get': {
        if (tableName === 'settings') {
          const p = await loadPrefs();
          return data === 'darkMode' ? { key: 'darkMode', value: p.dark_mode } : data === 'alertSettings' ? { key: 'alertSettings', value: p.alert_settings } : null;
        }
        
        const { data: result, error } = await server
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
          const col = { darkMode: 'dark_mode', alertSettings: 'alert_settings' }[data.key];
          if (!col) throw new Error(`Unknown setting: ${data.key}`);
          await savePrefs({ [col]: data.value });
          return data;
        }
        
        // Check if item exists for edit tracking
        let isNew = true;
        let previousData = null;
        
        if (data.id && !logOptions.skipActivityLog) {
          const { data: existing } = await server
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
        if (!data.id) {
          data.id = crypto.randomUUID();
        }
        
        const insertData = { ...data, user_id: user.id };
        
        const { data: result, error } = await server
          .from(tableName)
          .upsert(insertData)
          .select()
          .single();
        
        if (error) throw error;
        
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
        let deletedItem = null;
        if (!logOptions.skipActivityLog && ENTITY_TYPE_MAP[storeName]) {
          const { data: item } = await server
            .from(tableName)
            .select('*')
            .eq('id', data)
            .eq('user_id', user.id)
            .single();
          
          deletedItem = item;
        }
        
        const { error } = await server
          .from(tableName)
          .delete()
          .eq('id', data)
          .eq('user_id', user.id);
        
        if (error) throw error;
        
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

// Deletes everything recorded for this account in one server step. The sign-in stays.
export const deleteAllUserData = () => api('/api/reset', { confirm: 'DELETE ALL MY DATA' });

export async function getAllBankAccounts() {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await server
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    throw error;
  }
}

export async function getBankAccount(accountId) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await server
      .from('bank_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching bank account:', error);
    throw error;
  }
}

export async function getPrimaryBankAccount() {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await server
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('Error fetching primary bank account:', error);
    return null;
  }
}

export async function upsertBankAccount(accountData) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (accountData.is_primary) {
      await server
        .from('bank_accounts')
        .update({ is_primary: false })
        .eq('user_id', user.id)
        .neq('id', accountData.id || 'new-account');
    }

    const payload = {
      ...accountData,
      user_id: user.id,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await server
      .from('bank_accounts')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error upserting bank account:', error);
    throw error;
  }
}

export async function deleteBankAccount(accountId) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const account = await getBankAccount(accountId);
    if (account?.is_primary) {
      throw new Error('Cannot delete primary account. Set another account as primary first.');
    }

    const { error } = await server
      .from('bank_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', user.id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting bank account:', error);
    throw error;
  }
}

// The user states what an account really holds: recorded as a 'Balance correction' so it can be undone.
export async function updateBankAccountBalance(accountId, newBalance) {
  const account = await getBankAccount(accountId);
  if (!account) throw new Error('That bank account no longer exists.');
  const bankAccounts = await getAllBankAccounts();
  await recordAdjustment({ target: `bank_account:${accountId}`, newBalance, current: account.balance, date: localDate() }, { bankAccounts });
  return getBankAccount(accountId);
}

export async function getTotalBankBalance() {
  try {
    const accounts = await getAllBankAccounts();
    const total = accounts.reduce((sum, account) => {
      return sum + (parseFloat(account.balance) || 0);
    }, 0);
    return total;
  } catch (error) {
    console.error('Error calculating total bank balance:', error);
    return 0;
  }
}

export async function transferBetweenAccounts(fromAccountId, toAccountId, amount, description = 'Account Transfer', transferDate = null) {
  const bankAccounts = await getAllBankAccounts();
  const fromAccount = bankAccounts.find((a) => String(a.id) === String(fromAccountId));
  const toAccount = bankAccounts.find((a) => String(a.id) === String(toAccountId));
  if (!fromAccount || !toAccount) throw new Error('One or both accounts not found');
  const result = await recordTransfer({
    amount,
    from: `bank_account:${fromAccountId}`,
    to: `bank_account:${toAccountId}`,
    date: transferDate || localDate(),
    description,
  }, { bankAccounts });
  const value = Number(result.transaction?.amount) || Number(amount);
  return {
    fromAccount: fromAccount.name,
    toAccount: toAccount.name,
    fromAccountId,
    toAccountId,
    fromBalance: Number(fromAccount.balance) - value,
    toBalance: Number(toAccount.balance) + value,
    transactionId: result.transaction?.id,
    amount: value,
    description
  };
}


export async function getCardTransactions(cardId, limit = 5) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await server
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('card_id', cardId)
      .eq('status', 'active')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching card transactions:', error);
    return [];
  }
}

export async function getLoanTransactions(loanId, limit = 5) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await server
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('loan_id', loanId)
      .eq('status', 'active')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching loan transactions:', error);
    return [];
  }
}

export async function getBankAccountTransactions(accountId, limit = 5) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await server
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .or(`payment_method_id.eq.${accountId},card_id.eq.null`)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit * 3);

    if (error) throw error;
    
    // Filter transactions that actually affect this bank account
    const filtered = (data || []).filter(txn => {
      // Include if payment method is this bank account
      if (txn.payment_method_id === accountId) return true;
      
      // Include cash withdrawals/deposits for this account
      if ((txn.type === 'cash_withdrawal' || txn.type === 'cash_deposit') && txn.payment_method_id === accountId) return true;
      
      // Include transfers
      if (txn.type === 'transfer' && (txn.payment_method_id === accountId || txn.transfer_to_account_id === accountId)) return true;
      
      return false;
    }).slice(0, limit);
    
    return filtered;
  } catch (error) {
    console.error('Error fetching bank account transactions:', error);
    return [];
  }
}

