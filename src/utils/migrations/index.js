/**
 * Migration Index
 * Central place to run all database migrations
 */

import { runIncomeAutoDepositMigration } from './incomeAutoDepositMigration';

export async function runAllMigrations() {
  console.log('🚀 Running database migrations...');
  
  const results = [];
  
  // Run income auto-deposit migration
  const incomeResult = await runIncomeAutoDepositMigration();
  results.push({ name: 'income_auto_deposit', ...incomeResult });
  
  // Add future migrations here
  
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  
  console.log(`✅ Migrations complete: ${successCount} succeeded, ${failureCount} failed`);
  
  return results;
}
