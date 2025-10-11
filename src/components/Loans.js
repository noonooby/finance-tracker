import React, { useEffect, useRef, useState } from 'react';
import { Plus, Edit2, X, TrendingUp } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil, predictNextDate, generateId } from '../utils/helpers';
import { dbOperation } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import SmartInput from './SmartInput';
import { processOverdueLoans } from '../utils/autoPay';

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
  onClearFocus
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
    nextPaymentDate: '',
    alertDays: alertSettings.defaultDays || 7,
    recurringDurationType: 'indefinite',
    recurringUntilDate: '',
    recurringOccurrences: ''
  });
  const [paymentForm, setPaymentForm] = useState({ 
    amount: '', 
    date: new Date().toISOString().split('T')[0],
    category: 'other'
  });
  const [payingLoan, setPayingLoan] = useState(null);
  const loanRefs = useRef({});
  const [savingLoan, setSavingLoan] = useState(false);
  const [processingResults, setProcessingResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
        await logActivity('edit', 'loan', effectiveId, savedLoan?.name || loanPayload.name, `Updated loan: ${savedLoan?.name || loanPayload.name}`, null);
      } else {
        await logActivity('add', 'loan', effectiveId, savedLoan?.name || loanPayload.name, `Added loan: ${savedLoan?.name || loanPayload.name}`, null);
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
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    const loan = loans.find(l => l.id === loanId);
    const paymentAmount = parseFloat(paymentForm.amount);
    const paymentDate = paymentForm.date;

    // 1️⃣ Update the loan balance
    const newBalance = Math.max(0, (parseFloat(loan.balance) || 0) - paymentAmount);
    const updatedLoan = {
      ...loan,
      balance: newBalance,
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

    await dbOperation('loans', 'put', updatedLoan);
    loan.balance = updatedLoan.balance;
    loan.recurring_occurrences_completed = updatedLoan.recurring_occurrences_completed;
    loan.next_payment_date = updatedLoan.next_payment_date;

    // 2️⃣ Record a transaction for payment
    const transaction = {
      type: 'payment',
      loan_id: loanId,
      amount: paymentAmount,
      date: paymentDate,
      category_id: paymentForm.category || 'loan_payment',
      category_name: 'Loan Payment',
      payment_method: 'loan',
      payment_method_id: loanId,
      payment_method_name: loan.name,
      description: `Payment for loan ${loan.name}`,
      created_at: new Date().toISOString(),
      status: 'active',
      undone_at: null
    };
    const savedTransaction = await dbOperation('transactions', 'put', transaction);

    let affectedFund = null;
    let remainingAmount = paymentAmount;

    const linkedFund = reservedFunds.find(f => f.linked_to?.type === 'loan' && f.linked_to?.id === loanId);
    if (linkedFund && remainingAmount > 0) {
      const linkedSnapshot = { ...linkedFund };
      const currentAmount = parseFloat(linkedFund.amount) || 0;
      const deductedAmount = Math.min(remainingAmount, currentAmount);

      if (deductedAmount > 0) {
        remainingAmount -= deductedAmount;

        const fundTransaction = {
          type: 'reserved_fund_paid',
          amount: deductedAmount,
          date: paymentDate,
          description: `Reserved fund applied: ${linkedFund.name}`,
          notes: `Reserved fund linked to ${loan.name}`,
          created_at: new Date().toISOString(),
          status: 'active',
          undone_at: null,
          payment_method: 'reserved_fund',
          payment_method_id: linkedFund.id
        };
        await dbOperation('transactions', 'put', fundTransaction);

        const updatedLinked = {
          ...linkedFund,
          amount: currentAmount - deductedAmount,
          last_paid_date: paymentDate,
          due_date: linkedFund.recurring
            ? predictNextDate(linkedFund.due_date, linkedFund.frequency || 'monthly')
            : linkedFund.due_date
        };

        if (!linkedFund.recurring && updatedLinked.amount <= 0) {
          await dbOperation('reservedFunds', 'delete', linkedFund.id);
        } else {
          await dbOperation('reservedFunds', 'put', updatedLinked);
        }

        affectedFund = linkedSnapshot;
      }
    }

    if (remainingAmount > 0) {
      const lumpsumFund = reservedFunds.find(f =>
        f.is_lumpsum && f.linked_items?.some(item => item.type === 'loan' && item.id === loanId)
      );

      if (lumpsumFund) {
        const lumpsumSnapshot = { ...lumpsumFund };
        const currentAmount = parseFloat(lumpsumFund.amount) || 0;
        const deductedAmount = Math.min(currentAmount, remainingAmount);

        if (deductedAmount > 0) {
          remainingAmount -= deductedAmount;

          const lumpsumTransaction = {
            type: 'reserved_fund_paid',
            amount: deductedAmount,
            date: paymentDate,
            description: `Lumpsum fund applied: ${lumpsumFund.name}`,
            notes: `Lumpsum fund payment for ${loan.name}`,
            created_at: new Date().toISOString(),
            status: 'active',
            undone_at: null,
            payment_method: 'reserved_fund',
            payment_method_id: lumpsumFund.id
          };
          await dbOperation('transactions', 'put', lumpsumTransaction);

          await dbOperation('reservedFunds', 'put', {
            ...lumpsumFund,
            amount: Math.max(0, currentAmount - deductedAmount),
            last_paid_date: paymentDate
          });

          if (!affectedFund) {
            affectedFund = lumpsumSnapshot;
          }
        }
      }
    }

    if (remainingAmount > 0 && remainingAmount < paymentAmount) {
      const covered = paymentAmount - remainingAmount;
      console.warn(`Reserved funds covered ${formatCurrency(covered)} of ${formatCurrency(paymentAmount)}. Remaining ${formatCurrency(remainingAmount)} paid from cash.`);
    }

    // 5️⃣ Update available cash
    await onUpdateCash(availableCash - paymentAmount);

    // 6️⃣ Log activity
    await logActivity(
      'payment',
      'loan',
      loanId,
      loan.name,
      `Made payment of ${formatCurrency(paymentAmount)} for ${loan.name}`,
      {
        entity: { ...loan },
        paymentAmount,
        date: paymentDate,
        previousCash: availableCash,
        affectedFund: affectedFund,
        transactionId: savedTransaction?.id
      }
    );

    // 7️⃣ Refresh UI
    await onUpdate();

    // 8️⃣ Reset
    setPayingLoan(null);
    setPaymentForm({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      category: 'other'
    });
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this loan?')) {
      await dbOperation('loans', 'delete', id);
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
          loans.map(loan => (
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
                  <h3 className="font-bold text-lg">{loan.name}</h3>
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
                <div className="space-y-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Payment Amount"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                  />
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                    className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                  />
                  <select
                    value={paymentForm.category}
                    onChange={(e) => setPaymentForm({ ...paymentForm, category: e.target.value })}
                    className={`w-full px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg`}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => handlePayment(loan.id)} className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium">
                      Confirm Payment
                    </button>
                    <button onClick={() => setPayingLoan(null)} className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} py-2 rounded-lg font-medium`}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setPayingLoan(loan.id)} className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium">
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
