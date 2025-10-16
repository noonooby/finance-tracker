import React, { useState } from 'react';
import { Calendar, Filter, X, Search } from 'lucide-react';
import { getDateRangePreset } from '../../utils/reportHelpers';

export default function FilterPanel({ darkMode, filters, onFiltersChange, categories, onClose }) {
  const [localFilters, setLocalFilters] = useState(filters);

  const handlePresetChange = (preset) => {
    const dateRange = getDateRangePreset(preset);
    const updated = { ...localFilters, ...dateRange, preset };
    setLocalFilters(updated);
    onFiltersChange(updated);
  };

  const handleFilterChange = (key, value) => {
    const updated = { ...localFilters, [key]: value };
    setLocalFilters(updated);
    onFiltersChange(updated);
  };

  const handleReset = () => {
    const defaultFilters = {
      preset: 'last30',
      ...getDateRangePreset('last30'),
      type: 'all',
      categories: [],
      paymentMethods: [],
      minAmount: '',
      maxAmount: '',
      search: ''
    };
    setLocalFilters(defaultFilters);
    onFiltersChange(defaultFilters);
  };

  return (
    <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-lg shadow-lg p-6 space-y-6`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-blue-600" />
          <h3 className="text-lg font-semibold">Report Filters</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Date Range Presets */}
      <div>
        <label className="block text-sm font-medium mb-2">
          <Calendar size={16} className="inline mr-1" />
          Date Range
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'last30', label: 'Last 30 Days' },
            { value: 'thisMonth', label: 'This Month' },
            { value: 'lastMonth', label: 'Last Month' },
            { value: 'last3Months', label: 'Last 3 Months' },
            { value: 'thisYear', label: 'This Year' },
            { value: 'allTime', label: 'All Time' }
          ].map(preset => (
            <button
              key={preset.value}
              onClick={() => handlePresetChange(preset.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                localFilters.preset === preset.value
                  ? 'bg-blue-600 text-white'
                  : darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600' 
                    : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Start Date</label>
          <input
            type="date"
            value={localFilters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg ${
              darkMode ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
            }`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">End Date</label>
          <input
            type="date"
            value={localFilters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg ${
              darkMode ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
            }`}
          />
        </div>
      </div>

      {/* Transaction Type */}
      <div>
        <label className="block text-sm font-medium mb-2">Transaction Type</label>
        <select
          value={localFilters.type}
          onChange={(e) => handleFilterChange('type', e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg ${
            darkMode ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
          }`}
        >
          <option value="all">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expenses</option>
          <option value="payment">Payments</option>
        </select>
      </div>

      {/* Category Filter (for expenses) */}
      {localFilters.type !== 'income' && (
        <div>
          <label className="block text-sm font-medium mb-2">Categories</label>
          <select
            multiple
            value={localFilters.categories}
            onChange={(e) => handleFilterChange('categories', Array.from(e.target.selectedOptions, opt => opt.value))}
            className={`w-full px-3 py-2 border rounded-lg ${
              darkMode ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
            } h-32`}
          >
            {categories.filter(c => !c.is_income).map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
        </div>
      )}

      {/* Payment Method Filter */}
      <div>
        <label className="block text-sm font-medium mb-2">Payment Methods</label>
        <select
          multiple
          value={localFilters.paymentMethods}
          onChange={(e) => handleFilterChange('paymentMethods', Array.from(e.target.selectedOptions, opt => opt.value))}
          className={`w-full px-3 py-2 border rounded-lg ${
            darkMode ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
          } h-32`}
        >
          <option value="cash_in_hand">💵 Cash in Hand</option>
          <option value="bank_account">🏦 Bank Account</option>
          <option value="credit_card">💳 Credit Card</option>
          <option value="loan">Loan</option>
          <option value="reserved_fund">Reserved Fund</option>
          <option value="transfer">Transfer</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
      </div>

      {/* Amount Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Min Amount</label>
          <input
            type="number"
            value={localFilters.minAmount}
            onChange={(e) => handleFilterChange('minAmount', e.target.value)}
            placeholder="$0.00"
            className={`w-full px-3 py-2 border rounded-lg ${
              darkMode ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
            }`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Max Amount</label>
          <input
            type="number"
            value={localFilters.maxAmount}
            onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
            placeholder="No limit"
            className={`w-full px-3 py-2 border rounded-lg ${
              darkMode ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
            }`}
          />
        </div>
      </div>

      {/* Search */}
      <div>
        <label className="block text-sm font-medium mb-2">
          <Search size={16} className="inline mr-1" />
          Search Description/Notes
        </label>
        <input
          type="text"
          value={localFilters.search}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          placeholder="Search transactions..."
          className={`w-full px-3 py-2 border rounded-lg ${
            darkMode ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
          }`}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t dark:border-gray-700">
        <button
          onClick={handleReset}
          className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
            darkMode 
              ? 'bg-gray-700 hover:bg-gray-600' 
              : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          Reset Filters
        </button>
      </div>
    </div>
  );
}
