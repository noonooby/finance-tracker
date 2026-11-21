import { useCallback } from 'react';
import { dbOperation } from '../../utils/db';
import { recordIncome, reverseTransaction } from '../../utils/money';
import { logActivity } from '../../utils/activityLogger';
import { formatCurrency, formatDate, generateId } from '../../utils/helpers';
import { formatFrequency } from '../../utils/sentenceCase';
import { saveIncomeSourceContext } from '../../utils/formContexts';

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
    // Income goes into one of the accounts (cash is one of them).
    if (!isEditing && !formData.depositAccountId) {
      throw new Error('Choose the account the income goes into.');
    }
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
          depositTarget: 'bank',
          depositAccountId: formData.depositAccountId,
          autoDeposit: formData.autoDeposit !== false,
          recurringDurationType: formData.recurringDurationType || 'indefinite',
          recurringUntilDate: formData.recurringUntilDate || null,
          recurringOccurrences: formData.recurringOccurrences ? parseInt(formData.recurringOccurrences, 10) : null
        };
        
        await createIncomeSchedule(scheduleData);
        
        // Save context
        if (formData.source) {
          saveIncomeSourceContext(formData.source, {
            depositTarget: 'bank',
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
      deposit_account_id: formData.depositAccountId || null,
      auto_deposit: formData.frequency !== 'onetime' ? formData.autoDeposit : false,
      schedule_id: editingItem?.schedule_id || null
    };
    
    // Handle editing: only the income record changes, no balance moves
    if (isEditing) {
      const savedIncome = await dbOperation('income', 'put', incomeEntry, { skipActivityLog: true });
      const incomeId = savedIncome?.id || editingItem?.id;
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

    // Handle new income: the income record, its transaction and the deposit are saved together by the server
    if (!isEditing) {
      const incomeId = incomeEntry.id;
      const account = bankAccounts.find(a => String(a.id) === String(formData.depositAccountId));
      if (!account) throw new Error('Choose the account the income goes into.');
      const target = `bank_account:${account.id}`;
      const depositDestination = account.name;
      const previousBalance = Number(account.balance) || 0;

      const res = await recordIncome({
        amount: newAmount,
        target,
        date: formData.date,
        source_name: formData.source,
        incomeRow: incomeEntry,
        extra: { income_source: formData.source, income_id: incomeId, payment_method_name: depositDestination }
      }, { bankAccounts });
      const transactionId = res.transaction?.id;
      if (onUpdateCash) await onUpdateCash(null, { syncOnly: true });

      let description = `Income of ${formatCurrency(newAmount)} from '${formData.source}'`;
      if (depositDestination) {
        description += ` deposited to ${depositDestination}`;
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
          depositTarget: 'bank',
          depositAccountId: formData.depositAccountId,
          depositDestination,
          previousBalance,
          transactionId,
          incomeId
        }
      );

      // Save context
      if (formData.source) {
        saveIncomeSourceContext(formData.source, {
          depositTarget: 'bank',
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
    onUpdate
  }) => {
    const inc = income.find(i => String(i.id) === String(incomeId));
    if (!inc) throw new Error('Income entry not found');

    let relatedTransactions = [];
    
    try {
      const transactions = await dbOperation('transactions', 'getAll');
      relatedTransactions = (transactions || []).filter(
        (t) => t.type === 'income' && t.status !== 'undone' && t.status !== 'deleted' &&
          (String(t.income_id) === String(incomeId) || String(t.payment_method_id) === String(incomeId))
      );
    } catch (error) {
      console.warn('Unable to fetch linked transactions for income deletion:', error);
    }

    const linkedSnapshots = relatedTransactions.map(trx => ({
      ...trx,
      status: 'active',
      undone_at: null
    }));

    // Take the income back out by reversing its transactions: the server moves back exactly what each one added.
    const depositDestination = inc.deposit_account_id
      ? (bankAccounts.find(a => a.id === inc.deposit_account_id)?.name || null)
      : null;
    for (const trx of relatedTransactions) {
      await reverseTransaction(trx.id, { remove: true });
    }
    if (onUpdateCash) await onUpdateCash(null, { syncOnly: true });

    let description = `Deleted income of ${formatCurrency(inc.amount)} from '${inc.source}'`;
    if (depositDestination) {
      description += ` • Was in ${depositDestination}`;
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
        depositTarget: 'bank',
        depositAccountId: inc.deposit_account_id,
        depositAccountName: depositDestination,
        linkedTransactions: linkedSnapshots
      }
    );

    await dbOperation('income', 'delete', incomeId, { skipActivityLog: true });

    await onUpdate();
    
    return { source: inc.source, amount: inc.amount };
  }, []);

  return {
    addIncome,
    deleteIncome
  };
};
