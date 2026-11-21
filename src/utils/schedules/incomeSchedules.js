import { supabase } from '../supabase';
import { predictNextDate, formatCurrency, localDate, generateId } from '../helpers';
import { recordIncome, reverseTransaction } from '../money';
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

// A new id for a transaction, chosen here so the matching income/payment row can point at it in the same step.
const newTxId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : generateId());

const dayOf = (iso) => (iso ? Number(String(iso).split('T')[0].split('-')[2]) || undefined : undefined);

/**
 * Process all due income schedules: every missed occurrence up to today, each once.
 * Each occurrence is one server step (balance, income row, transaction and the schedule's next date together),
 * keyed income-schedule:<scheduleId>:<date>, so running it twice at once cannot deposit twice.
 */
export async function processDueIncomeSchedules() {
  const todayString = localDate();
  const results = { deposited: [], skipped: [] };

  const { data: dueSchedules, error: fetchError } = await supabase
    .from('income_schedules')
    .select('*')
    .eq('is_active', true)
    .lte('next_date', todayString);
  if (fetchError) throw fetchError;
  if (!dueSchedules || dueSchedules.length === 0) return results;

  const { data: bankAccounts } = await supabase.from('bank_accounts').select('*');
  const accounts = { bankAccounts: bankAccounts || [], creditCards: [] };

  for (const schedule of dueSchedules) {
    if (!schedule.auto_deposit) {
      results.skipped.push({ source: schedule.source, reason: 'Auto-deposit disabled' });
      continue;
    }
    const anchorDay = dayOf(schedule.start_date) || dayOf(schedule.next_date);
    let date = String(schedule.next_date).split('T')[0];
    let completed = schedule.recurring_occurrences_completed || 0;

    while (date && date <= todayString) {
      const ended =
        (schedule.recurring_duration_type === 'until_date' && schedule.recurring_until_date && date > String(schedule.recurring_until_date).split('T')[0]) ||
        (schedule.recurring_duration_type === 'occurrences' && schedule.recurring_occurrences_total && completed >= schedule.recurring_occurrences_total);
      if (ended) {
        await supabase.from('income_schedules').update({ is_active: false, completed_at: new Date().toISOString() }).eq('id', schedule.id);
        results.skipped.push({ source: schedule.source, reason: 'Schedule ended' });
        break;
      }

      const nextDate = predictNextDate(date, schedule.frequency, anchorDay);
      const schedUpdate = { next_date: nextDate, recurring_occurrences_completed: completed + 1 };
      try {
        const r = await processIncomeOccurrence(schedule, date, schedUpdate, accounts);
        if (r.repeated) {
          // Already deposited (another run, or undone since). Only make sure the schedule has moved past it.
          await supabase.from('income_schedules').update({ next_date: nextDate }).eq('id', schedule.id).eq('next_date', date);
        } else {
          completed += 1;
          results.deposited.push({ source: schedule.source, amount: schedule.amount, date, depositTarget: r.depositTarget, depositAccountName: r.depositAccountName });
        }
      } catch (error) {
        console.error(`Error processing schedule ${schedule.source}:`, error);
        results.skipped.push({ source: schedule.source, date, reason: error.message || 'Unknown error' });
        break;
      }
      date = nextDate;
    }
  }
  return results;
}

/**
 * Deposit one occurrence of a schedule in a single server step.
 */
async function processIncomeOccurrence(schedule, date, schedUpdate, accounts) {
  const bank = schedule.deposit_target === 'bank' && schedule.deposit_account_id
    ? accounts.bankAccounts.find((a) => String(a.id) === String(schedule.deposit_account_id))
    : null;
  const target = bank ? `bank_account:${bank.id}` : 'cash_in_hand';
  const depositAccountName = bank ? bank.name : 'Cash in Hand';
  const txId = newTxId();

  const r = await recordIncome({
    amount: schedule.amount,
    target,
    date,
    source_name: schedule.source,
    description: `${schedule.source} (from schedule)`,
    key: `income-schedule:${schedule.id}:${date}`,
    extra: { id: txId, income_source: schedule.source, auto_generated: true, schedule_id: schedule.id },
    incomeRow: {
      frequency: schedule.frequency,
      schedule_id: schedule.id,
      is_manual: false,
      deposit_account_id: bank ? bank.id : null,
      auto_deposit: true,
      auto_added: true,
      transaction_id: txId,
    },
    updates: [{ table: 'income_schedules', id: schedule.id, values: schedUpdate }],
  }, accounts);
  if (r.repeated) return { repeated: true };

  const incomeRecord = (r.rows || []).find((x) => x.schedule_id === schedule.id && !x.type) || {};
  await logActivity(
    'income_occurrence',
    'income',
    incomeRecord.id,
    schedule.source,
    `Income: ${formatCurrency(schedule.amount)} from ${schedule.source} -> ${depositAccountName}`,
    { scheduleId: schedule.id, amount: schedule.amount, source: schedule.source, depositTarget: bank ? 'bank' : 'cash_in_hand',
      depositAccountId: bank ? bank.id : null, depositAccountName, transactionId: txId, incomeId: incomeRecord.id, isAutoDeposit: true }
  );
  return { depositTarget: bank ? 'bank' : 'cash_in_hand', depositAccountName };
}

/**
 * Undo an income occurrence: reverses its transaction (exact amounts, same account), then rolls the schedule back.
 */
export async function undoIncomeOccurrence(incomeId) {
  const { data: income, error: fetchError } = await supabase.from('income').select('*').eq('id', incomeId).single();
  if (fetchError) throw fetchError;
  if (!income) throw new Error('Income not found');
  if (!income.schedule_id) throw new Error('This is manual income, not from a schedule');

  let txId = income.transaction_id;
  if (!txId) {
    // Older rows: find the matching active transaction.
    const { data: txs } = await supabase.from('transactions').select('*')
      .eq('type', 'income').eq('income_source', income.source).eq('date', income.date).eq('status', 'active');
    txId = txs && txs[0] ? txs[0].id : null;
  }
  if (!txId) throw new Error('The transaction for this income was not found.');
  await reverseTransaction(txId);

  const { data: schedule } = await supabase.from('income_schedules').select('*').eq('id', income.schedule_id).single();
  if (schedule) {
    await supabase.from('income_schedules').update({
      next_date: income.date,
      recurring_occurrences_completed: Math.max(0, (schedule.recurring_occurrences_completed || 0) - 1),
    }).eq('id', schedule.id);
  }

  const { error: deleteError } = await supabase.from('income').delete().eq('id', incomeId);
  if (deleteError) throw deleteError;
  return true;
}
