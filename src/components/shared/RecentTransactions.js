import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { effectOn } from '../../utils/lines';
import { useFinanceData } from '../../hooks/useFinanceData';
import MoveLine, { canMove } from './MoveLine';
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
 * @param {string} props.entityType - Type of entity: 'card', 'loan', or 'bank_account'
 * @param {string} props.entityId - ID of the entity
 * @param {string} props.entityName - Name of the entity (for settings key)
 */
export default function RecentTransactions({ 
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
  const [moving, setMoving] = useState(null);
  const { bankAccounts = [], creditCards = [], transactions: everyLine = [], loadAllData } = useFinanceData();
  const ref = entityType === 'bank_account' ? `bank_account:${entityId}` : entityType === 'card' ? `credit_card:${entityId}` : null;

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
    <div className="mb-3 pb-3 border-b border-line">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={handleToggleCollapse}
          className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg"
        >
          {isCollapsed ? (
            <ChevronRight size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
          Recent activity {!loading && transactions.length > 0 && `(${transactions.length})`}
        </button>
        
        {!isCollapsed && (
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1 rounded hover:bg-surface-2 text-muted"
              title="Transaction display settings"
            >
              <Settings size={12} />
            </button>
            
            {showSettings && (
              <div className="absolute right-0 top-6 z-10 bg-surface border-line border rounded-xl shadow-lg p-2 min-w-[120px]">
                <div className="text-xs font-medium mb-1 text-muted">
                  Show last:
                </div>
                <div className="space-y-1">
                  {[3, 5, 10, 15, 20].map(count => (
                    <button
                      key={count}
                      onClick={() => handleDisplayCountChange(count)}
                      className={`w-full text-left px-2 py-1 rounded text-xs ${
                        displayCount === count
                          ? 'bg-accent text-accent-contrast'
                          : 'hover:bg-surface-2 text-muted'
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
            <div className="text-xs text-center py-2 text-muted">
              Loading...
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-xs text-center py-2 text-muted">
              No recent transactions
            </div>
          ) : (<>
            {ref && <p className="text-[10px] text-muted">Tap a line that is on the wrong account to move it.</p>}
            {transactions.map(txn => {
              // What the line did to this account decides its sign: money in or out of a bank account, more or less owed on a card or loan.
              const did = effectOn(txn, entityType, entityId);
              const up = did != null ? did >= 0 : getTransactionSign(txn) === '+';
              const good = entityType === 'bank_account' ? up : !up;
              const movable = ref && canMove(txn, { bankAccounts, creditCards });
              const Row = movable ? 'button' : 'div';
              return (
                <Row key={txn.id} {...(movable ? { type: 'button', onClick: () => setMoving(txn), 'aria-label': `${txn.description || 'Line'}: wrong account?` } : {})}
                  className={`w-full flex justify-between items-center text-left text-xs ${movable ? 'press rounded-xl -mx-1 px-1 py-0.5' : ''} text-muted`}>
                  <div className="flex-1 truncate mr-2">
                    <div className="truncate">{txn.description || txn.category_name || txn.income_source || txn.type}</div>
                    <div className="text-[10px] text-muted">{formatDate(txn.date)}</div>
                  </div>
                  <div className={`font-medium flex-shrink-0 ${good ? 'text-positive' : 'text-negative'}`}>
                    {up ? '+' : '-'}{formatCurrency(Math.abs(did != null ? did : txn.amount))}
                  </div>
                </Row>
              );
            })}
          </>)}
        </div>
      )}
      {moving && <MoveLine line={moving} from={ref} transactions={everyLine} bankAccounts={bankAccounts} creditCards={creditCards} onClose={() => setMoving(null)} onDone={async () => { await loadAllData(); await loadTransactions(); }} />}
    </div>
  );
}
