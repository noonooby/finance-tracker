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
              { key: 'alertSettings', value: result.alert_settings },
              { key: 'cashInHand', value: result.cash_in_hand || 0 },
              { key: 'showCashInDashboard', value: result.show_cash_in_dashboard || false }
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
          if (result && data === 'cashInHand') {
            return { key: 'cashInHand', value: result.cash_in_hand || 0 };
          }
          if (result && data === 'showCashInDashboard') {
            return { key: 'showCashInDashboard', value: result.show_cash_in_dashboard || false };
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
            alert_settings: data.key === 'alertSettings' ? data.value : undefined,
            cash_in_hand: data.key === 'cashInHand' ? data.value : undefined,
            show_cash_in_dashboard: data.key === 'showCashInDashboard' ? data.value : undefined
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
        if (!data.id) {
          data.id = crypto.randomUUID();
        }
        
        const insertData = { ...data, user_id: user.id };
        
        const { data: result, error } = await supabase
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

  const tables = [
    'activities',
    'transactions',
    'budgets',
    'reserved_funds',
    'income',
    'credit_cards',
    'loans',
    'categories',
    'known_entities',
    'bank_accounts'
  ];

  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('user_id', user.id);

      if (error && error.code !== 'PGRST116') {
        console.error(`Error deleting from ${table}:`, error);
        throw error;
      }
      console.log(`✅ Deleted all data from ${table}`);
    } catch (tableError) {
      console.error(`❌ Failed to delete from ${table}:`, tableError);
      throw tableError;
    }
  }

  try {
    await supabase
      .from('settings')
      .update({
        available_cash: 0,
        dark_mode: false,
        alert_settings: { defaultDays: 7 },
        cash_in_hand: 0,
        show_cash_in_dashboard: false,
        theme: 'auto',
        currency: 'USD',
        currency_symbol: '$',
        date_format: 'MM/DD/YYYY',
        first_day_of_week: 'sunday',
        number_format: 'comma',
        default_alert_days: 7,
        credit_card_alert_days: 7,
        loan_alert_days: 7,
        low_balance_alerts: true,
        low_balance_threshold: 100,
        cash_in_hand_low_threshold: 50,
        email_notifications: false,
        reminder_time: '09:00',
        default_payment_method: 'cash_in_hand',
        auto_categorization: true,
        round_up_transactions: false,
        monthly_budget_enabled: false,
        monthly_budget_amount: 0,
        budget_alert_at_80: true,
        budget_alert_at_90: true,
        budget_alert_at_100: true,
        default_overdraft_allowed: false,
        default_overdraft_limit: 0,
        category_budgets: {},
        auto_process_due_payments: true,
        auto_mark_cleared_days: 0,
        smart_suggestions: true,
        default_transaction_time: 'now',
        custom_transaction_time: '12:00',
        require_notes_for_expenses_over: 0,
        require_notes_for_payments: false,
        confirm_large_transactions: true,
        large_transaction_threshold: 500,
        transaction_templates: [],
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);
    console.log('✅ Settings reset to defaults');
  } catch (settingsError) {
    console.error('❌ Error resetting settings:', settingsError);
  }
};

export async function getAllBankAccounts() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    console.log('📊 Loaded bank accounts:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching bank accounts:', error);
    throw error;
  }
}

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

export async function getPrimaryBankAccount() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('❌ Error fetching primary bank account:', error);
    return null;
  }
}

export async function upsertBankAccount(accountData) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (accountData.is_primary) {
      await supabase
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

export async function deleteBankAccount(accountId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

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

export async function transferBetweenAccounts(fromAccountId, toAccountId, amount, description = 'Account Transfer', transferDate = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      throw new Error('Transfer amount must be a positive number');
    }

    const fromAccount = await getBankAccount(fromAccountId);
    const toAccount = await getBankAccount(toAccountId);

    if (!fromAccount || !toAccount) {
      throw new Error('One or both accounts not found');
    }

    const fromBalance = Number(fromAccount.balance) || 0;
    const toBalance = Number(toAccount.balance) || 0;
    const normalizedAmount = Math.round(amountValue * 100) / 100;

    if (fromBalance < normalizedAmount) {
      throw new Error(
        `Insufficient funds in ${fromAccount.name}. `
        + `Available: $${fromBalance.toFixed(2)}, Requested: $${normalizedAmount.toFixed(2)}`
      );
    }

    const newFromBalance = Math.max(0, Math.round((fromBalance - normalizedAmount) * 100) / 100);
    const newToBalance = Math.round((toBalance + normalizedAmount) * 100) / 100;

    const updatedFromAccount = await updateBankAccountBalance(fromAccountId, newFromBalance);
    const updatedToAccount = await updateBankAccountBalance(toAccountId, newToBalance);

    const effectiveDate = transferDate || new Date().toISOString().split('T')[0];

    const transaction = {
      type: 'transfer',
      amount: normalizedAmount,
      date: effectiveDate,
      description: description,
      notes: `Transferred $${normalizedAmount.toFixed(2)} from ${fromAccount.name} ($${fromBalance.toFixed(2)} → $${newFromBalance.toFixed(2)}) to ${toAccount.name} ($${toBalance.toFixed(2)} → $${newToBalance.toFixed(2)}).`,
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

export async function getCashInHand() {
  try {
    const setting = await dbOperation('settings', 'get', 'cashInHand');
    return Number(setting?.value) || 0;
  } catch (error) {
    console.error('❌ Error getting cash in hand:', error);
    return 0;
  }
}

export async function updateCashInHand(newAmount) {
  try {
    await dbOperation('settings', 'put', { key: 'cashInHand', value: newAmount });
    console.log('💵 Cash in hand updated:', newAmount);
  } catch (error) {
    console.error('❌ Error updating cash in hand:', error);
    throw error;
  }
}

export async function withdrawCashFromBank(accountId, amount) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const account = await getBankAccount(accountId);
    if (!account) throw new Error('Account not found');

    const currentBalance = Number(account.balance) || 0;
    const withdrawAmount = Number(amount) || 0;
    const newBalance = currentBalance - withdrawAmount;

    if (newBalance < 0) {
      if (!account.allows_overdraft) {
        throw new Error(
          `Insufficient funds in '${account.name}'.\n` +
          `Available: ${currentBalance.toFixed(2)}\n` +
          `Required: ${withdrawAmount.toFixed(2)}\n\n` +
          `This account does not allow overdraft.`
        );
      }
      
      const overdraftAmount = Math.abs(newBalance);
      if (overdraftAmount > (account.overdraft_limit || 0)) {
        throw new Error(
          `Insufficient funds in '${account.name}'.\n` +
          `This would exceed your overdraft limit.\n\n` +
          `Available: ${currentBalance.toFixed(2)}\n` +
          `Overdraft: ${account.overdraft_limit.toFixed(2)}\n` +
          `Total: ${(currentBalance + account.overdraft_limit).toFixed(2)}\n` +
          `Required: ${withdrawAmount.toFixed(2)}`
        );
      }
    }

    await updateBankAccountBalance(accountId, newBalance);

    const currentCash = await getCashInHand();
    const newCash = currentCash + withdrawAmount;
    await updateCashInHand(newCash);

    const transaction = {
      type: 'cash_withdrawal',
      amount: withdrawAmount,
      date: new Date().toISOString().split('T')[0],
      description: `Withdrew cash from ${account.name}`,
      payment_method: 'cash_withdrawal',
      payment_method_id: accountId,
      payment_method_name: account.name,
      status: 'active',
      undone_at: null
    };

    const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });
    console.log('💵 Cash withdrawn:', withdrawAmount, 'from', account.name);

    return {
      accountName: account.name,
      accountId,
      amount: withdrawAmount,
      previousBankBalance: currentBalance,
      newBankBalance: newBalance,
      previousCashInHand: currentCash,
      newCashInHand: newCash,
      transactionId: savedTransaction?.id
    };
  } catch (error) {
    console.error('❌ Error withdrawing cash:', error);
    throw error;
  }
}

export async function getCardTransactions(cardId, limit = 5) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
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
    console.error('❌ Error fetching card transactions:', error);
    return [];
  }
}

export async function getLoanTransactions(loanId, limit = 5) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
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
    console.error('❌ Error fetching loan transactions:', error);
    return [];
  }
}

export async function getBankAccountTransactions(accountId, limit = 5) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
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
    console.error('❌ Error fetching bank account transactions:', error);
    return [];
  }
}

export async function depositCashToBank(accountId, amount) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const account = await getBankAccount(accountId);
    if (!account) throw new Error('Account not found');

    const currentCash = await getCashInHand();
    const depositAmount = Number(amount) || 0;

    if (depositAmount > currentCash) {
      throw new Error(
        `Insufficient cash in hand.\n` +
        `Available: ${currentCash.toFixed(2)}\n` +
        `Required: ${depositAmount.toFixed(2)}`
      );
    }

    const currentBalance = Number(account.balance) || 0;
    const newBalance = currentBalance + depositAmount;
    const newCash = Math.max(0, currentCash - depositAmount);

    await updateBankAccountBalance(accountId, newBalance);
    await updateCashInHand(newCash);

    const transaction = {
      type: 'cash_deposit',
      amount: depositAmount,
      date: new Date().toISOString().split('T')[0],
      description: `Deposited cash to ${account.name}`,
      payment_method: 'cash_deposit',
      payment_method_id: accountId,
      payment_method_name: account.name,
      status: 'active',
      undone_at: null
    };

    const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });
    console.log('💵 Cash deposited:', depositAmount, 'to', account.name);

    return {
      accountName: account.name,
      accountId,
      amount: depositAmount,
      previousBankBalance: currentBalance,
      newBankBalance: newBalance,
      previousCashInHand: currentCash,
      newCashInHand: newCash,
      transactionId: savedTransaction?.id
    };
  } catch (error) {
    console.error('❌ Error depositing cash:', error);
    throw error;
  }
}
