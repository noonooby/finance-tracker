import React, { useState, useEffect } from 'react';
import { TrendingDown, Download, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import * as Icons from 'lucide-react';
import SummaryCard from '../widgets/SummaryCard';
import CategoryPieChart from '../charts/CategoryPieChart';
import ComparisonBarChart from '../charts/ComparisonBarChart';
import TrendLineChart from '../charts/TrendLineChart';
import FilterPanel from '../FilterPanel';
import {
  filterTransactions,
  calculateSummary,
  groupByCategory,
  groupByTimePeriod,
  getDateRangePreset,
  formatCurrency
} from '../../../utils/reportHelpers';
import { parseDay, formatDate } from '../../../utils/helpers';

export default function CategoryAnalysis({ 
  transactions, 
  categories,
  onExportExcel,
  onExportCSV 
}) {
  const [filters, setFilters] = useState({
    preset: 'allTime',
    ...getDateRangePreset('allTime'),
    type: 'expense', // Focus on expenses for category analysis
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
  const [trendData, setTrendData] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});

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

    // Get trend data for each category over time
    const daysDiff = Math.floor((new Date(filters.endDate) - new Date(filters.startDate)) / (1000 * 60 * 60 * 24));
    const period = daysDiff <= 60 ? 'daily' : 'monthly';
    const trends = groupByTimePeriod(filtered, period);
    setTrendData(trends);
  }, [transactions, categories, filters]);

  const toggleCategoryExpand = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const handleExportExcel = () => {
    const reportData = {
      name: 'Category analysis',
      filters,
      summary,
      transactions: filteredData,
      categoryData,
      trendData
    };
    onExportExcel(reportData);
  };

  const handleExportCSV = () => {
    const reportData = {
      name: 'Category analysis',
      filters,
      summary,
      transactions: filteredData,
      categoryData,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Category analysis</h2>
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
          title="Total spending"
          value={summary.totalExpenses}
          subtitle={`${filteredData.filter(t => t.type === 'expense').length} transactions`}
          icon={TrendingDown}
          color="red"
        />
        <SummaryCard
          title="Categories used"
          value={`${categoryData.length} ${categoryData.length === 1 ? 'category' : 'categories'}`}
          subtitle={`Out of ${categories.filter(c => !c.is_income).length} total`}
          icon={TrendingDown}
          color="blue"
        />
        <SummaryCard
          title="Average per category"
          value={categoryData.length > 0 ? summary.totalExpenses / categoryData.length : 0}
          subtitle="Per active category"
          icon={TrendingDown}
          color="purple"
        />
        <SummaryCard
          title="Largest category"
          value={categoryData.length > 0 ? categoryData[0].total : 0}
          subtitle={categoryData.length > 0 ? categoryData[0].name : 'N/A'}
          icon={TrendingDown}
          color="orange"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Pie Chart */}
        <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4">Category distribution</h3>
          {categoryData.length > 0 ? (
            <CategoryPieChart data={categoryData} />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted">
              No category data to display
            </div>
          )}
        </div>

        {/* Top 5 Categories Bar Chart */}
        <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4">Top 5 Categories</h3>
          {categoryData.length > 0 ? (
            <ComparisonBarChart
              data={categoryData.slice(0, 5).map(cat => ({
                name: cat.name,
                amount: cat.total
              }))}
              dataKeys={[
                { key: 'amount', name: 'Spent', color: '#EF4444' }
              ]}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted">
              No category data to display
            </div>
          )}
        </div>
      </div>

      {/* Spending Trend by Category */}
      <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <h3 className="text-lg font-semibold mb-4">Spending trend</h3>
        <TrendLineChart
          data={trendData}
          dataKeys={[
            { key: 'expenses', name: 'Total expenses', color: '#EF4444' }
          ]}
        />
      </div>

      {/* Detailed Category Breakdown with Transactions */}
      <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <h3 className="text-lg font-semibold mb-4">Detailed category breakdown</h3>
        <div className="space-y-4">
          {categoryData.map((cat, index) => (
            <div key={cat.id} className="border border-line rounded-xl overflow-hidden">
              {/* Category Header */}
              <div
                onClick={() => toggleCategoryExpand(cat.id)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-2"
              >
                <div className="flex items-center gap-3 flex-1">
                  {(() => {
                    const iconName = cat.icon || 'Package';
                    const IconComponent = Icons[iconName] || Icons.Package;
                    return <IconComponent size={20} className="text-muted" />;
                  })()}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{cat.name}</h4>
                      <div className="text-right">
                        <p className="font-bold text-lg">{formatCurrency(cat.total)}</p>
                        <p className="text-xs text-muted">
                          {((cat.total / summary.totalExpenses) * 100).toFixed(1)}% of total
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-muted">
                      {cat.count} transactions • Average: {formatCurrency(cat.total / cat.count)}
                    </p>
                  </div>
                  {expandedCategories[cat.id] ? (
                    <ChevronUp size={20} />
                  ) : (
                    <ChevronDown size={20} />
                  )}
                </div>
              </div>

              {/* Category Transactions */}
              {expandedCategories[cat.id] && (
                <div className="border-t border-line bg-surface-2 p-4">
                  <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line">
                          <th className="text-left py-2 px-3">Date</th>
                          <th className="text-left py-2 px-3">Description</th>
                          <th className="text-left py-2 px-3">Payment method</th>
                          <th className="text-right py-2 px-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cat.transactions
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
                                {transaction.description || 'No description'}
                                {transaction.notes && (
                                  <p className="text-xs text-muted mt-1">{transaction.notes}</p>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                {transaction.payment_method_name || transaction.payment_method || 'N/A'}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold">
                                {formatCurrency(transaction.amount)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-line font-bold">
                          <td colSpan="3" className="py-2 px-3">Subtotal</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(cat.total)}</td>
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

      {/* Category Comparison Table */}
      <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <h3 className="text-lg font-semibold mb-4">Category comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left py-3 px-4">Rank</th>
                <th className="text-left py-3 px-4">Category</th>
                <th className="text-right py-3 px-4">Transactions</th>
                <th className="text-right py-3 px-4">Total</th>
                <th className="text-right py-3 px-4">Average</th>
                <th className="text-right py-3 px-4">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {categoryData.map((cat, index) => (
                <tr key={cat.id} className="border-b border-line">
                  <td className="py-3 px-4 font-semibold">#{index + 1}</td>
                  <td className="py-3 px-4 flex items-center gap-2">
                    {(() => {
                      const iconName = cat.icon || 'Package';
                      const IconComponent = Icons[iconName] || Icons.Package;
                      return <IconComponent size={16} className="text-muted" />;
                    })()}
                    {cat.name}
                  </td>
                  <td className="text-right py-3 px-4">{cat.count}</td>
                  <td className="text-right py-3 px-4 font-semibold">{formatCurrency(cat.total)}</td>
                  <td className="text-right py-3 px-4">{formatCurrency(cat.total / cat.count)}</td>
                  <td className="text-right py-3 px-4">
                    <span className="inline-block px-2 py-1 bg-accent-soft text-accent rounded text-sm font-medium">
                      {((cat.total / summary.totalExpenses) * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-bold">
                <td colSpan="2" className="py-3 px-4">Total</td>
                <td className="text-right py-3 px-4">{categoryData.reduce((sum, cat) => sum + cat.count, 0)}</td>
                <td className="text-right py-3 px-4">{formatCurrency(summary.totalExpenses)}</td>
                <td className="text-right py-3 px-4">
                  {formatCurrency(summary.totalExpenses / categoryData.reduce((sum, cat) => sum + cat.count, 0))}
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
