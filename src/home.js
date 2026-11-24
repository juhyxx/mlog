// The page, apart from the chart: the "now" panel (the practice that runs and its timer, or today's
// total and New practice) and the log of the last two weeks, newest first, by day. Tapping a practice
// in the log starts it again; tapping the one that runs stops it.
import { state, entries, running, spent, colorOfId } from './store.js';
import { today, addDays, dayOf, dayLabel } from './dates.js';
import { t } from './i18n.js';
import { esc, icon, duration, bigDuration, pipDuration, clock } from './dom.js';
import { instIcon } from './instIcons.js';
import { instName, again, stop } from './entries.js';
import { youtube } from './links.js';
import { openNew, openEdit } from './editor.js';

const STEP = 14; // days the log shows, and adds with "Show more"
let days = STEP;

const instOf = e => {
  const i = state.data.instrument[e.instrumentId];
  return i && !i.deleted ? i : null; // a removed (archived) instrument still has its name
};
// an instrument's icon, in its colour (--c), named by its tooltip
const instIco = (i, cls) =>
  `<span class="${cls}"${i ? ` role="img" aria-label="${esc(instName(i))}" title="${esc(instName(i))}"` : ' aria-hidden="true"'}>${instIcon(i?.type)}</span>`;

const minutesSince = from => entries().reduce((a, e) => (dayOf(e.start) >= from ? a + spent(e) : a), 0) / 60000;

// a link's button: plays a YouTube video in the docked player, opens anything else (links.js)
function linkButton(url, label) {
  const yt = youtube(url);
  const name = t(yt ? 'link.play' : 'link.open');
  return label
    ? `<button type="button" class="btn" data-video="${esc(url)}" title="${esc(url)}">${yt ? icon.play : icon.link}${esc(name)}</button>`
    : `<button type="button" class="btn icon flat" data-video="${esc(url)}" title="${esc(url)}" aria-label="${esc(name)}">${yt ? icon.play : icon.link}</button>`;
}

export function renderNow(el) {
  const e = running();
  const todayMin = minutesSince(today());
  if (e) {
    el.innerHTML = `
      <div class="lcd now-lcd" style="--c:${colorOfId(e.instrumentId)}">
        <p class="now-label"><span class="rec"><i></i>${esc(t('now.rec'))}</span></p>
        <h2 class="now-big" data-clock data-start="${e.start}">${clock(Date.now() - e.start)}</h2>
        <p class="now-what">${instIco(instOf(e), 'now-ico')}<span class="now-type">${esc(t('type.' + (e.type || 'other')))}</span>${e.text?.trim() ? `<span class="now-desc" title="${esc(e.text.trim())}">${esc(e.text.trim())}</span>` : ''}</p>
      </div>
      <div class="now-keys">
        <button type="button" class="btn start running" data-act="stop">${esc(t('now.stop'))}</button>
        ${e.link ? linkButton(e.link, true) : ''}
      </div>`;
    return;
  }
  el.innerHTML = `
    <div class="lcd now-lcd">
      <p class="now-label">${esc(t('now.todayLabel'))}</p>
      <h2 class="now-big">${bigDuration(todayMin)}</h2>
      <p class="now-meta">${esc(t('now.week', { d: duration(minutesSince(addDays(today(), -6))) }))}</p>
    </div>
    <div class="now-keys">
      <button type="button" class="btn start lit" data-act="new">${esc(t('now.new'))}</button>
      ${entries().length ? '' : `<p class="hint">${esc(t('now.hintFirst'))}</p>`}
    </div>`;
}

function row(e) {
  const run = !e.end;
  const i = instOf(e); // shown by its icon, in its colour
  const text = (e.text || '').trim();
  return `
    <div class="entry${run ? ' running' : ''}" style="--c:${colorOfId(e.instrumentId)}">
      <button type="button" class="entry-main" data-act="${run ? 'stop' : 'again'}" data-id="${esc(e.id)}" title="${esc(t(run ? 'en.stopHint' : 'en.again'))}">
        ${instIco(i, 'entry-ico')}
        <span class="entry-body">
          <span class="entry-name">${esc(t('type.' + (e.type || 'other')))}</span>
          ${text ? `<span class="entry-desc" title="${esc(text)}">${esc(text)}</span>` : ''}
        </span>
        <span class="entry-time">${run ? livePips(e.start, Date.now()) : pipDuration(spent(e) / 60000)}</span>
      </button>
      ${e.link ? linkButton(e.link) : ''}
      <button type="button" class="btn icon flat" data-act="edit" data-id="${esc(e.id)}" aria-label="${esc(t('en.edit'))}" title="${esc(t('en.edit'))}">${icon.edit}</button>
    </div>`;
}

function dayName(d) {
  const t0 = today();
  if (d === t0) return t('log.today');
  if (d === addDays(t0, -1)) return t('log.yesterday');
  return '';
}

export function renderLog(el) {
  const all = entries().sort((a, b) => b.start - a.start);
  if (!all.length) {
    el.innerHTML = `
      <div class="empty-box">
        <h3>${esc(t('welcome.title'))}</h3>
        <p>${esc(t('welcome.text'))}</p>
        <p class="hint">${esc(t('welcome.local'))}</p>
      </div>`;
    return;
  }
  const from = addDays(today(), -(days - 1));
  const byDay = new Map();
  for (const e of all) {
    const d = dayOf(e.start);
    if (d < from) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }
  const older = all.some(e => dayOf(e.start) < from);
  const groups = [...byDay].map(([d, list]) => {
    const name = dayName(d);
    return `
      <section class="day">
        <h4 class="day-head">${name ? `<b>${esc(name)}</b>` : ''}<span>${esc(dayLabel(d))}</span>
          <output>${esc(duration(list.reduce((a, e) => a + spent(e), 0) / 60000))}</output></h4>
        <div class="entries">${list.map(row).join('')}</div>
      </section>`;
  }).join('');
  el.innerHTML = `
    <div class="block-head">
      <h3 class="module-label">${esc(t('log.title'))} <span class="dim">· ${esc(t('log.range', { n: days / 7 }))}</span></h3>
    </div>
    <p class="hint">${esc(t('log.hint'))}</p>
    ${groups || `<p class="empty">${esc(t('log.none'))}</p>`}
    ${older ? `<button type="button" class="btn more" data-act="more">${esc(t('log.more'))}</button>` : ''}`;
}

// Every second while a practice runs (main.js): its clocks, and the page title.
// the squares of the practice that runs; tick() redraws them when its minute changes
const runMin = (start, now) => Math.floor((now - start) / 60000);
const livePips = (start, now) =>
  `<span data-pips data-start="${start}" data-min="${runMin(start, now)}">${pipDuration(runMin(start, now), true)}</span>`;

export function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-clock][data-start]').forEach(c => (c.textContent = clock(now - Number(c.dataset.start))));
  document.querySelectorAll('[data-pips][data-start]').forEach(p => {
    const min = runMin(Number(p.dataset.start), now);
    if (String(min) !== p.dataset.min) p.outerHTML = livePips(Number(p.dataset.start), now);
  });
  const e = running();
  document.title = e ? `● ${clock(now - e.start)} · Mlog` : 'Mlog';
}

export function mountHome(root, rerender) {
  root.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]');
    if (!b || !root.contains(b) || b.disabled) return;
    const e = b.dataset.id ? state.data.entry[b.dataset.id] : null;
    switch (b.dataset.act) {
      case 'new':
        openNew();
        break;
      case 'stop':
        stop();
        break;
      case 'again':
        if (e && !e.deleted) again(e);
        break;
      case 'edit':
        if (e && !e.deleted) openEdit(e.id);
        break;
      case 'more':
        days += STEP;
        rerender();
        break;
    }
  });
}
