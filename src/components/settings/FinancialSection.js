import React from 'react';
import { DollarSign } from 'lucide-react';
import SettingsSection, { CheckboxCard, inputClass, labelClass, subLabelClass } from './SettingsSection';

export default function FinancialSection({ darkMode, expanded, onToggle, settings, updateSetting }) {
  const alertCheckbox = (key, label) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={settings[key] !== false}
        onChange={(e) => updateSetting(key, e.target.checked)}
        className="w-4 h-4"
      />
      <span className={`text-sm text-fg`}>{label}</span>
    </label>
  );

  return (
    <SettingsSection title="Financial Preferences" icon={DollarSign} expanded={expanded} onToggle={onToggle} darkMode={darkMode}>
      <div>
        <label className={labelClass(darkMode)}>Default Payment Method</label>
        <select
          value={settings.defaultPaymentMethod || 'cash_in_hand'}
          onChange={(e) => updateSetting('defaultPaymentMethod', e.target.value)}
          className={inputClass(darkMode)}
        >
          <option value="cash_in_hand">Cash in Hand</option>
          <option value="bank_account">Bank Account</option>
          <option value="credit_card">Credit Card</option>
        </select>
      </div>

      <CheckboxCard
        darkMode={darkMode}
        checked={settings.autoCategorization !== false}
        onChange={(checked) => updateSetting('autoCategorization', checked)}
        title="Enable Auto-Categorization"
        description="Suggest a category from the transaction description"
      />

      <CheckboxCard
        darkMode={darkMode}
        checked={settings.roundUpTransactions === true}
        onChange={(checked) => updateSetting('roundUpTransactions', checked)}
        title="Round Up Transactions"
        description="Round expenses up to the nearest dollar"
      />

      <CheckboxCard
        darkMode={darkMode}
        hasDetails
        checked={settings.monthlyBudgetEnabled === true}
        onChange={(checked) => updateSetting('monthlyBudgetEnabled', checked)}
        title="Enable Monthly Budget"
        description="Set an overall monthly spending limit"
      >
        {settings.monthlyBudgetEnabled === true && (
          <div className="space-y-3 mt-3">
            <div>
              <label className={subLabelClass(darkMode)}>Monthly Budget Amount</label>
              <input
                type="number"
                step="100"
                value={settings.monthlyBudgetAmount || 0}
                onChange={(e) => updateSetting('monthlyBudgetAmount', parseFloat(e.target.value))}
                className={inputClass(darkMode)}
                placeholder="e.g., 3000"
              />
            </div>

            <div className="space-y-2">
              <label className={`block text-sm text-muted`}>Budget Alerts</label>
              {alertCheckbox('budgetAlertAt80', 'Alert at 80% of budget')}
              {alertCheckbox('budgetAlertAt90', 'Alert at 90% of budget')}
              {alertCheckbox('budgetAlertAt100', 'Alert when budget exceeded')}
            </div>
          </div>
        )}
      </CheckboxCard>

      <CheckboxCard
        darkMode={darkMode}
        hasDetails
        checked={settings.defaultOverdraftAllowed === true}
        onChange={(checked) => updateSetting('defaultOverdraftAllowed', checked)}
        title="Allow Overdraft by Default"
        description="New bank accounts will allow overdraft up to limit"
      >
        {settings.defaultOverdraftAllowed === true && (
          <div>
            <label className={subLabelClass(darkMode)}>Default Overdraft Limit</label>
            <input
              type="number"
              step="100"
              value={settings.defaultOverdraftLimit || 0}
              onChange={(e) => updateSetting('defaultOverdraftLimit', parseFloat(e.target.value))}
              className={inputClass(darkMode)}
              placeholder="e.g., 500"
            />
          </div>
        )}
      </CheckboxCard>
    </SettingsSection>
  );
}
