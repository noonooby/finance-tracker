import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useFinanceData } from '../../hooks/useFinanceData';
import { position } from '../../utils/finance';
import { formatCurrency } from '../../utils/helpers';

// Net worth on Home, with how many figures need updating; opens Where you stand.
export default function NetWorthCard({ darkMode }) {
  const navigate = useNavigate();
  const d = useFinanceData();
  const p = useMemo(() => position({ bankAccounts: d.bankAccounts, cash: d.cashInHand, cashAsOf: d.cashAsOf, creditCards: d.creditCards, loans: d.loans, investments: d.investments, assets: d.assets }), [d]);
  return (
    <button type="button" onClick={() => navigate('/position')} className={`row w-full text-left rounded-2xl border p-4 flex items-center gap-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <span className="flex-1">
        <span className={`block text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Net worth</span>
        <span className={`block text-2xl font-bold tabular-nums ${p.netWorth < 0 ? 'text-red-600' : ''}`}>{formatCurrency(p.netWorth)}</span>
        <span className={`block text-xs ${p.upToDate ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>{p.upToDate ? 'Up to date' : `${p.stale.length} to update`}</span>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}
