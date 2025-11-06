/**
 * Bulk Upload NEW Transactions
 * Simple template-based system for adding multiple new transactions at once
 */

import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import { format } from 'date-fns';
import { fetchCategories } from '../categories';
import { getAllSettings } from '../settingsManager';

/**
 * Download a blank template for bulk transaction upload
 */
export async function downloadTransactionTemplate() {
  try {
    // Create template data with instructions
    const templateData = [
      {
        'Date': '2025-01-15',
        'Amount': 45.00,
        'Description': 'Grocery Store',
        'Type': 'expense',
        'Category': 'Food',
        'Payment Method': 'Cash in Hand',
        'Notes': 'Weekly groceries'
      },
      {
        'Date': '2025-01-16',
        'Amount': 1200.00,
        'Description': 'Monthly Salary',
        'Type': 'income',
        'Category': 'Salary',
        'Payment Method': 'Bank Account',
        'Notes': ''
      }
    ];

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData);

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 10 }, // Amount
      { wch: 25 }, // Description
      { wch: 12 }, // Type
      { wch: 20 }, // Category
      { wch: 20 }, // Payment Method
      { wch: 30 }  // Notes
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    // Add instructions sheet
    const instructions = [
      ['Bulk Transaction Upload Template'],
      [''],
      ['Instructions:'],
      ['1. Fill in your transactions below the sample rows'],
      ['2. Delete the sample rows or keep them as reference'],
      ['3. Save the file and upload it back to the app'],
      [''],
      ['Required Fields:'],
      ['- Date: Format must be YYYY-MM-DD (e.g., 2025-01-15)'],
      ['- Amount: Positive number (e.g., 45.00 or 1200)'],
      [''],
      ['Optional Fields (will be auto-detected if left empty):'],
      ['- Description: Brief description of transaction'],
      ['- Type: "income" or "expense" (auto-detected from description/amount)'],
      ['- Category: Category name (auto-matched from description)'],
      ['- Payment Method: "Cash in Hand", "Bank Account", "Credit Card", or card name'],
      ['- Notes: Additional details'],
      [''],
      ['Smart Auto-Detection:'],
      ['- Type is auto-detected from keywords (salary, paycheck → income)'],
      ['- Category is auto-matched from description using learned patterns'],
      ['- Payment method defaults to your setting if not specified'],
      [''],
      ['Valid Type Values:'],
      ['- income'],
      ['- expense'],
      [''],
      ['Tips:'],
      ['- Keep descriptions consistent for better auto-categorization'],
      ['- Leave Type/Category blank to use smart detection'],
      ['- You can add hundreds of transactions at once'],
      ['- Review the preview before finalizing the upload']
    ];
    const instructionsWs = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

    // Download
    const filename = `transaction-upload-template-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    XLSX.writeFile(wb, filename);

    console.log('✅ Template downloaded:', filename);
    return { success: true, filename };
  } catch (error) {
    console.error('❌ Template download failed:', error);
    throw error;
  }
}

/**
 * Auto-detect transaction type from description and keywords
 */
function detectTransactionType(description, amount) {
  if (!description) return 'expense'; // Default to expense

  const desc = description.toLowerCase();
  
  // Income keywords
  const incomeKeywords = [
    'salary', 'paycheck', 'pay check', 'wage', 'bonus',
    'refund', 'reimbursement', 'income', 'deposit',
    'payment received', 'freelance', 'contract', 'dividend',
    'interest', 'cashback', 'reward', 'gift received'
  ];

  for (const keyword of incomeKeywords) {
    if (desc.includes(keyword)) return 'income';
  }

  return 'expense';
}

/**
 * Auto-match category from description
 */
async function matchCategory(description, type, categories) {
  if (!description) return null;

  const desc = description.toLowerCase();
  
  // Filter categories by type
  const relevantCategories = categories.filter(cat => 
    type === 'income' ? cat.is_income : !cat.is_income
  );

  // Try exact name match first
  for (const cat of relevantCategories) {
    if (desc.includes(cat.name.toLowerCase())) {
      return cat.id;
    }
  }

  // Try keyword matching
  const categoryKeywords = {
    // Expense categories
    'food': ['grocery', 'restaurant', 'food', 'cafe', 'dinner', 'lunch', 'breakfast', 'pizza', 'burger'],
    'groceries': ['grocery', 'supermarket', 'walmart', 'costco', 'target'],
    'transport': ['uber', 'lyft', 'taxi', 'gas', 'fuel', 'parking', 'transit', 'bus', 'train'],
    'utilities': ['electric', 'water', 'gas bill', 'internet', 'phone bill', 'utility'],
    'entertainment': ['movie', 'netflix', 'spotify', 'game', 'concert', 'show', 'theatre'],
    'shopping': ['amazon', 'shop', 'store', 'mall', 'clothing', 'clothes'],
    'health': ['doctor', 'hospital', 'pharmacy', 'medicine', 'medical', 'dental', 'gym'],
    'rent': ['rent', 'lease', 'housing'],
    // Income categories
    'salary': ['salary', 'paycheck', 'wage', 'pay'],
    'freelance': ['freelance', 'contract', 'consulting'],
    'bonus': ['bonus', 'commission'],
    'refund': ['refund', 'reimbursement']
  };

  for (const cat of relevantCategories) {
    const catNameLower = cat.name.toLowerCase();
    const keywords = categoryKeywords[catNameLower] || [catNameLower];
    
    for (const keyword of keywords) {
      if (desc.includes(keyword)) {
        return cat.id;
      }
    }
  }

  return null; // No match found
}

/**
 * Parse and validate transaction rows from Excel
 */
async function parseTransactionRows(data) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Load categories and settings for smart matching
  const categories = await fetchCategories();
  const settings = await getAllSettings();
  const defaultPaymentMethod = settings.defaultPaymentMethod || 'cash_in_hand';

  const validTransactions = [];
  const errors = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 2; // Excel row (header is row 1)

    try {
      // Validate required fields
      if (!row.Date) {
        errors.push({ row: rowNum, error: 'Missing Date' });
        continue;
      }

      if (!row.Amount || isNaN(Number(row.Amount)) || Number(row.Amount) <= 0) {
        errors.push({ row: rowNum, error: `Invalid Amount: ${row.Amount}` });
        continue;
      }

      // Parse date
      const dateStr = typeof row.Date === 'number'
        ? XLSX.SSF.format('yyyy-mm-dd', row.Date)
        : String(row.Date);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        errors.push({ row: rowNum, error: `Invalid date format: ${dateStr}. Use YYYY-MM-DD` });
        continue;
      }

      const amount = Number(row.Amount);
      const description = row.Description ? String(row.Description).trim() : '';

      // Auto-detect or use provided type
      let type = row.Type ? String(row.Type).toLowerCase().trim() : null;
      if (!type) {
        type = detectTransactionType(description, amount);
      }

      // Validate type
      if (!['income', 'expense'].includes(type)) {
        errors.push({ row: rowNum, error: `Invalid type: ${type}. Must be "income" or "expense"` });
        continue;
      }

      // Auto-match or use provided category
      let categoryId = null;
      let categoryName = null;

      if (row.Category) {
        // Try to find category by name
        const catName = String(row.Category).trim();
        const matchedCat = categories.find(c => 
          c.name.toLowerCase() === catName.toLowerCase() &&
          (type === 'income' ? c.is_income : !c.is_income)
        );
        
        if (matchedCat) {
          categoryId = matchedCat.id;
          categoryName = matchedCat.name;
        } else {
          categoryName = catName; // Store name even if not found
        }
      } else if (description) {
        // Auto-match from description
        categoryId = await matchCategory(description, type, categories);
        if (categoryId) {
          const cat = categories.find(c => c.id === categoryId);
          categoryName = cat?.name;
        }
      }

      // Payment method
      let paymentMethod = defaultPaymentMethod;
      let paymentMethodName = null;

      if (row['Payment Method']) {
        const pmInput = String(row['Payment Method']).toLowerCase().trim();
        
        if (pmInput === 'cash in hand' || pmInput === 'cash') {
          paymentMethod = 'cash_in_hand';
          paymentMethodName = 'Cash in Hand';
        } else if (pmInput === 'bank account' || pmInput === 'bank') {
          paymentMethod = 'bank_account';
          paymentMethodName = 'Bank Account';
        } else if (pmInput === 'credit card' || pmInput === 'card') {
          paymentMethod = 'credit_card';
          paymentMethodName = 'Credit Card';
        } else {
          // Assume it's a specific card/account name
          paymentMethod = 'credit_card';
          paymentMethodName = row['Payment Method'];
        }
      }

      const notes = row.Notes ? String(row.Notes).trim() : '';

      // Build transaction object
      const transaction = {
        user_id: user.id,
        type,
        amount,
        date: dateStr,
        description,
        category_id: categoryId,
        category_name: categoryName,
        payment_method: paymentMethod,
        payment_method_name: paymentMethodName,
        notes,
        status: 'active',
        is_cleared: false,
        auto_generated: false
      };

      validTransactions.push({
        transaction,
        rowNum,
        autoDetected: {
          type: !row.Type,
          category: !row.Category && categoryId !== null
        }
      });

    } catch (rowError) {
      errors.push({ row: rowNum, error: rowError.message });
    }
  }

  return { validTransactions, errors };
}

/**
 * Import new transactions from Excel file
 */
export async function importNewTransactions(file, options = {}) {
  const { dryRun = false } = options;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Read Excel file
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);
    const ws = wb.Sheets['Transactions'];
    
    if (!ws) {
      throw new Error('No "Transactions" sheet found in file');
    }

    const data = XLSX.utils.sheet_to_json(ws);

    if (data.length === 0) {
      throw new Error('No data found in file');
    }

    console.log('📊 Processing', data.length, 'rows...');

    // Parse and validate
    const { validTransactions, errors } = await parseTransactionRows(data);

    // Dry run - return preview
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        total: data.length,
        valid: validTransactions.length,
        errors: errors.length,
        preview: {
          transactions: validTransactions.slice(0, 10).map(t => ({
            ...t.transaction,
            autoDetected: t.autoDetected
          })),
          errors: errors.slice(0, 10)
        }
      };
    }

    // Apply - insert transactions
    if (validTransactions.length === 0) {
      return {
        success: false,
        message: 'No valid transactions to import',
        errors: errors.length,
        errorDetails: errors
      };
    }

    let inserted = 0;
    const insertErrors = [...errors];

    // Insert in batches of 50
    const batchSize = 50;
    for (let i = 0; i < validTransactions.length; i += batchSize) {
      const batch = validTransactions.slice(i, i + batchSize);
      const transactionsToInsert = batch.map(t => t.transaction);

      const { error: batchError } = await supabase
        .from('transactions')
        .insert(transactionsToInsert);

      if (batchError) {
        console.error('❌ Batch insert error:', batchError);
        batch.forEach(t => {
          insertErrors.push({ row: t.rowNum, error: batchError.message });
        });
      } else {
        inserted += batch.length;
      }
    }

    console.log('✅ Inserted', inserted, 'transactions');

    return {
      success: true,
      inserted,
      errors: insertErrors.length,
      errorDetails: insertErrors.length > 0 ? insertErrors : undefined
    };
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  }
}
