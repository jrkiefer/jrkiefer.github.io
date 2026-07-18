// js/ui/dayswork.js — Step 03: the tray chips (final trays including batch
// extras/cuts), the hero batch count with its rounding pills, and the
// set-out alert card.

import { ALL, TRAYS_PER_BATCH } from '../config.js';
import { fmt } from '../calc.js';
import { $, setText } from './fields.js';

let stampedRound = null; // RAW record.batchRound from the last update(view)

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
  for (const id of ['up', 'down']) {
    // Guard on the RAW stamp (not the resolved direction): tapping the
    // value the auto rule currently resolves to PINS it against live inputs.
    $(`batchRoundPill-${id}`).addEventListener('click', () => {
      if (stampedRound === id) return;
      ctx.patch((r) => { r.batchRound = id; });
    });
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
  const banner = $('roundBanner');
  if (p.ready) {
    wrap.classList.remove('hidden');
    empty.classList.add('hidden');
    setText($('heroNum'), String(p.batches));
    setText($('heroWords'), p.closedTomorrow
      ? 'closed tomorrow — nothing to make'
      : `${p.batches} ${p.batches === 1 ? 'batch' : 'batches'} to make`);
    setText($('heroBoilWarn'), p.boilMake == null ? 'boil not counted — left out of batch math' : '');
    // Rounding banner: spell out planned trays vs. what we're actually
    // making, and by how much we rounded. Colour keyed off the direction.
    const making = p.batches * TRAYS_PER_BATCH;
    let dir = 'exact', head = '', sub = '';
    if (p.closedTomorrow || p.batches === 0) {
      banner.classList.add('hidden');
    } else {
      if (p.cut > 0) {
        dir = 'down';
        head = `▼ Rounding down — ${p.cut} ${p.cut === 1 ? 'tray' : 'trays'}`;
        sub = `Making ${making} vs ${p.totalTrays} planned${p.cutNote ? ` · ${p.cutNote}` : ''}`;
      } else if (p.extra > 0) {
        dir = 'up';
        head = `▲ Rounding up — ${p.extra} ${p.extra === 1 ? 'tray' : 'trays'}`;
        sub = `Making ${making} vs ${p.totalTrays} planned${p.extraNote ? ` · ${p.extraNote}` : ''}`;
      } else {
        dir = 'exact';
        head = 'On the batch — no rounding';
        sub = `Making ${p.totalTrays} ${p.totalTrays === 1 ? 'tray' : 'trays'}`;
      }
      banner.setAttribute('data-dir', dir);
      setText($('roundBannerHead'), head);
      setText($('roundBannerSub'), sub);
      banner.classList.remove('hidden');
    }
  } else {
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
    banner.classList.add('hidden');
  }

  stampedRound = view.record.batchRound ?? null;
  for (const id of ['up', 'down']) {
    $(`batchRoundPill-${id}`).classList.toggle('active', p.rounding.batches === id);
  }
  $('batchRoundAutoTag').classList.toggle('hidden', view.record.batchRound != null);

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
