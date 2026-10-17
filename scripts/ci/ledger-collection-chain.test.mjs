// R4.2d production ledger collection — FULL-CHAIN CONTRACT TEST (no
// production network). The REAL runner-side chain
// (scripts/ci/ledger-collection-chain.mjs) runs end to end against the REAL
// host script (scripts/ops/ledger-collection-host.sh) through the LOCAL
// transport, with the fixture container playing the deploy host's database
// via the prod-transport docker shim. The reviewed chain stages are each
// exercised: clean deps → source binding → staging → stdout recovery → raw
// digest verification → both-side evaluation → exception archiving.
//
// Four outcome classes, each verifying the STEP EXIT CODE and the EVIDENCE
// RETENTION:
//   normal   → chain exit 0; evidence: collection + both evaluations + SUMMARY
//   BLOCK    → chain exit 1 (a REAL evaluation verdict: one dropped legacy
//              row on the fixture); evidence retains everything + SUMMARY
//   refusal  → chain exit 2 (wrong approved digest); FAILURE.txt retained
//   crash    → chain exit 3 (the collection table is missing on the host
//              side); FAILURE.txt + transport stdout/stderr retained
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertDedicatedLedgerFixture, OWNER_MARKER_TABLE } from './ledger-fixture-guard.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('../../apps/api/node_modules/pg');

const repoRoot = path.resolve(process.cwd());
const chainModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts/ci/ledger-collection-chain.mjs')).href;
const fixtureUrl = process.env.LEDGER_COLLECT_VERIFY_URL;
const chain = fixtureUrl ? describe : describe.skip;
if (process.env.LEDGER_COLLECTION_CHAIN_REQUIRED === 'true' && !fixtureUrl) throw Error('LEDGER_COLLECT_VERIFY_URL_REQUIRED');

const parsed = fixtureUrl ? new URL(fixtureUrl) : null;
const pgEnv = fixtureUrl ? {
  PGHOST: parsed.hostname, PGPORT: parsed.port || '5432',
  PGUSER: decodeURIComponent(parsed.username || 'postgres'),
  PGPASSWORD: decodeURIComponent(parsed.password || ''),
  PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
} : null;
const container = process.env.LEDGER_COLLECT_DB_CONTAINER || '';
const chainDb = 'ledger_collect_chain';
const collectorAbs = path.join(repoRoot, 'scripts/ops/ledger-readonly-collect.mjs');
const crypto = require('node:crypto');
const collectorSha256 = crypto.createHash('sha256').update(fs.readFileSync(collectorAbs)).digest('hex');
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();

function seedChainDatabase({ dropLegacyRow = false, dropMigrationsTable = false } = {}) {
  const legacy = fs.readdirSync(path.join(repoRoot, 'apps/api/migrations')).filter((n) => /2026.*\.sql$/.test(n)).sort();
  assert.equal(legacy.length, 169);
  const retired = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/ci/retired-typeorm-migrations.json'), 'utf8'));
  const inv = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/ops/evidence/inv-pr399.json'), 'utf8')).canonicalTypeorm;
  const applied = inv.filter((e) => e.timestamp !== 1791878400000n).slice(0, 84);
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  const seedRows = (rows) => [
    `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`,
    `CREATE TABLE ${OWNER_MARKER_TABLE} (run_nonce text PRIMARY KEY);`,
    `CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`,
    ...(dropMigrationsTable ? [] : [
      `CREATE TABLE migrations (id serial PRIMARY KEY, timestamp bigint NOT NULL, name varchar NOT NULL);`,
    ]),
    ...(dropMigrationsTable ? [] : [
      ...legacy.filter((f) => !(dropLegacyRow && f === legacy[0])).map((f) => `INSERT INTO schema_migrations(filename) VALUES (${q(f)});`),
      ...applied.map((e) => `INSERT INTO migrations(timestamp, name) VALUES (${e.timestamp}, ${q(e.effective_name)});`),
      ...retired.map((r) => `INSERT INTO migrations(timestamp, name) VALUES (${r.timestamp}, ${q(r.name)});`),
    ]),
  ].join('\n');
  return seedRows();
}

// runs the REAL chain CLI with the LOCAL transport and the docker shim on PATH.
// The remote is an INDEPENDENT file system root (remoteRoot): DEPLOY_PATH and
// the remote evidence directory live there — the runner recovers the result
// ONLY from the transport's stdout and never reads the remote tree.
function runChain(evidenceDir, overrides = {}) {
  const dockerShimBin = makeDockerShim();
  const remoteRoot = overrides.remoteRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-remote-fs-'));
  fs.mkdirSync(path.join(remoteRoot, 'deploy'), { recursive: true });
  const args = [
    'scripts/ci/ledger-collection-chain.mjs',
    '--transport', 'local',
    '--collection-ref', overrides.collectionRef ?? headSha,
    '--expected-collector-sha256', overrides.expectedSha ?? collectorSha256,
    '--evidence-dir', evidenceDir,
    '--main-ref', overrides.mainRef ?? headSha,
  ];
  if (overrides.expectedMainSha) args.push('--expected-main-sha', overrides.expectedMainSha);
  if (overrides.transportTimeoutMs) args.push('--transport-timeout-ms', String(overrides.transportTimeoutMs));
  const run = spawnSync(process.execPath, args, {
    cwd: repoRoot, encoding: 'utf8', timeout: overrides.outerTimeoutMs ?? 180_000,
    env: {
      ...process.env,
      PATH: `${dockerShimBin}:${process.env.PATH}`,
      DEPLOY_PATH: path.join(remoteRoot, 'deploy'),
      REMOTE_EVIDENCE_DIR: path.join(remoteRoot, 'evidence'),
      MIG_MODE: 'prod',
      ...(overrides.transportCommand ? { CHAIN_TEST_TRANSPORT_COMMAND: overrides.transportCommand } : {}),
    },
  });
  fs.rmSync(dockerShimBin, { recursive: true, force: true });
  return { code: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '', remoteRoot };
}

function makeDockerShim() {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-chain-shim-'));
  const realDocker = execFileSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).trim();
  // the collector's PROD transport (`docker compose exec -T db sh -c 'psql…'`)
  // is redirected to the fixture container's own psql against the chain db
  fs.writeFileSync(path.join(bin, 'docker'), [
    '#!/bin/sh',
    '[ "$1" = compose ] || { echo "UNEXPECTED_DOCKER_CALL: $*" >&2; exit 64; }',
    'shift 4',
    `exec ${realDocker} exec -i ${container} psql -X -At -v ON_ERROR_STOP=1 -U '${pgEnv.PGUSER}' -d '${chainDb}'`,
    '',
  ].join('\n'), { mode: 0o755 });
  return bin;
}

function seedDatabase(sql) {
  const seed = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', chainDb], { input: sql, encoding: 'utf8' });
  assert.equal(seed.status, 0, `seed failed: ${seed.stderr}`);
}

chain('production ledger collection chain (no production network, local transport)', () => {
  let work;
  before(async () => {
    assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname), 'isolated loopback fixture required');
    assert.ok(container, 'fixture DB container required');
    // provision the dedicated chain database (container channel) and verify
    // through the SHARED GUARD before anything runs
    const bootstrap = spawnSync('docker', ['exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${chainDb}`, '-c', `CREATE DATABASE ${chainDb}`], { encoding: 'utf8' });
    assert.equal(bootstrap.status, 0, bootstrap.stderr);
    const nonce = randomUUID();
    const marker = spawnSync('docker', ['exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', chainDb, '-c', `CREATE TABLE ${OWNER_MARKER_TABLE} (run_nonce text PRIMARY KEY)`, '-c', `INSERT INTO ${OWNER_MARKER_TABLE} (run_nonce) VALUES ('${nonce}')`], { encoding: 'utf8' });
    assert.equal(marker.status, 0, marker.stderr);
    const chainUrl = new URL(fixtureUrl);
    chainUrl.pathname = `/${chainDb}`;
    const probe = new Client({ connectionString: chainUrl.toString() });
    await probe.connect();
    try {
      await assertDedicatedLedgerFixture({ fixtureUrl: chainUrl.toString(), container, client: probe, expectedRunNonce: nonce });
    } finally {
      await probe.end().catch(() => undefined);
    }
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-chain-'));
  });
  after(() => {
    try { spawnSync('docker', ['exec', container, 'psql', '-X', '-U', pgEnv.PGUSER, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${chainDb}`, '-c', `DROP DATABASE IF EXISTS ${chainDb}_sentinel`], { encoding: 'utf8' }); } catch { /* best effort */ }
    for (const dir of fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('ledger-remote-fs-'))) {
      try { fs.rmSync(path.join(os.tmpdir(), dir), { recursive: true, force: true }); } catch { /* concurrently created */ }
    }
    fs.rmSync(work, { recursive: true, force: true });
  });

  test('normal: the full chain completes over an INDEPENDENT remote filesystem — exit 0, stdout-only recovery, BOTH evaluations', () => {
    seedDatabase(seedChainDatabase());
    const evidence = path.join(work, 'normal');
    const run = runChain(evidence, { expectedMainSha: headSha });
    assert.equal(run.code, 0, `chain exit ${run.code}: ${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /LEDGER_COLLECTION_CHAIN=code:0/);
    // RUNNER evidence: binding, the stdout-recovered document + digest, both
    // evaluations, the summary, and the captured transport output — and NO
    // host-side directory (the runner tree is stdout-recovery only; the host
    // tree lives under the independent remote root and is never read)
    for (const file of ['bind.txt', 'collection.json', 'collection.sha256', 'eval-main.json', 'eval-collection.json', 'SUMMARY.txt', 'transport-stdout.txt', 'transport-stderr.txt']) {
      assert.ok(fs.existsSync(path.join(evidence, file)), `missing runner evidence file: ${file}`);
    }
    assert.ok(!fs.existsSync(path.join(evidence, 'host')), 'the runner evidence tree must not contain host-side files — recovery is stdout-only');
    // the HOST evidence lives under the independent remote root
    const remoteEvidence = path.join(run.remoteRoot, 'evidence');
    for (const file of ['staging.txt', 'collection.json', 'collection.sha256', 'validate.txt']) {
      assert.ok(fs.existsSync(path.join(remoteEvidence, file)), `missing remote evidence file: ${file}`);
    }
    // RAW BYTE DIGEST: the recovered document's digest equals the digest the
    // host computed over its own file bytes (byte-exact stdout round trip)
    const hostDigest = fs.readFileSync(path.join(remoteEvidence, 'collection.sha256'), 'utf8').trim();
    assert.equal(fs.readFileSync(path.join(evidence, 'collection.sha256'), 'utf8').trim(), hostDigest);
    assert.match(fs.readFileSync(path.join(evidence, 'SUMMARY.txt'), 'utf8'), /eval_main=PASS/);
    assert.match(fs.readFileSync(path.join(evidence, 'SUMMARY.txt'), 'utf8'), /eval_collection=PASS/);
  }, 180_000);

  test('BLOCK: one dropped legacy row → exit 1 with a REAL evaluation verdict, evidence retained', () => {
    seedDatabase(seedChainDatabase({ dropLegacyRow: true }));
    const evidence = path.join(work, 'block');
    const run = runChain(evidence);
    assert.equal(run.code, 1, `chain exit ${run.code}: ${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /LEDGER_COLLECTION_CHAIN=code:1/);
    assert.match(run.stdout, /evals:main=BLOCK/);
    const blockEval = JSON.parse(fs.readFileSync(path.join(evidence, 'eval-main.json'), 'utf8'));
    assert.equal(blockEval.result.pass, false);
    assert.deepEqual(blockEval.result.failures, ['legacy_missing']);
    // evidence retained: the collection itself is preserved
    assert.ok(fs.existsSync(path.join(evidence, 'collection.json')));
    assert.ok(!fs.existsSync(path.join(evidence, 'FAILURE.txt')), 'a BLOCK is a verdict, not a chain failure');
  }, 180_000);

  test('input refusal: a wrong approved digest → exit 2, FAILURE evidence retained', () => {
    seedDatabase(seedChainDatabase());
    const evidence = path.join(work, 'refusal');
    const run = runChain(evidence, { expectedSha: 'f'.repeat(64) });
    assert.equal(run.code, 2, `chain exit ${run.code}: ${run.stdout}\n${run.stderr}`);
    const failure = fs.readFileSync(path.join(evidence, 'FAILURE.txt'), 'utf8');
    assert.match(failure, /stage=bind/);
    assert.match(failure, /collector sha256 .* !== approved/);
  }, 180_000);

  test('dual SHA binding: a WRONG pinned main SHA is refused at bind (exit 2) with evidence', () => {
    seedDatabase(seedChainDatabase());
    const evidence = path.join(work, 'bind-main-sha');
    const run = runChain(evidence, { expectedMainSha: 'e'.repeat(40) });
    assert.equal(run.code, 2, `chain exit ${run.code}: ${run.stdout}\n${run.stderr}`);
    assert.match(fs.readFileSync(path.join(evidence, 'FAILURE.txt'), 'utf8'), /stage=bind/);
    assert.match(fs.readFileSync(path.join(evidence, 'FAILURE.txt'), 'utf8'), /main/);
  }, 180_000);

  test('transport timeout: a HUNG transport is killed at the injected bound — exit 3, failure evidence, no leftover process', async () => {
    seedDatabase(seedChainDatabase());
    const evidence = path.join(work, 'transport-timeout');
    const marker = path.join(work, 'hang-still-running');
    // the hung transport: a shell that sleeps far beyond the 1500ms bound and
    // touches a marker so the test can verify it was actually started and
    // then actually killed (unified cleanup leaves no survivor)
    const hangScript = `#!/bin/sh\ntouch ${JSON.stringify(marker)}\nsleep 60\n`;
    const hangBin = path.join(work, 'hang-bin');
    fs.mkdirSync(hangBin, { recursive: true });
    fs.writeFileSync(path.join(hangBin, 'ledger-hang-transport'), hangScript, { mode: 0o755 });
    const started = Date.now();
    const run = runChain(evidence, { transportTimeoutMs: 1500, transportCommand: path.join(hangBin, 'ledger-hang-transport'), outerTimeoutMs: 60_000 });
    const elapsed = Date.now() - started;
    assert.equal(run.code, 3, `chain exit ${run.code}: ${run.stdout}\n${run.stderr}`);
    assert.ok(elapsed < 30_000, `the hung transport was not bounded (${elapsed}ms)`);
    assert.match(run.stdout, /LEDGER_COLLECTION_CHAIN=code:3/);
    assert.match(fs.readFileSync(path.join(evidence, 'FAILURE.txt'), 'utf8'), /stage=collect/);
    // the marker proves the transport STARTED; its disappearance within a
    // short window proves the kill actually reached it (spawnSync timeout +
    // SIGKILL) — the chain never waits for the 60s sleep
    assert.ok(fs.existsSync(marker), 'the hung transport never started');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const leftover = spawnSync('pgrep', ['-f', 'ledger-hang-transport'], { encoding: 'utf8' });
    assert.notEqual(leftover.status, 0, 'the hung transport process survived the unified cleanup');
  }, 120_000);

  test('provisioning/failure-cleanup zero-modification: a SENTINEL database on the same instance is untouched across every chain entry', () => {
    // the sentinel carries rows and lives on the SAME instance in the
    // dedicated namespace — every provisioning, failure and cleanup path of
    // the chain entry (all four classes) must leave it byte-identical
    const sentinel = `${chainDb}_sentinel`;
    const provision = spawnSync('docker', ['exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${sentinel}`, '-c', `CREATE DATABASE ${sentinel}`], { encoding: 'utf8' });
    assert.equal(provision.status, 0, provision.stderr);
    const seedSentinel = spawnSync('docker', ['exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', sentinel], {
      input: [
        `CREATE TABLE ${OWNER_MARKER_TABLE} (run_nonce text PRIMARY KEY);`,
        "INSERT INTO ledger_fixture_owner (run_nonce) VALUES ('sentinel-own-run');",
        'CREATE TABLE claims (v text);',
        "INSERT INTO claims VALUES ('sentinel-payload');",
      ].join('\n'),
      encoding: 'utf8',
    });
    assert.equal(seedSentinel.status, 0, seedSentinel.stderr);
    const readSentinel = () => spawnSync('docker', ['exec', container, 'psql', '-X', '-At', '-U', pgEnv.PGUSER, '-d', sentinel, '-c', `SELECT (SELECT run_nonce FROM ${OWNER_MARKER_TABLE}) || '|' || (SELECT v FROM claims)`], { encoding: 'utf8' }).stdout.trim();
    const listDbs = () => spawnSync('docker', ['exec', container, 'psql', '-X', '-At', '-U', pgEnv.PGUSER, '-d', 'postgres', '-c', "SELECT string_agg(datname, ',' ORDER BY datname) FROM pg_database WHERE datname LIKE 'ledger_collect_%'"], { encoding: 'utf8' }).stdout.trim();
    const before = readSentinel();
    const beforeDbs = listDbs();
    // EVERY entry: normal, BLOCK, refusal, crash — plus the fresh provisioning
    // each one performs on chainDb
    seedDatabase(seedChainDatabase());
    assert.equal(runChain(path.join(work, 'sentinel-normal')).code, 0);
    seedDatabase(seedChainDatabase({ dropLegacyRow: true }));
    assert.equal(runChain(path.join(work, 'sentinel-block')).code, 1);
    assert.equal(runChain(path.join(work, 'sentinel-refusal'), { expectedSha: '0'.repeat(64) }).code, 2);
    seedDatabase(seedChainDatabase({ dropMigrationsTable: true }));
    assert.equal(runChain(path.join(work, 'sentinel-crash')).code, 3);
    // zero modification on BOTH dimensions: the sentinel's rows AND the
    // instance's ledger_collect_* database set (only own dbs come and go)
    assert.equal(readSentinel(), before, 'the sentinel database was modified by a chain entry');
    const afterDbs = listDbs().split(',').filter((d) => d !== chainDb).sort().join(',');
    const beforeDbsAdjusted = beforeDbs.split(',').sort().join(',');
    assert.ok(afterDbs.split(',').includes(sentinel), 'the sentinel database disappeared');
    assert.equal(afterDbs, beforeDbsAdjusted.split(',').filter((d) => d !== chainDb).sort().join(','), 'the instance database set changed beyond the chain\'s own database');
  }, 300_000);

  test('crash: the ledger table is missing on the host side → exit 3, failure + transport output retained', () => {
    seedDatabase(seedChainDatabase({ dropMigrationsTable: true }));
    const evidence = path.join(work, 'crash');
    const run = runChain(evidence);
    assert.equal(run.code, 3, `chain exit ${run.code}: ${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /LEDGER_COLLECTION_CHAIN=code:3/);
    assert.match(fs.readFileSync(path.join(evidence, 'FAILURE.txt'), 'utf8'), /stage=(collect|verify)/);
    // the transport's captured stdout/stderr are archived
    assert.ok(fs.existsSync(path.join(evidence, 'transport-stdout.txt')));
    assert.ok(fs.existsSync(path.join(evidence, 'transport-stderr.txt')));
  }, 180_000);
});
