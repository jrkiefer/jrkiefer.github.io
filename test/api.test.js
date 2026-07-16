import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blankRecord } from '../js/calc.js';
import {
  todayISO, isoToSheetDate, mdyToISO, sheetDateToLocal, toShorthand,
  post, buildPayloads, recordFromRow,
} from '../js/api.js';

/* ---------------- date helpers ---------------- */

test('date helpers: ISO ↔ sheet M/D/YYYY', () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(isoToSheetDate('2026-04-01'), '4/1/2026');
  assert.equal(isoToSheetDate('2026-12-25'), '12/25/2026');
  assert.equal(mdyToISO('4/1/2026'), '2026-04-01');
  assert.equal(mdyToISO('12/25/2026'), '2026-12-25');
  assert.equal(mdyToISO('garbage'), null);
  assert.equal(mdyToISO('4/1'), null);
});

test('sheetDateToLocal: ISO-ish cells become M/D/YYYY, strings pass through', () => {
  assert.equal(sheetDateToLocal('2026-04-01'), '4/1/2026');
  assert.equal(sheetDateToLocal('2026-04-01T00:00:00'), '4/1/2026');
  assert.equal(sheetDateToLocal('4/1/2026'), '4/1/2026');
  assert.equal(sheetDateToLocal(null), '');
});

test('toShorthand: display inverse of the dollar shorthand', () => {
  assert.equal(toShorthand(1700), '1.7');
  assert.equal(toShorthand(10000), '10');
  assert.equal(toShorthand(500), '500');
  assert.equal(toShorthand(0), '');
});

/* ---------------- payload building ---------------- */

function fullRecord() {
  const r = blankRecord();
  r.twopm.currentSales = '2';
  r.twopm.todayForecast = '6';
  r.twopm.tomorrowForecast = '8';
  r.twopm.counts.indi = { trays: '1', singles: '9' }; // 20
  r.twopm.counts.small = { trays: '7', singles: '4' }; // 60
  r.twopm.counts.large = { trays: '8', singles: '2' }; // 50
  r.twopm.counts.sic = { trays: '', singles: '3' };
  r.twopm.counts.boil = { trays: '1', singles: '4' }; // 10
  // $6k/$8k is a slow day — rounding pinned up so the fixture's makes,
  // finals, and batches stay the pre-v2·10 reference numbers.
  r.forecastRound = 'up';
  r.batchRound = 'up';
  return r;
}

test('buildPayloads: blank record yields nothing to send', () => {
  assert.deepEqual(buildPayloads('2026-04-01', blankRecord()), {});
});

test('buildPayloads: full 2 PM record → dough payload with makes/finals + bible stamp', () => {
  const p = buildPayloads('2026-04-01', fullRecord());
  assert.deepEqual(Object.keys(p), ['dough']);
  assert.deepEqual(p.dough, {
    type: 'dough',
    date: '4/1/2026',
    todayForecast: 6000,
    currentSales: 2000,
    salesLeft: 4000,
    tomorrowForecast: 8000,
    indiCount: 20,
    smallCount: 60,
    largeCount: 50,
    sicCount: 3,
    boilCount: 10,
    batches: 4,
    bible: 'regular',
    forecastRound: 'up',
    batchRound: 'up',
    // raw calculated balls, clamped ≥ 0 — batch extras never save
    makes: { indi: 16, small: 113, large: 106, sic: 2, boil: 30 },
    finals: { indi: 36, small: 173, large: 156, sic: 5, boil: 40 },
  });
});

test('buildPayloads: rounding fields send the raw record value, not the resolved policy', () => {
  const r = blankRecord();
  r.twopm.todayForecast = '0';
  r.twopm.currentSales = '0';
  r.twopm.tomorrowForecast = '3750';
  r.twopm.counts.boil = { trays: '0', singles: '0' }; // counted zero → 6 boil trays
  const p = buildPayloads('2026-04-01', r);
  assert.equal(p.dough.forecastRound, ''); // auto stays blank on the wire …
  assert.equal(p.dough.batchRound, '');
  assert.equal(p.dough.batches, 2); // … while batches carries the auto-rounded plan (23 trays → down)
  r.forecastRound = 'down';
  r.batchRound = 'up';
  const p2 = buildPayloads('2026-04-01', r);
  assert.equal(p2.dough.forecastRound, 'down');
  assert.equal(p2.dough.batchRound, 'up');
  assert.equal(p2.dough.batches, 3);
});

test('buildPayloads: bible stamp follows the month default and the manual override', () => {
  const july = buildPayloads('2026-07-15', fullRecord());
  assert.equal(july.dough.bible, 'peach');
  const r = fullRecord();
  r.bible = 'regular';
  assert.equal(buildPayloads('2026-07-15', r).dough.bible, 'regular');
});

test('buildPayloads: blank boil goes up as an empty cell, not a zero', () => {
  const r = fullRecord();
  r.twopm.counts.boil = { trays: '', singles: '' };
  const p = buildPayloads('2026-04-01', r);
  assert.equal(p.dough.boilCount, '');
  assert.equal(p.dough.makes.boil, 0); // not counted → nothing to make
  assert.equal(p.dough.finals.boil, 0);
});

test('buildPayloads: not-ready plan still saves the dough row, without makes', () => {
  const r = fullRecord();
  r.twopm.currentSales = ''; // plan not ready
  const p = buildPayloads('2026-04-01', r);
  assert.ok(p.dough);
  assert.equal(p.dough.currentSales, 0);
  assert.equal('makes' in p.dough, false);
  assert.equal('finals' in p.dough, false);
});

test('buildPayloads: forecast-only save passes the backend non-empty rule', () => {
  const r = blankRecord();
  r.twopm.todayForecast = '0'; // closed today
  r.twopm.tomorrowForecast = '8';
  const p = buildPayloads('2026-04-01', r);
  assert.ok(p.dough);
  assert.equal(p.dough.todayForecast, 0);
  assert.equal(p.dough.tomorrowForecast, 8000);
});

test('buildPayloads: make correction only when an Actual Make is entered', () => {
  const r = fullRecord();
  assert.equal('make' in buildPayloads('2026-04-01', r), false);
  r.actualMake.small = '104';
  const p = buildPayloads('2026-04-01', r);
  // entered value wins, calc fills the other sizes
  assert.deepEqual(p.make, {
    type: 'make',
    date: '4/1/2026',
    makes: { indi: 16, small: 104, large: 106, sic: 2, boil: 30 },
  });
});

test('buildPayloads: a partial Actual Make on a not-ready plan sends no correction', () => {
  // With the plan not ready, effectiveMake's calc side is null for the
  // un-entered sizes — a payload here would overwrite the server's saved
  // makes with zeros.
  const r = fullRecord();
  r.twopm.currentSales = ''; // plan not ready
  r.actualMake.small = '104';
  assert.equal('make' in buildPayloads('2026-04-01', r), false);
});

test('buildPayloads: a fully-entered Actual Make sends even when the plan is not ready', () => {
  const r = fullRecord();
  r.twopm.currentSales = '';
  r.actualMake = { indi: '16', small: '104', large: '106', sic: '2', boil: '30' };
  const p = buildPayloads('2026-04-01', r);
  assert.deepEqual(p.make.makes, { indi: 16, small: 104, large: 106, sic: 2, boil: 30 });
});

test('buildPayloads: temps trim trailing blanks, keep interior ones positionally', () => {
  const r = blankRecord();
  r.temps = [
    { water: '58', dough: '78' },
    { water: '', dough: '' },
    { water: '60', dough: '' },
    { water: '', dough: '' },
  ];
  const p = buildPayloads('2026-04-01', r);
  assert.deepEqual(p.temps, {
    type: 'temps',
    date: '4/1/2026',
    temps: [{ water: 58, dough: 78 }, { water: 0, dough: 0 }, { water: 60, dough: 0 }],
  });
  r.temps = [{ water: '', dough: '' }];
  assert.equal('temps' in buildPayloads('2026-04-01', r), false);
});

test('buildPayloads: EON payload with counted-zero vs not-counted blanks', () => {
  const r = blankRecord();
  r.eon.sales = '5.24';
  r.eon.counts.indi = { trays: '3', singles: '8' }; // 41
  r.eon.counts.small = { trays: '0', singles: '0' }; // counted zero
  const p = buildPayloads('2026-04-01', r);
  assert.deepEqual(p.eon, {
    type: 'eon',
    date: '4/1/2026',
    eonSales: 5240,
    indiCount: 41,
    smallCount: 0,
    largeCount: '',
    sicCount: '',
    boilCount: '',
  });
});

test('buildPayloads: all-zero EON counts with no sales would be rejected — omitted', () => {
  const r = blankRecord();
  r.eon.counts.indi = { trays: '0', singles: '0' };
  assert.equal('eon' in buildPayloads('2026-04-01', r), false);
});

/* ---------------- hydration ---------------- */

test('recordFromRow: a realistic merged row round-trips into the record shape', () => {
  const row = {
    Date: '4/1/2026',
    "Today's Forecast": 9000,
    'Current Sales': 3000,
    'Sales Left': 6000,
    "Tomorrow's Forecast": 10000,
    'Indi Count': 33,
    'Small Count': 112,
    'Large Count': 168,
    'Sic Count': 6,
    'Boil Count': 24,
    Batches: 3,
    Bible: 'peach',
    'Forecast Rounding': 'down',
    'Batch Rounding': 'up',
    'Water 1': 58, 'Dough 1': 78,
    'Water 2': 56, 'Dough 2': 80,
    'EON Sales': 5240,
    'EON Indi Count': 41,
    'EON Small Count': 0,
    'EON Boil Count': '',
  };
  const r = recordFromRow(row);
  assert.equal(r.bible, 'peach');
  assert.equal(r.forecastRound, 'down');
  assert.equal(r.batchRound, 'up');
  assert.equal(r.twopm.todayForecast, '9');
  assert.equal(r.twopm.currentSales, '3');
  assert.equal(r.twopm.tomorrowForecast, '10');
  assert.deepEqual(r.twopm.counts.indi, { trays: '3', singles: '0' });
  assert.deepEqual(r.twopm.counts.small, { trays: '14', singles: '0' });
  assert.deepEqual(r.twopm.counts.sic, { trays: '', singles: '6' });
  assert.deepEqual(r.twopm.counts.boil, { trays: '4', singles: '0' });
  assert.deepEqual(r.temps, [{ water: '58', dough: '78' }, { water: '56', dough: '80' }]);
  assert.equal(r.eon.sales, '5.24');
  assert.deepEqual(r.eon.counts.indi, { trays: '3', singles: '8' });
  assert.deepEqual(r.eon.counts.small, { trays: '0', singles: '0' }); // counted zero
  assert.deepEqual(r.eon.counts.boil, { trays: '', singles: '' }); // not counted
  // fields the sheet never stores stay blank
  assert.deepEqual(r.actualMake, { indi: '', small: '', large: '', sic: '', boil: '' });
  assert.equal(r.eon.outlookForecast, '');
  assert.equal(r.eon.outlookManual, false);
});

test('recordFromRow: legacy rows — no Bible column → auto; 2 PM zeros → blanks; explicit 0 forecast survives', () => {
  const r = recordFromRow({
    Date: '4/1/2026',
    "Today's Forecast": 0,
    'Indi Count': 0,
    'Boil Count': 0,
  });
  assert.equal(r.bible, null);
  assert.equal(r.forecastRound, null); // no rounding columns → auto
  assert.equal(r.batchRound, null);
  assert.equal(r.twopm.todayForecast, '0'); // closed-day zero round-trips
  assert.deepEqual(r.twopm.counts.indi, { trays: '', singles: '' }); // pizza zero → blank
  assert.deepEqual(r.twopm.counts.boil, { trays: '0', singles: '0' }); // boil zero = counted
});

test('recordFromRow: junk rounding cells hydrate as auto', () => {
  const r = recordFromRow({
    Date: '4/1/2026',
    "Today's Forecast": 9000,
    'Forecast Rounding': 'sideways',
    'Batch Rounding': 0,
  });
  assert.equal(r.forecastRound, null);
  assert.equal(r.batchRound, null);
});

/* ---------------- transport ---------------- */

async function withFetch(impl, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

const jsonResponse = (obj) => ({
  type: 'basic',
  status: 200,
  ok: true,
  text: async () => JSON.stringify(obj),
});

test('post: ok response with backend JSON', async () => {
  const res = await withFetch(
    async () => jsonResponse({ status: 'ok', action: 'created', row: 5 }),
    () => post({ type: 'dough' })
  );
  assert.deepEqual(res, { ok: true, json: { status: 'ok', action: 'created', row: 5 } });
});

test('post: backend rejection surfaces as rejected, not network', async () => {
  const res = await withFetch(
    async () => jsonResponse({ status: 'error', message: 'Empty save rejected' }),
    () => post({ type: 'dough' })
  );
  assert.deepEqual(res, { ok: false, rejected: true, message: 'Empty save rejected' });
});

test('post: opaque response counts as landed', async () => {
  const res = await withFetch(
    async () => ({ type: 'opaque', status: 0 }),
    () => post({ type: 'dough' })
  );
  assert.deepEqual(res, { ok: true, opaque: true });
});

test('post: an HTTP error response is a retryable failure, not a landed save', async () => {
  // fetch resolves on 4xx/5xx — treating those as landed would mark the
  // record synced and silently drop the save.
  const res = await withFetch(
    async () => ({ type: 'basic', status: 500, ok: false, text: async () => 'Internal Server Error' }),
    () => post({ type: 'dough' })
  );
  assert.deepEqual(res, { ok: false, network: true });
});

test('post: network throw falls back to a no-cors retry', async () => {
  const calls = [];
  const res = await withFetch(
    async (url, opts) => {
      calls.push(opts);
      if (calls.length === 1) throw new TypeError('Failed to fetch');
      return { type: 'opaque', status: 0 };
    },
    () => post({ type: 'dough' })
  );
  assert.deepEqual(res, { ok: true, opaque: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].mode, undefined);
  assert.equal(calls[1].mode, 'no-cors');
});

test('post: double failure reports a network error', async () => {
  const res = await withFetch(
    async () => { throw new TypeError('Failed to fetch'); },
    () => post({ type: 'dough' })
  );
  assert.deepEqual(res, { ok: false, network: true });
});

test('post: keepalive rides through to fetch for unload flushes', async () => {
  let seen;
  await withFetch(
    async (url, opts) => { seen = opts; return jsonResponse({ status: 'ok' }); },
    () => post({ type: 'dough' }, { keepalive: true })
  );
  assert.equal(seen.keepalive, true);
});
