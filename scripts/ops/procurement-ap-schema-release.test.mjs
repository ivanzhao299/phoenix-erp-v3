import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { baseline, ledgerBeforeApply, storageBeforeApply, unit, verifySource } from './procurement-ap-schema-release.mjs';
import { parseInspectionReceipt } from './egg-source-permissions-inspection-receipt.mjs';

const migration = 'apps/api/src/database/migrations/' + unit + '.ts';
const blob = 'b14adacf3c013f490a29f280edccab972555e481';
const target = '1'.repeat(40);
const head = '2'.repeat(40);
const entry = { timestamp: 1795719000000, name: 'EnsureFinanceApPaymentAllocations1795719000000' };
const initial = { typeorm: [{timestamp: 1795659000000, name: 'EggSourceOperationReceipts1795659000000'}], legacy: [{filename: 'baseline.sql'}] };

function gitFixture({ parents = baseline + ' ' + head, changed, reviewChanges, migrationBlob = blob, criticalChange } = {}) {
  return (...args) => {
    if (args[0] === 'show') return parents;
    if (args[0] === 'merge-base') return '';
    if (args[0] === 'rev-parse') return args[1].endsWith('^{tree}') ? '3'.repeat(40) : migrationBlob;
    if (args[2] === '--name-status') return changed ?? 'A\t' + migration;
    if (args[2] === '--name-only' && args[3] !== baseline) {
      return reviewChanges ?? 'scripts/ops/procurement-ap-schema-release.mjs';
    }
    assert.equal(args[2], '--name-only');
    return criticalChange ?? 'apps/api/src/modules/approval-engine/approval-engine.service.ts';
  };
}

test('only accepts the approved batch merge, one exact DDL blob, and candidate-scoped release files', () => {
  const reviewed = verifySource(target, gitFixture());
  assert.deepEqual(reviewed, { target, baseline, migrations: [{ path: migration, blob }] });
  assert.throws(() => verifySource(target, gitFixture({ parents: head })), /EXACT_MAIN_MERGE/);
  assert.throws(() => verifySource(target, gitFixture({ migrationBlob: head })), /MIGRATION_SET/);
  assert.throws(() => verifySource(target, gitFixture({ changed: 'A\t' + migration + '\nA\tanother.ts' })), /MIGRATION_SET/);
  assert.throws(() => verifySource(target, gitFixture({ criticalChange: 'docker-compose.yml' })), /UNEXPECTED_CONFIG_FLOOR_CHANGE/);
  assert.throws(() => verifySource(target, gitFixture({ reviewChanges: 'apps/api/src/modules/wms/wms.service.ts' })), /REVIEWED_BATCH_CHANGED/);
});

test('accepts exactly one new ledger row and preserves evidence of all other rows', () => {
  assert.deepEqual(ledgerBeforeApply(initial, false), initial);
  assert.deepEqual(ledgerBeforeApply({ ...initial, typeorm: [...initial.typeorm, entry] }, true), initial);
  assert.throws(() => ledgerBeforeApply(initial, true), /LEDGER_DELTA/);
  assert.throws(() => ledgerBeforeApply({ ...initial, typeorm: [entry] }, false), /LEDGER_DELTA/);
  assert.throws(() => ledgerBeforeApply({ ...initial, typeorm: [entry, { ...entry, name: 'WrongClass' }] }, true), /LEDGER_DELTA/);
});

test('checks existing finance storage and normalizes only creation by this migration for post-evidence', () => {
  const base = { kind: 'r', sequence: 'payment_sequence', comment: null,
    columns: 'id invoice_id company_code currency_code exchange_rate payment_date payment_method bank_account reference_no cash_account_id created_at updated_at created_by updated_by'.split(' ') };
  const legacy = { fin_ap_payments: { ...base, columns: [...base.columns, 'payment_no', 'supplier_code', 'amount', 'note'] } };
  const created = { fin_ap_payment_allocations: { ...base, comment: 'Finance V2 AP payment allocations created by ' + entry.name,
    columns: [...base.columns, 'alloc_no', 'company_name', 'amount_original', 'amount_base', 'base_currency', 'remark'] } };
  assert.deepEqual(storageBeforeApply({}, false), {});
  assert.deepEqual(storageBeforeApply(legacy, true), legacy);
  assert.deepEqual(storageBeforeApply(created, true), {});
  assert.throws(() => storageBeforeApply(created, false), /UNREGISTERED_STORAGE/);
  assert.throws(() => storageBeforeApply({ ...legacy, ...created }, true), /UNEXPECTED_STORAGE_CREATION/);
  assert.throws(() => storageBeforeApply({ fin_ap_payments: { ...base, columns: [] } }, false), /PAYMENT_STORAGE_CONTRACT/);
  assert.throws(() => storageBeforeApply({}, true), /PAYMENT_STORAGE_MISSING/);
});

test('inspection receipt and workflow require the exact scope before it can apply', () => {
  const flow = readFileSync(new URL('../../.github/workflows/controlled-pending-migration-apply.yml', import.meta.url), 'utf8');
  const token = 'APPLY-PROCUREMENT-AP-20261128';
  const run = '20261128-1';
  const ledgerSha256 = 'a'.repeat(64);
  const scopedInspectionSha256 = 'b'.repeat(64);
  const stdout = [
    'LEDGER_SHA256=' + ledgerSha256, 'SCOPED_INSPECTION_SHA256=' + scopedInspectionSha256,
    'PENDING_MIGRATION_FILES=' + unit, 'VET_BACKUP_VOLUME=VERIFIED', 'INSPECT=COMPLETE',
  ].join('\n');
  assert.deepEqual(parseInspectionReceipt(stdout, target, run, 'procurement-ap-1128'), { target, run, ledgerSha256, scopedInspectionSha256 });
  assert.throws(() => parseInspectionReceipt(stdout.replace(unit, unit + ' another-unit'), target, run, 'procurement-ap-1128'), /INVALID_PENDING_MIGRATION_FILES/);
  assert.ok(flow.includes("inputs.audit_scope == 'procurement-ap-1128' && inputs.approve_production == '" + token + "'"));
  assert.ok(flow.includes('SCOPED_REVIEW_HELPER=procurement-ap-schema-release.mjs'));
  assert.ok(flow.indexOf('FINAL_VET_INSPECTION_SHA256="$(vet_inspection)"') < flow.indexOf('PRESERVE_ARTIFACTS=true bash scripts/deploy-schema-first.sh'));
  assert.ok(flow.includes('echo "MIGRATION_APPLY=HOLD_AUDIT_$AUDIT_CONCLUSION"'));
});
