import React, { useState, useEffect, useCallback } from 'react';
import { Save, FolderOpen } from 'lucide-react';
import { dbOperation } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import AddTransaction from './AddTransaction';
import {
  getAllSavedFilters,
  saveFilter,
  deleteSavedFilter,
  toggleFilterPin,
  trackFilterUsage,
  duplicateFilter,
  getQuickFilterSuggestions
} from '../utils/savedFiltersManager';

// Transaction Components (UI only - no financial logic)
import {
  TransactionSummaryCards,
  FilterPanel,
  SavedFiltersPanel,
  TransactionCard,
  QuickFiltersDropdown,
  SaveFilterDialog
} from './transactions';

/**
 * Transaction History Component
 * Main container - handles all business logic and financial operations
 * UI components are extracted for modularity
 */
export default function TransactionHistory({
  darkMode,
  categories,
  creditCards,
  loans,
  reservedFunds,
  availableCash,
  onUpdate,
  onUpdateCash,
  showAddModal,
  onCloseAddModal,
  bankAccounts,
  cashInHand = 0,
  onUpdateCashInHand
}) {
  // === STATE MANAGEMENT ===
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    category: 'all',
    dateFrom: '',
    dateTo: '',
    paymentMethod: 'all',
    creditCard: 'all',
    loan: 'all',
    bankAccount: 'all',
    incomeSource: 'all',
    reservedFund: 'all'
  });

  // Saved filters state
  const [savedFilters, setSavedFilters] = useState([]);
  const [quickFilters, setQuickFilters] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [saveAsPin, setSaveAsPin] = useState(false);
  const [saveError, setSaveError] = useState('');

  // === HELPER FUNCTIONS (Safe - No Side Effects) ===
  const isPaymentType = (type) =>
    type === 'payment' || type === 'loan_payment' || type === 'credit_card_payment' || type === 'reserved_fund_paid';

  const resolvePaymentSubtype = (transaction) => {
    if (transaction.subtype) return transaction.subtype;
    if (transaction.type === 'credit_card_payment') return 'credit_card';
    if (transaction.type === 'loan_payment') return 'loan';
    if (transaction.payment_method === 'credit_card') return 'credit_card';
    if (transaction.payment_method === 'loan') return 'loan';
    return null;
  };

  const getTotalsByType = () => {
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
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // === FILTER LOGIC (Keep in main component) ===
  const applyFilters = useCallback(() => {
    let filtered = [...transactions];

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(t => 
        t.description?.toLowerCase().includes(searchLower) ||
        t.notes?.toLowerCase().includes(searchLower) ||
        t.category_name?.toLowerCase().includes(searchLower) ||
        t.payment_method_name?.toLowerCase().includes(searchLower)
      );
    }

    if (filters.type !== 'all') {
      filtered = filtered.filter(t => {
        if (filters.type === 'payment') {
          return isPaymentType(t.type);
        }
        return t.type === filters.type;
      });
    }

    if (filters.category !== 'all') {
      filtered = filtered.filter(t => t.category_id === filters.category);
    }

    if (filters.dateFrom) {
      filtered = filtered.filter(t => t.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      filtered = filtered.filter(t => t.date <= filters.dateTo);
    }

    if (filters.paymentMethod !== 'all') {
      filtered = filtered.filter(t => t.payment_method === filters.paymentMethod);
    }

    if (filters.creditCard !== 'all') {
      filtered = filtered.filter(t => {
        if (t.payment_method === 'credit_card' && t.card_id === filters.creditCard) return true;
        if (t.payment_method_id === filters.creditCard && t.payment_method === 'credit_card') return true;
        if ((t.type === 'credit_card_payment' || t.type === 'payment') && t.card_id === filters.creditCard) return true;
        return false;
      });
    }

    if (filters.loan !== 'all') {
      filtered = filtered.filter(t => {
        if (t.payment_method === 'loan' && t.loan_id === filters.loan) return true;
        if (t.payment_method_id === filters.loan && t.payment_method === 'loan') return true;
        if ((t.type === 'loan_payment' || t.type === 'payment') && t.loan_id === filters.loan) return true;
        return false;
      });
    }

    if (filters.bankAccount !== 'all') {
      filtered = filtered.filter(t => {
        if (t.bank_account_id === filters.bankAccount) return true;
        if (t.from_account_id === filters.bankAccount || t.to_account_id === filters.bankAccount) return true;
        return false;
      });
    }

    if (filters.incomeSource !== 'all') {
      filtered = filtered.filter(t => {
        if (t.type === 'income' && t.payment_method_id === filters.incomeSource) return true;
        if (t.income_id === filters.incomeSource) return true;
        return false;
      });
    }

    if (filters.reservedFund !== 'all') {
      filtered = filtered.filter(t => {
        if (t.reserved_fund_id === filters.reservedFund) return true;
        if (t.fund_id === filters.reservedFund) return true;
        return false;
      });
    }

    setFilteredTransactions(filtered);
  }, [transactions, filters]);

  // === DATA LOADING ===
  const loadTransactions = useCallback(async () => {
    try {
      const data = await dbOperation('transactions', 'getAll');
      setTransactions(data || []);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSavedFilters = async () => {
    try {
      const filters = await getAllSavedFilters('transaction');
      setSavedFilters(filters);
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }
  };

  const loadQuickFilters = async () => {
    try {
      const suggestions = await getQuickFilterSuggestions('transaction', 5);
      setQuickFilters(suggestions);
    } catch (error) {
      console.error('Error loading quick filters:', error);
    }
  };

  // === EFFECTS ===
  useEffect(() => {
    loadSavedFilters();
    loadQuickFilters();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    const storedFilters = sessionStorage.getItem('transactionFilters');
    if (storedFilters) {
      try {
        const parsedFilters = JSON.parse(storedFilters);
        setFilters(prevFilters => ({ ...prevFilters, ...parsedFilters }));
        sessionStorage.removeItem('transactionFilters');
      } catch (error) {
        console.error('Error parsing stored filters:', error);
      }
    }
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // === EVENT HANDLERS (Safe - UI Only) ===
  const handleModalClose = useCallback(async () => {
    if (onCloseAddModal) onCloseAddModal();
    await loadTransactions();
  }, [onCloseAddModal, loadTransactions]);

  const handleClearFilters = () => {
    setFilters({
      search: '',
      type: 'all',
      category: 'all',
      dateFrom: '',
      dateTo: '',
      paymentMethod: 'all',
      creditCard: 'all',
      loan: 'all',
      bankAccount: 'all',
      incomeSource: 'all',
      reservedFund: 'all'
    });
  };

  // === SAVED FILTERS HANDLERS ===
  const handleSaveFilter = async () => {
    if (!filterName.trim()) {
      setSaveError('Filter name is required');
      return;
    }

    const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
      if (key === 'search') return value.trim() !== '';
      return value !== 'all' && value !== '';
    });

    if (!hasActiveFilters) {
      setSaveError('Please set at least one filter before saving');
      return;
    }

    try {
      setSaveError('');
      const filterData = {
        name: filterName.trim(),
        filter_type: 'transaction',
        filters: filters,
        is_pinned: saveAsPin
      };

      await saveFilter(filterData);
      await loadSavedFilters();
      await loadQuickFilters();
      
      setFilterName('');
      setSaveAsPin(false);
      setShowSaveDialog(false);
      
      alert(`✅ Filter "${filterData.name}" saved successfully!`);
    } catch (error) {
      console.error('Error saving filter:', error);
      setSaveError(error.message || 'Failed to save filter');
    }
  };

  const handleLoadFilter = async (savedFilter) => {
    try {
      setFilters(savedFilter.filters);
      await trackFilterUsage(savedFilter.id);
      await loadSavedFilters();
      await loadQuickFilters();
    } catch (error) {
      console.error('Error loading filter:', error);
    }
  };

  const handleTogglePin = async (filter) => {
    try {
      await toggleFilterPin(filter.id, !filter.is_pinned);
      await loadSavedFilters();
      await loadQuickFilters();
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };

  const handleDeleteFilter = async (filter) => {
    if (!window.confirm(`Are you sure you want to delete "${filter.name}"?`)) {
      return;
    }

    try {
      await deleteSavedFilter(filter.id);
      await loadSavedFilters();
      await loadQuickFilters();
      alert('🗑️ Filter deleted successfully');
    } catch (error) {
      console.error('Error deleting filter:', error);
      alert('Failed to delete filter');
    }
  };

  const handleDuplicateFilter = async (filter) => {
    try {
      await duplicateFilter(filter.id);
      await loadSavedFilters();
      alert(`✅ Filter duplicated successfully!`);
    } catch (error) {
      console.error('Error duplicating filter:', error);
      alert('Failed to duplicate filter');
    }
  };

  // === CRITICAL FINANCIAL LOGIC (STAYS HERE - DO NOT EXTRACT) ===
  /**
   * Reverts the financial effects of a transaction
   * CRITICAL: This handles money - DO NOT move to separate file
   */
  const revertTransactionEffects = useCallback(async (transaction) => {
    if (!transaction || transaction.status === 'undone') return;

    const amount = Number(transaction.amount) || 0;
    if (amount <= 0) return;

    let cashDelta = 0;

    const normalizeBalance = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const updateCardBalance = async (cardId, delta) => {
      if (!cardId) return;
      let card = creditCards.find(c => c.id === cardId);
      if (!card) {
        try {
          card = await dbOperation('creditCards', 'get', cardId);
        } catch (cardError) {
          console.warn('Unable to load card for transaction reversal', cardError);
        }
      }
      if (!card) return;
      const currentBalance = normalizeBalance(card.balance);
      const newBalance = Math.max(0, currentBalance + delta);
      await dbOperation('creditCards', 'put', { ...card, balance: newBalance }, { skipActivityLog: true });
    };

    const updateLoanBalance = async (loanId, delta) => {
      if (!loanId) return;
      let loan = loans.find(l => l.id === loanId);
      if (!loan) {
        try {
          loan = await dbOperation('loans', 'get', loanId);
        } catch (loanError) {
          console.warn('Unable to load loan for transaction reversal', loanError);
        }
      }
      if (!loan) return;
      const currentBalance = normalizeBalance(loan.balance);
      const newBalance = currentBalance + delta;
      await dbOperation('loans', 'put', { ...loan, balance: newBalance }, { skipActivityLog: true });
    };

    if (transaction.type === 'income') {
      cashDelta -= amount;
    } else if (transaction.type === 'expense') {
      // Check if this is a gift card transaction
      const cardId = transaction.card_id || transaction.payment_method_id;
      let isGiftCardTransaction = false;
      
      if (cardId) {
        const card = creditCards.find(c => c.id === cardId);
        isGiftCardTransaction = card?.is_gift_card || false;
      }
      
      if (isGiftCardTransaction) {
        // Gift card reload: reduce gift card balance + refund payment source
        await updateCardBalance(cardId, -amount); // Reduce gift card balance
        
        // Refund payment source
        if (transaction.payment_method === 'bank_account' && transaction.payment_method_id) {
          const { getBankAccount, updateBankAccountBalance } = await import('../utils/db');
          const account = await getBankAccount(transaction.payment_method_id);
          if (account) {
            await updateBankAccountBalance(transaction.payment_method_id, 
              (parseFloat(account.balance) || 0) + amount
            );
          }
        } else if (transaction.payment_method === 'cash_in_hand') {
          if (onUpdateCashInHand) {
            const { getCashInHand } = await import('../utils/db');
            const currentCash = await getCashInHand();
            await onUpdateCashInHand(currentCash + amount);
          }
        } else if (transaction.payment_method === 'credit_card' && transaction.payment_method_id) {
          // Refund to payment card (reverse the charge)
          await updateCardBalance(transaction.payment_method_id, -amount);
        }
      } else {
        // Regular expense (not gift card)
        if (transaction.payment_method === 'cash') {
          cashDelta += amount;
        } else if (transaction.payment_method === 'cash_in_hand') {
          if (onUpdateCashInHand) {
            const { getCashInHand } = await import('../utils/db');
            const currentCash = await getCashInHand();
            await onUpdateCashInHand(currentCash + amount);
          }
        } else if (transaction.payment_method === 'bank_account' && transaction.payment_method_id) {
          const { getBankAccount, updateBankAccountBalance } = await import('../utils/db');
          const account = await getBankAccount(transaction.payment_method_id);
          if (account) {
            await updateBankAccountBalance(transaction.payment_method_id, 
              (parseFloat(account.balance) || 0) + amount
            );
          }
        } else if (transaction.payment_method === 'credit_card') {
          const cardId = transaction.card_id || transaction.payment_method_id;
          await updateCardBalance(cardId, -amount);
        }
      }
    } else if (isPaymentType(transaction.type)) {
      const paymentSubtype = resolvePaymentSubtype(transaction);
      if (transaction.subtype === 'loan_via_credit_card') {
        const cardId = transaction.card_id || transaction.payment_method_id;
        const loanId = transaction.loan_id || transaction.payment_method_id;
        if (cardId) await updateCardBalance(cardId, -amount);
        if (loanId) await updateLoanBalance(loanId, amount);
        return;
      }
      if (paymentSubtype === 'credit_card') {
        const cardId = transaction.card_id || transaction.payment_method_id;
        await updateCardBalance(cardId, amount);
        cashDelta += amount;
      } else if (paymentSubtype === 'loan') {
        const loanId = transaction.loan_id || transaction.payment_method_id;
        await updateLoanBalance(loanId, amount);
        cashDelta += amount;
      } else if (transaction.payment_method === 'cash') {
        cashDelta += amount;
      }
    } else {
      if (transaction.payment_method === 'cash') {
        cashDelta += amount;
      } else if (transaction.payment_method === 'credit_card') {
        const cardId = transaction.card_id || transaction.payment_method_id;
        await updateCardBalance(cardId, -amount);
      } else if (transaction.payment_method === 'loan') {
        const loanId = transaction.loan_id || transaction.payment_method_id;
        await updateLoanBalance(loanId, amount);
        cashDelta += amount;
      }
    }

    if (cashDelta !== 0) {
      let currentCash = Number(availableCash) || 0;
      try {
        const currentCashSetting = await dbOperation('settings', 'get', 'availableCash');
        if (currentCashSetting && currentCashSetting.value !== undefined) {
          currentCash = Number(currentCashSetting.value) || currentCash;
        }
      } catch (cashError) {
        console.warn('Unable to fetch current cash balance, falling back to local value.', cashError);
      }
      const newCash = currentCash + cashDelta;
      await onUpdateCash(newCash);
    }
  }, [availableCash, creditCards, loans, onUpdateCash, onUpdateCashInHand]);

  /**
   * Handles transaction deletion
   * CRITICAL: Reverts financial effects - DO NOT move to separate file
   */
  const handleDelete = async (transaction) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;

    try {
      const previousCash = availableCash;
      const transactionSnapshot = {
        ...transaction,
        status: 'active',
        undone_at: null
      };
      
      // Revert financial effects FIRST
      await revertTransactionEffects(transaction);

      // Handle linked income deletion
      if (transaction.type === 'income' && transaction.payment_method_id) {
        const incomeId = transaction.payment_method_id;
        try {
          const incomeRecord = await dbOperation('income', 'get', incomeId);
          if (incomeRecord) {
            const snapshot = {
              ...incomeRecord,
              previousCash,
              linkedTransactions: [transactionSnapshot]
            };
            await dbOperation('income', 'delete', incomeId, { skipActivityLog: true });
            await logActivity(
              'delete',
              'income',
              incomeId,
              incomeRecord.source || 'Income',
              `Deleted income via transaction removal: ${incomeRecord.source || 'Income'}`,
              snapshot
            );
          }
        } catch (incomeError) {
          console.warn('Unable to remove linked income entry for transaction:', incomeError);
        }
      }

      // Delete transaction
      await dbOperation('transactions', 'delete', transaction.id);
      await onUpdate();
      await loadTransactions();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Error deleting transaction. Please try again.');
    }
  };

  // === RENDER ===
  const totals = getTotalsByType();

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-gray-500">Loading transactions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Transaction Modal */}
      {showAddModal && (
        <AddTransaction
          darkMode={darkMode}
          onClose={handleModalClose}
          onUpdate={async () => {
            await onUpdate();
            await loadTransactions();
          }}
          categories={categories}
          creditCards={creditCards}
          loans={loans}
          reservedFunds={reservedFunds}
          availableCash={availableCash}
          onUpdateCash={onUpdateCash}
          bankAccounts={bankAccounts}
          cashInHand={cashInHand}
          onUpdateCashInHand={onUpdateCashInHand}
        />
      )}

      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-xl md:text-2xl font-bold">Transactions</h2>
        
        <div className="flex flex-wrap gap-2">
          <QuickFiltersDropdown
            darkMode={darkMode}
            quickFilters={quickFilters}
            onLoadFilter={handleLoadFilter}
          />
          
          <button
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base rounded-lg ${
              showFiltersPanel
                ? 'bg-blue-600 text-white'
                : darkMode
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            <FolderOpen size={18} />
            Saved Filters
            {savedFilters.length > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                showFiltersPanel ? 'bg-blue-500' : 'bg-blue-600 text-white'
              }`}>
                {savedFilters.length}
              </span>
            )}
          </button>
          
          <button
            onClick={() => setShowSaveDialog(true)}
            className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Save size={18} />
            Save Filter
          </button>
        </div>
      </div>

      {/* Saved Filters Panel */}
      {showFiltersPanel && savedFilters.length > 0 && (
        <SavedFiltersPanel
          darkMode={darkMode}
          savedFilters={savedFilters}
          onLoadFilter={handleLoadFilter}
          onTogglePin={handleTogglePin}
          onDuplicateFilter={handleDuplicateFilter}
          onDeleteFilter={handleDeleteFilter}
        />
      )}

      {/* Save Filter Dialog */}
      <SaveFilterDialog
        darkMode={darkMode}
        show={showSaveDialog}
        filterName={filterName}
        saveAsPin={saveAsPin}
        saveError={saveError}
        onFilterNameChange={(name) => {
          setFilterName(name);
          setSaveError('');
        }}
        onSaveAsPinChange={setSaveAsPin}
        onSave={handleSaveFilter}
        onCancel={() => {
          setShowSaveDialog(false);
          setFilterName('');
          setSaveAsPin(false);
          setSaveError('');
        }}
      />

      {/* Summary Cards */}
      <TransactionSummaryCards
        darkMode={darkMode}
        totals={totals}
        formatCurrency={formatCurrency}
      />

      {/* Filter Panel */}
      <FilterPanel
        darkMode={darkMode}
        filters={filters}
        onFiltersChange={setFilters}
        categories={categories}
        creditCards={creditCards}
        loans={loans}
        bankAccounts={bankAccounts}
        reservedFunds={reservedFunds}
        onClearFilters={handleClearFilters}
      />

      {/* Transaction List */}
      <div className="space-y-2">
        {filteredTransactions.length === 0 ? (
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-8 text-center`}>
            <p className="text-gray-500">No transactions found</p>
          </div>
        ) : (
          filteredTransactions.map((transaction) => (
            <TransactionCard
              key={transaction.id}
              transaction={transaction}
              darkMode={darkMode}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
