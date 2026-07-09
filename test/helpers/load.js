// vm harness — kept for the two things that can't be imported as modules:
// apps-script/Code.gs (Apps Script global-scope file) and the frozen
// v1/js/* snapshot (loaded for old-vs-new parity tests). Everything else
// in test/ uses plain ES-module imports.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Run repo scripts sequentially in one shared context, mimicking the
// browser's <script> tags (the v1 js files share global scope by design).
export function loadContext(relFiles, globals) {
  const ctx = vm.createContext(Object.assign({ console }, globals || {}));
  for (const rel of relFiles) {
    const file = path.join(ROOT, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return ctx;
}

// Top-level `const` declarations live in the context's global lexical
// scope, not as properties of ctx — extract references by evaluating an
// object literal inside the context.
export function getRefs(ctx, names) {
  return vm.runInContext('({' + names.join(',') + '})', ctx);
}

// Evaluate an arbitrary expression inside the context (e.g. to build a
// Date with the context's own constructor so instanceof checks match).
export function evalIn(ctx, expr) {
  return vm.runInContext('(' + expr + ')', ctx);
}

// Objects/arrays created inside a vm context have that realm's prototypes,
// which strict deepEqual rejects. Round-trip through JSON to get host-realm
// plain values for assertions.
export function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
