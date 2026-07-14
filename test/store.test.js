import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blankRecord } from '../js/calc.js';
import { buildPayloads, recordFromRow } from '../js/api.js';
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

test('reset blanks the open date and blocks server resurrection', async (t) => {
  const { store, storage, calls } = harness(t, {
    getImpl: async () => ({ status: 'found', data: serverRow }),
  });
  await store.setDate('2026-04-02'); // hydrates from the server
  assert.equal(store.getState().record.twopm.todayForecast, '9');
  store.reset();
  assert.equal(store.getState().status, 'new');
  const before = calls.length;
  await store.flush(); // nothing to send for a blank record
  assert.equal(calls.length, before);
  const entry = JSON.parse(storage.getItem('dough:2026-04-02'));
  assert.ok(entry.updatedAt > entry.syncedAt); // local-wins stays armed
  await store.setDate('2026-04-02'); // reload the same date
  assert.equal(store.getState().record.twopm.todayForecast, ''); // no resurrect
  assert.equal(store.getState().status, 'local');
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
