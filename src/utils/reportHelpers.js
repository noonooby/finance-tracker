import { categoryParts, spendingSign, isCardPayment, isPayment } from './spending';
/**
 * Report Helpers
 * Data processing and aggregation utilities for reports
 */

import { format, startOfMonth, endOfMonth, subDays, subMonths, startOfYear, endOfYear, parseISO } from 'date-fns';
import { formatCurrency as appCurrency } from './helpers';

/**
 * Filter transactions based on report filters
 */
export const filterTransactions = (transactions, filters) => {
  let filtered = [...transactions];

  // Filter out undone transactions
  filtered = filtered.filter(t => t.status !== 'undone' && t.status !== 'deleted');

  // Date range filter
  if (filters.startDate && filters.endDate) {
    // Simple date comparison (works with ISO format YYYY-MM-DD)
    filtered = filtered.filter(t => {
      const transactionDateStr = String(t.date || '').slice(0, 10);
      return transactionDateStr >= filters.startDate && transactionDateStr <= filters.endDate;
    });
  }

  // Transaction type filter
  if (filters.type && filters.type !== 'all') {
    if (filters.type === 'payment') {
      // Include all payment types
      filtered = filtered.filter(t => 
        t.type === 'payment' || 
        t.type === 'loan_payment' || 
        t.type === 'credit_card_payment'
      );
    } else {
      filtered = filtered.filter(t => t.type === filters.type);
    }
  }

  // Category filter
  if (filters.categories && filters.categories.length > 0) {
    filtered = filtered.filter(t => categoryParts(t).some(p => filters.categories.map(String).includes(p.category_id)));
  }

  // Payment method filter
  if (filters.paymentMethods && filters.paymentMethods.length > 0) {
    filtered = filtered.filter(t => {
      // Check both payment_method and source fields for payment transactions
      const method = t.payment_method || t.source || t.payment_method_type;
      return filters.paymentMethods.includes(method);
    });
  }

  // Amount range filter
  if (filters.minAmount !== undefined && filters.minAmount !== null && filters.minAmount !== '') {
    filtered = filtered.filter(t => Number(t.amount) >= Number(filters.minAmount));
  }
  if (filters.maxAmount !== undefined && filters.maxAmount !== null && filters.maxAmount !== '') {
    filtered = filtered.filter(t => Number(t.amount) <= Number(filters.maxAmount));
  }

  // Search filter (description/notes)
  if (filters.search && filters.search.trim()) {
    const searchTerm = filters.search.toLowerCase();
    filtered = filtered.filter(t => 
      (t.description && t.description.toLowerCase().includes(searchTerm)) ||
      (t.notes && t.notes.toLowerCase().includes(searchTerm)) ||
      (t.income_source && t.income_source.toLowerCase().includes(searchTerm))
    );
  }

  return filtered;
};

/**
 * Calculate summary statistics from transactions
 */
export const calculateSummary = (transactions) => {
  const summary = {
    totalIncome: 0,
    totalExpenses: 0,
    totalPayments: 0,
    cardPayments: 0,
    netCashflow: 0,
    transactionCount: transactions.length,
    averageTransaction: 0,
    largestTransaction: 0,
    smallestTransaction: Infinity
  };

  transactions.forEach(t => {
    const amount = Number(t.amount) || 0;
    
    if (t.type === 'income') {
      summary.totalIncome += amount;
    } else if (spendingSign(t)) {
      summary.totalExpenses += spendingSign(t) * amount;
    } else if (isPayment(t)) {
      summary.totalPayments += amount;
      if (isCardPayment(t)) summary.cardPayments += amount;
    }

    if (amount > summary.largestTransaction) {
      summary.largestTransaction = amount;
    }
    if (amount < summary.smallestTransaction) {
      summary.smallestTransaction = amount;
    }
  });

  // What is left of income after spending and loan payments. A card payment settles purchases that are already in
  // spending, so it is shown but not taken off a second time.
  summary.netCashflow = summary.totalIncome - summary.totalExpenses - (summary.totalPayments - summary.cardPayments);
  summary.averageTransaction = transactions.length > 0 
    ? (summary.totalIncome + summary.totalExpenses + summary.totalPayments) / transactions.length 
    : 0;
  
  if (summary.smallestTransaction === Infinity) {
    summary.smallestTransaction = 0;
  }

  return summary;
};

/**
 * Remove emojis and clean up category names intelligently
 */
const removeEmojis = (text) => {
  if (!text) return text;
  
  // Remove all emojis
  let cleaned = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
  
  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Fix known bad patterns
  const fixes = {
    'Coffee Coffee': 'Coffee',
    'Pizza Food Delivery': 'Food Delivery',
    'Car Transportation': 'Transportation',
    'ShoppingCart Groceries': 'Groceries',
    'Package Other': 'Other',
    'Flame Foo': 'Food'
  };
  
  // Apply fixes
  if (fixes[cleaned]) {
    return fixes[cleaned];
  }
  
  // Generic duplicate word removal (first word = last word)
  const words = cleaned.split(/\s+/);
  if (words.length === 2 && words[0].toLowerCase() === words[1].toLowerCase()) {
    return words[0];
  }
  
  return cleaned;
};

/**
 * Group transactions by category
 */
export const groupByCategory = (transactions, categories) => {
  const grouped = {};

  // A split purchase counts each part in its own category.
  transactions.forEach(t => {
    const sign = spendingSign(t);
    if (!sign) return;
    categoryParts(t).forEach(part => {
      if (!part.category_id) return;
      const id = part.category_id;
      if (!grouped[id]) {
        const category = categories.find(c => String(c.id) === id);
        const rawName = part.category_name || category?.name || 'Unknown';
        grouped[id] = {
          id,
          name: removeEmojis(rawName), // Clean name without emojis
          icon: category?.icon || 'Package',
          color: category?.color || '#6B7280',
          total: 0,
          count: 0,
          transactions: []
        };
      }
      grouped[id].total += sign * part.amount;
      grouped[id].count += 1;
      grouped[id].transactions.push(t);
    });
  });

  // A category refunded in full (or more) drops out.
  return Object.values(grouped).filter(g => g.total > 0.004).sort((a, b) => b.total - a.total);
};

/**
 * Group transactions by payment method
 * Only counts expenses and payments (not income)
 */
export const groupByPaymentMethod = (transactions) => {
  const grouped = {};

  transactions.forEach(t => {
    // Spending (refunds come off) and payments only: not income, transfers between your own accounts or stated balances.
    const sign = spendingSign(t) || (isPayment(t) ? 1 : 0);
    if (sign) {
      const method = t.payment_method || 'unknown';
      if (!grouped[method]) {
        grouped[method] = {
          method,
          name: getPaymentMethodName(method),
          total: 0,
          count: 0,
          transactions: []
        };
      }
      grouped[method].total += sign * (Number(t.amount) || 0);
      grouped[method].count += 1;
      grouped[method].transactions.push(t);
    }
  });

  return Object.values(grouped).sort((a, b) => b.total - a.total);
};

/**
 * Get friendly payment method name
 */
const getPaymentMethodName = (method) => {
  const names = {
    cash_in_hand: 'Cash', // old records only
    bank_account: 'Bank Account',
    credit_card: 'Credit Card',
    loan: 'Loan',
    reserved_fund: 'Reserved Fund',
    transfer: 'Transfer',
    cash_withdrawal: 'Cash Withdrawal',
    cash_deposit: 'Cash Deposit'
  };
  return names[method] || method;
};

/**
 * Group transactions by time period (daily, weekly, monthly)
 */
export const groupByTimePeriod = (transactions, period = 'daily') => {
  const grouped = {};

  transactions.forEach(t => {
    let key;
    const date = parseISO(t.date);
    
    if (period === 'daily') {
      key = format(date, 'yyyy-MM-dd');
    } else if (period === 'weekly') {
      key = format(date, 'yyyy-ww');
    } else if (period === 'monthly') {
      key = format(date, 'yyyy-MM');
    }

    if (!grouped[key]) {
      grouped[key] = {
        period: key,
        displayName: format(date, period === 'daily' ? 'MMM dd' : period === 'weekly' ? 'MMM dd' : 'MMM yyyy'),
        income: 0,
        expenses: 0,
        payments: 0,
        net: 0,
        transactions: []
      };
    }

    const amount = Number(t.amount) || 0;
    
    if (t.type === 'income') {
      grouped[key].income += amount;
    } else if (spendingSign(t)) {
      grouped[key].expenses += spendingSign(t) * amount;
    } else if (isPayment(t)) {
      grouped[key].payments += amount;
      if (isCardPayment(t)) grouped[key].cardPayments = (grouped[key].cardPayments || 0) + amount;
    }
    
    grouped[key].net = grouped[key].income - grouped[key].expenses - (grouped[key].payments - (grouped[key].cardPayments || 0));
    grouped[key].transactions.push(t);
  });

  return Object.values(grouped).sort((a, b) => a.period.localeCompare(b.period));
};

/**
 * Get date range presets
 */
export const getDateRangePreset = (preset, today = new Date()) => {
  const now = today;
  let start, end;

  switch (preset) {
    case 'last30':
      start = subDays(now, 30);
      end = now;
      break;
    case 'thisMonth':
      start = startOfMonth(now);
      end = endOfMonth(now);
      break;
    case 'lastMonth':
      start = startOfMonth(subMonths(now, 1));
      end = endOfMonth(subMonths(now, 1));
      break;
    case 'last3Months':
      start = subDays(now, 90);
      end = now;
      break;
    case 'thisYear':
      start = startOfYear(now);
      end = endOfYear(now);
      break;
    case 'allTime':
      start = new Date(2000, 0, 1);
      end = now;
      break;
    default:
      start = subDays(now, 30);
      end = now;
  }

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd')
  };
};

// Money as the rest of the app shows it.
export const formatCurrency = (amount) => appCurrency(amount);

// Short money for a chart axis: $850, $1.2k, $15k.
export const axisMoney = (value) => {
  const v = Number(value) || 0, a = Math.abs(v), sign = v < 0 ? '-' : '';
  if (a < 1000) return `${sign}$${Math.round(a)}`;
  const k = a / 1000;
  return `${sign}$${k < 10 && Math.round(k * 10) % 10 ? k.toFixed(1) : Math.round(k)}k`;
};

