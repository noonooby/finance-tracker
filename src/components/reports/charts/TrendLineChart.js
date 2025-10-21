import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Activity } from 'lucide-react';
import { formatCurrency } from '../../../utils/reportHelpers';

export default function TrendLineChart({ data, darkMode, dataKeys = [] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Activity size={48} className="mb-3 opacity-30" />
        <p className="text-lg font-medium">No data available</p>
        <p className="text-sm">Add more transactions to see trends</p>
      </div>
    );
  }
  
  // Check if all data points have zero values
  const hasNonZeroData = data.some(point => 
    dataKeys.some(key => Number(point[key.key]) !== 0)
  );
  
  if (!hasNonZeroData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Activity size={48} className="mb-3 opacity-30" />
        <p className="text-lg font-medium">No activity in this period</p>
        <p className="text-sm">Try adjusting your date range or filters</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} p-3 rounded-lg shadow-lg border`}>
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
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#E5E7EB'} />
        <XAxis 
          dataKey="displayName" 
          stroke={darkMode ? '#9CA3AF' : '#6B7280'}
          style={{ fontSize: '12px' }}
        />
        <YAxis 
          stroke={darkMode ? '#9CA3AF' : '#6B7280'}
          style={{ fontSize: '12px' }}
          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        {dataKeys.map((key, index) => (
          <Line 
            key={key.key}
            type="monotone" 
            dataKey={key.key} 
            stroke={key.color} 
            strokeWidth={2}
            name={key.name}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
