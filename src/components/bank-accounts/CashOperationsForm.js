import React from 'react';
import { Wallet, Building2, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import ActionButton from '../shared/ActionButton';
import { getCashPreview } from './calculations';
import { inputClass, labelClass, strongLabelClass, panelClass } from './styles';

function OperationButton({ darkMode, active, onClick, Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${active
        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
        : 'border-line hover:border-accent'
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

export default function CashOperationsForm({
  darkMode,
  bankAccounts,
  cashInHand,
  cashOperation,
  setCashOperation,
  cashFormData,
  setCashFormData,
  onSubmit,
  onCancel,
  processing
}) {
  const preview = getCashPreview(bankAccounts, cashFormData, cashOperation, cashInHand);

  return (
    <div className={panelClass(darkMode)} role="region" aria-label="Cash operations">
      <h3 className="font-semibold flex items-center gap-2">
        <Wallet size={18} />
        Cash Operations
      </h3>

      <div>
        <label className={strongLabelClass(darkMode)}>Operation Type</label>
        <div className="flex gap-2">
          <OperationButton
            darkMode={darkMode}
            active={cashOperation === 'withdraw'}
            onClick={() => setCashOperation('withdraw')}
            Icon={ArrowDownToLine}
            label="Withdraw"
          />
          <OperationButton
            darkMode={darkMode}
            active={cashOperation === 'deposit'}
            onClick={() => setCashOperation('deposit')}
            Icon={ArrowUpFromLine}
            label="Deposit"
          />
        </div>
      </div>

      <div>
        <label className={labelClass(darkMode)}>Select Account *</label>
        <select
          value={cashFormData.accountId}
          onChange={(e) => setCashFormData({ ...cashFormData, accountId: e.target.value })}
          className={inputClass(darkMode)}
        >
          <option value="">Choose account</option>
          {bankAccounts.map(account => (
            <option key={account.id} value={account.id}>
              {account.name} - {formatCurrency(account.balance)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass(darkMode)}>Amount *</label>
        <input
          type="number"
          step="0.01"
          placeholder="0.00"
          value={cashFormData.amount}
          onChange={(e) => setCashFormData({ ...cashFormData, amount: e.target.value })}
          className={inputClass(darkMode)}
        />
      </div>

      {preview && (
        <div className={`p-3 rounded-2xl bg-surface-2`}>
          <div className={`text-xs font-medium mb-2 text-muted`}>Preview:</div>
          <div className={`text-sm space-y-1 text-fg`}>
            <div className="flex items-center gap-2">
              <Wallet size={14} className="text-muted" />
              Cash in Hand: {formatCurrency(preview.currentCash)} → {formatCurrency(preview.newCashInHand)}
            </div>
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-muted" />
              {preview.selectedAccount.name}: {formatCurrency(preview.currentBankBalance)} → {formatCurrency(preview.newBankBalance)}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <ActionButton
          onClick={onSubmit}
          processing={processing}
          variant="warning"
          processingText={cashOperation === 'withdraw' ? 'Withdrawing...' : 'Depositing...'}
          idleText={cashOperation === 'withdraw' ? 'Withdraw Cash' : 'Deposit Cash'}
          fullWidth
        />
        <ActionButton onClick={onCancel} variant="secondary" idleText="Cancel" fullWidth />
      </div>
    </div>
  );
}
