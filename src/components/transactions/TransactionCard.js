import React from 'react';
import { Trash2, TrendingUp, TrendingDown, DollarSign, Pencil } from 'lucide-react';

/**
 * Transaction Card Component
 * Displays a single transaction
 * Pure presentational component
 */
export default function TransactionCard({
  transaction,
  darkMode,
  onDelete,
  onEdit
}) {
  const isUndone = transaction.status === 'undone';
  
  // Formatting helpers
  const formatLabel = (value) => {
    if (!value) return '';
    const cleaned = value.replace(/_/g, ' ');
    return cleaned
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatPaymentMethod = (transaction) => {
    const method = transaction.payment_method;
    const methodName = transaction.payment_method_name;
    
    if (methodName) return methodName;
    
    switch (method) {
      case 'cash_in_hand': // old records, before cash became an account
        return 'Cash';
      case 'bank_account':
        return 'Bank Account';
      case 'credit_card':
        return 'Credit Card';
      case 'reserved_fund':
        return 'Reserved Fund';
      case 'cash_withdrawal':
        return 'Cash Withdrawal';
      case 'cash_deposit':
        return 'Cash Deposit';
      case 'transfer':
        return 'Transfer';
      case 'cash':
        return 'Cash';
      case 'loan':
        return 'Loan';
      default:
        return formatLabel(method);
    }
  };

  const formatDescription = (transaction) => {
    const desc = transaction.description || transaction.income_source || 'Transaction';
    if (!desc) return 'Transaction';
    return desc.charAt(0).toUpperCase() + desc.slice(1);
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'income':
        return <TrendingUp className="text-positive" size={18} />;
      case 'expense':
        return <TrendingDown className="text-negative" size={18} />;
      case 'payment':
      case 'loan_payment':
      case 'credit_card_payment':
        return <DollarSign className="text-accent" size={18} />;
      default:
        return <DollarSign className="text-muted" size={18} />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'income':
        return 'text-positive bg-positive/10';
      case 'expense':
        return 'text-negative bg-negative/10';
      case 'payment':
      case 'loan_payment':
      case 'credit_card_payment':
        return 'text-accent bg-accent-soft';
      default:
        return 'text-muted bg-surface-2';
    }
  };

  const isIn = transaction.type === 'income' || transaction.type === 'refund';
  const isOut = transaction.type === 'expense';
  const method = formatPaymentMethod(transaction);
  const kind = isOut || transaction.type === 'income' ? null : formatLabel(transaction.type || '');
  const cat = Array.isArray(transaction.splits) && transaction.splits.length ? `Split: ${transaction.splits.map((p) => p.category_name || 'No category').join(', ')}` : transaction.category_name;
  const sub = [kind, method, cat, transaction.original_currency ? `${transaction.original_currency} ${Number(transaction.original_amount).toFixed(2)}` : null].filter(Boolean).join(' · ');

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${isUndone ? 'opacity-60' : ''}`}>
      <span className={`shrink-0 grid place-items-center w-10 h-10 rounded-2xl ${getTypeColor(transaction.type)}`} aria-hidden="true">{getTypeIcon(transaction.type)}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-[0.9375rem] font-medium truncate ${isUndone ? 'line-through text-muted' : ''}`}>{formatDescription(transaction)}</div>
        <div className="text-xs text-muted line-clamp-2">{sub}{isUndone ? ' · Undone' : ''}</div>
        {transaction.notes && <div className="text-xs text-muted truncate">{transaction.notes}</div>}
      </div>
      <div className={`shrink-0 text-[0.9375rem] font-semibold tabular-nums ${isUndone ? 'line-through text-muted' : isIn ? 'text-positive' : 'text-fg'}`}>
        {isIn ? '+' : isOut ? '-' : ''}{formatCurrency(transaction.amount)}
      </div>
      <div className="shrink-0 flex items-center -mr-2">
        {onEdit && !isUndone && transaction.status !== 'deleted' && (
          <button type="button" onClick={() => onEdit(transaction)} className="icon-btn text-muted hover:bg-surface-2" aria-label={`Change ${transaction.description || 'this line'}`}><Pencil size={17} aria-hidden="true" /></button>
        )}
        <button type="button" onClick={() => onDelete(transaction)} className="icon-btn text-muted hover:bg-surface-2 hover:text-negative" aria-label={`Undo or delete ${transaction.description || 'this line'}`}><Trash2 size={17} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
