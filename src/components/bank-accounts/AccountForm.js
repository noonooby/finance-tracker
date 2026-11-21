import React from 'react';
import RateLookup from '../shared/RateLookup';
import ActionButton from '../shared/ActionButton';
import FrequentMark from './FrequentMark';
import { inputClass, labelClass, strongLabelClass, chipClass } from './styles';

/**
 * Add or edit form for a bank account.
 * mode "add": shown above the list, with recent-name suggestions.
 * mode "edit": shown inline inside the account card.
 */
export default function AccountForm({
  mode,
  darkMode,
  formData,
  setFormData,
  recentAccountNames = [],
  onSelectAccountName,
  accountNameInputRef,
  onSave,
  onCancel,
  processing
}) {
  const isEdit = mode === 'edit';
  const showRecent = !isEdit && recentAccountNames.length > 0;
  const set = (patch) => setFormData({ ...formData, ...patch });

  return (
    <>
      {isEdit
        ? <h3 className="font-semibold text-lg mb-3">Edit Bank Account</h3>
        : <h3 className="font-semibold">Add Bank Account</h3>}

      {showRecent && (
        <div>
          <label className={strongLabelClass(darkMode)}>Recent Accounts</label>
          <div className="flex gap-2 flex-wrap">
            {recentAccountNames.map(accountEntity => (
              <button
                key={accountEntity.id}
                type="button"
                onClick={() => onSelectAccountName(accountEntity)}
                className={chipClass(darkMode, formData.name === accountEntity.name)}
              >
                {accountEntity.name}
                <FrequentMark count={accountEntity.usage_count} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={strongLabelClass(darkMode)}>
          {showRecent ? 'Or type new account name *' : 'Account Name *'}
        </label>
        <input
          ref={isEdit ? undefined : accountNameInputRef}
          type="text"
          value={formData.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g., Tangerine Checking"
          className={inputClass(darkMode)}
          required={!isEdit}
          autoFocus={isEdit || recentAccountNames.length === 0}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass(darkMode)}>Balance *</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={formData.balance}
            onChange={(e) => set({ balance: e.target.value })}
            className={inputClass(darkMode)}
          />
        </div>
        <div>
          <label className={labelClass(darkMode)}>Account Type *</label>
          <select
            value={formData.account_type}
            onChange={(e) => set({ account_type: e.target.value })}
            className={inputClass(darkMode)}
          >
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="investment">Investment</option>
            <option value="cash">Cash</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass(darkMode)}>Institution (Optional)</label>
        <input
          type="text"
          placeholder="e.g., Chase, Bank of America"
          value={formData.institution}
          onChange={(e) => set({ institution: e.target.value })}
          className={inputClass(darkMode)}
        />
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.is_primary}
          onChange={(e) => set({ is_primary: e.target.checked })}
          className="w-4 h-4"
        />
        <span className="text-sm">Set as primary account</span>
      </label>

      <div className={`pt-3 mt-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <h4 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Overdraft Settings</h4>
        <label className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={formData.allows_overdraft}
            onChange={(e) => set({
              allows_overdraft: e.target.checked,
              overdraft_limit: e.target.checked ? formData.overdraft_limit : ''
            })}
            className="w-4 h-4"
          />
          <span className="text-sm">Allow overdraft</span>
        </label>
        {formData.allows_overdraft && (
          <div>
            <label className={labelClass(darkMode)}>Overdraft Limit *</label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g., 500.00"
              value={formData.overdraft_limit}
              onChange={(e) => set({ overdraft_limit: e.target.value })}
              className={inputClass(darkMode)}
            />
            {!isEdit && (
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Maximum negative balance allowed before transactions are blocked
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <label className="block text-xs">Monthly fee
                <input type="number" step="0.01" inputMode="decimal" placeholder="0.00" value={formData.overdraft_monthly_fee} onChange={(e) => set({ overdraft_monthly_fee: e.target.value })} className={inputClass(darkMode)} />
              </label>
              <label className="block text-xs">Fee each time used
                <input type="number" step="0.01" inputMode="decimal" placeholder="0.00" value={formData.overdraft_use_fee} onChange={(e) => set({ overdraft_use_fee: e.target.value })} className={inputClass(darkMode)} />
              </label>
              <label className="block text-xs">Interest % a year
                <input type="number" step="0.01" inputMode="decimal" placeholder="e.g. 21" value={formData.overdraft_rate} onChange={(e) => set({ overdraft_rate: e.target.value })} className={inputClass(darkMode)} />
              </label>
            </div>
            <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Used to show what the overdraft costs when the balance goes below zero.</p>
            <div className="mt-2">
              <RateLookup kind="bank_account" name={[formData.institution, formData.name].filter(Boolean).join(' ')} onUse={(r) => set({
                overdraft_rate: r.overdraft_rate != null ? String(r.overdraft_rate) : formData.overdraft_rate,
                overdraft_monthly_fee: r.overdraft_monthly_fee != null ? String(r.overdraft_monthly_fee) : formData.overdraft_monthly_fee,
                overdraft_use_fee: r.overdraft_use_fee != null ? String(r.overdraft_use_fee) : formData.overdraft_use_fee })} />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <ActionButton
          onClick={onSave}
          processing={processing}
          variant="primary"
          processingText={isEdit ? 'Updating...' : 'Adding Account...'}
          idleText={isEdit ? 'Update Account' : 'Add Account'}
          fullWidth
        />
        <ActionButton onClick={onCancel} variant="secondary" idleText="Cancel" fullWidth />
      </div>
    </>
  );
}
