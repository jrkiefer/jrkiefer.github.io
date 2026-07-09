// js/ui/fields.js — tiny shared DOM helpers for the UI modules.
// Everything here is presentation plumbing; no storage, no fetch.

export const $ = (id) => document.getElementById(id);

export function setText(el, str) {
  if (el && el.textContent !== str) el.textContent = str;
}

// The saved chip shows when a field holds a value AND the record is synced
// (html[data-status="synced"]) — this class is the per-field half.
export function markHasValue(input) {
  const field = input.closest('.field');
  if (field) field.classList.toggle('has-value', input.value !== '');
}

function clean(v, decimal) {
  v = v.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
  if (decimal) {
    const i = v.indexOf('.');
    if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
  }
  return v;
}

// Bind an input once: filter characters (preserving the caret), flag
// has-value, hand the clean value to the patcher. update() never touches
// input values — only hydrate() does, via setInputValue below.
export function bindInput(input, { decimal = false, onValue }) {
  input.addEventListener('input', () => {
    const v = clean(input.value, decimal);
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
