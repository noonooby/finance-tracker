import { useCallback } from 'react';

/**
 * Hook for income form validation
 * Extracted from Income.js to be reusable across components
 */
export const useIncomeValidation = () => {

  const validateIncomeForm = useCallback((formData) => {
    const errors = [];

    // Required fields
    if (!formData.source?.trim()) {
      errors.push('Source is required');
    }
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      errors.push('Please enter a valid amount');
    }
    
    if (!formData.date) {
      errors.push('Date is required');
    }

    // Recurring income validation
    if (formData.frequency !== 'onetime') {
      if (formData.recurringDurationType === 'until_date' && !formData.recurringUntilDate) {
        errors.push('Please specify the end date for recurring income');
      }
      
      if (formData.recurringDurationType === 'occurrences') {
        const occurrences = parseInt(formData.recurringOccurrences, 10);
        if (!formData.recurringOccurrences || occurrences < 1) {
          errors.push('Please specify the number of times this income will occur');
        }
      }
    }

    // Deposit target validation
    if (formData.depositTarget === 'bank' && !formData.depositAccountId) {
      errors.push('Please select a bank account for deposit');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }, []);

  const getDefaultFormData = useCallback((bankAccounts = []) => {
    const primaryAccount = bankAccounts.find(acc => acc.is_primary);
    
    return {
      source: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      frequency: 'onetime',
      reservedAmount: '',
      recurringDurationType: 'indefinite',
      recurringUntilDate: '',
      recurringOccurrences: '',
      depositTarget: 'bank',
      depositAccountId: primaryAccount?.id || '',
      autoDeposit: true
    };
  }, []);

  return {
    validateIncomeForm,
    getDefaultFormData
  };
};
