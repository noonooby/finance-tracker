import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, CreditCard as CreditCardIcon, TrendingUp } from 'lucide-react';
import { formatCurrency, defaultBankAccount } from '../utils/helpers';
import { useTransactionOperations } from '../hooks/transactions';
import { showToast } from '../utils/toast';
import CategorySelect from './shared/CategorySelect';
import {
  getUserPreferences
} from '../utils/userPreferencesManager';
import {
  getExpenseContext,
  getRecentExpenseDescriptions,
  getLastUsedExpenseContext,
  applyExpenseContext
} from '../utils/formContexts';
import { localDate } from '../utils/helpers';
import { useFinanceData } from '../hooks/useFinanceData';
import { suggestCategoryId } from '../utils/categoryRules';
import { api } from '../utils/server';

// Purchases in another currency are recorded in dollars (CAD); the original amount, currency and rate are kept on the line.
const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'INR', 'MXN', 'JPY', 'AUD', 'CHF', 'CNY', 'HKD', 'SGD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'KRW', 'THB', 'PHP', 'BRL', 'ZAR', 'TRY', 'IDR', 'MYR'];

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
  preselectedAmount = ''
}) {
  // Default account (primary, else the first; cash is one of the accounts)
  const primaryBank = defaultBankAccount(bankAccounts);
  const defaultPaymentMethod = preselectedCard ? 'credit_card' : preselectedLoan ? 'loan' : (primaryBank ? 'bank_account' : '');
  const defaultPaymentMethodId = preselectedCard?.id || preselectedLoan?.id || (primaryBank?.id || null);
  
  // Validate preselectedType
  const validatedType = ['expense', 'payment'].includes(preselectedType) ? preselectedType : 'expense';

  // Add new state for payment forms
  const [formData, setFormData] = useState({
    type: validatedType,
    amount: preselectedAmount || '',
    date: localDate(),
    description: '',
    notes: '',
    categoryId: '',
    paymentMethod: defaultPaymentMethod,
    paymentMethodId: defaultPaymentMethodId,
    paymentSource: primaryBank ? 'bank_account' : '',
    paymentSourceId: primaryBank?.id || null,
    amountMode: 'recommended',
    category: 'other'
  });

  const [localCategories, setLocalCategories] = useState(categoriesProp);
  const { categoryRules } = useFinanceData();
  // The category the app filled in (from what you chose before). Your own choice is never replaced.
  const [autoCategory, setAutoCategory] = useState('');
  const [saving, setSaving] = useState(false);
  // Another currency: the amount as charged abroad, and the day's rate. The dollar amount stays yours to change
  // (the card's own rate and fees can differ); once you change it, the app stops filling it in.
  const [currency, setCurrency] = useState('CAD');
  const [foreign, setForeign] = useState('');
  const [fx, setFx] = useState({ rate: null, date: null, error: '', loading: false });
  const [ownCad, setOwnCad] = useState(false);
  // Split across categories: parts that must add up to the amount.
  const [splitOn, setSplitOn] = useState(false);
  const [parts, setParts] = useState([]);
  const [, setRecentCategories] = useState([]);
  const [recentPaymentMethods, setRecentPaymentMethods] = useState([]);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const descriptionInputRef = useRef(null);
  // A card is paid from an account or from another credit card: never from itself, and never from or to a gift card.
  const payFromCards = (creditCards || []).filter(c => !c.is_gift_card && !(formData.paymentMethod === 'credit_card' && String(c.id) === String(formData.paymentMethodId)));
  const payToName = ((formData.paymentMethod === 'loan' ? loans : creditCards) || []).find(x => String(x.id) === String(formData.paymentMethodId))?.name;
  
  // Initialize transaction operations hook
  const { processTransaction, processing } = useTransactionOperations({
    creditCards,
    loans,
    bankAccounts,
    availableCash,
    onUpdateCash,
    categories: localCategories,
    onUpdate
  });
  
  // Load expense contexts on mount
  const loadExpenseContexts = useCallback(async () => {
    try {
      if (formData.type === 'expense') {
        const recent = await getRecentExpenseDescriptions(5);
        setRecentExpenses(recent);
        
        // Pre-fill last used expense context only if no preselected card
        const lastContext = await getLastUsedExpenseContext();
        
        if (lastContext && !formData.description && !preselectedCard) {
          const contextData = applyExpenseContext(lastContext);
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
      console.error('Error loading expense contexts:', error);
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
      // The remembered entry for this exact description (if that lookup fails, learned categories still work).
      let contextData = {};
      try { const context = await getExpenseContext(formData.description); if (context) contextData = applyExpenseContext(context); } catch { contextData = {}; }
      const learned = contextData.categoryId || suggestCategoryId(categoryRules, formData.description, localCategories.filter(c => !c.is_income), false);
      setFormData(prev => {
        const mayFill = !prev.categoryId || prev.categoryId === autoCategory;
        const next = { ...prev };
        if (mayFill && learned) next.categoryId = learned;
        // The payment method from last time is used only when nothing else was chosen yet.
        if (!preselectedCard && contextData.paymentMethod && prev.paymentMethod === defaultPaymentMethod && String(prev.paymentMethodId) === String(defaultPaymentMethodId)) {
          next.paymentMethod = contextData.paymentMethod; next.paymentMethodId = contextData.paymentMethodId;
        }
        return next;
      });
      if (learned) setAutoCategory(learned);
    } catch (error) {
      console.error('Error loading expense context:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.description, formData.type, preselectedCard, categoryRules, localCategories, autoCategory]);
  
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
          if (pm.startsWith('credit_card:')) {
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

  useEffect(() => {
    if (currency === 'CAD') { setFx({ rate: null, date: null, error: '', loading: false }); return undefined; }
    let live = true;
    setFx((f) => ({ ...f, loading: true, error: '' }));
    api(`/api/fx?from=${currency}&date=${formData.date}`, null, 'GET')
      .then((r) => { if (live) setFx({ rate: r.rate, date: r.date, error: '', loading: false }); })
      .catch((e) => { if (live) setFx({ rate: null, date: null, error: e.message, loading: false }); });
    return () => { live = false; };
  }, [currency, formData.date]);
  useEffect(() => {
    if (currency === 'CAD' || ownCad || !fx.rate || !(Number(foreign) > 0)) return;
    setFormData((p) => ({ ...p, amount: (Math.round(Number(foreign) * fx.rate * 100) / 100).toFixed(2) }));
  }, [currency, foreign, fx.rate, ownCad]);

  const cents = (v) => Math.round((Number(v) || 0) * 100);
  const partsLeft = (cents(formData.amount) - parts.reduce((s, p) => s + cents(p.amount), 0)) / 100;
  const startSplit = () => {
    setSplitOn(true);
    setParts([{ categoryId: formData.categoryId || '', amount: '' }, { categoryId: '', amount: '' }]);
  };
  const setPart = (i, change) => setParts(parts.map((p, j) => (j === i ? { ...p, ...change } : p)));

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
      showToast.error('Enter an amount above zero.');
      setSaving(false);
      return;
    }
    const extra = {};
    if (currency !== 'CAD') {
      if (!(Number(foreign) > 0)) { showToast.error(`Enter the amount in ${currency}.`); setSaving(false); return; }
      Object.assign(extra, { original_amount: Math.round(Number(foreign) * 100) / 100, original_currency: currency, fx_rate: fx.rate || Math.round((amount / Number(foreign)) * 1e6) / 1e6 });
    }
    let categoryId = formData.categoryId;
    if (formData.type === 'expense' && splitOn) {
      const used = parts.filter((p) => Number(p.amount) > 0);
      if (used.length < 2) { showToast.error('A split needs at least two parts with an amount.'); setSaving(false); return; }
      if (Math.abs(partsLeft) >= 0.005) { showToast.error(`The parts must add up to ${formatCurrency(amount)}: ${formatCurrency(Math.abs(partsLeft))} ${partsLeft > 0 ? 'is not assigned yet' : 'too much'}.`); setSaving(false); return; }
      const cats = localCategories;
      extra.splits = used.map((p) => ({ category_id: p.categoryId || null, category_name: (cats.find((c) => String(c.id) === String(p.categoryId)) || {}).name || null, amount: Math.round(Number(p.amount) * 100) / 100 }));
      categoryId = [...used].sort((a, b) => Number(b.amount) - Number(a.amount))[0].categoryId || '';
    }

    // Prepare form data for unified processing
    const transactionData = {
      type: formData.type,
      amount,
      date: formData.date,
      description: String(formData.description || '').trim() || (formData.type === 'payment' ? `Payment to ${payToName || (formData.paymentMethod === 'loan' ? 'loan' : 'card')}` : ''),
      notes: formData.notes,
      categoryId,
      extra: Object.keys(extra).length ? extra : undefined,
      
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
    let result;
    try {
      result = await processTransaction(transactionData);
    } catch (err) {
      result = { success: false, error: err?.message };
    }
    // Whatever happened, the form can be used again (a refused save is corrected and saved a second time).
    setSaving(false);

    if (result?.success) {
      // Show success message based on transaction type
      if (formData.type === 'expense') {
        showToast.success(`Expense '${result.description || formData.description}' logged`);
      } else if (formData.type === 'payment') {
        if (formData.paymentMethod === 'credit_card') {
          showToast.success(`Payment of ${formatCurrency(amount)} processed for ${result.cardName}`);
        } else if (formData.paymentMethod === 'loan') {
          showToast.success(`Payment of ${formatCurrency(amount)} processed for ${result.loanName}`);
        }
      }
      
      onClose();
    } else {
      showToast.error(`Not saved. ${result?.error || 'Something went wrong; try again.'}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-label="Add transaction" className={`bg-surface rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto`}>
        <div className={`sticky top-0 bg-surface border-line border-b p-4 flex justify-between items-center`}>
          <h2 className="text-xl font-bold">Add Transaction</h2>
          <button onClick={onClose} aria-label="Close" className={`text-muted hover:text-fg`}>
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
                  paymentMethod: primaryBank ? 'bank_account' : '', 
                  paymentMethodId: primaryBank?.id || null 
                })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  formData.type === 'expense'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-line hover:border-accent'
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
                    : 'border-line hover:border-accent'
                }`}
              >
                Payment
              </button>
            </div>
          </div>

          {/* Amount, and the currency it was in */}
          <div>
            <label className="block text-sm font-medium mb-2" htmlFor="add-amount">{currency === 'CAD' ? 'Amount *' : `Amount in ${currency} *`}</label>
            <div className="flex gap-2">
              <input
                id="add-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={currency === 'CAD' ? formData.amount : foreign}
                onChange={(e) => (currency === 'CAD' ? setFormData({ ...formData, amount: e.target.value }) : setForeign(e.target.value))}
                className={`flex-1 min-w-0 px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
                placeholder="0.00"
                required
              />
              <select aria-label="Currency" value={currency} onChange={(e) => {
                const c = e.target.value;
                if (c !== 'CAD' && currency === 'CAD') setForeign(formData.amount);
                if (c === 'CAD' && currency !== 'CAD') setOwnCad(false);
                setCurrency(c);
              }} className="w-24 px-2 py-2 border rounded-xl border-line bg-surface-2 text-fg">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {currency !== 'CAD' && (
              <div className="mt-2 space-y-1">
                <label className="block text-sm font-medium" htmlFor="add-cad">Charged in CAD *</label>
                <input id="add-cad" type="number" inputMode="decimal" step="0.01" value={formData.amount} required placeholder="0.00"
                  onChange={(e) => { setOwnCad(true); setFormData({ ...formData, amount: e.target.value }); }}
                  className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`} />
                <p className="text-xs text-muted">
                  {fx.loading ? 'Looking up the rate...' : fx.error ? fx.error : fx.rate ? `1 ${currency} = ${fx.rate} CAD (published rate for ${fx.date}). Your card may charge a little more; enter what it charged if you know it.` : ''}
                  {ownCad && fx.rate && <> <button type="button" className="text-accent font-medium" onClick={() => setOwnCad(false)}>Use the rate</button></>}
                </p>
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium mb-2">Date *</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
              required
            />
          </div>

          {/* Quick-Select Expense Buttons (for expenses only) */}
          {formData.type === 'expense' && recentExpenses.length > 0 && (
            <div>
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
                      formData.description === expense.description
                        ? 'bg-accent text-accent-contrast'
                        : 'bg-accent-soft text-accent hover:bg-accent-soft border border-accent/30'
                    }`}
                  >
                    {expense.description}
                    {expense.usage_count > 10 && ' (frequent)'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description Input */}
          <div>
            <label className={`block text-sm font-medium mb-2 text-fg`}>
              {formData.type === 'payment' ? 'Description' : recentExpenses.length > 0 && formData.type === 'expense' ? 'Or type new expense *' : 'Description *'}
            </label>
            <input
              ref={formData.type === 'expense' ? descriptionInputRef : null}
              type="text"
              value={formData.description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              onBlur={formData.type === 'expense' ? handleDescriptionBlur : undefined}
              placeholder={formData.type === 'payment' ? 'Optional' : 'Coffee, Gas, Groceries, etc.'}
              className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
              required={formData.type !== 'payment'}
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
                onChange={(categoryId) => { setFormData({ ...formData, categoryId }); setAutoCategory(''); }}
                darkMode={darkMode}
                placeholder="Search or create category..."
                onCategoryCreated={(newCategory) => {
                  // Add new category to local state
                  setLocalCategories(prev => [...prev, newCategory]);
                  // Notify parent to reload
                  if (onUpdate) onUpdate();
                }}
              />
              {autoCategory && formData.categoryId === autoCategory && !splitOn && (
                <p className="mt-1 text-xs text-muted">Filled in from what you chose before for this merchant. Change it if it is wrong; the app learns from that too.</p>
              )}
              {!splitOn ? (
                <button type="button" onClick={startSplit} className="mt-2 text-xs font-medium text-accent">Split across categories</button>
              ) : (
                <div className="mt-3 space-y-2 rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Split</span>
                    <button type="button" className="text-xs text-accent" onClick={() => { setSplitOn(false); setParts([]); }}>No split</button>
                  </div>
                  {parts.map((p, i) => (
                    <div key={i} className="flex gap-2">
                      <select aria-label={`Category for part ${i + 1}`} value={p.categoryId} onChange={(e) => setPart(i, { categoryId: e.target.value })}
                        className="flex-1 min-w-0 px-2 py-2 border rounded-xl border-line bg-surface-2 text-fg text-sm">
                        <option value="">Category</option>
                        {localCategories.filter((c) => !c.is_income).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input aria-label={`Amount for part ${i + 1}`} type="number" inputMode="decimal" step="0.01" placeholder={!p.amount && partsLeft > 0 ? partsLeft.toFixed(2) : '0.00'} value={p.amount}
                        onFocus={() => { if (!p.amount && partsLeft > 0 && parts.filter((x) => !x.amount).length === 1) setPart(i, { amount: partsLeft.toFixed(2) }); }}
                        onChange={(e) => setPart(i, { amount: e.target.value })} className="w-28 px-2 py-2 border rounded-xl border-line bg-surface-2 text-fg text-sm" />
                      {parts.length > 2 && <button type="button" aria-label={`Remove part ${i + 1}`} className="text-muted px-1" onClick={() => setParts(parts.filter((_, j) => j !== i))}><X size={16} /></button>}
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs">
                    {parts.length < 20 && <button type="button" className="font-medium text-accent" onClick={() => setParts([...parts, { categoryId: '', amount: partsLeft > 0 ? partsLeft.toFixed(2) : '' }])}>Add a part</button>}
                    <span className={Math.abs(partsLeft) < 0.005 ? 'text-positive' : 'text-warning'}>
                      {Math.abs(partsLeft) < 0.005 ? 'Adds up' : partsLeft > 0 ? `${formatCurrency(partsLeft)} left to assign` : `${formatCurrency(-partsLeft)} too much`}
                    </span>
                  </div>
                </div>
              )}
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
                      : 'border-line hover:border-accent'
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
                      : 'border-line hover:border-accent'
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
                value={formData.paymentSourceId ? `${formData.paymentSource}:${formData.paymentSourceId}` : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.includes(':')) {
                    const [source, id] = value.split(':');
                    setFormData({ ...formData, paymentSource: source, paymentSourceId: id });
                  } else {
                    setFormData({ ...formData, paymentSource: '', paymentSourceId: null });
                  }
                }}
                className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
                required
              >
                <option value="">Choose an account</option>
                {bankAccounts && bankAccounts.length > 0 && (
                  <optgroup label="Accounts">
                    {bankAccounts.map(account => (
                      <option key={account.id} value={`bank_account:${account.id}`}>
                        {account.name} ({formatCurrency(account.balance)})
                      </option>
                    ))}
                  </optgroup>
                )}
                {payFromCards.length > 0 && (
                  <optgroup label="Credit Cards (Pay with Card)">
                    {payFromCards.map(card => (
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
                value={formData.paymentMethodId ? `${formData.paymentMethod}:${formData.paymentMethodId}` : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.includes(':')) {
                    const [method, id] = value.split(':');
                    setFormData({ ...formData, paymentMethod: method, paymentMethodId: id });
                  } else {
                    setFormData({ ...formData, paymentMethod: '', paymentMethodId: null });
                  }
                }}
                className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
                required
              >
                <option value="">Choose how it was paid</option>
                {recentPaymentMethods.length > 0 && (
                  <optgroup label="Recent">
                    {recentPaymentMethods.map(pm => (
                      <option 
                        key={pm.id} 
                        value={`${pm.type}:${pm.id}`}
                      >
                        {pm.name}
                        {pm.type === 'bank_account' && pm.balance !== undefined && ` (${formatCurrency(pm.balance)} available)`}
                        {pm.isPrimary && ' (primary)'}
                      </option>
                    ))}
                  </optgroup>
                )}
                
                <optgroup label="Accounts">
                  {bankAccounts && bankAccounts.length > 0 && bankAccounts.map(account => (
                    <option key={account.id} value={`bank_account:${account.id}`}>
                      {account.name} ({formatCurrency(account.balance)} available){account.is_primary ? ' (primary)' : ''}
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
                        {card.name} ({formatCurrency(card.balance)} available)
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
                className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
                required
              >
                <option value="">Select {formData.paymentMethod === 'credit_card' ? 'credit card' : 'loan'}</option>
                {formData.paymentMethod === 'credit_card' && (creditCards || []).filter(card => !card.is_gift_card).map(card => (
                  <option key={card.id} value={card.id}>
                    {card.name} ({formatCurrency(card.balance)} owed)
                  </option>
                ))}
                {formData.paymentMethod === 'loan' && loans && loans.map(loan => (
                  <option key={loan.id} value={loan.id}>
                    {loan.name} ({formatCurrency(loan.balance)} remaining)
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
              className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
              rows="3"
              placeholder="Additional details..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-2 rounded-xl border border-line hover:bg-surface-2`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={processing}
              className="flex-1 px-4 py-2 bg-accent text-accent-contrast rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? 'Saving...' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
