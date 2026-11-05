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

test('already-applied no-op is bound to the retired rows own repair scope', () => {
  // The no-op fingerprint is the (log_date, house) pairs of retired rows: a
  // retired marker under another date or house can never silence this run,
  // and within the retired scope both overpost AND kept-vs-report equality
  // (both directions) must hold before the run is allowed to no-op.
  const alreadyApplied = script.match(/DECLARE scope_rows int;[\s\S]*?DAILY_EGG_REPAIR_ALREADY_APPLIED/)?.[0] ?? '';
  assert.match(alreadyApplied, /retired_scope AS \(/);
  assert.match(alreadyApplied, /legacy_source LIKE '%DAILY_EGG_DUPLICATE_RETIRED%'/);
  assert.match(alreadyApplied, /COALESCE\(b\.qty, 0\) = 0/);
  assert.match(alreadyApplied, /b\.source_no IS NULL/);
  // Scope membership is explicit, never whole-database.
  assert.match(alreadyApplied, /IN \(SELECT log_date, house_code FROM retired_scope\)/);
  assert.match(alreadyApplied, /COALESCE\(i\.qty, 0\) > COALESCE\(r\.qty, 0\)/);
  // Mismatch must be bidirectional on the SAME FULL JOIN: a report grade with
  // zero inbound is a mismatch too, never a silent no-op pass.
  const mismatch = alreadyApplied.match(/SELECT COUNT\(\*\) FROM \(\s*[\s\S]*?mismatched\)/)?.[0] ?? '';
  assert.match(mismatch, /report_grade r\s*\n\s*FULL JOIN inbound_grade i USING \(log_date, house_code, grade\)/);
  assert.match(mismatch, /COALESCE\(r\.qty, 0\) <> COALESCE\(i\.qty, 0\)/);
  assert.match(script, /IF scope_rows > 0 AND scope_overpost = 0 AND scope_mismatch = 0 THEN/);
});

test('reversal stays idempotent and refusal stays fail-closed', () => {
  assert.match(script, /WHERE NOT EXISTS \(\s*SELECT 1 FROM inv_ledger l[\s\S]*?TEMP_PRODUCTION_REVERSAL/);
  assert.match(script, /DAILY_EGG_REPAIR_UNSAFE_BATCH_STATE/);
  assert.match(script, /DAILY_EGG_REPAIR_LEGACY_SOURCE_NOT_EMPTY/);
  assert.match(script, /DAILY_EGG_REPAIR_DUPLICATES_REMAIN/);
});
