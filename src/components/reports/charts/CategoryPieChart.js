import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { formatCurrency } from '../../../utils/reportHelpers';

export default function CategoryPieChart({ data, darkMode }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No category data available
      </div>
    );
  }

  // Prepare data for pie chart
  const chartData = data.map(cat => ({
    name: cat.name,
    value: cat.total,
    color: cat.color,
    icon: cat.icon
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} p-3 rounded-lg shadow-lg border`}>
          <p className="font-medium">{data.icon} {data.name}</p>
          <p className="text-sm text-green-600 font-semibold">{formatCurrency(data.value)}</p>
          <p className="text-xs text-gray-500">{((data.value / chartData.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
          outerRadius={100}
          fill="#8884d8"
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend 
          verticalAlign="bottom" 
          height={36}
          formatter={(value, entry) => `${entry.payload.icon} ${value}`}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
