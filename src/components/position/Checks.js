import React, { useEffect, useState } from 'react';
import { server } from '../../utils/server';
import { resolveSnapshot } from '../../utils/money';
import { formatCurrency } from '../../utils/helpers';
import { showToast } from '../../utils/toast';

// The reconciliation checks: balances you saw that the app's lines don't explain, and the corrections made for them.
export default function Checks({ darkMode, data, onDone }) {
  const [snaps, setSnaps] = useState([]);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    server.from('snapshots').select('*').then((r) => setSnaps((r.data || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))));
  }, [data]);
  const balanceNow = (s) => {
    if (s.account_table === 'settings') return Number(data.cashInHand) || 0;
    const list = { bank_accounts: data.bankAccounts, credit_cards: data.creditCards, loans: data.loans, investments: data.investments, assets: data.assets }[s.account_table] || [];
    const a = list.find((x) => String(x.id) === String(s.account_id));
    return a ? Number(a.balance) || 0 : null;
  };
  const open = snaps.filter((s) => s.status === 'open');
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const fixed = snaps.filter((s) => s.status === 'corrected' && s.created_at >= since);
  if (!open.length && !fixed.length) return null;

  const act = async (s, action) => {
    setBusy(s.id);
    try { await resolveSnapshot(s.id, action); await onDone(); } catch (e) { showToast.error(e.message); } finally { setBusy(null); }
  };
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  return (
    <section className={`rounded-2xl border p-4 space-y-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <h2 className="font-semibold">Checks</h2>
      {open.map((s) => {
        const now = balanceNow(s);
        const left = now == null ? null : Math.round((Number(s.value) - now) * 100) / 100;
        return (
          <div key={s.id} className="text-sm space-y-1">
            <div className="text-amber-700 dark:text-amber-400 font-medium">{s.name} does not add up</div>
            <div className={muted}>On {s.date} the {s.source || 'snapshot'} showed {formatCurrency(s.value)}; the app has {now == null ? 'no account' : formatCurrency(now)}
              {left ? `, ${formatCurrency(Math.abs(left))} ${left > 0 ? 'more than' : 'less than'} the app` : ', which now matches'}. Add the missing lines (a statement or screenshot), or correct it.</div>
            <div className="flex gap-3">
              <button type="button" disabled={busy === s.id || now == null} onClick={() => act(s, 'correct')} className="text-xs font-medium text-blue-600 dark:text-blue-400">{left ? `Correct to ${formatCurrency(s.value)}` : 'Mark as matching'}</button>
              <button type="button" disabled={busy === s.id} onClick={() => act(s, 'dismiss')} className={`text-xs ${muted}`}>Leave it</button>
            </div>
          </div>
        );
      })}
      {fixed.length > 0 && (
        <div className="text-sm">
          <div className="font-medium">Corrections in the last 30 days</div>
          <ul className={`text-xs ${muted} space-y-0.5 mt-1`}>
            {fixed.map((s) => <li key={s.id}>{s.date} · {s.name}: {formatCurrency(Math.abs(s.gap))} {Number(s.gap) > 0 ? 'added' : 'taken off'} to match the {s.source || 'snapshot'}</li>)}
          </ul>
          <p className={`text-xs ${muted} mt-1`}>A correction often means a line is missing. Each one can be undone from Activity.</p>
        </div>
      )}
    </section>
  );
}
