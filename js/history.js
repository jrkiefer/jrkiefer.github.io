    // js/history.js — depends on: config.js, utils.js
    // ── History ──
    function loadHistory() {
      var list = document.getElementById('historyList');
      if (!list) return;
      fetchSheetJSON()
        .then(function(rows) {
          if (!rows || !rows.length) {
            list.innerHTML = '<a class="history-link" href="' + SHEET_URL + '" target="_blank">View Full History</a>';
            return;
          }
          var recent = rows.slice(-10).reverse();
          list.innerHTML = '';
          for (var i = 0; i < recent.length; i++) {
            var r = recent[i];
            var date = sheetDateToLocal(r['Date'] || r['date'] || '');
            var forecast = r["Today's Forecast"] || r['todayForecast'] || 0;
            var sales = r['Current Sales'] || r['currentSales'] || 0;
            var batches = r['Batches'] || r['batches'] || 0;
            var card = document.createElement('div');
            card.className = 'history-card';
            var left = document.createElement('div');
            var dateEl = document.createElement('div');
            dateEl.className = 'hc-date';
            dateEl.textContent = date;
            var details = document.createElement('div');
            details.className = 'hc-details';
            details.textContent = 'Forecast: $' + (Number(forecast) || 0).toLocaleString() + ' \u00b7 Sales: $' + (Number(sales) || 0).toLocaleString();
            left.appendChild(dateEl);
            left.appendChild(details);
            var batchEl = document.createElement('div');
            batchEl.className = 'hc-batches';
            batchEl.textContent = batches;
            card.appendChild(left);
            card.appendChild(batchEl);
            list.appendChild(card);
          }
          var link = document.createElement('a');
          link.className = 'history-link';
          link.href = SHEET_URL;
          link.target = '_blank';
          link.textContent = 'View Full History';
          list.appendChild(link);
        })
        .catch(function() {
          list.innerHTML = '<div class="temp-message error" style="margin-bottom:8px">Couldn\u2019t load history</div>' +
            '<a class="history-link" href="' + SHEET_URL + '" target="_blank">View Full History</a>';
        });
    }
    loadHistory();

    // Collapsible History section: closed by default, header toggles .open
    wireSectionToggle('historyToggle', 'historySec', '.history-toggle-label');
