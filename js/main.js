// js/main.js — the only place store and UI meet. Builds the store, derives
// one view per state change, routes update/hydrate to the UI modules, and
// owns the app-level bits: date, mode tabs, two-tap reset, unload flushes.

import { createStore } from './store.js';
import * as api from './api.js';
import { computePlan, effectiveMake, autoBibleFor } from './calc.js';
import { BIBLES } from './config.js';
import { $, setText } from './ui/fields.js';
import * as sales from './ui/sales.js';
import { createCounts } from './ui/counts.js';
import * as dayswork from './ui/dayswork.js';
import * as bysize from './ui/bysize.js';
import * as outlook from './ui/outlook.js';

const STATUS_LABELS = {
  new: 'New night',
  loading: 'Loading',
  local: 'Saved on phone',
  synced: 'Synced',
  offline: 'Offline — will retry',
};

const store = createStore({ api, storage: window.localStorage });
const ctx = { patch: store.patch };

let mode = 'twopm';
let lastState = store.getState();

/* ─── UI modules ─── */

sales.init(ctx);
dayswork.init();
bysize.init();
outlook.init(ctx);
const parts = [
  sales,
  createCounts('tp', (r) => r.twopm.counts, ctx),
  createCounts('eon', (r) => r.eon.counts, ctx),
  dayswork,
  bysize,
  outlook,
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

function has2pmData(record) {
  if (record.twopm.tomorrowForecast !== '') return true;
  return Object.values(record.twopm.counts).some((c) => c.trays !== '' || c.singles !== '');
}

for (const tab of document.querySelectorAll('.mode-tab')) {
  tab.addEventListener('click', () => {
    setMode(tab.dataset.mode); // manual taps always win
    updateAll(deriveView(lastState));
  });
}

/* ─── store → UI ─── */

store.subscribe((state, meta) => {
  lastState = state;
  document.documentElement.setAttribute('data-status', state.status);
  setText($('statusLabel'), STATUS_LABELS[state.status] ?? state.status);

  const view = deriveView(state);
  setText($('bibleTag'), BIBLES[view.bibleId].label + (state.record.bible == null ? ' · auto' : ''));

  if (meta.reason === 'load') {
    // auto-select EON when the date already has 2 PM data
    setMode(has2pmData(state.record) ? 'eon' : 'twopm');
  }
  if (meta.reason === 'reset') setMode('twopm');

  const rehydrate = meta.reason === 'load' || meta.reason === 'reset'
    || (meta.reason === 'status' && state.status === 'loading'); // clear while loading
  if (rehydrate) hydrateAll(deriveView(state)); // mode may have changed

  updateAll(deriveView(state));
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

/* ─── active date ─── */

const dateInput = $('activeDate');
dateInput.value = api.todayISO();
dateInput.addEventListener('change', () => {
  if (dateInput.value) store.setDate(dateInput.value);
});

/* ─── sync lifecycle ─── */

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush({ keepalive: true });
});
window.addEventListener('pagehide', () => store.flush({ keepalive: true }));
window.addEventListener('online', () => store.flush());

/* ─── boot ─── */

store.setDate(api.todayISO()).then(() => store.retryUnsynced());
