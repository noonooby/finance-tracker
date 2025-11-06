import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFinanceData } from '../hooks/useFinanceData';
import { useTheme } from '../hooks/useTheme';
import { useUI } from '../hooks/useUI';
import { useUpcomingObligations } from '../hooks/useUpcomingObligations';
import { useNextIncome } from '../hooks/useNextIncome';

// Critical components (loaded immediately)
import Auth from '../components/Auth';
import { MainLayout } from '../layouts';
import { ProtectedRoute } from './ProtectedRoute';

// Lazy-loaded components (loaded on-demand)
const Dashboard = lazy(() => import('../components/Dashboard'));
const ActivityFeed = lazy(() => import('../components/ActivityFeed'));
const CreditCards = lazy(() => import('../components/CreditCards'));
const Loans = lazy(() => import('../components/Loans'));

const Income = lazy(() => import('../components/Income'));
const TransactionHistory = lazy(() => import('../components/TransactionHistory'));
const BankAccounts = lazy(() => import('../components/BankAccounts'));
const Settings = lazy(() => import('../components/Settings'));
const Reports = lazy(() => import('../components/Reports'));

/**
 * Loading Fallback Component
 */
const LoadingFallback = () => {
  const { darkMode } = useTheme();
  return (
    <div className={`flex items-center justify-center min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
        Loading...
      </div>
    </div>
  );
};

/**
 * Auth Route Wrapper (redirects to dashboard if already logged in)
 */
const AuthRoute = React.memo(() => {
  const { session } = useAuth();
  const { darkMode } = useTheme();

  if (session) {
    return <Navigate to="/" replace />;
  }

  return <Auth darkMode={darkMode} />;
});

/**
 * Route Component Wrappers with Props
 */
const DashboardRoute = React.memo(() => {
  const {
    creditCards,
    loans,
    income,
    bankAccounts,
    cashInHand,
    displayAvailableCash,
    totalCreditCardDebt,
    totalLoanDebt,
    latestActivities,
    loadAllData,
    updateCashInHand,
    handleUpdateCash,
  } = useFinanceData();
  
  const {
    darkMode,
    showCashInDashboard,
    alertSettings,
    updateAlertSettings,
    toggleCashDisplay,
  } = useTheme();
  
  const { handleNavigate } = useUI();

  // Use custom hooks for business logic
  const upcomingObligations = useUpcomingObligations(creditCards, loans, [], alertSettings);
  const nextIncome = useNextIncome(income);

  // Handle process due payments from Dashboard
  const handleProcessDuePayments = async () => {
    try {
      const { processOverdueLoanPayments, processOverdueCreditCardPayments } = await import('../utils/schedules');
      const { showToast } = await import('../utils/toast');
      
      const results = await processOverdueLoanPayments(
        loans,
        creditCards,
        bankAccounts,
        cashInHand
      );
      
      await loadAllData();
      
      const processedCount = results.processed.length;
      const failedCount = results.failed.length;
      
      if (processedCount > 0) {
        showToast.success(`Processed ${processedCount} loan payment(s)`);
      } else if (failedCount > 0) {
        showToast.error(`Failed to process ${failedCount} loan(s)`);
      } else {
        showToast.info('No overdue loans found');
      }
    } catch (error) {
      console.error('Error processing due payments:', error);
      const { showToast } = await import('../utils/toast');
      showToast.error('Error processing payments');
    }
  };

  return (
    <Dashboard
      darkMode={darkMode}
      availableCash={displayAvailableCash}
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
      onUpdateCashInHand={updateCashInHand}
      onToggleCashDisplay={toggleCashDisplay}
      onReloadAll={loadAllData}
      latestActivities={latestActivities}
      onProcessDuePayments={handleProcessDuePayments}
    />
  );
});

const CreditCardsRoute = React.memo(() => {
  const { darkMode, alertSettings } = useTheme();
  const financeData = useFinanceData();
  const { focusTarget, clearFocusTarget, navigateToTransactionHistory } = useUI();
  
  return (
    <CreditCards
      darkMode={darkMode}
      alertSettings={alertSettings}
      {...financeData}
      focusTarget={focusTarget}
      onClearFocus={clearFocusTarget}
      onNavigateToTransactions={navigateToTransactionHistory}
      onUpdate={financeData.loadAllData}
      onUpdateCash={financeData.handleUpdateCash}
      onUpdateCashInHand={financeData.updateCashInHand}
    />
  );
});

const LoansRoute = React.memo(() => {
  const { darkMode, alertSettings } = useTheme();
  const financeData = useFinanceData();
  const { focusTarget, clearFocusTarget, navigateToTransactionHistory } = useUI();
  
  return (
    <Loans
      darkMode={darkMode}
      alertSettings={alertSettings}
      {...financeData}
      focusTarget={focusTarget}
      onClearFocus={clearFocusTarget}
      onNavigateToTransactions={navigateToTransactionHistory}
      onUpdate={financeData.loadAllData}
      onUpdateCash={financeData.handleUpdateCash}
      onUpdateCashInHand={financeData.updateCashInHand}
    />
  );
});



const IncomeRoute = React.memo(() => {
  const { darkMode } = useTheme();
  const financeData = useFinanceData();
  const { focusTarget, clearFocusTarget, navigateToTransactionHistory } = useUI();
  
  return (
    <Income
      darkMode={darkMode}
      {...financeData}
      focusTarget={focusTarget}
      onClearFocus={clearFocusTarget}
      onNavigateToTransactions={navigateToTransactionHistory}
      onUpdate={financeData.loadAllData}
      onUpdateCash={financeData.handleUpdateCash}
      onUpdateCashInHand={financeData.updateCashInHand}
    />
  );
});

const BankAccountsRoute = React.memo(() => {
  const { darkMode } = useTheme();
  const financeData = useFinanceData();
  const { focusTarget, clearFocusTarget, navigateToTransactionHistory } = useUI();
  
  return (
    <BankAccounts
      darkMode={darkMode}
      bankAccounts={financeData.bankAccounts}
      loans={financeData.loans}
      creditCards={financeData.creditCards}
      cashInHand={financeData.cashInHand}
      focusTarget={focusTarget}
      onClearFocus={clearFocusTarget}
      onNavigateToTransactions={navigateToTransactionHistory}
      onUpdate={financeData.loadAllData}
      onUpdateCashInHand={financeData.updateCashInHand}
      onReloadAll={financeData.loadAllData}
    />
  );
});

const TransactionsRoute = React.memo(() => {
  const { darkMode } = useTheme();
  const financeData = useFinanceData();
  const { showAddTransactionModal, closeAddTransaction } = useUI();
  
  return (
    <TransactionHistory
      darkMode={darkMode}
      {...financeData}
      showAddModal={showAddTransactionModal}
      onCloseAddModal={closeAddTransaction}
      onUpdate={financeData.loadAllData}
      onUpdateCash={financeData.handleUpdateCash}
      onUpdateCashInHand={financeData.updateCashInHand}
    />
  );
});

const ActivityRoute = React.memo(() => {
  const { darkMode } = useTheme();
  const { loadAllData } = useFinanceData();
  
  return (
    <ActivityFeed
      darkMode={darkMode}
      onUpdate={loadAllData}
    />
  );
});

const ReportsRoute = React.memo(() => {
  const { darkMode } = useTheme();
  const { categories, cashInHand } = useFinanceData();
  
  return (
    <Reports
      darkMode={darkMode}
      categories={categories}
      cashInHand={cashInHand}
    />
  );
});

const SettingsRoute = React.memo(() => {
  const { darkMode, displayDensity, setDisplayDensity } = useTheme();
  const { loadAllData, loadCategories, cashInHand, updateCashInHand, categories } = useFinanceData();
  const { showCashInDashboard, toggleCashDisplay } = useTheme();
  
  return (
    <Settings
      darkMode={darkMode}
      displayDensity={displayDensity}
      onDisplayDensityChange={setDisplayDensity}
      onUpdate={loadAllData}
      onReloadCategories={loadCategories}
      cashInHand={cashInHand}
      showCashInDashboard={showCashInDashboard}
      categories={categories}
      onUpdateCashInHand={updateCashInHand}
      onToggleCashDisplay={toggleCashDisplay}
    />
  );
});

/**
 * Application Routes
 * All route definitions and route component wrappers
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Login Route */}
      <Route path="/login" element={<AuthRoute />} />
      
      {/* Protected Routes with Layout */}
      <Route element={
        <ProtectedRoute>
          <MainLayout />
        </ProtectedRoute>
      }>
        <Route path="/" element={
          <Suspense fallback={<LoadingFallback />}>
            <DashboardRoute />
          </Suspense>
        } />
        <Route path="/dashboard" element={
          <Suspense fallback={<LoadingFallback />}>
            <DashboardRoute />
          </Suspense>
        } />
        <Route path="/cards" element={
          <Suspense fallback={<LoadingFallback />}>
            <CreditCardsRoute />
          </Suspense>
        } />
        <Route path="/loans" element={
          <Suspense fallback={<LoadingFallback />}>
            <LoansRoute />
          </Suspense>
        } />

        <Route path="/income" element={
          <Suspense fallback={<LoadingFallback />}>
            <IncomeRoute />
          </Suspense>
        } />
        <Route path="/bank-accounts" element={
          <Suspense fallback={<LoadingFallback />}>
            <BankAccountsRoute />
          </Suspense>
        } />
        <Route path="/transactions" element={
          <Suspense fallback={<LoadingFallback />}>
            <TransactionsRoute />
          </Suspense>
        } />
        <Route path="/activity" element={
          <Suspense fallback={<LoadingFallback />}>
            <ActivityRoute />
          </Suspense>
        } />
        <Route path="/reports" element={
          <Suspense fallback={<LoadingFallback />}>
            <ReportsRoute />
          </Suspense>
        } />
        <Route path="/settings" element={
          <Suspense fallback={<LoadingFallback />}>
            <SettingsRoute />
          </Suspense>
        } />
      </Route>
      
      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
