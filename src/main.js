// App shell: language, rendering the one page, the timer clock, backups, links shared to the app, the
// service worker and the install prompt.
import './lang/en.js';
import './lang/cs.js';
import { state, subscribe, onPut, migrate, running } from './store.js';
import { use, apply, t } from './i18n.js';
import { mountHome, renderNow, renderLog, tick } from './home.js';
import { mountChart, renderChart } from './chart.js';
import { mountEditor, openNew } from './editor.js';
import { mountSettings } from './settings.js';
import { mountPlayer, cleanUrl } from './links.js';
import { startBackup, scheduleFile, fileSync, remind, keepData, backupLed } from './backup.js';
import { $, toast } from './dom.js';

function applyLanguage() {
  use(state.lang);
  apply(document);
  $('meta[name="description"]').content = t('meta.desc');
}

// Re-rendering replaces the markup; a focused button (a log row, a chart key) gets its focus back.
function render() {
  const a = document.activeElement;
  const main = $('main');
  const kept = a && main.contains(a) && a.dataset?.act
    ? `[data-act="${a.dataset.act}"]${a.dataset.id ? `[data-id="${a.dataset.id}"]` : ''}${a.dataset.val ? `[data-val="${a.dataset.val}"]` : ''}`
    : null;
  renderNow($('#now'));
  renderLog($('#log'));
  renderChart($('#stats'));
  tick();
  if (kept) main.querySelector(kept)?.focus();
}

// the LED on the Settings button: how the backups are doing (backup.js)
function statusLed() {
  $('#statusLed').dataset.status = backupLed();
}

// A link shared to the app from another one (Android's share sheet): ?url=…&text=…&title=…
// It opens New practice with the link filled in.
function takeSharedLink() {
  const q = new URLSearchParams(location.search);
  if (!['url', 'text', 'title'].some(k => q.has(k))) return;
  const url = cleanUrl(q.get('url')) || cleanUrl(q.get('text')) || cleanUrl(q.get('title'));
  history.replaceState(null, '', location.pathname);
  if (url) openNew({ link: url });
}

function start() {
  applyLanguage();
  mountHome($('main'), render);
  mountChart($('#stats'));
  mountEditor($('#editor'));
  mountSettings($('#settings'), $('#settingsBtn'));
  mountPlayer();

  subscribe(patch => {
    if ('lang' in patch) applyLanguage();
    if (patch.data) scheduleFile();
    statusLed();
    if (patch.backup && Object.keys(patch).length === 1) return; // only the backup's status changed
    render();
  });

  // The backup file: shortly after each change, when the app comes back to the front, and every few
  // minutes while it's open (to pick up what other computers wrote to it).
  onPut(() => {
    scheduleFile();
    keepData();
  });
  migrate(); // the first version's day sessions become practices

  render();
  statusLed();
  if (location.hash) history.replaceState(null, '', location.pathname + location.search); // the first version's #/views
  document.documentElement.classList.remove('booting'); // shown once the text is in the right language
  takeSharedLink();

  setInterval(() => running() && tick(), 1000);

  startBackup().then(() => setTimeout(remind, 1500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      render(); // the day may have changed meanwhile
      fileSync().then(remind);
    } else fileSync();
  });
  setInterval(() => document.visibilityState === 'visible' && fileSync(), 5 * 60 * 1000);

  setupInstall();
  registerServiceWorker();
}

function setupInstall() {
  let deferred = null;
  const btn = $('#installBtn');
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    btn.hidden = true;
  });
  window.addEventListener('appinstalled', () => (btn.hidden = true));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Register after load so precaching doesn't compete with the page's own requests.
  const register = () => navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = worker => toast(t('toast.update'), t('toast.reload'), () => worker.postMessage('skip-waiting'), { sticky: true });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
  });
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
  // Reload only when an existing worker is replaced, not when the first one takes control.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

start();
