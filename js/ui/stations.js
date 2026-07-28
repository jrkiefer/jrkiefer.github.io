// js/ui/stations.js — Step 09, the Station Temps page (its own mode):
// Morning / 2 PM / Night slot pills defaulted by the clock (onEnter, called
// by main.js on every tap of the Station Temps tab), 8 signed-decimal °F
// inputs captured per slot through ctx.patch, and a "Load last temps"
// reference display (never fills the inputs). A slot tap re-hydrates the
// inputs — a user action, so writing input values there is allowed.

import { STATIONS, STATION_SLOTS } from '../config.js?v=2.21';
import { defaultStationSlot, blankStations } from '../calc.js?v=2.21';
import { $, bindInput, setInputValue, setText } from './fields.js?v=2.21';

let slot = 'twopm';
let lastRecord = null;

const timeNow = () =>
  new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function paintPills() {
  for (const sl of STATION_SLOTS) {
    $(`stationSlotPill-${sl.id}`).classList.toggle('active', sl.id === slot);
  }
}

function currentSlot() {
  return lastRecord?.stations?.[slot] ?? null;
}

function hydrateInputs() {
  const st = currentSlot();
  for (const s of STATIONS) {
    setInputValue($(`station-${s.id}`), st ? st.temps[s.id] : '');
  }
  paintTakenAt();
}

function paintTakenAt() {
  const st = currentSlot();
  setText($('stationTakenAt'), st && st.takenAt ? `Taken at ${st.takenAt}` : '');
}

export function init(ctx) {
  slot = defaultStationSlot(new Date().getHours()); // sensible before first entry
  const pills = $('stationSlots');
  for (const sl of STATION_SLOTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bible-pill';
    btn.id = `stationSlotPill-${sl.id}`;
    btn.textContent = sl.label;
    btn.addEventListener('click', () => {
      if (sl.id === slot) return;
      slot = sl.id;
      paintPills();
      hydrateInputs(); // user action — the one time this module writes inputs
    });
    pills.appendChild(btn);
  }

  const wrap = $('stationRows');
  for (const s of STATIONS) {
    const row = document.createElement('div');
    row.className = 'station-row';
    row.innerHTML = `
      <div class="station-label">
        <span class="eyebrow soft">${s.label}</span>
        <span class="station-last monocaps hidden" id="stationLast-${s.id}"></span>
      </div>
      <button type="button" class="sign-btn" id="stationSign-${s.id}"
        aria-label="${s.label} below zero">±</button>
      <div class="field has-suffix">
        <input id="station-${s.id}" inputmode="decimal" aria-label="${s.label} temp">
        <span class="suffix">°F</span><span class="saved-chip">✓ saved</span>
      </div>`;
    wrap.appendChild(row);
    const writeTemp = (v) => ctx.patch((r) => {
      if (!r.stations) r.stations = blankStations(); // pre-v2·20 local copy
      r.stations[slot].temps[s.id] = v;
      r.stations[slot].takenAt = timeNow(); // "last touched" stamp
    });
    bindInput($(`station-${s.id}`), {
      decimal: true,
      signed: true, // a freezer can read negative °F
      onValue: writeTemp,
    });
    // The phone's decimal keypad has no minus key, so a signed filter alone
    // can't produce a below-zero reading — this button flips the sign
    // through the same write path as typing.
    $(`stationSign-${s.id}`).addEventListener('click', () => {
      const input = $(`station-${s.id}`);
      const v = input.value.startsWith('-') ? input.value.slice(1) : `-${input.value}`;
      setInputValue(input, v);
      writeTemp(v);
    });
  }

  const btn = $('stationLoadLast');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Loading…';
    const note = $('stationLastNote');
    note.classList.add('hidden');
    try {
      const res = await ctx.stations.loadLast();
      const latest = res && res.latest ? res.latest : {};
      for (const s of STATIONS) {
        const el = $(`stationLast-${s.id}`);
        const hit = latest[s.label];
        el.textContent = hit
          ? `last ${hit.temp}° · ${hit.date} ${hit.slot}${hit.time ? ` · ${hit.time}` : ''}`
          : 'no reading yet';
        el.classList.remove('hidden');
      }
    } catch {
      note.textContent = "Couldn't load last temps — check the connection and tap again.";
      note.classList.remove('hidden');
    }
    btn.disabled = false;
    btn.textContent = 'Load last temps';
  });
}

// Called by main.js every time the Station Temps tab is tapped: the slot
// pill re-defaults to what the clock says, then shows that slot's numbers.
export function onEnter() {
  slot = defaultStationSlot(new Date().getHours());
  paintPills();
  hydrateInputs();
}

export function update(view) {
  lastRecord = view.record;
  paintPills();
  paintTakenAt(); // display nodes only — never inputs
}

export function hydrate(view) {
  lastRecord = view.record;
  hydrateInputs();
}
