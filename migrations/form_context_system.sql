-- ============================================================================
-- FORM CONTEXT SYSTEM - DATABASE MIGRATION (FIXED)
-- Version: 1.1 | Date: 2025-10-17
-- ============================================================================
-- PURPOSE: Create tables to store user form preferences and context data
-- TABLES: 4 tables with TEXT IDs to match existing schema
-- ============================================================================

-- TABLE 1: Income Source Contexts
-- Stores learned preferences for income sources (e.g., "Salary" -> Bank + Account + Frequency)
CREATE TABLE income_source_contexts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  destination TEXT NOT NULL CHECK (destination IN ('bank', 'cash_in_hand')),
  account_id TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'onetime')) DEFAULT 'onetime',
  metadata JSONB DEFAULT '{}'::jsonb,
  usage_count INTEGER DEFAULT 1 NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, source_name)
);

CREATE INDEX idx_income_source_contexts_user ON income_source_contexts(user_id);
CREATE INDEX idx_income_source_contexts_recent ON income_source_contexts(user_id, last_used_at DESC);
CREATE INDEX idx_income_source_contexts_usage ON income_source_contexts(user_id, usage_count DESC);

ALTER TABLE income_source_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "income_contexts_select" ON income_source_contexts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "income_contexts_insert" ON income_source_contexts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "income_contexts_update" ON income_source_contexts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "income_contexts_delete" ON income_source_contexts FOR DELETE USING (auth.uid() = user_id);

-- TABLE 2: Expense Description Contexts
-- Stores learned preferences for expense descriptions (e.g., "Groceries" -> Category + Payment Method)
CREATE TABLE expense_description_contexts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL,
  payment_method_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  usage_count INTEGER DEFAULT 1 NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, description)
);

CREATE INDEX idx_expense_description_contexts_user ON expense_description_contexts(user_id);
CREATE INDEX idx_expense_description_contexts_recent ON expense_description_contexts(user_id, last_used_at DESC);
CREATE INDEX idx_expense_description_contexts_usage ON expense_description_contexts(user_id, usage_count DESC);

ALTER TABLE expense_description_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_contexts_select" ON expense_description_contexts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "expense_contexts_insert" ON expense_description_contexts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expense_contexts_update" ON expense_description_contexts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "expense_contexts_delete" ON expense_description_contexts FOR DELETE USING (auth.uid() = user_id);

-- TABLE 3: Card Payment Contexts
-- Stores learned preferences for credit card payments (e.g., Card -> Payment Source)
CREATE TABLE card_payment_contexts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  payment_source TEXT NOT NULL,
  payment_source_id TEXT,
  amount_mode TEXT NOT NULL CHECK (amount_mode IN ('full_balance', 'custom')) DEFAULT 'full_balance',
  metadata JSONB DEFAULT '{}'::jsonb,
  usage_count INTEGER DEFAULT 1 NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, card_id)
);

CREATE INDEX idx_card_payment_contexts_user ON card_payment_contexts(user_id);
CREATE INDEX idx_card_payment_contexts_recent ON card_payment_contexts(user_id, last_used_at DESC);

ALTER TABLE card_payment_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "card_payment_contexts_select" ON card_payment_contexts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "card_payment_contexts_insert" ON card_payment_contexts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "card_payment_contexts_update" ON card_payment_contexts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "card_payment_contexts_delete" ON card_payment_contexts FOR DELETE USING (auth.uid() = user_id);

-- TABLE 4: Loan Payment Contexts
-- Stores learned preferences for loan payments (e.g., Loan -> Payment Source)
CREATE TABLE loan_payment_contexts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  payment_source TEXT NOT NULL,
  payment_source_id TEXT,
  amount_mode TEXT NOT NULL CHECK (amount_mode IN ('full_payment', 'custom')) DEFAULT 'full_balance',
  metadata JSONB DEFAULT '{}'::jsonb,
  usage_count INTEGER DEFAULT 1 NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, loan_id)
);

CREATE INDEX idx_loan_payment_contexts_user ON loan_payment_contexts(user_id);
CREATE INDEX idx_loan_payment_contexts_recent ON loan_payment_contexts(user_id, last_used_at DESC);

ALTER TABLE loan_payment_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loan_payment_contexts_select" ON loan_payment_contexts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "loan_payment_contexts_insert" ON loan_payment_contexts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "loan_payment_contexts_update" ON loan_payment_contexts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "loan_payment_contexts_delete" ON loan_payment_contexts FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
