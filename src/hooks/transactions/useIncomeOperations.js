import { useCallback } from 'react';
import { supabase } from '../../utils/supabase';
import { dbOperation } from '../../utils/db';
import { logActivity } from '../../utils/activityLogger';
import { formatCurrency, formatDate, generateId, getPrimaryAccountFromArray } from '../../utils/helpers';
import { formatFrequency } from '../../utils/sentenceCase';
import { showToast } from '../../utils/toast';
import { saveIncomeSourceContext } from '../../utils/formContexts';

/**
 * Helper to update bank account balance directly
 */
async function updateBankAccountBalance(accountId, newBalance) {
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
  return data;
}

/**
 * Hook for income operations (add, edit, delete)
 */
export const useIncomeOperations = () => {
  
  const addIncome = useCallback(async ({
    formData,
    editingItem = null,
    availableCash,
    onUpdateCash,
    bankAccounts,
    cashInHand,
    onUpdateCashInHand,
    onUpdate
  }) => {
    if (!formData.source || !formData.amount || !formData.date) {
      throw new Error('Please fill in required fields: Source, Amount, and Date');
    }

    if (formData.frequency !== 'onetime') {
      if (formData.recurringDurationType === 'until_date' && !formData.recurringUntilDate) {
        throw new Error('Please specify the end date for recurring income');
      }
      if (
        formData.recurringDurationType === 'occurrences' &&
        (!formData.recurringOccurrences || parseInt(formData.recurringOccurrences, 10) < 1)
      ) {
        throw new Error('Please specify the number of times this income will occur');
      }
    }

    const isEditing = !!editingItem;
    const newAmount = parseFloat(formData.amount) || 0;
    
    // NEW: For recurring income (not editing), create a schedule
    if (formData.frequency !== 'onetime' && !isEditing) {
      try {
        const { createIncomeSchedule } = await import('../../utils/schedules');
        
        const scheduleData = {
          source: formData.source,
          amount: newAmount,
          frequency: formData.frequency,
          startDate: formData.date,
          depositTarget: formData.depositTarget || 'cash_in_hand',
          depositAccountId: formData.depositTarget === 'bank' ? formData.depositAccountId : null,
          autoDeposit: formData.autoDeposit !== false,
          recurringDurationType: formData.recurringDurationType || 'indefinite',
          recurringUntilDate: formData.recurringUntilDate || null,
          recurringOccurrences: formData.recurringOccurrences ? parseInt(formData.recurringOccurrences, 10) : null
        };
        
        await createIncomeSchedule(scheduleData);
        
        // Save context
        if (formData.source) {
          saveIncomeSourceContext(formData.source, {
            depositTarget: formData.depositTarget,
            depositAccountId: formData.depositAccountId,
            frequency: formData.frequency
          }).catch(err => console.warn('Failed to save income context:', err));
        }
        
        if (onUpdate) await onUpdate();
        
        return {
          source: formData.source,
          amount: newAmount,
          isNew: true
        };
      } catch (error) {
        console.error('Error creating income schedule:', error);
        throw error;
      }
    }
    
    // For one-time income OR editing, use the old direct income method
    const incomeEntry = {
      ...(editingItem?.id ? { id: editingItem.id } : { id: generateId() }),
      source: formData.source,
      amount: newAmount,
      date: formData.date,
      frequency: formData.frequency,
      is_manual: formData.frequency === 'onetime',
      recurring_duration_type: formData.frequency === 'onetime' ? null : formData.recurringDurationType,
      recurring_until_date: formData.recurringDurationType === 'until_date' ? formData.recurringUntilDate : null,
      recurring_occurrences_total:
        formData.recurringDurationType === 'occurrences'
          ? parseInt(formData.recurringOccurrences, 10) || null
          : null,
      recurring_occurrences_completed: editingItem?.recurring_occurrences_completed || 0,
      deposit_account_id: formData.depositTarget === 'bank' ? (formData.depositAccountId || null) : null,
      auto_deposit: formData.frequency !== 'onetime' ? formData.autoDeposit : false,
      schedule_id: editingItem?.schedule_id || null
    };
    
    const savedIncome = await dbOperation('income', 'put', incomeEntry, { skipActivityLog: true });
    const incomeId = savedIncome?.id || editingItem?.id;
    
    // Handle editing
    if (isEditing) {
      const oldSource = editingItem.source || '';
      const newSource = savedIncome?.source || incomeEntry.source || '';
      const oldAmount = parseFloat(editingItem.amount) || 0;
      const oldFrequency = editingItem.frequency || 'onetime';
      const newFrequency = savedIncome?.frequency || incomeEntry.frequency || 'onetime';
      const oldDate = editingItem.date || '';
      const newDate = savedIncome?.date || incomeEntry.date || '';
      const oldDepositAccount = editingItem.deposit_account_id || null;
      const newDepositAccount = savedIncome?.deposit_account_id || incomeEntry.deposit_account_id || null;
      
      const oldAccountName = oldDepositAccount 
        ? bankAccounts.find(a => a.id === oldDepositAccount)?.name || 'Unknown Account'
        : 'None';
      const newAccountName = newDepositAccount
        ? bankAccounts.find(a => a.id === newDepositAccount)?.name || 'Unknown Account'
        : 'None';

      let details = '';
      if (oldSource !== newSource) {
        details += `Source "${oldSource}" → "${newSource}" • `;
      }
      if (oldAmount !== newAmount) {
        details += `Amount ${formatCurrency(oldAmount)} → ${formatCurrency(newAmount)} • `;
      }
      if (oldFrequency !== newFrequency) {
        details += `Frequency ${oldFrequency} → ${newFrequency} • `;
      }
      if (oldDate !== newDate) {
        details += `Date ${formatDate(oldDate)} → ${formatDate(newDate)} • `;
      }
      if (oldDepositAccount !== newDepositAccount) {
        details += `Deposit account ${oldAccountName} → ${newAccountName} • `;
      }
      
      details = details.replace(/ • $/, '');

      const description = details
        ? `Updated income '${savedIncome?.source || incomeEntry.source}' - ${details}`
        : `Updated income '${savedIncome?.source || incomeEntry.source}'`;

      await logActivity(
        'edit',
        'income',
        incomeId,
        savedIncome?.source || incomeEntry.source,
        description,
        {
          previous: { ...editingItem, id: editingItem?.id || incomeId },
          updated: { ...savedIncome, id: savedIncome?.id || incomeId }
        }
      );
    }

    // Handle new income
    if (!isEditing) {
      const transaction = {
        type: 'income',
        amount: newAmount,
        date: formData.date,
        income_source: formData.source,
        payment_method: 'cash',
        payment_method_id: incomeId,
        status: 'active',
        undone_at: null
      };
      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });
      
      // Handle income deposit
      let depositDestination = null;
      let previousBalance = 0;
      let newBalance = 0;
      
      if (formData.depositTarget === 'cash_in_hand') {
        previousBalance = cashInHand || 0;
        newBalance = previousBalance + newAmount;
        if (onUpdateCashInHand) await onUpdateCashInHand(newBalance);
        depositDestination = 'Cash in Hand';
      } else if (formData.depositTarget === 'bank' && formData.depositAccountId) {
        const account = bankAccounts.find(a => a.id === formData.depositAccountId);
        if (account) {
          previousBalance = Number(account.balance) || 0;
          newBalance = previousBalance + newAmount;
          await updateBankAccountBalance(formData.depositAccountId, newBalance);
          depositDestination = account.name;
          if (onUpdateCash) await onUpdateCash(null, { syncOnly: true });
        }
      }
      
      // Handle reserved amount (if any)
      if (formData.reservedAmount && parseFloat(formData.reservedAmount) > 0) {
        if (onUpdateCash) {
          await onUpdateCash(null, {
            delta: -parseFloat(formData.reservedAmount)
          });
        }
      }

      let description = `Income of ${formatCurrency(newAmount)} from '${formData.source}'`;
      if (depositDestination) {
        description += ` deposited to ${depositDestination}`;
        description += ` • Balance ${formatCurrency(previousBalance)} → ${formatCurrency(newBalance)}`;
      }
      description += ` • ${formatFrequency(formData.frequency)} • ${formatDate(formData.date)}`;

      await logActivity(
        'income',
        'income',
        incomeId,
        formData.source,
        description,
        {
          amount: newAmount,
          source: formData.source,
          frequency: formData.frequency,
          date: formData.date,
          depositTarget: formData.depositTarget,
          depositAccountId: formData.depositAccountId,
          depositDestination,
          previousBalance,
          newBalance,
          transactionId: savedTransaction?.id,
          incomeId
        }
      );

      // Save context
      if (formData.source) {
        saveIncomeSourceContext(formData.source, {
          depositTarget: formData.depositTarget,
          depositAccountId: formData.depositAccountId,
          frequency: formData.frequency
        }).catch(err => console.warn('Failed to save income context:', err));
      }
    }

    await onUpdate();
    
    return {
    source: formData.source,
    amount: newAmount,
    isNew: !isEditing
    };
    }, []);

  const deleteIncome = useCallback(async ({
    incomeId,
    income,
    availableCash,
    onUpdateCash,
    bankAccounts,
    onUpdate,
    cashInHand,
    onUpdateCashInHand
  }) => {
    const inc = income.find(i => String(i.id) === String(incomeId));
    if (!inc) throw new Error('Income entry not found');

    let relatedTransactions = [];
    
    try {
      const transactions = await dbOperation('transactions', 'getAll');
      relatedTransactions = (transactions || []).filter(
        (t) => t.type === 'income' && (String(t.payment_method_id) === String(incomeId))
      );
    } catch (error) {
      console.warn('Unable to fetch linked transactions for income deletion:', error);
    }

    const linkedSnapshots = relatedTransactions.map(trx => ({
      ...trx,
      status: 'active',
      undone_at: null
    }));

    // Remove income from bank account or cash in hand
    let previousBalance = 0;
    let newBalance = 0;
    let depositDestination = null;
    
    if (inc.deposit_account_id) {
      const account = bankAccounts.find(a => a.id === inc.deposit_account_id);
      if (account) {
        previousBalance = Number(account.balance) || 0;
        newBalance = Math.max(0, previousBalance - inc.amount);
        await updateBankAccountBalance(inc.deposit_account_id, newBalance);
        depositDestination = account.name;
        if (onUpdateCash) await onUpdateCash(null, { syncOnly: true });
      }
    } else {
      const currentCashInHand = cashInHand || 0;
      previousBalance = currentCashInHand;
      newBalance = Math.max(0, currentCashInHand - inc.amount);
      if (onUpdateCashInHand) await onUpdateCashInHand(newBalance);
      depositDestination = 'Cash in Hand';
    }

    let description = `Deleted income of ${formatCurrency(inc.amount)} from '${inc.source}'`;
    if (depositDestination) {
      description += ` • Was in ${depositDestination}`;
      description += ` • Balance ${formatCurrency(previousBalance)} → ${formatCurrency(newBalance)}`;
    }
    description += ` • ${formatFrequency(inc.frequency) || 'One Time'}`;

    await logActivity(
      'delete',
      'income',
      incomeId,
      inc.source,
      description,
      {
        id: inc.id,
        source: inc.source,
        amount: inc.amount,
        date: inc.date,
        frequency: inc.frequency,
        recurring_duration_type: inc.recurring_duration_type,
        recurring_until_date: inc.recurring_until_date,
        recurring_occurrences_total: inc.recurring_occurrences_total,
        recurring_occurrences_completed: inc.recurring_occurrences_completed,
        deposit_account_id: inc.deposit_account_id,
        auto_deposit: inc.auto_deposit,
        auto_added: inc.auto_added,
        created_at: inc.created_at,
        depositTarget: inc.deposit_account_id ? 'bank' : 'cash_in_hand',
        depositAccountId: inc.deposit_account_id,
        depositAccountName: depositDestination,
        previousBalance,
        newBalance,
        linkedTransactions: linkedSnapshots
      }
    );

    await dbOperation('income', 'delete', incomeId, { skipActivityLog: true });

    for (const trx of relatedTransactions) {
      try {
        await dbOperation('transactions', 'delete', trx.id, { skipActivityLog: true });
      } catch (error) {
        console.warn('Unable to remove linked transaction during income deletion:', error);
      }
    }

    await onUpdate();
    
    return { source: inc.source, amount: inc.amount };
  }, []);

  return {
    addIncome,
    deleteIncome
  };
};
