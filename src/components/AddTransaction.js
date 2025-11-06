import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, CreditCard as CreditCardIcon, TrendingUp } from 'lucide-react';
import { dbOperation } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import { formatCurrency } from '../utils/helpers';
import { useTransactionOperations } from '../hooks/transactions';
import { showToast } from '../utils/toast';
import CategorySelect from './shared/CategorySelect';
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
  categories: categoriesProp,
  creditCards,
  loans,
  availableCash,
  onUpdateCash,
  bankAccounts,
  preselectedCard = null,
  preselectedLoan = null,
  preselectedType = 'expense',
  preselectedAmount = '',
  cashInHand = 0,
  onUpdateCashInHand = null
}) {
  // Get primary bank account for default selection
  const primaryBank = bankAccounts?.find(acc => acc.is_primary);
  const defaultPaymentMethod = preselectedCard ? 'credit_card' : preselectedLoan ? 'loan' : (primaryBank ? 'bank_account' : 'cash_in_hand');
  const defaultPaymentMethodId = preselectedCard?.id || preselectedLoan?.id || (primaryBank?.id || null);
  
  // Validate preselectedType
  const validatedType = ['expense', 'payment'].includes(preselectedType) ? preselectedType : 'expense';

  // Add new state for payment forms
  const [formData, setFormData] = useState({
    type: validatedType,
    amount: preselectedAmount || '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    notes: '',
    categoryId: '',
    paymentMethod: defaultPaymentMethod,
    paymentMethodId: defaultPaymentMethodId,
    paymentSource: 'cash_in_hand',
    paymentSourceId: null,
    amountMode: 'recommended',
    category: 'other'
  });

  const [localCategories, setLocalCategories] = useState(categoriesProp);
  const [saving, setSaving] = useState(false);
  const [recentCategories, setRecentCategories] = useState([]);
  const [recentPaymentMethods, setRecentPaymentMethods] = useState([]);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const descriptionInputRef = useRef(null);
  
  // Initialize transaction operations hook
  const { processTransaction, processing } = useTransactionOperations({
    creditCards,
    loans,
    bankAccounts,
    cashInHand,
    onUpdateCashInHand,
    availableCash,
    onUpdateCash,
    categories: localCategories,
    onUpdate
  });
  
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
    setLocalCategories(categoriesProp);
  }, [categoriesProp]);

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
        .map(id => localCategories.find(c => c.id === id))
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
    
    // Prevent duplicate submissions
    if (saving) {
      return;
    }
    
    setSaving(true);

    // Validate amount
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      showToast.error('Please enter a valid amount');
      return;
    }

    // Prepare form data for unified processing
    const transactionData = {
      type: formData.type,
      amount,
      date: formData.date,
      description: formData.description,
      notes: formData.notes,
      categoryId: formData.categoryId,
      
      // Payment method info
      paymentMethod: formData.paymentMethod,
      paymentMethodId: formData.paymentMethodId,
      
      // Payment source info (for payments)
      paymentSource: formData.paymentSource,
      paymentSourceId: formData.paymentSourceId,
      amountMode: formData.amountMode,
      category: formData.category
    };

    // Process transaction through unified hook
    const result = await processTransaction(transactionData);
    
    if (result?.success) {
      // Show success message based on transaction type
      if (formData.type === 'expense') {
        showToast.success(`Expense '${result.description || formData.description}' logged successfully`);
      } else if (formData.type === 'payment') {
        if (formData.paymentMethod === 'credit_card') {
          showToast.success(`Payment of ${formatCurrency(amount)} processed for ${result.cardName}`);
        } else if (formData.paymentMethod === 'loan') {
          showToast.success(`Payment of ${formatCurrency(amount)} processed for ${result.loanName}`);
        }
      }
      
      onClose();
    } else {
      showToast.error(`Failed to save transaction: ${result?.error || 'Unknown error'}`);
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
            <div className="grid grid-cols-2 gap-2">
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

          {/* Description Input */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {recentExpenses.length > 0 && formData.type === 'expense' ? 'Or type new expense *' : 'Description *'}
            </label>
            <input
              ref={formData.type === 'expense' ? descriptionInputRef : null}
              type="text"
              value={formData.description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              onBlur={formData.type === 'expense' ? handleDescriptionBlur : undefined}
              placeholder="Coffee, Gas, Groceries, etc."
              className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              required
              autoFocus={formData.type === 'expense' && recentExpenses.length === 0}
            />
          </div>

          {/* Category (only for expenses) */}
          {formData.type === 'expense' && (
            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <CategorySelect
                categories={localCategories.filter(c => !c.is_income)}
                value={formData.categoryId}
                onChange={(categoryId) => setFormData({ ...formData, categoryId })}
                darkMode={darkMode}
                placeholder="Search or create category..."
                onCategoryCreated={(newCategory) => {
                  // Add new category to local state
                  setLocalCategories(prev => [...prev, newCategory]);
                  // Notify parent to reload
                  if (onUpdate) onUpdate();
                }}
              />
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
                {creditCards && creditCards.length > 0 && (
                  <optgroup label="Credit Cards (Pay with Card)">
                    {creditCards.map(card => (
                      <option key={card.id} value={`credit_card:${card.id}`}>
                        {card.name} (Balance: {formatCurrency(card.balance)})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
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
              disabled={processing}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? 'Saving...' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
