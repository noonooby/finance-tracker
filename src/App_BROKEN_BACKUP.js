import Settings from './components/Settings';
import { Settings as SettingsIcon } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, TrendingUp, Calendar, DollarSign, Download, Upload, Moon, Sun, Edit2, Check, X, Activity, List, Plus, Building2 } from 'lucide-react';
import { supabase } from './utils/supabase';
import { dbOperation } from './utils/db';
import { getDaysUntil, predictNextDate, DEFAULT_CATEGORIES, formatCurrency, generateId, calculateTotalBankBalance } from './utils/helpers';
import { logActivity } from './utils/activityLogger';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import ActivityFeed from './components/ActivityFeed';
import CreditCards from './components/CreditCards';
import Loans from './components/Loans';
import ReservedFunds from './components/ReservedFunds';
import Income from './components/Income';
import TransactionHistory from './components/TransactionHistory';
import { autoDepositDueIncome } from './utils/autoPay';
import BankAccounts from './components/BankAccounts';
import {
  getAllBankAccounts,
  updateBankAccountBalance
} from './utils/db';
import {
  autoMigrateIfNeeded,
  checkMigrationStatus
} from './utils/bankAccountsMigration';


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
  const [alertSettings, setAlertSettings] = useState({ defaultDays: 7, upcomingDays: 30 });
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState('');
  const [focusTarget, setFocusTarget] = useState(null);
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);
  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState([]);
  const [isMigrating, setIsMigrating] = useState(false);
  // Cash in hand state
  const [cashInHand, setCashInHand] = useState(0);
  const [showCashInDashboard, setShowCashInDashboard] = useState(false);
  // Latest activities for Dashboard
  const [latestActivities, setLatestActivities] = useState([]);

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

  const loadBankAccounts = useCallback(async () => {
    try {
      console.log('🏦 Loading bank accounts...');
      const accounts = await getAllBankAccounts();
      setBankAccounts(accounts);

      if (accounts && accounts.length > 0) {
        const totalBalance = calculateTotalBankBalance(accounts);
        setAvailableCash(totalBalance);
      } else {
        setAvailableCash(0);
      }

      console.log('✅ Bank accounts loaded:', accounts?.length ?? 0);
      return accounts || [];
    } catch (error) {
      console.error('❌ Error loading bank accounts:', error);
      return [];
    }
  }, []);

  const checkAndMigrate = useCallback(async () => {
    try {
      setIsMigrating(true);
      console.log('🔄 Checking migration status...');

      const migrationStatus = await checkMigrationStatus();

      if (!migrationStatus) {
        console.log('⚠️ User needs migration - starting auto-migration...');
        const result = await autoMigrateIfNeeded();

        if (result?.alreadyMigrated === false && result.primaryAccount) {
          console.log('✅ Migration completed successfully');
          console.log('   Balance migrated:', result.migratedBalance);
          await loadBankAccounts();
        }
      } else {
        console.log('✅ User already migrated to bank accounts');
      }
    } catch (error) {
      console.error('❌ Migration check failed:', error);
    } finally {
      setIsMigrating(false);
    }
  }, [loadBankAccounts]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [cards, loansData, reserved, incomeDataRaw, transRaw, settings] = await Promise.all([
        dbOperation('creditCards', 'getAll'),
        dbOperation('loans', 'getAll'),
        dbOperation('reservedFunds', 'getAll'),
        dbOperation('income', 'getAll'),
        dbOperation('transactions', 'getAll'),
        dbOperation('settings', 'getAll')
      ]);
      
      let incomeData = incomeDataRaw || [];
      let transactionsData = transRaw || [];
      
      setCreditCards(cards || []);
      setLoans(loansData || []);
      setReservedFunds(reserved || []);
      
      const cashSetting = settings?.find(s => s.key === 'availableCash');
      let cashValue = Number(cashSetting?.value) || 0;
      
      if (incomeData.length > 0) {
        const autoResults = await autoDepositDueIncome(
          incomeData,
          cashValue,
          async (newCash) => {
            cashValue = newCash;
            await dbOperation('settings', 'put', { key: 'availableCash', value: newCash });
          }
        );
        
        if (autoResults.deposited.length > 0) {
          console.log('🎉 Auto-deposited income on app load:', autoResults.deposited);
          incomeData = await dbOperation('income', 'getAll') || [];
          transactionsData = await dbOperation('transactions', 'getAll') || [];
        }
      }
      
      setIncome(incomeData);
      setTransactions(transactionsData);
      setAvailableCash(cashValue);
      
      const darkModeSetting = settings?.find(s => s.key === 'darkMode');
      setDarkMode(darkModeSetting?.value || false);
      
      const alertSetting = settings?.find(s => s.key === 'alertSettings');
      const alertValue = alertSetting?.value || {};
      setAlertSettings({
        defaultDays: alertValue.defaultDays ?? alertValue.alertDays ?? 7,
        upcomingDays: alertValue.upcomingDays ?? 30
      });
      
      // Load cash in hand settings
      const cashInHandSetting = settings?.find(s => s.key === 'cashInHand');
      setCashInHand(Number(cashInHandSetting?.value) || 0);
      
      const showCashSetting = settings?.find(s => s.key === 'showCashInDashboard');
      setShowCashInDashboard(showCashSetting?.value || false);

      await loadBankAccounts();
      await checkAndMigrate();
      
      // Load latest activities for Dashboard
      await loadLatestActivities();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [loadBankAccounts, checkAndMigrate, loadLatestActivities]);

  const loadCategories = useCallback(async () => {
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
  }, []);
  
  const loadLatestActivities = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setLatestActivities(data || []);
    } catch (error) {
      console.error('Error loading latest activities:', error);
    }
  }, []);

  useEffect(() => {
    if (session) {
      loadAllData();
      loadCategories();
    }
  }, [session, loadAllData, loadCategories]);

  const handleUpdateCash = useCallback(async (newAmount, options = {}) => {
    try {
      const { accountId: preferredAccountId, delta, syncOnly = false } = options || {};

      // Load latest accounts and totals
      const accounts = await getAllBankAccounts();
      setBankAccounts(accounts);

      const currentTotal = calculateTotalBankBalance(accounts);
      setAvailableCash(currentTotal);

      if (syncOnly) {
        console.log('🔄 Cash sync requested without balance adjustments');
        return;
      }

      if (!accounts || accounts.length === 0) {
        console.warn('⚠️ No bank accounts available; skipping cash adjustment.');
        return;
      }

      // Determine desired total after adjustment
      let desiredTotal = currentTotal;
      if (typeof delta === 'number' && Number.isFinite(delta)) {
        desiredTotal = currentTotal + delta;
      } else if (typeof newAmount === 'number' && Number.isFinite(newAmount)) {
        desiredTotal = newAmount;
      }

      const effectiveDelta = desiredTotal - currentTotal;
      const deltaRounded = Math.round(effectiveDelta * 100) / 100;

      if (Math.abs(deltaRounded) < 0.005) {
        console.log('ℹ️ No cash adjustment needed (already in sync).');
        return;
      }

      // Identify target account
      const matchesPreferred = preferredAccountId
        ? accounts.find(acc => String(acc.id) === String(preferredAccountId))
        : null;

      const primaryAccount = accounts.find(acc => acc.is_primary);
      const fallbackAccount = accounts[0];

      const targetAccount = matchesPreferred || primaryAccount || fallbackAccount;

      if (!targetAccount) {
        console.warn('⚠️ Unable to locate a target bank account for cash adjustment.');
        return;
      }

      const currentBalance = Number(targetAccount.balance) || 0;
      const nextBalance = Math.round((currentBalance + deltaRounded) * 100) / 100;

      if (deltaRounded < 0 && nextBalance < -0.005) {
        throw new Error(`Insufficient funds in ${targetAccount.name}. Needed: ${Math.abs(deltaRounded).toFixed(2)}`);
      }

      const safeNextBalance = Math.max(0, nextBalance);

      const updatedAccount = await updateBankAccountBalance(targetAccount.id, safeNextBalance);

      const updatedAccounts = accounts.map(acc =>
        String(acc.id) === String(updatedAccount.id) ? updatedAccount : acc
      );
      setBankAccounts(updatedAccounts);

      const updatedTotal = calculateTotalBankBalance(updatedAccounts);
      setAvailableCash(updatedTotal);

      console.log(
        `✅ Bank account "${updatedAccount.name}" adjusted by ${deltaRounded.toFixed(2)}. `
        + `New balance: ${safeNextBalance.toFixed(2)}`
      );

    } catch (error) {
      console.error('❌ Error updating cash:', error);
    }
  }, []);

  const saveAvailableCash = useCallback(async (amount) => {
    await handleUpdateCash(amount);
  }, [handleUpdateCash]);

  const updateAlertSettings = async (updates) => {
    const nextSettings = {
      defaultDays: updates.defaultDays ?? alertSettings.defaultDays ?? 7,
      upcomingDays: updates.upcomingDays ?? alertSettings.upcomingDays ?? 30
    };
    await dbOperation('settings', 'put', { key: 'alertSettings', value: nextSettings });
    setAlertSettings(nextSettings);
  };

  const clearFocusTarget = useCallback(() => setFocusTarget(null), []);

  const handleNavigate = useCallback(({ view, focus } = {}) => {
    if (view) {
      setCurrentView(view);
    }
    if (focus) {
      setFocusTarget({
        ...focus,
        view: focus.view ?? view ?? null,
        timestamp: Date.now()
      });
    }
  }, []);

  const autoPayObligations = useCallback(async () => {
    if (!session) return;

    try {
      if (!creditCards.length && !loans.length) return;

      const today = new Date().toISOString().split('T')[0];
      let updatedCash = availableCash;
      let hasChanges = false;

      const normalizeId = (value) => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'object') {
          if (value.id !== undefined) return String(value.id);
          if (value.value !== undefined) return String(value.value);
          return null;
        }
        return String(value);
      };

      const normalizeDateOnly = (value) => {
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        date.setHours(0, 0, 0, 0);
        return date;
      };

      const fundAvailableOnOrBeforeDueDate = (fund, dueDateIso) => {
        if (!fund || !dueDateIso) return false;
        const dueDate = normalizeDateOnly(dueDateIso);
        if (!dueDate) return false;

        const created = normalizeDateOnly(fund.created_at || fund.last_paid_date || fund.updated_at || fund.due_date);
        if (!created) return true;

        return created <= dueDate;
      };

      const reservedFundMap = new Map();
      reservedFunds.forEach((fund) => {
        const key = normalizeId(fund.id);
        if (key) {
          reservedFundMap.set(key, { ...fund, id: key });
        }
      });

      const updateReservedFund = async (fund, amountUsed, { isLinked }) => {
        if (!fund) return null;
        const key = normalizeId(fund.id);
        if (!key) return null;

        const startingAmount = Number(fund.amount) || 0;
        const remaining = Math.max(0, startingAmount - amountUsed);
        const updatedFund = {
          ...fund,
          amount: remaining,
          last_paid_date: today
        };

        if (fund.recurring) {
          updatedFund.due_date = predictNextDate(fund.due_date, fund.frequency || 'monthly');
        }

        const shouldDelete = !fund.recurring && !fund.is_lumpsum && remaining <= 0;

        if (shouldDelete) {
          await dbOperation('reservedFunds', 'delete', key, { skipActivityLog: true });
          reservedFundMap.delete(key);
        } else {
          await dbOperation('reservedFunds', 'put', updatedFund, { skipActivityLog: true });
          reservedFundMap.set(key, updatedFund);
        }

        return {
          before: fund,
          after: shouldDelete ? null : updatedFund,
          amountApplied: amountUsed,
          isLinked
        };
      };

      const processCardPayment = async (card) => {
        const cardId = normalizeId(card.id);
        if (!cardId) return;
        if (!card?.due_date || (card.balance ?? 0) <= 0) return;
        if (getDaysUntil(card.due_date) !== 0) return;
        if (card.last_auto_payment_date === today) return;

        const dueDateIso = card.due_date;

        const linkedFund = [...reservedFundMap.values()].find(
          (fund) =>
            fund?.linked_to?.type === 'credit_card' &&
            normalizeId(fund?.linked_to?.id) === cardId &&
            (fund.amount ?? 0) > 0 &&
            fundAvailableOnOrBeforeDueDate(fund, dueDateIso)
        );

        let fundUsed = linkedFund;
        let fundContext = { isLinked: !!linkedFund };

        if (!fundUsed || !fundAvailableOnOrBeforeDueDate(fundUsed, dueDateIso)) {
          fundUsed = [...reservedFundMap.values()].find(
            (fund) =>
              fund?.is_lumpsum &&
              (fund.amount ?? 0) > 0 &&
              Array.isArray(fund.linked_items) &&
              fund.linked_items.some((item) => item.type === 'credit_card' && normalizeId(item.id) === cardId) &&
              fundAvailableOnOrBeforeDueDate(fund, dueDateIso)
          );
          fundContext = { isLinked: false };
        }

        if (!fundUsed || !fundAvailableOnOrBeforeDueDate(fundUsed, dueDateIso)) return;

        const paymentAmount = Math.min(Number(card.balance) || 0, Number(fundUsed.amount) || 0);
        if (paymentAmount <= 0) return;

        const fundResult = await updateReservedFund(fundUsed, paymentAmount, fundContext);
        if (!fundResult) return;

        const previousCash = updatedCash;
        updatedCash -= paymentAmount;
        hasChanges = true;

        await dbOperation('creditCards', 'put', {
          ...card,
          balance: Math.max(0, (Number(card.balance) || 0) - paymentAmount),
          last_auto_payment_date: today
        }, { skipActivityLog: true });

        const paymentTransaction = {
          type: 'payment',
          card_id: cardId,
          amount: paymentAmount,
          date: today,
          payment_method: 'credit_card',
          payment_method_id: cardId,
          payment_method_name: card.name,
          category_id: 'auto_payment',
          category_name: 'Auto Payment',
          description: `Auto payment for ${card.name}`,
          created_at: new Date().toISOString(),
          status: 'active',
          undone_at: null,
          auto_generated: true
        };

        const savedTransaction = await dbOperation('transactions', 'put', paymentTransaction, { skipActivityLog: true });

        if (fundResult.isLinked) {
          const fundTransaction = {
            type: 'reserved_fund_paid',
            amount: paymentAmount,
            date: today,
            description: `Reserved fund applied: ${fundResult.before.name}`,
            notes: `Auto payment for ${card.name}`,
            created_at: new Date().toISOString(),
            status: 'active',
            undone_at: null,
            payment_method: 'reserved_fund',
            payment_method_id: normalizeId(fundResult.before?.id),
            auto_generated: true
          };
          await dbOperation('transactions', 'put', fundTransaction, { skipActivityLog: true });
        }

        await logActivity(
        'payment',
        'card',
        cardId,
        card.name,
        `Auto payment of ${formatCurrency(paymentAmount)} for '${card.name}' from reserved fund`,
        {
        entity: { ...card },
        paymentAmount,
        date: today,
        previousCash,
        affectedFund: fundResult.before,
        transactionId: savedTransaction?.id
        }
        );
      };

      const processLoanPayment = async (loan) => {
        const loanId = normalizeId(loan.id);
        if (!loanId) return;
        if (!loan?.next_payment_date || (loan.payment_amount ?? 0) <= 0) return;
        if (getDaysUntil(loan.next_payment_date) !== 0) return;
        if (loan.last_auto_payment_date === today) return;

        const dueDateIso = loan.next_payment_date;

        const linkedFund = [...reservedFundMap.values()].find(
          (fund) =>
            fund?.linked_to?.type === 'loan' &&
            normalizeId(fund?.linked_to?.id) === loanId &&
            (fund.amount ?? 0) > 0 &&
            fundAvailableOnOrBeforeDueDate(fund, dueDateIso)
        );

        let fundUsed = linkedFund;
        let fundContext = { isLinked: !!linkedFund };

        if (!fundUsed) {
          fundUsed = [...reservedFundMap.values()].find(
            (fund) =>
              fund?.is_lumpsum &&
              (fund.amount ?? 0) > 0 &&
              Array.isArray(fund.linked_items) &&
              fund.linked_items.some((item) => item.type === 'loan' && normalizeId(item.id) === loanId) &&
              fundAvailableOnOrBeforeDueDate(fund, dueDateIso)
          );
          fundContext = { isLinked: false };
        }

        if (!fundUsed || !fundAvailableOnOrBeforeDueDate(fundUsed, dueDateIso)) return;

        const amountDue = Number(loan.payment_amount) || 0;
        const paymentAmount = Math.min(amountDue, Number(fundUsed.amount) || 0);
        if (paymentAmount <= 0) return;

        const fundResult = await updateReservedFund(fundUsed, paymentAmount, fundContext);
        if (!fundResult) return;

        const previousCash = updatedCash;
        updatedCash -= paymentAmount;
        hasChanges = true;

        await dbOperation('loans', 'put', {
          ...loan,
          balance: Math.max(0, (Number(loan.balance) || 0) - paymentAmount),
          last_payment_date: today,
          next_payment_date: predictNextDate(today, loan.frequency || 'monthly'),
          last_auto_payment_date: today
        }, { skipActivityLog: true });

        const paymentTransaction = {
          type: 'payment',
          loan_id: loanId,
          amount: paymentAmount,
          date: today,
          category_id: 'auto_payment',
          category_name: 'Auto Payment',
          payment_method: 'loan',
          payment_method_id: loanId,
          payment_method_name: loan.name,
          description: `Auto payment for ${loan.name}`,
          created_at: new Date().toISOString(),
          status: 'active',
          undone_at: null,
          auto_generated: true
        };

        const savedTransaction = await dbOperation('transactions', 'put', paymentTransaction, { skipActivityLog: true });

        await logActivity(
          'payment',
          'loan',
          loanId,
          loan.name,
          `Auto payment of ${formatCurrency(paymentAmount)} for '${loan.name}' from reserved fund`,
          {
            entity: { ...loan },
            paymentAmount,
            date: today,
            previousCash,
            affectedFund: fundResult.before,
            transactionId: savedTransaction?.id
          }
        );
      };

      for (const card of creditCards) {
        await processCardPayment(card);
      }

      for (const loan of loans) {
        await processLoanPayment(loan);
      }

      if (hasChanges) {
        if (updatedCash !== availableCash) {
          await saveAvailableCash(updatedCash);
        }
        await loadAllData();
      }
    } catch (error) {
      console.error('Auto payment failed:', error);
    }
  }, [session, creditCards, loans, reservedFunds, availableCash, saveAvailableCash, loadAllData]);

  const checkAutoIncome = useCallback(async () => {
    try {
      if (income.length === 0) return;

      const today = new Date().toISOString().split('T')[0];
      const sortedIncome = [...income].sort((a, b) => new Date(b.date) - new Date(a.date));
      const lastIncome = sortedIncome[0];

      if (!lastIncome?.frequency || lastIncome.frequency === 'onetime') return;

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

          await dbOperation('income', 'put', newIncome, { skipActivityLog: true });

          const transaction = {
            type: 'income',
            source: newIncome.source,
            amount: newIncome.amount,
            date: today,
            createdAt: new Date().toISOString(),
            payment_method: 'cash',
            payment_method_id: newIncome.id,
            payment_method_name: 'Cash',
            status: 'active',
            undone_at: null
          };
          const savedTransaction = await dbOperation('transactions', 'put', transaction, { skipActivityLog: true });

          const currentCash = await dbOperation('settings', 'get', 'availableCash');
          const previousCash = currentCash?.value || 0;
          const newCash = previousCash + newIncome.amount;
          await dbOperation('settings', 'put', { key: 'availableCash', value: newCash });

          await logActivity(
            'income',
            'income',
            newIncome.id,
            newIncome.source,
            `Auto deposited income '${newIncome.source}' - Amount ${formatCurrency(newIncome.amount)}`,
            {
              amount: newIncome.amount,
              source: newIncome.source,
              previousCash,
              newCash,
              transactionId: savedTransaction?.id,
              incomeId: newIncome.id,
              autoGenerated: true
            }
          );

          await loadAllData();
        }
      }
    } catch (error) {
      console.error('Auto-income generation failed:', error);
    }
  }, [income, loadAllData]);

  // View change handler - simplified to avoid hoisting issues
  const handleViewChange = (newView) => {
    setCurrentView(newView);
  };

  // Remove timer-based auto-checks - now triggered on tab changes only
  // Old code removed: useEffect timers for checkAutoIncome and autoPayObligations

  // Calculate total available cash (bank accounts + cash in hand)
  const displayAvailableCash = calculateTotalBankBalance(bankAccounts) + cashInHand;

  const navigateToTransactionHistory = useCallback((filterConfig = {}) => {
    setCurrentView('transactions');
    // Store filter config in sessionStorage for TransactionHistory to read
    if (Object.keys(filterConfig).length > 0) {
      sessionStorage.setItem('transactionFilters', JSON.stringify(filterConfig));
    }
  }, []); 
  const handleEditCash = () => {
    setCashInput(displayAvailableCash.toString());
    setEditingCash(true);
  };

  const handleSaveCash = async () => {
    const newAmount = parseFloat(cashInput);
    if (!isNaN(newAmount)) {
      await handleUpdateCash(newAmount);
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

  const openAddTransaction = () => {
    if (currentView !== 'transactions') {
      setCurrentView('transactions');
    }
    setShowAddTransactionModal(true);
  };

  const closeAddTransaction = () => {
    setShowAddTransactionModal(false);
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
  const trueAvailable = displayAvailableCash - totalReserved;
  const totalCreditCardDebt = creditCards.reduce((sum, card) => sum + card.balance, 0);
  const totalLoanDebt = loans.reduce((sum, loan) => sum + loan.balance, 0);

  const getUpcomingObligations = () => {
    const normalizeId = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'object') {
        if (value.id !== undefined) return String(value.id);
        if (value.value !== undefined) return String(value.value);
        return null;
      }
      return String(value);
    };

    const obligations = [];
    
    // Global alert window settings from Dashboard
    // - warningDays: Determines what shows as "Urgent" (default 7 days)
    // - upcomingWindow: Determines what shows as "Upcoming" (default 30 days)
    const warningDays = alertSettings.defaultDays || 7;
    const upcomingWindow = alertSettings.upcomingDays || 30;
    
    // IMPORTANT: For Dashboard display, we ALWAYS use the global alert windows above.
    // Individual card/loan alert_days settings exist for their own alert behaviors
    // (e.g., showing red warnings on Cards/Loans pages), but do NOT affect
    // Dashboard filtering. This keeps the Dashboard view consistent and user-controlled.
    
    // Process Credit Cards
    creditCards.forEach(card => {
      if (card.balance > 0 && card.due_date) {
        const days = getDaysUntil(card.due_date);
        // Note: card.alert_days exists but is NOT used for Dashboard urgent filtering
        obligations.push({
          type: 'credit_card',
          name: card.name,
          amount: card.balance,
          dueDate: card.due_date,
          days,
          urgent: days <= warningDays && days >= 0,  // ✅ Uses global warningDays
          id: normalizeId(card.id)
        });
      }
    });
    
    // Process Loans
    loans.forEach(loan => {
      if (loan.next_payment_date) {
        const days = getDaysUntil(loan.next_payment_date);
        // Note: loan.alert_days exists but is NOT used for Dashboard urgent filtering
        obligations.push({
          type: 'loan',
          name: loan.name,
          amount: loan.payment_amount,
          dueDate: loan.next_payment_date,
          days,
          urgent: days <= warningDays && days >= 0,  // ✅ Uses global warningDays
          id: normalizeId(loan.id)
        });
      }
    });
    
    // Process Reserved Funds
    // Reserved funds don't have individual alert_days, so they always use global setting
    reservedFunds.forEach(fund => {
      if (!fund?.due_date) return;
      const days = getDaysUntil(fund.due_date);
      obligations.push({
        type: 'reserved_fund',
        name: fund.name,
        amount: fund.amount,
        dueDate: fund.due_date,
        days,
        urgent: days <= warningDays && days >= 0,  // ✅ Uses global warningDays
        id: normalizeId(fund.id)
      });
    });
    
    // Filter and sort obligations
    // - Show only obligations with days >= 0 (not overdue/past)
    // - Show only if urgent OR within upcoming window
    // - Sort by days (soonest first)
    return obligations
      .filter(obligation => obligation.days >= 0 && (obligation.urgent || obligation.days <= upcomingWindow))
      .sort((a, b) => a.days - b.days);
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
            {isMigrating && (
              <span className="text-xs text-blue-500">Syncing accounts…</span>
            )}
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
            availableCash={displayAvailableCash}
            totalReserved={totalReserved}
            trueAvailable={trueAvailable}
            upcomingObligations={upcomingObligations}
            nextIncome={nextIncome}
            totalCreditCardDebt={totalCreditCardDebt}
            totalLoanDebt={totalLoanDebt}
            creditCards={creditCards}
            loans={loans}
            alertSettings={alertSettings}
            onNavigate={handleNavigate}
            onUpdateAlertSettings={updateAlertSettings}
            bankAccounts={bankAccounts}
            cashInHand={cashInHand}
            showCashInDashboard={showCashInDashboard}
            onUpdateCashInHand={async (newAmount) => {
              await dbOperation('settings', 'put', { key: 'cashInHand', value: newAmount });
              setCashInHand(newAmount);
              await loadLatestActivities();
            }}
            onToggleCashDisplay={async (show) => {
              await dbOperation('settings', 'put', { key: 'showCashInDashboard', value: show });
              setShowCashInDashboard(show);
            }}
            onReloadAll={loadAllData}
            latestActivities={latestActivities}
          />
        )}
        {currentView === 'cards' && (
          <CreditCards
            darkMode={darkMode}
            creditCards={creditCards}
            categories={categories}
            availableCash={displayAvailableCash}
            reservedFunds={reservedFunds}
            alertSettings={alertSettings}
            onUpdate={loadAllData}
            onUpdateCash={handleUpdateCash}
            focusTarget={focusTarget}
            onClearFocus={clearFocusTarget}
            bankAccounts={bankAccounts}
            onNavigateToTransactions={navigateToTransactionHistory}
            cashInHand={cashInHand}
            onUpdateCashInHand={async (newAmount) => {
              await dbOperation('settings', 'put', { key: 'cashInHand', value: newAmount });
              setCashInHand(newAmount);
            }}
          />
        )}
        {currentView === 'loans' && (
          <Loans
            darkMode={darkMode}
            loans={loans}
            creditCards={creditCards}
            categories={categories}
            availableCash={displayAvailableCash}
            reservedFunds={reservedFunds}
            alertSettings={alertSettings}
            onUpdate={loadAllData}
            onUpdateCash={handleUpdateCash}
            focusTarget={focusTarget}
            onClearFocus={clearFocusTarget}
            bankAccounts={bankAccounts}
            onNavigateToTransactions={navigateToTransactionHistory}
            cashInHand={cashInHand}
            onUpdateCashInHand={async (newAmount) => {
              await dbOperation('settings', 'put', { key: 'cashInHand', value: newAmount });
              setCashInHand(newAmount);
            }}
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
            focusTarget={focusTarget}
            onClearFocus={clearFocusTarget}
            bankAccounts={bankAccounts}
            onNavigateToTransactions={navigateToTransactionHistory}  // Navigate to Transaction History
          />
        )}
        {currentView === 'income' && (
          <Income
            darkMode={darkMode}
            income={income}
            availableCash={displayAvailableCash}
            onUpdate={loadAllData}
            onUpdateCash={handleUpdateCash}
            focusTarget={focusTarget}
            onClearFocus={clearFocusTarget}
            bankAccounts={bankAccounts}
            onNavigateToTransactions={navigateToTransactionHistory}
            cashInHand={cashInHand}
            onUpdateCashInHand={async (newAmount) => {
              await dbOperation('settings', 'put', { key: 'cashInHand', value: newAmount });
              setCashInHand(newAmount);
            }}
          />
        )}
        {currentView === 'bank-accounts' && (
          <BankAccounts
            darkMode={darkMode}
            bankAccounts={bankAccounts}
            onUpdate={async () => {
              await loadBankAccounts();
              await loadAllData();
            }}
            focusTarget={focusTarget}
            onClearFocus={clearFocusTarget}
            onNavigateToTransactions={navigateToTransactionHistory}
            cashInHand={cashInHand}
            onUpdateCashInHand={async (newAmount) => {
              await dbOperation('settings', 'put', { key: 'cashInHand', value: newAmount });
              setCashInHand(newAmount);
            }}
            onReloadAll={loadAllData}
          />
        )}
        {currentView === 'transactions' && (
          <TransactionHistory
            darkMode={darkMode}
            categories={categories}
            creditCards={creditCards}
            loans={loans}
            reservedFunds={reservedFunds}
            availableCash={displayAvailableCash}
            onUpdate={loadAllData}
            onUpdateCash={handleUpdateCash}
            showAddModal={showAddTransactionModal}
            onCloseAddModal={closeAddTransaction}
            bankAccounts={bankAccounts}
            cashInHand={cashInHand}
            onUpdateCashInHand={async (newAmount) => {
              await dbOperation('settings', 'put', { key: 'cashInHand', value: newAmount });
              setCashInHand(newAmount);
            }}
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
            onReloadCategories={loadCategories}
            cashInHand={cashInHand}
            showCashInDashboard={showCashInDashboard}
            onUpdateCashInHand={async (newAmount) => {
              await dbOperation('settings', 'put', { key: 'cashInHand', value: newAmount });
              setCashInHand(newAmount);
            }}
            onToggleCashDisplay={async (show) => {
              await dbOperation('settings', 'put', { key: 'showCashInDashboard', value: show });
              setShowCashInDashboard(show);
            }}
          />
        )}
      </div>
        {/* Floating Add Transaction Button */}
        <button
        onClick={openAddTransaction}
        className="fixed bottom-24 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center z-20"
        title="Add Transaction"
        >
        <Plus size={28} />
        </button>
      <div className={`fixed bottom-0 left-0 right-0 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t px-2 py-2 flex justify-around`}>
        <button
          onClick={() => handleViewChange('dashboard')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'dashboard' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <TrendingUp size={24} />
          <span className="text-xs font-medium">Dashboard</span>
        </button>
        <button
          onClick={() => handleViewChange('cards')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'cards' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <CreditCard size={24} />
          <span className="text-xs font-medium">Cards</span>
        </button>
        <button
          onClick={() => handleViewChange('loans')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'loans' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <TrendingUp size={24} />
          <span className="text-xs font-medium">Loans</span>
        </button>
        <button
          onClick={() => handleViewChange('reserved')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'reserved' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <Calendar size={24} />
          <span className="text-xs font-medium">Reserved</span>
        </button>
        <button
          onClick={() => handleViewChange('bank-accounts')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'bank-accounts' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <Building2 size={24} />
          <span className="text-xs font-medium">Bank Accounts</span>
        </button>
        <button
          onClick={() => handleViewChange('income')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'income' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <DollarSign size={24} />
          <span className="text-xs font-medium">Income</span>
        </button>
        <button
          onClick={() => handleViewChange('activity')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'activity' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <Activity size={24} />
          <span className="text-xs font-medium">Activity</span>
        </button>
        <button
          onClick={() => handleViewChange('transactions')}
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${currentView === 'transactions' ? 'text-blue-600 bg-blue-50' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}
        >
          <List size={24} />
          <span className="text-xs font-medium">Transactions</span>
        </button>
        <button
           onClick={() => handleViewChange('settings')}
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
