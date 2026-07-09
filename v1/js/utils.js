    // js/utils.js — depends on: config.js (SCRIPT_URL)
    function parseDollar(str) {
      return Math.abs(parseFloat(String(str).replace(/[$,\s-]/g, '')) || 0);
    }

    function expandDollar(raw) {
      var n = parseDollar(raw);
      if (n === 0) return 0;
      if (n < 100) return Math.round(n * 1000);
      return n;
    }

    function updateHint(inputId, displayId) {
      var raw = document.getElementById(inputId).value.trim();
      var disp = document.getElementById(displayId);
      if (!disp) return;
      if (!raw) { disp.textContent = ''; return; }
      disp.textContent = formatDollar(expandDollar(raw));
    }

    function formatDollar(n) {
      return '$' + n.toLocaleString('en-US');
    }

    function valClass(n) {
      if (n < 0) return 'neg';
      if (n > 0) return 'pos';
      return '';
    }

    // Input sanitization — strip invalid characters as user types
    function sanitize(el, allowed) {
      var pos = el.selectionStart;
      var before = el.value;
      el.value = el.value.replace(allowed, '');
      if (el.value !== before) {
        var diff = before.length - el.value.length;
        el.selectionStart = el.selectionEnd = Math.max(0, pos - diff);
      }
    }

    function stripExtraDots(el) {
      var val = el.value;
      var firstDot = val.indexOf('.');
      if (firstDot !== -1) {
        el.value = val.substring(0, firstDot + 1) + val.substring(firstDot + 1).replace(/\./g, '');
      }
    }

    function getTodayDate() {
      var now = new Date();
      var m = String(now.getMonth()+1).padStart(2, '0');
      var d = String(now.getDate()).padStart(2, '0');
      return now.getFullYear() + '-' + m + '-' + d;
    }

    function normalizeDate(str) {
      // Handle YYYY-MM-DD from date input
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        var p = str.split('-');
        return parseInt(p[1]) + '/' + parseInt(p[2]) + '/' + p[0];
      }
      // Handle M/D/YYYY from sheet data
      var parts = str.split('/');
      if (parts.length !== 3) return str;
      return parseInt(parts[0]) + '/' + parseInt(parts[1]) + '/' + parts[2];
    }

    // 'M/D/YYYY' -> Date at local midnight, or null if malformed
    function parseMDY(str) {
      var p = String(str).split('/');
      if (p.length !== 3) return null;
      var m = parseInt(p[0], 10), d = parseInt(p[1], 10), y = parseInt(p[2], 10);
      if (!isFinite(m) || !isFinite(d) || !isFinite(y)) return null;
      var dt = new Date(y, m - 1, d);
      dt.setHours(0, 0, 0, 0);
      return isNaN(dt.getTime()) ? null : dt;
    }

    function getField(row, sheetName, camelName) {
      // Try exact names first
      var v = row[sheetName];
      if (v === undefined || v === null) v = row[camelName];
      // Case-insensitive exact match
      if (v === undefined || v === null) {
        var lower = sheetName.toLowerCase().replace(/\s+/g, '');
        for (var k in row) {
          if (Object.prototype.hasOwnProperty.call(row, k) && k.toLowerCase().replace(/\s+/g, '') === lower) {
            v = row[k];
            break;
          }
        }
      }
      if (v === undefined || v === null) v = 0;
      return v;
    }

    // Sheet date cell (Date object or 'YYYY-MM-DD[THH:MM:SS]' string) -> 'M/D/YYYY'
    function sheetDateToLocal(raw) {
      if (raw instanceof Date) {
        return (raw.getMonth() + 1) + '/' + raw.getDate() + '/' + raw.getFullYear();
      }
      var s = String(raw);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        var ds = s.indexOf('T') === -1 ? s + 'T00:00:00' : s;
        return new Date(ds).toLocaleDateString('en-US');
      }
      return s;
    }

    // GET to the Apps Script backend; query like '?date=4/1/2026' (optional)
    function fetchSheetJSON(query) {
      return fetch(SCRIPT_URL + (query || '')).then(function(r) { return r.json(); });
    }

    // Collapsible section: toggle button flips .open on the section,
    // aria-expanded on the button, and the "Tap to expand/collapse" label.
    function wireSectionToggle(toggleId, sectionId, labelSelector) {
      var toggle = document.getElementById(toggleId);
      var sec = document.getElementById(sectionId);
      if (!toggle || !sec) return;
      toggle.addEventListener('click', function() {
        var isOpen = sec.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        var lbl = toggle.querySelector(labelSelector);
        if (lbl) lbl.textContent = isOpen ? 'Tap to collapse' : 'Tap to expand';
      });
    }

    function toShorthand(n) {
      n = Number(n) || 0;
      if (n === 0) return '';
      if (n >= 1000) return String(n / 1000);
      return String(n);
    }
