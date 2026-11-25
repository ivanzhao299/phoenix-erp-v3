import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { units, validateCatalog, verifyAppliedLedger, verifySource } from './production-ui-schema-release.mjs';

function sourceFixture(overrides = {}) {
  const target = 'a'.repeat(40), sealed = 'b'.repeat(40), reviewed = 'c'.repeat(40);
  const base = 'b80d326812b011966b3d98580ad001e20ac1acb2';
  const blob = 'd'.repeat(40), tree = 'e'.repeat(40);
  const seal = 'scripts/ops/production-ui-schema-reviewed-head';
  const paths = units.map(unit => 'apps/api/src/database/migrations/' + unit + '.ts');
  function git(command, ...args) {
    if (command === 'show') {
      if (args.includes('--format=%P')) return args.at(-1) === target ? base + ' ' + sealed : reviewed;
      return args[0] === target + ':' + seal ? reviewed : 'PENDING';
    }
    if (command === 'diff') {
      if (args.includes('--')) return paths.map(path => 'A\t' + path).join('\n') + (overrides.extraMigration ?? '');
      return overrides.sealChange ?? 'M\t' + seal;
    }
    if (command === 'rev-parse') return args[0] === target + '^{tree}' ? (overrides.targetTree ?? tree) : tree;
    if (command === 'merge-base') return '';
    if (command === 'ls-tree') return '100644 blob ' + blob + '\t' + args.at(-1);
    throw new Error('Unexpected Git command ' + command);
  }
  return () => verifySource(target, git);
}

test('accepts a sealed main merge with the exact three appended migration blobs', () => {
  assert.deepEqual(sourceFixture()().migrations.map(item => item.path.split('/').at(-1)), units.map(unit => unit + '.ts'));
  assert.throws(sourceFixture({ extraMigration: '\nA\tmigrations/extra.sql' }), /MIGRATION_SET/);
  assert.throws(sourceFixture({ sealChange: 'M\tapps/extra.ts' }), /REVIEWED_TREE/);
  assert.throws(sourceFixture({ targetTree: 'f'.repeat(40) }), /REVIEWED_TREE/);
});

test('the only accepted ledger change is the complete ordered three-unit delta', () => {
  const before = { legacy: [{ name: 'base' }], typeorm: [{ name: 'Other123', timestamp: 123 }] };
  const rows = units.map(unit => {
    const [timestamp, name] = unit.split('-');
    return { timestamp: Number(timestamp), name: name + timestamp };
  });
  const after = { ...before, typeorm: [...before.typeorm, ...rows] };
  verifyAppliedLedger(before, after);
  assert.throws(() => verifyAppliedLedger(before, { ...after, typeorm: after.typeorm.slice(0, -1) }), /AFTER_LEDGER_DELTA/);
  assert.throws(() => verifyAppliedLedger(before, { ...after, legacy: [] }), /AFTER_LEDGER_DELTA/);
  assert.throws(() => verifyAppliedLedger(after, after), /AFTER_LEDGER_DELTA/);
});

test('stops on partial schema before apply and requires compatible objects afterward', () => {
  const before = { databaseMajor: 16, dailyColumn: null, medicineReceiptTable: false, feedDayTable: false, feedItemTable: false, legacyFeedTable: false };
  validateCatalog(before, false);
  assert.throws(() => validateCatalog({ ...before, feedDayTable: true }, false), /PARTLY_APPLIED/);
  const after = { databaseMajor: 18, dailyColumn: { text: true, nullable: true, default: false },
    medicineReceiptTable: true, feedDayTable: true, feedItemTable: true, legacyFeedTable: true };
  validateCatalog(after, true);
  assert.throws(() => validateCatalog({ ...after, dailyColumn: { ...after.dailyColumn, default: true } }, true), /POST_SCHEMA/);
});

test('requires its own protected approval and retains the ordinary raw audit gate', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/controlled-pending-migration-apply.yml', import.meta.url), 'utf8');
  assert.match(workflow, /inputs\.audit_scope == 'production-ui-1125' && inputs\.approve_production == 'APPLY-PRODUCTION-UI-20261125'/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /test "\$AUDIT_CONCLUSION" = GO/);
  assert.match(workflow, /REQUIRE_BACKUP_RECEIPT=1/);
  assert.match(workflow, /production-ui-1125\) SCOPED_REVIEW_HELPER=production-ui-schema-release\.mjs/);
});
