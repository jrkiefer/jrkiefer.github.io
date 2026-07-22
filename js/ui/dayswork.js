// js/ui/dayswork.js — Step 03: the tray chips (final trays including batch
// extras/cuts), the hero batch count with its rounding pills, and the
// set-out alert card.

import { ALL, TRAYS_PER_BATCH } from '../config.js';
import { fmt } from '../calc.js';
import { $, setText, roundPills } from './fields.js';

let updateRoundPills = null;

export function init(ctx) {
  const wrap = $('trayChips');
  for (const s of ALL) {
    const chip = document.createElement('span');
    chip.className = 'tray-chip';
    chip.id = `chip-${s.id}`;
    chip.style.setProperty('--c', `var(--${s.id})`);
    chip.innerHTML = `<span class="dot"></span><span class="monocaps">${s.chip}</span><span class="chip-val" id="chip-${s.id}-val">—</span>`;
    wrap.appendChild(chip);
  }
  updateRoundPills = roundPills('batchRoundPill', 'batchRoundAutoTag',
    (id) => ctx.patch((r) => { r.batchRound = id; }));
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

    // Planned = the raw tray total; Making = what the batch count produces.
    const madeTrays = p.batches * TRAYS_PER_BATCH;
    const tray = (n) => `${n} ${n === 1 ? 'tray' : 'trays'}`;
    setText($('heroPlanned'), tray(p.totalTrays));
    setText($('heroMaking'), `${tray(madeTrays)} (${p.batches} × ${TRAYS_PER_BATCH})`);

    // Rounding badge: how far the batch count moved off the planned trays.
    const badge = $('heroRound');
    badge.classList.remove('down', 'up', 'even', 'hidden');
    if (p.closedTomorrow || p.totalTrays === 0) {
      badge.classList.add('hidden');
    } else if (p.cut > 0) {
      badge.classList.add('down');
      setText(badge, `▾ rounded down ${tray(p.cut)}${p.cutNote ? ` · ${p.cutNote}` : ''}`);
    } else if (p.extra > 0) {
      badge.classList.add('up');
      setText(badge, `▴ rounded up · +${tray(p.extra)}${p.extraNote ? ` · ${p.extraNote}` : ''}`);
    } else {
      badge.classList.add('even');
      setText(badge, `even · ${tray(p.totalTrays)} = ${p.batches} ${p.batches === 1 ? 'batch' : 'batches'}`);
    }

    setText($('heroBoilWarn'), p.boilMake == null ? 'boil not counted — left out of batch math' : '');
  } else {
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
  }

  updateRoundPills(view.record.batchRound, p.rounding.batches);

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
