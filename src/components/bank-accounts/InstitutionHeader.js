import React from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import { sumBalances } from './calculations';

export default function InstitutionHeader({ darkMode, institution, accounts, collapsed, onToggle }) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={!collapsed}
      className={`w-full flex items-center justify-between px-4 py-2 rounded-lg transition-colors bg-surface-2 hover:bg-line/60`}
    >
      <div className="flex items-center gap-2">
        <Building2 size={20} className="text-muted" />
        <h3 className="font-bold text-lg">{institution}</h3>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-sm font-semibold">
          {accounts.length} account{accounts.length !== 1 ? 's' : ''} • Total: {formatCurrency(sumBalances(accounts))}
        </div>
        <ChevronDown size={16} className={`transform transition-transform ${collapsed ? 'rotate-180' : ''}`} />
      </div>
    </button>
  );
}
