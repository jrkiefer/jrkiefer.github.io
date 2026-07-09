// js/ui/make.js — Step 07: the manager's Actual Make correction. One balls
// input per size (managers think in total balls, not trays). The calculated
// make shows as the placeholder; an entered value wins everywhere downstream
// (the store POSTs it as a type:'make' correction automatically).

import { ALL } from '../config.js';
import { $, bindInput, setText, setInputValue, wireCollapse } from './fields.js';

export function init(ctx) {
  wireCollapse('makeSec', 'makeToggle');
  const wrap = $('makeRows');
  for (const s of ALL) {
    const row = document.createElement('div');
    row.className = 'make-row';
    row.style.setProperty('--c', `var(--${s.id})`);
    row.innerHTML = `
      <div class="plan-size"><span class="dot sm"></span><span class="monocaps">${s.chip}</span></div>
      <div class="field">
        <input id="make-${s.id}" inputmode="numeric" placeholder="—" aria-label="${s.label} actual balls made">
        <span class="saved-chip">✓ saved</span>
      </div>
      <span class="make-unit">balls</span>
      <div class="make-eff">
        <span class="make-eff-val mute" id="make-${s.id}-eff">—</span>
        <span class="make-eff-src" id="make-${s.id}-src"></span>
      </div>`;
    wrap.appendChild(row);
    bindInput($(`make-${s.id}`), {
      onValue: (v) => ctx.patch((r) => { r.actualMake[s.id] = v; }),
    });
  }
}

export function update(view) {
  for (const s of ALL) {
    const e = view.eff[s.id];
    const calc = s.id === 'boil' ? view.plan.boilMake : view.plan.rows[s.id].make;
    $(`make-${s.id}`).placeholder = calc != null ? String(calc) : '—';
    const val = $(`make-${s.id}-eff`);
    setText(val, e.balls == null ? '—' : String(e.balls));
    val.classList.toggle('mute', e.balls == null);
    const src = $(`make-${s.id}-src`);
    setText(src, e.balls == null ? '' : e.source);
    src.classList.toggle('recount', e.source === 'recount');
  }
}

export function hydrate(view) {
  for (const s of ALL) {
    setInputValue($(`make-${s.id}`), view.record.actualMake[s.id]);
  }
}
