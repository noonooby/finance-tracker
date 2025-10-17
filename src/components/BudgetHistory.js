import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Target, Calendar, DollarSign } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  getBudgetHistory,
  getBudgetSummary,
  getBudgetChartData,
  getCurrentBudgetStatus
} from '../utils/budgetTrackingManager';
import { formatCurrency } from '../utils/helpers';

/**
 * BudgetHistory Component
 * Visualizes budget tracking history with charts and trends
 */
export default function BudgetHistory({ darkMode, categories, categoryBudgets }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [chartData, setChartData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [currentStatus, setCurrentStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [monthsToShow, setMonthsToShow] = useState(6);

  useEffect(() => {
    loadBudgetData();
  }, [selectedCategory, monthsToShow, categoryBudgets]);

  const loadBudgetData = async () => {
    setLoading(true);
    try {
      const categoryId = selectedCategory === 'all' ? null : selectedCategory;
      const budgetLimit = categoryId ? categoryBudgets[categoryId] : null;

      // Load chart data
      const data = await getBudgetChartData(categoryId, monthsToShow);
      setChartData(data);

      // Load summary
      const summaryData = await getBudgetSummary(categoryId, monthsToShow);
      setSummary(summaryData);

      // Load current status if budget exists
      if (budgetLimit && budgetLimit > 0) {
        const status = await getCurrentBudgetStatus(categoryId, budgetLimit);
        setCurrentStatus(status);
      } else {
        setCurrentStatus(null);
      }
    } catch (error) {
      console.error('Error loading budget data:', error);
    } finally {
      setLoading(false);
    }
  };

  const expenseCategories = categories.filter(cat => !cat.is_income);
  const categoriesWithBudgets = expenseCategories.filter(cat => 
    categoryBudgets[cat.id] && categoryBudgets[cat.id] > 0
  );

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'increasing': return <TrendingUp size={16} className="text-red-600" />;
      case 'decreasing': return <TrendingDown size={16} className="text-green-600" />;
      default: return <Minus size={16} className="text-gray-500" />;
    }
  };

  const getTrendColor = (trend) => {
    switch (trend) {
      case 'increasing': return 'text-red-600';
      case 'decreasing': return 'text-green-600';
      default: return 'text-gray-500';
    }
  };

  const getAlertColor = (alertLevel) => {
    switch (alertLevel) {
      case 'exceeded': return 'bg-red-100 text-red-800 border-red-200';
      case 'danger': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
          Loading budget history...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Target size={24} />
          Budget History
        </h2>
      </div>

      {/* Category Filter */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          >
            <option value="all">All Categories (Overall Budget)</option>
            {categoriesWithBudgets.map(category => (
              <option key={category.id} value={category.id}>
                {category.icon} {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Time Period
          </label>
          <select
            value={monthsToShow}
            onChange={(e) => setMonthsToShow(parseInt(e.target.value))}
            className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          >
            <option value={3}>Last 3 Months</option>
            <option value={6}>Last 6 Months</option>
            <option value={12}>Last 12 Months</option>
          </select>
        </div>
      </div>

      {/* Current Month Status */}
      {currentStatus && (
        <div className={`border-2 rounded-lg p-6 ${getAlertColor(currentStatus.alertLevel)}`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold mb-1">Current Month Status</h3>
              <p className="text-sm opacity-80">
                {new Date(currentStatus.periodStart).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">
                {currentStatus.percentageUsed.toFixed(1)}%
              </div>
              <div className="text-sm opacity-80">of budget used</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-sm opacity-80 mb-1">Budget</div>
              <div className="text-xl font-bold">{formatCurrency(currentStatus.budgetLimit)}</div>
            </div>
            <div>
              <div className="text-sm opacity-80 mb-1">Spent</div>
              <div className="text-xl font-bold">{formatCurrency(currentStatus.actualSpent)}</div>
            </div>
            <div>
              <div className="text-sm opacity-80 mb-1">Remaining</div>
              <div className="text-xl font-bold">{formatCurrency(Math.max(0, currentStatus.remaining))}</div>
            </div>
            <div>
              <div className="text-sm opacity-80 mb-1">Days Left</div>
              <div className="text-xl font-bold">{currentStatus.daysRemaining}</div>
            </div>
          </div>

          {currentStatus.willExceed && !currentStatus.exceeded && (
            <div className="flex items-start gap-2 p-3 bg-white/20 rounded-lg">
              <TrendingUp size={16} className="mt-0.5" />
              <div className="text-sm">
                <strong>Projection:</strong> At current rate, you may spend {formatCurrency(currentStatus.projectedTotal)} this month (
                {((currentStatus.projectedTotal / currentStatus.budgetLimit) * 100).toFixed(1)}% of budget)
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary Cards */}
      {summary && summary.totalMonths > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
            <div className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Average Spent</div>
            <div className="text-2xl font-bold">{formatCurrency(summary.averageSpent)}</div>
          </div>

          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
            <div className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Average Budget</div>
            <div className="text-2xl font-bold">{formatCurrency(summary.averageBudget)}</div>
          </div>

          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
            <div className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Over Budget</div>
            <div className="text-2xl font-bold text-red-600">
              {summary.monthsOverBudget} / {summary.totalMonths}
            </div>
          </div>

          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
            <div className={`text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Trend</div>
            <div className={`text-2xl font-bold flex items-center gap-2 ${getTrendColor(summary.trend)}`}>
              {getTrendIcon(summary.trend)}
              <span className="capitalize">{summary.trend}</span>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 ? (
        <div className="space-y-6">
          {/* Budget vs Actual Spending (Bar Chart) */}
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
            <h3 className="text-lg font-bold mb-4">Budget vs Actual Spending</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
                <XAxis 
                  dataKey="month" 
                  stroke={darkMode ? '#9ca3af' : '#6b7280'}
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  stroke={darkMode ? '#9ca3af' : '#6b7280'}
                  style={{ fontSize: '12px' }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                    border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar dataKey="budget" fill="#3b82f6" name="Budget" />
                <Bar dataKey="spent" fill="#ef4444" name="Spent" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Spending Trend (Line Chart) */}
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
            <h3 className="text-lg font-bold mb-4">Spending Trend Over Time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
                <XAxis 
                  dataKey="month" 
                  stroke={darkMode ? '#9ca3af' : '#6b7280'}
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  stroke={darkMode ? '#9ca3af' : '#6b7280'}
                  style={{ fontSize: '12px' }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                    border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="spent" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  name="Actual Spending"
                  dot={{ fill: '#ef4444', r: 4 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="budget" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Budget Limit"
                  dot={{ fill: '#3b82f6', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Historical Data Table */}
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
            <h3 className="text-lg font-bold mb-4">Historical Data</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <th className={`text-left py-3 px-2 text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Month
                    </th>
                    <th className={`text-right py-3 px-2 text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Budget
                    </th>
                    <th className={`text-right py-3 px-2 text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Spent
                    </th>
                    <th className={`text-right py-3 px-2 text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Difference
                    </th>
                    <th className={`text-right py-3 px-2 text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Usage
                    </th>
                    <th className={`text-center py-3 px-2 text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row, index) => {
                    const difference = row.budget - row.spent;
                    const isOver = row.exceeded;
                    
                    return (
                      <tr 
                        key={index}
                        className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} ${
                          isOver ? (darkMode ? 'bg-red-900/10' : 'bg-red-50') : ''
                        }`}
                      >
                        <td className={`py-3 px-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {row.month}
                        </td>
                        <td className={`py-3 px-2 text-sm text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {formatCurrency(row.budget)}
                        </td>
                        <td className={`py-3 px-2 text-sm text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {formatCurrency(row.spent)}
                        </td>
                        <td className={`py-3 px-2 text-sm text-right font-semibold ${
                          difference >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
                        </td>
                        <td className={`py-3 px-2 text-sm text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {row.percentage.toFixed(1)}%
                        </td>
                        <td className="py-3 px-2 text-center">
                          {isOver ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-100 text-red-800">
                              Over
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-100 text-green-800">
                              Under
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-8 text-center`}>
          <Target size={48} className="mx-auto mb-4 text-gray-400" />
          <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
            No budget history available yet
          </p>
          <p className={`text-sm mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {selectedCategory === 'all' 
              ? 'Set category budgets in Settings to start tracking'
              : 'Budget tracking data will appear here as you use the app'
            }
          </p>
        </div>
      )}

      {/* Help Text */}
      <div className={`flex items-start gap-3 p-4 rounded-lg ${darkMode ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
        <Calendar size={20} className={darkMode ? 'text-blue-400 mt-0.5' : 'text-blue-600 mt-0.5'} />
        <div className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
          <p className="font-semibold mb-1">About Budget Tracking</p>
          <p>
            Budget history is automatically tracked when you set category budgets. 
            Data is recorded at the end of each month and whenever budgets are changed. 
            Use this to identify spending patterns and adjust your budgets accordingly.
          </p>
        </div>
      </div>
    </div>
  );
}
