// ============================================
// BANK ACCOUNTS MIGRATION HELPER
// Phase 2: One-time migration from Available Cash to Bank Accounts
//
// PURPOSE:
// - Safely migrate existing users from single "Available Cash" to bank accounts
// - Maintain backward compatibility during transition
// - Ensure no data loss during migration
//
// SAFETY FEATURES:
// - Idempotent (can run multiple times safely)
// - Checks migration status before executing
// - Creates primary account with existing cash balance
// - Does not modify existing data until migration is confirmed
// ============================================

import { supabase } from './supabase';
import { generateId } from './helpers';
import { upsertBankAccount, getPrimaryBankAccount } from './db';

/**
 * Check if user has already migrated to bank accounts system
 *
 * SAFETY: This function is read-only and makes no changes
 *
 * @returns {Promise<boolean>} True if user has a primary bank account
 */
export async function checkMigrationStatus() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('⚠️ No authenticated user, migration check skipped');
      return false;
    }

    const primaryAccount = await getPrimaryBankAccount();
    const hasMigrated = !!primaryAccount;

    console.log(hasMigrated ? '✅ User has migrated to bank accounts' : '⏳ User has not migrated yet');

    return hasMigrated;
  } catch (error) {
    console.error('❌ Error checking migration status:', error);
    return false;
  }
}

/**
 * Get current available cash from settings table (legacy system)
 *
 * SAFETY: Read-only operation, does not modify data
 * Used during migration to get the balance to transfer to primary account
 *
 * @returns {Promise<number>} Current available cash amount
 */
export async function getLegacyAvailableCash() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('⚠️ No authenticated user');
      return 0;
    }

    const { data, error } = await supabase
      .from('settings')
      .select('available_cash')
      .eq('user_id', user.id)
      .single();

    if (error) {
      // If no settings record exists, default to 0
      if (error.code === 'PGRST116') {
        console.log('ℹ️ No settings record found, defaulting to $0.00');
        return 0;
      }
      throw error;
    }

    const cash = parseFloat(data?.available_cash || 0);
    console.log('💵 Legacy available cash:', cash);
    return cash;
  } catch (error) {
    console.error('❌ Error getting legacy available cash:', error);
    return 0;
  }
}

/**
 * ONE-TIME MIGRATION: Convert Available Cash to Primary Bank Account
 *
 * WHAT THIS DOES:
 * 1. Checks if user already has a primary bank account (idempotent check)
 * 2. Gets current available cash from settings table
 * 3. Creates a new primary bank account with that balance
 * 4. Does NOT delete or modify the settings.available_cash (for backward compatibility)
 *
 * SAFETY FEATURES:
 * - Will not run if user already has primary account
 * - Does not modify existing data
 * - Preserves all existing transactions
 * - Can be safely run multiple times
 *
 * BACKWARD COMPATIBILITY:
 * - Keeps settings.available_cash intact
 * - New code will use bank accounts
 * - Old code paths still work during transition
 *
 * @returns {Promise<Object>} Migration result
 * @returns {boolean} return.alreadyMigrated - True if already migrated
 * @returns {Object} return.primaryAccount - Created primary account (if new migration)
 * @returns {number} return.migratedBalance - Balance that was migrated
 */
export async function migrateAvailableCashToBank() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Not authenticated - cannot perform migration');
    }

    console.log('🔄 Starting migration check for user:', user.id);

    // SAFETY CHECK: Has user already migrated?
    const alreadyMigrated = await checkMigrationStatus();
    if (alreadyMigrated) {
      console.log('✅ User already has bank accounts - migration skipped');
      return {
        alreadyMigrated: true,
        message: 'Migration already complete'
      };
    }

    // Get current available cash from legacy system
    const currentCash = await getLegacyAvailableCash();
    console.log(`💰 Migrating balance: $${currentCash.toFixed(2)}`);

    // Create primary bank account with the available cash balance
    const primaryAccount = {
      id: generateId(),
      name: 'Primary Checking',
      balance: currentCash,
      account_type: 'checking',
      is_primary: true,
      institution: '', // User can update later
      notes: 'Automatically created during migration from Available Cash system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('🏦 Creating primary bank account:', primaryAccount.name);
    const createdAccount = await upsertBankAccount(primaryAccount);

    console.log('✅ Migration complete!');
    console.log('   - Primary account created:', createdAccount.name);
    console.log('   - Balance migrated:', `$${currentCash.toFixed(2)}`);
    console.log('   - Account ID:', createdAccount.id);

    return {
      alreadyMigrated: false,
      primaryAccount: createdAccount,
      migratedBalance: currentCash,
      message: 'Migration completed successfully'
    };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw new Error(`Migration failed: ${error.message}`);
  }
}

/**
 * Get available cash - works for both legacy and new system
 *
 * BACKWARD COMPATIBILITY FUNCTION:
 * - During transition, checks if user has migrated
 * - If migrated: returns primary account balance
 * - If not migrated: returns legacy available cash
 *
 * This ensures code works whether user has migrated or not
 *
 * @returns {Promise<number>} Available cash amount
 */
export async function getAvailableCash() {
  try {
    const hasMigrated = await checkMigrationStatus();

    if (hasMigrated) {
      // User has bank accounts - return primary account balance
      const primaryAccount = await getPrimaryBankAccount();
      const balance = primaryAccount ? parseFloat(primaryAccount.balance || 0) : 0;
      console.log('💵 Available cash (from primary account):', balance);
      return balance;
    } else {
      // User still on legacy system - return settings.available_cash
      const cash = await getLegacyAvailableCash();
      console.log('💵 Available cash (from legacy settings):', cash);
      return cash;
    }
  } catch (error) {
    console.error('❌ Error getting available cash:', error);
    return 0;
  }
}

/**
 * Update available cash - works for both legacy and new system
 *
 * BACKWARD COMPATIBILITY FUNCTION:
 * - During transition, checks if user has migrated
 * - If migrated: updates primary account balance
 * - If not migrated: updates legacy settings.available_cash
 *
 * This ensures existing code paths work whether user has migrated or not
 *
 * @param {number} newAmount - New cash amount
 * @returns {Promise<void>}
 */
export async function updateAvailableCash(newAmount) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const hasMigrated = await checkMigrationStatus();

    if (hasMigrated) {
      // User has bank accounts - update primary account
      const primaryAccount = await getPrimaryBankAccount();
      if (!primaryAccount) {
        throw new Error('No primary account found');
      }

      const { updateBankAccountBalance } = await import('./db');
      await updateBankAccountBalance(primaryAccount.id, newAmount);
      console.log('✅ Updated primary account balance:', newAmount);
    } else {
      // User still on legacy system - update settings.available_cash
      const { error } = await supabase
        .from('settings')
        .upsert({
          user_id: user.id,
          available_cash: newAmount,
        });

      if (error) throw error;
      console.log('✅ Updated legacy available cash:', newAmount);
    }
  } catch (error) {
    console.error('❌ Error updating available cash:', error);
    throw error;
  }
}

/**
 * Auto-migrate user on app load (if needed)
 *
 * USAGE: Call this once when app initializes
 * - Checks if migration is needed
 * - If needed, performs migration automatically
 * - If already migrated, does nothing
 *
 * @returns {Promise<Object>} Migration result
 */
export async function autoMigrateIfNeeded() {
  try {
    const alreadyMigrated = await checkMigrationStatus();

    if (!alreadyMigrated) {
      console.log('🔄 User needs migration - starting automatic migration...');
      const result = await migrateAvailableCashToBank();
      return result;
    }

    return {
      alreadyMigrated: true,
      message: 'No migration needed'
    };
  } catch (error) {
    console.error('❌ Auto-migration failed:', error);
    // Don't throw - allow app to continue working with legacy system
    return {
      error: true,
      message: error.message
    };
  }
}

// ============================================
// END OF MIGRATION HELPER
// ============================================
