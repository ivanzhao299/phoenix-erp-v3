import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';
import { digest, LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { CONTRACT, MIGRATION_PATHS } from './production-config-guard.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { confirmedDailyRowsSql, reviewConfirmedLegacyFacts, verifyConfirmedModernSchemaSources } from './production-modern-schema-confirmed-scope.mjs';

export const baseline = '562ac964b63db7fde176bd275a419ff6f6054754';
const approvedMain = 'ba76e4ec331b7252bc2135e2d37070743e2594fd';
const timestamp = 1795800000000;
const name = 'PackagingShiftCloseSnapshot';
export const unit = timestamp + '-' + name;
const migrationPath = 'apps/api/src/database/migrations/' + unit + '.ts';
const migrationBlob = '7b7b1a62bb09002fa819796a060ae5e989fe1ccf';
const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
const hold = reason => { throw Error('PACKAGING_SHIFT_SCHEMA_HOLD=' + reason); };

export function verifySource(target, git) {
  if (!sha.test(target ?? '')) hold('TARGET');
  const [base, head, ...extra] = git('show', '-s', '--format=%P', target).split(' ');
  if (base !== approvedMain || !sha.test(head ?? '') || extra.length ||
      git('rev-parse', head + '^{tree}') !== git('rev-parse', target + '^{tree}')) hold('EXACT_MAIN_MERGE');
  const releaseFiles = new Set([
    '.github/workflows/controlled-pending-migration-apply.yml',
    'scripts/ops/packaging-shift-schema-release.mjs',
    'scripts/ops/packaging-shift-schema-release.test.mjs',
    'scripts/ops/egg-source-permissions-inspection-receipt.mjs',
    'scripts/ops/pending-migration-backup-paths.mjs',
  ]);
  const changed = new Set(git('diff', '--no-renames', '--name-only', approvedMain, target).split('\n'));
  if (changed.size !== releaseFiles.size || [...changed].some(file => !releaseFiles.has(file))) hold('REVIEWED_BATCH_CHANGED');
  if (git('diff', '--no-renames', '--name-status', baseline, target, '--', ...MIGRATION_PATHS) !== 'A\t' + migrationPath ||
      git('rev-parse', target + ':' + migrationPath) !== migrationBlob) hold('MIGRATION_SET');
  if (git('diff', '--no-renames', '--name-only', baseline, target, '--', ...CONTRACT.criticalFiles)) hold('CONFIG_FLOOR_CHANGED');
  return { target, baseline, migrations: [{ path: migrationPath, blob: migrationBlob }] };
}

export function ledgerBeforeApply(ledger, applied) {
  if (!Array.isArray(ledger?.typeorm) || !Array.isArray(ledger.legacy)) hold('LEDGER');
  const isCandidate = row => String(row.timestamp) === String(timestamp) || row.name === name + timestamp;
  const matches = ledger.typeorm.filter(isCandidate);
  if (!applied && matches.length === 0) return ledger;
  if (!applied || matches.length !== 1 || String(matches[0].timestamp) !== String(timestamp) ||
      matches[0].name !== name + timestamp) hold('LEDGER_DELTA');
  return { ...ledger, typeorm: ledger.typeorm.filter(row => !isCandidate(row)) };
}

export const catalogSql = `SELECT jsonb_build_object(
  'baseReady', (SELECT count(*)=3 FROM pg_class
    WHERE oid IN (to_regclass('public.pkg_work_shifts'),to_regclass('public.pkg_exceptions'),to_regclass('public.pkg_audit_logs')) AND relkind='r')
    AND (SELECT count(*)=8 FROM pg_attribute WHERE attrelid=to_regclass('public.pkg_audit_logs')
      AND attnum>0 AND NOT attisdropped AND (
        (attname IN ('entity_type','entity_id','action') AND atttypid IN ('text'::regtype,'varchar'::regtype)
          AND (atttypmod=-1 OR atttypmod>=54))
        OR (attname IN ('before_data','after_data','reason') AND atttypid='text'::regtype)
        OR (attname='operator_id' AND atttypid IN ('integer'::regtype,'bigint'::regtype))
        OR (attname='created_at' AND atttypid IN ('timestamp'::regtype,'timestamptz'::regtype)
          AND (atthasdef OR NOT attnotnull))))
    AND EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND c.conkey=ARRAY[a.attnum]
      WHERE c.conrelid=to_regclass('public.pkg_audit_logs') AND c.contype='p' AND a.attname='id'
      AND a.atttypid IN ('integer'::regtype,'bigint'::regtype) AND (a.atthasdef OR a.attidentity<>'')),
  'columns', (SELECT COALESCE(jsonb_object_agg(t.relname||'.'||a.attname,
      jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull,a.atthasdef)), '{}'::jsonb)
    FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid WHERE a.attnum>0 AND NOT a.attisdropped
    AND ((t.oid=to_regclass('public.pkg_work_shifts') AND a.attname='close_snapshot_id')
      OR (t.oid=to_regclass('public.pkg_exceptions') AND a.attname IN ('shift_id','related_kind','related_id')))),
  'foreignKey', (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid=to_regclass('public.pkg_work_shifts')
    AND conname='fk_pkg_work_shifts_close_snapshot'),
  'trigger', (SELECT jsonb_build_array(tgtype,tgenabled,tgfoid=to_regprocedure('public.guard_pkg_shift_close_snapshot()'))
    FROM pg_trigger WHERE tgrelid=to_regclass('public.pkg_audit_logs') AND tgname='trg_pkg_shift_close_snapshot'),
  'guardFunction', to_regprocedure('public.guard_pkg_shift_close_snapshot()') IS NOT NULL,
  'indexes', (SELECT COALESCE(jsonb_object_agg(c.relname,pg_get_indexdef(i.indexrelid)), '{}'::jsonb)
    FROM pg_class c LEFT JOIN pg_index i ON i.indexrelid=c.oid AND i.indisvalid
    WHERE c.oid IN (to_regclass('public.uq_pkg_work_shifts_close_snapshot'),to_regclass('public.ix_pkg_exceptions_shift')))
)::text;`;

export function verifyCatalog(catalog, applied) {
  if (catalog?.baseReady !== true) hold('BASE_TABLES');
  const none = { baseReady: true, columns: {}, foreignKey: null, trigger: null, guardFunction: false, indexes: {} };
  const ready = {
    baseReady: true,
    columns: {
      'pkg_work_shifts.close_snapshot_id': ['bigint', false, false],
      'pkg_exceptions.shift_id': ['bigint', false, false],
      'pkg_exceptions.related_kind': ['text', false, false],
      'pkg_exceptions.related_id': ['text', false, false],
    },
    foreignKey: 'FOREIGN KEY (close_snapshot_id) REFERENCES pkg_audit_logs(id) ON DELETE RESTRICT',
    trigger: [27, 'O', true],
    guardFunction: true,
    indexes: {
      uq_pkg_work_shifts_close_snapshot: 'CREATE UNIQUE INDEX uq_pkg_work_shifts_close_snapshot ON public.pkg_work_shifts USING btree (close_snapshot_id) WHERE (close_snapshot_id IS NOT NULL)',
      ix_pkg_exceptions_shift: 'CREATE INDEX ix_pkg_exceptions_shift ON public.pkg_exceptions USING btree (shift_id) WHERE (shift_id IS NOT NULL)',
    },
  };
  if (canonicalDigest(catalog) !== canonicalDigest(applied ? ready : none)) hold('CATALOG');
}

function snapshot() {
  const sql = ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', 'SET LOCAL search_path=public;',
    "SET LOCAL statement_timeout='30s';", "SET LOCAL lock_timeout='3s';", 'SET LOCAL row_security=off;',
    auditSql, confirmedDailyRowsSql + ';', LEDGER_SQL, catalogSql,
    "SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.dict_code,to_jsonb(d)::text),'[]')::text FROM sys_dict d WHERE d.dict_type='PKG_HISTORY_POLICY';",
    'ROLLBACK;'].join('\n');
  const rows = execFileSync('docker', ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on',
    'phoenix-v3-db', 'sh', '-c', 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
  { input: sql, env: executionEnv(), encoding: 'utf8', timeout: 75000, maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
    .trimEnd().split('\n');
  if (rows.length !== 5) hold('SNAPSHOT');
  const [originalAudit, dailyRowsRaw, ledger, catalog, policy] = rows;
  const facts = reviewConfirmedLegacyFacts({ originalAudit, dailyRowsRaw });
  return { audit: facts.stableExactAuditSha256, daily: facts.dailyRowsSha256,
    ledger: JSON.parse(ledger), catalog: JSON.parse(catalog), policy: digest(policy) };
}

function evidence(env, reviewed, applied) {
  if (!hash.test(env.VET_CI_SHA256 ?? '') ||
      !/^ghcr\.io\/ivanzhao299\/phoenix-erp-v3\/api@sha256:[a-f0-9]{64}$/.test(env.VET_API_IMAGE ?? '')) hold('CANDIDATE_IMAGE');
  const runtime = captureRuntime();
  if (env.RUNNING_CHECKOUT !== baseline || !['api', 'web'].every(service => runtime[service]?.revision === baseline)) hold('RUNNING_BASELINE');
  const { audit, daily, ledger, catalog, policy } = snapshot();
  verifyCatalog(catalog, applied);
  const before = ledgerBeforeApply(ledger, applied);
  const beforeLedger = digest(JSON.stringify(before));
  if (!applied && (env.PENDING_CLASSES?.trim() !== unit || env.LEDGER_SHA256 !== beforeLedger)) hold('PENDING_SET');
  if (applied && (env.EXPECTED_BEFORE_LEDGER_SHA256 !== beforeLedger ||
      canonicalDigest(ledger) !== canonicalDigest(JSON.parse(env.AFTER_LEDGER)) ||
      canonicalDigest(before) !== canonicalDigest(JSON.parse(env.BEFORE_LEDGER)))) hold('LEDGER_MOVED');
  return canonicalDigest({ reviewed, runtime, beforeLedger, audit, daily, policy,
    apiImage: env.VET_API_IMAGE, ci: env.VET_CI_SHA256,
    confirmedSource: verifyConfirmedModernSchemaSources(CONTRACT.repository, undefined, reviewed.target) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = process.env;
    const git = (...args) => execFileSync('git', ['--no-replace-objects', '-c', 'safe.directory=' + process.cwd(),
      '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const reviewed = verifySource(env.TARGET_SHA, git);
    const operation = process.argv[2];
    if (operation === 'source') console.log(JSON.stringify(reviewed));
    else if (operation === 'inspect') console.log(evidence(env, reviewed, false));
    else if (operation === 'after') {
      if (evidence(env, reviewed, true) !== env.EXPECTED_VET_INSPECTION_SHA256) hold('INSPECTION_MOVED');
      console.log('PACKAGING_SHIFT_SCHEMA=EXACT_LEDGER_CATALOG_AND_HISTORY_POLICY_VERIFIED');
    } else hold('COMMAND');
  } catch (error) {
    console.error(/^(?:PACKAGING_SHIFT_SCHEMA_HOLD|MODERN_SCHEMA_SCOPE_HOLD)=[A-Z0-9_]+$/.test(error.message) ? error.message : 'PACKAGING_SHIFT_SCHEMA_HOLD=EVIDENCE_UNVERIFIED');
    process.exitCode = 1;
  }
}
