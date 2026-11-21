// State and data access for the credit cards page. Every balance change goes through utils/money.
import { useEffect, useRef, useState, useCallback } from 'react';
import { formatCurrency, generateId } from '../../../utils/helpers';
import { dbOperation } from '../../../utils/db';
import { recordExpense, recordGiftCardPurchase, reverseTransaction } from '../../../utils/money';
import { logActivity } from '../../../utils/activityLogger';
import { upsertKnownEntity } from '../../../utils/knownEntities';
import { processOverdueCreditCards } from '../../../utils/autoPay';
import useAsyncAction from '../../../hooks/useAsyncAction';
import { showToast } from '../../../utils/toast';
import { getUserPreferences, togglePinnedCreditCard } from '../../../utils/userPreferencesManager';
import {
  getRecentGiftCardNames,
  getLastUsedGiftCardContext,
  applyGiftCardPurchaseContext
} from '../../../utils/formContexts';
import { useGiftCardPurchase } from './useGiftCardPurchase';
import {
  emptyCardForm,
  formFromCard,
  validateCardForm,
  cardFromForm,
  describeNewCard,
  describeCardEdit,
  describeDeletedCard,
  parsePaymentSource,
  giftCardReloadText
} from '../cardMath';

const focusBalanceInput = () => {
  setTimeout(() => {
    const balanceInput = document.querySelector('input[placeholder="Current Balance *"]');
    if (balanceInput) balanceInput.focus();
  }, 50);
};

// The account remembered for a gift card purchase, or nothing when none was remembered (cash before it was an account),
// so the form keeps its default account.
const rememberedSource = (contextData) => (contextData.paymentSourceId
  ? { giftCardPaymentMethod: contextData.paymentSource, giftCardPaymentMethodId: contextData.paymentSourceId }
  : {});

export function useCreditCardActions({
  creditCards,
  categories,
  alertSettings,
  onUpdate,
  onUpdateCash,
  bankAccounts
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(() => emptyCardForm(alertSettings.defaultDays, bankAccounts));
  const [processingResults, setProcessingResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pinnedCards, setPinnedCards] = useState([]);
  const [recentCardNames, setRecentCardNames] = useState([]);
  const [recentGiftCards, setRecentGiftCards] = useState([]);
  const giftCardNameInputRef = useRef(null);
  const [activeGiftCardOp, setActiveGiftCardOp] = useState(null);
  const [giftCardOpProcessing, setGiftCardOpProcessing] = useState(false);

  const { executeAction, isProcessing: isActionProcessing } = useAsyncAction();

  const { createGiftCardPurchaseTransaction } = useGiftCardPurchase({
    creditCards,
    bankAccounts,
    onUpdateCash
  });

  const loadRecentCardNames = async () => {
    try {
      const { fetchSuggestions } = await import('../../../utils/knownEntities');
      const recent = await fetchSuggestions('card', '', 5);
      setRecentCardNames(recent);
    } catch (error) {
      console.error('Error loading recent card names:', error);
    }
  };

  const loadRecentGiftCards = async () => {
    try {
      const recent = await getRecentGiftCardNames(5);
      setRecentGiftCards(recent);

      if (!editingItem && formData.isGiftCard) {
        const lastContext = await getLastUsedGiftCardContext();
        if (lastContext) {
          const contextData = applyGiftCardPurchaseContext(lastContext);
          setFormData(prev => ({
            ...prev,
            purchaseAmount: contextData.originalValue || '',
            purchaseAmountPaid: contextData.purchaseAmount || contextData.originalValue || '',
            ...rememberedSource(contextData)
          }));

          setTimeout(() => {
            if (giftCardNameInputRef.current) {
              giftCardNameInputRef.current.select();
              giftCardNameInputRef.current.focus();
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error('Error loading recent gift cards:', error);
    }
  };

  const loadPinnedCards = async () => {
    try {
      const prefs = await getUserPreferences();
      setPinnedCards(prefs.pinned_credit_cards || []);
    } catch (error) {
      console.error('Error loading pinned cards:', error);
    }
  };

  useEffect(() => {
    loadPinnedCards();
    loadRecentCardNames();
    loadRecentGiftCards();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectCardName = useCallback((cardEntity) => {
    setFormData(prev => ({ ...prev, name: cardEntity.name }));
    focusBalanceInput();
  }, []);

  const handleSelectGiftCard = useCallback(async (giftCardContext) => {
    try {
      const contextData = applyGiftCardPurchaseContext(giftCardContext);
      setFormData(prev => ({
        ...prev,
        name: giftCardContext.card_name,
        purchaseAmount: contextData.originalValue || '',
        purchaseAmountPaid: contextData.purchaseAmount || contextData.originalValue || '',
        ...rememberedSource(contextData)
      }));
      focusBalanceInput();
    } catch (error) {
      console.error('Error applying gift card context:', error);
    }
  }, []);

  const handleTogglePin = async (cardId) => {
    try {
      await togglePinnedCreditCard(cardId);
      await loadPinnedCards();
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };

  const handlePaymentSourceChange = (value) => {
    setFormData(prev => ({ ...prev, ...parsePaymentSource(value) }));
  };

  const resetForm = () => {
    setFormData(emptyCardForm(alertSettings.defaultDays, bankAccounts));
    setShowAddForm(false);
    setEditingItem(null);
    loadRecentCardNames().catch(console.error);
    loadRecentGiftCards().catch(console.error);
  };

  const handleEdit = async (card) => {
    setFormData(formFromCard(card, alertSettings.defaultDays, bankAccounts));
    setEditingItem(card);
    setShowAddForm(true);
  };

  const handleAdd = async () => {
    const invalid = validateCardForm(formData, !!editingItem);
    if (invalid) {
      showToast.error(invalid);
      return;
    }

    const actionId = editingItem ? `edit-card-${editingItem.id}` : 'add-card';

    const result = await executeAction(actionId, async () => {
      const newCard = cardFromForm(formData, {
        id: editingItem?.id || generateId(),
        createdAt: editingItem?.created_at,
        defaultDays: alertSettings.defaultDays
      });

      // A new gift card starts at zero; its value arrives with the purchase as one money step below.
      if (formData.isGiftCard && !editingItem) newCard.balance = 0;
      const savedCard = await dbOperation('creditCards', 'put', newCard, { skipActivityLog: true });
      const cardId = savedCard?.id || newCard.id;
      if (!editingItem) {
        if (!formData.isGiftCard) {
          await logActivity(
            'add',
            'card',
            cardId,
            savedCard?.name || newCard.name,
            describeNewCard(savedCard, savedCard?.name || newCard.name),
            savedCard
          );
        }
      } else {
        await logActivity(
          'edit',
          'card',
          cardId,
          savedCard?.name || newCard.name,
          describeCardEdit(editingItem, savedCard, newCard, formData.isGiftCard),
          {
            previous: { ...editingItem, id: editingItem?.id || cardId, name: editingItem?.name || newCard.name },
            updated: { ...savedCard, id: savedCard?.id || cardId, name: savedCard?.name || newCard.name }
          }
        );
      }

      if (formData.isGiftCard && !editingItem) {
        const purchase = await createGiftCardPurchaseTransaction(savedCard, formData);
        if (!purchase) {
          showToast.error('Gift card added but purchase transaction failed');
        }
      }

      if (newCard.name) {
        upsertKnownEntity('card', newCard.name).catch(err =>
          console.warn('Failed to track card name:', err)
        );
      }

      await onUpdate();
      resetForm();

      return {
        cardName: savedCard?.name || newCard.name,
        isNew: !editingItem,
        isGiftCard: formData.isGiftCard
      };
    });

    if (result.success) {
      const cardType = result.data.isGiftCard ? 'Gift card' : 'Credit card';
      const action = result.data.isNew ? 'added' : 'updated';
      showToast.success(`${cardType} '${result.data.cardName}' ${action} successfully`);
    } else {
      showToast.error(`Failed to save card: ${result.error.message}`);
    }
  };

  const handleProcessDueCardPayments = async () => {
    if (isProcessing) return;

    if (!window.confirm('Process all overdue credit card payments from connected payment sources?')) {
      return;
    }

    setIsProcessing(true);
    setProcessingResults(null);

    try {
      const results = await processOverdueCreditCards(creditCards, bankAccounts);
      await onUpdate();
      setProcessingResults(results);

      const processedCount = results.processed.length;
      const failedCount = results.failed.length;

      if (processedCount > 0) {
        showToast.success(`Processed ${processedCount} credit card payment(s)`);
      } else if (failedCount > 0) {
        showToast.error(`Failed to process ${failedCount} credit card payment(s)`);
      } else {
        showToast.info('No overdue credit cards found');
      }
    } catch (error) {
      console.error('Error processing credit card payments:', error);
      showToast.error('Error processing payments. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddBalance = async (opForm) => {
    setGiftCardOpProcessing(true);

    try {
      const card = activeGiftCardOp;
      const amountAdded = parseFloat(opForm.amount);
      const amountPaid = opForm.amountPaid ? parseFloat(opForm.amountPaid) : amountAdded;
      const currentBalance = parseFloat(card.balance) || 0;
      const sourceType = opForm.paymentMethod;
      const sourceId = opForm.paymentMethodId;
      const text = giftCardReloadText(card, amountAdded, amountPaid);

      // Value goes onto the gift card and the payment leaves the source in one step; the server refuses it
      // if the source would pass its floor, and that message is shown below.
      const res = await recordGiftCardPurchase({
        giftCardId: card.id,
        amount: amountAdded,
        cost: amountPaid,
        source: `${sourceType}:${sourceId}`,
        date: opForm.date,
        description: text.description,
        extra: {
          notes: opForm.notes || text.notes,
          category_id: opForm.category,
          card_id: card.id
        }
      }, { bankAccounts, creditCards });
      const transactionId = res.transaction?.id;
      const giftLeg = (res.legs || []).find(l => l.table === 'credit_cards' && String(l.id) === String(card.id));
      const newBalance = giftLeg ? giftLeg.after : currentBalance + amountAdded;
      if (onUpdateCash) await onUpdateCash(null, { syncOnly: true });

      const activityDesc = amountPaid !== amountAdded
        ? `Added ${formatCurrency(amountAdded)} to gift card '${card.name}' (paid ${formatCurrency(amountPaid)}) - Balance ${formatCurrency(currentBalance)} → ${formatCurrency(newBalance)}`
        : `Added ${formatCurrency(amountAdded)} to gift card '${card.name}' - Balance ${formatCurrency(currentBalance)} → ${formatCurrency(newBalance)}`;

      await logActivity(
        'gift_card_reload',
        'card',
        card.id,
        card.name,
        activityDesc,
        {
          card: { ...card, id: card.id, name: card.name },
          amountAdded,
          amountPaid,
          previousBalance: currentBalance,
          newBalance,
          source: sourceType,
          sourceId,
          transactionId,
          date: opForm.date,
          category: opForm.category
        }
      );

      await onUpdate();
      setActiveGiftCardOp(null);
      showToast.success(text.notes);
    } catch (error) {
      console.error('Error adding balance:', error);
      showToast.error(`Failed to add balance: ${error.message}`);
    } finally {
      setGiftCardOpProcessing(false);
    }
  };

  const handleUseBalance = async (opForm) => {
    setGiftCardOpProcessing(true);

    try {
      const card = activeGiftCardOp;
      const amount = parseFloat(opForm.amount);
      const currentBalance = parseFloat(card.balance) || 0;
      const category = categories.find(c => c.id === opForm.category);
      const description = opForm.notes || (category?.name !== 'Gift Card Purchase' ? category?.name || 'Purchase' : 'Purchase');

      // The server keeps a gift card from going below zero and refuses the spend if it would.
      const res = await recordExpense({
        amount,
        source: `credit_card:${card.id}`,
        date: opForm.date,
        description,
        notes: opForm.notes,
        category_id: opForm.category,
        category_name: category?.name || null
      }, { bankAccounts, creditCards });
      const transactionId = res.transaction?.id;
      const giftLeg = (res.legs || []).find(l => l.table === 'credit_cards');
      const newBalance = giftLeg ? giftLeg.after : currentBalance - amount;

      await logActivity(
        'expense',
        'card',
        card.id,
        card.name,
        `Expense '${description}' for ${formatCurrency(amount)} using '${card.name}' - Balance ${formatCurrency(currentBalance)} → ${formatCurrency(newBalance)}`,
        {
          amount,
          category: category?.name,
          description,
          cardId: card.id,
          previousBalance: currentBalance,
          paymentMethodName: card.name,
          isGiftCard: card.is_gift_card,
          transactionId
        }
      );

      await onUpdate();
      setActiveGiftCardOp(null);
      showToast.success(`Used ${formatCurrency(amount)} from ${card.name}`);
    } catch (error) {
      console.error('Error using balance:', error);
      showToast.error(`Failed to record usage: ${error.message}`);
    } finally {
      setGiftCardOpProcessing(false);
    }
  };

  const handleDelete = async (id) => {
    const card = creditCards.find(c => c.id === id);
    if (!card) return;

    const cardType = card.is_gift_card ? 'gift card' : 'credit card';

    if (!window.confirm(`Delete this ${cardType}?`)) {
      return;
    }

    const result = await executeAction(`delete-card-${id}`, async () => {
      let purchaseTransaction = null;
      if (card.is_gift_card) {
        try {
          const allTransactions = await dbOperation('transactions', 'getAll');
          purchaseTransaction = allTransactions.find(t =>
            t.description === `Gift Card Purchase: ${card.name}` &&
            t.type === 'expense' &&
            t.status === 'active'
          );

          if (purchaseTransaction) {
            // Put back exactly what the purchase moved, on the accounts it moved.
            await reverseTransaction(purchaseTransaction.id);
            if (onUpdateCash) await onUpdateCash(null, { syncOnly: true });
          }
        } catch (error) {
          console.error('Error refunding gift card purchase:', error);
        }
      }

      await logActivity('delete', 'card', id, card.name, describeDeletedCard(card, cardType), card);
      await dbOperation('creditCards', 'delete', id, { skipActivityLog: true });
      await onUpdate();

      return {
        cardName: card.name,
        refunded: purchaseTransaction ? Number(purchaseTransaction.amount) || 0 : 0,
        refundMethod: purchaseTransaction?.payment_method_name || null
      };
    });

    if (result.success) {
      if (result.data.refunded > 0) {
        showToast.success(
          `${result.data.cardName} deleted and ${formatCurrency(result.data.refunded)} refunded to ${result.data.refundMethod}`
        );
      } else {
        showToast.success(`${result.data.cardName} deleted successfully`);
      }
    } else {
      showToast.error(`Failed to delete card: ${result.error.message}`);
    }
  };

  return {
    showAddForm,
    setShowAddForm,
    editingItem,
    setEditingItem,
    formData,
    setFormData,
    processingResults,
    isProcessing,
    pinnedCards,
    recentCardNames,
    recentGiftCards,
    giftCardNameInputRef,
    activeGiftCardOp,
    setActiveGiftCardOp,
    giftCardOpProcessing,
    isActionProcessing,
    handleSelectCardName,
    handleSelectGiftCard,
    handleTogglePin,
    handlePaymentSourceChange,
    resetForm,
    handleEdit,
    handleAdd,
    handleProcessDueCardPayments,
    handleAddBalance,
    handleUseBalance,
    handleDelete
  };
}
