import React from 'react';
import { AlertCircle } from 'lucide-react';
import { formatCurrency, formatDate, getDaysUntil } from '../utils/helpers';

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
  alertSettings
}) {
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

      {upcomingObligations.filter(o => o.urgent).length > 0 && (
        <div className={`${darkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border rounded-lg p-4`}>
          <div className={`flex items-center gap-2 ${darkMode ? 'text-red-200' : 'text-red-800'} font-semibold mb-3`}>
            <AlertCircle size={20} />
            <span>Urgent - Next {alertSettings.defaultDays} Days</span>
          </div>
          <div className="space-y-2">
            {upcomingObligations.filter(o => o.urgent).map(obl => (
              <div key={obl.id} className="flex justify-between items-center text-sm">
                <span className="font-medium">{obl.name}</span>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(obl.amount)}</div>
                  <div className={`text-xs ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                    {obl.days === 0 ? 'Today' : obl.days === 1 ? 'Tomorrow' : `${obl.days} days`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
        <h3 className="font-semibold mb-3">Upcoming Obligations (30 Days)</h3>
        <div className="space-y-3">
          {upcomingObligations.filter(o => o.days <= 30 && !o.urgent).length === 0 ? (
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No upcoming obligations</p>
          ) : (
            upcomingObligations.filter(o => o.days <= 30 && !o.urgent).map(obl => (
              <div key={obl.id} className={`flex justify-between items-center pb-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'} last:border-0`}>
                <div>
                  <div className="font-medium">{obl.name}</div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} capitalize`}>{obl.type.replace('_', ' ')}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(obl.amount)}</div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{obl.days} days</div>
                </div>
              </div>
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
            <div className="text-right">
              <div className={`text-lg font-bold ${darkMode ? 'text-green-300' : 'text-green-700'}`}>{formatCurrency(nextIncome.amount)}</div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{nextIncome.days} days</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
          <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Credit Cards</div>
          <div className="text-2xl font-bold">{formatCurrency(totalCreditCardDebt)}</div>
          <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>{creditCards.length} cards</div>
        </div>
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
          <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Loans</div>
          <div className="text-2xl font-bold">{formatCurrency(totalLoanDebt)}</div>
          <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>{loans.length} loans</div>
        </div>
      </div>
    </div>
  );
}
