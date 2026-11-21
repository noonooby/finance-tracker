import React, { useState, useEffect } from 'react';
import { Plus, Minus, X, TrendingUp, Star } from 'lucide-react';
import { formatCurrency, parseSmartInput, defaultBankAccount } from '../../utils/helpers';
import ActionButton from '../shared/ActionButton';
import { showToast } from '../../utils/toast';
import {
  getGiftCardAddBalanceContext,
  saveGiftCardAddBalanceContext,
  getRecentGiftCardAmounts
} from '../../utils/formContexts';
import {
  getExpenseContext,
  saveExpenseContext,
  getRecentExpenseDescriptions,
  applyExpenseContext
} from '../../utils/formContexts';
import { localDate } from '../../utils/helpers';

/**
 * Gift Card Operations Modal
 * Handles Add Balance and Use Balance operations
 */
export default function GiftCardOperations({
  darkMode,
  giftCard,
  creditCards,
  bankAccounts,
  categories,
  onAddBalance,
  onUseBalance,
  onClose,
  processing
}) {
  const [operationType, setOperationType] = useState('add'); // 'add' or 'use'
  const account = defaultBankAccount(bankAccounts);
  const defaultSource = account ? 'bank_account' : '';
  const defaultSourceId = account?.id || null;
  const [formData, setFormData] = useState({
    amount: '',
    amountPaid: '', // Different from amount when bonus is applied
    date: localDate(),
    paymentSource: defaultSource,
    paymentSourceId: defaultSourceId,
    category: '',
    notes: ''
  });
  const [smartInputValue, setSmartInputValue] = useState('');
  const [recentAmounts, setRecentAmounts] = useState([]);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [contextLoaded, setContextLoaded] = useState(false);

  // Load context when modal opens or operation type changes
  useEffect(() => {
    loadContext();
  }, [operationType, giftCard.id]); // eslint-disable-line

  const loadContext = async () => {
    try {
      setContextLoaded(false);
      
      // Load recent amounts
      const amounts = await getRecentGiftCardAmounts(giftCard.id, 5);
      setRecentAmounts(amounts);
      
      if (operationType === 'add') {
        // Load gift card add balance context
        const savedContext = await getGiftCardAddBalanceContext(giftCard.id);
        
        if (savedContext) {
          
          setFormData(prev => ({
            ...prev,
            ...savedContext,
            date: localDate()
          }));
          
          if (savedContext.amount) {
            const amountStr = typeof savedContext.amount === 'number' 
              ? savedContext.amount.toFixed(2) 
              : savedContext.amount.toString();
            setSmartInputValue(amountStr);
          }
        } else {
          // Reset for add balance
          setFormData(prev => ({
            ...prev,
            amount: '',
            amountPaid: '',
            paymentSource: defaultSource,
            paymentSourceId: defaultSourceId,
            category: getDefaultCategory(),
            notes: ''
          }));
          setSmartInputValue('');
        }
      } else {
        // Load recent expense descriptions for use balance
        const recent = await getRecentExpenseDescriptions(5);
        setRecentExpenses(recent);
        
        // Reset form for use balance
        setFormData(prev => ({
          ...prev,
          amount: '',
          amountPaid: '',
          category: getDefaultCategory(),
          notes: '' // This becomes the expense description
        }));
        setSmartInputValue('');
      }
      
      setContextLoaded(true);
    } catch (error) {
      console.error('Error loading gift card context:', error);
      setContextLoaded(true);
    }
  };

  // Get default category based on operation
  const getDefaultCategory = () => {
    if (operationType === 'add') {
      return categories.find(c => c.id === 'gift_card_purchase' || c.name === 'Gift Card Purchase')?.id || 
             categories[0]?.id || '';
    }
    return categories[0]?.id || '';
  };

  const handleSmartAmountChange = (e) => {
    const value = e.target.value;
    setSmartInputValue(value);
    
    const parsed = parseSmartInput(value);
    if (parsed !== null) {
      setFormData({ ...formData, amount: parsed.toFixed(2) });
    } else {
      setFormData({ ...formData, amount: value });
    }
  };

  const handleSmartAmountBlur = () => {
    if (formData.amount && !isNaN(formData.amount)) {
      const numValue = parseFloat(formData.amount);
      setSmartInputValue(numValue.toFixed(2));
    }
  };

  const handleSubmit = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      showToast.error('Enter a valid amount');
      return;
    }

    if (!formData.category) {
      showToast.error('Select a category');
      return;
    }

    if (operationType === 'add' && !formData.paymentSourceId) {
      showToast.error('Choose how you paid');
      return;
    }

    if (operationType === 'use' && !formData.notes?.trim()) {
      showToast.error('Enter what you\'re buying');
      return;
    }

    // Save context before submitting
    try {
      if (operationType === 'add') {
        await saveGiftCardAddBalanceContext(formData, giftCard);
        // Map paymentSource to paymentMethod for the handler
        const mappedData = {
          ...formData,
          paymentMethod: formData.paymentSource,
          paymentMethodId: formData.paymentSourceId
        };
        await onAddBalance(mappedData);
      } else {
        // Save expense context (same as AddTransaction flow)
        if (formData.notes?.trim()) {
          await saveExpenseContext(formData.notes.trim(), {
            categoryId: formData.category,
            paymentMethod: 'credit_card',
            paymentMethodId: giftCard.id
          });
        }
        await onUseBalance(formData);
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
    }
  };

  const handlePaymentSourceChange = (value) => {
    if (!value.includes(':')) {
      setFormData({
        ...formData,
        paymentSource: '',
        paymentSourceId: null
      });
    } else {
      const [method, id] = value.split(':');
      setFormData({
        ...formData,
        paymentSource: method,
        paymentSourceId: id
      });
    }
  };

  const getCurrentPaymentSourceValue = () => {
    return formData.paymentSourceId 
      ? `${formData.paymentSource}:${formData.paymentSourceId}`
      : '';
  };

  // Handle expense context application (for Use Balance flow)
  const handleExpenseDescriptionChange = (value) => {
    setFormData({ ...formData, notes: value });
  };

  const handleExpenseDescriptionBlur = async () => {
    if (!formData.notes?.trim() || operationType !== 'use') return;
    try {
      const context = await getExpenseContext(formData.notes.trim());
      if (context) {
        const contextData = applyExpenseContext(context);
        setFormData(prev => ({ 
          ...prev, 
          category: contextData.categoryId || prev.category
        }));
      }
    } catch (error) {
      console.error('Error loading expense context:', error);
    }
  };

  const handleSelectExpense = async (expenseContext) => {
    try {
      const contextData = applyExpenseContext(expenseContext);
      setFormData(prev => ({
        ...prev,
        notes: expenseContext.description,
        category: contextData.categoryId || prev.category
      }));
      
      setTimeout(() => {
        const amountInput = document.querySelector('input[placeholder*="0.00"]');
        if (amountInput) amountInput.focus();
      }, 50);
    } catch (error) {
      console.error('Error applying expense context:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Manage balance: ${giftCard.name}`}
        className={`bg-surface rounded-2xl p-6 max-w-md w-full my-8 max-h-[calc(100vh-4rem)] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{giftCard.name}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`text-2xl leading-none text-muted hover:text-fg`}
          >
            <X size={24} />
          </button>
        </div>

        <div className={`p-3 rounded-2xl mb-4 bg-surface-2`}>
          <div className="text-sm text-muted">Current Balance</div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(giftCard.balance)}</div>
        </div>

        {/* Operation Type Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setOperationType('add')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors font-medium ${
              operationType === 'add'
                ? 'border-accent bg-accent text-accent-contrast'
                : 'border-line hover:border-accent text-fg'
            }`}
          >
            <Plus size={18} />
            Add Balance
          </button>
          <button
            type="button"
            onClick={() => setOperationType('use')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors font-medium ${
              operationType === 'use'
                ? 'border-accent bg-accent text-accent-contrast'
                : 'border-line hover:border-accent text-fg'
            }`}
          >
            <Minus size={18} />
            Use Balance
          </button>
        </div>
        
        {/* Context Loaded Indicator */}
        {contextLoaded && (formData.amount || formData.category) && (
          <div className={`mb-3 p-2 rounded-lg text-xs flex items-center gap-2 ${
            'bg-accent-soft text-accent border border-accent/30'
          }`}>
            <TrendingUp size={14} />
            <span>Pre-filled with your last used values</span>
          </div>
        )}

        {/* Recent Expenses Quick Select (Use Balance only) */}
        {operationType === 'use' && recentExpenses.length > 0 && (
          <div className="mb-4">
            <label className={`block text-sm font-medium mb-2 text-fg`}>
              Recent Expenses
            </label>
            <div className="flex gap-2 flex-wrap">
              {recentExpenses.map(expense => (
                <button
                  key={expense.description}
                  type="button"
                  onClick={() => handleSelectExpense(expense)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    formData.notes === expense.description
                      ? 'bg-accent text-accent-contrast'
                      : 'bg-accent-soft text-accent hover:bg-accent-soft border border-accent/30'
                  }`}
                >
                  {expense.description}
                  {expense.usage_count > 10 && <Star size={12} className="inline ml-1" aria-label="Frequently used" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Description/Notes (Use Balance only) */}
        {operationType === 'use' && (
          <div className="mb-4">
            <label className={`block text-sm font-medium mb-1 text-fg`}>
              {recentExpenses.length > 0 ? 'Or type new expense *' : 'What are you buying? *'}
            </label>
            <input
              type="text"
              placeholder="e.g., Coffee, Gas, Lunch"
              value={formData.notes}
              onChange={(e) => handleExpenseDescriptionChange(e.target.value)}
              onBlur={handleExpenseDescriptionBlur}
              className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
              autoFocus={operationType === 'use' && recentExpenses.length === 0 && contextLoaded}
            />
            <p className={`text-xs mt-1 text-muted`}>
              This becomes your expense description (like "Coffee" instead of "Purchased with Starbucks")
            </p>
          </div>
        )}

        <div className="space-y-3">
          {/* Amount */}
          <div>
            <label className={`block text-sm font-medium mb-1 text-fg`}>
              Amount *
            </label>
            
            {/* Recent Amounts Quick Select */}
            {recentAmounts.length > 0 && (
              <div className="mb-2">
                <div className={`flex items-center gap-1 mb-1 text-muted`}>
                  <TrendingUp size={14} />
                  <span className="text-xs">Recent amounts:</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {recentAmounts.map((amount, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, amount: amount.toFixed(2) });
                        setSmartInputValue(amount.toFixed(2));
                      }}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        parseFloat(formData.amount) === amount
                          ? 'bg-accent text-accent-contrast'
                          : 'bg-surface-2 text-fg hover:bg-line/60 border border-line'
                      }`}
                    >
                      {formatCurrency(amount)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <input
              type="text"
              placeholder="0.00 or 5+3 or 10*2"
              value={smartInputValue}
              onChange={handleSmartAmountChange}
              onBlur={handleSmartAmountBlur}
              className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
              autoFocus={contextLoaded}
            />
            {smartInputValue && formData.amount && smartInputValue !== formData.amount && (
              <p className={`text-xs mt-1 text-positive`}>
                = {formatCurrency(formData.amount)}
              </p>
            )}
          </div>

          {/* Amount Paid (only for Add Balance) */}
          {operationType === 'add' && (
            <div>
              <label className={`block text-sm font-medium mb-1 text-fg`}>
                Amount Paid (optional)
              </label>
              <input
                type="text"
                placeholder="Same as amount added"
                value={formData.amountPaid}
                onChange={(e) => setFormData({ ...formData, amountPaid: e.target.value })}
                className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
              />
              <p className={`text-xs mt-1 text-muted`}>
                For bonus scenarios: e.g., paid $50 but got $55 loaded
              </p>
            </div>
          )}

          {/* Payment Source (only for Add Balance) */}
          {operationType === 'add' && (
            <div>
              <label className={`block text-sm font-medium mb-1 text-fg`}>
                Payment Source *
              </label>
              <select
                value={getCurrentPaymentSourceValue()}
                onChange={(e) => handlePaymentSourceChange(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
              >
                <option value="">Choose how you paid</option>
                
                {bankAccounts && bankAccounts.length > 0 && (
                  <optgroup label="Accounts">
                    {bankAccounts.map(account => (
                      <option key={account.id} value={`bank_account:${account.id}`}>
                        {account.name} ({formatCurrency(account.balance)})
                      </option>
                    ))}
                  </optgroup>
                )}
                
                {creditCards && creditCards.filter(c => !c.is_gift_card).length > 0 && (
                  <optgroup label="Credit Cards">
                    {creditCards.filter(card => !card.is_gift_card).map(card => (
                      <option key={card.id} value={`credit_card:${card.id}`}>
                        {card.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {/* Category */}
          <div>
            <label className={`block text-sm font-medium mb-1 text-fg`}>
              Category *
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
            >
              <option value="">Select category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <p className={`text-xs mt-1 text-muted`}>
              {operationType === 'add' 
                ? 'Use "Gift Card Purchase" for reloads, or actual category if you know future use'
                : 'What are you buying with this gift card?'}
            </p>
          </div>

          {/* Date */}
          <div>
            <label className={`block text-sm font-medium mb-1 text-fg`}>
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
            />
          </div>

          {/* Notes (Add Balance only) */}
          {operationType === 'add' && (
            <div>
              <label className={`block text-sm font-medium mb-1 text-fg`}>
                Notes (optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Birthday gift reload"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
              />
            </div>
          )}

          {/* Preview */}
          <div className={`p-3 rounded-lg bg-accent-soft border border-accent/30`}>
            <div className={`text-xs font-medium mb-1 text-accent`}>
              Preview:
            </div>
            <div className={`text-sm text-accent`}>
              {operationType === 'add' ? (
                <>Balance will increase: {formatCurrency(giftCard.balance)} → {formatCurrency(giftCard.balance + (parseFloat(formData.amount) || 0))}</>
              ) : (
                <>Balance will decrease: {formatCurrency(giftCard.balance)} → {formatCurrency(giftCard.balance - (parseFloat(formData.amount) || 0))}</>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          <ActionButton
            onClick={onClose}
            variant="secondary"
            idleText="Cancel"
            fullWidth
          />
          <ActionButton
            onClick={handleSubmit}
            processing={processing}
            variant={operationType === 'add' ? 'success' : 'primary'}
            processingText={operationType === 'add' ? 'Adding Balance...' : 'Recording Usage...'}
            idleText={operationType === 'add' ? 'Add Balance' : 'Use Balance'}
            fullWidth
          />
        </div>
      </div>
    </div>
  );
}
