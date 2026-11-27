import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ask } from '../utils/confirm';
import { Save, FolderOpen, ListX } from 'lucide-react';
import { Card, EmptyState } from './shared/ui';
import { localDate } from '../utils/helpers';
import { dbOperation } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import { reverseTransaction } from '../utils/money';
import EditTransaction from './transactions/EditTransaction';
import { useFinanceData } from '../hooks/useFinanceData';
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
import { showToast } from '../utils/toast';
import { categoryParts, touchesAccount, spendingSign } from '../utils/spending';

/**
 * Transaction History Component
 * Main container - handles all business logic and financial operations
 * UI components are extracted for modularity
 */
export default function TransactionHistory({
  categories,
  creditCards,
  loans,
  availableCash,
  onUpdate,
  onUpdateCash,
  bankAccounts
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
    type === 'payment' || type === 'loan_payment' || type === 'credit_card_payment';

  const getTotalsByType = () => {
    const totals = {
      income: 0,
      expense: 0,
      payment: 0
    };

    filteredTransactions.forEach(t => {
      if (t.status === 'undone' || t.status === 'deleted') return;
      const amount = Number(t.amount) || 0;
      if (t.type === 'income') {
        totals.income += amount;
      } else if (spendingSign(t)) {
        // Refunds come off; loading a gift card is not spending (as in budgets and reports).
        totals.expense += spendingSign(t) * amount;
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
      // A split purchase is found under each of its parts.
      filtered = filtered.filter(t => categoryParts(t).some(p => p.category_id === String(filters.category)));
    }

    if (filters.dateFrom) {
      filtered = filtered.filter(t => String(t.date || '').slice(0, 10) >= filters.dateFrom);
    }
    if (filters.dateTo) {
      filtered = filtered.filter(t => String(t.date || '').slice(0, 10) <= filters.dateTo);
    }

    if (filters.paymentMethod !== 'all') {
      filtered = filtered.filter(t => t.payment_method === filters.paymentMethod);
    }

    // Everything that involved the chosen card, account or loan: paid from it, paid to it, or moved to or from it.
    if (filters.creditCard !== 'all') filtered = filtered.filter(t => touchesAccount(t, 'credit_cards', filters.creditCard));
    if (filters.loan !== 'all') filtered = filtered.filter(t => touchesAccount(t, 'loans', filters.loan));
    if (filters.bankAccount !== 'all') filtered = filtered.filter(t => touchesAccount(t, 'bank_accounts', filters.bankAccount));

    if (filters.incomeSource !== 'all') {
      filtered = filtered.filter(t => {
        if (t.type === 'income' && t.payment_method_id === filters.incomeSource) return true;
        if (t.income_id === filters.incomeSource) return true;
        return false;
      });
    }


    // Newest day first; within a day, the one entered last comes first.
    const day = (t) => String(t.date || '').slice(0, 10);
    filtered.sort((x, y) => day(y).localeCompare(day(x)) || String(y.created_at || '').localeCompare(String(x.created_at || '')));
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

  // The list follows the app's data: a line added from anywhere shows here without leaving the page.
  const { transactions: live } = useFinanceData();
  useEffect(() => {
    loadTransactions();
  }, [loadTransactions, live]);


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
      setSaveError('Set at least one filter before saving');
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
      
      showToast.success(`Filter "${filterData.name}" saved`);
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
    if (!(await ask(`Delete "${filter.name}"?`))) {
      return;
    }

    try {
      await deleteSavedFilter(filter.id);
      await loadSavedFilters();
      await loadQuickFilters();
      showToast.success('Filter deleted');
    } catch (error) {
      console.error('Error deleting filter:', error);
      showToast.error('Failed to delete filter');
    }
  };

  const handleDuplicateFilter = async (filter) => {
    try {
      await duplicateFilter(filter.id);
      await loadSavedFilters();
      showToast.success(`Filter duplicated`);
    } catch (error) {
      console.error('Error duplicating filter:', error);
      showToast.error('Failed to duplicate filter');
    }
  };

  const [editing, setEditing] = useState(null);
  // Years of lines are not all drawn at once: the newest first, more as you reach the end of the list.
  const STEP = 80;
  const [shown, setShown] = useState(STEP);
  const more = useRef(null);
  useEffect(() => { setShown(STEP); }, [filteredTransactions]);
  useEffect(() => {
    const node = more.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setShown((n) => n + STEP); }, { rootMargin: '600px' });
    io.observe(node);
    return () => io.disconnect();
  });
  // === CRITICAL FINANCIAL LOGIC (STAYS HERE - DO NOT EXTRACT) ===
  // Money goes back through the server: exactly what the transaction moved, on the same accounts.
  // A transaction with no recorded legs moved nothing through this path, so it is only marked.
  const revertTransactionEffects = useCallback(async (transaction, { remove = false } = {}) => {
    if (!transaction || transaction.status === 'undone' || transaction.status === 'deleted') return;
    await reverseTransaction(transaction.id, remove ? { remove: true } : {});
  }, []);

  /**
   * Handles transaction deletion
   * CRITICAL: Reverts financial effects - DO NOT move to separate file
   */
  const handleDelete = async (transaction) => {
    if (!(await ask('Delete this line?'))) return;

    try {
      const previousCash = availableCash;
      const transactionSnapshot = {
        ...transaction,
        status: 'active',
        undone_at: null
      };
      
      // Revert financial effects FIRST
      await revertTransactionEffects(transaction, { remove: true });

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
      showToast.error(`Could not delete transaction: ${error?.message || 'try again'}`);
    }
  };

  // === RENDER ===
  const totals = getTotalsByType();

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-muted">Loading transactions...</div>
      </div>
    );
  }

  // Lines a day at a time, newest day first, in the order they are listed.
  const days = [];
  for (const t of filteredTransactions.slice(0, shown)) {
    const day = String(t.date || '').slice(0, 10);
    const last = days[days.length - 1];
    if (last && last[0] === day) last[1].push(t); else days.push([day, [t]]);
  }
  const dayTitle = (day) => {
    const today = localDate();
    const y = new Date(`${today}T12:00:00`); y.setDate(y.getDate() - 1);
    if (day === today) return 'Today';
    if (day === y.toLocaleDateString('en-CA')) return 'Yesterday';
    const d = new Date(`${day}T12:00:00`);
    return Number.isNaN(d.getTime()) ? 'No date' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) });
  };

  return (
    <div className="space-y-4">
      {editing && (
        <EditTransaction transaction={editing} transactions={transactions} categories={categories} bankAccounts={bankAccounts} creditCards={creditCards} loans={loans}
          onClose={() => setEditing(null)} onSaved={async () => { await onUpdate(); await loadTransactions(); }} />
      )}

      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        
        <div className="flex flex-wrap gap-2">
          <QuickFiltersDropdown
            quickFilters={quickFilters}
            onLoadFilter={handleLoadFilter}
          />
          
          <button
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            className={`press flex items-center gap-1.5 px-3.5 h-10 text-sm font-medium rounded-xl ${
              showFiltersPanel
                ? 'bg-accent text-accent-contrast'
                : 'bg-surface-2 hover:bg-line/60 text-fg'
            }`}
          >
            <FolderOpen size={16} />
            Saved
            {savedFilters.length > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                showFiltersPanel ? 'bg-accent-soft0' : 'bg-accent text-accent-contrast'
              }`}>
                {savedFilters.length}
              </span>
            )}
          </button>
          
          <button
            onClick={() => setShowSaveDialog(true)}
            className="press flex items-center gap-1.5 px-3.5 h-10 text-sm font-medium rounded-xl bg-surface-2 text-fg"
          >
            <Save size={16} />
            Save this view
          </button>
        </div>
      </div>

      {/* Saved Filters Panel */}
      {showFiltersPanel && savedFilters.length > 0 && (
        <SavedFiltersPanel
          savedFilters={savedFilters}
          onLoadFilter={handleLoadFilter}
          onTogglePin={handleTogglePin}
          onDuplicateFilter={handleDuplicateFilter}
          onDeleteFilter={handleDeleteFilter}
        />
      )}

      {/* Save Filter Dialog */}
      <SaveFilterDialog
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
        totals={totals}
        formatCurrency={formatCurrency}
      />

      {/* Filter Panel */}
      <FilterPanel
        filters={filters}
        onFiltersChange={setFilters}
        categories={categories}
        creditCards={creditCards}
        loans={loans}
        bankAccounts={bankAccounts}
        onClearFilters={handleClearFilters}
      />

      {/* The lines, a day at a time */}
      {filteredTransactions.length === 0 ? (
        <Card><EmptyState icon={ListX} title="Nothing here" text="No line matches. Clear the search or the filters, or add a picture." /></Card>
      ) : (
        <div className="space-y-4">
          {days.map(([day, list]) => (
            <section key={day} className="space-y-1.5">
              <h2 className="px-1 text-sm font-semibold text-muted">{dayTitle(day)}</h2>
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {list.map((transaction) => (
                  <TransactionCard key={transaction.id} transaction={transaction} onDelete={handleDelete} onEdit={setEditing} />
                ))}
              </Card>
            </section>
          ))}
          {filteredTransactions.length > shown && (
            <div ref={more} className="text-center">
              <button type="button" className="press chip" onClick={() => setShown((n) => n + STEP)}>Show more ({(filteredTransactions.length - shown).toLocaleString()} older)</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
