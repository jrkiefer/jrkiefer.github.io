// js/ui/bible.js — the Dough Bible reference card: regular/peach pill
// toggle (stamped on the night's record; auto tag when following the
// July–August default), both tables built once, tonight/tomorrow row
// highlights on the active table.

import { BIBLES } from '../config.js';
import { money } from '../calc.js';
import { $, setText, wireCollapse } from './fields.js';

const IDS = ['regular', 'peach'];

export function init(ctx) {
  wireCollapse('bibleSec', 'bibleToggle');
  for (const id of IDS) {
    const tbody = $(`bibleTable-${id}`).querySelector('tbody');
    BIBLES[id].rows.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${money(row[0])}<span class="bible-row-tag" id="bibleRowTag-${id}-${i}"></span></td>` +
        row.slice(1).map((n) => `<td>${n}</td>`).join('');
      tbody.appendChild(tr);
    });
    $(`biblePill-${id}`).addEventListener('click', () => ctx.patch((r) => { r.bible = id; }));
  }
}

export function update(view) {
  const { bibleId, plan, record } = view;
  for (const id of IDS) {
    $(`biblePill-${id}`).classList.toggle('active', bibleId === id);
    $(`bibleTable-${id}`).classList.toggle('hidden', bibleId !== id);
  }
  $('bibleAutoTag').classList.toggle('hidden', record.bible != null);

  const tonightTier = plan.use && plan.use.tier > 0 ? plan.use.tier : null;
  const tomorrowTier = plan.need && plan.need.tier > 0 ? plan.need.tier : null;
  const trs = $(`bibleTable-${bibleId}`).querySelectorAll('tbody tr');
  BIBLES[bibleId].rows.forEach((row, i) => {
    const isTomorrow = row[0] === tomorrowTier;
    const isTonight = row[0] === tonightTier;
    trs[i].classList.toggle('active-tomorrow', isTomorrow);
    trs[i].classList.toggle('active-tonight', isTonight && !isTomorrow);
    const tag = $(`bibleRowTag-${bibleId}-${i}`);
    setText(tag, isTomorrow ? ' ←TMRW' : isTonight ? ' ←TONIGHT' : '');
    tag.className = `bible-row-tag ${isTomorrow ? 'tomorrow' : 'tonight'}`;
  });
}
