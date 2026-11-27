import React from 'react';
import { formatCurrency } from '../../../utils/reportHelpers';

export default function SummaryCard({ title, value, subtitle, icon: Icon, color = 'blue', formatValue = true }) {
  const colorClasses = {
    blue: 'bg-accent-contrast/20',
    green: 'bg-positive/100',
    red: 'bg-negative/100',
    purple: 'bg-accent',
    orange: 'bg-warning/100',
    gray: 'bg-line'
  };

  const bgColorClass = colorClasses[color] || colorClasses.blue;

  // Determine how to display the value
  let displayValue;
  if (typeof value === 'string') {
    // Already formatted as string (e.g., "5 categories")
    displayValue = value;
  } else if (typeof value === 'number' && formatValue) {
    // Format as currency only if formatValue is true (default)
    displayValue = formatCurrency(value);
  } else {
    // Display as-is for other cases
    displayValue = value;
  }

  return (
    <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-muted">{title}</p>
        {Icon && (
          <div className={`${bgColorClass} p-2 rounded-xl`}>
            <Icon size={20} className="text-white" />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-fg mb-1">
        {displayValue}
      </p>
      {subtitle && (
        <p className="text-xs text-muted">{subtitle}</p>
      )}
    </div>
  );
}
