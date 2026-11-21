import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, List, Camera, Building2, Menu } from 'lucide-react';

// Five tabs that fit a phone; everything else is on the More page.
const TABS = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/transactions', icon: List, label: 'Transactions' },
  { path: '/screenshot', icon: Camera, label: 'Scan' },
  { path: '/bank-accounts', icon: Building2, label: 'Accounts' },
  { path: '/more', icon: Menu, label: 'More', also: ['/cards', '/loans', '/income', '/activity', '/reports', '/settings', '/help'] },
];

export default function BottomNavigation({ darkMode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isActive = (t) => (t.path === '/' ? pathname === '/' || pathname === '/dashboard' : pathname.startsWith(t.path) || (t.also || []).some((p) => pathname.startsWith(p)));

  return (
    <nav
      aria-label="Main"
      className={`fixed bottom-0 inset-x-0 z-30 border-t backdrop-blur ${darkMode ? 'bg-gray-900/90 border-gray-800' : 'bg-white/90 border-gray-200'}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', touchAction: 'manipulation' }}
    >
      <div className="grid grid-cols-5 max-w-3xl mx-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = isActive(t);
          return (
            <button
              key={t.path}
              type="button"
              onClick={() => navigate(t.path)}
              aria-current={active ? 'page' : undefined}
              className={`tab flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? 'text-blue-600 dark:text-blue-400' : darkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              <span className={`tab-icon px-4 py-1 rounded-full ${active ? (darkMode ? 'bg-blue-500/20' : 'bg-blue-50') : ''}`}>
                <Icon size={20} />
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
