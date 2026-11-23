import { useCallback } from 'react';
import { localDate, defaultBankAccount } from '../../utils/helpers';

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
      errors.push('Enter a valid amount');
    }
    
    if (!formData.date) {
      errors.push('Date is required');
    }

    // Recurring income validation
    if (formData.frequency !== 'onetime') {
      if (formData.recurringDurationType === 'until_date' && !formData.recurringUntilDate) {
        errors.push('Specify the end date for recurring income');
      }
      
      if (formData.recurringDurationType === 'occurrences') {
        const occurrences = parseInt(formData.recurringOccurrences, 10);
        if (!formData.recurringOccurrences || occurrences < 1) {
          errors.push('Specify the number of times this income will occur');
        }
      }
    }

    // Deposit target validation
    if (!formData.depositAccountId) {
      errors.push('Choose the account the income goes into');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }, []);

  const getDefaultFormData = useCallback((bankAccounts = []) => {
    const primaryAccount = defaultBankAccount(bankAccounts);
    
    return {
      source: '',
      amount: '',
      date: localDate(),
      frequency: 'onetime',
      reservedAmount: '',
      recurringDurationType: 'indefinite',
      recurringUntilDate: '',
      recurringOccurrences: '',
      depositTarget: 'bank',
      depositAccountId: primaryAccount?.id || '',
      splits: [],
      autoDeposit: true
    };
  }, []);

  return {
    validateIncomeForm,
    getDefaultFormData
  };
};
