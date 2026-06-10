// Sheet config — single source of truth for tab names + headers.
// To add a new captured-data type later: add an entry here, route it from doPost.
var SHEETS = {
  dough: {
    name: "Dough Counts",
    headers: ["Date","Today's Forecast","Current Sales","Sales Left","Tomorrow's Forecast",
              "Indi Count","Small Count","Large Count","Sic Count","Boil Count","Batches"]
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

// Mirror of DOUGH_TABLE in js/config.js. Update both together.
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
  var data = JSON.parse(raw);
  var type = data.type || "dough";

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
    data.largeCount, data.sicCount, data.boilCount, data.batches
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
  var rowData = [
    date,
    Number(sizes.indi)  || 0,
    Number(sizes.small) || 0,
    Number(sizes.large) || 0,
    Number(sizes.sic)   || 0,
    Number(sizes.boil)  || 0
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

  var sheet = getSheet("temps");
  var row = findRowByDate(sheet, data.date);
  if (row === -1) {
    sheet.appendRow([data.date]);
    row = sheet.getLastRow();
  }
  for (var j = 0; j < data.temps.length; j++) {
    // Header layout: A=Date, B=Water 1, C=Dough 1, D=Water 2, E=Dough 2, ...
    sheet.getRange(row, 2 + (j * 2)).setValue(data.temps[j].water);
    sheet.getRange(row, 3 + (j * 2)).setValue(data.temps[j].dough);
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
  }

  Logger.log(report.length ? report.join("\n") : "all sheets already seeded — no-op");
}
