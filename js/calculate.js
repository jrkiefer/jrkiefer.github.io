    // js/calculate.js — depends on: config.js, utils.js, bible.js
    function lookup(dollarAmount) {
      // Find smallest threshold >= dollarAmount; cap at highest row
      for (var i = 0; i < DOUGH_TABLE.length; i++) {
        if (DOUGH_TABLE[i].threshold >= dollarAmount) return DOUGH_TABLE[i];
      }
      return DOUGH_TABLE[DOUGH_TABLE.length - 1];
    }

    function lookupIndex(dollarAmount) {
      for (var i = 0; i < DOUGH_TABLE.length; i++) {
        if (DOUGH_TABLE[i].threshold >= dollarAmount) return i;
      }
      return DOUGH_TABLE.length - 1;
    }

    function getCountValue(type) {
      if (type === 'sic') return parseInt(document.getElementById('countSic').value, 10) || 0;
      var fullTrays = parseInt(document.getElementById('tcTrays-' + type).value, 10) || 0;
      var extra = parseInt(document.getElementById('tcExtra-' + type).value, 10) || 0;
      return (fullTrays * PER_TRAY[type]) + extra;
    }

    function getCount(type) {
      var total = getCountValue(type);
      if (type !== 'sic') {
        var strong = document.getElementById('tcTotal-' + type).querySelector('strong');
        if (strong) strong.textContent = total;
      }
      return total;
    }

    function getBoilCountValue() {
      var fullTrays = parseInt(document.getElementById('tcTrays-boil').value, 10) || 0;
      var extra = parseInt(document.getElementById('tcExtra-boil').value, 10) || 0;
      return (fullTrays * BOIL_PER_TRAY) + extra;
    }

    function getBoilCount() {
      var total = getBoilCountValue();
      var strong = document.getElementById('tcTotal-boil').querySelector('strong');
      if (strong) strong.textContent = total;
      return total;
    }

    function renderRecipe(ballsToMake, boilMake) {
      var list = document.getElementById('recipeList');
      if (!list) return;
      list.innerHTML = '';
      var anyPositive = false;
      var items = [];
      for (var i = 0; i < TYPES.length; i++) {
        var t = TYPES[i];
        items.push({ type: t, label: TYPE_SHORT[t], count: ballsToMake[t] });
        if (ballsToMake[t] > 0) anyPositive = true;
      }
      items.push({ type: 'boil', label: 'Boil', count: boilMake });
      if (boilMake > 0) anyPositive = true;

      if (!anyPositive) {
        var empty = document.createElement('div');
        empty.className = 'recipe-empty';
        empty.textContent = "Nothing to make — you're set";
        list.appendChild(empty);
        return;
      }

      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        var chip = document.createElement('span');
        chip.className = 'recipe-item' + (it.count > 0 ? '' : ' zero');
        var dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = 'var(--' + it.type + ')';
        var label = document.createElement('span');
        label.className = 'label';
        label.textContent = it.label;
        var count = document.createElement('span');
        count.className = 'count';
        count.textContent = it.count;
        chip.appendChild(dot);
        chip.appendChild(label);
        chip.appendChild(count);
        list.appendChild(chip);
      }
    }

    function renderSetoutAlert(setoutItems) {
      var alert = document.getElementById('setoutAlert');
      var list = document.getElementById('setoutList');
      if (!alert || !list) return;
      if (!setoutItems.length) {
        alert.classList.add('hidden');
        list.textContent = '';
        return;
      }
      alert.classList.remove('hidden');
      list.textContent = '';
      for (var i = 0; i < setoutItems.length; i++) {
        var it = setoutItems[i];
        var li = document.createElement('li');
        var s = document.createElement('strong');
        s.textContent = it.trays;
        li.appendChild(document.createTextNode(it.label + ': '));
        li.appendChild(s);
        li.appendChild(document.createTextNode(' tray' + (it.trays === 1 ? '' : 's')));
        list.appendChild(li);
      }
    }

    function calculate() {
      // Update inline dollar expansions
      updateHint('currentSales', 'disp_currentSales');
      updateHint('todayForecast', 'disp_todayForecast');
      updateHint('tomorrowForecast', 'disp_tomorrowForecast');

      var currentSales = expandDollar(document.getElementById('currentSales').value);
      var todayForecast = expandDollar(document.getElementById('todayForecast').value);
      var tomorrowForecast = expandDollar(document.getElementById('tomorrowForecast').value);
      var counts = {
        indi: getCount('indi'),
        small: getCount('small'),
        large: getCount('large'),
        sic: getCount('sic'),
      };

      var salesLeft = todayForecast - currentSales;
      var doughUse = lookup(salesLeft);
      var tonightIdx = lookupIndex(salesLeft);
      var tomorrowNeed = lookup(tomorrowForecast);
      var tomorrowIdx = lookupIndex(tomorrowForecast);
      var doughLeft = {};
      var ballsToMake = {};
      var trays = {};

      for (var i = 0; i < TYPES.length; i++) {
        var t = TYPES[i];
        doughLeft[t] = counts[t] - doughUse[t];
        ballsToMake[t] = tomorrowNeed[t] - doughLeft[t];
        if (t === 'sic' && ballsToMake[t] < 2) ballsToMake[t] = 2;
        trays[t] = ballsToMake[t] <= 0 ? 0 : Math.ceil(ballsToMake[t] / PER_TRAY[t]);
      }

      // Boil Dough — fixed target, not from lookup
      var boilCount = getBoilCount();
      var boilMake = Math.max(0, BOIL_TARGET - boilCount);
      var boilTrays = boilMake === 0 ? 0 : Math.ceil(boilMake / BOIL_PER_TRAY);

      var totalTrays = 0;
      for (var k = 0; k < TYPES.length; k++) totalTrays += trays[TYPES[k]];
      totalTrays += boilTrays;
      var batches = totalTrays === 0 ? 0 : Math.ceil(totalTrays / TRAYS_PER_BATCH);

      // Sales Left banner
      document.getElementById('salesLeftValue').textContent = formatDollar(salesLeft);

      // Size rows
      for (var ii = 0; ii < TYPES.length; ii++) {
        var s = TYPES[ii];
        document.getElementById('row-' + s + '-tonight').textContent = doughUse[s];
        var leftEl = document.getElementById('row-' + s + '-left');
        leftEl.textContent = doughLeft[s];
        leftEl.className = 'v num ' + (valClass(doughLeft[s]) || '');
        document.getElementById('row-' + s + '-need').textContent = tomorrowNeed[s];
        document.getElementById('row-' + s + '-make').textContent = ballsToMake[s];
        document.getElementById('row-' + s + '-trays').textContent = trays[s];
      }

      // Set-out: per-row (indi/small/large only) + unified alert banner
      var setoutItems = [];
      for (var iii = 0; iii < TYPES.length; iii++) {
        var st = TYPES[iii];
        var setoutEl = document.getElementById('row-' + st + '-setout');
        if (!setoutEl) continue;
        if (st === 'sic') {
          setoutEl.classList.add('hidden');
          continue;
        }
        if (doughLeft[st] < 0) {
          var setoutTrays = Math.ceil((-doughLeft[st]) / PER_TRAY[st]);
          var soNum = setoutEl.querySelector('.so-num');
          if (soNum) soNum.textContent = setoutTrays;
          setoutEl.classList.remove('hidden');
          setoutItems.push({ label: TYPE_LABELS[st], trays: setoutTrays });
        } else {
          setoutEl.classList.add('hidden');
        }
      }
      renderSetoutAlert(setoutItems);

      // Boil row — "6T + 0" in the hero make-num
      var boilTraysDisplay = Math.floor(boilMake / BOIL_PER_TRAY);
      var boilSingles = boilMake % BOIL_PER_TRAY;
      document.getElementById('row-boil-have').textContent = boilCount;
      document.getElementById('row-boil-target').textContent = BOIL_TARGET;
      document.getElementById('row-boil-make').textContent = boilMake;
      document.getElementById('row-boil-trays').textContent = boilTraysDisplay + 'T + ' + boilSingles;

      // Hero: recipe + batches
      renderRecipe(ballsToMake, boilMake);
      var heroNum = document.getElementById('heroBatchNum');
      heroNum.textContent = batches;
      if (batches === 0) heroNum.classList.add('zero'); else heroNum.classList.remove('zero');
      var word = batches === 0 ? 'No batches needed' : (batches === 1 ? '1 batch to make' : batches + ' batches to make');
      document.getElementById('heroBatchesWord').textContent = word;
      document.getElementById('heroTotalTrays').textContent = totalTrays + (totalTrays === 1 ? ' tray' : ' trays');

      // Dough Bible active rows + table highlight
      updateBible(tonightIdx, tomorrowIdx);

      updateSaveButtons();
      syncTempBatches();
    }

    // Debounced calculation for input events
    var calcTimer;
    function debouncedCalculate() {
      clearTimeout(calcTimer);
      calcTimer = setTimeout(calculate, 100);
    }
