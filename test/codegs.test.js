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

// Minimal stand-ins so formatDate (now timezone-aware) runs in the vm. The
// spreadsheet timezone is fixed to Mountain (the shop's zone) so date-cell
// formatting is deterministic regardless of the CI process timezone.
const UtilitiesStub = {
  formatDate(d, tz /* fmt is always "M/d/yyyy" here */) {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(d).reduce((o, part) => (o[part.type] = part.value, o), {});
    return `${Number(p.month)}/${Number(p.day)}/${p.year}`;
  },
};
const SpreadsheetAppTzStub = {
  getActiveSpreadsheet: () => ({ getSpreadsheetTimeZone: () => 'America/Denver' }),
};

const gs = loadContext(['apps-script/Code.gs'], {
  ContentService: ContentServiceStub,
  Utilities: UtilitiesStub,
  SpreadsheetApp: SpreadsheetAppTzStub,
});
const g = getRefs(gs, [
  'SHEETS', 'BIBLE_DATA', 'PEACH_BIBLE_DATA', 'formatDate', 'normalizeDate',
  'hasNegative', 'handleDoughPost', 'handleEonPost', 'handleMakePost'
]);

function responseOf(output) {
  return JSON.parse(output.body);
}

test('formatDate: Date cell renders as M/D/YYYY in the spreadsheet timezone', () => {
  // A date-only cell reads as midnight in the sheet's tz. Midnight Mountain
  // for 4/1 is 06:00 UTC — build that instant and confirm it renders 4/1.
  assert.equal(evalIn(gs, 'formatDate(new Date(Date.UTC(2026, 3, 1, 6)))'), '4/1/2026');
  assert.equal(g.formatDate('4/1/2026'), '4/1/2026');
  // The whole point of the tz fix: an instant that is a different calendar
  // day in UTC (03:00 UTC 7/16 = 21:00 Mountain 7/15) must render as the
  // Mountain day, not the UTC day — otherwise findRowByDate misses the row.
  assert.equal(evalIn(gs, 'formatDate(new Date(Date.UTC(2026, 6, 16, 3)))'), '7/15/2026');
});

test('normalizeDate: canonicalizes slash, ISO, and 2-digit-year cells', () => {
  assert.equal(g.normalizeDate('04/01/2026'), '4/1/2026');
  assert.equal(g.normalizeDate('4/1/2026'), '4/1/2026');
  assert.equal(g.normalizeDate('2026-07-04'), '7/4/2026'); // ISO
  assert.equal(g.normalizeDate('2026-7-4'), '7/4/2026');   // ISO, no leading zeros
  assert.equal(g.normalizeDate('7/4/26'), '7/4/2026');     // 2-digit year
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
  assert.equal(g.SHEETS.doughUse.headers.length, 16); // + PM Make OK trust flag
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
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => (n === 'Dough Counts' ? fakeSheet : null) }) }
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
        },
        setFormulas(vals) { this.setValues(vals); },
        setFormula(f) { this.setValues([[f]]); },
        setNumberFormat() {}
      };
    },
    appendRow(r) { this.rows.push(r); },
    getLastRow() { return this.rows.length; },
    setFrozenRows() {},
    clearContents() { this.rows = []; },
    setConditionalFormatRules(rules) { this.cfRules = rules; }
  };
}

// Recording stub for SpreadsheetApp.newConditionalFormatRule().
function fakeCfBuilder() {
  const rule = {};
  return {
    whenFormulaSatisfied(f) { rule.formula = f; return this; },
    setBackground(c) { rule.color = c; return this; },
    setRanges(r) { rule.ranges = r; return this; },
    build() { return rule; }
  };
}


function seedContextFor(byName) {
  const ss = {
    getSheetByName: (n) => byName[n] ?? null,
    insertSheet: (n) => { byName[n] = fakeGridSheet([]); return byName[n]; }
  };
  return loadContext(['apps-script/Code.gs'], {
    ContentService: ContentServiceStub,
    Logger: { log() {} },
    console: { error() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      newConditionalFormatRule: fakeCfBuilder
    }
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
    'End of Night Count': fakeGridSheet([
      plain(g.SHEETS.eon.headers),
      ['6/1/2026', 12000, 25, 90, 70, 4, 30],
      ['6/2/2026', 0, 40, 70, 50, 1, 20], // sales never entered (v1 artifact)
      ['6/3/2026', 13000, 30, 80, 60, 3, 24],
      ['6/9/2026', '', '', '', '', '', ''] // row exists, nothing counted
    ]),
    '2pm Make Amount': fakeGridSheet([
      plain(g.SHEETS.make.headers),
      ['6/1/2026', 10, 50, 40, 2, 12],
      ['6/2/2026', 5, 20, 15, 2, 6]
      // no 6/3 make row → its count-only Final must be flagged, not trusted
    ]),
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

test('rebuildDoughUse: one live formula row per date', () => {
  const { byName, ctx: ctx2 } = doughUseSpreadsheet();
  evalIn(ctx2, 'rebuildDoughUse()');
  const du = byName['Dough Use'];
  assert.equal(du.rows.length, 6); // header + 5 dates, chronological
  assert.deepEqual(plain(du.rows.slice(1).map((r) => r[0])),
    ['6/1/2026', '6/2/2026', '6/3/2026', '6/5/2026', '7/3/2026']);
  const row2 = plain(du.rows[1]);
  assert.equal(row2.length, 16);
  assert.match(row2[1], /MONTH\(\$A2\)=7/); // bible: stamped cell else month rule
  assert.match(row2[2], /MAXIFS\('End of Night Count'!\$A:\$A/); // prev count
  assert.match(row2[2], /">="&\$A2-7/); // 7-day reach-back window
  assert.match(row2[4], /'End of Night Count'!\$C:\$C/); // AM indi: prev EON count
  assert.match(row2[4], /'Dough Counts'!\$F:\$F/); // AM indi: today's 2 PM count
  assert.match(row2[9], /IF\(OR\(e="",e<=0,c="",e<c\)/); // PM sales guards
  assert.match(row2[10], /'Final Dough Amount at 2pm'!\$B:\$B/); // PM indi
  assert.match(row2[15], /'2pm Make Amount'!\$B:\$F/); // make-backed trust flag
  assert.match(plain(du.rows[2])[1], /\$A3/); // row anchors thread through
});

test('buildNewBibleTab: tier grid wired to live per-size fit helpers', () => {
  const { byName, ctx: ctx2 } = doughUseSpreadsheet();
  evalIn(ctx2, 'rebuildDoughUse()');
  const nb = byName['New Dough Bible'];
  assert.equal(nb.rows.length, 69); // header + 68 tiers
  assert.equal(nb.rows[1][0], 2000);
  assert.equal(nb.rows[2][0], 2300);
  assert.equal(nb.rows[67][0], 21800);
  assert.equal(nb.rows[68][0], 22000); // exact endpoint, final step $200
  const indiTier = plain(nb.rows[1])[1];
  // The OR's second arm mirrors fitLine's zero-sales-spread null: n ≥ 3 can
  // still spill a blank fit, and arithmetic on that "" would be #VALUE!.
  assert.match(indiTier, /IF\(OR\(\$H\$2<3,\$I\$2=""\),"",MAX\(0,ROUND\(\$I\$2\+\$J\$2\*\$A2\)\)\)/);
  assert.match(plain(nb.rows[1])[4], /\$H\$5/); // sic reads helper row 5
  const helper = plain(nb.rows[1])[7]; // H2 — the spilling {n, a, b} fit
  assert.match(helper, /MAKEARRAY\(n,n/);
  assert.match(helper, /MEDIAN\(sl\)/);
  assert.match(helper, /l="regular"/);
  assert.match(helper, /'Dough Use'!\$P\$2:\$P/); // PM rows need a make behind them
  assert.match(plain(byName['New Peach Bible'].rows[1])[7], /l="peach"/);
});

test('rebuildDoughUse: dated stubs appear once; rerun rewrites in place', () => {
  const { byName, ctx: ctx2 } = doughUseSpreadsheet();
  evalIn(ctx2, 'rebuildDoughUse()');
  const eon = byName['End of Night Count'];
  const make = byName['2pm Make Amount'];
  assert.equal(plain(eon.rows[5][0]), '6/5/2026'); // dough date with no EON row
  assert.equal(plain(eon.rows[6][0]), '7/3/2026');
  assert.equal(eon.rows.length, 7);
  assert.equal(plain(make.rows[3][0]), '6/3/2026'); // EON counts but no make data
  assert.equal(make.rows.length, 4);
  evalIn(ctx2, 'rebuildDoughUse()');
  assert.equal(eon.rows.length, 7); // stubs never duplicate
  assert.equal(make.rows.length, 4);
  assert.equal(byName['Dough Use'].rows.length, 6); // rewritten, not appended
});

test('installLiveFlags: red conditional-format rules on all three tabs', () => {
  const { byName, ctx: ctx2 } = doughUseSpreadsheet();
  evalIn(ctx2, 'rebuildDoughUse()');
  const du = byName['Dough Use'];
  const eon = byName['End of Night Count'];
  const make = byName['2pm Make Amount'];
  assert.equal(du.cfRules.length, 2);
  assert.match(plain(du.cfRules[0].formula), /ISNUMBER\(E2\),E2<0/); // negative AM
  assert.match(plain(du.cfRules[1].formula), /OR\(K2<0,\$P2=FALSE\)/); // negative or untrusted PM
  assert.equal(plain(du.cfRules[0].color), '#f4c7c3');
  assert.equal(eon.cfRules.length, 2);
  assert.match(plain(eon.cfRules[0].formula), /INDIRECT\("'Dough Counts'!\$A:\$A"\)/);
  assert.match(plain(eon.cfRules[0].formula), /N\(\$B2\)<=0/); // missing or zero sales
  assert.match(plain(eon.cfRules[1].formula), /C2=""/); // missing count cells
  assert.equal(make.cfRules.length, 1);
  assert.match(plain(make.cfRules[0].formula), /'End of Night Count'!\$C:\$G/);
});

test('every generated formula is balanced and well-formed', () => {
  // Sheets formulas can't execute in CI — at minimum they must parse.
  const ctx2 = seedContextFor({});
  const check = (f, tag) => {
    assert.match(f, /^=/, tag);
    assert.equal((f.match(/\(/g) || []).length, (f.match(/\)/g) || []).length, tag + ' parens');
    assert.equal((f.match(/"/g) || []).length % 2, 0, tag + ' quotes');
  };
  plain(evalIn(ctx2, 'doughUseRowFormulas(7)')).forEach((f, i) => check(f, 'dough use col ' + i));
  check(plain(evalIn(ctx2, 'fitSpillFormula("regular", "E", "K")')), 'regular fit');
  check(plain(evalIn(ctx2, 'fitSpillFormula("peach", "H", "N")')), 'peach fit');
});

test('handleDoughPost keeps Dough Use current without the button', () => {
  const { byName, ctx: ctx2 } = doughUseSpreadsheet();
  evalIn(ctx2, 'rebuildDoughUse()'); // seeds the tab
  const { handleDoughPost } = getRefs(ctx2, ['handleDoughPost']);
  handleDoughPost({ date: '7/4/2026', todayForecast: 9000 });
  const du = byName['Dough Use'];
  assert.equal(du.rows.length, 7);
  assert.equal(plain(du.rows[6])[0], '7/4/2026');
  assert.match(plain(du.rows[6])[1], /\$A7/); // formulas anchored to its own row
  handleDoughPost({ date: '7/4/2026', todayForecast: 9500 });
  assert.equal(du.rows.length, 7); // upsert, not append
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
