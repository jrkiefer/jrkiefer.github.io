    // js/main.js — depends on: all other JS files (loaded last)

    // Masthead date — e.g. "MON · APR 21 2026"
    (function setMastheadDate() {
      var el = document.getElementById('mastheadDate');
      if (!el) return;
      var now = new Date();
      var DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
      var MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      el.textContent = DOW[now.getDay()] + ' · ' + MON[now.getMonth()] + ' ' + now.getDate() + ' ' + now.getFullYear();
    })();

    // Live calculation on every input change (debounced); also re-arm the
    // 2 PM auto-save timer so any keystroke pushes the auto-save window out.
    document.querySelectorAll('input[type="text"]').forEach(function(input) {
      input.addEventListener('input', debouncedCalculate);
      input.addEventListener('input', armAutoSaveTimer);
    });

    // Dollar fields: allow digits, decimal, comma, dollar sign
    ['currentSales', 'todayForecast', 'tomorrowForecast', 'eonSales', 'outlookForecast'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function() {
        sanitize(this, /[^0-9.,$]/g);
        stripExtraDots(this);
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
        stripExtraDots(e.target);
      }
      debouncedCalculate();
    });

    // Run once on load so results are always visible
    calculate();

    // ── Reset ──
    document.getElementById('resetBtn').addEventListener('click', function() {
      document.querySelectorAll('input[type="text"]').forEach(function(input) { input.value = ''; });

      // Clear inline dollar expansions
      ['disp_currentSales', 'disp_todayForecast', 'disp_tomorrowForecast', 'disp_eonSales', 'disp_outlookForecast'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.textContent = '';
      });

      // Clear field validation rings + messages
      ['currentSales', 'todayForecast', 'tomorrowForecast', 'eonSales'].forEach(function(id) {
        var input = document.getElementById(id);
        if (!input) return;
        var wrap = input.closest('.dollar-field') || input;
        wrap.classList.remove('field-invalid', 'field-warning');
        var msg = document.getElementById('msg_' + id);
        if (msg) { msg.classList.remove('error', 'warning'); msg.textContent = ''; }
      });

      // Hide set-out alert banner
      var alert = document.getElementById('setoutAlert');
      if (alert) { alert.classList.add('hidden'); }

      // Reset save states + flip back to the default 2 PM tab
      if (typeof setMode === 'function') setMode('twopm');
      isSaving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Compute / Save';
      saveBtn.classList.remove('error', 'success');
      // Disarm any pending auto-save and reset the once-flag so the next
      // time conditions are met we use the 15s window again.
      if (typeof disarmAutoSaveTimer === 'function') disarmAutoSaveTimer();
      autoSavedOnce = false;
      var tempSaveBtnEl = document.getElementById('tempSaveBtn');
      tempSaveBtnEl._isSaving = false;
      tempSaveBtnEl.disabled = false;
      tempSaveBtnEl.textContent = 'Save Temperatures';
      tempSaveBtnEl.classList.remove('error', 'success');
      var makeSaveBtnEl = document.getElementById('makeSaveBtn');
      if (makeSaveBtnEl) {
        makeSaveBtnEl._isSaving = false;
        makeSaveBtnEl.disabled = false;
        makeSaveBtnEl.textContent = 'Save Actual Make';
        makeSaveBtnEl.classList.remove('error', 'success');
      }
      var makeStatusEl = document.getElementById('makeStatus');
      if (makeStatusEl) { makeStatusEl.textContent = ''; makeStatusEl.classList.remove('error'); }

      // Reset active date and temp section
      document.getElementById('activeDate').value = getTodayDate();
      document.getElementById('activeDateStatus').innerHTML = '';
      document.getElementById('tempBatchField').value = '0';
      tempBatchManuallySet = false;
      renderTempInputs(0);
      lastAutoBatches = 0;
      if (typeof hideEonOutlook === 'function') hideEonOutlook();
      calculate();
    });
