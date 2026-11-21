import React from 'react';
import { Pin } from 'lucide-react';

/**
 * Save Filter Dialog Component
 * Modal for saving current filters as a preset
 * Pure UI component
 */
export default function SaveFilterDialog({
  darkMode,
  show,
  filterName,
  saveAsPin,
  saveError,
  onFilterNameChange,
  onSaveAsPinChange,
  onSave,
  onCancel
}) {
  if (!show) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" 
      onClick={onCancel}
    >
      <div role="dialog" aria-modal="true" aria-label="Save filter preset"
        className={`bg-surface rounded-2xl p-6 max-w-md w-full`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold mb-4">Save Filter Preset</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Filter Name *</label>
            <input
              type="text"
              value={filterName}
              onChange={(e) => onFilterNameChange(e.target.value)}
              placeholder="e.g., Monthly Dining Expenses"
              className={`w-full px-3 py-2 border rounded-lg ${
                'border-line bg-surface-2 text-fg'
              }`}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="saveAsPin"
              checked={saveAsPin}
              onChange={(e) => onSaveAsPinChange(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="saveAsPin" className="text-sm flex items-center gap-1">
              <Pin size={14} className={saveAsPin ? 'text-blue-500 fill-current' : ''} />
              Pin to quick filters
            </label>
          </div>
          
          {saveError && (
            <div className="p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
              {saveError}
            </div>
          )}
        </div>
        
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className={`flex-1 px-4 py-2 rounded-lg ${
              'bg-surface-2 hover:bg-line/60'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="flex-1 px-4 py-2 press bg-accent text-accent-contrast rounded-lg hover:bg-green-700"
          >
            Save Filter
          </button>
        </div>
      </div>
    </div>
  );
}
