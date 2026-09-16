/** FieldLink — the small building blocks every screen uses. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, IconName } from './Icon';
import { avatarTone, initials } from '../lib/format';

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function Button({
  children, variant = 'default', size = 'md', icon, iconRight, loading, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'dark' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
}) {
  const variants = {
    default: 'btn',
    primary: 'btn btn-primary',
    dark: 'btn btn-dark',
    danger: 'btn btn-danger',
    ghost: 'btn btn-ghost',
  };
  const sizes = { sm: 'btn-sm', md: '', lg: 'btn-lg' };
  return (
    <button type="button" className={cx(variants[variant], sizes[size], className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner className="h-4 w-4" /> : icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} className="h-4 w-4" /> : null}
    </button>
  );
}

export function IconButton({
  name, label, className, tone = 'default', size = 'md', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { name: IconName; label: string; tone?: 'default' | 'primary' | 'danger'; size?: 'sm' | 'md' }) {
  const tones = {
    default: 'text-ink-500 hover:bg-ink-100 hover:text-ink-800',
    primary: 'text-brand-700 hover:bg-brand-50',
    danger: 'text-rose-600 hover:bg-rose-50',
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex items-center justify-center rounded-lg transition', size === 'sm' ? 'h-8 w-8' : 'h-9 w-9', tones[tone], className)}
      {...rest}
    >
      <Icon name={name} className={size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'} />
    </button>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon, action, tone }: { title: string; subtitle?: string; icon?: IconName; action?: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: tone ? `${tone}14` : '#f1f5f9', color: tone || '#334155' }}>
            <Icon name={icon} className="h-[18px] w-[18px]" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-ink-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  info: 'bg-sky-50 text-sky-800',
  good: 'bg-emerald-50 text-emerald-800',
  warn: 'bg-amber-50 text-amber-900',
  danger: 'bg-rose-50 text-rose-800',
  brand: 'bg-brand-50 text-brand-800',
};

export function Badge({ children, tone = 'neutral', icon, className }: { children: React.ReactNode; tone?: keyof typeof TONES | string; icon?: IconName; className?: string }) {
  return (
    <span className={cx('badge', TONES[tone] || TONES.neutral, className)}>
      {icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

export function Avatar({ name, size = 36, tone, className }: { name?: string | null; size?: number; tone?: string; className?: string }) {
  return (
    <span
      className={cx('grid shrink-0 place-items-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, background: tone || avatarTone(name), fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

export function Progress({ value, tone = '#0f766e', className, showLabel = false }: { value: number; tone?: string; className?: string; showLabel?: boolean }) {
  const percent = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-200">
        <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: tone }} />
      </div>
      {showLabel ? <span className="w-9 shrink-0 text-right text-[11px] font-semibold text-ink-500">{percent}%</span> : null}
    </div>
  );
}

export function Tabs({
  tabs, value, onChange, className,
}: { tabs: Array<{ key: string; label: string; badge?: number | string; icon?: IconName }>; value: string; onChange: (key: string) => void; className?: string }) {
  return (
    <div className={cx('scroll-x border-b border-ink-200', className)}>
      {tabs.map((tab) => (
        <button key={tab.key} type="button" onClick={() => onChange(tab.key)} className={cx('tab flex items-center gap-2', value === tab.key && 'tab-active')}>
          {tab.icon ? <Icon name={tab.icon} className="h-4 w-4" /> : null}
          {tab.label}
          {tab.badge !== undefined && tab.badge !== null && Number(tab.badge) > 0 ? (
            <span className="rounded-full bg-ink-100 px-1.5 text-[11px] font-semibold text-ink-600">{tab.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, className }: { options: Array<{ value: T; label: string; icon?: IconName }>; value: T; onChange: (value: T) => void; className?: string }) {
  return (
    <div className={cx('inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[13px] font-medium transition',
            value === option.value ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-700',
          )}
        >
          {option.icon ? <Icon name={option.icon} className="h-3.5 w-3.5" /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open, onClose, title, subtitle, children, footer, size = 'md', variant = 'sheet',
}: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode;
  footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; variant?: 'sheet' | 'center';
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'sm:w-[min(420px,94vw)]', md: 'sm:w-[min(640px,94vw)]', lg: 'sm:w-[min(880px,94vw)]', xl: 'sm:w-[min(1080px,96vw)]' };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className={cx('animate-in relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-raised sm:rounded-2xl', widths[size], variant === 'center' && 'sm:max-w-[min(520px,94vw)]')}>
        <header className="flex items-start justify-between gap-4 border-b border-ink-100 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p> : null}
          </div>
          <IconButton name="x" label="Close" onClick={onClose} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? <footer className="safe-bottom flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-4 py-3 sm:px-5">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, message, action }: { icon?: IconName; title: string; message?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-100 text-ink-400">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
      {message ? <p className="max-w-sm text-[13px] text-ink-500">{message}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Field({ label, hint, required, error, children, className }: { label?: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label ? (
        <label className="label">
          {label}
          {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="hint">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

export function Select({ children, className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('input appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}>
      {children}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search', className, onClear }: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string; onClear?: () => void }) {
  return (
    <div className={cx('relative', className)}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        className="input pl-9 pr-9"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => { onChange(''); onClear?.(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-400 hover:bg-ink-100">
          <Icon name="x" className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function MultiSelect({ options, value, onChange, className }: { options: string[]; value: string[]; onChange: (next: string[]) => void; className?: string }) {
  const selected = Array.isArray(value) ? value : [];
  const toggle = (option: string) => {
    onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option]);
  };
  return (
    <div className={cx('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            type="button"
            key={option}
            onClick={() => toggle(option)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition',
              active ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
            )}
          >
            {active ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function RadioGroup({ options, value, onChange, columns = 2 }: { options: string[]; value?: string; onChange: (next: string) => void; columns?: number }) {
  return (
    <div className={cx('grid gap-2', columns === 2 ? 'grid-cols-2' : columns === 3 ? 'grid-cols-3' : 'grid-cols-1')}>
      {options.map((option) => {
        const active = value === option;
        return (
          <button
            type="button"
            key={option}
            onClick={() => onChange(option)}
            className={cx(
              'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[14px] transition',
              active ? 'border-brand-700 bg-brand-50 font-medium text-brand-900' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
            )}
          >
            <span className={cx('grid h-4 w-4 shrink-0 place-items-center rounded-full border-2', active ? 'border-brand-700' : 'border-ink-300')}>
              {active ? <span className="h-2 w-2 rounded-full bg-brand-700" /> : null}
            </span>
            <span className="truncate">{option}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (next: boolean) => void; label?: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand-700' : 'bg-ink-300')}
      >
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      {label ? (
        <span>
          <span className="block text-[14px] font-medium text-ink-800">{label}</span>
          {hint ? <span className="block text-xs text-ink-500">{hint}</span> : null}
        </span>
      ) : null}
    </label>
  );
}

export function InfoRow({ label, value, mono, children }: { label: string; value?: React.ReactNode; mono?: boolean; children?: React.ReactNode }) {
  if (value === undefined && !children) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 py-2.5 last:border-0">
      <span className="text-[13px] text-ink-500">{label}</span>
      <span className={cx('max-w-[62%] text-right text-[13px] font-medium text-ink-800', mono && 'font-mono text-[12px]')}>{children ?? value}</span>
    </div>
  );
}

export function Stat({ label, value, icon, tone = '#0f766e', hint }: { label: string; value: React.ReactNode; icon?: IconName; tone?: string; hint?: string }) {
  return (
    <Card className="card-pad">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium uppercase tracking-wide text-ink-500">{label}</span>
        {icon ? (
          <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${tone}14`, color: tone }}>
            <Icon name={icon} className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </Card>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-[13px] text-ink-500">{children}</p>;
}

export function KeyValueList({ rows }: { rows: Array<{ label: string; value?: React.ReactNode }> }) {
  const visible = rows.filter((row) => row.value !== undefined && row.value !== null && row.value !== '' && row.value !== '—');
  if (!visible.length) return <p className="px-4 py-4 text-[13px] text-ink-500">Nothing recorded yet.</p>;
  return (
    <div className="px-4 pb-2 sm:px-5">
      {visible.map((row) => (
        <InfoRow key={row.label} label={row.label} value={row.value} />
      ))}
    </div>
  );
}

/** Sticky action bar used at the bottom of long mobile forms. */
export function ActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('safe-bottom sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t border-ink-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:px-4', className)}>
      {children}
    </div>
  );
}

export function Drawer({ open, onClose, title, children, side = 'right' }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; side?: 'right' | 'left' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-ink-900/30" onClick={onClose} />
      <div className={cx('relative ml-auto flex h-full w-[min(420px,92vw)] flex-col bg-white shadow-raised', side === 'left' && 'mr-auto ml-0')}>
        <header className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <IconButton name="x" label="Close" onClick={onClose} />
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** An image that gracefully shows a placeholder if the file cannot be loaded. */
export function Thumb({ src, alt, className, onClick, ratio = 'square' }: { src?: string | null; alt: string; className?: string; onClick?: () => void; ratio?: 'square' | 'wide' | 'tall' }) {
  const [failed, setFailed] = useState(false);
  const ratioClass = ratio === 'wide' ? 'aspect-[4/3]' : ratio === 'tall' ? 'aspect-[3/4]' : 'aspect-square';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('group relative block overflow-hidden rounded-lg border border-ink-200 bg-ink-100', ratioClass, className)}
      aria-label={alt}
    >
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-ink-400">
          <Icon name="image" className="h-6 w-6" />
        </span>
      )}
    </button>
  );
}

export function useScrollMemory(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stored = sessionStorage.getItem(`scroll:${key}`);
    if (stored && ref.current) ref.current.scrollTop = Number(stored);
    return () => {
      if (ref.current) sessionStorage.setItem(`scroll:${key}`, String(ref.current.scrollTop));
    };
  }, [key]);
  return ref;
}

export function Note({ children, tone = 'info', icon = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' | 'good' | 'danger'; icon?: IconName }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
  };
  return (
    <div className={cx('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]', tones[tone])}>
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function useObjectUrl(blob?: Blob | null) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}
