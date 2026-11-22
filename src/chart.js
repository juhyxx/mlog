// The chart: how long you practised, by day (the last 30 days), by month (the last 12) or by year
// (every year since the first practice, at least the last five). Each column is split by instrument,
// in the instruments' colours (presets.js), the first colour at the bottom. With two instruments or
// more, a legend lists each one with its time in the range. Hovering, focusing or tapping a column
// shows its time, and each instrument's, in the readout and the legend. Each column is a button with
// its values as its label, so the numbers are there for screen readers and the keyboard too.
import { state, set, entries, spent, colorOf } from './store.js';
import { today, addDays, dayOf, monthKey, addMonths, longDay, monthLabel, monthShort, dayMonth } from './dates.js';
import { t } from './i18n.js';
import { esc, seg, duration } from './dom.js';
import { COLOR_KEYS, NO_COLOR } from './presets.js';
import { instName } from './entries.js';

const DAYS = 30;
const MONTHS = 12;
const YEARS = 5;
const GONE = '-'; // the series of practices whose instrument was deleted

// [{ key, label, long, min, parts: { instrument id: minutes } }], oldest first
function bars(by) {
  const t0 = today();
  const keyOf = by === 'day' ? d => d : by === 'month' ? monthKey : d => d.slice(0, 4);
  const sums = {};
  for (const e of entries()) {
    const ms = spent(e);
    if (!ms) continue;
    const k = keyOf(dayOf(e.start));
    const inst = state.data.instrument[e.instrumentId];
    const s = inst && !inst.deleted ? inst.id : GONE;
    sums[k] ||= {};
    sums[k][s] = (sums[k][s] || 0) + ms / 60000;
  }
  const keys = [];
  if (by === 'day') {
    for (let i = DAYS - 1; i >= 0; i--) keys.push(addDays(t0, -i));
  } else if (by === 'month') {
    for (let i = MONTHS - 1; i >= 0; i--) keys.push(addMonths(monthKey(t0), -i));
  } else {
    const now = Number(t0.slice(0, 4));
    const first = Math.min(now - YEARS + 1, ...Object.keys(sums).map(Number).filter(y => y > 1970));
    for (let y = first; y <= now; y++) keys.push(String(y));
  }
  const n = keys.length;
  return keys.map((key, i) => {
    const parts = sums[key] || {};
    return {
      key,
      parts,
      min: Object.values(parts).reduce((a, b) => a + b, 0),
      // the days are labelled once a week, back from today; months and years each
      label: by === 'day' ? ((n - 1 - i) % 7 ? '' : dayMonth(key)) : by === 'month' ? monthShort(key + '-01') : key,
      long: by === 'day' ? longDay(key) : by === 'month' ? monthLabel(key) : key,
    };
  });
}

// The instruments with time in the range, in the order of their colours, so neighbours in a column
// are neighbours in the palette. Practices whose instrument was deleted come last, in grey.
function seriesOf(list) {
  const ids = new Set(list.flatMap(b => Object.keys(b.parts)));
  const slot = id => (id === GONE ? 99 : COLOR_KEYS.indexOf(state.data.instrument[id].color) + 1 || 98);
  return [...ids]
    .sort((a, b) => slot(a) - slot(b) || (state.data.instrument[a]?.order ?? 0) - (state.data.instrument[b]?.order ?? 0))
    .map(id => {
      const inst = state.data.instrument[id];
      return {
        id,
        name: id === GONE ? t('ch.gone') : instName(inst),
        color: id === GONE ? NO_COLOR : colorOf(inst),
        min: list.reduce((a, b) => a + (b.parts[id] || 0), 0),
      };
    });
}

// The axis: about three gridlines at round values, in minutes up to an hour and a half, then in hours.
function axis(max) {
  const hours = max > 90;
  const unit = hours ? 60 : 1;
  const steps = hours ? [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000] : [5, 10, 15, 20, 30];
  const want = (max || 60) / unit / 3;
  const step = steps.find(s => s >= want) || steps[steps.length - 1];
  const top = Math.max(step, Math.ceil((max || 60) / unit / step) * step);
  const ticks = [];
  for (let v = step; v <= top; v += step) ticks.push({ at: v / top, label: `${v} ${t(hours ? 'unit.h' : 'unit.min')}` });
  return { top: top * unit, ticks };
}

let shown = []; // the bars on screen, for the readout
let series = [];
let total = { label: '', min: 0 };

function rangeLabel(by, list) {
  if (by === 'day') return t('ch.lastDays', { n: DAYS });
  if (by === 'month') return t('ch.lastMonths', { n: MONTHS });
  return `${list[0].key} → ${list[list.length - 1].key}`;
}

// the column's label for screen readers: its day, its time and each instrument's
function barLabel(b) {
  const parts = series.length > 1 ? series.filter(s => b.parts[s.id]).map(s => `${s.name} ${duration(b.parts[s.id])}`) : [];
  return `${b.long}: ${duration(b.min)}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

function column(b, top) {
  if (!(b.min > 0)) return '';
  const parts = series.filter(s => b.parts[s.id] > 0)
    .map(s => `<i style="--c:${s.color};flex-grow:${b.parts[s.id].toFixed(2)}"></i>`).join('');
  return `<span class="stack" style="height:max(2px, ${(b.min / top) * 100}%)">${parts}</span>`;
}

export function renderChart(el) {
  const by = ['day', 'month', 'year'].includes(state.chartBy) ? state.chartBy : 'day';
  const list = bars(by);
  const max = Math.max(0, ...list.map(b => b.min));
  const { top, ticks } = axis(max);
  shown = list;
  series = seriesOf(list);
  total = { label: rangeLabel(by, list), min: list.reduce((a, b) => a + b.min, 0) };
  const current = list.length - 1; // today, this month, this year
  // a single instrument needs no legend: the title says what the columns are
  const legend = series.length > 1
    ? `<ul class="legend">${series.map(s => `<li style="--c:${s.color}"><i></i><b data-part="${esc(s.id)}">${esc(duration(s.min))}</b><span>${esc(s.name)}</span></li>`).join('')}</ul>`
    : '';
  el.innerHTML = `
    <div class="block-head">
      <h3 class="module-label">${esc(t('ch.title'))}</h3>
      ${seg('chartBy', [['day', esc(t('ch.day'))], ['month', esc(t('ch.month'))], ['year', esc(t('ch.year'))]], by, 'keys small')}
    </div>
    <div class="screen chart-screen">
      <div class="readout" aria-live="polite">
        <p class="readout-head"><span data-readout-label>${esc(total.label)}</span><b data-readout-value>${esc(duration(total.min))}</b></p>
        ${legend}
      </div>
      <div class="chart" style="--n:${list.length}">
        <div class="chart-y" aria-hidden="true">${ticks.map(tk => `<span style="bottom:${tk.at * 100}%">${esc(tk.label)}</span>`).join('')}</div>
        <div class="chart-plot">
          ${ticks.map(tk => `<i class="gridline" style="bottom:${tk.at * 100}%"></i>`).join('')}
          <div class="bars">${list.map((b, i) => `
            <button type="button" class="bar${i === current ? ' now' : ''}" data-i="${i}" aria-label="${esc(barLabel(b))}">${column(b, top)}</button>`).join('')}
          </div>
        </div>
        <div class="chart-x" aria-hidden="true">${list.map((b, i) => (b.label ? `<span class="${i === current ? 'now' : ''}" style="grid-column:${i + 1}">${esc(b.label)}</span>` : '')).join('')}</div>
      </div>
    </div>`;
}

// The readout shows the column pointed at (bar), or the whole range (null).
function readout(el, bar) {
  const b = bar ? shown[Number(bar.dataset.i)] : null;
  const label = el.querySelector('[data-readout-label]');
  if (!label) return;
  label.textContent = b ? b.long : total.label;
  el.querySelector('[data-readout-value]').textContent = duration(b ? b.min : total.min);
  for (const s of series) {
    const v = el.querySelector(`[data-part="${CSS.escape(s.id)}"]`);
    if (v) v.textContent = duration(b ? b.parts[s.id] || 0 : s.min);
  }
  el.querySelectorAll('.bar.hot').forEach(x => x.classList.remove('hot'));
  bar?.classList.add('hot');
}

export function mountChart(el) {
  el.addEventListener('click', e => {
    const key = e.target.closest('[data-act="chartBy"]');
    if (key) return set({ chartBy: key.dataset.val });
    const bar = e.target.closest('.bar');
    if (bar) readout(el, bar); // a tap on a phone: the values stay until the next one
  });
  el.addEventListener('pointerover', e => {
    const bar = e.target.closest('.bar');
    if (bar && e.pointerType !== 'touch') readout(el, bar);
  });
  el.addEventListener('pointerout', e => {
    if (e.pointerType === 'touch' || !e.target.closest('.bar') || e.relatedTarget?.closest?.('.bar')) return;
    readout(el, null);
  });
  el.addEventListener('focusin', e => {
    const bar = e.target.closest('.bar');
    if (bar) readout(el, bar);
  });
  el.addEventListener('focusout', e => {
    if (e.target.closest('.bar') && !e.relatedTarget?.closest?.('.bar')) readout(el, null);
  });
}
