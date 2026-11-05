import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistryReceipt } from './chanjet-admission-schema-receipt.mjs';

const migrationPath = 'apps/api/src/database/migrations/1792000000000-EnforceTempProductionSourceIdentity.ts';
const sourceBlob = 'a'.repeat(40);
const base = {
  schema: 'phoenix.migration-apply-receipt/v1', outcome: 'SUCCESS',
  migrationPath, migrationTimestamp: 1792000000000, migrationName: 'EnforceTempProductionSourceIdentity',
  runId: '41578117767-1', appliedAt: '2026-11-03T04:26:31.000Z', sourceSha: 'b'.repeat(40), sourceBlob,
  beforeLedgerSha256: 'c'.repeat(64), afterLedgerSha256: 'd'.repeat(64),
};

test('valid registry receipt passes', () => {
  assert.equal(validateRegistryReceipt(base, { migrationPath, sourceBlob }), true);
});

test('registry receipt rejects wrong schema, path, timestamp, name, blob or digests', () => {
  for (const patch of [
    { schema: 'phoenix.migration-apply-receipt/v2' },
    { outcome: 'HOLD' },
    { migrationPath: 'apps/api/src/database/migrations/other.ts' },
    { migrationTimestamp: 1 },
    { migrationName: 'Different' },
    { sourceBlob: 'f'.repeat(40) },
    { sourceSha: 'not-a-sha' },
    { runId: 'abc' },
    { beforeLedgerSha256: 'short' },
    { afterLedgerSha256: '' },
  ]) {
    assert.throws(() => validateRegistryReceipt({ ...base, ...patch }, { migrationPath, sourceBlob }), /MIGRATION_APPLY_RECEIPT_INVALID/, JSON.stringify(patch));
  }
  assert.throws(() => validateRegistryReceipt(null, { migrationPath, sourceBlob }), /MIGRATION_APPLY_RECEIPT_INVALID/);
});

test('registry receipt parses timestamp and class name from the migration path', () => {
  // 1792000000000-EnforceTempProductionSourceIdentity.ts → class EnforceTempProductionSourceIdentity1792000000000
  // is validated through the file name, never through runtime class naming.
  assert.equal(validateRegistryReceipt({ ...base, migrationName: 'EnforceTempProductionSourceIdentity' }, { migrationPath, sourceBlob }), true);
});
