// ============================================
// BANK ACCOUNTS PAGE
// View, add, edit, delete and pin accounts (cash is one of them);
// transfer between them. State and data access live in
// bank-accounts/useBankAccountActions, pure maths in
// bank-accounts/calculations, display in the other bank-accounts files.
// ============================================

import React, { useEffect, useRef } from 'react';
import { Plus, Building2, ArrowRightLeft, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../utils/helpers';
import useBankAccountActions from './bank-accounts/useBankAccountActions';
import { normalizeId, sumBalances, getLinkedEntities } from './bank-accounts/calculations';
import { panelClass } from './bank-accounts/styles';
import AccountForm from './bank-accounts/AccountForm';
import AccountCard from './bank-accounts/AccountCard';
import TransferForm from './bank-accounts/TransferForm';
import InstitutionHeader from './bank-accounts/InstitutionHeader';

/**
 * @param {boolean} darkMode
 * @param {Array} bankAccounts - bank accounts from parent state
 * @param {Array} loans
 * @param {Array} creditCards
 * @param {Function} onUpdate - refresh parent state after changes
 * @param {Object} focusTarget - account to highlight and scroll to
 * @param {Function} onClearFocus
 * @param {Function} onNavigateToTransactions - open transaction history with filters
 */
export default function BankAccounts({
  darkMode,
  bankAccounts,
  loans,
  creditCards,
  onUpdate,
  focusTarget,
  onClearFocus,
  onNavigateToTransactions
}) {
  const a = useBankAccountActions({ bankAccounts, onUpdate });
  const accountRefs = useRef({});

  // Scroll to the account chosen from another page, then clear the highlight
  useEffect(() => {
    if (focusTarget?.type === 'bank_account' && focusTarget.id) {
      const key = String(normalizeId(focusTarget.id));
      const node = accountRefs.current[key];
      if (node?.scrollIntoView) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const timer = setTimeout(() => onClearFocus?.(), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [focusTarget, onClearFocus]);

  const totalBalance = sumBalances(bankAccounts);
  const toggleClass = (open, idle) =>
    open ? ('bg-surface-2 text-fg') : idle;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Building2 size={24} />
            Accounts
          </h2>
          <div className={`text-sm mt-1 text-muted`}>
            Total: <span className="font-semibold">{formatCurrency(totalBalance)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => a.setShowTransferForm(!a.showTransferForm)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
              toggleClass(a.showTransferForm, 'bg-surface-2 text-fg border border-line hover:bg-line/60')
            }`}
          >
            <ArrowRightLeft size={20} />
            {a.showTransferForm ? 'Cancel' : 'Transfer'}
          </button>
          <button
            onClick={() => (a.showAddForm ? a.resetForm() : a.setShowAddForm(true))}
            className="flex items-center gap-1 sm:gap-2 bg-accent text-accent-contrast px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 text-sm sm:text-base"
          >
            <Plus size={20} />
            {a.showAddForm ? 'Cancel' : 'Add Account'}
          </button>
        </div>
      </div>

      {a.showTransferForm && (
        <TransferForm
          darkMode={darkMode}
          bankAccounts={bankAccounts}
          transferData={a.transferData}
          setTransferData={a.setTransferData}
          recentTransfers={a.recentTransfers}
          onTransfer={a.handleTransfer}
          onCancel={a.resetTransferForm}
          processing={a.isActionProcessing('transfer-accounts')}
        />
      )}

      {a.showAddForm && !a.editingItem && (
        <div className={panelClass(darkMode)}>
          <AccountForm
            mode="add"
            darkMode={darkMode}
            formData={a.formData}
            setFormData={a.setFormData}
            recentAccountNames={a.recentAccountNames}
            onSelectAccountName={a.handleSelectAccountName}
            accountNameInputRef={a.accountNameInputRef}
            onSave={a.handleAdd}
            onCancel={a.resetForm}
            processing={a.isActionProcessing('add-account')}
          />
        </div>
      )}

      <div className="space-y-6">
        {Object.keys(a.groupedAccounts).length === 0 ? (
          <div className={`text-center py-12 text-muted`}>
            <Building2 size={48} className="mx-auto mb-3 opacity-30" />
            <p>No accounts added yet</p>
            <p className="text-sm mt-2">Add your first account to get started</p>
          </div>
        ) : (
          Object.entries(a.groupedAccounts).map(([institution, accounts]) => {
            const collapsed = a.collapsedInstitutions.includes(institution);
            return (
              <div key={institution} className="space-y-3">
                <InstitutionHeader
                  darkMode={darkMode}
                  institution={institution}
                  accounts={accounts}
                  collapsed={collapsed}
                  onToggle={() => a.toggleInstitution(institution)}
                />
                {!collapsed && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {accounts.map(account => {
                      const accountKey = String(normalizeId(account.id));
                      const isHighlighted = focusTarget?.type === 'bank_account' && normalizeId(focusTarget.id) === normalizeId(account.id);
                      const isEditing = a.editingItem?.id === account.id;
                      const { linkedLoans, linkedCards } = getLinkedEntities(account.id, loans, creditCards);

                      return (
                        <div
                          key={accountKey}
                          ref={(el) => {
                            if (el) accountRefs.current[accountKey] = el;
                          }}
                          className={`bg-surface border-line rounded-2xl border p-4 ${
                            isEditing
                              ? 'ring-2 ring-blue-500 shadow-lg'
                              : isHighlighted
                              ? 'ring-2 ring-offset-2 ring-blue-500'
                              : ''
                          } ${a.editingItem && !isEditing ? 'opacity-60' : ''}`}
                        >
                          {isEditing ? (
                            <div className="space-y-3">
                              <AccountForm
                                mode="edit"
                                darkMode={darkMode}
                                formData={a.formData}
                                setFormData={a.setFormData}
                                onSave={a.handleAdd}
                                onCancel={() => {
                                  a.setEditingItem(null);
                                  a.resetForm();
                                }}
                                processing={a.isActionProcessing(`edit-account-${account.id}`)}
                              />
                            </div>
                          ) : (
                            <AccountCard
                              darkMode={darkMode}
                              account={account}
                              isPinned={a.pinnedAccounts.includes(account.id)}
                              linkedLoans={linkedLoans}
                              linkedCards={linkedCards}
                              onTogglePin={() => a.handleTogglePin(account.id)}
                              onSetPrimary={() => a.handleSetPrimary(account)}
                              onViewTransactions={() => onNavigateToTransactions && onNavigateToTransactions({ bankAccount: account.id })}
                              onEdit={() => a.handleEdit(account)}
                              onDelete={() => a.handleDelete(account.id)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {bankAccounts.length > 0 && (
        <div className={`flex items-start gap-2 p-3 rounded-lg bg-accent-soft border border-accent/30`}>
          <AlertCircle size={16} className={'text-accent mt-0.5'} />
          <p className={`text-xs text-accent`}>
            The primary account is used as the default for transactions. Pin your favorite accounts for quick access.
          </p>
        </div>
      )}
    </div>
  );
}
