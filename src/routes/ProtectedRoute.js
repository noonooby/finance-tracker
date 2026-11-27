import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Protected Route Wrapper
 * Redirects to login if not authenticated
 */
export function ProtectedRoute({ children }) {
  const { session, initializing } = useAuth();

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2">
        <div className="text-xl text-muted">Initializing...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
