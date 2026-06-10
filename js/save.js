    // js/save.js — depends on: config.js, utils.js, calculate.js
    // ── Save Validation ──
    var saveBtn = document.getElementById('saveBtn');
    var saveHint = document.getElementById('saveHint');
    var isSaving = false;

    // 2 PM auto-save state. Armed by input events when the required fields
    // are all filled; first fire after 15s of idle, subsequent fires after 30s
    // (manager already proved they're paying attention, so wait longer).
    var autoSaveTimer = null;
    var autoSavedOnce = false;

    // Read a calculated "balls to make" value from the breakdown DOM.
    // calculate() always runs before save (debounced or sync), so these are current.
    function readMakeNum(elId) {
      var el = document.getElementById(elId);
      return el ? (parseInt(el.textContent, 10) || 0) : 0;
    }

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
        var msgEl = document.getElementById('msg_' + fieldId);
        if (!input || !msgEl) continue;

        // Validation ring goes on the .dollar-field wrapper so it surrounds the composite field
        var wrap = input.closest('.dollar-field') || input;
        wrap.classList.remove('field-invalid', 'field-warning');
        msgEl.classList.remove('error', 'warning');
        msgEl.textContent = '';

        if (validation.errors[fieldId]) {
          wrap.classList.add('field-invalid');
          msgEl.classList.add('error');
          msgEl.textContent = validation.errors[fieldId];
        } else if (validation.warnings[fieldId]) {
          wrap.classList.add('field-warning');
          msgEl.classList.add('warning');
          msgEl.textContent = validation.warnings[fieldId];
        }
      }
    }

    function updateSaveButtons() {
      if (!isSaving) {
        var mode = (typeof getMode === 'function') ? getMode() : 'twopm';

        if (mode === 'eon') {
          // EON mode: only the eonSales field exists in the sales card. The
          // 2pm dollar-field validation rules don't apply, so just check that
          // at least one count or eonSales has been entered, mirroring the
          // backend's hasCount || hasSales guard.
          var eonInput = document.getElementById('eonSales');
          var eonRaw = eonInput ? eonInput.value : '';
          var hasEonData = expandDollar(eonRaw) > 0 ||
            getCountValue('indi') > 0 || getCountValue('small') > 0 ||
            getCountValue('large') > 0 || getCountValue('sic') > 0 || getBoilCountValue() > 0;
          if (!hasEonData) {
            saveBtn.disabled = true;
            saveHint.textContent = 'Enter EON sales or counts';
            saveHint.classList.remove('error');
            saveHint.style.display = 'block';
          } else {
            saveBtn.disabled = false;
            saveHint.classList.remove('error');
            saveHint.style.display = 'none';
          }
        } else {
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
      }
      // Temp save: disable if no temp values entered
      var tempSaveBtn = document.getElementById('tempSaveBtn');
      if (tempSaveBtn && tempSaveBtn.style.display !== 'none' && !tempSaveBtn._isSaving) {
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

    function postToSheet(data, btn, successLabel, onSuccess, onError, successOverride) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
      btn.classList.remove('error', 'success');
      fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(data)
      }).then(function(r) {
        if (r.type === 'opaque' || r.status === 0) {
          btn.textContent = successOverride || 'Sent! (verify in sheet)';
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
            else if (json.action === 'make_saved') actionText = 'Make saved!';
            else if (json.action === 'eon_created') actionText = 'EON saved row ' + json.row;
            else if (json.action === 'eon_updated') actionText = 'EON updated row ' + json.row;
            btn.textContent = successOverride || actionText;
            btn.classList.add('success');
            // After a successful Save Count, fill the Step-07 make inputs with
            // the current calculated balls-to-make per size so the manager
            // sees solid numbers and only edits sizes that came out different.
            // Skipped for temps_saved / make_saved since they don't change the
            // calc, and skipped if make.js isn't loaded.
            if ((json.action === 'created' || json.action === 'updated') &&
                typeof populateMakeInputs === 'function') {
              populateMakeInputs();
            }
            // After an EON save, render the outlook card (Step 08): per-size
            // have / need / diff vs tomorrow's forecast + a bottom summary.
            // tomorrowForecast is echoed by handleEonPost from the matching
            // Dough Counts row — null when no 2 PM save exists, which the
            // render function turns into a friendly "outlook unavailable" line.
            if ((json.action === 'eon_created' || json.action === 'eon_updated') &&
                typeof renderEonOutlook === 'function') {
              renderEonOutlook(json.tomorrowForecast);
            }
            resetSaveBtn(btn, successLabel);
            if (onSuccess) onSuccess();
          } else if (json && json.status === 'error') {
            btn.textContent = 'Error: ' + (json.message || 'save failed');
            btn.classList.add('error');
            btn.disabled = false;
            if (onError) onError();
          } else {
            btn.textContent = successOverride || 'Sent! (verify in sheet)';
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
          btn.textContent = successOverride || 'Sent! (verify in sheet)';
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

    function buildDoughPayload(date) {
      var indiCount  = getCountValue('indi');
      var smallCount = getCountValue('small');
      var largeCount = getCountValue('large');
      var sicCount   = getCountValue('sic');
      var boilCount  = getBoilCountValue();
      var indiMake  = readMakeNum('row-indi-make');
      var smallMake = readMakeNum('row-small-make');
      var largeMake = readMakeNum('row-large-make');
      var sicMake   = readMakeNum('row-sic-make');
      var boilMake  = readMakeNum('row-boil-make');
      var todayF    = expandDollar(document.getElementById('todayForecast').value);
      var currSales = expandDollar(document.getElementById('currentSales').value);
      return {
        type: 'dough',
        date: date,
        todayForecast: todayF,
        currentSales: currSales,
        salesLeft: todayF - currSales,
        tomorrowForecast: expandDollar(document.getElementById('tomorrowForecast').value),
        indiCount: indiCount,
        smallCount: smallCount,
        largeCount: largeCount,
        sicCount: sicCount,
        boilCount: boilCount,
        batches: parseInt(document.getElementById('heroBatchNum').textContent, 10) || 0,
        makes: { indi: indiMake, small: smallMake, large: largeMake, sic: sicMake, boil: boilMake },
        finals: {
          indi:  indiCount  + indiMake,
          small: smallCount + smallMake,
          large: largeCount + largeMake,
          sic:   sicCount   + sicMake,
          boil:  boilCount  + boilMake
        }
      };
    }

    // ── 2 PM Auto-save ──
    // Fires only in 2 PM mode once Current Sales + both forecasts + Indi/Small/
    // Large counts are all positive (Sicilian and Boil can stay at 0 — managers
    // commonly leave them empty if there's none in the case). Validation must
    // also be passing (saveBtn enabled).
    function isReadyForAutoSave() {
      if (typeof getMode === 'function' && getMode() !== 'twopm') return false;
      if (isSaving || saveBtn.disabled) return false;
      if (expandDollar(document.getElementById('currentSales').value) <= 0) return false;
      if (expandDollar(document.getElementById('todayForecast').value) <= 0) return false;
      if (expandDollar(document.getElementById('tomorrowForecast').value) <= 0) return false;
      if (getCountValue('indi')  <= 0) return false;
      if (getCountValue('small') <= 0) return false;
      if (getCountValue('large') <= 0) return false;
      return true;
    }

    function armAutoSaveTimer() {
      if (!isReadyForAutoSave()) { disarmAutoSaveTimer(); return; }
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(performAutoSave, autoSavedOnce ? 30000 : 15000);
    }

    function disarmAutoSaveTimer() {
      if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
    }

    function performAutoSave() {
      autoSaveTimer = null;
      // Re-check at fire time: user may have cleared a field or switched tabs
      // during the wait, or a manual save may have started.
      if (!isReadyForAutoSave()) return;
      isSaving = true;
      var dateEl = document.getElementById('activeDate');
      var date = dateEl && dateEl.value.trim() ? normalizeDate(dateEl.value.trim()) : normalizeDate(getTodayDate());
      var dateParts = date.split('/');
      if (dateParts.length === 3) {
        var selected = new Date(parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
        var today = new Date(); today.setHours(0,0,0,0); selected.setHours(0,0,0,0);
        var diffDays = Math.round((selected - today) / 86400000);
        if (diffDays > 7 || diffDays < -365) { isSaving = false; return; }
      }
      var data = buildDoughPayload(date);
      postToSheet(data, saveBtn,
        'Compute / Save',
        function() { autoSavedOnce = true; loadHistory(); },   // success: flip the flag so next auto-save uses 30s
        function() { isSaving = false; },                      // error: just clear isSaving so user can retry
        'Auto-saved ✓');
    }

    // ── Save Entry ──
    saveBtn.addEventListener('click', function() {
      if (saveBtn.disabled) return;
      var mode = (typeof getMode === 'function') ? getMode() : 'twopm';

      // Manual save short-circuits auto-save: drop any pending timer and
      // remember that one save has happened so the next auto-save uses 30s.
      disarmAutoSaveTimer();
      autoSavedOnce = true;

      // Dollar validation only applies to the 2 PM card's three fields.
      if (mode !== 'eon') {
        var validation = validateDollarFields();
        if (validation.hasErrors) {
          applyValidationToDOM(validation);
          updateSaveButtons();
          return;
        }
      }
      isSaving = true;
      var dateEl = document.getElementById('activeDate');
      var date = dateEl && dateEl.value.trim() ? normalizeDate(dateEl.value.trim()) : normalizeDate(getTodayDate());
      // Reject dates that are obviously wrong (>1 year ago or >7 days ahead)
      var dateParts = date.split('/');
      var resetLabel = (mode === 'eon') ? 'Compare to Tomorrow' : 'Compute / Save';
      if (dateParts.length === 3) {
        var selected = new Date(parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
        var today = new Date(); today.setHours(0,0,0,0); selected.setHours(0,0,0,0);
        var diffDays = Math.round((selected - today) / 86400000);
        if (diffDays > 7 || diffDays < -365) {
          saveBtn.textContent = diffDays > 7 ? 'Date is too far in the future' : 'Date is too far in the past';
          saveBtn.classList.add('error');
          resetSaveBtn(saveBtn, resetLabel, 3000);
          return;
        }
      }

      var data;
      if (mode === 'eon') {
        data = {
          type: 'eon',
          date: date,
          eonSales: expandDollar(document.getElementById('eonSales').value),
          indiCount: getCountValue('indi'),
          smallCount: getCountValue('small'),
          largeCount: getCountValue('large'),
          sicCount: getCountValue('sic'),
          boilCount: getBoilCountValue()
        };
        postToSheet(data, saveBtn, 'Compare to Tomorrow', null, function() { isSaving = false; });
        return;
      }

      data = buildDoughPayload(date);
      postToSheet(data, saveBtn, 'Compute / Save', loadHistory, function() { isSaving = false; });
    });
