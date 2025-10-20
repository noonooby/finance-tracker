import { dbOperation } from './db';
import { supabase } from './supabase';

/**
 * Payment Scheduling System
 * Manages scheduled future payments for loans, credit cards, and other obligations
 */

/**
 * Create a scheduled payment
 */
export const createScheduledPayment = async ({
  entityType,
  entityId,
  entityName,
  amount,
  scheduledDate,
  paymentSource,
  paymentSourceId,
  recurrence = 'once',
  recurrenceEndDate = null,
  notes = null
}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const schedule = {
      id: `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      amount,
      scheduled_date: scheduledDate,
      payment_source: paymentSource,
      payment_source_id: paymentSourceId,
      recurrence,
      recurrence_end_date: recurrenceEndDate,
      notes,
      status: 'pending',
      created_at: new Date().toISOString(),
      executed_at: null
    };

    const { data, error } = await supabase
      .from('scheduled_payments')
      .insert([schedule])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating scheduled payment:', error);
    throw error;
  }
};

/**
 * Get all scheduled payments for user
 */
export const getScheduledPayments = async (filters = {}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
      .from('scheduled_payments')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('scheduled_date', { ascending: true });

    if (filters.entityType) {
      query = query.eq('entity_type', filters.entityType);
    }

    if (filters.entityId) {
      query = query.eq('entity_id', filters.entityId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching scheduled payments:', error);
    return [];
  }
};

/**
 * Cancel a scheduled payment
 */
export const cancelScheduledPayment = async (scheduleId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('scheduled_payments')
      .update({ 
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('id', scheduleId)
      .eq('user_id', user.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error cancelling scheduled payment:', error);
    throw error;
  }
};

/**
 * Execute a scheduled payment (called by auto-processor)
 */
export const executeScheduledPayment = async (schedule) => {
  try {
    // This will be called by the auto-processor
    // Implementation depends on entity type
    console.log('Executing scheduled payment:', schedule);
    
    // Mark as executed
    const { error } = await supabase
      .from('scheduled_payments')
      .update({
        status: 'executed',
        executed_at: new Date().toISOString()
      })
      .eq('id', schedule.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error executing scheduled payment:', error);
    throw error;
  }
};

/**
 * Get upcoming scheduled payments (for reminders)
 */
export const getUpcomingScheduledPayments = async (daysAhead = 7) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + daysAhead);

    const { data, error } = await supabase
      .from('scheduled_payments')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('scheduled_date', today.toISOString().split('T')[0])
      .lte('scheduled_date', futureDate.toISOString().split('T')[0])
      .order('scheduled_date', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching upcoming scheduled payments:', error);
    return [];
  }
};
