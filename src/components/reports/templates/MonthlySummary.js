import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Download, FileSpreadsheet } from 'lucide-react';
import SummaryCard from '../widgets/SummaryCard';
import CategoryPieChart from '../charts/CategoryPieChart';
import ComparisonBarChart from '../charts/ComparisonBarChart';
import TrendLineChart from '../charts/TrendLineChart';
import FilterPanel from '../FilterPanel';
import {
  filterTransactions,
  calculateSummary,
  groupByCategory,
  groupByPaymentMethod,
  groupByTimePeriod,
  getDateRangePreset,
  formatCurrency
} from '../../../utils/reportHelpers';

export default function MonthlySummary({ 
  darkMode, 
  transactions, 
  categories,
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
  const [categoryData, setCategoryData] = useState([]);
  const [paymentMethodData, setPaymentMethodData] = useState([]);
  const [trendData, setTrendData] = useState([]);

  useEffect(() => {
    // Filter transactions
    const filtered = filterTransactions(transactions, filters);
    setFilteredData(filtered);

    // Calculate summary
    const summaryStats = calculateSummary(filtered);
    setSummary(summaryStats);

    // Group by category
    const byCategory = groupByCategory(filtered, categories);
    setCategoryData(byCategory);

    // Group by payment method
    const byPaymentMethod = groupByPaymentMethod(filtered);
    setPaymentMethodData(byPaymentMethod);

    // Get trend data (daily if less than 60 days, otherwise monthly)
    const daysDiff = Math.floor((new Date(filters.endDate) - new Date(filters.startDate)) / (1000 * 60 * 60 * 24));
    const period = daysDiff <= 60 ? 'daily' : 'monthly';
    const trends = groupByTimePeriod(filtered, period);
    setTrendData(trends);
  }, [transactions, categories, filters]);

  const handleExportExcel = () => {
    const reportData = {
      name: 'Monthly Summary',
      filters,
      summary,
      transactions: filteredData,
      categoryData,
      paymentMethodData,
      trendData
    };
    onExportExcel(reportData);
  };

  const handleExportCSV = () => {
    const reportData = {
      name: 'Monthly Summary',
      filters,
      summary,
      transactions: filteredData,
      categoryData,
      paymentMethodData,
      trendData
    };
    onExportCSV(reportData);
  };

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading report...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Monthly Summary</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {new Date(filters.startDate).toLocaleDateString()} - {new Date(filters.endDate).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              showFilters
                ? 'bg-blue-600 text-white'
                : darkMode
                ? 'bg-gray-700 hover:bg-gray-600'
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            {showFilters ? 'Hide' : 'Show'} Filters
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            <FileSpreadsheet size={18} />
            Export Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
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

      {/* Summary Cards */}
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
          subtitle={`${filteredData.filter(t => t.type === 'payment' || t.type === 'loan_payment' || t.type === 'credit_card_payment').length} transactions`}
          icon={DollarSign}
          color="blue"
          darkMode={darkMode}
        />
        <SummaryCard
          title="Net Cashflow"
          value={summary.netCashflow}
          subtitle={summary.netCashflow >= 0 ? 'Positive' : 'Negative'}
          icon={Activity}
          color={summary.netCashflow >= 0 ? 'green' : 'orange'}
          darkMode={darkMode}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Expenses Bar Chart */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
          <h3 className="text-lg font-semibold mb-4">Income vs Expenses</h3>
          <ComparisonBarChart
            data={[{
              name: 'Totals',
              income: summary.totalIncome,
              expenses: summary.totalExpenses,
              payments: summary.totalPayments
            }]}
            darkMode={darkMode}
            dataKeys={[
              { key: 'income', name: 'Income', color: '#10B981' },
              { key: 'expenses', name: 'Expenses', color: '#EF4444' },
              { key: 'payments', name: 'Payments', color: '#3B82F6' }
            ]}
          />
        </div>

        {/* Category Breakdown Pie Chart */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
          <h3 className="text-lg font-semibold mb-4">Spending by Category</h3>
          {categoryData.length > 0 ? (
            <CategoryPieChart data={categoryData} darkMode={darkMode} />
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No expense categories to display
            </div>
          )}
        </div>
      </div>

      {/* Trend Line Chart */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
        <h3 className="text-lg font-semibold mb-4">Cashflow Trend</h3>
        <TrendLineChart
          data={trendData}
          darkMode={darkMode}
          dataKeys={[
            { key: 'income', name: 'Income', color: '#10B981' },
            { key: 'expenses', name: 'Expenses', color: '#EF4444' },
            { key: 'net', name: 'Net', color: '#8B5CF6' }
          ]}
        />
      </div>

      {/* Top Categories Table */}
      {categoryData.length > 0 && (
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
          <h3 className="text-lg font-semibold mb-4">Top Spending Categories</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <th className="text-left py-3 px-4">Category</th>
                  <th className="text-right py-3 px-4">Transactions</th>
                  <th className="text-right py-3 px-4">Total</th>
                  <th className="text-right py-3 px-4">Percentage</th>
                </tr>
              </thead>
              <tbody>
                {categoryData.slice(0, 10).map((cat, index) => (
                  <tr key={cat.id} className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <td className="py-3 px-4">
                      <span className="mr-2">{cat.icon}</span>
                      {cat.name}
                    </td>
                    <td className="text-right py-3 px-4">{cat.count}</td>
                    <td className="text-right py-3 px-4 font-semibold">{formatCurrency(cat.total)}</td>
                    <td className="text-right py-3 px-4">
                      {((cat.total / summary.totalExpenses) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`border-t-2 ${darkMode ? 'border-gray-600' : 'border-gray-300'} font-bold`}>
                  <td className="py-3 px-4">Total</td>
                  <td className="text-right py-3 px-4">{categoryData.reduce((sum, cat) => sum + cat.count, 0)}</td>
                  <td className="text-right py-3 px-4">{formatCurrency(summary.totalExpenses)}</td>
                  <td className="text-right py-3 px-4">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Payment Methods Table */}
      {paymentMethodData.length > 0 && (
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
          <h3 className="text-lg font-semibold mb-4">Payment Method Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <th className="text-left py-3 px-4">Payment Method</th>
                  <th className="text-right py-3 px-4">Transactions</th>
                  <th className="text-right py-3 px-4">Total</th>
                  <th className="text-right py-3 px-4">Percentage</th>
                </tr>
              </thead>
              <tbody>
                {paymentMethodData.map((method, index) => (
                  <tr key={index} className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <td className="py-3 px-4">{method.name}</td>
                    <td className="text-right py-3 px-4">{method.count}</td>
                    <td className="text-right py-3 px-4 font-semibold">{formatCurrency(method.total)}</td>
                    <td className="text-right py-3 px-4">
                      {((method.total / (summary.totalExpenses + summary.totalIncome + summary.totalPayments)) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Transactions Table */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
        <h3 className="text-lg font-semibold mb-4">All Transactions ({filteredData.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
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
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map((transaction) => (
                  <tr
                    key={transaction.id}
                    className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}
                  >
                    <td className="py-2 px-3 whitespace-nowrap">
                      {new Date(transaction.date).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        transaction.type === 'income' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        transaction.type === 'expense' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                        'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }`}>
                        {transaction.type}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {transaction.description || transaction.income_source || 'No description'}
                      {transaction.notes && (
                        <p className="text-xs text-gray-500 mt-1">{transaction.notes}</p>
                      )}
                    </td>
                    <td className="py-2 px-3">{transaction.category_name || '-'}</td>
                    <td className="py-2 px-3">
                      {transaction.payment_method_name || transaction.payment_method || '-'}
                    </td>
                    <td className={`py-2 px-3 text-right font-semibold ${
                      transaction.type === 'income' ? 'text-green-600 dark:text-green-400' :
                      transaction.type === 'expense' ? 'text-red-600 dark:text-red-400' :
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
