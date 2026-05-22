    // js/tabs.js — depends on: utils.js, save.js
    // Two-tab mode switcher. The 2 PM tab is the original morning workflow:
    // sales + forecast → count → calc → batches. The EON tab is a stripped-down
    // end-of-night flow: a single EON-sales input, the same dough count card,
    // and a save that writes to the End of Night Count Google Sheet tab. Mode
    // is held on <html data-mode="twopm"|"eon"> so CSS can drive visibility.

    // Read the currently-active save mode. Default 'twopm' if the attribute
    // is absent (defensive — the HTML ships with it set).
    function getMode() {
      return document.documentElement.getAttribute('data-mode') || 'twopm';
    }

    // Switch the active mode. Updates the <html> attribute (CSS-driven hides),
    // flips the active class on the tab buttons + their aria-selected, swaps
    // the save button label, and re-runs the per-mode validation pass so the
    // button enabled state matches the visible inputs.
    function setMode(newMode) {
      if (newMode !== 'twopm' && newMode !== 'eon') return;
      document.documentElement.setAttribute('data-mode', newMode);

      var tabs = document.querySelectorAll('.mode-tab');
      for (var i = 0; i < tabs.length; i++) {
        var isActive = tabs[i].getAttribute('data-mode') === newMode;
        tabs[i].classList.toggle('active', isActive);
        tabs[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
      }

      var btn = document.getElementById('saveBtn');
      if (btn) btn.textContent = (newMode === 'eon') ? 'Compare to Tomorrow' : 'Compute / Save';

      // EON never auto-saves — drop any pending timer when switching away
      // from 2 PM so it can't fire after the user has moved on.
      if (newMode === 'eon' && typeof disarmAutoSaveTimer === 'function') disarmAutoSaveTimer();

      // Re-run validation/enabling so the save button reflects the now-visible
      // inputs. updateSaveButtons reads getMode() to pick the right ruleset.
      if (typeof updateSaveButtons === 'function') updateSaveButtons();
    }

    (function wireTabs() {
      var tabs = document.querySelectorAll('.mode-tab');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function() {
          setMode(this.getAttribute('data-mode'));
        });
      }
    })();
