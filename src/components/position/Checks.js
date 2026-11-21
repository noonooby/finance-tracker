import React, { useEffect, useState } from 'react';
import { server, api } from '../../utils/server';
import { resolveSnapshot } from '../../utils/money';
import { formatCurrency } from '../../utils/helpers';
import { showToast } from '../../utils/toast';

// The reconciliation checks: balances you saw that the app's lines don't explain, and the corrections made for them.
export default function Checks({ darkMode, data, onDone }) {
  const [snaps, setSnaps] = useState([]);
  const [open, setOpen] = useState([]);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    server.from('snapshots').select('*').then((r) => setSnaps((r.data || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))));
    api('/api/checks', null, 'GET').then((x) => setOpen(x || [])).catch(() => setOpen([]));
  }, [data]);
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const fixed = snaps.filter((s) => s.status === 'corrected' && s.created_at >= since);
  if (!open.length && !fixed.length) return null;

  const act = async (s, action) => {
    setBusy(s.id);
    try { await resolveSnapshot(s.id, action); await onDone(); } catch (e) { showToast.error(e.message); } finally { setBusy(null); }
  };
  const muted = 'text-muted';
  return (
    <section className={`rounded-2xl border p-4 space-y-3 bg-surface border-line`}>
      <h2 className="font-semibold">Checks</h2>
      {open.map((s) => {
        const now = s.app_now;
        const left = s.left;
        const history = s.status === 'open_history';
        return (
          <div key={s.id} className="text-sm space-y-1">
            <div className="text-amber-700 dark:text-amber-400 font-medium">{s.name} does not add up</div>
            <div className={muted}>On {s.date} the {s.source || 'snapshot'} showed {formatCurrency(s.value)}; {history ? "the app's history gives" : 'the app has'} {now == null ? 'no account' : formatCurrency(now)}
              {left ? `, ${formatCurrency(Math.abs(left))} ${left > 0 ? 'more than' : 'less than'} the app` : ', which now matches'}.
              {left ? (history ? ' Lines are likely missing or extra on or before that day. Scan that period, or check its lines in Transactions.' : ' Add the missing lines (a statement or screenshot), or correct it.') : ''}</div>
            <div className="flex gap-3">
              {(!history || !left) && <button type="button" disabled={busy === s.id || now == null} onClick={() => act(s, 'correct')} className="text-xs font-medium text-accent">{left ? `Correct to ${formatCurrency(s.value)}` : 'Mark as matching'}</button>}
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
