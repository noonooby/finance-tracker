import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFinanceData } from '../hooks/useFinanceData';
import { server } from '../utils/server';
import { position, monthEnd, STALE_DAYS } from '../utils/finance';
import { formatCurrency, formatDate } from '../utils/helpers';
import UpdateValue from './position/UpdateValue';
import Checks from './position/Checks';

const KIND = { bank: 'Bank', cash: 'Cash', card: 'Credit card', card_credit: 'Card credit', gift_card: 'Gift card', loan: 'Loan', mortgage: 'Mortgage', investment: 'Investment', asset: 'Property' };

// The figure as stored (signed), so a correction starts from the real balance.
function storedValue(line, d) {
  const find = (list) => (list.find((x) => String(x.id) === String(line.id)) || {}).balance;
  if (line.kind === 'bank' || line.kind === 'cash') return Number(find(d.bankAccounts)) || 0;
  if (['card', 'card_credit', 'gift_card'].includes(line.kind)) return Number(find(d.creditCards)) || 0;
  if (line.kind === 'loan' || line.kind === 'mortgage') return Number(find(d.loans)) || 0;
  return Number(find(line.kind === 'investment' ? d.investments : d.assets)) || 0;
}

// Net worth history from the daily balance points the server keeps.
function history(points, giftIds) {
  const days = [...new Set(points.map((p) => p.date))].sort();
  const last = {};
  return days.map((day) => {
    points.filter((p) => p.date === day).forEach((p) => { last[`${p.account_table}:${p.account_id}`] = p; });
    const net = Object.values(last).reduce((s, p) => s + (p.account_table === 'loans' || (p.account_table === 'credit_cards' && !giftIds.has(String(p.account_id))) ? -p.value : p.value), 0);
    return { day, net: Math.round(net * 100) / 100 };
  });
}

function Sparkline({ data }) {
  if (data.length < 2) return null;
  const xs = data.map((d) => d.net), min = Math.min(...xs), max = Math.max(...xs), span = max - min || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 300},${60 - ((d.net - min) / span) * 56 - 2}`).join(' ');
  return (
    <svg viewBox="0 0 300 60" className="w-full h-16" role="img" aria-label={`Net worth from ${formatCurrency(xs[0])} to ${formatCurrency(xs[xs.length - 1])}`}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600 dark:text-blue-400" />
    </svg>
  );
}

export default function Position({ darkMode }) {
  const d = useFinanceData();
  const [schedules, setSchedules] = useState([]);
  const [points, setPoints] = useState([]);
  useEffect(() => {
    server.from('income_schedules').select('*').then((r) => setSchedules(r.data || []));
    server.from('balance_points').select('*').then((r) => setPoints(r.data || []));
  }, [d.bankAccounts, d.loans, d.creditCards, d.investments, d.assets]);

  const p = useMemo(() => position({ bankAccounts: d.bankAccounts, creditCards: d.creditCards, loans: d.loans, investments: d.investments, assets: d.assets }), [d]);
  const m = useMemo(() => monthEnd({ liquid: p.liquid, incomeSchedules: schedules, loans: d.loans, creditCards: d.creditCards }), [p.liquid, schedules, d.loans, d.creditCards]);
  const hist = useMemo(() => history(points, new Set(d.creditCards.filter((c) => c.is_gift_card).map((c) => String(c.id)))), [points, d.creditCards]);
  const accounts = { bankAccounts: d.bankAccounts, creditCards: d.creditCards, loans: d.loans, investments: d.investments };

  const card = `rounded-2xl border p-4 bg-surface border-line`;
  const muted = 'text-muted';
  const Line = ({ x }) => (
    <li className="py-2 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{x.name}</div>
        <div className={`text-xs ${x.stale ? 'text-amber-600 dark:text-amber-400' : muted}`}>{KIND[x.kind]} · {x.asOf ? `as of ${x.label}` : 'never updated'}{x.stale ? ' · out of date' : ''}</div>
      </div>
      <div className="text-right">
        <div className="font-semibold tabular-nums">{formatCurrency(x.value)}</div>
        <UpdateValue line={x} signed={storedValue(x, d)} accounts={accounts} onDone={d.loadAllData} darkMode={darkMode} />
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Where you stand</h1>
      <section className={card}>
        <div className={`text-sm ${muted}`}>Net worth today</div>
        <div className={`text-3xl font-bold tabular-nums ${p.netWorth < 0 ? 'text-red-600' : ''}`}>{formatCurrency(p.netWorth)}</div>
        <div className={`text-sm mt-1 ${muted}`}>You have {formatCurrency(p.totalHave)} and owe {formatCurrency(p.totalOwe)}{p.mortgage ? `, of which ${formatCurrency(p.mortgage)} is the mortgage` : ''}.</div>
        <Sparkline data={hist} />
        <div className={`mt-2 text-sm ${p.upToDate ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {p.upToDate ? 'Every figure was updated in the last ' + STALE_DAYS + ' days.' : `${p.stale.length} figure${p.stale.length > 1 ? 's are' : ' is'} more than ${STALE_DAYS} days old or never updated. Tap Update next to each one.`}
        </div>
      </section>

      <Checks darkMode={darkMode} data={d} onDone={d.loadAllData} />

      <section className={card}>
        <h2 className="font-semibold">To the end of the month ({formatDate(m.end)})</h2>
        <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
          <dt className={muted}>Spendable now (bank and cash)</dt><dd className="text-right tabular-nums">{formatCurrency(m.now)}</dd>
          <dt className={muted}>Pay coming in</dt><dd className="text-right tabular-nums text-green-600">+{formatCurrency(m.coming)}</dd>
          <dt className={muted}>Loan and card payments due</dt><dd className="text-right tabular-nums text-red-600">-{formatCurrency(m.going)}</dd>
          <dt className="font-semibold">Left at month end</dt><dd className={`text-right font-semibold tabular-nums ${m.atEnd < 0 ? 'text-red-600' : ''}`}>{formatCurrency(m.atEnd)}</dd>
        </dl>
      </section>

      <section className={card}>
        <h2 className="font-semibold">What you have</h2>
        <ul className={`divide-y divide-line`}>{p.have.map((x) => <Line key={x.kind + x.id} x={x} />)}</ul>
        <Link to="/investments" className="text-sm font-medium text-blue-600 dark:text-blue-400">Add an investment or property</Link>
      </section>

      <section className={card}>
        <h2 className="font-semibold">What you owe</h2>
        {p.owe.length ? <ul className={`divide-y divide-line`}>{p.owe.map((x) => <Line key={x.kind + x.id} x={x} />)}</ul> : <p className={`text-sm ${muted}`}>Nothing owed.</p>}
        {p.mortgage > 0 && <p className={`text-sm mt-2 ${muted}`}>Debt without the mortgage: {formatCurrency(p.debtExcludingMortgage)}</p>}
      </section>
      <p className={`text-xs ${muted}`}>See <Link to="/help#position" className="underline">Help</Link> for how this is worked out.</p>
    </div>
  );
}
