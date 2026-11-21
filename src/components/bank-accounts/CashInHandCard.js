import React from 'react';
import { Wallet, Edit2, ArrowRightLeft, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';

export default function CashInHandCard({ darkMode, cashInHand, onOpenCashForm, onEditAmount, onWithdraw, onDeposit }) {
  return (
    <div className={`bg-surface border-line rounded-2xl border p-4`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={20} className="text-green-600" />
            <h3 className="font-bold text-base sm:text-lg">Cash in Hand</h3>
            <span className={`text-xs px-2 py-1 rounded bg-positive/10 text-positive`}>
              Physical Cash
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold mt-1 text-green-600">
            {formatCurrency(cashInHand || 0)}
          </div>
          <div className={`text-xs text-muted mt-1`}>
            Money outside bank accounts
          </div>
        </div>
        <div className="flex gap-1 sm:gap-2">
          <button
            onClick={onOpenCashForm}
            className={`p-2 rounded text-positive hover:bg-positive/10`}
            title="Withdraw or deposit cash"
            aria-label="Withdraw or deposit cash"
          >
            <ArrowRightLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
          <button
            onClick={onEditAmount}
            className={`p-2 rounded text-accent hover:bg-accent-soft`}
            title="Edit cash amount"
            aria-label="Edit cash in hand amount"
          >
            <Edit2 size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          onClick={onWithdraw}
          className="flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm press bg-surface-2 text-fg border border-line hover:bg-line/60"
        >
          <ArrowDownToLine size={16} />
          Withdraw
        </button>
        <button
          onClick={onDeposit}
          className="flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm press bg-accent text-accent-contrast hover:opacity-90"
        >
          <ArrowUpFromLine size={16} />
          Deposit
        </button>
      </div>
    </div>
  );
}
