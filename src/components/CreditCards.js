import React, { useEffect, useRef, useState } from 'react';
import { Plus, Edit2, X, CreditCard, ShoppingBag, ListFilter } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, generateId, calculateTotalBankBalance } from '../utils/helpers';
import { dbOperation, getBankAccount, updateBankAccountBalance } from '../utils/db';
import AddTransaction from './AddTransaction';
import { logActivity } from '../utils/activityLogger';
import SmartInput from './SmartInput';
import { processOverdueCreditCards } from '../utils/autoPay';

export default function CreditCards({ 
  darkMode, 
  creditCards, 
  categories,
  availableCash,
  reservedFunds,
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
  const [formData, setFormData] = useState({
    name: '',
    balance: '',
    creditLimit: '',
    dueDate: '',
    statementDay: '',
    interestRate: '',
    alertDays: alertSettings.defaultDays || 7,
    isGiftCard: false,
    purchaseDate: new Date().toISOString().split('T')[0],
    purchaseAmount: '',
    giftCardPaymentMethod: 'cash',
    hasExpiry: false,
    expiryDate: ''
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    amountMode: 'recommended',
    date: new Date().toISOString().split('T')[0],
    category: 'other',
    source: ''
  });
  const [payingCard, setPayingCard] = useState(null);
  const cardRefs = useRef({});
  const [processingResults, setProcessingResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const adjustBankAccountForFund = async (fund, amount) => {
    if (!fund?.source_account_id || !amount || amount <= 0) return;
    try {
      const account = await getBankAccount(fund.source_account_id);
      if (!account) return;
      const currentBalance = parseFloat(account.balance) || 0;
      const newBalance = Math.max(0, currentBalance - amount);
      await updateBankAccountBalance(account.id, newBalance);
      console.log(`🏦 Bank account updated for ${fund.name}: ${currentBalance} → ${newBalance}`);
    } catch (error) {
      console.error('❌ Failed to update linked bank account:', error);
    }
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

  // Helper function to find reserved fund by ID
  const findReservedFundById = (fundId) => {
    if (!fundId) return null;
    return reservedFunds.find(f => String(f.id) === String(fundId));
  };

  // Helper to resolve fund ID from various formats
  const resolveFundId = (fund) => {
    if (!fund) return null;
    if (fund.id !== undefined && fund.id !== null) return String(fund.id);
    if (fund.fund_id !== undefined && fund.fund_id !== null) return String(fund.fund_id);
    return null;
  };

  // Get payment source options for a card
  const getPaymentSourceOptions = (card) => {
    const options = [];

    // Add cash in hand
    options.push({
      value: 'cash_in_hand',
      label: `Cash in Hand (${formatCurrency(cashInHand || 0)})`,
      type: 'cash_in_hand'
    });

    // Add bank accounts
    if (bankAccounts && bankAccounts.length > 0) {
      bankAccounts.forEach(account => {
        options.push({
          value: `bank_account:${account.id}`,
          label: `${account.name} (${formatCurrency(account.balance)})`,
          type: 'bank_account'
        });
      });
    }

    // Add reserved funds
    reservedFunds.forEach(fund => {
      const fundAmount = parseFloat(fund.amount) || 0;
      if (fundAmount > 0) {
        options.push({
          value: `reserved_fund:${fund.id}`,
          label: `${fund.name} (${formatCurrency(fundAmount)})`,
          type: 'reserved_fund'
        });
      }
    });

    return options;
  };

  // Get recommended payment amount (card balance)
  const getRecommendedAmountForCard = (card) => {
    if (!card) return null;
    const cardBalance = Number(card.balance);
    if (Number.isFinite(cardBalance) && cardBalance > 0) {
      return cardBalance;
    }
    return null;
  };

  // Reset payment form
  const resetPaymentFormState = () => {
    setPaymentForm({
      amount: '',
      amountMode: 'recommended',
      date: new Date().toISOString().split('T')[0],
      category: 'other',
      source: ''
    });
  };

  // Open payment form with recommended values
  const openPaymentForm = (card) => {
    if (!card) return;
    const options = getPaymentSourceOptions(card);
    const defaultSource = options.length > 0 ? options[0].value : 'cash';
    const recommended = getRecommendedAmountForCard(card);
    const hasRecommended = Number.isFinite(recommended) && recommended > 0;
    setPaymentForm({
      amount: hasRecommended ? recommended.toFixed(2) : '',
      amountMode: hasRecommended ? 'recommended' : 'custom',
      date: new Date().toISOString().split('T')[0],
      category: 'other',
      source: defaultSource
    });
    setPayingCard(card.id);
  };

  // Handle payment source change
  const handleSourceChange = (card, newSource) => {
    const recommended = getRecommendedAmountForCard(card);
    const hasRecommended = Number.isFinite(recommended) && recommended > 0;
    setPaymentForm((prev) => ({
      ...prev,
      source: newSource,
      amountMode: hasRecommended ? 'recommended' : 'custom',
      amount: hasRecommended ? recommended.toFixed(2) : prev.amount
    }));
  };

  const handleAddExpense = (card) => {
    setSelectedCard(card);
    setShowAddExpense(true);
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.balance) {
      alert('Please fill in required fields: Name and Balance');
      return;
    }

    if (!formData.isGiftCard && !formData.dueDate) {
      alert('Credit cards require a Due Date');
      return;
    }

    if (formData.isGiftCard && !formData.purchaseAmount) {
      alert('Gift cards require an Original Value');
      return;
    }

    if (formData.isGiftCard && formData.hasExpiry && !formData.expiryDate) {
      alert('Please specify the expiry date or uncheck "has expiry"');
      return;
    }

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
      has_expiry: formData.isGiftCard ? (formData.hasExpiry || false) : false,
      expiry_date: formData.isGiftCard && formData.hasExpiry ? (formData.expiryDate || null) : null,
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
      // Build detailed description of changes
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
      if (oldName !== newName) {
        details += `Name "${oldName}" → "${newName}" • `;
      }
      if (oldBalance !== newBalance) {
        details += `Balance ${formatCurrency(oldBalance)} → ${formatCurrency(newBalance)} • `;
      }
      if (!formData.isGiftCard && oldLimit !== newLimit) {
        details += `Limit ${formatCurrency(oldLimit)} → ${formatCurrency(newLimit)} • `;
      }
      if (!formData.isGiftCard && oldDueDate !== newDueDate) {
        details += `Due date ${oldDueDate ? formatDate(oldDueDate) : 'None'} → ${newDueDate ? formatDate(newDueDate) : 'None'} • `;
      }
      if (!formData.isGiftCard && oldStatementDay !== newStatementDay) {
        details += `Statement day ${oldStatementDay || 'None'} → ${newStatementDay || 'None'} • `;
      }
      if (!formData.isGiftCard && oldInterestRate !== newInterestRate) {
        details += `Interest rate ${oldInterestRate}% → ${newInterestRate}% • `;
      }
      if (!formData.isGiftCard && oldAlertDays !== newAlertDays) {
        details += `Alert days ${oldAlertDays} → ${newAlertDays} • `;
      }
      if (formData.isGiftCard && (oldHasExpiry !== newHasExpiry || (newHasExpiry && oldExpiryDate !== newExpiryDate))) {
        if (!oldHasExpiry && newHasExpiry) {
          details += `Added expiry date ${formatDate(newExpiryDate)} • `;
        } else if (oldHasExpiry && !newHasExpiry) {
          details += `Removed expiry date • `;
        } else if (oldExpiryDate !== newExpiryDate) {
          details += `Expiry date ${formatDate(oldExpiryDate)} → ${formatDate(newExpiryDate)} • `;
        }
      }
      
      // Remove trailing bullet
      details = details.replace(/ • $/, '');

      const cardType = formData.isGiftCard ? 'gift card' : 'credit card';
      const description = details
        ? `Updated ${cardType} '${savedCard?.name || newCard.name}' - ${details}`
        : `Updated ${cardType} '${savedCard?.name || newCard.name}'`;

      // Use safer snapshot for undo/redo consistency (ensure id/name always present)
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

    // If it's a new gift card (not editing), create purchase transaction
    if (formData.isGiftCard && !editingItem) {
      try {
        const purchaseAmount = parseFloat(formData.purchaseAmount) || 0;
        const paymentMethod = formData.giftCardPaymentMethod;
        
        const transaction = {
          id: crypto.randomUUID(),
          type: 'expense',
          amount: purchaseAmount,
          date: formData.purchaseDate,
          description: `Gift Card Purchase: ${formData.name}`,
          status: 'active',
          undone_at: null
        };
        
        if (paymentMethod === 'cash') {
          transaction.payment_method = 'cash';
          transaction.payment_method_id = null;
          transaction.payment_method_name = 'Cash';
          
          const newCash = availableCash - purchaseAmount;
          await onUpdateCash(newCash);
          
        } else if (paymentMethod.startsWith('bank-')) {
          const bankAccountId = paymentMethod.replace('bank-', '');
          const paymentAccount = bankAccounts.find(a => a.id === bankAccountId);
          
          if (!paymentAccount) {
            alert('Selected bank account not found');
            return;
          }
          
          if ((parseFloat(paymentAccount.balance) || 0) < purchaseAmount) {
            alert(`Insufficient balance in ${paymentAccount.name}. Available: ${formatCurrency(paymentAccount.balance)}`);
            return;
          }
          
          transaction.payment_method = 'bank_account';
          transaction.payment_method_id = bankAccountId;
          transaction.payment_method_name = paymentAccount.name;
          
          // Deduct from bank account
          await updateBankAccountBalance(bankAccountId, (parseFloat(paymentAccount.balance) || 0) - purchaseAmount);
          
        } else if (paymentMethod.startsWith('card-')) {
          const cardIdToCharge = paymentMethod.replace('card-', '');
          const paymentCard = creditCards.find(c => c.id === cardIdToCharge);
          
          if (!paymentCard) {
            alert('Selected payment card not found');
            return;
          }
          
          transaction.payment_method = 'credit_card';
          transaction.payment_method_id = cardIdToCharge;
          transaction.payment_method_name = paymentCard.name;
          transaction.card_id = cardIdToCharge;
          
          await dbOperation('creditCards', 'put', {
            ...paymentCard,
            balance: (parseFloat(paymentCard.balance) || 0) + purchaseAmount
          }, { skipActivityLog: true });
          
        } else if (paymentMethod.startsWith('giftcard-')) {
          const giftCardId = paymentMethod.replace('giftcard-', '');
          const paymentGiftCard = creditCards.find(c => c.id === giftCardId);
          
          if (!paymentGiftCard) {
            alert('Selected payment gift card not found');
            return;
          }
          
          if ((parseFloat(paymentGiftCard.balance) || 0) < purchaseAmount) {
            alert(`Insufficient balance on ${paymentGiftCard.name}. Available: ${formatCurrency(paymentGiftCard.balance)}`);
            return;
          }
          
          transaction.payment_method = 'credit_card';
          transaction.payment_method_id = giftCardId;
          transaction.payment_method_name = paymentGiftCard.name;
          transaction.card_id = giftCardId;
          
          await dbOperation('creditCards', 'put', {
            ...paymentGiftCard,
            balance: (parseFloat(paymentGiftCard.balance) || 0) - purchaseAmount
          }, { skipActivityLog: true });
        }
        
        const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

        await logActivity(
          'add',
          'card',
          savedCard?.id || newCard.id,
          formData.name,
          `Purchased gift card '${formData.name}' for ${formatCurrency(purchaseAmount)} using ${transaction.payment_method_name}`,
          {
            amount: purchaseAmount,
            paymentMethod: transaction.payment_method_name,
            paymentMethodId: transaction.payment_method_id,
            paymentMethodType: transaction.payment_method,  // 'cash', 'bank_account', 'credit_card'
            transactionId: savedTransaction?.id,
            giftCardId: savedCard?.id || newCard.id,
            isGiftCard: true
          }
        );

        console.log('✅ Gift card purchase transaction created');
      } catch (error) {
        console.error('Error creating gift card purchase transaction:', error);
        alert('Gift card added but transaction creation failed. Please add the expense manually.');
      }
    }

    await onUpdate();
    resetForm();
  };

  const handleProcessDueCardPayments = async () => {
    if (isProcessing) return;

    if (!window.confirm('Process all overdue credit card payments from reserved funds?')) {
      return;
    }

    setIsProcessing(true);
    setProcessingResults(null);

    try {
      const results = await processOverdueCreditCards(creditCards, reservedFunds, availableCash, onUpdateCash);
      await onUpdate();
      setProcessingResults(results);

      const processedCount = results.processed.length;
      const failedCount = results.failed.length;

      if (processedCount > 0) {
        alert(`Successfully processed ${processedCount} credit card payment(s).${failedCount > 0 ? ` ${failedCount} failed.` : ''}`);
      } else if (failedCount > 0) {
        alert(`Failed to process ${failedCount} credit card payment(s). Check console for details.`);
      } else {
        alert('No overdue credit cards with linked reserved funds found.');
      }
    } catch (error) {
      console.error('Error processing credit card payments:', error);
      alert('Error processing payments. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setFormData({ 
      name: '', 
      balance: '', 
      creditLimit: '', 
      dueDate: '', 
      statementDay: '', 
      interestRate: '', 
      alertDays: alertSettings.defaultDays || 7,
      isGiftCard: false,
      purchaseDate: new Date().toISOString().split('T')[0],
      purchaseAmount: '',
      giftCardPaymentMethod: 'cash',
      hasExpiry: false,
      expiryDate: ''
    });
    setShowAddForm(false);
    setEditingItem(null);
  };

  const handleEdit = (card) => {
    setFormData({
      name: card.name,
      balance: card.balance.toString(),
      creditLimit: card.credit_limit?.toString() || '',
      dueDate: card.due_date || '',
      statementDay: card.statement_day?.toString() || '',
      interestRate: card.interest_rate?.toString() || '',
      alertDays: card.alert_days?.toString() || (alertSettings.defaultDays || 7).toString(),
      isGiftCard: card.is_gift_card || false,
      purchaseDate: card.purchase_date || new Date().toISOString().split('T')[0],
      purchaseAmount: card.purchase_amount?.toString() || '',
      giftCardPaymentMethod: 'cash',
      hasExpiry: card.has_expiry || false,
      expiryDate: card.expiry_date || ''
    });
    setEditingItem(card);
    setShowAddForm(true);
  };

  const handlePayment = async (cardId) => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    const card = creditCards.find(c => c.id === cardId);
    if (!card) {
      alert('Card not found');
      return;
    }

    // Parse payment source
    const sourceValue = paymentForm.source || 'cash';
    const [rawType, rawId] = sourceValue.includes(':') ? sourceValue.split(':') : [sourceValue, null];
    const sourceType = rawType || 'cash';
    const sourceId = rawId || null;

    const paymentAmount = parseFloat(paymentForm.amount);
    const paymentDate = paymentForm.date;

    if (!paymentDate) {
      alert('Please select a payment date');
      return;
    }

    try {
      // Capture original card state BEFORE modifications
      const originalCard = { ...card };
      
      const cardBalance = parseFloat(card.balance) || 0;
      const todayIso = new Date().toISOString().split('T')[0];

      // Update card
      const updatedCard = {
        ...card,
        balance: cardBalance - paymentAmount,
        last_payment_date: paymentDate,
        last_auto_payment_date: todayIso
      };

      await dbOperation('creditCards', 'put', updatedCard, { skipActivityLog: true });

      const affectedFunds = [];
      const fundTransactionIds = [];
      const bankAdjustments = [];

      const recordAffectedFund = (fundSnapshot, amountUsed, metadata = {}) => {
        if (!fundSnapshot) return;
        const numericAmount = Number(amountUsed) || 0;
        if (numericAmount <= 0) return;
        affectedFunds.push({
          fund: { ...fundSnapshot },
          amountUsed: numericAmount,
          ...metadata
        });
      };

      let paymentMethod = 'cash';
      let paymentMethodId = null;
      let paymentMethodName = 'Cash';
      let sourceName = 'Cash';
      const previousCash = availableCash;
      let newCash = availableCash - paymentAmount;

      // Handle different payment sources
      if (sourceType === 'reserved_fund') {
        const fund = findReservedFundById(sourceId);
        if (!fund) {
          alert('Selected reserved fund was not found.');
          return;
        }

        const currentAmount = parseFloat(fund.amount) || 0;
        if (paymentAmount - currentAmount > 0.005) {
          alert(`The reserved fund ${fund.name} only has ${formatCurrency(currentAmount)} available.`);
          return;
        }

        // Deep copy fund snapshot
        const fundSnapshot = JSON.parse(JSON.stringify(fund));

        const fundTransaction = {
          type: 'reserved_fund_paid',
          amount: paymentAmount,
          date: paymentDate,
          description: `Reserved fund applied: ${fund.name}`,
          notes: `Reserved fund linked to ${card.name}`,
          created_at: new Date().toISOString(),
          status: 'active',
          undone_at: null,
          payment_method: 'reserved_fund',
          payment_method_id: resolveFundId(fund)
        };
        const savedFundTransaction = await dbOperation('transactions', 'put', fundTransaction, { skipActivityLog: true });
        if (savedFundTransaction?.id) {
          fundTransactionIds.push(savedFundTransaction.id);
        }

        // Update fund based on type
        if (fund.recurring) {
          const { predictNextDate } = await import('../utils/helpers');
          const updatedFund = {
            ...fund,
            amount: Math.max(0, currentAmount - paymentAmount),
            due_date: predictNextDate(fund.due_date, fund.frequency || 'monthly'),
            last_paid_date: paymentDate
          };
          await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
        } else if (fund.is_lumpsum) {
          const updatedAmount = Math.max(0, currentAmount - paymentAmount);
          const updatedFund = {
            ...fund,
            amount: updatedAmount,
            last_paid_date: paymentDate
          };
          await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
        } else {
          const remaining = currentAmount - paymentAmount;
          if (remaining <= 0.0001) {
            await dbOperation('reservedFunds', 'delete', resolveFundId(fund), { skipActivityLog: true });
          } else {
            const updatedFund = {
              ...fund,
              amount: remaining,
              last_paid_date: paymentDate
            };
            await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
          }
        }

        const adjustmentInfo = await adjustBankAccountForFund(fund, paymentAmount);
        const snapshotFund = adjustmentInfo
          ? { ...fundSnapshot, source_account_name: adjustmentInfo.accountName }
          : fundSnapshot;

        const wasFundDeleted = !fund.recurring && !fund.is_lumpsum && (currentAmount - paymentAmount) <= 0.0001;

        recordAffectedFund(snapshotFund, paymentAmount, {
          fundTransactionId: savedFundTransaction?.id || null,
          wasDeleted: wasFundDeleted
        });

        paymentMethod = 'reserved_fund';
        paymentMethodId = resolveFundId(fund);
        paymentMethodName = fund.name;
        sourceName = fund.name;

        newCash = previousCash;
        await onUpdateCash(previousCash);

      } else if (sourceType === 'bank_account') {
        const account = bankAccounts.find((acc) => String(acc.id) === String(sourceId));
        if (!account) {
          alert('Selected bank account was not found.');
          return;
        }

        const currentBalance = parseFloat(account.balance) || 0;
        console.log('💳 Bank account payment - Current balance:', currentBalance, 'Payment:', paymentAmount);
        
        if (paymentAmount - currentBalance > 0.005) {
          alert(`Insufficient funds in ${account.name}. Available: ${formatCurrency(currentBalance)}`);
          return;
        }

        const updatedBalance = Math.max(0, currentBalance - paymentAmount);
        console.log('💰 Updating balance to:', updatedBalance, '(', currentBalance, '-', paymentAmount, ')');
        
        try {
          await updateBankAccountBalance(account.id, updatedBalance);
          console.log('✅ Bank account updated successfully');
        } catch (bankError) {
          console.error('❌ Failed to update bank account:', bankError);
          alert('Failed to update bank account balance. Please try again.');
          return;
        }

        bankAdjustments.push({
          accountId: account.id,
          accountName: account.name,
          previousBalance: currentBalance,
          newBalance: updatedBalance,
          amount: paymentAmount
        });

        paymentMethod = 'bank_account';
        paymentMethodId = account.id;
        paymentMethodName = account.name;
        sourceName = account.name;

        // Don't deduct from cash when paying from bank account
        // Recalculate total including the updated bank account
        const updatedBankTotal = calculateTotalBankBalance(
          bankAccounts.map(acc => 
            String(acc.id) === String(account.id)
              ? { ...acc, balance: updatedBalance }
              : acc
          )
        );
        newCash = updatedBankTotal;
        await onUpdateCash(updatedBankTotal);

      } else if (sourceType === 'cash_in_hand') {
        const currentCash = cashInHand || 0;
        if (paymentAmount > currentCash) {
          alert(
            `Insufficient cash in hand.\n` +
            `Available: ${formatCurrency(currentCash)}\n` +
            `Required: ${formatCurrency(paymentAmount)}`
          );
          return;
        }
        
        const newCashInHand = currentCash - paymentAmount;
        if (onUpdateCashInHand) await onUpdateCashInHand(newCashInHand);
        
        paymentMethod = 'cash_in_hand';
        paymentMethodId = null;
        paymentMethodName = 'Cash in Hand';
        sourceName = 'Cash in Hand';
        
        // No change to total available cash calculation
        newCash = previousCash;
        await onUpdateCash(previousCash);

      } else {
        // Cash payment
        paymentMethod = 'cash';
        paymentMethodId = null;
        paymentMethodName = 'Cash';
        sourceName = 'Cash';
        newCash = previousCash - paymentAmount;
        await onUpdateCash(newCash);
      }

      // Create main payment transaction
      const transaction = {
        type: 'payment',
        card_id: cardId,
        amount: paymentAmount,
        date: paymentDate,
        category_id: paymentForm.category || 'credit_card_payment',
        category_name: 'Credit Card Payment',
        payment_method: paymentMethod,
        payment_method_id: paymentMethodId,
        payment_method_name: paymentMethodName,
        description: `Payment for card ${card.name}${sourceName ? ` from ${sourceName}` : ''}`,
        created_at: new Date().toISOString(),
        status: 'active',
        undone_at: null
      };
      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

      // ✅ Ensure card snapshots always carry valid ID and name for undo safety
      if (!originalCard.id) originalCard.id = cardId; // Safety: ensure originalCard has ID
      if (!originalCard.name) originalCard.name = card.name; // Safety: ensure originalCard has name
      if (!updatedCard.id) updatedCard.id = cardId; // Safety: ensure updatedCard has ID
      if (!updatedCard.name) updatedCard.name = card.name; // Safety: ensure updatedCard has name
      const snapshot = {
        entity: originalCard,
        paymentAmount,
        date: paymentDate,
        previousCash,
        newCash,
        source: {
          type: sourceType,
          id: sourceId,
          name: sourceName
        },
        paymentMethodName,
        affectedFund: affectedFunds[0]?.fund || null,
        affectedFunds,
        fundTransactionIds,
        bankAdjustments,
        transactionId: savedTransaction?.id,
        isManualPayment: true
      };
      const previousBalance = parseFloat(originalCard.balance) || 0;
      const newBalance = parseFloat(updatedCard.balance) || 0;
      await logActivity(
        'payment',
        'card',
        cardId,
        card.name,
        `Made payment of ${formatCurrency(paymentAmount)} for '${card.name}' from ${sourceName} - Balance ${formatCurrency(previousBalance)} → ${formatCurrency(newBalance)}`,
        snapshot
      );

      await onUpdate();
      setPayingCard(null);
      resetPaymentFormState();
    } catch (error) {
      console.error('Error processing card payment:', error);
      alert('Failed to process payment. Please try again.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this credit card?')) {
      const card = creditCards.find(c => c.id === id);
      await logActivity(
        'delete',
        'card',
        id,
        card.name,
        `Deleted ${card.is_gift_card ? 'gift card' : 'credit card'} '${card.name}' - Balance ${formatCurrency(card.balance)}${!card.is_gift_card ? ` • Limit ${formatCurrency(card.credit_limit)} • Rate ${card.interest_rate || 0}% • Due ${card.due_date ? formatDate(card.due_date) : 'N/A'}` : ''}`,
        card
      );
      await dbOperation('creditCards', 'delete', id, { skipActivityLog: true });
      await onUpdate();
    }
  };

  return (
    <div className="space-y-4">
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
          reservedFunds={reservedFunds}
          availableCash={availableCash}
          onUpdateCash={onUpdateCash}
          bankAccounts={bankAccounts}
          preselectedCard={selectedCard}
          preselectedType="expense"
        />
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Credit Cards</h2>
        <div className="flex gap-2">
          <button
            onClick={handleProcessDueCardPayments}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
              isProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            } text-white`}
            title="Process all overdue credit cards with linked reserved funds"
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
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg"
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

      {showAddForm && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`}>
          <SmartInput
            type="card"
            value={formData.name}
            onChange={(value) => setFormData({ ...formData, name: value })}
            label="Card Name *"
            placeholder="e.g., Rogers Mastercard"
            darkMode={darkMode}
            required={true}
          />
          {/* Card Type Toggle */}
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Card Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isGiftCard: false })}
                className={`flex-1 px-3 py-2 rounded-lg border-2 transition-colors ${
                  !formData.isGiftCard
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                💳 Credit Card
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isGiftCard: true })}
                className={`flex-1 px-3 py-2 rounded-lg border-2 transition-colors ${
                  formData.isGiftCard
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                🎁 Gift Card
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
            </>
          )}
          {formData.isGiftCard && (
            <>
              <input
                type="number"
                step="0.01"
                placeholder="Original Gift Card Value *"
                value={formData.purchaseAmount}
                onChange={(e) => setFormData({ ...formData, purchaseAmount: e.target.value })}
                className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
              />
              
              <div>
                <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  How are you paying for this gift card? *
                </label>
                <select
                  value={formData.giftCardPaymentMethod}
                  onChange={(e) => setFormData({ ...formData, giftCardPaymentMethod: e.target.value })}
                  className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                >
                  <option value="cash">💵 Cash</option>
                  
                  {/* Bank Accounts */}
                  {bankAccounts && bankAccounts.length > 0 && (
                    <optgroup label="Bank Accounts">
                      {bankAccounts.map(account => (
                        <option key={account.id} value={`bank-${account.id}`}>
                          🏦 {account.name} ({formatCurrency(account.balance)} available)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  
                  <optgroup label="Credit Cards">
                    {creditCards.filter(card => !card.is_gift_card).map(card => (
                      <option key={card.id} value={`card-${card.id}`}>
                        💳 {card.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Gift Cards">
                    {creditCards.filter(card => card.is_gift_card && card.balance > 0).map(card => (
                      <option key={card.id} value={`giftcard-${card.id}`}>
                        🎁 {card.name} ({formatCurrency(card.balance)} available)
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              
              <div>
                <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Purchase Date *
                </label>
                <input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                  className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                />
              </div>
              
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.hasExpiry}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      hasExpiry: e.target.checked,
                      expiryDate: e.target.checked ? formData.expiryDate : ''
                    })}
                    className="w-4 h-4"
                  />
                  <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    This gift card has an expiry date
                  </span>
                </label>
              </div>
              
              {formData.hasExpiry && (
                <div>
                  <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              )}
            </>
          )}
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium">
              {editingItem ? 'Update Card' : 'Add Card'}
            </button>
            <button
              onClick={resetForm}
              className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} py-2 rounded-lg font-medium`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {creditCards.length === 0 ? (
          <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <CreditCard size={48} className="mx-auto mb-3 opacity-30" />
            <p>No credit cards added yet</p>
          </div>
        ) : (
          creditCards.map(card => (
            <div
              key={String(normalizeId(card.id))}
              ref={(el) => {
                const key = String(normalizeId(card.id));
                if (el) {
                  cardRefs.current[key] = el;
                }
              }}
              className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 ${focusTarget?.type === 'card' && normalizeId(focusTarget.id) === normalizeId(card.id) ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-lg">{card.name}</h3>
                    {card.is_gift_card && (
                      <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 font-medium">
                        🎁 Gift Card
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-2xl font-bold mt-1 ${
                      card.balance < 0
                        ? 'text-green-600'        // overpaid → green
                        : card.balance === 0
                        ? darkMode
                          ? 'text-gray-300'       // neutral gray (dark mode)
                          : 'text-gray-600'       // neutral gray (light mode)
                        : 'text-red-600'          // owe → red
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
                <div className="flex gap-2">
                  <button
                    onClick={() => onNavigateToTransactions && onNavigateToTransactions({ creditCard: card.id })}
                    className={`p-2 ${darkMode ? 'text-purple-400 hover:bg-gray-700' : 'text-purple-600 hover:bg-purple-50'} rounded`}
                    title="View transactions"
                  >
                    <ListFilter size={18} />
                  </button>
                  <button
                    onClick={() => handleEdit(card)}
                    className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded`}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(card.id)}
                    className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}
                  >
                    <X size={18} />
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

{payingCard === card.id ? (
                <div className="space-y-3">
                  {/* Payment Source Selector */}
                  <div>
                    <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      Payment Source *
                    </label>
                    <select
                      value={paymentForm.source}
                      onChange={(e) => handleSourceChange(card, e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                    >
                      {getPaymentSourceOptions(card).map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Amount Mode Toggle */}
                  <div>
                    <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      Payment Amount *
                    </label>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => {
                          const recommended = getRecommendedAmountForCard(card);
                          if (recommended) {
                            setPaymentForm({
                              ...paymentForm,
                              amountMode: 'recommended',
                              amount: recommended.toFixed(2)
                            });
                          }
                        }}
                        className={`flex-1 px-3 py-1 rounded text-sm ${
                          paymentForm.amountMode === 'recommended'
                            ? 'bg-blue-600 text-white'
                            : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        Full Balance ({formatCurrency(card.balance)})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentForm({ ...paymentForm, amountMode: 'custom' })}
                        className={`flex-1 px-3 py-1 rounded text-sm ${
                          paymentForm.amountMode === 'custom'
                            ? 'bg-blue-600 text-white'
                            : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Payment Amount"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value, amountMode: 'custom' })}
                      className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                    />
                  </div>

                  {/* Payment Date */}
                  <div>
                    <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      Payment Date *
                    </label>
                    <input
                      type="date"
                      value={paymentForm.date}
                      onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                      className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      Category
                    </label>
                    <select
                      value={paymentForm.category}
                      onChange={(e) => setPaymentForm({ ...paymentForm, category: e.target.value })}
                      className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <button 
                      onClick={() => handlePayment(card.id)} 
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700"
                    >
                      Confirm Payment
                    </button>
                    <button
                      onClick={() => {
                        setPayingCard(null);
                        resetPaymentFormState();
                      }}
                      className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} py-2 rounded-lg font-medium`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAddExpense(card)}
                    className="flex items-center justify-center gap-2 bg-orange-600 text-white py-2 rounded-lg font-medium"
                  >
                    <ShoppingBag size={18} />
                    Add Expense
                  </button>
                  <button
                    onClick={() => openPaymentForm(card)}
                    className="bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
                  >
                    Make Payment
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
