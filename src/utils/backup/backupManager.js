/**
 * Complete Backup & Restore System
 * Exports/imports all user data in a single JSON file
 */

import { supabase } from '../supabase';
import { format } from 'date-fns';

const BACKUP_VERSION = '1.0.0';

// All tables to backup (order matters for restore)
const TABLES_TO_BACKUP = [
  'settings',
  'user_preferences',
  'categories',
  'bank_accounts',
  'credit_cards',
  'loans',
  'income',
  'transactions',
  'activities',
  'budgets',
  'budget_tracking',
  'scheduled_payments',
  'known_entities',
  'alert_history',
  'saved_filters',
  'report_templates',
  // Form contexts
  'expense_description_contexts',
  'transfer_description_contexts',
  'income_source_contexts',
  'loan_creation_contexts',
  'loan_payment_contexts',
  'card_payment_contexts',
  'gift_card_purchase_contexts'
];

/**
 * Export complete database backup
 */
export async function exportFullBackup() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const backup = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      userId: user.id,
      userEmail: user.email,
      data: {}
    };

    // Export each table
    for (const table of TABLES_TO_BACKUP) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('user_id', user.id);

        if (error && error.code !== 'PGRST116') {
          console.warn(`⚠️ Error exporting ${table}:`, error);
          backup.data[table] = [];
        } else {
          backup.data[table] = data || [];
          console.log(`✅ Exported ${table}: ${data?.length || 0} records`);
        }
      } catch (tableError) {
        console.warn(`⚠️ Failed to export ${table}:`, tableError);
        backup.data[table] = [];
      }
    }

    // Calculate stats
    backup.stats = {
      totalRecords: Object.values(backup.data).reduce((sum, arr) => sum + arr.length, 0),
      tables: Object.keys(backup.data).length,
      transactions: backup.data.transactions?.length || 0,
      activities: backup.data.activities?.length || 0,
      creditCards: backup.data.credit_cards?.length || 0,
      loans: backup.data.loans?.length || 0,
      bankAccounts: backup.data.bank_accounts?.length || 0
    };

    return backup;
  } catch (error) {
    console.error('❌ Backup export failed:', error);
    throw error;
  }
}

/**
 * Download backup as JSON file
 */
export async function downloadBackup() {
  try {
    const backup = await exportFullBackup();
    const filename = `finance-tracker-backup-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.json`;
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('✅ Backup downloaded:', filename);
    return { success: true, filename, stats: backup.stats };
  } catch (error) {
    console.error('❌ Download failed:', error);
    throw error;
  }
}

/**
 * Validate backup file structure
 */
function validateBackup(backup) {
  if (!backup.version) throw new Error('Invalid backup: missing version');
  if (!backup.data) throw new Error('Invalid backup: missing data');
  if (!backup.userId) throw new Error('Invalid backup: missing userId');
  
  // Check for critical tables
  const criticalTables = ['settings', 'categories', 'transactions'];
  for (const table of criticalTables) {
    if (!backup.data[table]) {
      console.warn(`⚠️ Backup missing ${table} data`);
    }
  }

  return true;
}

/**
 * Import full backup
 * Options:
 * - clearExisting: Delete all current data before import (default: true)
 * - skipTables: Array of tables to skip during import
 */
export async function importFullBackup(backupFile, options = {}) {
  const { clearExisting = true, skipTables = [] } = options;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Read and parse backup file
    const backupText = await backupFile.text();
    const backup = JSON.parse(backupText);

    // Validate
    validateBackup(backup);

    console.log('📦 Starting import...', backup.stats);
    
    // Clear existing data if requested
    if (clearExisting) {
      console.log('🗑️ Clearing existing data...');
      await clearAllUserData(user.id);
    }

    // Import each table
    const results = {};
    for (const table of TABLES_TO_BACKUP) {
      if (skipTables.includes(table)) {
        console.log(`⏭️ Skipping ${table}`);
        results[table] = { skipped: true };
        continue;
      }

      const records = backup.data[table] || [];
      if (records.length === 0) {
        results[table] = { imported: 0, errors: 0 };
        continue;
      }

      try {
        // Update user_id to current user
        const recordsToImport = records.map(record => ({
          ...record,
          user_id: user.id
        }));

        // Import in batches of 100
        const batchSize = 100;
        let imported = 0;
        let errors = 0;

        for (let i = 0; i < recordsToImport.length; i += batchSize) {
          const batch = recordsToImport.slice(i, i + batchSize);
          const { error } = await supabase
            .from(table)
            .upsert(batch, { onConflict: 'id' });

          if (error) {
            console.error(`❌ Error importing batch to ${table}:`, error);
            errors += batch.length;
          } else {
            imported += batch.length;
          }
        }

        results[table] = { imported, errors };
        console.log(`✅ Imported ${table}: ${imported} records${errors ? ` (${errors} errors)` : ''}`);
      } catch (tableError) {
        console.error(`❌ Failed to import ${table}:`, tableError);
        results[table] = { imported: 0, errors: records.length };
      }
    }

    // Calculate final stats
    const stats = {
      totalImported: Object.values(results).reduce((sum, r) => sum + (r.imported || 0), 0),
      totalErrors: Object.values(results).reduce((sum, r) => sum + (r.errors || 0), 0),
      tablesProcessed: Object.keys(results).length,
      details: results
    };

    console.log('✅ Import complete:', stats);
    return { success: true, stats };
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  }
}

/**
 * Clear all user data (used before import)
 */
async function clearAllUserData(userId) {
  const tablesToClear = [...TABLES_TO_BACKUP].reverse(); // Reverse order for FK constraints

  for (const table of tablesToClear) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('user_id', userId);

      if (error && error.code !== 'PGRST116') {
        console.warn(`⚠️ Error clearing ${table}:`, error);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to clear ${table}:`, err);
    }
  }
}

/**
 * Quick backup check - returns backup stats without full export
 */
export async function getBackupStats() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const stats = {};
    
    for (const table of TABLES_TO_BACKUP) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      stats[table] = error ? 0 : count || 0;
    }

    return {
      ...stats,
      total: Object.values(stats).reduce((sum, count) => sum + count, 0)
    };
  } catch (error) {
    console.error('❌ Failed to get stats:', error);
    throw error;
  }
}
