import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinanceData } from '../hooks/useFinanceData';
import { server, api } from '../utils/server';
import { room, movements, ROOM_KINDS } from '../utils/room';
import { formatCurrency, localDate, parseDay } from '../utils/helpers';
import { showToast } from '../utils/toast';
import { Card, Section, Button } from './shared/ui';

// Room left in the TFSA, RRSP and FHSA: one figure from the tax agency for each, then the sums follow what is
// recorded going in and out. Nothing here is advice; it is arithmetic on the published rules.
const NAMES = { TFSA: 'TFSA', RRSP: 'RRSP', FHSA: 'FHSA (first home)' };
const WHERE = {
  TFSA: 'Your CRA account shows your TFSA room as of January 1. It can miss what your bank reported late, so check it against your own records.',
  RRSP: 'Your notice of assessment shows your RRSP deduction limit for the year.',
  FHSA: 'Your CRA account or notice of assessment shows your FHSA participation room.',
};
const day = (d) => { const x = parseDay(d); return x ? x.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : d; };
const cached = () => { try { return JSON.parse(localStorage.getItem('tax_facts') || 'null'); } catch { return null; } };

function Line({ label, value }) {
  return <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-muted">{label}</span><span className="tabular-nums text-right">{value}</span></div>;
}

function Kind({ kind, r, stated, onSave }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ room: '', as_of: '', used: '' });
  const [busy, setBusy] = useState(false);
  const start = () => { setForm({ room: stated && stated.room != null ? String(stated.room) : '', as_of: (stated && stated.as_of) || `${localDate().slice(0, 4)}-01-01`, used: stated && stated.used != null ? String(stated.used) : '' }); setEdit(true); };
  const save = async (e) => {
    e.preventDefault();
    if (form.room === '' || !Number.isFinite(Number(form.room))) return showToast.error('Enter the room shown.');
    if (!form.as_of || form.as_of > localDate()) return showToast.error('Enter the day the figure is for. It cannot be after today.');
    setBusy(true);
    try { await onSave(kind, { room: Number(form.room), as_of: form.as_of, ...(kind === 'FHSA' && form.used !== '' ? { used: Number(form.used) } : {}) }); setEdit(false); } finally { setBusy(false); }
  };
  const input = 'mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-fg';
  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{NAMES[kind]}</h2>
        {!edit && <button type="button" className="text-xs font-medium text-accent" onClick={start}>{r.known ? 'Change the figure' : 'Enter it'}</button>}
      </div>
      {r.known ? (
        <>
          <div>
            <div className={`text-3xl font-bold tabular-nums ${r.over ? 'text-negative' : ''}`}>{formatCurrency(Math.max(0, r.room))}</div>
            <div className="text-xs text-muted">room left today</div>
          </div>
          {r.room < 0 && (
            <p className="text-sm text-negative">
              {formatCurrency(-r.room)} more went in than the room allows.
              {r.over ? ` ${formatCurrency(r.over)} of it is taxed at 1% a month, about ${formatCurrency(r.cost_month)} each month it stays in.` : ' The first $2,000 over is not taxed.'}
            </p>
          )}
          <div className="space-y-1">
            <Line label={`Room on ${day(r.as_of)}`} value={formatCurrency(r.stated)} />
            <Line label={kind === 'RRSP' ? 'Put in since then' : 'Put in this year'} value={formatCurrency(r.put_in)} />
            {kind === 'TFSA' && r.taken_out > 0 && <Line label="Taken out this year" value={`${formatCurrency(r.taken_out)}, comes back January 1`} />}
            {kind === 'FHSA' && r.lifetime_left != null && <Line label="Left of the $40,000 lifetime amount" value={formatCurrency(r.lifetime_left)} />}
            {kind === 'TFSA' && r.next && <Line label={`Added on ${day(r.next.date)}`} value={r.next.adds == null ? `not announced yet${r.next.back ? `, plus ${formatCurrency(r.next.back)} back` : ''}` : formatCurrency(r.next.adds)} />}
            {kind === 'FHSA' && r.next && <Line label={`Room on ${day(r.next.date)} if nothing more goes in`} value={formatCurrency(Math.max(0, r.next.room))} />}
            {kind === 'RRSP' && <Line label={`Last day to put in for ${localDate().slice(0, 4)}`} value={day(r.deadline)} />}
          </div>
          {r.missing.length > 0 && <p className="text-xs text-warning">The {r.missing.join(' and ')} limit is not announced yet, so it is not counted. It is added here once the tax agency publishes it.</p>}
          {r.stale && <p className="text-xs text-warning">This figure is from {r.as_of.slice(0, 4)}. New RRSP room comes with each notice of assessment: enter the latest one for this year's room.</p>}
          {r.accounts.length === 0 && <p className="text-xs text-muted">No {kind} account is in the app, so nothing is counted as going in. Add the account under Investments.</p>}
        </>
      ) : !edit && (
        <div className="space-y-1">
          <p className="text-sm">Needed: your room on a day.</p>
          <p className="text-xs text-muted">{WHERE[kind]} Add a picture of it, or enter the figure.</p>
        </div>
      )}
      {edit && (
        <form onSubmit={save} className="space-y-3">
          <p className="text-xs text-muted">{WHERE[kind]}</p>
          <label className="block text-sm"><span className="text-muted">Room shown</span>
            <input className={input} type="number" step="0.01" inputMode="decimal" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} autoFocus /></label>
          <label className="block text-sm"><span className="text-muted">The day it is for (January 1 for the figure on your CRA account)</span>
            <input className={input} type="date" max={localDate()} value={form.as_of} onChange={(e) => setForm({ ...form, as_of: e.target.value })} /></label>
          {kind === 'FHSA' && (
            <label className="block text-sm"><span className="text-muted">Put in before that day, in total (optional, for the lifetime amount)</span>
              <input className={input} type="number" step="0.01" inputMode="decimal" value={form.used} onChange={(e) => setForm({ ...form, used: e.target.value })} /></label>
          )}
          <div className="flex gap-2"><Button type="submit" loading={busy}>Save</Button><Button variant="secondary" onClick={() => setEdit(false)}>Cancel</Button></div>
        </form>
      )}
    </Card>
  );
}

export default function Room() {
  const { investments = [], transactions = [] } = useFinanceData();
  const navigate = useNavigate();
  const [facts, setFacts] = useState(cached);
  const [stated, setStated] = useState({});
  const today = localDate();

  const load = useCallback(async () => {
    const { data } = await server.from('settings').select('*').eq('key', 'tax_room').maybeSingle();
    setStated((data && data.value) || {});
  }, []);
  useEffect(() => {
    load().catch(() => {});
    api('/api/tax-facts', undefined, 'GET').then((f) => { setFacts(f); try { localStorage.setItem('tax_facts', JSON.stringify(f)); } catch { /* shown without being kept */ } }).catch(() => {});
  }, [load]);

  const save = async (kind, value) => {
    const next = { ...stated, [kind]: value };
    const { error } = await server.from('settings').upsert({ key: 'tax_room', value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return showToast.error(error.message);
    setStated(next);
  };
  const rows = useMemo(() => (facts ? ROOM_KINDS.map((k) => ({ ...room(k, stated[k], movements(k, investments, transactions), facts, today), accounts: investments.filter((i) => String(i.kind || '').toUpperCase() === k) })) : []), [facts, stated, investments, transactions, today]);
  const year = Number(today.slice(0, 4));
  const link = (href, text) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">{text}</a>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Room left</h1>
        <p className="text-sm text-muted mt-1">How much more can go into each registered account. Give the room the tax agency shows once; what you record going in and out after that is counted for you.</p>
      </div>
      <Button variant="secondary" onClick={() => navigate('/screenshot')}>Add a picture of your CRA account or notice</Button>
      {!facts && <Card><p className="text-sm text-muted">The yearly figures could not be loaded. Open this page once while connected.</p></Card>}
      {rows.map((r) => <Kind key={r.kind} kind={r.kind} r={r} stated={stated[r.kind]} onSave={save} />)}

      {facts && (
        <Section title="The figures used">
          <Card className="space-y-2">
            <Line label={`TFSA limit for ${year}`} value={facts.tfsa[year] != null ? formatCurrency(facts.tfsa[year]) : 'not announced yet'} />
            <Line label={`TFSA limit for ${year + 1}`} value={facts.tfsa[year + 1] != null ? formatCurrency(facts.tfsa[year + 1]) : 'not announced yet'} />
            <Line label={`RRSP limit for ${year}`} value={facts.rrsp[year] != null ? `18% of last year's earned income, up to ${formatCurrency(facts.rrsp[year])}` : 'not announced yet'} />
            {facts.rrsp[year + 1] != null && <Line label={`RRSP limit for ${year + 1}`} value={`up to ${formatCurrency(facts.rrsp[year + 1])}`} />}
            <Line label="FHSA each year" value={`${formatCurrency(facts.fhsa.yearly)}, plus up to ${formatCurrency(facts.fhsa.carry)} unused from the year before`} />
            <Line label="FHSA lifetime" value={formatCurrency(facts.fhsa.lifetime)} />
            <Line label="Tax on putting in too much" value="1% a month on the amount over" />
            <p className="text-xs text-muted pt-1">
              TFSA withdrawals come back as room on January 1 of the next year. An RRSP is only taxed once it is more than $2,000 over its room. FHSA withdrawals do not come back as room.
              {' '}Checked on {day(facts.checked)} against the Canada Revenue Agency: {link(facts.sources.limits, 'yearly limits')}, {link(facts.sources.tfsa, 'TFSA room')}, {link(facts.sources.tfsa_over, 'TFSA over the limit')}, {link(facts.sources.rrsp, 'RRSP room')}, {link(facts.sources.rrsp_over, 'RRSP over the limit')}, {link(facts.sources.fhsa, 'FHSA room')}, {link(facts.sources.fhsa_over, 'FHSA over the limit')}.
              {Object.keys(facts.tfsa_looked_up || {}).map((y) => <span key={y}> The {y} TFSA limit was looked up on {day(facts.tfsa_looked_up[y].checked)}: {link(facts.tfsa_looked_up[y].source, 'source')}.</span>)}
            </p>
            <p className="text-xs text-muted">The tax agency's own record is the one that counts. Money that went in or out without being recorded here is not in these sums.</p>
          </Card>
        </Section>
      )}
    </div>
  );
}
