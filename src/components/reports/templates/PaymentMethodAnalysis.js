import React, { useState, useEffect } from 'react';
import { CreditCard, Download, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import SummaryCard from '../widgets/SummaryCard';
import CategoryPieChart from '../charts/CategoryPieChart';
import ComparisonBarChart from '../charts/ComparisonBarChart';
import TrendLineChart from '../charts/TrendLineChart';
import FilterPanel from '../FilterPanel';
import {
  filterTransactions,
  calculateSummary,
  groupByPaymentMethod,
  groupByTimePeriod,
  getDateRangePreset,
  formatCurrency
} from '../../../utils/reportHelpers';

export default function PaymentMethodAnalysis({ 
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
  const [paymentMethodData, setPaymentMethodData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [expandedMethods, setExpandedMethods] = useState({});

  useEffect(() => {
    // Filter transactions
    const filtered = filterTransactions(transactions, filters);
    setFilteredData(filtered);

    // Calculate summary
    const summaryStats = calculateSummary(filtered);
    setSummary(summaryStats);

    // Group by payment method
    const byPaymentMethod = groupByPaymentMethod(filtered);
    setPaymentMethodData(byPaymentMethod);

    // Get trend data
    const daysDiff = Math.floor((new Date(filters.endDate) - new Date(filters.startDate)) / (1000 * 60 * 60 * 24));
    const period = daysDiff <= 60 ? 'daily' : 'monthly';
    const trends = groupByTimePeriod(filtered, period);
    setTrendData(trends);
  }, [transactions, categories, filters]);

  const toggleMethodExpand = (method) => {
    setExpandedMethods(prev => ({
      ...prev,
      [method]: !prev[method]
    }));
  };

  const handleExportExcel = () => {
    const reportData = {
      name: 'Payment Method Analysis',
      filters,
      summary,
      transactions: filteredData,
      paymentMethodData,
      trendData
    };
    onExportExcel(reportData);
  };

  const handleExportCSV = () => {
    const reportData = {
      name: 'Payment Method Analysis',
      filters,
      summary,
      transactions: filteredData,
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

  // Prepare chart data with icons
  const getPaymentMethodIcon = (method) => {
    switch(method) {
      case 'cash_in_hand': return '💵';
      case 'bank_account': return '🏦';
      case 'credit_card': return '💳';
      case 'loan': return '📊';
      case 'reserved_fund': return '🎯';
      case 'transfer': return '↔️';
      default: return '📝';
    }
  };

  const chartData = paymentMethodData
    .filter(method => method.method !== 'cash') // Exclude legacy cash
    .map(method => ({
      name: `${getPaymentMethodIcon(method.method)} ${method.name}`,
      value: method.total,
      color: method.method === 'cash_in_hand' ? '#10B981' : 
             method.method === 'bank_account' ? '#3B82F6' :
             method.method === 'credit_card' ? '#F59E0B' :
             method.method === 'loan' ? '#EF4444' : '#6B7280'
    }));

  const totalAmount = summary.totalIncome + summary.totalExpenses + summary.totalPayments;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Payment Method Analysis</h2>
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
          title="Total Transactions"
          value={filteredData.length}
          subtitle="All payment methods"
          icon={CreditCard}
          color="blue"
          darkMode={darkMode}
          formatValue={false}
        />
        <SummaryCard
          title="Total Amount"
          value={totalAmount}
          subtitle="Across all methods"
          icon={CreditCard}
          color="green"
          darkMode={darkMode}
        />
        <SummaryCard
          title="Payment Methods Used"
          value={paymentMethodData.length}
          subtitle="Unique methods"
          icon={CreditCard}
          color="purple"
          darkMode={darkMode}
          formatValue={false}
        />
        <SummaryCard
          title="Average per Method"
          value={paymentMethodData.length > 0 ? totalAmount / paymentMethodData.length : 0}
          subtitle="Per payment type"
          icon={CreditCard}
          color="orange"
          darkMode={darkMode}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Method Distribution Pie Chart */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
          <h3 className="text-lg font-semibold mb-4">Payment Method Distribution</h3>
          {chartData.length > 0 ? (
            <CategoryPieChart data={chartData} darkMode={darkMode} />
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No payment method data to display
            </div>
          )}
        </div>

        {/* Payment Methods Bar Chart */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
          <h3 className="text-lg font-semibold mb-4">Usage by Payment Method</h3>
          {paymentMethodData.length > 0 ? (
            <ComparisonBarChart
              data={paymentMethodData.map(method => ({
                name: method.name,
                amount: method.total
              }))}
              darkMode={darkMode}
              dataKeys={[
                { key: 'amount', name: 'Total', color: '#3B82F6' }
              ]}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No payment method data to display
            </div>
          )}
        </div>
      </div>

      {/* Transaction Trend */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
        <h3 className="text-lg font-semibold mb-4">Transaction Volume Trend</h3>
        <TrendLineChart
          data={trendData}
          darkMode={darkMode}
          dataKeys={[
            { key: 'income', name: 'Income', color: '#10B981' },
            { key: 'expenses', name: 'Expenses', color: '#EF4444' },
            { key: 'payments', name: 'Payments', color: '#3B82F6' }
          ]}
        />
      </div>

      {/* Detailed Payment Method Breakdown */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
        <h3 className="text-lg font-semibold mb-4">Detailed Payment Method Breakdown</h3>
        <div className="space-y-4">
          {paymentMethodData
            .filter(method => method.method !== 'cash') // Exclude legacy cash
            .map((method, index) => (
            <div key={method.method} className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg overflow-hidden`}>
              {/* Method Header */}
              <div
                onClick={() => toggleMethodExpand(method.method)}
                className={`flex items-center justify-between p-4 cursor-pointer ${
                  darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{method.name}</h4>
                      <div className="text-right">
                        <p className="font-bold text-lg">{formatCurrency(method.total)}</p>
                        <p className="text-xs text-gray-500">
                          {((method.total / totalAmount) * 100).toFixed(1)}% of total
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {method.count} transactions • Average: {formatCurrency(method.total / method.count)}
                    </p>
                  </div>
                  {expandedMethods[method.method] ? (
                    <ChevronUp size={20} />
                  ) : (
                    <ChevronDown size={20} />
                  )}
                </div>
              </div>

              {/* Method Transactions */}
              {expandedMethods[method.method] && (
                <div className={`border-t ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'} p-4`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}>
                          <th className="text-left py-2 px-3">Date</th>
                          <th className="text-left py-2 px-3">Type</th>
                          <th className="text-left py-2 px-3">Description</th>
                          <th className="text-left py-2 px-3">Category</th>
                          <th className="text-right py-2 px-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {method.transactions
                          .sort((a, b) => new Date(b.date) - new Date(a.date))
                          .map((transaction, idx) => (
                            <tr
                              key={transaction.id}
                              className={`border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}
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
                              <td className="py-2 px-3">
                                {transaction.category_name || '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold">
                                {formatCurrency(transaction.amount)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot>
                        <tr className={`border-t-2 ${darkMode ? 'border-gray-600' : 'border-gray-400'} font-bold`}>
                          <td colSpan="4" className="py-2 px-3">Subtotal</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(method.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Payment Method Comparison Table */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
        <h3 className="text-lg font-semibold mb-4">Payment Method Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <th className="text-left py-3 px-4">Rank</th>
                <th className="text-left py-3 px-4">Payment Method</th>
                <th className="text-right py-3 px-4">Transactions</th>
                <th className="text-right py-3 px-4">Total</th>
                <th className="text-right py-3 px-4">Average</th>
                <th className="text-right py-3 px-4">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethodData
                .filter(method => method.method !== 'cash') // Exclude legacy cash
                .map((method, index) => (
                <tr key={method.method} className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <td className="py-3 px-4 font-semibold">#{index + 1}</td>
                  <td className="py-3 px-4">{method.name}</td>
                  <td className="text-right py-3 px-4">{method.count}</td>
                  <td className="text-right py-3 px-4 font-semibold">{formatCurrency(method.total)}</td>
                  <td className="text-right py-3 px-4">{formatCurrency(method.total / method.count)}</td>
                  <td className="text-right py-3 px-4">
                    <span className="inline-block px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm font-medium">
                      {((method.total / totalAmount) * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`border-t-2 ${darkMode ? 'border-gray-600' : 'border-gray-300'} font-bold`}>
                <td colSpan="2" className="py-3 px-4">Total</td>
                <td className="text-right py-3 px-4">{paymentMethodData.reduce((sum, m) => sum + m.count, 0)}</td>
                <td className="text-right py-3 px-4">{formatCurrency(totalAmount)}</td>
                <td className="text-right py-3 px-4">
                  {formatCurrency(totalAmount / paymentMethodData.reduce((sum, m) => sum + m.count, 0))}
                </td>
                <td className="text-right py-3 px-4">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
