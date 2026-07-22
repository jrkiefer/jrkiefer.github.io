// js/ui/bysize.js — Step 04: the full-math table. HAVE/USE/LEFT/NEED/MAKE
// per size plus the tinted trays column (final numbers only — the extras
// breakdown lives in the Day's Work line), and the boil row beneath.

import { SIZES, BOIL, SIC_MIN, SIC_MIN_WAIVER } from '../config.js';
import { fmt } from '../calc.js';
import { $, setText, sizeRow } from './fields.js';

export function init() {
  const wrap = $('bysizeRows');
  for (const s of SIZES) {
    wrap.appendChild(sizeRow(s, 'plan-grid plan-row', `
      <div class="plan-cell" id="bs-${s.id}-have">—</div>
      <div class="plan-cell mute" id="bs-${s.id}-use">—</div>
      <div class="plan-cell" id="bs-${s.id}-left">—</div>
      <div class="plan-cell mute" id="bs-${s.id}-need">—</div>
      <div class="plan-cell bold" id="bs-${s.id}-make">—</div>
      <div class="plan-trays"><span id="bs-${s.id}-trays">—</span></div>`));
  }
  setText($('bs-boil-target'), String(BOIL.target));
}

export function update(view) {
  const p = view.plan;
  for (const s of SIZES) {
    const r = p.rows[s.id];
    setText($(`bs-${s.id}-have`), fmt(r.have));
    setText($(`bs-${s.id}-use`), fmt(r.use));
    const left = $(`bs-${s.id}-left`);
    setText(left, fmt(r.left));
    left.classList.toggle('neg', r.left != null && r.left < 0);
    setText($(`bs-${s.id}-need`), fmt(r.need));
    setText($(`bs-${s.id}-make`), fmt(r.make));
    setText($(`bs-${s.id}-trays`), fmt(p.finalTrays ? p.finalTrays[s.id] : r.trays));
  }

  setText($('bs-boil-have'), fmt(p.boilHave));
  setText($('bs-boil-make'), fmt(p.boilMake));
  setText($('bs-boil-trays'), p.boilMake == null ? '—' : `${p.boilTrays}T`);

  const foot = $('bysizeFoot');
  if (p.ready) {
    foot.className = 'bysize-foot caps';
    setText(foot, `Make in balls · trays includes batch extras/cuts · SIC min ${SIC_MIN} unless ${SIC_MIN_WAIVER}+ on hand`);
  } else {
    foot.className = 'bysize-foot';
    setText(foot, "Fill in the counts, sales, and both forecasts to get tonight's make.");
  }
}
