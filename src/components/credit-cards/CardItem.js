import React from 'react';
import { Edit2, X, ShoppingBag, ListFilter, Star, Gift } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil } from '../../utils/helpers';
import RecentTransactions from '../shared/RecentTransactions';
import { expiryStatus } from './cardMath';

/**
 * Read-only view of one credit or gift card with its actions.
 */
export default function CardItem({
  card,
  darkMode,
  isPinned,
  onTogglePin,
  onViewTransactions,
  onEdit,
  onDelete,
  onManageGiftCard,
  onAddExpense,
  onMakePayment
}) {
  const muted = 'text-muted';
  const expiry = card.has_expiry && card.expiry_date ? expiryStatus(card.expiry_date) : null;
  const daysToDue = card.due_date ? getDaysUntil(card.due_date) : null;

  return (
    <>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-base sm:text-lg">{card.name}</h3>
            {isPinned && (
              <Star size={16} className="text-yellow-500 fill-current" aria-label="Pinned" />
            )}
            {card.is_gift_card && (
              <span className={`text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1 ${
                'bg-positive/10 text-positive border border-positive/30'
              }`}>
                <Gift size={12} />
                Gift Card
              </span>
            )}
            {!card.is_gift_card && card.connected_payment_source && card.connected_payment_source_id && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                'bg-positive/10 text-positive'
              }`}>
                Auto-Pay
              </span>
            )}
          </div>
          <div
            className={`text-xl sm:text-2xl font-bold mt-1 ${
              card.balance < 0
                ? 'text-green-600'
                : card.balance === 0
                ? 'text-muted'
                : 'text-red-600'
            }`}
          >
            {formatCurrency(card.balance)}
          </div>
          {card.is_gift_card ? (
            <>
              {card.purchase_amount > 0 && (
                <div className={`text-xs ${muted} mt-1`}>
                  Original: {formatCurrency(card.purchase_amount)} • {((card.balance / card.purchase_amount) * 100).toFixed(0)}% remaining
                </div>
              )}
              {card.purchase_date && card.purchase_amount_paid > 0 && (
                <div className={`text-xs ${muted} mt-1`}>
                  Bought on: {formatDate(card.purchase_date)} for {formatCurrency(card.purchase_amount_paid)}
                </div>
              )}
              {expiry && (
                <div className={`text-xs mt-1 font-medium ${
                  expiry.tone === 'expired' ? 'text-red-600' : expiry.tone === 'soon' ? 'text-orange-600' : muted
                }`}>
                  {expiry.text}
                </div>
              )}
            </>
          ) : (
            card.credit_limit > 0 && (
              <div className={`text-xs ${muted} mt-1`}>
                Limit: {formatCurrency(card.credit_limit)} ({((card.balance / card.credit_limit) * 100).toFixed(1)}% used)
              </div>
            )
          )}
        </div>
        <div className="flex gap-1 sm:gap-2">
          <button
            onClick={onTogglePin}
            className={`p-1.5 sm:p-2 rounded min-h-[44px] sm:min-h-0 flex items-center justify-center ${
              isPinned
                ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                : 'text-muted hover:bg-surface-2'
            }`}
            title={isPinned ? 'Unpin card' : 'Pin card'}
            aria-label={isPinned ? `Unpin ${card.name}` : `Pin ${card.name}`}
          >
            <Star size={16} className={`sm:w-[18px] sm:h-[18px] ${isPinned ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={onViewTransactions}
            className={`p-2 text-accent hover:bg-accent-soft rounded`}
            title="View transactions"
            aria-label={`View transactions for ${card.name}`}
          >
            <ListFilter size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
          <button
            onClick={onEdit}
            className={`p-2 text-accent hover:bg-accent-soft rounded`}
            aria-label={`Edit ${card.name}`}
          >
            <Edit2 size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
          <button
            onClick={onDelete}
            className={`p-2 text-negative hover:bg-negative/10 rounded`}
            aria-label={`Delete ${card.name}`}
          >
            <X size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      </div>

      {!card.is_gift_card && card.due_date && (
        <div className={`flex justify-between items-center mb-3 text-sm pb-3 border-b border-line`}>
          <span className={'text-muted'}>Due Date:</span>
          <div className="text-right">
            <div className="font-medium">{formatDate(card.due_date)}</div>
            {daysToDue >= 0 && (
              <div className={`text-xs ${daysToDue <= (card.alert_days || 7) ? 'text-red-600 font-semibold' : muted}`}>
                {daysToDue === 0 ? 'Due Today!' : `${daysToDue} days`}
              </div>
            )}
          </div>
        </div>
      )}

      {!card.is_gift_card && card.last_payment_date && card.last_payment_amount && card.last_payment_amount > 0 && (
        <div className={`flex justify-between items-center mb-3 text-sm pb-3 border-b border-line`}>
          <span className={'text-muted'}>Last Paid:</span>
          <div className="text-right">
            <div className="font-medium">{formatCurrency(card.last_payment_amount)}</div>
            <div className={`text-xs ${muted}`}>
              on {formatDate(card.last_payment_date)}
            </div>
          </div>
        </div>
      )}

      <RecentTransactions
        darkMode={darkMode}
        entityType="card"
        entityId={card.id}
        entityName={card.name}
      />

      {card.is_gift_card ? (
        <button
          onClick={onManageGiftCard}
          className="press bg-accent text-accent-contrast py-2 rounded-xl font-medium hover:opacity-90 w-full"
        >
          Manage Balance
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={onAddExpense}
            className="flex items-center justify-center gap-2 press bg-surface-2 text-fg border border-line hover:bg-line/60 py-2 rounded-xl font-medium"
          >
            <ShoppingBag size={18} />
            Add Expense
          </button>
          <button
            onClick={onMakePayment}
            className="press bg-accent text-accent-contrast py-2 rounded-xl font-medium hover:opacity-90"
          >
            Make Payment
          </button>
        </div>
      )}
    </>
  );
}
