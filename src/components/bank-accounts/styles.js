// Shared class names for Bank Accounts display components.
export const inputClass = 'field';

export const labelClass = 'block text-sm font-medium mb-1.5 text-muted';

export const strongLabelClass = 'block text-sm font-medium mb-1.5 text-muted';

export const panelClass = 'card rounded-2xl border border-line bg-surface p-4 space-y-4';

export const chipClass = (selected) =>
  `px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
    selected
      ? 'bg-accent text-accent-contrast'
      : 'bg-accent-soft text-accent hover:bg-accent-soft border border-accent/30'
  }`;
