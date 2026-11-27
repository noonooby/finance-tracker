import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Download, FileSpreadsheet } from 'lucide-react';
import SummaryCard from '../widgets/SummaryCard';
import TrendLineChart from '../charts/TrendLineChart';
import ComparisonBarChart from '../charts/ComparisonBarChart';
import FilterPanel from '../FilterPanel';
import {
  filterTransactions,
  calculateSummary,
  groupByTimePeriod,
  getDateRangePreset,
  formatCurrency
} from '../../../utils/reportHelpers';
import { parseDay, formatDate } from '../../../utils/helpers';

export default function CashflowAnalysis({ 
  darkMode, 
  transactions, 
  categories,
  bankAccounts = [],
  onExportExcel,
  onExportCSV 
}) {
  const [filters, setFilters] = useState({
    preset: 'allTime',
    ...getDateRangePreset('allTime'),
    type: 'all',
    categories: [],
    paymentMethods: [],
    minAmount: '',
    maxAmount: '',
    search: ''
  });

  const [showFilters, setShowFilters] = useState(false);
  const [filteredData, setFilteredData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [dailyData, setDailyData] = useState([]);

  useEffect(() => {
    // Filter transactions
    const filtered = filterTransactions(transactions, filters);
    setFilteredData(filtered);

    // Calculate summary
    const summaryStats = calculateSummary(filtered);
    setSummary(summaryStats);

    // Get trend data
    const daysDiff = Math.floor((new Date(filters.endDate) - new Date(filters.startDate)) / (1000 * 60 * 60 * 24));
    const period = daysDiff <= 60 ? 'daily' : 'monthly';
    const trends = groupByTimePeriod(filtered, period);
    setTrendData(trends);

    // Always get daily data for detailed view
    const daily = groupByTimePeriod(filtered, 'daily');
    setDailyData(daily);
  }, [transactions, categories, filters]);

  const handleExportExcel = () => {
    const reportData = {
      name: 'Cashflow Analysis',
      filters,
      summary,
      transactions: filteredData,
      trendData,
      dailyData
    };
    onExportExcel(reportData);
  };

  const handleExportCSV = () => {
    const reportData = {
      name: 'Cashflow Analysis',
      filters,
      summary,
      transactions: filteredData,
      trendData,
      dailyData
    };
    onExportCSV(reportData);
  };

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading report...</div>
      </div>
    );
  }

  // Current balances: the sum of all accounts (cash is one of them)
  const totalAvailable = bankAccounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const totalCash = bankAccounts.filter((acc) => acc.account_type === 'cash').reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

  // Calculate cashflow metrics
  const savingsRate = summary.totalIncome > 0 
    ? ((summary.netCashflow / summary.totalIncome) * 100).toFixed(1)
    : 0;

  const expenseToIncomeRatio = summary.totalIncome > 0
    ? ((summary.totalExpenses / summary.totalIncome) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cashflow Analysis</h2>
          <p className="text-sm text-muted">
            {formatDate(filters.startDate)} - {formatDate(filters.endDate)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              showFilters
                ? 'bg-accent text-accent-contrast'
                : 'bg-surface-2 hover:bg-line/60'
            }`}
          >
            {showFilters ? 'Hide' : 'Show'} Filters
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 press bg-accent text-accent-contrast rounded-lg font-medium hover:opacity-90 transition-colors"
          >
            <FileSpreadsheet size={18} />
            Export Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-contrast rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <FilterPanel
          darkMode={darkMode}
          filters={filters}
          onFiltersChange={setFilters}
          categories={categories}
        />
      )}

      {/* Summary Cards - Row 1: Cashflow */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Income"
          value={summary.totalIncome}
          subtitle={`${filteredData.filter(t => t.type === 'income').length} transactions`}
          icon={TrendingUp}
          color="green"
          darkMode={darkMode}
        />
        <SummaryCard
          title="Total Expenses"
          value={summary.totalExpenses}
          subtitle={`${filteredData.filter(t => t.type === 'expense').length} transactions`}
          icon={TrendingDown}
          color="red"
          darkMode={darkMode}
        />
        <SummaryCard
          title="Total Payments"
          value={summary.totalPayments}
          subtitle={`Debt & credit card payments`}
          icon={DollarSign}
          color="blue"
          darkMode={darkMode}
        />
        <SummaryCard
          title="Net Cashflow"
          value={summary.netCashflow}
          subtitle="Income less spending and loan payments"
          icon={Activity}
          color={summary.netCashflow >= 0 ? 'green' : 'red'}
          darkMode={darkMode}
        />
      </div>

      {/* Summary Cards - Row 2: Current State */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Current Cash Available"
          value={totalAvailable}
          subtitle={`Bank: ${formatCurrency(totalAvailable - totalCash)} • Cash: ${formatCurrency(totalCash)}`}
          icon={DollarSign}
          color="purple"
          darkMode={darkMode}
        />
        <SummaryCard
          title="Savings Rate"
          value={`${savingsRate}%`}
          subtitle="Of income saved"
          icon={TrendingUp}
          color="green"
          darkMode={darkMode}
        />
        <SummaryCard
          title="Expense Ratio"
          value={`${expenseToIncomeRatio}%`}
          subtitle="Expenses vs income"
          icon={Activity}
          color="orange"
          darkMode={darkMode}
        />
        <SummaryCard
          title="Daily Average"
          value={summary.transactionCount > 0 ? (summary.totalIncome + summary.totalExpenses) / dailyData.length : 0}
          subtitle="Per day in period"
          icon={Activity}
          color="blue"
          darkMode={darkMode}
        />
      </div>

      {/* Main Cashflow Trend Chart */}
      <div className={`bg-surface rounded-2xl p-6`}>
        <h3 className="text-lg font-semibold mb-4">Cashflow Trend</h3>
        <TrendLineChart
          data={trendData}
          darkMode={darkMode}
          dataKeys={[
            { key: 'income', name: 'Income', color: '#10B981' },
            { key: 'expenses', name: 'Expenses', color: '#EF4444' },
            { key: 'payments', name: 'Payments', color: '#3B82F6' },
            { key: 'net', name: 'Net Cashflow', color: '#8B5CF6' }
          ]}
        />
      </div>

      {/* Income vs Expenses Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`bg-surface rounded-2xl p-6`}>
          <h3 className="text-lg font-semibold mb-4">Income vs Expenses by Period</h3>
          <ComparisonBarChart
            data={trendData.slice(-6).map(trend => ({
              name: trend.displayName,
              income: trend.income,
              expenses: trend.expenses
            }))}
            darkMode={darkMode}
            dataKeys={[
              { key: 'income', name: 'Income', color: '#10B981' },
              { key: 'expenses', name: 'Expenses', color: '#EF4444' }
            ]}
          />
        </div>

        <div className={`bg-surface rounded-2xl p-6`}>
          <h3 className="text-lg font-semibold mb-4">Net Cashflow by Period</h3>
          <ComparisonBarChart
            data={trendData.slice(-6).map(trend => ({
              name: trend.displayName,
              net: trend.net
            }))}
            darkMode={darkMode}
            dataKeys={[
              { key: 'net', name: 'Net Cashflow', color: '#8B5CF6' }
            ]}
          />
        </div>
      </div>

      {/* Detailed Period Breakdown */}
      <div className={`bg-surface rounded-2xl p-6`}>
        <h3 className="text-lg font-semibold mb-4">Detailed Period Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-b border-line`}>
                <th className="text-left py-3 px-4">Period</th>
                <th className="text-right py-3 px-4">Income</th>
                <th className="text-right py-3 px-4">Expenses</th>
                <th className="text-right py-3 px-4">Payments</th>
                <th className="text-right py-3 px-4">Net Flow</th>
                <th className="text-right py-3 px-4">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {trendData.map((trend, index) => (
                <tr key={index} className={`border-b border-line`}>
                  <td className="py-3 px-4 font-medium">{trend.displayName}</td>
                  <td className="text-right py-3 px-4 text-positive">
                    {formatCurrency(trend.income)}
                  </td>
                  <td className="text-right py-3 px-4 text-negative">
                    {formatCurrency(trend.expenses)}
                  </td>
                  <td className="text-right py-3 px-4 text-blue-600 dark:text-blue-400">
                    {formatCurrency(trend.payments)}
                  </td>
                  <td className={`text-right py-3 px-4 font-semibold ${
                    trend.net >= 0 
                      ? 'text-positive' 
                      : 'text-negative'
                  }`}>
                    {formatCurrency(trend.net)}
                  </td>
                  <td className="text-right py-3 px-4 text-muted">
                    {trend.transactions.length}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`border-t-2 border-line font-bold`}>
                <td className="py-3 px-4">Total</td>
                <td className="text-right py-3 px-4 text-positive">
                  {formatCurrency(summary.totalIncome)}
                </td>
                <td className="text-right py-3 px-4 text-negative">
                  {formatCurrency(summary.totalExpenses)}
                </td>
                <td className="text-right py-3 px-4 text-blue-600 dark:text-blue-400">
                  {formatCurrency(summary.totalPayments)}
                </td>
                <td className={`text-right py-3 px-4 ${
                  summary.netCashflow >= 0 
                    ? 'text-positive' 
                    : 'text-negative'
                }`}>
                  {formatCurrency(summary.netCashflow)}
                </td>
                <td className="text-right py-3 px-4">{filteredData.length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* All Transactions Table */}
      <div className={`bg-surface rounded-2xl p-6`}>
        <h3 className="text-lg font-semibold mb-4">All Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b border-line`}>
                <th className="text-left py-3 px-3">Date</th>
                <th className="text-left py-3 px-3">Type</th>
                <th className="text-left py-3 px-3">Description</th>
                <th className="text-left py-3 px-3">Category</th>
                <th className="text-left py-3 px-3">Payment Method</th>
                <th className="text-right py-3 px-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredData
                .sort((a, b) => parseDay(b.date) - parseDay(a.date))
                .map((transaction) => (
                  <tr
                    key={transaction.id}
                    className={`border-b border-line`}
                  >
                    <td className="py-2 px-3 whitespace-nowrap">
                      {formatDate(transaction.date)}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        transaction.type === 'income' ? 'bg-positive/10 text-positive' :
                        transaction.type === 'expense' ? 'bg-negative/10 text-negative' :
                        'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }`}>
                        {transaction.type}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {transaction.description || transaction.income_source || 'No description'}
                      {transaction.notes && (
                        <p className="text-xs text-muted mt-1">{transaction.notes}</p>
                      )}
                    </td>
                    <td className="py-2 px-3">{transaction.category_name || '-'}</td>
                    <td className="py-2 px-3">
                      {transaction.payment_method_name || transaction.payment_method || '-'}
                    </td>
                    <td className={`py-2 px-3 text-right font-semibold ${
                      transaction.type === 'income' ? 'text-positive' :
                      transaction.type === 'expense' ? 'text-negative' :
                      'text-blue-600 dark:text-blue-400'
                    }`}>
                      {formatCurrency(transaction.amount)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
