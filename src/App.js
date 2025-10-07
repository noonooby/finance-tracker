import Settings from './components/Settings';
import { Settings as SettingsIcon } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, TrendingUp, Calendar, DollarSign, Download, Upload, Moon, Sun, Edit2, Check, X, Activity, List, Plus } from 'lucide-react';
import { supabase } from './utils/supabase';
import { dbOperation } from './utils/db';
import { getDaysUntil, predictNextDate, DEFAULT_CATEGORIES, generateId } from './utils/helpers';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import ActivityFeed from './components/ActivityFeed';
import CreditCards from './components/CreditCards';
import Loans from './components/Loans';
import ReservedFunds from './components/ReservedFunds';
import Income from './components/Income';
import TransactionHistory from './components/TransactionHistory';


export default function FinanceTracker() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [creditCards, setCreditCards] = useState([]);
  const [loans, setLoans] = useState([]);
  const [reservedFunds, setReservedFunds] = useState([]);
  const [income, setIncome] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [availableCash, setAvailableCash] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [alertSettings, setAlertSettings] = useState({ defaultDays: 7 });
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      loadAllData();
      loadCategories();
    }
  }, [session]);

  const checkAutoIncome = useCallback(async () => {
    if (income.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const sortedIncome = [...income].sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastIncome = sortedIncome[0];

    if (!lastIncome.frequency || lastIncome.frequency === 'onetime') return;

    const nextDate = predictNextDate(lastIncome.date, lastIncome.frequency);

    if (nextDate === today) {
      const alreadyLogged = income.some(inc => inc.date === today && inc.source === lastIncome.source);
      
      if (!alreadyLogged) {
        const newIncome = {
          id: generateId(),
          source: lastIncome.source,
          amount: lastIncome.amount,
          date: today,
          frequency: lastIncome.frequency,
          createdAt: new Date().toISOString(),
          autoAdded: true
        };

        await dbOperation('income', 'put', newIncome);

        const transaction = {
          id: generateId(),
          type: 'income',
          source: newIncome.source,
          amount: newIncome.amount,
          date: today,
          createdAt: new Date().toISOString()
        };
        await dbOperation('transactions', 'put', transaction);

        const currentCash = await dbOperation('settings', 'get', 'availableCash');
        const newCash = (currentCash?.value || 0) + newIncome.amount;
        await dbOperation('settings', 'put', { key: 'availableCash', value: newCash });

        await loadAllData();
      }
    }
  }, [income]);

  useEffect(() => {
    if (session) {
      checkAutoIncome();
      const interval = setInterval(checkAutoIncome, 60000);
      return () => clearInterval(interval);
    }
  }, [session, checkAutoIncome]);

  const loadAllData = async () => {
    try {
      const [cards, loansData, reserved, incomeData, trans, settings] = await Promise.all([
        dbOperation('creditCards', 'getAll'),
        dbOperation('loans', 'getAll'),
        dbOperation('reservedFunds', 'getAll'),
        dbOperation('income', 'getAll'),
        dbOperation('transactions', 'getAll'),
        dbOperation('settings', 'getAll')
      ]);
      
      setCreditCards(cards || []);
      setLoans(loansData || []);
      setReservedFunds(reserved || []);
      setIncome(incomeData || []);
      setTransactions(trans || []);
      
      const cashSetting = settings?.find(s => s.key === 'availableCash');
      setAvailableCash(cashSetting?.value || 0);
      
      const darkModeSetting = settings?.find(s => s.key === 'darkMode');
      setDarkMode(darkModeSetting?.value || false);
      
      const alertSetting = settings?.find(s => s.key === 'alertSettings');
      setAlertSettings(alertSetting?.value || { defaultDays: 7 });
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const loadCategories = async () => {
    try {
      const cats = await dbOperation('categories', 'getAll');
      if (cats && cats.length > 0) {
        setCategories(cats);
      } else {
        for (const cat of DEFAULT_CATEGORIES) {
          await dbOperation('categories', 'put', cat);
        }
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const saveAvailableCash = async (amount) => {
    await dbOperation('settings', 'put', { key: 'availableCash', value: amount });
    setAvailableCash(amount);
  };

  const handleEditCash = () => {
    setCashInput(availableCash.toString());
    setEditingCash(true);
  };

  const handleSaveCash = async () => {
    const newAmount = parseFloat(cashInput);
    if (!isNaN(newAmount)) {
      await saveAvailableCash(newAmount);
    }
    setEditingCash(false);
  };

  const handleCancelEditCash = () => {
    setEditingCash(false);
    setCashInput('');
  };

  const toggleDarkMode = async () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    await dbOperation('settings', 'put', { key: 'darkMode', value: newMode });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const exportData = async () => {
    const data = {
      creditCards,
      loans,
      reservedFunds,
      income,
      transactions,
      categories,
      availableCash,
      alertSettings,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        for (const card of data.creditCards || []) await dbOperation('creditCards', 'put', card);
        for (const loan of data.loans || []) await dbOperation('loans', 'put', loan);
        for (const fund of data.reservedFunds || []) await dbOperation('reservedFunds', 'put', fund);
        for (const inc of data.income || []) await dbOperation('income', 'put', inc);
        for (const trans of data.transactions || []) await dbOperation('transactions', 'put', trans);
        for (const cat of data.categories || []) await dbOperation('categories', 'put', cat);
        
        await saveAvailableCash(data.availableCash || 0);
        
        await loadAllData();
        await loadCategories();
        
        alert('Data imported successfully!');
      } catch (error) {
        console.error('Import error:', error);
        alert('Error importing data. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Auth darkMode={darkMode} />;
  }

  const totalReserved = reservedFunds.reduce((sum, fund) => sum + fund.amount, 0);
  const trueAvailable = availableCash - totalReserved;
  const totalCreditCardDebt = creditCards.reduce((sum, card) => sum + card.balance, 0);
  const totalLoanDebt = loans.reduce((sum, loan) => sum + loan.balance, 0);

  const getUpcomingObligations = () => {
    const obligations = [];
    const warningDays = alertSettings.defaultDays || 7;
    
    creditCards.forEach(card => {
      if (card.balance > 0 && card.due_date) {
        const days = getDaysUntil(card.due_date);
        const customWarning = card.alert_days || warningDays;
        obligations.push({
          type: 'credit_card',
          name: card.name,
          amount: card.balance,
          dueDate: card.due_date,
          days,
          urgent: days <= customWarning && days >= 0,
          id: card.id
        });
      }
    });
    
    loans.forEach(loan => {
      if (loan.next_payment_date) {
        const days = getDaysUntil(loan.next_payment_date);
        const customWarning = loan.alert_days || warningDays;
        obligations.push({
          type: 'loan',
          name: loan.name,
          amount: loan.payment_amount,
          dueDate: loan.next_payment_date,
          days,
          urgent: days <= customWarning && days >= 0,
          id: loan.id
        });
      }
    });
    
    reservedFunds.forEach(fund => {
      const days = getDaysUntil(fund.due_date);
      obligations.push({
        type: 'reserved_fund',
        name: fund.name,
        amount: fund.amount,
        dueDate: fund.due_date,
        days,
        urgent: days <= 7 && days >= 0,
        id: fund.id
      });
    });
    
    return obligations.sort((a, b) => a.days - b.days);
  };

  const upcomingObligations = getUpcomingObligations();

  const getNextIncome = () => {
    if (income.length === 0) return null;
    
    const sortedIncome = [...income].sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastIncome = sortedIncome[0];
    
    if (lastIncome.frequency && lastIncome.frequency !== 'onetime') {
      const nextDate = predictNextDate(lastIncome.date, lastIncome.frequency);
      return {
        amount: lastIncome.amount,
        date: nextDate,
        source: lastIncome.source,
        days: getDaysUntil(nextDate)
      };
    }
    
    return null;
  };

  const nextIncome = getNextIncome();

  return (
    <div className={`min-h-screen pb-20 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b p-4 sticky top-0 z-10`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Finance Tracker</h1>
            {currentView === 'dashboard' && (
              <div className="flex items-center gap-2">
                {editingCash ? (
                  <>
                    <input
                      type="number"
                      step="0.01"
                      value={cashInput}
                      onChange={(e) => setCashInput(e.target.value)}
                      className={`w-32 px-2 py-1 text-sm border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded`}
                    />
                    <button onClick={handleSaveCash} className="p-1 text-green-600 hover:bg-green-50 rounded">
                      <Check size={18} />
                    </button>
                    <button onClick={handleCancelEditCash} className="p-1 text-red-600 hover:bg-red-50 rounded">
                      <X size={18} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleEditCash}
                    className={`p-1 ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'} rounded`}
                    title="Edit Available Cash"
                  >
                    <Edit2 size={18} />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleDarkMode}
              className={`p-2 ${darkMode ? 'text-yellow-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'} rounded-lg`}
              title={darkMode ? 'Light Mode' : 'Dark Mode'}
            >
              {darkMode ? <Sun size={24} /> : <Moon size={24} />}
            </button>
            <button
              onClick={exportData}
              className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded-lg`}
              title="Export Data"
            >
              <Download size={24} />
            </button>
            <label className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded-lg cursor-pointer`} title="Import Data">
              <Upload size={24} />
              <input
                type="file"
                accept=".json"
                onChange={importData}
                className="hidden"
              />
            </label>
            <button
              onClick={handleSignOut}
              className={`px-3 py-1 text-sm ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded-lg`}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="p-4">
        {currentView === 'dashboard' && (
          <Dashboard
            darkMode={darkMode}
            availableCash={availableCash}
            totalReserved={totalReserved}
            trueAvailable={trueAvailable}
            upcomingObligations={upcomingObligations}
            nextIncome={nextIncome}
            totalCreditCardDebt={totalCreditCardDebt}
            totalLoanDebt={totalLoanDebt}
            creditCards={creditCards}
            loans={loans}
            alertSettings={alertSettings}
          />
        )}
        {currentView === 'cards' && (
          <CreditCards
            darkMode={darkMode}
            creditCards={creditCards}
            categories={categories}
            availableCash={availableCash}
            reservedFunds={reservedFunds}
            alertSettings={alertSettings}
            onUpdate={loadAllData}
            onUpdateCash={saveAvailableCash}
          />
        )}
        {currentView === 'loans' && (
          <Loans
            darkMode={darkMode}
            loans={loans}
            categories={categories}
            availableCash={availableCash}
            reservedFunds={reservedFunds}
            alertSettings={alertSettings}
            onUpdate={loadAllData}
            onUpdateCash={saveAvailableCash}
          />
        )}
        {currentView === 'reserved' && (
          <ReservedFunds
            darkMode={darkMode}
            reservedFunds={reservedFunds}
            creditCards={creditCards}
            loans={loans}
            totalReserved={totalReserved}
            onUpdate={loadAllData}
          />
        )}
        {currentView === 'income' && (
          <Income
            darkMode={darkMode}
            income={income}
            availableCash={availableCash}
            onUpdate={loadAllData}
            onUpdateCash={saveAvailableCash}
          />
        )}
       {currentView === 'transactions' && (
          <TransactionHistory
            darkMode={darkMode}
            categories={categories}
            creditCards={creditCards}
            loans={loans}
            reservedFunds={reservedFunds}
            availableCash={availableCash}
            onUpdate={loadAllData}
            onUpdateCash={saveAvailableCash}
          />
        )}
        {currentView === 'activity' && (
          <ActivityFeed
            darkMode={darkMode}
            onUpdate={loadAllData}
          />
        )}
        {currentView === 'settings' && (
           <Settings
            darkMode={darkMode}
            onUpdate={loadAllData}
           />
)}
      </div>
        {/* Floating Add Transaction Button */}
        <button
        onClick={() => setCurrentView('transactions')}
        className="fixed bottom-24 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center z-20"
        title="Add Transaction"
        >
        <Plus size={28} />
        </button>
      <div className={`fixed bottom-0 left-0 right-0 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t px-2 py-2 flex justify-around`}>
        <button
          onClick={() => setCurrentView('dashboard')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'dashboard' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <TrendingUp size={24} />
          <span className="text-xs font-medium">Dashboard</span>
        </button>
        <button
          onClick={() => setCurrentView('cards')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'cards' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <CreditCard size={24} />
          <span className="text-xs font-medium">Cards</span>
        </button>
        <button
          onClick={() => setCurrentView('loans')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'loans' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <TrendingUp size={24} />
          <span className="text-xs font-medium">Loans</span>
        </button>
        <button
          onClick={() => setCurrentView('reserved')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'reserved' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <Calendar size={24} />
          <span className="text-xs font-medium">Reserved</span>
        </button>
        <button
          onClick={() => setCurrentView('income')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'income' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <DollarSign size={24} />
          <span className="text-xs font-medium">Income</span>
        </button>
        <button
          onClick={() => setCurrentView('activity')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'activity' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <Activity size={24} />
          <span className="text-xs font-medium">Activity</span>
        </button>
        <button
          onClick={() => setCurrentView('transactions')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'transactions' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <List size={24} />
          <span className="text-xs font-medium">Transactions</span>
        </button>
        <button
           onClick={() => setCurrentView('settings')}
           className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${
           currentView === 'settings' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'
  }`}
>
  <SettingsIcon size={24} />
  <span className="text-xs font-medium">Settings</span>
</button>
      </div>
    </div>
    
  );
}
