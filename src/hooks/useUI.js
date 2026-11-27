import { useContext } from 'react';
import { UIContext } from '../contexts/UIContext';

/**
 * Custom hook to access UI state context
 * @returns {Object} UI state and navigation methods
 * @property {string} currentView - Current active view/route
 * @property {Object|null} focusTarget - Target element to focus on
 * @property {Object|null} adding - The add form when open: { preset }
 * @property {Function} handleNavigate - Navigate to a view with optional focus
 * @property {Function} clearFocusTarget - Clear the focus target
 * @property {Function} handleViewChange - Change current view
 * @property {Function} navigateToTransactionHistory - Navigate to transaction history with filters
 * @property {Function} openAdd - Open the add form, optionally with { kind, source, to, amount }
 * @property {Function} closeAdd - Close the add form
 */
export function useUI() {
  const context = useContext(UIContext);
  
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  
  return context;
}
