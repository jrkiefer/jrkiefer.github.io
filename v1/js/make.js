    // js/make.js — depends on: config.js, utils.js, calculate.js, save.js
    // Manager-entered actual make corrections. UI: collapsed-by-default card at
    // the bottom of the page.
    // Pre-first-save: inputs are blank with calculated values shown as faded
    // placeholder hints (placeholders refreshed on every recalculation).
    // After Save Count succeeds: inputs are auto-populated with the calculated
    // values so the manager sees solid numbers and only edits sizes that came
    // out different from the recipe.
    // On Save Actual Make: blank fields still fall back to the placeholder, so
    // the pre-first-save corner case keeps working.
    // Backend overwrites the 2pm Make Amount and Final Dough Amount at 2pm rows
    // for the active date. Requires that a Dough Counts row already exists.

    var MAKE_TYPES = ['indi', 'small', 'large', 'sic', 'boil'];

    // Refresh the placeholder text on every make input to mirror the calculated
    // ball counts currently displayed in the breakdown card. Called from
    // calculate() after it updates row-<size>-make textContent.
    function updateMakePlaceholders() {
      for (var i = 0; i < MAKE_TYPES.length; i++) {
        var t = MAKE_TYPES[i];
        var input = document.getElementById('makeBalls-' + t);
        if (!input) continue;
        var calcEl = document.getElementById('row-' + t + '-make');
        // Surplus shows as a negative make in the breakdown; the actual make
        // is never negative, so clamp before using it as a hint.
        var calc = calcEl ? Math.max(0, parseInt(calcEl.textContent, 10) || 0) : 0;
        input.placeholder = String(calc);
      }
    }

    // Fill the make inputs with the currently-calculated balls-to-make per
    // size. Called from save.js after a successful Save Count so the manager
    // sees solid numbers and only edits the sizes that came out different
    // from the recipe.
    function populateMakeInputs() {
      for (var i = 0; i < MAKE_TYPES.length; i++) {
        var t = MAKE_TYPES[i];
        var input = document.getElementById('makeBalls-' + t);
        if (!input) continue;
        var calcEl = document.getElementById('row-' + t + '-make');
        var calc = calcEl ? Math.max(0, parseInt(calcEl.textContent, 10) || 0) : 0;
        input.value = String(calc);
      }
    }

    // Read the actual make value for a size. Blank input → fall back to the
    // current placeholder (= the calculated value). Returns an integer.
    function readMakeInput(t) {
      var input = document.getElementById('makeBalls-' + t);
      if (!input) return 0;
      var raw = input.value.trim();
      if (raw === '') return parseInt(input.placeholder, 10) || 0;
      return parseInt(raw, 10) || 0;
    }

    // Sanitize input to digits only
    function wireMakeInputs() {
      for (var i = 0; i < MAKE_TYPES.length; i++) {
        var input = document.getElementById('makeBalls-' + MAKE_TYPES[i]);
        if (!input) continue;
        input.addEventListener('input', function() {
          sanitize(this, /[^0-9]/g);
        });
      }
    }

    // Save Make handler — POSTs {type:'make', date, makes} via postToSheet.
    // Backend recomputes Final Dough Amount at 2pm using the existing
    // Dough Counts row.
    function wireMakeSave() {
      var btn = document.getElementById('makeSaveBtn');
      var status = document.getElementById('makeStatus');
      if (!btn) return;

      btn.addEventListener('click', function() {
        if (btn.disabled) return;
        var dateEl = document.getElementById('activeDate');
        var date = dateEl && dateEl.value.trim()
          ? normalizeDate(dateEl.value.trim())
          : normalizeDate(getTodayDate());

        var makes = {};
        for (var i = 0; i < MAKE_TYPES.length; i++) {
          makes[MAKE_TYPES[i]] = readMakeInput(MAKE_TYPES[i]);
        }

        status.textContent = '';
        status.classList.remove('error');
        var data = { type: 'make', date: date, makes: makes };
        postToSheet(data, btn, 'Save Actual Make',
          null,
          // Echo the backend error into #makeStatus. Postsheet leaves the error
          // on the button itself, but the button is narrow — the dedicated
          // status div below the inputs displays the full message and keeps it
          // around if the user clicks Save again (which would replace the
          // button text).
          function() {
            var msg = btn.textContent || '';
            if (msg.indexOf('Error') === 0) {
              status.textContent = msg.replace(/^Error:\s*/, '');
              status.classList.add('error');
            }
          }
        );
      });
    }

    (function initMake() {
      wireMakeInputs();
      // Collapsible Make section: closed by default, header toggles .open
      wireSectionToggle('makeToggle', 'makeSec', '.make-toggle-label');
      wireMakeSave();
      // Populate placeholders from the initial calculate() pass
      updateMakePlaceholders();
    })();
