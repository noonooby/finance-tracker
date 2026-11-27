import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFinanceData } from '../hooks/useFinanceData';
import { useTheme } from '../hooks/useTheme';
import { useUI } from '../hooks/useUI';

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
const ScreenshotImport = lazy(() => import('../components/ScreenshotImport'));
const More = lazy(() => import('../components/More'));
const Help = lazy(() => import('../components/Help'));
const Position = lazy(() => import('../components/Position'));
const Investments = lazy(() => import('../components/Investments'));
const Bills = lazy(() => import('../components/Bills'));
const Goals = lazy(() => import('../components/Goals'));
const Ask = lazy(() => import('../components/Ask'));
const Payoff = lazy(() => import('../components/Payoff'));
const YearSummary = lazy(() => import('../components/YearSummary'));
const CashCalendar = lazy(() => import('../components/CashCalendar'));
const Room = lazy(() => import('../components/Room'));
const TaxYears = lazy(() => import('../components/TaxYears'));
const Everything = lazy(() => import('../components/Everything'));
const CreditScore = lazy(() => import('../components/CreditScore'));

/**
 * Loading Fallback Component
 */
const LoadingFallback = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-2">
      <div className="text-lg text-muted">
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

  if (session) {
    return <Navigate to="/" replace />;
  }

  return <Auth />;
});

/**
 * Route Component Wrappers with Props
 */
// Home reads everything it needs from the data context itself.
const DashboardRoute = React.memo(() => <Dashboard />);

const CreditCardsRoute = React.memo(() => {
  const { alertSettings } = useTheme();
  const financeData = useFinanceData();
  const { focusTarget, clearFocusTarget, navigateToTransactionHistory } = useUI();
  
  return (
    <CreditCards
      alertSettings={alertSettings}
      {...financeData}
      focusTarget={focusTarget}
      onClearFocus={clearFocusTarget}
      onNavigateToTransactions={navigateToTransactionHistory}
      onUpdate={financeData.loadAllData}
      onUpdateCash={financeData.handleUpdateCash}
    />
  );
});

const LoansRoute = React.memo(() => {
  const { alertSettings } = useTheme();
  const financeData = useFinanceData();
  const { focusTarget, clearFocusTarget, navigateToTransactionHistory } = useUI();
  
  return (
    <Loans
      alertSettings={alertSettings}
      {...financeData}
      focusTarget={focusTarget}
      onClearFocus={clearFocusTarget}
      onNavigateToTransactions={navigateToTransactionHistory}
      onUpdate={financeData.loadAllData}
      onUpdateCash={financeData.handleUpdateCash}
    />
  );
});



const IncomeRoute = React.memo(() => {
  const financeData = useFinanceData();
  const { focusTarget, clearFocusTarget, navigateToTransactionHistory } = useUI();
  
  return (
    <Income
      {...financeData}
      focusTarget={focusTarget}
      onClearFocus={clearFocusTarget}
      onNavigateToTransactions={navigateToTransactionHistory}
      onUpdate={financeData.loadAllData}
      onUpdateCash={financeData.handleUpdateCash}
    />
  );
});

const BankAccountsRoute = React.memo(() => {
  const financeData = useFinanceData();
  const { focusTarget, clearFocusTarget, navigateToTransactionHistory } = useUI();
  
  return (
    <BankAccounts
      bankAccounts={financeData.bankAccounts}
      loans={financeData.loans}
      creditCards={financeData.creditCards}
      focusTarget={focusTarget}
      onClearFocus={clearFocusTarget}
      onNavigateToTransactions={navigateToTransactionHistory}
      onUpdate={financeData.loadAllData}
    />
  );
});

const TransactionsRoute = React.memo(() => {
  const financeData = useFinanceData();
  
  return (
    <TransactionHistory
      {...financeData}
      onUpdate={financeData.loadAllData}
      onUpdateCash={financeData.handleUpdateCash}
    />
  );
});

const ThemedPage = ({ Page }) => {
  return <Page />;
};

const ScreenshotRoute = React.memo(() => {
  const financeData = useFinanceData();
  return (
    <ScreenshotImport
      bankAccounts={financeData.bankAccounts}
      creditCards={financeData.creditCards}
      loans={financeData.loans}
      categories={financeData.categories}
      transactions={financeData.transactions}
      onUpdate={financeData.loadAllData}
    />
  );
});

const ActivityRoute = React.memo(() => {
  const { loadAllData } = useFinanceData();
  
  return (
    <ActivityFeed
      onUpdate={loadAllData}
    />
  );
});

const ReportsRoute = React.memo(() => {
  const { categories } = useFinanceData();
  
  return (
    <Reports
      categories={categories}
    />
  );
});

const SettingsRoute = React.memo(() => {
  const { loadAllData, loadCategories, categories } = useFinanceData();
  
  return (
    <Settings
      onUpdate={loadAllData}
      onReloadCategories={loadCategories}
      categories={categories}
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
        <Route path="/more" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={More} /></Suspense>} />
        <Route path="/position" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={Position} /></Suspense>} />
        <Route path="/investments" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={Investments} /></Suspense>} />
        <Route path="/bills" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={Bills} /></Suspense>} />
        <Route path="/tax" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={TaxYears} /></Suspense>} />
        <Route path="/room" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={Room} /></Suspense>} />
        <Route path="/holdings" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={Everything} /></Suspense>} />
        <Route path="/year" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={YearSummary} /></Suspense>} />
        <Route path="/payoff" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={Payoff} /></Suspense>} />
        <Route path="/ahead" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={CashCalendar} /></Suspense>} />
        <Route path="/ask" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={Ask} /></Suspense>} />
        <Route path="/goals" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={Goals} /></Suspense>} />
        <Route path="/credit" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={CreditScore} /></Suspense>} />
        <Route path="/help" element={<Suspense fallback={<LoadingFallback />}><ThemedPage Page={Help} /></Suspense>} />
        <Route path="/screenshot" element={
          <Suspense fallback={<LoadingFallback />}>
            <ScreenshotRoute />
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
