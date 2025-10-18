-- ============================================================================
-- ADD: Loan Creation Contexts Table
-- Version: 1.0 | Date: 2025-10-17
-- ============================================================================
-- PURPOSE: Store loan templates to pre-fill loan creation forms
-- TRIGGER: loan_name (e.g., "Car Loan")
-- STORES: principal, interest_rate, payment_amount, frequency
-- ============================================================================

CREATE TABLE loan_creation_contexts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Trigger field
  loan_name TEXT NOT NULL,
  
  -- Template fields (what gets remembered)
  principal NUMERIC NOT NULL,
  interest_rate NUMERIC DEFAULT 0,
  payment_amount NUMERIC NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'bimonthly')) DEFAULT 'monthly',
  
  -- Metadata for flexibility
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Standard tracking
  usage_count INTEGER DEFAULT 1 NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  UNIQUE(user_id, loan_name)
);

CREATE INDEX idx_loan_creation_contexts_user ON loan_creation_contexts(user_id);
CREATE INDEX idx_loan_creation_contexts_recent ON loan_creation_contexts(user_id, last_used_at DESC);
CREATE INDEX idx_loan_creation_contexts_usage ON loan_creation_contexts(user_id, usage_count DESC);

ALTER TABLE loan_creation_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loan_creation_contexts_select" ON loan_creation_contexts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "loan_creation_contexts_insert" ON loan_creation_contexts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "loan_creation_contexts_update" ON loan_creation_contexts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "loan_creation_contexts_delete" ON loan_creation_contexts FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- VERIFICATION:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name = 'loan_creation_contexts';
-- ============================================================================
