    // js/bible.js — depends on: config.js
    // Renders the Dough Bible reference (active tonight/tomorrow cards + full table
    // with highlighted rows). Table is built once on first render and reused.

    function renderBibleTable() {
      var body = document.getElementById('bibleTableBody');
      if (!body || body.dataset.built === '1') return;
      for (var i = 0; i < DOUGH_TABLE.length; i++) {
        var r = DOUGH_TABLE[i];
        var tr = document.createElement('tr');
        tr.dataset.idx = i;
        var cells = [formatDollar(r.threshold), r.indi, r.small, r.large, r.sic];
        for (var c = 0; c < cells.length; c++) {
          var td = document.createElement('td');
          td.textContent = cells[c];
          tr.appendChild(td);
        }
        body.appendChild(tr);
      }
      body.dataset.built = '1';
    }

    function renderActiveRowCard(prefix, row) {
      var threshEl = document.getElementById('bible' + prefix + 'Thresh');
      var countsEl = document.getElementById('bible' + prefix + 'Counts');
      if (!threshEl || !countsEl) return;
      threshEl.textContent = row ? ('≤ ' + formatDollar(row.threshold)) : '—';
      countsEl.textContent = '';
      if (!row) return;
      var parts = [
        { k: 'Indi', v: row.indi },
        { k: 'Sm',   v: row.small },
        { k: 'Lg',   v: row.large },
        { k: 'Sic',  v: row.sic },
      ];
      for (var i = 0; i < parts.length; i++) {
        var wrap = document.createElement('span');
        var num = document.createElement('strong');
        num.textContent = parts[i].v;
        var lbl = document.createElement('small');
        lbl.textContent = ' ' + parts[i].k;
        wrap.appendChild(num);
        wrap.appendChild(lbl);
        countsEl.appendChild(wrap);
      }
    }

    function updateBible(tonightIdx, tomorrowIdx) {
      renderBibleTable();
      var tonightRow = DOUGH_TABLE[tonightIdx] || null;
      var tomorrowRow = DOUGH_TABLE[tomorrowIdx] || null;
      renderActiveRowCard('Tonight', tonightRow);
      renderActiveRowCard('Tomorrow', tomorrowRow);

      var body = document.getElementById('bibleTableBody');
      if (!body) return;
      var rows = body.children;
      for (var i = 0; i < rows.length; i++) {
        var tr = rows[i];
        tr.classList.remove('active-tonight', 'active-tomorrow', 'active-both');
        var isT = (i === tonightIdx);
        var isM = (i === tomorrowIdx);
        if (isT && isM) tr.classList.add('active-both');
        else if (isT) tr.classList.add('active-tonight');
        else if (isM) tr.classList.add('active-tomorrow');
      }
    }

    // Header toggle (acts as an accordion)
    (function wireBibleHead() {
      var head = document.getElementById('bibleHead');
      var bible = document.getElementById('bible');
      if (!head || !bible) return;
      head.addEventListener('click', function() {
        var isOpen = bible.classList.toggle('open');
        head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        var toggle = head.querySelector('.toggle');
        if (toggle) toggle.textContent = isOpen ? 'Collapse' : 'Expand';
      });
    })();
