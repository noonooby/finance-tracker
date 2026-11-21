import React from 'react';
import { Trash2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { parseDay } from '../../utils/helpers';

/**
 * Transaction Card Component
 * Displays a single transaction
 * Pure presentational component
 */
export default function TransactionCard({
  transaction,
  darkMode,
  onDelete
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

  const formatDate = (dateString) => {
    const date = parseDay(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
        return <TrendingUp className="text-green-600" size={20} />;
      case 'expense':
        return <TrendingDown className="text-red-600" size={20} />;
      case 'payment':
      case 'loan_payment':
      case 'credit_card_payment':
        return <DollarSign className="text-blue-600" size={20} />;
      default:
        return <DollarSign className="text-muted" size={20} />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'income':
        return 'text-green-600 bg-green-50';
      case 'expense':
        return 'text-red-600 bg-red-50';
      case 'payment':
      case 'loan_payment':
      case 'credit_card_payment':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-muted bg-surface-2';
    }
  };

  // Build info chips
  const formattedType = formatLabel(transaction.type || 'transaction');
  const formattedMethod = formatPaymentMethod(transaction);
  const statusLabel = transaction.status ? formatLabel(transaction.status) : null;
  
  const infoChips = [
    { label: 'Type', value: formattedType }
  ];

  if (formattedMethod) {
    infoChips.push({ label: 'Method', value: formattedMethod });
  }

  if (statusLabel && statusLabel.toLowerCase() !== 'active') {
    infoChips.push({ label: 'Status', value: statusLabel });
  }

  const chipClass = 'bg-surface-2 text-fg';

  return (
    <div
      className={`bg-surface border-line border rounded-2xl p-4 hover:shadow-md transition-shadow ${isUndone ? 'opacity-75' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className={`p-2 rounded-lg ${getTypeColor(transaction.type)}`}>
            {getTypeIcon(transaction.type)}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`font-semibold ${isUndone ? 'line-through text-muted' : ''}`}>
                {formatDescription(transaction)}
              </h3>
              {transaction.category_name && (
                <span className={`text-xs px-2 py-1 rounded bg-surface-2`}>
                  {transaction.category_name}
                </span>
              )}
              {isUndone && (
                <span className="text-xs px-2 py-1 rounded bg-surface-2 text-muted">
                  Undone
                </span>
              )}
            </div>
            
            <div className={`flex items-center gap-3 text-sm ${isUndone ? 'text-muted line-through' : 'text-muted'}`}>
              <span>{formatDate(transaction.date)}</span>
            </div>
            
            {infoChips.length > 0 && (
              <div className={`flex flex-wrap gap-2 mt-2 text-xs ${isUndone ? 'text-muted' : ''}`}>
                {infoChips.map((chip, index) => (
                  <span
                    key={`${transaction.id}-${chip.label}-${index}`}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded ${chipClass}`}
                  >
                    <span className="font-semibold">{chip.label}:</span>
                    <span>{chip.value}</span>
                  </span>
                ))}
              </div>
            )}

            {transaction.notes && (
              <p className={`text-sm mt-1 ${isUndone ? 'text-muted line-through' : 'text-muted'}`}>
                {transaction.notes}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <p className={`text-xl font-bold ${
            transaction.type === 'income' ? 'text-green-600' : 
            transaction.type === 'expense' ? 'text-red-600' : 
            'text-blue-600'
          } ${isUndone ? 'line-through text-muted' : ''}`}>
            {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
          </p>
          
          <button
            onClick={() => onDelete(transaction)}
            className={`p-2 rounded-lg hover:bg-surface-2 text-red-600`}
            title="Delete"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
