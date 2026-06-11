'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

// Run repo scripts sequentially in one shared context, mimicking the
// browser's <script> tags (the js/ files share global scope by design).
function loadContext(relFiles, globals) {
  const ctx = vm.createContext(Object.assign({ console }, globals || {}));
  for (const rel of relFiles) {
    const file = path.join(ROOT, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return ctx;
}

// Top-level `const` declarations (config.js) live in the context's global
// lexical scope, not as properties of ctx — extract references by
// evaluating an object literal inside the context.
function getRefs(ctx, names) {
  return vm.runInContext('({' + names.join(',') + '})', ctx);
}

// Evaluate an arbitrary expression inside the context (e.g. to build a
// Date with the context's own constructor so instanceof checks match).
function evalIn(ctx, expr) {
  return vm.runInContext('(' + expr + ')', ctx);
}

// Objects/arrays created inside a vm context have that realm's prototypes,
// which strict deepEqual rejects. Round-trip through JSON to get host-realm
// plain values for assertions.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { loadContext, getRefs, evalIn, plain };
