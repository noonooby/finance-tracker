import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { formatCurrency, formatDate, getAccountTypeIcon } from '../../utils/helpers';
import { formatFrequency } from '../../utils/sentenceCase';
import { effectOn } from '../../utils/lines';
import { Badge, Hint } from '../shared/ui';
import MoveLine, { canMove, sidesOf } from '../shared/MoveLine';

const KIND = { checking: 'Chequing', savings: 'Savings', cash: 'Cash', investment: 'Investment' };
const day = (d) => { const x = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null; };
const chip = 'press chip';

// One account: its name, kind and balance on one row. Tapping it opens its latest lines and what can be done with it.
export default function AccountCard({ account, open, onToggle, isPinned, linkedLoans = [], linkedCards = [], transactions = [], bankAccounts = [], creditCards = [],
  onTogglePin, onSetPrimary, onViewTransactions, onEdit, onDelete, onChanged }) {
  const navigate = useNavigate();
  const [moving, setMoving] = useState(null);
  const [count, setCount] = useState(6);
  const balance = Number(account.balance) || 0;
  const Icon = Icons[getAccountTypeIcon(account.account_type)] || Icons.Building2;
  const ref = `bank_account:${account.id}`;
  const seen = day(account.snapshot_date) || day(account.balance_as_of);
  const accounts = useMemo(() => ({ bankAccounts, creditCards }), [bankAccounts, creditCards]);
  // Every saved line that touched this account, newest first.
  const lines = useMemo(() => (open ? transactions
    .filter((t) => t.status !== 'undone' && t.status !== 'deleted' && (effectOn(t, 'bank_account', account.id) != null || sidesOf(t, accounts).some((s) => s.ref === ref)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at || '').localeCompare(String(a.created_at || ''))) : []), [open, transactions, account.id, accounts, ref]);

  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="press w-full flex items-center gap-3 p-4 text-left">
        <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-accent-soft text-accent"><Icon size={18} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold truncate">{account.name}</span>
            {account.is_primary && <Badge tone="accent">Main</Badge>}
            {isPinned && !account.is_primary && <Icons.Star size={13} className="shrink-0 text-warning fill-current" aria-label="Pinned" />}
          </span>
          <span className="block text-xs text-muted truncate">
            {KIND[account.account_type] || 'Account'}{account.last4 ? ` · ending ${String(account.last4).slice(-4)}` : ''}{seen ? ` · seen ${formatDate(seen)}` : ''}
          </span>
        </span>
        <span className={`shrink-0 text-lg font-bold tabular-nums ${balance < 0 ? 'text-negative' : ''}`}>{formatCurrency(balance)}</span>
        <Icons.ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`fold ${open ? 'open' : ''}`}><div>
        {open && (
          <div className="px-4 pb-4 pt-3 space-y-4 border-t border-line">
            {balance < 0 && account.allows_overdraft && (
              <p className="text-xs text-negative">In overdraft. Limit {formatCurrency(account.overdraft_limit || 0)}, {formatCurrency((Number(account.overdraft_limit) || 0) + balance)} left of it.</p>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                Latest lines
                <Hint label="About these lines">What went in and out of this account, newest first. A line that belongs to another account: tap it and choose the right one. Lines dated before the day the balance was last seen are kept as history and do not change it.</Hint>
              </div>
              {lines.length === 0 && <p className="text-sm text-muted">Nothing yet. Add a picture of this account's activity and its lines are filled in.</p>}
              {lines.slice(0, count).map((t) => {
                const did = effectOn(t, 'bank_account', account.id);
                const up = did != null ? did >= 0 : t.type === 'income';
                const movable = canMove(t, accounts);
                const Row = movable ? 'button' : 'div';
                return (
                  <Row key={t.id} {...(movable ? { type: 'button', onClick: () => setMoving(t), 'aria-label': `${t.description || 'Line'}: move it to another account` } : {})}
                    className={`w-full flex items-center justify-between gap-3 text-left text-sm ${movable ? 'press rounded-lg -mx-2 px-2 py-1.5 hover:bg-surface-2' : 'py-1.5'}`}>
                    <span className="min-w-0">
                      <span className="block truncate">{t.description || t.category_name || t.income_source || 'No description'}</span>
                      <span className="block text-xs text-muted">{formatDate(t.date)}{t.type === 'adjustment' ? ' · balance corrected' : ''}{t.pending ? ' · pending' : ''}</span>
                    </span>
                    <span className={`shrink-0 font-medium tabular-nums ${up ? 'text-positive' : ''}`}>{up ? '+' : '-'}{formatCurrency(Math.abs(did != null ? did : Number(t.amount) || 0))}</span>
                  </Row>
                );
              })}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
                {lines.length > count && <button type="button" className="press font-medium text-accent" onClick={() => setCount(count + 10)}>Show more</button>}
                {lines.length > 0 && <button type="button" className="press font-medium text-accent" onClick={onViewTransactions}>All lines in Transactions</button>}
              </div>
            </div>

            {(linkedLoans.length > 0 || linkedCards.length > 0) && (
              <div className="text-xs text-muted">
                <span className="font-medium text-fg">Pays automatically: </span>
                {[...linkedLoans.map((l) => `${l.name} (${formatCurrency(l.payment_amount || 0)} ${formatFrequency(l.frequency)})`), ...linkedCards.map((c) => c.name)].join(', ')}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={`${chip} chip-main`} onClick={() => navigate('/screenshot')}><Icons.Camera size={14} aria-hidden="true" /> Add a picture</button>
              <button type="button" className={chip} onClick={onEdit}>Change</button>
              {!account.is_primary && <button type="button" className={chip} onClick={onSetPrimary}>Make it the main account</button>}
              {!account.is_primary && <button type="button" className={chip} onClick={onTogglePin}>{isPinned ? 'Unpin' : 'Pin to the top'}</button>}
              {!account.is_primary && <button type="button" className={`${chip} chip-quiet`} onClick={onDelete}>Remove</button>}
              <Hint label="About these choices" align="right">Change: its name, bank, kind and balance. The main account is the one offered first when you record something. A pinned account sits at the top of its bank. The main account cannot be removed: make another one main first.</Hint>
            </div>
          </div>
        )}
      </div></div>
      {moving && <MoveLine line={moving} from={ref} transactions={transactions} bankAccounts={bankAccounts} creditCards={creditCards} onClose={() => setMoving(null)} onDone={onChanged} />}
    </div>
  );
}
