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

// An app left open (or kept on the home screen) can be behind the server. When it is, a bar at the top says so;
// one tap loads the new version. Pictures waiting on Scan are kept on the device and are still there afterwards.
const mine = (() => { const el = document.querySelector('script[src*="/static/js/main."]'); return el ? (el.getAttribute('src').match(/main\.[\w.]+\.js/) || [])[0] : ''; })();
let told = false;
const checkBuild = async () => {
  if (told || !mine || document.visibilityState !== 'visible') return;
  try {
    const c = await fetch('/api/config', { cache: 'no-store' }).then((r) => r.json());
    if (!c.build || c.build === mine) return;
    told = true;
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.textContent = 'A newer version is ready. Tap here to load it.';
    bar.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:1000;padding:calc(env(safe-area-inset-top) + 12px) 16px 12px;background:#1d4ed8;color:#fff;font:600 16px system-ui,sans-serif;border:0;text-align:center');
    bar.onclick = () => window.location.reload();
    document.body.appendChild(bar);
  } catch { /* no connection: nothing to say */ }
};
document.addEventListener('visibilitychange', checkBuild);
setInterval(checkBuild, 60000);

// Opening without a connection and payment reminders (public/sw.js).
registerWorker();
