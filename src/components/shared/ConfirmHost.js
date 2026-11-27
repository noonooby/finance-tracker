import React, { useEffect, useState } from 'react';
import { onAsk } from '../../utils/confirm';
import { Button } from './ui';

// Draws the question asked through utils/confirm. Escape or a tap outside answers no.
export default function ConfirmHost() {
  const [q, setQ] = useState(null);
  useEffect(() => onAsk(setQ), []);
  useEffect(() => {
    if (!q) return undefined;
    const esc = (e) => { if (e.key === 'Escape') { q.resolve(false); setQ(null); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [q]);
  if (!q) return null;
  const answer = (v) => { q.resolve(v); setQ(null); };
  return (
    <div className="sheet-back fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => answer(false)}>
      <div role="alertdialog" aria-modal="true" aria-label="Please confirm" className="sheet-panel w-full max-w-sm rounded-3xl border border-line bg-surface p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-base leading-relaxed whitespace-pre-line">{q.message}</p>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => answer(false)}>{q.cancel}</Button>
          <Button onClick={() => answer(true)} autoFocus>{q.ok}</Button>
        </div>
      </div>
    </div>
  );
}
