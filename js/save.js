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
