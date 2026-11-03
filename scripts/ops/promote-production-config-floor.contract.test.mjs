import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const script = fs.readFileSync(path.join(import.meta.dirname, 'promote-production-config-floor.mjs'), 'utf8');

// Regression for the 2026-11-03 production hold: the v3 re-anchor branch called
// guardProduction without importing it, and only the on-host execution path
// could surface the ReferenceError. Keep every called guard helper bound.
const importLine = /^import \{(.+)\} from '\.\/production-config-guard\.mjs';$/m.exec(script)?.[1] ?? '';
const importedNames = new Set(importLine.split(',').map(name => name.trim()).filter(Boolean));

test('floor promotion imports every production guard helper it calls', () => {
  for (const name of ['guardProduction', 'requireCleanMain', 'assertFloorMonotonic', 'migrationScope', 'assertFloor', 'secureJson', 'verifyContext', 'git']) {
    assert.ok(importedNames.has(name), `promote-production-config-floor.mjs must import ${name}`);
  }
});

test('v3 re-anchor branch validates with the candidate guard before promotion', () => {
  assert.match(script, /guardProduction\(root, directory, actual, undefined, \{/);
  assert.match(script, /allowFloorReanchor: true/);
  assert.match(script, /installed\.guardProduction\(root, directory, actual\)/);
  // A hold code must always be classified, never swallowed.
  assert.match(script, /CONFIG_FLOOR_PROMOTION=HOLD:\$\{code\}/);
});
