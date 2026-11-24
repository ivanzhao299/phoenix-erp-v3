import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { confirmedDailyRowsSql, reviewConfirmedLegacyFacts } from './production-modern-schema-confirmed-scope.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { captureRuntime } from './capture-production-runtime.mjs';
import { MIGRATION_PATHS } from './production-config-guard.mjs';

export const baseline = '44b3e692c18952d7be755114368f15fbcd1d8fba';
export const reviewedHeadFile = 'scripts/ops/vet-1124-reviewed-head';
const releasedFeatureMerge = 'cd7d50c813a9ba34e636fd89b4de13a80ef3e947';
export const readerRepairPaths = [
  '.github/workflows/controlled-pending-migration-apply.yml',
  'scripts/ops/vet-1124-ci.mjs',
  'scripts/ops/vet-1124-migration.mjs',
  'scripts/ops/vet-1124-migration.test.mjs',
  reviewedHeadFile,
];
const releasedReaderMerge = 'ca5675a3c36115283fb709e146382e4d878b99d5';
export const backupRepairChanges = [
  'M\t.github/workflows/controlled-pending-migration-apply.yml',
  'M\tdocs/ops/vet-1124-controlled-migrations.md',
  'M\tscripts/ops/pending-migration-backup-paths.mjs',
  'A\tscripts/ops/vet-1124-backup-volume.mjs',
  'A\tscripts/ops/vet-1124-backup-volume.test.mjs',
  'M\tscripts/ops/vet-1124-migration.mjs',
  'M\tscripts/ops/vet-1124-migration.test.mjs',
  'M\t' + reviewedHeadFile,
];
export const units = ['1795478400000-EggWithdrawalReview', '1795500000000-VetMaterialAllocation', '1795500100000-VetMaterialIdentity'];
const paths = units.map(unit => 'apps/api/src/database/migrations/' + unit + '.ts');
const sourceRuns = ['45352175233', '45351436581'];
const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
const image = /^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[0-9a-f]{64}$/;
const hold = reason => { throw Error('VET_1124_HOLD=' + reason); };

export function reviewedSource(target, root = process.cwd(), expectedBase = baseline, featureMerge = releasedFeatureMerge, readerMerge = releasedReaderMerge) {
  if (!sha.test(target)) hold('TARGET_SHA');
  const git = (...args) => execFileSync('git', ['--no-replace-objects', '-c', 'safe.directory=' + root,
    '-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8', timeout: 15000 }).trimEnd();
  // Seal the complete reviewed PR head with one data-only commit. The merge
  // hash is known only after merge, so verify both parents and the exact tree.
  const parents = revision => git('show', '-s', '--format=%P', revision).split(' ');
  const [first, sealed, ...extra] = parents(target);
  if (!sha.test(sealed) || extra.length) hold('EXACT_MAIN_MERGE');
  if (first !== expectedBase) {
    const changes = (from,to) => git('diff','--ignore-submodules=none','--no-renames','--name-status',from,to);
    const readerChanges = readerRepairPaths.map(path => 'M\t' + path).join('\n');
    if (first === readerMerge && parents(first)[0] === featureMerge && parents(featureMerge)[0] === expectedBase) {
      if (changes(featureMerge,first) !== readerChanges || changes(first,target) !== backupRepairChanges.join('\n')) hold('BACKUP_REPAIR_TREE');
    } else {
      if (first !== featureMerge || parents(first)[0] !== expectedBase) hold('EXACT_MAIN_MERGE');
      if (changes(first,target) !== readerChanges) hold('READER_REPAIR_TREE');
    }
  }
  const reviewed = git('show', target + ':' + reviewedHeadFile);
  if (!sha.test(reviewed) || parents(sealed).join(' ') !== reviewed
      || git('show', reviewed + ':' + reviewedHeadFile) !== 'PENDING'
      || git('diff', '--ignore-submodules=none', '--no-renames', '--name-status', reviewed, sealed) !== 'M\t' + reviewedHeadFile
      || git('rev-parse', sealed + '^{tree}') !== git('rev-parse', target + '^{tree}')) hold('REVIEWED_TREE');
  git('merge-base', '--is-ancestor', expectedBase, reviewed);
  if (git('diff', '--ignore-submodules=none', '--no-renames', '--name-status', expectedBase, target, '--', ...MIGRATION_PATHS)
      !== paths.map(p => 'A\t' + p).join('\n')) hold('MIGRATION_SET');
  const migrations = paths.map(path => {
    const [mode, type, blob] = git('ls-tree', reviewed, '--', path).split(/[ \t]/);
    if (mode !== '100644' || type !== 'blob' || !sha.test(blob)) hold('MIGRATION_BLOB');
    return { path, blob };
  });
  return { baseline: expectedBase, reviewed, target, migrations };
}

export function reviewSnapshot({ originalAudit, dailyRowsRaw, source, runtime,
  checkout, pending, ledgerSha256, ciSha256, apiImage }) {
  if (checkout !== baseline || !['api','web'].every(service => runtime?.[service]?.revision === baseline
      && /^sha256:[0-9a-f]{64}$/.test(runtime[service].imageId))) hold('RUNNING_BASELINE');
  if (pending.trim().split(/\s+/).join('\n') !== units.join('\n')) hold('PENDING_SET');
  if (!hash.test(ledgerSha256) || !hash.test(ciSha256) || !image.test(apiImage)) hold('INSPECTION_INPUT');
  const facts = reviewConfirmedLegacyFacts({ originalAudit, dailyRowsRaw });
  const audit = JSON.parse(originalAudit);
  // FARM_IN totals and the number of retained rows describe history. Their
  // exact values remain bound by stableExactAuditSha256 across inspect/apply.
  if (!Number.isSafeInteger(audit.legacy_daily_farm_in_rows) || audit.legacy_daily_farm_in_rows < 0
      || !Number.isSafeInteger(audit.legacy_daily_farm_in_qty)
      || !Number.isSafeInteger(audit.retired_duplicate_batches) || audit.retired_duplicate_batches < 0) hold('HISTORY_EVIDENCE');
  // The reviewed retired batches carry zero stock. Any remaining quantity
  // in them is outside the two untouched, live 30-egg batches.
  if (audit.retired_duplicate_qty !== 0) hold('RETIRED_BATCH_STOCK');
  const evidence = { authorization: 'VET_1124_TEST_BATCHES_413_415', sourceRuns, source, runtime, apiImage, ciSha256,
    ledgerSha256, originalConclusion: 'HOLD', scopedConclusion: 'GO_VET_1124_EXACT_CANDIDATE',
    stableExactAuditSha256: facts.stableExactAuditSha256, dailyRowsSha256: facts.dailyRowsSha256 };
  return { ...evidence, inspectionSha256: canonicalDigest(evidence) };
}

export function verifyAppliedLedger(before, after) {
  // TypeORM appends the reviewed class names in this single transaction.
  // Keep all pre-existing TypeORM and legacy rows bound to the pre-DDL snapshot.
  const expected = units.map(unit => {
    const [stamp, name] = unit.split('-');
    return { timestamp: Number(stamp), name: name + stamp };
  });
  const isNew = row => expected.some(e => String(e.timestamp) === String(row.timestamp));
  if (!Array.isArray(before.typeorm) || !Array.isArray(after.typeorm) || before.typeorm.some(isNew)
      || canonicalDigest(before.legacy) !== canonicalDigest(after.legacy)
      || canonicalDigest(before.typeorm) !== canonicalDigest(after.typeorm.filter(row => !isNew(row)))
      || canonicalDigest(after.typeorm.filter(isNew)) !== canonicalDigest(expected)) hold('AFTER_LEDGER_DELTA');
}

export function readAuditSnapshot(run = execFileSync) {
  const sql = ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', 'SET LOCAL search_path=public;',
    "SET LOCAL statement_timeout='30s';", "SET LOCAL lock_timeout='3s';", 'SET LOCAL row_security=off;',
    auditSql, confirmedDailyRowsSql + ';', 'ROLLBACK;'].join('\n');
  const output = run('docker', ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on',
    'phoenix-v3-db', 'sh', '-c', 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
  { input: sql, encoding: 'utf8', timeout: 75000, maxBuffer: 20 * 1024 * 1024 });
  const rows = output.trimEnd().split('\n');
  if (rows.length !== 2) hold('AUDIT_SNAPSHOT');
  return { originalAudit: rows[0], dailyRowsRaw: rows[1] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = process.env;
    const source = reviewedSource(env.TARGET_SHA);
    if (process.argv[2] === 'source') console.log(JSON.stringify(source));
    else if (process.argv[2] === 'after') verifyAppliedLedger(JSON.parse(env.BEFORE_LEDGER), JSON.parse(env.AFTER_LEDGER));
    else if (process.argv[2] === 'inspect') {
      const snapshot = readAuditSnapshot();
      console.error('AUDIT_CONCLUSION=' + JSON.parse(snapshot.originalAudit).conclusion);
      const evidence = reviewSnapshot({ ...snapshot, source, runtime: captureRuntime(),
        checkout: env.RUNNING_CHECKOUT, pending: env.PENDING_CLASSES, ledgerSha256: env.LEDGER_SHA256,
        ciSha256: env.VET_CI_SHA256, apiImage: env.VET_API_IMAGE });
      console.error(JSON.stringify(evidence));
      console.error('VET_SCOPED_CONCLUSION=' + evidence.scopedConclusion);
      console.log(evidence.inspectionSha256);
    } else hold('COMMAND');
  } catch (e) {
    console.error('VET_SCOPED_CONCLUSION=HOLD');
    console.error(e.message.split('\n')[0]);
    process.exitCode = 1;
  }
}
