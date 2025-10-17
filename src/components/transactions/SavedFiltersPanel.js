import React from 'react';
import { Pin, Copy, Trash2 } from 'lucide-react';

/**
 * Saved Filters Panel Component
 * Displays user's saved filter presets
 * Pure UI component - all logic handled by parent
 */
export default function SavedFiltersPanel({
  darkMode,
  savedFilters,
  onLoadFilter,
  onTogglePin,
  onDuplicateFilter,
  onDeleteFilter
}) {
  const pinnedFilters = savedFilters.filter(f => f.is_pinned);

  return (
    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
      <h3 className="text-lg font-semibold mb-4">Your Saved Filters</h3>
      
      {/* Pinned Filters */}
      {pinnedFilters.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2">
            <Pin size={16} className="fill-current" />
            Pinned
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinnedFilters.map(filter => (
              <div
                key={filter.id}
                className={`p-3 rounded-lg border-2 ${
                  darkMode
                    ? 'border-blue-600/50 bg-blue-900/10'
                    : 'border-blue-200 bg-blue-50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h5 className="font-semibold text-sm">{filter.name}</h5>
                </div>
                
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span>Used {filter.use_count || 0} times</span>
                  {filter.last_used && (
                    <span>
                      {new Date(filter.last_used).toLocaleDateString()}
                    </span>
                  )}
                </div>
                
                <div className="flex gap-1">
                  <button
                    onClick={() => onLoadFilter(filter)}
                    className="flex-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => onTogglePin(filter)}
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                    title="Unpin"
                  >
                    <Pin size={12} className="fill-current" />
                  </button>
                  <button
                    onClick={() => onDuplicateFilter(filter)}
                    className={`px-2 py-1 rounded text-xs ${
                      darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                    title="Duplicate"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={() => onDeleteFilter(filter)}
                    className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* All Filters */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">All Filters</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {savedFilters.map(filter => (
            <div
              key={filter.id}
              className={`p-3 rounded-lg border ${
                darkMode
                  ? 'border-gray-700 hover:border-gray-600'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h5 className="font-semibold text-sm">{filter.name}</h5>
                {filter.is_pinned && (
                  <Pin size={14} className="text-blue-500 fill-current flex-shrink-0" />
                )}
              </div>
              
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                <span>Used {filter.use_count || 0} times</span>
                {filter.last_used && (
                  <span>
                    {new Date(filter.last_used).toLocaleDateString()}
                  </span>
                )}
              </div>
              
              <div className="flex gap-1">
                <button
                  onClick={() => onLoadFilter(filter)}
                  className="flex-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                >
                  Load
                </button>
                <button
                  onClick={() => onTogglePin(filter)}
                  className={`px-2 py-1 rounded text-xs ${
                    filter.is_pinned
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : darkMode
                      ? 'bg-gray-700 hover:bg-gray-600'
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                  title={filter.is_pinned ? 'Unpin' : 'Pin'}
                >
                  <Pin size={12} className={filter.is_pinned ? 'fill-current' : ''} />
                </button>
                <button
                  onClick={() => onDuplicateFilter(filter)}
                  className={`px-2 py-1 rounded text-xs ${
                    darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                  title="Duplicate"
                >
                  <Copy size={12} />
                </button>
                <button
                  onClick={() => onDeleteFilter(filter)}
                  className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
