// js/store.js — record state, localStorage write-through, background sync.
// No DOM access anywhere in this file; main.js connects store and UI.
//
// The contract: every patch writes localStorage SYNCHRONOUSLY (that write
// is the moment data is safe), then a trailing debounce POSTs the derived
// sheet payloads in the background. Status reflects the two-stage journey:
// 'local' (saved on phone) → 'synced' (landed in the sheet).

import { blankRecord } from './calc.js';

const KEY_PREFIX = 'dough:';
const BLANK_JSON = JSON.stringify(blankRecord());
const POST_ORDER = ['dough', 'make', 'temps', 'eon']; // make needs the dough row

export function createStore({ api, storage, now = Date.now, debounceMs = 2500 }) {
  let date = null;
  let record = blankRecord();
  let updatedAt = 0;
  let syncedAt = 0;
  let status = 'new'; // new | loading | local | synced | offline
  let hasServerDoughRow = false;
  let seq = 0; // bumped by setDate — kills stale loads and stale flushes
  let debounceTimer = null;
  let flushing = false;
  let flushRun = null; // the in-flight flush's completion promise — reload waits on it
  let rerun = false;
  let sent = {}; // per-type serialized-payload ack cache (per date)
  const subscribers = new Set();

  const isBlank = (r) => JSON.stringify(r) === BLANK_JSON;
  const keyFor = (d) => KEY_PREFIX + d;

  // Unsynced edits worth protecting from a server load. A blank record —
  // a reset, or a date this phone only glanced at — has nothing to lose, so
  // it deliberately does NOT block a load: that's what un-sticks a phone
  // showing a stale blank for a date another phone already saved. Only a
  // record with real typed values holds the line against the sheet.
  const hasUnsyncedEdits = () => updatedAt > syncedAt && !isBlank(record);

  // The status an idle record should show (used to restore after a
  // force-load's 'loading' when nothing ends up applied).
  const idleStatus = () => (hasUnsyncedEdits() ? 'local' : isBlank(record) ? 'new' : 'synced');

  function notify(reason) {
    const state = getState();
    for (const fn of subscribers) fn(state, { reason });
  }

  function getState() {
    return { date, record, status, updatedAt, syncedAt, dirty: hasUnsyncedEdits() };
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  function persist() {
    try {
      storage.setItem(keyFor(date), JSON.stringify({ v: 2, record, updatedAt, syncedAt }));
    } catch (e) {
      console.warn('localStorage write failed', e);
    }
  }

  function readLocal(d) {
    try {
      const raw = storage.getItem(keyFor(d));
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || entry.v !== 2 || !entry.record) return null;
      return entry;
    } catch {
      return null;
    }
  }

  function setStatus(s) {
    if (status === s) return;
    status = s;
    notify('status');
  }

  function armDebounce() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      flush();
    }, debounceMs);
  }

  function patch(fn) {
    const next = JSON.parse(JSON.stringify(record));
    fn(next);
    record = next;
    updatedAt = now();
    persist(); // synchronous — data is safe on the phone from here
    status = 'local';
    notify('patch');
    armDebounce();
  }

  // Send one date's payloads in order. Returns {networkFailed}. Shared by
  // the live flush and the boot retry; `ack` collects successful sends.
  async function postPayloads(payloads, doughRowKnown, ack) {
    let networkFailed = false;
    let doughOk = doughRowKnown;
    for (const type of POST_ORDER) {
      const payload = payloads[type];
      if (!payload) continue;
      const ser = JSON.stringify(payload);
      if (ack[type] === ser) {
        if (type === 'dough') doughOk = true;
        continue;
      }
      // The make correction needs a Dough Counts row to exist server-side.
      if (type === 'make' && !doughOk) continue;
      const res = await api.post(payload);
      if (res.ok) {
        ack[type] = ser;
        if (type === 'dough') doughOk = true;
      } else if (res.rejected) {
        // Terminal for this payload version — a backend rule said no.
        // Retried only after the record changes (new serialization).
        ack[type] = ser;
        console.warn(`backend rejected ${type} save: ${res.message}`);
      } else {
        networkFailed = true;
      }
    }
    return { networkFailed };
  }

  async function flush({ keepalive = false } = {}) {
    if (date == null) return;

    if (keepalive) {
      // Unload path: fire-and-forget with keepalive fetches. Responses are
      // never awaited, so nothing is marked synced — the boot retry (or the
      // next regular flush) reconciles; server upserts make resends safe.
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (updatedAt <= syncedAt) return;
      const payloads = api.buildPayloads(date, record);
      for (const type of POST_ORDER) {
        const payload = payloads[type];
        if (!payload) continue;
        if (sent[type] === JSON.stringify(payload)) continue;
        api.post(payload, { keepalive: true }).catch(() => {});
      }
      return;
    }

    // Nothing unsynced — never re-POST a clean record. setDate/reload clear
    // the ack cache, so without this guard a reconnect flush would upsert
    // this phone's loaded copy over a possibly newer sheet row.
    if (updatedAt <= syncedAt) return;

    if (flushing) {
      rerun = true;
      return flushRun;
    }
    flushing = true;
    const run = (async () => {
      try {
        do {
          rerun = false;
          const flushSeq = seq;
          const flushedAt = updatedAt;
          const payloads = api.buildPayloads(date, record);
          if (Object.keys(payloads).length === 0) {
            // Nothing the backend would accept (blank or reset record).
            // Deliberately NOT marked synced: a reset must keep local-wins
            // so a stale sheet row can't resurrect on the next load.
            return;
          }
          const { networkFailed } = await postPayloads(payloads, hasServerDoughRow, sent);
          // Date changed mid-flight — this pass's state was replaced. Don't
          // bail out entirely: a flush attempt for the NEW date may have set
          // `rerun` while this one was in flight, and returning here would
          // drop it, stranding the new date's edits until the next event.
          if (seq !== flushSeq) continue;
          if (networkFailed) {
            setStatus('offline');
          } else if (updatedAt === flushedAt) {
            syncedAt = flushedAt;
            persist();
            setStatus('synced');
          }
          // else: edits landed mid-flight — stay 'local', debounce re-flushes
        } while (rerun);
      } finally {
        flushing = false;
        flushRun = null;
      }
    })();
    // A pass that bailed synchronously (nothing the backend would accept)
    // has already run its finally — storing its settled promise back into
    // flushRun would leave reload()'s wait spinning on it forever.
    if (flushing) flushRun = run;
    return run;
  }

  // Change the active date: local entry + merged GET race, newer wins.
  async function setDate(iso) {
    const mySeq = ++seq;
    date = iso;
    record = blankRecord();
    updatedAt = 0;
    syncedAt = 0;
    sent = {};
    hasServerDoughRow = false;
    setStatus('loading');

    const local = readLocal(iso);
    let server = null;
    let netFail = false;
    try {
      server = await api.getByDate(iso);
    } catch {
      netFail = true;
    }
    if (mySeq !== seq) return; // another setDate superseded this load

    const serverRow = server && server.status === 'found' && server.data ? server.data : null;
    hasServerDoughRow = !!(serverRow && serverRow["Today's Forecast"] !== undefined);

    // A patch or reset that landed while the GET was in flight is the
    // newest unsynced local state — local-wins applies to it too. It's
    // already persisted and its debounce is armed; the arriving copy
    // (and the pre-patch `local` snapshot) must not clobber it.
    if (updatedAt > 0) return;

    if (local && local.updatedAt > (local.syncedAt || 0) && !isBlank(local.record)) {
      // Real unsynced local edits win wholesale over whatever the server
      // has. A blank unsynced copy (a reset, or a date this phone only
      // glanced at) deliberately does NOT win — it falls through so the
      // sheet's saved row loads instead of a stale blank.
      record = local.record;
      updatedAt = local.updatedAt;
      syncedAt = local.syncedAt || 0;
      status = 'local';
      notify('load');
      armDebounce(); // retry the sync shortly
      return;
    }

    if (serverRow) {
      record = api.recordFromRow(serverRow);
      // Carry over what the sheet never stores from the synced local copy.
      if (local) {
        record.actualMake = local.record.actualMake;
        record.eon.outlookForecast = local.record.eon.outlookForecast;
        record.eon.outlookManual = local.record.eon.outlookManual;
      }
      updatedAt = syncedAt = now();
      persist();
      status = 'synced';
      notify('load');
      return;
    }

    if (netFail) {
      if (local) {
        record = local.record;
        updatedAt = local.updatedAt;
        syncedAt = local.syncedAt || 0;
      }
      status = 'offline';
      notify('load');
      return;
    }

    // not found on the server
    if (local) {
      record = local.record;
      updatedAt = local.updatedAt;
      syncedAt = local.syncedAt || 0;
    }
    status = isBlank(record) ? 'new' : 'synced';
    notify('load');
  }

  // Re-pull the active date from the sheet without blanking state first.
  // Non-force applies only when this phone has nothing unsynced — no UI
  // path fires it since v2·19 (the background auto-refresh is gone); it
  // remains a tested store API whose guards made the refresh safe. Force
  // (the Load button) applies the sheet copy wholesale — the one deliberate
  // way past local-wins, including after a Reset.
  async function reload({ force = false } = {}) {
    if (date == null) return;
    const mySeq = seq;
    if (force) setStatus('loading');
    // Let an in-flight sync land before fetching: its POSTs are changing what
    // the sheet holds, so a GET raced against them can return a row that
    // predates this phone's own numbers (Load must show what the sheet holds
    // AFTER this phone's own writes).
    while (flushing && flushRun) await flushRun;
    if (mySeq !== seq) return; // a setDate arrived while we waited
    const startUpdatedAt = updatedAt;
    const startSyncedAt = syncedAt;
    let server = null;
    let netFail = false;
    try {
      server = await api.getByDate(date);
    } catch {
      netFail = true;
    }
    if (mySeq !== seq) return; // a setDate superseded this fetch
    if (updatedAt !== startUpdatedAt) return; // typed mid-fetch — the edit wins
    if (syncedAt !== startSyncedAt) {
      // A flush landed while the GET was in flight, so the row in hand may
      // predate the numbers that just synced — applying it would revert them
      // (and the next keystroke would upsert the stale copy back). Drop it.
      if (force) setStatus(idleStatus());
      return;
    }

    const serverRow = server && server.status === 'found' && server.data ? server.data : null;
    if (netFail) {
      setStatus('offline');
      return;
    }
    if (!serverRow) {
      // Nothing on the sheet — never blank a phone over that. Restore the
      // status after the force-load's 'loading', and tell the UI a force-load
      // found nothing so it isn't a silent no-op.
      if (force) {
        setStatus(idleStatus());
        notify('loadmiss');
      }
      return;
    }
    // A blank record (a reset, or a date only glanced at) has nothing to
    // protect — it yields to the sheet; real unsynced edits win silently on
    // the non-force refresh. The syncedAt-moved guard above already handles a
    // flush landing mid-fetch, so the live check is safe here.
    if (!force && hasUnsyncedEdits()) return;

    hasServerDoughRow = serverRow["Today's Forecast"] !== undefined;
    const next = api.recordFromRow(serverRow);
    // The sheet never stores these — keep this phone's copies.
    next.actualMake = record.actualMake;
    next.eon.outlookForecast = record.eon.outlookForecast;
    next.eon.outlookManual = record.eon.outlookManual;

    // Same content this phone already shows — refresh the sync stamps but
    // skip the apply: no rehydrate (a no-change re-pull must not rewrite
    // inputs or yank the mode back to 2 PM when nothing changed) and the
    // ack cache stays (it describes content the sheet provably holds).
    // Stamping synced also recovers an 'offline' status once a later
    // re-pull gets through.
    if (JSON.stringify(next) === JSON.stringify(record)) {
      updatedAt = syncedAt = now();
      persist();
      setStatus('synced');
      if (force) notify('loadsame'); // the Load button shouldn't look dead
      return;
    }
    record = next;
    // The ack cache described the record this phone last posted — after
    // applying the sheet's copy (possibly another phone's numbers) a stale ack
    // could swallow a later edit that re-serializes the same payload, leaving
    // the phone "synced" while the sheet disagrees.
    sent = {};
    updatedAt = syncedAt = now();
    persist();
    status = 'synced';
    notify('load');
  }

  // Two-tap reset target: blank the open date's record only. updatedAt is
  // stamped with syncedAt left at 0 so local-wins blocks the server copy
  // from auto-resurrecting the cleared data on the next load. Sheet rows
  // are not deleted (there's no backend API for that).
  function reset() {
    record = blankRecord();
    updatedAt = now();
    syncedAt = 0;
    sent = {};
    persist();
    status = 'new';
    notify('reset');
  }

  // Pre-warm the local cache from a History pull so recently-saved dates
  // load instantly (and survive a flaky network). Gap-fill ONLY: never
  // overwrite an existing local copy, so unsynced edits and richer
  // EON/temps records are always preserved. Rows carry Dough Counts fields;
  // they land as fully-synced entries so a later setDate still prefers the
  // server's merged row when reachable, and falls back to this when not.
  function cacheHistory(rows) {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const iso = api.rowToISO(row);
      if (!iso || iso === date) continue; // the active date manages itself
      if (readLocal(iso)) continue; // never clobber an existing copy
      const t = now();
      try {
        storage.setItem(keyFor(iso), JSON.stringify({
          v: 2, record: api.recordFromRow(row), updatedAt: t, syncedAt: t,
        }));
      } catch { /* best effort */ }
    }
  }

  // Read-only peek at another date's cached record (the History card shows
  // EON sales from it). The active date's record comes from getState.
  function getLocalRecord(d) {
    const entry = readLocal(d);
    return entry ? entry.record : null;
  }

  // Boot pass: re-send any date whose local copy never finished syncing
  // (tab closed mid-debounce, offline night, keepalive flush).
  async function retryUnsynced() {
    const keys = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(KEY_PREFIX)) keys.push(k);
      }
    } catch {
      return;
    }
    for (const k of keys) {
      const d = k.slice(KEY_PREFIX.length);
      if (d === date) continue; // the active date flushes normally
      const entry = readLocal(d);
      if (!entry || entry.updatedAt <= (entry.syncedAt || 0)) continue;
      const payloads = api.buildPayloads(d, entry.record);
      if (Object.keys(payloads).length === 0) continue;
      const { networkFailed } = await postPayloads(payloads, false, {});
      if (!networkFailed) {
        try {
          storage.setItem(k, JSON.stringify({ ...entry, syncedAt: entry.updatedAt }));
        } catch { /* best effort */ }
      }
    }
    if (updatedAt > syncedAt) flush();
  }

  return {
    getState, subscribe, patch, setDate, reload, flush, reset,
    cacheHistory, retryUnsynced, getLocalRecord,
  };
}
