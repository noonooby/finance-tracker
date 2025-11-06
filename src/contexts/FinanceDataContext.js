import React, { createContext, useState, useCallback } from 'react';
import { 
  dbOperation,
  getAllBankAccounts
} from '../utils/db';
import { DEFAULT_CATEGORIES, calculateTotalBankBalance } from '../utils/helpers';
import { processDueIncomeSchedules } from '../utils/schedules';
import { supabase } from '../utils/supabase';

export const FinanceDataContext = createContext(null);

export function FinanceDataProvider({ children }) {
  // Financial entity states
  const [creditCards, setCreditCards] = useState([]);
  const [loans, setLoans] = useState([]);
  const [income, setIncome] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [bankAccounts, setBankAccounts] = useState([]);
  
  // Cash states
  const [availableCash, setAvailableCash] = useState(0);
  const [cashInHand, setCashInHand] = useState(0);
  
  // Loading states
  const [dataLoading, setDataLoading] = useState(false);
  
  // Latest activities
  const [latestActivities, setLatestActivities] = useState([]);

  // Load bank accounts
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

  // Load categories
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

  // Load latest activities
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

  // Progressive data loading
  const loadDataProgressively = useCallback(async () => {
    setDataLoading(true);
    try {
      // PHASE 1: Load critical settings first
      console.log('📊 Phase 1: Loading critical settings...');
      const settings = await dbOperation('settings', 'getAll');
      
      const cashInHandSetting = settings?.find(s => s.key === 'cashInHand');
      setCashInHand(Number(cashInHandSetting?.value) || 0);

      const cashSetting = settings?.find(s => s.key === 'availableCash');
      const cashValue = Number(cashSetting?.value) || 0;
      setAvailableCash(cashValue);

      // PHASE 2: Load categories
      console.log('📊 Phase 2: Loading categories...');
      await loadCategories();

      // PHASE 3: Load financial data in parallel
      console.log('📊 Phase 3: Loading financial data...');
      const [cards, loansData, incomeDataRaw, transRaw, accounts] = await Promise.all([
        dbOperation('creditCards', 'getAll'),
        dbOperation('loans', 'getAll'),
        dbOperation('income', 'getAll'),
        dbOperation('transactions', 'getAll'),
        getAllBankAccounts()
      ]);
      
      let incomeData = incomeDataRaw || [];
      let transactionsData = transRaw || [];
      
      setCreditCards(cards || []);
      setLoans(loansData || []);
      setBankAccounts(accounts || []);
      
      // Update cash from bank accounts
      if (accounts && accounts.length > 0) {
        const totalBalance = calculateTotalBankBalance(accounts);
        setAvailableCash(totalBalance);
      }
      
      // PHASE 4: Process due income schedules
      console.log('📊 Phase 4: Processing due income schedules...');
      const autoResults = await processDueIncomeSchedules();
      
      if (autoResults.deposited.length > 0) {
        console.log('🎉 Auto-deposited income on app load:', autoResults.deposited);
        // Reload all data after auto-deposits
        incomeData = await dbOperation('income', 'getAll') || [];
        transactionsData = await dbOperation('transactions', 'getAll') || [];
        // Reload bank accounts to reflect deposits
        await loadBankAccounts();
      }
      
      setIncome(incomeData);
      setTransactions(transactionsData);

      console.log('✅ All data loaded successfully!');
    } catch (error) {
      console.error('❌ Error loading data:', error);
    } finally {
      setDataLoading(false);
    }
  }, [loadBankAccounts, loadCategories]);

  // Full data reload
  const loadAllData = useCallback(async () => {
    await loadDataProgressively();
    await loadLatestActivities();
  }, [loadDataProgressively, loadLatestActivities]);

  // Update cash handler
  const handleUpdateCash = useCallback(async (newAmount, options = {}) => {
    try {
      const { accountId: preferredAccountId, delta, syncOnly = false } = options || {};

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

      // Update bank account balance
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: updatedAccount, error } = await supabase
        .from('bank_accounts')
        .update({
          balance: safeNextBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetAccount.id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      console.log('💰 Balance updated:', updatedAccount.name, '→', safeNextBalance);

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
      throw error;
    }
  }, []);

  // Update cash in hand
  const updateCashInHand = useCallback(async (newAmount) => {
    await dbOperation('settings', 'put', { key: 'cashInHand', value: newAmount });
    setCashInHand(newAmount);
  }, []);

  // Calculated values
  const displayAvailableCash = calculateTotalBankBalance(bankAccounts) + cashInHand;
  const totalCreditCardDebt = creditCards.reduce((sum, card) => sum + card.balance, 0);
  const totalLoanDebt = loans.reduce((sum, loan) => sum + loan.balance, 0);

  const value = {
    // States
    creditCards,
    loans,
    income,
    transactions,
    categories,
    bankAccounts,
    availableCash,
    cashInHand,
    dataLoading,
    latestActivities,
    
    // Setters
    setCreditCards,
    setLoans,
    setIncome,
    setTransactions,
    setCategories,
    setBankAccounts,
    setAvailableCash,
    setCashInHand,
    
    // Actions
    loadAllData,
    loadDataProgressively,
    loadBankAccounts,
    loadCategories,
    loadLatestActivities,
    handleUpdateCash,
    updateCashInHand,
    
    // Calculated values
    displayAvailableCash,
    totalCreditCardDebt,
    totalLoanDebt,
  };

  return (
    <FinanceDataContext.Provider value={value}>
      {children}
    </FinanceDataContext.Provider>
  );
}
