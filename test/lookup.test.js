'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadContext, getRefs } = require('./helpers/load');

const ctx = loadContext(['js/config.js', 'js/utils.js', 'js/calculate.js']);
const { lookup, lookupIndex, DOUGH_TABLE } = getRefs(ctx, ['lookup', 'lookupIndex', 'DOUGH_TABLE']);

test('lookup rounds UP to the next threshold', () => {
  assert.equal(lookup(3751).threshold, 4000);
  assert.equal(lookup(7999).threshold, 8300);
});

test('lookup returns the exact row on a threshold hit', () => {
  assert.equal(lookup(3750).threshold, 3750);
  assert.equal(lookup(20750).threshold, 20750);
});

test('lookup floors at the first row for zero and negative sales-left', () => {
  assert.equal(lookup(0).threshold, 3750);
  assert.equal(lookup(-500).threshold, 3750);
});

test('lookup caps at the highest row above the table max', () => {
  const top = lookup(99999);
  assert.equal(top.threshold, 20750);
  assert.equal(top, DOUGH_TABLE[DOUGH_TABLE.length - 1]); // same row object
});

test('lookupIndex agrees with lookup', () => {
  for (const v of [0, 3750, 3751, 8000, 20750, 99999]) {
    assert.equal(DOUGH_TABLE[lookupIndex(v)].threshold, lookup(v).threshold);
  }
});

test('DOUGH_TABLE invariants: 27 rows, strictly increasing thresholds, positive counts', () => {
  assert.equal(DOUGH_TABLE.length, 27);
  for (let i = 0; i < DOUGH_TABLE.length; i++) {
    const row = DOUGH_TABLE[i];
    if (i > 0) assert.ok(row.threshold > DOUGH_TABLE[i - 1].threshold,
      'threshold not increasing at row ' + i);
    for (const k of ['indi', 'small', 'large', 'sic']) {
      assert.ok(row.threshold > 0 && row[k] > 0, 'non-positive value at row ' + i);
    }
  }
});
