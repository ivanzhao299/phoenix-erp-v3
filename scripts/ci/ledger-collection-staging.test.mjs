// R4.2d ledger collection staging + offline-evaluation regressions.
//
// STAGING: the documented production delivery stages the collector as a
// SINGLE self-contained file into a fresh temp directory (node --check, then
// RUN). This test replicates that staging exactly and runs the staged copy
// through its PROD transport (`docker compose exec -T db sh -c 'psql …'`)
// against the isolated fixture via a docker shim — the six CI cases exercise
// the ci channel; this one proves the staged prod path actually runs.
//
// OFFLINE EVALUATION: the documented offline path is the formal adapter
// (ledger-offline-evaluate.mjs) — never raw `--fixture <collection>
// --inventory …`, which ignores --inventory, mis-maps the collection fields
// and reports a vacuous PASS with zero counts. Regressions pin the mapping
// (non-zero counts, applied/pending), the input refusals, and the
// sample's dual-inventory results.
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { assertDedicatedLedgerFixture } from './ledger-fixture-guard.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('../../apps/api/node_modules/pg');

const repoRoot = path.resolve(process.cwd());
const collector = path.join(repoRoot, 'scripts/ops/ledger-readonly-collect.mjs');
const adapter = path.join(repoRoot, 'scripts/ops/ledger-offline-evaluate.mjs');
const fixtureUrl = process.env.LEDGER_COLLECT_VERIFY_URL;
const staged = fixtureUrl ? describe : describe.skip;
if (process.env.LEDGER_COLLECT_VERIFY_REQUIRED === 'true' && !fixtureUrl) throw Error('LEDGER_COLLECT_VERIFY_URL_REQUIRED');

const parsedFixture = fixtureUrl ? new URL(fixtureUrl) : null;
const pgEnv = fixtureUrl ? {
  PGHOST: parsedFixture.hostname, PGPORT: parsedFixture.port || '5432',
  PGUSER: decodeURIComponent(parsedFixture.username || 'postgres'),
  PGDATABASE: parsedFixture.pathname.slice(1),
} : null;
const container = process.env.LEDGER_COLLECT_DB_CONTAINER || '';
// the sibling suite shares the server and runs CONCURRENTLY — the staging
// suite gets its OWN dedicated database (the ^ledger_collect_ guard allows it)
const stageDb = 'ledger_collect_staging';
const stageEnv = fixtureUrl ? { ...pgEnv, PGDATABASE: stageDb } : null;

function realCollectionDocument(database) {
  // produce a REAL collection document from the fixture via the ci channel
  // (real psql through the docker-exec shim)
  const shimBin = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-stage-shim-'));
  fs.writeFileSync(path.join(shimBin, 'psql'), `#!/bin/sh\nexec docker exec -i ${container} psql -X -At -v ON_ERROR_STOP=1 -U '${pgEnv.PGUSER}' -d '${database}' "$@"\n`, { mode: 0o755 });
  try {
    const stdout = execFileSync(process.execPath, [collector, '--db-mode', 'ci'], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...stageEnv, PATH: `${shimBin}:${process.env.PATH}` },
    });
    return JSON.parse(stdout);
  } finally {
    fs.rmSync(shimBin, { recursive: true, force: true });
  }
}

staged('ledger collection staging (prod transport) + offline evaluation adapter', () => {
  let work;
  let dockerShimBin;
  before(async () => {
    // the SHARED GUARD (scripts/ci/ledger-fixture-guard.mjs) runs FIRST —
    // identity (loopback), the dedicated namespace and same-instance
    // ownership over the SERVER fixture — before anything destructive. The
    // staging database is then bootstrapped and verified through the same
    // guard (its own dedicated name in the allowed namespace).
    const serverProbe = new Client({ connectionString: fixtureUrl });
    await serverProbe.connect();
    try {
      await assertDedicatedLedgerFixture({ fixtureUrl, container, client: serverProbe });
    } finally {
      await serverProbe.end().catch(() => undefined);
    }
    const bootstrap = spawnSync('docker', ['exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${stageDb}`, '-c', `CREATE DATABASE ${stageDb}`], { encoding: 'utf8' });
    assert.equal(bootstrap.status, 0, `stage database bootstrap failed: ${bootstrap.stderr}`);
    const stageUrl = new URL(fixtureUrl);
    stageUrl.pathname = `/${stageDb}`;
    const stageClient = new Client({ connectionString: stageUrl.toString() });
    await stageClient.connect();
    try {
      await assertDedicatedLedgerFixture({ fixtureUrl: stageUrl.toString(), container, client: stageClient });
    } finally {
      await stageClient.end().catch(() => undefined);
    }
    // seed the PRODUCTION-SHAPED ledger state (169 legacy applied + 84
    // canonical applied + the retired row) so the staged collection and the
    // adapter mapping run against realistic data, not another test's residue
    const legacy = execFileSync('git', ['ls-tree', '--name-only', 'origin/main', 'apps/api/migrations/'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').filter((n) => /2026.*\.sql$/.test(n)).map((n) => n.split('/').pop()).sort();
    assert.equal(legacy.length, 169);
    const retired = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/ci/retired-typeorm-migrations.json'), 'utf8'));
    const inv = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/ops/evidence/inv-pr399.json'), 'utf8')).canonicalTypeorm;
    const applied = inv.filter((e) => e.timestamp !== 1791878400000n).slice(0, 84);
    const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
    // the freshly created stage database is empty: create the two ledger
    // tables (minimal production shape), then load the rows
    const seed = [
      `CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`,
      `CREATE TABLE IF NOT EXISTS migrations (id serial PRIMARY KEY, timestamp bigint NOT NULL, name varchar NOT NULL);`,
      'BEGIN; DELETE FROM schema_migrations; DELETE FROM migrations;',
      ...legacy.map((f) => `INSERT INTO schema_migrations(filename) VALUES (${q(f)});`),
      ...applied.map((e) => `INSERT INTO migrations(timestamp, name) VALUES (${e.timestamp}, ${q(e.effective_name)});`),
      ...retired.map((r) => `INSERT INTO migrations(timestamp, name) VALUES (${r.timestamp}, ${q(r.name)});`),
      'COMMIT;',
    ].join('\n');
    const seeded = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', stageDb], { input: seed, encoding: 'utf8' });
    assert.equal(seeded.status, 0, `seed failed: ${seeded.stderr}`);
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-staging-'));
  });
  after(() => fs.rmSync(work, { recursive: true, force: true }));

  test('the staged SINGLE-file collector runs through its PROD transport (docker compose exec db)', () => {
    // exactly the documented staging: fresh temp dir, copy the one file,
    // node --check, then RUN it — no repository imports, no siblings needed
    const stageDir = path.join(work, 'staging');
    fs.mkdirSync(stageDir);
    fs.copyFileSync(collector, path.join(stageDir, 'ledger-readonly-collect.mjs'));
    execFileSync('node', ['--check', path.join(stageDir, 'ledger-readonly-collect.mjs')], { cwd: stageDir });
    // the prod transport resolves `docker compose exec -T db sh -c 'psql …'`:
    // the shim intercepts it and forwards stdin to the fixture container's
    // own psql — a real run of the staged file over the prod channel
    dockerShimBin = path.join(work, 'docker-shim');
    fs.mkdirSync(dockerShimBin);
    // resolve the REAL docker binary at generation time (the test process
    // PATH is shim-free) — the staged process's PATH has the shim first, and
    // the shim's own docker exec must never re-enter itself
    const realDocker = execFileSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(dockerShimBin, 'docker'), [
      '#!/bin/sh',
      '[ "$1" = compose ] || { echo "UNEXPECTED_DOCKER_CALL: $*" >&2; exit 64; }',
      'shift 4',
      'exec ' + realDocker + ' exec -i ' + container + " psql -X -At -v ON_ERROR_STOP=1 -U '" + pgEnv.PGUSER + "' -d '" + stageDb + "'",
      '',
    ].join('\n'), { mode: 0o755 });
    const run = spawnStaged(stageDir, dockerShimBin);
    assert.equal(run.status, 0, `staged prod-transport run failed: ${run.stderr}`);
    const doc = JSON.parse(run.stdout);
    assert.equal(doc.schema, 'phoenix.ledger-readonly-collection/v1');
    assert.equal(doc.db_mode, 'prod');
    assert.ok(Array.isArray(doc.schema_migrations) && Array.isArray(doc.migrations));
  });

  test('prod-transport job teardown: a client kill leaves the server bound to clean up — the in-container query is gone within the statement_timeout', async () => {
    // the REAL prod channel hazard: SIGKILL of the local docker CLI does NOT
    // necessarily kill the exec'd psql inside the container. The collector's
    // answer is the SERVER-side statement_timeout — this test proves the
    // teardown end to end: a staged prod run whose read hangs on a lock is
    // client-killed immediately; the in-container psql then dies at the
    // statement_timeout/lock_timeout bound BY ITSELF, and no query, no
    // transaction and no lock survive (asserted against pg_stat_activity,
    // NOT against a mere child-process return value).
    // the blocker must hold the lock in the SAME database the staged prod
    // run reads (stageDb), not the sibling suite's fixture database
    const stageBlockerUrl = new URL(fixtureUrl);
    stageBlockerUrl.pathname = `/${stageDb}`;
    const blocker = new Client({ connectionString: stageBlockerUrl.toString() });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('LOCK TABLE migrations IN ACCESS EXCLUSIVE MODE');
      const stageDir = path.join(work, 'staging-teardown');
      fs.mkdirSync(stageDir, { recursive: true });
      fs.copyFileSync(collector, path.join(stageDir, 'ledger-readonly-collect.mjs'));
      // lock 200ms + statement 500ms (both inside the 1s client bound) — the
      // collector process is killed at ~1s while the in-container psql is
      // still waiting on the lock; the container-side bounds then end it
      const run = spawnSync(process.execPath, ['ledger-readonly-collect.mjs', '--db-mode', 'prod', '--lock-timeout-ms', '200', '--statement-timeout-ms', '500', '--client-timeout-ms', '1000'], {
        cwd: stageDir, encoding: 'utf8', timeout: 30_000,
        env: { ...process.env, MIG_MODE: 'prod', PATH: `${dockerShimBin}:${process.env.PATH}` },
      });
      assert.notEqual(run.status, 0, 'the bounded run must fail (lock wait + client kill)');
      // the in-container psql is (possibly) still alive RIGHT NOW — poll
      // until the SERVER-side bound ends it: the query must disappear within
      // statement+lock bound plus scheduling slack
      const deadline = Date.now() + 6_000;
      let residue = [];
      while (Date.now() < deadline) {
        const activity = await blocker.query(`SELECT pid, state, left(query, 60) AS q FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND query ILIKE '%schema_migrations%'`);
        residue = activity.rows;
        if (!residue.length) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      assert.deepEqual(residue, [], `the in-container collection query outlived the server bounds: ${JSON.stringify(residue)}`);
      // and no aborted transaction lingers
      const idle = await blocker.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction'`);
      assert.equal(idle.rows[0].n, 0, 'an aborted transaction survived the teardown');
      await blocker.query('ROLLBACK');
    } finally {
      await blocker.end().catch(() => undefined);
    }
  }, 30_000);

  test('offline adapter maps the collection document and loads the FULL inventory/legacy/retired inputs', () => {
    const collection = realCollectionDocument(stageDb);
    const collectionFile = path.join(work, 'collection.json');
    fs.writeFileSync(collectionFile, JSON.stringify(collection));
    const outFile = path.join(work, 'evaluation.json');
    const stdout = execFileSync(process.execPath, [adapter,
      '--collection', collectionFile,
      '--inventory', path.join(repoRoot, 'docs/ops/evidence/inv-pr399.json'),
      '--legacy-dir', path.join(repoRoot, 'apps/api/migrations'),
      '--retired', path.join(repoRoot, 'scripts/ci/retired-typeorm-migrations.json'),
      '--mode', 'pre-migration', '--out', outFile,
    ], { cwd: repoRoot, encoding: 'utf8' });
    assert.match(stdout, /LEDGER_OFFLINE_EVALUATION=PASS/);
    const verdict = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    assert.equal(verdict.schema, 'phoenix.ledger-offline-evaluation/v1');
    // the mapping is REAL: non-zero counts on both tables
    assert.equal(verdict.result.counts.legacy_applied_total, collection.schema_migrations.length);
    assert.equal(verdict.result.counts.canonical_typeorm_total, 89);
    assert.ok(verdict.result.counts.canonical_typeorm_applied > 0, 'canonical applied must not be vacuous');
  });

  test('offline adapter refuses missing inputs before any evaluation', () => {
    const collectionFile = path.join(work, 'collection.json');
    fs.writeFileSync(collectionFile, JSON.stringify(realCollectionDocument(stageDb)));
    const base = ['--collection', collectionFile, '--inventory', path.join(repoRoot, 'docs/ops/evidence/inv-pr399.json'), '--legacy-dir', path.join(repoRoot, 'apps/api/migrations'), '--retired', path.join(repoRoot, 'scripts/ci/retired-typeorm-migrations.json')];
    for (const [label, args] of [
      ['no collection', base.slice(2)],
      ['no inventory', [base[0], base[1]]],
      ['no legacy dir', base.slice(0, 4)],
      ['no retired registry', base.slice(0, 6)],
      ['unreadable collection', ['--collection', path.join(work, 'absent.json'), ...base.slice(2)]],
      ['wrong collection schema', (() => { const f = path.join(work, 'wrong-schema.json'); fs.writeFileSync(f, JSON.stringify({ schema: 'something/else' })); return ['--collection', f, ...base.slice(2)]; })()],
    ]) {
      let failed = false;
      try {
        execFileSync(process.execPath, [adapter, ...args, '--mode', 'pre-migration'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        failed = true;
        assert.match(String(error.stderr), /MISSING_INPUT|INVALID_INPUT|unknown argument/);
      }
      assert.ok(failed, `adapter must refuse: ${label}`);
    }
  });
});

function spawnStaged(stageDir, dockerShimBin) {
  const run = spawnSync(process.execPath, ['ledger-readonly-collect.mjs', '--db-mode', 'prod', '--client-timeout-ms', '20000'], {
    cwd: stageDir, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, MIG_MODE: 'prod', PATH: `${dockerShimBin}:${process.env.PATH}` },
  });
  return { status: run.status ?? 1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' };
}
