import React from 'react';
import { Wallet } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import SettingsSection, { CheckboxCard, inputClass, labelClass, subLabelClass, hintClass } from './SettingsSection';

export default function TransactionDefaultsSection({ darkMode, expanded, onToggle, settings, updateSetting }) {
  return (
    <SettingsSection title="Transaction Defaults" icon={Wallet} expanded={expanded} onToggle={onToggle} darkMode={darkMode}>
      <div>
        <label className={labelClass(darkMode)}>Transaction Timestamp</label>
        <select
          value={settings.defaultTransactionTime || 'now'}
          onChange={(e) => updateSetting('defaultTransactionTime', e.target.value)}
          className={inputClass(darkMode)}
        >
          <option value="now">Use Current Time</option>
          <option value="custom">Use Custom Time</option>
        </select>
      </div>

      {settings.defaultTransactionTime === 'custom' && (
        <div>
          <label className={labelClass(darkMode)}>Custom Transaction Time</label>
          <input
            type="time"
            value={settings.customTransactionTime || '12:00'}
            onChange={(e) => updateSetting('customTransactionTime', e.target.value)}
            className={inputClass(darkMode)}
          />
        </div>
      )}

      <CheckboxCard
        darkMode={darkMode}
        hasDetails
        checked={settings.requireNotesForExpensesOver > 0}
        onChange={(checked) => updateSetting('requireNotesForExpensesOver', checked ? 100 : 0)}
        title="Require Notes for Large Expenses"
        description="Make notes mandatory for expenses over a certain amount"
      >
        {settings.requireNotesForExpensesOver > 0 && (
          <div>
            <label className={subLabelClass(darkMode)}>Amount Threshold</label>
            <input
              type="number"
              step="10"
              value={settings.requireNotesForExpensesOver || 100}
              onChange={(e) => updateSetting('requireNotesForExpensesOver', parseFloat(e.target.value))}
              className={inputClass(darkMode)}
              placeholder="e.g., 100"
            />
            <p className={hintClass(darkMode)}>
              Notes will be required for expenses over {formatCurrency(settings.requireNotesForExpensesOver || 100)}
            </p>
          </div>
        )}
      </CheckboxCard>

      <CheckboxCard
        darkMode={darkMode}
        checked={settings.requireNotesForPayments === true}
        onChange={(checked) => updateSetting('requireNotesForPayments', checked)}
        title="Require Notes for All Payments"
        description="Make notes mandatory when making credit card or loan payments"
      />

      <CheckboxCard
        darkMode={darkMode}
        hasDetails
        checked={settings.confirmLargeTransactions !== false}
        onChange={(checked) => updateSetting('confirmLargeTransactions', checked)}
        title="Confirm Large Transactions"
        description="Ask for confirmation on transactions over a certain amount"
      >
        {settings.confirmLargeTransactions !== false && (
          <div>
            <label className={subLabelClass(darkMode)}>Large Transaction Threshold</label>
            <input
              type="number"
              step="50"
              value={settings.largeTransactionThreshold || 500}
              onChange={(e) => updateSetting('largeTransactionThreshold', parseFloat(e.target.value))}
              className={inputClass(darkMode)}
              placeholder="e.g., 500"
            />
            <p className={hintClass(darkMode)}>
              Confirm transactions over {formatCurrency(settings.largeTransactionThreshold || 500)}
            </p>
          </div>
        )}
      </CheckboxCard>
    </SettingsSection>
  );
}
