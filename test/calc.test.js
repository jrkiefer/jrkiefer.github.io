import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSales, money, fmt, countTotal, countBlank, blankRecord,
  autoBibleFor, bibleLookup, computePlan, effectiveMake, computeOutlook,
} from '../js/calc.js';
import { BIBLES, SIZES } from '../js/config.js';
import { loadContext, getRefs, plain } from './helpers/load.js';

/* ---------------- helpers ---------------- */

// Build a record from plain numbers. Money is passed as literal dollar
// strings (≥ 100 reads literally, so no shorthand ambiguity); counts go
// in as loose singles. fr/br stamp the rounding pills — fixtures that
// predate v2·10 pin both 'up' to keep their expectations byte-identical.
function record2pm({ cs, tf, tmf, counts = {}, boil = null, fr = null, br = null }) {
  const r = blankRecord();
  r.twopm.currentSales = cs == null ? '' : String(cs);
  r.twopm.todayForecast = tf == null ? '' : String(tf);
  r.twopm.tomorrowForecast = tmf == null ? '' : String(tmf);
  for (const id of ['indi', 'small', 'large', 'sic']) {
    if (counts[id] != null) r.twopm.counts[id].singles = String(counts[id]);
  }
  if (boil != null) r.twopm.counts.boil.singles = String(boil);
  if (fr) r.forecastRound = fr;
  if (br) r.batchRound = br;
  return r;
}

/* ---------------- parsing ---------------- */

test('parseSales: shorthand under 100 reads as thousands, 100+ literal', () => {
  assert.equal(parseSales(''), null);
  assert.equal(parseSales(null), null);
  assert.equal(parseSales('abc'), null);
  assert.equal(parseSales('0'), 0);
  assert.equal(parseSales('1.7'), 1700);
  assert.equal(parseSales('10'), 10000);
  assert.equal(parseSales('99.5'), 99500);
  assert.equal(parseSales('100'), 100);
  assert.equal(parseSales('4500'), 4500);
  assert.equal(parseSales('$4,500'), 4500);
  assert.equal(parseSales('12,000'), 12000);
});

test('money / fmt formatting', () => {
  assert.equal(money(6700), '$6,700');
  assert.equal(money(null), '—');
  assert.equal(fmt(null), '—');
  assert.equal(fmt(0), '0');
});

test('countTotal / countBlank: trays × per-tray + singles; Sicilian is loose-only', () => {
  const indi = SIZES[0], sic = SIZES[3];
  assert.equal(countTotal({ trays: '2', singles: '4' }, indi), 26);
  assert.equal(countTotal({ trays: '', singles: '' }, indi), 0);
  assert.equal(countTotal({ trays: '5', singles: '2' }, sic), 2); // trays ignored
  assert.equal(countBlank({ trays: '', singles: '' }), true);
  assert.equal(countBlank({ trays: '0', singles: '' }), false);
});

/* ---------------- bibles ---------------- */

test('bible tables: shape and ascending thresholds', () => {
  assert.equal(BIBLES.regular.rows.length, 27);
  assert.equal(BIBLES.peach.rows.length, 30);
  for (const id of ['regular', 'peach']) {
    const rows = BIBLES[id].rows;
    for (let i = 0; i < rows.length; i++) {
      assert.equal(rows[i].length, 5, `${id} row ${i} width`);
      assert.ok(rows[i].every((n) => n > 0), `${id} row ${i} positive`);
      if (i > 0) assert.ok(rows[i][0] > rows[i - 1][0], `${id} thresholds ascending at ${i}`);
    }
  }
});

test('bibleLookup: rounds up, exact hit, caps at top, zeros at ≤ 0, null passthrough', () => {
  assert.equal(bibleLookup('regular', 3751).tier, 4000);
  assert.equal(bibleLookup('regular', 3750).tier, 3750);
  assert.equal(bibleLookup('regular', 7999).tier, 8300);
  assert.deepEqual(bibleLookup('regular', 99999), { tier: 20750, indi: 44, small: 276, large: 267, sic: 7 });
  assert.deepEqual(bibleLookup('regular', 0), { tier: 0, indi: 0, small: 0, large: 0, sic: 0 });
  assert.equal(bibleLookup('regular', -5).tier, 0);
  assert.equal(bibleLookup('regular', null), null);
});

test('bibleLookup peach: floors at the $3,000 bottom row, caps at $17,500', () => {
  assert.deepEqual(bibleLookup('peach', 1200), { tier: 3000, indi: 20, small: 56, large: 51, sic: 2 });
  assert.equal(bibleLookup('peach', 17501).tier, 17500);
});

test('autoBibleFor: peach exactly July 1 – August 31', () => {
  assert.equal(autoBibleFor('2026-06-30'), 'regular');
  assert.equal(autoBibleFor('2026-07-01'), 'peach');
  assert.equal(autoBibleFor('2026-08-31'), 'peach');
  assert.equal(autoBibleFor('2026-09-01'), 'regular');
});

/* ---------------- computePlan core ---------------- */

test('happy path: the v1 reference fixture (boil now rounds to whole trays)', () => {
  // A $6k/$8k night is a slow day — rounding pinned up to keep the fixture.
  const r = record2pm({ cs: 2000, tf: 6000, tmf: 8000, counts: { indi: 20, small: 60, large: 50, sic: 3 }, boil: 10, fr: 'up', br: 'up' });
  const p = computePlan(r, 'regular');
  assert.equal(p.salesLeft, 4000);
  assert.equal(p.use.tier, 4000);
  assert.equal(p.need.tier, 8300);
  assert.deepEqual(p.rows.indi, { have: 20, use: 12, left: 8, need: 24, make: 16, trays: 2 });
  assert.deepEqual(p.rows.small, { have: 60, use: 58, left: 2, need: 115, make: 113, trays: 15 });
  assert.deepEqual(p.rows.large, { have: 50, use: 50, left: 0, need: 106, make: 106, trays: 18 });
  assert.deepEqual(p.rows.sic, { have: 3, use: 2, left: 1, need: 3, make: 2, trays: 1 });
  assert.equal(p.boilHave, 10);
  assert.equal(p.boilTrays, 5);
  assert.equal(p.boilMake, 30); // v1 said 26 balls; v2 makes whole trays only
  assert.equal(p.totalTrays, 41);
  assert.equal(p.batches, 4);
  assert.equal(p.extra, 3);
  assert.equal(p.extraNote, '+1 SM, +2 LG'); // lean-large 60/40 split
  assert.deepEqual(p.finalTrays, { indi: 2, small: 16, large: 20, sic: 1 });
  assert.equal(p.setout.length, 0);
});

test('real night 4/1/2026 (from the sheet export): 3 batches, extras +2 SM +5 LG', () => {
  // Another slow day ($9k/$10k) — pinned up so the sheet-export numbers hold.
  const r = record2pm({ cs: 3000, tf: 9000, tmf: 10000, counts: { indi: 33, small: 112, large: 168, sic: 6 }, boil: 24, fr: 'up', br: 'up' });
  const p = computePlan(r, 'regular');
  assert.equal(p.salesLeft, 6000);
  assert.equal(p.use.tier, 6300);
  assert.equal(p.need.tier, 10000);
  assert.equal(p.rows.indi.make, 13);
  assert.equal(p.rows.small.make, 112);
  assert.equal(p.rows.large.make, 37);
  assert.equal(p.rows.sic.make, 2); // 0 needed, min-2 floor (6 on hand < 10)
  assert.equal(p.boilTrays, 2);
  assert.equal(p.totalTrays, 26);
  assert.equal(p.batches, 3); // matches the saved sheet row
  assert.equal(p.extra, 7);
  assert.equal(p.extraNote, '+2 SM, +5 LG');
  assert.deepEqual(p.finalTrays, { indi: 2, small: 16, large: 12, sic: 1 });
  // finalTrays + boil fills the batches exactly
  const sum = p.finalTrays.indi + p.finalTrays.small + p.finalTrays.large + p.finalTrays.sic + p.boilTrays;
  assert.equal(sum, p.batches * 11);
});

test('Sicilian min 2 is waived with 10+ on hand', () => {
  const base = { cs: 5000, tf: 5000, tmf: 4000 };
  const at9 = computePlan(record2pm({ ...base, counts: { sic: 9 } }), 'regular');
  assert.equal(at9.rows.sic.make, 2);
  assert.equal(at9.rows.sic.trays, 1);
  const at10 = computePlan(record2pm({ ...base, counts: { sic: 10 } }), 'regular');
  assert.equal(at10.rows.sic.make, 0);
  assert.equal(at10.rows.sic.trays, 0);
});

test('Sicilian dough-left clamps at 0 — shortfall never inflates the make', () => {
  // fr pinned: the $7,800 row this slow day would round down to happens to
  // share sic 3 with $8,300 — pin so the fixture can't pass by coincidence.
  const p = computePlan(record2pm({ cs: 2000, tf: 6000, tmf: 8000, counts: { sic: 0 }, fr: 'up' }), 'regular');
  assert.equal(p.rows.sic.left, 0); // not -2
  assert.equal(p.rows.sic.make, 3); // tomorrow's need, undistorted
  // and Sicilian never appears in set-out
  assert.ok(p.setout.every((it) => it.id !== 'sic'));
});

test('zero day (closed today): explicit 0 forecast uses no dough tonight', () => {
  // tf 0 passes the slow-day gate — rounding pinned up to keep the fixture.
  const p = computePlan(record2pm({ cs: 0, tf: 0, tmf: 8000, fr: 'up', br: 'up' }), 'regular');
  assert.equal(p.salesLeft, 0);
  assert.equal(p.use.tier, 0);
  assert.deepEqual(
    [p.rows.indi.make, p.rows.small.make, p.rows.large.make, p.rows.sic.make],
    [24, 115, 106, 3]
  );
  assert.equal(p.setout.length, 0);
  assert.equal(p.batches, 4);
});

test('forecast already hit: negative sales left uses no dough tonight', () => {
  const p = computePlan(record2pm({ cs: 5000, tf: 4000, tmf: 4000, counts: { indi: 10, small: 20, large: 20, sic: 2 } }), 'regular');
  assert.equal(p.salesLeft, -1000);
  assert.equal(p.use.tier, 0);
  assert.deepEqual([p.rows.indi.left, p.rows.small.left], [10, 20]); // counts untouched
});

test('closed tomorrow (explicit 0): zero need for every size, boil included', () => {
  // tmf 0 passes the slow-day gate, which would round tonight's use down
  // ($7,200 → $6,800) and shrink the set-out — fr pinned to keep it.
  const r = record2pm({ cs: 2000, tf: 9000, tmf: 0, counts: { small: 50 }, boil: 30, fr: 'up' });
  const p = computePlan(r, 'regular');
  assert.equal(p.closedTomorrow, true);
  assert.equal(p.ready, true);
  // tonight still happens: salesLeft 7000 → $7,200 row {21,101,94,3}
  assert.equal(p.use.tier, 7200);
  // small: 50 on hand − 101 tonight → set out 7 trays
  const so = p.setout.find((it) => it.id === 'small');
  assert.equal(so.trays, 7);
  // but nothing gets made for tomorrow — not even boil or the sic minimum
  for (const s of SIZES) assert.equal(p.rows[s.id].make, 0, s.id);
  assert.equal(p.boilMake, 0);
  assert.equal(p.boilTrays, 0);
  assert.equal(p.totalTrays, 0);
  assert.equal(p.batches, 0);
  assert.equal(p.extra, 0);
});

test('blank tomorrow forecast: plan not ready, no batch count', () => {
  const p = computePlan(record2pm({ cs: 2000, tf: 6000, counts: { indi: 20 } }), 'regular');
  assert.equal(p.ready, false);
  assert.equal(p.batches, null);
  assert.equal(p.finalTrays, null);
  assert.equal(p.rows.indi.make, null);
});

test('blank money fields: not ready even with counts entered', () => {
  const p = computePlan(record2pm({ counts: { indi: 20, small: 60 } }), 'regular');
  assert.equal(p.ready, false);
  assert.equal(p.salesLeft, null);
});

/* ---------------- boil ---------------- */

test('boil makes whole trays only: 33 on hand → 1 tray of 6, ending at 39', () => {
  const base = { cs: 5000, tf: 5000, tmf: 4000 };
  const at33 = computePlan(record2pm({ ...base, boil: 33 }), 'regular');
  assert.equal(at33.boilTrays, 1);
  assert.equal(at33.boilMake, 6);
  const at36 = computePlan(record2pm({ ...base, boil: 36 }), 'regular');
  assert.equal(at36.boilMake, 0);
  const at40 = computePlan(record2pm({ ...base, boil: 40 }), 'regular');
  assert.equal(at40.boilMake, 0);
  const at0 = computePlan(record2pm({ ...base, boil: 0 }), 'regular');
  assert.equal(at0.boilTrays, 6);
  assert.equal(at0.boilMake, 36);
});

test('blank boil count means not counted: excluded from batch math', () => {
  const p = computePlan(record2pm({ cs: 5000, tf: 5000, tmf: 4000 }), 'regular');
  assert.equal(p.boilHave, null);
  assert.equal(p.boilMake, null);
  assert.equal(p.boilTrays, 0);
  // trays: indi 2 + small 8 + large 9 + sic 1 = 20 — no boil contribution
  assert.equal(p.totalTrays, 20);
});

/* ---------------- batch extras ---------------- */

test('extras of exactly 5: 2 trays to Small, 3 to Large', () => {
  // zero day, $3,750 row → trays 1/7/8/1 = 17, boil full → 0. 17 → 2 batches, 5 extra.
  // (remainder 6 > 5, so the slow-day batch rule still rounds up here)
  const p = computePlan(record2pm({ cs: 0, tf: 0, tmf: 3750, boil: 36 }), 'regular');
  assert.equal(p.totalTrays, 17);
  assert.equal(p.batches, 2);
  assert.equal(p.extra, 5);
  assert.equal(p.extraNote, '+2 SM, +3 LG');
  assert.equal(p.finalTrays.small, p.rows.small.trays + 2);
  assert.equal(p.finalTrays.large, p.rows.large.trays + 3);
  assert.equal(p.finalTrays.indi, p.rows.indi.trays); // Indi never gets extras
  assert.equal(p.finalTrays.sic, p.rows.sic.trays); // Sicilian never gets extras
});

test('extras of 0: trays already fill the batches exactly', () => {
  // zero day, $3,750 row (17 pizza trays) + boil at 6 → 5 boil trays = 22 = 2 batches even.
  const p = computePlan(record2pm({ cs: 0, tf: 0, tmf: 3750, boil: 6 }), 'regular');
  assert.equal(p.totalTrays, 22);
  assert.equal(p.batches, 2);
  assert.equal(p.extra, 0);
  assert.equal(p.extraNote, '');
  assert.deepEqual(p.finalTrays, {
    indi: p.rows.indi.trays, small: p.rows.small.trays,
    large: p.rows.large.trays, sic: p.rows.sic.trays,
  });
});

test('extras/cuts always land the trimmable plan on full batches', () => {
  // tmf 3750 is a slow day 1 tray past 2 batches → auto rounds DOWN (a cut);
  // 12250 and 20750 sit at remainder 5 but fail the under-$12k gate → up.
  // Explicit batch counts so a gate regression can't hide behind the sum.
  const expected = { 3750: 2, 5200: 3, 8300: 4, 12250: 6, 20750: 9 };
  for (const tmf of [3750, 5200, 8300, 12250, 20750]) {
    const p = computePlan(record2pm({ cs: 0, tf: 0, tmf, boil: 0 }), 'regular');
    assert.equal(p.batches, expected[tmf], `batches tmf ${tmf}`);
    const sum = p.finalTrays.indi + p.finalTrays.small + p.finalTrays.large + p.finalTrays.sic + p.boilTrays;
    assert.equal(sum, p.batches * 11, `tmf ${tmf}`);
  }
});

/* ---------------- slow-day rounding (v2·10) ---------------- */

test('bibleLookup down: lower row within $300, else falls back to up', () => {
  assert.equal(bibleLookup('regular', 4000, 'down').tier, 4000); // exact hit
  assert.equal(bibleLookup('regular', 4300, 'down').tier, 4000); // drop of exactly $300
  assert.equal(bibleLookup('regular', 8600, 'down').tier, 8300); // wide gap, drop still $300
  assert.equal(bibleLookup('regular', 8601, 'down').tier, 9100); // $301 — back to up
  assert.equal(bibleLookup('regular', 3700, 'down').tier, 3750); // below the bottom row
  assert.equal(bibleLookup('regular', 99999, 'down').tier, 20750); // top cap unchanged
  assert.equal(bibleLookup('regular', 0, 'down').tier, 0);
  assert.equal(bibleLookup('regular', -5, 'down').tier, 0);
  assert.equal(bibleLookup('regular', null, 'down'), null);
});

test('slow-day gate: both forecasts strictly under $12,000', () => {
  const roundingFor = (tf, tmf) => computePlan(record2pm({ cs: 0, tf, tmf }), 'regular').rounding;
  assert.equal(roundingFor(11999, 11750).slowDay, true);
  assert.equal(roundingFor(11999, 11750).forecast, 'down');
  assert.equal(roundingFor(12000, 11750).forecast, 'up'); // exactly $12k fails
  assert.equal(roundingFor(11999, 12000).forecast, 'up');
  assert.equal(roundingFor(11999, null).forecast, 'up'); // blank tomorrow — no gate
  // and the down policy actually moves the need row ($11,750 → $11,500)
  assert.equal(computePlan(record2pm({ cs: 0, tf: 11999, tmf: 11750 }), 'regular').need.tier, 11500);
});

test('July 14 2026 regression: the slow night lands on 5 batches by either route', () => {
  const j14 = { cs: 2200, tf: 10000, tmf: 10000, counts: { indi: 17, small: 168, large: 110, sic: 2 }, boil: 15 };
  // Full auto: use rounds down $7,800 → $7,500 (drop of exactly $300),
  // need $10,000 is an exact row → 54 trays, remainder 10 → rounds UP.
  const auto = computePlan(record2pm(j14), 'peach');
  assert.equal(auto.salesLeft, 7800);
  assert.equal(auto.use.tier, 7500);
  assert.equal(auto.need.tier, 10000);
  assert.equal(auto.totalTrays, 54);
  assert.deepEqual(auto.rounding, {
    slowDay: true, forecast: 'down', forecastAuto: true, batches: 'up', batchesAuto: true,
  });
  assert.equal(auto.batches, 5);
  assert.equal(auto.extra, 1);
  assert.equal(auto.extraNote, '+1 LG');
  // Lookups pinned up (the pre-v2·10 math): 56 trays, 1 past 5 whole
  // batches → the batch rule floors it with a −1 LG cut.
  const pinned = computePlan(record2pm({ ...j14, fr: 'up' }), 'peach');
  assert.equal(pinned.totalTrays, 56);
  assert.equal(pinned.rounding.batches, 'down');
  assert.equal(pinned.batches, 5);
  assert.equal(pinned.cut, 1);
  assert.equal(pinned.cutNote, '−1 LG');
  assert.equal(pinned.finalTrays.large, pinned.rows.large.trays - 1);
  const sum = pinned.finalTrays.indi + pinned.finalTrays.small + pinned.finalTrays.large + pinned.finalTrays.sic + pinned.boilTrays;
  assert.equal(sum, 55);
});

test('real night 6/20/2026 (from the sheet export): both rows round down, batches floor to 3', () => {
  // The biggest swing in the 61-night April–July backtest: use $9,400 →
  // $9,100 (drop exactly $300) AND need $8,500 → $8,300, then 34 trays
  // (remainder 1) floor to 3 batches with a −1 LG cut. The saved sheet
  // row (pinned-up math) said 4 batches.
  const r = record2pm({ cs: 2100, tf: 11500, tmf: 8500, counts: { indi: 38, small: 133, large: 131, sic: 4 }, boil: 33 });
  const p = computePlan(r, 'regular');
  assert.equal(p.salesLeft, 9400);
  assert.equal(p.use.tier, 9100);
  assert.equal(p.need.tier, 8300);
  assert.deepEqual(
    [p.rows.indi.make, p.rows.small.make, p.rows.large.make, p.rows.sic.make],
    [12, 107, 92, 2]
  );
  assert.equal(p.boilTrays, 1);
  assert.equal(p.totalTrays, 34);
  assert.equal(p.rounding.batches, 'down');
  assert.equal(p.batches, 3);
  assert.equal(p.cutNote, '−1 LG');
  assert.deepEqual(p.finalTrays, { indi: 2, small: 14, large: 15, sic: 1 });
  const sum = p.finalTrays.indi + p.finalTrays.small + p.finalTrays.large + p.finalTrays.sic + p.boilTrays;
  assert.equal(sum, p.batches * 11);
});

test('batch auto-down at ≤2 over rounds down every day, even on a busy night', () => {
  // Real 5/28/2026 night: tmf $15,500 → NOT a slow day, 57 total trays
  // (remainder 2). Pre-v2·15 this rounded up to 6 batches; the always-down
  // rule now floors it to 5.
  const down = computePlan(record2pm({
    cs: 1500, tf: 10500, tmf: 15500,
    counts: { indi: 53, small: 157, large: 142, sic: 5 }, boil: 18,
  }), 'regular');
  assert.equal(down.rounding.slowDay, false);
  assert.equal(down.totalTrays, 57); // remainder 2
  assert.equal(down.rounding.batches, 'down');
  assert.equal(down.batches, 5);
  assert.equal(down.cut, 2);
  assert.equal(down.cutNote, '−2 LG');
  // Same busy night, boil steered to 58 trays (remainder 3) → back to up.
  const up = computePlan(record2pm({
    cs: 1500, tf: 10500, tmf: 15500,
    counts: { indi: 53, small: 157, large: 142, sic: 5 }, boil: 12,
  }), 'regular');
  assert.equal(up.rounding.slowDay, false);
  assert.equal(up.totalTrays, 58); // remainder 3 — past the always-down window
  assert.equal(up.rounding.batches, 'up');
  assert.equal(up.batches, 6);
  assert.equal(up.extra, 8);
});

test('batch auto-down boundary (slow day): 5 trays over rounds down, 6 rounds up', () => {
  // Slow-day extension window (≤ 5 over). $5,200 row → 24 pizza trays; the
  // boil count steers the remainder.
  const at27 = computePlan(record2pm({ cs: 0, tf: 0, tmf: 5200, boil: 18 }), 'regular');
  assert.equal(at27.totalTrays, 27); // remainder 5
  assert.equal(at27.rounding.batches, 'down');
  assert.equal(at27.batches, 2);
  assert.equal(at27.cut, 5);
  assert.equal(at27.cutNote, '−2 SM, −3 LG');
  assert.equal(at27.finalTrays.small, at27.rows.small.trays - 2);
  assert.equal(at27.finalTrays.large, at27.rows.large.trays - 3);
  const sum = at27.finalTrays.indi + at27.finalTrays.small + at27.finalTrays.large + at27.finalTrays.sic + at27.boilTrays;
  assert.equal(sum, 22);

  const at28 = computePlan(record2pm({ cs: 0, tf: 0, tmf: 5200, boil: 12 }), 'regular');
  assert.equal(at28.totalTrays, 28); // remainder 6
  assert.equal(at28.rounding.batches, 'up');
  assert.equal(at28.batches, 3);
  assert.equal(at28.extra, 5);
  assert.equal(at28.extraNote, '+2 SM, +3 LG');
});

test('rounding down never drops below 1 batch; the single batch still tops up', () => {
  // Everything already on hand except one boil tray.
  const r = record2pm({
    cs: 0, tf: 0, tmf: 3750,
    counts: { indi: 11, small: 52, large: 44, sic: 10 }, boil: 30, br: 'down',
  });
  const p = computePlan(r, 'regular');
  assert.equal(p.totalTrays, 1);
  assert.equal(p.batches, 1); // max(1, floor(1/11))
  assert.equal(p.cut, 0);
  assert.equal(p.extra, 10);
  assert.equal(p.extraNote, '+4 SM, +6 LG');
});

test('manual batch pills override the auto rule both ways', () => {
  // Slow day at remainder 5, forced up: plain ceil with extras.
  const up = computePlan(record2pm({ cs: 0, tf: 0, tmf: 5200, boil: 18, br: 'up' }), 'regular');
  assert.equal(up.batches, 3);
  assert.equal(up.extra, 6);
  assert.equal(up.cut, 0);
  assert.deepEqual([up.rounding.batches, up.rounding.batchesAuto], ['up', false]);
  // Not a slow day (tmf $12,250), forced down: floor with a cut.
  const down = computePlan(record2pm({ cs: 15000, tf: 15000, tmf: 12250, br: 'down' }), 'regular');
  assert.equal(down.rounding.slowDay, false);
  assert.equal(down.totalTrays, 54);
  assert.equal(down.batches, 4);
  assert.equal(down.cut, 10);
  assert.equal(down.cutNote, '−4 SM, −6 LG');
});

test('manual forecast pills override the gate; the $300 cap always holds', () => {
  // Big day stamped down: tomorrow ($14,200 → $13,900, exactly $300) rounds
  // down, but sales left ($14,500, $600 above $13,900) falls back to up.
  const p = computePlan(record2pm({ cs: 500, tf: 15000, tmf: 14200, fr: 'down' }), 'regular');
  assert.equal(p.salesLeft, 14500);
  assert.equal(p.use.tier, 14750);
  assert.equal(p.need.tier, 13900);
  assert.deepEqual([p.rounding.forecast, p.rounding.forecastAuto], ['down', false]);
  // Slow day stamped up: lookups behave exactly like pre-v2·10.
  assert.equal(computePlan(record2pm({ cs: 2000, tf: 6000, tmf: 8000, fr: 'up' }), 'regular').need.tier, 8300);
  assert.equal(computePlan(record2pm({ cs: 2000, tf: 6000, tmf: 8000 }), 'regular').need.tier, 7800);
});

test('cut trims clamp at zero and skip sizes with nothing to give', () => {
  // No Small trays in the plan — the whole cut lands on Large.
  const noSmall = computePlan(record2pm({ cs: 0, tf: 0, tmf: 5200, counts: { small: 74 }, boil: 24 }), 'regular');
  assert.equal(noSmall.rows.small.trays, 0);
  assert.equal(noSmall.totalTrays, 16); // remainder 5 → auto down to 1 batch
  assert.equal(noSmall.batches, 1);
  assert.equal(noSmall.cut, 5);
  assert.equal(noSmall.cutNote, '−5 LG');
  assert.equal(noSmall.finalTrays.small, 0);
  // Degenerate: neither SM nor LG has trays — nothing trimmed, no negatives.
  const stuck = computePlan(record2pm({
    cs: 20750, tf: 20750, tmf: 20750, counts: { small: 276, large: 267 }, boil: 0, br: 'down',
  }), 'regular');
  assert.equal(stuck.totalTrays, 13); // indi 4 + sic 3 + boil 6
  assert.equal(stuck.batches, 1);
  assert.equal(stuck.cut, 2);
  assert.equal(stuck.cutNote, '');
  assert.equal(stuck.finalTrays.small, 0);
  assert.equal(stuck.finalTrays.large, 0);
});

test('plan.rounding exposes the resolved state, null when undecidable', () => {
  const blank = computePlan(blankRecord(), 'regular');
  assert.deepEqual(blank.rounding, {
    slowDay: false, forecast: 'up', forecastAuto: true, batches: null, batchesAuto: true,
  });
  // A stamp shows through even while the plan is not ready.
  const stamped = computePlan(record2pm({ fr: 'down', br: 'down' }), 'regular');
  assert.equal(stamped.ready, false);
  assert.deepEqual(
    [stamped.rounding.forecast, stamped.rounding.batches, stamped.rounding.batchesAuto],
    ['down', 'down', false]
  );
});

test('EON outlook follows the resolved forecast rounding', () => {
  const needFor = (fixture) => {
    const r = record2pm(fixture);
    r.eon.counts.small.singles = '100';
    return computeOutlook(r, 'regular', 8000).rows.small.need;
  };
  assert.equal(needFor({ cs: 1000, tf: 9000, tmf: 9000 }), 108); // slow → $7,800 row
  assert.equal(needFor({ cs: 1000, tf: 9000, tmf: 9000, fr: 'up' }), 115); // pinned → $8,300
  assert.equal(needFor({ cs: 1000, tf: 15000, tmf: 15000 }), 115); // gate reads the 2 PM forecasts
});

/* ---------------- actual make ---------------- */

test('effectiveMake: an entered Actual Make wins, calc fills the rest', () => {
  const r = record2pm({ cs: 2000, tf: 6000, tmf: 8000, counts: { indi: 20, small: 60, large: 50, sic: 3 }, boil: 10, fr: 'up' });
  r.actualMake.small = '104';
  const p = computePlan(r, 'regular');
  const eff = effectiveMake(r, p);
  assert.deepEqual(eff.small, { balls: 104, source: 'recount' });
  assert.deepEqual(eff.indi, { balls: 16, source: 'calc' });
  assert.deepEqual(eff.boil, { balls: 30, source: 'calc' });
  r.actualMake.boil = '36';
  assert.deepEqual(effectiveMake(r, p).boil, { balls: 36, source: 'recount' });
});

/* ---------------- EON outlook ---------------- */

function eonRecord(counts) {
  const r = blankRecord();
  for (const [id, n] of Object.entries(counts)) {
    if (n != null) r.eon.counts[id].singles = String(n);
  }
  return r;
}

test('outlook: tray-first diffs round to the NEAREST tray', () => {
  const r = eonRecord({ indi: 10, large: 92, sic: 4, boil: 30 }); // small left blank
  const ol = computeOutlook(r, 'regular', 8000); // need $8,300 row {24,115,106,3}, boil 36
  assert.deepEqual(ol.rows.indi, { have: 10, need: 24, diff: -14, tDiff: -1 });
  assert.deepEqual(ol.rows.large, { have: 92, need: 106, diff: -14, tDiff: -2 });
  assert.deepEqual(ol.rows.small, { have: null, need: 115, diff: null, tDiff: null });
  assert.deepEqual(ol.rows.sic, { have: 4, need: 3, diff: 1, tDiff: 0 });
  assert.deepEqual(ol.rows.boil, { have: 30, need: 36, diff: -6, tDiff: -1 });
  assert.equal(ol.shortfall, 34);
  assert.equal(ol.shortTrays, 4);
  assert.equal(ol.surplus, 1);
  assert.equal(ol.surplusTrays, 0);
  assert.equal(ol.anyCount, true);
  assert.equal(ol.hasNeed, true);
});

test('outlook: a shortage that rounds to zero trays still reports its balls', () => {
  const r = eonRecord({ large: 104 }); // need 106 → 2 short → rounds to 0 trays
  const ol = computeOutlook(r, 'regular', 8000);
  assert.equal(ol.rows.large.tDiff, 0);
  assert.equal(ol.shortTrays, 0);
  assert.equal(ol.shortfall, 2); // UI renders this as "less than a tray"
});

test('outlook: no forecast (or explicit 0) means no need to compare against', () => {
  const r = eonRecord({ indi: 10 });
  assert.equal(computeOutlook(r, 'regular', null).hasNeed, false);
  const at0 = computeOutlook(r, 'regular', 0);
  assert.equal(at0.hasNeed, false);
  assert.equal(at0.rows.indi.need, null);
  assert.equal(at0.rows.boil.need, null);
  const blank = computeOutlook(blankRecord(), 'regular', 8000);
  assert.equal(blank.anyCount, false);
});

/* ---------------- v1 parity ---------------- */

// Run the frozen v1 computeDough (vm-loaded from the /v1/ snapshot) against
// v2's computePlan on identical inputs. Everything must agree except
// boilMake, where v2 deliberately rounds up to whole trays.
const v1ctx = loadContext(['v1/js/config.js', 'v1/js/utils.js', 'v1/js/calculate.js']);
const { computeDough } = getRefs(v1ctx, ['computeDough']);

const PARITY_FIXTURES = [
  { cs: 2000, tf: 6000, tmf: 8000, counts: { indi: 20, small: 60, large: 50, sic: 3 }, boil: 10 },
  { cs: 3000, tf: 9000, tmf: 10000, counts: { indi: 33, small: 112, large: 168, sic: 6 }, boil: 24 }, // 4/1/2026
  { cs: 1500, tf: 10000, tmf: 14000, counts: { indi: 39, small: 177, large: 146, sic: 7 }, boil: 20 }, // 4/2/2026
  { cs: 3300, tf: 12000, tmf: 17500, counts: { indi: 55, small: 168, large: 144, sic: 6 }, boil: 6 }, // 4/9/2026
  { cs: 0, tf: 0, tmf: 8000, counts: { indi: 0, small: 0, large: 0, sic: 0 }, boil: 0 }, // zero day
  { cs: 5000, tf: 4000, tmf: 4000, counts: { indi: 10, small: 20, large: 20, sic: 2 }, boil: 0 }, // forecast hit
  { cs: 5000, tf: 9000, tmf: 99999, counts: { indi: 0, small: 0, large: 0, sic: 0 }, boil: 0 }, // top cap
];

test('v1 parity: identical inputs produce identical plans (boil balls aside)', () => {
  for (const fx of PARITY_FIXTURES) {
    const v1 = plain(computeDough({
      currentSales: fx.cs, todayForecast: fx.tf, tomorrowForecast: fx.tmf,
      counts: fx.counts, boilCount: fx.boil,
    }));
    // v1 always rounded up — pin both pills so parity stays parity.
    const v2 = computePlan(record2pm({ ...fx, fr: 'up', br: 'up' }), 'regular');
    const tag = JSON.stringify(fx);
    assert.equal(v2.salesLeft, v1.salesLeft, `salesLeft ${tag}`);
    for (const t of ['indi', 'small', 'large', 'sic']) {
      assert.equal(v2.rows[t].use, v1.doughUse[t], `use.${t} ${tag}`);
      assert.equal(v2.rows[t].left, v1.doughLeft[t], `left.${t} ${tag}`);
      assert.equal(v2.rows[t].make, v1.ballsToMake[t], `make.${t} ${tag}`);
      assert.equal(v2.rows[t].trays, v1.trays[t], `trays.${t} ${tag}`);
    }
    assert.equal(v2.boilTrays, v1.boilTrays, `boilTrays ${tag}`);
    assert.equal(v2.boilMake, v1.boilTrays * 6, `boilMake whole-tray ${tag}`);
    assert.equal(v2.totalTrays, v1.totalTrays, `totalTrays ${tag}`);
    assert.equal(v2.batches, v1.batches, `batches ${tag}`);
  }
});

// Guard the assumption baked into the parity suite: sic counts stay under
// the new waiver so the two implementations share the same clamp behavior.
test('parity fixtures stay below the Sicilian waiver threshold', () => {
  for (const fx of PARITY_FIXTURES) assert.ok(fx.counts.sic < 10);
});
