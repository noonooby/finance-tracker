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
  const iconBtn = 'p-2 rounded-xl text-muted hover:bg-surface-2 hover:text-fg';

  return (
    <div className="h-screen flex flex-col bg-background text-fg">
      <header className="bg-background/85 backdrop-blur-md border-b border-line/70 px-4 py-2.5 flex-shrink-0 z-10"
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
        <div className="flex justify-between items-center max-w-3xl mx-auto">
          <button type="button" onClick={() => navigate('/')} className="press flex items-center gap-2 text-left rounded-xl" aria-label="Go to Home">
            <span aria-hidden="true" className="grid place-items-center w-7 h-7 rounded-lg bg-accent text-accent-contrast transition-colors">
              <svg viewBox="0 0 512 512" width="18" height="18"><path d="M128 340l84-84 64 56 112-128" fill="none" stroke="currentColor" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round"/><circle cx="388" cy="184" r="30" fill="currentColor"/></svg>
            </span>
            <span className="text-lg font-semibold tracking-tight">Finance</span>
          </button>
          <div className="flex items-center gap-1">
            {(isMigrating || dataLoading) && <span className="text-xs text-muted mr-2 flex items-center gap-1.5" role="status"><span className="spinner" aria-hidden="true" />Loading</span>}
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
        <div role="alert" className="bg-negative/10 text-negative text-sm px-4 py-2 flex items-center justify-between gap-3">
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
        className="press fixed right-4 w-14 h-14 bg-accent text-accent-contrast rounded-2xl shadow-md shadow-accent/20 hover:opacity-90 flex items-center justify-center z-20"
        style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))', touchAction: 'manipulation' }}
        aria-label="Add a transaction"
      >
        <Plus size={28} />
      </button>

      <BottomNavigation darkMode={darkMode} />
    </div>
  );
}
