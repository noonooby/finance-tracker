import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Edit2, X, TrendingUp, ListFilter, Star } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, predictNextDate, generateId } from '../utils/helpers';
import { dbOperation, getBankAccount, updateBankAccountBalance } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import SmartInput from './SmartInput';
import { processOverdueLoans } from '../utils/autoPay';
import {
  getUserPreferences,
  togglePinnedLoan
} from '../utils/userPreferencesManager';

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
  const [editingItem, setEditingItem] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    principal: '',
    balance: '',
    interestRate: '',
    paymentAmount: '',
    frequency: 'monthly',
    nextPaymentDate: '',
    alertDays: alertSettings.defaultDays || 7,
    recurringDurationType: 'indefinite',
    recurringUntilDate: '',
    recurringOccurrences: ''
  });
  const [paymentForm, setPaymentForm] = useState({ 
    amount: '', 
    amountMode: 'recommended',
    date: new Date().toISOString().split('T')[0],
    category: 'loan_payment',
    source: ''
  });
  const [payingLoan, setPayingLoan] = useState(null);
  const loanRefs = useRef({});
  const [savingLoan, setSavingLoan] = useState(false);
  const [processingResults, setProcessingResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pinnedLoans, setPinnedLoans] = useState([]);
  
  const defaultLoanCategory = useMemo(() => {
    if (!categories || categories.length === 0) return 'loan_payment';
    const match = categories.find((cat) => cat.id === 'loan_payment');
    return match?.id || categories[0].id;
  }, [categories]);

  // Load pinned loans
  useEffect(() => {
    loadPinnedLoans();
  }, []);
  
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
  
  // Sort loans: pinned first, then by creation date
  const sortedLoans = [...loans].sort((a, b) => {
    const aIsPinned = pinnedLoans.includes(a.id);
    const bIsPinned = pinnedLoans.includes(b.id);
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    return 0;
  });

  const adjustBankAccountForFund = async (fund, amount) => {
    if (!fund?.source_account_id || !amount || amount <= 0) return null;
    try {
      const account = await getBankAccount(fund.source_account_id);
      if (!account) return null;
      const currentBalance = parseFloat(account.balance) || 0;
      const newBalance = Math.max(0, currentBalance - amount);
      await updateBankAccountBalance(account.id, newBalance);
      console.log(`🏦 Bank account updated for ${fund.name}: ${currentBalance} → ${newBalance}`);
      return {
        accountId: account.id,
        accountName: account.name,
        previousBalance: currentBalance,
        newBalance,
        amountUsed: amount
      };
    } catch (error) {
      console.error('❌ Failed to update linked bank account:', error);
      return null;
    }
  };

  const resolveFundId = (fund) => {
    if (!fund) return null;
    if (fund.id !== undefined && fund.id !== null) return String(fund.id);
    if (fund.fund_id !== undefined && fund.fund_id !== null) return String(fund.fund_id);
    if (fund.uuid !== undefined && fund.uuid !== null) return String(fund.uuid);
    return null;
  };

  const findReservedFundById = (fundId) => {
    if (!fundId) return null;
    return reservedFunds.find((fund) => resolveFundId(fund) === String(fundId)) || null;
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
        fund,
        label: `${fund.name} (${formatCurrency(remaining)})`
      });
    }
    return options;
  };
  
  //Payment Source Options
  const getPaymentSourceOptions = (loan) => {  
    const options = [];
    
    // Add cash in hand first
    options.push({
      value: 'cash_in_hand',
      label: `Cash in Hand (${formatCurrency(cashInHand || 0)})`,
      type: 'cash_in_hand'
    });
    
    // Add bank accounts
    if (bankAccounts && bankAccounts.length > 0) {
      for (const account of bankAccounts) {
        const balance = parseFloat(account.balance) || 0;
        options.push({
          value: `bank_account:${account.id}`,
          label: `${account.name} (${formatCurrency(balance)})`,
          type: 'bank_account',
          account
        });
      }
    }
    
    // Add reserved funds
    const fundOptions = getLoanReservedFundOptions(loan);
    if (fundOptions.length > 0) {
      for (const option of fundOptions) {
        options.push({
          value: option.value,
          label: `Reserved Fund: ${option.label}`,
          type: 'reserved_fund',
          fund: option.fund
        });
      }
    }
     
    // Add credit cards
    if (creditCards && creditCards.length > 0) {
      for (const card of creditCards) {
        const balance = parseFloat(card.balance) || 0;
        options.push({
          value: `credit_card:${card.id}`,
          label: `${card.name} (Bal: ${formatCurrency(balance)})`,
          type: 'credit_card',
          card
        });
      }
    }

    return options;
  };

  const getRecommendedAmountForSource = (loan) => {
    if (!loan) return null;
    const paymentAmount = Number(loan.payment_amount);
    const balanceAmount = Number(loan.balance);

    // Always prefer the loan's payment_amount as the primary recommendation
    if (Number.isFinite(paymentAmount) && paymentAmount > 0) {
      return paymentAmount;
    }

    // Fallback to balance if no payment amount is set
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

  const openPaymentForm = (loan) => {
    if (!loan) return;
    const options = getPaymentSourceOptions(loan);
    const defaultSource = options.length > 0 ? options[0].value : 'cash';
    const recommended = getRecommendedAmountForSource(loan);
    const hasRecommended = Number.isFinite(recommended) && recommended > 0;
    setPaymentForm({
      amount: hasRecommended ? recommended.toFixed(2) : '',
      amountMode: hasRecommended ? 'recommended' : 'custom',
      date: new Date().toISOString().split('T')[0],
      category: defaultLoanCategory,
      source: defaultSource
    });
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
    if (savingLoan) return;
    if (!formData.name || !formData.principal || !formData.balance || !formData.paymentAmount || !formData.nextPaymentDate) {
      alert('Please fill in all required fields');
      return;
    }

    if (formData.recurringDurationType === 'until_date' && !formData.recurringUntilDate) {
      alert('Please specify the end date for this loan schedule');
      return;
    }
    if (
      formData.recurringDurationType === 'occurrences' &&
      (!formData.recurringOccurrences || parseInt(formData.recurringOccurrences, 10) < 1)
    ) {
      alert('Please specify the number of payments for this loan schedule');
      return;
    }

    setSavingLoan(true);

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
      recurring_occurrences_completed: editingItem?.recurring_occurrences_completed || 0
    };

    try {
      const savedLoan = await dbOperation('loans', 'put', loanPayload, { skipActivityLog: true });
      const effectiveId = savedLoan?.id || loanId;

      if (editingItem) {
        const oldBalance = parseFloat(editingItem.balance) || 0;
        const newBalance = parseFloat(savedLoan.balance) || 0;
        const oldPayment = parseFloat(editingItem.payment_amount) || 0;
        const newPayment = parseFloat(savedLoan.payment_amount) || 0;

        let details = '';
        if (oldBalance !== newBalance) {
          details += `Balance ${formatCurrency(oldBalance)} → ${formatCurrency(newBalance)} • `;
        }
        if (oldPayment !== newPayment) {
          details += `Payment ${formatCurrency(oldPayment)} → ${formatCurrency(newPayment)} • `;
        }
        
        // Remove trailing bullet
        details = details.replace(/ • $/, '');

        const description = details
          ? `Updated loan '${savedLoan?.name || loanPayload.name}' - ${details}`
          : `Updated loan '${savedLoan?.name || loanPayload.name}'`;

        // ✅ Ensure snapshots always carry ID and NAME for undo safety and consistency
        await logActivity(
          'edit',
          'loan',
          effectiveId,
          savedLoan?.name || loanPayload.name,
          description,
          {
            previous: { ...editingItem, id: editingItem.id || effectiveId, name: editingItem.name || loanPayload.name },
            updated: { ...savedLoan, id: savedLoan?.id || effectiveId, name: savedLoan?.name || loanPayload.name }
          }
        );
      } else {
        await logActivity(
          'add',
          'loan',
          effectiveId,
          savedLoan?.name || loanPayload.name,
          `Added loan '${savedLoan?.name || loanPayload.name}' - Principal ${formatCurrency(savedLoan?.principal || loanPayload.principal)} • Balance ${formatCurrency(savedLoan?.balance || loanPayload.balance)} • Payment ${formatCurrency(savedLoan?.payment_amount || loanPayload.payment_amount)} ${savedLoan?.frequency || loanPayload.frequency}`,
          savedLoan
        );
      }

      await onUpdate();
      resetForm();
    } catch (error) {
      console.error('Error saving loan:', error);
      alert('Failed to save loan. Please try again.');
    } finally {
      setSavingLoan(false);
    }
  };

  const handleProcessDuePayments = async () => {
    if (isProcessing) return;

    if (!window.confirm('Process all overdue loan payments from reserved funds?')) {
      return;
    }

    setIsProcessing(true);
    setProcessingResults(null);

    try {
      const results = await processOverdueLoans(loans, reservedFunds, availableCash, onUpdateCash);
      await onUpdate();
      setProcessingResults(results);

      const processedCount = results.processed.length;
      const failedCount = results.failed.length;

      if (processedCount > 0) {
        alert(`Successfully processed ${processedCount} loan payment(s).${failedCount > 0 ? ` ${failedCount} failed.` : ''}`);
      } else if (failedCount > 0) {
        alert(`Failed to process ${failedCount} loan payment(s). Check console for details.`);
      } else {
        alert('No overdue loans with linked reserved funds found.');
      }
    } catch (error) {
      console.error('Error processing due loan payments:', error);
      alert('Error processing payments. Please try again.');
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
      nextPaymentDate: '',
      alertDays: alertSettings.defaultDays || 7,
      recurringDurationType: 'indefinite',
      recurringUntilDate: '',
      recurringOccurrences: ''
    });
    setShowAddForm(false);
    setEditingItem(null);
  };

  const handleEdit = (loan) => {
    setFormData({
      name: loan.name,
      principal: loan.principal.toString(),
      balance: loan.balance.toString(),
      interestRate: loan.interest_rate?.toString() || '',
      paymentAmount: loan.payment_amount.toString(),
      frequency: loan.frequency,
      nextPaymentDate: loan.next_payment_date,
      alertDays: loan.alert_days || alertSettings.defaultDays,
      recurringDurationType: loan.recurring_duration_type || 'indefinite',
      recurringUntilDate: loan.recurring_until_date || '',
      recurringOccurrences: loan.recurring_occurrences_total?.toString() || ''
    });
    setEditingItem(loan);
    setShowAddForm(true);
  };

  const handlePayment = async (loanId) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) {
      alert('Loan not found');
      return;
    }

    const sourceValue = paymentForm.source || 'cash';
    const [rawType, rawId] = sourceValue.includes(':') ? sourceValue.split(':') : [sourceValue, null];
    const sourceType = rawType || 'cash';
    const sourceId = rawId || null;

    const recommendedAmount = getRecommendedAmountForSource(loan, sourceValue);
    let paymentAmount = paymentForm.amountMode === 'recommended' ? recommendedAmount : parseFloat(paymentForm.amount);
    if (!Number.isFinite(paymentAmount)) {
      paymentAmount = parseFloat(paymentForm.amount);
    }

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    const paymentDate = paymentForm.date;
    if (!paymentDate) {
      alert('Please select a payment date');
      return;
    }

    const loanBalance = parseFloat(loan.balance) || 0;
    if (paymentAmount > loanBalance + 0.01) {
      const proceed = window.confirm(
        `You are attempting to pay ${formatCurrency(paymentAmount)}, which exceeds the outstanding balance of ${formatCurrency(loanBalance)}. Continue?`
      );
      if (!proceed) {
        return;
      }
    }

    try {
      // Capture original loan state BEFORE any modifications for undo
      const originalLoan = { ...loan };

      const updatedLoan = {
        ...loan,
        balance: Math.max(0, loanBalance - paymentAmount),
        last_payment_date: paymentDate,
        last_auto_payment_date: new Date().toISOString().split('T')[0]
      };

      let shouldContinue = true;
      const nextDate = predictNextDate(paymentDate, loan.frequency);

      if (loan.recurring_duration_type === 'occurrences') {
        const completed = (loan.recurring_occurrences_completed || 0) + 1;
        updatedLoan.recurring_occurrences_completed = completed;
        const total = loan.recurring_occurrences_total || 0;
        if (total && completed >= total) {
          shouldContinue = false;
        }
      }

      if (loan.recurring_duration_type === 'until_date' && loan.recurring_until_date) {
        const endDate = new Date(loan.recurring_until_date);
        const nextDateObj = new Date(nextDate);
        if (nextDateObj > endDate) {
          shouldContinue = false;
        }
      }

      updatedLoan.next_payment_date = shouldContinue ? nextDate : null;

      await dbOperation('loans', 'put', updatedLoan, { skipActivityLog: true });
      loan.balance = updatedLoan.balance;
      loan.recurring_occurrences_completed = updatedLoan.recurring_occurrences_completed;
      loan.next_payment_date = updatedLoan.next_payment_date;

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

      // Deep copy fund snapshot to preserve nested objects like linked_to and linked_items
      const fundSnapshot = JSON.parse(JSON.stringify(fund));
      

      if (fund.recurring) {
        const updatedFund = {
          ...fund,
          amount: Math.max(0, currentAmount - paymentAmount),
          last_paid_date: paymentDate
        };

        let continueFund = true;
        const nextFundDue = predictNextDate(fund.due_date, fund.frequency || 'monthly');

        if (fund.recurring_duration_type === 'occurrences') {
          const completed = (fund.recurring_occurrences_completed || 0) + 1;
          updatedFund.recurring_occurrences_completed = completed;
          const total = fund.recurring_occurrences_total || 0;
          if (total && completed >= total) {
            continueFund = false;
          }
        }

        if (fund.recurring_duration_type === 'until_date' && fund.recurring_until_date) {
          const fundEndDate = new Date(fund.recurring_until_date);
          const nextFundDate = new Date(nextFundDue);
          if (nextFundDate > fundEndDate) {
            continueFund = false;
          }
        }

        if (continueFund) {
          updatedFund.due_date = nextFundDue;
        } else {
          updatedFund.recurring = false;
          updatedFund.due_date = fund.recurring_until_date || fund.due_date;
        }

        await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
      } else if (fund.is_lumpsum) {
        const updatedAmount = Math.max(0, currentAmount - paymentAmount);
        const updatedFund = {
          ...fund,
          amount: updatedAmount,
          last_paid_date: paymentDate
        };

        if (fund.recurring_duration_type === 'occurrences') {
          const completed = (fund.recurring_occurrences_completed || 0) + 1;
          updatedFund.recurring_occurrences_completed = completed;
          const total = fund.recurring_occurrences_total || 0;
          if (total && completed >= total) {
            updatedFund.recurring = false;
          }
        }

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

      // Track if fund was deleted so undo knows to restore it
      const wasFundDeleted = !fund.recurring && !fund.is_lumpsum && (currentAmount - paymentAmount) <= 0.0001;

      recordAffectedFund(snapshotFund, paymentAmount, {
        wasDeleted: wasFundDeleted
      });

      paymentMethod = 'reserved_fund';
      paymentMethodId = resolveFundId(fund);
      paymentMethodName = fund.name;
      sourceName = fund.name;

      // Bank accounts are updated separately - just sync total
      await onUpdateCash(null, { syncOnly: true });
    } else if (sourceType === 'bank_account') {
      const account = bankAccounts.find((acc) => String(acc.id) === String(sourceId));
      if (!account) {
        alert('Selected bank account was not found.');
        return;
      }

      const currentBalance = parseFloat(account.balance) || 0;
      if (paymentAmount - currentBalance > 0.005) {
        alert(`Insufficient funds in ${account.name}. Available: ${formatCurrency(currentBalance)}`);
        return;
      }

      const updatedBalance = Math.max(0, currentBalance - paymentAmount);
      await updateBankAccountBalance(account.id, updatedBalance);
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

      if (hasMigratedToBankAccounts) {
        await onUpdateCash(null, { syncOnly: true });
      } else {
        newCash = previousCash - paymentAmount;
        await onUpdateCash(newCash);
      }
    } else if (sourceType === 'credit_card') {
      // ✅ Pay the loan using a credit card (this ADDS to the card balance)
      const card = creditCards?.find((c) => String(c.id) === String(sourceId));
      if (!card) {
        alert('Selected credit card was not found.');
        return;
      }
 
      const currentBalance = parseFloat(card.balance) || 0;
      const updatedCard = { ...card, balance: currentBalance + paymentAmount };
      await dbOperation('creditCards', 'put', updatedCard, { skipActivityLog: true });
 
      paymentMethod = 'credit_card';
      paymentMethodId = card.id;
      paymentMethodName = card.name;
      sourceName = card.name;
 
      // Paying with a credit card does not change cash immediately
      newCash = previousCash;
      await onUpdateCash(newCash);
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
      
      newCash = previousCash;
      await onUpdateCash(newCash);
    } else {
      paymentMethod = 'cash';
      paymentMethodId = null;
      paymentMethodName = 'Cash';
      sourceName = 'Cash';
      newCash = previousCash - paymentAmount;
      await onUpdateCash(newCash);
    }

      const transaction = {
        type: 'payment',
        loan_id: loanId,
        amount: paymentAmount,
        date: paymentDate,
        category_id: paymentForm.category || defaultLoanCategory,
        category_name: 'Loan Payment',
        payment_method: paymentMethod,
        payment_method_id: paymentMethodId,
        payment_method_name: paymentMethodName,
        card_id: sourceType === 'credit_card' ? paymentMethodId : null,
        subtype: sourceType === 'credit_card' ? 'loan_via_credit_card' : null,
        description: `Payment for loan ${loan.name}${sourceName ? ` from ${sourceName}` : ''}`,
        created_at: new Date().toISOString(),
        status: 'active',
        undone_at: null
      };
      const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

      // ✅ Ensure snapshots always carry ID for undo safety
      if (!originalLoan.id) originalLoan.id = loanId;
      if (!updatedLoan.id) updatedLoan.id = loanId;
      const snapshot = {
        entity: { ...originalLoan, id: loanId }, // Use original loan state for undo, guarantee id
        updatedLoan: { ...updatedLoan, id: loanId }, // Guarantee id for undo safety
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
        isManualPayment: true,
        cardEffect: sourceType === 'credit_card' ? { cardId: paymentMethodId, delta: +paymentAmount } : null
      };
      const previousBalance = parseFloat(originalLoan.balance) || 0;
      const newBalance = parseFloat(updatedLoan.balance) || 0;
      await logActivity(
        'payment',
        'loan',
        loanId,
        loan.name,
        `Made payment of ${formatCurrency(paymentAmount)} for '${loan.name}' from ${sourceName} - Balance ${formatCurrency(previousBalance)} → ${formatCurrency(newBalance)}`,
        snapshot
      );

      await onUpdate();
      setPayingLoan(null);
      resetPaymentFormState();
    } catch (error) {
      console.error('Error processing loan payment:', error);
      alert('Failed to process payment. Please try again.');
    }
  };


  const handleDelete = async (id) => {
    if (window.confirm('Delete this loan?')) {
      await dbOperation('loans', 'delete', id, { skipActivityLog: true });
      const loan = loans.find(l => l.id === id);
      if (loan) {
        await logActivity(
          'delete',
          'loan',
          loan.id,
          loan.name,
          `Deleted loan '${loan.name}' - Principal ${formatCurrency(loan.principal)} • Balance ${formatCurrency(loan.balance)} • Payment ${formatCurrency(loan.payment_amount)} ${loan.frequency}`,
          loan
        );
      }
      await onUpdate();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Loans</h2>
        <div className="flex gap-2">
          <button
            onClick={handleProcessDuePayments}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
              isProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            } text-white`}
            title="Process all overdue loans with linked reserved funds"
          >
            {isProcessing ? 'Processing...' : 'Process Due Payments'}
          </button>
          <button
            onClick={() => (showAddForm ? resetForm() : setShowAddForm(true))}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            <Plus size={20} />
            {showAddForm ? 'Cancel' : 'Add Loan'}
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
            type="loan"
            value={formData.name}
            onChange={(value) => setFormData({ ...formData, name: value })}
            label="Loan Name *"
            placeholder="e.g., Car Loan, Student Loan"
            darkMode={darkMode}
            required={true}
          />
          <input
            type="number"
            placeholder="Principal *"
            value={formData.principal}
            onChange={(e) => setFormData({ ...formData, principal: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="number"
            placeholder="Current Balance *"
            value={formData.balance}
            onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="number"
            placeholder="Interest Rate %"
            value={formData.interestRate}
            onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <input
            type="number"
            placeholder="Payment Amount *"
            value={formData.paymentAmount}
            onChange={(e) => setFormData({ ...formData, paymentAmount: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Payment Frequency *</label>
            <select
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
              className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="bimonthly">Bi-monthly</option>
            </select>
          </div>
          <div>
            <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Recurring Duration</label>
            <select
              value={formData.recurringDurationType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  recurringDurationType: e.target.value,
                  recurringUntilDate: '',
                  recurringOccurrences: ''
                })
              }
              className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
            >
              <option value="indefinite">Indefinite (until balance cleared)</option>
              <option value="until_date">Until specific date</option>
              <option value="occurrences">For specific number of payments</option>
            </select>
          </div>
          {formData.recurringDurationType === 'until_date' && (
            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>End Date *</label>
              <input
                type="date"
                value={formData.recurringUntilDate}
                onChange={(e) => setFormData({ ...formData, recurringUntilDate: e.target.value })}
                className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          )}
          {formData.recurringDurationType === 'occurrences' && (
            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Number of Payments *</label>
              <input
                type="number"
                min="1"
                placeholder="e.g., 24 payments"
                value={formData.recurringOccurrences}
                onChange={(e) => setFormData({ ...formData, recurringOccurrences: e.target.value })}
                className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
              />
              {editingItem && editingItem.recurring_occurrences_completed > 0 && (
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Completed: {editingItem.recurring_occurrences_completed} of {editingItem.recurring_occurrences_total || formData.recurringOccurrences || '?'}
                </p>
              )}
            </div>
          )}
          <input
            type="date"
            value={formData.nextPaymentDate}
            onChange={(e) => setFormData({ ...formData, nextPaymentDate: e.target.value })}
            className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
          />
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium">
              {editingItem ? 'Update Loan' : 'Add Loan'}
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
        {loans.length === 0 ? (
          <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
            <p>No loans added yet</p>
          </div>
        ) : (
          sortedLoans.map(loan => (
            <div
              key={String(normalizeId(loan.id))}
              ref={(el) => {
                const key = String(normalizeId(loan.id));
                if (el) {
                  loanRefs.current[key] = el;
                }
              }}
              className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 ${focusTarget?.type === 'loan' && normalizeId(focusTarget.id) === normalizeId(loan.id) ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{loan.name}</h3>
                    {pinnedLoans.includes(loan.id) && (
                      <Star size={16} className="text-yellow-500 fill-current" title="Pinned" />
                    )}
                  </div>
                  <div className="text-2xl font-bold text-orange-600 mt-1">{formatCurrency(loan.balance)}</div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                    of {formatCurrency(loan.principal)} ({((loan.balance / loan.principal) * 100).toFixed(1)}% remaining)
                  </div>
                  {loan.frequency && (
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                      <span className="capitalize">Payments: {loan.frequency}</span>
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
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTogglePin(loan.id)}
                    className={`p-2 rounded ${
                      pinnedLoans.includes(loan.id)
                        ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                        : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={pinnedLoans.includes(loan.id) ? 'Unpin loan' : 'Pin loan'}
                  >
                    <Star size={18} className={pinnedLoans.includes(loan.id) ? 'fill-current' : ''} />
                  </button>
                  <button
                    onClick={() => onNavigateToTransactions && onNavigateToTransactions({ loan: loan.id })}
                    className={`p-2 ${darkMode ? 'text-purple-400 hover:bg-gray-700' : 'text-purple-600 hover:bg-purple-50'} rounded`}
                    title="View transactions"
                  >
                    <ListFilter size={18} />
                  </button>
                  <button onClick={() => handleEdit(loan)} className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded`}>
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => handleDelete(loan.id)} className={`p-2 ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded`}>
                    <X size={18} />
                  </button>
                </div>
              </div>

              {loan.next_payment_date && (
                <div className={`flex justify-between items-center mb-3 text-sm pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Next Payment:</span>
                  <div className="text-right">
                    <div className="font-medium">{formatDate(loan.next_payment_date)}</div>
                    {getDaysUntil(loan.next_payment_date) >= 0 && (
                      <div className={`text-xs ${getDaysUntil(loan.next_payment_date) <= (loan.alert_days || 7) ? 'text-red-600 font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {getDaysUntil(loan.next_payment_date) === 0 ? 'Due Today!' : `${getDaysUntil(loan.next_payment_date)} days`}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {payingLoan === loan.id ? (
                (() => {
                  const sourceOptions = getPaymentSourceOptions(loan);
                  const recommended = getRecommendedAmountForSource(loan, paymentForm.source);
                  const showRecommended = paymentForm.amountMode === 'recommended' && Number.isFinite(recommended);

                  return (
                    <div className="space-y-3">
                      <div>
                        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Payment Source</label>
                        <select
                          value={paymentForm.source}
                          onChange={(e) => handleSourceChange(loan, e.target.value)}
                          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                        >
                          {sourceOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className={`block text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Payment Amount</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={!Number.isFinite(recommended)}
                              onClick={() => {
                                if (!Number.isFinite(recommended)) return;
                                setPaymentForm((prev) => ({
                                  ...prev,
                                  amountMode: 'recommended',
                                  amount: recommended.toFixed(2)
                                }));
                              }}
                              className={`px-2 py-1 text-xs rounded border ${paymentForm.amountMode === 'recommended' ? 'bg-blue-600 text-white border-blue-600' : darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-600'} ${!Number.isFinite(recommended) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              Suggested
                            </button>
                            <button
                              type="button"
                              onClick={() => setPaymentForm((prev) => ({ ...prev, amountMode: 'custom' }))}
                              className={`px-2 py-1 text-xs rounded border ${paymentForm.amountMode === 'custom' ? 'bg-blue-600 text-white border-blue-600' : darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-600'}`}
                            >
                              Custom
                            </button>
                          </div>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Payment Amount"
                          value={paymentForm.amount}
                          disabled={paymentForm.amountMode === 'recommended'}
                          onChange={(e) => setPaymentForm({ ...paymentForm, amountMode: 'custom', amount: e.target.value })}
                          className={`w-full px-3 py-2 border ${paymentForm.amountMode === 'recommended' ? 'opacity-60 cursor-not-allowed' : ''} ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                        />
                        {showRecommended && (
                          <p className={`mt-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Suggested amount: {formatCurrency(recommended)}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Payment Date</label>
                        <input
                          type="date"
                          value={paymentForm.date}
                          onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                        />
                      </div>

                      <div>
                        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Category</label>
                        <select
                          value={paymentForm.category}
                          onChange={(e) => setPaymentForm({ ...paymentForm, category: e.target.value })}
                          className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                        >
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => handlePayment(loan.id)} className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium">
                          Confirm Payment
                        </button>
                        <button
                          onClick={() => {
                            setPayingLoan(null);
                            resetPaymentFormState();
                          }}
                          className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} py-2 rounded-lg font-medium`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <button onClick={() => openPaymentForm(loan)} className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium">
                  Make Payment
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
