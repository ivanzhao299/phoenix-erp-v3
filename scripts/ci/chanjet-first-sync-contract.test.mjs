// R4.2d production controlled-entry acceptance: the REAL first-sync entry
// (chanjet-readonly-first-sync firstSyncCore) through the REAL protected
// alignment API contract (bearer auth, server-derived owner, REAL scheduler,
// REAL execution-bound alignment worker, REAL cron-monitor records) on an
// isolated PostgreSQL18 with a local loopback provider fixture and a
// SYNTHETIC approval/floor. No real provider, no production identifiers
// beyond the agreed book scope, no production workflow dispatch.
//
// Covered: the positive chain (controlled root workflow prepare-sync
// handover -> first-sync entry -> scheduler SUCCESS gate -> VERIFIED) and
// the rejection paths — origin mismatch (tampered admission identity, owner
// not server-derived), budget exhaustion, overdue deadline, business facts
// changed — each keeping its non-overwritable failure evidence.
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const fixtureUrl = process.env.CHANJET_ADMISSION_FIXTURE_URL;
if (process.env.CHANJET_FIRST_SYNC_REQUIRED === 'true' && !fixtureUrl) {
  throw Error('REAL_FIRST_SYNC_FIXTURE_URL_REQUIRED');
}
const repoRoot = process.cwd().replace(/\/apps\/api$/, '');
const apiDir = path.join(repoRoot, 'apps', 'api');
const distStore = path.join(apiDir, 'dist/modules/chanjet/chanjet-execution-admission.store.js');
if (process.env.CHANJET_FIRST_SYNC_REQUIRED === 'true' && !fs.existsSync(distStore)) {
  throw Error('COMPILED_ADMISSION_STORE_REQUIRED');
}
const orchestrator = path.join(repoRoot, 'scripts/ops/chanjet-execution-orchestrate.mjs');
const registerCli = path.join(repoRoot, 'scripts/ops/chanjet-execution-admission-register.mjs');
const hostScript = path.join(repoRoot, 'scripts/ci/chanjet-orchestration-scheduler-host.mjs');
const providerScript = path.join(repoRoot, 'scripts/ci/chanjet-orchestration-provider-fixture.mjs');
const firstSyncModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts/ops/chanjet-readonly-first-sync.mjs')).href;
const { firstSyncCore, firstSyncDeps, businessFingerprints, makeDurableStop, makeProductionStopExecutor, bindPositionalParameters } = await import(firstSyncModuleUrl);

const database = fixtureUrl ? describe : describe.skip;

// Agreed business scope under review — the only identifiers that mirror the
// real book landscape; approval/execution/expiry values stay synthetic.
const FLOOR_SHA = 'f'.repeat(40);
const VERIFY_BOOK = '3533914511118750';
const BOOKS = [
  { bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI' },
  { bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI' },
  { bookId: '3539743721526654', companyCode: 'COMP-LAO-FOOD' },
];
const PERIOD = '202610';
const OPERATOR = 'ROOT_OPERATOR';

function assertOwnFixtureUrl(u) {
  const parsed = new URL(u);
  const disposable = /^(chanjet_admission_fixture|chanjet_transport_fixture.*|root_admission_review)$/.test(parsed.pathname.slice(1));
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) || !disposable) {
    throw Error('PARENT_FIXTURE_URL_REQUIRED: loopback host and dedicated disposable database name required');
  }
  return parsed;
}
assert.equal(typeof fixtureUrl, 'string');
assertOwnFixtureUrl(fixtureUrl);

const require2 = createRequire(import.meta.url);
const { DataSource } = require2(path.join(apiDir, 'node_modules/typeorm/index.js'));
const distGuard = path.join(apiDir, 'dist/modules/chanjet/chanjet-execution-guard-executor.js');

// the REAL bounded-guard stop the production entry uses: the registered
// manifest + the guard executor over the SAME database

let dataSource;
let provider;
let workDir;
let lockFile;
const providerHitsFile = path.join(repoRoot, `first-sync-hits-${randomUUID().slice(0, 8)}.jsonl`);

async function withSchema() {
  assertOwnFixtureUrl(fixtureUrl);
  dataSource = new DataSource({ type: 'postgres', url: fixtureUrl, logging: false });
  await dataSource.initialize();
  await dataSource.query('DROP SCHEMA public CASCADE');
  await dataSource.query('CREATE SCHEMA public');
  const migrationModule = await import(pathToFileURL(path.join(apiDir, 'dist/database/migrations/1791878400000-CreateChanjetExecutionAdmissions.js')).href);
  const migration = new migrationModule.CreateChanjetExecutionAdmissions1791878400000();
  const runner = dataSource.createQueryRunner();
  try { await migration.up(runner); } finally { await runner.release(); }
  // production-shaped tables (existing production schema, NOT a new design)
  await dataSource.query(`CREATE TABLE chanjet_book_company_map (
    bookid varchar(64) PRIMARY KEY, book_name varchar(256), company_code varchar(64) UNIQUE,
    company_name varchar(256), sync_enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
  await dataSource.query(`CREATE TABLE chanjet_account_books (
    book_id varchar(64) PRIMARY KEY, book_name varchar(256), company_code varchar(64),
    company_name varchar(256), enabled boolean DEFAULT false, raw_data jsonb, last_probe_at timestamptz,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
  await dataSource.query(`CREATE TABLE sys_chanjet_state (
    key varchar(16) PRIMARY KEY, app_ticket text, certificate text, tokens jsonb,
    updated_at timestamptz DEFAULT now())`);
  await dataSource.query(`CREATE TABLE chanjet_sync_jobs (
    id serial PRIMARY KEY, job_type varchar(32) NOT NULL, book_id varchar(64) DEFAULT '',
    company_code varchar(64) DEFAULT '', period varchar(16) DEFAULT '', status varchar(24) DEFAULT 'RUNNING',
    orchestration_run_id varchar(64), error_message text, request_scope jsonb, result_summary jsonb,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
  await dataSource.query(`CREATE TABLE sys_organizations (
    id bigserial PRIMARY KEY, org_code varchar(64), org_name varchar(256), org_type varchar(32),
    status varchar(16), company_code varchar(64))`);
  for (const book of BOOKS) {
    await dataSource.query('INSERT INTO chanjet_book_company_map (bookid, book_name, company_code, company_name) VALUES ($1,$2,$3,$4)', [book.bookId, `BOOK_${book.bookId}`, book.companyCode, book.companyCode]);
    await dataSource.query('INSERT INTO chanjet_account_books (book_id, book_name, company_code, company_name, enabled) VALUES ($1,$2,$3,$4,true)', [book.bookId, `BOOK_${book.bookId}`, book.companyCode, book.companyCode]);
    await dataSource.query(`INSERT INTO sys_organizations (org_code, org_name, org_type, status, company_code) VALUES ($1,$2,'COMPANY','ACTIVE',$3)`, [book.companyCode, book.companyCode, book.companyCode]);
  }
  await dataSource.query("INSERT INTO sys_chanjet_state (key, app_ticket) VALUES ('singleton', 'SYNTHETIC_TICKET')");
  // the REAL restoration preflight SQL runs verbatim in the acceptance —
  // synthesize the tables it counts (counts and bindings only)
  await dataSource.query(`CREATE TABLE chanjet_entity_snapshots (
    id bigserial PRIMARY KEY, book_id varchar(64), endpoint_key varchar(64), entity_type varchar(64),
    external_id varchar(128), period varchar(16), last_seen_at timestamptz)`);
  await dataSource.query(`CREATE TABLE chanjet_read_snapshots (id bigserial PRIMARY KEY, pulled_at timestamptz DEFAULT now())`);
  await dataSource.query(`CREATE TABLE chanjet_ar_snapshot (id bigserial PRIMARY KEY)`);
  await dataSource.query(`CREATE TABLE chanjet_reconciliation_results (
    id bigserial PRIMARY KEY, status varchar(32), resolved boolean DEFAULT false)`);
  await dataSource.query(`CREATE TABLE chanjet_master_mapping (
    id bigserial PRIMARY KEY, match_status varchar(32), review_status varchar(32))`);
  await dataSource.query(`CREATE TABLE chanjet_writeback_outbox (
    id bigserial PRIMARY KEY, state varchar(32), attempt_count integer DEFAULT 0)`);
  await dataSource.query(`CREATE TABLE chanjet_wms_writeback_outbox (
    id bigserial PRIMARY KEY, state varchar(32), attempt_count integer DEFAULT 0)`);
  await dataSource.query(`CREATE TABLE chanjet_erp_inbound_sync_runs (id bigserial PRIMARY KEY)`);
  for (const table of ['fin_ar_ledger', 'fin_ar_invoices', 'fin_ap_invoices', 'fin_cash_transactions', 'inv_batches', 'inv_ledger', 'sal_sales_orders']) {
    await dataSource.query(`CREATE TABLE ${table} (id bigserial PRIMARY KEY, marker text)`);
  }
  await dataSource.query(`CREATE TABLE sys_chanjet_api_budget (
    budget_key varchar(64) PRIMARY KEY, request_count integer DEFAULT 0, updated_at timestamptz DEFAULT now())`);
}

function syntheticManifest(cap = 10) {
  const id = randomUUID().replace(/-/g, '');
  return {
    version: 1,
    executionId: `EXEC_${id.slice(0, 24)}`,
    ownerId: OPERATOR,
    requestCap: cap,
    totalTimeoutMs: 360_000,
    httpTimeoutMs: 30_000,
    approval: {
      version: 3,
      approvalId: `APPROVAL_${id.slice(0, 20)}`,
      floorSha: FLOOR_SHA,
      sourceClassification: 'PRODUCTION_DATA',
      remoteWrite: false,
      erpInbound: false,
      books: BOOKS.map((b) => ({ ...b })),
      scopes: ['RECEIVABLE_STATISTICS'],
      periodPolicy: 'REQUESTED_PERIOD_NO_BACKFILL',
      verification: { bookId: VERIFY_BOOK, period: PERIOD, scope: ['RECEIVABLE_STATISTICS'], expiresAt: `${new Date(Date.now() + 20 * 60_000).toISOString().slice(0, 23)}Z` },
    },
  };
}

function approvedPolicyFileValue(manifest) {
  // EXACT key set the API's approvedReadonlyPolicy accepts (no extras)
  const a = manifest.approval;
  return {
    version: a.version,
    approvalId: a.approvalId,
    floorSha: a.floorSha,
    sourceClassification: a.sourceClassification,
    remoteWrite: a.remoteWrite,
    erpInbound: a.erpInbound,
    books: a.books,
    scopes: a.scopes,
    periodPolicy: a.periodPolicy,
    verification: a.verification,
    verifiedRunId: '',
    verifiedEvidenceRunId: '',
  };
}

function writeJson(name, value) {
  const file = path.join(workDir, `${name}-${randomUUID().slice(0, 8)}.json`);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

async function registerExecution({ cap = 10, totalTimeoutMs = 360_000 } = {}) {
  const manifest = syntheticManifest(cap);
  manifest.totalTimeoutMs = totalTimeoutMs;
  const manifestFile = writeJson('manifest', manifest);
  const floorStateFile = writeJson('floor-state', {
    version: 1,
    floorSha: FLOOR_SHA,
    deployedSha: FLOOR_SHA,
    chanjetPolicy: 'READONLY_VERIFY',
    readonlyApproval: { approvalId: manifest.approval.approvalId, books: manifest.approval.books, verification: manifest.approval.verification },
    operationalTuple: { CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' },
  });
  const approvalFile = writeJson('approval', approvedPolicyFileValue(manifest));
  const registered = spawnSync(process.execPath, [
    registerCli, '--manifest', manifestFile, '--expected-floor-sha', FLOOR_SHA, '--pg-url', fixtureUrl, '--register',
  ], { encoding: 'utf8', env: { ...process.env } });
  assert.equal(registered.status, 0, `registration refused: ${registered.stdout} ${registered.stderr}`);
  // the DB-OWNED deadline is read back from the trusted admission row
  const [row] = await dataSource.query('SELECT deadline_at FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
  assert.ok(row?.deadline_at, 'registered deadline missing');
  return { manifest, manifestFile, floorStateFile, approvalFile, executionId: manifest.executionId, execution: { executionId: manifest.executionId, floorStateFile, deadlineAt: new Date(row.deadline_at), manifestFile } };
}

// the controlled root workflow handover: registers (fd 9 held by this
// process), probes, begins SYNCING and STOPS — the first-sync entry owns the
// enqueue from there
function runPrepareSync({ manifestFile, floorStateFile }) {
  const inner = [
    `'${process.execPath}'`, `'${orchestrator}'`,
    '--manifest', `'${manifestFile}'`,
    '--expected-floor-sha', `'${FLOOR_SHA}'`,
    '--floor-state', `'${floorStateFile}'`,
    '--pg-url', `'${fixtureUrl}'`,
    '--provider-base', `'${provider.base}'`,
    '--phase', `'prepare-sync'`,
    '--skip-registration', '--fd9-lock', `'${lockFile}'`,
  ].join(' ');
  const command = `exec 9>>'${lockFile}'; flock -n 9; ${inner}`;
  const run = spawnSync('bash', ['-c', command], {
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      CHANJET_APP_KEY: 'SYNTHETIC_KEY',
      CHANJET_APP_SECRET: 'SYNTHETIC_SECRET',
      CHANJET_ORG_ID: 'SYNTHETIC_ORG',
      CHANJET_CERT: 'SYNTHETIC_CERT',
    },
  });
  const line = String(run.stdout).split('\n').find((l) => l.startsWith('CHANJET_EXECUTION_ORCHESTRATE='));
  assert.ok(line, `no orchestrator verdict line:\n${run.stdout}\n${run.stderr}`);
  if (!line.includes(';PASS')) { try { require('fs').appendFileSync('/tmp/fs-trace.log', `ORCHESTRATOR ${line}\n`); } catch { /* */ } }
  const [verdict, json] = line.split(';');
  return { verdict: verdict.split('=')[1], summary: json ? JSON.parse(json) : {}, stdout: run.stdout, stderr: run.stderr };
}

function startHost({ approvalFile }) {
  const child = spawn(process.execPath, [
    hostScript,
    '--pg-url', fixtureUrl,
    '--provider-base', provider.base,
    '--auth-token', 'SYNTHETIC_OP_TOKEN',
    '--sync-policy', 'READONLY_VERIFY',
    '--readonly-approval', approvalFile,
  ], {
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, CHANJET_READONLY_SYNC_ENABLED: 'true', CHANJET_APP_KEY: 'SYNTHETIC_KEY', CHANJET_APP_SECRET: 'SYNTHETIC_SECRET', CHANJET_ORG_ID: 'SYNTHETIC_ORG', CHANJET_CERT: 'SYNTHETIC_CERT' },
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('HOST_START_TIMEOUT')), 10_000);
    child.stdout.on('data', function onData(d) {
      const port = String(d).match(/PORT (\d+)/)?.[1];
      if (!port) return;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      resolve({ child, base: `http://127.0.0.1:${port}` });
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(Error(`HOST_EXITED:${code}`)); });
  });
}

// isolated evidence adapter: the SAME preflight/fingerprint/binding SQL runs
// against the fixture database
const readEvidence = async (sql) => {
  const result = await dataSource.query(sql);
  const rows = Array.isArray(result) ? result : [result];
  const row = (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) ?? {};
  const keys = Object.keys(row);
  return keys.length ? row[keys[0]] : {};
};

function coreDeps({ execution, runId, leaseId, endpoint, identityOverride, durableStop, handoverOverride } = {}) {
  const approval = identityOverride
    ?? JSON.parse(fs.readFileSync(execution.floorStateFile, 'utf8')).readonlyApproval;
  return firstSyncDeps({
    env: {
      TARGET_SHA: FLOOR_SHA,
      APPROVED_CONFIG_FLOOR_SHA: FLOOR_SHA,
      CHANJET_SYNC_OPERATOR_TOKEN: 'SYNTHETIC_OP_TOKEN',
      DEPLOY_RUN_ID: runId,
    },
    handover: handoverOverride ?? { executionId: execution.executionId, leaseId, deadlineAt: execution.execution.deadlineAt },
    durableStop,
    fetchImpl: fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 400))),
    readDatabaseEvidence: readEvidence,
    businessFingerprints: () => businessFingerprints(readEvidence),
    captureRuntime: async () => ({ api: { revision: FLOOR_SHA } }),
    guardProduction: () => ({ chanjetPolicy: 'READONLY_VERIFY', floorSha: FLOOR_SHA, readonlyApproval: approval }),
    requireCleanMain: () => { /* isolated acceptance: the production clean-main
      guard runs only in the approved root control workflow; asserted there */ },
    stateDirectory: workDir,
    fileExists: (file) => fs.existsSync(file),
    // the production atomicState enforces the APPROVED production state
    // directory (production-trusted-paths) — in the isolated acceptance the
    // evidence lives in the fixture work directory with the same
    // write-then-rename atomicity
    atomicState: (file, value) => {
      const tmp = `${file}.tmp-${randomUUID().slice(0, 8)}`;
      fs.writeFileSync(tmp, JSON.stringify(value));
      fs.renameSync(tmp, file);
    },
    endpoint: endpoint ?? `${host.base}/chanjet/integration/alignment/`,
  });
}

const evidenceState = (runId) => JSON.parse(fs.readFileSync(path.join(workDir, `first-sync-${runId}.json`), 'utf8'));

const providerHits = () => fs.readFileSync(providerHitsFile, 'utf8').split('\n').filter(Boolean).length;

// the fixture DB container: explicit override first; otherwise discovered
// from the runner's docker state by matching the fixture database name (the
// environment may carry several postgres containers)
function resolveFixtureDbContainer() {
  if (process.env.CHANJET_STOP_DB_CONTAINER) return process.env.CHANJET_STOP_DB_CONTAINER;
  const fixtureDbName = new URL(fixtureUrl).pathname.slice(1);
  const candidates = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((n) => n.includes('postgres'));
  return candidates.find((n) => {
    try {
      const envJson = execFileSync('docker', ['exec', n, 'printenv', 'POSTGRES_DB'], { encoding: 'utf8' }).trim();
      return envJson === fixtureDbName;
    } catch { return false; }
  }) || candidates[0] || 'phoenix-r42a-admission-fixture';
}

database('first-sync protected-entry acceptance (real entry, real scheduler host, real PostgreSQL18, local provider)', () => {
  before(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-sync-'));
    lockFile = path.join(workDir, 'mutation.lock');
    fs.writeFileSync(lockFile, '');
    await withSchema();
    const child = spawn(process.execPath, [providerScript, '--hits-file', providerHitsFile], { stdio: ['ignore', 'pipe', 'ignore'] });
    provider = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('PROVIDER_START_TIMEOUT')), 10_000);
      child.stdout.on('data', function onData(d) {
        const port = String(d).match(/PORT (\d+)/)?.[1];
        if (!port) return;
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve({ child, base: `http://127.0.0.1:${port}` });
      });
      child.on('exit', () => { clearTimeout(timer); reject(Error('PROVIDER_EXITED')); });
    });
  });
  after(async () => {
    provider?.child?.kill();
    if (dataSource?.isInitialized) await dataSource.destroy().catch(() => undefined);
  });

  test('positive chain: prepare-sync handover -> first-sync entry -> real scheduler -> VERIFIED with unchanged business facts and a real monitor record', async () => {
    const execution = await registerExecution({ cap: 10 });
    const prepared = runPrepareSync(execution);
    assert.equal(prepared.verdict, 'PASS', prepared.stderr);
    assert.equal(prepared.summary.prepareSync?.handover, 'FIRST_SYNC_ENTRY');
    const host = await startHost({ approvalFile: execution.approvalFile });
    try {
      const runId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const result = await firstSyncCore(coreDeps({
        runId,
        execution,
        leaseId: prepared.summary.leases.sync,
        endpoint: `${host.base}/chanjet/integration/alignment/`,
      }));
      assert.equal(result.phase, 'VERIFIED');
      // non-overwritable VERIFIED evidence, bound to the execution
      const state = evidenceState(runId);
      assert.equal(state.phase, 'VERIFIED');
      assert.equal(state.execution?.executionId, execution.executionId);
      assert.equal(state.remoteWrite, false);
      assert.equal(state.erpInbound, false);
      // REAL monitor record: the scheduler's ok() heartbeat landed in the DB
      const [heartbeat] = await dataSource.query(`SELECT last_status, success_count FROM sys_cron_heartbeat WHERE job_name='chanjet-full-readonly-sync'`);
      assert.equal(heartbeat?.last_status, 'SUCCESS');
      assert(Number(heartbeat?.success_count) >= 1);
      // admission terminal state: VERIFIED by the scheduler's SUCCESS gate
      const [admission] = await dataSource.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [execution.executionId]);
      assert.equal(admission.phase, 'VERIFIED');
      assert.equal(admission.hold_reason, '');
      // the business fingerprint tables were never touched
      const [ledger] = await dataSource.query('SELECT count(*)::int AS n FROM fin_ar_ledger');
      assert.equal(ledger.n, 0);
    } finally {
      host.child.kill();
    }
  });

  test('production call chain: the REAL prepare script (deploy workflow delivery) registers, probes, hands over — then the first-sync entry completes to VERIFIED', async () => {
    const execution = await registerExecution({ cap: 10 });
    // prepare-sync handover through the REAL production prepare script — the
    // SAME script the deploy workflow runs inside the API container — staged
    // with the delivered compiled modules layout; the execution is already
    // registered (R42D_SKIP_REGISTRATION), matching the root workflow's
    // register-then-prepare sequencing
    const prepareScript = path.join(repoRoot, 'scripts/ops/chanjet-readonly-production-prepare.mjs');
    const prepare = spawnSync(process.execPath, [prepareScript], {
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        R42D_MANIFEST: JSON.stringify(execution.manifest),
        EXPECTED_FLOOR_SHA: FLOOR_SHA,
        R42D_STATE: workDir,
        R42D_DIST_ROOT: path.join(apiDir, 'dist'),
        R42D_MODULES: path.join(apiDir, 'node_modules'),
        DB_HOST: '127.0.0.1', DB_PORT: String(new URL(fixtureUrl).port || 5432),
        DB_USER: new URL(fixtureUrl).username, DB_PASSWORD: decodeURIComponent(new URL(fixtureUrl).password),
        DB_NAME: new URL(fixtureUrl).pathname.slice(1),
        CHANJET_APP_KEY: 'SYNTHETIC_KEY', CHANJET_APP_SECRET: 'SYNTHETIC_SECRET',
        CHANJET_ORG_ID: 'SYNTHETIC_ORG', CHANJET_CERT: 'SYNTHETIC_CERT',
        CHANJET_PROVIDER_BASE_URL: provider.base,
        // the API container's OWN runtime tuple + deployed approval (the
        // prepare verifies both against the manifest); the REAL READONLY_VERIFY
        // tuple keeps the sync window OPEN (readonlyEnvironment: non-HOLD ⇒
        // CHANJET_READONLY_SYNC_ENABLED='true')
        CHANJET_SYNC_POLICY: 'READONLY_VERIFY',
        CHANJET_READONLY_SYNC_ENABLED: 'true',
        CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false',
        CHANJET_READONLY_APPROVAL: JSON.stringify(approvedPolicyFileValue(execution.manifest)),
        R42D_SKIP_REGISTRATION: '1',
      },
    });
    const prepareLine = String(prepare.stdout).split('\n').find((l) => l.startsWith('PREPARE='));
    assert.equal(prepareLine?.split(';')[0], 'PREPARE=PASS', `${prepare.stdout} ${prepare.stderr}`);
    const handover = JSON.parse(prepareLine.split(';')[1]);
    assert.equal(handover.executionId, execution.executionId);
    assert.equal(handover.floorSha, FLOOR_SHA);
    // the handover file the entry reads
    const hostHandover = path.join(workDir, `prepare-sync-handover-${execution.executionId}.json`);
    fs.writeFileSync(hostHandover, JSON.stringify(handover));
    const host = await startHost({ approvalFile: execution.approvalFile });
    try {
      const runId = `${Date.now()}-0`;
      const deps = await coreDeps({
        runId,
        execution,
        leaseId: handover.leaseId,
        endpoint: `${host.base}/chanjet/integration/alignment/`,
        floorStateFile: execution.floorStateFile,
        handoverOverride: { executionId: handover.executionId, leaseId: handover.leaseId },
      });
      const result = await firstSyncCore(deps);
      assert.equal(result.phase, 'VERIFIED');
      const [admission] = await dataSource.query('SELECT phase FROM chanjet_execution_admissions WHERE execution_id=$1', [execution.executionId]);
      assert.equal(admission.phase, 'VERIFIED');
    } finally {
      host.child.kill();
    }
  }, 60_000);

  test('origin mismatch: a foreign approval identity refuses BEFORE the enqueue with zero provider HTTP', async () => {
    // two executions under TWO different approvals: running the entry for
    // execution A while presenting execution B's reviewed floor identity is
    // a SOURCE mismatch — the trusted admission row wins and the entry
    // refuses before any protected call (the admissions row itself is
    // immutable; the guard trigger forbids tampering with it)
    const foreign = await registerExecution({ cap: 10 });
    const execution = await registerExecution({ cap: 10 });
    const prepared = runPrepareSync(execution);
    assert.equal(prepared.verdict, 'PASS');
    const hitsBefore = providerHits();
    const deps = coreDeps({
      runId: `${Date.now()}-1`,
      execution,
      leaseId: prepared.summary.leases.sync,
      endpoint: 'http://127.0.0.1:9/chanjet/integration/alignment/',
      identityOverride: approvedPolicyFileValue(foreign.manifest), // the WRONG reviewed identity
    });
    await assert.rejects(firstSyncCore(deps), /FIRST_SYNC_HOLD=EXECUTION_BINDING/);
    assert.equal(providerHits(), hitsBefore); // zero provider HTTP
    const [admission] = await dataSource.query('SELECT phase FROM chanjet_execution_admissions WHERE execution_id=$1', [execution.executionId]);
    assert.equal(admission.phase, 'SYNCING'); // the execution itself is untouched
  });

  test('owner source mismatch: a run owned by something other than the server-derived principal refuses', async () => {
    // a stub alignment API whose status reports a client-passed style owner
    // (no user: prefix) — the entry must refuse the OWNER_SOURCE mismatch
    let acceptedRunId = '';
    const stub = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if ((req.url || '').endsWith('/enqueue')) {
        acceptedRunId = `RUN_${randomUUID().slice(0, 8)}`;
        res.end(JSON.stringify({ success: true, accepted: true, run: { runId: acceptedRunId } }));
        return;
      }
      res.end(JSON.stringify({ success: true, run: { runId: acceptedRunId, state: 'RUNNING', requestedBy: 'ROOT_OPERATOR' } }));
    });
    await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const stubBase = `http://127.0.0.1:${stub.address().port}`;
    try {
      const execution = await registerExecution({ cap: 10 });
      const prepared = runPrepareSync(execution);
      assert.equal(prepared.verdict, 'PASS');
      const deps = coreDeps({
        runId: `${Date.now()}-2`,
        execution,
        leaseId: prepared.summary.leases.sync,
        endpoint: `${stubBase}/chanjet/integration/alignment/`,
        durableStop: async (classification) => {
          try {
            const outcome = await makeDurableStop({
              distRoot: path.join(apiDir, 'dist'),
              pgUrl: fixtureUrl,
              readEvidence,
              handover: { executionId: execution.executionId, leaseId: prepared.summary.leases.sync, deadlineAt: execution.execution.deadlineAt.toISOString() },
            })(classification);
            console.log('STOP_OUTCOME', outcome);
            return outcome;
          } catch (stopError) {
            console.log('STOP_ERR', String(stopError?.message || stopError).slice(0, 200));
            throw stopError;
          }
        },
      });
      const ownerError = await firstSyncCore(deps).then(() => null, (e) => e);
      assert.ok(ownerError, 'expected a rejection');
      assert.match(ownerError.message, /FIRST_SYNC_HOLD=OWNER_SOURCE/);
      // the source drift was durably stopped through the REAL bounded guard
      assert.equal(ownerError.stopOutcome, 'CONFIRMED');
      const [held] = await dataSource.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [execution.executionId]);
      assert.equal(held.phase, 'HOLD');
      assert.equal(held.hold_reason, 'CANCELLED');
    } finally {
      await new Promise((resolve) => stub.close(resolve));
    }
  });

  test('production stop executor: safe complete parameter binding (out-of-order and repeated placeholders)', () => {
    // the REAL holdExecution statement shape: canonical manifest carries
    // $-like text inside? never — but placeholders appear in ANY order and
    // repeats must bind identically
    const sql = 'UPDATE t SET a=$2, b=$1 WHERE c=$3 AND d=$2 AND canonical=$4';
    const bound = bindPositionalParameters(sql, ['P1', 'P2', 'P3', 'P4']);
    // dollar-quoted literals, tag-agnostic: repeats bind the SAME value
    assert.match(bound, /a=\$r42d_[0-9a-f]+\$P2\$r42d_[0-9a-f]+\$/);
    assert.match(bound, /b=\$r42d_[0-9a-f]+\$P1\$r42d_[0-9a-f]+\$/);
    assert.match(bound, /c=\$r42d_[0-9a-f]+\$P3\$r42d_[0-9a-f]+\$/);
    assert.match(bound, /d=\$r42d_[0-9a-f]+\$P2\$r42d_[0-9a-f]+\$/);
    assert.equal(bound.split('$r42d_').length - 1, 10); // 5 placeholders x (open+close tag)
  });

  test('production stop executor: REAL holdExecution lands HOLD via the docker-exec channel', async () => {
    const execution = await registerExecution({ cap: 10 });
    const prepared = runPrepareSync(execution);
    assert.equal(prepared.verdict, 'PASS');
    const executor = makeProductionStopExecutor({
      dbContainer: resolveFixtureDbContainer(),
      timeoutMs: 30_000,
      // the docker-exec psql reads the DB name from the container env; the
      // container's POSTGRES_USER defaults to postgres inside the shell
    });
    const { ChanjetExecutionAdmissionStore } = await import(pathToFileURL(distStore).href);
    require(path.join(apiDir, 'node_modules/reflect-metadata'));
    const store = new ChanjetExecutionAdmissionStore(null);
    store.setStandaloneExecutor(executor);
    const outcome = await store.holdExecution({
      manifest: execution.manifest,
      leaseId: prepared.summary.leases.sync,
      phase: 'SYNCING',
      deadlineAt: execution.execution.deadlineAt,
    }, 'CANCELLED');
    assert.equal(outcome, 'CONFIRMED'); // the REAL holdExecution landed
    const [admission] = await dataSource.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [execution.executionId]);
    assert.equal(admission.phase, 'HOLD'); // the actual HOLD row in the database
    assert.equal(admission.hold_reason, 'CANCELLED');
  });

  test('stop channel initialization is bounded: an unreachable stop database reports UNCONFIRMED in bounded time', async () => {
    const execution = await registerExecution({ cap: 10 });
    const prepared = runPrepareSync(execution);
    assert.equal(prepared.verdict, 'PASS');
    // an unreachable NON-ROUTABLE stop database: the stop channel's
    // initialization and connection acquisition hang until the hard ceiling
    // bounds them — the hold reports UNCONFIRMED in bounded time
    const started = Date.now();
    const stop = await makeDurableStop({
      distRoot: path.join(apiDir, 'dist'),
      pgUrl: 'postgresql://postgres:postgres@10.255.255.1:5432/chanjet_admission_fixture',
      readEvidence,
      handover: { executionId: execution.executionId, leaseId: prepared.summary.leases.sync, deadlineAt: execution.execution.deadlineAt.toISOString() },
      ceilingMs: 2_000,
    })('CANCELLED').then(() => 'CONFIRMED', (e) => `THREW:${String(e?.message).slice(0, 80)}`);
    const elapsed = Date.now() - started;
    // either bound terminates the hung acquisition: our ceiling or pg's own
    // connectionTimeoutMillis — both destroy the underlying connection
    assert.match(stop, /THREW:(CHANJET_EXECUTION_STOP_CHANNEL_TIMEOUT:initialize|timeout expired)/);
    assert.ok(elapsed < 15_000, `bounded init took ${elapsed}ms`);
  });

  test('post-enqueue deadline: the DEADLINE-classified stop persists and the VERIFIED evidence is never written past the deadline', async () => {
    const execution = await registerExecution({ cap: 10, totalTimeoutMs: 5_000 });
    const prepared = runPrepareSync(execution);
    assert.equal(prepared.verdict, 'PASS');
    // a stub alignment API that stays RUNNING: the poll rides to the absolute
    // deadline, the stop classifies DEADLINE and persists it
    let acceptedRunId = '';
    const stub = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if ((req.url || '').endsWith('/enqueue')) {
        acceptedRunId = `RUN_${randomUUID().slice(0, 8)}`;
        res.end(JSON.stringify({ success: true, accepted: true, run: { runId: acceptedRunId } }));
        return;
      }
      res.end(JSON.stringify({ success: true, run: { runId: acceptedRunId, state: 'RUNNING', requestedBy: `user:${OPERATOR}` } }));
    });
    await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const stubBase = `http://127.0.0.1:${stub.address().port}`;
    try {
      const runId = `${Date.now()}-6`;
      const deps = coreDeps({
        runId,
        execution,
        leaseId: prepared.summary.leases.sync,
        endpoint: `${stubBase}/chanjet/integration/alignment/`,
        durableStop: makeDurableStop({
          distRoot: path.join(apiDir, 'dist'),
          pgUrl: fixtureUrl,
          readEvidence,
          handover: { executionId: execution.executionId, leaseId: prepared.summary.leases.sync, deadlineAt: execution.execution.deadlineAt.toISOString() },
        }),
      });
      const deadlineError = await firstSyncCore(deps).then(() => null, (e) => e);
      assert.ok(deadlineError, 'expected a rejection');
      assert.match(deadlineError.message, /FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT/);
      assert.equal(deadlineError.classification, 'DEADLINE');
      assert.equal(deadlineError.stopOutcome, 'CONFIRMED');
      const [held] = await dataSource.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [execution.executionId]);
      assert.equal(held.phase, 'HOLD');
      assert.equal(held.hold_reason, 'DEADLINE');
      // the VERIFIED evidence is NEVER written past the deadline: the
      // retained file stays at PREPARED
      assert.equal(evidenceState(runId).phase, 'PREPARED');
    } finally {
      await new Promise((resolve) => stub.close(resolve));
    }
  }, 30_000);

  test('strict proof negative: a COMPLETED run without the receipt ordinals refuses with FIRST_SYNC_PROOF and NO_HOLD_NEEDED', async () => {
    const execution = await registerExecution({ cap: 10 });
    const prepared = runPrepareSync(execution);
    assert.equal(prepared.verdict, 'PASS');
    // a stub alignment API that completes the run but with NO job proof at
    // all — the strict proof refuses a COMPLETED run alone
    let acceptedRunId = '';
    let statusCalls = 0;
    let verifiedFlipped = false;
    const { ChanjetExecutionAdmissionStore } = await import(pathToFileURL(distStore).href);
    require(path.join(apiDir, 'node_modules/reflect-metadata'));
    const proofStore = new ChanjetExecutionAdmissionStore(dataSource.manager);
    const stub = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if ((req.url || '').endsWith('/enqueue')) {
        acceptedRunId = `RUN_${randomUUID().slice(0, 8)}`;
        res.end(JSON.stringify({ success: true, accepted: true, run: { runId: acceptedRunId } }));
        return;
      }
      // on the FIRST status poll the scheduler's own gate commits VERIFIED
      // (the reviewed transition; the rehearsal receipt is its evidence) —
      // AFTER the entry's binding stage, BEFORE the strict proof
      statusCalls += 1;
      if (statusCalls === 1 && !verifiedFlipped) {
        verifiedFlipped = true;
        try { await proofStore.finish({ manifest: execution.manifest, leaseId: prepared.summary.leases.sync, phase: 'SYNCING', deadlineAt: execution.execution.deadlineAt }, 'VERIFIED'); } catch { /* already terminal */ }
      }
      res.end(JSON.stringify({ success: true, run: { runId: acceptedRunId, state: statusCalls >= 2 ? 'COMPLETED' : 'RUNNING', decision: 'GO', requestedBy: `user:${OPERATOR}` } }));
    });
    await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const stubBase = `http://127.0.0.1:${stub.address().port}`;
    try {
      const deps = coreDeps({
        runId: `${Date.now()}-7`,
        execution,
        leaseId: prepared.summary.leases.sync,
        endpoint: `${stubBase}/chanjet/integration/alignment/`,
        durableStop: makeDurableStop({
          distRoot: path.join(apiDir, 'dist'),
          pgUrl: fixtureUrl,
          readEvidence,
          handover: { executionId: execution.executionId, leaseId: prepared.summary.leases.sync, deadlineAt: execution.execution.deadlineAt.toISOString() },
        }),
      });
      const proofError = await firstSyncCore(deps).then(() => null, (e) => e);
      assert.ok(proofError, 'expected a rejection');
      assert.match(proofError.message, /FIRST_SYNC_HOLD=FIRST_SYNC_PROOF/);
      // the execution is VERIFIED by the scheduler's own gate: no hold applies
      assert.equal(proofError.stopOutcome, 'NO_HOLD_NEEDED');
    } finally {
      await new Promise((resolve) => stub.close(resolve));
    }
  }, 30_000);

  test('budget exhaustion: the worker send refuses, the run lands HOLD and nothing is retried or reported successful', async () => {
    const execution = await registerExecution({ cap: 5 }); // the handover consumes 4; the worker's next send refuses
    const prepared = runPrepareSync(execution);
    assert.equal(prepared.verdict, 'PASS');
    const host = await startHost({ approvalFile: execution.approvalFile });
    try {
      const runId = `${Date.now()}-3`;
      const deps = coreDeps({
        runId,
        execution,
        leaseId: prepared.summary.leases.sync,
        endpoint: `${host.base}/chanjet/integration/alignment/`,
        durableStop: makeDurableStop({
          distRoot: path.join(apiDir, 'dist'),
          pgUrl: fixtureUrl,
          readEvidence,
          handover: { executionId: execution.executionId, leaseId: prepared.summary.leases.sync, deadlineAt: execution.execution.deadlineAt.toISOString() },
        }),
      });
      const budgetError = await firstSyncCore(deps).then(() => null, (e) => e);
      assert.ok(budgetError, 'expected a rejection');
      assert.match(budgetError.message, /FIRST_SYNC_HOLD=FAILURE_OR_TIMEOUT/);
      assert.equal(budgetError.stopOutcome, 'ALREADY_STOPPED'); // the scheduler's own durable stop stands
      // the run durably HOLDS: exactly one run — never retried, never successful
      const jobs = await dataSource.query(`SELECT status FROM chanjet_sync_jobs WHERE request_scope->'execution'->>'executionId' = $1`, [execution.executionId]);
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].status, 'FAIL');
      const [admission] = await dataSource.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [execution.executionId]);
      assert.equal(admission.phase, 'HOLD');
      assert.equal(admission.hold_reason, 'CAP'); // the budget refusal is the durable stop reason
      const state = evidenceState(runId);
      assert.equal(state.phase, 'PREPARED'); // the failure evidence is retained, never overwritten
    } finally {
      host.child.kill();
    }
  });

  test('overdue deadline: the expired execution refuses BEFORE the enqueue with zero provider HTTP', async () => {
    // a SHORT natural deadline: the admission expires on its own (the
    // admissions row is IMMUTABLE — the guard trigger forbids mutation)
    const execution = await registerExecution({ cap: 10, totalTimeoutMs: 5_000 });
    const prepared = runPrepareSync(execution);
    assert.equal(prepared.verdict, 'PASS');
    const [row] = await dataSource.query('SELECT deadline_at FROM chanjet_execution_admissions WHERE execution_id=$1', [execution.executionId]);
    const remaining = new Date(row.deadline_at).getTime() - Date.now();
    await new Promise((resolve) => setTimeout(resolve, Math.max(200, remaining + 400)));
    const hitsBefore = providerHits();
    const deps = coreDeps({
      runId: `${Date.now()}-4`,
      execution,
      leaseId: prepared.summary.leases.sync,
      endpoint: 'http://127.0.0.1:9/chanjet/integration/alignment/',
    });
    await assert.rejects(firstSyncCore(deps), /FIRST_SYNC_HOLD=EXECUTION_BINDING/);
    assert.equal(providerHits(), hitsBefore); // zero provider HTTP
  });

  test('business facts changed: the run refuses, the PREPARED evidence is retained and the run id is never reusable', async () => {
    const execution = await registerExecution({ cap: 10 });
    const prepared = runPrepareSync(execution);
    assert.equal(prepared.verdict, 'PASS');
    const host = await startHost({ approvalFile: execution.approvalFile });
    try {
      const runId = `${Date.now()}-5`;
      // mutate a fingerprinted business table (inv_batches — counted by the
      // business fingerprints, NOT by the preflight side-effect keys) exactly
      // before the AFTER fingerprints read: deterministic, mid-verification
      const deps = coreDeps({
        runId,
        execution,
        leaseId: prepared.summary.leases.sync,
        endpoint: `${host.base}/chanjet/integration/alignment/`,
      });
      let evidenceCalls = 0;
      deps.readDatabaseEvidence = async (sql) => {
        evidenceCalls += 1;
        if (evidenceCalls === 4) {
          await dataSource.query(`INSERT INTO inv_batches (marker) VALUES ('R4_2D_ACCEPTANCE_MUTATION')`);
        }
        return readEvidence(sql);
      };
      deps.businessFingerprints = () => businessFingerprints(deps.readDatabaseEvidence);
      await assert.rejects(firstSyncCore(deps), /FIRST_SYNC_HOLD=BUSINESS_FACT_CHANGED/);
      // the failure evidence is retained, never overwritten
      const state = evidenceState(runId);
      assert.equal(state.phase, 'PREPARED');
      // the run id is never reusable: a FRESH valid execution with the SAME
      // run id still refuses on the retained evidence file (before any
      // protected call)
      const fresh = await registerExecution({ cap: 10 });
      const freshPrepared = runPrepareSync(fresh);
      assert.equal(freshPrepared.verdict, 'PASS');
      const retryDeps = coreDeps({
        runId,
        execution: fresh,
        leaseId: freshPrepared.summary.leases.sync,
        endpoint: `${host.base}/chanjet/integration/alignment/`,
      });
      await assert.rejects(firstSyncCore(retryDeps), /FIRST_SYNC_HOLD=RUN_REUSED/);
      assert.equal(evidenceState(runId).phase, 'PREPARED'); // still untouched
    } finally {
      host.child.kill();
    }
  });

  // ── the REAL production chain (chanjet-readonly-production-chain.sh) ──────
  // The chain script itself executes for real under bash: FD9 identity on the
  // inherited lock, stage sole ownership, manifest sha256 provenance, the
  // deploy-complete gate, the REAL audit module (READ ONLY evidence on the
  // fixture database, mapping-scope BLOCK semantics, fail-closed classification),
  // the REAL prepare inside the container surface (VERIFY tuple + deployed
  // approval + guard-triggered registration + probe + SYNCING handover) and
  // the REAL first-sync entry (budget reads, scheduler enqueue, strict proof,
  // durable stop). Only the host-trusted-path bindings are controlled (see
  // the shim/dispatcher/drivers in scripts/ci/).
  const chainScript = path.join(repoRoot, 'scripts/ops/chanjet-readonly-production-chain.sh');
  const auditDriver = path.join(repoRoot, 'scripts/ci/chanjet-first-sync-chain-audit-driver.mjs');
  const entryDriver = path.join(repoRoot, 'scripts/ci/chanjet-first-sync-chain-entry-driver.mjs');

  let chainShimBin = '';

  function writeChainShims() {
    chainShimBin = path.join(workDir, 'chain-bin');
    fs.rmSync(chainShimBin, { recursive: true, force: true });
    fs.mkdirSync(chainShimBin, { recursive: true });
    const shimModule = path.join(repoRoot, 'scripts/ci/chanjet-first-sync-docker-shim.mjs');
    const dispatchModule = path.join(repoRoot, 'scripts/ci/chanjet-first-sync-chain-dispatch.mjs');
    const wrapper = (name, invocation) => fs.writeFileSync(
      path.join(chainShimBin, name),
      `#!/bin/sh\nR42D_SHIM_BIN="$(dirname "$0")" exec '${process.execPath}' '${shimModule}' ${invocation} "$@"\n`,
      { mode: 0o755 },
    );
    wrapper('docker', 'docker');
    wrapper('git', 'git');
    wrapper('curl', 'curl');
    fs.writeFileSync(path.join(chainShimBin, 'node'), `#!/bin/sh\nexec '${process.execPath}' '${dispatchModule}' "$@"\n`, { mode: 0o755 });
  }

  async function runProductionChain({ manifest, deployRunId, firstSyncRunId, hostBase, syncPolicy = 'READONLY_VERIFY', readonlySyncEnabled = 'true', fd9File = lockFile, lockFileArg = lockFile, digestOverride = null, runningJob = false } = {}) {
    const manifestFile = writeJson('chain-manifest', manifest);
    // the deploy-complete evidence gate input (the deploy workflow's output)
    fs.writeFileSync(path.join(workDir, `deploy-${deployRunId}.json`), JSON.stringify({
      version: 3, runId: deployRunId, phase: 'IN_PROGRESS', configSha: FLOOR_SHA,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }));
    // the approved floor state both drivers verify against — the REAL
    // READONLY_VERIFY tuple keeps the sync window open
    fs.writeFileSync(path.join(workDir, 'floor.json'), JSON.stringify({
      version: 3, phase: 'READY', floorSha: FLOOR_SHA, chanjetPolicy: 'READONLY_VERIFY', project: 'phoenix',
      readonlyApproval: { approvalId: manifest.approval.approvalId, books: manifest.approval.books, verification: manifest.approval.verification },
      operationalTuple: { CHANJET_READONLY_SYNC_ENABLED: readonlySyncEnabled, CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false', PHOENIX_DATA_MOUNT_GUARD: 'true', PHOENIX_PG_DATA_DIR: '/data/pg', PHOENIX_UPLOADS_DIR: '/data/uploads' },
    }));
    if (runningJob) await dataSource.query(`INSERT INTO chanjet_sync_jobs (job_type, status) VALUES ('FULL_READONLY', 'RUNNING')`);
    const cfgFile = path.join(workDir, `chain-cfg-${randomUUID().slice(0, 8)}.json`);
    const traceFile = `${cfgFile}-trace.jsonl`;
    fs.writeFileSync(cfgFile, JSON.stringify({
      repoRoot, stateDir: workDir, r42dRoot: path.join(workDir, `r42d-stage-${deployRunId}`),
      targetSha: FLOOR_SHA, floorSha: FLOOR_SHA, project: 'phoenix',
      apiImageId: `sha256:${'a'.repeat(64)}`, webImageId: `sha256:${'b'.repeat(64)}`,
      syncPolicy, readonlySyncEnabled, erpInboundEnabled: 'false',
      approvalJson: JSON.stringify(approvedPolicyFileValue(manifest)),
      providerBase: provider.base, endpoint: `${hostBase}/chanjet/integration/alignment/`,
      dbContainerName: resolveFixtureDbContainer(),
      distRoot: path.join(apiDir, 'dist'), modulesRoot: path.join(apiDir, 'node_modules'),
      auditDriver, entryDriver,
      db: {
        host: '127.0.0.1', port: Number(new URL(fixtureUrl).port || 5432),
        user: decodeURIComponent(new URL(fixtureUrl).username || 'postgres'),
        password: decodeURIComponent(new URL(fixtureUrl).password || ''),
        name: new URL(fixtureUrl).pathname.slice(1),
      },
      traceFile,
    }));
    const command = `exec 9>>'${fd9File}'; flock -n 9 || exit 27; bash '${chainScript}'`;
    const run = spawnSync('bash', ['-c', command], {
      encoding: 'utf8', timeout: 240_000, cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${chainShimBin}:${process.env.PATH}`,
        R42D_SHIM_CONFIG: cfgFile,
        R42D_MANIFEST_FILE: manifestFile,
        R42D_MANIFEST_SHA256: digestOverride ?? createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex'),
        APPROVED_CONFIG_FLOOR_SHA: FLOOR_SHA,
        TARGET_SHA: FLOOR_SHA,
        DEPLOY_RUN_ID: deployRunId,
        FIRST_SYNC_RUN_ID: firstSyncRunId,
        STATE_DIR: workDir,
        CHANJET_SYNC_OPERATOR_TOKEN: 'SYNTHETIC_OP_TOKEN',
        FIRST_SYNC_LOCK_FILE: lockFileArg,
        API_CONTAINER: 'phoenix-v3-api',
        DB_CONTAINER: 'phoenix-v3-db',
      },
    });
    return { run, traceFile };
  }

  const admissionsFor = async (executionId) => (await dataSource.query(
    'SELECT count(*)::int AS n FROM chanjet_execution_admissions WHERE execution_id=$1', [executionId],
  ))[0].n;

  test('full chain: the REAL production-chain.sh — FD9 lock, manifest provenance, real audit, real prepare registration, first-sync to VERIFIED with the run ids bound separately', async () => {
    writeChainShims();
    const manifest = syntheticManifest(10);
    const deployRunId = `${Date.now()}-100`;
    const firstSyncRunId = `${Date.now()}-200`;
    const host = await startHost({ approvalFile: writeJson('chain-approval', approvedPolicyFileValue(manifest)) });
    try {
      const { run, traceFile } = await runProductionChain({ manifest, deployRunId, firstSyncRunId, hostBase: host.base });
      assert.equal(run.status, 0, `chain failed (${run.status}):\n${run.stdout}\n${run.stderr}`);
      // the real chain's stage verdicts on stdout, in order
      const prepareAt = run.stdout.indexOf('PREPARE=PASS;');
      const syncAt = run.stdout.indexOf('FIRST_CONTROLLED_SYNC=PASS;');
      assert.ok(prepareAt >= 0, run.stdout);
      assert.ok(syncAt > prepareAt, run.stdout);
      // the admission reached VERIFIED through the REAL registration + gate
      const [admission] = await dataSource.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
      assert.equal(admission.phase, 'VERIFIED');
      assert.equal(admission.hold_reason, '');
      // the chain-delivered handover on the host carries the reviewed identity
      const handover = JSON.parse(fs.readFileSync(path.join(workDir, 'prepare-sync-handover.json'), 'utf8'));
      assert.equal(handover.target, FLOOR_SHA);
      assert.equal(handover.executionId, manifest.executionId);
      // the first-sync evidence run is bound SEPARATELY from the deploy run
      const evidence = JSON.parse(fs.readFileSync(path.join(workDir, `first-sync-${firstSyncRunId}.json`), 'utf8'));
      assert.equal(evidence.phase, 'VERIFIED');
      assert.equal(evidence.execution.executionId, manifest.executionId);
      assert.ok(!fs.existsSync(path.join(workDir, `first-sync-${deployRunId}.json`)));
      // the shim surface saw no unmapped command
      const unexpected = fs.readFileSync(traceFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.kind === 'unexpectedCommand');
      assert.deepEqual(unexpected, []);
      // the business fingerprint tables were never touched
      const [ledger] = await dataSource.query('SELECT count(*)::int AS n FROM fin_ar_ledger');
      assert.equal(ledger.n, 0);
    } finally {
      host.child.kill();
    }
  }, 240_000);

  test('full chain: an audit BLOCK (a real running job in the database) blocks before registration and before any provider HTTP', async () => {
    writeChainShims();
    const manifest = syntheticManifest(10);
    const hitsBefore = providerHits();
    const handoverFile = path.join(workDir, 'prepare-sync-handover.json');
    const handoverMtimeBefore = fs.existsSync(handoverFile) ? fs.statSync(handoverFile).mtimeMs : -1;
    const { run } = await runProductionChain({
      manifest, deployRunId: `${Date.now()}-300`, firstSyncRunId: `${Date.now()}-400`,
      hostBase: 'http://127.0.0.1:9', runningJob: true,
    });
    assert.notEqual(run.status, 0);
    // the REAL audit's fail-closed classification surfaced through the chain
    assert.match(run.stderr, /CHANJET_PRODUCTION_AUDIT=HOLD class=RESTORATION_HOLD=CURRENT_JOBS_OR_MAPPING/);
    assert.ok(!run.stdout.includes('PREPARE=PASS'), run.stdout);
    // zero registration, zero provider HTTP, no new handover, no first-sync evidence
    assert.equal(await admissionsFor(manifest.executionId), 0);
    assert.equal(providerHits(), hitsBefore);
    assert.equal(fs.existsSync(handoverFile) ? fs.statSync(handoverFile).mtimeMs : -1, handoverMtimeBefore);
    // unblock for the following tests
    await dataSource.query(`DELETE FROM chanjet_sync_jobs WHERE job_type='FULL_READONLY' AND status='RUNNING'`);
  }, 120_000);

  test('full chain: FD9 not being the mutation lock refuses at the chain gate with zero registration', async () => {
    writeChainShims();
    const manifest = syntheticManifest(10);
    const decoyLock = path.join(workDir, `decoy-${randomUUID().slice(0, 8)}.lock`);
    fs.writeFileSync(decoyLock, '');
    const hitsBefore = providerHits();
    // FD9 is opened on the DECOY while the chain's declared mutation lock
    // stays the real one: the identity check must refuse the mismatch
    const { run } = await runProductionChain({
      manifest, deployRunId: `${Date.now()}-500`, firstSyncRunId: `${Date.now()}-600`,
      hostBase: 'http://127.0.0.1:9', fd9File: decoyLock, lockFileArg: lockFile,
    });
    assert.equal(run.status, 28, `FD9 gate: ${run.status}\n${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /FIRST_SYNC_HOLD=FD9_IDENTITY/);
    assert.equal(await admissionsFor(manifest.executionId), 0);
    assert.equal(providerHits(), hitsBefore);
  }, 120_000);

  test('full chain: a manifest digest mismatch refuses before anything runs', async () => {
    writeChainShims();
    const manifest = syntheticManifest(10);
    const hitsBefore = providerHits();
    const { run } = await runProductionChain({
      manifest, deployRunId: `${Date.now()}-700`, firstSyncRunId: `${Date.now()}-800`,
      hostBase: 'http://127.0.0.1:9', digestOverride: '0'.repeat(64),
    });
    assert.equal(run.status, 28);
    assert.match(run.stdout, /FIRST_SYNC_HOLD=MANIFEST_DIGEST/);
    assert.equal(await admissionsFor(manifest.executionId), 0);
    assert.equal(providerHits(), hitsBefore);
  }, 120_000);

  test('full chain: the container without the real VERIFY tuple (sync window closed) refuses registration in the real prepare', async () => {
    writeChainShims();
    const manifest = syntheticManifest(10);
    const hitsBefore = providerHits();
    const { run } = await runProductionChain({
      manifest, deployRunId: `${Date.now()}-900`, firstSyncRunId: `${Date.now()}-910`,
      hostBase: 'http://127.0.0.1:9', readonlySyncEnabled: 'false',
    });
    assert.notEqual(run.status, 0);
    assert.equal(await admissionsFor(manifest.executionId), 0); // the tuple gate precedes registration
    assert.equal(providerHits(), hitsBefore); // and precedes any provider HTTP
  }, 120_000);
});
