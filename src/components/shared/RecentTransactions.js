import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { getCardTransactions, getLoanTransactions, getBankAccountTransactions } from '../../utils/db';
import {
  getUserPreferences,
  updateRecentTransactionsSettings
} from '../../utils/userPreferencesManager';

/**
 * RecentTransactions Component
 * Uniform collapsible transaction history for cards, loans, and bank accounts
 * 
 * @param {Object} props
 * @param {boolean} props.darkMode - Dark mode flag
 * @param {string} props.entityType - Type of entity: 'card', 'loan', or 'bank_account'
 * @param {string} props.entityId - ID of the entity
 * @param {string} props.entityName - Name of the entity (for settings key)
 */
export default function RecentTransactions({ 
  darkMode, 
  entityType, 
  entityId,
  entityName 
}) {
  const [transactions, setTransactions] = useState([]);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [displayCount, setDisplayCount] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, [entityType, entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load transactions when count changes OR on initial load
  useEffect(() => {
    if (initialLoadDone || !isCollapsed) {
      loadTransactions();
    }
  }, [displayCount, entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load to check if we have transactions
  useEffect(() => {
    if (!initialLoadDone) {
      loadTransactions();
      setInitialLoadDone(true);
    }
  }, [entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPreferences = async () => {
    try {
      const prefs = await getUserPreferences();
      const recentTxnSettings = prefs.recent_transactions_settings || {};
      const entitySettings = recentTxnSettings[entityType];
      
      if (entitySettings) {
        setIsCollapsed(entitySettings.collapsed ?? true);
        setDisplayCount(entitySettings.display_count ?? 5);
      }
    } catch (error) {
      console.error('Error loading recent transactions preferences:', error);
    }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      let data = [];
      
      switch (entityType) {
        case 'card':
          data = await getCardTransactions(entityId, displayCount);
          break;
        case 'loan':
          data = await getLoanTransactions(entityId, displayCount);
          break;
        case 'bank_account':
          data = await getBankAccountTransactions(entityId, displayCount);
          break;
        default:
          console.warn('Unknown entity type:', entityType);
      }
      
      setTransactions(data);
    } catch (error) {
      console.error('Error loading transactions:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCollapse = async () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    
    // Reload transactions when expanding
    if (!newCollapsed) {
      loadTransactions();
    }
    
    try {
      await updateRecentTransactionsSettings(entityType, {
        collapsed: newCollapsed,
        display_count: displayCount
      });
    } catch (error) {
      console.error('Error saving collapse state:', error);
    }
  };

  const handleDisplayCountChange = async (newCount) => {
    setDisplayCount(newCount);
    setShowSettings(false);
    
    try {
      await updateRecentTransactionsSettings(entityType, {
        collapsed: isCollapsed,
        display_count: newCount
      });
      
      // Reload with new count
      await loadTransactions();
    } catch (error) {
      console.error('Error saving display count:', error);
    }
  };

  const getTransactionColor = (txn) => {
    // Special case: Loan payment from credit card
    if (txn.type === 'payment' && txn.loan_id && txn.card_id && entityType === 'card') {
      return 'text-red-600'; // Charge to card (increases debt)
    }
    
    // Payment transactions reduce balance (green/negative)
    if (txn.type === 'payment') {
      return 'text-green-600';
    }
    
    // For bank accounts, deposits are positive (green), withdrawals are negative (red)
    if (entityType === 'bank_account') {
      if (txn.type === 'income' || txn.type === 'cash_deposit' || txn.type === 'transfer_in') {
        return 'text-green-600';
      }
      return 'text-red-600';
    }
    
    // For cards and loans, expenses increase balance (red/positive)
    return 'text-red-600';
  };

  const getTransactionSign = (txn) => {
    // Special case: Loan payment from credit card
    if (txn.type === 'payment' && txn.loan_id && txn.card_id && entityType === 'card') {
      return '+'; // Charge to card (increases balance)
    }
    
    // Payment transactions reduce balance
    if (txn.type === 'payment') {
      return '-';
    }
    
    // For bank accounts, deposits are positive, withdrawals are negative
    if (entityType === 'bank_account') {
      if (txn.type === 'income' || txn.type === 'cash_deposit' || txn.type === 'transfer_in') {
        return '+';
      }
      return '-';
    }
    
    // For cards and loans, expenses increase balance
    return '+';
  };

  // Don't show if no transactions after initial load
  if (!loading && initialLoadDone && transactions.length === 0) {
    return null;
  }

  return (
    <div className={`mb-3 pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={handleToggleCollapse}
          className={`flex items-center gap-1 text-xs font-medium ${darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'}`}
        >
          {isCollapsed ? (
            <ChevronRight size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
          Recent Activity {!loading && transactions.length > 0 && `(${transactions.length})`}
        </button>
        
        {!isCollapsed && (
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1 rounded ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              title="Transaction display settings"
            >
              <Settings size={12} />
            </button>
            
            {showSettings && (
              <div className={`absolute right-0 top-6 z-10 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} border rounded-lg shadow-lg p-2 min-w-[120px]`}>
                <div className={`text-xs font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Show last:
                </div>
                <div className="space-y-1">
                  {[3, 5, 10, 15, 20].map(count => (
                    <button
                      key={count}
                      onClick={() => handleDisplayCountChange(count)}
                      className={`w-full text-left px-2 py-1 rounded text-xs ${
                        displayCount === count
                          ? 'bg-blue-600 text-white'
                          : darkMode
                            ? 'hover:bg-gray-600 text-gray-300'
                            : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {count} transactions
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {!isCollapsed && (
        <div className="space-y-1.5">
          {loading ? (
            <div className={`text-xs text-center py-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Loading...
            </div>
          ) : transactions.length === 0 ? (
            <div className={`text-xs text-center py-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              No recent transactions
            </div>
          ) : (
            transactions.map(txn => (
              <div 
                key={txn.id} 
                className={`flex justify-between items-center text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
              >
                <div className="flex-1 truncate mr-2">
                  <div className="truncate">
                    {txn.description || txn.category_name || txn.income_source || txn.type}
                  </div>
                  <div className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {formatDate(txn.date)}
                  </div>
                </div>
                <div className={`font-medium flex-shrink-0 ${getTransactionColor(txn)}`}>
                  {getTransactionSign(txn)}{formatCurrency(txn.amount)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
