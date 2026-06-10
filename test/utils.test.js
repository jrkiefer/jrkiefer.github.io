'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadContext, getRefs, evalIn } = require('./helpers/load');

const ctx = loadContext(['js/config.js', 'js/utils.js']);
const u = getRefs(ctx, [
  'parseDollar', 'expandDollar', 'normalizeDate', 'parseMDY',
  'sheetDateToLocal', 'toShorthand', 'valClass', 'getField', 'stripExtraDots'
]);

test('expandDollar: shorthand under 100 multiplies by 1000', () => {
  assert.equal(u.expandDollar('1.7'), 1700);
  assert.equal(u.expandDollar('10'), 10000);
  assert.equal(u.expandDollar('99'), 99000);
});

test('expandDollar: 100 and above taken literally', () => {
  assert.equal(u.expandDollar('100'), 100);
  assert.equal(u.expandDollar('$4,500'), 4500);
});

test('expandDollar: empty and garbage parse to 0', () => {
  assert.equal(u.expandDollar(''), 0);
  assert.equal(u.expandDollar('abc'), 0);
});

test('parseDollar: negatives are absolute-valued', () => {
  assert.equal(u.parseDollar('-$1,200'), 1200);
  assert.equal(u.parseDollar('abc'), 0);
});

test('normalizeDate: YYYY-MM-DD and zero-padded M/D/YYYY both normalize', () => {
  assert.equal(u.normalizeDate('2026-04-01'), '4/1/2026');
  assert.equal(u.normalizeDate('04/01/2026'), '4/1/2026');
  assert.equal(u.normalizeDate('4/1/2026'), '4/1/2026');
});

test('normalizeDate: non-date strings pass through', () => {
  assert.equal(u.normalizeDate('garbage'), 'garbage');
});

test('parseMDY: valid date at local midnight', () => {
  const d = u.parseMDY('4/1/2026');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 3);
  assert.equal(d.getDate(), 1);
  assert.equal(d.getHours(), 0);
});

test('parseMDY: malformed input returns null', () => {
  assert.equal(u.parseMDY('x/y/z'), null);
  assert.equal(u.parseMDY('4/1'), null);
  assert.equal(u.parseMDY(''), null);
});

test('sheetDateToLocal: handles date-only and timestamp strings', () => {
  assert.equal(u.sheetDateToLocal('2026-04-01'), '4/1/2026');
  assert.equal(u.sheetDateToLocal('2026-04-01T00:00:00'), '4/1/2026');
});

test('sheetDateToLocal: Date instances and passthrough', () => {
  // The vm context has its own Date constructor; build the Date inside it
  // so instanceof matches.
  assert.equal(evalIn(ctx, 'sheetDateToLocal(new Date(2026, 3, 1))'), '4/1/2026');
  assert.equal(u.sheetDateToLocal('4/1/2026'), '4/1/2026');
});

test('toShorthand: inverse of dollar expansion for display', () => {
  assert.equal(u.toShorthand(1700), '1.7');
  assert.equal(u.toShorthand(500), '500');
  assert.equal(u.toShorthand(0), '');
});

test('valClass: pos/neg/empty', () => {
  assert.equal(u.valClass(5), 'pos');
  assert.equal(u.valClass(-5), 'neg');
  assert.equal(u.valClass(0), '');
});

test('getField: exact, camel, and case-insensitive fallbacks', () => {
  assert.equal(u.getField({ 'Indi Count': 7 }, 'Indi Count', 'indiCount'), 7);
  assert.equal(u.getField({ indiCount: 8 }, 'Indi Count', 'indiCount'), 8);
  assert.equal(u.getField({ 'INDI COUNT': 9 }, 'Indi Count', 'indiCount'), 9);
  assert.equal(u.getField({}, 'Indi Count', 'indiCount'), 0);
});

test('stripExtraDots: keeps only the first decimal point', () => {
  const el = { value: '1.2.3' };
  u.stripExtraDots(el);
  assert.equal(el.value, '1.23');
});
