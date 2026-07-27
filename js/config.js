// js/config.js — constants only, no logic. Imported by calc/api/ui/main.

// Shown in the footer by main.js (a blank footer = stale cached scripts).
// Bump together with the ?v= query on the css/js URLs in index.html.
export const APP_VERSION = 'v2·21';

export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbysGE_0ynpVxJNdmvsfPjAdkQA3Lng7YMDp1OjP-EXbdx3xqEixgjwCKxVeSisECo-j/exec';
export const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1MVjVlKd3pwXB_JkHZkP00FnM0fBerfwStfqJ-GBza0M/edit?gid=0#gid=0';

// The five dough sizes. Colors are the canonical kitchen colors from the
// Mise en Place CSS tokens. Sicilian is counted loose (balls only, no trays).
export const SIZES = [
  { id: 'indi', label: 'Individual', chip: 'INDI', perTray: 11, color: '#2f6b3a' },
  { id: 'small', label: 'Small', chip: 'SM', perTray: 8, color: '#b3321b' },
  { id: 'large', label: 'Large', chip: 'LG', perTray: 6, color: '#1b6fa8' },
  { id: 'sic', label: 'Sicilian', chip: 'SIC', perTray: 3, color: '#c94a7a', looseOnly: true, note: 'min 2 balls' },
];
export const BOIL = { id: 'boil', label: 'Boil Dough', chip: 'BOIL', perTray: 6, target: 36, color: '#7a3b8e' };
export const ALL = [...SIZES, BOIL];

export const TRAYS_PER_BATCH = 11;
export const SIC_MIN = 2;
export const SIC_MIN_WAIVER = 10; // 10+ Sicilians on hand → no minimum
export const PEACH_MONTHS = [7, 8]; // Peach bible auto-default July 1 – Aug 31
export const MAX_BATCH_TEMPS = 10;

// Station Temps (v2·20): 8 kitchen stations, logged 3× daily.
// Labels double as the sheet column headers / wire keys — change together
// with SHEETS.stations + STATION_IDS in apps-script/Code.gs.
export const STATIONS = [
  { id: 'pizza1', label: 'Pizza 1' },
  { id: 'lowboy', label: 'Pizza Lowboy' },
  { id: 'pizza2', label: 'Pizza 2' },
  { id: 'slice', label: 'Slice' },
  { id: 'salad', label: 'Salad' },
  { id: 'reachin', label: 'Reach-In' },
  { id: 'walkin', label: 'Walk-In' },
  { id: 'freezer', label: 'Freezer' },
];
// Slot labels are the sheet's Slot cell values and the merged GET's key prefixes.
export const STATION_SLOTS = [
  { id: 'morning', label: 'Morning' },
  { id: 'twopm', label: '2 PM' },
  { id: 'night', label: 'Night' },
];
export const STATION_MORNING_UNTIL = 11; // slot default: morning before 11:00
export const STATION_NIGHT_FROM = 16; // …2 PM until 15:59, night from 16:00

// Slow-day rounding (v2·10): with both forecasts strictly under $12,000 the
// bible lookups and the batch count default to rounding down.
export const SLOW_DAY_UNDER = 12000;
export const ROUND_DOWN_MAX_GAP = 300; // never round a lookup down more than $300
export const BATCH_DOWN_MAX_OVER = 5; // slow day: ≤ 5 trays past a whole batch rounds down
export const BATCH_DOWN_ALWAYS_MAX_OVER = 2; // any day: ≤ 2 trays past a whole batch rounds down
export const EXTRA_LG_RATIO = 0.6; // lean-large share of the extras/cut split

// The Dough Bibles. Row format: [threshold, indi, small, large, sic].
// Both tables verified against the physical binder (July 2026).
// BIBLE_DATA / PEACH_BIBLE_DATA in apps-script/Code.gs mirror these —
// npm test enforces the sync, change them together.
export const BIBLES = {
  regular: {
    label: 'Dough Bible 2026',
    short: "Bible '26",
    rows: [
      [3750, 11, 52, 44, 2], [4000, 12, 58, 50, 2], [4400, 13, 63, 56, 2],
      [4800, 14, 69, 62, 2], [5200, 15, 74, 65, 2], [5700, 17, 81, 72, 2],
      [6300, 18, 88, 79, 2], [6800, 20, 94, 87, 3], [7200, 21, 101, 94, 3],
      [7800, 22, 108, 99, 3], [8300, 24, 115, 106, 3], [9100, 26, 125, 117, 3],
      [10000, 28, 136, 126, 4], [10700, 30, 146, 137, 4], [11500, 32, 156, 148, 4],
      [12250, 34, 166, 159, 4], [13000, 37, 177, 166, 5], [13900, 39, 187, 177, 5],
      [14750, 41, 197, 188, 5], [15500, 43, 206, 195, 5], [16250, 44, 214, 205, 6],
      [17000, 44, 225, 216, 6], [17750, 44, 235, 225, 6], [18500, 44, 246, 237, 6],
      [19250, 44, 255, 247, 6], [20000, 44, 266, 256, 7], [20750, 44, 276, 267, 7],
    ],
  },
  peach: {
    label: 'Peach Bible 2024',
    short: "Peach '24",
    rows: [
      [3000, 20, 56, 51, 2], [3500, 20, 66, 61, 2], [4000, 21, 75, 66, 3],
      [4500, 21, 85, 70, 3], [5000, 22, 96, 74, 3], [5500, 22, 106, 82, 3],
      [6000, 24, 115, 91, 3], [6500, 25, 124, 97, 3], [7000, 26, 132, 103, 3],
      [7500, 27, 141, 109, 3], [8000, 28, 151, 114, 4], [8500, 28, 160, 120, 4],
      [9000, 29, 170, 127, 4], [9500, 29, 179, 133, 4], [10000, 30, 188, 137, 4],
      [10500, 30, 197, 140, 4], [11000, 31, 204, 145, 5], [11500, 31, 211, 150, 5],
      [12000, 32, 218, 155, 5], [12500, 32, 226, 159, 6], [13000, 33, 234, 162, 6],
      [13500, 33, 243, 164, 6], [14000, 34, 253, 166, 6], [14500, 34, 262, 168, 6],
      [15000, 35, 271, 169, 6], [15500, 35, 281, 171, 6], [16000, 36, 290, 173, 6],
      [16500, 36, 300, 175, 6], [17000, 37, 309, 177, 6], [17500, 37, 318, 179, 6],
    ],
  },
};
