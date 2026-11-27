import React, { useEffect, useState } from 'react';
import { server } from '../../utils/server';
import { formatCurrency } from '../../utils/helpers';
import { Issues } from '../shared/Issues';

// Out-of-date figures have their own Update button on each line below, so they are not repeated here.
const notStale = (i) => i.kind !== 'stale';

// The reconciliation checks: balances you saw that the app's lines don't explain, and the corrections made for them.
export default function Checks({ data, onDone }) {
  const [snaps, setSnaps] = useState([]);
  useEffect(() => {
    server.from('snapshots').select('*').then((r) => setSnaps((r.data || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))));
  }, [data]);
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const fixed = snaps.filter((s) => s.status === 'corrected' && s.created_at >= since);
  const muted = 'text-muted';
  return (
    <>
      <Issues only={notStale} wrap={(body) => (
        <section className="rounded-2xl border bg-surface border-line overflow-hidden">
          <h2 className="font-semibold px-4 pt-4">To sort out</h2>
          {body}
        </section>
      )} />
      {fixed.length > 0 && (
        <section className="rounded-2xl border p-4 bg-surface border-line text-sm">
          <div className="font-medium">Corrections in the last 30 days</div>
          <ul className={`text-xs ${muted} space-y-0.5 mt-1 stagger`}>
            {fixed.map((s) => <li key={s.id}>{s.date} · {s.name}: {formatCurrency(Math.abs(s.gap))} {Number(s.gap) > 0 ? 'added' : 'taken off'} to match the {s.source || 'snapshot'}</li>)}
          </ul>
          <p className={`text-xs ${muted} mt-1`}>A correction often means a line is missing. Each one can be undone from Activity.</p>
        </section>
      )}
    </>
  );
}
