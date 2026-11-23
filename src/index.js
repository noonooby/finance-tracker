import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { registerWorker } from './utils/reminders';
import { api } from './utils/server';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// A fault on the screen is sent to the server's log, a few per visit at most, so it can be fixed.
let sent = 0;
const report = (message, stack) => {
  if (sent >= 5 || !message || !localStorage.getItem('finance_token')) return;
  sent += 1;
  api('/api/client-error', { path: window.location.pathname, message: String(message).slice(0, 300), stack: String(stack || '').slice(0, 800) }).catch(() => {});
};
window.addEventListener('error', (e) => report(e.message, e.error && e.error.stack));
window.addEventListener('unhandledrejection', (e) => report(`Unhandled: ${(e.reason && e.reason.message) || e.reason}`, e.reason && e.reason.stack));

// Opening without a connection and payment reminders (public/sw.js).
registerWorker();
