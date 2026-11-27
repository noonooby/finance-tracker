import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { formatCurrency } from '../../../utils/reportHelpers';

export default function CategoryPieChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted">
        No category data available
      </div>
    );
  }

  // Prepare data for pie chart - names already clean from groupByCategory
  const chartData = data.map(cat => ({
    name: cat.name, // Already cleaned of emojis
    value: cat.total,
    color: cat.color,
    icon: cat.icon
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-surface border-line p-3 rounded-2xl shadow-lg border">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm text-positive font-semibold">{formatCurrency(data.value)}</p>
          <p className="text-xs text-muted">{((data.value / chartData.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: '100%', height: '350px', padding: '10px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            outerRadius={90}
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
            height={40}
            wrapperStyle={{ paddingTop: '10px' }}
            formatter={(value) => value}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
