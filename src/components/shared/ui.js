import React, { useId } from 'react';

// Small building blocks that use the colour tokens, so they follow the chosen theme and dark mode.
const cx = (...c) => c.filter(Boolean).join(' ');

export function Card({ as: Tag = 'div', className, padded = true, children, ...rest }) {
  return (
    <Tag className={cx('rounded-2xl border border-line bg-surface', padded && 'p-4', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Section({ title, action, className, children }) {
  return (
    <section className={cx('space-y-2', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-1">
          {title && <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const VARIANTS = {
  primary: 'bg-accent text-accent-contrast hover:opacity-90',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-line/60',
  ghost: 'bg-transparent text-accent hover:bg-accent-soft',
  danger: 'bg-negative text-white hover:opacity-90',
};
const SIZES = {
  sm: 'text-sm px-3 py-1.5 min-h-[36px]',
  md: 'text-sm px-4 py-2.5',
  lg: 'text-base px-5 py-3',
};

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, className, children, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'press inline-flex items-center justify-center gap-2 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        className
      )}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export const controlClass =
  'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-fg placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none';

export function Field({ label, hint, error, as = 'input', id, className, children, ...rest }) {
  const autoId = useId();
  const fieldId = id || autoId;
  const Tag = as;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className={cx('space-y-1', className)}>
      {label && <label htmlFor={fieldId} className="block text-sm font-medium text-fg">{label}</label>}
      <Tag
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(controlClass, error && 'border-negative')}
        {...rest}
      >
        {children}
      </Tag>
      {error ? (
        <p id={`${fieldId}-error`} className="text-xs text-negative">{error}</p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const TONES = { positive: 'text-positive', negative: 'text-negative', warning: 'text-warning', accent: 'text-accent' };

export function Stat({ label, value, sub, tone, className }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('text-xl font-semibold tabular-nums truncate', TONES[tone] || 'text-fg')}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

const BADGES = {
  neutral: 'bg-surface-2 text-muted',
  positive: 'bg-positive/10 text-positive',
  negative: 'bg-negative/10 text-negative',
  warning: 'bg-warning/10 text-warning',
  accent: 'bg-accent-soft text-accent',
};

export function Badge({ tone = 'neutral', className, children }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', BADGES[tone] || BADGES.neutral, className)}>
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, text, action, className }) {
  return (
    <div className={cx('flex flex-col items-center text-center gap-2 px-6 py-10', className)}>
      {Icon && (
        <span className="mb-1 grid place-items-center w-12 h-12 rounded-2xl bg-accent-soft text-accent">
          <Icon size={22} aria-hidden="true" />
        </span>
      )}
      {title && <p className="font-semibold text-fg">{title}</p>}
      {text && <p className="text-sm text-muted max-w-sm">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
