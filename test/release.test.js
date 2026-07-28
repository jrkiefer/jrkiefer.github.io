// test/release.test.js — release-integrity gates for the ?v= cache-buster.
//
// GitHub Pages serves immutable-cached files; phones routinely hold a mixed
// cache after a release. v2·20 shipped with only index.html's two URLs
// versioned, so a phone could load a FRESH main.js whose plain
// `import './calc.js'` resolved to the STALE cached module — the module
// graph failed to link and the app died to a blank shell ("nothing is
// working", July 2026). The rule since v2·21: EVERY internal import carries
// the same ?v= query as APP_VERSION, so a new release busts the whole
// graph at once. These tests make shipping a half-bumped release impossible.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// APP_VERSION 'v2·21' → cache query '2.21' (the middle dot is a display
// nicety; URLs use a plain dot).
function expectedQuery() {
  const config = readFileSync(join(ROOT, 'js/config.js'), 'utf8');
  const m = config.match(/APP_VERSION\s*=\s*'v(\d+)·(\d+)'/);
  assert.ok(m, "APP_VERSION must look like 'v2·21' in js/config.js");
  return `${m[1]}.${m[2]}`;
}

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('every internal js/ import carries the current ?v= cache-buster', () => {
  const q = expectedQuery();
  for (const file of jsFiles(join(ROOT, 'js'))) {
    const src = readFileSync(file, 'utf8');
    // Static imports and bare re-exports of relative specifiers.
    for (const m of src.matchAll(/(?:import|export)[^'"]*from\s*['"](\.[^'"]+)['"]/g)) {
      const spec = m[1];
      assert.ok(
        spec.endsWith(`?v=${q}`),
        `${file.slice(ROOT.length)}: import '${spec}' must end '?v=${q}' — ` +
          'a plain specifier resolves against a phone\'s stale cache and kills the module graph',
      );
    }
  }
});

test('index.html css/js URLs carry the current ?v= cache-buster', () => {
  const q = expectedQuery();
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes(`css/styles.css?v=${q}`), `styles.css must be ?v=${q}`);
  assert.ok(html.includes(`js/main.js?v=${q}`), `main.js must be ?v=${q}`);
  // No straggler from a previous release anywhere in the page.
  for (const m of html.matchAll(/\?v=([0-9.]+)/g)) {
    assert.equal(m[1], q, `index.html carries a stale ?v=${m[1]} (current is ${q})`);
  }
});
