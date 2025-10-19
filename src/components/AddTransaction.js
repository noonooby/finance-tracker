import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Wallet, Building2, CreditCard as CreditCardIcon, TrendingUp } from 'lucide-react';
import { dbOperation } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import { formatCurrency } from '../utils/helpers';
import { showToast } from '../utils/toast';
import {
  addRecentTransaction,
  addRecentCategory,
  addRecentPaymentMethod,
  getUserPreferences
} from '../utils/userPreferencesManager';
import {
  getExpenseContext,
  saveExpenseContext,
  getRecentExpenseDescriptions,
  getLastUsedExpenseContext,
  applyExpenseContext
} from '../utils/formContexts';

export default function AddTransaction({ 
  darkMode, 
  onClose, 
  onUpdate,
  categories,
  creditCards,
  loans,
  reservedFunds,
  availableCash,
  onUpdateCash,
  bankAccounts,
  preselectedCard = null,
  preselectedLoan = null,
  preselectedType = 'expense',
  cashInHand = 0,
  onUpdateCashInHand = null
}) {
  // Get primary bank account for default selection
  const primaryBank = bankAccounts?.find(acc => acc.is_primary);
  const defaultPaymentMethod = preselectedCard ? 'credit_card' : preselectedLoan ? 'loan' : (primaryBank ? 'bank_account' : 'cash_in_hand');
  const defaultPaymentMethodId = preselectedCard?.id || preselectedLoan?.id || (primaryBank?.id || null);

  const [formData, setFormData] = useState({
    type: preselectedType,
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    notes: '',
    categoryId: '',
    paymentMethod: defaultPaymentMethod,
    paymentMethodId: defaultPaymentMethodId,
    incomeSource: '',
    incomeDestination: 'bank',
    incomeAccountId: primaryBank?.id || '',
    paymentSource: 'cash_in_hand',
    paymentSourceId: null
  });

  const [saving, setSaving] = useState(false);
  const [recentCategories, setRecentCategories] = useState([]);
  const [recentPaymentMethods, setRecentPaymentMethods] = useState([]);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const descriptionInputRef = useRef(null);
  
  // Load expense contexts on mount
  const loadExpenseContexts = useCallback(async () => {
    try {
      if (formData.type === 'expense') {
        console.log('🔍 Loading expense contexts...');
        const recent = await getRecentExpenseDescriptions(5);
        console.log('📊 Recent expenses found:', recent?.length || 0, recent);
        setRecentExpenses(recent);
        
        // Pre-fill last used expense context only if no preselected card
        const lastContext = await getLastUsedExpenseContext();
        console.log('🎯 Last context:', lastContext);
        console.log('💳 Preselected card:', preselectedCard ? preselectedCard.name : 'none');
        
        if (lastContext && !formData.description && !preselectedCard) {
          const contextData = applyExpenseContext(lastContext);
          console.log('✅ Applying last context:', contextData);
          setFormData(prev => ({
            ...prev,
            description: lastContext.description,
            ...contextData
          }));
          
          setTimeout(() => {
            if (descriptionInputRef.current) {
              descriptionInputRef.current.select();
              descriptionInputRef.current.focus();
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error('❌ Error loading expense contexts:', error);
    }
  }, [formData.type, formData.description, preselectedCard]);

  useEffect(() => {
    loadExpenseContexts();
  }, [loadExpenseContexts]);

  // Handle quick-select expense button click
  const handleSelectExpense = useCallback(async (expenseContext) => {
    try {
      const contextData = applyExpenseContext(expenseContext);
      
      // If card is preselected, only apply category (not payment method)
      if (preselectedCard) {
        setFormData(prev => ({
          ...prev,
          description: expenseContext.description,
          categoryId: contextData.categoryId || prev.categoryId
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          description: expenseContext.description,
          ...contextData
        }));
      }
      
      setTimeout(() => {
        const amountInput = document.querySelector('input[type="number"][step="0.01"]');
        if (amountInput) amountInput.focus();
      }, 50);
    } catch (error) {
      console.error('Error applying expense context:', error);
    }
  }, [preselectedCard]);

  // Handle description change
  const handleDescriptionChange = (value) => {
    setFormData(prev => ({ ...prev, description: value }));
  };

  // Load context when user leaves description field
  const handleDescriptionBlur = useCallback(async () => {
    if (!formData.description?.trim() || formData.type !== 'expense') return;
    try {
      const context = await getExpenseContext(formData.description);
      if (context) {
        const contextData = applyExpenseContext(context);
        
        // If card is preselected, only apply category (not payment method)
        if (preselectedCard) {
          setFormData(prev => ({ 
            ...prev, 
            categoryId: contextData.categoryId || prev.categoryId 
          }));
        } else {
          setFormData(prev => ({ ...prev, ...contextData }));
        }
        
        console.log('✅ Applied expense context for:', formData.description);
      }
    } catch (error) {
      console.error('Error loading expense context:', error);
    }
  }, [formData.description, formData.type, preselectedCard]);
  
  const loadRecentCategories = async () => {
    try {
      const prefs = await getUserPreferences();
      const recentIds = prefs.recent_categories || [];
      const recent = recentIds
        .map(id => categories.find(c => c.id === id))
        .filter(Boolean)
        .slice(0, 5);
      setRecentCategories(recent);
    } catch (error) {
      console.error('Error loading recent categories:', error);
    }
  };

  const loadRecentPaymentMethods = async () => {
    try {
      const prefs = await getUserPreferences();
      const recentPMs = prefs.recent_payment_methods || [];
      
      const parsed = recentPMs
        .map(pm => {
          if (pm === 'cash_in_hand') {
            return { type: 'cash_in_hand', id: null, name: 'Cash in Hand' };
          } else if (pm.startsWith('credit_card:')) {
            const id = pm.replace('credit_card:', '');
            const card = creditCards?.find(c => c.id === id);
            if (card) {
              return { 
                type: 'credit_card', 
                id: card.id, 
                name: card.name
              };
            }
          } else if (pm.startsWith('bank_account:')) {
            const id = pm.replace('bank_account:', '');
            const account = bankAccounts?.find(a => a.id === id);
            if (account) {
              return { 
                type: 'bank_account', 
                id: account.id, 
                name: account.name,
                balance: account.balance,
                isPrimary: account.is_primary
              };
            }
          }
          return null;
        })
        .filter(Boolean)
        .slice(0, 5);
      
      setRecentPaymentMethods(parsed);
    } catch (error) {
      console.error('Error loading recent payment methods:', error);
    }
  };
  
  useEffect(() => {
    loadRecentCategories();
    loadRecentPaymentMethods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (preselectedCard) {
      setFormData(prev => ({
        ...prev,
        paymentMethod: 'credit_card',
        paymentMethodId: preselectedCard.id
      }));
    }
    if (preselectedLoan) {
      setFormData(prev => ({
        ...prev,
        paymentMethod: 'loan',
        paymentMethodId: preselectedLoan.id
      }));
    }
  }, [preselectedCard, preselectedLoan]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const amount = parseFloat(formData.amount);
      
      if (isNaN(amount) || amount <= 0) {
        showToast.error('Please enter a valid amount');
        setSaving(false);
        return;
      }

      const category = categories.find(c => c.id === formData.categoryId);
      let activityDetails = null;
      
      const transaction = {
        type: formData.type,
        amount,
        date: formData.date,
        description: formData.description,
        notes: formData.notes,
        category_id: formData.categoryId || null,
        category_name: category?.name || null,
        payment_method: formData.paymentMethod,
        payment_method_id: formData.paymentMethodId,
        payment_method_name: null,
        card_id: null,
        loan_id: null,
        fund_id: null,
        income_source: formData.incomeSource || null,
        is_cleared: false,
        status: 'active',
        undone_at: null
      };

      let paymentMethodString = null;

      if (formData.type === 'expense') {
        if (formData.paymentMethod === 'credit_card') {
          const card = creditCards.find(c => c.id === formData.paymentMethodId);
          if (!card) {
            showToast.error('Please select a credit card');
            setSaving(false);
            return;
          }

          const previousCardBalance = card.balance;
          
          // Gift cards: SUBTRACT (spend). Credit cards: ADD (charge)
          const newCardBalance = card.is_gift_card 
            ? card.balance - amount  // Gift card spending reduces balance
            : card.balance + amount; // Credit card charging increases balance

          await dbOperation('creditCards', 'put', {
            ...card,
            balance: Math.max(0, newCardBalance)
          }, { skipActivityLog: true });

          transaction.card_id = card.id;
          transaction.payment_method_name = card.name;
          paymentMethodString = `credit_card:${card.id}`;

          activityDetails = {
            actionType: 'expense',
            entityType: 'card',
            entityId: card.id,
            entityName: card.name,
            description: `Expense '${formData.description}' for ${formatCurrency(amount)} using '${card.name}' - Balance ${formatCurrency(previousCardBalance)} → ${formatCurrency(newCardBalance)}`,
            snapshot: {
              amount,
              category: category?.name,
              description: formData.description,
              cardId: card.id,
              previousBalance: previousCardBalance,
              paymentMethodName: card.name,
              isGiftCard: card.is_gift_card
            }
          };

        } else if (formData.paymentMethod === 'bank_account') {
          const account = bankAccounts.find(a => a.id === formData.paymentMethodId);
          if (!account) {
            showToast.error('Please select a bank account');
            setSaving(false);
            return;
          }
          
          const currentBalance = Number(account.balance) || 0;
          const newBalance = currentBalance - amount;
          
          if (newBalance < 0) {
            if (!account.allows_overdraft) {
              showToast.error(
                `Insufficient funds in '${account.name}'.\n` +
                `Available: ${formatCurrency(currentBalance)}\n` +
                `Required: ${formatCurrency(amount)}\n\n` +
                `This account does not allow overdraft.`
              );
              setSaving(false);
              return;
            }
            
            const overdraftAmount = Math.abs(newBalance);
            if (overdraftAmount > (account.overdraft_limit || 0)) {
              showToast.error(
                `Insufficient funds in '${account.name}'.\n` +
                `This would exceed your overdraft limit.\n\n` +
                `Available: ${formatCurrency(currentBalance)}\n` +
                `Overdraft: ${formatCurrency(account.overdraft_limit)}\n` +
                `Total: ${formatCurrency(currentBalance + account.overdraft_limit)}\n` +
                `Required: ${formatCurrency(amount)}`
              );
              setSaving(false);
              return;
            }
            
            const proceed = window.confirm(
              `⚠️ This will put '${account.name}' in overdraft.\n` +
              `Balance will be ${formatCurrency(newBalance)}.\n` +
              `Overdraft fees may apply if not resolved by end of day.\n\n` +
              `Continue?`
            );
            if (!proceed) {
              setSaving(false);
              return;
            }
          }
          
          const { updateBankAccountBalance } = await import('../utils/db');
          await updateBankAccountBalance(account.id, newBalance);
          
          transaction.payment_method_name = account.name;
          paymentMethodString = `bank_account:${account.id}`;
          
          activityDetails = {
            actionType: 'expense',
            entityType: 'bank_account',
            entityId: account.id,
            entityName: account.name,
            description: `Expense '${formData.description}' for ${formatCurrency(amount)} using '${account.name}' - Balance ${formatCurrency(currentBalance)} → ${formatCurrency(newBalance)}`,
            snapshot: {
              amount,
              category: category?.name,
              description: formData.description,
              accountId: account.id,
              previousBalance: currentBalance,
              newBalance,
              paymentMethodName: account.name
            }
          };

        } else if (formData.paymentMethod === 'cash_in_hand') {
          const currentCash = cashInHand || 0;
          if (amount > currentCash) {
            showToast.error(
              `Insufficient cash in hand.\n` +
              `Available: ${formatCurrency(currentCash)}\n` +
              `Required: ${formatCurrency(amount)}`
            );
            setSaving(false);
            return;
          }
          
          const newCashInHand = currentCash - amount;
          if (onUpdateCashInHand) await onUpdateCashInHand(newCashInHand);
          
          transaction.payment_method_name = 'Cash in Hand';
          paymentMethodString = 'cash_in_hand';

          activityDetails = {
            actionType: 'expense',
            entityType: 'cash',
            entityId: 'cash-in-hand',
            entityName: 'Cash in Hand',
            description: `Expense '${formData.description}' for ${formatCurrency(amount)} using Cash in Hand - Balance ${formatCurrency(currentCash)} → ${formatCurrency(newCashInHand)}`,
            snapshot: {
              amount,
              category: category?.name,
              description: formData.description,
              previousCash: currentCash,
              newCash: newCashInHand,
              paymentMethodName: 'Cash in Hand'
            }
          };
        } else if (formData.paymentMethod === 'cash') {
          const newCash = availableCash - amount;
          await onUpdateCash(newCash);
          transaction.payment_method_name = 'Cash';

          activityDetails = {
            actionType: 'expense',
            entityType: 'cash',
            entityId: 'cash-expense',
            entityName: 'Cash',
            description: `Expense '${formData.description}' for ${formatCurrency(amount)} using Cash - Balance ${formatCurrency(availableCash)} → ${formatCurrency(newCash)}`,
            snapshot: {
              amount,
              category: category?.name,
              description: formData.description,
              previousCash: availableCash,
              newCash,
              paymentMethodName: 'Cash'
            }
          };
        }

        // Save expense context (non-blocking)
        if (formData.description) {
          saveExpenseContext(formData.description, {
            categoryId: formData.categoryId,
            paymentMethod: formData.paymentMethod,
            paymentMethodId: formData.paymentMethodId
          }).catch(err => console.warn('Failed to save expense context:', err));
        }

      } else if (formData.type === 'income') {
        transaction.income_source = formData.incomeSource;

        if (formData.incomeDestination === 'cash_in_hand') {
          const currentCash = cashInHand || 0;
          const newCash = currentCash + amount;
          if (onUpdateCashInHand) await onUpdateCashInHand(newCash);
          
          transaction.payment_method = 'cash_in_hand';
          transaction.payment_method_name = 'Cash in Hand';

          activityDetails = {
            actionType: 'income',
            entityType: 'income',
            entityId: formData.incomeSource || 'income',
            entityName: formData.incomeSource || 'Income',
            description: `Income of ${formatCurrency(amount)} from '${formData.incomeSource}' to Cash in Hand - Balance ${formatCurrency(currentCash)} → ${formatCurrency(newCash)}`,
            snapshot: {
              amount,
              source: formData.incomeSource,
              depositTarget: 'cash_in_hand',
              previousCash: currentCash,
              newCash,
              paymentMethodName: 'Cash in Hand'
            }
          };
        } else {
          const account = bankAccounts?.find(a => a.id === formData.incomeAccountId);
          if (!account) {
            showToast.error('Please select a bank account');
            setSaving(false);
            return;
          }
          
          const currentBalance = Number(account.balance) || 0;
          const newBalance = currentBalance + amount;
          
          const { updateBankAccountBalance } = await import('../utils/db');
          await updateBankAccountBalance(account.id, newBalance);
          await onUpdateCash(null, { syncOnly: true });
          
          transaction.payment_method = 'bank_account';
          transaction.payment_method_id = account.id;
          transaction.payment_method_name = account.name;

          activityDetails = {
            actionType: 'income',
            entityType: 'income',
            entityId: formData.incomeSource || 'income',
            entityName: formData.incomeSource || 'Income',
            description: `Income of ${formatCurrency(amount)} from '${formData.incomeSource}' to '${account.name}' - Balance ${formatCurrency(currentBalance)} → ${formatCurrency(newBalance)}`,
            snapshot: {
              amount,
              source: formData.incomeSource,
              depositTarget: 'bank',
              depositAccountId: account.id,
              depositAccountName: account.name,
              previousBalance: currentBalance,
              newBalance,
              paymentMethodName: account.name
            }
          };
        }

      } else if (formData.type === 'payment') {
        const paymentSource = formData.paymentSource;
        const paymentSourceId = formData.paymentSourceId;
        
        if (formData.paymentMethod === 'credit_card') {
          const card = creditCards.find(c => c.id === formData.paymentMethodId);
          if (!card) {
            showToast.error('Please select a credit card');
            setSaving(false);
            return;
          }

          const previousCardBalance = card.balance;

          await dbOperation('creditCards', 'put', {
            ...card,
            balance: Math.max(0, card.balance - amount)
          }, { skipActivityLog: true });

          transaction.card_id = card.id;
          transaction.payment_method_name = card.name;
          
          let sourceName = 'Cash in Hand';
          if (paymentSource === 'cash_in_hand') {
            const currentCash = cashInHand || 0;
            if (amount > currentCash) {
              showToast.error(`Insufficient cash in hand. Available: ${formatCurrency(currentCash)}`);
              setSaving(false);
              return;
            }
            const newCash = currentCash - amount;
            if (onUpdateCashInHand) await onUpdateCashInHand(newCash);
            sourceName = 'Cash in Hand';
          } else if (paymentSource === 'bank_account' && paymentSourceId) {
            const account = bankAccounts?.find(a => a.id === paymentSourceId);
            if (!account) {
              alert('Selected bank account not found');
              setSaving(false);
              return;
            }
            const currentBalance = Number(account.balance) || 0;
            if (amount > currentBalance) {
              alert(`Insufficient funds in ${account.name}. Available: ${formatCurrency(currentBalance)}`);
              setSaving(false);
              return;
            }
            const { updateBankAccountBalance } = await import('../utils/db');
            await updateBankAccountBalance(account.id, currentBalance - amount);
            await onUpdateCash(null, { syncOnly: true });
            sourceName = account.name;
          } else if (paymentSource === 'reserved_fund' && paymentSourceId) {
            const fund = reservedFunds?.find(f => f.id === paymentSourceId);
            if (!fund) {
              alert('Selected reserved fund not found');
              setSaving(false);
              return;
            }
            const fundAmount = Number(fund.amount) || 0;
            if (amount > fundAmount) {
              alert(`Insufficient funds in ${fund.name}. Available: ${formatCurrency(fundAmount)}`);
              setSaving(false);
              return;
            }
            await dbOperation('reservedFunds', 'put', {
              ...fund,
              amount: fundAmount - amount,
              last_paid_date: formData.date
            }, { skipActivityLog: true });
            sourceName = fund.name;
          }

          const newCardBalance = Math.max(0, card.balance - amount);
          
          activityDetails = {
            actionType: 'payment',
            entityType: 'card',
            entityId: card.id,
            entityName: card.name,
            description: `Made payment of ${formatCurrency(amount)} for '${card.name}' from ${sourceName} - Balance ${formatCurrency(previousCardBalance)} → ${formatCurrency(newCardBalance)}`,
            snapshot: {
              entity: { ...card },
              paymentAmount: amount,
              date: formData.date,
              previousBalance: previousCardBalance,
              paymentSource,
              paymentSourceId,
              paymentSourceName: sourceName,
              paymentMethodName: card.name
            }
          };

        } else if (formData.paymentMethod === 'loan') {
          const loan = loans.find(l => l.id === formData.paymentMethodId);
          if (!loan) {
            alert('Please select a loan');
            setSaving(false);
            return;
          }

          const previousLoanBalance = loan.balance;

          await dbOperation('loans', 'put', {
            ...loan,
            balance: Math.max(0, loan.balance - amount)
          }, { skipActivityLog: true });

          transaction.loan_id = loan.id;
          transaction.payment_method_name = loan.name;
          
          let sourceName = 'Cash in Hand';
          if (paymentSource === 'cash_in_hand') {
            const currentCash = cashInHand || 0;
            if (amount > currentCash) {
              alert(`Insufficient cash in hand. Available: ${formatCurrency(currentCash)}`);
              setSaving(false);
              return;
            }
            const newCash = currentCash - amount;
            if (onUpdateCashInHand) await onUpdateCashInHand(newCash);
            sourceName = 'Cash in Hand';
          } else if (paymentSource === 'bank_account' && paymentSourceId) {
            const account = bankAccounts?.find(a => a.id === paymentSourceId);
            if (!account) {
              alert('Selected bank account not found');
              setSaving(false);
              return;
            }
            const currentBalance = Number(account.balance) || 0;
            if (amount > currentBalance) {
              alert(`Insufficient funds in ${account.name}. Available: ${formatCurrency(currentBalance)}`);
              setSaving(false);
              return;
            }
            const { updateBankAccountBalance } = await import('../utils/db');
            await updateBankAccountBalance(account.id, currentBalance - amount);
            await onUpdateCash(null, { syncOnly: true });
            sourceName = account.name;
          } else if (paymentSource === 'reserved_fund' && paymentSourceId) {
            const fund = reservedFunds?.find(f => f.id === paymentSourceId);
            if (!fund) {
              alert('Selected reserved fund not found');
              setSaving(false);
              return;
            }
            const fundAmount = Number(fund.amount) || 0;
            if (amount > fundAmount) {
              alert(`Insufficient funds in ${fund.name}. Available: ${formatCurrency(fundAmount)}`);
              setSaving(false);
              return;
            }
            await dbOperation('reservedFunds', 'put', {
              ...fund,
              amount: fundAmount - amount,
              last_paid_date: formData.date
            }, { skipActivityLog: true });
            sourceName = fund.name;
          }

          const newLoanBalance = Math.max(0, loan.balance - amount);
          
          activityDetails = {
            actionType: 'payment',
            entityType: 'loan',
            entityId: loan.id,
            entityName: loan.name,
            description: `Made payment of ${formatCurrency(amount)} for '${loan.name}' from ${sourceName} - Balance ${formatCurrency(previousLoanBalance)} → ${formatCurrency(newLoanBalance)}`,
            snapshot: {
              entity: { ...loan },
              paymentAmount: amount,
              date: formData.date,
              previousBalance: previousLoanBalance,
              paymentSource,
              paymentSourceId,
              paymentSourceName: sourceName,
              paymentMethodName: loan.name
            }
          };
        }
      }

      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

      if (activityDetails) {
        const snapshotWithTransaction = {
          ...(activityDetails.snapshot || {}),
          transactionId: savedTransaction?.id
        };
        await logActivity(
          activityDetails.actionType,
          activityDetails.entityType,
          activityDetails.entityId,
          activityDetails.entityName,
          activityDetails.description,
          snapshotWithTransaction
        );
      }

      if (savedTransaction?.id) {
        addRecentTransaction(savedTransaction.id).catch(err => 
          console.warn('Failed to track recent transaction:', err)
        );
      }
      if (formData.categoryId) {
        addRecentCategory(formData.categoryId).catch(err => 
          console.warn('Failed to track recent category:', err)
        );
      }
      if (paymentMethodString) {
        addRecentPaymentMethod(paymentMethodString).catch(err => 
          console.warn('Failed to track recent payment method:', err)
        );
      }

      await onUpdate();
      onClose();
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('Error adding transaction. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto`}>
        <div className={`sticky top-0 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b p-4 flex justify-between items-center`}>
          <h2 className="text-xl font-bold">Add Transaction</h2>
          <button onClick={onClose} className={`${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Transaction Type */}
          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ 
                  ...formData, 
                  type: 'expense', 
                  paymentMethod: primaryBank ? 'bank_account' : 'cash_in_hand', 
                  paymentMethodId: primaryBank?.id || null 
                })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  formData.type === 'expense'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'income', paymentMethod: 'cash', paymentMethodId: null })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  formData.type === 'income'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                Income
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'payment', paymentMethod: 'credit_card', paymentMethodId: null })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  formData.type === 'payment'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                Payment
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium mb-2">Amount *</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              placeholder="0.00"
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium mb-2">Date *</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              required
            />
          </div>

          {/* Quick-Select Expense Buttons (for expenses only) */}
          {formData.type === 'expense' && recentExpenses.length > 0 && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Recent Expenses
              </label>
              <div className="flex gap-2 flex-wrap">
                {recentExpenses.map(expense => (
                  <button
                    key={expense.description}
                    type="button"
                    onClick={() => handleSelectExpense(expense)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      formData.description === expense.description
                        ? 'bg-blue-600 text-white'
                        : darkMode 
                          ? 'bg-blue-900 text-blue-200 hover:bg-blue-800 border border-blue-700'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'
                    }`}
                  >
                    {expense.description}
                    {expense.usage_count > 10 && ' ⭐'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description/Source Input */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {formData.type === 'income' ? 'Source *' : recentExpenses.length > 0 && formData.type === 'expense' ? 'Or type new expense *' : 'Description *'}
            </label>
            <input
              ref={formData.type === 'expense' ? descriptionInputRef : null}
              type="text"
              value={formData.type === 'income' ? formData.incomeSource : formData.description}
              onChange={(e) => {
                if (formData.type === 'income') {
                  setFormData({ ...formData, incomeSource: e.target.value });
                } else {
                  handleDescriptionChange(e.target.value);
                }
              }}
              onBlur={formData.type === 'expense' ? handleDescriptionBlur : undefined}
              placeholder={formData.type === 'income' ? 'Salary, Freelance, etc.' : 'Coffee, Gas, Groceries, etc.'}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              required
              autoFocus={formData.type === 'expense' && recentExpenses.length === 0}
            />
          </div>

          {/* Category (only for expenses) */}
          {formData.type === 'expense' && (
            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="">Select category</option>
                {recentCategories.length > 0 && (
                  <optgroup label="Recent">
                    {recentCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="All Categories">
                  {categories.filter(c => !c.is_income).map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}
          
          {/* Payment Type Selector (for payments) */}
          {formData.type === 'payment' && (
            <div>
              <label className="block text-sm font-medium mb-2">Payment Type *</label>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, paymentMethod: 'credit_card', paymentMethodId: null })}
                  className={`p-3 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${
                    formData.paymentMethod === 'credit_card'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20'
                      : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <CreditCardIcon size={18} />
                  Credit Card
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, paymentMethod: 'loan', paymentMethodId: null })}
                  className={`p-3 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${
                    formData.paymentMethod === 'loan'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20'
                      : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <TrendingUp size={18} />
                  Loan
                </button>
              </div>
            </div>
          )}
          
          {/* Payment Source (for payments) */}
          {formData.type === 'payment' && (
            <div>
              <label className="block text-sm font-medium mb-2">Pay From *</label>
              <select
                value={formData.paymentSourceId ? `${formData.paymentSource}:${formData.paymentSourceId}` : formData.paymentSource}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'cash_in_hand') {
                    setFormData({ ...formData, paymentSource: 'cash_in_hand', paymentSourceId: null });
                  } else if (value.includes(':')) {
                    const [source, id] = value.split(':');
                    setFormData({ ...formData, paymentSource: source, paymentSourceId: id });
                  }
                }}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value="cash_in_hand">Cash in Hand ({formatCurrency(cashInHand || 0)})</option>
                {bankAccounts && bankAccounts.length > 0 && (
                  <optgroup label="Bank Accounts">
                    {bankAccounts.map(account => (
                      <option key={account.id} value={`bank_account:${account.id}`}>
                        {account.name} ({formatCurrency(account.balance)})
                      </option>
                    ))}
                  </optgroup>
                )}
                {reservedFunds && reservedFunds.filter(f => f.amount > 0).length > 0 && (
                  <optgroup label="Reserved Funds">
                    {reservedFunds.filter(f => f.amount > 0).map(fund => (
                      <option key={fund.id} value={`reserved_fund:${fund.id}`}>
                        {fund.name} ({formatCurrency(fund.amount)})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}
          
          {/* Income Destination */}
          {formData.type === 'income' && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Where is this money going? *
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="incomeDestination"
                    value="bank"
                    checked={formData.incomeDestination === 'bank'}
                    onChange={(e) => setFormData({ ...formData, incomeDestination: e.target.value })}
                    className="w-4 h-4"
                  />
                  <Building2 size={16} className="text-gray-500" />
                  <span className="text-sm">Deposit to Bank Account</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="incomeDestination"
                    value="cash_in_hand"
                    checked={formData.incomeDestination === 'cash_in_hand'}
                    onChange={(e) => setFormData({ ...formData, incomeDestination: e.target.value })}
                    className="w-4 h-4"
                  />
                  <Wallet size={16} className="text-gray-500" />
                  <span className="text-sm">Keep as Cash in Hand</span>
                </label>
              </div>
              
              {formData.incomeDestination === 'bank' && bankAccounts && bankAccounts.length > 0 && (
                <div className="mt-2">
                  <select
                    value={formData.incomeAccountId}
                    onChange={(e) => setFormData({ ...formData, incomeAccountId: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                  >
                    <option value="">Select account</option>
                    {bankAccounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name} {account.is_primary ? '(Primary)' : ''} - {formatCurrency(account.balance)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Payment Method for Expenses */}
          {formData.type === 'expense' && (
            <div>
              <label className="block text-sm font-medium mb-2">Payment Method *</label>
              <select
                value={formData.paymentMethodId ? `${formData.paymentMethod}:${formData.paymentMethodId}` : formData.paymentMethod}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'cash_in_hand') {
                    setFormData({ ...formData, paymentMethod: 'cash_in_hand', paymentMethodId: null });
                  } else if (value.includes(':')) {
                    const [method, id] = value.split(':');
                    setFormData({ ...formData, paymentMethod: method, paymentMethodId: id });
                  }
                }}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                required
              >
                {recentPaymentMethods.length > 0 && (
                  <optgroup label="Recent">
                    {recentPaymentMethods.map(pm => (
                      <option 
                        key={pm.id || 'cash_in_hand'} 
                        value={pm.type === 'cash_in_hand' ? 'cash_in_hand' : `${pm.type}:${pm.id}`}
                      >
                        {pm.name}
                        {pm.type === 'bank_account' && pm.balance !== undefined && ` ($${pm.balance.toFixed(2)} available)`}
                        {pm.isPrimary && ' ★'}
                      </option>
                    ))}
                  </optgroup>
                )}
                
                <optgroup label="Cash & Bank Accounts">
                  <option value="cash_in_hand">Cash in Hand (${(cashInHand || 0).toFixed(2)} available)</option>
                  {bankAccounts && bankAccounts.length > 0 && bankAccounts.map(account => (
                    <option key={account.id} value={`bank_account:${account.id}`}>
                      {account.name} (${account.balance.toFixed(2)} available){account.is_primary ? ' ★' : ''}
                    </option>
                  ))}
                </optgroup>
                
                {creditCards && creditCards.filter(c => !c.is_gift_card).length > 0 && (
                  <optgroup label="Credit Cards">
                    {creditCards.filter(c => !c.is_gift_card).map(card => (
                      <option key={card.id} value={`credit_card:${card.id}`}>
                        {card.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                
                {creditCards && creditCards.filter(c => c.is_gift_card && c.balance > 0).length > 0 && (
                  <optgroup label="Gift Cards">
                    {creditCards.filter(c => c.is_gift_card && c.balance > 0).map(card => (
                      <option key={card.id} value={`credit_card:${card.id}`}>
                        {card.name} (${card.balance.toFixed(2)} available)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {/* Payment Method Selection for Payments */}
          {formData.type === 'payment' && (
            <div>
              <label className="block text-sm font-medium mb-2">Pay To *</label>
              <select
                value={formData.paymentMethodId || ''}
                onChange={(e) => setFormData({ ...formData, paymentMethodId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                required
              >
                <option value="">Select {formData.paymentMethod === 'credit_card' ? 'credit card' : 'loan'}</option>
                {formData.paymentMethod === 'credit_card' && creditCards && creditCards.map(card => (
                  <option key={card.id} value={card.id}>
                    {card.name} {card.is_gift_card ? `($${card.balance.toFixed(2)} balance)` : `($${card.balance.toFixed(2)} owed)`}
                  </option>
                ))}
                {formData.paymentMethod === 'loan' && loans && loans.map(loan => (
                  <option key={loan.id} value={loan.id}>
                    {loan.name} (${loan.balance.toFixed(2)} remaining)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-2">Notes (Optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              rows="3"
              placeholder="Additional details..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-2 rounded-lg border ${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
