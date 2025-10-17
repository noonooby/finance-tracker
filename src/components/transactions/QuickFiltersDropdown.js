import React from 'react';
import { Star, Pin } from 'lucide-react';

/**
 * Quick Filters Dropdown Component
 * Shows frequently used saved filters
 * Pure UI component
 */
export default function QuickFiltersDropdown({
  darkMode,
  quickFilters,
  onLoadFilter
}) {
  if (quickFilters.length === 0) return null;

  return (
    <div className="relative group">
      <button
        className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
          darkMode
            ? 'bg-gray-700 hover:bg-gray-600 text-white'
            : 'bg-gray-200 hover:bg-gray-300'
        }`}
      >
        <Star size={18} />
        Quick Filters
      </button>
      
      {/* Dropdown */}
      <div className={`absolute right-0 top-full mt-2 w-64 ${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'} opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50`}>
        <div className="p-2">
          {quickFilters.map(filter => (
            <button
              key={filter.id}
              onClick={() => onLoadFilter(filter)}
              className={`w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between`}
            >
              <div className="flex items-center gap-2">
                {filter.is_pinned && <Pin size={12} className="text-blue-500" />}
                <span className="text-sm">{filter.name}</span>
              </div>
              <span className="text-xs text-gray-500">{filter.use_count || 0} uses</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
