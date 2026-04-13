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

    // Run once on load so results are always visible
    calculate();

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
