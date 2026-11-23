/**
 * Complete Backup & Restore System
 * Exports/imports all user data in a single JSON file
 */

import { server, api } from '../server';
import { format } from 'date-fns';

const BACKUP_VERSION = '1.0.0';

// All tables to backup (order matters for restore)
const TABLES_TO_BACKUP = [
  'settings', 'user_preferences', 'categories', 'category_rules',
  'bank_accounts', 'credit_cards', 'loans', 'investments', 'assets',
  'income', 'income_schedules', 'bills', 'transactions', 'credit_card_payments', 'loan_payments',
  'activities', 'budget_tracking', 'balance_points', 'snapshots', 'scheduled_payments', 'known_entities', 'alert_history', 'saved_filters', 'report_templates',
  // Form contexts
  'expense_description_contexts', 'transfer_description_contexts', 'income_source_contexts',
  'loan_creation_contexts', 'loan_payment_contexts', 'card_payment_contexts', 'gift_card_purchase_contexts'
]

/**
 * Export complete database backup
 */
export async function exportFullBackup() {
  try {
    const { data: { user } } = await server.auth.getUser();
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
        const { data, error } = await server
          .from(table)
          .select('*')
          .eq('user_id', user.id);

        if (error && error.code !== 'PGRST116') {
          console.warn(`Error exporting ${table}:`, error);
          backup.data[table] = [];
        } else {
          backup.data[table] = data || [];
        }
      } catch (tableError) {
        console.warn(`Failed to export ${table}:`, tableError);
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
    console.error('Backup export failed:', error);
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

    return { success: true, filename, stats: backup.stats };
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
}

/**
 * Validate backup file structure
 */
function validateBackup(backup) {
  if (!backup || !backup.version || !backup.data || typeof backup.data !== 'object') throw new Error('That file is not a backup from this app.');
  
  // Check for critical tables
  const criticalTables = ['settings', 'categories', 'transactions'];
  for (const table of criticalTables) {
    if (!backup.data[table]) {
      console.warn(`Backup missing ${table} data`);
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
  const { skipTables = [] } = options;

  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Read and parse backup file
    const backupText = await backupFile.text();
    const backup = JSON.parse(backupText);

    // Validate
    validateBackup(backup);

    // One server step: the whole backup goes in, or nothing changes.
    const data = {};
    for (const table of TABLES_TO_BACKUP) {
      if (skipTables.includes(table)) continue;
      if (Array.isArray(backup.data[table])) data[table] = backup.data[table];
    }
    const done = await api('/api/restore-all', { confirm: 'REPLACE ALL MY DATA', data });
    return { success: true, stats: { totalImported: done.total, totalErrors: 0, tablesProcessed: Object.keys(done.restored).length, details: done.restored } };
  } catch (error) {
    console.error('Import failed:', error);
    throw error;
  }
}

/**
 * Quick backup check - returns backup stats without full export
 */
export async function getBackupStats() {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const stats = {};
    
    for (const table of TABLES_TO_BACKUP) {
      const { count, error } = await server
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
    console.error('Failed to get stats:', error);
    throw error;
  }
}
