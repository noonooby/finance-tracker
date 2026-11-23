import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Camera, AlertTriangle, CheckCircle2, Repeat, Hand, Check } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { api } from '../utils/server';
import { position, monthEndFor, monthlyCost, upcoming, billDates } from '../utils/finance';
import { goalsProgress, goalsThisMonth, freeAtMonthEnd } from '../utils/plans';
import { server } from '../utils/server';
import { budgetMonth, monthOf, findRecurring } from '../utils/spending';
import { formatCurrency, formatDate, parseDay } from '../utils/helpers';
import { Card, Section, Stat, Badge, Button } from './shared/ui';

// Home: the one place to see where you stand, what is due, what debt costs, and anything that does not add up.
// Everything here is worked out by utils/finance.js from the balances you gave and the lines recorded since.
const short = (d) => { const x = parseDay(d); return x ? x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''; };

function Row({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="row press w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
      {children}
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const d = useFinanceData();
  const schedules = d.incomeSchedules;
  const [checks, setChecks] = useState([]);
  useEffect(() => {
    if (d.dataLoading) return;
    api('/api/checks', null, 'GET').then((x) => setChecks(x || [])).catch(() => setChecks([]));
  }, [d.dataLoading, d.transactions]);

  const today = useMemo(() => new Date(), []);
  const [goals, setGoals] = useState([]);
  useEffect(() => { server.from('goals').select('*').then((r) => setGoals(r.data || [])).catch(() => {}); }, []);
  const p = useMemo(() => position({ bankAccounts: d.bankAccounts, creditCards: d.creditCards, loans: d.loans, investments: d.investments, assets: d.assets }, today), [d, today]);
  const m = useMemo(() => monthEndFor(d, p.liquid, today), [d, p.liquid, today]);
  const cost = useMemo(() => monthlyCost({ creditCards: d.creditCards, loans: d.loans, bankAccounts: d.bankAccounts }, today), [d.creditCards, d.loans, d.bankAccounts, today]);
  const due = useMemo(() => upcoming({ creditCards: d.creditCards, loans: d.loans, bankAccounts: d.bankAccounts, bills: d.bills, transactions: d.transactions }, today, 30), [d.creditCards, d.loans, d.bankAccounts, d.bills, d.transactions, today]);
  const budgets = useMemo(() => budgetMonth(d.transactions, d.budgets, d.categories, monthOf(today), today), [d.transactions, d.budgets, d.categories, today]);
  // Free at month end: the month end, less what budgets still allow and what this month's goals ask for.
  const free = useMemo(() => {
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).toLocaleDateString('en-CA');
    const unpaidBills = billDates(d.bills, d.transactions, today, last).filter((x) => !x.paid).map((x) => ({ category_id: x.bill.category_id, amount: x.bill.amount }));
    const goalNeed = goalsThisMonth(goalsProgress(goals, { bankAccounts: d.bankAccounts, investments: d.investments }, today));
    return freeAtMonthEnd({ atEnd: m.atEnd, budgets, unpaidBills, goalNeed });
  }, [d.bills, d.transactions, d.bankAccounts, d.investments, goals, budgets, m.atEnd, today]);
  const found = useMemo(() => findRecurring(d.transactions, d.bills, today), [d.transactions, d.bills, today]);
  const nextPay = useMemo(() => schedules.filter((s) => s.is_active !== false && s.next_date).sort((a, b) => String(a.next_date).localeCompare(String(b.next_date)))[0], [schedules]);
  const recent = useMemo(() => [...(d.transactions || [])].filter((t) => t.status !== 'undone' && t.status !== 'deleted')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 5), [d.transactions]);
  const cards = (d.creditCards || []).filter((c) => !c.is_gift_card);
  const limit = cards.reduce((s, c) => s + (Number(c.credit_limit) || 0), 0);
  const owedOnCards = cards.reduce((s, c) => s + Math.max(0, Number(c.balance) || 0), 0);
  const youPay = due.filter((x) => x.amount != null && !x.auto && !x.paid).reduce((s, x) => s + x.amount, 0);

  const isNew = !d.dataLoading && !(d.bankAccounts || []).length && !cards.length && !(d.loans || []).length;
  if (isNew) {
    return (
      <div className="space-y-4">
        <Card className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Welcome</h1>
            <p className="text-sm text-muted mt-1">The quickest start: scan a screenshot of each bank and card app. The app adds the accounts and their balances, and you confirm.</p>
          </div>
          <Button onClick={() => navigate('/screenshot')} className="w-full"><Camera size={18} aria-hidden="true" /> Scan a screenshot</Button>
          <ol className="space-y-3 text-sm">
            {[
              ['1', 'Give today\'s balances', 'A screenshot, or type them on Accounts and Cards. Each becomes a fixed point.', '/bank-accounts', 'Accounts'],
              ['2', 'Add loans, leases and plans', 'Mortgage, car lease, Klarna, Affirm and equal payment plans live under Loans.', '/loans', 'Loans'],
              ['3', 'Fill in the past when you like', 'Statements (PDF) and older screenshots add history without changing today.', '/help#position', 'How it works'],
            ].map(([n, title, hint, to, label]) => (
              <li key={n} className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-accent-soft text-accent text-sm font-semibold grid place-items-center">{n}</span>
                <span className="flex-1"><span className="block font-medium">{title}</span><span className="block text-xs text-muted">{hint}</span></span>
                <button type="button" onClick={() => navigate(to)} className="press shrink-0 text-xs font-medium text-accent px-2 py-1 rounded-lg bg-accent-soft">{label}</button>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card role="link" tabIndex={0} onClick={() => navigate('/position')} onKeyDown={(e) => { if (e.key === 'Enter') navigate('/position'); }} className="press cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted">Net worth today</div>
            <div className={`text-3xl font-bold tabular-nums ${p.netWorth < 0 ? 'text-negative' : ''}`}>{d.dataLoading ? <span className="skeleton inline-block w-40 h-8 rounded-lg" /> : formatCurrency(p.netWorth)}</div>
            <div className="text-xs text-muted mt-1">Have {formatCurrency(p.totalHave)} · Owe {formatCurrency(p.totalOwe)}{p.mortgage ? ` (mortgage ${formatCurrency(p.mortgage)})` : ''}</div>
          </div>
          <ChevronRight size={18} className="text-muted mt-1" aria-hidden="true" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 pt-3 border-t border-line">
          <Stat label="Spendable" value={formatCurrency(p.liquid)} />
          <Stat label="Month end" value={formatCurrency(m.atEnd)} tone={m.atEnd < 0 ? 'negative' : undefined} />
          <Stat label="Debt costs" value={`${formatCurrency(cost.total)}`} sub="a month" tone={cost.total > 0 ? 'warning' : undefined} />
        </div>
        {!d.dataLoading && (free.budgetLeft > 0 || free.goalNeed > 0) && (
          <div className={`text-xs mt-3 ${free.free < 0 ? 'text-negative' : 'text-muted'}`}>
            {free.free >= 0 ? `${formatCurrency(free.free)} free at month end` : `${formatCurrency(-free.free)} short at month end`} after what budgets still allow{free.goalNeed > 0 ? ` and ${formatCurrency(free.goalNeed)} for goals` : ''}.
          </div>
        )}
      </Card>

      {(checks.length > 0 || p.stale.length > 0) ? (
        <Card role="link" tabIndex={0} onClick={() => navigate('/position')} onKeyDown={(e) => { if (e.key === 'Enter') navigate('/position'); }} className="press cursor-pointer flex items-start gap-3 border-warning/40">
          <AlertTriangle size={18} className="text-warning mt-0.5 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-sm">
            {checks.length > 0 && <span className="block font-medium">{checks.length} {checks.length === 1 ? 'balance does' : 'balances do'} not add up</span>}
            {p.stale.length > 0 && <span className="block text-muted">{p.stale.length} {p.stale.length === 1 ? 'figure is' : 'figures are'} more than 35 days old</span>}
            <span className="block text-xs text-muted mt-0.5">Open to see where and by how much.</span>
          </span>
          <ChevronRight size={18} className="text-muted" aria-hidden="true" />
        </Card>
      ) : (
        <div className="flex items-center gap-2 px-1 text-xs text-positive"><CheckCircle2 size={14} aria-hidden="true" /> Every balance is current and adds up.</div>
      )}

      <Section title="Next 30 days" action={youPay > 0 ? <span className="text-xs text-muted">You pay {formatCurrency(youPay)}</span> : null}>
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          {due.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nothing due.</p>}
          {due.slice(0, 8).map((x, i) => (
            <Row key={i} onClick={() => navigate(x.kind === 'bill' ? '/bills' : x.kind === 'card' || x.kind === 'promo_end' ? '/cards' : '/loans')}>
              <span className="w-12 shrink-0 text-xs text-muted tabular-nums">{short(x.date)}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{x.name}</span>
                <span className="block text-xs text-muted truncate">
                  {x.kind === 'bill' ? `Bill${x.from ? ` · ${x.from}` : ''} · ${x.note}` : x.kind === 'promo_end' ? x.note : x.auto ? `Autopay from ${x.from}` : 'You pay'}{x.note && x.kind !== 'promo_end' && x.kind !== 'bill' ? ` · ${x.note}` : ''}
                </span>
              </span>
              {x.amount != null && <span className="text-sm font-semibold tabular-nums">{formatCurrency(x.amount)}</span>}
              {x.paid ? <Check size={14} className="text-positive" aria-label="Recorded" />
                : x.kind !== 'promo_end' && (x.auto ? <Repeat size={14} className="text-muted" aria-label="Automatic" /> : <Hand size={14} className="text-warning" aria-label="You pay" />)}
            </Row>
          ))}
          {nextPay && (
            <Row onClick={() => navigate('/income')}>
              <span className="w-12 shrink-0 text-xs text-muted tabular-nums">{short(nextPay.next_date)}</span>
              <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{nextPay.name || nextPay.source || 'Pay'}</span><span className="block text-xs text-muted">Coming in</span></span>
              <span className="text-sm font-semibold tabular-nums text-positive">+{formatCurrency(nextPay.amount)}</span>
            </Row>
          )}
        </Card>
      </Section>

      {found.length > 0 && (
        <Card role="link" tabIndex={0} onClick={() => navigate('/bills')} onKeyDown={(e) => { if (e.key === 'Enter') navigate('/bills'); }} className="press cursor-pointer flex items-start gap-3">
          <Repeat size={18} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-sm">
            <span className="block font-medium">{found.length} {found.length === 1 ? 'payment looks' : 'payments look'} like a repeating bill</span>
            <span className="block text-xs text-muted truncate">{found.slice(0, 3).map((b) => b.name).join(', ')}{found.length > 3 ? ' and more' : ''}. Track them to see them coming and get reminders.</span>
          </span>
          <ChevronRight size={18} className="text-muted" aria-hidden="true" />
        </Card>
      )}

      {budgets.length > 0 && (
        <Section title="Budgets this month" action={<button type="button" onClick={() => navigate('/settings#budgets')} className="text-xs font-medium text-accent">Change</button>}>
          <Card padded={false} className="divide-y divide-line">
            {budgets.slice(0, 6).map((b) => (
              <div key={b.category_id} className="px-4 py-2.5 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{b.name}</span>
                  <span className={`tabular-nums ${b.over ? 'text-negative font-medium' : ''}`}>{formatCurrency(b.spent)} <span className="text-xs text-muted">of {formatCurrency(b.limit)}</span></span>
                </div>
                <div className="relative h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className={`absolute inset-y-0 left-0 rounded-full ${b.over ? 'bg-negative' : b.ahead ? 'bg-warning' : 'bg-positive'}`} style={{ width: `${Math.min(100, b.pct * 100)}%` }} />
                  <div className="absolute inset-y-0 w-px bg-fg/40" style={{ left: `${b.pace * 100}%` }} aria-hidden="true" />
                </div>
                <div className="text-xs text-muted">{b.over ? `${formatCurrency(-b.left)} over` : `${formatCurrency(b.left)} left`}{!b.over && b.ahead ? ' · spending faster than the month' : ''}</div>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {cost.items.length > 0 && (
        <Section title="What debt costs you" action={<span className="text-xs text-muted">about {formatCurrency(cost.total)} a month</span>}>
          <Card padded={false} className="divide-y divide-line">
            {cost.items.slice(0, 5).map((c, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 min-w-0"><span className="block text-sm truncate">{c.name}</span><span className="block text-xs text-muted truncate">{c.why}</span></span>
                <span className="text-sm tabular-nums">{formatCurrency(c.amount)}</span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Accounts and debts">
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          <Row onClick={() => navigate('/bank-accounts')}>
            <span className="flex-1 text-sm">Bank and cash</span>
            <span className="text-sm font-semibold tabular-nums">{formatCurrency(p.liquid)}</span>
            <ChevronRight size={16} className="text-muted" aria-hidden="true" />
          </Row>
          {cards.length > 0 && (
            <Row onClick={() => navigate('/cards')}>
              <span className="flex-1 text-sm">Cards{limit > 0 && <span className="text-xs text-muted"> · {Math.round((owedOnCards / limit) * 100)}% of limits used</span>}</span>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(owedOnCards)}</span>
              <ChevronRight size={16} className="text-muted" aria-hidden="true" />
            </Row>
          )}
          {(d.loans || []).some((l) => Number(l.balance) > 0) && (
            <Row onClick={() => navigate('/loans')}>
              <span className="flex-1 text-sm">Loans, leases and plans</span>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency((d.loans || []).filter((l) => !l.on_card_id).reduce((s, l) => s + Math.max(0, Number(l.balance) || 0), 0))}</span>
              <ChevronRight size={16} className="text-muted" aria-hidden="true" />
            </Row>
          )}
          {(p.investments > 0 || (d.assets || []).length > 0) && (
            <Row onClick={() => navigate('/investments')}>
              <span className="flex-1 text-sm">Investments and property</span>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(p.totalHave - p.liquid - (p.have.filter((x) => x.kind === 'gift_card' || x.kind === 'card_credit').reduce((s, x) => s + x.value, 0)))}</span>
              <ChevronRight size={16} className="text-muted" aria-hidden="true" />
            </Row>
          )}
        </Card>
      </Section>

      <Section title="Latest" action={<button type="button" onClick={() => navigate('/transactions')} className="text-xs font-medium text-accent">All transactions</button>}>
        <Card padded={false} className="divide-y divide-line">
          {recent.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nothing recorded yet.</p>}
          {recent.map((t) => {
            // Money in for you: income, a refund, or a correction that raised an account (for a card or loan, "up" means owing more).
            const owing = t.payment_method === 'credit_card' || t.payment_method === 'loan';
            const inflow = t.type === 'income' || t.type === 'refund' || (t.type === 'adjustment' && (t.direction === 'up') !== owing);
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">{t.description || t.category_name || t.type}</span>
                  <span className="block text-xs text-muted truncate">{formatDate(t.date)}{t.payment_method_name ? ` · ${t.payment_method_name}` : ''}{t.history_only ? ' · history' : ''}</span>
                </span>
                {t.pending && <Badge tone="warning">Pending</Badge>}
                <span className={`text-sm tabular-nums ${inflow ? 'text-positive' : ''}`}>{inflow ? '+' : ''}{formatCurrency(t.amount)}</span>
              </div>
            );
          })}
        </Card>
      </Section>
    </div>
  );
}
