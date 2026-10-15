// R4.2c orchestration full-chain tests: REAL Node20 child processes, real
// isolated PostgreSQL18 (admission schema + synthesized mapping/book/state/
// sync-job tables) and local loopback HTTP fixtures as SIBLING processes (the
// provider fixture and the protected-alignment mock). No real provider, no
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
  // new design): book/company mapping, books, the auth singleton state and
  // the durable sync-job table the alignment flow records its run in
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
    id serial PRIMARY KEY, orchestration_run_id varchar(64), status varchar(16),
    request_scope jsonb, result_summary jsonb, created_at timestamptz DEFAULT now())`);
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

// The provider fixture and the alignment mock run as SEPARATE long-lived
// sibling processes (never owned by this test process): orchestrator
// children demonstrably exchange HTTP with sibling-owned listeners.
const FIXTURE_SCRIPT = path.resolve(process.cwd(), 'scripts/ci/chanjet-orchestration-provider-fixture.mjs');
const ALIGNMENT_MOCK = path.resolve(process.cwd(), 'scripts/ci/chanjet-orchestration-alignment-mock.mjs');
function startSibling(command, args) {
  const child = spawn(process.execPath, [command, ...args], { stdio: ['ignore', 'pipe', 'ignore'] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`SIBLING_START_TIMEOUT:${command}`)), 10_000);
    child.stdout.on('data', function onData(d) {
      const port = String(d).match(/PORT (\d+)/)?.[1];
      if (!port) return;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      resolve({ child, port });
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(Error(`SIBLING_EXITED:${command}:${code}`)); });
  });
}
async function startProviderFixture({ destroySyncPath } = {}) {
  const hitsFile = path.join(workDir, `hits-${randomUUID().slice(0, 8)}.jsonl`);
  const { child, port } = await startSibling(FIXTURE_SCRIPT, [
    '--hits-file', hitsFile,
    ...(destroySyncPath ? ['--destroy-path-prefix', destroySyncPath] : []),
  ]);
  return {
    base: `http://127.0.0.1:${port}`,
    hits: () => fs.readFileSync(hitsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).url),
    close: () => { child.kill(); return new Promise((done) => { child.on('exit', () => done()); }); },
  };
}
async function startAlignmentMock({ decisionHold = false, scopeMismatch = false, approvalId, omitInbound = false, leaseMismatch = false, sendsMismatch = false, floorSha = FLOOR_SHA, deadlineAt } = {}) {
  const hitsFile = path.join(workDir, `alignment-${randomUUID().slice(0, 8)}.jsonl`);
  const { child, port } = await startSibling(ALIGNMENT_MOCK, [
    '--pg-url', fixtureUrl, '--hits-file', hitsFile,
    '--approval-id', approvalId || 'APPROVAL_UNSET', '--auth-token', 'SYNTHETIC_OP_TOKEN',
    '--floor-sha', floorSha,
    ...(deadlineAt ? ['--deadline-at', deadlineAt] : []),
    ...(decisionHold ? ['--decision-hold'] : []),
    ...(scopeMismatch ? ['--scope-mismatch'] : []),
    ...(omitInbound ? ['--omit-inbound'] : []),
    ...(leaseMismatch ? ['--lease-mismatch'] : []),
    ...(sendsMismatch ? ['--sends-mismatch'] : []),
  ]);
  return {
    base: `http://127.0.0.1:${port}`,
    hits: () => fs.readFileSync(hitsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).url),
    close: () => { child.kill(); return new Promise((done) => { child.on('exit', () => done()); }); },
  };
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

// fd9 modes: none (no fd 9 at all) · open (fd 9 opened, NOT locked) ·
// flock (fd 9 opened AND flock held — the truthful positive)
function runOrchestrator({ manifestFile, floorStateFile, floorSha = FLOOR_SHA, phase = 'all', register = false, skipRegistration = false, fd9 = 'none', providerBase, alignmentBase, extraArgs = [] } = {}) {
  const quoted = (value) => `'${value}'`;
  const needsAlignment = phase !== 'probe';
  const inner = [
    quoted(process.execPath), quoted(orchestrator),
    '--manifest', quoted(manifestFile),
    '--expected-floor-sha', quoted(floorSha),
    '--floor-state', quoted(floorStateFile),
    '--pg-url', quoted(fixtureUrl),
    '--provider-base', quoted(providerBase || fixture.base),
    '--phase', quoted(phase),
    ...(needsAlignment ? ['--alignment-base', quoted(alignmentBase || 'http://127.0.0.1:1'), '--alignment-token-env', 'CHANJET_ORCH_TOKEN'] : []),
    ...(register ? ['--register', '--fd9-lock', quoted(lockFile)] : []),
    ...(skipRegistration ? ['--skip-registration'] : []),
    ...extraArgs,
  ].join(' ');
  const fd9Prefix = { none: '', open: `exec 9>>'${lockFile}'; `, flock: `exec 9>>'${lockFile}'; flock -n 9; ` }[fd9] ?? '';
  const command = `${fd9Prefix}${inner}`;
  return spawnSync('bash', ['-c', command], {
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      CHANJET_ORCH_TOKEN: 'SYNTHETIC_OP_TOKEN',
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

  test('refuses CLI overrides of the approved request shape before registration and HTTP', async () => {
    for (const [label, override] of [
      ['period injection', ['--period', '202609']],
      ['book substitution', ['--probe-path', '/accounting/gl/statistics/receive/3537748712226818']],
      ['payment endpoint substitution', ['--sync-path', `/accounting/gl/statistics/pay/${VERIFY_BOOK}`]],
    ]) {
      const manifest = syntheticManifest();
      const before = fixture.hits().length;
      const result = runOrchestrator({
        manifestFile: writeJson('manifest', manifest),
        floorStateFile: writeJson('floor', floorStateFor(manifest)),
        phase: 'probe',
        extraArgs: override,
      });
      assert.equal(result.status, 2, `${label}: ${result.stdout} ${result.stderr}`);
      assert.equal(parseResult(result.stdout).verdict, 'REFUSED_OVERRIDE_NOT_ALLOWED', label);
      assert.equal(await stateRepo.admission(manifest.executionId), null, label);
      assert.equal(fixture.hits().length - before, 0, label);
    }
  });

  test('refuses a floor mismatch before any registration or HTTP', async () => {
    const manifest = syntheticManifest();
    const before = fixture.hits().length;
    const result = runOrchestrator({
      manifestFile: writeJson('manifest', manifest),
      floorStateFile: writeJson('floor', floorStateFor(manifest)),
      floorSha: 'a'.repeat(40),
      register: true, fd9: 'flock',
    });
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.equal(parseResult(result.stdout).verdict, 'REFUSED_FLOOR_SHA_MISMATCH');
    assert.equal(await stateRepo.admission(manifest.executionId), null);
    assert.equal(fixture.hits().length - before, 0);
  });

  test('refuses same-length-but-different books and an approvalId mismatch in the floor state', async () => {
    for (const [label, mutate] of [
      ['same-length different companyCode', (floor) => { floor.readonlyApproval.books = floor.readonlyApproval.books.map((b, i) => (i === 0 ? { bookId: b.bookId, companyCode: 'COMP-LAO-OTHER' } : b)); }],
      ['same-length different bookId', (floor) => { floor.readonlyApproval.books = floor.readonlyApproval.books.map((b, i) => (i === 1 ? { bookId: '3539999999999999', companyCode: b.companyCode } : b)); }],
      ['approvalId mismatch', (floor) => { floor.readonlyApproval.approvalId = 'APPROVAL_OTHER'; }],
    ]) {
      const manifest = syntheticManifest();
      const floor = floorStateFor(manifest);
      mutate(floor);
      const before = fixture.hits().length;
      const result = runOrchestrator({
        manifestFile: writeJson('manifest', manifest),
        floorStateFile: writeJson('floor', floor),
        register: true, fd9: 'flock',
      });
      assert.equal(result.status, 3, `${label}: ${result.stdout} ${result.stderr}`);
      assert.equal(parseResult(result.stdout).verdict, 'REFUSED_APPROVAL_SCOPE_CHANGED', label);
      assert.equal(await stateRepo.admission(manifest.executionId), null, label);
      assert.equal(fixture.hits().length - before, 0, label);
    }
  });

  test('FD9: opened-only and foreign-held locks are refused (the positive path is covered by the full chain)', async () => {
    const manifestA = syntheticManifest();
    const opened = runOrchestrator({
      manifestFile: writeJson('manifest', manifestA),
      floorStateFile: writeJson('floor', floorStateFor(manifestA)),
      register: true, fd9: 'open',
    });
    assert.equal(opened.status, 3, opened.stdout + opened.stderr);
    const openedParsed = parseResult(opened.stdout);
    assert.equal(openedParsed.verdict, 'REFUSED_FD9_NOT_HELD');
    assert.equal(openedParsed.summary.detail, 'NOT_LOCKED');
    assert.equal(await stateRepo.admission(manifestA.executionId), null);

    const manifestB = syntheticManifest();
    const holder = spawn('bash', ['-c', `exec 9>>'${lockFile}'; flock -n 9; sleep 8`], { stdio: ['ignore', 'ignore', 'ignore'] });
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      const foreign = runOrchestrator({
        manifestFile: writeJson('manifest', manifestB),
        floorStateFile: writeJson('floor', floorStateFor(manifestB)),
        register: true, fd9: 'open',
      });
      assert.equal(foreign.status, 3, foreign.stdout + foreign.stderr);
      assert.equal(parseResult(foreign.stdout).verdict, 'REFUSED_FD9_LOCKED_ELSEWHERE');
      assert.equal(await stateRepo.admission(manifestB.executionId), null);
    } finally { holder.kill(); }
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  test('refuses when the enabled mapping pairs do not cover the approved books', async () => {
    const manifest = syntheticManifest();
    const before = fixture.hits().length;
    await dataSource.query('DELETE FROM chanjet_book_company_map');
    try {
      const result = runOrchestrator({
        manifestFile: writeJson('manifest', manifest),
        floorStateFile: writeJson('floor', floorStateFor(manifest)),
        register: true, fd9: 'flock',
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

  test('full chain: registration, probe, first sync through the alignment flow, VERIFIED', async () => {
    const manifest = syntheticManifest();
    const floorFile = writeJson('floor', floorStateFor(manifest));
    const manifestFile = writeJson('manifest', manifest);
    // stage 1: register + probe (the rehearsal-less phase); the DB now owns
    // the absolute deadline the mock must mirror in its persisted binding
    const probeRun = runOrchestrator({ manifestFile, floorStateFile: floorFile, register: true, fd9: 'flock', phase: 'probe' });
    assert.equal(probeRun.status, 0, probeRun.stdout + probeRun.stderr);
    const probeSummary = parseResult(probeRun.stdout).summary;
    const admissionRow = await stateRepo.admission(manifest.executionId);
    const deadlineIso = new Date(admissionRow.deadline_at).toISOString();
    const alignment = await startAlignmentMock({
      approvalId: manifest.approval.approvalId,
      floorSha: FLOOR_SHA,
      deadlineAt: deadlineIso,
    });
    const before = fixture.hits().length;
    try {
      // stage 2: the SYNCING rehearsal + the alignment first-sync; the
      // enqueue NAMES the execution, the scheduler reads the binding back
      // from the admission row and the worker's HTTP shares this execution
      const syncRun = runOrchestrator({
        manifestFile, floorStateFile: floorFile, skipRegistration: true, phase: 'sync',
        alignmentBase: alignment.base,
      });
      assert.equal(syncRun.status, 0, syncRun.stdout + syncRun.stderr);
      const { verdict, summary } = parseResult(syncRun.stdout);
      assert.equal(verdict, 'PASS');
      assert.equal(summary.verified, true);
      assert.equal(summary.phase, 'VERIFIED');
      assert.equal(summary.executionId, manifest.executionId);
      assert.ok(probeSummary.leases.probe.startsWith('PROBE_'));
      assert.ok(summary.leases.sync.startsWith('SYNC_'));
      // VERIFIED required the REAL first sync: the alignment run id plus the
      // database sync-job proof are part of the PASS evidence
      assert.ok(String(summary.firstSync.orchestrationRunId).startsWith('SYNTHETIC_RUN_'));
      assert.equal(summary.firstSync.proof, 'FIRST_CONTROLLED_SYNC_PROOF');
      assert.deepEqual(summary.derivedRequest, { endpoint: `/accounting/gl/statistics/receive/${VERIFY_BOOK}`, period: PERIOD });
      // the FD9 lock was verified by the registering (probe) entry
      assert.equal(probeSummary.provenance.fd9, 'HELD_BY_ENTRY');
      // probe + first sync shared the SAME execution: one cumulative cap and
      // one DB-owned deadline (both phase leases advanced the same row)
      assert.equal(summary.requestCount, 4); // 2 TOKEN + 2 BUSINESS, cap 10
      const row = await stateRepo.admission(manifest.executionId);
      assert.equal(row.phase, 'VERIFIED');
      const receipts = await stateRepo.receipts(manifest.executionId);
      assert.ok(receipts.some((r) => r.phase === 'PROBING' && r.kind === 'BUSINESS' && r.result === 'OK'));
      assert.ok(receipts.some((r) => r.phase === 'SYNCING' && r.kind === 'BUSINESS' && r.result === 'OK'));
      assert.ok(receipts.every((r) => r.status === 'ACKNOWLEDGED' && r.result === 'OK'));
      assert.equal(fixture.hits().length - before, 2);
      // the alignment flow was actually exercised through the protected API
      assert.equal(alignment.hits().filter((u) => u.endsWith('/enqueue')).length, 1);
    } finally { await alignment.close(); }
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

  test('a real admission-row lock delays the receipt INSERT: refusal within the deadline, zero HTTP, no overdue reservation', async () => {
    const manifest = syntheticManifest();
    const floorFile = writeJson('floor', floorStateFor(manifest));
    const manifestFile = writeJson('manifest', manifest);
    // stage 1: register + probe only -> row PROBED with its OK evidence
    const probeRun = runOrchestrator({ manifestFile, floorStateFile: floorFile, register: true, fd9: 'flock', phase: 'probe' });
    assert.equal(probeRun.status, 0, probeRun.stdout + probeRun.stderr);
    const receiptsBefore = (await stateRepo.receipts(manifest.executionId)).length;
    // stage 2: hold the admission row FOR UPDATE from a separate process —
    // the reserve (row lock + receipt INSERT) blocks on it
    const releaseFile = path.join(workDir, `release-${randomUUID().slice(0, 8)}`);
    const holder = spawn(process.execPath, [
      '-e',
      "const {Client}=require(process.argv[1]);const c=new Client({connectionString:process.argv[2]});c.connect().then(async()=>{await c.query('BEGIN');await c.query('SELECT * FROM chanjet_execution_admissions WHERE execution_id=$1 FOR UPDATE',[process.argv[3]]);console.log('LOCKED');const fs=require('fs');while(!fs.existsSync(process.argv[4]))await new Promise(r=>setTimeout(r,50));await c.query('ROLLBACK');process.exit(0)}).catch(e=>{console.error(String(e).slice(0,200));process.exit(1)})",
      path.join(apiDir, 'node_modules/pg'),
      fixtureUrl,
      manifest.executionId,
      releaseFile,
    ], { stdio: ['ignore', 'pipe', 'inherit'] });
    const locked = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('LOCK_HOLDER_TIMEOUT')), 10_000);
      holder.stdout.on('data', (d) => { if (String(d).includes('LOCKED')) { clearTimeout(timer); resolve(); } });
    });
    try {
      await locked;
      const before = fixture.hits().length;
      const started = Date.now();
      const result = runOrchestrator({ manifestFile, floorStateFile: floorFile, skipRegistration: true, phase: 'sync' });
      const elapsed = Date.now() - started;
      // refused WELL WITHIN the original 360s deadline by the bounded
      // per-statement lock bound, never by waiting it out; the contended
      // identity load is its own refusal and never misread as unregistered
      assert.equal(result.status, 3, result.stdout + result.stderr);
      assert.ok(elapsed < 15_000, `refusal took ${elapsed}ms`);
      const { verdict, summary } = parseResult(result.stdout);
      assert.equal(verdict, 'REFUSED_ADMISSION_ROW_CONTENDED');
      assert.equal(summary.executionId, manifest.executionId);
      // zero provider HTTP: no reservation committed, nothing was sent, and
      // no alignment first-sync was attempted under contention
      assert.equal(fixture.hits().length - before, 0);
      // no overdue reservation: the receipt count is exactly the probe-phase
      // evidence
      assert.equal((await stateRepo.receipts(manifest.executionId)).length, receiptsBefore);
    } finally {
      fs.writeFileSync(releaseFile, 'release');
      holder.kill();
      await new Promise((resolve) => holder.on('exit', () => resolve()));
    }
    const row = await stateRepo.admission(manifest.executionId);
    // after release the row is the untouched PROBED state: nothing ambiguous
    // happened, so no HOLD was needed — the HOLD finalization under bounds is
    // exercised by the transport-failure case below and the transport suite
    assert.equal(row.phase, 'PROBED');
    // still no reservation after release: the abort was durable, not delayed
    assert.equal((await stateRepo.receipts(manifest.executionId)).length, receiptsBefore);
  });

  test('sync transport failure is HOLD: settled state reported, never success, no VERIFIED', async () => {
    const manifest = syntheticManifest();
    const floorFile = writeJson('floor', floorStateFor(manifest));
    const manifestFile = writeJson('manifest', manifest);
    const probeRun = runOrchestrator({ manifestFile, floorStateFile: floorFile, register: true, fd9: 'flock', phase: 'probe' });
    assert.equal(probeRun.status, 0, probeRun.stdout + probeRun.stderr);
    assert.equal(parseResult(probeRun.stdout).summary.phase, 'PROBED');
    const deadlineIso = new Date((await stateRepo.admission(manifest.executionId)).deadline_at).toISOString();
    const alignment = await startAlignmentMock({ approvalId: manifest.approval.approvalId, floorSha: FLOOR_SHA, deadlineAt: deadlineIso });
    const killFixture = await startProviderFixture({ destroySyncPath: `/accounting/gl/statistics/receive/${VERIFY_BOOK}` });
    try {
      const syncRun = runOrchestrator({
        manifestFile, floorStateFile: floorFile, skipRegistration: true, phase: 'sync',
        providerBase: killFixture.base, alignmentBase: alignment.base,
      });
      assert.equal(syncRun.status, 4, syncRun.stdout + syncRun.stderr);
      const { verdict, summary } = parseResult(syncRun.stdout);
      assert.equal(verdict, 'HOLD');
      assert.equal(summary.reason, 'CHANJET_TRANSPORT_FAILURE');
      assert.ok(['CONFIRMED', 'UNCONFIRMED', 'NOT_STARTED'].includes(summary.settled));
      assert.equal(summary.phase, 'HOLD');
      assert.equal(summary.holdReason, 'TRANSPORT_FAILURE');
      assert.ok(!syncRun.stdout.includes('CHANJET_EXECUTION_ORCHESTRATE=PASS'));
      // the transport failure happened BEFORE any alignment enqueue: no
      // first-sync was even attempted
      assert.equal(alignment.hits().length, 0);
    } finally {
      await killFixture.close();
      await alignment.close();
    }
    const row = await stateRepo.admission(manifest.executionId);
    assert.equal(row.phase, 'HOLD');
    assert.equal(row.hold_reason, 'TRANSPORT_FAILURE');
    const receipts = await stateRepo.receipts(manifest.executionId);
    assert.ok(receipts.some((r) => r.phase === 'PROBING' && r.kind === 'BUSINESS' && r.result === 'OK'));
    assert.ok(receipts.some((r) => r.phase === 'SYNCING' && r.status === 'ACKNOWLEDGED' && r.result === 'TRANSPORT_FAILURE'));
  });

  test('alignment HOLD decision blocks VERIFIED and durably stops the execution', async () => {
    const manifest = syntheticManifest();
    const floorFile = writeJson('floor', floorStateFor(manifest));
    const manifestFile = writeJson('manifest', manifest);
    const probeRun = runOrchestrator({ manifestFile, floorStateFile: floorFile, register: true, fd9: 'flock', phase: 'probe' });
    assert.equal(probeRun.status, 0, probeRun.stdout + probeRun.stderr);
    const deadlineIso = new Date((await stateRepo.admission(manifest.executionId)).deadline_at).toISOString();
    const alignment = await startAlignmentMock({ approvalId: manifest.approval.approvalId, decisionHold: true, floorSha: FLOOR_SHA, deadlineAt: deadlineIso });
    try {
      const result = runOrchestrator({
        manifestFile, floorStateFile: floorFile, skipRegistration: true, phase: 'sync',
        alignmentBase: alignment.base,
      });
      assert.equal(result.status, 4, result.stdout + result.stderr);
      const { verdict, summary } = parseResult(result.stdout);
      assert.equal(verdict, 'HOLD');
      assert.equal(summary.reason, 'CHANJET_ALIGNMENT_FAILURE_OR_TIMEOUT');
      assert.ok(!result.stdout.includes('CHANJET_EXECUTION_ORCHESTRATE=PASS'));
    } finally { await alignment.close(); }
    // the failed first sync durably stops the execution: no later send and no
    // late sync success can build on it
    const row = await stateRepo.admission(manifest.executionId);
    assert.equal(row.phase, 'HOLD');
    assert.equal(row.hold_reason, 'CANCELLED');
  });

  test('sync-job proof bound to another approval blocks VERIFIED and stops the execution', async () => {
    const manifest = syntheticManifest();
    const floorFile = writeJson('floor', floorStateFor(manifest));
    const manifestFile = writeJson('manifest', manifest);
    const probeRun = runOrchestrator({ manifestFile, floorStateFile: floorFile, register: true, fd9: 'flock', phase: 'probe' });
    assert.equal(probeRun.status, 0, probeRun.stdout + probeRun.stderr);
    const deadlineIso = new Date((await stateRepo.admission(manifest.executionId)).deadline_at).toISOString();
    const alignment = await startAlignmentMock({ approvalId: manifest.approval.approvalId, scopeMismatch: true, floorSha: FLOOR_SHA, deadlineAt: deadlineIso });
    try {
      const result = runOrchestrator({
        manifestFile, floorStateFile: floorFile, skipRegistration: true, phase: 'sync',
        alignmentBase: alignment.base,
      });
      assert.equal(result.status, 4, result.stdout + result.stderr);
      const { verdict, summary } = parseResult(result.stdout);
      assert.equal(verdict, 'HOLD');
      assert.equal(summary.reason, 'CHANJET_ALIGNMENT_FIRST_SYNC_PROOF');
    } finally { await alignment.close(); }
    const row = await stateRepo.admission(manifest.executionId);
    assert.equal(row.phase, 'HOLD');
    assert.equal(row.hold_reason, 'CANCELLED');
  });

  test('proof strictness: missing erpInbound, mismatched lease and wrong send count each block VERIFIED', async () => {
    for (const [label, flag] of [
      ['missing erpInbound', '--omit-inbound'],
      ['mismatched lease binding', '--lease-mismatch'],
      ['wrong worker send count', '--sends-mismatch'],
    ]) {
      const manifest = syntheticManifest();
      const floorFile = writeJson('floor', floorStateFor(manifest));
      const manifestFile = writeJson('manifest', manifest);
      const probeRun = runOrchestrator({ manifestFile, floorStateFile: floorFile, register: true, fd9: 'flock', phase: 'probe' });
      assert.equal(probeRun.status, 0, probeRun.stdout + probeRun.stderr);
      const deadlineIso = new Date((await stateRepo.admission(manifest.executionId)).deadline_at).toISOString();
      const alignment = await startAlignmentMock({
        approvalId: manifest.approval.approvalId, floorSha: FLOOR_SHA, deadlineAt: deadlineIso,
        omitInbound: flag === '--omit-inbound', leaseMismatch: flag === '--lease-mismatch', sendsMismatch: flag === '--sends-mismatch',
      });
      try {
        const result = runOrchestrator({
          manifestFile, floorStateFile: floorFile, skipRegistration: true, phase: 'sync',
          alignmentBase: alignment.base,
        });
        assert.equal(result.status, 4, `${label}: ${result.stdout} ${result.stderr}`);
        const parsed = parseResult(result.stdout);
        assert.equal(parsed.verdict, 'HOLD', label);
        assert.equal(parsed.summary.reason, 'CHANJET_ALIGNMENT_FIRST_SYNC_PROOF', label);
        assert.equal((await stateRepo.admission(manifest.executionId)).phase, 'HOLD', label);
      } finally { await alignment.close(); }
    }
  });
});
