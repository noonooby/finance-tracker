import React, { useEffect, useId, useRef, useState } from 'react';
import { formatCurrency } from '../../utils/helpers';

// Small building blocks that use the colour tokens, so they follow the chosen theme and dark mode.
const cx = (...c) => c.filter(Boolean).join(' ');

export function Card({ as: Tag = 'div', className, padded = true, children, ...rest }) {
  return (
    <Tag className={cx('card rounded-2xl border border-line bg-surface', padded && 'p-4', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Section({ title, action, className, children }) {
  return (
    <section className={cx('space-y-2.5', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-1">
          {title && <h2 className="text-[0.9375rem] font-semibold text-fg min-w-0 truncate">{title}</h2>}
          {action && <div className="shrink-0 text-right">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const VARIANTS = {
  primary: 'bg-accent text-accent-contrast hover:opacity-90 shadow-sm shadow-accent/30',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-line/60',
  ghost: 'bg-transparent text-accent hover:bg-accent-soft',
  danger: 'bg-negative text-white hover:opacity-90',
};
const SIZES = {
  sm: 'text-sm px-3.5 py-1.5 min-h-[40px] rounded-xl',
  md: 'text-[0.9375rem] px-5 py-2.5 min-h-[48px] rounded-2xl',
  lg: 'text-base px-6 py-3 min-h-[54px] rounded-2xl',
};

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, className, children, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'press inline-flex items-center justify-center gap-2 font-semibold disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none',
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

const controlClass =
  'field';

export function Field({ label, hint, error, as = 'input', id, className, children, ...rest }) {
  const autoId = useId();
  const fieldId = id || autoId;
  const Tag = as;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && <label htmlFor={fieldId} className="block text-sm font-medium text-muted">{label}</label>}
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
        <p id={`${fieldId}-error`} className="text-sm text-negative">{error}</p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

// A money figure that glides to its new value when it changes, so a moving balance is seen to move.
const still = () => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function Num({ value, format = formatCurrency }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target || still()) { from.current = target; setShown(target); return undefined; }
    let raf, t0 = null;
    const step = (t) => {
      if (t0 == null) t0 = t;
      const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3);
      const v = start + (target - start) * e;
      from.current = v; setShown(v);
      if (k < 1) raf = requestAnimationFrame(step); else { from.current = target; setShown(target); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <span className="tabular-nums">{format(shown)}</span>;
}

// A label with its figure on the right.
export function Line({ label, value }) {
  return <div className="flex items-baseline justify-between gap-3 text-sm py-0.5"><span className="text-muted">{label}</span><span className="tabular-nums text-right font-medium">{value}</span></div>;
}

const TONES = { positive: 'text-positive', negative: 'text-negative', warning: 'text-warning', accent: 'text-accent' };

export function Stat({ label, value, sub, tone, className }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('text-lg font-semibold tabular-nums truncate', TONES[tone] || 'text-fg')}>{value}</div>
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

// A small "?" beside a word. Tapping it opens a short explanation; tapping anywhere else closes it.
export function Hint({ label = 'What this means', align = 'left', children }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex align-middle">
      <button type="button" aria-label={label} aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="hint-btn press grid place-items-center w-[22px] h-[22px] rounded-full border border-line text-xs font-semibold leading-none text-muted hover:text-accent hover:border-accent">?</button>
      {open && (
        <span role="note" className={cx('page-enter absolute top-7 z-30 w-64 max-w-[80vw] rounded-xl border border-line bg-surface p-3 text-xs font-normal normal-case tracking-normal leading-relaxed text-fg shadow-lg', align === 'right' ? 'right-0' : 'left-0')}>
          {children}
        </span>
      )}
    </span>
  );
}

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
        <span className="tick mb-1 grid place-items-center w-14 h-14 rounded-3xl bg-accent-soft text-accent">
          <Icon size={26} aria-hidden="true" />
        </span>
      )}
      {title && <p className="text-lg font-semibold text-fg">{title}</p>}
      {text && <p className="text-sm text-muted max-w-sm">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// How far along counted work is: "3 of 8". With no count it is a moving bar, so waiting is seen to be working.
export function Progress({ value, max, label, className }) {
  const counted = Number(max) > 0 && value != null;
  const pct = counted ? Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100)) : 0;
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">{label}</span>{counted && <span className="text-muted tabular-nums">{value} of {max}</span>}</div>}
      {counted
        ? <div className="meter busy" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}><span style={{ width: `${pct}%` }} /></div>
        : <div className="loadbar rounded-full" role="progressbar" aria-label={label || 'Working'} />}
    </div>
  );
}
