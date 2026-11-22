// Backups, for a log that lives only in this browser:
// - asking the browser to keep the data (navigator.storage.persist), and saying in Settings whether it will;
// - a backup file to export and import. On phones Export opens the share sheet, so the file can go
//   straight to iCloud Drive, Files or AirDrop; elsewhere it downloads. Import merges, newest record wins;
// - a reminder once a day when changes have waited a week with nothing keeping them (no backup file);
// - on desktop Chrome and Edge, a backup file Mlog saves to after every change (the File System Access
//   API). Kept in iCloud Drive or Dropbox, it goes to the cloud. Each write first merges in what the file
//   holds, so several computers can share one file.
import { state, setBackup, allRecords, merge } from './store.js';
import { t, current } from './i18n.js';
import { today } from './dates.js';
import { toast } from './dom.js';

const DAY = 864e5;
const REMIND_AFTER = 7 * DAY;

// ---------------------------------------------------------------- the file

const backupJson = () => JSON.stringify({ app: 'mlog', format: 1, exported: new Date().toISOString(), records: allRecords() }, null, 1);

function readBackup(text) {
  const data = JSON.parse(text);
  if (data?.app !== 'mlog' || !Array.isArray(data.records)) throw new Error('format');
  return data.records;
}

// what a set of records holds, to tell whether the backup file already has everything
const signature = records => records.map(r => `${r.kind}/${r.id}@${r.updatedAt}`).sort().join();

function newest() {
  let n = 0;
  for (const recs of Object.values(state.data)) for (const r of Object.values(recs)) n = Math.max(n, r.updatedAt || 0);
  return n;
}

// the oldest change that isn't in a backup yet; 0 when everything is
function unsavedSince() {
  let oldest = 0;
  for (const recs of Object.values(state.data)) {
    for (const r of Object.values(recs)) if (r.updatedAt > state.backup.last && (!oldest || r.updatedAt < oldest)) oldest = r.updatedAt;
  }
  return oldest;
}

const backedUp = () => setBackup({ last: Math.max(Date.now(), newest()) });

// "today 14:05", "yesterday", "3 days ago", in the app's language
export function ago(ms) {
  const midnight = x => new Date(x).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(Date.now()) - midnight(ms)) / DAY);
  const rel = new Intl.RelativeTimeFormat(current(), { numeric: 'auto' }).format(-days, 'day');
  return days ? rel : `${rel} ${new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; // the clock as the sync line shows it
}

export const lastText = () => (state.backup.last ? t('backup.last', { when: ago(state.backup.last) }) : t('backup.never'));

// ---------------------------------------------------------------- keeping the data

let asked = false;

// Asks once there's something to keep. Chrome decides by itself; Firefox asks the user, once.
export async function keepData() {
  if (asked || !navigator.storage?.persist || !Object.keys(state.data.instrument).length) return;
  asked = true;
  try {
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* not allowed here */ }
}

const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Safari deletes a site's storage after 7 days without a visit, except for apps on the Home Screen.
export async function storageNote() {
  if (ios() && !installed()) return t('backup.ios');
  try {
    if (await navigator.storage?.persisted?.()) return t('backup.kept');
  } catch { /* unknown */ }
  return t('backup.mayClear');
}

// ---------------------------------------------------------------- export, import, reminder

const fileOn = () => ['ok', 'busy'].includes(state.backup.fileStatus);

// Nothing else keeps the data (no backup file) and a change has waited a week.
export function overdue() {
  if (fileOn()) return false;
  const since = unsavedSince();
  return Boolean(since) && Date.now() - since > REMIND_AFTER;
}

// the LED on the Settings button: green while the backup file is kept, yellow when a backup is due or
// the file needs permission, red when it can't be used
export function backupLed() {
  const f = state.backup.fileStatus;
  if (fileOn()) return 'ok';
  if (f === 'error') return 'error';
  return f === 'paused' || overdue() ? 'warn' : 'off';
}

export const shares = () => matchMedia('(pointer: coarse)').matches && Boolean(navigator.canShare);

function download(text, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Runs from a click: the share sheet needs one.
export async function exportBackup() {
  const text = backupJson();
  const name = `mlog-${today()}.json`;
  if (shares()) {
    // Chrome on Android won't share JSON files, but takes them as text
    for (const type of ['application/json', 'text/plain']) {
      const file = new File([text], name, { type });
      if (!navigator.canShare({ files: [file] })) continue;
      try {
        await navigator.share({ files: [file] });
        backedUp();
        toast(t('backup.done'));
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // the share sheet was closed
        break; // download it instead
      }
    }
  }
  download(text, name);
  backedUp();
  toast(t('backup.done'));
}

export async function importBackup(file) {
  try {
    const n = merge(readBackup(await file.text()));
    toast(t('backup.imported', { n }));
  } catch {
    toast(t('backup.bad'));
  }
}

let pausedShown = false;

// After start and when the app comes back to the front.
export function remind() {
  const b = state.backup;
  if (b.fileStatus === 'paused' && !pausedShown) {
    pausedShown = true; // the browser forgets the permission when it restarts: one click brings it back
    toast(t('backup.filePausedToast'), t('backup.fileAllow'), resumeFile);
    return;
  }
  if (b.nagged === today() || !overdue()) return;
  setBackup({ nagged: today() }, { quiet: true });
  toast(lastText(), t('backup.now'), exportBackup);
}

// ---------------------------------------------------------------- the backup file (desktop Chrome, Edge)

export const fileSupported = () => 'showSaveFilePicker' in window;

let handle = null;
let running = null;
let again = false;
let timer = 0;

// The file's handle lives in IndexedDB between visits: localStorage can only hold text.
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('mlog', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('handles');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('handles', mode);
      const req = fn(tx.objectStore('handles'));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
const storeHandle = h => idb('readwrite', s => (h ? s.put(h, 'backup') : s.delete('backup'))).catch(() => {});

// ask: from a click, so the browser may ask the user
async function allowed(ask) {
  const opts = { mode: 'readwrite' };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (ask && (await handle.requestPermission(opts)) === 'granted') return true;
  } catch { /* no click to ask with */ }
  setBackup({ fileStatus: 'paused', fileError: '' });
  return false;
}

// Reads the file, merges in what's newer there, and writes everything back if the file lacks anything.
export function fileSync() {
  if (!handle) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  clearTimeout(timer);
  running = (async () => {
    try {
      if (!(await allowed(false))) return;
      setBackup({ fileStatus: 'busy', fileError: '' }, { quiet: true });
      const text = await (await handle.getFile()).text();
      const theirs = text.trim() ? readBackup(text) : []; // never overwrite a file that isn't a backup
      merge(theirs);
      if (!text.trim() || signature(theirs) !== signature(allRecords())) {
        const w = await handle.createWritable(); // written aside, swapped in on close
        await w.write(backupJson());
        await w.close();
      }
      const now = Date.now();
      setBackup({ fileStatus: 'ok', fileAt: now, last: Math.max(now, newest()) });
    } catch (e) {
      setBackup({ fileStatus: 'error', fileError: e.message === 'format' ? 'format' : e.name || 'error' });
    } finally {
      running = null;
      if (again) {
        again = false;
        scheduleFile(300);
      }
    }
  })();
  return running;
}

export function scheduleFile(delay = 2000) {
  if (!handle) return;
  clearTimeout(timer);
  timer = setTimeout(fileSync, delay);
}

const TYPES = [{ description: 'Mlog backup', accept: { 'application/json': ['.json'] } }];

// existing: pick a backup file another computer writes, instead of making a new one
export async function linkFile(existing) {
  let h;
  try {
    h = existing
      ? (await window.showOpenFilePicker({ id: 'mlog', types: TYPES }))[0]
      : await window.showSaveFilePicker({ id: 'mlog', suggestedName: 'mlog.json', types: TYPES });
  } catch {
    return; // cancelled
  }
  handle = h;
  await storeHandle(h);
  setBackup({ file: h.name, fileAt: 0 });
  if (!(await allowed(true))) return;
  await fileSync();
  if (state.backup.fileStatus === 'ok') toast(t('backup.linked', { name: h.name }));
}

export async function resumeFile() {
  if (handle && (await allowed(true))) await fileSync();
}

export async function unlinkFile() {
  handle = null;
  clearTimeout(timer);
  await storeHandle(null);
  setBackup({ file: '', fileAt: 0, fileStatus: 'off', fileError: '' });
}

export async function startBackup() {
  keepData();
  if (!fileSupported()) return;
  try {
    handle = (await idb('readonly', s => s.get('backup'))) || null;
  } catch {
    handle = null;
  }
  if (handle) await fileSync();
  else if (state.backup.file) setBackup({ file: '' }, { quiet: true });
}
