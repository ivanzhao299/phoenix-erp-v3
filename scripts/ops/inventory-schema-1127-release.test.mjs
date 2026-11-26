import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { application, baseline, units, validateCatalog, verifyAppliedLedger, verifySource, withoutInventoryMigrations } from './inventory-schema-1127-release.mjs';
import { parseInspectionReceipt } from './egg-source-permissions-inspection-receipt.mjs';

const entry = units.map(unit => {
  const [number, name] = unit.split('-');
  return { timestamp: Number(number), name: name + number };
});
const other = { timestamp: 1795658400000, name: 'Earlier1795658400000' };
const before = { legacy: { source: 'unchanged' }, typeorm: [other] };
const after = { legacy: before.legacy, typeorm: [other, ...entry] };

test('accepts only the exact inventory ledger delta and leaves existing entries intact', () => {
  assert.doesNotThrow(() => verifyAppliedLedger(before, after));
  assert.deepEqual(withoutInventoryMigrations(after), before);
  assert.throws(() => verifyAppliedLedger(before, { ...after, typeorm: after.typeorm.slice(0, -1) }), /AFTER_LEDGER_DELTA/);
  assert.throws(() => verifyAppliedLedger(before, { ...after, typeorm: [...after.typeorm, { timestamp: 9, name: 'other' }] }), /AFTER_LEDGER_DELTA/);
  assert.throws(() => verifyAppliedLedger(before, { ...after, legacy: {} }), /AFTER_LEDGER_DELTA/);
  assert.throws(() => verifyAppliedLedger(after, after), /AFTER_LEDGER_DELTA/);
});

const fields = keys => Object.fromEntries(keys.split(' ').map(key => [key, 'text']));
const preCatalog = {
  major: 18,
  tables: ['wms_inbound_items'],
  columns: {
    inv_batches: fields('batch_no company_code warehouse_code unit qty qty_available updated_at'),
    inv_ledger: fields('id batch_no company_code warehouse_code unit change_type qty_change log_date'),
    wms_stocktake: fields('id stocktake_no warehouse_code status item batch_no book_qty actual_qty sys_qty act_qty diff_qty'),
    wms_transfer: fields('transfer_no'),
    wms_transfer_discrepancies: fields('resolution_type'),
    wms_inbound_items: { ...fields('id task_no batch_no product_code quantity_snapshot'), qty: 'integer', actual_qty: 'integer', broken_qty: 'integer' },
  },
  triggers: {},
  transferIdentity: true,
  discrepancyCheck: "CHECK (resolution_type IN ('LOSS','ADJUSTMENT'))",
};
const postCatalog = {
  ...preCatalog,
  tables: [...preCatalog.tables, 'wms_inbound_confirmation_receipts', 'wms_stocktake_submissions', 'wms_close_capture_epoch',
    'wms_close_capture', 'wms_daily_close_activation', 'wms_daily_closes', 'wms_close_event_claims', 'wms_atomic_transfer_receipts'],
  columns: {
    ...preCatalog.columns,
    inv_batches: { ...preCatalog.columns.inv_batches, transfer_cost_currency: 'text' },
    wms_stocktake: { ...preCatalog.columns.wms_stocktake,
      ...fields('document_kind quantity_unit quantity_delta inventory_count_type observed_batch_version') },
    wms_inbound_items: { ...preCatalog.columns.wms_inbound_items, qty: 'numeric', actual_qty: 'numeric', broken_qty: 'numeric' },
  },
  triggers: {
    bind_wms_stocktake_batch_version: ['wms_stocktake', 'O'],
    legacy_warehouse_close_readonly: ['wms_stocktake', 'O'],
    inventory_wms_close_capture: ['inv_batches', 'O'],
    ledger_wms_close_capture: ['inv_ledger', 'O'],
  },
  discrepancyCheck: "CHECK (resolution_type IN ('LOSS','ADJUSTMENT','CUSTODY'))",
};

test('checks old column compatibility and verified post-migration precision and trigger state', () => {
  assert.doesNotThrow(() => validateCatalog(preCatalog, false));
  assert.doesNotThrow(() => validateCatalog(postCatalog, true));
  assert.throws(() => validateCatalog(postCatalog, false), /PARTIAL_SCHEMA/);
  const missingSnapshot = structuredClone(preCatalog);
  delete missingSnapshot.columns.wms_inbound_items.quantity_snapshot;
  assert.throws(() => validateCatalog(missingSnapshot, false), /RECEIPT_COLUMNS/);
  const wrongQty = structuredClone(postCatalog);
  wrongQty.columns.wms_inbound_items.qty = 'integer';
  assert.throws(() => validateCatalog(wrongQty, true), /RECEIPT_QUANTITIES/);
  const wrongTrigger = structuredClone(postCatalog);
  wrongTrigger.triggers.ledger_wms_close_capture[1] = 'D';
  assert.throws(() => validateCatalog(wrongTrigger, true), /CAPTURE_TRIGGERS/);
});

test('the inspection artifact binds every approved migration and rejects extra members', () => {
  const target = 'f'.repeat(40), ledgerSha256 = 'a'.repeat(64), scopedInspectionSha256 = 'b'.repeat(64);
  const stdout = ['LEDGER_SHA256=' + ledgerSha256, 'SCOPED_INSPECTION_SHA256=' + scopedInspectionSha256,
    'PENDING_MIGRATION_FILES= ' + units.join(' '), 'VET_BACKUP_VOLUME=VERIFIED', 'INSPECT=COMPLETE'].join('\n');
  assert.deepEqual(parseInspectionReceipt(stdout, target, '321-1', 'inventory-1127'),
    { target, run: '321-1', ledgerSha256, scopedInspectionSha256 });
  assert.throws(() => parseInspectionReceipt(stdout.replace(units[2], units[2] + ' unexpected'), target, '321-1', 'inventory-1127'),
    /PENDING_MIGRATION_FILES/);
});

test('the scoped application tree contains exactly these reviewed schema files', () => {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  assert.equal(git('rev-parse', application + '^1'), baseline);
  assert.deepEqual(git('diff', '--name-only', baseline, application, '--', 'apps/api/src/database/migrations').split('\n'),
    units.map(unit => 'apps/api/src/database/migrations/' + unit + '.ts'));
  assert.throws(() => verifySource(application, git), /EXACT_MAIN_MERGE/);
});
