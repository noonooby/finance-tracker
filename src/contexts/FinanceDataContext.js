import React, { createContext, useState, useCallback, useMemo, useRef } from 'react';
import { 
  dbOperation,
  getAllBankAccounts,
  getCashInHand,
  updateCashInHand as recordCashInHand
} from '../utils/db';
import { DEFAULT_CATEGORIES, calculateTotalBankBalance } from '../utils/helpers';
import { processDueIncomeSchedules, processOverdueLoanPayments, processOverdueCreditCardPayments } from '../utils/schedules';
import { server } from '../utils/server';

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
  const [cashAsOf, setCashAsOf] = useState(null);
  const [investments, setInvestments] = useState([]);
  const [assets, setAssets] = useState([]);
  
  // Loading states
  const [dataLoading, setDataLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const loadingRef = useRef(null);
  
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
      const { data: { user } } = await server.auth.getUser();
      if (!user) return;

      const { data, error } = await server
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
  // A load already running is shared, so two callers at startup cause one load.
  const loadDataProgressively = useCallback(() => {
    if (!loadingRef.current) {
      loadingRef.current = runLoad().finally(() => { loadingRef.current = null; });
    }
    return loadingRef.current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBankAccounts, loadCategories]);

  async function runLoad() {
    setDataLoading(true);
    setLoadError(null);
    try {
      // PHASE 1: Load critical settings first
      console.log('📊 Phase 1: Loading critical settings...');
      const settings = await dbOperation('settings', 'getAll');
      
      const cashInHandSetting = settings?.find(s => s.key === 'cashInHand');
      setCashInHand(Number(cashInHandSetting?.value) || 0);
      setCashAsOf(cashInHandSetting?.balance_as_of || null);

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
        getAllBankAccounts(),
        server.from('investments').select('*').then((r) => r.data || []),
        server.from('assets').select('*').then((r) => r.data || []),
      ]).then(([c, l, i, t, a, inv, as]) => { setInvestments(inv); setAssets(as); return [c, l, i, t, a]; });
      
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
      
      // PHASE 4: Scheduled money: pay days, then loan and card payments with a connected account.
      // Each date is recorded once (the server keeps a once-only key), so running this on every load is safe.
      const autoResults = await processDueIncomeSchedules();
      let paid = 0;
      try {
        const freshCards = (await dbOperation('creditCards', 'getAll')) || [];
        const freshLoans = (await dbOperation('loans', 'getAll')) || [];
        const loanRes = await processOverdueLoanPayments(freshLoans, freshCards, accounts || [], 0);
        const cardRes = await processOverdueCreditCardPayments(freshCards, accounts || [], 0);
        paid = (loanRes?.processed?.length || 0) + (cardRes?.processed?.length || 0);
        if (paid) {
          setLoans((await dbOperation('loans', 'getAll')) || []);
          setCreditCards((await dbOperation('creditCards', 'getAll')) || []);
        }
      } catch (e) {
        console.error('Scheduled payments:', e);
      }

      if (autoResults.deposited.length > 0 || paid) {
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
      console.error('Error loading data:', error);
      setLoadError(error?.message || 'Could not load your data.');
    } finally {
      setDataLoading(false);
    }
  }

  // Full data reload
  const loadAllData = useCallback(async () => {
    await loadDataProgressively();
    await loadLatestActivities();
  }, [loadDataProgressively, loadLatestActivities]);

  // Refreshes bank accounts and cash from the server. It never changes a balance: money moves only through utils/money.js.
  const handleUpdateCash = useCallback(async (newAmount, options = {}) => {
    if (newAmount !== null && newAmount !== undefined && !options?.syncOnly) {
      console.warn('handleUpdateCash no longer sets balances; record the money event through utils/money.js instead. Refreshing only.');
    }
    await loadBankAccounts();
    setCashInHand(await getCashInHand());
  }, [loadBankAccounts]);

  // The user states how much cash they hold: recorded as a balance correction, then reloaded.
  const updateCashInHand = useCallback(async (newAmount) => {
    await recordCashInHand(newAmount);
    setCashInHand(await getCashInHand());
  }, []);

  // Calculated values
  const displayAvailableCash = calculateTotalBankBalance(bankAccounts) + (Number(cashInHand) || 0);
  const totalCreditCardDebt = creditCards.reduce((sum, card) => sum + (Number(card.balance) || 0), 0);
  const totalLoanDebt = loans.reduce((sum, loan) => sum + (Number(loan.balance) || 0), 0);

  const value = useMemo(() => ({
    // States
    creditCards,
    loans,
    income,
    transactions,
    categories,
    bankAccounts,
    availableCash,
    cashInHand,
    cashAsOf,
    investments,
    assets,
    setInvestments,
    setAssets,
    dataLoading,
    loadError,
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
  }), [creditCards, loans, income, transactions, categories, bankAccounts, availableCash, cashInHand, cashAsOf, investments, assets, dataLoading, loadError,
    latestActivities, loadAllData, loadDataProgressively, loadBankAccounts, loadCategories, loadLatestActivities,
    handleUpdateCash, updateCashInHand, displayAvailableCash, totalCreditCardDebt, totalLoanDebt]);

  return (
    <FinanceDataContext.Provider value={value}>
      {children}
    </FinanceDataContext.Provider>
  );
}
