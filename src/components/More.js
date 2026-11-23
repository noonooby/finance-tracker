import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, TrendingUp, DollarSign, Activity, BarChart3, Settings, HelpCircle, LogOut, ChevronRight, ExternalLink, FileText, Scale, PiggyBank, Repeat, Target, Gauge, MessageCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { OTHER_APPS } from '../utils/apps';

const APP_ICONS = { resume: FileText };

export default function More() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, setTheme, themes } = useTheme();
  const card = 'rounded-2xl border border-line bg-surface overflow-hidden';
  const row = 'row w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2';
  const muted = 'text-muted';
  const divide = 'divide-line';

  const Section = ({ title, children }) => (
    <section className="space-y-2">
      <h2 className={`text-xs font-semibold uppercase tracking-wide px-1 ${muted}`}>{title}</h2>
      <div className={`${card} divide-y ${divide}`}>{children}</div>
    </section>
  );
  const Item = ({ icon: Icon, label, hint, to }) => (
    <button type="button" className={row} onClick={() => navigate(to)}>
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent-soft text-accent shrink-0"><Icon size={18} aria-hidden="true" /></span>
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        {hint && <span className={`block text-xs ${muted}`}>{hint}</span>}
      </span>
      <ChevronRight size={18} className={muted} />
    </button>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">More</h1>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide px-1 text-muted">Colour</h2>
        <div className={`${card} p-4 flex flex-wrap gap-3`} role="group" aria-label="App colour">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              className="swatch"
              style={{ background: t.color }}
              aria-label={`Use ${t.name} colour`}
              aria-pressed={theme === t.id}
              title={t.name}
              onClick={() => setTheme(t.id)}
            />
          ))}
        </div>
      </section>

      <Section title="Ask">
        <Item icon={MessageCircle} label="Ask or tell" hint="Ask about your money, or type what you spent and check it before it is saved" to="/ask" />
      </Section>

      <Section title="Money">
        <Item icon={Scale} label="Where you stand" hint="Net worth today, what is out of date, and the month ahead" to="/position" />
        <Item icon={PiggyBank} label="Investments and property" hint="TFSA, RRSP, home: values and contributions" to="/investments" />
        <Item icon={CreditCard} label="Cards" hint="Credit cards and gift cards" to="/cards" />
        <Item icon={TrendingUp} label="Loans" hint="What you owe and when it is due" to="/loans" />
        <Item icon={Repeat} label="Bills" hint="Payments that repeat: found in your history or added by you" to="/bills" />
        <Item icon={Target} label="Savings goals" hint="What you are saving for and how far along it is" to="/goals" />
        <Item icon={Gauge} label="Credit score" hint="The score from each bureau, when you check it" to="/credit" />
        <Item icon={DollarSign} label="Income" hint="Pay and other money coming in, one-off or on a schedule" to="/income" />
      </Section>

      <Section title="Look back">
        <Item icon={Activity} label="Activity" hint="Everything you changed, with undo" to="/activity" />
        <Item icon={BarChart3} label="Reports" hint="Spending by category, month and payment method" to="/reports" />
      </Section>

      <Section title="App">
        <Item icon={Settings} label="Settings" hint="Reminders, budgets, categories, backup and restore" to="/settings" />
        <Item icon={HelpCircle} label="Help" hint="How the app works, step by step" to="/help" />
        <button type="button" className={row} onClick={signOut}>
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-negative/10 text-negative shrink-0"><LogOut size={18} aria-hidden="true" /></span>
          <span className="flex-1">
            <span className="block font-medium text-negative">Sign out</span>
            {user && user.email && <span className={`block text-xs ${muted}`}>Signed in as {user.email}</span>}
          </span>
        </button>
      </Section>

      <Section title="Your other apps">
        {OTHER_APPS.map((a) => {
          const Icon = APP_ICONS[a.id] || ExternalLink;
          return (
            <a key={a.id} href={a.url} className={row} target="_blank" rel="noopener noreferrer">
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent-soft text-accent shrink-0"><Icon size={18} aria-hidden="true" /></span>
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
