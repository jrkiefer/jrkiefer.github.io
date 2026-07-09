// js/ui/counts.js — Step 02, instantiated once per mode ('tp' and 'eon').
// The two instances stay hydrated in parallel so switching modes is just
// the <html data-mode> attribute flip; only where the values live differs.

import { ALL, BOIL } from '../config.js';
import { countTotal } from '../calc.js';
import { $, bindInput, setText, setInputValue } from './fields.js';

const MODE_LABEL = { tp: '2 PM', eon: 'EON' };

function fieldHTML(prefix, size, part, label) {
  return `
    <div>
      <span class="monocaps">${label}</span>
      <div class="field">
        <input id="${prefix}-${size.id}-${part}" inputmode="numeric" placeholder="0"
          aria-label="${MODE_LABEL[prefix]} ${size.label} ${label.toLowerCase()}">
        <span class="saved-chip">✓ saved</span>
      </div>
    </div>`;
}

export function createCounts(prefix, getCounts, ctx) {
  const grid = $(`counts-${prefix}`);
  for (const s of ALL) {
    const isBoil = s.id === 'boil';
    const card = document.createElement('div');
    card.className = 'card count-card' + (isBoil ? ' wide' : '');
    card.style.setProperty('--c', `var(--${s.id})`);
    const note = isBoil ? `target ${BOIL.target} · ${s.perTray} / tray`
      : s.looseOnly ? s.note : `${s.perTray} / tray`;
    card.innerHTML = `
      <div class="count-head"><span class="count-name">${s.label}</span><span class="count-note">${note}</span></div>
      <div class="count-inputs">
        ${s.looseOnly ? '' : fieldHTML(prefix, s, 'trays', 'Trays')}
        ${fieldHTML(prefix, s, 'singles', s.looseOnly ? 'Balls' : 'Singles')}
      </div>
      ${s.looseOnly ? '' : `<div class="count-total">= <strong id="${prefix}-${s.id}-total">0</strong> balls</div>`}`;
    grid.appendChild(card);
  }

  for (const s of ALL) {
    const parts = s.looseOnly ? ['singles'] : ['trays', 'singles'];
    for (const part of parts) {
      bindInput($(`${prefix}-${s.id}-${part}`), {
        onValue: (v) => ctx.patch((r) => { getCounts(r)[s.id][part] = v; }),
      });
    }
  }

  return {
    update(view) {
      const counts = getCounts(view.record);
      for (const s of ALL) {
        if (s.looseOnly) continue;
        setText($(`${prefix}-${s.id}-total`), String(countTotal(counts[s.id], s)));
      }
    },
    hydrate(view) {
      const counts = getCounts(view.record);
      for (const s of ALL) {
        if (!s.looseOnly) setInputValue($(`${prefix}-${s.id}-trays`), counts[s.id].trays);
        setInputValue($(`${prefix}-${s.id}-singles`), counts[s.id].singles);
      }
    },
  };
}
