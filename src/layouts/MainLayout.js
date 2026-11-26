import React, { useEffect, useRef, useState } from 'react';
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
  const { isMigrating, dataLoading, loadError, loadAllData, offlineAt } = useFinanceData();
  // Back online after showing the saved copy: load the real figures again.
  useEffect(() => {
    if (!offlineAt) return undefined;
    const back = () => loadAllData();
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [offlineAt, loadAllData]);
  const { darkMode, toggleDarkMode } = useTheme();
  const { openAddTransaction } = useUI();
  const location = useLocation();
  const navigate = useNavigate();
  const iconBtn = 'p-2 rounded-xl text-muted hover:bg-surface-2 hover:text-fg';
  // The add button steps aside while you scroll down or type, so it never sits on top of what you are reading or
  // filling in. It comes back when you scroll up, reach the top, or stop typing.
  const scroller = useRef(null);
  const [away, setAway] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    let last = el.scrollTop;
    const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
    const onScroll = () => {
      const y = el.scrollTop, bottom = y + el.clientHeight >= el.scrollHeight - 24;
      if (typing() || bottom) setAway(true);
      else if (y < 40 || y < last - 6) setAway(false);
      else if (y > last + 6) setAway(true);
      last = y;
    };
    const onFocus = () => setAway(typing() || (el.scrollTop > 40 && el.scrollTop + el.clientHeight >= el.scrollHeight - 24));
    el.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onFocus);
    return () => { el.removeEventListener('scroll', onScroll); document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onFocus); };
  }, []);
  useEffect(() => { setAway(false); if (scroller.current) scroller.current.scrollTop = 0; }, [location.pathname]);

  return (
    <div className="app-shell flex flex-col bg-background text-fg">
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
          <div key={location.pathname} className="page-enter p-4 pb-44 max-w-3xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

      {location.pathname !== '/screenshot' && <button
        type="button"
        onClick={openAddTransaction}
        className={`fab ${away ? 'away' : ''} press fixed right-4 w-14 h-14 bg-accent text-accent-contrast rounded-2xl shadow-md shadow-accent/20 hover:opacity-90 flex items-center justify-center z-20`}
        style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))', touchAction: 'manipulation' }}
        aria-label="Add a transaction"
      >
        <Plus size={28} />
      </button>}

      <BottomNavigation darkMode={darkMode} />
    </div>
  );
}
