import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const inputClass = (darkMode, extra = 'w-full') =>
  `${extra} px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`;

export const labelClass = (darkMode) =>
  `block text-sm font-medium mb-2 text-fg`;

export const subLabelClass = (darkMode) =>
  `block text-sm mb-1 text-muted`;

export const hintClass = (darkMode) =>
  `text-xs mt-1 text-muted`;

export const boxClass = (darkMode) =>
  `border border-line rounded-lg p-4`;

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
  bodyClassName = 'p-6 space-y-4 border-t border-line',
  children
}) {
  const cardBorder = danger ? ('border border-line') : '';
  const chevronClass = danger ? 'text-red-600' : undefined;

  return (
    <div className={`bg-surface${cardBorder} rounded-lg overflow-hidden`}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={`w-full flex items-center justify-between p-4 rounded-lg transition-colors ${
          'hover:bg-surface-2'
        }`}
      >
        {Icon ? (
          <div className="flex items-center gap-3">
            <Icon size={20} className={'text-fg'} />
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
          <div className={`text-sm font-medium text-fg`}>
            {title}
          </div>
          <div className={`text-xs text-muted mt-1`}>
            {description}
          </div>
        </div>
      </label>
      {children}
    </div>
  );
}
