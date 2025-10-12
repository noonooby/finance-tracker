import React, { useState, useEffect, useCallback } from 'react';
import { Search, DollarSign, TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
import { dbOperation } from '../utils/db';
import { logActivity } from '../utils/activityLogger';
import AddTransaction from './AddTransaction';

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
  bankAccounts
}) {
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    category: 'all',
    dateFrom: '',
    dateTo: '',
    paymentMethod: 'all'
  });

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

    setFilteredTransactions(filtered);
  }, [transactions, filters]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    console.log('All transactions:', transactions.map(t => ({
      id: t.id,
      type: t.type,
      payment_method: t.payment_method,
      description: t.description,
      amount: t.amount
    })));
  }, [transactions]);

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

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleModalClose = useCallback(async () => {
    if (onCloseAddModal) onCloseAddModal();
    await loadTransactions();
  }, [onCloseAddModal, loadTransactions]);

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
      if (transaction.payment_method === 'cash') {
        cashDelta += amount;
      } else if (transaction.payment_method === 'credit_card') {
        const cardId = transaction.card_id || transaction.payment_method_id;
        await updateCardBalance(cardId, -amount);
      }
    } else if (isPaymentType(transaction.type)) {
      const paymentSubtype = resolvePaymentSubtype(transaction);
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
      // For other transaction types, fall back to payment method metadata if available
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
  }, [availableCash, creditCards, loans, onUpdateCash]);

  const handleDelete = async (transaction) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;

    try {
      const previousCash = availableCash;
      const transactionSnapshot = {
        ...transaction,
        status: 'active',
        undone_at: null
      };
      await revertTransactionEffects(transaction);

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

      await dbOperation('transactions', 'delete', transaction.id);
      await onUpdate();
      await loadTransactions();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Error deleting transaction. Please try again.');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'income':
        return <TrendingUp className="text-green-600" size={20} />;
      case 'expense':
        return <TrendingDown className="text-red-600" size={20} />;
      case 'payment':
      case 'loan_payment':
      case 'credit_card_payment':
        return <DollarSign className="text-blue-600" size={20} />;
      default:
        return <DollarSign className="text-gray-600" size={20} />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'income':
        return 'text-green-600 bg-green-50';
      case 'expense':
        return 'text-red-600 bg-red-50';
      case 'payment':
      case 'loan_payment':
      case 'credit_card_payment':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
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
        />
      )}

      <h2 className="text-2xl font-bold">Transactions</h2>

      <div className="grid grid-cols-3 gap-4">
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4`}>
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <TrendingUp size={20} />
            <span className="font-medium">Income</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totals.income)}</p>
        </div>
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4`}>
          <div className="flex items-center gap-2 text-red-600 mb-2">
            <TrendingDown size={20} />
            <span className="font-medium">Expenses</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totals.expense)}</p>
        </div>
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4`}>
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <DollarSign size={20} />
            <span className="font-medium">Payments</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totals.payment)}</p>
        </div>
      </div>

      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4 space-y-4`}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search transactions..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className={`w-full pl-10 pr-4 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="payment">Payments</option>
          </select>

          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
            ))}
          </select>

          <select
            value={filters.paymentMethod}
            onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
            className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          >
            <option value="all">All Methods</option>
            <option value="cash">Cash</option>
            <option value="credit_card">Credit Card</option>
            <option value="loan">Loan</option>
          </select>

          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
            placeholder="From"
          />

          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
            placeholder="To"
          />
        </div>
      </div>

      <div className="space-y-2">
        {filteredTransactions.length === 0 ? (
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-8 text-center`}>
            <p className="text-gray-500">No transactions found</p>
          </div>
        ) : (
          filteredTransactions.map((transaction) => {
            const isUndone = transaction.status === 'undone';
            const formatLabel = (value) => {
              if (!value) return '';
              const cleaned = value.replace(/_/g, ' ');
              return cleaned
                .toLowerCase()
                .replace(/\b\w/g, (char) => char.toUpperCase());
            };
            const formattedType = formatLabel(transaction.type || 'transaction');
            const methodLabel = transaction.payment_method_name || transaction.payment_method || null;
            const formattedMethod = transaction.payment_method_name ? methodLabel : formatLabel(methodLabel);
            const statusLabel = transaction.status ? formatLabel(transaction.status) : null;
            const infoChips = [
              { label: 'Type', value: formattedType }
            ];

            if (formattedMethod) {
              infoChips.push({ label: 'Method', value: formattedMethod });
            }

            if (statusLabel && statusLabel.toLowerCase() !== 'active') {
              infoChips.push({ label: 'Status', value: statusLabel });
            }

            const chipClass = darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700';

            return (
            <div
              key={transaction.id}
              className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4 hover:shadow-md transition-shadow ${isUndone ? 'opacity-75' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`p-2 rounded-lg ${getTypeColor(transaction.type)}`}>
                    {getTypeIcon(transaction.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`font-semibold ${isUndone ? 'line-through text-gray-400' : ''}`}>
                        {transaction.description || transaction.income_source || 'Transaction'}
                      </h3>
                      {transaction.category_name && (
                        <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                          {transaction.category_name}
                        </span>
                      )}
                      {isUndone && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600">
                          Undone
                        </span>
                      )}
                    </div>
                    
                    <div className={`flex items-center gap-3 text-sm ${isUndone ? 'text-gray-400 line-through' : 'text-gray-500'}`}>
                      <span>{formatDate(transaction.date)}</span>
                    </div>
                    
                    {infoChips.length > 0 && (
                      <div className={`flex flex-wrap gap-2 mt-2 text-xs ${isUndone ? 'text-gray-400' : ''}`}>
                        {infoChips.map((chip, index) => (
                          <span
                            key={`${transaction.id}-${chip.label}-${index}`}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded ${chipClass}`}
                          >
                            <span className="font-semibold">{chip.label}:</span>
                            <span className="capitalize">{chip.value}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {transaction.notes && (
                      <p className={`text-sm mt-1 ${isUndone ? 'text-gray-400 line-through' : 'text-gray-500'}`}>{transaction.notes}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <p className={`text-xl font-bold ${
                    transaction.type === 'income' ? 'text-green-600' : 
                    transaction.type === 'expense' ? 'text-red-600' : 
                    'text-blue-600'
                  } ${isUndone ? 'line-through text-gray-400' : ''}`}>
                    {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                  </p>
                  
                  <button
                    onClick={() => handleDelete(transaction)}
                    className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} text-red-600`}
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          );
        })
        )}
      </div>
    </div>
  );
}
