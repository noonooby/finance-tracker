import React, { useState, useEffect } from 'react';
import { Calendar, Download, FileSpreadsheet } from 'lucide-react';
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
import { startOfYear, endOfYear, subYears, format } from 'date-fns';

export default function AnnualReview({ 
  darkMode, 
  transactions, 
  categories,
  onExportExcel,
  onExportCSV 
}) {
  const currentYear = new Date().getFullYear();
  
  const [filters, setFilters] = useState({
    preset: 'thisYear',
    ...getDateRangePreset('thisYear'),
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
  const [monthlyTrends, setMonthlyTrends] = useState([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearComparison, setYearComparison] = useState(null);

  // Get available years from transactions
  const availableYears = [...new Set(transactions.map(t => new Date(t.date).getFullYear()))].sort((a, b) => b - a);

  useEffect(() => {
    // Filter transactions for selected year
    const filtered = filterTransactions(transactions, filters);
    setFilteredData(filtered);

    // Calculate summary
    const summaryStats = calculateSummary(filtered);
    setSummary(summaryStats);

    // Group by category
    const byCategory = groupByCategory(filtered, categories);
    setCategoryData(byCategory);

    // Get monthly trends
    const monthly = groupByTimePeriod(filtered, 'monthly');
    setMonthlyTrends(monthly);

    // Calculate year-over-year comparison if previous year data exists
    if (selectedYear > Math.min(...availableYears)) {
      const lastYearStart = format(startOfYear(subYears(new Date(selectedYear, 0, 1), 1)), 'yyyy-MM-dd');
      const lastYearEnd = format(endOfYear(subYears(new Date(selectedYear, 0, 1), 1)), 'yyyy-MM-dd');
      
      const lastYearData = filterTransactions(transactions, {
        ...filters,
        startDate: lastYearStart,
        endDate: lastYearEnd
      });
      
      const lastYearSummary = calculateSummary(lastYearData);
      
      setYearComparison({
        current: summaryStats,
        previous: lastYearSummary,
        growth: {
          income: lastYearSummary.totalIncome > 0 
            ? ((summaryStats.totalIncome - lastYearSummary.totalIncome) / lastYearSummary.totalIncome * 100).toFixed(1)
            : 0,
          expenses: lastYearSummary.totalExpenses > 0
            ? ((summaryStats.totalExpenses - lastYearSummary.totalExpenses) / lastYearSummary.totalExpenses * 100).toFixed(1)
            : 0,
          net: ((summaryStats.netCashflow - lastYearSummary.netCashflow) / Math.abs(lastYearSummary.netCashflow || 1) * 100).toFixed(1)
        }
      });
    } else {
      setYearComparison(null);
    }
  }, [transactions, categories, filters, selectedYear, availableYears]);

  const handleYearChange = (year) => {
    setSelectedYear(year);
    const yearStart = format(startOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd');
    const yearEnd = format(endOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd');
    setFilters({
      ...filters,
      startDate: yearStart,
      endDate: yearEnd,
      preset: 'custom'
    });
  };

  const handleExportExcel = () => {
    const reportData = {
      name: `Annual Review ${selectedYear}`,
      filters,
      summary,
      transactions: filteredData,
      categoryData,
      trendData: monthlyTrends,
      yearComparison
    };
    onExportExcel(reportData);
  };

  const handleExportCSV = () => {
    const reportData = {
      name: `Annual Review ${selectedYear}`,
      filters,
      summary,
      transactions: filteredData,
      categoryData,
      trendData: monthlyTrends,
      yearComparison
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
          <h2 className="text-2xl font-bold">Annual Review</h2>
          <div className="flex items-center gap-4 mt-2">
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              className={`px-4 py-2 rounded-lg font-medium ${
                darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200'
              }`}
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {new Date(filters.startDate).toLocaleDateString()} - {new Date(filters.endDate).toLocaleDateString()}
            </p>
          </div>
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

      {/* Year Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title={`${selectedYear} Income`}
          value={summary.totalIncome}
          subtitle={`${filteredData.filter(t => t.type === 'income').length} deposits`}
          icon={Calendar}
          color="green"
          darkMode={darkMode}
        />
        <SummaryCard
          title={`${selectedYear} Expenses`}
          value={summary.totalExpenses}
          subtitle={`${filteredData.filter(t => t.type === 'expense').length} transactions`}
          icon={Calendar}
          color="red"
          darkMode={darkMode}
        />
        <SummaryCard
          title={`${selectedYear} Payments`}
          value={summary.totalPayments}
          subtitle="Debt payments"
          icon={Calendar}
          color="blue"
          darkMode={darkMode}
        />
        <SummaryCard
          title={`${selectedYear} Net`}
          value={summary.netCashflow}
          subtitle={summary.netCashflow >= 0 ? 'Surplus' : 'Deficit'}
          icon={Calendar}
          color={summary.netCashflow >= 0 ? 'green' : 'orange'}
          darkMode={darkMode}
        />
      </div>

      {/* Year-over-Year Comparison */}
      {yearComparison && (
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
          <h3 className="text-lg font-semibold mb-4">Year-over-Year Comparison</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Income Growth</p>
              <p className={`text-3xl font-bold ${
                yearComparison.growth.income >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {yearComparison.growth.income >= 0 ? '+' : ''}{yearComparison.growth.income}%
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {formatCurrency(yearComparison.previous.totalIncome)} → {formatCurrency(yearComparison.current.totalIncome)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Expense Change</p>
              <p className={`text-3xl font-bold ${
                yearComparison.growth.expenses <= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {yearComparison.growth.expenses >= 0 ? '+' : ''}{yearComparison.growth.expenses}%
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {formatCurrency(yearComparison.previous.totalExpenses)} → {formatCurrency(yearComparison.current.totalExpenses)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Net Cashflow Change</p>
              <p className={`text-3xl font-bold ${
                yearComparison.growth.net >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {yearComparison.growth.net >= 0 ? '+' : ''}{yearComparison.growth.net}%
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {formatCurrency(yearComparison.previous.netCashflow)} → {formatCurrency(yearComparison.current.netCashflow)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Trends */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
        <h3 className="text-lg font-semibold mb-4">Monthly Cashflow Trend</h3>
        <TrendLineChart
          data={monthlyTrends}
          darkMode={darkMode}
          dataKeys={[
            { key: 'income', name: 'Income', color: '#10B981' },
            { key: 'expenses', name: 'Expenses', color: '#EF4444' },
            { key: 'net', name: 'Net', color: '#8B5CF6' }
          ]}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Distribution */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
          <h3 className="text-lg font-semibold mb-4">Spending by Category</h3>
          {categoryData.length > 0 ? (
            <CategoryPieChart data={categoryData} darkMode={darkMode} />
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No category data to display
            </div>
          )}
        </div>

        {/* Monthly Comparison */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
          <h3 className="text-lg font-semibold mb-4">Monthly Comparison</h3>
          <ComparisonBarChart
            data={monthlyTrends.map(month => ({
              name: month.displayName,
              income: month.income,
              expenses: month.expenses
            }))}
            darkMode={darkMode}
            dataKeys={[
              { key: 'income', name: 'Income', color: '#10B981' },
              { key: 'expenses', name: 'Expenses', color: '#EF4444' }
            ]}
          />
        </div>
      </div>

      {/* Monthly Summary Table */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
        <h3 className="text-lg font-semibold mb-4">Monthly Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <th className="text-left py-3 px-4">Month</th>
                <th className="text-right py-3 px-4">Income</th>
                <th className="text-right py-3 px-4">Expenses</th>
                <th className="text-right py-3 px-4">Payments</th>
                <th className="text-right py-3 px-4">Net</th>
                <th className="text-right py-3 px-4">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {monthlyTrends.map((month, index) => (
                <tr key={index} className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <td className="py-3 px-4 font-medium">{month.displayName}</td>
                  <td className="text-right py-3 px-4 text-green-600 dark:text-green-400">
                    {formatCurrency(month.income)}
                  </td>
                  <td className="text-right py-3 px-4 text-red-600 dark:text-red-400">
                    {formatCurrency(month.expenses)}
                  </td>
                  <td className="text-right py-3 px-4 text-blue-600 dark:text-blue-400">
                    {formatCurrency(month.payments)}
                  </td>
                  <td className={`text-right py-3 px-4 font-semibold ${
                    month.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {formatCurrency(month.net)}
                  </td>
                  <td className="text-right py-3 px-4">{month.transactions.length}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`border-t-2 ${darkMode ? 'border-gray-600' : 'border-gray-300'} font-bold`}>
                <td className="py-3 px-4">Total</td>
                <td className="text-right py-3 px-4 text-green-600 dark:text-green-400">
                  {formatCurrency(summary.totalIncome)}
                </td>
                <td className="text-right py-3 px-4 text-red-600 dark:text-red-400">
                  {formatCurrency(summary.totalExpenses)}
                </td>
                <td className="text-right py-3 px-4 text-blue-600 dark:text-blue-400">
                  {formatCurrency(summary.totalPayments)}
                </td>
                <td className={`text-right py-3 px-4 ${
                  summary.netCashflow >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatCurrency(summary.netCashflow)}
                </td>
                <td className="text-right py-3 px-4">{filteredData.length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Top Categories Table */}
      {categoryData.length > 0 && (
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
          <h3 className="text-lg font-semibold mb-4">Top Spending Categories</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <th className="text-left py-3 px-4">Rank</th>
                  <th className="text-left py-3 px-4">Category</th>
                  <th className="text-right py-3 px-4">Total</th>
                  <th className="text-right py-3 px-4">Transactions</th>
                  <th className="text-right py-3 px-4">Average</th>
                  <th className="text-right py-3 px-4">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {categoryData.slice(0, 10).map((cat, index) => (
                  <tr key={cat.id} className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <td className="py-3 px-4 font-semibold">#{index + 1}</td>
                    <td className="py-3 px-4">
                      <span className="mr-2">{cat.icon}</span>
                      {cat.name}
                    </td>
                    <td className="text-right py-3 px-4 font-semibold">{formatCurrency(cat.total)}</td>
                    <td className="text-right py-3 px-4">{cat.count}</td>
                    <td className="text-right py-3 px-4">{formatCurrency(cat.total / cat.count)}</td>
                    <td className="text-right py-3 px-4">
                      {((cat.total / summary.totalExpenses) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
