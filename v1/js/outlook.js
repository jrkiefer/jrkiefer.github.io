    // js/outlook.js — depends on: config.js, utils.js, calculate.js
    // EON Outlook (Step 08): after Compare to Tomorrow, compare the night's
    // counts to tomorrow's need (looked up from the saved 2 PM forecast for the
    // same date, or a value the user types into #outlookForecast).
    //
    // Two functions cover the entry points:
    //   renderEonOutlook(forecast) — called from save success in js/save.js.
    //     Pre-fills the forecast input from the backend value unless the user
    //     has already manually typed something (data-manual on the input).
    //     Then triggers renderOutlookRows().
    //   renderOutlookRows() — reads #outlookForecast live and renders the
    //     per-size rows + bottom summary. Re-fired on every input change in
    //     #outlookForecast (debounced ~150 ms) so the user sees the outlook
    //     update as they edit the forecast.
    //
    // Manual entry wins: once the user has typed anything in #outlookForecast,
    // re-tapping Compare to Tomorrow does NOT overwrite their value. Reset is
    // the only way to drop the manual flag.

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
    var OUTLOOK_SIZES = ['indi', 'small', 'large', 'sic', 'boil'];

    function renderEonOutlook(tomorrowForecast) {
      var sec = document.getElementById('eonOutlookSec');
      var input = document.getElementById('outlookForecast');
      var src = document.getElementById('outlookForecastSource');
      if (!sec || !input) return;

      // Manual entry wins — never overwrite if user has typed.
      if (input.dataset.manual !== 'true') {
        if (tomorrowForecast != null && !isNaN(Number(tomorrowForecast))) {
          input.value = toShorthand(Number(tomorrowForecast));
          if (src) src.textContent = 'From 2 PM save';
        } else {
          input.value = '';
          if (src) src.textContent = 'No 2 PM save — enter manually';
        }
        updateHint('outlookForecast', 'disp_outlookForecast');
      }

      sec.style.display = '';
      renderOutlookRows();
    }

    function renderOutlookRows() {
      var input = document.getElementById('outlookForecast');
      var list = document.getElementById('outlookList');
      var summary = document.getElementById('outlookSummary');
      if (!list || !summary) return;

      var forecast = expandDollar(input ? input.value : '');
      if (!forecast || forecast <= 0) {
        list.innerHTML = '';
        summary.className = 'outlook-summary warn';
        summary.innerHTML = "Enter tomorrow's forecast above to see the outlook.";
        return;
      }

      var needs = lookup(forecast);
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

      var rowsHTML = '';
      var deficits = [];
      var totalLeftover = 0;
      for (var i = 0; i < OUTLOOK_SIZES.length; i++) {
        var s = OUTLOOK_SIZES[i];
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

      if (deficits.length > 0) {
        var joined = deficits.length === 1 ? deficits[0] : deficits.join(' + ');
        summary.innerHTML = 'Tomorrow we will potentially go into same-day dough by <strong>' + joined + '</strong>.';
        summary.className = 'outlook-summary deficit';
      } else {
        summary.innerHTML = 'Dough is good ✓ — <strong>' + totalLeftover + ' leftover balls</strong>.';
        summary.className = 'outlook-summary good';
      }
    }

    function hideEonOutlook() {
      var sec = document.getElementById('eonOutlookSec');
      if (!sec) return;
      sec.style.display = 'none';
      var input = document.getElementById('outlookForecast');
      if (input) {
        input.value = '';
        delete input.dataset.manual;
      }
      var disp = document.getElementById('disp_outlookForecast');
      if (disp) disp.textContent = '';
      var src = document.getElementById('outlookForecastSource');
      if (src) src.textContent = '—';
      var list = document.getElementById('outlookList');
      var summary = document.getElementById('outlookSummary');
      if (list) list.innerHTML = '';
      if (summary) { summary.innerHTML = ''; summary.className = 'outlook-summary'; }
    }

    // Wire the forecast input: debounced live re-render of the outlook rows.
    // The first keystroke flips the manual flag so subsequent Compare taps
    // don't overwrite the user's typed value.
    (function wireOutlookForecast() {
      var input = document.getElementById('outlookForecast');
      if (!input) return;
      var t = null;
      input.addEventListener('input', function() {
        input.dataset.manual = 'true';
        var src = document.getElementById('outlookForecastSource');
        if (src) src.textContent = 'Manual entry';
        updateHint('outlookForecast', 'disp_outlookForecast');
        clearTimeout(t);
        t = setTimeout(renderOutlookRows, 150);
      });
    })();
