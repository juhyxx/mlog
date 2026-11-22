// The page, apart from the chart: the "now" panel (the practice that runs and its timer, or today's
// total and New practice) and the log of the last two weeks, newest first, by day. Tapping a practice
// in the log starts it again; tapping the one that runs stops it.
import { state, entries, running, spent, colorOfId } from './store.js';
import { today, addDays, dayOf, dayLabel, timeOf } from './dates.js';
import { t } from './i18n.js';
import { esc, icon, duration, bigDuration, clock } from './dom.js';
import { instIcon } from './instIcons.js';
import { instName, entryName, again, stop } from './entries.js';
import { youtube } from './links.js';
import { openNew, openEdit } from './editor.js';

const STEP = 14; // days the log shows, and adds with "Show more"
let days = STEP;

const instOf = e => {
  const i = state.data.instrument[e.instrumentId];
  return i && !i.deleted ? i : null; // a removed (archived) instrument still has its name
};
const instTag = e => {
  const i = instOf(e);
  return `<span class="mini-ico">${instIcon(i?.type)}</span>${esc(i ? instName(i) : '')}`;
};

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
        <p class="now-label"><span class="rec"><i></i>${esc(t('now.rec'))}</span><span>${esc(t('now.since', { time: timeOf(e.start) }))}</span>
          <span class="now-today">${esc(t('now.today', { d: duration(todayMin) }))}</span></p>
        <h2 class="now-big" data-clock data-start="${e.start}">${clock(Date.now() - e.start)}</h2>
        <p class="now-what"><span class="led on" aria-hidden="true"></span><span>${esc(entryName(e))}</span></p>
        <p class="now-meta">${e.text ? `${esc(t('type.' + e.type))} · ` : ''}${instTag(e)}</p>
      </div>
      <div class="now-keys">
        <button type="button" class="btn start running" data-act="stop">${esc(t('now.stop'))}</button>
        ${e.link ? linkButton(e.link, true) : ''}
        <button type="button" class="btn" data-act="new">${icon.plus}${esc(t('now.new'))}</button>
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
  const meta = [];
  if (e.text) meta.push(esc(t('type.' + e.type)));
  meta.push(instTag(e));
  if (!e.noTime) meta.push(esc(timeOf(e.start)));
  return `
    <div class="entry${run ? ' running' : ''}" style="--c:${colorOfId(e.instrumentId)}">
      <button type="button" class="entry-main" data-act="${run ? 'stop' : 'again'}" data-id="${esc(e.id)}" title="${esc(t(run ? 'en.stopHint' : 'en.again'))}">
        <span class="led on" aria-hidden="true"></span>
        <span class="entry-body">
          <span class="entry-name">${esc(entryName(e))}</span>
          <span class="entry-meta">${meta.map(m => `<span>${m}</span>`).join(' · ')}</span>
        </span>
        <span class="entry-again" aria-hidden="true">${icon.again}</span>
        <span class="entry-time">${run ? `<span class="rec"><i></i><span data-clock data-start="${e.start}">${clock(Date.now() - e.start)}</span></span>` : esc(duration(spent(e) / 60000))}</span>
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
export function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-clock][data-start]').forEach(c => (c.textContent = clock(now - Number(c.dataset.start))));
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
