// js/ui/outlook.js — Step 08, EON mode only: closing counts vs tomorrow's
// need. Tray-first diffs (nearest tray, sign/color from the ball diff, exact
// balls small underneath). No warning banner — dipping into same-day dough
// is normal. The forecast pre-fills from the 2 PM save; any keystroke flips
// a manual flag that wins from then on (only Reset clears it).

import { ALL } from '../config.js';
import { parseSales, money, fmt, computeOutlook } from '../calc.js';
import { $, bindInput, setText, setInputValue } from './fields.js';

export function init(ctx) {
  const wrap = $('outlookRows');
  for (const s of ALL) {
    const row = document.createElement('div');
    row.className = 'outlook-row';
    row.style.setProperty('--c', `var(--${s.id})`);
    row.innerHTML = `
      <div class="plan-size"><span class="dot sm"></span><span class="monocaps">${s.chip}</span></div>
      <span class="outlook-have" id="ol-${s.id}-have">—</span>
      <span class="outlook-need" id="ol-${s.id}-need">vs —</span>
      <div class="outlook-diff">
        <span class="outlook-diff-trays none" id="ol-${s.id}-tdiff">—</span>
        <span class="outlook-diff-balls" id="ol-${s.id}-balls"></span>
      </div>`;
    wrap.appendChild(row);
  }

  bindInput($('outlookForecast'), {
    decimal: true,
    onValue: (v) => ctx.patch((r) => {
      r.eon.outlookForecast = v;
      r.eon.outlookManual = true; // manual entry wins from now on
    }),
  });
}

// The effective forecast string the input should display.
function effectiveRaw(record) {
  return record.eon.outlookManual
    ? record.eon.outlookForecast
    : (record.eon.outlookForecast || record.twopm.tomorrowForecast);
}

export function update(view) {
  const { record, bibleId } = view;
  const input = $('outlookForecast');
  const raw = effectiveRaw(record);
  const forecast = parseSales(raw);

  // The one input update() may write: the 2 PM mirror — never while the
  // user is in the field, never once the manual flag is set.
  if (!record.eon.outlookManual && document.activeElement !== input && input.value !== raw) {
    setInputValue(input, raw);
  }

  const source = record.eon.outlookManual
    ? 'Manual entry'
    : record.twopm.tomorrowForecast !== ''
      ? 'From 2 PM save'
      : 'No 2 PM save — enter manually';
  setText($('outlookSource'), forecast != null ? `${source} · = ${money(forecast)}` : source);

  const ol = computeOutlook(record, bibleId, forecast);
  $('outlookRows').classList.toggle('hidden', !ol.hasNeed);
  $('outlookEmpty').classList.toggle('hidden', ol.hasNeed);

  if (ol.hasNeed) {
    for (const s of ALL) {
      const r = ol.rows[s.id];
      setText($(`ol-${s.id}-have`), fmt(r.have));
      setText($(`ol-${s.id}-need`), `vs ${fmt(r.need)}`);
      const tdiff = $(`ol-${s.id}-tdiff`);
      if (r.diff == null) {
        setText(tdiff, '—');
        tdiff.className = 'outlook-diff-trays none';
        setText($(`ol-${s.id}-balls`), '');
      } else {
        setText(tdiff, `${r.tDiff > 0 ? '+' : r.tDiff < 0 ? '−' : ''}${Math.abs(r.tDiff)} tr`);
        tdiff.className = `outlook-diff-trays ${r.diff < 0 ? 'neg' : 'pos'}`;
        setText($(`ol-${s.id}-balls`), `${r.diff > 0 ? '+' : ''}${r.diff} balls`);
      }
    }
  }

  const summary = $('outlookSummary');
  if (ol.hasNeed && ol.anyCount) {
    if (ol.shortfall > 0) {
      const trays = ol.shortTrays >= 1
        ? `~${ol.shortTrays} ${ol.shortTrays === 1 ? 'tray' : 'trays'}`
        : 'less than a tray';
      setText(summary, `Tomorrow we will potentially go into same-day dough by ${trays} (${ol.shortfall} balls).`);
      summary.classList.remove('good');
    } else {
      setText(summary, `Dough is good ✓ — ~${ol.surplusTrays} ${ol.surplusTrays === 1 ? 'tray' : 'trays'} leftover (${ol.surplus} balls).`);
      summary.classList.add('good');
    }
  } else {
    setText(summary, '');
    summary.classList.remove('good');
  }
}

export function hydrate(view) {
  setInputValue($('outlookForecast'), effectiveRaw(view.record));
}
