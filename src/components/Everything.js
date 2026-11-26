import React, { useMemo, useState } from 'react';
import { Landmark } from 'lucide-react';
import { useFinanceData } from '../hooks/useFinanceData';
import { api } from '../utils/server';
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
const figure = (v, unit) => (unit === '$' ? formatCurrency(v) : `${v}%`);
const BANKS = /\b(td|rbc|royal bank|bmo|bank of montreal|scotiabank|scotia|cibc|national bank|desjardins|tangerine|simplii|eq bank|wealthsimple|questrade|amex|american express|capital one|pc financial|rogers|mbna|canadian tire|triangle|neo|koho|hsbc|laurentian|manulife|sun life|fidelity|vanguard|interactive brokers|coinbase|shakepay|newton|affirm|klarna|paypal)\b/i;
// Where an account is held: what was entered, else the provider found for the product, else a bank named in its name.
const place = (r, kind) => {
  const own = String(r.institution || (kind === 'Loan' ? r.provider : '') || (r.info && r.info.found && r.info.issuer) || '').trim();
  if (own) return own;
  const m = String(r.name || '').match(BANKS);
  return m ? m[0].replace(/\b\w/g, (c) => c.toUpperCase()) : '';
};

export default function Everything() {
  const d = useFinanceData();
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => {
    const all = [
      ...(d.bankAccounts || []).map((r) => ({ r, kind: r.account_type === 'cash' ? 'Cash' : r.account_type === 'savings' ? 'Savings account' : 'Bank account', owed: false })),
      ...(d.creditCards || []).map((r) => ({ r, kind: r.is_gift_card ? 'Gift card' : 'Credit card', owed: !r.is_gift_card })),
      ...(d.loans || []).map((r) => ({ r, kind: 'Loan', owed: true })),
      ...(d.investments || []).map((r) => ({ r, kind: r.kind && r.kind !== 'Other' ? r.kind : 'Investment', owed: false })),
      ...(d.assets || []).map((r) => ({ r, kind: r.kind || 'Property', owed: false })),
    ].map((x) => ({ ...x, where: x.kind === 'Cash' ? 'Cash' : (d.assets || []).includes(x.r) ? 'Property' : place(x.r, x.kind) || 'Not stated' }));
    const by = new Map();
    for (const x of all) { const k = x.where.toLowerCase(); if (!by.has(k)) by.set(k, { where: x.where, items: [] }); by.get(k).items.push(x); }
    return [...by.values()].sort((a, b) => (a.where === 'Not stated') - (b.where === 'Not stated') || a.where.localeCompare(b.where));
  }, [d.bankAccounts, d.creditCards, d.loans, d.investments, d.assets]);
  const waiting = groups.some((g) => g.items.some((x) => !x.r.info && !['Cash', 'Gift card'].includes(x.kind) && x.where !== 'Property'));

  const fetchNow = async () => {
    setBusy(true);
    try { const r = await api('/api/details', {}); await d.loadAllData(); showToast.success(r.done ? 'Details looked up.' : 'Nothing more to look up right now.'); }
    catch (e) { showToast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Everything you hold</h1>
        <p className="text-sm text-muted mt-1">Each account, card, loan and investment, by where it is held. The published rates and fees of each product are looked up from its name when it is added; a figure you entered yourself is never replaced.</p>
      </div>
      {groups.length === 0 && <Card><EmptyState icon={Landmark} title="Nothing yet" text="Accounts and cards show here once they are added." /></Card>}
      {groups.map((g) => (
        <Section key={g.where} title={g.where} action={<span className="text-xs text-muted">{g.items.length}</span>}>
          <Card padded={false} className="divide-y divide-line">
            {g.items.map(({ r, kind, owed }) => {
              const info = r.info && r.info.found ? r.info : null;
              const shown = info ? FIGURES.filter(([k]) => info[k] != null) : [];
              return (
                <div key={`${kind}-${r.id}`} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0"><span className="font-medium">{r.name}</span> <span className="text-xs text-muted">{kind}{r.last4 ? ` · ending ${r.last4}` : ''}</span></span>
                    <span className="tabular-nums shrink-0 text-sm">{formatCurrency(r.balance || 0)}{owed ? ' owed' : ''}</span>
                  </div>
                  {info && (
                    <div className="text-xs text-muted space-y-1">
                      {info.product && info.product !== r.name && <div>{info.product}</div>}
                      {shown.length > 0 && <div className="grid grid-cols-2 gap-x-3">{shown.map(([k, label, unit]) => <React.Fragment key={k}><span>{label}</span><span className="text-right tabular-nums">{figure(info[k], unit)}</span></React.Fragment>)}</div>}
                      {info.notes && <div>{info.notes}</div>}
                      <div>Published figures, checked {info.checked}.{info.source_url && <> <a href={info.source_url} target="_blank" rel="noopener noreferrer" className="text-accent underline">Source</a>.</>}{(info.filled || []).length > 0 && ' Used where you had entered none.'}</div>
                    </div>
                  )}
                  {r.info && !r.info.found && <div className="text-xs text-muted">No published details were found under this name. Name it as the bank does, for example "Amex Cobalt", to look again.</div>}
                </div>
              );
            })}
          </Card>
        </Section>
      ))}
      {waiting && <button type="button" disabled={busy} onClick={fetchNow} className="text-sm font-medium text-accent disabled:opacity-50">{busy ? 'Looking up...' : 'Look up the details that are missing'}</button>}
    </div>
  );
}
