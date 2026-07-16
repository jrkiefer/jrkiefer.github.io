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
              "PM Sales","PM Indi","PM Small","PM Large","PM Sic","PM Boil"]
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

function formatDate(d) {
  if (d instanceof Date) {
    return (d.getMonth()+1) + "/" + d.getDate() + "/" + d.getFullYear();
  }
  return String(d).trim();
}

function normalizeDate(dateStr) {
  // Handle both "4/1/2026" and "04/01/2026" formats
  var parts = String(dateStr).split("/");
  if (parts.length === 3) {
    return parseInt(parts[0]) + "/" + parseInt(parts[1]) + "/" + parseInt(parts[2]);
  }
  return String(dateStr).trim();
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

// ─── Dough Use + data-driven bibles (v2·11) ─────────────────────────────
// AM use = last night's EON count − today's 2 PM count, paired with the
// 2 PM Current Sales. PM use = Final-at-2pm − EON count, paired with
// EON Sales − Current Sales. rebuildDoughUse() rewrites the three derived
// tabs from scratch — run it any time from the 🍕 menu or the editor.

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

// The night's bible: the stamped Dough Counts cell wins, else the month
// rule (July–August = peach) — same resolution the app uses.
function bibleLabelFor(dateCell, bibleCell) {
  if (bibleCell === "regular" || bibleCell === "peach") return bibleCell;
  var m = dateCell instanceof Date
    ? dateCell.getMonth() + 1
    : parseInt(String(dateCell).split("/")[0], 10);
  return m === 7 || m === 8 ? "peach" : "regular";
}

function medianOf(arr) {
  var s = arr.slice().sort(function (x, y) { return x - y; });
  var mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Robust Theil–Sen line, use = a + b·sales: the median slope across every
// pair of nights, so one miscounted night barely moves the chart (decided
// with Jacob over plain least squares). Slope clamped ≥ 0 so more sales
// never means less dough. Null under 3 observations — a blank column
// beats a made-up one.
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

// Everything red-flagged by rebuildDoughUse uses this fill: suspect values
// on Dough Use, and the exact source cells to fill in on EON / 2pm Make.
var FLAG_RED = "#f4c7c3";

function rebuildDoughUse() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eonSheet = getSheet("eon");
  var makeSheet = getSheet("make");
  var doughRows = getSheet("dough").getDataRange().getValues();
  var eonRows = eonSheet.getDataRange().getValues();
  var makeRows = makeSheet.getDataRange().getValues();
  var finalRows = getSheet("final").getDataRange().getValues();

  // Index the source tabs by day. eonByDay holds rows with at least one
  // count; eonSheetRow / makeSheetRow remember where any dated row lives
  // so the red-flag pass can point at the exact cells to fill in.
  var eonByDay = {};
  var eonSheetRow = {};
  var eonDays = [];
  var i, c, day;
  for (i = 1; i < eonRows.length; i++) {
    day = dateDayKey(eonRows[i][0]);
    if (day == null) continue;
    eonSheetRow[day] = i + 1;
    var counts = [];
    var any = false;
    for (c = 0; c < 5; c++) {
      var n = numCell(eonRows[i][2 + c]);
      counts.push(n);
      if (n != null) any = true;
    }
    if (!any) continue;
    eonByDay[day] = { sales: numCell(eonRows[i][1]), counts: counts, label: formatDate(eonRows[i][0]) };
    eonDays.push(day);
  }
  eonDays.sort(function (x, y) { return x - y; });

  // A make row is what separates a trustworthy Final row from the early
  // count-only artifact — PM still computes without one, but it's flagged
  // and the bibles ignore it until the make data is entered.
  var makeByDay = {};
  var makeSheetRow = {};
  for (i = 1; i < makeRows.length; i++) {
    day = dateDayKey(makeRows[i][0]);
    if (day == null) continue;
    makeSheetRow[day] = i + 1;
    for (c = 1; c <= 5; c++) {
      if (numCell(makeRows[i][c]) != null) { makeByDay[day] = true; break; }
    }
  }
  var finalByDay = {};
  for (i = 1; i < finalRows.length; i++) {
    day = dateDayKey(finalRows[i][0]);
    if (day == null) continue;
    var fv = [];
    for (c = 1; c <= 5; c++) fv.push(numCell(finalRows[i][c]));
    finalByDay[day] = fv;
  }

  var entries = [];
  for (i = 1; i < doughRows.length; i++) {
    day = dateDayKey(doughRows[i][0]);
    if (day != null) entries.push({ day: day, row: doughRows[i] });
  }
  entries.sort(function (x, y) { return x.day - y.day; });

  // pts[label][sizeIndex] — fit observations (pizza sizes only). The tab
  // shows every computable value raw; the bibles only learn from
  // sales-paired, non-negative values on nights with a real make row.
  var pts = { regular: [[], [], [], []], peach: [[], [], [], []] };
  var used = { regular: { am: 0, pm: 0 }, peach: { am: 0, pm: 0 } };
  var useRows = [];
  var useBgs = [];

  for (i = 0; i < entries.length; i++) {
    day = entries[i].day;
    var row = entries[i].row;
    var label = bibleLabelFor(row[0], row[11]);
    var cs = numCell(row[2]);
    var counts2pm = [];
    for (c = 0; c < 5; c++) counts2pm.push(numCell(row[5 + c]));

    // AM: most recent EON-with-counts strictly before this date, ≤ 7 days
    // back (dough just sits over closed days — still this morning's use).
    var prevDay = null;
    for (var k = eonDays.length - 1; k >= 0; k--) {
      if (eonDays[k] < day) {
        if (day - eonDays[k] <= 7) prevDay = eonDays[k];
        break;
      }
    }
    var am = [null, null, null, null, null];
    if (prevDay != null) {
      var pv = eonByDay[prevDay].counts;
      for (c = 0; c < 5; c++) {
        if (pv[c] != null && counts2pm[c] != null) am[c] = pv[c] - counts2pm[c];
      }
    }

    // PM computes whenever Final and EON counts exist ("all the math,
    // with or without the rest"); pmTrusted marks whether a make row
    // backs the Final so the fits know what to believe.
    var pm = [null, null, null, null, null];
    var pmSales = null;
    var pmTrusted = !!makeByDay[day];
    var tonight = eonByDay[day];
    if (tonight && finalByDay[day]) {
      for (c = 0; c < 5; c++) {
        if (finalByDay[day][c] != null && tonight.counts[c] != null) {
          pm[c] = finalByDay[day][c] - tonight.counts[c];
        }
      }
    }
    // EON sales of 0 means "never entered" (v1 artifact), and sales below
    // the 2 PM number is an entry error — no pairing either way.
    if (tonight && tonight.sales != null && tonight.sales > 0 && cs != null && tonight.sales >= cs) {
      pmSales = tonight.sales - cs;
    }

    var amUsed = false, pmUsed = false;
    for (c = 0; c < 4; c++) {
      if (cs != null && cs > 0 && am[c] != null && am[c] >= 0) {
        pts[label][c].push([cs, am[c]]);
        amUsed = true;
      }
      if (pmTrusted && pmSales != null && pmSales > 0 && pm[c] != null && pm[c] >= 0) {
        pts[label][c].push([pmSales, pm[c]]);
        pmUsed = true;
      }
    }
    if (amUsed) used[label].am++;
    if (pmUsed) used[label].pm++;

    var out = [formatDate(row[0]), label, prevDay != null ? eonByDay[prevDay].label : "", cs != null ? cs : ""];
    for (c = 0; c < 5; c++) out.push(am[c] != null ? am[c] : "");
    out.push(pmSales != null ? pmSales : "");
    for (c = 0; c < 5; c++) out.push(pm[c] != null ? pm[c] : "");
    useRows.push(out);

    // Red = look at this: negative values (recounts/typos), and PM values
    // whose Final row has no make behind it.
    var bg = [null, null, null, null];
    for (c = 0; c < 5; c++) bg.push(am[c] != null && am[c] < 0 ? FLAG_RED : null);
    bg.push(null);
    for (c = 0; c < 5; c++) {
      bg.push(pm[c] != null && (pm[c] < 0 || !pmTrusted) ? FLAG_RED : null);
    }
    useBgs.push(bg);
  }

  var duSheet = writeDerivedTab(ss, "doughUse", useRows, null);
  if (useRows.length) {
    duSheet.getRange(2, 1, useRows.length, SHEETS.doughUse.headers.length).setBackgrounds(useBgs);
  }
  flagMissingSources(eonSheet, makeSheet, entries, eonByDay, eonSheetRow, makeByDay, makeSheetRow, eonRows.length, makeRows.length);
  writeNewBible(ss, "newBible", pts.regular, used.regular);
  writeNewBible(ss, "newPeachBible", pts.peach, used.peach);

  var summary = "Dough Use: " + useRows.length + " dates · bibles from " +
    (used.regular.am + used.regular.pm) + " regular + " +
    (used.peach.am + used.peach.pm) + " peach dayparts · red cells = data to fill in, then rebuild";
  if (ss.toast) ss.toast(summary, "🍕 Dough Tracker", 8);
  Logger.log(summary);
}

// Paint the exact source cells that block a night's math, so backfilling
// is a hunt for red: EON sales/count cells (stub rows appended for dates
// with no EON row at all) and 2pm Make rows missing behind a Final row.
// Backgrounds in these tabs' data rows are reset on every rebuild, so a
// fixed cell loses its flag on the next run.
function flagMissingSources(eonSheet, makeSheet, entries, eonByDay, eonSheetRow, makeByDay, makeSheetRow, eonRowCount, makeRowCount) {
  var i, day, r, c;

  // Stubs first so the background matrices cover them.
  for (i = 0; i < entries.length; i++) {
    day = entries[i].day;
    var label = formatDate(entries[i].row[0]);
    if (eonSheetRow[day] == null) {
      eonSheet.appendRow([label]);
      eonRowCount++;
      eonSheetRow[day] = eonRowCount;
    }
    if (eonByDay[day] && !makeByDay[day] && makeSheetRow[day] == null) {
      makeSheet.appendRow([label]);
      makeRowCount++;
      makeSheetRow[day] = makeRowCount;
    }
  }

  var eonBgs = [];
  for (r = 0; r < eonRowCount - 1; r++) eonBgs.push([null, null, null, null, null, null, null]);
  var makeBgs = [];
  for (r = 0; r < makeRowCount - 1; r++) makeBgs.push([null, null, null, null, null, null]);

  for (i = 0; i < entries.length; i++) {
    day = entries[i].day;
    var eonRow = eonSheetRow[day] - 2; // background-matrix index
    var tonight = eonByDay[day];
    if (!tonight) {
      for (c = 1; c <= 6; c++) eonBgs[eonRow][c] = FLAG_RED; // sales + all five counts
    } else {
      if (tonight.sales == null || tonight.sales <= 0) eonBgs[eonRow][1] = FLAG_RED;
      for (c = 0; c < 5; c++) {
        if (tonight.counts[c] == null) eonBgs[eonRow][2 + c] = FLAG_RED;
      }
    }
    if (tonight && !makeByDay[day] && makeSheetRow[day] != null) {
      var makeRow = makeSheetRow[day] - 2;
      for (c = 1; c <= 5; c++) makeBgs[makeRow][c] = FLAG_RED;
    }
  }

  if (eonBgs.length) eonSheet.getRange(2, 1, eonBgs.length, 7).setBackgrounds(eonBgs);
  if (makeBgs.length) makeSheet.getRange(2, 1, makeBgs.length, 6).setBackgrounds(makeBgs);
}

// Full rewrite of a derived tab: clear, headers, rows. Creates the tab if
// seedSheets hasn't run yet.
function writeDerivedTab(ss, key, rows, note) {
  var cfg = SHEETS[key];
  var sheet = ss.getSheetByName(cfg.name);
  if (!sheet) sheet = ss.insertSheet(cfg.name);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, cfg.headers.length).setValues(rows);
  if (note) sheet.getRange(1, cfg.headers.length + 2).setValue(note);
  return sheet;
}

function writeNewBible(ss, key, sizePts, usedCounts) {
  var tiers = newBibleTiers();
  var fits = [];
  for (var s = 0; s < 4; s++) fits.push(fitLine(sizePts[s]));
  var rows = [];
  for (var t = 0; t < tiers.length; t++) {
    var out = [tiers[t]];
    for (s = 0; s < 4; s++) {
      out.push(fits[s] ? Math.max(0, Math.round(fits[s].a + fits[s].b * tiers[t])) : "");
    }
    rows.push(out);
  }
  var note = "rebuilt " + formatDate(new Date()) + " · " + usedCounts.am +
    " mornings + " + usedCounts.pm + " evenings" +
    (fits.every(function (f) { return f; }) ? "" : " · blank columns need 3+ observations");
  writeDerivedTab(ss, key, rows, note);
}
