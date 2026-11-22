// Days as local "YYYY-MM-DD" strings: they sort, compare and serve as keys, and never shift with time zones.
import { current } from './i18n.js';

const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => iso(new Date());
export const dayOf = ms => iso(new Date(ms));
export const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());

export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export const monthKey = s => s.slice(0, 7);

// "2026-11" n months on
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const fmt = (opts, s) => new Intl.DateTimeFormat(current(), opts).format(parse(s));
export const dayLabel = s => fmt({ weekday: 'short', day: 'numeric', month: 'numeric' }, s);
export const longDay = s => fmt({ weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' }, s);
export const monthLabel = s => fmt({ month: 'long', year: 'numeric' }, s.length === 7 ? s + '-01' : s);
export const monthShort = s => fmt({ month: 'short' }, s);
export const dayMonth = s => fmt({ day: 'numeric', month: 'numeric' }, s);
export const timeOf = ms => new Intl.DateTimeFormat(current(), { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
