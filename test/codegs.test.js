import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext, getRefs, evalIn, plain } from './helpers/load.js';
import { BIBLES } from '../js/config.js';

// Stub only what the validation branches reach — they return before any
// SpreadsheetApp call.
const ContentServiceStub = {
  MimeType: { JSON: 'JSON' },
  createTextOutput(s) { return { body: s, setMimeType() { return this; } }; }
};

const gs = loadContext(['apps-script/Code.gs'], { ContentService: ContentServiceStub });
const g = getRefs(gs, [
  'SHEETS', 'BIBLE_DATA', 'PEACH_BIBLE_DATA', 'formatDate', 'normalizeDate',
  'hasNegative', 'handleDoughPost', 'handleEonPost', 'handleMakePost'
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

test('both bible tables mirror js/config.js row for row', () => {
  // CI-enforced sync: editing one side without the other fails here.
  assert.deepEqual(plain(g.BIBLE_DATA), BIBLES.regular.rows);
  assert.deepEqual(plain(g.PEACH_BIBLE_DATA), BIBLES.peach.rows);
});

test('SHEETS headers match the row widths the handlers write', () => {
  assert.equal(g.SHEETS.dough.headers.length, 12); // v2: + Bible column
  assert.equal(g.SHEETS.dough.headers[11], 'Bible');
  assert.equal(g.SHEETS.temps.headers.length, 21);
  assert.equal(g.SHEETS.make.headers.length, 6);
  assert.equal(g.SHEETS.final.headers.length, 6);
  assert.equal(g.SHEETS.eon.headers.length, 7);
  assert.equal(g.SHEETS.peachBible.headers.length, 5);
});

test('handleDoughPost writes the Bible column (blank for old frontends)', () => {
  const appended = [];
  const fakeSheet = {
    getDataRange() { return { getValues: () => [g.SHEETS.dough.headers] }; },
    appendRow(row) { appended.push(row); },
    getRange() { return { setValues() {} }; },
    getLastRow() { return appended.length + 1; }
  };
  const ctx2 = loadContext(['apps-script/Code.gs'], {
    ContentService: ContentServiceStub,
    console: { error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => fakeSheet }) }
  });
  const { handleDoughPost } = getRefs(ctx2, ['handleDoughPost']);
  handleDoughPost({ date: '4/1/2026', todayForecast: 9000, bible: 'peach' });
  handleDoughPost({ date: '4/2/2026', todayForecast: 9000 }); // pre-v2 payload
  assert.equal(appended[0].length, 12);
  assert.equal(appended[0][11], 'peach');
  assert.equal(appended[1][11], '');
});

test('seedSheets: creates the Peach tab, appends the Bible header, idempotent', () => {
  function fakeSheet(rows) {
    return {
      rows,
      getDataRange() { return { getValues: () => this.rows.map((r) => r.slice()) }; },
      getRange(row, col, numRows, numCols) {
        const self = this;
        return {
          getValue: () => (self.rows[row - 1] ? self.rows[row - 1][col - 1] : '') ?? '',
          setValue(v) {
            while (self.rows.length < row) self.rows.push([]);
            self.rows[row - 1][col - 1] = v;
          },
          setValues(vals) {
            for (let i = 0; i < (numRows ?? vals.length); i++) {
              while (self.rows.length < row + i) self.rows.push([]);
              for (let j = 0; j < (numCols ?? vals[i].length); j++) {
                self.rows[row - 1 + i][col - 1 + j] = vals[i][j];
              }
            }
          }
        };
      },
      appendRow(r) { this.rows.push(r); },
      getLastRow() { return this.rows.length; },
      setFrozenRows() {}
    };
  }
  // a live pre-v2 spreadsheet: 11-column dough tab with data, no Peach tab
  const byName = {
    'Dough Counts': fakeSheet([
      g.SHEETS.dough.headers.slice(0, 11),
      ['4/1/2026', 9000, 3000, 6000, 10000, 33, 112, 168, 6, 24, 3]
    ]),
    Temperatures: fakeSheet([plain(g.SHEETS.temps.headers)]),
    'Dough Bible': fakeSheet([plain(g.SHEETS.bible.headers), [3750, 11, 52, 44, 2]]),
    '2pm Make Amount': fakeSheet([plain(g.SHEETS.make.headers)]),
    'Final Dough Amount at 2pm': fakeSheet([plain(g.SHEETS.final.headers)]),
    'End of Night Count': fakeSheet([plain(g.SHEETS.eon.headers)])
  };
  const ss = {
    getSheetByName: (n) => byName[n] ?? null,
    insertSheet: (n) => { byName[n] = fakeSheet([]); return byName[n]; }
  };
  const ctx2 = loadContext(['apps-script/Code.gs'], {
    ContentService: ContentServiceStub,
    Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss }
  });

  evalIn(ctx2, 'seedSheets()');
  const peach = byName['Peach Bible'];
  assert.ok(peach, 'Peach Bible tab created');
  assert.deepEqual(plain(peach.rows[0]), plain(g.SHEETS.peachBible.headers));
  assert.equal(peach.rows.length, 31); // headers + 30 rows
  assert.deepEqual(plain(peach.rows[1]), [3000, 20, 56, 51, 2]);
  assert.equal(byName['Dough Counts'].rows[0][11], 'Bible'); // header appended
  assert.equal(byName['Dough Counts'].rows[1][11], undefined); // data untouched

  // run again — nothing changes
  const before = JSON.stringify(plain({
    dough: byName['Dough Counts'].rows, peach: peach.rows
  }));
  evalIn(ctx2, 'seedSheets()');
  const after = JSON.stringify(plain({
    dough: byName['Dough Counts'].rows, peach: peach.rows
  }));
  assert.equal(after, before);
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

test('fixNegativeMakes clamps make rows and recomputes finals from counts', () => {
  function fakeSheet(rows) {
    return {
      rows: rows,
      getDataRange() {
        const self = this;
        return { getValues: () => self.rows.map(r => r.slice()) };
      },
      getRange(row, colStart, numRows, numCols) {
        const self = this;
        return {
          setValues(vals) {
            for (let i = 0; i < numRows; i++)
              for (let j = 0; j < numCols; j++)
                self.rows[row - 1 + i][colStart - 1 + j] = vals[i][j];
          },
          setValue(v) { self.rows[row - 1][colStart - 1] = v; }
        };
      },
      appendRow(r) { this.rows.push(r); },
      getLastRow() { return this.rows.length; }
    };
  }

  const sizeHeaders = ['Date', 'Indi', 'Small', 'Large', 'Sicilian', 'Boil'];
  const dough = fakeSheet([
    ['Date', "Today's Forecast", 'Current Sales', 'Sales Left', "Tomorrow's Forecast",
     'Indi Count', 'Small Count', 'Large Count', 'Sic Count', 'Boil Count', 'Batches'],
    ['4/1/2026', 6000, 2000, 4000, 8000, 20, 60, 50, 3, 10, 4]
  ]);
  const make = fakeSheet([
    sizeHeaders,
    ['4/1/2026', -5, 113, -2, 2, 26],   // negatives from the old frontend
    ['4/2/2026', -1, 0, 0, 2, 0]        // no matching Dough Counts row
  ]);
  const final = fakeSheet([
    sizeHeaders,
    ['4/1/2026', 15, 173, 48, 5, 36]    // stale: built from the negative makes
  ]);
  const byName = {
    'Dough Counts': dough, '2pm Make Amount': make, 'Final Dough Amount at 2pm': final
  };

  const ctx2 = loadContext(['apps-script/Code.gs'], {
    ContentService: ContentServiceStub,
    Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => byName[n] }) }
  });
  evalIn(ctx2, 'fixNegativeMakes()');

  assert.deepEqual(plain(make.rows[1]), ['4/1/2026', 0, 113, 0, 2, 26]);
  assert.deepEqual(plain(make.rows[2]), ['4/2/2026', 0, 0, 0, 2, 0]);
  // final = counts {20,60,50,3,10} + clamped make {0,113,0,2,26}
  assert.deepEqual(plain(final.rows[1]), ['4/1/2026', 20, 173, 50, 5, 36]);
  // 4/2 has no Dough Counts row — no final row created
  assert.equal(final.rows.length, 2);
});

test('handleTempsPost: full-row upsert — a shorter re-save clears stale cells', () => {
  const rows = [plain(g.SHEETS.temps.headers)];
  const sheet = {
    getDataRange() { return { getValues: () => rows.map((r) => r.slice()) }; },
    getRange(row, col, numRows, numCols) {
      return {
        setValues(vals) {
          for (let i = 0; i < numRows; i++)
            for (let j = 0; j < numCols; j++)
              rows[row - 1 + i][col - 1 + j] = vals[i][j];
        }
      };
    },
    appendRow(r) { rows.push(r); },
    getLastRow() { return rows.length; }
  };
  const ctx2 = loadContext(['apps-script/Code.gs'], {
    ContentService: ContentServiceStub,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) }
  });
  const { handleTempsPost } = getRefs(ctx2, ['handleTempsPost']);

  handleTempsPost({ date: '4/1/2026', temps: [{ water: 58, dough: 78 }, { water: 56, dough: 80 }] });
  assert.equal(rows.length, 2);
  assert.equal(rows[1].length, 21); // full width, one write
  assert.deepEqual(plain(rows[1].slice(0, 5)), ['4/1/2026', 58, 78, 56, 80]);
  assert.ok(rows[1].slice(5).every((c) => c === ''));

  handleTempsPost({ date: '4/1/2026', temps: [{ water: 60, dough: 79 }] });
  assert.equal(rows.length, 2); // upserted, not appended
  assert.deepEqual(plain(rows[1].slice(0, 5)), ['4/1/2026', 60, 79, '', '']); // stale pair cleared
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
