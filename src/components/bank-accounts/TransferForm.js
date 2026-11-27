import React from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import ActionButton from '../shared/ActionButton';
import FrequentMark from './FrequentMark';
import { inputClass, labelClass, strongLabelClass, panelClass, chipClass } from './styles';

function AccountSelect({ label, value, onChange, bankAccounts, lines = [] }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <select value={value} onChange={onChange} className={inputClass}>
        <option value="">Select account</option>
        {bankAccounts.map(account => (
          <option key={account.id} value={account.id}>
            {account.name} - {formatCurrency(account.balance)}
          </option>
        ))}
        {lines.length > 0 && (
          <optgroup label="Lines of credit">
            {lines.map((l) => <option key={l.id} value={`loan:${l.id}`}>{l.name}{l.left != null ? ` - ${formatCurrency(l.left)} left to take` : ` - ${formatCurrency(l.used)} used`}</option>)}
          </optgroup>
        )}
      </select>
    </div>
  );
}

export default function TransferForm({
  bankAccounts,
  lines = [],
  transferData,
  setTransferData,
  recentTransfers,
  onTransfer,
  onCancel,
  processing
}) {
  return (
    <div className={panelClass} role="region" aria-label="Transfer between accounts">
      <h3 className="font-semibold flex items-center gap-2">
        <ArrowRightLeft size={18} />
        Move money between accounts
      </h3>

      {recentTransfers.length > 0 && (
        <div>
          <label className={strongLabelClass}>Recent transfers</label>
          <div className="flex gap-2 flex-wrap">
            {recentTransfers.map(transfer => (
              <button
                key={transfer.id}
                type="button"
                onClick={() => {
                  setTransferData(prev => ({
                    ...prev,
                    description: transfer.description,
                    fromAccount: transfer.from_account_id || prev.fromAccount,
                    toAccount: transfer.to_account_id || prev.toAccount
                  }));
                }}
                className={chipClass(transferData.description === transfer.description)}
              >
                {transfer.description}
                <FrequentMark count={transfer.usage_count} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 items-end">
        <AccountSelect
          label="From account"
          value={transferData.fromAccount}
          onChange={(e) => setTransferData({ ...transferData, fromAccount: e.target.value, toAccount: String(transferData.toAccount) === String(e.target.value) ? '' : transferData.toAccount })}
          bankAccounts={bankAccounts}
          lines={lines}
        />
        <AccountSelect
          label="To account"
          value={transferData.toAccount}
          onChange={(e) => setTransferData({ ...transferData, toAccount: e.target.value })}
          bankAccounts={bankAccounts.filter(account => String(account.id) !== String(transferData.fromAccount))}
        />
      </div>

      {String(transferData.fromAccount).startsWith('loan:') && <p className="text-xs text-muted">Money taken from a line of credit: the account goes up and what is owed on the line goes up by the same amount. Interest is charged on what is used.</p>}
      <div>
        <label className={labelClass}>Amount</label>
        <input
          type="number"
          step="0.01"
          placeholder="0.00"
          value={transferData.amount}
          onChange={(e) => setTransferData({ ...transferData, amount: e.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Transfer date</label>
        <input
          type="date"
          value={transferData.date}
          onChange={(e) => setTransferData({ ...transferData, date: e.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Description (optional)</label>
        <input
          type="text"
          placeholder="Moving to savings"
          value={transferData.description}
          onChange={(e) => setTransferData({ ...transferData, description: e.target.value })}
          className={inputClass}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <ActionButton
          onClick={onTransfer}
          processing={processing}
          variant="success"
          processingText="Transferring..."
          idleText="Transfer money"
          fullWidth
        />
        <ActionButton onClick={onCancel} variant="secondary" idleText="Cancel" fullWidth />
      </div>
    </div>
  );
}
