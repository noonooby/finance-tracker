import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';
import { formatCurrency } from '../../../utils/reportHelpers';

export default function SummaryCard({ title, value, subtitle, icon: Icon, color = 'blue', darkMode }) {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    gray: 'bg-gray-500'
  };

  const bgColorClass = colorClasses[color] || colorClasses.blue;

  return (
    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
        {Icon && (
          <div className={`${bgColorClass} p-2 rounded-lg`}>
            <Icon size={20} className="text-white" />
          </div>
        )}
      </div>
      <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mb-1`}>
        {typeof value === 'number' ? formatCurrency(value) : value}
      </p>
      {subtitle && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
      )}
    </div>
  );
}
