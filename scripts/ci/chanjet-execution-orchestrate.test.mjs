// R4.2c orchestration full-chain tests: REAL Node20 child processes, real
// isolated PostgreSQL18 (admission schema + synthesized mapping/book/state
// tables) and a local loopback HTTP provider fixture. No real provider, no
// production identifiers beyond the agreed book scope, synthetic approval/
// execution/expiry values only.
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const fixtureUrl = process.env.CHANJET_ADMISSION_FIXTURE_URL;
if (process.env.CHANJET_EXECUTION_ORCHESTRATION_REQUIRED === 'true' && !fixtureUrl) {
  throw Error('REAL_EXECUTION_ORCHESTRATION_FIXTURE_URL_REQUIRED');
}
const apiDir = path.resolve(process.cwd(), 'apps/api');
const distStore = path.join(apiDir, 'dist/modules/chanjet/chanjet-execution-admission.store.js');
if (process.env.CHANJET_EXECUTION_ORCHESTRATION_REQUIRED === 'true' && !fs.existsSync(distStore)) {
  throw Error('COMPILED_ADMISSION_STORE_REQUIRED');
}
const orchestrator = path.resolve(process.cwd(), 'scripts/ops/chanjet-execution-orchestrate.mjs');
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

let dataSource;
let fixture; // main local HTTP provider fixture (sibling process)
let workDir;
let lockFile;
let stateRepo;

async function withSchema() {
  assertOwnFixtureUrl(fixtureUrl);
  const { DataSource } = require(path.join(apiDir, 'node_modules/typeorm/index.js'));
  dataSource = new DataSource({ type: 'postgres', url: fixtureUrl, logging: false });
  await dataSource.initialize();
  await dataSource.query('DROP SCHEMA public CASCADE');
  await dataSource.query('CREATE SCHEMA public');
  const migrationModule = await import(pathToFileURL(path.join(apiDir, 'dist/database/migrations/1791878400000-CreateChanjetExecutionAdmissions.js')).href);
  const migration = new migrationModule.CreateChanjetExecutionAdmissions1791878400000();
  const runner = dataSource.createQueryRunner();
  try { await migration.up(runner); } finally { await runner.release(); }
  // synthesized production-shaped tables (existing production schema, NOT a
  // new design): book/company mapping, books and the auth singleton state
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
  for (const book of BOOKS) {
    await dataSource.query('INSERT INTO chanjet_book_company_map (bookid, book_name, company_code, company_name) VALUES ($1,$2,$3,$4)', [book.bookId, `BOOK_${book.bookId}`, book.companyCode, book.companyCode]);
    await dataSource.query('INSERT INTO chanjet_account_books (book_id, book_name, company_code, company_name, enabled) VALUES ($1,$2,$3,$4,true)', [book.bookId, `BOOK_${book.bookId}`, book.companyCode, book.companyCode]);
  }
  await dataSource.query("INSERT INTO sys_chanjet_state (key, app_ticket) VALUES ('singleton', 'SYNTHETIC_TICKET')");
  stateRepo = {
    receipts: async (executionId) => dataSource.query(
      'SELECT ordinal, phase, lease_id, kind, status, result FROM chanjet_execution_requests WHERE execution_id=$1 ORDER BY ordinal', [executionId]),
    admission: async (executionId) => (await dataSource.query(
      'SELECT phase, hold_reason, request_count, deadline_at FROM chanjet_execution_admissions WHERE execution_id=$1', [executionId]))[0] || null,
  };
}

// The provider fixture runs as a SEPARATE long-lived sibling process (never
// a server owned by this test process): orchestrator children demonstrably
// exchange HTTP with a sibling-owned listener, mirroring the CI topology
// where no process-ownership restriction exists.
const FIXTURE_SCRIPT = path.resolve(process.cwd(), 'scripts/ci/chanjet-orchestration-provider-fixture.mjs');
function startProviderFixture({ destroySyncPath } = {}) {
  const hitsFile = path.join(workDir, `hits-${randomUUID().slice(0, 8)}.jsonl`);
  const child = spawn(process.execPath, [
    FIXTURE_SCRIPT, '--hits-file', hitsFile,
    ...(destroySyncPath ? ['--destroy-path-prefix', destroySyncPath] : []),
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('FIXTURE_START_TIMEOUT')), 10_000);
    child.stdout.on('data', function onData(d) {
      const port = String(d).match(/PORT (\d+)/)?.[1];
      if (!port) return;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      resolve({
        base: `http://127.0.0.1:${port}`,
        hits: () => fs.readFileSync(hitsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).url),
        close: () => { child.kill(); return new Promise((done) => { child.on('exit', () => done()); }); },
      });
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(Error(`FIXTURE_EXITED:${code}`)); });
  });
}

function syntheticManifest() {
  const id = randomUUID().replace(/-/g, '');
  return {
    version: 1,
    executionId: `EXEC_${id.slice(0, 24)}`,
    ownerId: 'ROOT_OPERATOR',
    requestCap: 10,
    totalTimeoutMs: 360_000,
    httpTimeoutMs: 30_000,
    approval: {
      version: 3,
      approvalId: `APPROVAL_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
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

function writeJson(name, value) {
  const file = path.join(workDir, `${name}-${randomUUID().slice(0, 8)}.json`);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

function floorStateFor(manifest) {
  return {
    version: 1,
    floorSha: FLOOR_SHA,
    deployedSha: FLOOR_SHA,
    chanjetPolicy: 'READONLY_VERIFY',
    readonlyApproval: { approvalId: manifest.approval.approvalId, books: manifest.approval.books, verification: manifest.approval.verification },
    operationalTuple: { CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' },
  };
}

function runOrchestrator({ manifestFile, floorStateFile, floorSha = FLOOR_SHA, phase = 'all', register = false, skipRegistration = false, withFd9 = false, providerBase } = {}) {
  const quoted = (value) => `'${value}'`;
  const inner = [
    quoted(process.execPath), quoted(orchestrator),
    '--manifest', quoted(manifestFile),
    '--expected-floor-sha', quoted(floorSha),
    '--floor-state', quoted(floorStateFile),
    '--pg-url', quoted(fixtureUrl),
    '--provider-base', quoted(providerBase || fixture.base),
    '--phase', quoted(phase),
    ...(register ? ['--register', '--fd9-lock', quoted(lockFile)] : []),
    ...(skipRegistration ? ['--skip-registration'] : []),
  ].join(' ');
  const command = withFd9 ? `exec 9>>'${lockFile}'; ${inner}` : inner;
  return spawnSync('bash', ['-c', command], {
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
}

function parseResult(stdout) {
  const line = String(stdout).split('\n').find((l) => l.startsWith('CHANJET_EXECUTION_ORCHESTRATE='));
  assert.ok(line, `no orchestrator verdict line in stdout:\n${stdout}`);
  const [verdict, json] = line.split(';');
  return { verdict: verdict.split('=')[1], summary: json ? JSON.parse(json) : {} };
}

database('execution orchestration full chain (real CLI child, real PostgreSQL18, local HTTP fixture)', () => {
  before(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrate-'));
    lockFile = path.join(workDir, 'mutation.lock');
    fs.writeFileSync(lockFile, '');
    await withSchema();
    fixture = await startProviderFixture();
  });
  after(async () => {
    if (fixture) await fixture.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  test('refuses without the FD9 mutation lock: no registration row, zero provider HTTP', async () => {
    const manifest = syntheticManifest();
    const before = fixture.hits().length;
    const result = runOrchestrator({
      manifestFile: writeJson('manifest', manifest),
      floorStateFile: writeJson('floor', floorStateFor(manifest)),
      register: true, withFd9: false,
    });
    assert.equal(result.status, 3, result.stdout + result.stderr);
    const { verdict, summary } = parseResult(result.stdout);
    assert.equal(verdict, 'REFUSED_FD9_NOT_HELD');
    assert.equal(summary.executionId, manifest.executionId);
    assert.equal(await stateRepo.admission(manifest.executionId), null);
    assert.equal(fixture.hits().length - before, 0);
  });

  test('refuses a floor mismatch before any registration or HTTP', async () => {
    const manifest = syntheticManifest();
    const before = fixture.hits().length;
    const result = runOrchestrator({
      manifestFile: writeJson('manifest', manifest),
      floorStateFile: writeJson('floor', floorStateFor(manifest)),
      floorSha: 'a'.repeat(40),
      register: true, withFd9: true,
    });
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.equal(parseResult(result.stdout).verdict, 'REFUSED_FLOOR_SHA_MISMATCH');
    assert.equal(await stateRepo.admission(manifest.executionId), null);
    assert.equal(fixture.hits().length - before, 0);
  });

  test('refuses when the enabled mapping pairs do not cover the approved books', async () => {
    const manifest = syntheticManifest();
    const before = fixture.hits().length;
    await dataSource.query('DELETE FROM chanjet_book_company_map');
    try {
      const result = runOrchestrator({
        manifestFile: writeJson('manifest', manifest),
        floorStateFile: writeJson('floor', floorStateFor(manifest)),
        register: true, withFd9: true,
      });
      assert.equal(result.status, 3, result.stdout + result.stderr);
      assert.equal(parseResult(result.stdout).verdict, 'REFUSED_MAPPING_SCOPE');
      assert.equal(await stateRepo.admission(manifest.executionId), null);
      assert.equal(fixture.hits().length - before, 0);
    } finally {
      for (const book of BOOKS) {
        await dataSource.query('INSERT INTO chanjet_book_company_map (bookid, book_name, company_code, company_name) VALUES ($1,$2,$3,$4)', [book.bookId, `BOOK_${book.bookId}`, book.companyCode, book.companyCode]);
      }
    }
  });

  test('full chain: registration, probe and first sync share one execution, per-phase leases, VERIFIED', async () => {
    const manifest = syntheticManifest();
    const before = fixture.hits().length;
    const result = runOrchestrator({
      manifestFile: writeJson('manifest', manifest),
      floorStateFile: writeJson('floor', floorStateFor(manifest)),
      register: true, withFd9: true, phase: 'all',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const { verdict, summary } = parseResult(result.stdout);
    assert.equal(verdict, 'PASS');
    assert.equal(summary.verified, true);
    assert.equal(summary.phase, 'VERIFIED');
    assert.equal(summary.executionId, manifest.executionId);
    assert.ok(summary.leases.probe.startsWith('PROBE_'));
    assert.ok(summary.leases.sync.startsWith('SYNC_'));
    assert.notEqual(summary.leases.probe, summary.leases.sync);
    // probe + first sync shared the SAME execution: one cumulative cap and
    // one DB-owned deadline (both phase leases advanced the same row)
    assert.equal(summary.requestCount, 4); // 2 TOKEN + 2 BUSINESS, cap 10
    const row = await stateRepo.admission(manifest.executionId);
    assert.equal(row.phase, 'VERIFIED');
    // per-phase OK evidence: PROBING and SYNCING BUSINESS receipts, all OK
    const receipts = await stateRepo.receipts(manifest.executionId);
    assert.ok(receipts.some((r) => r.phase === 'PROBING' && r.kind === 'BUSINESS' && r.result === 'OK'));
    assert.ok(receipts.some((r) => r.phase === 'SYNCING' && r.kind === 'BUSINESS' && r.result === 'OK'));
    assert.ok(receipts.every((r) => r.status === 'ACKNOWLEDGED' && r.result === 'OK'));
    // provider traffic: exactly token + probe + sync exchanges on the fixture
    assert.equal(fixture.hits().length - before, 4);
  });

  test('unregistered manifest refuses with zero provider HTTP', async () => {
    const manifest = syntheticManifest();
    const before = fixture.hits().length;
    const result = runOrchestrator({
      manifestFile: writeJson('manifest', manifest),
      floorStateFile: writeJson('floor', floorStateFor(manifest)),
      skipRegistration: true,
    });
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.equal(parseResult(result.stdout).verdict, 'REFUSED_UNREGISTERED');
    assert.equal(fixture.hits().length - before, 0);
  });

  test('sync transport failure is HOLD: settled state reported, never success, no VERIFIED', async () => {
    const manifest = syntheticManifest();
    const floorFile = writeJson('floor', floorStateFor(manifest));
    const manifestFile = writeJson('manifest', manifest);
    // stage 1: register + probe only (human review point between phases)
    const probeRun = runOrchestrator({ manifestFile, floorStateFile: floorFile, register: true, withFd9: true, phase: 'probe' });
    assert.equal(probeRun.status, 0, probeRun.stdout + probeRun.stderr);
    assert.equal(parseResult(probeRun.stdout).summary.phase, 'PROBED');
    // stage 2: the provider exchange dies mid-sync — a dedicated fixture
    // destroys the socket for the sync path only; the orchestrator must
    // surface HOLD with the real settled() state and stop
    const killFixture = await startProviderFixture({ destroySyncPath: `/accounting/gl/statistics/receive/${VERIFY_BOOK}` });
    try {
      const syncRun = runOrchestrator({ manifestFile, floorStateFile: floorFile, skipRegistration: true, phase: 'sync', providerBase: killFixture.base });
      assert.equal(syncRun.status, 4, syncRun.stdout + syncRun.stderr);
      const { verdict, summary } = parseResult(syncRun.stdout);
      assert.equal(verdict, 'HOLD');
      assert.equal(summary.reason, 'CHANJET_TRANSPORT_FAILURE');
      assert.ok(['CONFIRMED', 'UNCONFIRMED', 'NOT_STARTED'].includes(summary.settled));
      assert.equal(summary.phase, 'HOLD');
      assert.equal(summary.holdReason, 'TRANSPORT_FAILURE');
      assert.ok(!syncRun.stdout.includes('CHANJET_EXECUTION_ORCHESTRATE=PASS'));
    } finally {
      await killFixture.close();
    }
    const row = await stateRepo.admission(manifest.executionId);
    assert.equal(row.phase, 'HOLD');
    assert.equal(row.hold_reason, 'TRANSPORT_FAILURE');
    // the probe-phase OK evidence is preserved history: untouched by the stop
    const receipts = await stateRepo.receipts(manifest.executionId);
    assert.ok(receipts.some((r) => r.phase === 'PROBING' && r.kind === 'BUSINESS' && r.result === 'OK'));
    // the dead sync exchange is recorded evidence (acknowledged with its
    // transport-failure result): never refunded, deleted or re-sent
    assert.ok(receipts.some((r) => r.phase === 'SYNCING' && r.status === 'ACKNOWLEDGED' && r.result === 'TRANSPORT_FAILURE'));
  });
});
