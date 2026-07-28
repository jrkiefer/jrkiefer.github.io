// js/ui/temps.js — Step 05: water °F in / dough °F out per batch. Ten rows
// exist from the start; visibility follows max(batches, entered, 3).

import { MAX_BATCH_TEMPS } from '../config.js?v=2.21';
import { $, bindInput, setInputValue, wireCollapse } from './fields.js?v=2.21';

export function init(ctx) {
  wireCollapse('tempsSec', 'tempsToggle');
  const wrap = $('tempRows');
  for (let i = 0; i < MAX_BATCH_TEMPS; i++) {
    const row = document.createElement('div');
    row.className = 'temp-row hidden';
    row.id = `tempRow-${i}`;
    row.innerHTML = `
      <span class="eyebrow soft">Batch ${i + 1}</span>
      <div class="field has-suffix">
        <input id="temp-water-${i}" inputmode="decimal" placeholder="water" aria-label="Batch ${i + 1} water temp">
        <span class="suffix">°F</span><span class="saved-chip">✓ saved</span>
      </div>
      <div class="field has-suffix">
        <input id="temp-dough-${i}" inputmode="decimal" placeholder="dough" aria-label="Batch ${i + 1} dough temp">
        <span class="suffix">°F</span><span class="saved-chip">✓ saved</span>
      </div>`;
    wrap.appendChild(row);
    for (const k of ['water', 'dough']) {
      bindInput($(`temp-${k}-${i}`), {
        decimal: true,
        onValue: (v) => ctx.patch((r) => {
          while (r.temps.length <= i) r.temps.push({ water: '', dough: '' });
          r.temps[i][k] = v;
        }),
      });
    }
  }
}

export function update(view) {
  const slots = Math.min(
    MAX_BATCH_TEMPS,
    Math.max(view.plan.batches ?? 0, view.record.temps.length, 3)
  );
  for (let i = 0; i < MAX_BATCH_TEMPS; i++) {
    $(`tempRow-${i}`).classList.toggle('hidden', i >= slots);
  }
}

export function hydrate(view) {
  for (let i = 0; i < MAX_BATCH_TEMPS; i++) {
    const t = view.record.temps[i] ?? { water: '', dough: '' };
    setInputValue($(`temp-water-${i}`), t.water);
    setInputValue($(`temp-dough-${i}`), t.dough);
  }
}
