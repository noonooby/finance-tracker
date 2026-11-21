import React from 'react';
import { Edit2, X, Star, ListFilter } from 'lucide-react';
import * as Icons from 'lucide-react';
import { formatCurrency, getAccountTypeIcon } from '../../utils/helpers';
import { formatFrequency } from '../../utils/sentenceCase';
import RecentTransactions from '../shared/RecentTransactions';

function IconButton({ label, onClick, className, children, disabled }) {
  return (
    <button onClick={onClick} className={className} title={label} aria-label={label} disabled={disabled}>
      {children}
    </button>
  );
}

function LinkedAutoPays({ darkMode, linkedLoans, linkedCards }) {
  if (linkedLoans.length === 0 && linkedCards.length === 0) return null;
  return (
    <div className={`text-xs mt-2 p-2 rounded bg-accent-soft text-accent border border-accent/30`}>
      <div className="font-semibold mb-1">Auto-pays:</div>
      {linkedLoans.map(loan => (
        <div key={loan.id} className="ml-2">
          • Loan: {loan.name} ({formatCurrency(loan.payment_amount || 0)}/{formatFrequency(loan.frequency)})
        </div>
      ))}
      {linkedCards.map(card => (
        <div key={card.id} className="ml-2">
          • Card: {card.name}
        </div>
      ))}
    </div>
  );
}

/**
 * Display of one bank account (the inline edit form is passed in as children when editing).
 */
export default function AccountCard({
  darkMode,
  account,
  isPinned,
  linkedLoans,
  linkedCards,
  onTogglePin,
  onSetPrimary,
  onViewTransactions,
  onEdit,
  onDelete
}) {
  const balance = Number(account.balance) || 0;
  const IconComponent = Icons[getAccountTypeIcon(account.account_type)] || Icons.Building2;
  const iconBtn = (light, dark) => `p-2 rounded ${darkMode ? dark : light}`;

  return (
    <>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <IconComponent size={20} className="text-muted" />
            <h3 className="font-bold text-base sm:text-lg">{account.name}</h3>
            {account.account_type === 'cash' && (
              <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-muted border border-line">Cash</span>
            )}
            {account.is_primary && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                <Star size={12} fill="currentColor" />
                Primary
              </span>
            )}
            {isPinned && !account.is_primary && (
              <Star size={16} className="text-yellow-500 fill-current" aria-label="Pinned" />
            )}
          </div>
          <div className={`text-xl sm:text-2xl font-bold mt-1 ${balance < 0 ? 'text-red-600' : 'text-blue-600'}`}>
            {balance < 0 ? 'Overdraft: ' : ''}{formatCurrency(account.balance)}
          </div>

          {balance < 0 && account.allows_overdraft && (
            <div className="text-xs text-red-600 mt-1 space-y-1">
              <div>Limit: {formatCurrency(account.overdraft_limit || 0)}</div>
              <div>Available: {formatCurrency((account.overdraft_limit || 0) + balance)}</div>
              <div className="font-medium">Resolve by end of day to avoid fees</div>
            </div>
          )}

          {account.institution && (
            <div className={`text-sm text-muted mt-1`}>
              {account.institution}
            </div>
          )}

          <LinkedAutoPays darkMode={darkMode} linkedLoans={linkedLoans} linkedCards={linkedCards} />
        </div>
        <div className="flex gap-1 sm:gap-2">
          {!account.is_primary && (
            <>
              <IconButton
                label={isPinned ? `Unpin ${account.name}` : `Pin ${account.name}`}
                onClick={onTogglePin}
                className={`p-1.5 sm:p-2 rounded min-h-[44px] sm:min-h-0 flex items-center justify-center ${
                  isPinned
                    ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                    : 'text-muted hover:bg-surface-2'
                }`}
              >
                <Star size={16} className={`sm:w-[18px] sm:h-[18px] ${isPinned ? 'fill-current' : ''}`} />
              </IconButton>
              <IconButton
                label={`Set ${account.name} as primary account`}
                onClick={onSetPrimary}
                className={iconBtn('text-yellow-600 hover:bg-yellow-50', 'text-yellow-400 hover:bg-surface-2')}
              >
                <Star size={16} className="sm:w-[18px] sm:h-[18px]" />
              </IconButton>
            </>
          )}
          <IconButton
            label={`View ${account.name} transactions`}
            onClick={onViewTransactions}
            className={iconBtn('text-purple-600 hover:bg-purple-50', 'text-purple-400 hover:bg-surface-2')}
          >
            <ListFilter size={16} className="sm:w-[18px] sm:h-[18px]" />
          </IconButton>
          <IconButton
            label={`Edit ${account.name}`}
            onClick={onEdit}
            className={iconBtn('text-blue-600 hover:bg-blue-50', 'text-blue-400 hover:bg-surface-2')}
          >
            <Edit2 size={16} className="sm:w-[18px] sm:h-[18px]" />
          </IconButton>
          <IconButton
            label={`Delete ${account.name}`}
            onClick={onDelete}
            disabled={account.is_primary}
            className={iconBtn('text-red-600 hover:bg-red-50', 'text-red-400 hover:bg-surface-2')}
          >
            <X size={16} className="sm:w-[18px] sm:h-[18px]" />
          </IconButton>
        </div>
      </div>

      <div className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded mb-3 ${
        'bg-surface-2 text-muted'
      }`}>
        {account.account_type.charAt(0).toUpperCase() + account.account_type.slice(1)} Account
      </div>

      <RecentTransactions
        darkMode={darkMode}
        entityType="bank_account"
        entityId={account.id}
        entityName={account.name}
      />
    </>
  );
}
