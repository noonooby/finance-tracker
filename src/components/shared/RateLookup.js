import React, { useState } from 'react';
import { api } from '../../utils/server';

const LABELS = {
  purchase_rate: ['Purchase rate', '%'], cash_rate: ['Cash advance rate', '%'], annual_fee: ['Annual fee', '$'],
  overdraft_rate: ['Overdraft rate', '%'], overdraft_monthly_fee: ['Overdraft monthly fee', '$'], overdraft_use_fee: ['Overdraft fee each use', '$'],
  account_monthly_fee: ['Account monthly fee', '$'], rate_low: ['Rate from', '%'], rate_high: ['Rate up to', '%'], setup_fee: ['Setup fee', '$'],
};

// Looks up the product's published rates and fees (only its name is sent). Nothing changes until "Use these".
// onUse(result) fills the form; the person can still type a personal rate over it.
export default function RateLookup({ kind, name, onUse }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const look = async () => {
    setBusy(true); setErr(''); setRes(null);
    try { setRes(await api('/api/lookup-rates', { kind, name })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const figures = res ? Object.entries(LABELS).filter(([k]) => res[k] != null) : [];
  const show = (k, unit) => (unit === '$' ? `$${res[k]}` : `${res[k]}%`);
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted text-xs">Fill in the public rates and fees for this product. Only its name is sent.</span>
        <button type="button" onClick={look} disabled={busy || !String(name || '').trim()} className="press shrink-0 text-xs font-medium text-accent disabled:opacity-50">
          {busy ? 'Looking up...' : 'Look up rates'}
        </button>
      </div>
      {err && <p role="alert" className="text-xs text-negative">{err}</p>}
      {res && !res.found && <p className="text-xs text-warning">Could not find this product for sure. Check the name, or enter the rates from your agreement.</p>}
      {res && res.found && (
        <div className="space-y-1">
          <div className="text-xs text-muted">{res.product}{res.issuer ? `, ${res.issuer}` : ''}, checked {res.checked}</div>
          <dl className="grid grid-cols-2 gap-x-3 text-xs">
            {figures.map(([k, [label, unit]]) => (
              <React.Fragment key={k}><dt className="text-muted">{label}</dt><dd className="text-right tabular-nums">{show(k, unit)}</dd></React.Fragment>
            ))}
          </dl>
          {res.offers_plans && <div className="text-xs text-muted">This card offers equal payment plans; add one under Loans as an equal payment plan inside the card.</div>}
          {res.notes && <div className="text-xs text-muted">{res.notes}</div>}
          <div className="flex items-center justify-between">
            {res.source_url ? <a href={res.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline">Source</a> : <span />}
            <button type="button" onClick={() => onUse(res)} className="press text-xs font-medium text-accent">Use these</button>
          </div>
          <p className="text-xs text-muted">If you have a personal rate, type it over the filled-in value.</p>
        </div>
      )}
    </div>
  );
}
