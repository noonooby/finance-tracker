// Shared class names for Bank Accounts display components.
export const inputClass = (darkMode) =>
  `w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`;

export const labelClass = (darkMode) =>
  `block text-sm mb-1 text-muted`;

export const strongLabelClass = (darkMode) =>
  `block text-sm font-medium mb-2 text-fg`;

export const panelClass = (darkMode) =>
  `bg-surface border-line rounded-2xl border p-4 space-y-3`;

export const chipClass = (darkMode, selected) =>
  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
    selected
      ? 'bg-accent text-accent-contrast'
      : 'bg-accent-soft text-accent hover:bg-accent-soft border border-accent/30'
  }`;
