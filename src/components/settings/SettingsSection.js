import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const inputClass = (darkMode, extra = 'w-full') =>
  `${extra} px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`;

export const labelClass = (darkMode) =>
  `block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;

export const subLabelClass = (darkMode) =>
  `block text-sm mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`;

export const hintClass = (darkMode) =>
  `text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`;

export const boxClass = (darkMode) =>
  `border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`;

/**
 * Collapsible settings card with a header button.
 */
export default function SettingsSection({
  title,
  icon: Icon,
  expanded,
  onToggle,
  darkMode,
  danger = false,
  bodyClassName = 'p-6 space-y-4 border-t border-gray-700',
  children
}) {
  const cardBorder = danger ? (darkMode ? ' border border-gray-700' : ' border border-gray-200') : '';
  const chevronClass = danger ? 'text-red-600' : undefined;

  return (
    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'}${cardBorder} rounded-lg overflow-hidden`}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={`w-full flex items-center justify-between p-4 rounded-lg transition-colors ${
          darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
        }`}
      >
        {Icon ? (
          <div className="flex items-center gap-3">
            <Icon size={20} className={darkMode ? 'text-gray-300' : 'text-gray-700'} />
            <h3 className="text-lg font-semibold">{title}</h3>
          </div>
        ) : (
          <h3 className={`text-lg font-semibold${danger ? ' text-red-600' : ''}`}>{title}</h3>
        )}
        {expanded ? <ChevronUp size={20} className={chevronClass} /> : <ChevronDown size={20} className={chevronClass} />}
      </button>

      {expanded && <div className={bodyClassName}>{children}</div>}
    </div>
  );
}

/**
 * Bordered checkbox row with a title, description and optional detail fields.
 */
export function CheckboxCard({ darkMode, checked, onChange, title, description, hasDetails = false, children }) {
  return (
    <div className={boxClass(darkMode)}>
      <label className={`flex items-center gap-3 cursor-pointer${hasDetails ? ' mb-3' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4"
        />
        <div className="flex-1">
          <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {title}
          </div>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
            {description}
          </div>
        </div>
      </label>
      {children}
    </div>
  );
}
