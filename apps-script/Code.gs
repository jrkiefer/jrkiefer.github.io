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

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var raw = e.postData.contents || e.postData.getDataAsString();
  var data = JSON.parse(raw);

  if (data.type === "temps") {
    var row = findRowByDate(sheet, data.date);
    if (row === -1) {
      return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Date not found"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    for (var j = 0; j < data.temps.length; j++) {
      sheet.getRange(row, 12 + (j * 2)).setValue(data.temps[j].water);
      sheet.getRange(row, 13 + (j * 2)).setValue(data.temps[j].dough);
    }
    return ContentService.createTextOutput(JSON.stringify({status: "ok"}))
      .setMimeType(ContentService.MimeType.JSON);

  } else {
    // Check if today already has an entry — update instead of adding new row
    var existingRow = findRowByDate(sheet, data.date);
    var rowData = [
      data.date, data.todayForecast, data.currentSales, data.salesLeft,
      data.tomorrowForecast, data.indiCount, data.smallCount,
      data.largeCount, data.sicCount, data.boilCount, data.batches
    ];

    if (existingRow !== -1) {
      // Update existing row (columns A through K)
      for (var i = 0; i < rowData.length; i++) {
        sheet.getRange(existingRow, i + 1).setValue(rowData[i]);
      }
    } else {
      // New date — append
      sheet.appendRow(rowData);
    }

    return ContentService.createTextOutput(JSON.stringify({status: "ok"}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];

  if (e.parameter.date) {
    var row = findRowByDate(sheet, e.parameter.date);
    if (row === -1) {
      return ContentService.createTextOutput(JSON.stringify({status: "not_found"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var rowData = allData[row - 1];
    var result = {};
    for (var j = 0; j < headers.length; j++) {
      result[headers[j]] = rowData[j];
    }
    return ContentService.createTextOutput(JSON.stringify({status: "found", data: result}))
      .setMimeType(ContentService.MimeType.JSON);
  }

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
