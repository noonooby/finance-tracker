-- =====================================================
-- RECURRING SCHEDULE ARCHITECTURE MIGRATION
-- Version: 008
-- Date: 2025-10-30
-- Purpose: Separate schedules from occurrences for Income, Loans, Credit Cards
-- =====================================================

-- =====================================================
-- PHASE 1: INCOME SCHEDULES
-- =====================================================

-- New table: Income schedule templates
CREATE TABLE IF NOT EXISTS public.income_schedules (
  id text NOT NULL DEFAULT concat('incsched_', encode(gen_random_bytes(8), 'hex')),
  user_id uuid NOT NULL,
  source text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  start_date date NOT NULL,
  next_date date NOT NULL,
  
  -- Deposit configuration
  deposit_target text NOT NULL DEFAULT 'cash_in_hand' CHECK (deposit_target IN ('bank', 'cash_in_hand')),
  deposit_account_id text,
  auto_deposit boolean DEFAULT true,
  
  -- Recurrence rules
  recurring_duration_type text DEFAULT 'indefinite' CHECK (recurring_duration_type IN ('indefinite', 'until_date', 'occurrences')),
  recurring_until_date date,
  recurring_occurrences_total integer,
  recurring_occurrences_completed integer DEFAULT 0,
  
  -- Status
  is_active boolean DEFAULT true,
  paused_at timestamp with time zone,
  completed_at timestamp with time zone,
  
  -- Metadata
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT income_schedules_pkey PRIMARY KEY (id),
  CONSTRAINT income_schedules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT income_schedules_deposit_account_fkey FOREIGN KEY (deposit_account_id) REFERENCES public.bank_accounts(id) ON DELETE SET NULL
);

-- Modify existing income table to link to schedules
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS schedule_id text;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS is_manual boolean DEFAULT false;

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'income_schedule_id_fkey'
  ) THEN
    ALTER TABLE public.income ADD CONSTRAINT income_schedule_id_fkey 
      FOREIGN KEY (schedule_id) REFERENCES public.income_schedules(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_income_schedules_user_next ON public.income_schedules(user_id, next_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_income_schedule_id ON public.income(schedule_id) WHERE schedule_id IS NOT NULL;

-- =====================================================
-- PHASE 2: LOAN PAYMENT SCHEDULES
-- =====================================================

-- New table: Loan payment history
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id text NOT NULL DEFAULT concat('loanpay_', encode(gen_random_bytes(8), 'hex')),
  user_id uuid NOT NULL,
  loan_id text NOT NULL,
  
  -- Payment details
  amount numeric NOT NULL,
  payment_date date NOT NULL,
  due_date date NOT NULL,
  
  -- Payment source
  payment_source text NOT NULL CHECK (payment_source IN ('bank_account', 'credit_card', 'cash_in_hand')),
  payment_source_id text,
  payment_source_name text,
  
  -- Status
  status text DEFAULT 'completed' CHECK (status IN ('scheduled', 'completed', 'failed', 'cancelled', 'undone')),
  auto_generated boolean DEFAULT false,
  
  -- Balance tracking
  balance_before numeric,
  balance_after numeric,
  
  -- References
  transaction_id uuid,
  
  -- Metadata
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  undone_at timestamp with time zone,
  
  CONSTRAINT loan_payments_pkey PRIMARY KEY (id),
  CONSTRAINT loan_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT loan_payments_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE,
  CONSTRAINT loan_payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON public.loan_payments(loan_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_loan_payments_user_status ON public.loan_payments(user_id, status) WHERE status != 'undone';

-- =====================================================
-- PHASE 3: CREDIT CARD PAYMENT SCHEDULES
-- =====================================================

-- New table: Credit card payment history
CREATE TABLE IF NOT EXISTS public.credit_card_payments (
  id text NOT NULL DEFAULT concat('ccpay_', encode(gen_random_bytes(8), 'hex')),
  user_id uuid NOT NULL,
  card_id text NOT NULL,
  
  -- Payment details
  amount numeric NOT NULL,
  payment_date date NOT NULL,
  due_date date NOT NULL,
  
  -- Payment source
  payment_source text NOT NULL CHECK (payment_source IN ('bank_account', 'cash_in_hand')),
  payment_source_id text,
  payment_source_name text,
  
  -- Status
  status text DEFAULT 'completed' CHECK (status IN ('scheduled', 'completed', 'failed', 'cancelled', 'undone')),
  auto_generated boolean DEFAULT false,
  
  -- Balance tracking
  balance_before numeric,
  balance_after numeric,
  
  -- References
  transaction_id uuid,
  
  -- Metadata
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  undone_at timestamp with time zone,
  
  CONSTRAINT credit_card_payments_pkey PRIMARY KEY (id),
  CONSTRAINT credit_card_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT credit_card_payments_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  CONSTRAINT credit_card_payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_cc_payments_card ON public.credit_card_payments(card_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_cc_payments_user_status ON public.credit_card_payments(user_id, status) WHERE status != 'undone';

-- =====================================================
-- PHASE 4: DATA MIGRATION HELPERS
-- =====================================================

-- Create indexes to help with migration queries
CREATE INDEX IF NOT EXISTS idx_income_frequency ON public.income(user_id, frequency) WHERE frequency IS NOT NULL AND frequency != 'onetime';
CREATE INDEX IF NOT EXISTS idx_loans_next_payment ON public.loans(user_id, next_payment_date) WHERE next_payment_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_cards_due_date ON public.credit_cards(user_id, due_date) WHERE due_date IS NOT NULL AND is_gift_card = false;

-- =====================================================
-- PHASE 5: ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE public.income_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_payments ENABLE ROW LEVEL SECURITY;

-- Policies for income_schedules
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'income_schedules' AND policyname = 'Users can view their own income schedules') THEN
    CREATE POLICY "Users can view their own income schedules"
      ON public.income_schedules FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'income_schedules' AND policyname = 'Users can insert their own income schedules') THEN
    CREATE POLICY "Users can insert their own income schedules"
      ON public.income_schedules FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'income_schedules' AND policyname = 'Users can update their own income schedules') THEN
    CREATE POLICY "Users can update their own income schedules"
      ON public.income_schedules FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'income_schedules' AND policyname = 'Users can delete their own income schedules') THEN
    CREATE POLICY "Users can delete their own income schedules"
      ON public.income_schedules FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Policies for loan_payments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loan_payments' AND policyname = 'Users can view their own loan payments') THEN
    CREATE POLICY "Users can view their own loan payments"
      ON public.loan_payments FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loan_payments' AND policyname = 'Users can insert their own loan payments') THEN
    CREATE POLICY "Users can insert their own loan payments"
      ON public.loan_payments FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loan_payments' AND policyname = 'Users can update their own loan payments') THEN
    CREATE POLICY "Users can update their own loan payments"
      ON public.loan_payments FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loan_payments' AND policyname = 'Users can delete their own loan payments') THEN
    CREATE POLICY "Users can delete their own loan payments"
      ON public.loan_payments FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Policies for credit_card_payments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'credit_card_payments' AND policyname = 'Users can view their own credit card payments') THEN
    CREATE POLICY "Users can view their own credit card payments"
      ON public.credit_card_payments FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'credit_card_payments' AND policyname = 'Users can insert their own credit card payments') THEN
    CREATE POLICY "Users can insert their own credit card payments"
      ON public.credit_card_payments FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'credit_card_payments' AND policyname = 'Users can update their own credit card payments') THEN
    CREATE POLICY "Users can update their own credit card payments"
      ON public.credit_card_payments FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'credit_card_payments' AND policyname = 'Users can delete their own credit card payments') THEN
    CREATE POLICY "Users can delete their own credit card payments"
      ON public.credit_card_payments FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify tables created
SELECT 
  tablename,
  CASE 
    WHEN tablename IN ('income_schedules', 'loan_payments', 'credit_card_payments') THEN '✅ NEW'
    ELSE '📋 MODIFIED'
  END as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('income_schedules', 'loan_payments', 'credit_card_payments', 'income')
ORDER BY tablename;

-- Verify columns added
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'income'
  AND column_name IN ('schedule_id', 'is_manual');

-- Verify RLS enabled
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('income_schedules', 'loan_payments', 'credit_card_payments');

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Next steps:
-- 1. Run data migration script to convert existing recurring income
-- 2. Update application code to use new schedule pattern
-- 3. Test auto-processing with new tables
-- =====================================================
