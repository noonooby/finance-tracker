-- ============================================================================
-- FIX: Change payment_method_id from UUID to TEXT
-- Version: 1.0 | Date: 2025-10-17
-- ============================================================================
-- PROBLEM: payment_method_id column is UUID, but app uses TEXT IDs
-- SOLUTION: Convert column to TEXT to match credit_cards, loans, bank_accounts
-- ============================================================================

-- Step 1: Check current type (for reference)
-- Run this first to see current state:
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'transactions' 
-- AND column_name = 'payment_method_id';

-- Step 2: Drop and recreate as TEXT
ALTER TABLE transactions 
  ALTER COLUMN payment_method_id TYPE TEXT USING payment_method_id::TEXT;

-- ============================================================================
-- VERIFICATION:
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'transactions' 
-- AND column_name = 'payment_method_id';
-- 
-- Should show: payment_method_id | text
-- ============================================================================
