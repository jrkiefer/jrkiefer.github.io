    // js/utils.js — no dependencies (loaded after config.js)
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

    function getField(row, sheetName, camelName) {
      // Try exact names first
      var v = row[sheetName];
      if (v === undefined || v === null) v = row[camelName];
      // Case-insensitive exact match
      if (v === undefined || v === null) {
        var lower = sheetName.toLowerCase().replace(/\s+/g, '');
        for (var k in row) {
          if (row.hasOwnProperty(k) && k.toLowerCase().replace(/\s+/g, '') === lower) {
            v = row[k];
            break;
          }
        }
      }
      if (v === undefined || v === null) v = 0;
      return v;
    }

    function toShorthand(n) {
      n = Number(n) || 0;
      if (n === 0) return '';
      if (n >= 1000) return String(n / 1000);
      return String(n);
    }
