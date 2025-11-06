-- Migration: Add display_density column to user_preferences
-- Converts dashboard_compact_mode from boolean to a three-tier density system

-- Step 1: Add new display_density column
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS display_density VARCHAR(20) DEFAULT 'comfortable' 
CHECK (display_density IN ('comfortable', 'cozy', 'compact'));

-- Step 2: Migrate existing data (compact mode true -> compact, false -> comfortable)
UPDATE user_preferences 
SET display_density = CASE 
  WHEN dashboard_compact_mode = true THEN 'compact'
  ELSE 'comfortable'
END
WHERE display_density IS NULL OR display_density = 'comfortable';

-- Step 3: Optional - Keep dashboard_compact_mode for backward compatibility
-- If you want to remove it completely, uncomment:
-- ALTER TABLE user_preferences DROP COLUMN IF EXISTS dashboard_compact_mode;

-- Step 4: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_density 
ON user_preferences(display_density);

-- Note: Run this migration via Supabase SQL Editor or your migration tool
