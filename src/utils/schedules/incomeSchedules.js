import { supabase } from '../supabase';
import { predictNextDate, getDaysUntil, formatCurrency } from '../helpers';
import { dbOperation, getBankAccount, updateBankAccountBalance, getCashInHand, updateCashInHand } from '../db';
import { logActivity } from '../activityLogger';

/**
 * Income Schedule Management
 * Handles creation, processing, and management of recurring income schedules
 */

/**
 * Create a new income schedule
 */
export async function createIncomeSchedule(scheduleData) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const schedule = {
      user_id: user.id,
      source: scheduleData.source,
      amount: scheduleData.amount,
      frequency: scheduleData.frequency,
      start_date: scheduleData.startDate,
      next_date: scheduleData.startDate,
      deposit_target: scheduleData.depositTarget || 'cash_in_hand',
      deposit_account_id: scheduleData.depositAccountId || null,
      auto_deposit: scheduleData.autoDeposit !== false,
      recurring_duration_type: scheduleData.recurringDurationType || 'indefinite',
      recurring_until_date: scheduleData.recurringUntilDate || null,
      recurring_occurrences_total: scheduleData.recurringOccurrences || null,
      recurring_occurrences_completed: 0,
      is_active: true,
      notes: scheduleData.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('income_schedules')
      .insert(schedule)
      .select()
      .single();

    if (error) throw error;

    await logActivity(
      'create_income_schedule',
      'income_schedule',
      data.id,
      data.source,
      `Created recurring income schedule: ${data.source} - ${formatCurrency(data.amount)} ${data.frequency}`,
      { schedule: data }
    );

    console.log('✅ Income schedule created:', data.source);
    return data;

  } catch (error) {
    console.error('Error creating income schedule:', error);
    throw error;
  }
}

/**
 * Get all active income schedules for user
 */
export async function getIncomeSchedules() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('income_schedules')
      .select('*')
      .eq('user_id', user.id)
      .order('next_date', { ascending: true });

    if (error) throw error;
    return data || [];

  } catch (error) {
    console.error('Error fetching income schedules:', error);
    return [];
  }
}

/**
 * Get income schedule with all its occurrences
 */
export async function getIncomeScheduleWithHistory(scheduleId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('income_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('user_id', user.id)
      .single();

    if (scheduleError) throw scheduleError;

    // Get all occurrences
    const { data: occurrences, error: occurrencesError } = await supabase
      .from('income')
      .select('*')
      .eq('schedule_id', scheduleId)
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (occurrencesError) throw occurrencesError;

    return {
      schedule,
      occurrences: occurrences || []
    };

  } catch (error) {
    console.error('Error fetching schedule with history:', error);
    throw error;
  }
}

/**
 * Update an income schedule
 */
export async function updateIncomeSchedule(scheduleId, updates) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get previous state
    const { data: previous } = await supabase
      .from('income_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('user_id', user.id)
      .single();

    const { data, error } = await supabase
      .from('income_schedules')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', scheduleId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    await logActivity(
      'edit_income_schedule',
      'income_schedule',
      data.id,
      data.source,
      `Updated income schedule: ${data.source}`,
      { previous, updated: data }
    );

    return data;

  } catch (error) {
    console.error('Error updating income schedule:', error);
    throw error;
  }
}

/**
 * Delete an income schedule and all its occurrences
 */
export async function deleteIncomeSchedule(scheduleId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get schedule for logging
    const { data: schedule } = await supabase
      .from('income_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('user_id', user.id)
      .single();

    if (!schedule) throw new Error('Schedule not found');

    // Get all occurrences
    const { data: occurrences } = await supabase
      .from('income')
      .select('*')
      .eq('schedule_id', scheduleId)
      .eq('user_id', user.id);

    // Delete schedule (cascades to income via foreign key)
    const { error } = await supabase
      .from('income_schedules')
      .delete()
      .eq('id', scheduleId)
      .eq('user_id', user.id);

    if (error) throw error;

    await logActivity(
      'delete_income_schedule',
      'income_schedule',
      scheduleId,
      schedule.source,
      `Deleted income schedule: ${schedule.source} (${occurrences?.length || 0} occurrences)`,
      { schedule, occurrences }
    );

    return true;

  } catch (error) {
    console.error('Error deleting income schedule:', error);
    throw error;
  }
}

/**
 * Pause/Resume income schedule
 */
export async function toggleIncomeSchedule(scheduleId, pause = true) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const updates = pause
      ? { is_active: false, paused_at: new Date().toISOString() }
      : { is_active: true, paused_at: null };

    const { data, error } = await supabase
      .from('income_schedules')
      .update(updates)
      .eq('id', scheduleId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    await logActivity(
      'edit_income_schedule',
      'income_schedule',
      data.id,
      data.source,
      pause ? `Paused income schedule: ${data.source}` : `Resumed income schedule: ${data.source}`,
      { pause, schedule: data }
    );

    return data;

  } catch (error) {
    console.error('Error toggling income schedule:', error);
    throw error;
  }
}

/**
 * Process all due income schedules (replaces autoDepositDueIncome)
 */
export async function processDueIncomeSchedules() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0];

    console.log('🔄 Processing due income schedules...');

    // Get all active schedules where next_date <= today
    const { data: dueSchedules, error: fetchError } = await supabase
      .from('income_schedules')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .lte('next_date', todayString);

    if (fetchError) throw fetchError;

    if (!dueSchedules || dueSchedules.length === 0) {
      console.log('✅ No due income schedules');
      return { deposited: [], skipped: [] };
    }

    console.log(`📊 Found ${dueSchedules.length} due schedule(s)`);

    const results = {
      deposited: [],
      skipped: []
    };

    for (const schedule of dueSchedules) {
      try {
        // Check if schedule should still process
        if (!schedule.auto_deposit) {
          results.skipped.push({
            source: schedule.source,
            reason: 'Auto-deposit disabled'
          });
          continue;
        }

        // Check recurrence limits
        if (schedule.recurring_duration_type === 'until_date' && schedule.recurring_until_date) {
          const endDate = new Date(schedule.recurring_until_date);
          if (today > endDate) {
            // Mark schedule as completed
            await supabase
              .from('income_schedules')
              .update({
                is_active: false,
                completed_at: new Date().toISOString()
              })
              .eq('id', schedule.id);

            results.skipped.push({
              source: schedule.source,
              reason: 'Schedule ended (reached end date)'
            });
            continue;
          }
        }

        if (schedule.recurring_duration_type === 'occurrences') {
          const completed = schedule.recurring_occurrences_completed || 0;
          const total = schedule.recurring_occurrences_total || 0;
          
          if (total && completed >= total) {
            // Mark schedule as completed
            await supabase
              .from('income_schedules')
              .update({
                is_active: false,
                completed_at: new Date().toISOString()
              })
              .eq('id', schedule.id);

            results.skipped.push({
              source: schedule.source,
              reason: `Schedule completed (${completed}/${total} occurrences)`
            });
            continue;
          }
        }

        // Process the income
        const result = await processIncomeOccurrence(schedule, todayString);
        
        if (result.success) {
          results.deposited.push({
            source: schedule.source,
            amount: schedule.amount,
            date: todayString,
            depositTarget: result.depositTarget,
            depositAccountName: result.depositAccountName
          });
        } else {
          results.skipped.push({
            source: schedule.source,
            reason: result.error || 'Processing failed'
          });
        }

      } catch (error) {
        console.error(`❌ Error processing schedule ${schedule.source}:`, error);
        results.skipped.push({
          source: schedule.source,
          reason: error.message || 'Unknown error'
        });
      }
    }

    console.log('✅ Income schedule processing complete');
    console.log(`   Deposited: ${results.deposited.length}`);
    console.log(`   Skipped: ${results.skipped.length}`);

    return results;

  } catch (error) {
    console.error('❌ Error processing due income schedules:', error);
    throw error;
  }
}

/**
 * Process a single income occurrence from a schedule
 */
async function processIncomeOccurrence(schedule, date) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const amount = parseFloat(schedule.amount) || 0;
    
    // Determine deposit target
    let depositTarget = schedule.deposit_target || 'cash_in_hand';
    let depositAccountId = schedule.deposit_account_id;
    let depositAccountName = 'Cash in Hand';
    let previousBalance = 0;
    let newBalance = 0;
    
    if (depositTarget === 'bank' && depositAccountId) {
      // Deposit to bank account
      const { data: account } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('id', depositAccountId)
        .eq('user_id', user.id)
        .single();

      if (!account) {
        console.warn(`⚠️ Deposit account ${depositAccountId} not found, using cash in hand`);
        depositTarget = 'cash_in_hand';
        depositAccountId = null;
      } else {
        depositAccountName = account.name;
        previousBalance = Number(account.balance) || 0;
        newBalance = previousBalance + amount;
        
        await updateBankAccountBalance(depositAccountId, newBalance);
        console.log(`💰 Deposited ${formatCurrency(amount)} to ${depositAccountName}`);
      }
    }
    
    // Handle cash in hand deposit
    if (depositTarget === 'cash_in_hand') {
      const currentCash = await getCashInHand();
      const newCash = currentCash + amount;
      await updateCashInHand(newCash);
      
      previousBalance = currentCash;
      newBalance = newCash;
      console.log(`💵 Kept ${formatCurrency(amount)} as cash in hand`);
    }

    // Create income occurrence record
    const incomeOccurrence = {
      user_id: user.id,
      source: schedule.source,
      amount: schedule.amount,
      date: date,
      frequency: schedule.frequency,
      schedule_id: schedule.id,
      is_manual: false,
      deposit_account_id: depositAccountId,
      auto_deposit: true,
      auto_added: true,
      created_at: new Date().toISOString()
    };

    const { data: incomeRecord, error: incomeError } = await supabase
      .from('income')
      .insert(incomeOccurrence)
      .select()
      .single();

    if (incomeError) throw incomeError;

    // Create transaction
    const transaction = {
      type: 'income',
      amount: schedule.amount,
      date: date,
      income_source: schedule.source,
      payment_method: depositTarget === 'bank' ? 'bank_account' : 'cash_in_hand',
      payment_method_id: depositAccountId || incomeRecord.id,
      payment_method_name: depositAccountName,
      description: `${schedule.source} (Auto-deposited from schedule)`,
      status: 'active',
      auto_generated: true,
      created_at: new Date().toISOString()
    };

    const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

    // Update schedule
    const nextDate = predictNextDate(schedule.next_date, schedule.frequency);
    const completedCount = (schedule.recurring_occurrences_completed || 0) + 1;

    await supabase
      .from('income_schedules')
      .update({
        next_date: nextDate,
        recurring_occurrences_completed: completedCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', schedule.id);

    // Log activity
    const activityDescription = depositTarget === 'bank'
      ? `Income: ${formatCurrency(amount)} from ${schedule.source} → ${depositAccountName} (${formatCurrency(previousBalance)} → ${formatCurrency(newBalance)})`
      : `Income: ${formatCurrency(amount)} from ${schedule.source} → Cash in Hand (${formatCurrency(previousBalance)} → ${formatCurrency(newBalance)})`;
    
    await logActivity(
      'income_occurrence',
      'income',
      incomeRecord.id,
      schedule.source,
      activityDescription,
      {
        scheduleId: schedule.id,
        amount,
        source: schedule.source,
        depositTarget,
        depositAccountId,
        depositAccountName,
        previousBalance,
        newBalance,
        transactionId: savedTransaction?.id,
        incomeId: incomeRecord.id,
        isAutoDeposit: true
      }
    );

    console.log(`✅ Processed: ${schedule.source} - ${formatCurrency(amount)} → ${depositAccountName}`);

    return {
      success: true,
      depositTarget,
      depositAccountName
    };

  } catch (error) {
    console.error('Error processing income occurrence:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Undo an income occurrence (reverses deposit, doesn't delete schedule)
 */
export async function undoIncomeOccurrence(incomeId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get income record
    const { data: income, error: fetchError } = await supabase
      .from('income')
      .select('*')
      .eq('id', incomeId)
      .eq('user_id', user.id)
      .single();

    if (fetchError) throw fetchError;
    if (!income) throw new Error('Income not found');

    if (!income.schedule_id) {
      throw new Error('This is manual income, not from a schedule');
    }

    const amount = Number(income.amount) || 0;

    // Reverse the deposit
    if (income.deposit_account_id) {
      // Reverse bank deposit
      const { data: account } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('id', income.deposit_account_id)
        .eq('user_id', user.id)
        .single();

      if (account) {
        const currentBalance = Number(account.balance) || 0;
        const restoredBalance = Math.max(0, currentBalance - amount);
        await updateBankAccountBalance(income.deposit_account_id, restoredBalance);
        console.log('✅ Reversed bank deposit');
      }
    } else {
      // Reverse cash in hand
      const currentCash = await getCashInHand();
      const restoredCash = Math.max(0, currentCash - amount);
      await updateCashInHand(restoredCash);
      console.log('✅ Reversed cash in hand deposit');
    }

    // Mark transaction as undone
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('income_source', income.source)
      .eq('date', income.date)
      .eq('status', 'active');

    if (transactions && transactions.length > 0) {
      for (const txn of transactions) {
        await supabase
          .from('transactions')
          .update({
            status: 'undone',
            undone_at: new Date().toISOString()
          })
          .eq('id', txn.id);
      }
    }

    // Roll back schedule
    const { data: schedule } = await supabase
      .from('income_schedules')
      .select('*')
      .eq('id', income.schedule_id)
      .eq('user_id', user.id)
      .single();

    if (schedule) {
      await supabase
        .from('income_schedules')
        .update({
          next_date: income.date, // Roll back to this date
          recurring_occurrences_completed: Math.max(0, (schedule.recurring_occurrences_completed || 0) - 1),
          updated_at: new Date().toISOString()
        })
        .eq('id', schedule.id);
      console.log('✅ Schedule rolled back');
    }

    // Delete income occurrence
    const { error: deleteError } = await supabase
      .from('income')
      .delete()
      .eq('id', incomeId)
      .eq('user_id', user.id);

    if (deleteError) throw deleteError;

    console.log('✅ Income occurrence undone successfully');
    return true;

  } catch (error) {
    console.error('Error undoing income occurrence:', error);
    throw error;
  }
}
