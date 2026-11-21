import React from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import ActionButton from '../shared/ActionButton';
import FrequentMark from './FrequentMark';
import { inputClass, labelClass, strongLabelClass, panelClass, chipClass } from './styles';

function AccountSelect({ darkMode, label, value, onChange, bankAccounts }) {
  return (
    <div>
      <label className={labelClass(darkMode)}>{label}</label>
      <select value={value} onChange={onChange} className={inputClass(darkMode)}>
        <option value="">Select account</option>
        {bankAccounts.map(account => (
          <option key={account.id} value={account.id}>
            {account.name} - {formatCurrency(account.balance)}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function TransferForm({
  darkMode,
  bankAccounts,
  transferData,
  setTransferData,
  recentTransfers,
  onTransfer,
  onCancel,
  processing
}) {
  return (
    <div className={panelClass(darkMode)} role="region" aria-label="Transfer between accounts">
      <h3 className="font-semibold flex items-center gap-2">
        <ArrowRightLeft size={18} />
        Transfer Between Accounts
      </h3>

      {recentTransfers.length > 0 && (
        <div>
          <label className={strongLabelClass(darkMode)}>Recent Transfers</label>
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
                className={chipClass(darkMode, transferData.description === transfer.description)}
              >
                {transfer.description}
                <FrequentMark count={transfer.usage_count} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <AccountSelect
          darkMode={darkMode}
          label="From Account *"
          value={transferData.fromAccount}
          onChange={(e) => setTransferData({ ...transferData, fromAccount: e.target.value })}
          bankAccounts={bankAccounts}
        />
        <AccountSelect
          darkMode={darkMode}
          label="To Account *"
          value={transferData.toAccount}
          onChange={(e) => setTransferData({ ...transferData, toAccount: e.target.value })}
          bankAccounts={bankAccounts}
        />
      </div>

      <div>
        <label className={labelClass(darkMode)}>Amount *</label>
        <input
          type="number"
          step="0.01"
          placeholder="0.00"
          value={transferData.amount}
          onChange={(e) => setTransferData({ ...transferData, amount: e.target.value })}
          className={inputClass(darkMode)}
        />
      </div>

      <div>
        <label className={labelClass(darkMode)}>Transfer Date *</label>
        <input
          type="date"
          value={transferData.date}
          onChange={(e) => setTransferData({ ...transferData, date: e.target.value })}
          className={inputClass(darkMode)}
        />
      </div>

      <div>
        <label className={labelClass(darkMode)}>Description (Optional)</label>
        <input
          type="text"
          placeholder="e.g., Moving to savings"
          value={transferData.description}
          onChange={(e) => setTransferData({ ...transferData, description: e.target.value })}
          className={inputClass(darkMode)}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <ActionButton
          onClick={onTransfer}
          processing={processing}
          variant="success"
          processingText="Transferring..."
          idleText="Transfer Money"
          fullWidth
        />
        <ActionButton onClick={onCancel} variant="secondary" idleText="Cancel" fullWidth />
      </div>
    </div>
  );
}
