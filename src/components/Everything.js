import React, { useEffect, useMemo, useState } from 'react';
import { Landmark } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { api, server } from '../utils/server';
import { formatCurrency } from '../utils/helpers';
import { showToast } from '../utils/toast';
import { Card, Section, EmptyState } from './shared/ui';

// Every account, card, loan and investment in one list, grouped by where it is held, with the published details
// of each product (its rates and fees) and where those came from.
const FIGURES = [
  ['purchase_rate', 'Purchase rate', '%'], ['cash_rate', 'Cash advance rate', '%'], ['annual_fee', 'Yearly fee', '$'],
  ['account_monthly_fee', 'Monthly fee', '$'], ['overdraft_rate', 'Overdraft rate', '%'], ['overdraft_monthly_fee', 'Overdraft monthly fee', '$'], ['overdraft_use_fee', 'Overdraft fee each use', '$'],
  ['rate_low', 'Rate from', '%'], ['rate_high', 'Rate up to', '%'], ['setup_fee', 'Setup fee', '$'],
  ['account_yearly_fee', 'Yearly account fee', '$'], ['trade_fee', 'Fee for each trade', '$'], ['management_fee', 'Management fee', '%'],
];
// The figures that belong to each kind of account, and the table each kind lives in.
const FOR = { credit_cards: ['purchase_rate', 'cash_rate', 'annual_fee'], bank_accounts: ['account_monthly_fee', 'overdraft_rate', 'overdraft_monthly_fee', 'overdraft_use_fee'], loans: ['rate_low', 'rate_high', 'setup_fee'], investments: ['account_yearly_fee', 'trade_fee', 'management_fee'] };
const LOOKUPS = [
  ['prices', 'Market prices for what your investments hold', 'Only the ticker is sent. The last price is kept, so a value never drops to nothing.'],
  ['details', 'Published rates and fees of each account, card and loan', 'Only the product\'s name is sent, once. What comes back is kept here and is not fetched again unless you ask.'],
  ['tax_limits', 'Each new year\'s tax limits', 'Nothing about you is sent. Taken only from the Canada Revenue Agency\'s pages.'],
];
const input = 'mt-1 field';

// Change where an account is held, the name used to look it up, its published figures, or stop it being looked up.
function Change({ table, r, held, onDone, onCancel }) {
  const info = r.info && r.info.found ? r.info : {};
  const [f, setF] = useState({ where: held === 'Not stated' ? '' : held, lookup_name: r.lookup_name || '', off: !!r.info_off, ...Object.fromEntries(FOR[table].map((k) => [k, info[k] == null ? '' : String(info[k])])) });
  const [busy, setBusy] = useState(false);
  const run = async (again) => {
    setBusy(true);
    try {
      const figures = Object.fromEntries(FOR[table].map((k) => [k, f[k] === '' ? null : Number(f[k])]));
      if (Object.values(figures).some((v) => v != null && !(v >= 0))) throw new Error('Figures are zero or more.');
      const changed = FOR[table].some((k) => (info[k] == null ? null : Number(info[k])) !== figures[k]);
      const values = { [table === 'loans' ? 'provider' : 'institution']: f.where.trim().slice(0, 60), lookup_name: f.lookup_name.trim().slice(0, 80), info_off: f.off };
      // Figures you typed are kept as yours: they are marked so a later lookup leaves them alone.
      if (changed && !again) values.info = { ...info, ...figures, found: true, edited: true, checked: new Date().toLocaleDateString('en-CA'), source_url: null, for: r.info ? r.info.for : '' };
      const { error } = await server.from(table).update(values).eq('id', r.id);
      if (error) throw new Error(error.message);
      if (again) await api('/api/details', { table, id: r.id });
      await onDone();
    } catch (e) { showToast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 pt-1">
      <label className="block text-xs text-muted">Held at<input className={input} value={f.where} placeholder="The bank or provider" onChange={(e) => setF({ ...f, where: e.target.value })} /></label>
      <label className="block text-xs text-muted">Name to look up (the product's name as the bank gives it)<input className={input} value={f.lookup_name} placeholder={r.name} onChange={(e) => setF({ ...f, lookup_name: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2">
        {FIGURES.filter(([k]) => FOR[table].includes(k)).map(([k, label, unit]) => (
          <label key={k} className="block text-xs text-muted">{label} ({unit})<input className={input} type="number" step="0.01" min="0" inputMode="decimal" placeholder="Not known" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="w-4 h-4" checked={f.off} onChange={(e) => setF({ ...f, off: e.target.checked })} />Do not look this one up</label>
      <div className="flex flex-wrap gap-3 text-sm">
        <button type="button" disabled={busy} className="font-medium text-accent disabled:opacity-50" onClick={() => run(false)}>Save</button>
        <button type="button" disabled={busy || f.off} className="font-medium text-accent disabled:opacity-50" onClick={() => run(true)}>{busy ? 'Working...' : 'Look it up again'}</button>
        <button type="button" className="text-muted" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const figure = (v, unit) => (unit === '$' ? formatCurrency(v) : `${v}%`);
const BANKS = /\b(td|rbc|royal bank|bmo|bank of montreal|scotiabank|scotia|cibc|national bank|desjardins|tangerine|simplii|eq bank|wealthsimple|questrade|amex|american express|capital one|pc financial|rogers|mbna|canadian tire|triangle|neo|koho|hsbc|laurentian|manulife|sun life|fidelity|vanguard|interactive brokers|coinbase|shakepay|newton|affirm|klarna|paypal)\b/i;
// Where an account is held: what was entered, else the provider found for the product, else a bank named in its name.
const place = (r, kind) => {
  const own = String(r.institution || r.provider || (r.info && r.info.found && r.info.issuer) || '').trim();
  if (own) return own;
  const m = String(r.name || '').match(BANKS);
  return m ? m[0].replace(/\b\w/g, (c) => c.toUpperCase()) : '';
};

export default function Everything() {
  const d = useFinanceData();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [prefs, setPrefs] = useState({});
  const [refused, setRefused] = useState(false);
  useEffect(() => { api('/api/lookup-state', undefined, 'GET').then((r) => setRefused(!!(r && r.search_refused))).catch(() => {}); }, []);
  useEffect(() => { server.from('settings').select('*').eq('key', 'lookups').maybeSingle().then(({ data }) => setPrefs((data && data.value) || {})).catch(() => {}); }, []);
  const setPref = async (k, on) => {
    const value = { ...prefs, [k]: on };
    const { error } = await server.from('settings').upsert({ key: 'lookups', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return showToast.error(error.message);
    setPrefs(value);
  };
  const groups = useMemo(() => {
    const all = [
      ...(d.bankAccounts || []).map((r) => ({ r, table: 'bank_accounts', kind: r.account_type === 'cash' ? 'Cash' : r.account_type === 'savings' ? 'Savings account' : 'Bank account', owed: false })),
      ...(d.creditCards || []).map((r) => ({ r, table: 'credit_cards', kind: r.is_gift_card ? 'Gift card' : 'Credit card', owed: !r.is_gift_card })),
      ...(d.loans || []).map((r) => ({ r, table: 'loans', kind: r.on_card_id ? 'Plan inside a card' : 'Loan', owed: true })),
      ...(d.investments || []).map((r) => ({ r, table: 'investments', kind: r.kind && r.kind !== 'Other' ? r.kind : 'Investment', owed: false })),
      ...(d.assets || []).map((r) => ({ r, kind: r.kind || 'Property', owed: false })),
    ].map((x) => ({ ...x, where: x.kind === 'Cash' ? 'Cash' : (d.assets || []).includes(x.r) ? 'Property' : place(x.r, x.kind) || 'Not stated' }));
    const by = new Map();
    for (const x of all) { const k = x.where.toLowerCase(); if (!by.has(k)) by.set(k, { where: x.where, items: [] }); by.get(k).items.push(x); }
    return [...by.values()].sort((a, b) => (a.where === 'Not stated') - (b.where === 'Not stated') || a.where.localeCompare(b.where));
  }, [d.bankAccounts, d.creditCards, d.loans, d.investments, d.assets]);
  const waiting = prefs.details !== false && groups.some((g) => g.items.some((x) => !x.r.info && !x.r.info_off && !['Cash', 'Gift card'].includes(x.kind) && x.where !== 'Property'));

  const fetchNow = async () => {
    setBusy(true);
    try { const r = await api('/api/details', {}); await d.loadAllData(); showToast.success(r.done ? 'Details looked up.' : 'Nothing more to look up right now.'); }
    catch (e) { showToast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Everything you hold</h1>
        <p className="text-sm text-muted mt-1">Each account, card, loan and investment, by where it is held. The published rates and fees of each product are looked up from its name once, when it is added, and kept. Tap Change on any of them to set where it is held, the name to look up, or the figures themselves.</p>
      </div>
      {groups.length === 0 && <Card><EmptyState icon={Landmark} title="Nothing yet" text="Accounts and cards show here once they are added." /></Card>}
      {groups.map((g) => (
        <Section key={g.where} title={g.where} action={<span className="text-xs text-muted">{g.items.length}</span>}>
          <Card padded={false} className="divide-y divide-line">
            {g.items.map(({ r, kind, owed, table, where }) => {
              const key = `${kind}-${r.id}`;
              const can = !!FOR[table] && kind !== 'Cash' && kind !== 'Gift card';
              const info = r.info && r.info.found ? r.info : null;
              const shown = info ? FIGURES.filter(([k]) => info[k] != null && (!FOR[table] || FOR[table].includes(k))) : [];
              return (
                <div key={key} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0"><span className="font-medium">{r.name}</span> <span className="text-xs text-muted">{kind}{r.last4 ? ` · ending ${r.last4}` : ''}</span></span>
                    <span className="tabular-nums shrink-0 text-sm">{formatCurrency(r.balance || 0)}{owed ? ' owed' : ''}</span>
                  </div>
                  {info && (
                    <div className="text-xs text-muted space-y-1">
                      {info.product && info.product !== r.name && <div>{info.product}</div>}
                      {shown.length > 0 && <div className="grid grid-cols-2 gap-x-3">{shown.map(([k, label, unit]) => <React.Fragment key={k}><span>{label}</span><span className="text-right tabular-nums">{figure(info[k], unit)}</span></React.Fragment>)}</div>}
                      {info.notes && <div>{info.notes}</div>}
                      <div>{info.edited ? 'Figures set by you' : 'Published figures'}, checked {info.checked}.{info.source_url && <> <a href={info.source_url} target="_blank" rel="noopener noreferrer" className="text-accent underline">Source</a>.</>}{(info.filled || []).length > 0 && ' Used where you had entered none.'}</div>
                    </div>
                  )}
                  {r.info_off && <div className="text-xs text-muted">Not looked up.</div>}
                  {can && (open === key
                    ? <Change table={table} r={r} held={where} onCancel={() => setOpen(null)} onDone={async () => { await d.loadAllData(); setOpen(null); }} />
                    : <button type="button" className="text-xs font-medium text-accent" onClick={() => setOpen(key)}>Change</button>)}
                  {r.info && !r.info.found && !r.info_off && <div className="text-xs text-muted">No published details were found under this name. Name it as the bank does, for example "Amex Cobalt", to look again.</div>}
                </div>
              );
            })}
          </Card>
        </Section>
      ))}
      <Section title="What is looked up online">
        <Card className="space-y-3">
          {LOOKUPS.map(([k, label, note]) => (
            <label key={k} className="flex items-start gap-3">
              <input type="checkbox" className="w-5 h-5 mt-0.5" checked={prefs[k] !== false} onChange={(e) => setPref(k, e.target.checked)} />
              <span className="min-w-0"><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted">{note}</span></span>
            </label>
          ))}
          {refused && <p className="text-xs text-warning">Published rates and fees are not being filled in: Google refuses web search for the key the app uses. Reading pictures still works. Turn on billing for that key in Google AI Studio, or type the figures under Change on each account.</p>}
          <p className="text-xs text-muted">Apart from reading the pictures you add and the exchange rate for a purchase in another currency, nothing else is looked up.</p>
        </Card>
      </Section>
      {waiting && <button type="button" disabled={busy} onClick={fetchNow} className="text-sm font-medium text-accent disabled:opacity-50">{busy ? 'Looking up...' : 'Look up the details that are missing'}</button>}
    </div>
  );
}
