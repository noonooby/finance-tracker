import React, { createContext, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export const UIContext = createContext(null);

export function UIProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [focusTarget, setFocusTarget] = useState(null);
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);

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

  const openAddTransaction = useCallback(() => {
    const currentPath = location.pathname;
    if (currentPath !== '/transactions') {
      navigate('/transactions');
    }
    setShowAddTransactionModal(true);
  }, [navigate, location.pathname]);

  const closeAddTransaction = useCallback(() => {
    setShowAddTransactionModal(false);
  }, []);

  const value = {
    currentView,
    focusTarget,
    showAddTransactionModal,
    setCurrentView: handleViewChange, // Alias for compatibility
    setFocusTarget,
    setShowAddTransactionModal,
    handleNavigate,
    clearFocusTarget,
    handleViewChange,
    navigateToTransactionHistory,
    openAddTransaction,
    closeAddTransaction,
  };

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}
