import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const migrationDir = 'apps/api/src/database/migrations';
const files = [
  '1789600000000-ConvergePhase1CanonicalSchema.ts',
  '1789600100000-WidenAccLedgerStoreCode.ts',
  '1789600200000-WidenWarehouseCodeForeignKeys.ts',
  '1789600300000-ConvergeInboundTimestamps.ts',
];

test('phase 1 migrations exist and preserve frozen history', () => {
  for (const file of files) {
    const source = fs.readFileSync(`${migrationDir}/${file}`, 'utf8');
    assert.match(source, /async up\(/);
    assert.match(source, /async down\(/);
  }
  assert.equal(execFileSync('git', ['diff', '--name-only', '43c5f817ad15d5abe42f522b26fbfe917dbc51a2', '--', 'apps/api/migrations', 'migrations'], { encoding: 'utf8' }), '');
});

test('phase 1 target contracts are explicit', () => {
  const all = files.map((file) => fs.readFileSync(`${migrationDir}/${file}`, 'utf8')).join('\n');
  assert.match(all, /VARCHAR\(128\)/);
  assert.match(all, /VARCHAR\(64\)/);
  assert.match(all, /payload TYPE JSONB/);
  assert.match(all, /property_code_fkey/);
  assert.match(all, /AT TIME ZONE 'UTC'/);
  assert.match(all, /TIMESTAMPTZ/);
  for (const table of ['store_warehouse_bindings', 'store_replenishment_requests', 'sal_sales_orders', 'sal_delivery_orders', 'sal_return_orders']) assert.match(all, new RegExp(table));
});
