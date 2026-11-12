import test from 'node:test';
import assert from 'node:assert/strict';
import { isCompatibleReceipt } from './record-migration-apply-receipt.mjs';

const base = {
  schema: 'phoenix.migration-apply-receipt/v1', outcome: 'SUCCESS',
  migrationPath: 'apps/api/src/database/migrations/1794400000000-SkuVarietyOrgScope.ts',
  migrationTimestamp: 1794400000000, migrationName: 'SkuVarietyOrgScope',
  sourceSha: 'a'.repeat(40), sourceBlob: 'b'.repeat(40),
  runId: 'old-1', appliedAt: '2026-01-01T00:00:00.000Z',
  beforeLedgerSha256: 'c'.repeat(64), afterLedgerSha256: 'd'.repeat(64),
};

test('replays an existing successful receipt when migration identity is unchanged', () => {
  assert.equal(isCompatibleReceipt(base, { ...base, runId: 'new-2', appliedAt: '2026-11-12T01:00:00.000Z', beforeLedgerSha256: 'e'.repeat(64), afterLedgerSha256: 'f'.repeat(64) }), true);
});

test('rejects a receipt whose source, path, timestamp, name or outcome changed', () => {
  for (const key of ['sourceBlob', 'sourceSha', 'migrationPath', 'migrationTimestamp', 'migrationName', 'outcome']) {
    const changed = { ...base, [key]: key === 'migrationTimestamp' ? 1 : 'changed' };
    assert.equal(isCompatibleReceipt(base, changed), false, key);
  }
});
