// js/calc.js — pure math. No DOM, no fetch, no storage.
// Ported from the approved design/preview.jsx (computePlan / effectiveMake /
// computeOutlook) plus the closed-tomorrow rule decided July 2026:
// an explicit 0 in Tomorrow's Forecast means zero need for every size,
// boil included — no 36-ball top-up on a night before a closed day.

import {
  SIZES, BOIL, ALL, TRAYS_PER_BATCH, SIC_MIN, SIC_MIN_WAIVER,
  PEACH_MONTHS, BIBLES,
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

export const intOf = (v) => { const n = Number(v); return v !== '' && Number.isFinite(n) ? n : 0; };
export const numOrNull = (v) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : null; };

/* ---------------- counts ---------------- */

// A count is {trays, singles} of raw input strings. Blank reads as 0;
// Sicilian is loose-only (balls live in `singles`).
export function countTotal(c, size) {
  const t = size.looseOnly ? 0 : intOf(c.trays);
  return t * size.perTray + intOf(c.singles);
}
export const countBlank = (c) => c.trays === '' && c.singles === '';

/* ---------------- record shape ---------------- */

export const blankCounts = () => Object.fromEntries(ALL.map((s) => [s.id, { trays: '', singles: '' }]));

export const blankRecord = () => ({
  bible: null, // null = follow the month default
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

// Rounds UP to the next tier, caps at the top row. Zero or negative sales
// mean zero need/use (tier 0) — never rounds up to the first row.
export function bibleLookup(bibleId, sales) {
  if (sales == null) return null;
  if (sales <= 0) return { tier: 0, indi: 0, small: 0, large: 0, sic: 0 };
  const rows = BIBLES[bibleId].rows;
  const row = rows.find((r) => r[0] >= sales) || rows[rows.length - 1];
  return { tier: row[0], indi: row[1], small: row[2], large: row[3], sic: row[4] };
}

/* ---------------- the 2 PM plan ---------------- */

export function computePlan(record, bibleId) {
  const tp = record.twopm;
  const tf = parseSales(tp.todayForecast);
  const cs = parseSales(tp.currentSales);
  const salesLeft = tf != null && cs != null ? tf - cs : null;

  const use = bibleLookup(bibleId, salesLeft);
  const need = bibleLookup(bibleId, parseSales(tp.tomorrowForecast));
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

  let totalTrays = null, batches = null, extra = 0, finalTrays = null, extraNote = '';
  if (ready) {
    totalTrays = pizzaTrays + boilTrays;
    batches = totalTrays === 0 ? 0 : Math.ceil(totalTrays / TRAYS_PER_BATCH);
    extra = totalTrays > 0 ? batches * TRAYS_PER_BATCH - totalTrays : 0;
    finalTrays = {};
    for (const s of SIZES) finalTrays[s.id] = rows[s.id].trays;
    // Batch extras: 1–4 → all Large; 5+ → 1 Small, rest Large.
    // Display-level only — never Indi/Sicilian, never saved to the sheet.
    if (extra >= 5) {
      finalTrays.small += 1;
      finalTrays.large += extra - 1;
      extraNote = `+1 SM, +${extra - 1} LG`;
    } else if (extra > 0) {
      finalTrays.large += extra;
      extraNote = `+${extra} LG`;
    }
  }

  return {
    salesLeft, use, need, closedTomorrow, rows, setout, pizzaTrays,
    boilHave, boilMake, boilTrays, totalTrays, batches, extra, extraNote,
    finalTrays, ready,
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
  const need = bibleLookup(bibleId, forecast);
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
