import React, { useState } from 'react';
import { Search } from 'lucide-react';

/**
 * IconPicker Component
 * Simple emoji picker for category icons
 */

const COMMON_ICONS = [
  '💰', '💵', '💳', '🏦', '💼', '📊', '📈', '📉',
  '🛒', '🛍️', '🍽️', '🍕', '☕', '🍔', '🥗', '🍜',
  '🚗', '🚕', '🚌', '🚇', '✈️', '🚲', '⛽', '🅿️',
  '🏠', '🏡', '🏢', '🏥', '🏫', '🏪', '🏨', '⚡',
  '💡', '💧', '🔥', '📱', '💻', '🖥️', '⌚', '📷',
  '🎮', '🎬', '🎵', '🎸', '🎨', '📚', '✏️', '📝',
  '👕', '👔', '👗', '👠', '👟', '🎒', '👜', '💄',
  '🏋️', '⚽', '🏀', '🎾', '🏈', '⛳', '🎯', '🎪',
  '🐕', '🐈', '🐾', '🌳', '🌻', '🌺', '🎁', '🎉',
  '📦', '📮', '✉️', '📞', '☎️', '🔧', '🔨', '🔩'
];

export default function IconPicker({ selectedIcon, onSelect, darkMode = false }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const filteredIcons = searchTerm
    ? COMMON_ICONS.filter(icon => {
        // Simple search - could be enhanced with emoji names
        return true; // For now, show all
      })
    : COMMON_ICONS;

  const handleIconSelect = (icon) => {
    onSelect(icon);
    setShowPicker(false);
    setSearchTerm('');
  };

  return (
    <div className="relative">
      {/* Selected Icon Display */}
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className={`w-full px-3 py-2 border rounded-lg text-left flex items-center gap-2 ${
          darkMode
            ? 'bg-gray-700 border-gray-600 text-white'
            : 'bg-white border-gray-300 text-gray-900'
        }`}
      >
        <span className="text-2xl">{selectedIcon || '📦'}</span>
        <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
          {selectedIcon ? 'Change icon' : 'Select icon'}
        </span>
      </button>

      {/* Icon Picker Dropdown */}
      {showPicker && (
        <div
          className={`absolute z-50 mt-2 w-full rounded-lg shadow-lg border p-3 ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}
        >
          {/* Search */}
          <div className="mb-3">
            <div className="relative">
              <Search
                size={16}
                className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                  darkMode ? 'text-gray-400' : 'text-gray-500'
                }`}
              />
              <input
                type="text"
                placeholder="Search icons..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 text-sm border rounded-lg ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
          </div>

          {/* Icon Grid */}
          <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto">
            {filteredIcons.map((icon, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleIconSelect(icon)}
                className={`text-2xl p-2 rounded hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors ${
                  selectedIcon === icon
                    ? darkMode
                      ? 'bg-blue-900 ring-2 ring-blue-500'
                      : 'bg-blue-100 ring-2 ring-blue-500'
                    : ''
                }`}
                title={icon}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
