// The Accounts page: chequing, savings and cash, kept under their banks. Adding, changing, removing, pinning and
// moving money live in bank-accounts/useBankAccountActions; the sums in bank-accounts/calculations.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Plus, ArrowRightLeft, ChevronDown, Landmark } from 'lucide-react';
import { formatCurrency } from '../utils/helpers';
import { useFinanceData } from '../hooks/useFinanceData';
import useBankAccountActions from './bank-accounts/useBankAccountActions';
import { normalizeId, sumBalances, getLinkedEntities } from './bank-accounts/calculations';
import AccountForm from './bank-accounts/AccountForm';
import AccountCard from './bank-accounts/AccountCard';
import TransferForm from './bank-accounts/TransferForm';
import { Card, Section, Button, EmptyState, Hint, Num } from './shared/ui';
import { Issues } from './shared/Issues';
import { isLine, lineTerms, keptTotal } from '../utils/accounts';

const NO_BANK = 'Other Accounts';
const LINKS = [['/cards', 'Cards'], ['/investments', 'Investments'], ['/loans', 'Loans'], ['/holdings', 'Everything you hold'], ['/position', 'Where you stand'], ['/transactions', 'Transactions']];

export default function BankAccounts({ darkMode, bankAccounts, loans, creditCards, onUpdate, focusTarget, onClearFocus, onNavigateToTransactions }) {
  const a = useBankAccountActions({ bankAccounts, loans, onUpdate });
  const { investments = [] } = useFinanceData();
  const creditLines = useMemo(() => (loans || []).filter((l) => !l.on_card_id && isLine(l)).map((l) => ({ id: l.id, name: l.name, ...lineTerms(l, investments) })), [loans, investments]);
  const kept = keptTotal(bankAccounts);
  const navigate = useNavigate();
  const { transactions = [], loadAllData } = useFinanceData();
  const accountRefs = useRef({});
  const [open, setOpen] = useState(null);

  // An account chosen on another page is opened and scrolled to.
  useEffect(() => {
    if (focusTarget?.type !== 'bank_account' || !focusTarget.id) return undefined;
    const key = String(normalizeId(focusTarget.id));
    setOpen(key);
    const node = accountRefs.current[key];
    if (node?.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => onClearFocus?.(), 4000);
    return () => clearTimeout(timer);
  }, [focusTarget, onClearFocus]);

  const total = sumBalances(bankAccounts);
  const groups = Object.entries(a.groupedAccounts).sort(([x], [y]) => (x === NO_BANK) - (y === NO_BANK) || x.localeCompare(y));
  const banks = groups.filter(([name]) => name !== NO_BANK).length;
  const ids = new Set(bankAccounts.map((x) => String(x.id)));
  const changed = async () => { if (loadAllData) await loadAllData(); else if (onUpdate) await onUpdate(); };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
          <Hint label="About this page">Your chequing, savings and cash. Add a picture of your bank app and the accounts, balances and lines on it are filled in for you. Each account is kept under its bank, so a picture from one bank is never taken for an account at another.</Hint>
        </div>
        <p className="text-sm text-muted mt-1">Money you can spend, kept under each bank.</p>
      </div>

      <Card className="space-y-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            In your accounts
            <Hint label="About this total">Every account on this page added together, cash included. An account in overdraft takes away from it. Cards, loans and investments are on their own pages.</Hint>
          </div>
          <div className="text-3xl font-bold tabular-nums tracking-tight"><Num value={total} /></div>
          {kept > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted mt-1">
              {formatCurrency(total - kept)} to spend · {formatCurrency(kept)} kept so a monthly fee is not charged
              <Hint label="About money kept">Some accounts charge no monthly fee while a set amount stays in them. That amount is yours and counts in what you have, but spending it brings the fee back, so it is left out of what you can spend. Open the account to change this.</Hint>
            </div>
          )}
          <div className="text-xs text-muted">{bankAccounts.length === 1 ? 'One account' : `${bankAccounts.length} accounts`}{banks > 0 ? ` at ${banks === 1 ? 'one bank' : `${banks} banks`}` : ''}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/screenshot')}><Camera size={16} aria-hidden="true" /> Add a picture</Button>
          <Button variant="secondary" onClick={() => (a.showAddForm ? a.resetForm() : a.setShowAddForm(true))}><Plus size={16} aria-hidden="true" /> {a.showAddForm ? 'Close' : 'Add by hand'}</Button>
          {(bankAccounts.length > 1 || (bankAccounts.length > 0 && creditLines.length > 0)) && <Button variant="secondary" onClick={() => a.setShowTransferForm(!a.showTransferForm)}><ArrowRightLeft size={16} aria-hidden="true" /> {a.showTransferForm ? 'Close' : 'Move money'}</Button>}
        </div>
      </Card>

      {a.showTransferForm && (
        <div className="page-enter">
          <TransferForm darkMode={darkMode} bankAccounts={bankAccounts} lines={creditLines} transferData={a.transferData} setTransferData={a.setTransferData} recentTransfers={a.recentTransfers}
            onTransfer={a.handleTransfer} onCancel={a.resetTransferForm} processing={a.isActionProcessing('transfer-accounts')} />
        </div>
      )}
      {a.showAddForm && !a.editingItem && (
        <Card className="page-enter">
          <AccountForm mode="add" darkMode={darkMode} formData={a.formData} setFormData={a.setFormData} recentAccountNames={a.recentAccountNames} onSelectAccountName={a.handleSelectAccountName}
            accountNameInputRef={a.accountNameInputRef} onSave={a.handleAdd} onCancel={a.resetForm} processing={a.isActionProcessing('add-account')} />
        </Card>
      )}

      <Issues compact only={(i) => ids.has(String(i.ref)) && ['check', 'need', 'stale'].includes(i.kind) && (i.kind !== 'need' || String(i.id).startsWith('need:bank_accounts:'))}
        wrap={(list, count) => <Section title="To sort out" action={<span className="text-xs text-muted">{count}</span>}>{list}</Section>} />

      {groups.length === 0 ? (
        <Card><EmptyState icon={Landmark} title="No accounts yet" text="Add a picture of your bank app: the accounts on it, their balances and their lines are filled in. Or add one by hand."
          action={<Button onClick={() => navigate('/screenshot')}><Camera size={16} aria-hidden="true" /> Add a picture</Button>} /></Card>
      ) : groups.map(([bank, accounts]) => {
        const shut = a.collapsedInstitutions.includes(bank);
        return (
          <section key={bank} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <button type="button" onClick={() => a.toggleInstitution(bank)} aria-expanded={!shut} className="press flex-1 min-w-0 flex items-center justify-between gap-3 py-1 text-left">
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="font-semibold truncate">{bank === NO_BANK ? 'Bank not known' : bank}</span>
                  <span className="text-xs text-muted shrink-0">{accounts.length}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0 text-sm font-medium tabular-nums">
                  {formatCurrency(sumBalances(accounts))}
                  <ChevronDown size={16} aria-hidden="true" className={`text-muted transition-transform ${shut ? '' : 'rotate-180'}`} />
                </span>
              </button>
              {bank === NO_BANK && <Hint label="About accounts with no bank" align="right">The app does not know which bank these are at. It is filled in from the next picture of each one, or answer under To sort out. Until then only a picture showing the same name or the same last four digits is matched to them.</Hint>}
            </div>
            <div className={`fold ${shut ? '' : 'open'}`}><div>
              <div className="space-y-2 stagger">
                {accounts.map((account) => {
                  const key = String(normalizeId(account.id));
                  const editing = a.editingItem?.id === account.id;
                  const { linkedLoans, linkedCards } = getLinkedEntities(account.id, loans, creditCards);
                  return (
                    <div key={key} ref={(el) => { if (el) accountRefs.current[key] = el; }}>
                    <Card padded={false} className={`${editing ? 'ring-2 ring-accent' : ''} ${a.editingItem && !editing ? 'opacity-60' : ''}`}>
                      {editing ? (
                        <div className="p-4">
                          <AccountForm mode="edit" darkMode={darkMode} formData={a.formData} setFormData={a.setFormData} onSave={a.handleAdd}
                            onCancel={() => { a.setEditingItem(null); a.resetForm(); }} processing={a.isActionProcessing(`edit-account-${account.id}`)} />
                        </div>
                      ) : (
                        <AccountCard account={account} open={open === key} onToggle={() => setOpen(open === key ? null : key)} isPinned={a.pinnedAccounts.includes(account.id)}
                          linkedLoans={linkedLoans} linkedCards={linkedCards} transactions={transactions} bankAccounts={bankAccounts} creditCards={creditCards}
                          onTogglePin={() => a.handleTogglePin(account.id)} onSetPrimary={() => a.handleSetPrimary(account)}
                          onViewTransactions={() => onNavigateToTransactions && onNavigateToTransactions({ bankAccount: account.id })}
                          onEdit={() => a.handleEdit(account)} onDelete={() => a.handleDelete(account.id)} onChanged={changed} />
                      )}
                    </Card>
                    </div>
                  );
                })}
              </div>
            </div></div>
          </section>
        );
      })}

      <Section title="Go to">
        <div className="flex flex-wrap gap-2">
          {LINKS.map(([to, label]) => <button key={to} type="button" className="press chip" onClick={() => navigate(to)}>{label}</button>)}
          <button type="button" className="press chip" onClick={() => navigate('/help')}>Help</button>
        </div>
      </Section>
    </div>
  );
}
