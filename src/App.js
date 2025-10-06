import React, { useState, useEffect } from 'react';
import { DollarSign, CreditCard, TrendingUp, Calendar, Plus, Download, Upload, X, AlertCircle, Check } from 'lucide-react';

// IndexedDB Setup
const DB_NAME = 'FinanceTrackerDB';
const DB_VERSION = 1;

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('creditCards')) {
        db.createObjectStore('creditCards', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('loans')) {
        db.createObjectStore('loans', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('reservedFunds')) {
        db.createObjectStore('reservedFunds', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('income')) {
        db.createObjectStore('income', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('transactions')) {
        db.createObjectStore('transactions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
};

const dbOperation = async (storeName, operation, data = null) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], operation === 'get' || operation === 'getAll' ? 'readonly' : 'readwrite');
    const store = transaction.objectStore(storeName);
    
    let request;
    if (operation === 'getAll') {
      request = store.getAll();
    } else if (operation === 'get') {
      request = store.get(data);
    } else if (operation === 'put') {
      request = store.put(data);
    } else if (operation === 'delete') {
      request = store.delete(data);
    }
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Utility Functions
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

const getDaysUntil = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const predictNextDate = (lastDate, frequency) => {
  const date = new Date(lastDate);
  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'bimonthly':
      date.setMonth(date.getMonth() + 2);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().split('T')[0];
};

export default function FinanceTracker() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [creditCards, setCreditCards] = useState([]);
  const [loans, setLoans] = useState([]);
  const [reservedFunds, setReservedFunds] = useState([]);
  const [income, setIncome] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [availableCash, setAvailableCash] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);

  // Load all data on mount
  useEffect(() => {
    loadAllData();
  }, []);

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
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const saveAvailableCash = async (amount) => {
    await dbOperation('settings', 'put', { key: 'availableCash', value: amount });
    setAvailableCash(amount);
  };

  // Export/Import Functions
  const exportData = async () => {
    const data = {
      creditCards,
      loans,
      reservedFunds,
      income,
      transactions,
      availableCash,
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
        
        // Clear existing data
        const stores = ['creditCards', 'loans', 'reservedFunds', 'income', 'transactions'];
        for (const store of stores) {
          const items = await dbOperation(store, 'getAll');
          for (const item of items) {
            await dbOperation(store, 'delete', item.id);
          }
        }
        
        // Import new data
        for (const card of data.creditCards || []) await dbOperation('creditCards', 'put', card);
        for (const loan of data.loans || []) await dbOperation('loans', 'put', loan);
        for (const fund of data.reservedFunds || []) await dbOperation('reservedFunds', 'put', fund);
        for (const inc of data.income || []) await dbOperation('income', 'put', inc);
        for (const trans of data.transactions || []) await dbOperation('transactions', 'put', trans);
        
        await saveAvailableCash(data.availableCash || 0);
        await loadAllData();
        
        alert('Data imported successfully!');
      } catch (error) {
        console.error('Import error:', error);
        alert('Error importing data. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  // Calculate totals
  const totalReserved = reservedFunds.reduce((sum, fund) => sum + fund.amount, 0);
  const trueAvailable = availableCash - totalReserved;
  const totalCreditCardDebt = creditCards.reduce((sum, card) => sum + card.balance, 0);
  const totalLoanDebt = loans.reduce((sum, loan) => sum + loan.balance, 0);

  // Get upcoming obligations
  const getUpcomingObligations = () => {
    const obligations = [];
    
    creditCards.forEach(card => {
      if (card.balance > 0 && card.dueDate) {
        obligations.push({
          type: 'credit_card',
          name: card.name,
          amount: card.balance,
          dueDate: card.dueDate,
          days: getDaysUntil(card.dueDate),
          id: card.id
        });
      }
    });
    
    loans.forEach(loan => {
      if (loan.nextPaymentDate) {
        obligations.push({
          type: 'loan',
          name: loan.name,
          amount: loan.paymentAmount,
          dueDate: loan.nextPaymentDate,
          days: getDaysUntil(loan.nextPaymentDate),
          id: loan.id
        });
      }
    });
    
    reservedFunds.forEach(fund => {
      obligations.push({
        type: 'reserved_fund',
        name: fund.name,
        amount: fund.amount,
        dueDate: fund.dueDate,
        days: getDaysUntil(fund.dueDate),
        id: fund.id
      });
    });
    
    return obligations.sort((a, b) => a.days - b.days);
  };

  const upcomingObligations = getUpcomingObligations();

  // Get next income prediction
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

  // Dashboard Component
  const Dashboard = () => (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 text-white">
        <h2 className="text-sm font-medium opacity-90 mb-2">Available Cash</h2>
        <div className="text-4xl font-bold mb-1">{formatCurrency(availableCash)}</div>
        <div className="text-sm opacity-90">Reserved: {formatCurrency(totalReserved)}</div>
        <div className="mt-3 pt-3 border-t border-blue-500">
          <div className="text-lg font-semibold">True Available: {formatCurrency(trueAvailable)}</div>
        </div>
      </div>

      {upcomingObligations.filter(o => o.days <= 7 && o.days >= 0).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800 font-semibold mb-3">
            <AlertCircle size={20} />
            <span>Urgent - Next 7 Days</span>
          </div>
          <div className="space-y-2">
            {upcomingObligations.filter(o => o.days <= 7 && o.days >= 0).map(obl => (
              <div key={obl.id} className="flex justify-between items-center text-sm">
                <span className="font-medium">{obl.name}</span>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(obl.amount)}</div>
                  <div className="text-xs text-red-600">
                    {obl.days === 0 ? 'Today' : obl.days === 1 ? 'Tomorrow' : `${obl.days} days`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold mb-3">Upcoming Obligations (30 Days)</h3>
        <div className="space-y-3">
          {upcomingObligations.filter(o => o.days <= 30 && o.days > 7).length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming obligations</p>
          ) : (
            upcomingObligations.filter(o => o.days <= 30 && o.days > 7).map(obl => (
              <div key={obl.id} className="flex justify-between items-center pb-3 border-b border-gray-100 last:border-0">
                <div>
                  <div className="font-medium">{obl.name}</div>
                  <div className="text-xs text-gray-500 capitalize">{obl.type.replace('_', ' ')}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(obl.amount)}</div>
                  <div className="text-xs text-gray-500">{obl.days} days</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {nextIncome && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-2">Next Income</h3>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-600">{nextIncome.source}</div>
              <div className="text-xs text-gray-500">{formatDate(nextIncome.date)}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-green-700">{formatCurrency(nextIncome.amount)}</div>
              <div className="text-xs text-gray-600">{nextIncome.days} days</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Credit Cards</div>
          <div className="text-2xl font-bold">{formatCurrency(totalCreditCardDebt)}</div>
          <div className="text-xs text-gray-500 mt-1">{creditCards.length} cards</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Loans</div>
          <div className="text-2xl font-bold">{formatCurrency(totalLoanDebt)}</div>
          <div className="text-xs text-gray-500 mt-1">{loans.length} loans</div>
        </div>
      </div>
    </div>
  );

  // Credit Cards Component
  const CreditCardsView = () => {
    const [formData, setFormData] = useState({
      name: '',
      balance: '',
      creditLimit: '',
      dueDate: '',
      billingCycleDay: '',
      interestRate: ''
    });
    const [paymentForm, setPaymentForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0] });
    const [payingCard, setPayingCard] = useState(null);

    const handleAdd = async () => {
      if (!formData.name || !formData.balance || !formData.dueDate) {
        alert('Please fill in required fields');
        return;
      }
      
      const newCard = {
        id: generateId(),
        name: formData.name,
        balance: parseFloat(formData.balance) || 0,
        creditLimit: parseFloat(formData.creditLimit) || 0,
        dueDate: formData.dueDate,
        billingCycleDay: parseInt(formData.billingCycleDay) || 0,
        interestRate: parseFloat(formData.interestRate) || 0,
        createdAt: new Date().toISOString()
      };
      
      await dbOperation('creditCards', 'put', newCard);
      await loadAllData();
      setFormData({ name: '', balance: '', creditLimit: '', dueDate: '', billingCycleDay: '', interestRate: '' });
      setShowAddForm(false);
    };

    const handlePayment = async (cardId) => {
      if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
        alert('Please enter a valid payment amount');
        return;
      }
      
      const card = creditCards.find(c => c.id === cardId);
      const paymentAmount = parseFloat(paymentForm.amount);
      
      // Update card balance
      await dbOperation('creditCards', 'put', {
        ...card,
        balance: card.balance - paymentAmount
      });
      
      // Log transaction
      const transaction = {
        id: generateId(),
        type: 'credit_card_payment',
        cardId,
        cardName: card.name,
        amount: paymentAmount,
        date: paymentForm.date,
        createdAt: new Date().toISOString()
      };
      await dbOperation('transactions', 'put', transaction);
      
      // Update available cash
      await saveAvailableCash(availableCash - paymentAmount);
      
      await loadAllData();
      setPayingCard(null);
      setPaymentForm({ amount: '', date: new Date().toISOString().split('T')[0] });
    };

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Credit Cards</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            <Plus size={20} />
            Add Card
          </button>
        </div>

        {showAddForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <input
              type="text"
              placeholder="Card Name (e.g., Rogers Mastercard)"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Current Balance"
              value={formData.balance}
              onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Credit Limit (optional)"
              value={formData.creditLimit}
              onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="date"
              placeholder="Due Date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="number"
              placeholder="Billing Cycle Day (optional)"
              value={formData.billingCycleDay}
              onChange={(e) => setFormData({ ...formData, billingCycleDay: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Interest Rate % (optional)"
              value={formData.interestRate}
              onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium">
                Add Card
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {creditCards.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CreditCard size={48} className="mx-auto mb-3 opacity-30" />
              <p>No credit cards added yet</p>
            </div>
          ) : (
            creditCards.map(card => (
              <div key={card.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg">{card.name}</h3>
                    <div className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(card.balance)}</div>
                    {card.creditLimit > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Limit: {formatCurrency(card.creditLimit)} ({((card.balance / card.creditLimit) * 100).toFixed(1)}% used)
                      </div>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      await dbOperation('creditCards', 'delete', card.id);
                      await loadAllData();
                    }}
                    className="text-red-600 p-2 hover:bg-red-50 rounded"
                  >
                    <X size={18} />
                  </button>
                </div>

                {card.dueDate && (
                  <div className="flex justify-between items-center mb-3 text-sm">
                    <span className="text-gray-600">Due Date:</span>
                    <div className="text-right">
                      <div className="font-medium">{formatDate(card.dueDate)}</div>
                      {getDaysUntil(card.dueDate) >= 0 && (
                        <div className={`text-xs ${getDaysUntil(card.dueDate) <= 7 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {getDaysUntil(card.dueDate) === 0 ? 'Due Today!' : `${getDaysUntil(card.dueDate)} days`}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {payingCard === card.id ? (
                  <div className="space-y-2 pt-3 border-t border-gray-200">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Payment Amount"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="date"
                      value={paymentForm.date}
                      onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handlePayment(card.id)} className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium">
                        Confirm Payment
                      </button>
                      <button
                        onClick={() => setPayingCard(null)}
                        className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setPayingCard(card.id)}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium mt-3"
                  >
                    Make Payment
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // Loans View Component
  const LoansView = () => {
    const [formData, setFormData] = useState({
      name: '',
      principal: '',
      balance: '',
      interestRate: '',
      paymentAmount: '',
      frequency: 'monthly',
      nextPaymentDate: ''
    });
    const [paymentForm, setPaymentForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0] });
    const [payingLoan, setPayingLoan] = useState(null);

    const handleAdd = async () => {
      if (!formData.name || !formData.principal || !formData.balance || !formData.paymentAmount || !formData.nextPaymentDate) {
        alert('Please fill in required fields');
        return;
      }
      
      const newLoan = {
        id: generateId(),
        name: formData.name,
        principal: parseFloat(formData.principal) || 0,
        balance: parseFloat(formData.balance) || 0,
        interestRate: parseFloat(formData.interestRate) || 0,
        paymentAmount: parseFloat(formData.paymentAmount) || 0,
        frequency: formData.frequency,
        nextPaymentDate: formData.nextPaymentDate,
        createdAt: new Date().toISOString()
      };
      
      await dbOperation('loans', 'put', newLoan);
      await loadAllData();
      setFormData({
        name: '',
        principal: '',
        balance: '',
        interestRate: '',
        paymentAmount: '',
        frequency: 'monthly',
        nextPaymentDate: ''
      });
      setShowAddForm(false);
    };

    const handlePayment = async (loanId) => {
      if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
        alert('Please enter a valid payment amount');
        return;
      }
      
      const loan = loans.find(l => l.id === loanId);
      const paymentAmount = parseFloat(paymentForm.amount);
      
      // Update loan balance
      await dbOperation('loans', 'put', {
        ...loan,
        balance: loan.balance - paymentAmount,
        lastPaymentDate: paymentForm.date,
        nextPaymentDate: predictNextDate(paymentForm.date, loan.frequency)
      });
      
      // Log transaction
      const transaction = {
        id: generateId(),
        type: 'loan_payment',
        loanId,
        loanName: loan.name,
        amount: paymentAmount,
        date: paymentForm.date,
        createdAt: new Date().toISOString()
      };
      await dbOperation('transactions', 'put', transaction);
      
      // Update available cash
      await saveAvailableCash(availableCash - paymentAmount);
      
      await loadAllData();
      setPayingLoan(null);
      setPaymentForm({ amount: '', date: new Date().toISOString().split('T')[0] });
    };

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Loans</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            <Plus size={20} />
            Add Loan
          </button>
        </div>

        {showAddForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <input
              type="text"
              placeholder="Loan Name (e.g., Car Loan)"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Original Principal"
              value={formData.principal}
              onChange={(e) => setFormData({ ...formData, principal: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Current Balance"
              value={formData.balance}
              onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Interest Rate % (optional)"
              value={formData.interestRate}
              onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Payment Amount"
              value={formData.paymentAmount}
              onChange={(e) => setFormData({ ...formData, paymentAmount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <select
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="bimonthly">Bi-monthly</option>
            </select>
            <input
              type="date"
              placeholder="Next Payment Date"
              value={formData.nextPaymentDate}
              onChange={(e) => setFormData({ ...formData, nextPaymentDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium">
                Add Loan
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {loans.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
              <p>No loans added yet</p>
            </div>
          ) : (
            loans.map(loan => (
              <div key={loan.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg">{loan.name}</h3>
                    <div className="text-2xl font-bold text-orange-600 mt-1">{formatCurrency(loan.balance)}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      of {formatCurrency(loan.principal)} ({((loan.balance / loan.principal) * 100).toFixed(1)}% remaining)
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await dbOperation('loans', 'delete', loan.id);
                      await loadAllData();
                    }}
                    className="text-red-600 p-2 hover:bg-red-50 rounded"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <div className="text-gray-600">Payment Amount</div>
                    <div className="font-semibold">{formatCurrency(loan.paymentAmount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Frequency</div>
                    <div className="font-semibold capitalize">{loan.frequency}</div>
                  </div>
                </div>

                {loan.nextPaymentDate && (
                  <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-200 text-sm">
                    <span className="text-gray-600">Next Payment:</span>
                    <div className="text-right">
                      <div className="font-medium">{formatDate(loan.nextPaymentDate)}</div>
                      {getDaysUntil(loan.nextPaymentDate) >= 0 && (
                        <div className={`text-xs ${getDaysUntil(loan.nextPaymentDate) <= 7 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {getDaysUntil(loan.nextPaymentDate) === 0 ? 'Due Today!' : `${getDaysUntil(loan.nextPaymentDate)} days`}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {payingLoan === loan.id ? (
                  <div className="space-y-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Payment Amount"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="date"
                      value={paymentForm.date}
                      onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handlePayment(loan.id)} className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium">
                        Confirm Payment
                      </button>
                      <button
                        onClick={() => setPayingLoan(null)}
                        className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setPayingLoan(loan.id)}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium"
                  >
                    Make Payment
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // Reserved Funds View
  const ReservedFundsView = () => {
    const [formData, setFormData] = useState({
      name: '',
      amount: '',
      dueDate: '',
      recurring: false,
      frequency: 'monthly'
    });

    const handleAdd = async () => {
      if (!formData.name || !formData.amount || !formData.dueDate) {
        alert('Please fill in required fields');
        return;
      }
      
      const newFund = {
        id: generateId(),
        name: formData.name,
        amount: parseFloat(formData.amount) || 0,
        dueDate: formData.dueDate,
        recurring: formData.recurring,
        frequency: formData.frequency,
        createdAt: new Date().toISOString()
      };
      
      await dbOperation('reservedFunds', 'put', newFund);
      await loadAllData();
      setFormData({ name: '', amount: '', dueDate: '', recurring: false, frequency: 'monthly' });
      setShowAddForm(false);
    };

    const markPaid = async (fundId) => {
      const fund = reservedFunds.find(f => f.id === fundId);
      
      const transaction = {
        id: generateId(),
        type: 'reserved_fund_paid',
        fundId,
        fundName: fund.name,
        amount: fund.amount,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      await dbOperation('transactions', 'put', transaction);
      
      if (fund.recurring) {
        await dbOperation('reservedFunds', 'put', {
          ...fund,
          dueDate: predictNextDate(fund.dueDate, fund.frequency || 'monthly'),
          lastPaidDate: new Date().toISOString().split('T')[0]
        });
      } else {
        await dbOperation('reservedFunds', 'delete', fundId);
      }
      
      await loadAllData();
    };

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Reserved Funds</h2>
            <p className="text-sm text-gray-600">Total Reserved: {formatCurrency(totalReserved)}</p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            <Plus size={20} />
            Add Fund
          </button>
        </div>

        {showAddForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <input
              type="text"
              placeholder="Fund Name (e.g., Rent, Insurance)"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Amount"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="date"
              placeholder="Due Date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.recurring}
                onChange={(e) => setFormData({ ...formData, recurring: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm">Recurring payment</span>
            </label>
            {formData.recurring && (
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
                <option value="bimonthly">Bi-monthly</option>
              </select>
            )}
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium">
                Add Fund
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {reservedFunds.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar size={48} className="mx-auto mb-3 opacity-30" />
              <p>No reserved funds yet</p>
            </div>
          ) : (
            reservedFunds.map(fund => (
              <div key={fund.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold">{fund.name}</h3>
                    <div className="text-xl font-bold text-purple-600 mt-1">{formatCurrency(fund.amount)}</div>
                    {fund.recurring && (
                      <div className="text-xs text-gray-500 mt-1 capitalize">Recurring: {fund.frequency}</div>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      await dbOperation('reservedFunds', 'delete', fund.id);
                      await loadAllData();
                    }}
                    className="text-red-600 p-2 hover:bg-red-50 rounded"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex justify-between items-center text-sm mb-3">
                  <span className="text-gray-600">Due Date:</span>
                  <div className="text-right">
                    <div className="font-medium">{formatDate(fund.dueDate)}</div>
                    {getDaysUntil(fund.dueDate) >= 0 && (
                      <div className={`text-xs ${getDaysUntil(fund.dueDate) <= 7 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                        {getDaysUntil(fund.dueDate) === 0 ? 'Due Today!' : `${getDaysUntil(fund.dueDate)} days`}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => markPaid(fund.id)}
                  className="w-full bg-green-600 text-white py-2 rounded-lg font-medium"
                >
                  Mark as Paid
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // Income View
  const IncomeView = () => {
    const [formData, setFormData] = useState({
      source: 'Salary',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      frequency: 'biweekly',
      reservedAmount: ''
    });

    const handleAdd = async () => {
      if (!formData.source || !formData.amount || !formData.date) {
        alert('Please fill in required fields');
        return;
      }
      
      const newIncome = {
        id: generateId(),
        source: formData.source,
        amount: parseFloat(formData.amount) || 0,
        date: formData.date,
        frequency: formData.frequency,
        createdAt: new Date().toISOString()
      };
      
      await dbOperation('income', 'put', newIncome);
      
      const transaction = {
        id: generateId(),
        type: 'income',
        source: formData.source,
        amount: newIncome.amount,
        date: newIncome.date,
        createdAt: new Date().toISOString()
      };
      await dbOperation('transactions', 'put', transaction);
      
      // Update available cash
      let newCash = availableCash + newIncome.amount;
      if (formData.reservedAmount && parseFloat(formData.reservedAmount) > 0) {
        newCash -= parseFloat(formData.reservedAmount);
      }
      await saveAvailableCash(newCash);
      
      await loadAllData();
      setFormData({
        source: 'Salary',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        frequency: 'biweekly',
        reservedAmount: ''
      });
      setShowAddForm(false);
    };

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Income</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            <Plus size={20} />
            Log Income
          </button>
        </div>

        {showAddForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <input
              type="text"
              placeholder="Source (e.g., Salary, Bonus)"
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Amount Received"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <select
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="onetime">One-time</option>
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Amount to Reserve (optional)"
              value={formData.reservedAmount}
              onChange={(e) => setFormData({ ...formData, reservedAmount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium">
                Log Income
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {income.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <DollarSign size={48} className="mx-auto mb-3 opacity-30" />
              <p>No income logged yet</p>
            </div>
          ) : (
            [...income].sort((a, b) => new Date(b.date) - new Date(a.date)).map(inc => (
              <div key={inc.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold">{inc.source}</h3>
                    <div className="text-sm text-gray-600 capitalize">{inc.frequency}</div>
                    <div className="text-xs text-gray-500 mt-1">{formatDate(inc.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(inc.amount)}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 sticky top-0 z-10">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Finance Tracker</h1>
          <div className="flex gap-2">
            <button
              onClick={exportData}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
              title="Export Data"
            >
              <Download size={24} />
            </button>
            <label className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer" title="Import Data">
              <Upload size={24} />
              <input
                type="file"
                accept=".json"
                onChange={importData}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'cards' && <CreditCardsView />}
        {currentView === 'loans' && <LoansView />}
        {currentView === 'reserved' && <ReservedFundsView />}
        {currentView === 'income' && <IncomeView />}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 flex justify-around">
        <button
          onClick={() => setCurrentView('dashboard')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'dashboard' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
        >
          <TrendingUp size={24} />
          <span className="text-xs font-medium">Dashboard</span>
        </button>
        <button
          onClick={() => setCurrentView('cards')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'cards' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
        >
          <CreditCard size={24} />
          <span className="text-xs font-medium">Cards</span>
        </button>
        <button
          onClick={() => setCurrentView('loans')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'loans' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
        >
          <TrendingUp size={24} />
          <span className="text-xs font-medium">Loans</span>
        </button>
        <button
          onClick={() => setCurrentView('reserved')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'reserved' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
        >
          <Calendar size={24} />
          <span className="text-xs font-medium">Reserved</span>
        </button>
        <button
          onClick={() => setCurrentView('income')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'income' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
        >
          <DollarSign size={24} />
          <span className="text-xs font-medium">Income</span>
        </button>
      </div>
    </div>
  );
}
