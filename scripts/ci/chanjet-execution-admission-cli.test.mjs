import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fixtureUrl = process.env.CHANJET_ADMISSION_FIXTURE_URL;
if (process.env.CHANJET_EXECUTION_CLI_REQUIRED === 'true' && !fixtureUrl) {
  throw Error('REAL_EXECUTION_CLI_FIXTURE_URL_REQUIRED');
}
const distStore = path.resolve(process.cwd(), 'apps/api/dist/modules/chanjet/chanjet-execution-admission.store.js');
if (process.env.CHANJET_EXECUTION_CLI_REQUIRED === 'true' && !fs.existsSync(distStore)) {
  throw Error('COMPILED_ADMISSION_STORE_REQUIRED');
}
const cli = path.resolve(process.cwd(), 'scripts/ops/chanjet-execution-admission-register.mjs');
import { pathToFileURL } from 'node:url';
const database = fixtureUrl ? describe : describe.skip;

// Parent-side guard: evaluated BEFORE this test process opens any connection
// or runs any DDL. The child CLI has its own guard; neither substitutes for
// the other.
function assertOwnFixtureUrl(u) {
  const parsed = new URL(u);
  const disposable = /^(chanjet_admission_fixture|chanjet_transport_fixture.*|root_admission_review)$/.test(parsed.pathname.slice(1));
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) || !disposable) {
    throw Error(`PARENT_FIXTURE_URL_REQUIRED (loopback + dedicated disposable db): ${u}`);
  }
  return parsed;
}
assert.equal(typeof fixtureUrl, 'string');
assertOwnFixtureUrl(fixtureUrl);

async function withSchema(callback) {
  assertOwnFixtureUrl(fixtureUrl);
  const { DataSource } = require(path.resolve(process.cwd(), 'apps/api/node_modules/typeorm/index.js'));
  const ds = new DataSource({ type: 'postgres', url: fixtureUrl, logging: false });
  await ds.initialize();
  try {
    await ds.query('DROP SCHEMA public CASCADE');
    await ds.query('CREATE SCHEMA public');
    const migrationModule = await import(pathToFileURL(path.resolve(process.cwd(), 'apps/api/dist/database/migrations/1791878400000-CreateChanjetExecutionAdmissions.js')).href);
    const migration = new migrationModule.CreateChanjetExecutionAdmissions1791878400000();
    const runner = ds.createQueryRunner();
    try { await migration.up(runner); } finally { await runner.release(); }
    await callback();
  } finally { await ds.destroy(); }
}

const manifestFile = () => {
  const expiresAt = `${new Date(Date.now() + 20 * 60_000).toISOString().slice(0, 23)}Z`;
  const executionId = `EXEC_${randomId()}`;
  const manifest = {
    version: 1, executionId, ownerId: 'ROOT_OPERATOR',
    requestCap: 10, totalTimeoutMs: 360_000, httpTimeoutMs: 30_000,
    approval: {
      version: 3, approvalId: `APPROVAL_${randomId()}`, floorSha: 'e'.repeat(40),
      sourceClassification: 'PRODUCTION_DATA', remoteWrite: false, erpInbound: false,
      books: [
        { bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI' },
        { bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI' },
        { bookId: '3539743721526654', companyCode: 'COMP-LAO-FOOD' },
      ],
      scopes: ['RECEIVABLE_STATISTICS'],
      periodPolicy: 'REQUESTED_PERIOD_NO_BACKFILL',
      verification: { bookId: '3533914511118750', period: '202610', scope: ['RECEIVABLE_STATISTICS'], expiresAt },
    },
  };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-manifest-')), 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return { file, manifest };
};
function randomId() { return randomUUID().replace(/-/g, '').slice(0, 24); }
function randomUUID() { return require('node:crypto').randomUUID(); }

const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

database('registration CLI runs as a real subprocess against real PostgreSQL', () => {
  const pg = require(path.resolve(process.cwd(), 'apps/api/node_modules/pg'));
  const row = async (executionId) => {
    const client = new pg.Client({ connectionString: fixtureUrl });
    await client.connect();
    try {
      const result = await client.query('SELECT execution_id, approval_id, floor_sha, phase, request_count FROM chanjet_execution_admissions WHERE execution_id=$1', [executionId]);
      return result.rows[0] ?? null;
    } finally { await client.end(); }
  };

  test('dry run prints the sanitized plan and writes nothing', () => {
    const { file, manifest } = manifestFile();
    const result = run(['--manifest', file, '--expected-floor-sha', manifest.approval.floorSha, '--pg-url', fixtureUrl]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CHANJET_ADMISSION_REGISTER=DRY_RUN/);
    assert.doesNotMatch(result.stdout, /appSecret|openToken|accessToken/);
  });

  test('registration inserts the reviewed tuple exactly once', async () => withSchema(async () => {
    const { file, manifest } = manifestFile();
    const result = run(['--manifest', file, '--expected-floor-sha', manifest.approval.floorSha, '--pg-url', fixtureUrl, '--register']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CHANJET_ADMISSION_REGISTER=REGISTERED/);
    const inserted = await row(manifest.executionId);
    assert.equal(inserted?.approval_id, manifest.approval.approvalId);
    assert.equal(inserted?.floor_sha, manifest.approval.floorSha);
    assert.equal(inserted?.phase, 'REGISTERED');
    const duplicate = run(['--manifest', file, '--expected-floor-sha', manifest.approval.floorSha, '--pg-url', fixtureUrl, '--register']);
    assert.equal(duplicate.status, 3);
    assert.match(duplicate.stderr, /REGISTRATION_DUPLICATE/);
  }));

  test('floor mismatch, invalid manifest and missing arguments fail closed', () => {
    const { file } = manifestFile();
    const floorMismatch = run(['--manifest', file, '--expected-floor-sha', 'a'.repeat(40), '--pg-url', fixtureUrl, '--register']);
    assert.equal(floorMismatch.status, 4);
    assert.match(floorMismatch.stderr, /FLOOR_SHA_MISMATCH/);

    const invalidFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-invalid-')), 'manifest.json');
    const invalid = manifestFile();
    const invalidManifest = JSON.parse(fs.readFileSync(invalid.file, 'utf8'));
    invalidManifest.approval.scopes = ['RECEIVABLE_STATISTICS', 'RECEIVABLE_STATISTICS'];
    invalidManifest.executionId = 'EXEC_INVALIDSCOPE';
    fs.writeFileSync(invalidFile, JSON.stringify(invalidManifest));
    const invalidResult = run(['--manifest', invalidFile, '--expected-floor-sha', invalidManifest.approval.floorSha, '--pg-url', fixtureUrl, '--register']);
    assert.equal(invalidResult.status, 5);
    assert.match(invalidResult.stderr, /MANIFEST_INVALID/);

    const noArgs = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
    assert.equal(noArgs.status, 2);
    void fs.rmSync(path.dirname(invalidFile), { recursive: true, force: true });
  });

  test('same approvalId with a new executionId is a duplicate, including under concurrency', async () => withSchema(async () => {
    const first = manifestFile();
    const registerArgs = (f) => ['--manifest', f, '--expected-floor-sha', first.manifest.approval.floorSha, '--pg-url', fixtureUrl, '--register'];
    const ok = run(registerArgs(first.file));
    assert.equal(ok.status, 0, ok.stderr);
    // same approval, fresh executionId
    const secondManifest = JSON.parse(fs.readFileSync(first.file, 'utf8'));
    secondManifest.executionId = `EXEC_${randomId()}`;
    const secondFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-manifest-')), 'manifest.json');
    fs.writeFileSync(secondFile, JSON.stringify(secondManifest));
    const sameApproval = run(registerArgs(secondFile));
    assert.equal(sameApproval.status, 3);
    assert.match(sameApproval.stderr, /REGISTRATION_DUPLICATE/);
    // concurrent duplicates of one manifest: all children START together, the
    // database rules — exactly one winner, the rest duplicate
    const third = manifestFile();
    const children = Array.from({ length: 3 }, () => spawn(process.execPath, [cli, ...registerArgs(third.file)], { encoding: 'utf8' }));
    const racers = await Promise.all(children.map((child) => new Promise((resolve) => {
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (code) => resolve({ status: code, stdout, stderr }));
    })));
    const succeeded = racers.filter((r) => r.status === 0);
    const duplicated = racers.filter((r) => r.status === 3 && /REGISTRATION_DUPLICATE/.test(r.stderr));
    assert.equal(succeeded.length, 1, JSON.stringify(racers.map((r) => [r.status, r.stderr.slice(0, 80)])));
    assert.equal(succeeded.length + duplicated.length, racers.length);
    const finalRow = await row(third.manifest.executionId);
    assert.equal(finalRow?.execution_id, third.manifest.executionId);
    assert.equal(finalRow?.approval_id, third.manifest.approval.approvalId);
  }));

  test('non-loopback or non-disposable PG URLs are refused before any connection attempt', () => {
    const { file } = manifestFile();
    for (const [url, reason] of [
      ['postgresql://postgres:pw@10.0.0.8:5432/chanjet_admission_fixture', 'LOOPBACK_DISPOSABLE_FIXTURE_URL_REQUIRED'],
      ['postgresql://postgres:pw@127.0.0.1:5432/phoenix_erp', 'LOOPBACK_DISPOSABLE_FIXTURE_URL_REQUIRED'],
      // unparseable URLs are refused pre-connection under their own label
      ['not-a-url', 'PG_URL_UNPARSEABLE'],
    ]) {
      const result = run(['--manifest', file, '--expected-floor-sha', 'e'.repeat(40), '--pg-url', url, '--register']);
      assert.equal(result.status, 2, `${url}`);
      assert.match(result.stderr, new RegExp(reason));
    }
  });

  test('compiled admission store is the registration path (no inline SQL re-implementation)', () => {
    const source = fs.readFileSync(cli, 'utf8');
    assert.match(source, /chanjet-execution-admission\.store\.js/);
    assert.match(source, /registerFromReviewedRootManifest/);
    assert.doesNotMatch(source, /INSERT INTO chanjet_execution_admissions/);
  });
});
