/**
 * Report Helpers
 * Data processing and aggregation utilities for reports
 */

import { format, startOfMonth, endOfMonth, subDays, startOfYear, endOfYear, parseISO } from 'date-fns';

/**
 * Filter transactions based on report filters
 */
export const filterTransactions = (transactions, filters) => {
  let filtered = [...transactions];

  // Filter out undone transactions
  filtered = filtered.filter(t => t.status !== 'undone');

  // Date range filter
  if (filters.startDate && filters.endDate) {
    // Simple date comparison (works with ISO format YYYY-MM-DD)
    filtered = filtered.filter(t => {
      const transactionDateStr = t.date;
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
    filtered = filtered.filter(t => filters.categories.includes(t.category_id));
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
    } else if (t.type === 'expense') {
      summary.totalExpenses += amount;
    } else if (t.type === 'payment' || t.type === 'loan_payment' || t.type === 'credit_card_payment') {
      summary.totalPayments += amount;
    }

    if (amount > summary.largestTransaction) {
      summary.largestTransaction = amount;
    }
    if (amount < summary.smallestTransaction) {
      summary.smallestTransaction = amount;
    }
  });

  summary.netCashflow = summary.totalIncome - summary.totalExpenses - summary.totalPayments;
  summary.averageTransaction = transactions.length > 0 
    ? (summary.totalIncome + summary.totalExpenses + summary.totalPayments) / transactions.length 
    : 0;
  
  if (summary.smallestTransaction === Infinity) {
    summary.smallestTransaction = 0;
  }

  return summary;
};

/**
 * Group transactions by category
 */
export const groupByCategory = (transactions, categories) => {
  const grouped = {};

  transactions.forEach(t => {
    if (t.type === 'expense' && t.category_id) {
      if (!grouped[t.category_id]) {
        const category = categories.find(c => c.id === t.category_id);
        grouped[t.category_id] = {
          id: t.category_id,
          name: t.category_name || category?.name || 'Unknown',
          icon: category?.icon || '📦',
          color: category?.color || '#6B7280',
          total: 0,
          count: 0,
          transactions: []
        };
      }
      grouped[t.category_id].total += Number(t.amount) || 0;
      grouped[t.category_id].count += 1;
      grouped[t.category_id].transactions.push(t);
    }
  });

  return Object.values(grouped).sort((a, b) => b.total - a.total);
};

/**
 * Group transactions by payment method
 */
export const groupByPaymentMethod = (transactions) => {
  const grouped = {};

  transactions.forEach(t => {
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
    grouped[method].total += Number(t.amount) || 0;
    grouped[method].count += 1;
    grouped[method].transactions.push(t);
  });

  return Object.values(grouped).sort((a, b) => b.total - a.total);
};

/**
 * Get friendly payment method name
 */
const getPaymentMethodName = (method) => {
  const names = {
    cash_in_hand: '💵 Cash in Hand',
    bank_account: '🏦 Bank Account',
    cash: 'Cash (Legacy)',
    credit_card: '💳 Credit Card',
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
    } else if (t.type === 'expense') {
      grouped[key].expenses += amount;
    } else if (t.type === 'payment' || t.type === 'loan_payment' || t.type === 'credit_card_payment') {
      grouped[key].payments += amount;
    }
    
    grouped[key].net = grouped[key].income - grouped[key].expenses - grouped[key].payments;
    grouped[key].transactions.push(t);
  });

  return Object.values(grouped).sort((a, b) => a.period.localeCompare(b.period));
};

/**
 * Get date range presets
 */
export const getDateRangePreset = (preset) => {
  const now = new Date();
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
      start = startOfMonth(subDays(now, 30));
      end = endOfMonth(subDays(now, 30));
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
      start = new Date('2000-01-01');
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

/**
 * Format currency
 */
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

/**
 * Calculate top spending categories (limit to top N)
 */
export const getTopCategories = (transactions, categories, limit = 10) => {
  const grouped = groupByCategory(transactions, categories);
  return grouped.slice(0, limit);
};

/**
 * Get chart colors for categories
 */
export const getCategoryColors = (categories) => {
  const defaultColors = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange
    '#06B6D4', // Cyan
    '#84CC16', // Lime
  ];

  return categories.map((cat, index) => ({
    id: cat.id,
    color: cat.color || defaultColors[index % defaultColors.length]
  }));
};
