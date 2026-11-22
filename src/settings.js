// Settings dialog: language, instruments (name, colour, remove) and backup. Changes apply at once.
import { state, set, put, subscribe, instruments, colorOf } from './store.js';
import { LANGS, t, detect } from './i18n.js';
import { esc, icon, toast } from './dom.js';
import { instIcon } from './instIcons.js';
import { instName } from './entries.js';
import { VERSION } from './version.js';
import {
  lastText, ago, backupLed, overdue, shares, storageNote, exportBackup, importBackup,
  fileSupported, linkFile, resumeFile, unlinkFile,
} from './backup.js';

// Instruments are added in New practice; each gets its colour then. Removing one archives it: its
// practices keep its name and colour.
function instSection() {
  const list = instruments();
  if (!list.length) return `<p class="hint">${esc(t('set.noInst'))}</p>`;
  return `${list.map(i => `
    <div class="inst-row" style="--c:${colorOf(i)}">
      <span class="tag">${instIcon(i.type)}</span>
      <input class="field" data-rename="${esc(i.id)}" maxlength="40" value="${esc(i.name || '')}" placeholder="${esc(t('inst.' + i.type))}" aria-label="${esc(t('set.instName'))}">
      <button type="button" class="btn icon" data-act="inst-remove" data-val="${esc(i.id)}" aria-label="${esc(t('set.instRemove'))}" title="${esc(t('set.instRemove'))}">${icon.trash}</button>
    </div>`).join('')}
    <p class="hint">${esc(t('set.instHint'))}</p>`;
}

function body() {
  const langs = [['auto', t('set.langAuto', { name: LANGS[detect()] })], ...Object.entries(LANGS)];
  return `
    <form method="dialog" class="dialog-body settings" novalidate>
      <header><h2>${esc(t('set.title'))}</h2><button type="submit" class="btn icon" value="close" aria-label="${esc(t('close'))}">${icon.close}</button></header>
      <label class="module"><span class="module-label">${esc(t('set.language'))}</span>
        <select data-key="lang">${langs.map(([v, l]) => `<option value="${esc(v)}"${state.lang === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <fieldset class="module group"><legend class="module-label">${esc(t('set.instruments'))}</legend><div class="sync-box inst-box">${instSection()}</div></fieldset>
      <fieldset class="module group"><legend class="module-label">${esc(t('backup.title'))}</legend><div class="sync-box backup-box">${backupSection()}</div></fieldset>
      <p class="module-label dim">MLOG ${esc(VERSION)}</p>
    </form>`;
}

const FILE_LED = { ok: 'ok', busy: 'busy', paused: 'warn', error: 'error', off: 'busy' };

// the backup file Mlog saves to after each change (desktop Chrome and Edge only)
function fileSection() {
  const b = state.backup;
  if (!b.file) {
    return `
      <div class="module sub"><span class="module-label">${esc(t('backup.file'))}</span>
        <p class="hint">${esc(t('backup.fileHint'))}</p>
        <div class="module-row wrap">
          <button type="button" class="btn" data-act="file-new">${esc(t('backup.fileNew'))}</button>
          <button type="button" class="btn" data-act="file-open">${esc(t('backup.fileOpen'))}</button>
        </div></div>`;
  }
  const errKey = 'backup.err.' + b.fileError;
  const status = {
    ok: b.fileAt ? t('backup.fileSaved', { time: ago(b.fileAt) }) : t('backup.fileBusy'),
    paused: t('backup.filePaused'),
    error: t('backup.fileError', { e: t(errKey) === errKey ? b.fileError : t(errKey) }),
  }[b.fileStatus] || t('backup.fileBusy');
  return `
    <div class="module sub"><span class="module-label">${esc(t('backup.file'))}</span>
      <p class="sync-line"><i class="sync-led" data-status="${FILE_LED[b.fileStatus] || 'off'}"></i><span><b>${esc(b.file)}</b> · ${esc(status)}</span></p>
      <div class="module-row wrap">
        ${b.fileStatus === 'paused' ? `<button type="button" class="btn lit" data-act="file-allow">${esc(t('backup.fileAllow'))}</button>` : ''}
        ${b.fileStatus === 'error' ? `<button type="button" class="btn" data-act="file-new">${esc(t('backup.fileNew'))}</button><button type="button" class="btn" data-act="file-open">${esc(t('backup.fileOpen'))}</button>` : ''}
        <button type="button" class="btn" data-act="file-stop">${esc(t('backup.fileStop'))}</button>
      </div></div>`;
}

function backupSection() {
  return `
    <p class="sync-line"><i class="sync-led" data-status="${backupLed()}"></i><span>${esc(lastText())}</span></p>
    <p class="hint">${esc(t('backup.hint'))}${shares() ? ' ' + esc(t('backup.hintShare')) : ''}</p>
    <p class="hint" data-storage></p>
    <div class="module-row wrap">
      <button type="button" class="btn${overdue() ? ' lit' : ''}" data-act="export">${esc(t('backup.export'))}</button>
      <label class="btn">${esc(t('backup.import'))}<input type="file" accept="application/json,.json,text/plain" data-act="import" hidden></label>
    </div>
    ${fileSupported() ? fileSection() : ''}`;
}

// whether the browser keeps the data, which it answers asynchronously
const fillStorage = dialog => storageNote().then(text => {
  const el = dialog.querySelector('[data-storage]');
  if (el) el.textContent = text;
});

export function mountSettings(dialog, opener) {
  const fill = () => {
    dialog.innerHTML = body();
    fillStorage(dialog);
  };
  const fillBackup = () => {
    dialog.querySelector('.backup-box').innerHTML = backupSection();
    fillStorage(dialog);
  };
  // not while a name is being typed: it would lose the caret
  const fillInstruments = () => {
    const box = dialog.querySelector('.inst-box');
    if (!box.contains(document.activeElement) || !document.activeElement.dataset.rename) box.innerHTML = instSection();
  };
  opener.addEventListener('click', () => {
    fill();
    dialog.showModal();
  });
  // the backup line follows the backups while the dialog is open
  subscribe(patch => {
    if (!dialog.open) return;
    if (patch.backup || patch.data) fillBackup();
    if (patch.data) fillInstruments();
  });
  dialog.addEventListener('click', async e => {
    if (e.target === dialog) return dialog.close(); // the backdrop
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    switch (b.dataset.act) {
      case 'inst-remove': {
        const inst = state.data.instrument[b.dataset.val];
        if (!inst) break;
        put('instrument', { ...inst, archived: true });
        toast(t('set.instRemoved', { name: instName(inst) }), t('undo'), () => put('instrument', { ...state.data.instrument[inst.id], archived: false }));
        break;
      }
      case 'export':
        exportBackup();
        break;
      case 'file-new':
      case 'file-open':
        linkFile(b.dataset.act === 'file-open');
        break;
      case 'file-allow':
        resumeFile();
        break;
      case 'file-stop':
        unlinkFile();
        break;
    }
  });
  dialog.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.rename) {
      const inst = state.data.instrument[el.dataset.rename];
      if (inst && !inst.deleted) put('instrument', { ...inst, name: el.value.trim().slice(0, 40) });
    }
    if (el.dataset.key === 'lang') {
      set({ lang: el.value });
      fill(); // relabel the dialog itself
      dialog.querySelector('[data-key="lang"]').focus();
    }
    if (el.dataset.act === 'import' && el.files[0]) {
      importBackup(el.files[0]);
      el.value = ''; // the same file can be picked again
    }
  });
}
