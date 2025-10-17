import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';

// Context Providers
import { AuthProvider, FinanceDataProvider, ThemeProvider, UIProvider } from './contexts';

// Custom Hooks
import { useAuth } from './hooks/useAuth';
import { useFinanceData } from './hooks/useFinanceData';

// Routes
import { AppRoutes } from './routes';

/**
 * App Initializer - Loads data when authenticated
 */
function AppInitializer({ children }) {
  const { session, initializing } = useAuth();
  const { loadDataProgressively, loadLatestActivities } = useFinanceData();

  // Load data when session becomes available
  useEffect(() => {
    if (session && !initializing) {
      loadDataProgressively();
    }
  }, [session, initializing, loadDataProgressively]);

  // Load latest activities after initial data loads
  useEffect(() => {
    if (session) {
      loadLatestActivities();
    }
  }, [session, loadLatestActivities]);

  return children;
}

/**
 * Main App Component
 * Sets up context providers and routing
 */
export default function FinanceTracker() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <FinanceDataProvider>
            <UIProvider>
              <AppInitializer>
                <AppRoutes />
              </AppInitializer>
            </UIProvider>
          </FinanceDataProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
