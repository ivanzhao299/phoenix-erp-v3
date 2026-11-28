import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInspectionReceipt } from './egg-source-permissions-inspection-receipt.mjs';
import { baseline, ledgerBeforeApply, unit, verifyCatalog, verifySource } from './packaging-shift-schema-release.mjs';

const target = '1'.repeat(40);
const reviewedMain = 'ba76e4ec331b7252bc2135e2d37070743e2594fd';
const migrationPath = 'apps/api/src/database/migrations/' + unit + '.ts';
const migrationBlob = '7b7b1a62bb09002fa819796a060ae5e989fe1ccf';
const reviewedReleasePaths = [
  '.github/workflows/controlled-pending-migration-apply.yml',
  'scripts/ops/packaging-shift-schema-release.mjs',
  'scripts/ops/packaging-shift-schema-release.test.mjs',
  'scripts/ops/egg-source-permissions-inspection-receipt.mjs',
  'scripts/ops/pending-migration-backup-paths.mjs',
];

test('binds the merge, exactly one migration blob, and the unchanged configuration floor', () => {
  const git = (...args) => {
    if (args[0] === 'show') return reviewedMain + ' ' + '2'.repeat(40);
    if (args[0] === 'rev-parse') return args[1].endsWith('^{tree}') ? '3'.repeat(40) : migrationBlob;
    if (args[2] === '--name-status') return 'A\t' + migrationPath;
    if (args[3] === reviewedMain) return reviewedReleasePaths.join('\n');
    assert.equal(args[3], baseline);
    return '';
  };
  assert.deepEqual(verifySource(target, git), { target, baseline, migrations: [{ path: migrationPath, blob: migrationBlob }] });
  assert.throws(() => verifySource(target, (...args) => args[0] === 'show' ? '4'.repeat(40) + ' ' + '2'.repeat(40) : git(...args)), /EXACT_MAIN_MERGE/);
  assert.throws(() => verifySource(target, (...args) => args[3] === reviewedMain ? '.github/workflows/deploy.yml' : git(...args)), /REVIEWED_BATCH_CHANGED/);
  assert.throws(() => verifySource(target, (...args) => args[3] === reviewedMain ? reviewedReleasePaths.slice(1).join('\n') : git(...args)), /REVIEWED_BATCH_CHANGED/);
  assert.throws(() => verifySource(target, (...args) => args[2] === '--name-status' ? git(...args) + '\nA\tother.ts' : git(...args)), /MIGRATION_SET/);
  assert.throws(() => verifySource(target, (...args) => args[0] === 'rev-parse' && !args[1].endsWith('^{tree}') ? '5'.repeat(40) : git(...args)), /MIGRATION_SET/);
  assert.throws(() => verifySource(target, (...args) => args[2] === '--name-only' && args[3] === baseline ? 'docker-compose.yml' : git(...args)), /CONFIG_FLOOR_CHANGED/);
});

test('accepts a single exact ledger addition and rejects pre-applied, conflicting or duplicate entries', () => {
  const before = { legacy: ['prior.sql'], typeorm: [{ timestamp: '1', name: 'Earlier1' }] };
  const entry = { timestamp: '1795800000000', name: 'PackagingShiftCloseSnapshot1795800000000' };
  assert.equal(ledgerBeforeApply(before, false), before);
  assert.deepEqual(ledgerBeforeApply({ ...before, typeorm: [...before.typeorm, entry] }, true), before);
  for (const entries of [[], [entry, entry], [{ ...entry, name: 'Unexpected' }], [{ ...entry, timestamp: '2' }]]) {
    assert.throws(() => ledgerBeforeApply({ ...before, typeorm: [...before.typeorm, ...entries] }, true), /LEDGER_DELTA/);
  }
  assert.throws(() => ledgerBeforeApply({ ...before, typeorm: [...before.typeorm, entry] }, false), /LEDGER_DELTA/);
});

test('rejects partial catalog state before migration and requires the complete postcondition', () => {
  const empty = { baseReady: true, columns: {}, foreignKey: null, trigger: null, guardFunction: false, indexes: {} };
  verifyCatalog(empty, false);
  assert.throws(() => verifyCatalog({ ...empty, baseReady: false }, false), /BASE_TABLES/);
  assert.throws(() => verifyCatalog({ ...empty, guardFunction: true }, false), /CATALOG/);
  assert.throws(() => verifyCatalog(empty, true), /CATALOG/);
});

test('the inspection artifact accepts only the single packaging migration and the protected backup volume', () => {
  const ledgerSha256 = 'a'.repeat(64);
  const scopedInspectionSha256 = 'b'.repeat(64);
  const stdout = [
    'LEDGER_SHA256=' + ledgerSha256,
    'SCOPED_INSPECTION_SHA256=' + scopedInspectionSha256,
    'PENDING_MIGRATION_FILES= ' + unit,
    'VET_BACKUP_VOLUME=VERIFIED',
    'INSPECT=COMPLETE',
  ].join('\n');
  const scope = 'packaging-shift-close-1128';
  assert.deepEqual(parseInspectionReceipt(stdout, target, '42-1', scope), { target, run: '42-1', ledgerSha256, scopedInspectionSha256 });
  assert.throws(() => parseInspectionReceipt(stdout.replace(unit, unit + ' other'), target, '42-1', scope), /PENDING_MIGRATION_FILES/);
  assert.throws(() => parseInspectionReceipt(stdout.replace('VET_BACKUP_VOLUME=VERIFIED', ''), target, '42-1', scope), /VET_BACKUP_VOLUME/);
});
