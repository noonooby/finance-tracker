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
import { parseDay, formatDate } from '../../../utils/helpers';

export default function PaymentMethodAnalysis({ 
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
      name: 'Payment method analysis',
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
      name: 'Payment method analysis',
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
        <div className="text-muted">Loading report...</div>
      </div>
    );
  }

  const chartData = paymentMethodData
    .filter(method => method.method !== 'cash') // Exclude legacy cash
    .map(method => ({
      name: method.name,
      value: method.total,
      color: method.method === 'bank_account' ? '#3B82F6' :
             method.method === 'credit_card' ? '#F59E0B' :
             method.method === 'loan' ? '#EF4444' : '#6B7280'
    }));

  const totalAmount = summary.totalIncome + summary.totalExpenses + summary.totalPayments;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payment method analysis</h2>
          <p className="text-sm text-muted">
            {formatDate(filters.startDate)} - {formatDate(filters.endDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              showFilters
                ? 'bg-accent text-accent-contrast'
                : 'bg-surface-2 hover:bg-line/60'
            }`}
          >
            {showFilters ? 'Hide filters' : 'Filters'}
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 press bg-accent text-accent-contrast rounded-xl font-medium hover:opacity-90 transition-colors"
          >
            <FileSpreadsheet size={18} />
            Export to Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-contrast rounded-xl font-medium hover:opacity-90 transition-colors"
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <FilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          categories={categories}
        />
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total transactions"
          value={filteredData.length}
          subtitle="All payment methods"
          icon={CreditCard}
          color="blue"
          formatValue={false}
        />
        <SummaryCard
          title="Total amount"
          value={totalAmount}
          subtitle="Across all methods"
          icon={CreditCard}
          color="green"
        />
        <SummaryCard
          title="Payment methods used"
          value={paymentMethodData.length}
          subtitle="Unique methods"
          icon={CreditCard}
          color="purple"
          formatValue={false}
        />
        <SummaryCard
          title="Average per method"
          value={paymentMethodData.length > 0 ? totalAmount / paymentMethodData.length : 0}
          subtitle="Per payment type"
          icon={CreditCard}
          color="orange"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Method Distribution Pie Chart */}
        <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4">Payment method distribution</h3>
          {chartData.length > 0 ? (
            <CategoryPieChart data={chartData} />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted">
              No payment method data to display
            </div>
          )}
        </div>

        {/* Payment Methods Bar Chart */}
        <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4">Usage by payment method</h3>
          {paymentMethodData.length > 0 ? (
            <ComparisonBarChart
              data={paymentMethodData.map(method => ({
                name: method.name,
                amount: method.total
              }))}
              dataKeys={[
                { key: 'amount', name: 'Total', color: '#3B82F6' }
              ]}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted">
              No payment method data to display
            </div>
          )}
        </div>
      </div>

      {/* Transaction Trend */}
      <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <h3 className="text-lg font-semibold mb-4">Transaction volume trend</h3>
        <TrendLineChart
          data={trendData}
          dataKeys={[
            { key: 'income', name: 'Income', color: '#10B981' },
            { key: 'expenses', name: 'Expenses', color: '#EF4444' },
            { key: 'payments', name: 'Payments', color: '#3B82F6' }
          ]}
        />
      </div>

      {/* Detailed Payment Method Breakdown */}
      <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <h3 className="text-lg font-semibold mb-4">Detailed payment method breakdown</h3>
        <div className="space-y-4">
          {paymentMethodData
            .filter(method => method.method !== 'cash') // Exclude legacy cash
            .map((method, index) => (
            <div key={method.method} className="border border-line rounded-xl overflow-hidden">
              {/* Method Header */}
              <div
                onClick={() => toggleMethodExpand(method.method)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-2"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{method.name}</h4>
                      <div className="text-right">
                        <p className="font-bold text-lg">{formatCurrency(method.total)}</p>
                        <p className="text-xs text-muted">
                          {((method.total / totalAmount) * 100).toFixed(1)}% of total
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-muted">
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
                <div className="border-t border-line bg-surface-2 p-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line">
                          <th className="text-left py-2 px-3">Date</th>
                          <th className="text-left py-2 px-3">Type</th>
                          <th className="text-left py-2 px-3">Description</th>
                          <th className="text-left py-2 px-3">Category</th>
                          <th className="text-right py-2 px-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {method.transactions
                          .sort((a, b) => parseDay(b.date) - parseDay(a.date))
                          .map((transaction, idx) => (
                            <tr
                              key={transaction.id}
                              className="border-b border-line"
                            >
                              <td className="py-2 px-3 whitespace-nowrap">
                                {formatDate(transaction.date)}
                              </td>
                              <td className="py-2 px-3">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                  transaction.type === 'income' ? 'bg-positive/10 text-positive' :
                                  transaction.type === 'expense' ? 'bg-negative/10 text-negative' :
                                  'bg-accent-soft text-accent'
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
                        <tr className="border-t-2 border-line font-bold">
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
      <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <h3 className="text-lg font-semibold mb-4">Payment method comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left py-3 px-4">Rank</th>
                <th className="text-left py-3 px-4">Payment method</th>
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
                <tr key={method.method} className="border-b border-line">
                  <td className="py-3 px-4 font-semibold">#{index + 1}</td>
                  <td className="py-3 px-4">{method.name}</td>
                  <td className="text-right py-3 px-4">{method.count}</td>
                  <td className="text-right py-3 px-4 font-semibold">{formatCurrency(method.total)}</td>
                  <td className="text-right py-3 px-4">{formatCurrency(method.total / method.count)}</td>
                  <td className="text-right py-3 px-4">
                    <span className="inline-block px-2 py-1 bg-accent-soft text-accent rounded text-sm font-medium">
                      {((method.total / totalAmount) * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-bold">
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
