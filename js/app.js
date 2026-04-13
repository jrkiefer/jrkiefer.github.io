    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbysGE_0ynpVxJNdmvsfPjAdkQA3Lng7YMDp1OjP-EXbdx3xqEixgjwCKxVeSisECo-j/exec';
    const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1MVjVlKd3pwXB_JkHZkP00FnM0fBerfwStfqJ-GBza0M/edit?gid=0#gid=0';

    var isLoading = false;

    const DOUGH_TABLE = [
      { threshold: 3750,  indi: 11, small: 52,  large: 44,  sic: 2 },
      { threshold: 4000,  indi: 12, small: 58,  large: 50,  sic: 2 },
      { threshold: 4400,  indi: 13, small: 63,  large: 56,  sic: 2 },
      { threshold: 4800,  indi: 14, small: 69,  large: 62,  sic: 2 },
      { threshold: 5200,  indi: 15, small: 74,  large: 65,  sic: 2 },
      { threshold: 5700,  indi: 17, small: 81,  large: 72,  sic: 2 },
      { threshold: 6300,  indi: 18, small: 88,  large: 79,  sic: 2 },
      { threshold: 6800,  indi: 20, small: 94,  large: 87,  sic: 3 },
      { threshold: 7200,  indi: 21, small: 101, large: 94,  sic: 3 },
      { threshold: 7800,  indi: 22, small: 108, large: 99,  sic: 3 },
      { threshold: 8300,  indi: 24, small: 115, large: 106, sic: 3 },
      { threshold: 9100,  indi: 26, small: 125, large: 117, sic: 3 },
      { threshold: 10000, indi: 28, small: 136, large: 126, sic: 4 },
      { threshold: 10700, indi: 30, small: 146, large: 137, sic: 4 },
      { threshold: 11500, indi: 32, small: 156, large: 148, sic: 4 },
      { threshold: 12250, indi: 34, small: 166, large: 159, sic: 4 },
      { threshold: 13000, indi: 37, small: 177, large: 166, sic: 5 },
      { threshold: 13900, indi: 39, small: 187, large: 177, sic: 5 },
      { threshold: 14750, indi: 41, small: 197, large: 188, sic: 5 },
      { threshold: 15500, indi: 43, small: 206, large: 195, sic: 5 },
      { threshold: 16250, indi: 44, small: 214, large: 205, sic: 6 },
      { threshold: 17000, indi: 44, small: 225, large: 216, sic: 6 },
      { threshold: 17750, indi: 44, small: 235, large: 225, sic: 6 },
      { threshold: 18500, indi: 44, small: 246, large: 237, sic: 6 },
      { threshold: 19250, indi: 44, small: 255, large: 247, sic: 6 },
      { threshold: 20000, indi: 44, small: 266, large: 256, sic: 7 },
      { threshold: 20750, indi: 44, small: 276, large: 267, sic: 7 },
    ];

    const PER_TRAY = { indi: 11, small: 8, large: 6, sic: 3 };
    const TRAYS_PER_BATCH = 11;
    const TYPES = ['indi', 'small', 'large', 'sic'];
    const TYPE_LABELS = { indi: 'Individual', small: 'Small', large: 'Large', sic: 'Sicilian' };
    const TYPE_COLORS = { indi: '#FF9800', small: '#2196F3', large: '#9C27B0', sic: '#4CAF50' };
    const TYPE_SHORT = { indi: 'Indi', small: 'Sm', large: 'Lg', sic: 'Sic' };

    function parseDollar(str) {
      return parseFloat(String(str).replace(/[$,\s]/g, '')) || 0;
    }

    function expandDollar(raw) {
      var n = parseDollar(raw);
      if (n === 0) return 0;
      if (n < 100) return Math.round(n * 1000);
      return n;
    }

    function updateHint(inputId, hintId) {
      var raw = document.getElementById(inputId).value.trim();
      var hint = document.getElementById(hintId);
      if (!raw) { hint.innerHTML = ''; return; }
      var val = expandDollar(raw);
      hint.innerHTML = '= <span>' + formatDollar(val) + '</span>';
    }

    function lookup(dollarAmount) {
      // Find smallest threshold >= dollarAmount; cap at highest row
      for (const entry of DOUGH_TABLE) {
        if (entry.threshold >= dollarAmount) return entry;
      }
      return DOUGH_TABLE[DOUGH_TABLE.length - 1];
    }

    function formatDollar(n) {
      return '$' + n.toLocaleString('en-US');
    }

    function valClass(n) {
      if (n < 0) return 'negative';
      if (n > 0) return 'positive';
      return '';
    }

    function getCountValue(type) {
      if (type === 'sic') return parseInt(document.getElementById('countSic').value) || 0;
      var fullTrays = parseInt(document.getElementById('tcTrays-' + type).value) || 0;
      var extra = parseInt(document.getElementById('tcExtra-' + type).value) || 0;
      return (fullTrays * PER_TRAY[type]) + extra;
    }

    function getCount(type) {
      var total = getCountValue(type);
      if (type !== 'sic') {
        document.getElementById('tcTotal-' + type).innerHTML = '= <span>' + total + ' balls</span>';
      }
      return total;
    }

    const BOIL_TARGET = 36;
    const BOIL_PER_TRAY = 6;

    function getBoilCountValue() {
      var fullTrays = parseInt(document.getElementById('tcTrays-boil').value) || 0;
      var extra = parseInt(document.getElementById('tcExtra-boil').value) || 0;
      return (fullTrays * BOIL_PER_TRAY) + extra;
    }

    function getBoilCount() {
      var total = getBoilCountValue();
      document.getElementById('tcTotal-boil').innerHTML = '= <span>' + total + ' balls</span>';
      return total;
    }

    function calculate() {
      // Update dollar hints
      updateHint('currentSales', 'hintCurrentSales');
      updateHint('todayForecast', 'hintTodayForecast');
      updateHint('tomorrowForecast', 'hintTomorrowForecast');

      const currentSales = expandDollar(document.getElementById('currentSales').value);
      const todayForecast = expandDollar(document.getElementById('todayForecast').value);
      const tomorrowForecast = expandDollar(document.getElementById('tomorrowForecast').value);
      const counts = {
        indi: getCount('indi'),
        small: getCount('small'),
        large: getCount('large'),
        sic: getCount('sic'),
      };

      const salesLeft = todayForecast - currentSales;
      const doughUse = lookup(salesLeft);
      const doughLeft = {};
      const tomorrowNeed = lookup(tomorrowForecast);
      const ballsToMake = {};
      const trays = {};

      for (const t of TYPES) {
        doughLeft[t] = counts[t] - doughUse[t];
        ballsToMake[t] = tomorrowNeed[t] - doughLeft[t];
        if (t === 'sic' && ballsToMake[t] < 2) ballsToMake[t] = 2;
        trays[t] = ballsToMake[t] <= 0 ? 0 : Math.ceil(ballsToMake[t] / PER_TRAY[t]);
      }

      // Boil Dough — fixed target, not from lookup
      const boilCount = getBoilCount();
      const boilMake = Math.max(0, BOIL_TARGET - boilCount);
      const boilTrays = boilMake === 0 ? 0 : Math.ceil(boilMake / BOIL_PER_TRAY);

      const totalTrays = TYPES.reduce((sum, t) => sum + trays[t], 0) + boilTrays;
      const batches = totalTrays === 0 ? 0 : Math.ceil(totalTrays / TRAYS_PER_BATCH);

      // Sales Left banner
      document.getElementById('salesLeftValue').textContent = formatDollar(salesLeft);

      // Update size cards in-place
      for (const t of TYPES) {
        var leftEl = document.getElementById(t + '-left');
        document.getElementById(t + '-tonight').textContent = doughUse[t];
        leftEl.textContent = doughLeft[t];
        leftEl.className = 'stat-value ' + valClass(doughLeft[t]);
        document.getElementById(t + '-need').textContent = tomorrowNeed[t];
        document.getElementById(t + '-make').textContent = ballsToMake[t];
        var trayEl = document.getElementById(t + '-trays');
        if (trayEl) trayEl.textContent = trays[t];
      }

      // Boil card
      var boilTraysDisplay = Math.floor(boilMake / BOIL_PER_TRAY);
      var boilSingles = boilMake % BOIL_PER_TRAY;
      document.getElementById('boil-have').textContent = boilCount;
      document.getElementById('boil-target').textContent = BOIL_TARGET;
      document.getElementById('boil-make-val').textContent = boilMake;
      var boilText = document.getElementById('boil-make-text');
      if (boilMake > 0) {
        boilText.textContent = 'Make ' + boilTraysDisplay + ' trays and ' + boilSingles + ' singles';
        boilText.className = 'boil-make';
      } else {
        boilText.textContent = 'Fully stocked!';
        boilText.className = 'boil-make stocked';
      }

      // Batch hero card
      var batchCard = document.getElementById('batch-card');
      batchCard.className = 'batch-card ' + (batches > 0 ? 'has-batches' : 'zero-batches');
      document.getElementById('batch-number').textContent = batches;
      document.getElementById('batch-sub').textContent = totalTrays + ' trays total';
      document.getElementById('tb-indi').textContent = trays.indi;
      document.getElementById('tb-small').textContent = trays.small;
      document.getElementById('tb-large').textContent = trays.large;
      document.getElementById('tb-sic').textContent = ballsToMake.sic;
      document.getElementById('tb-boil').textContent = boilTrays;

      updateSaveButtons();
      syncTempBatches();
    }

    // Debounced calculation for input events
    var calcTimer;
    function debouncedCalculate() {
      clearTimeout(calcTimer);
      calcTimer = setTimeout(calculate, 100);
    }

    // Live calculation on every input change (debounced)
    document.querySelectorAll('input[type="text"]').forEach(function(input) {
      input.addEventListener('input', debouncedCalculate);
    });

    // Input sanitization — strip invalid characters as user types
    function sanitize(el, allowed) {
      var pos = el.selectionStart;
      var before = el.value;
      el.value = el.value.replace(allowed, '');
      if (el.value !== before) {
        var diff = before.length - el.value.length;
        el.selectionStart = el.selectionEnd = Math.max(0, pos - diff);
      }
    }

    // Dollar fields: allow digits, decimal, comma, dollar sign
    ['currentSales', 'todayForecast', 'tomorrowForecast'].forEach(function(id) {
      document.getElementById(id).addEventListener('input', function() {
        sanitize(this, /[^0-9.,$]/g);
      });
    });

    // Integer fields: allow digits only
    ['tcTrays-indi', 'tcExtra-indi', 'tcTrays-small', 'tcExtra-small',
     'tcTrays-large', 'tcExtra-large', 'countSic',
     'tcTrays-boil', 'tcExtra-boil'].forEach(function(id) {
      document.getElementById(id).addEventListener('input', function() {
        sanitize(this, /[^0-9]/g);
      });
    });

    // Temperature fields (dynamic) — delegated listener for sanitization + recalculation
    document.getElementById('tempInputs').addEventListener('input', function(e) {
      if (e.target.tagName === 'INPUT') {
        sanitize(e.target, /[^0-9.]/g);
      }
      debouncedCalculate();
    });

    // Initial calculate() call is below, after all dependencies are defined

    // ── Save Validation ──
    var saveBtn = document.getElementById('saveBtn');
    var saveHint = document.getElementById('saveHint');
    var isSaving = false;

    function updateSaveButtons() {
      // Dough save: disable if all counts are zero and no forecasts
      if (!isSaving) {
        var hasData = getCountValue('indi') > 0 || getCountValue('small') > 0 ||
          getCountValue('large') > 0 || getCountValue('sic') > 0 || getBoilCountValue() > 0 ||
          expandDollar(document.getElementById('todayForecast').value) > 0;
        saveBtn.disabled = !hasData;
        saveHint.style.display = hasData ? 'none' : 'block';
      }
      // Temp save: disable if no temp values entered
      var tempSaveBtn = document.getElementById('tempSaveBtn');
      if (tempSaveBtn.style.display !== 'none' && !tempSaveBtn._isSaving) {
        var hasTemps = false;
        for (var i = 1; i <= tempBatchCount; i++) {
          var wEl = document.getElementById('tempWater-' + i);
          var dEl = document.getElementById('tempDough-' + i);
          if ((wEl && wEl.value.trim()) || (dEl && dEl.value.trim())) { hasTemps = true; break; }
        }
        tempSaveBtn.disabled = !hasTemps;
      }
    }

    function resetSaveBtn(btn, label, delay) {
      setTimeout(function() {
        btn.textContent = label;
        btn.disabled = false;
        btn.classList.remove('success');
        if (btn === saveBtn) { isSaving = false; updateSaveButtons(); }
        else { btn._isSaving = false; updateSaveButtons(); }
      }, delay || 3000);
    }

    function postToSheet(data, btn, successLabel, onSuccess, onError) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
      btn.classList.remove('error', 'success');
      fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(data)
      }).then(function(r) {
        if (r.type === 'opaque' || r.status === 0) {
          btn.textContent = 'Sent! (verify in sheet)';
          btn.classList.add('success');
          resetSaveBtn(btn, successLabel);
          if (onSuccess) onSuccess();
          return;
        }
        return r.text().then(function(txt) {
          var json;
          try { json = JSON.parse(txt); } catch(e) {}
          btn.textContent = (json && json.status === 'ok') ? 'Saved!' : 'Sent! (verify in sheet)';
          btn.classList.add('success');
          resetSaveBtn(btn, successLabel);
          if (onSuccess) onSuccess();
        });
      }).catch(function() {
        fetch(SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(data)
        }).then(function() {
          btn.textContent = 'Sent! (verify in sheet)';
          btn.classList.add('success');
          resetSaveBtn(btn, successLabel);
          if (onSuccess) onSuccess();
        }).catch(function() {
          btn.textContent = 'Error \u2014 tap to retry';
          btn.classList.add('error');
          btn.disabled = false;
          if (onError) onError();
        });
      });
    }

    // ── Save Entry ──
    saveBtn.addEventListener('click', function() {
      if (saveBtn.disabled) return;
      isSaving = true;
      var now = new Date();
      var date = (now.getMonth()+1) + '/' + now.getDate() + '/' + now.getFullYear();
      var data = {
        date: date,
        todayForecast: expandDollar(document.getElementById('todayForecast').value),
        currentSales: expandDollar(document.getElementById('currentSales').value),
        salesLeft: expandDollar(document.getElementById('todayForecast').value) - expandDollar(document.getElementById('currentSales').value),
        tomorrowForecast: expandDollar(document.getElementById('tomorrowForecast').value),
        indiCount: getCountValue('indi'),
        smallCount: getCountValue('small'),
        largeCount: getCountValue('large'),
        sicCount: getCountValue('sic'),
        boilCount: getBoilCountValue(),
        batches: parseInt(document.getElementById('batch-number').textContent) || 0
      };
      postToSheet(data, saveBtn, 'Save Today\'s Count', loadHistory, function() { isSaving = false; });
    });

    // ── History ──
    function loadHistory() {
      var list = document.getElementById('historyList');
      fetch(SCRIPT_URL)
        .then(function(r) { return r.json(); })
        .then(function(rows) {
          if (!rows || !rows.length) {
            list.innerHTML = '<a class="history-link" href="' + SHEET_URL + '" target="_blank">View Full History</a>';
            return;
          }
          var recent = rows.slice(-10).reverse();
          list.innerHTML = '';
          for (var i = 0; i < recent.length; i++) {
            var r = recent[i];
            var date = r['Date'] || r['date'] || '';
            if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
              var ds = date.indexOf('T') === -1 ? date + 'T00:00:00' : date;
              date = new Date(ds).toLocaleDateString('en-US');
            }
            var forecast = r["Today's Forecast"] || r['todayForecast'] || 0;
            var sales = r['Current Sales'] || r['currentSales'] || 0;
            var batches = r['Batches'] || r['batches'] || 0;
            var card = document.createElement('div');
            card.className = 'history-card';
            var left = document.createElement('div');
            var dateEl = document.createElement('div');
            dateEl.className = 'hc-date';
            dateEl.textContent = date;
            var details = document.createElement('div');
            details.className = 'hc-details';
            details.textContent = 'Forecast: $' + (Number(forecast) || 0).toLocaleString() + ' \u00b7 Sales: $' + (Number(sales) || 0).toLocaleString();
            left.appendChild(dateEl);
            left.appendChild(details);
            var batchEl = document.createElement('div');
            batchEl.className = 'hc-batches';
            batchEl.textContent = batches;
            card.appendChild(left);
            card.appendChild(batchEl);
            list.appendChild(card);
          }
          var link = document.createElement('a');
          link.className = 'history-link';
          link.href = SHEET_URL;
          link.target = '_blank';
          link.textContent = 'View Full History';
          list.appendChild(link);
        })
        .catch(function() {
          list.innerHTML = '<a class="history-link" href="' + SHEET_URL + '" target="_blank">View Full History</a>';
        });
    }
    loadHistory();

    // ── Temperature Tracking ──
    var tempBatchCount = 0;
    var tempBatchManuallySet = false;

    function getTodayDate() {
      var now = new Date();
      var m = String(now.getMonth()+1).padStart(2, '0');
      var d = String(now.getDate()).padStart(2, '0');
      return now.getFullYear() + '-' + m + '-' + d;
    }

    function normalizeDate(str) {
      // Handle YYYY-MM-DD from date input
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        var p = str.split('-');
        return parseInt(p[1]) + '/' + parseInt(p[2]) + '/' + p[0];
      }
      // Handle M/D/YYYY from sheet data
      var parts = str.split('/');
      if (parts.length !== 3) return str;
      return parseInt(parts[0]) + '/' + parseInt(parts[1]) + '/' + parts[2];
    }

    // Default date to today
    document.getElementById('tempDate').value = getTodayDate();

    // Batch count field — user edits set manual flag, auto-renders temp rows
    document.getElementById('tempBatchField').addEventListener('input', function() {
      sanitize(this, /[^0-9]/g);
      tempBatchManuallySet = true;
      var n = parseInt(this.value) || 0;
      renderTempInputs(n);
    });

    function renderTempInputs(n) {
      n = Math.min(Math.max(0, n), 10);
      tempBatchCount = n;
      var container = document.getElementById('tempInputs');
      var saveBtn = document.getElementById('tempSaveBtn');
      // Remove excess rows from the end (preserves earlier rows)
      while (container.children.length > n) {
        container.removeChild(container.lastChild);
      }
      // Add missing rows (preserves existing rows with their values)
      for (var i = container.children.length + 1; i <= n; i++) {
        var pair = document.createElement('div');
        pair.className = 'temp-batch-pair';
        var label = document.createElement('div');
        label.className = 'tb-label';
        label.textContent = 'Batch ' + i;
        var inputs = document.createElement('div');
        inputs.className = 'tb-inputs';
        var wDiv = document.createElement('div');
        var wLabel = document.createElement('label');
        wLabel.textContent = 'Water \u00B0F';
        var wInput = document.createElement('input');
        wInput.type = 'text'; wInput.id = 'tempWater-' + i;
        wInput.inputMode = 'decimal'; wInput.placeholder = '0';
        wDiv.appendChild(wLabel); wDiv.appendChild(wInput);
        var dDiv = document.createElement('div');
        var dLabel = document.createElement('label');
        dLabel.textContent = 'Dough \u00B0F';
        var dInput = document.createElement('input');
        dInput.type = 'text'; dInput.id = 'tempDough-' + i;
        dInput.inputMode = 'decimal'; dInput.placeholder = '0';
        dDiv.appendChild(dLabel); dDiv.appendChild(dInput);
        inputs.appendChild(wDiv); inputs.appendChild(dDiv);
        pair.appendChild(label); pair.appendChild(inputs);
        container.appendChild(pair);
      }
      saveBtn.style.display = n > 0 ? 'block' : 'none';
      updateSaveButtons();
    }

    function searchRowForDate(rows, date) {
      for (var i = 0; i < rows.length; i++) {
        var rd = rows[i]['Date'] || rows[i]['date'] || '';
        if (typeof rd === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rd)) {
          var ds = rd.indexOf('T') === -1 ? rd + 'T00:00:00' : rd;
          rd = new Date(ds).toLocaleDateString('en-US');
        } else if (rd instanceof Date) {
          rd = (rd.getMonth()+1) + '/' + rd.getDate() + '/' + rd.getFullYear();
        }
        if (normalizeDate(String(rd)) === date) {
          return rows[i];
        }
      }
      return null;
    }

    function getField(row, sheetName, camelName) {
      // Try exact names first
      var v = row[sheetName];
      if (v === undefined || v === null) v = row[camelName];
      // Case-insensitive exact match
      if (v === undefined || v === null) {
        var lower = sheetName.toLowerCase().replace(/\s+/g, '');
        for (var k in row) {
          if (row.hasOwnProperty(k) && k.toLowerCase().replace(/\s+/g, '') === lower) {
            v = row[k];
            break;
          }
        }
      }
      if (v === undefined || v === null) v = 0;
      return v;
    }

    function toShorthand(n) {
      n = Number(n) || 0;
      if (n === 0) return '';
      if (n >= 1000) return String(n / 1000);
      return String(n);
    }

    function fillFieldsFromData(row) {
      // Fill dollar fields with shorthand
      document.getElementById('currentSales').value = toShorthand(getField(row, 'Current Sales', 'currentSales'));
      document.getElementById('todayForecast').value = toShorthand(getField(row, "Today's Forecast", 'todayForecast'));
      document.getElementById('tomorrowForecast').value = toShorthand(getField(row, "Tomorrow's Forecast", 'tomorrowForecast'));

      // Fill dough counts — put total as singles, 0 trays
      var indi = Number(getField(row, 'Indi Count', 'indiCount')) || 0;
      document.getElementById('tcTrays-indi').value = '0';
      document.getElementById('tcExtra-indi').value = indi ? String(indi) : '';

      var small = Number(getField(row, 'Small Count', 'smallCount')) || 0;
      document.getElementById('tcTrays-small').value = '0';
      document.getElementById('tcExtra-small').value = small ? String(small) : '';

      var large = Number(getField(row, 'Large Count', 'largeCount')) || 0;
      document.getElementById('tcTrays-large').value = '0';
      document.getElementById('tcExtra-large').value = large ? String(large) : '';

      var sic = Number(getField(row, 'Sic Count', 'sicCount')) || 0;
      document.getElementById('countSic').value = sic ? String(sic) : '';

      var boil = Number(getField(row, 'Boil Count', 'boilCount')) || 0;
      document.getElementById('tcTrays-boil').value = '0';
      document.getElementById('tcExtra-boil').value = boil ? String(boil) : '';

      // Trigger recalculation
      calculate();
    }

    function fillTempFields(row, batchCount) {
      for (var i = 1; i <= batchCount; i++) {
        var wEl = document.getElementById('tempWater-' + i);
        var dEl = document.getElementById('tempDough-' + i);
        if (!wEl || !dEl) continue;
        // Try sheet headers like "Water 1", "Dough 1" or "water1", "dough1"
        var w = row['Water ' + i] || row['water' + i] || '';
        var d = row['Dough ' + i] || row['dough' + i] || '';
        if (w) wEl.value = String(w);
        if (d) dEl.value = String(d);
      }
    }

    function handleLoadedData(rowData, date, status) {
      if (!rowData) {
        status.innerHTML = '<div class="temp-message error">No dough count saved for this date \u2014 enter batch count manually</div>';
        return;
      }

      // Block auto-sync while we fill everything
      isLoading = true;
      tempBatchManuallySet = false;

      // Fill all dough/sales fields and recalculate
      fillFieldsFromData(rowData);

      var batches = parseInt(getField(rowData, 'Batches', 'batches')) || 0;
      batches = Math.min(batches, 10);
      document.getElementById('tempBatchField').value = batches;
      if (batches > 0) {
        status.innerHTML = '<div class="temp-message">' + batches + ' batch' + (batches > 1 ? 'es' : '') + ' found for ' + date + ' \u2014 fields restored</div>';
        renderTempInputs(batches);
        fillTempFields(rowData, batches);
      } else {
        status.innerHTML = '<div class="temp-message error">No batch count for this date</div>';
        renderTempInputs(0);
      }

      // Sync lastAutoBatches so auto-sync doesn't re-trigger on next keystroke
      var batchEl = document.getElementById('batch-number');
      lastAutoBatches = batchEl ? Math.min(parseInt(batchEl.textContent) || 0, 10) : 0;

      // Unblock auto-sync
      isLoading = false;
    }

    // Load button — fetch batch count for a date
    document.getElementById('tempLoadBtn').addEventListener('click', function() {
      var rawDate = document.getElementById('tempDate').value.trim();
      if (!rawDate) return;
      var date = normalizeDate(rawDate);
      var status = document.getElementById('tempStatus');
      var loadBtn = document.getElementById('tempLoadBtn');
      status.innerHTML = '<div class="temp-message">Loading...</div>';
      loadBtn.disabled = true;
      loadBtn.textContent = '...';
      renderTempInputs(0);

      var url = SCRIPT_URL + '?date=' + encodeURIComponent(date);
      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          loadBtn.disabled = false;
          loadBtn.textContent = 'Load';

          // Handle {status: "found", data: {...}} response
          if (data && data.status === 'found' && data.data) {
            handleLoadedData(data.data, date, status);
            return;
          }

          // Handle array response (search client-side)
          if (Array.isArray(data)) {
            var rowData = searchRowForDate(data, date);
            handleLoadedData(rowData, date, status);
            return;
          }

          // {status: "not_found"} or unrecognized — fallback: fetch ALL rows
          return fetch(SCRIPT_URL)
            .then(function(r2) { return r2.json(); })
            .then(function(rows) {
              var rowData = searchRowForDate(rows, date);
              handleLoadedData(rowData, date, status);
            });
        })
        .catch(function() {
          fetch(SCRIPT_URL)
            .then(function(r) { return r.json(); })
            .then(function(rows) {
              loadBtn.disabled = false;
              loadBtn.textContent = 'Load';
              var rowData = searchRowForDate(rows, date);
              handleLoadedData(rowData, date, status);
            })
            .catch(function() {
              loadBtn.disabled = false;
              loadBtn.textContent = 'Load';
              status.innerHTML = '<div class="temp-message error">Could not load data</div>';
            });
        });
    });

    // Auto-sync: when calculate() runs and batch count changes, update temp batch field if date is today
    var lastAutoBatches = 0;
    function syncTempBatches() {
      if (isLoading) return;
      if (tempBatchManuallySet) return;
      var batchEl = document.getElementById('batch-number');
      var currentBatches = batchEl ? parseInt(batchEl.textContent) || 0 : 0;
      currentBatches = Math.min(currentBatches, 10);
      var dateField = document.getElementById('tempDate');
      if (dateField.value.trim() === getTodayDate() && currentBatches !== lastAutoBatches) {
        lastAutoBatches = currentBatches;
        document.getElementById('tempBatchField').value = currentBatches;
        renderTempInputs(currentBatches);
        var status = document.getElementById('tempStatus');
        if (currentBatches > 0) {
          status.innerHTML = '<div class="temp-message">' + currentBatches + ' batch' + (currentBatches > 1 ? 'es' : '') + ' from current count</div>';
        } else {
          status.innerHTML = '';
        }
      }
    }

    // Run once on load so results are always visible
    calculate();

    // Save Temps
    document.getElementById('tempSaveBtn').addEventListener('click', function() {
      var btn = document.getElementById('tempSaveBtn');
      if (btn.disabled) return;
      btn._isSaving = true;
      var date = normalizeDate(document.getElementById('tempDate').value.trim());
      var temps = [];
      for (var i = 1; i <= tempBatchCount; i++) {
        var wEl = document.getElementById('tempWater-' + i);
        var dEl = document.getElementById('tempDough-' + i);
        temps.push({
          water: parseFloat(wEl ? wEl.value : '') || 0,
          dough: parseFloat(dEl ? dEl.value : '') || 0
        });
      }
      var data = { type: 'temps', date: date, temps: temps };
      postToSheet(data, btn, 'Save Temperatures', null, function() { btn._isSaving = false; });
    });

    // ── Reset ──
    document.getElementById('resetBtn').addEventListener('click', function() {
      document.querySelectorAll('input[type="text"]').forEach(function(input) { input.value = ''; });
      // Reset save states
      isSaving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Today\'s Count';
      saveBtn.classList.remove('error', 'success');
      var tempSaveBtnEl = document.getElementById('tempSaveBtn');
      tempSaveBtnEl._isSaving = false;
      // Reset temp section
      document.getElementById('tempDate').value = getTodayDate();
      document.getElementById('tempBatchField').value = '0';
      document.getElementById('tempStatus').innerHTML = '';
      tempBatchManuallySet = false;
      renderTempInputs(0);
      lastAutoBatches = 0;
      calculate();
    });
