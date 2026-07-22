// js/ui/bible.js — the Dough Bible reference card: regular/peach pill
// toggle (stamped on the night's record; auto tag when following the
// July–August default), the forecast-rounding pills, both tables built
// once, tonight/tomorrow row highlights on the active table. Also owns
// the quick toggle below the Active Date, which surfaces only while the
// date is in peach season.

import { BIBLES } from '../config.js';
import { money } from '../calc.js';
import { $, setText, wireCollapse, roundPills } from './fields.js';

const IDS = ['regular', 'peach'];

let activeBible = null; // effective bibleId from the last update(view)
let updateRoundPills = null;

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
    // Tapping the already-active pill is a no-op: for a given date the
    // auto default never changes, so stamping it would only churn the
    // record (localStorage write + a pointless save cycle).
    const stamp = () => {
      if (activeBible === id) return;
      ctx.patch((r) => { r.bible = id; });
    };
    $(`biblePill-${id}`).addEventListener('click', stamp);
    $(`bibleQuickPill-${id}`).addEventListener('click', stamp);
  }
  updateRoundPills = roundPills('forecastRoundPill', 'forecastRoundAutoTag',
    (id) => ctx.patch((r) => { r.forecastRound = id; }));
}

export function update(view) {
  const { bibleId, plan, record, autoBible } = view;
  activeBible = bibleId;
  for (const id of IDS) {
    const active = bibleId === id;
    $(`biblePill-${id}`).classList.toggle('active', active);
    $(`bibleQuickPill-${id}`).classList.toggle('active', active);
    $(`bibleTable-${id}`).classList.toggle('hidden', !active);
  }
  $('bibleAutoTag').classList.toggle('hidden', record.bible != null);
  // The quick toggle lives below the Active Date, peach season only.
  $('bibleQuick').classList.toggle('hidden', autoBible !== 'peach');
  $('bibleQuickAutoTag').classList.toggle('hidden', record.bible != null);

  updateRoundPills(record.forecastRound, plan.rounding.forecast);

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
