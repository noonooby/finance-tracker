import React from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

export default function TransactionSummaryCards({ darkMode, totals, formatCurrency }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4`}>
        <div className="flex items-center gap-2 text-green-600 mb-2">
          <TrendingUp size={20} />
          <span className="font-medium">Income</span>
        </div>
        <p className="text-2xl font-bold">{formatCurrency(totals.income)}</p>
      </div>
      
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4`}>
        <div className="flex items-center gap-2 text-red-600 mb-2">
          <TrendingDown size={20} />
          <span className="font-medium">Expenses</span>
        </div>
        <p className="text-2xl font-bold">{formatCurrency(totals.expense)}</p>
      </div>
      
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4`}>
        <div className="flex items-center gap-2 text-blue-600 mb-2">
          <DollarSign size={20} />
          <span className="font-medium">Payments</span>
        </div>
        <p className="text-2xl font-bold">{formatCurrency(totals.payment)}</p>
      </div>
    </div>
  );
}
