import React, { useEffect, useRef, useState } from 'react';
import { Plus, CreditCard as CreditCardIcon } from 'lucide-react';
import AddTransaction from './AddTransaction';
import { GiftCardOperations } from './credit-cards';
import CardItem from './credit-cards/CardItem';
import CreditCardForm from './credit-cards/CreditCardForm';
import { useCreditCardActions } from './credit-cards/hooks/useCreditCardActions';
import { normalizeId, sortPinnedFirst } from './credit-cards/cardMath';

export default function CreditCards({
  darkMode,
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
  onNavigateToTransactions,
  cashInHand,
  onUpdateCashInHand
}) {
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentCard, setPaymentCard] = useState(null);
  const cardRefs = useRef({});
  const cardNameInputRef = useRef(null);

  const a = useCreditCardActions({
    creditCards,
    categories,
    alertSettings,
    onUpdate,
    onUpdateCash,
    bankAccounts,
    cashInHand,
    onUpdateCashInHand
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
    darkMode,
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
      {showPayment && paymentCard && (
        <AddTransaction
          darkMode={darkMode}
          onClose={() => {
            setShowPayment(false);
            setPaymentCard(null);
          }}
          onUpdate={onUpdate}
          categories={categories}
          creditCards={creditCards}
          loans={loans}
          availableCash={availableCash}
          onUpdateCash={onUpdateCash}
          bankAccounts={bankAccounts}
          preselectedCard={paymentCard}
          preselectedType="payment"
          preselectedAmount={paymentCard.balance.toString()}
          cashInHand={cashInHand}
          onUpdateCashInHand={onUpdateCashInHand}
        />
      )}

      {showAddExpense && (
        <AddTransaction
          darkMode={darkMode}
          onClose={() => {
            setShowAddExpense(false);
            setSelectedCard(null);
          }}
          onUpdate={onUpdate}
          categories={categories}
          creditCards={creditCards}
          loans={[]}
          availableCash={availableCash}
          onUpdateCash={onUpdateCash}
          bankAccounts={bankAccounts}
          preselectedCard={selectedCard}
          preselectedType="expense"
          cashInHand={cashInHand}
          onUpdateCashInHand={onUpdateCashInHand}
        />
      )}

      {a.activeGiftCardOp && (
        <GiftCardOperations
          darkMode={darkMode}
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

      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-4">
        <h2 className="text-xl md:text-2xl font-bold">Credit Cards</h2>
        <div className="flex gap-2">
          <button
            onClick={a.handleProcessDueCardPayments}
            disabled={a.isProcessing}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base ${
              a.isProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            } text-white`}
            title="Process all overdue credit cards from connected payment sources"
          >
            {a.isProcessing ? 'Processing...' : 'Process Due Payments'}
          </button>
          <button
            onClick={() => {
              if (a.showAddForm) {
                a.resetForm();
              } else {
                a.setShowAddForm(true);
              }
            }}
            className="flex items-center gap-1 sm:gap-2 bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base"
          >
            <Plus size={20} />
            {a.showAddForm ? 'Cancel' : 'Add Card'}
          </button>
        </div>
      </div>

      {a.processingResults && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'} border rounded-lg p-3 text-sm`}>
          <div className={darkMode ? 'text-gray-200' : 'text-blue-800'}>
            Processed: {a.processingResults.processed.length} • Failed: {a.processingResults.failed.length} • Skipped: {a.processingResults.skipped.length}
          </div>
        </div>
      )}

      {a.showAddForm && !editingItem && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
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
          <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
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
                className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 ${
                  isEditing
                    ? 'ring-2 ring-blue-500 shadow-lg'
                    : focusTarget?.type === 'card' && normalizeId(focusTarget.id) === normalizeId(card.id)
                    ? 'ring-2 ring-offset-2 ring-blue-500'
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
                    darkMode={darkMode}
                    isPinned={a.pinnedCards.includes(card.id)}
                    onTogglePin={() => a.handleTogglePin(card.id)}
                    onViewTransactions={() => onNavigateToTransactions && onNavigateToTransactions({ creditCard: card.id })}
                    onEdit={() => a.handleEdit(card)}
                    onDelete={() => a.handleDelete(card.id)}
                    onManageGiftCard={() => a.setActiveGiftCardOp(card)}
                    onAddExpense={() => {
                      setSelectedCard(card);
                      setShowAddExpense(true);
                    }}
                    onMakePayment={() => {
                      setPaymentCard(card);
                      setShowPayment(true);
                    }}
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
