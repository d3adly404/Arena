/** FieldLink — dates, numbers and labels in plain language. */

export const PHONE_HELP = 'Tap any saved number to call it from this device.';

export function shortDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dateInput(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeInput(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function clockTime(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function longDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function dayLabel(value?: string | null) {
  if (!value) return 'No date';
  const d = new Date(value);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, tomorrow)) return 'Tomorrow';
  const yesterday = new Date(today.getTime() - 86400000);
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function relativeTime(value?: string | null) {
  if (!value) return '';
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return shortDate(value);
}

export function dueLabel(value?: string | null) {
  if (!value) return 'No due date';
  const d = new Date(value);
  const now = new Date();
  const diffDays = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (d < now && diffDays <= 0) return `Overdue — ${dayLabel(value)}`;
  if (diffDays === 0) return `Due today at ${clockTime(value)}`;
  if (diffDays === 1) return `Due tomorrow at ${clockTime(value)}`;
  if (diffDays > 0 && diffDays < 7) return `Due ${d.toLocaleDateString(undefined, { weekday: 'long' })} at ${clockTime(value)}`;
  return `Due ${shortDate(value)}`;
}

export function money(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `GHS ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function fileSize(bytes?: number | null) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name?: string | null) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

/** A calm colour for an avatar, chosen from the person's name. */
export function avatarTone(name?: string | null) {
  const tones = ['#0f766e', '#1e3a8a', '#7c3aed', '#b45309', '#be123c', '#334155', '#0369a1', '#3f6212'];
  if (!name) return tones[0];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  return tones[hash % tones.length];
}

export function titleCase(value?: string | null) {
  if (!value) return '';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function telHref(phone?: string | null) {
  if (!phone) return null;
  const cleaned = String(phone).replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
}

export function prettyPhone(phone?: string | null) {
  if (!phone) return 'No number saved';
  return String(phone);
}

export function plural(count: number, singular: string, pluralWord?: string) {
  return `${count} ${count === 1 ? singular : pluralWord || `${singular}s`}`;
}
