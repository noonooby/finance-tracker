import React from 'react';
import { Edit2, X, ShoppingBag, ListFilter, Star, Gift } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil } from '../../utils/helpers';
import RecentTransactions from '../shared/RecentTransactions';
import { expiryStatus } from './cardMath';
import { useFinanceData } from '../../hooks/useFinanceData';
import { cardSplit } from '../../utils/finance';
import { Issues } from '../shared/Issues';

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
  const { loans = [] } = useFinanceData();
  const split = card.is_gift_card ? null : cardSplit(card, loans);

  return (
    <>
      <div className="flex flex-wrap justify-between items-start gap-x-2 mb-3">
        <div className="flex-1 min-w-[55%]">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-lg leading-snug">{card.name}</h3>
            {isPinned && (
              <Star size={16} className="text-warning fill-current" aria-label="Pinned" />
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
                ? 'text-positive'
                : card.balance === 0
                ? 'text-muted'
                : 'text-negative'
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
                  expiry.tone === 'expired' ? 'text-negative' : expiry.tone === 'soon' ? 'text-warning' : muted
                }`}>
                  {expiry.text}
                </div>
              )}
            </>
          ) : (
            card.credit_limit > 0 && (
              <div className={`text-xs ${muted} mt-1`}>
                Limit: {formatCurrency(card.credit_limit)} ({((card.balance / card.credit_limit) * 100).toFixed(1)}% used)
                {card.credit_limit_changed_at && card.credit_limit_before != null && Number(card.credit_limit_before) !== Number(card.credit_limit) && (
                  <span className="block">{Number(card.credit_limit) > Number(card.credit_limit_before) ? 'Raised' : 'Lowered'} from {formatCurrency(card.credit_limit_before)}, seen {card.credit_limit_changed_at}</span>
                )}
              </div>
            )
          )}
          {split && split.plans.length > 0 && (
            <div className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-xs space-y-1">
              <div className="font-medium text-fg">What this balance is made of</div>
              {split.plans.map((p) => (
                <div key={p.id} className="flex justify-between gap-3">
                  <span className={`min-w-0 truncate ${muted}`}>{p.name}{p.payment > 0 ? ` · ${formatCurrency(p.payment)} a month` : ''}{p.rate > 0 ? ` · ${p.rate}%` : ''}</span>
                  <span className="tabular-nums shrink-0">{formatCurrency(p.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3">
                <span className={muted}>Everything else, at the card's rate if carried</span>
                <span className="tabular-nums shrink-0">{formatCurrency(split.rest)}</span>
              </div>
              {split.over > 0 && <Issues compact only={(i) => i.kind === 'plans' && i.ref === String(card.id)} />}
            </div>
          )}
        </div>
        <div className="flex ml-auto -mr-2 shrink-0">
          <button
            onClick={onTogglePin}
            className={`icon-btn ${
              isPinned
                ? 'text-warning hover:bg-surface-2'
                : 'text-muted hover:bg-surface-2'
            }`}
            title={isPinned ? 'Unpin card' : 'Pin card'}
            aria-label={isPinned ? `Unpin ${card.name}` : `Pin ${card.name}`}
          >
            <Star size={18} className={`${isPinned ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={onViewTransactions}
            className="icon-btn text-muted hover:bg-surface-2"
            title="View transactions"
            aria-label={`View transactions for ${card.name}`}
          >
            <ListFilter size={18} />
          </button>
          <button
            onClick={onEdit}
            className="icon-btn text-muted hover:bg-surface-2"
            aria-label={`Edit ${card.name}`}
          >
            <Edit2 size={18} />
          </button>
          <button
            onClick={onDelete}
            className="icon-btn text-muted hover:bg-negative/10 hover:text-negative"
            aria-label={`Delete ${card.name}`}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {!card.is_gift_card && card.due_date && (
        <div className={`flex justify-between items-center mb-3 text-sm pb-3 border-b border-line`}>
          <span className={'text-muted'}>Due</span>
          <div className="text-right">
            <div className="font-medium">{formatDate(card.due_date)}</div>
            {!(Number(card.balance) > 0) ? (
              <div className={`text-xs ${muted}`}>Nothing owed</div>
            ) : daysToDue >= 0 && (
              <div className={`text-xs ${daysToDue <= (card.alert_days || 7) ? 'text-negative font-semibold' : muted}`}>
                {daysToDue === 0 ? 'Due today' : daysToDue === 1 ? '1 day' : `${daysToDue} days`}
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
            Add a purchase
          </button>
          <button
            onClick={onMakePayment}
            className="press bg-accent text-accent-contrast py-2 rounded-xl font-medium hover:opacity-90"
          >
            Make a payment
          </button>
        </div>
      )}
    </>
  );
}
