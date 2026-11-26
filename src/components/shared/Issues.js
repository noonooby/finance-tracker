import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useFinanceData } from '../../hooks/useFinanceData';
import { server, api } from '../../utils/server';
import { recordSnapshot, resolveSnapshot } from '../../utils/money';
import { position } from '../../utils/finance';
import { rooms as roomsOf, taxNext } from '../../utils/room';
import { issues } from '../../utils/issues';
import { localDate } from '../../utils/helpers';
import { showToast } from '../../utils/toast';

// Anything that does not match is shown with the same block everywhere: what disagrees, and the fixes as buttons
// that work in place. utils/issues.js decides what is listed; this file draws it and carries the fixes out.

// What the list needs beyond the accounts, loaded once and shared by every place that shows a block.
const cached = () => { try { return JSON.parse(localStorage.getItem('tax_facts') || 'null'); } catch { return null; } };
let state = { checks: [], quiet: {}, stated: {}, years: [], facts: cached(), ready: false };
let loading = null;
const subs = new Set();
const set = (next) => { state = { ...state, ...next }; subs.forEach((f) => f()); };
function refresh() {
  if (loading) return loading;
  loading = (async () => {
    const [checks, settings, years, facts] = await Promise.all([
      api('/api/checks', null, 'GET').catch(() => state.checks),
      server.from('settings').select('*').then((r) => r.data || []).catch(() => null),
      server.from('tax_years').select('*').then((r) => r.data || []).catch(() => state.years),
      state.facts ? state.facts : api('/api/tax-facts', undefined, 'GET').catch(() => null),
    ]);
    const get = (k) => (settings ? ((settings.find((r) => r.key === k) || {}).value || {}) : null);
    set({ checks: checks || [], years, facts, quiet: get('quiet') || state.quiet, stated: get('tax_room') || state.stated, ready: true });
  })().finally(() => { loading = null; });
  return loading;
}
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

const stored = (line, d) => {
  const list = line.kind === 'bank' || line.kind === 'cash' ? d.bankAccounts : ['card', 'card_credit', 'gift_card'].includes(line.kind) ? d.creditCards : line.kind === 'loan' || line.kind === 'mortgage' ? d.loans : line.kind === 'investment' ? d.investments : d.assets;
  const row = (list || []).find((x) => String(x.id) === String(line.id));
  return row ? Number(row.balance) || 0 : null;
};

export function useIssues() {
  const d = useFinanceData();
  const navigate = useNavigate();
  const s = useSyncExternalStore(subscribe, () => state);
  const { loadAllData, dataLoading, transactions } = d;
  useEffect(() => { if (!dataLoading) refresh(); }, [dataLoading, transactions]);
  const today = localDate();

  const list = useMemo(() => {
    if (dataLoading) return [];
    const p = position({ bankAccounts: d.bankAccounts, creditCards: d.creditCards, loans: d.loans, investments: d.investments, assets: d.assets });
    const next = s.years.length ? taxNext({ years: s.years, facts: s.facts, today }) : { missing: [] };
    return issues({
      checks: s.checks, creditCards: d.creditCards, loans: d.loans, investments: d.investments, quiet: s.quiet, today,
      stale: p.stale.map((x) => ({ ...x, signed: stored(x, d) })),
      rooms: s.facts ? roomsOf({ stated: s.stated, investments: d.investments, transactions: d.transactions, facts: s.facts, today }) : [],
      taxMissing: next.missing,
    });
  }, [d, s, today, dataLoading]);

  const quietly = useCallback(async (value) => {
    const { error } = await server.from('settings').upsert({ key: 'quiet', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    set({ quiet: value });
  }, []);

  // Carries one fix out. Returns { choices } when a ticker can mean more than one thing, { went: true } when it
  // only opened a page, and nothing once the fix is done.
  const run = useCallback(async (issue, fix, value) => {
    if (fix.do === 'go') { navigate(fix.to); return { went: true }; }
    if (fix.do === 'leave') {
      const before = state.quiet;
      await quietly({ ...before, [issue.id]: issue.sig });
      toast((t) => (
        <span className="flex items-center gap-3 text-sm">Left as it is
          <button type="button" className="font-medium text-accent" onClick={() => { toast.dismiss(t.id); quietly(before).catch((e) => showToast.error(e.message)); }}>Undo</button>
        </span>
      ), { duration: 6000 });
      return undefined;
    }
    if (fix.do === 'correct' || fix.do === 'dismiss') await resolveSnapshot(fix.snap, fix.do);
    else if (fix.do === 'amount' || fix.do === 'same') {
      const n = fix.do === 'same' ? fix.value : Number(value);
      if (value === '' || !Number.isFinite(n)) throw new Error('Enter a number.');
      await recordSnapshot({ target: fix.target, value: n, date: today, source: 'you' });
    } else if (fix.do === 'ticker') {
      const inv = d.investments.find((i) => String(i.id) === String(fix.inv));
      const held = inv && Array.isArray(inv.holdings) ? inv.holdings : [];
      if (!held[fix.index]) throw new Error('That holding is no longer there.');
      let q = fix.quote;
      if (!q) {
        if (!String(value || '').trim()) throw new Error('Enter the ticker.');
        const r = await api('/api/quote', { symbol: String(value).trim(), crypto: inv.kind === 'Crypto' });
        if (!r.quote && r.choices && r.choices.length) return { choices: r.choices };
        if (!r.quote) throw new Error(`No price found for ${String(value).toUpperCase()}. Check the ticker, for example VEQT.TO.`);
        q = r.quote;
      }
      const sent = (h) => ({ symbol: h.symbol || h.shown, symbol_set: !!h.symbol, shown: h.shown, name: h.name, units: h.units, price: h.price, currency: h.currency, value: h.value });
      await api('/api/holdings', { id: inv.id, holdings: held.map((h, j) => (j === fix.index ? { ...sent(h), symbol: q.symbol, symbol_set: true, shown: h.shown || q.symbol, name: h.name || q.name, value: null } : sent(h))) });
    }
    await Promise.all([loadAllData(), refresh()]);
    return undefined;
  }, [d.investments, loadAllData, navigate, quietly, today]);

  return { list, run, ready: s.ready && !dataLoading };
}

const Tick = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" className="tick text-positive" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// One mismatch. `done` shows it ticked off while it folds away.
export function IssueBlock({ issue, run, done, compact }) {
  const [ask, setAsk] = useState(null);         // the fix waiting for a figure or a ticker
  const [value, setValue] = useState('');
  const [choices, setChoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const go = async (fix, v) => {
    setBusy(true);
    try {
      const r = await run(issue, fix, v);
      if (r && r.choices) setChoices(r.choices); else if (!r) { setAsk(null); setChoices([]); }
    } catch (e) { showToast.error(e.message); } finally { setBusy(false); }
  };
  const pick = (fix) => {
    if (fix.do === 'amount' || fix.do === 'ticker') { setChoices([]); setValue(fix.start != null ? String(fix.start) : ''); setAsk(ask === fix ? null : fix); } else go(fix);
  };
  const main = issue.fixes.filter((f) => f.do !== 'leave' && f.do !== 'dismiss');
  const quiet = issue.fixes.filter((f) => f.do === 'leave' || f.do === 'dismiss');
  return (
    <div className={`fold ${done === 'closing' ? '' : 'open'}`}>
      <div>
        <div className={compact ? 'py-3' : 'px-4 py-3.5'}>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">{done ? <Tick /> : <AlertTriangle size={17} className="text-warning" aria-hidden="true" />}</span>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium ${done ? 'text-muted line-through decoration-1' : ''}`}>{issue.title}</div>
              {!done && <div className="text-xs text-muted mt-0.5 leading-relaxed">{issue.text}</div>}
              {!done && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {main.map((f, i) => (
                    <button key={i} type="button" disabled={busy} onClick={() => pick(f)}
                      className={`chip ${i === 0 ? 'chip-main' : ''} ${ask === f ? 'chip-on' : ''}`}>
                      {f.label}{f.do === 'go' && <ChevronRight size={13} aria-hidden="true" />}
                    </button>
                  ))}
                  {quiet.map((f, i) => <button key={`q${i}`} type="button" disabled={busy} onClick={() => go(f)} className="chip chip-quiet">{f.label}</button>)}
                </div>
              )}
              <div className={`fold ${ask && !done ? 'open' : ''}`}>
                <div>
                  {ask && (
                    <form className="pt-2.5 space-y-2" onSubmit={(e) => { e.preventDefault(); go(ask, value); }}>
                      <label className="block text-xs text-muted">{ask.ask}
                        <input className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-fg" autoFocus value={value} onChange={(e) => setValue(e.target.value)}
                          {...(ask.do === 'amount' ? { type: 'number', step: '0.01', inputMode: 'decimal' } : { autoCapitalize: 'characters' })} />
                      </label>
                      {choices.length > 0 && (
                        <div className="space-y-1 stagger">
                          <p className="text-xs text-muted">More than one match. Which is it?</p>
                          {choices.map((c) => <button key={c.symbol} type="button" disabled={busy} onClick={() => go({ ...ask, quote: c })} className="block w-full text-left text-sm rounded-xl border border-line px-3 py-2">{c.symbol} <span className="text-muted">{c.name} · {c.price} {c.currency}</span></button>)}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button type="submit" disabled={busy} className="chip chip-main">{busy && <span className="spinner" aria-hidden="true" />}Save</button>
                        <button type="button" className="chip chip-quiet" onClick={() => { setAsk(null); setChoices([]); }}>Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// The blocks for one place. A fixed one is ticked off, then folds away.
//   only: which issues belong here.  limit: how many to show before "Show all".
export function Issues({ only, limit, compact, className, empty = null, wrap }) {
  const { list, run, ready } = useIssues();
  const [gone, setGone] = useState({});          // id -> { issue, at: 'done' | 'closing' }
  const [all, setAll] = useState(false);
  const order = useRef([]);
  const mine = useMemo(() => (only ? list.filter(only) : list), [list, only]);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const act = useCallback(async (issue, fix, value) => {
    const r = await run(issue, fix, value);
    if (r) return r;
    setGone((g) => ({ ...g, [issue.id]: { issue, at: 'done' } }));
    timers.current.push(setTimeout(() => setGone((g) => (g[issue.id] ? { ...g, [issue.id]: { issue, at: 'closing' } } : g)), 900));
    timers.current.push(setTimeout(() => setGone((g) => { const n = { ...g }; delete n[issue.id]; return n; }), 1300));
    return undefined;
  }, [run]);

  const rows = [...mine.filter((i) => !gone[i.id]).map((i) => ({ issue: i })), ...Object.values(gone).map((g) => ({ issue: g.issue, done: g.at }))];
  for (const r of rows) if (!order.current.includes(r.issue.id)) order.current.push(r.issue.id);
  rows.sort((a, b) => order.current.indexOf(a.issue.id) - order.current.indexOf(b.issue.id));
  if (!rows.length) return ready ? empty : null;
  const shown = all || !limit ? rows : rows.slice(0, limit);
  const body = (
    <div className={className || 'divide-y divide-line'}>
      {shown.map((r) => <IssueBlock key={r.issue.id} issue={r.issue} run={act} done={r.done} compact={compact} />)}
      {limit && rows.length > limit && (
        <button type="button" onClick={() => setAll(!all)} className={`w-full text-left text-xs font-medium text-accent ${compact ? 'py-2' : 'px-4 py-3'}`}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>
      )}
    </div>
  );
  return wrap ? wrap(body, mine.length) : body;
}
