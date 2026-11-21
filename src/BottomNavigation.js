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

export default function BottomNavigation() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isActive = (t) => (t.path === '/' ? pathname === '/' || pathname === '/dashboard' : pathname.startsWith(t.path) || (t.also || []).some((p) => pathname.startsWith(p)));

  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 inset-x-0 z-30 border-t border-line/70 bg-background/85 backdrop-blur-md"
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
              className={`tab relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium ${active ? 'text-accent' : 'text-muted hover:text-fg'}`}
            >
              <span className={`tab-icon px-4 py-1 rounded-full ${active ? 'bg-accent-soft' : ''}`}>
                <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
              </span>
              {t.label}
              <span
                aria-hidden="true"
                className={`tab-dot absolute top-0 h-0.5 w-6 rounded-full bg-accent ${active ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'}`}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
