// js/main.js — the only place store and UI meet. Builds the store, derives
// one view per state change, routes update/hydrate to the UI modules, and
// owns the app-level bits: date, mode tabs, two-tap reset, unload flushes.

import { createStore } from './store.js?v=2.21';
import * as api from './api.js?v=2.21';
import { computePlan, effectiveMake, autoBibleFor, parseSales, fmtDate } from './calc.js?v=2.21';
import { APP_VERSION } from './config.js?v=2.21';
import { $, setText } from './ui/fields.js?v=2.21';
import * as sales from './ui/sales.js?v=2.21';
import { createCounts } from './ui/counts.js?v=2.21';
import * as dayswork from './ui/dayswork.js?v=2.21';
import * as bysize from './ui/bysize.js?v=2.21';
import * as outlook from './ui/outlook.js?v=2.21';
import * as bible from './ui/bible.js?v=2.21';
import * as temps from './ui/temps.js?v=2.21';
import * as history from './ui/history.js?v=2.21';
import * as make from './ui/make.js?v=2.21';
import * as stations from './ui/stations.js?v=2.21';

const STATUS_LABELS = {
  new: 'New night',
  loading: 'Loading',
  local: 'Saved on phone',
  synced: 'Synced',
  offline: 'Offline — will retry',
};

// UI timing.
const RESET_DISARM_MS = 2500; // two-tap reset: second tap window
const LOAD_DISARM_MS = 3000; // "Discard edits & load?" confirm window
const LOAD_NOTE_MS = 4000; // transient note under the date card
const HISTORY_SHOWN = 10; // recent nights listed in the History card

const store = createStore({ api, storage: window.localStorage });

// History fetch + mapping lives here so history.js stays render-only
// (UI modules never import api or touch storage).
async function loadHistoryEntries() {
  const rows = await api.getHistory();
  store.cacheHistory(rows); // keep recent days ready to load offline
  return (Array.isArray(rows) ? rows : []).slice(0, HISTORY_SHOWN).map((row) => {
    const iso = api.rowToISO(row);
    const batchesRaw = Number(row.Batches ?? row.batches);
    // EON sales only live in the local cache — the bare history GET
    // carries Dough Counts rows alone.
    const local = iso ? store.getLocalRecord(iso) : null;
    return {
      iso,
      label: iso ? fmtDate(iso) : String(row.Date ?? row.date ?? ''),
      batches: Number.isFinite(batchesRaw) ? batchesRaw : null,
      eonSales: local ? parseSales(local.eon.sales) : null,
    };
  });
}

const ctx = {
  patch: store.patch,
  history: {
    load: loadHistoryEntries,
    openDate: (iso) => {
      $('activeDate').value = iso;
      store.setDate(iso);
      window.scrollTo({ top: 0 });
    },
  },
  stations: {
    loadLast: () => api.getStationsLast(),
  },
};

let mode = 'twopm';
let lastState = store.getState();

/* ─── UI modules ─── */

sales.init(ctx);
dayswork.init(ctx);
bysize.init();
outlook.init(ctx);
bible.init(ctx);
temps.init(ctx);
history.init(ctx);
make.init(ctx);
stations.init(ctx);
const parts = [
  sales,
  createCounts('tp', (r) => r.twopm.counts, ctx),
  createCounts('eon', (r) => r.eon.counts, ctx),
  dayswork,
  bysize,
  outlook,
  bible,
  temps,
  make,
  stations,
];

function deriveView(state) {
  const autoBible = autoBibleFor(state.date || api.todayISO());
  const bibleId = state.record.bible ?? autoBible;
  const plan = computePlan(state.record, bibleId);
  const eff = effectiveMake(state.record, plan);
  return { ...state, autoBible, bibleId, plan, eff, mode };
}

function updateAll(view) {
  for (const p of parts) p.update?.(view);
}

function hydrateAll(view) {
  for (const p of parts) p.hydrate?.(view);
}

/* ─── mode tabs ─── */

function setMode(m) {
  mode = m;
  document.documentElement.setAttribute('data-mode', m);
  for (const tab of document.querySelectorAll('.mode-tab')) {
    const active = tab.dataset.mode === m;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  }
}

for (const tab of document.querySelectorAll('.mode-tab')) {
  tab.addEventListener('click', () => {
    // Re-default the station slot only on a real ENTRY — a stray re-tap of
    // the already-active tab must not discard a manually-picked slot and
    // rewrite the inputs from another slot's numbers.
    const entering = tab.dataset.mode === 'stations' && mode !== 'stations';
    setMode(tab.dataset.mode); // manual taps always win
    if (entering) stations.onEnter(); // re-default the slot by clock
    updateAll(deriveView(lastState));
  });
}

/* ─── store → UI ─── */

// Transient note under the date card (e.g. a force-load that found nothing).
let loadNoteTimer = null;
function showLoadNote(msg) {
  const el = $('loadNote');
  if (loadNoteTimer) { clearTimeout(loadNoteTimer); loadNoteTimer = null; }
  if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.textContent = msg;
  el.classList.remove('hidden');
  loadNoteTimer = setTimeout(() => { el.classList.add('hidden'); el.textContent = ''; loadNoteTimer = null; }, LOAD_NOTE_MS);
}

// Sticky warning for a backend-rejected save — the "says saved but didn't"
// killer. Unlike showLoadNote it never auto-hides and can't be dismissed:
// it clears itself only when the rejection actually resolves (the changed
// payload lands, the offending fields are cleared, or a load/reset/
// date-change replaces the record). Rendered from state on every
// notification, so no reason-specific wiring is needed.
const REJECT_LABELS = {
  dough: '2 PM save',
  make: 'make correction',
  temps: 'batch temps',
  eon: 'EON save',
  stations: 'station temps',
};
function renderSyncWarn(rejection) {
  const el = $('syncWarn');
  if (!rejection) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  const label = REJECT_LABELS[rejection.type] ?? rejection.type;
  setText(el, `⚠ The sheet refused the ${label} — ${rejection.message}. It is NOT saved to the sheet (still safe on this phone).`);
  el.classList.remove('hidden');
}

store.subscribe((state, meta) => {
  lastState = state;
  document.documentElement.setAttribute('data-status', state.status);
  setText($('statusLabel'), STATUS_LABELS[state.status] ?? state.status);
  renderSyncWarn(state.rejection);

  if (meta.reason === 'load') {
    setMode('twopm'); // always open on 2 PM; EON is a manual tap
    showLoadNote('');
  }
  if (meta.reason === 'reset') setMode('twopm');
  // A force-load that found no sheet row for the date, or one that found
  // nothing new — say so instead of leaving the button looking dead.
  if (meta.reason === 'loadmiss') showLoadNote(`No saved data on the sheet for ${fmtDate(state.date)}.`);
  if (meta.reason === 'loadsame') showLoadNote('Up to date with the sheet.');

  // Derive once, after any mode change — the view carries the mode.
  const view = deriveView(state);

  const rehydrate = meta.reason === 'load' || meta.reason === 'reset'
    || (meta.reason === 'status' && state.status === 'loading'); // clear while loading
  if (rehydrate) hydrateAll(view);

  updateAll(view);
});

/* ─── two-tap reset ─── */

const resetBtn = $('resetBtn');
let resetTimer = null;

function disarmReset() {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = null;
  resetBtn.classList.remove('armed');
  resetBtn.textContent = 'Reset';
}

resetBtn.addEventListener('click', () => {
  if (!resetTimer) {
    resetBtn.classList.add('armed');
    resetBtn.textContent = 'Tap again';
    resetTimer = setTimeout(disarmReset, RESET_DISARM_MS);
    return;
  }
  disarmReset();
  store.reset();
});

/* ─── active date + load from sheet ─── */

const dateInput = $('activeDate');
dateInput.value = api.todayISO();
dateInput.addEventListener('change', () => {
  if (dateInput.value) store.setDate(dateInput.value);
});

// Two-tap like Reset: a force-load replaces this phone's copy with the
// sheet's (that's its job — the way past local-wins after a Reset or a
// two-phone standoff), so it shouldn't fire on a stray tap.
const loadBtn = $('loadBtn');
let loadTimer = null;

function disarmLoad() {
  if (loadTimer) clearTimeout(loadTimer);
  loadTimer = null;
  loadBtn.classList.remove('armed');
  loadBtn.textContent = 'Load from sheet';
}

loadBtn.addEventListener('click', () => {
  // One tap when there's nothing unsynced to lose. A force-load only needs
  // a confirming second tap when it would discard real local edits.
  if (!store.getState().dirty) {
    disarmLoad();
    store.reload({ force: true });
    return;
  }
  if (!loadTimer) {
    loadBtn.classList.add('armed');
    loadBtn.textContent = 'Discard edits & load?';
    loadTimer = setTimeout(disarmLoad, LOAD_DISARM_MS);
    return;
  }
  disarmLoad();
  store.reload({ force: true });
});

/* ─── sync lifecycle ─── */

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush({ keepalive: true });
});
window.addEventListener('pagehide', () => store.flush({ keepalive: true }));

// Reconnect: push any unsynced edits the moment the network returns.
// No re-pull — since v2·19 the sheet is read only on open, date-change,
// and the Load button; a background reload could yank the mode back to
// 2 PM mid-EON count, so there is no background refresh at all.
window.addEventListener('online', () => store.flush());

/* ─── boot ─── */

// Pre-warm the local cache with the last ~30 nights so opening a recent
// date is instant and survives a flaky network. Background, failure-silent.
async function prewarmCache() {
  try {
    store.cacheHistory(await api.getHistory());
  } catch { /* offline — the cache just stays as-is */ }
}

// The footer version is written by JS on purpose: a blank footer means
// the phone is running stale cached scripts, not this release.
setText($('appVersion'), APP_VERSION);

store.setDate(api.todayISO()).then(() => {
  store.retryUnsynced();
  prewarmCache();
});
