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

// runs the REAL chain CLI with the LOCAL transport and the docker shim on PATH
function runChain(evidenceDir, overrides = {}) {
  const dockerShimBin = makeDockerShim();
  const args = [
    'scripts/ci/ledger-collection-chain.mjs',
    '--transport', 'local',
    '--collection-ref', overrides.collectionRef ?? headSha,
    '--expected-collector-sha256', overrides.expectedSha ?? collectorSha256,
    '--evidence-dir', evidenceDir,
    '--main-ref', overrides.mainRef ?? headSha,
  ];
  const run = spawnSync(process.execPath, args, {
    cwd: repoRoot, encoding: 'utf8', timeout: 180_000,
    env: { ...process.env, PATH: `${dockerShimBin}:${process.env.PATH}`, DEPLOY_PATH: repoRoot, MIG_MODE: 'prod' },
  });
  fs.rmSync(dockerShimBin, { recursive: true, force: true });
  return { code: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' };
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
    try { spawnSync('docker', ['exec', container, 'psql', '-X', '-U', pgEnv.PGUSER, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${chainDb}`], { encoding: 'utf8' }); } catch { /* best effort */ }
    fs.rmSync(work, { recursive: true, force: true });
  });

  test('normal: the full chain completes — exit 0, evidence has the collection, BOTH evaluations and the summary', () => {
    seedDatabase(seedChainDatabase());
    const evidence = path.join(work, 'normal');
    const run = runChain(evidence);
    assert.equal(run.code, 0, `chain exit ${run.code}: ${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /LEDGER_COLLECTION_CHAIN=code:0/);
    // evidence retention: staging record, recovered document + digest, both
    // evaluations, summary — every stage's artifact is present
    for (const file of ['bind.txt', 'collection.json', 'collection.sha256', 'eval-main.json', 'eval-collection.json', 'SUMMARY.txt', 'host/staging.txt', 'host/collection.json', 'host/collection.sha256']) {
      assert.ok(fs.existsSync(path.join(evidence, file)), `missing evidence file: ${file}`);
    }
    // the recovered document's digest equals the host's RAW digest
    const hostDigest = fs.readFileSync(path.join(evidence, 'host/collection.sha256'), 'utf8').trim();
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
