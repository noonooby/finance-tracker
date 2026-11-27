import React, { useEffect, useRef } from 'react';
import Rewards from './credit-cards/Rewards';
import { useUI } from '../hooks/useUI';
import { Plus, CreditCard as CreditCardIcon } from 'lucide-react';
import { GiftCardOperations } from './credit-cards';
import CardItem from './credit-cards/CardItem';
import CreditCardForm from './credit-cards/CreditCardForm';
import { useCreditCardActions } from './credit-cards/hooks/useCreditCardActions';
import { normalizeId, sortPinnedFirst } from './credit-cards/cardMath';

export default function CreditCards({
  creditCards,
  loans = [],
  categories,
  availableCash,
  alertSettings,
  onUpdate,
  onUpdateCash,
  focusTarget,
  onClearFocus,
  bankAccounts,
  onNavigateToTransactions
}) {
  const { openAdd } = useUI();
  const cardRefs = useRef({});
  const cardNameInputRef = useRef(null);

  const a = useCreditCardActions({
    creditCards,
    categories,
    alertSettings,
    onUpdate,
    onUpdateCash,
    bankAccounts
  });
  const { editingItem, formData } = a;

  const sortedCards = sortPinnedFirst(creditCards, a.pinnedCards);

  useEffect(() => {
    if (focusTarget?.type === 'card' && focusTarget.id) {
      const key = String(normalizeId(focusTarget.id));
      const node = cardRefs.current[key];
      if (node?.scrollIntoView) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const timer = setTimeout(() => onClearFocus?.(), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [focusTarget, onClearFocus]);

  const formProps = {
    formData,
    setFormData: a.setFormData,
    editingItem,
    recentGiftCards: a.recentGiftCards,
    onSelectGiftCard: a.handleSelectGiftCard,
    giftCardNameInputRef: a.giftCardNameInputRef,
    onPaymentSourceChange: a.handlePaymentSourceChange,
    bankAccounts,
    creditCards,
    onSubmit: a.handleAdd
  };

  return (
    <div className="space-y-4">


      {a.activeGiftCardOp && (
        <GiftCardOperations
          giftCard={a.activeGiftCardOp}
          creditCards={creditCards}
          bankAccounts={bankAccounts}
          categories={categories}
          onAddBalance={a.handleAddBalance}
          onUseBalance={a.handleUseBalance}
          onClose={() => a.setActiveGiftCardOp(null)}
          processing={a.giftCardOpProcessing}
        />
      )}

      <Rewards creditCards={creditCards} />
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Credit cards</h2>
        <div className="flex gap-2">
          <button
            onClick={a.handleProcessDueCardPayments}
            disabled={a.isProcessing}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl font-medium text-sm sm:text-base ${
              a.isProcessing
                ? 'bg-surface-2 text-muted border border-line cursor-not-allowed'
                : 'press bg-surface-2 text-fg border border-line hover:bg-line/60'
            }`}
            title="Process all overdue credit cards from connected payment sources"
          >
            {a.isProcessing ? 'Processing...' : 'Record payments due'}
          </button>
          <button
            onClick={() => {
              if (a.showAddForm) {
                a.resetForm();
              } else {
                a.setShowAddForm(true);
              }
            }}
            className="flex items-center gap-1 sm:gap-2 bg-accent text-accent-contrast px-3 sm:px-4 py-2 rounded-xl text-sm sm:text-base"
          >
            <Plus size={20} />
            {a.showAddForm ? 'Cancel' : 'Add a card'}
          </button>
        </div>
      </div>

      {a.processingResults && (
        <div className="bg-accent-soft border-accent/30 border rounded-xl p-3 text-sm">
          <div className="text-accent">
            Processed: {a.processingResults.processed.length} • Failed: {a.processingResults.failed.length} • Skipped: {a.processingResults.skipped.length}
          </div>
        </div>
      )}

      {a.showAddForm && !editingItem && (
        <div className="bg-surface border-line rounded-2xl border p-4 space-y-3">
          <CreditCardForm
            {...formProps}
            mode="add"
            recentCardNames={a.recentCardNames}
            onSelectCardName={a.handleSelectCardName}
            cardNameInputRef={cardNameInputRef}
            onCancel={a.resetForm}
            submitting={a.isActionProcessing(editingItem ? `edit-card-${editingItem.id}` : 'add-card')}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {creditCards.length === 0 ? (
          <div className="text-center py-12 text-muted">
            <CreditCardIcon size={48} className="mx-auto mb-3 opacity-30" />
            <p>No credit cards added yet</p>
          </div>
        ) : (
          sortedCards.map(card => {
            const isEditing = editingItem?.id === card.id;
            const key = String(normalizeId(card.id));

            return (
              <div
                key={key}
                ref={(el) => {
                  if (el) cardRefs.current[key] = el;
                }}
                className={`bg-surface border-line rounded-2xl border p-4 ${
                  isEditing
                    ? 'ring-2 ring-accent/30 shadow-lg'
                    : focusTarget?.type === 'card' && normalizeId(focusTarget.id) === normalizeId(card.id)
                    ? 'ring-2 ring-offset-2 ring-accent/30'
                    : ''
                } ${editingItem && !isEditing ? 'opacity-60' : ''}`}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <CreditCardForm
                      {...formProps}
                      mode="edit"
                      card={card}
                      onCancel={() => {
                        a.setEditingItem(null);
                        a.resetForm();
                      }}
                      submitting={a.isActionProcessing(`edit-card-${card.id}`)}
                    />
                  </div>
                ) : (
                  <CardItem
                    card={card}
                    isPinned={a.pinnedCards.includes(card.id)}
                    onTogglePin={() => a.handleTogglePin(card.id)}
                    onViewTransactions={() => onNavigateToTransactions && onNavigateToTransactions({ creditCard: card.id })}
                    onEdit={() => a.handleEdit(card)}
                    onDelete={() => a.handleDelete(card.id)}
                    onManageGiftCard={() => a.setActiveGiftCardOp(card)}
                    onAddExpense={() => openAdd({ kind: 'spent', source: `credit_card:${card.id}` })}
                    onMakePayment={() => openAdd({ kind: 'moved', to: `credit_card:${card.id}`, amount: Number(card.balance) || 0 })}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
