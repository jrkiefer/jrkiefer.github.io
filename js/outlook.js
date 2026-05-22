    // js/outlook.js — depends on: config.js, calculate.js
    // EON Outlook: after a successful EON save, compare the night's counts to
    // tomorrow's needs (looked up from the saved 2 PM forecast for the same
    // date). Renders five per-size rows + a bottom summary. The card lives at
    // #eonOutlookSec and is hidden by default; renderEonOutlook() reveals it,
    // hideEonOutlook() puts it back (called from Reset).

    var OUTLOOK_LABELS = {
      indi:  'Individual',
      small: 'Small',
      large: 'Large',
      sic:   'Sicilian',
      boil:  'Boil'
    };
    var OUTLOOK_COLORS = {
      indi:  'var(--indi)',
      small: 'var(--small)',
      large: 'var(--large)',
      sic:   'var(--sic)',
      boil:  'var(--boil)'
    };

    function renderEonOutlook(tomorrowForecast) {
      var sec = document.getElementById('eonOutlookSec');
      var list = document.getElementById('outlookList');
      var summary = document.getElementById('outlookSummary');
      var forecastEl = document.getElementById('eonForecastDisp');
      if (!sec || !list || !summary) return;

      // No 2 PM save for this date — render a friendly fallback and bail
      if (tomorrowForecast == null || isNaN(Number(tomorrowForecast))) {
        list.innerHTML = '';
        summary.innerHTML = 'Outlook unavailable — no 2 PM forecast saved for this date.';
        summary.className = 'outlook-summary warn';
        if (forecastEl) forecastEl.textContent = 'No 2 PM forecast';
        sec.style.display = '';
        return;
      }

      var needs = lookup(Number(tomorrowForecast));
      var have = {
        indi:  getCountValue('indi'),
        small: getCountValue('small'),
        large: getCountValue('large'),
        sic:   getCountValue('sic'),
        boil:  getBoilCountValue()
      };
      var need = {
        indi:  needs.indi,
        small: needs.small,
        large: needs.large,
        sic:   needs.sic,
        boil:  36   // boil target is fixed, never from the Bible table
      };

      var SIZES = ['indi', 'small', 'large', 'sic', 'boil'];
      var rowsHTML = '';
      var deficits = [];
      var totalLeftover = 0;
      for (var i = 0; i < SIZES.length; i++) {
        var s = SIZES[i];
        var diff = have[s] - need[s];
        var diffClass = diff < 0 ? 'neg' : (diff > 0 ? 'pos' : 'zero');
        var diffText = (diff > 0 ? '+' : '') + diff;
        rowsHTML += '<li class="outlook-row" style="--c: ' + OUTLOOK_COLORS[s] + '">' +
          '<span class="outlook-label">' + OUTLOOK_LABELS[s] + '</span>' +
          '<span class="outlook-stat"><span class="outlook-lab">Have</span> <strong>' + have[s] + '</strong></span>' +
          '<span class="outlook-stat"><span class="outlook-lab">Need</span> <strong>' + need[s] + '</strong></span>' +
          '<span class="outlook-diff ' + diffClass + '">' + diffText + '</span>' +
          '</li>';
        if (diff < 0) {
          deficits.push(Math.abs(diff) + ' ' + OUTLOOK_LABELS[s]);
        } else {
          totalLeftover += diff;
        }
      }
      list.innerHTML = rowsHTML;

      if (forecastEl) forecastEl.textContent = "Tomorrow's Forecast: $" + Number(tomorrowForecast).toLocaleString('en-US');

      if (deficits.length > 0) {
        var joined = deficits.length === 1
          ? deficits[0]
          : deficits.join(' + ');
        summary.innerHTML = 'Tomorrow we will potentially go into same-day dough by <strong>' + joined + '</strong>.';
        summary.className = 'outlook-summary deficit';
      } else {
        summary.innerHTML = 'Dough is good ✓ — <strong>' + totalLeftover + ' leftover balls</strong>.';
        summary.className = 'outlook-summary good';
      }

      sec.style.display = '';
    }

    function hideEonOutlook() {
      var sec = document.getElementById('eonOutlookSec');
      if (!sec) return;
      sec.style.display = 'none';
      var list = document.getElementById('outlookList');
      var summary = document.getElementById('outlookSummary');
      var forecastEl = document.getElementById('eonForecastDisp');
      if (list) list.innerHTML = '';
      if (summary) { summary.innerHTML = ''; summary.className = 'outlook-summary'; }
      if (forecastEl) forecastEl.textContent = '—';
    }
