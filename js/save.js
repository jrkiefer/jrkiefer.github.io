    // js/save.js — depends on: config.js, utils.js, calculate.js
    // ── Save Validation ──
    var saveBtn = document.getElementById('saveBtn');
    var saveHint = document.getElementById('saveHint');
    var isSaving = false;

    function validateDollarFields() {
      var errors = {};
      var warnings = {};

      var currentSalesRaw = document.getElementById('currentSales').value.trim();
      var todayRaw = document.getElementById('todayForecast').value.trim();
      var tomorrowRaw = document.getElementById('tomorrowForecast').value.trim();

      var currentSales = expandDollar(currentSalesRaw);
      var today = expandDollar(todayRaw);
      var tomorrow = expandDollar(tomorrowRaw);

      // Today's Forecast
      if (!todayRaw) {
        errors.todayForecast = "Enter Today's Forecast before saving";
      } else if (today < 1000) {
        errors.todayForecast = "Today's Forecast must be at least $1,000";
      } else if (today > 22000) {
        errors.todayForecast = "Today's Forecast must be at most $22,000";
      } else if (today < 3750) {
        warnings.todayForecast = "Today's Forecast is below the Dough Bible range \u2014 the calculation will use the lowest row";
      } else if (today > 20750) {
        warnings.todayForecast = "Today's Forecast is above the Dough Bible range \u2014 the calculation will use the highest row";
      }

      // Tomorrow's Forecast
      if (!tomorrowRaw) {
        errors.tomorrowForecast = "Enter Tomorrow's Forecast before saving";
      } else if (tomorrow < 1000) {
        errors.tomorrowForecast = "Tomorrow's Forecast must be at least $1,000";
      } else if (tomorrow > 22000) {
        errors.tomorrowForecast = "Tomorrow's Forecast must be at most $22,000";
      } else if (tomorrow < 3750) {
        warnings.tomorrowForecast = "Tomorrow's Forecast is below the Dough Bible range \u2014 the calculation will use the lowest row";
      } else if (tomorrow > 20750) {
        warnings.tomorrowForecast = "Tomorrow's Forecast is above the Dough Bible range \u2014 the calculation will use the highest row";
      }

      // Current Sales
      if (currentSalesRaw) {
        if (currentSales < 0) {
          errors.currentSales = "Current Sales cannot be negative";
        } else if (currentSales > 22000) {
          errors.currentSales = "Current Sales must be at most $22,000";
        } else if (todayRaw && currentSales > today) {
          errors.currentSales = "Current Sales cannot exceed Today's Forecast";
        }
      }

      var hasErrors = Object.keys(errors).length > 0;
      var hasWarnings = Object.keys(warnings).length > 0;
      return { hasErrors: hasErrors, hasWarnings: hasWarnings, errors: errors, warnings: warnings };
    }

    function applyValidationToDOM(validation) {
      var fields = ['currentSales', 'todayForecast', 'tomorrowForecast'];
      for (var i = 0; i < fields.length; i++) {
        var fieldId = fields[i];
        var input = document.getElementById(fieldId);
        var msgEl = document.getElementById('msg' + fieldId.charAt(0).toUpperCase() + fieldId.slice(1));
        if (!input || !msgEl) continue;

        input.classList.remove('field-invalid', 'field-warning');
        msgEl.classList.remove('error', 'warning');
        msgEl.textContent = '';

        if (validation.errors[fieldId]) {
          input.classList.add('field-invalid');
          msgEl.classList.add('error');
          msgEl.textContent = validation.errors[fieldId];
        } else if (validation.warnings[fieldId]) {
          input.classList.add('field-warning');
          msgEl.classList.add('warning');
          msgEl.textContent = validation.warnings[fieldId];
        }
      }
    }

    function updateSaveButtons() {
      if (!isSaving) {
        var validation = validateDollarFields();
        applyValidationToDOM(validation);

        var hasData = getCountValue('indi') > 0 || getCountValue('small') > 0 ||
          getCountValue('large') > 0 || getCountValue('sic') > 0 || getBoilCountValue() > 0 ||
          expandDollar(document.getElementById('todayForecast').value) > 0;

        if (validation.hasErrors) {
          saveBtn.disabled = true;
          saveHint.textContent = 'Fix errors above before saving';
          saveHint.classList.add('error');
          saveHint.style.display = 'block';
        } else if (!hasData) {
          saveBtn.disabled = true;
          saveHint.textContent = 'Enter dough counts first';
          saveHint.classList.remove('error');
          saveHint.style.display = 'block';
        } else {
          saveBtn.disabled = false;
          saveHint.classList.remove('error');
          saveHint.style.display = 'none';
        }
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
          if (json && json.status === 'ok') {
            var actionText = 'Saved!';
            if (json.action === 'updated') actionText = 'Updated row ' + json.row;
            else if (json.action === 'created') actionText = 'Saved row ' + json.row;
            else if (json.action === 'temps_saved') actionText = 'Temps saved!';
            btn.textContent = actionText;
            btn.classList.add('success');
            resetSaveBtn(btn, successLabel);
            if (onSuccess) onSuccess();
          } else if (json && json.status === 'error') {
            btn.textContent = 'Error: ' + (json.message || 'save failed');
            btn.classList.add('error');
            btn.disabled = false;
            if (onError) onError();
          } else {
            btn.textContent = 'Sent! (verify in sheet)';
            btn.classList.add('success');
            resetSaveBtn(btn, successLabel);
            if (onSuccess) onSuccess();
          }
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
      // Defensive: re-validate before saving in case button state is stale
      var validation = validateDollarFields();
      if (validation.hasErrors) {
        applyValidationToDOM(validation);
        updateSaveButtons();
        return;
      }
      isSaving = true;
      var dateEl = document.getElementById('activeDate');
      var date = dateEl && dateEl.value.trim() ? normalizeDate(dateEl.value.trim()) : normalizeDate(getTodayDate());
      // Reject dates that are obviously wrong (>1 year ago or >7 days ahead)
      var dateParts = date.split('/');
      if (dateParts.length === 3) {
        var selected = new Date(parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
        var today = new Date(); today.setHours(0,0,0,0); selected.setHours(0,0,0,0);
        var diffDays = Math.round((selected - today) / 86400000);
        if (diffDays > 7 || diffDays < -365) {
          saveBtn.textContent = diffDays > 7 ? 'Date is too far in the future' : 'Date is too far in the past';
          saveBtn.classList.add('error');
          resetSaveBtn(saveBtn, 'Save Count', 3000);
          return;
        }
      }
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
      postToSheet(data, saveBtn, 'Save Count', loadHistory, function() { isSaving = false; });
    });
