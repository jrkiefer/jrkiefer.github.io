'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadContext, getRefs, evalIn, plain } = require('./helpers/load');

// Stub only what the validation branches reach — they return before any
// SpreadsheetApp call.
const ContentServiceStub = {
  MimeType: { JSON: 'JSON' },
  createTextOutput(s) { return { body: s, setMimeType() { return this; } }; }
};

const gs = loadContext(['apps-script/Code.gs'], { ContentService: ContentServiceStub });
const g = getRefs(gs, [
  'SHEETS', 'BIBLE_DATA', 'formatDate', 'normalizeDate', 'hasNegative',
  'handleDoughPost', 'handleEonPost', 'handleMakePost'
]);

function responseOf(output) {
  return JSON.parse(output.body);
}

test('formatDate: Date object renders as M/D/YYYY', () => {
  assert.equal(evalIn(gs, 'formatDate(new Date(2026, 3, 1))'), '4/1/2026');
  assert.equal(g.formatDate('4/1/2026'), '4/1/2026');
});

test('normalizeDate: strips leading zeros', () => {
  assert.equal(g.normalizeDate('04/01/2026'), '4/1/2026');
  assert.equal(g.normalizeDate('4/1/2026'), '4/1/2026');
});

test('hasNegative: detects negatives, ignores garbage', () => {
  assert.equal(g.hasNegative([0, 5, '3']), false);
  assert.equal(g.hasNegative([0, -1]), true);
  assert.equal(g.hasNegative(['abc', undefined]), false); // coerce to 0
});

test('BIBLE_DATA mirrors DOUGH_TABLE row for row', () => {
  // CI-enforced sync: editing one without the other fails here.
  const fe = loadContext(['js/config.js']);
  const { DOUGH_TABLE } = getRefs(fe, ['DOUGH_TABLE']);
  assert.equal(g.BIBLE_DATA.length, DOUGH_TABLE.length);
  for (let i = 0; i < DOUGH_TABLE.length; i++) {
    const row = DOUGH_TABLE[i];
    assert.deepEqual(
      plain(g.BIBLE_DATA[i]),
      [row.threshold, row.indi, row.small, row.large, row.sic],
      'BIBLE_DATA out of sync with DOUGH_TABLE at row ' + i
    );
  }
});

test('SHEETS headers match the row widths the handlers write', () => {
  assert.equal(g.SHEETS.dough.headers.length, 11);
  assert.equal(g.SHEETS.temps.headers.length, 21);
  assert.equal(g.SHEETS.make.headers.length, 6);
  assert.equal(g.SHEETS.final.headers.length, 6);
  assert.equal(g.SHEETS.eon.headers.length, 7);
});

test('handleDoughPost rejects missing date and empty saves', () => {
  assert.equal(responseOf(g.handleDoughPost({})).status, 'error');
  const empty = responseOf(g.handleDoughPost({ date: '4/1/2026' }));
  assert.equal(empty.status, 'error');
  assert.match(empty.message, /Empty save/);
});

test('handleDoughPost rejects negative values', () => {
  const r = responseOf(g.handleDoughPost({
    date: '4/1/2026', todayForecast: 4000, indiCount: -5
  }));
  assert.equal(r.status, 'error');
  assert.match(r.message, /Negative/);
});

test('handleEonPost rejects missing date, empty saves, and negatives', () => {
  assert.equal(responseOf(g.handleEonPost({})).status, 'error');
  const empty = responseOf(g.handleEonPost({ date: '4/1/2026' }));
  assert.match(empty.message, /Empty save/);
  const neg = responseOf(g.handleEonPost({
    date: '4/1/2026', eonSales: 5000, indiCount: -1
  }));
  assert.match(neg.message, /Negative/);
});

test('upsertSizeRow clamps negative makes/finals to 0', () => {
  // Surplus dough used to reach the sheet as a negative make. The writer
  // clamps so even older frontends can't store negatives.
  const appended = [];
  const fakeSheet = {
    getDataRange() { return { getValues: () => [['Date', 'Indi', 'Small', 'Large', 'Sicilian', 'Boil']] }; },
    appendRow(row) { appended.push(row); },
    getRange() { return { setValues() {} }; },
    getLastRow() { return 2; }
  };
  const ctx2 = loadContext(['apps-script/Code.gs'], {
    ContentService: ContentServiceStub,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => fakeSheet }) }
  });
  evalIn(ctx2, 'upsertSizeRow("make", "4/1/2026", { indi: -5, small: 2, large: -1, sic: 0, boil: 26 })');
  assert.equal(appended.length, 1);
  assert.deepEqual(plain(appended[0]), ['4/1/2026', 0, 2, 0, 0, 26]);
});

test('handleMakePost rejects missing date, missing makes, and negatives', () => {
  assert.equal(responseOf(g.handleMakePost({})).status, 'error');
  const noMakes = responseOf(g.handleMakePost({ date: '4/1/2026' }));
  assert.match(noMakes.message, /makes/);
  const neg = responseOf(g.handleMakePost({
    date: '4/1/2026', makes: { indi: -1, small: 0, large: 0, sic: 0, boil: 0 }
  }));
  assert.match(neg.message, /Negative/);
});
