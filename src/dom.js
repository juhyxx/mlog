// Small DOM helpers shared by the views.
import { t } from './i18n.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);

// Segmented control. options: [[value, label, title?], …]. Labels are markup (escape text first).
export function seg(act, options, current, extra = '') {
  return `<div class="seg ${extra}" role="group">${options
    .map(([v, label, title]) => `<button type="button" class="btn" data-act="${act}" data-val="${esc(v)}" aria-pressed="${String(v) === String(current)}"${title ? ` title="${esc(title)}"` : ''}>${label}</button>`)
    .join('')}</div>`;
}

// A group of lit-when-chosen options inside a form (radio inputs styled as keys).
export function radios(name, options, current, extra = '') {
  return `<div class="seg keys ${extra}">${options
    .map(([v, label]) => `<label class="btn toggle"><input type="radio" name="${name}" value="${esc(v)}"${String(v) === String(current) ? ' checked' : ''}>${label}</label>`)
    .join('')}</div>`;
}

// 25 → "25 MIN", 75 → "1 H 15 MIN"
export function duration(min) {
  min = Math.round(min);
  if (min < 60) return t('dur.m', { m: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? t('dur.hm', { h, m }) : t('dur.h', { h });
}

// The same for the big LCD digits: the numbers large, the units small. Markup.
export function bigDuration(min) {
  min = Math.round(min);
  const unit = k => `<small>${esc(t(k))}</small>`;
  if (min < 60) return `${min}${unit('unit.min')}`;
  return `${Math.floor(min / 60)}${unit('unit.h')}${String(min % 60).padStart(2, '0')}${unit('unit.min')}`;
}

// A logged time as squares, one lit for every full five minutes, in rows of twelve (an hour a row).
// The exact time is only the tooltip and the label. live: a practice that runs, whose next square
// blinks while it fills. Markup.
export function pipDuration(min, live = false) {
  min = live ? Math.floor(min) : Math.round(min);
  const lit = Math.floor(min / 5);
  const slots = Math.max(1, Math.ceil((lit + (live ? 1 : 0)) / 12)) * 12;
  const pips = Array.from({ length: slots }, (_, i) => `<i${i < lit ? ' class="on"' : live && i === lit ? ' class="now"' : ''}></i>`).join('');
  const label = esc(duration(min));
  return `<span class="pips" role="img" aria-label="${label}" title="${label}">${pips}</span>`;
}

// mm:ss, or h:mm:ss past an hour
export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const svg = body => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const stroke = d => svg(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);

export const icon = {
  prev: stroke('M14.5 6l-6 6 6 6'),
  next: stroke('M9.5 6l6 6-6 6'),
  up: stroke('M6 14.5l6-6 6 6'),
  down: stroke('M6 9.5l6 6 6-6'),
  plus: stroke('M12 5v14M5 12h14'),
  close: stroke('M6 6l12 12M18 6L6 18'),
  edit: stroke('M5 19h4L19 9l-4-4L5 15zM13 7l4 4'),
  trash: stroke('M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12'),
  link: stroke('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'),
  out: stroke('M14 5h5v5M19 5l-8 8M17 14v5H5V7h5'),
  paste: stroke('M9 4h6v3H9zM8 5H6v15h12V5h-2'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="16" cy="7" r="2.2" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="10" cy="17" r="2.2" stroke="currentColor" stroke-width="2" fill="none"/>'),
};

// The toast at the bottom, with an optional action (Undo, Reload). It hides itself after a while
// unless it carries an action that must be seen (sticky).
let toastTimer = null;
export function toast(message, action, onAction, { sticky = false } = {}) {
  const el = $('#toast');
  clearTimeout(toastTimer);
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="btn">${esc(action)}</button>` : ''}`;
  el.hidden = false;
  el.querySelector('button')?.addEventListener('click', () => {
    el.hidden = true;
    onAction();
  });
  if (!sticky) toastTimer = setTimeout(() => (el.hidden = true), action ? 6000 : 3000);
}
