import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blankRecord } from '../js/calc.js';
import { buildPayloads, recordFromRow, sheetDateToLocal, mdyToISO } from '../js/api.js';
import { createStore } from '../js/store.js';

/* ---------------- harness ---------------- */

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

// Store factory with mock timers (so armed debounces never leak into real
// time), a monotonic clock, an in-memory storage, and a scriptable api.
function harness(t, { postImpl, getImpl, debounceMs = 2500 } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = memStorage();
  const calls = [];
  let clock = 1000;
  const api = {
    buildPayloads,
    recordFromRow,
    sheetDateToLocal,
    mdyToISO,
    post: async (payload, opts = {}) => {
      calls.push({ payload, opts });
      return postImpl ? postImpl(payload, calls.length) : { ok: true, json: { status: 'ok' } };
    },
    getByDate: async (iso) => (getImpl ? getImpl(iso) : { status: 'not_found' }),
  };
  const store = createStore({ api, storage, now: () => ++clock, debounceMs });
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  };
  const tick = async (ms) => { t.mock.timers.tick(ms); await settle(); };
  return { store, storage, calls, tick, settle };
}

function seedEntry(storage, iso, record, { updatedAt, syncedAt }) {
  storage.setItem(`dough:${iso}`, JSON.stringify({ v: 2, record, updatedAt, syncedAt }));
}

const eonSalesRecord = (v) => {
  const r = blankRecord();
  r.eon.sales = v;
  return r;
};

/* ---------------- capture & debounce ---------------- */

test('patch writes localStorage synchronously and flips status to local', async (t) => {
  const { store, storage } = harness(t);
  await store.setDate('2026-04-01');
  store.patch((r) => { r.twopm.todayForecast = '9'; });
  const entry = JSON.parse(storage.getItem('dough:2026-04-01'));
  assert.equal(entry.record.twopm.todayForecast, '9');
  assert.ok(entry.updatedAt > entry.syncedAt);
  assert.equal(store.getState().status, 'local');
});

test('a typing burst debounces into one trailing flush', async (t) => {
  const { store, calls, tick } = harness(t);
  await store.setDate('2026-04-01');
  store.patch((r) => { r.eon.sales = '5'; });
  await tick(2000);
  store.patch((r) => { r.eon.sales = '5.2'; });
  await tick(2000);
  store.patch((r) => { r.eon.sales = '5.24'; });
  assert.equal(calls.length, 0); // every keystroke pushed the flush out
  await tick(2500);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.type, 'eon');
  assert.equal(calls[0].payload.eonSales, 5240);
  assert.equal(store.getState().status, 'synced');
});

test('blank records produce no posts and stay unsynced', async (t) => {
  const { store, calls } = harness(t);
  await store.setDate('2026-04-01');
  await store.flush();
  assert.equal(calls.length, 0);
});

/* ---------------- ordering & gating ---------------- */

function full2pm() {
  const r = blankRecord();
  r.twopm.currentSales = '2';
  r.twopm.todayForecast = '6';
  r.twopm.tomorrowForecast = '8';
  r.twopm.counts.indi.singles = '20';
  r.twopm.counts.small.singles = '60';
  r.twopm.counts.large.singles = '50';
  r.twopm.counts.sic.singles = '3';
  r.twopm.counts.boil.singles = '10';
  return r;
}

test('make posts after dough, and is skipped when dough fails', async (t) => {
  const failDough = harness(t, {
    postImpl: async (p) => (p.type === 'dough' ? { ok: false, network: true } : { ok: true }),
  });
  await failDough.store.setDate('2026-04-01');
  failDough.store.patch((r) => {
    Object.assign(r, full2pm());
    r.actualMake.small = '104';
  });
  await failDough.store.flush();
  assert.deepEqual(failDough.calls.map((c) => c.payload.type), ['dough']);
  assert.equal(failDough.store.getState().status, 'offline');
});

test('make follows a successful dough post in the same flush', async (t) => {
  const { store, calls } = harness(t);
  await store.setDate('2026-04-01');
  store.patch((r) => {
    Object.assign(r, full2pm());
    r.actualMake.small = '104';
  });
  await store.flush();
  assert.deepEqual(calls.map((c) => c.payload.type), ['dough', 'make']);
  assert.equal(calls[1].payload.makes.small, 104);
});

test('unchanged payload types are not re-posted', async (t) => {
  const { store, calls } = harness(t);
  await store.setDate('2026-04-01');
  store.patch((r) => {
    Object.assign(r, full2pm());
    r.temps = [{ water: '58', dough: '78' }];
  });
  await store.flush();
  assert.deepEqual(calls.map((c) => c.payload.type), ['dough', 'temps']);
  store.patch((r) => { r.temps[0].dough = '80'; });
  await store.flush();
  // only the temps payload changed — dough is ack-cached
  assert.deepEqual(calls.slice(2).map((c) => c.payload.type), ['temps']);
  assert.equal(store.getState().status, 'synced');
});

test('a backend rejection is terminal until the record changes', async (t) => {
  const { store, calls } = harness(t, {
    postImpl: async () => ({ ok: false, rejected: true, message: 'nope' }),
  });
  await store.setDate('2026-04-01');
  store.patch((r) => { r.eon.sales = '5'; });
  await store.flush();
  assert.equal(calls.length, 1);
  assert.equal(store.getState().status, 'synced'); // handled, not a network failure
  await store.flush();
  assert.equal(calls.length, 1); // not retried verbatim
  store.patch((r) => { r.eon.sales = '5.5'; });
  await store.flush();
  assert.equal(calls.length, 2); // new payload version → retried
});

/* ---------------- offline & recovery ---------------- */

test('offline flush recovers on the next flush', async (t) => {
  let failing = true;
  const { store, calls } = harness(t, {
    postImpl: async () => (failing ? { ok: false, network: true } : { ok: true }),
  });
  await store.setDate('2026-04-01');
  store.patch((r) => { r.eon.sales = '5'; });
  await store.flush();
  assert.equal(store.getState().status, 'offline');
  failing = false;
  await store.flush(); // e.g. the window 'online' handler
  assert.equal(store.getState().status, 'synced');
  const s = store.getState();
  assert.equal(s.syncedAt, s.updatedAt);
  assert.equal(calls.length, 2);
});

test('an edit landing mid-flight keeps status local until the next flush', async (t) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { store } = harness(t, {
    postImpl: async () => { await gate; return { ok: true }; },
  });
  await store.setDate('2026-04-01');
  store.patch((r) => { r.eon.sales = '5'; });
  const inFlight = store.flush();
  store.patch((r) => { r.eon.sales = '5.5'; }); // typing while the POST is out
  release();
  await inFlight;
  assert.equal(store.getState().status, 'local'); // newer edits not yet synced
  await store.flush();
  assert.equal(store.getState().status, 'synced');
});

test('keepalive flush fires posts but never marks synced', async (t) => {
  const { store, calls, settle } = harness(t);
  await store.setDate('2026-04-01');
  store.patch((r) => { r.eon.sales = '5'; });
  store.flush({ keepalive: true });
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.keepalive, true);
  const s = store.getState();
  assert.ok(s.syncedAt < s.updatedAt); // boot retry will reconcile
});

/* ---------------- date loading & merge ---------------- */

const serverRow = {
  Date: '4/2/2026',
  "Today's Forecast": 9000,
  'Current Sales': 3000,
  "Tomorrow's Forecast": 10000,
  'Indi Count': 33,
};

test('setDate: unsynced local edits win over the server copy', async (t) => {
  const { store, storage } = harness(t, {
    getImpl: async () => ({ status: 'found', data: serverRow }),
  });
  const mine = eonSalesRecord('5.24');
  seedEntry(storage, '2026-04-02', mine, { updatedAt: 100, syncedAt: 0 });
  await store.setDate('2026-04-02');
  const s = store.getState();
  assert.equal(s.record.eon.sales, '5.24');
  assert.equal(s.record.twopm.todayForecast, ''); // server row NOT merged in
  assert.equal(s.status, 'local');
});

test('setDate: a blank unsynced local copy yields to the server row (the stuck-16th fix)', async (t) => {
  const { store, storage } = harness(t, {
    getImpl: async () => ({ status: 'found', data: serverRow }),
  });
  // The stuck signature: updatedAt > syncedAt but the record is blank (a reset
  // or a date only glanced at). It must NOT cling — the sheet row loads.
  seedEntry(storage, '2026-04-02', blankRecord(), { updatedAt: 100, syncedAt: 0 });
  await store.setDate('2026-04-02');
  const s = store.getState();
  assert.equal(s.record.twopm.todayForecast, '9'); // sheet loaded, not the stale blank
  assert.equal(s.status, 'synced');
  assert.equal(s.dirty, false); // getState exposes the unsynced-real-edits flag
});

test('setDate: synced local → server wins, local-only fields carry over', async (t) => {
  const { store, storage } = harness(t, {
    getImpl: async () => ({ status: 'found', data: serverRow }),
  });
  const mine = blankRecord();
  mine.actualMake.small = '104';
  mine.eon.outlookForecast = '12';
  mine.eon.outlookManual = true;
  seedEntry(storage, '2026-04-02', mine, { updatedAt: 100, syncedAt: 100 });
  await store.setDate('2026-04-02');
  const s = store.getState();
  assert.equal(s.record.twopm.todayForecast, '9'); // from the server
  assert.equal(s.record.actualMake.small, '104'); // carried over
  assert.equal(s.record.eon.outlookForecast, '12');
  assert.equal(s.record.eon.outlookManual, true);
  assert.equal(s.status, 'synced');
});

test('setDate: nothing anywhere → a fresh night', async (t) => {
  const { store } = harness(t);
  await store.setDate('2026-04-03');
  assert.equal(store.getState().status, 'new');
});

test('setDate: network failure falls back to the local copy, offline', async (t) => {
  const { store, storage } = harness(t, {
    getImpl: async () => { throw new TypeError('Failed to fetch'); },
  });
  seedEntry(storage, '2026-04-02', eonSalesRecord('5'), { updatedAt: 100, syncedAt: 100 });
  await store.setDate('2026-04-02');
  const s = store.getState();
  assert.equal(s.record.eon.sales, '5');
  assert.equal(s.status, 'offline');
});

test('setDate: typing during a slow load wins over the arriving server row', async (t) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { store } = harness(t, {
    getImpl: async () => { await gate; return { status: 'found', data: serverRow }; },
  });
  const loading = store.setDate('2026-04-02');
  store.patch((r) => { r.eon.sales = '5.24'; }); // typing while the GET is in flight
  release();
  await loading;
  const s = store.getState();
  assert.equal(s.record.eon.sales, '5.24'); // the keystrokes survive
  assert.equal(s.record.twopm.todayForecast, ''); // stale server row discarded
  assert.equal(s.status, 'local');
});

test('setDate: a reset during a slow load is not resurrected by the arriving row', async (t) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { store } = harness(t, {
    getImpl: async () => { await gate; return { status: 'found', data: serverRow }; },
  });
  const loading = store.setDate('2026-04-02');
  store.reset();
  release();
  await loading;
  assert.equal(store.getState().record.twopm.todayForecast, '');
  assert.equal(store.getState().status, 'new');
});

test('setDate: a superseded load never lands', async (t) => {
  let releaseFirst;
  const firstGate = new Promise((r) => { releaseFirst = r; });
  const { store } = harness(t, {
    getImpl: async (iso) => {
      if (iso === '2026-04-02') {
        await firstGate;
        return { status: 'found', data: serverRow };
      }
      return { status: 'not_found' };
    },
  });
  const slow = store.setDate('2026-04-02');
  const fast = store.setDate('2026-04-03');
  releaseFirst();
  await Promise.all([slow, fast]);
  const s = store.getState();
  assert.equal(s.date, '2026-04-03');
  assert.equal(s.record.twopm.todayForecast, ''); // stale row discarded
});

/* ---------------- reset & boot retry ---------------- */

test('reset blanks the date and stops the blank posting; the next load re-pulls the sheet', async (t) => {
  const { store, storage, calls } = harness(t, {
    getImpl: async () => ({ status: 'found', data: serverRow }),
  });
  await store.setDate('2026-04-02'); // hydrates from the server
  assert.equal(store.getState().record.twopm.todayForecast, '9');
  store.reset();
  assert.equal(store.getState().status, 'new');
  const before = calls.length;
  await store.flush(); // nothing to send for a blank record — the sheet isn't clobbered
  assert.equal(calls.length, before);
  const entry = JSON.parse(storage.getItem('dough:2026-04-02'));
  assert.ok(entry.updatedAt > entry.syncedAt); // still unsynced on the phone
  await store.setDate('2026-04-02'); // reload the same date
  // A blank reset has nothing to protect, so the sheet's row wins — this is
  // what un-sticks a phone showing a stale blank for a saved date.
  assert.equal(store.getState().record.twopm.todayForecast, '9');
  assert.equal(store.getState().status, 'synced');
});

test('retryUnsynced: boot pass re-sends every unsynced date, in order', async (t) => {
  const { store, storage, calls } = harness(t);
  seedEntry(storage, '2026-04-02', eonSalesRecord('5'), { updatedAt: 100, syncedAt: 0 });
  seedEntry(storage, '2026-04-03', eonSalesRecord('6'), { updatedAt: 100, syncedAt: 50 });
  seedEntry(storage, '2026-04-04', eonSalesRecord('7'), { updatedAt: 100, syncedAt: 100 }); // already synced
  await store.setDate('2026-04-05');
  await store.retryUnsynced();
  const sales = calls.map((c) => c.payload.eonSales).sort();
  assert.deepEqual(sales, [5000, 6000]);
  for (const iso of ['2026-04-02', '2026-04-03']) {
    const entry = JSON.parse(storage.getItem(`dough:${iso}`));
    assert.equal(entry.syncedAt, entry.updatedAt);
  }
});

/* ---------------- cacheHistory: last week ready to load ---------------- */

test('cacheHistory pre-warms recent dates but never clobbers an existing copy', async (t) => {
  const { store, storage } = harness(t);
  await store.setDate('2026-07-01'); // the active date must be skipped
  // an existing unsynced edit for 7/16 that must survive the pre-warm
  seedEntry(storage, '2026-07-16', eonSalesRecord('9.9'), { updatedAt: 200, syncedAt: 0 });
  store.cacheHistory([
    { Date: '7/15/2026', "Today's Forecast": 10000, 'Indi Count': 5 },
    { Date: '7/16/2026', "Today's Forecast": 11500 }, // has a local copy — skip
    { Date: '7/01/2026', "Today's Forecast": 8000 }, // the active date — skip
  ]);
  const c15 = JSON.parse(storage.getItem('dough:2026-07-15'));
  assert.equal(c15.record.twopm.todayForecast, '10'); // gap-filled from history
  assert.equal(c15.syncedAt, c15.updatedAt); // landed as a synced copy
  const c16 = JSON.parse(storage.getItem('dough:2026-07-16'));
  assert.equal(c16.record.eon.sales, '9.9'); // the unsynced edit was left alone
  assert.equal(storage.getItem('dough:2026-07-01'), null); // active date never cached
});

/* ---------------- reload: the Load button + foreground refresh ---------------- */

const sheetRow716 = {
  Date: '7/16/2026',
  "Today's Forecast": 10000,
  'Current Sales': 2200,
  "Tomorrow's Forecast": 10000,
  'Indi Count': 17,
  'Small Count': 168,
  Bible: 'peach',
};

test('reload pulls fresh sheet data onto an idle phone (the two-phone handoff)', async (t) => {
  let serverRow = null;
  const { store } = harness(t, {
    getImpl: async () => (serverRow ? { status: 'found', data: serverRow } : { status: 'not_found' }),
  });
  await store.setDate('2026-07-16');
  assert.equal(store.getState().status, 'new');
  serverRow = sheetRow716; // the other phone saves at 1:30…
  await store.reload(); // …this phone wakes at 2:50
  const s = store.getState();
  assert.equal(s.record.twopm.todayForecast, '10');
  assert.equal(s.record.bible, 'peach');
  assert.equal(s.status, 'synced');
});

test('reload (non-force) never clobbers unsynced local edits', async (t) => {
  let serverRow = null;
  const { store } = harness(t, {
    getImpl: async () => (serverRow ? { status: 'found', data: serverRow } : { status: 'not_found' }),
  });
  await store.setDate('2026-07-16');
  store.patch((r) => { r.twopm.currentSales = '9.9'; });
  serverRow = sheetRow716;
  await store.reload();
  const s = store.getState();
  assert.equal(s.record.twopm.currentSales, '9.9'); // local edit kept
  assert.equal(s.record.twopm.todayForecast, ''); // server row not applied
  assert.equal(s.status, 'local');
});

test('reload (force) applies the sheet copy over local edits, carrying the sheet-less fields', async (t) => {
  const { store, storage } = harness(t, {
    getImpl: async () => ({ status: 'found', data: sheetRow716 }),
  });
  await store.setDate('2026-07-16');
  store.patch((r) => {
    r.twopm.currentSales = '9.9';
    r.actualMake.small = '104';
    r.eon.outlookForecast = '11';
    r.eon.outlookManual = true;
  });
  await store.reload({ force: true });
  const s = store.getState();
  assert.equal(s.record.twopm.currentSales, '2.2'); // the sheet's number wins
  assert.equal(s.record.actualMake.small, '104'); // never on the sheet — kept
  assert.equal(s.record.eon.outlookForecast, '11');
  assert.equal(s.record.eon.outlookManual, true);
  assert.equal(s.status, 'synced');
  const entry = JSON.parse(storage.getItem('dough:2026-07-16'));
  assert.equal(entry.syncedAt, entry.updatedAt); // local-wins disarmed
});

test('reload discards the arriving row when someone typed mid-fetch', async (t) => {
  const pending = [];
  const { store } = harness(t, {
    getImpl: () => new Promise((res) => { pending.push(res); }),
  });
  const boot = store.setDate('2026-07-16');
  await new Promise((r) => setImmediate(r));
  pending.shift()({ status: 'not_found' });
  await boot;

  const p = store.reload({ force: true });
  store.patch((r) => { r.eon.sales = '7'; });
  await new Promise((r) => setImmediate(r));
  pending.shift()({ status: 'found', data: sheetRow716 });
  await p;
  const s = store.getState();
  assert.equal(s.record.eon.sales, '7'); // the keystroke won
  assert.equal(s.record.twopm.todayForecast, ''); // row discarded
  assert.equal(s.status, 'local');
});

test('a setDate mid-reload supersedes the stale fetch', async (t) => {
  const pending = [];
  const { store } = harness(t, {
    getImpl: () => new Promise((res) => { pending.push(res); }),
  });
  const boot = store.setDate('2026-07-16');
  await new Promise((r) => setImmediate(r));
  pending.shift()({ status: 'not_found' });
  await boot;

  const p = store.reload({ force: true }); // its GET hangs…
  const pd = store.setDate('2026-07-17'); // …while a new date takes over
  await new Promise((r) => setImmediate(r));
  pending.shift()({ status: 'found', data: sheetRow716 }); // stale reload GET
  pending.shift()({ status: 'not_found' }); // the new date's GET
  await p;
  await pd;
  const s = store.getState();
  assert.equal(s.date, '2026-07-17');
  assert.equal(s.record.twopm.todayForecast, ''); // stale row never applied
});

test('reload with nothing on the sheet leaves the phone alone; network failure reads offline', async (t) => {
  let mode = 'not_found';
  const { store } = harness(t, {
    getImpl: async () => {
      if (mode === 'throw') throw new Error('down');
      return { status: 'not_found' };
    },
  });
  await store.setDate('2026-07-16');
  store.patch((r) => { r.twopm.currentSales = '5'; });
  const reasons = [];
  store.subscribe((_s, meta) => reasons.push(meta.reason));
  await store.reload({ force: true });
  let s = store.getState();
  assert.equal(s.record.twopm.currentSales, '5'); // not blanked
  assert.equal(s.status, 'local'); // status restored after the loading flip
  assert.ok(reasons.includes('loadmiss')); // the miss is signalled, not silent
  mode = 'throw';
  await store.reload({ force: true });
  s = store.getState();
  assert.equal(s.record.twopm.currentSales, '5');
  assert.equal(s.status, 'offline');
});

test('after a reset, the auto-refresh re-pulls the sheet (a blank has nothing to protect)', async (t) => {
  const { store } = harness(t, {
    getImpl: async () => ({ status: 'found', data: sheetRow716 }),
  });
  await store.setDate('2026-07-16');
  assert.equal(store.getState().record.twopm.todayForecast, '10');
  store.reset();
  assert.equal(store.getState().status, 'new');
  await store.reload(); // blank reset → the sheet copy wins, zero taps
  const s = store.getState();
  assert.equal(s.record.twopm.todayForecast, '10');
  assert.equal(s.status, 'synced');
});

/* ---------------- reload/flush coordination (v2·16) ---------------- */

test('resurface reload discards a stale row when a sync lands mid-fetch', async (t) => {
  // The wake sequence fires the `online` flush and the resurface reload
  // together; the GET can be served before the POSTs land and return the
  // pre-edit row. Applying it would revert the numbers that just synced.
  const pendingGets = [];
  const { store, tick } = harness(t, {
    getImpl: () => new Promise((res) => { pendingGets.push(res); }),
  });
  const boot = store.setDate('2026-07-16');
  await new Promise((r) => setImmediate(r));
  pendingGets.shift()({ status: 'not_found' });
  await boot;
  store.patch((r) => { r.eon.sales = '5'; });
  const p = store.reload(); // non-force; its GET hangs…
  await tick(2500); // …while the debounce flush completes (syncedAt moves)
  pendingGets.shift()({ status: 'found', data: { Date: '7/16/2026', 'EON Sales': 7000 } });
  await p;
  const s = store.getState();
  assert.equal(s.record.eon.sales, '5'); // the just-synced edit survives
  assert.equal(s.status, 'synced');
});

test('force reload lets an in-flight sync land before fetching', async (t) => {
  // Load's job is "show what the sheet holds" — if this phone's own POSTs
  // are still in flight, fetching first would race them and display a row
  // the sheet is about to replace.
  const pendingPosts = [];
  let row = null;
  let gets = 0;
  const { store, tick, settle } = harness(t, {
    postImpl: () => new Promise((res) => { pendingPosts.push(res); }),
    getImpl: async () => {
      gets++;
      return row ? { status: 'found', data: row } : { status: 'not_found' };
    },
  });
  await store.setDate('2026-07-16');
  store.patch((r) => { r.eon.sales = '5'; });
  await tick(2500); // flush starts, its POST hangs
  row = { Date: '7/16/2026', 'EON Sales': 7000 };
  const p = store.reload({ force: true });
  await settle();
  assert.equal(gets, 1); // only the setDate GET so far — reload is waiting
  pendingPosts.shift()({ ok: true });
  await settle();
  await p;
  assert.equal(gets, 2); // fetched only after the POST landed
  const s = store.getState();
  assert.equal(s.record.eon.sales, '7'); // the sheet copy applied
  assert.equal(s.status, 'synced');
});

test('a superseded flush hands off to the new date instead of stranding it', async (t) => {
  const pendingPosts = [];
  const { store, calls, tick, settle } = harness(t, {
    postImpl: (p) => (p.eonSales === 5000 ? new Promise((res) => { pendingPosts.push(res); }) : { ok: true }),
  });
  await store.setDate('2026-07-01');
  store.patch((r) => { r.eon.sales = '5'; });
  await tick(2500); // date A's flush hangs mid-POST
  await store.setDate('2026-07-02');
  store.patch((r) => { r.eon.sales = '6'; });
  await tick(2500); // B's debounce fires into the busy flush → queued as a rerun
  pendingPosts.shift()({ ok: true }); // A's POST finally lands
  await settle();
  // The rerun pass must flush B — dropping it on the seq check would leave
  // B "Saved on phone" with no timer armed until the next event.
  assert.ok(calls.some((c) => c.payload.eonSales === 6000));
  assert.equal(store.getState().status, 'synced');
});

test('reload invalidates the ack cache — a re-typed number reposts even when it matches an old payload', async (t) => {
  let serverRow = null;
  const { store, calls, tick } = harness(t, {
    getImpl: async () => (serverRow ? { status: 'found', data: serverRow } : { status: 'not_found' }),
  });
  await store.setDate('2026-07-16');
  store.patch((r) => { r.eon.sales = '5'; });
  await tick(2500);
  assert.equal(calls.length, 1); // acked: eonSales 5000
  serverRow = { Date: '7/16/2026', 'EON Sales': 7000 }; // another phone's number
  await store.reload(); // idle phone — the non-force refresh applies it
  assert.equal(store.getState().record.eon.sales, '7');
  store.patch((r) => { r.eon.sales = '5'; }); // disagree: re-type the original
  await tick(2500);
  // Byte-identical to the first post — a stale ack must not swallow it, or
  // the phone reads "synced" while the sheet keeps the other phone's 7000.
  assert.equal(calls.length, 2);
  assert.equal(calls[1].payload.eonSales, 5000);
  assert.equal(store.getState().status, 'synced');
});
