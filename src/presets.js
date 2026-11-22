// Ready-made choices, so a new practice is a few taps: instruments and types of practice (names are
// i18n keys: inst.*, type.*), and the instruments' colours.

// the instruments to pick from; each has a pixel icon in instIcons.js
export const INSTRUMENTS = [
  'guitar', 'eguitar', 'bass', 'ukulele', 'mandolin', 'banjo', 'violin', 'viola', 'cello',
  'doublebass', 'piano', 'keys', 'drums', 'voice', 'sax', 'trumpet', 'trombone', 'flute',
  'clarinet', 'harmonica', 'accordion', 'other',
];

// Types of practice.
export const TYPES = ['warmup', 'technique', 'scales', 'chords', 'rhythm', 'repertoire', 'improv', 'reading', 'ear', 'theory', 'other'];

// Each instrument has a colour of its own: its LED in the log, its part of the chart's columns. Eight
// hues in a fixed order, the dark-surface steps of the dataviz skill's reference palette, reordered to
// start with orange (the app's own colour) and checked with its validator on the app's screens
// (#0e0f0d, #262626): every neighbour in this order is told apart under protan and deutan colour
// blindness (worst ΔE 9.4) and normal vision (19.3), and so is any pair of the first three.
// Each ready-made instrument has a colour of its own, stepping through these in the INSTRUMENTS order
// (so neighbours in the picker differ). Added, it keeps that colour unless one of your instruments
// already has it; then it takes the first one no other uses.
export const COLORS = {
  orange: '#d95926',
  aqua: '#199e70',
  blue: '#3987e5',
  yellow: '#c98500',
  magenta: '#d55181',
  green: '#0ca30c',
  violet: '#9085e9',
  red: '#e66767',
};
export const COLOR_KEYS = Object.keys(COLORS);
export const NO_COLOR = '#8a8a86'; // a practice whose instrument is gone
export const typeColor = type => COLOR_KEYS[Math.max(0, INSTRUMENTS.indexOf(type)) % COLOR_KEYS.length];
