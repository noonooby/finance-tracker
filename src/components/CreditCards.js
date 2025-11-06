import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, Edit2, X, CreditCard as CreditCardIcon, ShoppingBag, ListFilter, Star, Gift } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, generateId, calculateTotalBankBalance } from '../utils/helpers';
import { dbOperation, getBankAccount, updateBankAccountBalance } from '../utils/db';
import AddTransaction from './AddTransaction';
import { logActivity } from '../utils/activityLogger';
import { upsertKnownEntity } from '../utils/knownEntities';
import { processOverdueCreditCards } from '../utils/autoPay';
import RecentTransactions from './shared/RecentTransactions';
import useAsyncAction from '../hooks/useAsyncAction';
import ActionButton from './shared/ActionButton';
import { showToast } from '../utils/toast';
import {
  getUserPreferences,
  togglePinnedCreditCard
} from '../utils/userPreferencesManager';
import {
  getRecentGiftCardNames,
  getLastUsedGiftCardContext,
  applyGiftCardPurchaseContext
} from '../utils/formContexts';
import { GiftCardForm, GiftCardOperations, useGiftCardPurchase } from './credit-cards';

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
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentCard, setPaymentCard] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    balance: '',
    creditLimit: '',
    dueDate: new Date().toISOString().split('T')[0],
    statementDay: '',
    interestRate: '',
    alertDays: alertSettings.defaultDays || 7,
    isGiftCard: false,
    purchaseDate: new Date().toISOString().split('T')[0],
    purchaseAmount: '',
    purchaseAmountPaid: '',
    giftCardPaymentMethod: 'cash_in_hand',
    giftCardPaymentMethodId: null,
    hasExpiry: false,
    expiryDate: '',
    connectedPaymentSource: null,
    connectedPaymentSourceId: null
  });
  const cardRefs = useRef({});
  const [processingResults, setProcessingResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pinnedCards, setPinnedCards] = useState([]);
  const [recentCardNames, setRecentCardNames] = useState([]);
  const [recentGiftCards, setRecentGiftCards] = useState([]);
  const cardNameInputRef = useRef(null);
  const giftCardNameInputRef = useRef(null);
  const [activeGiftCardOp, setActiveGiftCardOp] = useState(null);
  const [giftCardOpProcessing, setGiftCardOpProcessing] = useState(false);
  
  // Sort cards with pinned first
  const sortedCards = [...creditCards].sort((a, b) => {
    const aIsPinned = pinnedCards.includes(a.id);
    const bIsPinned = pinnedCards.includes(b.id);
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    return 0;
  });
  
  const { executeAction, isProcessing: isActionProcessing } = useAsyncAction();
  
  const { createGiftCardPurchaseTransaction } = useGiftCardPurchase({
    creditCards,
    bankAccounts,
    cashInHand,
    onUpdateCashInHand,
    onUpdateCash
  });
  
  useEffect(() => {
    loadPinnedCards();
    loadRecentCardNames();
    loadRecentGiftCards();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  const loadRecentCardNames = async () => {
    try {
      const { fetchSuggestions } = await import('../utils/knownEntities');
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
            giftCardPaymentMethod: contextData.paymentSource || 'cash_in_hand',
            giftCardPaymentMethodId: contextData.paymentSourceId || null
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
  
  const handleSelectCardName = useCallback((cardEntity) => {
    setFormData(prev => ({ ...prev, name: cardEntity.name }));
    setTimeout(() => {
      const balanceInput = document.querySelector('input[placeholder="Current Balance *"]');
      if (balanceInput) balanceInput.focus();
    }, 50);
  }, []);
  
  const handleSelectGiftCard = useCallback(async (giftCardContext) => {
    try {
      const contextData = applyGiftCardPurchaseContext(giftCardContext);
      setFormData(prev => ({
        ...prev,
        name: giftCardContext.card_name,
        purchaseAmount: contextData.originalValue || '',
        purchaseAmountPaid: contextData.purchaseAmount || contextData.originalValue || '',
        giftCardPaymentMethod: contextData.paymentSource || 'cash_in_hand',
        giftCardPaymentMethodId: contextData.paymentSourceId || null
      }));
      setTimeout(() => {
        const balanceInput = document.querySelector('input[placeholder="Current Balance *"]');
        if (balanceInput) balanceInput.focus();
      }, 50);
    } catch (error) {
      console.error('Error applying gift card context:', error);
    }
  }, []);
  
  const loadPinnedCards = async () => {
    try {
      const prefs = await getUserPreferences();
      setPinnedCards(prefs.pinned_credit_cards || []);
    } catch (error) {
      console.error('Error loading pinned cards:', error);
    }
  };
  
  const handleTogglePin = async (cardId) => {
    try {
      await togglePinnedCreditCard(cardId);
      await loadPinnedCards();
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };

  const handleMakePayment = (card) => {
    setPaymentCard(card);
    setShowPayment(true);
  };

  const handleAddExpense = (card) => {
    setSelectedCard(card);
    setShowAddExpense(true);
  };
  
  const normalizeId = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') {
      if (value.id !== undefined) return String(value.id);
      if (value.value !== undefined) return String(value.value);
      return null;
    }
    return String(value);
  };

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
  
  // Get available payment sources for auto-payment connection
  const getAvailablePaymentSources = () => {
    const sources = [
      { value: '', label: 'None (Manual Payment)' }
    ];

    if (bankAccounts && bankAccounts.length > 0) {
      bankAccounts.forEach(account => {
        sources.push({
          value: `bank_account:${account.id}`,
          label: `Bank Account: ${account.name}${account.is_primary ? ' (Primary)' : ''}`
        });
      });
    }

    sources.push({
      value: 'cash_in_hand',
      label: 'Cash in Hand'
    });

    return sources;
  };

  const handlePaymentSourceChange = (value) => {
    if (!value) {
      setFormData(prev => ({
        ...prev,
        connectedPaymentSource: null,
        connectedPaymentSourceId: null
      }));
    } else {
      const [sourceType, sourceId] = value.includes(':') ? value.split(':') : [value, null];
      setFormData(prev => ({
        ...prev,
        connectedPaymentSource: sourceType,
        connectedPaymentSourceId: sourceId
      }));
    }
  };

  const getCurrentPaymentSourceValue = () => {
    if (!formData.connectedPaymentSource) return '';
    if (formData.connectedPaymentSource === 'cash_in_hand') return 'cash_in_hand';
    return `${formData.connectedPaymentSource}:${formData.connectedPaymentSourceId}`;
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.balance) {
      showToast.error('Please fill in required fields: Name and Balance');
      return;
    }

    if (!formData.isGiftCard && !formData.dueDate) {
      showToast.error('Credit cards require a Due Date');
      return;
    }

    if (formData.isGiftCard && !formData.purchaseAmount) {
      showToast.error('Gift cards require an Original Value');
      return;
    }
    
    if (formData.isGiftCard && !formData.purchaseAmountPaid) {
      showToast.error('Gift cards require a Purchase Amount Paid');
      return;
    }

    if (formData.isGiftCard && formData.hasExpiry && !formData.expiryDate) {
      showToast.error('Please specify the expiry date or uncheck "has expiry"');
      return;
    }
    
    const actionId = editingItem ? `edit-card-${editingItem.id}` : 'add-card';
    
    const result = await executeAction(actionId, async () => {

    const newCard = {
      id: editingItem?.id || generateId(),
      name: formData.name,
      balance: parseFloat(formData.balance) || 0,
      credit_limit: formData.isGiftCard ? 0 : (parseFloat(formData.creditLimit) || 0),
      due_date: formData.isGiftCard ? null : (formData.dueDate || null),
      statement_day: formData.isGiftCard ? 0 : (parseInt(formData.statementDay) || 0),
      interest_rate: formData.isGiftCard ? 0 : (parseFloat(formData.interestRate) || 0),
      alert_days: formData.isGiftCard ? 0 : (parseInt(formData.alertDays) || alertSettings.defaultDays),
      is_gift_card: formData.isGiftCard || false,
      purchase_date: formData.isGiftCard ? (formData.purchaseDate || null) : null,
      purchase_amount: formData.isGiftCard ? (parseFloat(formData.purchaseAmount) || 0) : 0,
      purchase_amount_paid: formData.isGiftCard ? (parseFloat(formData.purchaseAmountPaid) || 0) : 0,
      has_expiry: formData.isGiftCard ? (formData.hasExpiry || false) : false,
      expiry_date: formData.isGiftCard && formData.hasExpiry ? (formData.expiryDate || null) : null,
      connected_payment_source: formData.isGiftCard ? null : (formData.connectedPaymentSource || null),
      connected_payment_source_id: formData.isGiftCard ? null : (formData.connectedPaymentSourceId || null),
      created_at: editingItem?.created_at || new Date().toISOString()
    };
    
    const savedCard = await dbOperation('creditCards', 'put', newCard, { skipActivityLog: true });
    const cardId = savedCard?.id || newCard.id;
    if (!editingItem) {
      if (!formData.isGiftCard) {
        await logActivity(
          'add',
          'card',
          cardId,
          savedCard?.name || newCard.name,
          `Added credit card '${savedCard?.name || newCard.name}' - Balance ${formatCurrency(savedCard.balance)} • Limit ${formatCurrency(savedCard.credit_limit)} • Rate ${savedCard.interest_rate || 0}% • Due ${savedCard.due_date ? formatDate(savedCard.due_date) : 'N/A'}`,
          savedCard
        );
      }
    } else {
      const oldName = editingItem.name || '';
      const newName = savedCard?.name || newCard.name || '';
      const oldBalance = parseFloat(editingItem.balance) || 0;
      const newBalance = parseFloat(savedCard.balance) || 0;
      const oldLimit = parseFloat(editingItem.credit_limit) || 0;
      const newLimit = parseFloat(savedCard.credit_limit) || 0;
      const oldDueDate = editingItem.due_date || '';
      const newDueDate = savedCard.due_date || newCard.due_date || '';
      const oldStatementDay = parseInt(editingItem.statement_day) || 0;
      const newStatementDay = parseInt(savedCard.statement_day) || parseInt(newCard.statement_day) || 0;
      const oldInterestRate = parseFloat(editingItem.interest_rate) || 0;
      const newInterestRate = parseFloat(savedCard.interest_rate) || parseFloat(newCard.interest_rate) || 0;
      const oldAlertDays = parseInt(editingItem.alert_days) || 7;
      const newAlertDays = parseInt(savedCard.alert_days) || parseInt(newCard.alert_days) || 7;
      const oldExpiryDate = editingItem.expiry_date || '';
      const newExpiryDate = savedCard.expiry_date || newCard.expiry_date || '';
      const oldHasExpiry = editingItem.has_expiry || false;
      const newHasExpiry = savedCard.has_expiry || newCard.has_expiry || false;

      let details = '';
      if (oldName !== newName) details += `Name "${oldName}" → "${newName}" • `;
      if (oldBalance !== newBalance) details += `Balance ${formatCurrency(oldBalance)} → ${formatCurrency(newBalance)} • `;
      if (!formData.isGiftCard && oldLimit !== newLimit) details += `Limit ${formatCurrency(oldLimit)} → ${formatCurrency(newLimit)} • `;
      if (!formData.isGiftCard && oldDueDate !== newDueDate) details += `Due date ${oldDueDate ? formatDate(oldDueDate) : 'None'} → ${newDueDate ? formatDate(newDueDate) : 'None'} • `;
      if (!formData.isGiftCard && oldStatementDay !== newStatementDay) details += `Statement day ${oldStatementDay || 'None'} → ${newStatementDay || 'None'} • `;
      if (!formData.isGiftCard && oldInterestRate !== newInterestRate) details += `Interest rate ${oldInterestRate}% → ${newInterestRate}% • `;
      if (!formData.isGiftCard && oldAlertDays !== newAlertDays) details += `Alert days ${oldAlertDays} → ${newAlertDays} • `;
      if (formData.isGiftCard && (oldHasExpiry !== newHasExpiry || (newHasExpiry && oldExpiryDate !== newExpiryDate))) {
        if (!oldHasExpiry && newHasExpiry) {
          details += `Added expiry date ${formatDate(newExpiryDate)} • `;
        } else if (oldHasExpiry && !newHasExpiry) {
          details += `Removed expiry date • `;
        } else if (oldExpiryDate !== newExpiryDate) {
          details += `Expiry date ${formatDate(oldExpiryDate)} → ${formatDate(newExpiryDate)} • `;
        }
      }
      
      details = details.replace(/ • $/, '');

      const cardType = formData.isGiftCard ? 'gift card' : 'credit card';
      const description = details
        ? `Updated ${cardType} '${savedCard?.name || newCard.name}' - ${details}`
        : `Updated ${cardType} '${savedCard?.name || newCard.name}'`;

      await logActivity(
        'edit',
        'card',
        cardId,
        savedCard?.name || newCard.name,
        description,
        {
          previous: { ...editingItem, id: editingItem?.id || cardId, name: editingItem?.name || newCard.name },
          updated: { ...savedCard, id: savedCard?.id || cardId, name: savedCard?.name || newCard.name }
        }
      );
    }

    if (formData.isGiftCard && !editingItem) {
      const result = await createGiftCardPurchaseTransaction(savedCard, formData);
      if (!result) {
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
      const results = await processOverdueCreditCards(
        creditCards,
        [],
        availableCash,
        onUpdateCash,
        bankAccounts,
        cashInHand,
        onUpdateCashInHand
      );
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

  const resetForm = () => {
    setFormData({ 
      name: '', 
      balance: '', 
      creditLimit: '', 
      dueDate: new Date().toISOString().split('T')[0], 
      statementDay: '', 
      interestRate: '', 
      alertDays: alertSettings.defaultDays || 7,
      isGiftCard: false,
      purchaseDate: new Date().toISOString().split('T')[0],
      purchaseAmount: '',
      purchaseAmountPaid: '',
      giftCardPaymentMethod: 'cash_in_hand',
      giftCardPaymentMethodId: null,
      hasExpiry: false,
      expiryDate: '',
      connectedPaymentSource: null,
      connectedPaymentSourceId: null
    });
    setShowAddForm(false);
    setEditingItem(null);
    loadRecentCardNames().catch(console.error);
    loadRecentGiftCards().catch(console.error);
  };

  const handleEdit = async (card) => {
    setFormData({
      name: card.name,
      balance: (parseFloat(card.balance) || 0).toFixed(2),
      creditLimit: card.credit_limit ? (parseFloat(card.credit_limit)).toFixed(2) : '',
      dueDate: card.due_date || '',
      statementDay: card.statement_day?.toString() || '',
      interestRate: card.interest_rate ? (parseFloat(card.interest_rate)).toFixed(2) : '',
      alertDays: card.alert_days?.toString() || (alertSettings.defaultDays || 7).toString(),
      isGiftCard: card.is_gift_card || false,
      purchaseDate: card.purchase_date || new Date().toISOString().split('T')[0],
      purchaseAmount: card.purchase_amount ? (parseFloat(card.purchase_amount)).toFixed(2) : '',
      purchaseAmountPaid: card.purchase_amount_paid ? (parseFloat(card.purchase_amount_paid)).toFixed(2) : card.purchase_amount ? (parseFloat(card.purchase_amount)).toFixed(2) : '',
      giftCardPaymentMethod: 'cash_in_hand',
      giftCardPaymentMethodId: null,
      hasExpiry: card.has_expiry || false,
      expiryDate: card.expiry_date || '',
      connectedPaymentSource: card.connected_payment_source || null,
      connectedPaymentSourceId: card.connected_payment_source_id || null
    });
    setEditingItem(card);
    setShowAddForm(true);
  };

  const handleAddBalance = async (formData) => {
    setGiftCardOpProcessing(true);
    
    try {
      const card = activeGiftCardOp;
      const amountAdded = parseFloat(formData.amount);
      const amountPaid = formData.amountPaid ? parseFloat(formData.amountPaid) : amountAdded;
      const currentBalance = parseFloat(card.balance) || 0;
      const newBalance = currentBalance + amountAdded;
      
      const sourceType = formData.paymentMethod;
      const sourceId = formData.paymentMethodId;
      
      if (sourceType === 'bank_account') {
        const account = bankAccounts.find(a => a.id === sourceId);
        if (!account) {
          showToast.error('Selected bank account not found');
          setGiftCardOpProcessing(false);
          return;
        }
        const accountBalance = parseFloat(account.balance) || 0;
        if (amountPaid > accountBalance) {
          showToast.error(`Insufficient funds in ${account.name}. Available: ${formatCurrency(accountBalance)}`);
          setGiftCardOpProcessing(false);
          return;
        }
      } else if (sourceType === 'cash_in_hand') {
        const currentCash = cashInHand || 0;
        if (amountPaid > currentCash) {
          showToast.error(`Insufficient cash in hand. Available: ${formatCurrency(currentCash)}`);
          setGiftCardOpProcessing(false);
          return;
        }
      }
      
      await dbOperation('creditCards', 'put', {
        ...card,
        balance: newBalance
      }, { skipActivityLog: true });
      
      if (sourceType === 'credit_card') {
        const paymentCard = creditCards.find(c => c.id === sourceId);
        if (paymentCard) {
          await dbOperation('creditCards', 'put', {
            ...paymentCard,
            balance: (parseFloat(paymentCard.balance) || 0) + amountPaid
          }, { skipActivityLog: true });
        }
      } else if (sourceType === 'bank_account') {
        const account = bankAccounts.find(a => a.id === sourceId);
        if (account) {
          const currentAccountBalance = parseFloat(account.balance) || 0;
          const newAccountBalance = currentAccountBalance - amountPaid;
          await updateBankAccountBalance(sourceId, newAccountBalance);
          
          const updatedBankTotal = calculateTotalBankBalance(
            bankAccounts.map(acc => 
              acc.id === sourceId ? { ...acc, balance: newAccountBalance } : acc
            )
          );
          await onUpdateCash(updatedBankTotal);
        }
      } else if (sourceType === 'cash_in_hand') {
        await onUpdateCashInHand((cashInHand || 0) - amountPaid);
      }
      
      const transaction = {
        type: 'expense',
        amount: amountPaid,
        date: formData.date,
        description: amountPaid !== amountAdded 
          ? `Gift Card Reload: ${card.name} (${formatCurrency(amountPaid)} paid, ${formatCurrency(amountAdded)} loaded)`
          : `Gift Card Reload: ${card.name}`,
        notes: formData.notes || (amountPaid !== amountAdded
          ? `Added ${formatCurrency(amountAdded)} to ${card.name} (paid ${formatCurrency(amountPaid)})`
          : `Added ${formatCurrency(amountAdded)} to ${card.name}`),
        category_id: formData.category,
        payment_method: sourceType,
        payment_method_id: sourceId,
        card_id: card.id,
        status: 'active',
        undone_at: null
      };
      
      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });
      
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
          transactionId: savedTransaction?.id,
          date: formData.date,
          category: formData.category
        }
      );
      
      await onUpdate();
      setActiveGiftCardOp(null);
      
      const successMsg = amountPaid !== amountAdded
        ? `Added ${formatCurrency(amountAdded)} to ${card.name} (paid ${formatCurrency(amountPaid)})`
        : `Added ${formatCurrency(amountAdded)} to ${card.name}`;
      showToast.success(successMsg);
      
    } catch (error) {
      console.error('Error adding balance:', error);
      showToast.error(`Failed to add balance: ${error.message}`);
    } finally {
      setGiftCardOpProcessing(false);
    }
  };

  const handleUseBalance = async (formData) => {
    setGiftCardOpProcessing(true);
    
    try {
      const card = activeGiftCardOp;
      const amount = parseFloat(formData.amount);
      const currentBalance = parseFloat(card.balance) || 0;
      
      if (amount > currentBalance) {
        showToast.error(`Insufficient balance. Available: ${formatCurrency(currentBalance)}`);
        setGiftCardOpProcessing(false);
        return;
      }
      
      const newBalance = Math.max(0, currentBalance - amount);
      
      await dbOperation('creditCards', 'put', {
        ...card,
        balance: newBalance
      }, { skipActivityLog: true });
      
      const category = categories.find(c => c.id === formData.category);
      
      const transaction = {
        type: 'expense',
        amount,
        date: formData.date,
        description: formData.notes || (category?.name !== 'Gift Card Purchase' ? category?.name || 'Purchase' : 'Purchase'),
        notes: formData.notes,
        category_id: formData.category,
        category_name: category?.name || null,
        payment_method: 'credit_card',
        payment_method_id: card.id,
        payment_method_name: card.name,
        card_id: card.id,
        status: 'active',
        undone_at: null
      };
      
      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });
      
      await logActivity(
        'expense',
        'card',
        card.id,
        card.name,
        `Expense '${transaction.description}' for ${formatCurrency(amount)} using '${card.name}' - Balance ${formatCurrency(currentBalance)} → ${formatCurrency(newBalance)}`,
        {
          amount,
          category: category?.name,
          description: transaction.description,
          cardId: card.id,
          previousBalance: currentBalance,
          paymentMethodName: card.name,
          isGiftCard: card.is_gift_card,
          transactionId: savedTransaction?.id
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
            const amount = Number(purchaseTransaction.amount) || 0;
            const paymentMethod = purchaseTransaction.payment_method;
            const paymentMethodId = purchaseTransaction.payment_method_id;
            
            if (paymentMethod === 'cash_in_hand') {
              const { getCashInHand, updateCashInHand } = await import('../utils/db');
              const currentCash = await getCashInHand();
              await updateCashInHand(currentCash + amount);
              
            } else if (paymentMethod === 'bank_account' && paymentMethodId) {
              const { getBankAccount, updateBankAccountBalance } = await import('../utils/db');
              const bankAccount = await getBankAccount(paymentMethodId);
              if (bankAccount) {
                const currentBalance = Number(bankAccount.balance) || 0;
                await updateBankAccountBalance(paymentMethodId, currentBalance + amount);
                await onUpdateCash(null, { syncOnly: true });
              }
              
            } else if (paymentMethod === 'credit_card' && paymentMethodId) {
              const paymentCard = await dbOperation('creditCards', 'get', paymentMethodId);
              if (paymentCard) {
                const currentBalance = Number(paymentCard.balance) || 0;
                const newBalance = paymentCard.is_gift_card
                  ? currentBalance + amount
                  : Math.max(0, currentBalance - amount);
                  
                await dbOperation('creditCards', 'put', {
                  ...paymentCard,
                  balance: newBalance
                }, { skipActivityLog: true });
              }
            }
            
            await dbOperation('transactions', 'put', {
              ...purchaseTransaction,
              status: 'undone',
              undone_at: new Date().toISOString()
            }, { skipActivityLog: true });
          }
        } catch (error) {
          console.error('⚠️ Error refunding gift card purchase:', error);
        }
      }
      
      await logActivity(
        'delete',
        'card',
        id,
        card.name,
        `Deleted ${cardType} '${card.name}' - Balance ${formatCurrency(card.balance)}${!card.is_gift_card ? ` • Limit ${formatCurrency(card.credit_limit)} • Rate ${card.interest_rate || 0}% • Due ${card.due_date ? formatDate(card.due_date) : 'N/A'}` : ''}`,
        card
      );
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

      {activeGiftCardOp && (
        <GiftCardOperations
          darkMode={darkMode}
          giftCard={activeGiftCardOp}
          creditCards={creditCards}
          bankAccounts={bankAccounts}
          categories={categories}
          onAddBalance={handleAddBalance}
          onUseBalance={handleUseBalance}
          onClose={() => setActiveGiftCardOp(null)}
          processing={giftCardOpProcessing}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-4">
        <h2 className="text-xl md:text-2xl font-bold">Credit Cards</h2>
        <div className="flex gap-2">
          <button
            onClick={handleProcessDueCardPayments}
            disabled={isProcessing}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base ${
              isProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            } text-white`}
            title="Process all overdue credit cards from connected payment sources"
          >
            {isProcessing ? 'Processing...' : 'Process Due Payments'}
          </button>
          <button
            onClick={() => {
              if (showAddForm) {
                resetForm();
              } else {
                setShowAddForm(true);
              }
            }}
            className="flex items-center gap-1 sm:gap-2 bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base"
          >
            <Plus size={20} />
            {showAddForm ? 'Cancel' : 'Add Card'}
          </button>
        </div>
      </div>
      
      {processingResults && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'} border rounded-lg p-3 text-sm`}>
          <div className={darkMode ? 'text-gray-200' : 'text-blue-800'}>
            Processed: {processingResults.processed.length} • Failed: {processingResults.failed.length} • Skipped: {processingResults.skipped.length}
          </div>
        </div>
      )}

      {/* Add Form - Only for new cards */}
      {showAddForm && !editingItem && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          
          {recentCardNames.length > 0 && !editingItem && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Recent Cards
              </label>
              <div className="flex gap-2 flex-wrap">
                {recentCardNames.map(cardEntity => (
                  <button
                    key={cardEntity.id}
                    type="button"
                    onClick={() => handleSelectCardName(cardEntity)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      formData.name === cardEntity.name
                        ? 'bg-blue-600 text-white'
                        : darkMode 
                          ? 'bg-blue-900 text-blue-200 hover:bg-blue-800 border border-blue-700'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'
                    }`}
                  >
                    {cardEntity.name}
                    {cardEntity.usage_count > 10 && ' ⭐'}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {recentCardNames.length > 0 ? 'Or type new card name *' : 'Card Name *'}
            </label>
            <input
              ref={cardNameInputRef}
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Rogers Mastercard"
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              required
              autoFocus={!editingItem && recentCardNames.length === 0}
            />
          </div>
          
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Card Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isGiftCard: false })}
                className={`flex-1 px-3 py-2 rounded-lg border-2 transition-colors font-medium flex items-center justify-center gap-2 ${
                  !formData.isGiftCard
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : darkMode ? 'border-gray-600 hover:border-gray-500 text-gray-300' : 'border-gray-300 hover:border-gray-400 text-gray-700'
                }`}
              >
                <CreditCardIcon size={18} />
                Credit Card
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isGiftCard: true })}
                className={`flex-1 px-3 py-2 rounded-lg border-2 transition-colors font-medium flex items-center justify-center gap-2 ${
                  formData.isGiftCard
                    ? 'border-green-600 bg-green-600 text-white'
                    : darkMode ? 'border-gray-600 hover:border-gray-500 text-gray-300' : 'border-gray-300 hover:border-gray-400 text-gray-700'
                }`}
              >
                <Gift size={18} />
                Gift Card
              </button>
            </div>
          </div>
          
          <input
            type="number"
            step="0.01"
            placeholder="Current Balance *"
            value={formData.balance}
            onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          
          {!formData.isGiftCard && (
            <>
              <input
                type="number"
                step="0.01"
                placeholder="Credit Limit (optional)"
                value={formData.creditLimit}
                onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
              />
              <div>
                <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Payment Due Date *</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                />
              </div>
              <div>
                <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Statement Day (optional, e.g., 15 for 15th of month)</label>
                <input
                  type="number"
                  placeholder="e.g., 15"
                  value={formData.statementDay}
                  onChange={(e) => setFormData({ ...formData, statementDay: e.target.value })}
                  className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                />
              </div>
              <input
                type="number"
                step="0.01"
                placeholder="Interest Rate % (optional)"
                value={formData.interestRate}
                onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
              />
              <div>
                <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Alert Me (days before due)</label>
                <input
                  type="number"
                  value={formData.alertDays}
                  onChange={(e) => setFormData({ ...formData, alertDays: e.target.value })}
                  className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                />
              </div>
              
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-blue-50'}`}>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Auto-Payment Source (Optional)
                </label>
                <select
                  value={getCurrentPaymentSourceValue()}
                  onChange={(e) => handlePaymentSourceChange(e.target.value)}
                  className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} rounded-lg`}
                >
                  {getAvailablePaymentSources().map(source => (
                    <option key={source.value} value={source.value}>
                      {source.label}
                    </option>
                  ))}
                </select>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  This source will be used when processing overdue payments automatically
                </p>
              </div>
            </>
          )}
          
          {formData.isGiftCard && (
            <GiftCardForm
              darkMode={darkMode}
              formData={formData}
              onFormDataChange={setFormData}
              bankAccounts={bankAccounts}
              creditCards={creditCards}
              recentGiftCards={recentGiftCards}
              onSelectGiftCard={handleSelectGiftCard}
              giftCardNameInputRef={giftCardNameInputRef}
              editingItem={editingItem}
            />
          )}
          
          <div className="flex gap-2">
            <ActionButton
              onClick={handleAdd}
              processing={isActionProcessing(editingItem ? `edit-card-${editingItem.id}` : 'add-card')}
              variant="primary"
              processingText={editingItem ? 'Updating Card...' : 'Adding Card...'}
              idleText={editingItem ? 'Update Card' : 'Add Card'}
              fullWidth
            />
            <ActionButton
              onClick={resetForm}
              variant="secondary"
              idleText="Cancel"
              fullWidth
            />
          </div>
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
            
            return (
            <div
              key={String(normalizeId(card.id))}
              ref={(el) => {
                const key = String(normalizeId(card.id));
                if (el) {
                  cardRefs.current[key] = el;
                }
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
                /* EDIT MODE - Inline Form */
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg mb-3">Edit {card.is_gift_card ? 'Gift Card' : 'Credit Card'}</h3>
                  
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Card Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Rogers Mastercard"
                      className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                      autoFocus
                    />
                  </div>
                  
                  <div>
                    <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      Card Type
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, isGiftCard: false })}
                        className={`flex-1 px-3 py-2 rounded-lg border-2 transition-colors font-medium flex items-center justify-center gap-2 ${
                          !formData.isGiftCard
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : darkMode ? 'border-gray-600 hover:border-gray-500 text-gray-300' : 'border-gray-300 hover:border-gray-400 text-gray-700'
                        }`}
                      >
                        <CreditCardIcon size={18} />
                        Credit Card
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, isGiftCard: true })}
                        className={`flex-1 px-3 py-2 rounded-lg border-2 transition-colors font-medium flex items-center justify-center gap-2 ${
                          formData.isGiftCard
                            ? 'border-green-600 bg-green-600 text-white'
                            : darkMode ? 'border-gray-600 hover:border-gray-500 text-gray-300' : 'border-gray-300 hover:border-gray-400 text-gray-700'
                        }`}
                      >
                        <Gift size={18} />
                        Gift Card
                      </button>
                    </div>
                  </div>
                  
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Current Balance *"
                    value={formData.balance}
                    onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                    className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                  />
                  
                  {!formData.isGiftCard ? (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Credit Limit (optional)"
                        value={formData.creditLimit}
                        onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                        className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                      />
                      <div>
                        <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Payment Due Date *</label>
                        <input
                          type="date"
                          value={formData.dueDate}
                          onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                        />
                      </div>
                      <div>
                        <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Statement Day (optional)</label>
                        <input
                          type="number"
                          placeholder="e.g., 15"
                          value={formData.statementDay}
                          onChange={(e) => setFormData({ ...formData, statementDay: e.target.value })}
                          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                        />
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Interest Rate % (optional)"
                        value={formData.interestRate}
                        onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                        className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                      />
                      <div>
                        <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Alert Days</label>
                        <input
                          type="number"
                          value={formData.alertDays}
                          onChange={(e) => setFormData({ ...formData, alertDays: e.target.value })}
                          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                        />
                      </div>
                      
                      <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-blue-50'}`}>
                        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Auto-Payment Source (Optional)
                        </label>
                        <select
                          value={getCurrentPaymentSourceValue()}
                          onChange={(e) => handlePaymentSourceChange(e.target.value)}
                          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} rounded-lg`}
                        >
                          {getAvailablePaymentSources().map(source => (
                            <option key={source.value} value={source.value}>
                              {source.label}
                            </option>
                          ))}
                        </select>
                        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Auto-process overdue payments from this source
                        </p>
                      </div>
                    </>
                  ) : (
                    <GiftCardForm
                      darkMode={darkMode}
                      formData={formData}
                      onFormDataChange={setFormData}
                      bankAccounts={bankAccounts}
                      creditCards={creditCards}
                      recentGiftCards={recentGiftCards}
                      onSelectGiftCard={handleSelectGiftCard}
                      giftCardNameInputRef={giftCardNameInputRef}
                      editingItem={editingItem}
                    />
                  )}
                  
                  <div className="flex gap-2 pt-2">
                    <ActionButton
                      onClick={handleAdd}
                      processing={isActionProcessing(`edit-card-${card.id}`)}
                      variant="primary"
                      processingText="Updating..."
                      idleText="Update Card"
                      fullWidth
                    />
                    <ActionButton
                      onClick={() => {
                        setEditingItem(null);
                        resetForm();
                      }}
                      variant="secondary"
                      idleText="Cancel"
                      fullWidth
                    />
                  </div>
                </div>
              ) : (
                /* DISPLAY MODE - Card Info */
                <>
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base sm:text-lg">{card.name}</h3>
                    {pinnedCards.includes(card.id) && (
                      <Star size={16} className="text-yellow-500 fill-current" title="Pinned" />
                    )}
                    {card.is_gift_card && (
                      <span className={`text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1 ${
                        darkMode ? 'bg-green-900/30 text-green-300 border border-green-700' : 'bg-green-100 text-green-700 border border-green-300'
                      }`}>
                        <Gift size={12} />
                        Gift Card
                      </span>
                    )}
                    {!card.is_gift_card && card.connected_payment_source && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        darkMode ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-700'
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
                        ? darkMode ? 'text-gray-300' : 'text-gray-600'
                        : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(card.balance)}
                  </div>
                  {card.is_gift_card ? (
                    <>
                      {card.purchase_amount > 0 && (
                        <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                          Original: {formatCurrency(card.purchase_amount)} • {((card.balance / card.purchase_amount) * 100).toFixed(0)}% remaining
                        </div>
                      )}
                      {card.purchase_date && card.purchase_amount_paid > 0 && (
                        <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                          Bought on: {formatDate(card.purchase_date)} for {formatCurrency(card.purchase_amount_paid)}
                        </div>
                      )}
                      {card.has_expiry && card.expiry_date && (
                        <div className={`text-xs mt-1 font-medium ${
                          getDaysUntil(card.expiry_date) < 0 
                            ? 'text-red-600' 
                            : getDaysUntil(card.expiry_date) < 30
                            ? 'text-orange-600'
                            : darkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          {getDaysUntil(card.expiry_date) < 0 
                            ? '⚠️ EXPIRED' 
                            : getDaysUntil(card.expiry_date) < 30
                            ? `⚠️ Expires in ${getDaysUntil(card.expiry_date)} days`
                            : `Expires: ${formatDate(card.expiry_date)}`
                          }
                        </div>
                      )}
                    </>
                  ) : (
                    card.credit_limit > 0 && (
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                        Limit: {formatCurrency(card.credit_limit)} ({((card.balance / card.credit_limit) * 100).toFixed(1)}% used)
                      </div>
                    )
                  )}
                </div>
                <div className="flex gap-1 sm:gap-2">
                  <button
                    onClick={() => handleTogglePin(card.id)}
                    className={`p-1.5 sm:p-2 rounded min-h-[44px] sm:min-h-0 flex items-center justify-center ${
                      pinnedCards.includes(card.id)
                        ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                        : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={pinnedCards.includes(card.id) ? 'Unpin card' : 'Pin card'}
                  >
                    <Star size={16} className={`sm:w-[18px] sm:h-[18px] ${pinnedCards.includes(card.id) ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    onClick={() => onNavigateToTransactions && onNavigateToTransactions({ creditCard: card.id })}
                    className={`p-2 ${darkMode ? 'text-purple-400 hover:bg-gray-700' : 'text-purple-600 hover:bg-purple-50'} rounded`}
                    title="View transactions"
                  >
                    <ListFilter size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                  <button
                    onClick={() => handleEdit(card)}
                    className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded`}
                  >
                    <Edit2 size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                  <button
                    onClick={() => handleDelete(card.id)}
                    className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}
                  >
                    <X size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                </div>
              </div>

              {!card.is_gift_card && card.due_date && (
                <div className={`flex justify-between items-center mb-3 text-sm pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Due Date:</span>
                  <div className="text-right">
                    <div className="font-medium">{formatDate(card.due_date)}</div>
                    {getDaysUntil(card.due_date) >= 0 && (
                      <div className={`text-xs ${getDaysUntil(card.due_date) <= (card.alert_days || 7) ? 'text-red-600 font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {getDaysUntil(card.due_date) === 0 ? 'Due Today!' : `${getDaysUntil(card.due_date)} days`}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {!card.is_gift_card && card.last_payment_date && card.last_payment_amount && card.last_payment_amount > 0 && (
                <div className={`flex justify-between items-center mb-3 text-sm pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Last Paid:</span>
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(card.last_payment_amount)}</div>
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
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
                  onClick={() => setActiveGiftCardOp(card)}
                  className="bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 w-full"
                >
                  Manage Balance
                </button>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAddExpense(card)}
                    className="flex items-center justify-center gap-2 bg-orange-600 text-white py-2 rounded-lg font-medium"
                  >
                    <ShoppingBag size={18} />
                    Add Expense
                  </button>
                  <button
                    onClick={() => handleMakePayment(card)}
                    className="bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
                  >
                    Make Payment
                  </button>
                </div>
              )}
              </>
              )}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
