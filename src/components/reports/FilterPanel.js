import React, { useState } from 'react';
import { Calendar, Filter, X, Search } from 'lucide-react';
import { getDateRangePreset } from '../../utils/reportHelpers';

export default function FilterPanel({ filters, onFiltersChange, categories, onClose }) {
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
    <div className="card rounded-2xl border border-line bg-surface p-4 space-y-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-accent" />
          <h3 className="text-lg font-semibold">Report filters</h3>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close filters" className="p-1 hover:bg-line/60 rounded">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Date Range Presets */}
      <div>
        <label className="block text-sm font-medium mb-2">
          <Calendar size={16} className="inline mr-1" />
          Date range
        </label>
        <div className="grid grid-cols-2 gap-3 items-end">
          {[
            { value: 'last30', label: 'Last 30 Days' },
            { value: 'thisMonth', label: 'This month' },
            { value: 'lastMonth', label: 'Last month' },
            { value: 'last3Months', label: 'Last 3 Months' },
            { value: 'thisYear', label: 'This year' },
            { value: 'allTime', label: 'All time' }
          ].map(preset => (
            <button
              key={preset.value}
              onClick={() => handlePresetChange(preset.value)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                localFilters.preset === preset.value
                  ? 'bg-accent text-accent-contrast'
                  : 'bg-surface-2 hover:bg-line/60'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range */}
      <div className="grid grid-cols-2 gap-3 items-end">
        <div>
          <label className="block text-sm font-medium mb-2">Start date</label>
          <input
            type="date"
            value={localFilters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">End date</label>
          <input
            type="date"
            value={localFilters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            className="field"
          />
        </div>
      </div>

      {/* Transaction Type */}
      <div>
        <label className="block text-sm font-medium mb-2">Transaction type</label>
        <select
          value={localFilters.type}
          onChange={(e) => handleFilterChange('type', e.target.value)}
          className="field"
        >
          <option value="all">All types</option>
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
            className="field h-32"
          >
            {categories.filter(c => !c.is_income).map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted mt-1">Hold Ctrl/Cmd to select multiple</p>
        </div>
      )}

      {/* Payment Method Filter */}
      <div>
        <label className="block text-sm font-medium mb-2">Payment methods</label>
        <select
          multiple
          value={localFilters.paymentMethods}
          onChange={(e) => handleFilterChange('paymentMethods', Array.from(e.target.selectedOptions, opt => opt.value))}
          className="field h-32"
        >
          <option value="bank_account">Bank account</option>
          <option value="credit_card">Credit card</option>
          <option value="loan">Loan</option>
          <option value="transfer">Transfer</option>
        </select>
        <p className="text-xs text-muted mt-1">Hold Ctrl/Cmd to select multiple</p>
      </div>

      {/* Amount Range */}
      <div className="grid grid-cols-2 gap-3 items-end">
        <div>
          <label className="block text-sm font-medium mb-2">Min amount</label>
          <input
            type="number"
            value={localFilters.minAmount}
            onChange={(e) => handleFilterChange('minAmount', e.target.value)}
            placeholder="$0.00"
            className="field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Max amount</label>
          <input
            type="number"
            value={localFilters.maxAmount}
            onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
            placeholder="No limit"
            className="field"
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
          className="field"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t">
        <button
          onClick={handleReset}
          className="flex-1 px-4 py-2 rounded-xl font-medium transition-colors bg-surface-2 hover:bg-line/60"
        >
          Reset filters
        </button>
      </div>
    </div>
  );
}
