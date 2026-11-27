import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const inputClass = (extra = 'w-full') =>
  `${extra} px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`;

export const labelClass = 'block text-sm font-medium mb-1.5 text-muted';

export const hintClass = 'text-xs mt-1 text-muted';

export const boxClass = 'border border-line rounded-xl p-4';

/**
 * Collapsible settings card with a header button.
 */
export default function SettingsSection({
  title,
  icon: Icon,
  expanded,
  onToggle,
  danger = false,
  bodyClassName = 'p-4 space-y-4 border-t border-line',
  children
}) {
  const cardBorder = danger ? ('border border-line') : '';
  const chevronClass = danger ? 'text-negative' : undefined;

  return (
    <div className={`bg-surface${cardBorder} rounded-xl overflow-hidden`}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between p-4 rounded-xl transition-colors hover:bg-surface-2"
      >
        {Icon ? (
          <div className="flex items-center gap-3">
            <Icon size={20} className="text-fg" />
            <h3 className="text-lg font-semibold">{title}</h3>
          </div>
        ) : (
          <h3 className={`text-lg font-semibold${danger ? ' text-negative' : ''}`}>{title}</h3>
        )}
        {expanded ? <ChevronUp size={20} className={chevronClass} /> : <ChevronDown size={20} className={chevronClass} />}
      </button>

      {expanded && <div className={bodyClassName}>{children}</div>}
    </div>
  );
}

