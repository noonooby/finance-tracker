import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Moon, Sun, Plus, HelpCircle } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { useTheme } from '../hooks/useTheme';
import { useUI } from '../hooks/useUI';
import BottomNavigation from '../BottomNavigation';

/**
 * Main layout: header, the current page, the add button and the tab bar.
 */
export function MainLayout() {
  const { isMigrating, dataLoading, loadError, loadAllData } = useFinanceData();
  const { darkMode, toggleDarkMode } = useTheme();
  const { openAddTransaction } = useUI();
  const location = useLocation();
  const navigate = useNavigate();
  const iconBtn = `p-2 rounded-full ${darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`;

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <header className={`${darkMode ? 'bg-gray-900/90 border-gray-800' : 'bg-white/90 border-gray-200'} backdrop-blur border-b px-4 py-3 flex-shrink-0 z-10`}
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex justify-between items-center max-w-3xl mx-auto">
          <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 text-left">
            <img src="/icon.svg" alt="" width="28" height="28" className="rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">Finance</span>
          </button>
          <div className="flex items-center gap-1">
            {(isMigrating || dataLoading) && <span className="text-xs text-gray-500 mr-2" role="status">Loading</span>}
            <button type="button" onClick={() => navigate('/help')} className={iconBtn} aria-label="Help">
              <HelpCircle size={22} />
            </button>
            <button type="button" onClick={toggleDarkMode} className={iconBtn} aria-label={darkMode ? 'Use light mode' : 'Use dark mode'}>
              {darkMode ? <Sun size={22} /> : <Moon size={22} />}
            </button>
          </div>
        </div>
      </header>

      {loadError && (
        <div role="alert" className="bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-200 text-sm px-4 py-2 flex items-center justify-between gap-3">
          <span>Could not load your data. Check your connection.</span>
          <button type="button" onClick={() => loadAllData()} className="font-medium underline">Try again</button>
        </div>
      )}

      <main className="flex-1 min-h-0 relative">
        <div className="absolute inset-0 overflow-y-auto overscroll-contain">
          <div key={location.pathname} className="page-enter p-4 pb-36 max-w-3xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

      <button
        type="button"
        onClick={openAddTransaction}
        className="press fixed right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center z-20"
        style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))', touchAction: 'manipulation' }}
        aria-label="Add a transaction"
      >
        <Plus size={28} />
      </button>

      <BottomNavigation darkMode={darkMode} />
    </div>
  );
}
