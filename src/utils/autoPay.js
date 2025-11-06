import { supabase } from './supabase';
import { dbOperation, getBankAccount } from './db';
import { logActivity } from './activityLogger';
import { formatCurrency, predictNextDate, getDaysUntil } from './helpers';

/**
 * Enhanced Auto-Payment System
 * 
 * NOTE: This file is being migrated to use the new schedule-based architecture.
 * New code should use functions from ./schedules/ instead.
 */

// Re-export new schedule-based functions
export { 
  processDueIncomeSchedules,
  processOverdueLoanPayments as processOverdueLoans,
  processOverdueCreditCardPayments as processOverdueCreditCards
} from './schedules';

/**
 * DEPRECATED: Use processDueIncomeSchedules from ./schedules instead
 */
export const autoDepositDueIncome = async () => {
  console.warn('\u26a0\ufe0f autoDepositDueIncome is deprecated. Use processDueIncomeSchedules from ./schedules instead.');
  const { processDueIncomeSchedules } = await import('./schedules');
  return await processDueIncomeSchedules();
};

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

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const todayInfo = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return { date: today, iso: today.toISOString().split('T')[0] };
};

const hasRecurringEnded = (entity, today) => {
  if (!entity) return false;

  if (entity.recurring_duration_type === 'until_date' && entity.recurring_until_date) {
    const endDate = new Date(entity.recurring_until_date);
    endDate.setHours(0, 0, 0, 0);
    if (today > endDate) {
      return true;
    }
  }

  if (entity.recurring_duration_type === 'occurrences') {
    const total = entity.recurring_occurrences_total || 0;
    const completed = entity.recurring_occurrences_completed || 0;
    if (total && completed >= total) {
      return true;
    }
  }

  return false;
};
