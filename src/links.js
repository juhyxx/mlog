// A practice's link, YouTube above all: tapping it plays the video in a player docked at the bottom,
// so the log and the timer stay usable while it plays. Anything else opens in a new tab.
import { esc, icon, $ } from './dom.js';
import { t } from './i18n.js';

// Only http(s) links are kept ("youtu.be/x" gets its https://). Returns the URL, or null.
export function cleanUrl(text) {
  let s = String(text || '').trim();
  const found = /https?:\/\/\S+/i.exec(s); // shared text often wraps the link in a title
  if (found) s = found[0];
  else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

// "1h2m3s", "90" or "90s" → seconds
function seconds(v) {
  if (!v) return 0;
  if (/^\d+s?$/.test(v)) return parseInt(v, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

// { id, start } of a YouTube video, or null
export function youtube(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v') || (/^\/(?:shorts|embed|live|v)\/([\w-]+)/.exec(u.pathname) || [])[1];
    }
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return { id, start: seconds(u.searchParams.get('t') || u.searchParams.get('start')) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the docked player

export function openVideo(url) {
  const yt = youtube(url);
  if (!yt) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const el = $('#player');
  const src = `https://www.youtube-nocookie.com/embed/${yt.id}?autoplay=1&rel=0&playsinline=1${yt.start ? `&start=${yt.start}` : ''}`;
  el.innerHTML = `
    <div class="player-bar">
      <a class="btn mini-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon.out}<span>${esc(t('link.onYoutube'))}</span></a>
      <button type="button" class="btn icon" data-player="close" aria-label="${esc(t('link.close'))}">${icon.close}</button>
    </div>
    <div class="player-frame"><iframe src="${esc(src)}" title="YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  el.hidden = false;
  document.body.classList.add('has-player');
}

export function closeVideo() {
  const el = $('#player');
  el.innerHTML = '';
  el.hidden = true;
  document.body.classList.remove('has-player');
}

// Link buttons anywhere in the page ([data-video]) open the player; its close button closes it.
export function mountPlayer() {
  document.addEventListener('click', e => {
    const v = e.target.closest('[data-video]');
    if (v) {
      e.preventDefault();
      openVideo(v.dataset.video);
      return;
    }
    if (e.target.closest('[data-player="close"]')) closeVideo();
  });
}

// The clipboard's link, or null (no permission, nothing there, not a link).
export async function readClipboardUrl() {
  try {
    return cleanUrl(await navigator.clipboard.readText());
  } catch {
    return null;
  }
}
