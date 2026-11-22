// Practices: starting one (its timer starts with it), stopping it, starting one again from the log,
// and the names shown for instruments and practices.
import { state, set, put, remove, uid, instruments, runningEntries, spent, freeColor } from './store.js';
import { t } from './i18n.js';
import { toast, duration } from './dom.js';

export const instName = inst => (inst?.name || '').trim() || t('inst.' + (inst?.type || 'other'));

// what the log calls a practice: its description, or else its type
export const entryName = e => (e.text || '').trim() || t('type.' + (e.type || 'other'));

const nextOrder = list => (list.length ? Math.max(...list.map(i => i.order ?? 0)) + 1 : 0);

// Adds an instrument, in a colour no other one has. A removed one of the same type (never renamed)
// comes back instead, in its own colour unless another instrument has taken it meanwhile.
export function addInstrument(type) {
  const old = Object.values(state.data.instrument).find(i => !i.deleted && i.archived && i.type === type && !i.name);
  if (old) {
    const taken = instruments().some(i => i.color === old.color);
    return put('instrument', { ...old, archived: false, color: taken ? freeColor(type) : old.color, order: nextOrder(instruments()) });
  }
  return put('instrument', { id: uid('i'), type, name: '', color: freeColor(type), order: nextOrder(instruments()) });
}

const MIN_MS = 60000;

// Ends a running entry at `now`. Under a minute it's dropped: a tap by mistake leaves nothing behind.
function finish(e, now) {
  if (now - e.start < MIN_MS) {
    remove('entry', e.id);
    return false;
  }
  put('entry', { ...e, end: now });
  return true;
}

// Brings back entries as they were before a start or a stop: running again from their own start.
const resume = copies => copies.forEach(c => put('entry', { ...c, end: null }));

// Starts a practice and its timer. One runs at a time: the one running stops first and keeps its time.
// Undo (in the toast) takes it back: the new one goes, the stopped one runs on.
export function start({ instrumentId, type = 'other', text = '', link = '' }) {
  const stopped = runningEntries().map(e => ({ ...e }));
  const now = Date.now();
  stopped.forEach(e => finish(e, now));
  const e = put('entry', { id: uid('e'), instrumentId, type, text: text.trim().slice(0, 200), link, start: now, end: null });
  set({ instrumentId, type });
  toast(t('en.started', { name: entryName(e) }), t('undo'), () => {
    remove('entry', e.id);
    resume(stopped);
  });
  return e;
}

// A practice from the log, started again: the same instrument, type, description and link.
export const again = e => start({ instrumentId: e.instrumentId, type: e.type, text: e.text || '', link: e.link || '' });

export function stop() {
  const list = runningEntries().map(e => ({ ...e }));
  if (!list.length) return;
  const now = Date.now();
  const kept = list.map(e => finish(e, now))[0];
  const e = list[0];
  const message = kept ? t('en.logged', { name: entryName(e), d: duration(spent({ ...e, end: now }) / 60000) }) : t('en.tooShort');
  toast(message, t('undo'), () => resume(list));
}
