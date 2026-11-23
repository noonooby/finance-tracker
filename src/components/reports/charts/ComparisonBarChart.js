import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency, axisMoney } from '../../../utils/reportHelpers';

export default function ComparisonBarChart({ data, darkMode, dataKeys = [] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted">
        No data available
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className={`bg-surface border-line p-3 rounded-2xl shadow-lg border`}>
          <p className="font-medium mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#E5E7EB'} />
        <XAxis 
          dataKey="name" 
          stroke={darkMode ? '#9CA3AF' : '#6B7280'}
          style={{ fontSize: '12px' }}
        />
        <YAxis 
          stroke={darkMode ? '#9CA3AF' : '#6B7280'}
          style={{ fontSize: '12px' }}
          tickFormatter={axisMoney}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        {dataKeys.map((key, index) => (
          <Bar 
            key={key.key} 
            dataKey={key.key} 
            fill={key.color} 
            name={key.name}
            radius={[8, 8, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
