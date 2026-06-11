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

test('zero inputs floor at the first lookup row (the page-load state)', () => {
  // lookup(0) returns the $3,750 row, so even an untouched form shows a
  // non-zero recipe. Pins the floor behavior.
  const r = computeDough({
    currentSales: 0, todayForecast: 0, tomorrowForecast: 0,
    counts: { indi: 0, small: 0, large: 0, sic: 0 }, boilCount: 0
  });
  assert.equal(r.tonightIdx, 0);
  assert.deepEqual(plain(r.ballsToMake), { indi: 22, small: 104, large: 88, sic: 2 });
  assert.equal(r.boilMake, 36);
  assert.equal(r.batches, 4);
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
