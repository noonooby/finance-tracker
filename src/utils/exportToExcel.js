/**
 * Excel Export Utility
 * Creates multi-sheet Excel files
 */

import { downloadWorkbook } from './excel';
import { format } from 'date-fns';
import { formatCurrency } from './reportHelpers';

/**
 * Export report data to Excel file with multiple sheets
 */
export const exportToExcel = async (reportData) => {
  const { name, filters, summary, transactions, categoryData, paymentMethodData, trendData } = reportData;

  // Create a new workbook
  const wb = [];

  // Sheet 1: Summary
  const summarySheet = createSummarySheet(name, filters, summary);
  wb.push({ name: 'Summary', rows: summarySheet });

  // Sheet 2: Transactions
  if (transactions && transactions.length > 0) {
    const transactionsSheet = createTransactionsSheet(transactions);
    wb.push({ name: 'Transactions', rows: transactionsSheet });
  }

  // Sheet 3: Category Breakdown
  if (categoryData && categoryData.length > 0) {
    const categorySheet = createCategorySheet(categoryData, summary);
    wb.push({ name: 'By Category', rows: categorySheet });
  }

  // Sheet 4: Payment Method Breakdown
  if (paymentMethodData && paymentMethodData.length > 0) {
    const paymentSheet = createPaymentMethodSheet(paymentMethodData);
    wb.push({ name: 'By Payment Method', rows: paymentSheet });
  }

  // Sheet 5: Trends
  if (trendData && trendData.length > 0) {
    const trendsSheet = createTrendsSheet(trendData);
    wb.push({ name: 'Trends', rows: trendsSheet });
  }

  // Generate filename
  const filename = `${name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;

  // Write and download file
  await downloadWorkbook(wb, filename);
};

/**
 * Create Summary sheet
 */
const createSummarySheet = (reportName, filters, summary) => {
  const data = [
    ['Report Name:', reportName],
    ['Generated:', format(new Date(), 'PPpp')],
    ['Date Range:', `${filters.startDate} to ${filters.endDate}`],
    [''],
    ['Summary Statistics'],
    ['Total Income:', formatCurrency(summary.totalIncome)],
    ['Total Expenses:', formatCurrency(summary.totalExpenses)],
    ['Total Payments:', formatCurrency(summary.totalPayments)],
    ['Net Cashflow:', formatCurrency(summary.netCashflow)],
    [''],
    ['Transaction Details'],
    ['Total Transactions:', summary.transactionCount],
    ['Average Transaction:', formatCurrency(summary.averageTransaction)],
    ['Largest Transaction:', formatCurrency(summary.largestTransaction)],
    ['Smallest Transaction:', formatCurrency(summary.smallestTransaction)]
  ];

  return data;
};

/**
 * Create Transactions sheet
 */
const createTransactionsSheet = (transactions) => {
  const data = transactions.map(t => ({
    'Date': t.date,
    'Type': t.type,
    'Amount': Number(t.amount),
    'Description': t.description || t.income_source || '',
    'Category': Array.isArray(t.splits) && t.splits.length ? t.splits.map((x) => `${x.category_name || 'No category'} ${Number(x.amount).toFixed(2)}`).join('; ') : (t.category_name || ''),
    'Original amount': t.original_currency ? `${t.original_currency} ${Number(t.original_amount).toFixed(2)}` : '',
    'Payment Method': t.payment_method || '',
    'Payment Method Name': t.payment_method_name || '',
    'Notes': t.notes || '',
    'Status': t.status || 'active'
  }));

  return data;
};

/**
 * Create Category Breakdown sheet
 */
const createCategorySheet = (categoryData, summary) => {
  const data = categoryData.map(cat => ({
    'Category': cat.name,
    'Transactions': cat.count,
    'Total': Number(cat.total),
    'Percentage': `${((cat.total / summary.totalExpenses) * 100).toFixed(2)}%`,
    'Average': Number((cat.total / cat.count).toFixed(2))
  }));

  // Add totals row
  data.push({
    'Category': 'TOTAL',
    'Transactions': categoryData.reduce((sum, cat) => sum + cat.count, 0),
    'Total': Number(summary.totalExpenses),
    'Percentage': '100%',
    'Average': ''
  });

  return data;
};

/**
 * Create Payment Method Breakdown sheet
 */
const createPaymentMethodSheet = (paymentMethodData) => {
  const data = paymentMethodData.map(method => ({
    'Payment Method': method.name,
    'Transactions': method.count,
    'Total': Number(method.total),
    'Average': Number((method.total / method.count).toFixed(2))
  }));

  // Add totals row
  const totalTransactions = paymentMethodData.reduce((sum, m) => sum + m.count, 0);
  const totalAmount = paymentMethodData.reduce((sum, m) => sum + m.total, 0);
  
  data.push({
    'Payment Method': 'TOTAL',
    'Transactions': totalTransactions,
    'Total': Number(totalAmount),
    'Average': totalTransactions > 0 ? Number((totalAmount / totalTransactions).toFixed(2)) : 0
  });

  return data;
};

/**
 * Create Trends sheet
 */
const createTrendsSheet = (trendData) => {
  const data = trendData.map(trend => ({
    'Period': trend.displayName,
    'Income': Number(trend.income),
    'Expenses': Number(trend.expenses),
    'Payments': Number(trend.payments),
    'Net': Number(trend.net),
    'Transaction Count': trend.transactions.length
  }));

  // Add totals row
  data.push({
    'Period': 'TOTAL',
    'Income': Number(trendData.reduce((sum, t) => sum + t.income, 0)),
    'Expenses': Number(trendData.reduce((sum, t) => sum + t.expenses, 0)),
    'Payments': Number(trendData.reduce((sum, t) => sum + t.payments, 0)),
    'Net': Number(trendData.reduce((sum, t) => sum + t.net, 0)),
    'Transaction Count': trendData.reduce((sum, t) => sum + t.transactions.length, 0)
  });

  return data;
};
