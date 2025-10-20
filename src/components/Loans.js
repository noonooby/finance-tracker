import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Plus, Edit2, X, TrendingUp, ListFilter, Star } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, generateId } from '../utils/helpers';
import { formatFrequency } from '../utils/sentenceCase';
import { dbOperation } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import { upsertKnownEntity } from '../utils/knownEntities';
import { processOverdueLoans } from '../utils/autoPay';
import RecentTransactions from './shared/RecentTransactions';
import useAsyncAction from '../hooks/useAsyncAction';
import ActionButton from './shared/ActionButton';
import { showToast } from '../utils/toast';
import { getUserPreferences, togglePinnedLoan } from '../utils/userPreferencesManager';
import {
  getLoanPaymentContext,
  getLoanCreationContext,
  saveLoanCreationContext,
  getRecentLoanNames as getRecentLoanTemplates,
  getLastUsedLoanContext,
  applyLoanCreationContext
} from '../utils/formContexts';
import { LoanForm, LoanPaymentForm, useLoanPayment } from './loans/index';

export default function Loans({
  darkMode,
  loans,
  categories,
  availableCash,
  reservedFunds,
  alertSettings,
  onUpdate,
  onUpdateCash,
  focusTarget,
  onClearFocus,
  bankAccounts,
  creditCards,
  hasMigratedToBankAccounts,
  onNavigateToTransactions,
  cashInHand,
  onUpdateCashInHand
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    principal: '',
    balance: '',
    interestRate: '',
    paymentAmount: '',
    frequency: 'monthly',
    nextPaymentDate: new Date().toISOString().split('T')[0],
    alertDays: alertSettings.defaultDays || 7,
    recurringDurationType: 'indefinite',
    recurringUntilDate: '',
    recurringOccurrences: '',
    connectedPaymentSource: null,
    connectedPaymentSourceId: null
  });
  
  const [paymentForm, setPaymentForm] = useState({ 
    amount: '', 
    amountMode: 'recommended',
    date: new Date().toISOString().split('T')[0],
    category: 'loan_payment',
    source: ''
  });
  
  const [recentLoanNames, setRecentLoanNames] = useState([]);
  const loanNameInputRef = useRef(null);
  const [payingLoan, setPayingLoan] = useState(null);
  const loanRefs = useRef({});
  const [processingResults, setProcessingResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pinnedLoans, setPinnedLoans] = useState([]);
  
  const { executeAction, isProcessing: isActionProcessing } = useAsyncAction();
  
  const { processPayment, processing: paymentProcessing } = useLoanPayment({
    loans,
    reservedFunds,
    bankAccounts,
    creditCards,
    availableCash,
    cashInHand,
    onUpdateCash,
    onUpdateCashInHand,
    hasMigratedToBankAccounts
  });
  
  const defaultLoanCategory = useMemo(() => {
    if (!categories || categories.length === 0) return 'loan_payment';
    const match = categories.find((cat) => cat.id === 'loan_payment');
    return match?.id || categories[0].id;
  }, [categories]);

  useEffect(() => {
    loadPinnedLoans();
    loadRecentLoanNames();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  const loadRecentLoanNames = async () => {
    try {
      const recent = await getRecentLoanTemplates(5);
      setRecentLoanNames(recent);
      
      if (!editingItem) {
        const lastContext = await getLastUsedLoanContext();
        if (lastContext) {
          const contextData = applyLoanCreationContext(lastContext);
          setFormData(prev => ({
            ...prev,
            name: lastContext.loan_name,
            principal: contextData.principal || '',
            balance: contextData.principal || '',
            interestRate: contextData.interestRate || '',
            paymentAmount: contextData.paymentAmount || '',
            frequency: contextData.frequency || 'monthly'
          }));
          
          setTimeout(() => {
            if (loanNameInputRef.current) {
              loanNameInputRef.current.select();
              loanNameInputRef.current.focus();
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error('Error loading recent loan names:', error);
    }
  };
  
  const handleSelectLoanName = useCallback(async (loanTemplate) => {
    try {
      const contextData = applyLoanCreationContext(loanTemplate);
      setFormData(prev => ({
        ...prev,
        name: loanTemplate.loan_name,
        principal: contextData.principal || '',
        balance: contextData.principal || '',
        interestRate: contextData.interestRate || '',
        paymentAmount: contextData.paymentAmount || '',
        frequency: contextData.frequency || 'monthly'
      }));
      setTimeout(() => {
        const principalInput = document.querySelector('input[placeholder="Principal *"]');
        if (principalInput) {
          principalInput.select();
          principalInput.focus();
        }
      }, 50);
    } catch (error) {
      console.error('Error applying loan template:', error);
    }
  }, []);
  
  const handleLoanNameChange = (value) => {
    setFormData(prev => ({ ...prev, name: value }));
  };
  
  const handleLoanNameBlur = useCallback(async () => {
    if (!formData.name?.trim() || editingItem) return;
    try {
      const context = await getLoanCreationContext(formData.name);
      if (context) {
        const contextData = applyLoanCreationContext(context);
        setFormData(prev => ({
          ...prev,
          principal: contextData.principal || prev.principal,
          balance: contextData.principal || prev.balance,
          interestRate: contextData.interestRate || prev.interestRate,
          paymentAmount: contextData.paymentAmount || prev.paymentAmount,
          frequency: contextData.frequency || prev.frequency
        }));
        console.log('✅ Applied loan template for:', formData.name);
      }
    } catch (error) {
      console.error('Error loading loan template:', error);
    }
  }, [formData.name, editingItem]);
  
  const loadPinnedLoans = async () => {
    try {
      const prefs = await getUserPreferences();
      setPinnedLoans(prefs.pinned_loans || []);
    } catch (error) {
      console.error('Error loading pinned loans:', error);
    }
  };
  
  const handleTogglePin = async (loanId) => {
    try {
      await togglePinnedLoan(loanId);
      await loadPinnedLoans();
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };
  
  const sortedLoans = [...loans].sort((a, b) => {
    const aIsPinned = pinnedLoans.includes(a.id);
    const bIsPinned = pinnedLoans.includes(b.id);
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    return 0;
  });

  const resolveFundId = (fund) => {
    if (!fund) return null;
    if (fund.id !== undefined && fund.id !== null) return String(fund.id);
    if (fund.fund_id !== undefined && fund.fund_id !== null) return String(fund.fund_id);
    if (fund.uuid !== undefined && fund.uuid !== null) return String(fund.uuid);
    return null;
  };

  const getLoanReservedFundOptions = (loan) => {
    if (!loan) return [];
    const options = [];
    for (const fund of reservedFunds) {
      const fundId = resolveFundId(fund);
      if (!fundId) continue;

      const isDirectLink =
        fund.linked_to?.type === 'loan' &&
        String(fund.linked_to?.id) === String(loan.id);

      const isLumpsumLink =
        fund.is_lumpsum &&
        Array.isArray(fund.linked_items) &&
        fund.linked_items.some((item) => item.type === 'loan' && String(item.id) === String(loan.id));

      if (!isDirectLink && !isLumpsumLink) continue;

      const remaining = parseFloat(fund.amount) || 0;
      if (remaining <= 0) continue;

      options.push({
        value: `reserved_fund:${fundId}`,
        label: `${fund.name} (${formatCurrency(remaining)})`
      });
    }
    return options;
  };
  
  const getPaymentSourceOptions = (loan) => {  
    const options = [];
    
    options.push({
      value: 'cash_in_hand',
      label: `Cash in Hand (${formatCurrency(cashInHand || 0)})`
    });
    
    if (bankAccounts && bankAccounts.length > 0) {
      for (const account of bankAccounts) {
        const balance = parseFloat(account.balance) || 0;
        options.push({
          value: `bank_account:${account.id}`,
          label: `${account.name} (${formatCurrency(balance)})`
        });
      }
    }
    
    const fundOptions = getLoanReservedFundOptions(loan);
    if (fundOptions.length > 0) {
      for (const option of fundOptions) {
        options.push({
          value: option.value,
          label: `Reserved Fund: ${option.label}`
        });
      }
    }
     
    if (creditCards && creditCards.length > 0) {
      for (const card of creditCards) {
        const balance = parseFloat(card.balance) || 0;
        options.push({
          value: `credit_card:${card.id}`,
          label: `${card.name} (Bal: ${formatCurrency(balance)})`
        });
      }
    }

    return options;
  };

  const getRecommendedAmountForSource = (loan) => {
    if (!loan) return null;
    const paymentAmount = Number(loan.payment_amount);
    const balanceAmount = Number(loan.balance);

    if (Number.isFinite(paymentAmount) && paymentAmount > 0) {
      return paymentAmount;
    }

    if (Number.isFinite(balanceAmount) && balanceAmount > 0) {
      return balanceAmount;
    }

    return null;
  };

  const resetPaymentFormState = () => {
    setPaymentForm({
      amount: '',
      amountMode: 'recommended',
      date: new Date().toISOString().split('T')[0],
      category: defaultLoanCategory,
      source: ''
    });
  };

  const loadLoanPaymentContext = useCallback(async (loan) => {
    try {
      const context = await getLoanPaymentContext(loan.id);
      if (context) {
        let sourceString = 'cash_in_hand';
        if (context.payment_source === 'bank_account' && context.payment_source_id) {
          sourceString = `bank_account:${context.payment_source_id}`;
        } else if (context.payment_source === 'reserved_fund' && context.payment_source_id) {
          sourceString = `reserved_fund:${context.payment_source_id}`;
        } else if (context.payment_source === 'credit_card' && context.payment_source_id) {
          sourceString = `credit_card:${context.payment_source_id}`;
        } else if (context.payment_source === 'cash_in_hand') {
          sourceString = 'cash_in_hand';
        }
        
        const recommended = getRecommendedAmountForSource(loan);
        const hasRecommended = Number.isFinite(recommended) && recommended > 0;
        const useRecommended = context.amount_mode === 'full_payment' || context.amount_mode === 'recommended';
        
        return {
          source: sourceString,
          amountMode: useRecommended && hasRecommended ? 'recommended' : 'custom',
          amount: useRecommended && hasRecommended ? recommended.toFixed(2) : ''
        };
      }
      return null;
    } catch (error) {
      console.error('Error loading loan payment context:', error);
      return null;
    }
  }, []);

  const openPaymentForm = async (loan) => {
    if (!loan) return;
    
    const savedContext = await loadLoanPaymentContext(loan);
    
    if (savedContext) {
      setPaymentForm({
        ...savedContext,
        date: new Date().toISOString().split('T')[0],
        category: defaultLoanCategory
      });
      console.log('✅ Applied payment context for loan:', loan.name);
    } else {
      const options = getPaymentSourceOptions(loan);
      const defaultSource = options.length > 0 ? options[0].value : 'cash_in_hand';
      const recommended = getRecommendedAmountForSource(loan);
      const hasRecommended = Number.isFinite(recommended) && recommended > 0;
      setPaymentForm({
        amount: hasRecommended ? recommended.toFixed(2) : '',
        amountMode: hasRecommended ? 'recommended' : 'custom',
        date: new Date().toISOString().split('T')[0],
        category: defaultLoanCategory,
        source: defaultSource
      });
    }
    
    setPayingLoan(loan.id);
  };

  const handleSourceChange = (loan, newSource) => {
    const recommended = getRecommendedAmountForSource(loan);
    const hasRecommended = Number.isFinite(recommended) && recommended > 0;
    setPaymentForm((prev) => ({
      ...prev,
      source: newSource,
      amountMode: hasRecommended ? 'recommended' : 'custom',
      amount: hasRecommended ? recommended.toFixed(2) : prev.amount
    }));
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
    if (focusTarget?.type === 'loan' && focusTarget.id) {
      const key = String(normalizeId(focusTarget.id));
      const node = loanRefs.current[key];
      if (node?.scrollIntoView) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const timer = setTimeout(() => onClearFocus?.(), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [focusTarget, onClearFocus]);

  const handleAdd = async () => {
    if (!formData.name || !formData.principal || !formData.balance || !formData.paymentAmount || !formData.nextPaymentDate) {
      showToast.error('Please fill in all required fields');
      return;
    }

    if (formData.recurringDurationType === 'until_date' && !formData.recurringUntilDate) {
      showToast.error('Please specify the end date for this loan schedule');
      return;
    }
    if (
      formData.recurringDurationType === 'occurrences' &&
      (!formData.recurringOccurrences || parseInt(formData.recurringOccurrences, 10) < 1)
    ) {
      showToast.error('Please specify the number of payments for this loan schedule');
      return;
    }
    
    const actionId = editingItem ? `edit-loan-${editingItem.id}` : 'add-loan';
    
    const result = await executeAction(actionId, async () => {
      const loanId = editingItem?.id || generateId();

      const loanPayload = {
        id: loanId,
        name: formData.name,
        principal: parseFloat(formData.principal) || 0,
        balance: parseFloat(formData.balance) || 0,
        interest_rate: parseFloat(formData.interestRate) || 0,
        payment_amount: parseFloat(formData.paymentAmount) || 0,
        frequency: formData.frequency,
        next_payment_date: formData.nextPaymentDate,
        alert_days: parseInt(formData.alertDays) || alertSettings.defaultDays,
        created_at: editingItem?.created_at || new Date().toISOString(),
        recurring_duration_type: formData.recurringDurationType,
        recurring_until_date: formData.recurringDurationType === 'until_date' ? formData.recurringUntilDate : null,
        recurring_occurrences_total:
          formData.recurringDurationType === 'occurrences'
            ? parseInt(formData.recurringOccurrences, 10) || null
            : null,
        recurring_occurrences_completed: editingItem?.recurring_occurrences_completed || 0,
        connected_payment_source: formData.connectedPaymentSource || null,
        connected_payment_source_id: formData.connectedPaymentSourceId || null
      };

      const savedLoan = await dbOperation('loans', 'put', loanPayload, { skipActivityLog: true });
      const effectiveId = savedLoan?.id || loanId;

      if (editingItem) {
        await logActivity(
          'edit',
          'loan',
          effectiveId,
          savedLoan?.name || loanPayload.name,
          `Updated loan '${savedLoan?.name || loanPayload.name}'`,
          {
            previous: { ...editingItem, id: editingItem.id || effectiveId },
            updated: { ...savedLoan, id: savedLoan?.id || effectiveId }
          }
        );
      } else {
        await logActivity(
          'add',
          'loan',
          effectiveId,
          savedLoan?.name || loanPayload.name,
          `Added loan '${savedLoan?.name || loanPayload.name}' - Principal ${formatCurrency(loanPayload.principal)} • Payment ${formatCurrency(loanPayload.payment_amount)} ${formatFrequency(loanPayload.frequency)}`,
          savedLoan
        );
      }

      if (loanPayload.name) {
        upsertKnownEntity('loan', loanPayload.name).catch(err => 
          console.warn('Failed to track loan name:', err)
        );
      }
      
      if (!editingItem && loanPayload.name) {
        saveLoanCreationContext(loanPayload.name, {
          principal: loanPayload.principal,
          interestRate: loanPayload.interest_rate,
          paymentAmount: loanPayload.payment_amount,
          frequency: loanPayload.frequency
        }).catch(err => console.warn('Failed to save loan template:', err));
      }

      await onUpdate();
      resetForm();
      
      return {
        loanName: savedLoan?.name || loanPayload.name,
        isNew: !editingItem
      };
    });
  
    if (result.success) {
      const action = result.data.isNew ? 'added' : 'updated';
      showToast.success(`Loan '${result.data.loanName}' ${action} successfully`);
    } else {
      showToast.error(`Failed to save loan: ${result.error.message}`);
    }
  };

  const handleProcessDuePayments = async () => {
    if (isProcessing) return;

    console.log('🔘 Process Due Payments clicked');
    console.log('📊 Loans data:', loans);
    console.log('💰 Available cash:', availableCash);
    console.log('🏦 Bank accounts:', bankAccounts);
    console.log('💳 Credit cards:', creditCards);
    console.log('💵 Cash in hand:', cashInHand);

    if (!window.confirm('Process all overdue loan payments?')) {
      return;
    }

    setIsProcessing(true);
    setProcessingResults(null);

    try {
      console.log('🔄 Starting loan payment processing...');
      
      const results = await processOverdueLoans(
        loans,
        reservedFunds,
        availableCash,
        onUpdateCash,
        creditCards,
        bankAccounts,
        cashInHand,
        onUpdateCashInHand
      );
      
      console.log('📊 Processing results:', results);
      
      await onUpdate();
      setProcessingResults(results);

      const processedCount = results.processed.length;
      const failedCount = results.failed.length;

      if (processedCount > 0) {
        showToast.success(`Processed ${processedCount} loan payment(s)`);
      } else if (failedCount > 0) {
        showToast.error(`Failed to process ${failedCount} loan(s)`);
      } else {
        showToast.info('No overdue loans found');
      }
    } catch (error) {
      console.error('❌ Error processing due payments:', error);
      console.error('Error stack:', error.stack);
      showToast.error(`Error processing payments: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      principal: '',
      balance: '',
      interestRate: '',
      paymentAmount: '',
      frequency: 'monthly',
      nextPaymentDate: new Date().toISOString().split('T')[0],
      alertDays: alertSettings.defaultDays || 7,
      recurringDurationType: 'indefinite',
      recurringUntilDate: '',
      recurringOccurrences: '',
      connectedPaymentSource: null,
      connectedPaymentSourceId: null
    });
    setShowAddForm(false);
    setEditingItem(null);
    loadRecentLoanNames().catch(console.error);
  };

  const handleEdit = (loan) => {
    setFormData({
      name: loan.name,
      principal: (parseFloat(loan.principal) || 0).toFixed(2),
      balance: (parseFloat(loan.balance) || 0).toFixed(2),
      interestRate: loan.interest_rate ? (parseFloat(loan.interest_rate)).toFixed(2) : '',
      paymentAmount: (parseFloat(loan.payment_amount) || 0).toFixed(2),
      frequency: loan.frequency,
      nextPaymentDate: loan.next_payment_date,
      alertDays: loan.alert_days || alertSettings.defaultDays,
      recurringDurationType: loan.recurring_duration_type || 'indefinite',
      recurringUntilDate: loan.recurring_until_date || '',
      recurringOccurrences: loan.recurring_occurrences_total?.toString() || '',
      connectedPaymentSource: loan.connected_payment_source || null,
      connectedPaymentSourceId: loan.connected_payment_source_id || null
    });
    setEditingItem(loan);
    setShowAddForm(true);
  };

  const handlePayment = async (loanId) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) {
      showToast.error('Loan not found');
      return;
    }

    const sourceValue = paymentForm.source;
    const recommendedAmount = getRecommendedAmountForSource(loan);
    const paymentAmount = paymentForm.amountMode === 'recommended' 
      ? recommendedAmount 
      : parseFloat(paymentForm.amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      showToast.error('Please enter a valid payment amount');
      return;
    }

    const paymentDate = paymentForm.date;
    if (!paymentDate) {
      showToast.error('Please select a payment date');
      return;
    }

    const result = await processPayment({
      loanId,
      paymentAmount,
      paymentDate,
      sourceValue,
      categoryId: paymentForm.category,
      amountMode: paymentForm.amountMode
    });

    if (result.success) {
      await onUpdate();
      setPayingLoan(null);
      resetPaymentFormState();
      showToast.success(
        `Payment of ${formatCurrency(result.data.amount)} processed for ${result.data.loanName}`
      );
    } else {
      showToast.error(`Payment failed: ${result.error}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this loan?')) {
      return;
    }
    
    const loan = loans.find(l => l.id === id);
    
    const result = await executeAction(`delete-loan-${id}`, async () => {
      await dbOperation('loans', 'delete', id, { skipActivityLog: true });
      
      if (loan) {
        await logActivity(
          'delete',
          'loan',
          loan.id,
          loan.name,
          `Deleted loan '${loan.name}' - Principal ${formatCurrency(loan.principal)} • Balance ${formatCurrency(loan.balance)}`,
          loan
        );
      }
      
      await onUpdate();
      return { loanName: loan?.name || 'Loan' };
    });
    
    if (result.success) {
      showToast.success(`${result.data.loanName} deleted successfully`);
    } else {
      showToast.error(`Failed to delete loan: ${result.error.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-4">
        <h2 className="text-xl md:text-2xl font-bold">Loans</h2>
        <div className="flex gap-2">
          <button
            onClick={handleProcessDuePayments}
            disabled={isProcessing}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base ${
              isProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            } text-white`}
            title="Process all overdue loans from all payment sources"
          >
            {isProcessing ? 'Processing...' : 'Process Due Payments'}
          </button>
          <button
            onClick={() => (showAddForm ? resetForm() : setShowAddForm(true))}
            className="flex items-center gap-1 sm:gap-2 bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 text-sm sm:text-base"
          >
            <Plus size={20} />
            {showAddForm ? 'Cancel' : 'Add Loan'}
          </button>
        </div>
      </div>

      {/* Processing Results */}
      {processingResults && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'} border rounded-lg p-3 text-sm`}>
          <div className={darkMode ? 'text-gray-200' : 'text-blue-800'}>
            Processed: {processingResults.processed.length} • Failed: {processingResults.failed.length} • Skipped: {processingResults.skipped.length}
          </div>
          {processingResults.processed.length > 0 && (
            <div className="mt-2 space-y-1">
              {processingResults.processed.map((item, i) => (
                <div key={i} className="text-xs">
                  ✅ {item.loan} - {formatCurrency(item.amount)} from {item.source}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <LoanForm
          darkMode={darkMode}
          formData={formData}
          setFormData={setFormData}
          editingItem={editingItem}
          recentLoanNames={recentLoanNames}
          handleSelectLoanName={handleSelectLoanName}
          handleLoanNameChange={handleLoanNameChange}
          handleLoanNameBlur={handleLoanNameBlur}
          handleAdd={handleAdd}
          resetForm={resetForm}
          isProcessing={isActionProcessing(editingItem ? `edit-loan-${editingItem.id}` : 'add-loan')}
          alertSettings={alertSettings}
          creditCards={creditCards}
          bankAccounts={bankAccounts}
          reservedFunds={reservedFunds}
        />
      )}

      {/* Loans List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {loans.length === 0 ? (
          <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
            <p>No Loans Added Yet</p>
          </div>
        ) : (
          sortedLoans.map(loan => (
            <div
              key={String(normalizeId(loan.id))}
              ref={(el) => {
                const key = String(normalizeId(loan.id));
                if (el) loanRefs.current[key] = el;
              }}
              className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 ${
                focusTarget?.type === 'loan' && normalizeId(focusTarget.id) === normalizeId(loan.id) 
                  ? 'ring-2 ring-offset-2 ring-blue-500' 
                  : ''
              }`}
            >
              {/* Loan Header */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base sm:text-lg">{loan.name}</h3>
                    {pinnedLoans.includes(loan.id) && (
                      <Star size={16} className="text-yellow-500 fill-current" title="Pinned" />
                    )}
                    {loan.connected_payment_source && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        darkMode ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-700'
                      }`}>
                        Auto-Pay
                      </span>
                    )}
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-orange-600 mt-1">
                    {formatCurrency(loan.balance)}
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                    of {formatCurrency(loan.principal)} ({((loan.balance / loan.principal) * 100).toFixed(1)}% remaining)
                  </div>
                  {loan.payment_amount > 0 && (
                    <div className={`text-sm font-medium mt-1 ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                      Payment: {formatCurrency(loan.payment_amount)}
                    </div>
                  )}
                  {loan.frequency && (
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                      <span>Frequency: {formatFrequency(loan.frequency)}</span>
                      {loan.recurring_duration_type && (
                        <span className="ml-2">
                          {loan.recurring_duration_type === 'until_date' && loan.recurring_until_date && (
                            <>• Until {formatDate(loan.recurring_until_date)}</>
                          )}
                          {loan.recurring_duration_type === 'occurrences' && loan.recurring_occurrences_total && (
                            <>• {loan.recurring_occurrences_completed || 0}/{loan.recurring_occurrences_total} payments</>
                          )}
                          {loan.recurring_duration_type === 'indefinite' && <>• Indefinite</>}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 sm:gap-2">
                  <button
                    onClick={() => handleTogglePin(loan.id)}
                    className={`p-1.5 sm:p-2 rounded min-h-[44px] sm:min-h-0 flex items-center justify-center ${
                      pinnedLoans.includes(loan.id)
                        ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                        : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={pinnedLoans.includes(loan.id) ? 'Unpin loan' : 'Pin loan'}
                  >
                    <Star size={16} className={`sm:w-[18px] sm:h-[18px] ${pinnedLoans.includes(loan.id) ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    onClick={() => onNavigateToTransactions && onNavigateToTransactions({ loan: loan.id })}
                    className={`p-2 ${darkMode ? 'text-purple-400 hover:bg-gray-700' : 'text-purple-600 hover:bg-purple-50'} rounded`}
                    title="View transactions"
                  >
                    <ListFilter size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                  <button 
                    onClick={() => handleEdit(loan)} 
                    className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded`}
                  >
                    <Edit2 size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                  <button 
                    onClick={() => handleDelete(loan.id)} 
                    className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}
                  >
                    <X size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                </div>
              </div>

              {/* Next Payment */}
              {loan.next_payment_date && (
                <div className={`flex justify-between items-center mb-3 text-sm pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Next Payment:</span>
                  <div className="text-right">
                    <div className="font-medium">{formatDate(loan.next_payment_date)}</div>
                    {getDaysUntil(loan.next_payment_date) !== null && (
                      <div className={`text-xs ${
                        getDaysUntil(loan.next_payment_date) < 0
                          ? 'text-red-600 font-bold'
                          : getDaysUntil(loan.next_payment_date) <= (loan.alert_days || 7) 
                          ? 'text-red-600 font-semibold' 
                          : darkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {getDaysUntil(loan.next_payment_date) < 0
                          ? `${Math.abs(getDaysUntil(loan.next_payment_date))} days overdue!`
                          : getDaysUntil(loan.next_payment_date) === 0 
                          ? 'Due Today!' 
                          : `${getDaysUntil(loan.next_payment_date)} days`
                        }
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Recent Transactions */}
              <RecentTransactions
                darkMode={darkMode}
                entityType="loan"
                entityId={loan.id}
                entityName={loan.name}
              />

              {/* Payment Form or Make Payment Button */}
              {payingLoan === loan.id ? (
                <LoanPaymentForm
                  darkMode={darkMode}
                  loan={loan}
                  paymentForm={paymentForm}
                  setPaymentForm={setPaymentForm}
                  sourceOptions={getPaymentSourceOptions(loan)}
                  onSourceChange={(newSource) => handleSourceChange(loan, newSource)}
                  onSubmit={() => handlePayment(loan.id)}
                  onCancel={() => {
                    setPayingLoan(null);
                    resetPaymentFormState();
                  }}
                  processing={paymentProcessing}
                  categories={categories}
                />
              ) : (
                <ActionButton
                  onClick={() => openPaymentForm(loan)}
                  variant="primary"
                  idleText="Make Payment"
                  fullWidth
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
