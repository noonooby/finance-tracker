import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, Edit2, Wallet, ArrowDownToLine, ArrowUpFromLine, Activity } from 'lucide-react';
import { formatCurrency, formatDate, calculateTotalBankBalance } from '../utils/helpers';
import { withdrawCashFromBank, depositCashToBank } from '../utils/db';
import { logActivity } from '../utils/activityLogger';

export default function Dashboard({
  darkMode,
  availableCash,
  totalReserved,
  trueAvailable,
  upcomingObligations,
  nextIncome,
  totalCreditCardDebt,
  totalLoanDebt,
  creditCards,
  loans,
  alertSettings,
  onNavigate,
  onUpdateAlertSettings,
  bankAccounts,
  cashInHand,
  showCashInDashboard,
  onUpdateCashInHand,
  onToggleCashDisplay,
  onReloadAll,
  latestActivities
}) {
  const urgentDays = alertSettings?.defaultDays || 7;
  const upcomingDays = alertSettings?.upcomingDays || 30;
  const [showAlertEditor, setShowAlertEditor] = useState(false);
  const [urgentInput, setUrgentInput] = useState(urgentDays);
  const [upcomingInput, setUpcomingInput] = useState(upcomingDays);
  
  // Cash operations modal state
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashOperation, setCashOperation] = useState('withdraw'); // 'withdraw' or 'deposit'
  const [cashFormData, setCashFormData] = useState({
    accountId: '',
    amount: ''
  });
  const [processingCash, setProcessingCash] = useState(false);
  
  // Get accounts in overdraft
  const overdraftAccounts = (bankAccounts || []).filter(acc => (Number(acc.balance) || 0) < 0);

  useEffect(() => {
    setUrgentInput(urgentDays);
    setUpcomingInput(upcomingDays);
  }, [urgentDays, upcomingDays]);

  const handleSaveAlertSettings = () => {
    const parsedUrgent = Math.max(0, parseInt(urgentInput, 10) || 0);
    const parsedUpcoming = Math.max(0, parseInt(upcomingInput, 10) || 0);
    onUpdateAlertSettings?.({
      defaultDays: parsedUrgent,
      upcomingDays: parsedUpcoming
    });
    setShowAlertEditor(false);
  };

  const handleObligationClick = (obligation) => {
    if (!obligation || !onNavigate) return;
    const id = obligation.id;
    switch (obligation.type) {
      case 'credit_card':
        onNavigate({ view: 'cards', focus: { type: 'card', id } });
        break;
      case 'loan':
        onNavigate({ view: 'loans', focus: { type: 'loan', id } });
        break;
      case 'reserved_fund':
        onNavigate({ view: 'reserved', focus: { type: 'fund', id } });
        break;
      default:
        break;
    }
  };

  const handleSummaryNavigate = (view) => {
    if (!onNavigate) return;
    onNavigate({ view });
  };
  
  const handleCashOperation = async () => {
    if (!cashFormData.accountId || !cashFormData.amount) {
      alert('Please select an account and enter an amount');
      return;
    }
    
    const amount = parseFloat(cashFormData.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    setProcessingCash(true);
    
    try {
      let result;
      const account = bankAccounts.find(acc => acc.id === cashFormData.accountId);
      
      if (cashOperation === 'withdraw') {
        result = await withdrawCashFromBank(cashFormData.accountId, amount);
        
        // Log activity
        await logActivity(
          'cash_withdrawal',
          'bank_account',
          result.accountId,
          result.accountName,
          `Withdrew ${formatCurrency(result.amount)} from '${result.accountName}' to cash in hand`,
          {
            accountId: result.accountId,
            accountName: result.accountName,
            amount: result.amount,
            previousBankBalance: result.previousBankBalance,
            newBankBalance: result.newBankBalance,
            previousCashInHand: result.previousCashInHand,
            newCashInHand: result.newCashInHand,
            transactionId: result.transactionId
          }
        );
        
        alert(`Successfully withdrew ${formatCurrency(amount)} from ${result.accountName} to cash in hand`);
      } else {
        result = await depositCashToBank(cashFormData.accountId, amount);
        
        // Log activity
        await logActivity(
          'cash_deposit',
          'bank_account',
          result.accountId,
          result.accountName,
          `Deposited ${formatCurrency(result.amount)} from cash in hand to '${result.accountName}'`,
          {
            accountId: result.accountId,
            accountName: result.accountName,
            amount: result.amount,
            previousBankBalance: result.previousBankBalance,
            newBankBalance: result.newBankBalance,
            previousCashInHand: result.previousCashInHand,
            newCashInHand: result.newCashInHand,
            transactionId: result.transactionId
          }
        );
        
        alert(`Successfully deposited ${formatCurrency(amount)} from cash in hand to ${result.accountName}`);
      }
      
      // Reload all data
      if (onReloadAll) await onReloadAll();
      
      // Reset and close modal
      setCashFormData({ accountId: '', amount: '' });
      setShowCashModal(false);
    } catch (error) {
      console.error('Cash operation failed:', error);
      alert(error.message || 'Cash operation failed');
    } finally {
      setProcessingCash(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Overdraft Warning Banner */}
      {overdraftAccounts.length > 0 && (
        <div className={`${darkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border rounded-lg p-4`}>
          <div className={`flex items-center gap-2 ${darkMode ? 'text-red-200' : 'text-red-800'} font-semibold mb-2`}>
            <AlertCircle size={20} />
            <span>Overdraft Alert</span>
          </div>
          <div className="space-y-1">
            {overdraftAccounts.map(acc => (
              <div key={acc.id} className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                '{acc.name}' is in overdraft by {formatCurrency(Math.abs(acc.balance))}. Resolve soon to avoid fees.
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className={`${darkMode ? 'bg-blue-900' : 'bg-gradient-to-r from-blue-600 to-blue-700'} rounded-lg p-6 text-white`}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium opacity-90">Total Available</h2>
          <button
            onClick={() => setShowCashModal(true)}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded ${darkMode ? 'bg-blue-800 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-500'} text-white`}
            title="Cash Operations"
          >
            <Wallet size={14} />
            Cash
          </button>
        </div>
        <div className="text-4xl font-bold mb-1">{formatCurrency(availableCash)}</div>
        
        {/* Cash Breakdown (if toggle enabled) */}
        {showCashInDashboard && (
          <div className="text-sm opacity-90 mt-2 space-y-1">
            <div>💵 Cash in Hand: {formatCurrency(cashInHand || 0)}</div>
            <div>🏦 Bank Accounts: {formatCurrency(calculateTotalBankBalance(bankAccounts || []))}</div>
          </div>
        )}
        
        <div className="text-sm opacity-90 mt-2">Reserved: {formatCurrency(totalReserved)}</div>
        <div className={`mt-3 pt-3 ${darkMode ? 'border-blue-800' : 'border-blue-500'} border-t`}>
          <div className="text-lg font-semibold">True Available: {formatCurrency(trueAvailable)}</div>
        </div>
      </div>

      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-4`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Obligation Alerts</h3>
          <button
            onClick={() => setShowAlertEditor((prev) => !prev)}
            className={`flex items-center gap-2 px-3 py-1 text-sm rounded ${darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <Edit2 size={16} />
            {showAlertEditor ? 'Close' : 'Edit'}
          </button>
        </div>
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Default urgent window: <span className="font-semibold">{urgentDays} days</span> • Upcoming window: <span className="font-semibold">{upcomingDays} days</span>
        </p>
        <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
          Note: Individual cards and loans may use custom alert windows
        </p>
        {showAlertEditor && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Default Urgent Window (days)
              </label>
              <input
                type="number"
                min="0"
                value={urgentInput}
                onChange={(e) => setUrgentInput(e.target.value)}
                className={`w-full px-3 py-2 border rounded ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              />
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Cards/loans can override this
              </p>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Upcoming (days)
              </label>
              <input
                type="number"
                min="0"
                value={upcomingInput}
                onChange={(e) => setUpcomingInput(e.target.value)}
                className={`w-full px-3 py-2 border rounded ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button
                onClick={handleSaveAlertSettings}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowAlertEditor(false);
                  setUrgentInput(urgentDays);
                  setUpcomingInput(upcomingDays);
                }}
                className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} py-2 rounded-lg font-medium`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {upcomingObligations.filter(o => o.urgent).length > 0 && (
        <div className={`${darkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border rounded-lg p-4`}>
          <div className={`flex items-center gap-2 ${darkMode ? 'text-red-200' : 'text-red-800'} font-semibold mb-3`}>
            <AlertCircle size={20} />
            <span>Urgent Obligations</span>
          </div>
          <div className="space-y-2">
            {upcomingObligations.filter(o => o.urgent).map(obl => (
              <button
                key={obl.id}
                type="button"
                onClick={() => handleObligationClick(obl)}
                className="w-full flex justify-between items-center text-sm rounded-lg px-3 py-2 transition-colors hover:bg-red-100/60 dark:hover:bg-red-800/40"
              >
                <span className="font-medium">{obl.name}</span>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(obl.amount)}</div>
                    <div className={`text-xs ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                      {obl.days === 0 ? 'Today' : obl.days === 1 ? 'Tomorrow' : `${obl.days} days`}
                    </div>
                  </div>
                  <ChevronRight size={16} className={darkMode ? 'text-red-200' : 'text-red-500'} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
        <h3 className="font-semibold mb-3">Upcoming Obligations ({upcomingDays} Days)</h3>
        <div className="space-y-3">
          {upcomingObligations.filter(o => !o.urgent).length === 0 ? (
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No upcoming obligations</p>
          ) : (
            upcomingObligations.filter(o => !o.urgent).map(obl => (
              <button
                key={obl.id}
                type="button"
                onClick={() => handleObligationClick(obl)}
                className={`w-full flex justify-between items-center pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'} last:border-0 text-left hover:bg-gray-100/60 dark:hover:bg-gray-700/40 rounded-lg px-2`}
              >
                <div className="py-1">
                  <div className="font-medium">{obl.name}</div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} capitalize`}>{obl.type.replace('_', ' ')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(obl.amount)}</div>
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{obl.days} days</div>
                  </div>
                  <ChevronRight size={16} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {nextIncome && (
        <div className={`${darkMode ? 'bg-green-900 border-green-700' : 'bg-green-50 border-green-200'} border rounded-lg p-4`}>
          <h3 className={`font-semibold ${darkMode ? 'text-green-200' : 'text-green-800'} mb-2`}>Next Income</h3>
          <div className="flex justify-between items-center">
            <div>
              <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{nextIncome.source}</div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{formatDate(nextIncome.date)}</div>
            </div>
            <button
              type="button"
              onClick={() => handleSummaryNavigate('income')}
              className="flex items-center gap-2 text-right text-left md:text-right"
            >
              <div className={`text-lg font-bold ${darkMode ? 'text-green-300' : 'text-green-700'}`}>{formatCurrency(nextIncome.amount)}</div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{nextIncome.days} days</div>
              <ChevronRight size={16} className={darkMode ? 'text-green-200' : 'text-green-600'} />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => handleSummaryNavigate('cards')}
          className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 text-left hover:bg-gray-100/60 dark:hover:bg-gray-700/40 transition-colors`}
        >
          <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Credit Cards</div>
          <div className="text-2xl font-bold">{formatCurrency(totalCreditCardDebt)}</div>
          <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>{creditCards.length} cards</div>
        </button>
        <button
          type="button"
          onClick={() => handleSummaryNavigate('loans')}
          className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 text-left hover:bg-gray-100/60 dark:hover:bg-gray-700/40 transition-colors`}
        >
          <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Loans</div>
          <div className="text-2xl font-bold">{formatCurrency(totalLoanDebt)}</div>
          <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>{loans.length} loans</div>
        </button>
        {bankAccounts && bankAccounts.length > 0 && (
          <button
            type="button"
            onClick={() => handleSummaryNavigate('bank-accounts')}
            className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 text-left hover:bg-gray-100/60 dark:hover:bg-gray-700/40 transition-colors col-span-2`}
          >
            <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Bank Accounts</div>
            <div className="text-2xl font-bold">{formatCurrency(calculateTotalBankBalance(bankAccounts))}</div>
            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>{bankAccounts.length} {bankAccounts.length === 1 ? 'account' : 'accounts'}</div>
          </button>
        )}
      </div>
      
      {/* Latest Updates */}
      {latestActivities && latestActivities.length > 0 && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Activity size={18} />
              Latest Updates
            </h3>
            <button
              onClick={() => onNavigate?.({ view: 'activity' })}
              className={`text-xs px-3 py-1 rounded ${darkMode ? 'bg-blue-900 text-blue-200 hover:bg-blue-800' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
            >
              View All
            </button>
          </div>
          <div className="space-y-2">
            {latestActivities.slice(0, 5).map(activity => {
              const timeDiff = Date.now() - new Date(activity.created_at).getTime();
              const minutesAgo = Math.floor(timeDiff / 60000);
              const hoursAgo = Math.floor(timeDiff / 3600000);
              const daysAgo = Math.floor(timeDiff / 86400000);
              
              const timeAgo = minutesAgo < 1 ? 'Just now' 
                : minutesAgo < 60 ? `${minutesAgo}m ago`
                : hoursAgo < 24 ? `${hoursAgo}h ago`
                : `${daysAgo}d ago`;
              
              return (
                <div key={activity.id} className={`text-sm pb-2 border-b last:border-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div className={`font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                    {activity.description}
                  </div>
                  <div className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {timeAgo}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Cash Operations Modal */}
      {showCashModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCashModal(false)}>
          <div 
            className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-6 max-w-md w-full m-4`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Wallet size={20} />
                Cash Operations
              </h3>
              <button
                onClick={() => setShowCashModal(false)}
                className={`text-2xl leading-none ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`}
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Operation Type */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Operation Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCashOperation('withdraw')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${cashOperation === 'withdraw'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                      : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <ArrowDownToLine size={18} />
                    Withdraw
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashOperation('deposit')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${cashOperation === 'deposit'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                      : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <ArrowUpFromLine size={18} />
                    Deposit
                  </button>
                </div>
              </div>
              
              {/* Account Selection */}
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Select Account *
                </label>
                <select
                  value={cashFormData.accountId}
                  onChange={(e) => setCashFormData({ ...cashFormData, accountId: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                >
                  <option value="">Choose account</option>
                  {(bankAccounts || []).map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name} - {formatCurrency(account.balance)}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Amount */}
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={cashFormData.amount}
                  onChange={(e) => setCashFormData({ ...cashFormData, amount: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                />
              </div>
              
              {/* Preview */}
              {cashFormData.accountId && cashFormData.amount && (() => {
                const selectedAccount = bankAccounts.find(acc => acc.id === cashFormData.accountId);
                const amount = parseFloat(cashFormData.amount) || 0;
                if (!selectedAccount || amount <= 0) return null;
                
                const currentBankBalance = Number(selectedAccount.balance) || 0;
                const currentCash = Number(cashInHand) || 0;
                const newBankBalance = cashOperation === 'withdraw' 
                  ? currentBankBalance - amount
                  : currentBankBalance + amount;
                const newCashInHand = cashOperation === 'withdraw'
                  ? currentCash + amount
                  : currentCash - amount;
                
                return (
                  <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <div className={`text-xs font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Preview:</div>
                    <div className={`text-sm space-y-1 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      <div>💵 Cash in Hand: {formatCurrency(currentCash)} → {formatCurrency(newCashInHand)}</div>
                      <div>🏦 {selectedAccount.name}: {formatCurrency(currentBankBalance)} → {formatCurrency(newBankBalance)}</div>
                    </div>
                  </div>
                );
              })()}
              
              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCashOperation}
                  disabled={processingCash}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {processingCash ? 'Processing...' : cashOperation === 'withdraw' ? 'Withdraw Cash' : 'Deposit Cash'}
                </button>
                <button
                  onClick={() => {
                    setShowCashModal(false);
                    setCashFormData({ accountId: '', amount: '' });
                  }}
                  className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} py-2 rounded-lg font-medium`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
