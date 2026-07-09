// js/ui/dayswork.js — Step 03: the tray chips (final trays including batch
// extras), the hero batch count, and the set-out alert card.

import { ALL, TRAYS_PER_BATCH } from '../config.js';
import { fmt } from '../calc.js';
import { $, setText } from './fields.js';

export function init() {
  const wrap = $('trayChips');
  for (const s of ALL) {
    const chip = document.createElement('span');
    chip.className = 'tray-chip';
    chip.id = `chip-${s.id}`;
    chip.style.setProperty('--c', `var(--${s.id})`);
    chip.innerHTML = `<span class="dot"></span><span class="monocaps">${s.chip}</span><span class="chip-val" id="chip-${s.id}-val">—</span>`;
    wrap.appendChild(chip);
  }
}

export function update(view) {
  const p = view.plan;

  for (const s of ALL) {
    const val = s.id === 'boil'
      ? (p.ready && p.boilMake != null ? p.boilTrays : null)
      : (p.finalTrays ? p.finalTrays[s.id] : null);
    setText($(`chip-${s.id}-val`), fmt(val));
    $(`chip-${s.id}`).classList.toggle('zero', val === 0);
  }

  const wrap = $('heroWrap');
  const empty = $('heroEmpty');
  if (p.ready) {
    wrap.classList.remove('hidden');
    empty.classList.add('hidden');
    setText($('heroNum'), String(p.batches));
    setText($('heroWords'), p.closedTomorrow
      ? 'closed tomorrow — nothing to make'
      : `${p.batches} ${p.batches === 1 ? 'batch' : 'batches'} to make`);
    const totalPrep = p.batches * TRAYS_PER_BATCH;
    setText($('heroNote'),
      `${totalPrep} trays${p.extra > 0 ? ` (${p.totalTrays} planned · extras: ${p.extraNote})` : ''}`);
    setText($('heroBoilWarn'), p.boilMake == null ? 'boil not counted — left out of batch math' : '');
  } else {
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
  }

  const alert = $('setoutAlert');
  if (p.setout.length) {
    alert.classList.remove('hidden');
    const list = $('setoutList');
    list.textContent = '';
    for (const it of p.setout) {
      const span = document.createElement('span');
      span.textContent = `${it.label}: ${it.trays} ${it.trays === 1 ? 'tray' : 'trays'}`;
      list.appendChild(span);
    }
  } else {
    alert.classList.add('hidden');
  }
}
