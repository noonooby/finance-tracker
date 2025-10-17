import { useContext } from 'react';
import { UIContext } from '../contexts/UIContext';

/**
 * Custom hook to access UI state context
 * @returns {Object} UI state and navigation methods
 * @property {string} currentView - Current active view/route
 * @property {Object|null} focusTarget - Target element to focus on
 * @property {boolean} showAddTransactionModal - Whether add transaction modal is shown
 * @property {Function} handleNavigate - Navigate to a view with optional focus
 * @property {Function} clearFocusTarget - Clear the focus target
 * @property {Function} handleViewChange - Change current view
 * @property {Function} navigateToTransactionHistory - Navigate to transaction history with filters
 * @property {Function} openAddTransaction - Open add transaction modal
 * @property {Function} closeAddTransaction - Close add transaction modal
 */
export function useUI() {
  const context = useContext(UIContext);
  
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  
  return context;
}
