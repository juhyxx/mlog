// App state in one object, kept in localStorage: the practice data, preferences and the backup
// bookkeeping. The data is records, each with an id and the time it was last changed (updatedAt), so a
// backup file can be merged in, newest change winning (backup.js).
//
//   instrument  { id, type, name, color, order, archived }   type: a key of INSTRUMENTS, name: the
//               player's own, color: a key of COLORS
//   entry       { id, instrumentId, type, text, link, start, end }   one practice; start and end in ms,
//               end null while its timer runs
//
// A deleted record stays as a tombstone ({ id, deleted: true }), so merging a backup doesn't bring it back.
// 'session' and 'item' are the first version's day sessions and checklist items. They're still kept
// and backed up so nothing is lost, and migrate() turns each session into an entry.
import { parse, isDay } from './dates.js';
import { TYPES, COLORS, COLOR_KEYS, NO_COLOR, typeColor } from './presets.js';

const KEY = 'mlog:v1';
export const KINDS = ['instrument', 'entry', 'session', 'item'];
export const validId = id => typeof id === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(id);

const PREFS = {
  lang: 'auto',
  instrumentId: null, // the last instrument practised, chosen first for a new practice
  type: 'other', // likewise the last type of practice
  chartBy: 'day', // the chart's bars: 'day' | 'month' | 'year'
};
// backups (backup.js): when the last one was made, the day of the last reminder, the backup file's name
// and when it was last written
const BACKUP = { last: 0, nagged: '', file: '', fileAt: 0 };

function load() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch { /* unreadable or unavailable storage: start empty */ }
  const data = {};
  for (const k of KINDS) data[k] = { ...saved.data?.[k] };
  const prefs = {};
  for (const k of Object.keys(PREFS)) prefs[k] = k in saved ? saved[k] : PREFS[k];
  return {
    ...prefs,
    data,
    backup: { ...BACKUP, ...saved.backup, fileStatus: 'off', fileError: '' },
  };
}

export const state = load();

function save() {
  const out = { data: state.data, backup: {} };
  for (const k of Object.keys(PREFS)) out[k] = state[k];
  for (const k of Object.keys(BACKUP)) out.backup[k] = state.backup[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch { /* storage full or unavailable: the change still holds for this session */ }
}

const listeners = new Set();
export const subscribe = fn => listeners.add(fn);
const emit = patch => listeners.forEach(fn => fn(patch));

let afterPut = () => {};
export const onPut = fn => (afterPut = fn); // main.js: schedule a write of the backup file

export function set(patch) {
  Object.assign(state, patch);
  save();
  emit(patch);
}

export function setBackup(patch, { quiet = false } = {}) {
  Object.assign(state.backup, patch);
  save();
  if (!quiet) emit({ backup: true });
}

// Saves a record. updatedAt always moves forward, even past a clock that's behind the last change.
// quiet: no re-render.
export function put(kind, rec, { quiet = false } = {}) {
  const prev = state.data[kind][rec.id];
  const r = { ...rec, updatedAt: Math.max(Date.now(), (prev?.updatedAt || 0) + 1) };
  state.data[kind][r.id] = r;
  save();
  if (!quiet) emit({ data: kind });
  afterPut();
  return r;
}

export const remove = (kind, id) => put(kind, { id, deleted: true });

// Records from a backup file: a record replaces ours only when it's newer.
export function merge(records) {
  let changed = 0;
  for (const r of records || []) {
    if (!KINDS.includes(r?.kind) || !validId(r.id) || !Number.isFinite(r.updatedAt)) continue;
    const local = state.data[r.kind][r.id];
    if (local && local.updatedAt >= r.updatedAt) continue;
    const rec = r.deleted ? { id: r.id, deleted: true } : { ...(r.data && typeof r.data === 'object' ? r.data : {}), id: r.id };
    delete rec.updatedAt;
    rec.updatedAt = r.updatedAt;
    if (!r.deleted) delete rec.deleted;
    state.data[r.kind][r.id] = rec;
    changed++;
  }
  if (changed) {
    migrate();
    save();
    emit({ data: 'merge' });
    afterPut();
  }
  return changed;
}

// Every record, for a backup file.
export function allRecords() {
  const out = [];
  for (const kind of KINDS) {
    for (const r of Object.values(state.data[kind])) {
      const { updatedAt, deleted, ...data } = r;
      out.push({ kind, id: r.id, updatedAt, deleted: Boolean(deleted), data });
    }
  }
  return out;
}

export function uid(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return prefix + Array.from(bytes, b => (b % 36).toString(36)).join('');
}

// ---------------------------------------------------------------- queries

const live = r => r && !r.deleted;
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name));

// the instruments to choose from (a removed one is archived: its practices keep their instrument)
export const instruments = () => Object.values(state.data.instrument).filter(i => live(i) && !i.archived).sort(byOrder);
export const instrumentById = id => (live(state.data.instrument[id]) ? state.data.instrument[id] : null);

// an instrument's colour (hex); a removed instrument keeps its own, one that's gone is grey
export const colorOf = inst => (inst && !inst.deleted && COLORS[inst.color]) || NO_COLOR;
export const colorOfId = id => colorOf(state.data.instrument[id]);

// The colour for a new instrument: its type's own (typeColor) when no other instrument in use has it,
// else the first in COLORS that none has; when all are taken, the least used. except: the instrument
// itself.
export function freeColor(type = null, except = null) {
  const used = {};
  for (const i of instruments()) if (i.id !== except && COLORS[i.color]) used[i.color] = (used[i.color] || 0) + 1;
  if (type && !used[typeColor(type)]) return typeColor(type);
  return COLOR_KEYS.find(k => !used[k]) || [...COLOR_KEYS].sort((a, b) => (used[a] || 0) - (used[b] || 0))[0];
}

export const entries = () => Object.values(state.data.entry).filter(e => live(e) && Number.isFinite(e.start));
export const entryById = id => (live(state.data.entry[id]) ? state.data.entry[id] : null);

// Entries whose timer runs, newest first. One runs at a time, but two devices may each have started one.
export const runningEntries = () => entries().filter(e => !e.end).sort((a, b) => b.start - a.start);
export const running = () => runningEntries()[0] || null;

// how long a finished entry took, in ms (0 while it runs)
export const spent = e => (e.end ? Math.max(0, e.end - e.start) : 0);

// ---------------------------------------------------------------- older data

// Instruments from before colours get one each, in their order (the same on every device).
function colorInstruments() {
  const all = Object.values(state.data.instrument).filter(i => live(i) && !COLORS[i.color]);
  all.sort((a, b) => Number(Boolean(a.archived)) - Number(Boolean(b.archived)) || byOrder(a, b) || a.id.localeCompare(b.id));
  for (const i of all) put('instrument', { ...i, color: freeColor(null, i.id) }, { quiet: true });
}

// A session (one day on one instrument, with the minutes, the checklist items done and links) becomes
// an entry. Its id comes from the session's, so every device makes the same entry, and one that was
// made (or deleted) isn't made again. The time of day wasn't kept: it's noon, and the log doesn't show it.
export function migrate() {
  colorInstruments();
  let n = 0;
  for (const s of Object.values(state.data.session)) {
    const id = 'e-' + s.id;
    if (!live(s) || !(s.minutes > 0) || !isDay(s.date) || !validId(id) || state.data.entry[id]) continue;
    const done = Object.entries(s.done && typeof s.done === 'object' ? s.done : {})
      .map(([itemId, d]) => ({ name: String(d?.name || state.data.item[itemId]?.name || ''), type: state.data.item[itemId]?.category }));
    const start = parse(s.date).getTime() + 12 * 3600e3;
    put('entry', {
      id,
      instrumentId: s.instrumentId,
      type: done.find(d => TYPES.includes(d.type))?.type || 'other',
      text: done.map(d => d.name).filter(Boolean).join(', ').slice(0, 200),
      link: Array.isArray(s.links) && typeof s.links[0] === 'string' ? s.links[0] : '',
      start,
      end: start + s.minutes * 60000,
      noTime: true,
    }, { quiet: true });
    n++;
  }
  return n;
}
