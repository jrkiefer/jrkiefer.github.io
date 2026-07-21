// Sheet config — single source of truth for tab names + headers.
// To add a new captured-data type later: add an entry here, route it from doPost.
var SHEETS = {
  dough: {
    name: "Dough Counts",
    headers: ["Date","Today's Forecast","Current Sales","Sales Left","Tomorrow's Forecast",
              "Indi Count","Small Count","Large Count","Sic Count","Boil Count","Batches",
              "Bible","Forecast Rounding","Batch Rounding"]
  },
  temps: {
    name: "Temperatures",
    headers: ["Date","Water 1","Dough 1","Water 2","Dough 2","Water 3","Dough 3",
              "Water 4","Dough 4","Water 5","Dough 5","Water 6","Dough 6",
              "Water 7","Dough 7","Water 8","Dough 8","Water 9","Dough 9",
              "Water 10","Dough 10"]
  },
  bible: {
    name: "Dough Bible",
    headers: ["Threshold","Indi","Small","Large","Sicilian"]
  },
  peachBible: {
    name: "Peach Bible",
    headers: ["Threshold","Indi","Small","Large","Sicilian"]
  },
  make: {
    name: "2pm Make Amount",
    headers: ["Date","Indi","Small","Large","Sicilian","Boil"]
  },
  final: {
    name: "Final Dough Amount at 2pm",
    headers: ["Date","Indi","Small","Large","Sicilian","Boil"]
  },
  eon: {
    name: "End of Night Count",
    headers: ["Date","EON Sales",
              "EON Indi Count","EON Small Count","EON Large Count","EON Sic Count","EON Boil Count"]
  },
  // v2·11 derived tabs — rebuilt wholesale by rebuildDoughUse(), never
  // written by the app. Reference/analysis only, safe to wipe and refill.
  doughUse: {
    name: "Dough Use",
    headers: ["Date","Bible","Prev Count","AM Sales",
              "AM Indi","AM Small","AM Large","AM Sic","AM Boil",
              "PM Sales","PM Indi","PM Small","PM Large","PM Sic","PM Boil",
              "PM Make OK"]
  },
  newBible: {
    name: "New Dough Bible",
    headers: ["Sales","Indi","Small","Large","Sicilian"]
  },
  newPeachBible: {
    name: "New Peach Bible",
    headers: ["Sales","Indi","Small","Large","Sicilian"]
  }
};

// Mirror of BIBLES.regular.rows in js/config.js. Update both together —
// npm test enforces the sync.
var BIBLE_DATA = [
  [3750,  11, 52,  44,  2],
  [4000,  12, 58,  50,  2],
  [4400,  13, 63,  56,  2],
  [4800,  14, 69,  62,  2],
  [5200,  15, 74,  65,  2],
  [5700,  17, 81,  72,  2],
  [6300,  18, 88,  79,  2],
  [6800,  20, 94,  87,  3],
  [7200,  21, 101, 94,  3],
  [7800,  22, 108, 99,  3],
  [8300,  24, 115, 106, 3],
  [9100,  26, 125, 117, 3],
  [10000, 28, 136, 126, 4],
  [10700, 30, 146, 137, 4],
  [11500, 32, 156, 148, 4],
  [12250, 34, 166, 159, 4],
  [13000, 37, 177, 166, 5],
  [13900, 39, 187, 177, 5],
  [14750, 41, 197, 188, 5],
  [15500, 43, 206, 195, 5],
  [16250, 44, 214, 205, 6],
  [17000, 44, 225, 216, 6],
  [17750, 44, 235, 225, 6],
  [18500, 44, 246, 237, 6],
  [19250, 44, 255, 247, 6],
  [20000, 44, 266, 256, 7],
  [20750, 44, 276, 267, 7]
];

// Mirror of BIBLES.peach.rows in js/config.js (Peach Dough Bible 2024,
// auto-default July 1 – Aug 31). Update both together — npm test enforces
// the sync. Reference only, like the Dough Bible tab.
var PEACH_BIBLE_DATA = [
  [3000,  20, 56,  51,  2],
  [3500,  20, 66,  61,  2],
  [4000,  21, 75,  66,  3],
  [4500,  21, 85,  70,  3],
  [5000,  22, 96,  74,  3],
  [5500,  22, 106, 82,  3],
  [6000,  24, 115, 91,  3],
  [6500,  25, 124, 97,  3],
  [7000,  26, 132, 103, 3],
  [7500,  27, 141, 109, 3],
  [8000,  28, 151, 114, 4],
  [8500,  28, 160, 120, 4],
  [9000,  29, 170, 127, 4],
  [9500,  29, 179, 133, 4],
  [10000, 30, 188, 137, 4],
  [10500, 30, 197, 140, 4],
  [11000, 31, 204, 145, 5],
  [11500, 31, 211, 150, 5],
  [12000, 32, 218, 155, 5],
  [12500, 32, 226, 159, 6],
  [13000, 33, 234, 162, 6],
  [13500, 33, 243, 164, 6],
  [14000, 34, 253, 166, 6],
  [14500, 34, 262, 168, 6],
  [15000, 35, 271, 169, 6],
  [15500, 35, 281, 171, 6],
  [16000, 36, 290, 173, 6],
  [16500, 36, 300, 175, 6],
  [17000, 37, 309, 177, 6],
  [17500, 37, 318, 179, 6]
];

function getSheet(key) {
  var cfg = SHEETS[key];
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.name);
  if (!sheet) {
    throw new Error("Sheet '" + cfg.name + "' missing — run seedSheets() from the Apps Script editor");
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Cache the spreadsheet's timezone — formatDate runs once per row in
// findRowByDate, and the value never changes within a request.
var __ssTz = null;
function ssTimeZone() {
  if (!__ssTz) __ssTz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return __ssTz;
}

function formatDate(d) {
  if (d instanceof Date) {
    // Format in the SPREADSHEET's timezone, not the script project's. When
    // the two differ, a date-only cell (stored as midnight in the sheet's
    // tz) renders as the previous/next day under getDate() — the classic
    // Apps Script off-by-one — so findRowByDate misses an otherwise-present
    // row, getByDate returns not_found, and a force-Load looks dead on the
    // phone. Formatting in the sheet's own tz matches what the user sees.
    return Utilities.formatDate(d, ssTimeZone(), "M/d/yyyy");
  }
  return String(d).trim();
}

function normalizeDate(dateStr) {
  var s = String(dateStr).trim();
  // ISO "2026-07-04" (hand-typed / pasted cells) → "7/4/2026"
  var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return parseInt(iso[2], 10) + "/" + parseInt(iso[3], 10) + "/" + parseInt(iso[1], 10);
  }
  // "4/1/2026" / "04/01/2026", plus 2-digit years ("7/4/26" → "7/4/2026")
  var parts = s.split("/");
  if (parts.length === 3) {
    var y = parseInt(parts[2], 10);
    if (y < 100) y += 2000;
    return parseInt(parts[0], 10) + "/" + parseInt(parts[1], 10) + "/" + y;
  }
  return s;
}

function hasNegative(values) {
  for (var i = 0; i < values.length; i++) {
    if ((Number(values[i]) || 0) < 0) return true;
  }
  return false;
}

function findRowByDate(sheet, targetDate) {
  var allData = sheet.getDataRange().getValues();
  var normalized = normalizeDate(targetDate);
  for (var i = allData.length - 1; i >= 1; i--) {
    var rowDate = formatDate(allData[i][0]);
    if (normalizeDate(rowDate) === normalized) {
      return i + 1; // 1-indexed sheet row
    }
  }
  return -1;
}

function readRowAsObject(sheet, rowNumber) {
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];
  var rowData = allData[rowNumber - 1];
  var result = {};
  for (var j = 0; j < headers.length; j++) {
    result[headers[j]] = rowData[j];
  }
  return result;
}

function doPost(e) {
  var raw = e.postData.contents || e.postData.getDataAsString();
  var data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return jsonResponse({status: "error", message: "Invalid JSON body"});
  }
  var type = data.type || "dough";

  // One write at a time. Every handler upserts via findRowByDate-then-append;
  // without the lock, two concurrent saves for the same date (two phones, or
  // a keepalive flush racing the boot retry) can both miss the lookup and
  // both append, duplicating the date's row.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (type === "temps") {
      return handleTempsPost(data);
    }
    if (type === "make") {
      return handleMakePost(data);
    }
    if (type === "eon") {
      return handleEonPost(data);
    }
    if (type === "dough") {
      return handleDoughPost(data);
    }
    return jsonResponse({status: "error", message: "Unknown type: " + type});
  } finally {
    lock.releaseLock();
  }
}

function handleDoughPost(data) {
  if (!data.date) {
    return jsonResponse({status: "error", message: "Missing date"});
  }
  var hasDough = (Number(data.indiCount) || 0) > 0 ||
                 (Number(data.smallCount) || 0) > 0 ||
                 (Number(data.largeCount) || 0) > 0 ||
                 (Number(data.sicCount) || 0) > 0 ||
                 (Number(data.boilCount) || 0) > 0;
  var hasForecast = (Number(data.todayForecast) || 0) > 0 ||
                    (Number(data.tomorrowForecast) || 0) > 0;
  if (!hasDough && !hasForecast) {
    return jsonResponse({status: "error", message: "Empty save rejected — no dough counts or forecast"});
  }
  // salesLeft is derived and legitimately negative when sales exceed forecast,
  // so it's deliberately excluded from this check.
  if (hasNegative([data.indiCount, data.smallCount, data.largeCount, data.sicCount,
                   data.boilCount, data.todayForecast, data.tomorrowForecast,
                   data.currentSales, data.batches])) {
    return jsonResponse({status: "error", message: "Negative values rejected"});
  }

  var sheet = getSheet("dough");
  var rowData = [
    data.date, data.todayForecast, data.currentSales, data.salesLeft,
    data.tomorrowForecast, data.indiCount, data.smallCount,
    data.largeCount, data.sicCount, data.boilCount, data.batches,
    data.bible || "",         // 'regular' / 'peach'; older frontends send nothing
    data.forecastRound || "", // raw 'up' / 'down'; blank = auto
    data.batchRound || ""
  ];

  var existingRow = findRowByDate(sheet, data.date);
  var action;
  var resultRow;
  if (existingRow !== -1) {
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    action = "updated";
    resultRow = existingRow;
  } else {
    sheet.appendRow(rowData);
    action = "created";
    resultRow = sheet.getLastRow();
  }

  // Best-effort writes to the auxiliary tabs. Failures here don't break the
  // primary Dough Counts save.
  try { upsertSizeRow("make", data.date, data.makes); }   catch (e) { console.error("upsert make failed:", e); }
  try { upsertSizeRow("final", data.date, data.finals); } catch (e) { console.error("upsert final failed:", e); }
  try { upsertDoughUseRow(data.date); }                   catch (e) { console.error("upsert dough use failed:", e); }

  return jsonResponse({status: "ok", action: action, row: resultRow, date: data.date});
}

function upsertSizeRow(sheetKey, date, sizes) {
  if (!sizes) return;
  var sheet = getSheet(sheetKey);
  // Dough is never made (or held) in negative amounts — clamp so rows from
  // older frontends can't write negatives either.
  var rowData = [
    date,
    Math.max(0, Number(sizes.indi)  || 0),
    Math.max(0, Number(sizes.small) || 0),
    Math.max(0, Number(sizes.large) || 0),
    Math.max(0, Number(sizes.sic)   || 0),
    Math.max(0, Number(sizes.boil)  || 0)
  ];
  var row = findRowByDate(sheet, date);
  if (row !== -1) {
    sheet.getRange(row, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

// End-of-night save. Captures the day's final-sales total and a fresh dough
// count taken at close. Independent of the morning Dough Counts row — the
// EON tab keeps one row per date with EON-prefixed columns so the merged GET
// response can carry both records side by side.
function handleEonPost(data) {
  if (!data.date) {
    return jsonResponse({status: "error", message: "Missing date"});
  }
  var hasCount = (Number(data.indiCount)  || 0) > 0 ||
                 (Number(data.smallCount) || 0) > 0 ||
                 (Number(data.largeCount) || 0) > 0 ||
                 (Number(data.sicCount)   || 0) > 0 ||
                 (Number(data.boilCount)  || 0) > 0;
  var hasSales = (Number(data.eonSales) || 0) > 0;
  if (!hasCount && !hasSales) {
    return jsonResponse({status: "error", message: "Empty save rejected — no EON sales or counts"});
  }
  if (hasNegative([data.eonSales, data.indiCount, data.smallCount,
                   data.largeCount, data.sicCount, data.boilCount])) {
    return jsonResponse({status: "error", message: "Negative values rejected"});
  }

  var sheet = getSheet("eon");
  var rowData = [
    data.date, data.eonSales,
    data.indiCount, data.smallCount, data.largeCount, data.sicCount, data.boilCount
  ];

  var existingRow = findRowByDate(sheet, data.date);
  var action;
  var resultRow;
  if (existingRow !== -1) {
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    action = "eon_updated";
    resultRow = existingRow;
  } else {
    sheet.appendRow(rowData);
    action = "eon_created";
    resultRow = sheet.getLastRow();
  }

  // Echo tomorrow's forecast from the matching Dough Counts row so the frontend
  // can render the EON outlook without a second round trip. Null when no 2 PM
  // save exists for this date — frontend handles that branch.
  var tomorrowForecast = null;
  try {
    var doughSheet = getSheet("dough");
    var doughRow = findRowByDate(doughSheet, data.date);
    if (doughRow !== -1) {
      var doughObj = readRowAsObject(doughSheet, doughRow);
      var raw = Number(doughObj["Tomorrow's Forecast"]);
      tomorrowForecast = isNaN(raw) ? null : raw;
    }
  } catch (e) {
    console.error("lookup tomorrowForecast failed:", e);
  }

  return jsonResponse({status: "ok", action: action, row: resultRow, date: data.date, tomorrowForecast: tomorrowForecast});
}

// Manager-entered actual make corrections. Overwrites the 2pm Make Amount row
// (from the original calculated values) and recomputes the matching Final
// Dough Amount at 2pm row using the existing Dough Counts row's counts.
// Requires a Dough Counts row to already exist for this date.
function handleMakePost(data) {
  if (!data.date) {
    return jsonResponse({status: "error", message: "Missing date"});
  }
  if (!data.makes) {
    return jsonResponse({status: "error", message: "Missing makes"});
  }
  if (hasNegative([data.makes.indi, data.makes.small, data.makes.large,
                   data.makes.sic, data.makes.boil])) {
    return jsonResponse({status: "error", message: "Negative values rejected"});
  }

  var doughSheet = getSheet("dough");
  var doughRow = findRowByDate(doughSheet, data.date);
  if (doughRow === -1) {
    return jsonResponse({status: "error", message: "No dough count saved for " + data.date + " — save count first"});
  }

  var doughObj = readRowAsObject(doughSheet, doughRow);
  var counts = {
    indi:  Number(doughObj["Indi Count"])  || 0,
    small: Number(doughObj["Small Count"]) || 0,
    large: Number(doughObj["Large Count"]) || 0,
    sic:   Number(doughObj["Sic Count"])   || 0,
    boil:  Number(doughObj["Boil Count"])  || 0
  };
  var makes = {
    indi:  Number(data.makes.indi)  || 0,
    small: Number(data.makes.small) || 0,
    large: Number(data.makes.large) || 0,
    sic:   Number(data.makes.sic)   || 0,
    boil:  Number(data.makes.boil)  || 0
  };
  var finals = {
    indi:  counts.indi  + makes.indi,
    small: counts.small + makes.small,
    large: counts.large + makes.large,
    sic:   counts.sic   + makes.sic,
    boil:  counts.boil  + makes.boil
  };

  upsertSizeRow("make",  data.date, makes);
  upsertSizeRow("final", data.date, finals);

  var makeRow = findRowByDate(getSheet("make"), data.date);
  return jsonResponse({status: "ok", action: "make_saved", row: makeRow, date: data.date});
}

function handleTempsPost(data) {
  if (!data.date) {
    return jsonResponse({status: "error", message: "Missing date"});
  }
  if (!data.temps || !data.temps.length) {
    return jsonResponse({status: "ok", action: "temps_noop", date: data.date});
  }

  // Full-row upsert, one write. Header layout: A=Date, B=Water 1, C=Dough 1,
  // D=Water 2, ... Cells beyond the payload are written blank so a shorter
  // re-save can't leave stale batches behind (one row per date, like every
  // other tab).
  var pairs = (SHEETS.temps.headers.length - 1) / 2;
  var rowData = [data.date];
  for (var j = 0; j < pairs; j++) {
    var t = data.temps[j];
    rowData.push(t && t.water != null ? t.water : "",
                 t && t.dough != null ? t.dough : "");
  }

  var sheet = getSheet("temps");
  var row = findRowByDate(sheet, data.date);
  if (row !== -1) {
    sheet.getRange(row, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
    row = sheet.getLastRow();
  }
  return jsonResponse({status: "ok", action: "temps_saved", row: row, date: data.date});
}

function doGet(e) {
  if (e.parameter.date) {
    return getByDate(e.parameter.date);
  }
  return getRecentDough();
}

function getByDate(date) {
  var dough = getSheet("dough");
  var temps = getSheet("temps");
  var eon   = getSheet("eon");
  var doughRow = findRowByDate(dough, date);
  var tempsRow = findRowByDate(temps, date);
  var eonRow   = findRowByDate(eon, date);

  if (doughRow === -1 && tempsRow === -1 && eonRow === -1) {
    return jsonResponse({status: "not_found"});
  }

  var merged = {};
  if (doughRow !== -1) {
    var d = readRowAsObject(dough, doughRow);
    for (var k1 in d) merged[k1] = d[k1];
  }
  if (tempsRow !== -1) {
    var t = readRowAsObject(temps, tempsRow);
    for (var k2 in t) merged[k2] = t[k2];
  }
  if (eonRow !== -1) {
    var n = readRowAsObject(eon, eonRow);
    // EON columns are already prefixed ("EON Sales", "EON Indi Count", ...)
    // so they don't collide with the morning Dough Counts columns.
    for (var k3 in n) merged[k3] = n[k3];
  }
  return jsonResponse({status: "found", data: merged});
}

function getRecentDough() {
  var sheet = getSheet("dough");
  var allData = sheet.getDataRange().getValues();
  if (allData.length < 2) {
    return jsonResponse([]);
  }
  var headers = allData[0];
  var rows = [];
  var start = Math.max(1, allData.length - 30);
  for (var i = allData.length - 1; i >= start; i--) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = allData[i][j];
    }
    rows.push(row);
  }
  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run once from the Apps Script editor (like seedSheets). One-time data fix:
// clamps any negative values in the 2pm Make Amount tab to 0, then recomputes
// every Final Dough Amount at 2pm row as Dough Counts + clamped make.
// Idempotent — safe to re-run. Rows whose date has no Dough Counts row get
// their makes clamped but their final is left alone (logged).
function fixNegativeMakes() {
  var makeSheet = getSheet("make");
  var doughSheet = getSheet("dough");
  var report = [];

  // Index Dough Counts by normalized date so each make row is one lookup.
  var doughData = doughSheet.getDataRange().getValues();
  var doughHeaders = doughData[0];
  var col = {};
  for (var h = 0; h < doughHeaders.length; h++) col[doughHeaders[h]] = h;
  var countsByDate = {};
  for (var i = 1; i < doughData.length; i++) {
    countsByDate[normalizeDate(formatDate(doughData[i][0]))] = {
      indi:  Number(doughData[i][col["Indi Count"]])  || 0,
      small: Number(doughData[i][col["Small Count"]]) || 0,
      large: Number(doughData[i][col["Large Count"]]) || 0,
      sic:   Number(doughData[i][col["Sic Count"]])   || 0,
      boil:  Number(doughData[i][col["Boil Count"]])  || 0
    };
  }

  var makeData = makeSheet.getDataRange().getValues();
  for (var r = 1; r < makeData.length; r++) {
    var date = formatDate(makeData[r][0]);
    var raw = makeData[r].slice(1, 6).map(function(v) { return Number(v) || 0; });
    var makes = {
      indi:  Math.max(0, raw[0]),
      small: Math.max(0, raw[1]),
      large: Math.max(0, raw[2]),
      sic:   Math.max(0, raw[3]),
      boil:  Math.max(0, raw[4])
    };
    var hadNegative = raw.some(function(v) { return v < 0; });
    if (hadNegative) {
      makeSheet.getRange(r + 1, 2, 1, 5)
        .setValues([[makes.indi, makes.small, makes.large, makes.sic, makes.boil]]);
      report.push("clamped makes: " + date);
    }
    var counts = countsByDate[normalizeDate(date)];
    if (counts) {
      upsertSizeRow("final", date, {
        indi:  counts.indi  + makes.indi,
        small: counts.small + makes.small,
        large: counts.large + makes.large,
        sic:   counts.sic   + makes.sic,
        boil:  counts.boil  + makes.boil
      });
    } else {
      report.push("no Dough Counts row for " + date + " — final not recomputed");
    }
  }

  Logger.log(report.length ? report.join("\n") : "no negatives found — finals recomputed");
}

// Run once from the Apps Script editor after deploying. Idempotent: never wipes
// existing data, never duplicates rows. Safe to re-run if a tab is missing.
function seedSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];

  for (var key in SHEETS) {
    var cfg = SHEETS[key];
    var sheet = ss.getSheetByName(cfg.name);
    if (!sheet) {
      sheet = ss.insertSheet(cfg.name);
      report.push("created sheet: " + cfg.name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]);
      sheet.setFrozenRows(1);
      report.push("wrote headers: " + cfg.name);
    }
    if (key === "bible" && sheet.getLastRow() < 2) {
      sheet.getRange(2, 1, BIBLE_DATA.length, BIBLE_DATA[0].length).setValues(BIBLE_DATA);
      report.push("seeded " + BIBLE_DATA.length + " bible rows");
    }
    if (key === "peachBible" && sheet.getLastRow() < 2) {
      sheet.getRange(2, 1, PEACH_BIBLE_DATA.length, PEACH_BIBLE_DATA[0].length).setValues(PEACH_BIBLE_DATA);
      report.push("seeded " + PEACH_BIBLE_DATA.length + " peach bible rows");
    }
  }

  // Additive migration: older deployments have a narrower Dough Counts tab
  // (11 columns pre-v2, 12 through v2·9). The header-writing branch above
  // only runs on empty sheets, so append any missing column headers here.
  var doughSheet = ss.getSheetByName(SHEETS.dough.name);
  if (doughSheet && doughSheet.getLastRow() > 0) {
    var addedCols = ["Bible", "Forecast Rounding", "Batch Rounding"];
    for (var a = 0; a < addedCols.length; a++) {
      var col = SHEETS.dough.headers.indexOf(addedCols[a]) + 1;
      if (doughSheet.getRange(1, col).getValue() !== addedCols[a]) {
        doughSheet.getRange(1, col).setValue(addedCols[a]);
        report.push("appended " + addedCols[a] + " column header to " + SHEETS.dough.name);
      }
    }
  }

  Logger.log(report.length ? report.join("\n") : "all sheets already seeded — no-op");
}

// ─── Dough Use + data-driven bibles (v2·11–13) ──────────────────────────
// AM use = last night's EON count − today's 2 PM count, paired with the
// 2 PM Current Sales. PM use = Final-at-2pm − EON count, paired with
// EON Sales − Current Sales. Every derived cell is a LIVE FORMULA — edit
// a source tab and Dough Use plus both New Bibles recompute on the spot;
// the red flags are conditional-format rules that clear themselves the
// same way. rebuildDoughUse() (🍕 menu) only syncs STRUCTURE: one Dough
// Use row per Dough Counts date, dated stub rows on EON / 2pm Make so
// missing history has red cells to type into, the formulas, and the
// rules. Nightly dough saves add their own Dough Use row (see
// handleDoughPost), so the button is for backfill, not upkeep.

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🍕 Dough Tracker")
    .addItem("Rebuild Dough Use + New Bibles", "rebuildDoughUse")
    .addToUi();
}

// Days-since-epoch for a sheet Date cell or an M/D/YYYY string.
function dateDayKey(v) {
  if (v instanceof Date) return Math.round(v.getTime() / 86400000);
  var p = String(v).split("/");
  if (p.length === 3) {
    var t = new Date(Number(p[2]), Number(p[0]) - 1, Number(p[1]));
    if (!isNaN(t.getTime())) return Math.round(t.getTime() / 86400000);
  }
  return null;
}

// Blank/garbage cells → null; numbers (including 0) pass through.
function numCell(v) {
  if (v === "" || v == null) return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function medianOf(arr) {
  var s = arr.slice().sort(function (x, y) { return x - y; });
  var mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Reference implementation of the New Bible fit — robust Theil–Sen,
// use = a + b·sales: the median slope across every pair of nights, so one
// miscounted night barely moves the chart (decided with Jacob over plain
// least squares). Slope clamped ≥ 0; null under 3 observations. The live
// sheet formula written by buildNewBibleTab() must reproduce THIS math —
// the tests pin it here because formulas can't run in CI.
function fitLine(points) {
  var n = points.length;
  if (n < 3) return null;
  var slopes = [];
  for (var i = 0; i < n; i++) {
    for (var j = i + 1; j < n; j++) {
      if (points[j][0] !== points[i][0]) {
        slopes.push((points[j][1] - points[i][1]) / (points[j][0] - points[i][0]));
      }
    }
  }
  if (!slopes.length) return null;
  var b = medianOf(slopes);
  if (b < 0) b = 0;
  var residuals = [];
  for (i = 0; i < n; i++) residuals.push(points[i][1] - b * points[i][0]);
  return { a: medianOf(residuals), b: b };
}

// Sales tiers $2,000 → $22,000 every $300, endpoints exact (the final
// step is $200 so the chart tops out at exactly $22,000).
function newBibleTiers() {
  var tiers = [];
  for (var t = 2000; t <= 22000; t += 300) tiers.push(t);
  if (tiers[tiers.length - 1] !== 22000) tiers.push(22000);
  return tiers;
}

// Everything red-flagged by the live rules uses this fill.
var FLAG_RED = "#f4c7c3";
var FLAG_ROWS = 5000; // conditional-format coverage — years of nights

// Column letters the formulas wire together.
var EON_COUNT_COLS = ["C", "D", "E", "F", "G"]; // End of Night Count
var DC_COUNT_COLS = ["F", "G", "H", "I", "J"]; // Dough Counts
var SIZE_COLS = ["B", "C", "D", "E", "F"]; // 2pm Make / Final tabs
var DU_AM_COLS = ["E", "F", "G", "H", "I"]; // Dough Use AM per size
var DU_PM_COLS = ["K", "L", "M", "N", "O"]; // Dough Use PM per size

// The live formulas for one Dough Use row (columns B..P; A is the date).
function doughUseRowFormulas(r) {
  var f = [];
  // B — bible label: the stamped Dough Counts cell wins, else July/August = peach.
  f.push('=IF($A' + r + '="","",LET(b,IFERROR(INDEX(\'Dough Counts\'!$L:$L,MATCH($A' + r + ',\'Dough Counts\'!$A:$A,0)),""),IF(OR(b="regular",b="peach"),b,IF(OR(MONTH($A' + r + ')=7,MONTH($A' + r + ')=8),"peach","regular"))))');
  // C — Prev Count: the most recent EON date before this one, ≤ 7 days back.
  f.push('=LET(p,MAXIFS(\'End of Night Count\'!$A:$A,\'End of Night Count\'!$A:$A,"<"&$A' + r + ',\'End of Night Count\'!$A:$A,">="&$A' + r + '-7),IF(p=0,"",p))');
  // D — 2 PM Current Sales.
  f.push('=IFERROR(INDEX(\'Dough Counts\'!$C:$C,MATCH($A' + r + ',\'Dough Counts\'!$A:$A,0)),"")');
  var i;
  // E..I — AM use per size: prev-night EON count − today's 2 PM count.
  for (i = 0; i < 5; i++) {
    f.push('=IF($C' + r + '="","",LET(p,IFERROR(INDEX(\'End of Night Count\'!$' + EON_COUNT_COLS[i] + ':$' + EON_COUNT_COLS[i] + ',MATCH($C' + r + ',\'End of Night Count\'!$A:$A,0)),""),t,IFERROR(INDEX(\'Dough Counts\'!$' + DC_COUNT_COLS[i] + ':$' + DC_COUNT_COLS[i] + ',MATCH($A' + r + ',\'Dough Counts\'!$A:$A,0)),""),IF(OR(p="",t=""),"",p-t)))');
  }
  // J — PM sales: EON sales − 2 PM sales; blank when EON sales was never
  // entered (0 is the v1 artifact) or sits below the 2 PM number.
  f.push('=LET(e,IFERROR(INDEX(\'End of Night Count\'!$B:$B,MATCH($A' + r + ',\'End of Night Count\'!$A:$A,0)),""),c,$D' + r + ',IF(OR(e="",e<=0,c="",e<c),"",e-c))');
  // K..O — PM use per size: Final-at-2pm − EON count.
  for (i = 0; i < 5; i++) {
    f.push('=LET(fin,IFERROR(INDEX(\'Final Dough Amount at 2pm\'!$' + SIZE_COLS[i] + ':$' + SIZE_COLS[i] + ',MATCH($A' + r + ',\'Final Dough Amount at 2pm\'!$A:$A,0)),""),eo,IFERROR(INDEX(\'End of Night Count\'!$' + EON_COUNT_COLS[i] + ':$' + EON_COUNT_COLS[i] + ',MATCH($A' + r + ',\'End of Night Count\'!$A:$A,0)),""),IF(OR(fin="",eo=""),"",fin-eo))');
  }
  // P — TRUE when a real 2pm Make row backs the Final (the bibles require it).
  f.push('=IF($A' + r + '="",FALSE,LET(m,IFERROR(MATCH($A' + r + ',\'2pm Make Amount\'!$A:$A,0),0),IF(m=0,FALSE,COUNT(INDEX(\'2pm Make Amount\'!$B:$F,m,0))>0)))');
  return f;
}

// One spilling {n, a, b} fit formula per size — the Sheets transcription
// of fitLine() over a bible's usable observations: label-matched, sales
// paired and positive, use non-negative, PM only when make-backed ($P).
function fitSpillFormula(label, amCol, pmCol) {
  var amGuard = 'AND(l="' + label + '",ISNUMBER(s),s>0,ISNUMBER(u),u>=0)';
  var pmGuard = 'AND(l="' + label + '",ok=TRUE,ISNUMBER(s),s>0,ISNUMBER(u),u>=0)';
  var du = function (col) { return "'Dough Use'!$" + col + "$2:$" + col; };
  var amMap = function (out) {
    return 'MAP(' + du('B') + ',' + du('D') + ',' + du(amCol) + ',LAMBDA(l,s,u,IF(' + amGuard + ',' + out + ',NA())))';
  };
  var pmMap = function (out) {
    return 'MAP(' + du('B') + ',' + du('J') + ',' + du(pmCol) + ',' + du('P') + ',LAMBDA(l,s,u,ok,IF(' + pmGuard + ',' + out + ',NA())))';
  };
  return '=LET(xs,VSTACK(' + amMap('s') + ',' + pmMap('s') + '),' +
    'ysA,VSTACK(' + amMap('u') + ',' + pmMap('u') + '),' +
    'x,IFERROR(FILTER(xs,ISNUMBER(xs)),NA()),' +
    'y,IFERROR(FILTER(ysA,ISNUMBER(xs)),NA()),' +
    'n,COUNT(x),' +
    'IF(n<3,HSTACK(n,"",""),' +
    'LET(m,MAKEARRAY(n,n,LAMBDA(i,j,IF(j<=i,NA(),IF(INDEX(x,j)=INDEX(x,i),NA(),(INDEX(y,j)-INDEX(y,i))/(INDEX(x,j)-INDEX(x,i)))))),' +
    'sl,IFERROR(FILTER(TOCOL(m,2),ISNUMBER(TOCOL(m,2))),NA()),' +
    'IF(ISERROR(MIN(sl)),HSTACK(n,"",""),' +
    'LET(b,MAX(0,MEDIAN(sl)),a,MEDIAN(MAP(x,y,LAMBDA(xx,yy,yy-b*xx))),HSTACK(n,a,b))))))';
}

function rebuildDoughUse() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eonSheet = getSheet("eon");
  var makeSheet = getSheet("make");
  var doughRows = getSheet("dough").getDataRange().getValues();
  var eonRows = eonSheet.getDataRange().getValues();
  var makeRows = makeSheet.getDataRange().getValues();

  // Structure facts only — all math lives in the formulas.
  var eonHasRow = {}, eonHasCounts = {}, makeHasRow = {}, makeHasData = {};
  var i, c, day;
  for (i = 1; i < eonRows.length; i++) {
    day = dateDayKey(eonRows[i][0]);
    if (day == null) continue;
    eonHasRow[day] = true;
    for (c = 2; c <= 6; c++) {
      if (numCell(eonRows[i][c]) != null) { eonHasCounts[day] = true; break; }
    }
  }
  for (i = 1; i < makeRows.length; i++) {
    day = dateDayKey(makeRows[i][0]);
    if (day == null) continue;
    makeHasRow[day] = true;
    for (c = 1; c <= 5; c++) {
      if (numCell(makeRows[i][c]) != null) { makeHasData[day] = true; break; }
    }
  }
  var entries = [];
  for (i = 1; i < doughRows.length; i++) {
    day = dateDayKey(doughRows[i][0]);
    if (day != null) entries.push({ day: day, date: doughRows[i][0] });
  }
  entries.sort(function (x, y) { return x.day - y.day; });

  // Dough Use: one formula row per date, rewritten wholesale.
  var duSheet = ss.getSheetByName(SHEETS.doughUse.name);
  if (!duSheet) duSheet = ss.insertSheet(SHEETS.doughUse.name);
  duSheet.clearContents();
  duSheet.getRange(1, 1, 1, SHEETS.doughUse.headers.length).setValues([SHEETS.doughUse.headers]);
  if (entries.length) {
    var dates = [], formulas = [];
    for (i = 0; i < entries.length; i++) {
      dates.push([entries[i].date]);
      formulas.push(doughUseRowFormulas(i + 2));
    }
    duSheet.getRange(2, 1, entries.length, 1).setValues(dates);
    duSheet.getRange(2, 2, entries.length, SHEETS.doughUse.headers.length - 1).setFormulas(formulas);
    duSheet.getRange(2, 3, entries.length, 1).setNumberFormat("M/d/yyyy");
  }

  // Dated stub rows so missing history has red cells to type into: EON
  // for any dough date without a row; 2pm Make for nights with EON counts
  // but no make data (the count-only-Final artifact). Never duplicated —
  // reruns see the stub's date.
  for (i = 0; i < entries.length; i++) {
    day = entries[i].day;
    if (!eonHasRow[day]) { eonSheet.appendRow([entries[i].date]); eonHasRow[day] = true; }
    if (eonHasCounts[day] && !makeHasData[day] && !makeHasRow[day]) {
      makeSheet.appendRow([entries[i].date]);
      makeHasRow[day] = true;
    }
  }

  buildNewBibleTab(ss, "newBible", "regular");
  buildNewBibleTab(ss, "newPeachBible", "peach");
  installLiveFlags(duSheet, eonSheet, makeSheet);

  var summary = "Dough Use: " + entries.length + " dates on live formulas · red cells = data to fill in (they clear as you type)";
  if (ss.toast) ss.toast(summary, "🍕 Dough Tracker", 8);
  Logger.log(summary);
}

// A New Bible tab: Sales tiers in A, live tier formulas in B..E reading
// the per-size {n, a, b} fit helpers in H2:J5 (G holds labels, G1 a note).
function buildNewBibleTab(ss, key, label) {
  var cfg = SHEETS[key];
  var sheet = ss.getSheetByName(cfg.name);
  if (!sheet) sheet = ss.insertSheet(cfg.name);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]);
  var tiers = newBibleTiers();
  var salesCol = [], tierFs = [];
  for (var t = 0; t < tiers.length; t++) {
    salesCol.push([tiers[t]]);
    var fr = [];
    for (var s = 0; s < 4; s++) {
      var hr = s + 2;
      // Blank both when n < 3 AND when the fit itself is blank (n ≥ 3 but
      // zero sales spread — fitLine's other null branch). Without the second
      // guard the arithmetic on the spilled "" text turns the whole column
      // into #VALUE!.
      fr.push('=IF(OR($H$' + hr + '<3,$I$' + hr + '=""),"",MAX(0,ROUND($I$' + hr + '+$J$' + hr + '*$A' + (t + 2) + ')))');
    }
    tierFs.push(fr);
  }
  sheet.getRange(2, 1, tiers.length, 1).setValues(salesCol);
  sheet.getRange(2, 2, tiers.length, 4).setFormulas(tierFs);
  sheet.getRange(1, 7).setValue("live fit · a size stays blank under 3 usable nights");
  sheet.getRange(1, 8, 1, 3).setValues([["n", "a", "b"]]);
  var sizes = ["Indi", "Small", "Large", "Sicilian"];
  for (s = 0; s < 4; s++) {
    sheet.getRange(s + 2, 7).setValue(sizes[s]);
    sheet.getRange(s + 2, 8).setFormula(fitSpillFormula(label, DU_AM_COLS[s], DU_PM_COLS[s]));
  }
}

// Live red: conditional-format rules that flag and un-flag themselves as
// data changes. NOTE: setConditionalFormatRules replaces any manual rules
// on these three tabs. Cross-sheet checks need INDIRECT (a CF limitation).
function installLiveFlags(duSheet, eonSheet, makeSheet) {
  var red = function (sheet, range, formula) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formula)
      .setBackground(FLAG_RED)
      .setRanges([sheet.getRange(2, range[0], FLAG_ROWS, range[1])])
      .build();
  };
  duSheet.setConditionalFormatRules([
    red(duSheet, [5, 5], '=AND(ISNUMBER(E2),E2<0)'),
    red(duSheet, [11, 5], '=AND(ISNUMBER(K2),OR(K2<0,$P2=FALSE))'),
  ]);
  eonSheet.setConditionalFormatRules([
    red(eonSheet, [2, 1], '=AND($A2<>"",COUNTIF(INDIRECT("\'Dough Counts\'!$A:$A"),$A2)>0,OR($B2="",N($B2)<=0))'),
    red(eonSheet, [3, 5], '=AND($A2<>"",COUNTIF(INDIRECT("\'Dough Counts\'!$A:$A"),$A2)>0,C2="")'),
  ]);
  makeSheet.setConditionalFormatRules([
    red(makeSheet, [2, 5], '=AND($A2<>"",COUNT($B2:$F2)=0,LET(r,IFERROR(MATCH($A2,INDIRECT("\'End of Night Count\'!$A:$A"),0),0),IF(r=0,FALSE,COUNT(INDEX(INDIRECT("\'End of Night Count\'!$C:$G"),r,0))>0)))'),
  ]);
}

// Nightly upkeep: every dough save makes sure its date has a Dough Use
// formula row, so tonight shows up without touching the 🍕 button. No-op
// until the first rebuild has seeded the tab.
function upsertDoughUseRow(date) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.doughUse.name);
  if (!sheet || sheet.getLastRow() === 0) return;
  if (findRowByDate(sheet, date) !== -1) return;
  sheet.appendRow([date]);
  var row = sheet.getLastRow();
  sheet.getRange(row, 2, 1, SHEETS.doughUse.headers.length - 1).setFormulas([doughUseRowFormulas(row)]);
  sheet.getRange(row, 3, 1, 1).setNumberFormat("M/d/yyyy");
}
