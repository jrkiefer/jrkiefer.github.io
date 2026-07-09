// js/ui/sales.js — Step 01 in both modes: the three 2 PM money fields with
// shorthand echoes and the Sales Left box, plus the EON Final Sales field
// with its ± vs forecast line. Advisory range notes only — nothing blocks.

import { BIBLES } from '../config.js';
import { parseSales, money } from '../calc.js';
import { $, bindInput, setText, setInputValue } from './fields.js';

const FIELDS = {
  todayForecast: {
    get: (r) => r.twopm.todayForecast,
    set: (r, v) => { r.twopm.todayForecast = v; },
  },
  currentSales: {
    get: (r) => r.twopm.currentSales,
    set: (r, v) => { r.twopm.currentSales = v; },
  },
  tomorrowForecast: {
    get: (r) => r.twopm.tomorrowForecast,
    set: (r, v) => { r.twopm.tomorrowForecast = v; },
  },
  eonSales: {
    get: (r) => r.eon.sales,
    set: (r, v) => { r.eon.sales = v; },
  },
};

export function init(ctx) {
  for (const [id, f] of Object.entries(FIELDS)) {
    bindInput($(id), { decimal: true, onValue: (v) => ctx.patch((r) => f.set(r, v)) });
  }
}

function rangeNote(parsed, bible) {
  if (parsed == null || parsed === 0) return '';
  const rows = bible.rows;
  if (parsed < rows[0][0]) return `below the ${bible.short} range`;
  if (parsed > rows[rows.length - 1][0]) return `above the ${bible.short} range`;
  return '';
}

export function update(view) {
  const { record, plan, bibleId } = view;
  const bible = BIBLES[bibleId];

  for (const [id, f] of Object.entries(FIELDS)) {
    const raw = f.get(record);
    setText($(`echo-${id}`), raw === '' ? ' ' : `= ${money(parseSales(raw))}`);
  }

  // Sales Left with the matched bible row note
  setText($('salesLeftValue'), money(plan.salesLeft));
  const note = $('salesLeftNote');
  if (plan.use && plan.use.tier > 0) {
    setText(note, `→ ${money(plan.use.tier)} row · ${bible.short}`);
    note.classList.remove('good');
  } else if (plan.use && plan.use.tier === 0) {
    setText(note, 'past forecast — zero use tonight');
    note.classList.add('good');
  } else {
    setText(note, '');
    note.classList.remove('good');
  }

  // advisory notes — warnings never block capture
  const today = parseSales(record.twopm.todayForecast);
  const tomorrow = parseSales(record.twopm.tomorrowForecast);
  const current = parseSales(record.twopm.currentSales);
  setText($('note-todayForecast'), rangeNote(today, bible));
  setText($('note-tomorrowForecast'), rangeNote(tomorrow, bible));
  setText($('note-currentSales'),
    today != null && current != null && current > today ? "above today's forecast" : '');

  // EON ± vs forecast
  const es = parseSales(record.eon.sales);
  const deltaEl = $('eonDelta');
  if (es != null && today != null) {
    const d = es - today;
    setText(deltaEl, `${d >= 0 ? '+' : '−'}$${Math.abs(d).toLocaleString('en-US')} vs forecast`);
    deltaEl.classList.toggle('pos', d >= 0);
    deltaEl.classList.toggle('neg', d < 0);
  } else {
    setText(deltaEl, '');
  }
}

export function hydrate(view) {
  for (const [id, f] of Object.entries(FIELDS)) {
    setInputValue($(id), f.get(view.record));
  }
}
