'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadContext, getRefs, plain } = require('./helpers/load');

const ctx = loadContext(['js/config.js', 'js/utils.js', 'js/calculate.js']);
const { computeDough } = getRefs(ctx, ['computeDough']);

test('happy path: full 9-step chain', () => {
  // salesLeft 4000 -> exact threshold row {12, 58, 50, 2} (idx 1)
  // tomorrow 8000 -> rounds up to 8300 row {24, 115, 106, 3} (idx 10)
  const r = computeDough({
    currentSales: 2000, todayForecast: 6000, tomorrowForecast: 8000,
    counts: { indi: 20, small: 60, large: 50, sic: 3 }, boilCount: 10
  });
  assert.equal(r.salesLeft, 4000);
  assert.equal(r.tonightIdx, 1);
  assert.equal(r.tomorrowIdx, 10);
  assert.deepEqual(plain(r.doughLeft), { indi: 8, small: 2, large: 0, sic: 1 });
  assert.deepEqual(plain(r.ballsToMake), { indi: 16, small: 113, large: 106, sic: 2 });
  assert.deepEqual(plain(r.trays), { indi: 2, small: 15, large: 18, sic: 1 });
  assert.equal(r.boilMake, 26);
  assert.equal(r.boilTrays, 5); // batch math uses ceil(26/6), not trays+singles
  assert.equal(r.totalTrays, 41);
  assert.equal(r.batches, 4); // ceil(41/11)
});

test('Sicilian make is floored at 2 even with surplus on hand', () => {
  const r = computeDough({
    currentSales: 2000, todayForecast: 6000, tomorrowForecast: 8000,
    counts: { indi: 20, small: 60, large: 50, sic: 50 }, boilCount: 36
  });
  assert.equal(r.ballsToMake.sic, 2);
  assert.equal(r.trays.sic, 1); // the forced 2 balls still cost a tray
});

test('Sicilian doughLeft clamps at 0 so a night shortfall cannot inflate tomorrow', () => {
  const r = computeDough({
    currentSales: 2000, todayForecast: 6000, tomorrowForecast: 8000,
    counts: { indi: 20, small: 60, large: 50, sic: 0 }, boilCount: 10
  });
  assert.equal(r.doughLeft.sic, 0); // not -2
  assert.equal(r.ballsToMake.sic, 3); // tomorrow's need, undistorted
});

test('boil: make is max(0, 36 - count)', () => {
  const at = computeDough({
    currentSales: 0, todayForecast: 0, tomorrowForecast: 0,
    counts: { indi: 0, small: 0, large: 0, sic: 0 }, boilCount: 36
  });
  assert.equal(at.boilMake, 0);
  assert.equal(at.boilTrays, 0);
  const over = computeDough({
    currentSales: 0, todayForecast: 0, tomorrowForecast: 0,
    counts: { indi: 0, small: 0, large: 0, sic: 0 }, boilCount: 50
  });
  assert.equal(over.boilMake, 0);
});

test('zero inputs: nothing used tonight, tomorrow floors at the first row (page-load state)', () => {
  // salesLeft 0 -> no dough used tonight (no first-row round-up); tomorrow's
  // lookup(0) still floors at the $3,750 row so an untouched form shows a
  // non-zero recipe.
  const r = computeDough({
    currentSales: 0, todayForecast: 0, tomorrowForecast: 0,
    counts: { indi: 0, small: 0, large: 0, sic: 0 }, boilCount: 0
  });
  assert.equal(r.tonightIdx, -1);
  assert.deepEqual(plain(r.doughUse), { indi: 0, small: 0, large: 0, sic: 0 });
  assert.deepEqual(plain(r.ballsToMake), { indi: 11, small: 52, large: 44, sic: 2 });
  assert.equal(r.boilMake, 36);
  assert.equal(r.batches, 3);
});

test('from-zero day: closed today, tomorrow forecast drives the make exactly', () => {
  // Shop closed today (no forecast, no sales) and 0 dough on hand: make must
  // equal tomorrow's lookup row exactly — no phantom tonight-use, no set-out.
  const r = computeDough({
    currentSales: 0, todayForecast: 0, tomorrowForecast: 8000,
    counts: { indi: 0, small: 0, large: 0, sic: 0 }, boilCount: 0
  });
  assert.deepEqual(plain(r.doughUse), { indi: 0, small: 0, large: 0, sic: 0 });
  assert.deepEqual(plain(r.doughLeft), { indi: 0, small: 0, large: 0, sic: 0 }); // no negatives -> no set-out
  assert.deepEqual(plain(r.ballsToMake), { indi: 24, small: 115, large: 106, sic: 3 }); // the $8,300 row
  assert.equal(r.boilMake, 36);
  assert.equal(r.batches, 4); // trays 3+15+18+1 + 6 boil = 43 -> ceil(43/11)
});

test('forecast already hit: salesLeft <= 0 uses no dough tonight', () => {
  const r = computeDough({
    currentSales: 5000, todayForecast: 4000, tomorrowForecast: 8000,
    counts: { indi: 10, small: 20, large: 20, sic: 2 }, boilCount: 36
  });
  assert.equal(r.salesLeft, -1000);
  assert.deepEqual(plain(r.doughUse), { indi: 0, small: 0, large: 0, sic: 0 });
  assert.deepEqual(plain(r.doughLeft), { indi: 10, small: 20, large: 20, sic: 2 });
});

test('fully stocked: makes clamp to 0 (no negative surplus), Sicilian minimum keeps batches at 1', () => {
  const r = computeDough({
    currentSales: 0, todayForecast: 4000, tomorrowForecast: 4000,
    counts: { indi: 100, small: 300, large: 300, sic: 100 }, boilCount: 36
  });
  assert.deepEqual(plain(r.ballsToMake), { indi: 0, small: 0, large: 0, sic: 2 });
  assert.deepEqual(plain(r.trays), { indi: 0, small: 0, large: 0, sic: 1 });
  assert.equal(r.batches, 1);
});
