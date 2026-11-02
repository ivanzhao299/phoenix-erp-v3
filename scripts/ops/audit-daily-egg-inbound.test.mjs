import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const script = fs.readFileSync(path.join(import.meta.dirname, 'audit-daily-egg-inbound.mjs'), 'utf8');

test('daily egg audit is read-only and covers duplicate, overpost, and legacy ledger signals', () => {
  assert.match(script, /duplicate_sources/);
  assert.match(script, /overposted/);
  assert.match(script, /日报产蛋入账/);
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP)\b/i);
});
