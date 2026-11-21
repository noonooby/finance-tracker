import React, { createContext, useState, useEffect, useCallback } from 'react';
import { server } from '../utils/server';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // Session check on mount
  useEffect(() => {
    server.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = server.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await server.auth.signOut();
    setSession(null);
  }, []);

  const value = {
    session,
    initializing,
    signOut,
    user: session?.user || null,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
