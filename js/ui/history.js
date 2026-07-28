// js/ui/history.js — Step 06: recent nights behind an explicit load button
// (cold starts never block boot on a slow backend). Tapping a night opens
// that date. Rendering only — main.js supplies the fetch/mapping via ctx.

import { SHEET_URL } from '../config.js?v=2.21';
import { money } from '../calc.js?v=2.21';
import { $, wireCollapse } from './fields.js?v=2.21';

export function init(ctx) {
  wireCollapse('historySec', 'historyToggle');
  const btn = $('historyLoadBtn');
  const list = $('historyList');

  const fullLink = () => {
    const a = document.createElement('a');
    a.className = 'history-link';
    a.href = SHEET_URL;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'View Full History →';
    return a;
  };

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Loading…';
    list.textContent = '';
    try {
      const entries = await ctx.history.load();
      if (!entries.length) {
        const note = document.createElement('div');
        note.className = 'history-note';
        note.textContent = 'No saved nights yet.';
        list.appendChild(note);
      }
      for (const e of entries) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'history-row';
        const date = document.createElement('span');
        date.className = 'history-date';
        date.textContent = e.label;
        const meta = document.createElement('span');
        meta.className = 'history-meta';
        meta.textContent =
          `${e.eonSales != null ? money(e.eonSales) : '—'} · ` +
          `${e.batches != null ? `${e.batches} ${e.batches === 1 ? 'batch' : 'batches'}` : 'no plan'}`;
        row.append(date, meta);
        if (e.iso) row.addEventListener('click', () => ctx.history.openDate(e.iso));
        list.appendChild(row);
      }
    } catch {
      const note = document.createElement('div');
      note.className = 'history-note';
      note.textContent = "Couldn't load history — check the connection and tap again.";
      list.appendChild(note);
    }
    list.appendChild(fullLink());
    btn.disabled = false;
    btn.textContent = 'Reload history';
  });
}
