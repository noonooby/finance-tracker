import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, List, Plus, Building2, Menu } from 'lucide-react';

// Four places and, in the middle, the one button that adds anything: a picture, a line by hand, or a sentence.
// Everything else is on the More page.
const TABS = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/transactions', icon: List, label: 'Activity' },
  null,
  { path: '/bank-accounts', icon: Building2, label: 'Accounts' },
  { path: '/more', icon: Menu, label: 'More', also: ['/cards', '/loans', '/income', '/activity', '/reports', '/settings', '/help', '/bills', '/investments', '/goals', '/position', '/tax', '/room', '/payoff', '/ahead', '/ask', '/credit', '/year', '/holdings'] },
];

export default function BottomNavigation({ onAdd, adding }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isActive = (t) => (t.path === '/' ? pathname === '/' || pathname === '/dashboard' : pathname.startsWith(t.path) || (t.also || []).some((p) => pathname.startsWith(p)));

  return (
    <nav aria-label="Main" className="fixed bottom-0 inset-x-0 z-30 px-3 pointer-events-none"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))', touchAction: 'manipulation' }}>
      <div className="navbar pointer-events-auto grid grid-cols-5 items-center max-w-md mx-auto rounded-[1.75rem] px-1.5">
        {TABS.map((t) => {
          if (!t) return (
            <div key="add" className="flex justify-center">
              <button type="button" onClick={onAdd} aria-label="Add" aria-expanded={adding ? 'true' : 'false'}
                className="addbtn press -mt-6 w-[3.75rem] h-[3.75rem] rounded-full grid place-items-center">
                <Plus size={28} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          );
          const Icon = t.icon;
          const active = isActive(t);
          return (
            <button key={t.path} type="button" onClick={() => navigate(t.path)} aria-current={active ? 'page' : undefined}
              className={`tab relative flex flex-col items-center justify-center gap-0.5 h-16 text-[0.6875rem] font-semibold ${active ? 'text-accent' : 'text-muted hover:text-fg'}`}>
              <span className={`tab-icon grid place-items-center w-12 h-8 rounded-full ${active ? 'bg-accent-soft' : ''}`}>
                <Icon size={21} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
