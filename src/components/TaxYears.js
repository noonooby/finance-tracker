import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { server, api } from '../utils/server';
import { room, movements, taxNext, TAX_FIELDS } from '../utils/room';
import { formatCurrency, generateId, localDate, parseDay } from '../utils/helpers';
import { showToast } from '../utils/toast';
import { Card, Section, Button, EmptyState } from './shared/ui';

// Your tax years: what each return or notice of assessment said, and what follows from them. Each figure that is
// assumed says where it came from and can be set by you. Sums on the published rules, not advice.
const day = (d) => { const x = parseDay(d); return x ? x.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : d; };
const cached = () => { try { return JSON.parse(localStorage.getItem('tax_facts') || 'null'); } catch { return null; } };
const input = 'mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-fg';
const Line = ({ label, value }) => <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-muted">{label}</span><span className="tabular-nums text-right">{value}</span></div>;

function YearForm({ start, taken, onSave, onCancel }) {
  const [f, setF] = useState(() => ({ year: start.year || '', ...Object.fromEntries(TAX_FIELDS.map(([k]) => [k, start[k] == null ? '' : String(start[k])])) }));
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    const year = Number(f.year);
    if (!Number.isInteger(year) || year < 1990 || year > Number(localDate().slice(0, 4))) return showToast.error('Enter the tax year, for example 2025.');
    if (!start.id && taken.includes(year)) return showToast.error(`${year} is already here. Change it instead.`);
    const row = { year };
    for (const [k] of TAX_FIELDS) { if (f[k] === '') row[k] = null; else if (Number(f[k]) >= 0) row[k] = Math.round(Number(f[k]) * 100) / 100; else return showToast.error('Amounts are zero or more.'); }
    if (row.refund > 0 && row.balance_owing > 0) return showToast.error('A year ends in a refund or a balance owing, not both.');
    setBusy(true);
    try { await onSave(row); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="space-y-3">
      {!start.id && <label className="block text-sm"><span className="text-muted">Tax year</span><input className={input} type="number" inputMode="numeric" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} autoFocus /></label>}
      <div className="grid grid-cols-2 gap-2">
        {TAX_FIELDS.map(([k, label]) => (
          <label key={k} className="block text-sm"><span className="text-muted">{label}</span>
            <input className={input} type="number" step="0.01" min="0" inputMode="decimal" placeholder="Not known" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
        ))}
      </div>
      <div className="flex gap-2"><Button type="submit" loading={busy}>Save</Button><Button variant="secondary" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}

export default function TaxYears() {
  const { investments = [], transactions = [] } = useFinanceData();
  const navigate = useNavigate();
  const [years, setYears] = useState([]);
  const [stated, setStated] = useState({});
  const [assume, setAssume] = useState({});
  const [facts, setFacts] = useState(cached);
  const [editing, setEditing] = useState(null);       // a row id, or 'new'
  const [setting, setSetting] = useState(null);       // the assumptions form: { earned, pa }
  const today = localDate();
  const now = Number(today.slice(0, 4));

  const load = useCallback(async () => {
    const [y, s] = await Promise.all([server.from('tax_years').select('*'), server.from('settings').select('*')]);
    setYears(y.data || []);
    const get = (k) => ((s.data || []).find((r) => r.key === k) || {}).value || {};
    setStated(get('tax_room')); setAssume(get('tax_assume'));
  }, []);
  useEffect(() => {
    load().catch(() => {});
    api('/api/tax-facts', undefined, 'GET').then((f) => { setFacts(f); try { localStorage.setItem('tax_facts', JSON.stringify(f)); } catch { /* shown without being kept */ } }).catch(() => {});
  }, [load]);

  const mine = useMemo(() => assume[now] || {}, [assume, now]);
  const next = useMemo(() => taxNext({ years, rrspNow: facts ? room('RRSP', stated.RRSP, movements('RRSP', investments, transactions), facts, today) : null, facts, today, assume: mine }), [years, stated, investments, transactions, facts, today, mine]);

  const saveYear = async (row) => {
    const was = editing !== 'new' ? years.find((y) => y.id === editing) : null;
    const { error } = was ? await server.from('tax_years').update(row).eq('id', was.id) : await server.from('tax_years').insert({ id: generateId(), ...row, created_at: new Date().toISOString() });
    if (error) return showToast.error(error.message);
    setEditing(null); await load();
  };
  const remove = async (y) => {
    if (!window.confirm(`Remove the ${y.year} tax year from the app?`)) return;
    const { error } = await server.from('tax_years').delete().eq('id', y.id);
    if (error) return showToast.error(error.message);
    await load();
  };
  const saveAssume = async (e) => {
    e.preventDefault();
    const value = { ...assume, [now]: { earned: setting.earned === '' ? null : Number(setting.earned), pa: setting.pa === '' ? null : Number(setting.pa) } };
    const { error } = await server.from('settings').upsert({ key: 'tax_assume', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return showToast.error(error.message);
    setAssume(value); setSetting(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tax years</h1>
        <p className="text-sm text-muted mt-1">What each return or notice of assessment said, and what follows from them. Add a picture of a return or a notice and its year is filled in here.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => navigate('/screenshot')}>Add a picture of a return or notice</Button>
        <Button variant="secondary" onClick={() => navigate('/room')}>Room left</Button>
      </div>

      <Section title="What comes next">
        <Card className="space-y-3">
          {next.due.map((d) => <Line key={d.year} label={`${d.year} return${d.late ? ', not on record here' : ''}`} value={`${d.late ? 'was due' : 'due'} ${day(d.date)}`} />)}
          {next.missing.length > 0 && <p className="text-xs text-warning">Not on record: {next.missing.join(', ')}. Add the return or notice for {next.missing.length === 1 ? 'that year' : 'those years'} to fill the gap.</p>}
          {next.rrsp ? (
            <div className="space-y-1 pt-1 border-t border-line">
              <div className="text-sm font-medium pt-2">RRSP room for {next.rrsp.year}, estimated</div>
              {next.rrsp.estimate != null && <div className="text-2xl font-bold tabular-nums">{formatCurrency(Math.max(0, next.rrsp.estimate))}</div>}
              {next.rrsp.base != null ? <Line label="Room left today" value={formatCurrency(next.rrsp.base)} /> : <p className="text-xs text-muted">Your RRSP room today is not on record, so only what is added is shown. Enter it under Room left.</p>}
              <Line label={`Added for ${next.rrsp.year}`} value={formatCurrency(next.rrsp.adds)} />
              <p className="text-xs text-muted">Assumed: earned income of {formatCurrency(next.rrsp.earned)} this year ({next.rrsp.earned_from}) and a pension adjustment of {formatCurrency(next.rrsp.pa)} ({next.rrsp.pa_from}). 18% of earned income, up to {formatCurrency(next.rrsp.cap)}, less the pension adjustment. The notice of assessment gives the real figure.</p>
              {!setting && <button type="button" className="text-xs font-medium text-accent" onClick={() => setSetting({ earned: mine.earned == null ? '' : String(mine.earned), pa: mine.pa == null ? '' : String(mine.pa) })}>Set these yourself</button>}
            </div>
          ) : (
            <p className="text-xs text-muted pt-1 border-t border-line">Next year's RRSP room can be estimated once a year with your income is on record, or you set your earned income.{!setting && <> <button type="button" className="font-medium text-accent" onClick={() => setSetting({ earned: '', pa: '' })}>Set it</button></>}</p>
          )}
          {setting && (
            <form onSubmit={saveAssume} className="space-y-2">
              <label className="block text-sm"><span className="text-muted">Earned income for {now} (leave empty to use your last return)</span>
                <input className={input} type="number" step="0.01" min="0" inputMode="decimal" value={setting.earned} onChange={(e) => setSetting({ ...setting, earned: e.target.value })} /></label>
              <label className="block text-sm"><span className="text-muted">Pension adjustment for {now} (leave empty to use your last return)</span>
                <input className={input} type="number" step="0.01" min="0" inputMode="decimal" value={setting.pa} onChange={(e) => setSetting({ ...setting, pa: e.target.value })} /></label>
              <div className="flex gap-2"><Button type="submit">Save</Button><Button variant="secondary" onClick={() => setSetting(null)}>Cancel</Button></div>
            </form>
          )}
          {next.results.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-line">
              <div className="text-sm font-medium pt-2">How your last returns ended</div>
              {next.results.map((r) => <Line key={r.year} label={r.year} value={r.amount >= 0 ? `${formatCurrency(r.amount)} refund` : `${formatCurrency(-r.amount)} owing`} />)}
            </div>
          )}
        </Card>
      </Section>

      <Section title="Years on record" action={editing !== 'new' && <button type="button" className="text-xs font-medium text-accent" onClick={() => setEditing('new')}>Add a year</button>}>
        {editing === 'new' && <Card><YearForm start={{}} taken={years.map((y) => Number(y.year))} onSave={saveYear} onCancel={() => setEditing(null)} /></Card>}
        {next.years.length === 0 && editing !== 'new' && <Card><EmptyState icon={FileText} title="No years yet" text="Add a picture of a return or a notice of assessment, or add a year by hand." /></Card>}
        {next.years.map((y) => (
          <Card key={y.id} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">{y.year}</h2>
              {editing !== y.id && <span className="flex gap-3"><button type="button" className="text-xs font-medium text-accent" onClick={() => setEditing(y.id)}>Change</button><button type="button" className="text-xs text-muted" onClick={() => remove(y)}>Remove</button></span>}
            </div>
            {editing === y.id
              ? <YearForm start={y} taken={[]} onSave={saveYear} onCancel={() => setEditing(null)} />
              : <div className="space-y-1">{TAX_FIELDS.filter(([k]) => y[k] != null && y[k] !== '').map(([k, label]) => <Line key={k} label={label} value={formatCurrency(y[k])} />)}</div>}
          </Card>
        ))}
      </Section>
    </div>
  );
}
