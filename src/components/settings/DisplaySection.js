import React from 'react';
import { Palette } from 'lucide-react';
import SettingsSection, { inputClass, labelClass, hintClass } from './SettingsSection';

const CURRENCY_SYMBOLS = { USD: '$', CAD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' };

export default function DisplaySection({ darkMode, expanded, onToggle, settings, updateSetting, displayDensity, onDisplayDensityChange }) {
  return (
    <SettingsSection title="Display & Appearance" icon={Palette} expanded={expanded} onToggle={onToggle} darkMode={darkMode}>
      <div>
        <label className={labelClass(darkMode)}>Default Currency</label>
        <select
          value={settings.currency || 'CAD'}
          onChange={(e) => {
            const curr = e.target.value;
            updateSetting('currency', curr);
            updateSetting('currencySymbol', CURRENCY_SYMBOLS[curr] || '$');
          }}
          className={inputClass(darkMode)}
        >
          <option value="CAD">CAD - Canadian Dollar ($)</option>
          <option value="USD">USD - US Dollar ($)</option>
          <option value="EUR">EUR - Euro (€)</option>
          <option value="GBP">GBP - British Pound (£)</option>
          <option value="INR">INR - Indian Rupee (₹)</option>
          <option value="JPY">JPY - Japanese Yen (¥)</option>
        </select>
        <p className={hintClass(darkMode)}>Used for all amounts in the app</p>
      </div>

      <div>
        <label className={labelClass(darkMode)}>Date Format</label>
        <select
          value={settings.dateFormat || 'MM/DD/YYYY'}
          onChange={(e) => updateSetting('dateFormat', e.target.value)}
          className={inputClass(darkMode)}
        >
          <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</option>
          <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</option>
        </select>
      </div>

      <div>
        <label className={labelClass(darkMode)}>First Day of Week</label>
        <select
          value={settings.firstDayOfWeek || 'sunday'}
          onChange={(e) => updateSetting('firstDayOfWeek', e.target.value)}
          className={inputClass(darkMode)}
        >
          <option value="sunday">Sunday</option>
          <option value="monday">Monday</option>
        </select>
      </div>

      <div>
        <label className={labelClass(darkMode)}>Number Format</label>
        <select
          value={settings.numberFormat || 'comma'}
          onChange={(e) => updateSetting('numberFormat', e.target.value)}
          className={inputClass(darkMode)}
        >
          <option value="comma">1,234.56 (Comma for thousands)</option>
          <option value="period">1.234,56 (Period for thousands)</option>
        </select>
      </div>

      <div>
        <label className={labelClass(darkMode)}>Display Density</label>
        <select
          value={displayDensity || 'comfortable'}
          onChange={(e) => onDisplayDensityChange && onDisplayDensityChange(e.target.value)}
          className={inputClass(darkMode)}
        >
          <option value="comfortable">Comfortable - More spacing</option>
          <option value="cozy">Cozy - Balanced spacing</option>
          <option value="compact">Compact - Minimal spacing</option>
          <option value="auto">Auto - Device-based</option>
        </select>
        <p className={hintClass(darkMode)}>Spacing throughout the app. Auto follows screen size.</p>
      </div>
    </SettingsSection>
  );
}
