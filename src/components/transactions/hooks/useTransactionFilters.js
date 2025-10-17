import { useCallback } from 'react';

/**
 * Custom hook for transaction filtering logic
 * Handles all filter application and business logic
 */
export function useTransactionFilters(transactions) {
  const isPaymentType = (type) =>
    type === 'payment' || type === 'loan_payment' || type === 'credit_card_payment' || type === 'reserved_fund_paid';

  const applyFilters = useCallback((filters) => {
    let filtered = [...transactions];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(t => 
        t.description?.toLowerCase().includes(searchLower) ||
        t.notes?.toLowerCase().includes(searchLower) ||
        t.category_name?.toLowerCase().includes(searchLower) ||
        t.payment_method_name?.toLowerCase().includes(searchLower)
      );
    }

    // Type filter
    if (filters.type !== 'all') {
      filtered = filtered.filter(t => {
        if (filters.type === 'payment') {
          return isPaymentType(t.type);
        }
        return t.type === filters.type;
      });
    }

    // Category filter
    if (filters.category !== 'all') {
      filtered = filtered.filter(t => t.category_id === filters.category);
    }

    // Date range filters
    if (filters.dateFrom) {
      filtered = filtered.filter(t => t.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      filtered = filtered.filter(t => t.date <= filters.dateTo);
    }

    // Payment method filter
    if (filters.paymentMethod !== 'all') {
      filtered = filtered.filter(t => t.payment_method === filters.paymentMethod);
    }

    // Credit card filter
    if (filters.creditCard !== 'all') {
      filtered = filtered.filter(t => {
        if (t.payment_method === 'credit_card' && t.card_id === filters.creditCard) return true;
        if (t.payment_method_id === filters.creditCard && t.payment_method === 'credit_card') return true;
        if ((t.type === 'credit_card_payment' || t.type === 'payment') && t.card_id === filters.creditCard) return true;
        return false;
      });
    }

    // Loan filter
    if (filters.loan !== 'all') {
      filtered = filtered.filter(t => {
        if (t.payment_method === 'loan' && t.loan_id === filters.loan) return true;
        if (t.payment_method_id === filters.loan && t.payment_method === 'loan') return true;
        if ((t.type === 'loan_payment' || t.type === 'payment') && t.loan_id === filters.loan) return true;
        return false;
      });
    }

    // Bank account filter
    if (filters.bankAccount !== 'all') {
      filtered = filtered.filter(t => {
        if (t.bank_account_id === filters.bankAccount) return true;
        if (t.from_account_id === filters.bankAccount || t.to_account_id === filters.bankAccount) return true;
        return false;
      });
    }

    // Income source filter
    if (filters.incomeSource !== 'all') {
      filtered = filtered.filter(t => {
        if (t.type === 'income' && t.payment_method_id === filters.incomeSource) return true;
        if (t.income_id === filters.incomeSource) return true;
        return false;
      });
    }

    // Reserved fund filter
    if (filters.reservedFund !== 'all') {
      filtered = filtered.filter(t => {
        if (t.reserved_fund_id === filters.reservedFund) return true;
        if (t.fund_id === filters.reservedFund) return true;
        return false;
      });
    }

    return filtered;
  }, [transactions]);

  const getTotalsByType = useCallback((filteredTransactions) => {
    const totals = {
      income: 0,
      expense: 0,
      payment: 0
    };

    filteredTransactions.forEach(t => {
      if (t.status === 'undone') return;
      const amount = Number(t.amount) || 0;
      if (t.type === 'income') {
        totals.income += amount;
      } else if (t.type === 'expense') {
        totals.expense += amount;
      } else if (isPaymentType(t.type)) {
        totals.payment += amount;
      }
    });

    return totals;
  }, []);

  return {
    applyFilters,
    getTotalsByType
  };
}
