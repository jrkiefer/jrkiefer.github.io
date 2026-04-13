    var isLoading = false;

    // Live calculation on every input change (debounced)
    document.querySelectorAll('input[type="text"]').forEach(function(input) {
      input.addEventListener('input', debouncedCalculate);
    });

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
