/**
 * Bulk Transaction Update System
 * Export to Excel, edit, import back with validation
 */

import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import { format } from 'date-fns';

/**
 * Export transactions to Excel for bulk editing
 */
export async function exportTransactionsForEdit(filters = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Build query
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('date', { ascending: false });

    // Apply filters
    if (filters.startDate) {
      query = query.gte('date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('date', filters.endDate);
    }
    if (filters.type) {
      query = query.eq('type', filters.type);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Format for Excel
    const excelData = data.map(txn => ({
      'ID': txn.id,
      'Date': txn.date,
      'Type': txn.type,
      'Amount': Number(txn.amount),
      'Description': txn.description || '',
      'Category ID': txn.category_id || '',
      'Category Name': txn.category_name || '',
      'Payment Method': txn.payment_method || '',
      'Payment Method ID': txn.payment_method_id || '',
      'Payment Method Name': txn.payment_method_name || '',
      'Notes': txn.notes || '',
      'Status': txn.status || 'active'
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
      { wch: 36 }, // ID
      { wch: 12 }, // Date
      { wch: 12 }, // Type
      { wch: 12 }, // Amount
      { wch: 30 }, // Description
      { wch: 36 }, // Category ID
      { wch: 20 }, // Category Name
      { wch: 20 }, // Payment Method
      { wch: 36 }, // Payment Method ID
      { wch: 20 }, // Payment Method Name
      { wch: 30 }, // Notes
      { wch: 10 }  // Status
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    // Add instructions sheet
    const instructions = [
      ['Bulk Transaction Edit Instructions'],
      [''],
      ['1. Edit only the cells you want to change'],
      ['2. DO NOT modify the ID column - this identifies each transaction'],
      ['3. DO NOT modify column headers'],
      ['4. Valid Type values: income, expense, payment, transfer'],
      ['5. Date format: YYYY-MM-DD (e.g., 2025-01-15)'],
      ['6. Amount must be a positive number'],
      ['7. Status values: active, deleted'],
      [''],
      ['Fields you can edit:'],
      ['- Date'],
      ['- Type'],
      ['- Amount'],
      ['- Description'],
      ['- Category Name (must match existing category)'],
      ['- Payment Method Name'],
      ['- Notes'],
      [''],
      ['After editing, save and import the file back into the app.']
    ];
    const instructionsWs = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

    // Download
    const filename = `transactions-bulk-edit-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.xlsx`;
    XLSX.writeFile(wb, filename);

    console.log('✅ Exported', data.length, 'transactions for editing');
    return { success: true, count: data.length, filename };
  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  }
}

/**
 * Import edited transactions from Excel
 */
export async function importEditedTransactions(file, options = {}) {
  const { dryRun = false, skipValidation = false } = options;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Read Excel file
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);
    const ws = wb.Sheets['Transactions'];
    const data = XLSX.utils.sheet_to_json(ws);

    console.log('📊 Processing', data.length, 'transactions...');

    // Fetch existing transactions for comparison
    const ids = data.map(row => row.ID).filter(Boolean);
    const { data: existing, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .in('id', ids);

    if (fetchError) throw fetchError;

    const existingMap = new Map(existing.map(t => [t.id, t]));

    // Validate and prepare updates
    const updates = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // Excel row (header is row 1)

      try {
        // Validate ID exists
        if (!row.ID) {
          errors.push({ row: rowNum, error: 'Missing ID' });
          continue;
        }

        const original = existingMap.get(row.ID);
        if (!original) {
          errors.push({ row: rowNum, id: row.ID, error: 'Transaction not found' });
          continue;
        }

        // Build update object (only changed fields)
        const update = { id: row.ID };
        let hasChanges = false;

        // Date
        if (row.Date && row.Date !== original.date) {
          const dateStr = typeof row.Date === 'number' 
            ? XLSX.SSF.format('yyyy-mm-dd', row.Date)
            : String(row.Date);
          
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            errors.push({ row: rowNum, id: row.ID, error: `Invalid date format: ${dateStr}` });
            continue;
          }
          update.date = dateStr;
          hasChanges = true;
        }

        // Amount
        if (row.Amount !== undefined && Number(row.Amount) !== Number(original.amount)) {
          const amount = Number(row.Amount);
          if (!Number.isFinite(amount) || amount < 0) {
            errors.push({ row: rowNum, id: row.ID, error: `Invalid amount: ${row.Amount}` });
            continue;
          }
          update.amount = amount;
          hasChanges = true;
        }

        // Type
        if (row.Type && row.Type !== original.type) {
          const validTypes = ['income', 'expense', 'payment', 'transfer', 'cash_withdrawal', 'cash_deposit'];
          if (!validTypes.includes(row.Type)) {
            errors.push({ row: rowNum, id: row.ID, error: `Invalid type: ${row.Type}` });
            continue;
          }
          update.type = row.Type;
          hasChanges = true;
        }

        // Description
        if (row.Description !== undefined && row.Description !== original.description) {
          update.description = String(row.Description || '');
          hasChanges = true;
        }

        // Category Name
        if (row['Category Name'] !== undefined && row['Category Name'] !== original.category_name) {
          update.category_name = String(row['Category Name'] || '');
          hasChanges = true;
        }

        // Payment Method Name
        if (row['Payment Method Name'] !== undefined && row['Payment Method Name'] !== original.payment_method_name) {
          update.payment_method_name = String(row['Payment Method Name'] || '');
          hasChanges = true;
        }

        // Notes
        if (row.Notes !== undefined && row.Notes !== original.notes) {
          update.notes = String(row.Notes || '');
          hasChanges = true;
        }

        // Status
        if (row.Status && row.Status !== original.status) {
          if (!['active', 'deleted'].includes(row.Status)) {
            errors.push({ row: rowNum, id: row.ID, error: `Invalid status: ${row.Status}` });
            continue;
          }
          update.status = row.Status;
          hasChanges = true;
        }

        if (hasChanges) {
          updates.push(update);
        }
      } catch (rowError) {
        errors.push({ row: rowNum, id: row.ID, error: rowError.message });
      }
    }

    // Dry run - return preview
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        updates: updates.length,
        errors: errors.length,
        preview: {
          toUpdate: updates.slice(0, 10), // First 10
          errors: errors.slice(0, 10)
        }
      };
    }

    // Apply updates
    if (updates.length === 0) {
      return {
        success: true,
        message: 'No changes detected',
        updated: 0,
        errors: errors.length,
        errorDetails: errors
      };
    }

    let updated = 0;
    const updateErrors = [...errors];

    // Update in batches
    const batchSize = 50;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      const { error: batchError } = await supabase
        .from('transactions')
        .upsert(
          batch.map(u => ({ ...u, user_id: user.id, updated_at: new Date().toISOString() })),
          { onConflict: 'id' }
        );

      if (batchError) {
        console.error('❌ Batch update error:', batchError);
        updateErrors.push({ batch: i / batchSize + 1, error: batchError.message });
      } else {
        updated += batch.length;
      }
    }

    console.log('✅ Updated', updated, 'transactions');
    
    return {
      success: true,
      updated,
      errors: updateErrors.length,
      errorDetails: updateErrors.length > 0 ? updateErrors : undefined
    };
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  }
}

/**
 * Bulk update specific fields for multiple transactions
 */
export async function bulkUpdateTransactions(transactionIds, updates) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (!transactionIds || transactionIds.length === 0) {
      throw new Error('No transactions selected');
    }

    // Prepare update data
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    // Remove undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    // Update transactions
    const { data, error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('user_id', user.id)
      .in('id', transactionIds)
      .select();

    if (error) throw error;

    console.log('✅ Bulk updated', data.length, 'transactions');
    return { success: true, updated: data.length };
  } catch (error) {
    console.error('❌ Bulk update failed:', error);
    throw error;
  }
}
