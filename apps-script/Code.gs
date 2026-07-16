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
