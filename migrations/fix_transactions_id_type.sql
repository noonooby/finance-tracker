-- ============================================================================
-- FIX: Change transactions.id from UUID to TEXT
-- Version: 1.0 | Date: 2025-10-17
-- ============================================================================
-- PROBLEM: transactions.id is UUID, but app uses TEXT IDs via generateId()
-- EVIDENCE: Error "invalid input syntax for type uuid: mgvha20wgkb4pyq6anf"
-- SOLUTION: Convert transactions.id to TEXT to match credit_cards, loans, etc.
-- ============================================================================

-- CRITICAL: This is the root cause of the loan payment error!
-- The error happens because db.js generates non-UUID IDs for transactions

-- Step 1: Verify current type
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
AND column_name IN ('id', 'payment_method_id');
-- Expected: id = uuid, payment_method_id = text

-- Step 2: Convert id column to TEXT
ALTER TABLE transactions 
  ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- Step 3: Update default to use TEXT generation
-- Note: Remove UUID default since we'll generate TEXT IDs in the app
ALTER TABLE transactions 
  ALTER COLUMN id DROP DEFAULT;

-- ============================================================================
-- VERIFICATION:
-- ============================================================================
-- Check new column types:
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'transactions' 
AND column_name IN ('id', 'payment_method_id');

-- Expected output:
-- id              | text | (no default)
-- payment_method_id | text | (no default)
-- ============================================================================

-- IMPACT ANALYSIS:
-- ✅ Existing UUID transaction IDs will convert to TEXT automatically
-- ✅ All foreign key references will still work
-- ✅ No data loss
-- ✅ Fixes loan payment with credit card error
-- ✅ Makes schema consistent (all entity IDs are TEXT)
-- ============================================================================
