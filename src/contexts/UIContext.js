import React, { createContext, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export const UIContext = createContext(null);

export function UIProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [focusTarget, setFocusTarget] = useState(null);
  const [adding, setAdding] = useState(null);

  // Get current view from URL path
  const currentView = location.pathname.replace('/', '') || 'dashboard';

  const handleNavigate = useCallback(({ view, focus } = {}) => {
    if (view) {
      navigate(`/${view}`);
    }
    if (focus) {
      setFocusTarget({
        ...focus,
        view: focus.view ?? view ?? null,
        timestamp: Date.now()
      });
    }
  }, [navigate]);

  const clearFocusTarget = useCallback(() => {
    setFocusTarget(null);
  }, []);

  const handleViewChange = useCallback((newView) => {
    navigate(`/${newView}`);
  }, [navigate]);

  const navigateToTransactionHistory = useCallback((filterConfig = {}) => {
    navigate('/transactions');
    if (Object.keys(filterConfig).length > 0) {
      sessionStorage.setItem('transactionFilters', JSON.stringify(filterConfig));
    }
  }, [navigate]);

  // preset: { kind, source, to, amount } when a card or a loan opens the form for itself.
  const openAdd = useCallback((preset) => setAdding({ preset: preset && typeof preset === 'object' && !preset.nativeEvent ? preset : null }), []);
  const closeAdd = useCallback(() => setAdding(null), []);

  const value = {
    currentView,
    focusTarget,
    adding,
    setCurrentView: handleViewChange, // Alias for compatibility
    setFocusTarget,
    handleNavigate,
    clearFocusTarget,
    handleViewChange,
    navigateToTransactionHistory,
    openAdd,
    closeAdd,
  };

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}
