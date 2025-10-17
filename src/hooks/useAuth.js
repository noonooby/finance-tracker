import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

/**
 * Custom hook to access authentication context
 * @returns {Object} Authentication state and methods
 * @property {Object|null} session - Current user session
 * @property {Object|null} user - Current user object
 * @property {boolean} initializing - Whether auth is still initializing
 * @property {Function} signOut - Function to sign out user
 */
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}
