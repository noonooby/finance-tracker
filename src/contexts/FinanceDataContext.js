import React, { createContext, useState, useCallback, useMemo, useRef } from 'react';
import { 
  dbOperation,
  getAllBankAccounts,
} from '../utils/db';
import { DEFAULT_CATEGORIES, calculateTotalBankBalance } from '../utils/helpers';
import { processDueIncomeSchedules, processOverdueLoanPayments, processOverdueCreditCardPayments } from '../utils/schedules';
import { server } from '../utils/server';
import { loadPrefs } from '../utils/prefs';
import { getLocal, setLocal } from '../utils/localStore';

export const FinanceDataContext = createContext(null);

export function FinanceDataProvider({ children }) {
  // Financial entity states
  const [creditCards, setCreditCards] = useState([]);
  const [loans, setLoans] = useState([]);
  const [income, setIncome] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [bankAccounts, setBankAccounts] = useState([]);
  
  // Money held in accounts (cash is one of the bank accounts)
  const [availableCash, setAvailableCash] = useState(0);
  const [investments, setInvestments] = useState([]);
  const [assets, setAssets] = useState([]);
  const [incomeSchedules, setIncomeSchedules] = useState([]);
  const [categoryRules, setCategoryRules] = useState([]);
  const [bills, setBills] = useState([]);
  const [budgets, setBudgets] = useState({});
  // When the figures shown are the copy saved on this device (no connection): the time they were saved.
  const [offlineAt, setOfflineAt] = useState(null);
  const extraRef = useRef({});
  
  // Loading states
  const [dataLoading, setDataLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const loadingRef = useRef(null);
  
  // Latest activities
  const [latestActivities, setLatestActivities] = useState([]);

  // Load bank accounts
  const loadBankAccounts = useCallback(async () => {
    try {
      const accounts = await getAllBankAccounts();
      setBankAccounts(accounts);

      if (accounts && accounts.length > 0) {
        const totalBalance = calculateTotalBankBalance(accounts);
        setAvailableCash(totalBalance);
      } else {
        setAvailableCash(0);
      }

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
        return cats;
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
  const loadedOnceRef = useRef(false);
  const lastDueRef = useRef(0);
  const loadDataProgressively = useCallback(() => {
    if (!loadingRef.current) {
      loadingRef.current = runLoad().finally(() => { loadingRef.current = null; });
    }
    return loadingRef.current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBankAccounts, loadCategories]);

  async function runLoad() {
    // Only the first load shows the loading state; later refreshes after an action update quietly.
    const first = !loadedOnceRef.current;
    if (first) setDataLoading(true);
    setLoadError(null);
    try {
      // Categories first (a new account gets the default ones), then everything else at once.
      const cats = await loadCategories();

      // Everything else in parallel
      const [cards, loansData, incomeDataRaw, transRaw, accounts] = await Promise.all([
        dbOperation('creditCards', 'getAll'),
        dbOperation('loans', 'getAll'),
        dbOperation('income', 'getAll'),
        dbOperation('transactions', 'getAll'),
        getAllBankAccounts(),
        server.from('investments').select('*').then((r) => r.data || []),
        server.from('assets').select('*').then((r) => r.data || []),
        server.from('income_schedules').select('*').then((r) => r.data || []),
        server.from('category_rules').select('*').then((r) => r.data || []),
        server.from('bills').select('*').then((r) => r.data || []),
        loadPrefs().catch(() => ({})),
      ]).then(([c, l, i, t, a, inv, as, sch, rules, bl, prefs]) => {
        setInvestments(inv); setAssets(as); setIncomeSchedules(sch); setCategoryRules(rules); setBills(bl); setBudgets(prefs.category_budgets || {});
        extraRef.current = { investments: inv, assets: as, incomeSchedules: sch, categoryRules: rules, bills: bl, budgets: prefs.category_budgets || {} };
        return [c, l, i, t, a];
      });
      
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
      
      // Scheduled money: pay days, then loan and card payments with a connected account.
      // Each date is recorded once (the server keeps a once-only key), so running this on every load is safe.
      // Runs on the first load and then at most every 10 minutes, not after every action.
      const dueCheck = first || Date.now() - lastDueRef.current > 600000;
      if (dueCheck) lastDueRef.current = Date.now();
      const autoResults = dueCheck ? await processDueIncomeSchedules() : { deposited: [] };
      let paid = 0;
      if (dueCheck) try {
        // Cards and loans were loaded a moment ago in this same load; the server checks every balance again anyway.
        const loanRes = await processOverdueLoanPayments(loansData || [], cards || [], accounts || []);
        const cardRes = await processOverdueCreditCardPayments(cards || [], accounts || []);
        paid = (loanRes?.processed?.length || 0) + (cardRes?.processed?.length || 0);
        if (paid) {
          setLoans((await dbOperation('loans', 'getAll')) || []);
          setCreditCards((await dbOperation('creditCards', 'getAll')) || []);
        }
      } catch (e) {
        console.error('Scheduled payments:', e);
      }

      if (autoResults.deposited.length > 0 || paid) {
        // Reload all data after auto-deposits
        incomeData = await dbOperation('income', 'getAll') || [];
        transactionsData = await dbOperation('transactions', 'getAll') || [];
        // Reload bank accounts to reflect deposits
        await loadBankAccounts();
      }
      
      setIncome(incomeData);
      setTransactions(transactionsData);
      setOfflineAt(null);

      // The figures just loaded are kept on this device, so the app can open without a connection.
      const { data: { user } } = await server.auth.getUser();
      if (user) setLocal(`figures:${user.id}`, { savedAt: new Date().toISOString(), creditCards: cards || [], loans: loansData || [], income: incomeData,
        transactions: transactionsData, bankAccounts: accounts || [], categories: cats || null, extra: extraRef.current });

    } catch (error) {
      // No connection: show the figures last saved on this device, read only, until the connection is back.
      const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || /fetch|network|load failed|no connection/i.test(String(error?.message || ''));
      const { data: { user } } = offline ? await server.auth.getUser() : { data: {} };
      const saved = user ? await getLocal(`figures:${user.id}`) : null;
      if (saved) {
        setCreditCards(saved.creditCards || []); setLoans(saved.loans || []); setIncome(saved.income || []); setTransactions(saved.transactions || []);
        setBankAccounts(saved.bankAccounts || []); if (saved.categories && saved.categories.length) setCategories(saved.categories);
        if (saved.extra) { setInvestments(saved.extra.investments || []); setAssets(saved.extra.assets || []); setIncomeSchedules(saved.extra.incomeSchedules || []);
          setCategoryRules(saved.extra.categoryRules || []); setBills(saved.extra.bills || []); setBudgets(saved.extra.budgets || {}); }
        setOfflineAt(saved.savedAt);
      } else {
        console.error('Error loading data:', error);
        setLoadError(offline ? 'No connection, and nothing is saved on this device yet. Connect once and the app keeps a copy here.' : (error?.message || 'Could not load your data.'));
      }
    } finally {
      loadedOnceRef.current = true;
      setDataLoading(false);
    }
  }

  // Full data reload
  const loadAllData = useCallback(async () => {
    await loadDataProgressively();
    await loadLatestActivities();
  }, [loadDataProgressively, loadLatestActivities]);

  // Refreshes bank accounts (cash included) from the server. It never changes a balance: money moves only through utils/money.js.
  const handleUpdateCash = useCallback(async (newAmount, options = {}) => {
    if (newAmount !== null && newAmount !== undefined && !options?.syncOnly) {
      console.warn('handleUpdateCash no longer sets balances; record the money event through utils/money.js instead. Refreshing only.');
    }
    await loadBankAccounts();
  }, [loadBankAccounts]);

  // Calculated values
  const displayAvailableCash = calculateTotalBankBalance(bankAccounts);
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
    investments,
    assets,
    incomeSchedules,
    categoryRules,
    setCategoryRules,
    bills,
    setBills,
    budgets,
    setBudgets,
    offlineAt,
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
    
    // Actions
    loadAllData,
    loadDataProgressively,
    loadBankAccounts,
    loadCategories,
    loadLatestActivities,
    handleUpdateCash,
    
    // Calculated values
    displayAvailableCash,
    totalCreditCardDebt,
    totalLoanDebt,
  }), [creditCards, loans, income, transactions, categories, bankAccounts, availableCash, investments, assets, incomeSchedules, categoryRules, bills, budgets, offlineAt, dataLoading, loadError,
    latestActivities, loadAllData, loadDataProgressively, loadBankAccounts, loadCategories, loadLatestActivities,
    handleUpdateCash, displayAvailableCash, totalCreditCardDebt, totalLoanDebt]);

  return (
    <FinanceDataContext.Provider value={value}>
      {children}
    </FinanceDataContext.Provider>
  );
}
