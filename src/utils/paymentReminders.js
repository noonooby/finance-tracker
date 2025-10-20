import { supabase } from './supabase';
import { getDaysUntil, formatCurrency } from './helpers';

/**
 * Payment Reminders System
 * Generates smart reminders for upcoming payments
 */

/**
 * Generate reminders for upcoming loan payments
 */
export const generateLoanPaymentReminders = async (loans, alertDaysBefore = 3) => {
  const reminders = [];

  for (const loan of loans) {
    if (!loan.next_payment_date) continue;

    const daysUntil = getDaysUntil(loan.next_payment_date);
    
    // Generate reminder if within alert window
    if (daysUntil >= 0 && daysUntil <= alertDaysBefore) {
      const hasAutoPayment = !!(loan.connected_payment_source);
      
      reminders.push({
        type: 'loan_payment',
        entityId: loan.id,
        entityName: loan.name,
        amount: loan.payment_amount,
        dueDate: loan.next_payment_date,
        daysUntil,
        hasAutoPayment,
        autoPaymentSource: hasAutoPayment ? loan.connected_payment_source : null,
        severity: daysUntil === 0 ? 'critical' : daysUntil === 1 ? 'warning' : 'info',
        message: hasAutoPayment
          ? `${loan.name} will be auto-paid ${daysUntil === 0 ? 'today' : `in ${daysUntil} day(s)`} from ${loan.connected_payment_source}`
          : `${loan.name} payment of ${formatCurrency(loan.payment_amount)} due ${daysUntil === 0 ? 'today' : `in ${daysUntil} day(s)`}`
      });
    }
  }

  return reminders;
};

/**
 * Generate reminders for credit card payments
 */
export const generateCreditCardReminders = async (creditCards, alertDaysBefore = 3) => {
  const reminders = [];

  for (const card of creditCards) {
    if (card.is_gift_card || !card.due_date || card.balance <= 0) continue;

    const daysUntil = getDaysUntil(card.due_date);
    
    if (daysUntil >= 0 && daysUntil <= alertDaysBefore) {
      reminders.push({
        type: 'credit_card_payment',
        entityId: card.id,
        entityName: card.name,
        amount: card.balance,
        dueDate: card.due_date,
        daysUntil,
        hasAutoPayment: false, // Credit cards don't auto-pay
        severity: daysUntil === 0 ? 'critical' : daysUntil === 1 ? 'warning' : 'info',
        message: `${card.name} payment of ${formatCurrency(card.balance)} due ${daysUntil === 0 ? 'today' : `in ${daysUntil} day(s)`}`
      });
    }
  }

  return reminders;
};

/**
 * Generate reminders for reserved funds
 */
export const generateReservedFundReminders = async (reservedFunds, alertDaysBefore = 3) => {
  const reminders = [];

  for (const fund of reservedFunds) {
    if (!fund.due_date) continue;

    const daysUntil = getDaysUntil(fund.due_date);
    
    if (daysUntil >= 0 && daysUntil <= alertDaysBefore) {
      const linkedInfo = fund.linked_to 
        ? ` (linked to ${fund.linked_to.type}: ${fund.linked_to.name || 'Unknown'})`
        : '';
      
      reminders.push({
        type: 'reserved_fund',
        entityId: fund.id,
        entityName: fund.name,
        amount: fund.amount,
        dueDate: fund.due_date,
        daysUntil,
        hasAutoPayment: !!(fund.linked_to),
        linkedEntity: fund.linked_to,
        severity: daysUntil === 0 ? 'warning' : 'info',
        message: `Reserved fund "${fund.name}" due ${daysUntil === 0 ? 'today' : `in ${daysUntil} day(s)`}${linkedInfo}`
      });
    }
  }

  return reminders;
};

/**
 * Get all payment reminders
 */
export const getAllPaymentReminders = async (
  loans,
  creditCards,
  reservedFunds,
  alertDaysBefore = 3
) => {
  const [loanReminders, cardReminders, fundReminders] = await Promise.all([
    generateLoanPaymentReminders(loans, alertDaysBefore),
    generateCreditCardReminders(creditCards, alertDaysBefore),
    generateReservedFundReminders(reservedFunds, alertDaysBefore)
  ]);

  const allReminders = [
    ...loanReminders,
    ...cardReminders,
    ...fundReminders
  ];

  // Sort by urgency (critical first, then by days)
  return allReminders.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return a.daysUntil - b.daysUntil;
  });
};

/**
 * Create reminder notification in alert_history table
 */
export const createReminderNotification = async (reminder) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const alertTypeMap = {
      'loan_payment': 'loan_payment_due',
      'credit_card_payment': 'payment_reminder',
      'reserved_fund': 'reserved_fund_due'
    };

    const notification = {
      user_id: user.id,
      alert_type: alertTypeMap[reminder.type] || 'payment_reminder',
      entity_type: reminder.type === 'loan_payment' ? 'loan' : reminder.type === 'credit_card_payment' ? 'credit_card' : 'reserved_fund',
      entity_id: reminder.entityId,
      entity_name: reminder.entityName,
      title: reminder.daysUntil === 0 ? 'Payment Due Today' : `Payment Due in ${reminder.daysUntil} Day${reminder.daysUntil === 1 ? '' : 's'}`,
      message: reminder.message,
      severity: reminder.severity,
      created_at: new Date().toISOString(),
      alert_key: `${reminder.type}_${reminder.entityId}_${reminder.dueDate}` // Prevent duplicates
    };

    // Check if notification already exists
    const { data: existing } = await supabase
      .from('alert_history')
      .select('id')
      .eq('alert_key', notification.alert_key)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      console.log('Reminder already exists for:', notification.alert_key);
      return null;
    }

    const { data, error } = await supabase
      .from('alert_history')
      .insert([notification])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating reminder notification:', error);
    return null;
  }
};

/**
 * Generate and save all due payment reminders
 * Should be called on app load or periodically
 */
export const generateAllReminders = async (loans, creditCards, reservedFunds, alertDaysBefore = 3) => {
  try {
    const reminders = await getAllPaymentReminders(loans, creditCards, reservedFunds, alertDaysBefore);
    
    const created = [];
    for (const reminder of reminders) {
      const notification = await createReminderNotification(reminder);
      if (notification) {
        created.push(notification);
      }
    }

    console.log(`📢 Generated ${created.length} payment reminders`);
    return created;
  } catch (error) {
    console.error('Error generating reminders:', error);
    return [];
  }
};

/**
 * Get active reminders for dashboard display
 */
export const getActiveReminders = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('alert_history')
      .select('*')
      .eq('user_id', user.id)
      .eq('read', false)
      .eq('dismissed', false)
      .in('alert_type', ['loan_payment_due', 'payment_reminder', 'reserved_fund_due'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching active reminders:', error);
    return [];
  }
};

/**
 * Mark reminder as read
 */
export const markReminderRead = async (reminderId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('alert_history')
      .update({ 
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', reminderId)
      .eq('user_id', user.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error marking reminder as read:', error);
    return false;
  }
};

/**
 * Dismiss reminder
 */
export const dismissReminder = async (reminderId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('alert_history')
      .update({ 
        dismissed: true,
        dismissed_at: new Date().toISOString()
      })
      .eq('id', reminderId)
      .eq('user_id', user.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error dismissing reminder:', error);
    return false;
  }
};
