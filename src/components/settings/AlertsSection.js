import React from 'react';
import { Bell } from 'lucide-react';
import SettingsSection, { CheckboxCard, inputClass, labelClass, subLabelClass, hintClass } from './SettingsSection';

export default function AlertsSection({ darkMode, expanded, onToggle, settings, updateSetting }) {
  const dayField = (key, label, hint) => (
    <div>
      <label className={labelClass(darkMode)}>{label}</label>
      <input
        type="number"
        min="1"
        max="30"
        value={settings[key] || 7}
        onChange={(e) => updateSetting(key, parseInt(e.target.value))}
        className={inputClass(darkMode)}
      />
      {hint && <p className={hintClass(darkMode)}>{hint}</p>}
    </div>
  );

  const thresholdField = (key, label, fallback) => (
    <div>
      <label className={subLabelClass(darkMode)}>{label}</label>
      <input
        type="number"
        step="10"
        value={settings[key] || fallback}
        onChange={(e) => updateSetting(key, parseFloat(e.target.value))}
        className={inputClass(darkMode)}
      />
    </div>
  );

  return (
    <SettingsSection title="Notifications & Alerts" icon={Bell} expanded={expanded} onToggle={onToggle} darkMode={darkMode}>
      {dayField('defaultAlertDays', 'Default Alert Days (General)', 'Alert me this many days before due dates')}
      {dayField('creditCardAlertDays', 'Credit Card Payment Alert Days')}
      {dayField('loanAlertDays', 'Loan Payment Alert Days')}

      <CheckboxCard
        darkMode={darkMode}
        hasDetails
        checked={settings.lowBalanceAlerts !== false}
        onChange={(checked) => updateSetting('lowBalanceAlerts', checked)}
        title="Enable Low Balance Alerts"
        description="Alert when bank account balance falls below threshold"
      >
        {settings.lowBalanceAlerts !== false && (
          <div className="space-y-3 mt-3">
            {thresholdField('lowBalanceThreshold', 'Bank Account Low Balance Threshold', 100)}
          </div>
        )}
      </CheckboxCard>
    </SettingsSection>
  );
}
