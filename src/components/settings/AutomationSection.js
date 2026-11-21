import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import SettingsSection, { CheckboxCard, inputClass, subLabelClass } from './SettingsSection';

export default function AutomationSection({ darkMode, expanded, onToggle, settings, updateSetting }) {
  return (
    <SettingsSection title="Automation & Recurring" icon={SettingsIcon} expanded={expanded} onToggle={onToggle} darkMode={darkMode}>
      <CheckboxCard
        darkMode={darkMode}
        checked={settings.autoProcessDuePayments !== false}
        onChange={(checked) => updateSetting('autoProcessDuePayments', checked)}
        title="Auto-Process Due Payments"
        description="Pay overdue credit card and loan payments from linked reserved funds"
      />

      <CheckboxCard
        darkMode={darkMode}
        hasDetails
        checked={settings.autoMarkClearedDays > 0}
        onChange={(checked) => updateSetting('autoMarkClearedDays', checked ? 7 : 0)}
        title="Auto-Mark Transactions as Cleared"
        description="Mark transactions as cleared after a set number of days"
      >
        {settings.autoMarkClearedDays > 0 && (
          <div>
            <label className={subLabelClass(darkMode)}>Days Until Auto-Clear</label>
            <input
              type="number"
              min="1"
              max="90"
              value={settings.autoMarkClearedDays || 7}
              onChange={(e) => updateSetting('autoMarkClearedDays', parseInt(e.target.value))}
              className={inputClass(darkMode)}
              placeholder="e.g., 7"
            />
          </div>
        )}
      </CheckboxCard>

      <CheckboxCard
        darkMode={darkMode}
        checked={settings.smartSuggestions !== false}
        onChange={(checked) => updateSetting('smartSuggestions', checked)}
        title="Enable Smart Suggestions"
        description="Show budgeting and planning suggestions"
      />
    </SettingsSection>
  );
}
