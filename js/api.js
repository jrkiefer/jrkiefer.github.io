// js/api.js — everything that knows about the Apps Script wire format:
// POST/GET wrappers, payload builders, merged-GET → record hydration,
// and the sheet-date helpers. No DOM. Storage lives in store.js.

import { SCRIPT_URL, SIZES, BOIL, ALL, MAX_BATCH_TEMPS } from './config.js';
import {
  parseSales, countTotal, countBlank, blankRecord,
  autoBibleFor, computePlan, effectiveMake,
} from './calc.js';

/* ---------------- dates ---------------- */

// Active dates are local-time YYYY-MM-DD (the date input's format);
// the sheet stores M/D/YYYY.
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isoToSheetDate(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
}

// '4/1/2026' → '2026-04-01' (history rows → date input). Null for garbage.
export function mdyToISO(mdy) {
  const parts = String(mdy).split('/');
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map((p) => parseInt(p, 10));
  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Sheet Date cells arrive as Date objects serialized to ISO timestamps or
// as plain strings — normalize to M/D/YYYY (local, no UTC shift).
export function sheetDateToLocal(raw) {
  if (raw == null) return '';
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
    return d.toLocaleDateString('en-US');
  }
  return s;
}

// Display inverse of the dollar shorthand: 1700 → '1.7', 500 → '500'.
export function toShorthand(n) {
  const v = Number(n) || 0;
  if (v === 0) return '';
  return v >= 1000 ? String(v / 1000) : String(v);
}

/* ---------------- transport ---------------- */

// Apps Script quirk: Content-Type text/plain dodges the CORS preflight.
// An opaque/status-0 response still means the write landed. On a network
// throw, retry once in no-cors mode (v1-proven fallback) before giving up.
export async function post(payload, { keepalive = false } = {}) {
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    keepalive,
  };
  try {
    const r = await fetch(SCRIPT_URL, opts);
    if (r.type === 'opaque' || r.status === 0) return { ok: true, opaque: true };
    // fetch resolves on HTTP errors — a 4xx/5xx never carried the save,
    // so report it as retryable rather than letting it count as synced.
    if (!r.ok) return { ok: false, network: true };
    let json = null;
    try { json = JSON.parse(await r.text()); } catch { /* non-JSON body — assume landed */ }
    if (json && json.status === 'error') {
      return { ok: false, rejected: true, message: json.message || 'save failed' };
    }
    return { ok: true, json };
  } catch {
    try {
      await fetch(SCRIPT_URL, { ...opts, mode: 'no-cors' });
      return { ok: true, opaque: true };
    } catch {
      return { ok: false, network: true };
    }
  }
}

// Merged record for one date: {status:'found', data} | {status:'not_found'}.
export async function getByDate(dateISO) {
  const r = await fetch(SCRIPT_URL + '?date=' + encodeURIComponent(isoToSheetDate(dateISO)));
  return r.json();
}

// Bare array of the most recent Dough Counts rows, newest first.
export async function getHistory() {
  const r = await fetch(SCRIPT_URL);
  return r.json();
}

/* ---------------- record → payloads ---------------- */

// Derive every POST the backend should receive for this record. A payload
// is included only when it passes the deployed backend's non-empty rules,
// so a background sync can never trip the "Empty save rejected" guard.
export function buildPayloads(dateISO, record) {
  const date = isoToSheetDate(dateISO);
  const bibleId = record.bible ?? autoBibleFor(dateISO);
  const plan = computePlan(record, bibleId);
  const out = {};

  // --- dough (+ makes/finals ride along) ---
  const tp = record.twopm;
  const counts = {};
  for (const s of SIZES) counts[s.id] = countTotal(tp.counts[s.id], s);
  const boilBlank = countBlank(tp.counts.boil);
  // Blank boil = "not counted" — an empty cell in the sheet, not a 0.
  const boilCount = boilBlank ? '' : countTotal(tp.counts.boil, BOIL);
  const today = parseSales(tp.todayForecast);
  const current = parseSales(tp.currentSales);
  const tomorrow = parseSales(tp.tomorrowForecast);

  const hasDough = Object.values(counts).some((n) => n > 0) || (boilCount !== '' && boilCount > 0);
  const hasForecast = (today ?? 0) > 0 || (tomorrow ?? 0) > 0;
  if (hasDough || hasForecast) {
    out.dough = {
      type: 'dough',
      date,
      todayForecast: today ?? 0,
      currentSales: current ?? 0,
      salesLeft: (today ?? 0) - (current ?? 0),
      tomorrowForecast: tomorrow ?? 0,
      indiCount: counts.indi,
      smallCount: counts.small,
      largeCount: counts.large,
      sicCount: counts.sic,
      boilCount,
      batches: plan.batches ?? 0,
      bible: bibleId,
    };
    if (plan.ready) {
      // Raw calculated balls, clamped ≥ 0. Batch extras never save —
      // if the crew makes them, that lands via the Actual Make correction.
      const makes = {};
      for (const s of SIZES) makes[s.id] = Math.max(0, plan.rows[s.id].make ?? 0);
      makes.boil = Math.max(0, plan.boilMake ?? 0);
      const finals = {};
      for (const s of SIZES) finals[s.id] = counts[s.id] + makes[s.id];
      finals.boil = (boilBlank ? 0 : boilCount) + makes.boil;
      out.dough.makes = makes;
      out.dough.finals = finals;
    }
  }

  // --- actual make correction ---
  // Needs a ready plan (or a fully-entered correction): while the plan is
  // not ready, effectiveMake's calc side is null for the un-entered sizes,
  // and the payload would overwrite the server's saved makes with zeros.
  const actual = Object.values(record.actualMake);
  if (actual.some((v) => v !== '') && (plan.ready || actual.every((v) => v !== ''))) {
    const eff = effectiveMake(record, plan);
    const makes = {};
    for (const s of ALL) makes[s.id] = Math.max(0, eff[s.id].balls ?? 0);
    out.make = { type: 'make', date, makes };
  }

  // --- temps ---
  let lastTemp = -1;
  record.temps.forEach((t, i) => {
    if (t && (t.water !== '' || t.dough !== '')) lastTemp = i;
  });
  if (lastTemp >= 0) {
    out.temps = {
      type: 'temps',
      date,
      temps: record.temps.slice(0, lastTemp + 1).map((t) => ({
        water: parseFloat(t.water) || 0,
        dough: parseFloat(t.dough) || 0,
      })),
    };
  }

  // --- EON ---
  const eon = record.eon;
  const eonSales = parseSales(eon.sales);
  const eonCounts = {};
  let anyEonCount = false;
  for (const s of ALL) {
    const c = eon.counts[s.id];
    if (countBlank(c)) {
      eonCounts[s.id] = ''; // not counted — empty cell
    } else {
      eonCounts[s.id] = countTotal(c, s);
      if (eonCounts[s.id] > 0) anyEonCount = true;
    }
  }
  if ((eonSales ?? 0) > 0 || anyEonCount) {
    out.eon = {
      type: 'eon',
      date,
      eonSales: eonSales ?? 0,
      indiCount: eonCounts.indi,
      smallCount: eonCounts.small,
      largeCount: eonCounts.large,
      sicCount: eonCounts.sic,
      boilCount: eonCounts.boil,
    };
  }

  return out;
}

/* ---------------- merged GET → record ---------------- */

function moneyCell(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '0'; // round-trip the explicit closed-day zero
  return toShorthand(n);
}

// zeroAsBlank: a stored 0 hydrates as an untouched blank for the 2 PM pizza
// sizes (blank already reads as 0), but stays an explicit counted-zero for
// boil and every EON count, where blank means "not counted".
function splitCount(v, size, zeroAsBlank) {
  const blank = { trays: '', singles: '' };
  if (v == null || v === '') return blank;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return blank;
  if (n === 0 && zeroAsBlank) return blank;
  if (size.looseOnly) return { trays: '', singles: String(n) };
  return { trays: String(Math.floor(n / size.perTray)), singles: String(n % size.perTray) };
}

const COUNT_KEY = { indi: 'Indi Count', small: 'Small Count', large: 'Large Count', sic: 'Sic Count' };
const EON_KEY = {
  indi: 'EON Indi Count', small: 'EON Small Count', large: 'EON Large Count',
  sic: 'EON Sic Count', boil: 'EON Boil Count',
};

// The merged GET spreads the Dough Counts, Temperatures, and End of Night
// rows into one header-keyed object. Map it back into a v2 record.
// actualMake and the outlook fields never reach the sheet — they stay blank
// here and are carried over from a local copy by the store when one exists.
export function recordFromRow(row) {
  const r = blankRecord();

  const bible = row['Bible'];
  r.bible = bible === 'regular' || bible === 'peach' ? bible : null;

  r.twopm.todayForecast = moneyCell(row["Today's Forecast"]);
  r.twopm.currentSales = moneyCell(row['Current Sales']);
  r.twopm.tomorrowForecast = moneyCell(row["Tomorrow's Forecast"]);
  for (const s of SIZES) r.twopm.counts[s.id] = splitCount(row[COUNT_KEY[s.id]], s, true);
  r.twopm.counts.boil = splitCount(row['Boil Count'], BOIL, false);

  const temps = [];
  for (let i = 1; i <= MAX_BATCH_TEMPS; i++) {
    const w = row['Water ' + i];
    const d = row['Dough ' + i];
    temps.push({
      water: w == null || w === '' ? '' : String(w),
      dough: d == null || d === '' ? '' : String(d),
    });
  }
  while (temps.length && temps[temps.length - 1].water === '' && temps[temps.length - 1].dough === '') {
    temps.pop();
  }
  r.temps = temps;

  r.eon.sales = moneyCell(row['EON Sales']);
  for (const s of ALL) r.eon.counts[s.id] = splitCount(row[EON_KEY[s.id]], s, false);

  return r;
}
