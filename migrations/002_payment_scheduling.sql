-- Payment Scheduling and Reminders System
-- Run this in Supabase SQL Editor

-- Create scheduled_payments table
CREATE TABLE IF NOT EXISTS public.scheduled_payments (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('loan', 'credit_card', 'reserved_fund')),
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  scheduled_date DATE NOT NULL,
  payment_source TEXT NOT NULL CHECK (payment_source IN ('reserved_fund', 'credit_card', 'bank_account', 'cash_in_hand', 'cash')),
  payment_source_id TEXT,
  recurrence TEXT DEFAULT 'once' CHECK (recurrence IN ('once', 'weekly', 'biweekly', 'monthly', 'bimonthly')),
  recurrence_end_date DATE,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'failed')),
  executed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  failed_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_user ON scheduled_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_status ON scheduled_payments(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_date ON scheduled_payments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_entity ON scheduled_payments(entity_type, entity_id);

-- Enable RLS
ALTER TABLE public.scheduled_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own scheduled payments"
  ON public.scheduled_payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own scheduled payments"
  ON public.scheduled_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled payments"
  ON public.scheduled_payments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled payments"
  ON public.scheduled_payments FOR DELETE
  USING (auth.uid() = user_id);

-- Note: alert_history table already exists in your schema
-- No changes needed there - it's ready for reminders
