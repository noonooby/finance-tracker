import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, Edit2 } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/helpers';

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
  onUpdateAlertSettings
}) {
  const urgentDays = alertSettings?.defaultDays || 7;
  const upcomingDays = alertSettings?.upcomingDays || 30;
  const [showAlertEditor, setShowAlertEditor] = useState(false);
  const [urgentInput, setUrgentInput] = useState(urgentDays);
  const [upcomingInput, setUpcomingInput] = useState(upcomingDays);

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

  return (
    <div className="space-y-4">
      <div className={`${darkMode ? 'bg-blue-900' : 'bg-gradient-to-r from-blue-600 to-blue-700'} rounded-lg p-6 text-white`}>
        <h2 className="text-sm font-medium opacity-90 mb-2">Available Cash</h2>
        <div className="text-4xl font-bold mb-1">{formatCurrency(availableCash)}</div>
        <div className="text-sm opacity-90">Reserved: {formatCurrency(totalReserved)}</div>
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
          Urgent window: <span className="font-semibold">{urgentDays} days</span> • Upcoming window: <span className="font-semibold">{upcomingDays} days</span>
        </p>
        {showAlertEditor && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Urgent (days)
              </label>
              <input
                type="number"
                min="0"
                value={urgentInput}
                onChange={(e) => setUrgentInput(e.target.value)}
                className={`w-full px-3 py-2 border rounded ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              />
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
            <span>Urgent · Next {urgentDays} Days</span>
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
      </div>
    </div>
  );
}
