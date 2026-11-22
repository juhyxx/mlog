// The practice dialog. New: pick the instrument and the type, write what it is, add a link, and
// Start starts it with its timer. Edit: the same fields, plus the day and the minutes of a finished
// practice (for a timer left running, or one stopped late), and Delete.
//
// Instruments: one grid, your own first (in their colours), then the rest of the ready-made ones;
// picking one of those adds it when the practice starts.
import { state, put, remove, instruments, entryById, colorOf, freeColor } from './store.js';
import { INSTRUMENTS, TYPES, COLORS } from './presets.js';
import { today, dayOf, parse, timeOf } from './dates.js';
import { t } from './i18n.js';
import { esc, icon, radios, toast } from './dom.js';
import { instIcon } from './instIcons.js';
import { instName, entryName, addInstrument, start } from './entries.js';
import { cleanUrl, readClipboardUrl } from './links.js';

let dialog = null;
let editing = null; // the id of the entry being edited, or null for a new one

// color: the instrument's colour, in which its icon shows (a ready-made one: the colour it will get)
const instLabel = (type, name, color) => `<span class="tag${color ? ' own' : ''}"${color ? ` style="--c:${color}"` : ''}>${instIcon(type)}</span><span>${esc(name)}</span>`;

function instrumentField(chosenId) {
  const mine = instruments();
  // an edited entry keeps its instrument even if it was removed since
  const own = state.data.instrument[chosenId];
  if (own && !own.deleted && own.archived) mine.push(own);
  const owned = new Set(mine.map(i => i.type));
  const current = mine.some(i => i.id === chosenId) ? 'id:' + chosenId : mine.length ? 'id:' + mine[0].id : '';
  const key = (value, label, mineToo) => `
    <label class="preset toggle${mineToo ? ' mine' : ''}"><input type="radio" name="inst" value="${esc(value)}"${value === current ? ' checked' : ''}>${label}</label>`;
  const keys = [
    ...mine.map(i => key('id:' + i.id, instLabel(i.type, instName(i), colorOf(i)), true)),
    ...INSTRUMENTS.filter(type => !owned.has(type)).map(type => key('type:' + type, instLabel(type, t('inst.' + type), COLORS[freeColor(type)]))),
  ];
  return `
    <fieldset class="module"><legend class="module-label">${esc(t(mine.length ? 'ed.instrument' : 'ed.pickInst'))}</legend>
      <div class="preset-grid inst-grid">${keys.join('')}</div>
    </fieldset>`;
}

function body(e) {
  const isNew = !e;
  const finished = e && e.end;
  const type = TYPES.includes(e?.type) ? e.type : TYPES.includes(state.type) ? state.type : 'other';
  return `
    <form class="dialog-body entry-form" novalidate>
      <header><h2>${esc(t(isNew ? 'ed.new' : 'ed.edit'))}</h2>
        <button type="button" class="btn icon" data-act="close" aria-label="${esc(t('close'))}">${icon.close}</button></header>
      ${instrumentField(e ? e.instrumentId : state.instrumentId)}
      <fieldset class="module"><legend class="module-label">${esc(t('ed.type'))}</legend>
        ${radios('type', TYPES.map(k => [k, esc(t('type.' + k))]), type, 'wrap')}
      </fieldset>
      <label class="module"><span class="module-label">${esc(t('ed.text'))}</span>
        <input class="field" name="text" maxlength="200" autocomplete="off" enterkeyhint="go" placeholder="${esc(t('ed.textPh'))}" value="${esc(e?.text || '')}"></label>
      <div class="module"><label class="module-label" for="ed-link">${esc(t('ed.link'))}</label>
        <div class="field-row">
          <input class="field" id="ed-link" name="link" type="url" inputmode="url" autocomplete="off" enterkeyhint="go" placeholder="${esc(t('ed.linkPh'))}" value="${esc(e?.link || '')}">
          <button type="button" class="btn icon" data-act="paste" aria-label="${esc(t('link.paste'))}" title="${esc(t('link.paste'))}">${icon.paste}</button>
        </div></div>
      ${finished ? `
      <div class="module-row when">
        <label class="module"><span class="module-label">${esc(t('ed.date'))}</span>
          <input class="field" name="date" type="date" max="${today()}" value="${dayOf(e.start)}" required></label>
        <label class="module"><span class="module-label">${esc(t('ed.minutes'))}</span>
          <input class="field" name="minutes" type="number" inputmode="numeric" min="1" max="1440" step="1" value="${Math.max(1, Math.round((e.end - e.start) / 60000))}" required></label>
      </div>` : ''}
      ${e && !e.end ? `<p class="hint">${esc(t('ed.running', { time: timeOf(e.start) }))}</p>` : ''}
      <p class="form-error" data-error hidden></p>
      <div class="dialog-actions">
        ${isNew
          ? `<button type="submit" class="btn start lit">${esc(t('ed.start'))}</button>`
          : `<button type="submit" class="btn lit">${esc(t('ed.save'))}</button>
             <span class="spacer"></span>
             <button type="button" class="btn danger" data-act="delete">${icon.trash}${esc(t('ed.delete'))}</button>`}
      </div>
    </form>`;
}

function fail(key) {
  const el = dialog.querySelector('[data-error]');
  el.textContent = t(key);
  el.hidden = false;
}

function submit() {
  const form = dialog.querySelector('form');
  const f = new FormData(form);
  const inst = String(f.get('inst') || '');
  if (!inst) return fail('ed.needInst');
  const rawLink = String(f.get('link') || '').trim();
  const link = rawLink ? cleanUrl(rawLink) : '';
  if (link === null) return fail('link.invalid');
  const type = TYPES.includes(f.get('type')) ? f.get('type') : 'other';
  const text = String(f.get('text') || '').trim().slice(0, 200);

  const e = editing ? entryById(editing) : null;
  if (editing && !e) return dialog.close(); // deleted meanwhile (another device)
  let when = {};
  if (e?.end) {
    const date = String(f.get('date') || '');
    const minutes = Math.round(Number(f.get('minutes')));
    if (!date || date > today() || !(minutes >= 1 && minutes <= 1440)) return fail('ed.badTime');
    // the same time of day, on the day chosen
    const s = parse(date);
    const was = new Date(e.start);
    s.setHours(was.getHours(), was.getMinutes(), was.getSeconds(), was.getMilliseconds());
    when = { start: s.getTime(), end: s.getTime() + minutes * 60000 };
  }
  const instrumentId = inst.startsWith('type:') ? addInstrument(inst.slice(5)).id : inst.slice(3);
  dialog.close();
  if (e) put('entry', { ...e, instrumentId, type, text, link, ...when });
  else start({ instrumentId, type, text, link });
}

function open(e) {
  editing = e?.id || null;
  dialog.innerHTML = body(e);
  dialog.showModal();
}

// prefill: { link } for a link shared to the app
export function openNew(prefill = {}) {
  open(null);
  if (prefill.link) dialog.querySelector('[name="link"]').value = prefill.link;
}

export function openEdit(id) {
  const e = entryById(id);
  if (e) open(e);
}

export function mountEditor(el) {
  dialog = el;
  el.addEventListener('submit', e => {
    e.preventDefault();
    submit();
  });
  el.addEventListener('click', async e => {
    if (e.target === el) return el.close(); // the backdrop
    const b = e.target.closest('[data-act]');
    if (!b) return;
    switch (b.dataset.act) {
      case 'close':
        el.close();
        break;
      case 'paste': {
        const input = el.querySelector('[name="link"]');
        const url = await readClipboardUrl();
        if (url) input.value = url;
        else {
          toast(t('link.pasteFail'));
          input.focus();
        }
        break;
      }
      case 'delete': {
        const entry = entryById(editing);
        el.close();
        if (!entry) break;
        remove('entry', entry.id);
        toast(t('en.deleted', { name: entryName(entry) }), t('undo'), () => put('entry', entry));
        break;
      }
    }
  });
  // a link pasted into its field is cleaned up straight away (shared text often wraps it in a title)
  el.addEventListener('paste', e => {
    if (e.target.name !== 'link') return;
    const url = cleanUrl(e.clipboardData?.getData('text'));
    if (!url) return;
    e.preventDefault();
    e.target.value = url;
  });
  el.addEventListener('close', () => (el.innerHTML = ''));
}
