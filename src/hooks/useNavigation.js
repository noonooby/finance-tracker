import { useCallback } from 'react';
import { useUI } from './useUI';

/**
 * Custom hook for navigation-specific operations
 * Provides convenient navigation methods built on top of useUI
 * @returns {Object} Navigation methods
 */
export function useNavigation() {
  const { 
    currentView,
    handleNavigate, 
    handleViewChange,
    navigateToTransactionHistory,
  } = useUI();

  const navigateTo = useCallback((view, focus = null) => {
    handleNavigate({ view, focus });
  }, [handleNavigate]);

  const navigateWithFocus = useCallback((view, entityType, entityId) => {
    handleNavigate({
      view,
      focus: {
        type: entityType,
        id: entityId,
        view,
      }
    });
  }, [handleNavigate]);

  const goToDashboard = useCallback(() => {
    handleViewChange('dashboard');
  }, [handleViewChange]);

  const goToTransactions = useCallback((filters = {}) => {
    navigateToTransactionHistory(filters);
  }, [navigateToTransactionHistory]);

  const goToCards = useCallback(() => {
    handleViewChange('cards');
  }, [handleViewChange]);

  const goToLoans = useCallback(() => {
    handleViewChange('loans');
  }, [handleViewChange]);

  const goToBankAccounts = useCallback(() => {
    handleViewChange('bank-accounts');
  }, [handleViewChange]);

  const goToIncome = useCallback(() => {
    handleViewChange('income');
  }, [handleViewChange]);

  const goToReserved = useCallback(() => {
    handleViewChange('reserved');
  }, [handleViewChange]);

  const goToActivity = useCallback(() => {
    handleViewChange('activity');
  }, [handleViewChange]);

  const goToSettings = useCallback(() => {
    handleViewChange('settings');
  }, [handleViewChange]);

  const goToReports = useCallback(() => {
    handleViewChange('reports');
  }, [handleViewChange]);

  return {
    currentView,
    navigateTo,
    navigateWithFocus,
    goToDashboard,
    goToTransactions,
    goToCards,
    goToLoans,
    goToBankAccounts,
    goToIncome,
    goToReserved,
    goToActivity,
    goToSettings,
    goToReports,
  };
}
