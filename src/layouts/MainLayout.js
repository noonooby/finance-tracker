import React, { useEffect, useRef } from 'react';
import ConfirmHost from '../components/shared/ConfirmHost';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Moon, Sun, HelpCircle } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { useTheme } from '../hooks/useTheme';
import QuickAdd from '../components/QuickAdd';
import { useUI } from '../hooks/useUI';
import BottomNavigation from '../BottomNavigation';

/**
 * Main layout: header, the current page, the add button and the tab bar.
 */
export function MainLayout() {
  const { isMigrating, dataLoading, loadError, loadAllData, offlineAt } = useFinanceData();
  // Back online after showing the saved copy: load the real figures again.
  useEffect(() => {
    if (!offlineAt) return undefined;
    const back = () => loadAllData();
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [offlineAt, loadAllData]);
  const { darkMode, toggleDarkMode } = useTheme();
  const { adding, openAdd, closeAdd } = useUI();
  const location = useLocation();
  const navigate = useNavigate();
  const iconBtn = 'grid place-items-center w-11 h-11 rounded-full text-muted hover:bg-surface-2 hover:text-fg';
  const scroller = useRef(null);
  // Typing made easy everywhere: a figure field opens the number pad with a decimal point, and tapping a figure
  // selects it so the next key replaces it instead of adding to it.
  useEffect(() => {
    const onFocus = (e) => {
      const el = e.target;
      if (!el || el.tagName !== 'INPUT') return;
      if (el.type === 'number') {
        if (!el.getAttribute('inputmode')) el.setAttribute('inputmode', 'decimal');
        if (el.value && !el.readOnly) { try { el.select(); } catch { /* not selectable */ } }
      }
      if (!el.getAttribute('enterkeyhint') && el.form) el.setAttribute('enterkeyhint', 'done');
      if ((el.type === 'text' || el.type === 'number' || el.type === 'search') && !el.getAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [location.pathname]);

  return (
    <div className="app-shell flex flex-col bg-background text-fg">
      <header className="bg-background/85 backdrop-blur-md px-4 py-2 flex-shrink-0 z-10"
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
        <div className="flex justify-between items-center max-w-3xl mx-auto">
          <button type="button" onClick={() => navigate('/')} className="press flex items-center gap-2 text-left rounded-xl" aria-label="Go to Home">
            <span aria-hidden="true" className="grid place-items-center w-7 h-7 rounded-xl bg-accent text-accent-contrast transition-colors">
              <svg viewBox="0 0 512 512" width="18" height="18"><path d="M128 340l84-84 64 56 112-128" fill="none" stroke="currentColor" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round"/><circle cx="388" cy="184" r="30" fill="currentColor"/></svg>
            </span>
            <span className="text-lg font-semibold tracking-tight">Finance</span>
          </button>
          <div className="flex items-center gap-1">
                        <button type="button" onClick={() => navigate('/help')} className={iconBtn} aria-label="Help">
              <HelpCircle size={22} />
            </button>
            <button type="button" onClick={toggleDarkMode} className={iconBtn} aria-label={darkMode ? 'Use light mode' : 'Use dark mode'}>
              {darkMode ? <Sun size={22} /> : <Moon size={22} />}
            </button>
          </div>
        </div>
      </header>
      <div className={`flex-shrink-0 ${isMigrating || dataLoading ? 'loadbar' : 'h-[3px]'}`} role={isMigrating || dataLoading ? 'status' : undefined} aria-label={isMigrating || dataLoading ? 'Loading' : undefined} />

      {offlineAt && (
        <div role="status" className="bg-warning/10 text-warning text-sm px-4 py-2 flex items-center justify-between gap-3">
          <span>No connection. Showing your figures as saved {new Date(offlineAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Changes need a connection.</span>
          <button type="button" onClick={() => loadAllData()} className="font-medium underline shrink-0">Try again</button>
        </div>
      )}
      {loadError && (
        <div role="alert" className="bg-negative/10 text-negative text-sm px-4 py-2 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button type="button" onClick={() => loadAllData()} className="font-medium underline">Try again</button>
        </div>
      )}

      <main className="flex-1 min-h-0 relative">
        <div ref={scroller} className="page-scroll absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div key={location.pathname} className="page-enter px-4 pt-4 pb-36 max-w-3xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>


      <ConfirmHost />
      {adding && <QuickAdd key={JSON.stringify(adding.preset)} onClose={closeAdd} preset={adding.preset} />}

      <BottomNavigation onAdd={() => (adding ? closeAdd() : openAdd())} adding={!!adding} />
    </div>
  );
}
