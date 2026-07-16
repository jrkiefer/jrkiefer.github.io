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
  assert.equal(g.SHEETS.dough.headers.length, 14); // v2: + Bible, v2·10: + rounding pair
  assert.equal(g.SHEETS.dough.headers[11], 'Bible');
  assert.equal(g.SHEETS.dough.headers[12], 'Forecast Rounding');
  assert.equal(g.SHEETS.dough.headers[13], 'Batch Rounding');
  assert.equal(g.SHEETS.temps.headers.length, 21);
  assert.equal(g.SHEETS.make.headers.length, 6);
  assert.equal(g.SHEETS.final.headers.length, 6);
  assert.equal(g.SHEETS.eon.headers.length, 7);
  assert.equal(g.SHEETS.peachBible.headers.length, 5);
  // v2·11 derived tabs
  assert.equal(g.SHEETS.doughUse.headers.length, 15);
  assert.equal(g.SHEETS.newBible.headers.length, 5);
  assert.equal(g.SHEETS.newPeachBible.headers.length, 5);
});

test('handleDoughPost writes the Bible + rounding columns (blank for old frontends)', () => {
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
  handleDoughPost({
    date: '4/1/2026', todayForecast: 9000, bible: 'peach',
    forecastRound: 'down', batchRound: 'up'
  });
  handleDoughPost({ date: '4/2/2026', todayForecast: 9000 }); // pre-v2 payload
  assert.equal(appended[0].length, 14);
  assert.equal(appended[0][11], 'peach');
  assert.equal(appended[0][12], 'down');
  assert.equal(appended[0][13], 'up');
  assert.equal(appended[1][11], '');
  assert.equal(appended[1][12], '');
  assert.equal(appended[1][13], '');
});

function fakeGridSheet(rows) {
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
    setFrozenRows() {},
    clearContents() { this.rows = []; }
  };
}

// getRange(...).setBackgrounds support for the highlight assertions —
// records into sheet.bg keyed "row,col" (1-based), null entries deleted.
function withBackgrounds(sheet) {
  sheet.bg = {};
  const orig = sheet.getRange.bind(sheet);
  sheet.getRange = (row, col, numRows, numCols) => {
    const range = orig(row, col, numRows, numCols);
    range.setBackgrounds = (vals) => {
      for (let i = 0; i < (numRows ?? vals.length); i++) {
        for (let j = 0; j < (numCols ?? vals[i].length); j++) {
          const key = `${row + i},${col + j}`;
          if (vals[i][j] == null) delete sheet.bg[key];
          else sheet.bg[key] = vals[i][j];
        }
      }
    };
    return range;
  };
  return sheet;
}

function seedContextFor(byName) {
  const ss = {
    getSheetByName: (n) => byName[n] ?? null,
    insertSheet: (n) => { byName[n] = withBackgrounds(fakeGridSheet([])); return byName[n]; }
  };
  return loadContext(['apps-script/Code.gs'], {
    ContentService: ContentServiceStub,
    Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss }
  });
}

test('seedSheets: creates the Peach tab, appends the added headers, idempotent', () => {
  // a live pre-v2 spreadsheet: 11-column dough tab with data, no Peach tab
  const byName = {
    'Dough Counts': fakeGridSheet([
      g.SHEETS.dough.headers.slice(0, 11),
      ['4/1/2026', 9000, 3000, 6000, 10000, 33, 112, 168, 6, 24, 3]
    ]),
    Temperatures: fakeGridSheet([plain(g.SHEETS.temps.headers)]),
    'Dough Bible': fakeGridSheet([plain(g.SHEETS.bible.headers), [3750, 11, 52, 44, 2]]),
    '2pm Make Amount': fakeGridSheet([plain(g.SHEETS.make.headers)]),
    'Final Dough Amount at 2pm': fakeGridSheet([plain(g.SHEETS.final.headers)]),
    'End of Night Count': fakeGridSheet([plain(g.SHEETS.eon.headers)])
  };
  const ctx2 = seedContextFor(byName);

  evalIn(ctx2, 'seedSheets()');
  const peach = byName['Peach Bible'];
  assert.ok(peach, 'Peach Bible tab created');
  assert.deepEqual(plain(peach.rows[0]), plain(g.SHEETS.peachBible.headers));
  assert.equal(peach.rows.length, 31); // headers + 30 rows
  assert.deepEqual(plain(peach.rows[1]), [3000, 20, 56, 51, 2]);
  assert.equal(byName['Dough Counts'].rows[0][11], 'Bible'); // headers appended
  assert.equal(byName['Dough Counts'].rows[0][12], 'Forecast Rounding');
  assert.equal(byName['Dough Counts'].rows[0][13], 'Batch Rounding');
  assert.equal(byName['Dough Counts'].rows[1][11], undefined); // data untouched
  assert.equal(byName['Dough Counts'].rows[1][12], undefined);

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

test('seedSheets: a v2·6-era 12-column tab gains only the rounding headers', () => {
  // the current production state: Bible column live, rounding columns not
  const byName = {
    'Dough Counts': fakeGridSheet([
      g.SHEETS.dough.headers.slice(0, 12),
      ['4/1/2026', 9000, 3000, 6000, 10000, 33, 112, 168, 6, 24, 3, 'peach']
    ]),
    Temperatures: fakeGridSheet([plain(g.SHEETS.temps.headers)]),
    'Dough Bible': fakeGridSheet([plain(g.SHEETS.bible.headers), [3750, 11, 52, 44, 2]]),
    'Peach Bible': fakeGridSheet([plain(g.SHEETS.peachBible.headers), [3000, 20, 56, 51, 2]]),
    '2pm Make Amount': fakeGridSheet([plain(g.SHEETS.make.headers)]),
    'Final Dough Amount at 2pm': fakeGridSheet([plain(g.SHEETS.final.headers)]),
    'End of Night Count': fakeGridSheet([plain(g.SHEETS.eon.headers)])
  };
  const ctx2 = seedContextFor(byName);

  evalIn(ctx2, 'seedSheets()');
  const dough = byName['Dough Counts'];
  assert.equal(dough.rows[0][11], 'Bible'); // untouched
  assert.equal(dough.rows[0][12], 'Forecast Rounding');
  assert.equal(dough.rows[0][13], 'Batch Rounding');
  assert.equal(dough.rows[1][11], 'peach'); // data untouched
  assert.equal(dough.rows[1][12], undefined);
  assert.equal(dough.rows[1][13], undefined);
});

/* ---------------- Dough Use + new bibles (v2·11) ---------------- */

// A five-night fixture exercising every derivation gate: no prior EON on
// the first night, a v1 zero EON-sales artifact, a missing make row, a
// stamped peach night in June, and a morning past the 7-day reach-back.
function doughUseSpreadsheet() {
  const byName = {
    'Dough Counts': fakeGridSheet([
      plain(g.SHEETS.dough.headers),
      ['6/1/2026', 9000, 2000, 7000, 9000, 20, 100, 80, 5, 24, 3, '', '', ''],
      ['6/2/2026', 9000, 3000, 6000, 9000, 30, 80, 60, 2, '', 3, '', '', ''],
      ['6/3/2026', 9000, 2200, 6800, 9000, 15, 60, 45, 2, 18, 3, '', '', ''],
      ['6/5/2026', 9000, 2500, 6500, 9000, 10, 50, 40, 3, 12, 3, 'peach', '', ''],
      ['7/3/2026', 9000, 4000, 5000, 9000, 12, 55, 42, 2, 15, 3, '', '', '']
    ]),
    'End of Night Count': withBackgrounds(fakeGridSheet([
      plain(g.SHEETS.eon.headers),
      ['6/1/2026', 12000, 25, 90, 70, 4, 30],
      ['6/2/2026', 0, 40, 70, 50, 1, 20], // sales never entered (v1 artifact)
      ['6/3/2026', 13000, 30, 80, 60, 3, 24],
      ['6/9/2026', '', '', '', '', '', ''] // row exists, nothing counted
    ])),
    '2pm Make Amount': withBackgrounds(fakeGridSheet([
      plain(g.SHEETS.make.headers),
      ['6/1/2026', 10, 50, 40, 2, 12],
      ['6/2/2026', 5, 20, 15, 2, 6]
      // no 6/3 make row → its count-only Final must be flagged, not trusted
    ])),
    'Final Dough Amount at 2pm': fakeGridSheet([
      plain(g.SHEETS.final.headers),
      ['6/1/2026', 30, 150, 120, 7, 36],
      ['6/2/2026', 35, 100, 75, 4, 26],
      ['6/3/2026', 15, 60, 45, 2, 18]
    ]),
    Temperatures: fakeGridSheet([plain(g.SHEETS.temps.headers)]),
    'Dough Bible': fakeGridSheet([plain(g.SHEETS.bible.headers), [3750, 11, 52, 44, 2]]),
    'Peach Bible': fakeGridSheet([plain(g.SHEETS.peachBible.headers), [3000, 20, 56, 51, 2]])
  };
  return { byName, ctx: seedContextFor(byName) };
}

test('rebuildDoughUse: AM/PM derivation with every gate', () => {
  const { byName, ctx: ctx2 } = doughUseSpreadsheet();
  evalIn(ctx2, 'rebuildDoughUse()');
  const rows = byName['Dough Use'].rows;
  assert.deepEqual(plain(rows[0]), plain(g.SHEETS.doughUse.headers));
  assert.equal(rows.length, 6); // header + 5 dates
  // 6/1: no prior EON → AM blank; PM = Final − EON, sales 12000 − 2000.
  assert.deepEqual(plain(rows[1]), ['6/1/2026', 'regular', '', 2000,
    '', '', '', '', '', 10000, 5, 60, 50, 3, 6]);
  // 6/2: AM vs last night (negative indi kept raw, blank boil propagates);
  // PM computed but EON sales 0 → no sales pairing.
  assert.deepEqual(plain(rows[2]), ['6/2/2026', 'regular', '6/1/2026', 3000,
    -5, 10, 10, 2, '', '', -5, 30, 25, 3, 6]);
  // 6/3: AM fine; PM computes even without a make row ("all the math"),
  // negative across the board because the Final row is count-only.
  assert.deepEqual(plain(rows[3]), ['6/3/2026', 'regular', '6/2/2026', 2200,
    25, 10, 5, -1, 2, 10800, -15, -20, -15, -1, -6]);
  // 6/5: stamped peach in June — the label carries; prev reaches back 2 days.
  assert.deepEqual(plain(rows[4]), ['6/5/2026', 'peach', '6/3/2026', 2500,
    20, 30, 20, 0, 12, '', '', '', '', '', '']);
  // 7/3: month rule → peach; nearest EON is 30 days back → AM blank too.
  assert.deepEqual(plain(rows[5]), ['7/3/2026', 'peach', '', 4000,
    '', '', '', '', '', '', '', '', '', '', '']);
});

test('rebuildDoughUse: new bibles fit only sales-paired, non-negative observations', () => {
  const { byName, ctx: ctx2 } = doughUseSpreadsheet();
  evalIn(ctx2, 'rebuildDoughUse()');
  const nb = byName['New Dough Bible'].rows;
  assert.deepEqual(plain(nb[0]).slice(0, 5), plain(g.SHEETS.newBible.headers));
  assert.equal(nb.length, 69); // header + 68 tiers
  assert.equal(nb[1][0], 2000);
  assert.equal(nb[2][0], 2300);
  assert.equal(nb[67][0], 21800);
  assert.equal(nb[68][0], 22000); // exact endpoint, final step $200
  // Regular observations: small/large get 3 points (6/1 PM + 6/2 AM + 6/3 AM);
  // indi loses one to the −5 negative and sic to the −1 → 2 points → blank.
  // 6/3's PM values never enter the fits — no make row behind the Final.
  assert.equal(nb[1][1], ''); // indi under 3 observations
  assert.equal(nb[1][4], ''); // sic under 3 observations
  assert.equal(nb[1][2], 9); // small robust fit at $2,000
  assert.equal(nb[68][2], 137); // small robust fit at $22,000
  assert.equal(nb[1][3], 4); // large robust fit at $2,000
  assert.equal(nb[68][3], 119); // large robust fit at $22,000
  // Peach has a single morning (6/5) → every column blank, grid still full.
  const pb = byName['New Peach Bible'].rows;
  assert.equal(pb.length, 69);
  assert.equal(pb[1][0], 2000);
  for (const col of [1, 2, 3, 4]) assert.equal(pb[1][col], '', 'peach col ' + col);
  // The note cell marks the thin data.
  assert.match(String(byName['New Peach Bible'].rows[0][6] ?? ''), /1 mornings \+ 0 evenings/);
});

test('rebuildDoughUse: rerunning is a clean rewrite (idempotent)', () => {
  const { byName, ctx: ctx2 } = doughUseSpreadsheet();
  evalIn(ctx2, 'rebuildDoughUse()');
  const snapshot = (name) => JSON.stringify(plain(byName[name].rows).map((r) => r.slice(0, 5)));
  const first = ['Dough Use', 'New Dough Bible', 'New Peach Bible'].map(snapshot);
  evalIn(ctx2, 'rebuildDoughUse()');
  const second = ['Dough Use', 'New Dough Bible', 'New Peach Bible'].map(snapshot);
  assert.deepEqual(second, first);
  assert.equal(byName['Dough Use'].rows.length, 6); // rewritten, not appended
});

test('fitLine (robust median): exact line, outlier resistance, clamps, guards', () => {
  const ctx2 = seedContextFor({});
  const fit = (pts) => plain(evalIn(ctx2, `fitLine(${JSON.stringify(pts)})`));
  assert.deepEqual(fit([[1000, 20], [2000, 30], [3000, 40]]), { a: 10, b: 0.01 });
  assert.deepEqual(fit([[1000, 50], [2000, 40], [3000, 30]]), { a: 40, b: 0 }); // never negative slope
  // One wild night doesn't bend the line — the median slope holds 0.01.
  assert.deepEqual(fit([[1000, 10], [2000, 20], [3000, 30], [4000, 40], [5000, 500]]), { a: 0, b: 0.01 });
  assert.equal(fit([[1, 1], [2, 2]]), null); // under 3 observations
  assert.equal(fit([[5, 1], [5, 2], [5, 3]]), null); // no sales spread
  const tiers = plain(evalIn(ctx2, 'newBibleTiers()'));
  assert.equal(tiers.length, 68);
  assert.equal(tiers[1] - tiers[0], 300);
});

test('rebuildDoughUse: red flags land on suspect values and the exact missing source cells', () => {
  const { byName, ctx: ctx2 } = doughUseSpreadsheet();
  evalIn(ctx2, 'rebuildDoughUse()');
  const RED = '#f4c7c3';
  const du = byName['Dough Use'];
  // Dough Use: negative AM indi on 6/2 (row 3, col E=5) and the whole
  // untrusted 6/3 PM block (row 4, cols K–O = 11..15); clean cells stay bare.
  assert.equal(du.bg['3,5'], RED);
  for (const col of [11, 12, 13, 14, 15]) assert.equal(du.bg[`4,${col}`], RED);
  assert.equal(du.bg['2,10'], undefined); // 6/1 PM sales — fine
  assert.equal(du.bg['3,4'], undefined); // 6/2 AM sales — fine
  // EON tab: 6/2's zero sales cell flags (row 3, col B); 6/5 + 7/3 get stub
  // rows with sales + all five counts red; 6/1 stays clean.
  const eon = byName['End of Night Count'];
  assert.equal(eon.bg['3,2'], RED);
  assert.equal(plain(eon.rows[5][0]), '6/5/2026'); // stub appended
  assert.equal(plain(eon.rows[6][0]), '7/3/2026');
  for (const col of [2, 3, 4, 5, 6, 7]) {
    assert.equal(eon.bg[`6,${col}`], RED, `6/5 stub col ${col}`);
    assert.equal(eon.bg[`7,${col}`], RED, `7/3 stub col ${col}`);
  }
  assert.equal(eon.bg['2,2'], undefined); // 6/1 sales present
  // Make tab: 6/3 (EON counts, no make) gets a stub with all five size
  // cells red; nights without EON counts are not make-flagged yet.
  const make = byName['2pm Make Amount'];
  assert.equal(plain(make.rows[3][0]), '6/3/2026');
  for (const col of [2, 3, 4, 5, 6]) assert.equal(make.bg[`4,${col}`], RED, `make col ${col}`);
  assert.equal(Object.keys(make.bg).some((k) => k.startsWith('2,')), false); // 6/1 clean
  // Rerun: stubs are not duplicated, resolved flags would clear (full reset).
  evalIn(ctx2, 'rebuildDoughUse()');
  assert.equal(eon.rows.length, 7); // header + 4 original + 2 stubs, unchanged
  assert.equal(make.rows.length, 4);
});

test('onOpen registers the rebuild menu', () => {
  const calls = [];
  const menu = {
    addItem(label, fn) { calls.push(['addItem', label, fn]); return this; },
    addToUi() { calls.push(['addToUi']); }
  };
  const ctx2 = loadContext(['apps-script/Code.gs'], {
    ContentService: ContentServiceStub,
    SpreadsheetApp: {
      getUi: () => ({ createMenu(name) { calls.push(['createMenu', name]); return menu; } })
    }
  });
  evalIn(ctx2, 'onOpen()');
  assert.deepEqual(plain(calls), [
    ['createMenu', '\ud83c\udf55 Dough Tracker'],
    ['addItem', 'Rebuild Dough Use + New Bibles', 'rebuildDoughUse'],
    ['addToUi']
  ]);
});

test('seedSheets creates the v2·11 derived tabs with headers', () => {
  const byName = {};
  const ctx2 = seedContextFor(byName);
  evalIn(ctx2, 'seedSheets()');
  for (const key of ['doughUse', 'newBible', 'newPeachBible']) {
    const name = plain(evalIn(ctx2, `SHEETS.${key}.name`));
    assert.ok(byName[name], name + ' created');
    assert.deepEqual(plain(byName[name].rows[0]), plain(evalIn(ctx2, `SHEETS.${key}.headers`)));
  }
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
