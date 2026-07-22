// js/calc.js — pure math. No DOM, no fetch, no storage.
// Ported from the approved design/preview.jsx (computePlan / effectiveMake /
// computeOutlook) plus the closed-tomorrow rule decided July 2026:
// an explicit 0 in Tomorrow's Forecast means zero need for every size,
// boil included — no 36-ball top-up on a night before a closed day.

import {
  SIZES, BOIL, ALL, TRAYS_PER_BATCH, SIC_MIN, SIC_MIN_WAIVER,
  PEACH_MONTHS, BIBLES,
  SLOW_DAY_UNDER, ROUND_DOWN_MAX_GAP, BATCH_DOWN_MAX_OVER,
  BATCH_DOWN_ALWAYS_MAX_OVER, EXTRA_LG_RATIO,
} from './config.js';

/* ---------------- parsing & formatting ---------------- */

// Dollar shorthand: values under 100 read as thousands (10 → 10,000,
// 6.7 → 6,700); 100 and up are literal. Blank/garbage → null.
export function parseSales(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n < 100 ? n * 1000 : n);
}

export const money = (n) => (n == null ? '—' : `$${n.toLocaleString('en-US')}`);
export const fmt = (n) => (n == null ? '—' : String(n));
export const fmtDate = (d) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// Internal helpers (not part of the public calc API).
const intOf = (v) => { const n = Number(v); return v !== '' && Number.isFinite(n) ? n : 0; };
const numOrNull = (v) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : null; };

/* ---------------- counts ---------------- */

// A count is {trays, singles} of raw input strings. Blank reads as 0;
// Sicilian is loose-only (balls live in `singles`).
export function countTotal(c, size) {
  const t = size.looseOnly ? 0 : intOf(c.trays);
  return t * size.perTray + intOf(c.singles);
}
export const countBlank = (c) => c.trays === '' && c.singles === '';

/* ---------------- record shape ---------------- */

const blankCounts = () => Object.fromEntries(ALL.map((s) => [s.id, { trays: '', singles: '' }]));

export const blankRecord = () => ({
  bible: null, // null = follow the month default
  forecastRound: null, // null = auto (slow-day rule)
  batchRound: null, // null = auto (slow-day + remainder rule)
  twopm: { counts: blankCounts(), todayForecast: '', currentSales: '', tomorrowForecast: '' },
  actualMake: { indi: '', small: '', large: '', sic: '', boil: '' },
  temps: [],
  eon: { sales: '', counts: blankCounts(), outlookForecast: '', outlookManual: false },
});

/* ---------------- bible lookup ---------------- */

// Peach bible is the automatic default July 1 – August 31 (by active date).
export function autoBibleFor(dateISO) {
  return PEACH_MONTHS.includes(Number(String(dateISO).slice(5, 7))) ? 'peach' : 'regular';
}

// Slow day: both money forecasts entered and strictly under $12,000 — the
// shared gate for the auto round-down rules (bible lookups and batches).
function slowDay(tf, tmf) {
  return tf != null && tmf != null && tf < SLOW_DAY_UNDER && tmf < SLOW_DAY_UNDER;
}

// Resolved forecast-rounding policy for a record: a stamped pill wins,
// otherwise slow days round down. (`??` also covers records from before
// the field existed.)
function resolveForecastRound(record) {
  const tp = record.twopm;
  return record.forecastRound
    ?? (slowDay(parseSales(tp.todayForecast), parseSales(tp.tomorrowForecast)) ? 'down' : 'up');
}

// Rounds UP to the next tier, caps at the top row. Zero or negative sales
// mean zero need/use (tier 0) — never rounds up to the first row.
// round 'down' takes the tier below instead — but never a drop of more
// than $300 (even when stamped manually); a wider gap falls back to up.
export function bibleLookup(bibleId, sales, round = 'up') {
  if (sales == null) return null;
  if (sales <= 0) return { tier: 0, indi: 0, small: 0, large: 0, sic: 0 };
  const rows = BIBLES[bibleId].rows;
  let row = null;
  if (round === 'down') {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][0] <= sales) { row = rows[i]; break; }
    }
    if (row && sales - row[0] > ROUND_DOWN_MAX_GAP) row = null;
  }
  if (!row) row = rows.find((r) => r[0] >= sales) || rows[rows.length - 1];
  return { tier: row[0], indi: row[1], small: row[2], large: row[3], sic: row[4] };
}

/* ---------------- the 2 PM plan ---------------- */

// Lean-large 60/40: LG = ceil(0.6·n), SM the rest — Large strictly ahead
// for any n ≥ 1. Shared by the extras top-up and the round-down cut.
const splitLeanLarge = (n) => {
  const lg = Math.ceil(EXTRA_LG_RATIO * n);
  return { lg, sm: n - lg };
};

export function computePlan(record, bibleId) {
  const tp = record.twopm;
  const tf = parseSales(tp.todayForecast);
  const cs = parseSales(tp.currentSales);
  const tmf = parseSales(tp.tomorrowForecast);
  const salesLeft = tf != null && cs != null ? tf - cs : null;

  // Forecast rounding resolves first — it shifts use/need and with them
  // every tray count the batch rounding is judged on.
  const slow = slowDay(tf, tmf);
  const fRound = record.forecastRound ?? (slow ? 'down' : 'up');

  const use = bibleLookup(bibleId, salesLeft, fRound);
  const need = bibleLookup(bibleId, tmf, fRound);
  // Explicit 0 forecast = closed tomorrow: zero need across the board.
  const closedTomorrow = need != null && need.tier === 0;

  const rows = {};
  const setout = [];
  let pizzaTrays = 0;
  const ready = !!(use && need);

  for (const s of SIZES) {
    const have = countTotal(tp.counts[s.id], s);
    const useN = use ? use[s.id] : null;
    const leftRaw = useN != null ? have - useN : null;
    // Sicilian dough-left clamps at 0 — same-day Sicilian can't be used,
    // so a shortfall must not inflate tomorrow's make.
    const left = s.id === 'sic' && leftRaw != null ? Math.max(0, leftRaw) : leftRaw;
    const needN = need ? need[s.id] : null;
    let make = left != null && needN != null ? Math.max(0, needN - left) : null;
    if (closedTomorrow && make != null) make = 0;
    // Sicilian min 2 — waived with 10+ on hand, and moot when closed tomorrow.
    if (s.id === 'sic' && make != null && !closedTomorrow && have < SIC_MIN_WAIVER) {
      make = Math.max(make, SIC_MIN);
    }
    const trays = make != null ? Math.ceil(make / s.perTray) : null;
    if (trays != null) pizzaTrays += trays;
    if (s.id !== 'sic' && left != null && left < 0) {
      setout.push({ id: s.id, label: s.label, trays: Math.ceil(-left / s.perTray) });
    }
    rows[s.id] = { have, use: useN, left, need: needN, make, trays };
  }

  // Boil ignores the bible: fixed target of 36, whole trays only
  // (33 on hand → 1 tray of 6, ending at 39). Blank count = not counted —
  // excluded from batch math (boilMake null; UI shows a note).
  const bc = tp.counts.boil;
  const boilHave = countBlank(bc) ? null : countTotal(bc, BOIL);
  const boilShort = boilHave == null ? null : closedTomorrow ? 0 : Math.max(0, BOIL.target - boilHave);
  const boilTrays = boilShort != null ? Math.ceil(boilShort / BOIL.perTray) : 0;
  const boilMake = boilShort != null ? boilTrays * BOIL.perTray : null;

  let totalTrays = null, batches = null, extra = 0, extraNote = '', cut = 0, cutNote = '';
  let finalTrays = null;
  let bRound = record.batchRound ?? null; // null = auto undecidable until totalTrays exists
  if (ready) {
    totalTrays = pizzaTrays + boilTrays;
    const rem = totalTrays % TRAYS_PER_BATCH;
    // Auto round-down: ≤ 2 trays past a whole batch rounds down on ANY day
    // (46 trays → 4 batches); a slow day widens that window to ≤ 5. A manual
    // stamp wins either way. Rounding down never drops below one batch.
    const autoDown = (rem >= 1 && rem <= BATCH_DOWN_ALWAYS_MAX_OVER)
      || (slow && rem >= 1 && rem <= BATCH_DOWN_MAX_OVER);
    bRound = record.batchRound ?? (autoDown ? 'down' : 'up');
    batches = totalTrays === 0 ? 0
      : bRound === 'down' ? Math.max(1, Math.floor(totalTrays / TRAYS_PER_BATCH))
        : Math.ceil(totalTrays / TRAYS_PER_BATCH);
    extra = totalTrays > 0 ? Math.max(0, batches * TRAYS_PER_BATCH - totalTrays) : 0;
    cut = totalTrays > 0 ? Math.max(0, totalTrays - batches * TRAYS_PER_BATCH) : 0;
    finalTrays = {};
    for (const s of SIZES) finalTrays[s.id] = rows[s.id].trays;
    // Both adjustments are display-level only — never Indi/Sicilian/boil,
    // never saved to the sheet.
    if (extra > 0) {
      const { lg, sm } = splitLeanLarge(extra);
      finalTrays.small += sm;
      finalTrays.large += lg;
      extraNote = sm > 0 ? `+${sm} SM, +${lg} LG` : `+${lg} LG`;
    } else if (cut > 0) {
      // Trim the overage with the same split, clamped so no size goes
      // negative; whatever neither LG nor SM can absorb stays untrimmed.
      const want = splitLeanLarge(cut);
      let lgCut = Math.min(want.lg, finalTrays.large);
      const smCut = Math.min(cut - lgCut, finalTrays.small);
      lgCut += Math.min(cut - lgCut - smCut, finalTrays.large - lgCut);
      finalTrays.large -= lgCut;
      finalTrays.small -= smCut;
      cutNote = [smCut > 0 && `−${smCut} SM`, lgCut > 0 && `−${lgCut} LG`].filter(Boolean).join(', ');
    }
  }

  return {
    salesLeft, use, need, closedTomorrow, rows, setout, pizzaTrays,
    boilHave, boilMake, boilTrays, totalTrays, batches, extra, extraNote,
    cut, cutNote, finalTrays, ready,
    rounding: {
      slowDay: slow,
      forecast: fRound,
      forecastAuto: record.forecastRound == null,
      batches: bRound,
      batchesAuto: record.batchRound == null,
    },
  };
}

/* ---------------- actual make ---------------- */

// A manager-entered Actual Make (balls) wins wherever it's filled in;
// the raw calculated make covers the rest.
export function effectiveMake(record, plan) {
  const out = {};
  for (const s of SIZES) {
    const a = numOrNull(record.actualMake[s.id]);
    out[s.id] = { balls: a ?? plan.rows[s.id].make, source: a != null ? 'recount' : 'calc' };
  }
  const ab = numOrNull(record.actualMake.boil);
  out.boil = { balls: ab ?? plan.boilMake, source: ab != null ? 'recount' : 'calc' };
  return out;
}

/* ---------------- EON outlook ---------------- */

// EON counts vs tomorrow's need on the given forecast (whole dollars).
// The primary diff is trays rounded to the NEAREST tray; the exact ball
// diff rides along. Sicilian is treated like every other size here —
// EON-made Sicilian IS usable tomorrow (unlike the same-night 2 PM clamp).
export function computeOutlook(record, bibleId, forecast) {
  // Need follows the night's resolved rounding — the gate reads the 2 PM
  // forecasts, never the EON-typed one.
  const need = bibleLookup(bibleId, forecast, resolveForecastRound(record));
  const rows = {};
  let anyCount = false, surplus = 0, shortfall = 0, surplusTrays = 0, shortTrays = 0;
  const add = (id, have, needN, perTray) => {
    const diff = have != null && needN != null ? have - needN : null;
    // `|| 0` normalizes the -0 that Math.sign produces on sub-tray shortages
    const tDiff = diff != null ? Math.sign(diff) * Math.round(Math.abs(diff) / perTray) || 0 : null;
    if (diff != null) {
      if (diff >= 0) { surplus += diff; surplusTrays += tDiff; }
      else { shortfall += -diff; shortTrays += -tDiff; }
    }
    rows[id] = { have, need: needN, diff, tDiff };
  };
  for (const s of SIZES) {
    const blank = countBlank(record.eon.counts[s.id]);
    const have = blank ? null : countTotal(record.eon.counts[s.id], s);
    if (have != null) anyCount = true;
    add(s.id, have, need && need.tier > 0 ? need[s.id] : null, s.perTray);
  }
  const bBlank = countBlank(record.eon.counts.boil);
  const bHave = bBlank ? null : countTotal(record.eon.counts.boil, BOIL);
  if (bHave != null) anyCount = true;
  add('boil', bHave, need && need.tier > 0 ? BOIL.target : null, BOIL.perTray);
  return { rows, anyCount, surplus, shortfall, surplusTrays, shortTrays, hasNeed: !!(need && need.tier > 0) };
}
