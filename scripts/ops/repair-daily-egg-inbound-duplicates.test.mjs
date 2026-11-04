import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const script = fs.readFileSync(path.join(import.meta.dirname, 'repair-daily-egg-inbound-duplicates.sql'), 'utf8');

test('repair keeps rows and ledger history: no destructive statements', () => {
  assert.match(script, /ON COMMIT DROP/);
  assert.doesNotMatch(script, /\bDELETE\s+FROM\s+inv_(batches|ledger)/i);
  assert.doesNotMatch(script, /\bTRUNCATE\b/i);
  assert.doesNotMatch(script, /\bDROP\s+TABLE\s+inv_/i);
});

test('kept batches must equal the daily report exactly, in both directions', () => {
  // kept < report is as disqualifying as kept > report: the newest row must
  // be the authoritative posting, never an approximation of it.
  assert.match(script, /r\.qty IS NULL OR k\.qty <> r\.qty/);
  assert.doesNotMatch(script, /k\.qty > r\.qty/);
});

test('already-applied no-op is scope-bound, not marker-bound', () => {
  // A retired marker anywhere must not silence a repair while any overposted
  // (date, house, grade) group remains, or while no retired row even exists.
  const alreadyApplied = script.match(/IF EXISTS \(\s*SELECT 1 FROM inv_batches[\s\S]*?DAILY_EGG_REPAIR_ALREADY_APPLIED/)?.[0] ?? '';
  assert.match(alreadyApplied, /legacy_source LIKE '%DAILY_EGG_DUPLICATE_RETIRED%'/);
  assert.match(alreadyApplied, /COALESCE\(qty, 0\) = 0/);
  assert.match(alreadyApplied, /source_no IS NULL/);
  assert.match(script, /AND overpost_count = 0 THEN/);
  // The overpost summary used for the binding is the audit's own definition.
  assert.match(script, /COALESCE\(i\.qty, 0\) > COALESCE\(r\.qty, 0\)/);
});

test('reversal stays idempotent and refusal stays fail-closed', () => {
  assert.match(script, /WHERE NOT EXISTS \(\s*SELECT 1 FROM inv_ledger l[\s\S]*?TEMP_PRODUCTION_REVERSAL/);
  assert.match(script, /DAILY_EGG_REPAIR_UNSAFE_BATCH_STATE/);
  assert.match(script, /DAILY_EGG_REPAIR_LEGACY_SOURCE_NOT_EMPTY/);
  assert.match(script, /DAILY_EGG_REPAIR_DUPLICATES_REMAIN/);
});
