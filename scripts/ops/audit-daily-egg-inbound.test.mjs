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

test('daily egg audit reports retired duplicates and production ledger balance', () => {
  assert.match(script, /DAILY_EGG_DUPLICATE_RETIRED/);
  assert.match(script, /retired_duplicate_batches/);
  assert.match(script, /unbalanced_production_batches/);
  assert.match(script, /TEMP_PRODUCTION_REVERSAL/);
  // Balance only claims untouched batches: outbound flows legitimately rewrite qty.
  assert.match(script, /change_type NOT IN \('TEMP_PRODUCTION_INBOUND', 'TEMP_PRODUCTION_REVERSAL'\)/);
  // GO requires zero duplicates, zero overposts and a balanced production ledger.
  assert.match(script, /WHEN \(SELECT COUNT\(\*\) FROM duplicate_sources\) = 0/);
  assert.match(script, /AND \(SELECT COUNT\(\*\) FROM overposted\) = 0/);
  assert.match(script, /AND \(SELECT unbalanced_batches FROM unbalanced\) = 0/);
});

test('daily egg audit repair signal stays informational for legacy FARM_IN rows', () => {
  // Legacy rows are counted for traceability; they never gate the conclusion.
  const conclusion = script.match(/'conclusion', CASE([\s\S]*?)END/s)?.[1] ?? '';
  assert.doesNotMatch(conclusion, /farm_rows/);
});
