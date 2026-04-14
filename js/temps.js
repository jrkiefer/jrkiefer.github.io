    // js/temps.js — depends on: config.js, utils.js, calculate.js, save.js
    var isLoading = false;

    // ── Temperature Tracking ──
    var tempBatchCount = 0;
    var tempBatchManuallySet = false;
    var lastAutoBatches = 0;

    // Default active date to today
    document.getElementById('activeDate').value = getTodayDate();

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

    function fillFieldsFromData(row) {
      // Fill dollar fields with shorthand
      document.getElementById('currentSales').value = toShorthand(getField(row, 'Current Sales', 'currentSales'));
      document.getElementById('todayForecast').value = toShorthand(getField(row, "Today's Forecast", 'todayForecast'));
      document.getElementById('tomorrowForecast').value = toShorthand(getField(row, "Tomorrow's Forecast", 'tomorrowForecast'));

      // Fill dough counts — split into trays + singles for readability
      var sizes = ['indi', 'small', 'large'];
      var sheetNames = ['Indi Count', 'Small Count', 'Large Count'];
      var camelNames = ['indiCount', 'smallCount', 'largeCount'];
      for (var i = 0; i < sizes.length; i++) {
        var count = Number(getField(row, sheetNames[i], camelNames[i])) || 0;
        var perTray = PER_TRAY[sizes[i]];
        var trays = Math.floor(count / perTray);
        var singles = count % perTray;
        document.getElementById('tcTrays-' + sizes[i]).value = trays ? String(trays) : '';
        document.getElementById('tcExtra-' + sizes[i]).value = singles ? String(singles) : '';
      }

      var sic = Number(getField(row, 'Sic Count', 'sicCount')) || 0;
      document.getElementById('countSic').value = sic ? String(sic) : '';

      var boil = Number(getField(row, 'Boil Count', 'boilCount')) || 0;
      var boilTrays = Math.floor(boil / BOIL_PER_TRAY);
      var boilSingles = boil % BOIL_PER_TRAY;
      document.getElementById('tcTrays-boil').value = boilTrays ? String(boilTrays) : '';
      document.getElementById('tcExtra-boil').value = boilSingles ? String(boilSingles) : '';

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

    // Clears all form fields without triggering calculate() — caller is responsible
    function clearAllFields() {
      document.getElementById('currentSales').value = '';
      document.getElementById('todayForecast').value = '';
      document.getElementById('tomorrowForecast').value = '';
      document.getElementById('tcTrays-indi').value = '';
      document.getElementById('tcExtra-indi').value = '';
      document.getElementById('tcTrays-small').value = '';
      document.getElementById('tcExtra-small').value = '';
      document.getElementById('tcTrays-large').value = '';
      document.getElementById('tcExtra-large').value = '';
      document.getElementById('countSic').value = '';
      document.getElementById('tcTrays-boil').value = '';
      document.getElementById('tcExtra-boil').value = '';
      document.getElementById('tempBatchField').value = '0';
      renderTempInputs(0);
      tempBatchManuallySet = false;
      lastAutoBatches = 0;
    }

    function activeHandleLoadedData(rowData, date, status) {
      if (!rowData) {
        status.innerHTML = '<div class="temp-message error">No data saved for ' + date + '</div>';
        return;
      }

      tempBatchManuallySet = false;

      // Fill all dough/sales fields and recalculate
      fillFieldsFromData(rowData);

      var batches = parseInt(getField(rowData, 'Batches', 'batches')) || 0;
      batches = Math.min(batches, 10);
      document.getElementById('tempBatchField').value = batches;
      if (batches > 0) {
        status.innerHTML = '<div class="temp-message">Loaded ' + date + ' \u2014 ' + batches + ' batch' + (batches > 1 ? 'es' : '') + '</div>';
        renderTempInputs(batches);
        fillTempFields(rowData, batches);
      } else {
        status.innerHTML = '<div class="temp-message">Loaded ' + date + ' \u2014 no batches</div>';
        renderTempInputs(0);
      }

      // Sync lastAutoBatches so auto-sync doesn't re-trigger on next keystroke
      var batchEl = document.getElementById('batch-number');
      lastAutoBatches = batchEl ? Math.min(parseInt(batchEl.textContent) || 0, 10) : 0;
    }

    // Load button — always confirms, then fetches saved data for the active date
    document.getElementById('activeLoadBtn').addEventListener('click', function() {
      var rawDate = document.getElementById('activeDate').value.trim();
      if (!rawDate) return;
      var date = normalizeDate(rawDate);
      var status = document.getElementById('activeDateStatus');
      var loadBtn = document.getElementById('activeLoadBtn');

      // Always confirm — loading replaces everything
      if (!window.confirm('Load saved data for ' + date + '?\nThis will replace all current fields.')) {
        return;
      }

      // Block auto-sync for the entire load sequence
      isLoading = true;

      status.innerHTML = '<div class="temp-message">Loading...</div>';
      loadBtn.disabled = true;
      loadBtn.textContent = '...';

      clearAllFields();

      var url = SCRIPT_URL + '?date=' + encodeURIComponent(date);
      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          loadBtn.disabled = false;
          loadBtn.textContent = 'Load';

          // Handle {status: "found", data: {...}} response
          if (data && data.status === 'found' && data.data) {
            activeHandleLoadedData(data.data, date, status);
            isLoading = false;
            return;
          }

          // Handle array response (search client-side)
          if (Array.isArray(data)) {
            var rowData = searchRowForDate(data, date);
            activeHandleLoadedData(rowData, date, status);
            isLoading = false;
            return;
          }

          // {status: "not_found"} or unrecognized — fallback: fetch ALL rows
          return fetch(SCRIPT_URL)
            .then(function(r2) { return r2.json(); })
            .then(function(rows) {
              var rowData = searchRowForDate(rows, date);
              activeHandleLoadedData(rowData, date, status);
              isLoading = false;
            });
        })
        .catch(function() {
          fetch(SCRIPT_URL)
            .then(function(r) { return r.json(); })
            .then(function(rows) {
              loadBtn.disabled = false;
              loadBtn.textContent = 'Load';
              var rowData = searchRowForDate(rows, date);
              activeHandleLoadedData(rowData, date, status);
              isLoading = false;
            })
            .catch(function() {
              loadBtn.disabled = false;
              loadBtn.textContent = 'Load';
              status.innerHTML = '<div class="temp-message error">Could not load data</div>';
              isLoading = false;
            });
        });
    });

    // Auto-sync: when calculate() runs and batch count changes, update temp batch field if date is today
    function syncTempBatches() {
      if (isLoading) return;
      if (tempBatchManuallySet) return;
      var batchEl = document.getElementById('batch-number');
      var currentBatches = batchEl ? parseInt(batchEl.textContent) || 0 : 0;
      currentBatches = Math.min(currentBatches, 10);
      var dateField = document.getElementById('activeDate');
      if (dateField.value.trim() === getTodayDate() && currentBatches !== lastAutoBatches) {
        lastAutoBatches = currentBatches;
        document.getElementById('tempBatchField').value = currentBatches;
        renderTempInputs(currentBatches);
        var status = document.getElementById('activeDateStatus');
        if (currentBatches > 0) {
          status.innerHTML = '<div class="temp-message">' + currentBatches + ' batch' + (currentBatches > 1 ? 'es' : '') + ' from current count</div>';
        } else {
          status.innerHTML = '';
        }
      }
    }

    // Save Temps
    document.getElementById('tempSaveBtn').addEventListener('click', function() {
      var btn = document.getElementById('tempSaveBtn');
      if (btn.disabled) return;
      btn._isSaving = true;
      var date = normalizeDate(document.getElementById('activeDate').value.trim());
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
