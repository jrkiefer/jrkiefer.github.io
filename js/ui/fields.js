// js/ui/fields.js — tiny shared DOM helpers for the UI modules.
// Everything here is presentation plumbing; no storage, no fetch.

export const $ = (id) => document.getElementById(id);

export function setText(el, str) {
  if (el && el.textContent !== str) el.textContent = str;
}

// The saved chip shows when a field holds a value AND the record is synced
// (html[data-status="synced"]) — this class is the per-field half.
function markHasValue(input) {
  const field = input.closest('.field');
  if (field) field.classList.toggle('has-value', input.value !== '');
}

function clean(v, decimal, signed) {
  const neg = signed && v.trimStart().startsWith('-');
  v = v.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
  if (decimal) {
    const i = v.indexOf('.');
    if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
  }
  return (neg ? '-' : '') + v;
}

// Bind an input once: filter characters (preserving the caret), flag
// has-value, hand the clean value to the patcher. update() never touches
// input values — only hydrate() does, via setInputValue below.
// signed allows one leading minus (station temps — a freezer can read
// negative °F); everything else stays digits-only.
export function bindInput(input, { decimal = false, signed = false, onValue }) {
  input.addEventListener('input', () => {
    const v = clean(input.value, decimal, signed);
    if (v !== input.value) {
      const pos = Math.max(0, (input.selectionStart ?? v.length) - (input.value.length - v.length));
      input.value = v;
      try { input.setSelectionRange(pos, pos); } catch { /* unsupported input types */ }
    }
    markHasValue(input);
    onValue(v);
  });
}

export function setInputValue(input, v) {
  input.value = v;
  markHasValue(input);
}

// One per-size display row: the size's color hook (--c) plus the standard
// dot+chip label cell, followed by the module's own cells.
export function sizeRow(s, className, cellsHTML) {
  const row = document.createElement('div');
  row.className = className;
  row.style.setProperty('--c', `var(--${s.id})`);
  row.innerHTML =
    `<div class="plan-size"><span class="dot sm"></span><span class="monocaps">${s.chip}</span></div>` + cellsHTML;
  return row;
}

// A Round up / Round down pill pair with an auto tag, shared by the Bible
// (forecast) and Day's Work (batch) cards. The tap guard is on the RAW
// stamped value, not the resolved one: tapping the direction the auto rule
// currently resolves to PINS it against live inputs. update() shows the
// RESOLVED direction and hides the auto tag once a stamp exists.
export function roundPills(pillPrefix, tagId, onStamp) {
  let stamped = null; // RAW record value from the last update()
  for (const id of ['up', 'down']) {
    $(`${pillPrefix}-${id}`).addEventListener('click', () => {
      if (stamped === id) return;
      onStamp(id);
    });
  }
  return (raw, resolved) => {
    stamped = raw ?? null;
    for (const id of ['up', 'down']) {
      $(`${pillPrefix}-${id}`).classList.toggle('active', resolved === id);
    }
    $(tagId).classList.toggle('hidden', raw != null);
  };
}

// Shared collapsible wiring: sections start closed (.open toggles the
// body via CSS), the header is the toggle, the hint flips with a chevron.
export function wireCollapse(sectionId, toggleId) {
  const sec = $(sectionId);
  const btn = $(toggleId);
  const hint = btn.querySelector('[data-hint]');
  btn.addEventListener('click', () => {
    const open = sec.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    if (hint) hint.textContent = open ? 'Tap to collapse ▴' : 'Tap to expand ▾';
  });
}
