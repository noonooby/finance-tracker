import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, TrendingUp, DollarSign, Activity, BarChart3, Settings, HelpCircle, LogOut, ChevronRight, ExternalLink, Users, FileText, Scale, PiggyBank } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { OTHER_APPS } from '../utils/apps';

const APP_ICONS = { split: Users, resume: FileText };

export default function More({ darkMode }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const card = `rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`;
  const row = `row w-full flex items-center gap-3 px-4 py-3 text-left ${darkMode ? 'hover:bg-gray-700/60' : 'hover:bg-gray-50'}`;
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const divide = darkMode ? 'divide-gray-700' : 'divide-gray-100';

  const Section = ({ title, children }) => (
    <section className="space-y-2">
      <h2 className={`text-xs font-semibold uppercase tracking-wide px-1 ${muted}`}>{title}</h2>
      <div className={`${card} divide-y ${divide}`}>{children}</div>
    </section>
  );
  const Item = ({ icon: Icon, label, hint, to }) => (
    <button type="button" className={row} onClick={() => navigate(to)}>
      <Icon size={20} className="text-blue-600 dark:text-blue-400 shrink-0" />
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        {hint && <span className={`block text-xs ${muted}`}>{hint}</span>}
      </span>
      <ChevronRight size={18} className={muted} />
    </button>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">More</h1>

      <Section title="Money">
        <Item icon={Scale} label="Where you stand" hint="Net worth today, what is out of date, and the month ahead" to="/position" />
        <Item icon={PiggyBank} label="Investments and property" hint="TFSA, RRSP, home: values and contributions" to="/investments" />
        <Item icon={CreditCard} label="Cards" hint="Credit cards and gift cards" to="/cards" />
        <Item icon={TrendingUp} label="Loans" hint="What you owe and when it is due" to="/loans" />
        <Item icon={DollarSign} label="Income" hint="Pay and other money coming in, one-off or on a schedule" to="/income" />
      </Section>

      <Section title="Look back">
        <Item icon={Activity} label="Activity" hint="Everything you changed, with undo" to="/activity" />
        <Item icon={BarChart3} label="Reports" hint="Spending by category, month and payment method" to="/reports" />
      </Section>

      <Section title="App">
        <Item icon={Settings} label="Settings" hint="Categories, alerts, backup and restore" to="/settings" />
        <Item icon={HelpCircle} label="Help" hint="How the app works, step by step" to="/help" />
        <button type="button" className={row} onClick={signOut}>
          <LogOut size={20} className="text-red-600 shrink-0" />
          <span className="flex-1">
            <span className="block font-medium text-red-600">Sign out</span>
            {user && user.email && <span className={`block text-xs ${muted}`}>Signed in as {user.email}</span>}
          </span>
        </button>
      </Section>

      <Section title="Your other apps">
        {OTHER_APPS.map((a) => {
          const Icon = APP_ICONS[a.id] || ExternalLink;
          return (
            <a key={a.id} href={a.url} className={row} target="_blank" rel="noopener noreferrer">
              <Icon size={20} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="flex-1">
                <span className="block font-medium">{a.name}</span>
                <span className={`block text-xs ${muted}`}>{a.what}</span>
              </span>
              <ExternalLink size={16} className={muted} />
            </a>
          );
        })}
      </Section>
    </div>
  );
}
