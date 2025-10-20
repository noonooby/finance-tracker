import { supabase } from '../supabase';

/**
 * Migration: Add auto_deposit column to income table
 * This enables per-income control over automatic deposits
 */
export async function migrateIncomeAutoDeposit() {
  try {
    console.log('🔄 Starting income auto_deposit migration...');
    
    // Check if column already exists
    const { data: existingIncome, error: fetchError } = await supabase
      .from('income')
      .select('*')
      .limit(1);
    
    if (fetchError) {
      console.error('Error fetching income:', fetchError);
      return { success: false, error: fetchError };
    }
    
    // If we got data and it has auto_deposit, migration already done
    if (existingIncome && existingIncome.length > 0 && 'auto_deposit' in existingIncome[0]) {
      console.log('✅ auto_deposit column already exists');
      return { success: true, alreadyMigrated: true };
    }
    
    // Get all income records
    const { data: allIncome, error: getAllError } = await supabase
      .from('income')
      .select('*');
    
    if (getAllError) {
      console.error('Error getting all income:', getAllError);
      return { success: false, error: getAllError };
    }
    
    if (!allIncome || allIncome.length === 0) {
      console.log('✅ No income records to migrate');
      return { success: true, count: 0 };
    }
    
    // Update each record to add auto_deposit = true by default
    console.log(`📝 Migrating ${allIncome.length} income records...`);
    
    const updates = allIncome.map(inc => ({
      ...inc,
      auto_deposit: true // Default to enabled for existing recurring income
    }));
    
    const { error: updateError } = await supabase
      .from('income')
      .upsert(updates);
    
    if (updateError) {
      console.error('Error updating income records:', updateError);
      return { success: false, error: updateError };
    }
    
    console.log(`✅ Successfully migrated ${allIncome.length} income records`);
    return { success: true, count: allIncome.length };
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return { success: false, error };
  }
}

/**
 * Run this migration automatically on app load
 */
export async function runIncomeAutoDepositMigration() {
  try {
    const result = await migrateIncomeAutoDeposit();
    
    if (result.success) {
      if (result.alreadyMigrated) {
        console.log('ℹ️ Income auto-deposit migration: Already completed');
      } else {
        console.log(`✅ Income auto-deposit migration: Complete (${result.count} records updated)`);
      }
    } else {
      console.warn('⚠️ Income auto-deposit migration failed:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Failed to run income auto-deposit migration:', error);
    return { success: false, error };
  }
}
