import React from 'react';
import { Palette } from 'lucide-react';
import SettingsSection, { labelClass, hintClass } from './SettingsSection';
import { useTheme } from '../../hooks/useTheme';

const MODES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Match device' },
];


export default function DisplaySection({ expanded, onToggle }) {
  const { theme, setTheme, themes, colorMode, setColorMode } = useTheme();
  return (
    <SettingsSection title="Look" icon={Palette} expanded={expanded} onToggle={onToggle}>
      <div>
        <span className={labelClass} id="theme-colour-label">Colour</span>
        <div className="flex flex-wrap gap-3 py-1" role="group" aria-labelledby="theme-colour-label">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              className="swatch"
              style={{ background: t.color }}
              aria-label={`Use ${t.name} colour`}
              aria-pressed={theme === t.id}
              title={t.name}
              onClick={() => setTheme(t.id)}
            />
          ))}
        </div>
        <p className={hintClass}>Buttons, links and highlights use this colour. Saved on this device.</p>
      </div>

      <div>
        <span className={labelClass} id="theme-mode-label">Light or dark</span>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-2 border border-line" role="group" aria-labelledby="theme-mode-label">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={colorMode === m.id}
              onClick={() => setColorMode(m.id)}
              className={`rounded-xl text-sm font-medium py-2 min-h-[40px] ${colorMode === m.id ? 'bg-surface text-fg' : 'text-muted hover:text-fg'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

    </SettingsSection>
  );
}
