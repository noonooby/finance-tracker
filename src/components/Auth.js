import React, { useEffect, useState } from 'react';
import { server } from '../utils/server';

export default function Auth() {
  const [config, setConfig] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    server.auth.config().then(setConfig);
    try {
      const err = sessionStorage.getItem('finance_err');
      if (err) { setMessage(err); sessionStorage.removeItem('finance_err'); }
    } catch {}
  }, []);

  const devSignIn = async () => {
    try { await server.auth.devSignIn(); } catch (e) { setMessage(e.message); }
  };

  const muted = 'text-muted';
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background text-fg">
      <div className="page-enter max-w-sm w-full"><div className="space-y-6 p-8 bg-surface border border-line rounded-2xl">
        <div className="flex flex-col items-center">
          <img src="/icon.svg" alt="" width="48" height="48" className="rounded-2xl mb-4" />
          <h1 className="text-2xl font-bold tracking-tight text-center">Finance Tracker</h1>
          <p className={`mt-2 text-center ${muted}`}>Sign in with your Google account to see your money.</p>
        </div>

        {message && <div role="alert" className="text-sm text-negative text-center bg-negative/10 rounded-xl px-3 py-2">{message}</div>}

        {config === null ? (
          <div className="skeleton h-11" role="status" aria-label="Loading sign-in options" />
        ) : config.google ? (
          <button
            type="button"
            onClick={() => server.auth.signInWithGoogle()}
            className="press w-full flex items-center justify-center gap-3 border border-line bg-surface text-fg py-2.5 px-4 rounded-xl hover:bg-surface-2 font-medium"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
            </svg>
            Sign in with Google
          </button>
        ) : (
          <p className={`text-center text-sm ${muted}`}>Google sign-in is not set up on this server yet.</p>
        )}

        {config && config.dev && (
          <button type="button" onClick={devSignIn} className="press w-full bg-surface-2 text-fg border border-line py-2.5 px-4 rounded-xl hover:bg-line/60 font-medium">
            Sign in as the test user
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
