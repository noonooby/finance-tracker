/**
 * CSV Export Utility
 * Creates downloadable CSV files from report data
 */

import { format } from 'date-fns';
import { formatCurrency } from './reportHelpers';

/**
 * Convert array of objects to CSV string
 */
const arrayToCSV = (data, headers = null) => {
  if (!data || data.length === 0) return '';

  // Get headers from first object if not provided
  const csvHeaders = headers || Object.keys(data[0]);
  
  // Create header row
  const headerRow = csvHeaders.join(',');
  
  // Create data rows
  const dataRows = data.map(row => {
    return csvHeaders.map(header => {
      let value = row[header];
      
      // Handle different data types
      if (value === null || value === undefined) {
        value = '';
      } else if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        value = `"${value.replace(/"/g, '""')}"`;
      } else if (typeof value === 'number') {
        value = value.toString();
      }
      
      return value;
    }).join(',');
  });
  
  return [headerRow, ...dataRows].join('\n');
};

/**
 * Download CSV file
 */
const downloadCSV = (content, filename) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export report data to CSV files
 * Creates multiple CSV files - one for each data type
 */
export const exportToCSV = (reportData) => {
  const { name, filters, summary, transactions, categoryData, paymentMethodData, trendData } = reportData;
  const timestamp = format(new Date(), 'yyyy-MM-dd');
  const baseFilename = `${name.replace(/\s+/g, '_')}_${timestamp}`;

  // Export Summary
  const summaryCSV = createSummaryCSV(name, filters, summary);
  downloadCSV(summaryCSV, `${baseFilename}_summary.csv`);

  // Wait a bit before next download (to avoid browser blocking multiple downloads)
  setTimeout(() => {
    // Export Transactions
    if (transactions && transactions.length > 0) {
      const transactionsCSV = createTransactionsCSV(transactions);
      downloadCSV(transactionsCSV, `${baseFilename}_transactions.csv`);
    }
  }, 100);

  setTimeout(() => {
    // Export Category Breakdown
    if (categoryData && categoryData.length > 0) {
      const categoryCSV = createCategoryCSV(categoryData, summary);
      downloadCSV(categoryCSV, `${baseFilename}_categories.csv`);
    }
  }, 200);

  setTimeout(() => {
    // Export Payment Method Breakdown
    if (paymentMethodData && paymentMethodData.length > 0) {
      const paymentCSV = createPaymentMethodCSV(paymentMethodData);
      downloadCSV(paymentCSV, `${baseFilename}_payment_methods.csv`);
    }
  }, 300);

  setTimeout(() => {
    // Export Trends
    if (trendData && trendData.length > 0) {
      const trendsCSV = createTrendsCSV(trendData);
      downloadCSV(trendsCSV, `${baseFilename}_trends.csv`);
    }
  }, 400);
};

/**
 * Create Summary CSV
 */
const createSummaryCSV = (reportName, filters, summary) => {
  const data = [
    { Field: 'Report Name', Value: reportName },
    { Field: 'Generated', Value: format(new Date(), 'PPpp') },
    { Field: 'Date Range', Value: `${filters.startDate} to ${filters.endDate}` },
    { Field: '', Value: '' },
    { Field: 'Total Income', Value: formatCurrency(summary.totalIncome) },
    { Field: 'Total Expenses', Value: formatCurrency(summary.totalExpenses) },
    { Field: 'Total Payments', Value: formatCurrency(summary.totalPayments) },
    { Field: 'Net Cashflow', Value: formatCurrency(summary.netCashflow) },
    { Field: '', Value: '' },
    { Field: 'Total Transactions', Value: summary.transactionCount },
    { Field: 'Average Transaction', Value: formatCurrency(summary.averageTransaction) },
    { Field: 'Largest Transaction', Value: formatCurrency(summary.largestTransaction) },
    { Field: 'Smallest Transaction', Value: formatCurrency(summary.smallestTransaction) }
  ];

  return arrayToCSV(data);
};

/**
 * Create Transactions CSV
 */
const createTransactionsCSV = (transactions) => {
  const data = transactions.map(t => ({
    Date: t.date,
    Type: t.type,
    Amount: Number(t.amount).toFixed(2),
    Description: t.description || t.income_source || '',
    Category: t.category_name || '',
    'Payment Method': t.payment_method || '',
    'Payment Method Name': t.payment_method_name || '',
    Notes: t.notes || '',
    Status: t.status || 'active'
  }));

  return arrayToCSV(data);
};

/**
 * Create Category CSV
 */
const createCategoryCSV = (categoryData, summary) => {
  const data = categoryData.map(cat => ({
    Category: cat.name,
    Transactions: cat.count,
    Total: Number(cat.total).toFixed(2),
    Percentage: `${((cat.total / summary.totalExpenses) * 100).toFixed(2)}%`,
    Average: (cat.total / cat.count).toFixed(2)
  }));

  // Add totals row
  data.push({
    Category: 'TOTAL',
    Transactions: categoryData.reduce((sum, cat) => sum + cat.count, 0),
    Total: Number(summary.totalExpenses).toFixed(2),
    Percentage: '100%',
    Average: ''
  });

  return arrayToCSV(data);
};

/**
 * Create Payment Method CSV
 */
const createPaymentMethodCSV = (paymentMethodData) => {
  const data = paymentMethodData.map(method => ({
    'Payment Method': method.name,
    Transactions: method.count,
    Total: Number(method.total).toFixed(2),
    Average: (method.total / method.count).toFixed(2)
  }));

  // Add totals row
  const totalTransactions = paymentMethodData.reduce((sum, m) => sum + m.count, 0);
  const totalAmount = paymentMethodData.reduce((sum, m) => sum + m.total, 0);
  
  data.push({
    'Payment Method': 'TOTAL',
    Transactions: totalTransactions,
    Total: Number(totalAmount).toFixed(2),
    Average: totalTransactions > 0 ? (totalAmount / totalTransactions).toFixed(2) : '0.00'
  });

  return arrayToCSV(data);
};

/**
 * Create Trends CSV
 */
const createTrendsCSV = (trendData) => {
  const data = trendData.map(trend => ({
    Period: trend.displayName,
    Income: Number(trend.income).toFixed(2),
    Expenses: Number(trend.expenses).toFixed(2),
    Payments: Number(trend.payments).toFixed(2),
    Net: Number(trend.net).toFixed(2),
    'Transaction Count': trend.transactions.length
  }));

  // Add totals row
  data.push({
    Period: 'TOTAL',
    Income: trendData.reduce((sum, t) => sum + t.income, 0).toFixed(2),
    Expenses: trendData.reduce((sum, t) => sum + t.expenses, 0).toFixed(2),
    Payments: trendData.reduce((sum, t) => sum + t.payments, 0).toFixed(2),
    Net: trendData.reduce((sum, t) => sum + t.net, 0).toFixed(2),
    'Transaction Count': trendData.reduce((sum, t) => sum + t.transactions.length, 0)
  });

  return arrayToCSV(data);
};
