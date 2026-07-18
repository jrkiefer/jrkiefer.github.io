// js/main.js — the only place store and UI meet. Builds the store, derives
// one view per state change, routes update/hydrate to the UI modules, and
// owns the app-level bits: date, mode tabs, two-tap reset, unload flushes.

import { createStore } from './store.js';
import * as api from './api.js';
import { computePlan, effectiveMake, autoBibleFor, parseSales, fmtDate } from './calc.js';
import { BIBLES } from './config.js';
import { $, setText } from './ui/fields.js';
import * as sales from './ui/sales.js';
import { createCounts } from './ui/counts.js';
import * as dayswork from './ui/dayswork.js';
import * as bysize from './ui/bysize.js';
import * as outlook from './ui/outlook.js';
import * as bible from './ui/bible.js';
import * as temps from './ui/temps.js';
import * as history from './ui/history.js';
import * as make from './ui/make.js';

const STATUS_LABELS = {
  new: 'New night',
  loading: 'Loading',
  local: 'Saved on phone',
  synced: 'Synced',
  offline: 'Offline — will retry',
};

const store = createStore({ api, storage: window.localStorage });

// History fetch + mapping lives here so history.js stays render-only
// (UI modules never import api or touch storage).
async function loadHistoryEntries() {
  const rows = await api.getHistory();
  return (Array.isArray(rows) ? rows : []).slice(0, 10).map((row) => {
    const mdy = api.sheetDateToLocal(row.Date ?? row.date ?? '');
    const iso = api.mdyToISO(mdy);
    const batchesRaw = Number(row.Batches ?? row.batches);
    let eonSales = null;
    try {
      const entry = JSON.parse(window.localStorage.getItem(`dough:${iso}`));
      eonSales = parseSales(entry?.record?.eon?.sales ?? '');
    } catch { /* no local copy */ }
    return {
      iso,
      label: iso ? fmtDate(iso) : mdy,
      batches: Number.isFinite(batchesRaw) ? batchesRaw : null,
      eonSales,
    };
  });
}

const ctx = {
  patch: store.patch,
  history: {
    load: loadHistoryEntries,
    openDate: (iso) => {
      $('activeDate').value = iso;
      setMode('twopm'); // opening a date always lands on the 2 PM tab
      store.setDate(iso);
      window.scrollTo({ top: 0 });
    },
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
    setMode(tab.dataset.mode); // manual taps always win
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
  loadNoteTimer = setTimeout(() => { el.classList.add('hidden'); el.textContent = ''; loadNoteTimer = null; }, 4000);
}

store.subscribe((state, meta) => {
  lastState = state;
  document.documentElement.setAttribute('data-status', state.status);
  setText($('statusLabel'), STATUS_LABELS[state.status] ?? state.status);

  // The mode never auto-switches on a load — the tab defaults to 2 PM and
  // only a manual tap (or a reset/date-open, which snap to 2 PM at their
  // call sites) moves it. This keeps the silent resurface reload from
  // yanking someone off the EON tab on wake.
  if (meta.reason === 'load') { lastLoadAt = Date.now(); showLoadNote(''); }
  if (meta.reason === 'reset') setMode('twopm');
  // A force-load that found no sheet row for the date — say so instead of
  // leaving the button looking dead.
  if (meta.reason === 'loadmiss') showLoadNote(`No saved data on the sheet for ${fmtDate(state.date)}.`);

  // Derive once, after any mode change — the view carries the mode.
  const view = deriveView(state);
  setText($('bibleTag'), BIBLES[view.bibleId].label + (state.record.bible == null ? ' · auto' : ''));

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
    resetTimer = setTimeout(disarmReset, 2500);
    return;
  }
  disarmReset();
  store.reset();
});

/* ─── active date + load from sheet ─── */

const dateInput = $('activeDate');
dateInput.value = api.todayISO();
dateInput.addEventListener('change', () => {
  if (dateInput.value) {
    setMode('twopm'); // switching dates always lands on the 2 PM tab
    store.setDate(dateInput.value);
  }
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
  loadBtn.textContent = 'Load';
}

loadBtn.addEventListener('click', () => {
  if (!loadTimer) {
    loadBtn.classList.add('armed');
    loadBtn.textContent = 'Tap again';
    loadTimer = setTimeout(disarmLoad, 2500);
    return;
  }
  disarmLoad();
  setMode('twopm'); // a force-load always lands on the 2 PM tab
  store.reload({ force: true });
});

/* ─── sync lifecycle ─── */

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush({ keepalive: true });
});
window.addEventListener('pagehide', () => store.flush({ keepalive: true }));
window.addEventListener('online', () => store.flush());

// A phone that keeps the tab open never re-fetched — numbers typed on
// another phone stayed invisible until a manual reload. Re-pull on
// resurface; the non-force rules keep any unsynced local edits safe.
let lastLoadAt = Date.now();
function refreshOnWake() {
  if (document.visibilityState !== 'visible') return;
  if (store.getState().status === 'loading') return;
  if (Date.now() - lastLoadAt < 60_000) return;
  store.reload();
}
document.addEventListener('visibilitychange', refreshOnWake);
window.addEventListener('pageshow', refreshOnWake);

/* ─── boot ─── */

store.setDate(api.todayISO()).then(() => store.retryUnsynced());
