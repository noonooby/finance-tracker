/**
 * Bulk Upload NEW Transactions
 * Simple template-based system for adding multiple new transactions at once
 */

import { downloadWorkbook, readSheetRows, toDateText, MAX_SHEET_ROWS } from '../excel';
import { recordExpense, recordIncome, parseSource } from '../money';
import { server } from '../server';
import { format } from 'date-fns';
import { fetchCategories } from '../categories';
import { suggestCategoryId } from '../categoryRules';
import { getAllSettings } from '../settingsManager';
import { defaultBankAccount } from '../helpers';

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
        'Payment Method': 'Cash',
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

    const cols = [12, 10, 25, 12, 20, 20, 30];

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
      ['- Type: "income" or "expense"'],
      [''],
      ['Optional Fields:'],
      ['- Description: Brief description of transaction'],
      ['- Category: Category name (matched from the description when left empty)'],
      ['- Payment Method: the exact name of one of your accounts or cards. "Cash" means your Cash account.'],
      ['  "Bank Account" works when you have only one bank account. Empty uses your default payment method.'],
      ['  Income can only go to an account (cash included), not a card.'],
      ['- Notes: Additional details'],
      [''],
      ['Rows that cannot be read clearly are listed back to you and not added.'],
      ['Uploading the same file again does not add the same rows twice.'],
      [`At most ${MAX_SHEET_ROWS} rows per file.`],
    ];

    // Download
    const filename = `transaction-upload-template-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    await downloadWorkbook([
      { name: 'Transactions', rows: templateData, cols },
      { name: 'Instructions', rows: instructions },
    ], filename);

    return { success: true, filename };
  } catch (error) {
    console.error('Template download failed:', error);
    throw error;
  }
}

/**
 * Auto-match category from description
 */
async function matchCategory(description, type, categories, rules = []) {
  if (!description) return null;
  // What you chose before for this merchant comes first.
  const learned = suggestCategoryId(rules, description, categories.filter((c) => (type === 'income' ? c.is_income : !c.is_income)));
  if (learned) return learned;

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


async function loadAccounts(userId) {
  const [banks, cards] = await Promise.all([
    server.from('bank_accounts').select('*').eq('user_id', userId),
    server.from('credit_cards').select('*').eq('user_id', userId),
  ]);
  if (banks.error) throw banks.error;
  if (cards.error) throw cards.error;
  return { bankAccounts: banks.data || [], creditCards: cards.data || [] };
}

// Turns the Payment Method cell into one source of money, or explains why it cannot.
function resolveSource(cell, type, defaultSource, accounts) {
  const { bankAccounts, creditCards } = accounts;
  const text = cell === undefined || cell === null ? '' : String(cell).trim();
  const lower = text.toLowerCase();
  let source = null;
  if (!text) {
    let d = { type: '', id: null };
    try { d = parseSource(defaultSource); } catch { /* an old default with no account counts as none */ }
    const fallback = defaultBankAccount(bankAccounts);
    if (!d.type && fallback) source = `bank_account:${fallback.id}`;
    else if (d.type === 'bank_account' && d.id && bankAccounts.some((b) => String(b.id) === String(d.id))) source = `bank_account:${d.id}`;
    else if (d.type === 'credit_card' && d.id && creditCards.some((c) => String(c.id) === String(d.id))) source = `credit_card:${d.id}`;
    else if (d.type === 'bank_account' && bankAccounts.length === 1) source = `bank_account:${bankAccounts[0].id}`;
    else return { error: 'Payment Method is empty and your default payment method is not one account: name the account' };
  } else if (lower === 'cash' || lower === 'cash in hand') {
    // "Cash" (or the older wording) means the account of kind cash.
    const cash = bankAccounts.filter((b) => b.account_type === 'cash');
    if (!cash.length) return { error: 'Add a Cash account first' };
    const named = cash.filter((b) => String(b.name || '').trim().toLowerCase() === 'cash');
    source = `bank_account:${(named.length === 1 ? named[0] : cash[0]).id}`;
  } else if (lower === 'bank account' || lower === 'bank') {
    if (bankAccounts.length !== 1) return { error: `"${text}" is not clear: you have ${bankAccounts.length} bank accounts, use the account name` };
    source = `bank_account:${bankAccounts[0].id}`;
  } else {
    const banks = bankAccounts.filter((b) => String(b.name || '').trim().toLowerCase() === lower);
    const cards = creditCards.filter((c) => String(c.name || '').trim().toLowerCase() === lower);
    if (banks.length + cards.length === 0) return { error: `No account or card named "${text}"` };
    if (banks.length + cards.length > 1) return { error: `More than one account or card is named "${text}"` };
    source = banks.length ? `bank_account:${banks[0].id}` : `credit_card:${cards[0].id}`;
  }
  if (type === 'income' && source.startsWith('credit_card:')) return { error: 'Income can only go to an account, not a card' };
  return { source };
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Parse and validate transaction rows from Excel
 */
async function parseTransactionRows(data, userId) {
  const categories = await fetchCategories();
  const rules = (await server.from('category_rules').select('*')).data || [];
  const settings = await getAllSettings();
  const accounts = await loadAccounts(userId);
  const defaultSource = settings.defaultPaymentMethod || '';

  const validTransactions = [];
  const errors = [];
  const seen = new Map();

  for (const row of data) {
    const rowNum = row.__row;
    try {
      if (!row.Date) { errors.push({ row: rowNum, error: 'Missing Date' }); continue; }
      const dateStr = toDateText(row.Date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(Date.parse(dateStr))) {
        errors.push({ row: rowNum, error: `Invalid date: ${dateStr}. Use YYYY-MM-DD` });
        continue;
      }

      const amount = Math.round(Number(row.Amount) * 100) / 100;
      if (row.Amount === undefined || typeof row.Amount === 'boolean' || !Number.isFinite(amount) || amount <= 0) {
        errors.push({ row: rowNum, error: `Invalid Amount: ${row.Amount ?? '(empty)'}` });
        continue;
      }

      const type = row.Type ? String(row.Type).toLowerCase().trim() : '';
      if (!['income', 'expense'].includes(type)) {
        errors.push({ row: rowNum, error: type ? `Invalid Type: ${type}. Use "income" or "expense"` : 'Missing Type: use "income" or "expense"' });
        continue;
      }

      const description = row.Description ? String(row.Description).trim().slice(0, 500) : '';
      const notes = row.Notes ? String(row.Notes).trim().slice(0, 2000) : '';

      const { source, error: sourceError } = resolveSource(row['Payment Method'], type, defaultSource, accounts);
      if (sourceError) { errors.push({ row: rowNum, error: sourceError }); continue; }

      let categoryId = null;
      let categoryName = null;
      if (row.Category) {
        const catName = String(row.Category).trim();
        const matchedCat = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase() && (type === 'income' ? c.is_income : !c.is_income));
        if (matchedCat) { categoryId = matchedCat.id; categoryName = matchedCat.name; } else { categoryName = catName; }
      } else if (description) {
        categoryId = await matchCategory(description, type, categories, rules);
        if (categoryId) categoryName = categories.find((c) => c.id === categoryId)?.name || null;
      }

      // Once-only key: the same row in the same sheet uploaded again is not counted twice.
      const fields = JSON.stringify([dateStr, amount, type, description, source, categoryName || '', notes]);
      const occurrence = (seen.get(fields) || 0) + 1;
      seen.set(fields, occurrence);
      const key = `sheet:${await sha256(fields)}:${occurrence}`;

      const { type: pmType } = parseSource(source);
      validTransactions.push({
        rowNum,
        key,
        source,
        transaction: {
          type,
          amount,
          date: dateStr,
          description,
          category_id: categoryId,
          category_name: categoryName,
          payment_method: pmType,
          notes,
        },
        autoDetected: { type: false, category: !row.Category && categoryId !== null },
      });
    } catch (rowError) {
      errors.push({ row: rowNum, error: rowError.message });
    }
  }

  return { validTransactions, errors, accounts };
}

/**
 * Import new transactions from Excel file. Every row moves money through utils/money.js with a once-only key.
 */
export async function importNewTransactions(file, options = {}) {
  const { dryRun = false } = options;

  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const data = await readSheetRows(file, 'Transactions');
    if (!data) throw new Error('No "Transactions" sheet found in file');
    if (data.length === 0) throw new Error('No data found in file');

    const { validTransactions, errors, accounts } = await parseTransactionRows(data, user.id);

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        total: data.length,
        valid: validTransactions.length,
        errors: errors.length,
        preview: {
          transactions: validTransactions.slice(0, 10).map((t) => ({ ...t.transaction, autoDetected: t.autoDetected })),
          errors: errors.slice(0, 10),
        },
      };
    }

    if (validTransactions.length === 0) {
      return { success: false, message: 'No valid transactions to import', errors: errors.length, errorDetails: errors };
    }

    let inserted = 0;
    let skipped = 0;
    const insertErrors = [...errors];

    for (const t of validTransactions) {
      const { type, amount, date, description, category_id, category_name, notes } = t.transaction;
      try {
        const result = type === 'income'
          ? await recordIncome({ amount, target: t.source, date, description, notes, key: t.key, extra: { category_id, category_name } }, accounts)
          : await recordExpense({ amount, source: t.source, date, description, notes, category_id, category_name, key: t.key }, accounts);
        if (result && result.repeated) skipped += 1; else inserted += 1;
      } catch (rowError) {
        insertErrors.push({ row: t.rowNum, error: rowError.message });
      }
    }

    return {
      success: true,
      inserted,
      skipped,
      errors: insertErrors.length,
      errorDetails: insertErrors.length > 0 ? insertErrors : undefined,
    };
  } catch (error) {
    console.error('Import failed:', error);
    throw error;
  }
}
