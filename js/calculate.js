    function lookup(dollarAmount) {
      // Find smallest threshold >= dollarAmount; cap at highest row
      for (const entry of DOUGH_TABLE) {
        if (entry.threshold >= dollarAmount) return entry;
      }
      return DOUGH_TABLE[DOUGH_TABLE.length - 1];
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
