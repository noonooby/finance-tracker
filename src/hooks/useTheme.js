import { useContext } from 'react';
import { ThemeContext } from '../contexts/ThemeContext';

/**
 * Custom hook to access theme and settings context
 * @returns {Object} Theme state and methods
 * @property {boolean} darkMode - Whether dark mode is enabled
 * @property {boolean} showCashInDashboard - Whether to show cash in dashboard
 * @property {Object} alertSettings - Alert notification settings
 * @property {Function} toggleDarkMode - Toggle dark mode on/off
 * @property {Function} updateAlertSettings - Update alert settings
 * @property {Function} toggleCashDisplay - Toggle cash display in dashboard
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  
  return context;
}
