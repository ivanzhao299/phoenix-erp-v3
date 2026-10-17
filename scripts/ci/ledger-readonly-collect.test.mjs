// R4.2d ledger readonly collection — isolated PostgreSQL18 verification.
//
// Every path runs against a DISPOSABLE fixture database through a REAL psql
// (a thin docker-exec shim resolving the collector's `psql` call to the
// container's own client — the same PG18 the admission matrices use):
//   normal           → one JSON document, both tables, one snapshot
//   lock conflict    → lock_timeout fires, the collector refuses bounded,
//                      the blocker keeps its lock, no collector connection or
//                      transaction survives
//   connection fail  → bounded refusal
//   garbage output   → LEDGER_COLLECT_ERROR (never a plausible document)
//   client bound     → a hanging psql is SIGKILLed at the client timeout
//   statement kill   → statement_timeout truly cancels the query AND aborts
//                      the transaction (server-side proof)
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertDedicatedLedgerFixture, provisionDedicatedDatabase, OWNER_MARKER_TABLE } from './ledger-fixture-guard.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('../../apps/api/node_modules/pg');

const fixtureUrl = process.env.LEDGER_COLLECT_VERIFY_URL;
const verify = fixtureUrl ? describe : describe.skip;

if (process.env.LEDGER_COLLECT_VERIFY_REQUIRED === 'true' && !fixtureUrl) throw Error('LEDGER_COLLECT_VERIFY_URL_REQUIRED');

const repoRoot = path.resolve(process.cwd());
const collector = path.join(repoRoot, 'scripts/ops/ledger-readonly-collect.mjs');
const parsedFixture = fixtureUrl ? new URL(fixtureUrl) : null;
const pgEnv = fixtureUrl ? {
  PGHOST: parsedFixture.hostname, PGPORT: parsedFixture.port || '5432',
  PGUSER: decodeURIComponent(parsedFixture.username || 'postgres'),
  PGPASSWORD: decodeURIComponent(parsedFixture.password || ''),
  PGDATABASE: parsedFixture.pathname.slice(1),
} : null;

// the fixture DB container (explicit override; otherwise discovered by
// matching the fixture database name among postgres containers)
function resolveFixtureContainer() {
  if (process.env.LEDGER_COLLECT_DB_CONTAINER) return process.env.LEDGER_COLLECT_DB_CONTAINER;
  const candidates = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).split('\n').filter((n) => n.trim());
  return candidates.find((n) => {
    try { return execFileSync('docker', ['exec', n, 'printenv', 'POSTGRES_DB'], { encoding: 'utf8' }).trim() === pgEnv.PGDATABASE; } catch { return false; }
  }) || '';
}

let shimBin = '';
let runNonce = '';
let dataSource;
let container = '';
let fixturePid = -1;

function runCollector(args = [], extra = {}) {
  let run;
  try {
    const stdout = execFileSync(process.execPath, [collector, '--db-mode', 'ci', ...args], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...pgEnv, PATH: `${shimBin}:${process.env.PATH}`, ...extra.env },
    });
    run = { status: 0, stdout, stderr: '' };
  } catch (error) {
    run = { status: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
  run.elapsedMs = run.elapsedMs ?? null;
  return run;
}

async function pgStatSnapshot() {
  const client = new Client({ connectionString: fixtureUrl });
  try {
    await client.connect();
    const rows = await client.query(`SELECT pid, state, left(query, 80) AS query FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND query NOT LIKE '%pg_stat_activity%'`);
    return rows.rows;
  } finally { await client.end().catch(() => undefined); }
}

verify('ledger readonly collection (isolated PostgreSQL18, real psql)', () => {
  before(async () => {
    assert.equal(parsedFixture.hostname, '127.0.0.1', 'isolated loopback fixture required');
    // the SHARED GUARD (scripts/ci/ledger-fixture-guard.mjs) runs BEFORE any
    // destructive operation: identity (loopback), dedicated namespace, and
    // URL/container same-instance ownership. The dedicated database is
    // bootstrapped first (the guard verifies it exists ON the container).
    assert.match(pgEnv.PGDATABASE, /^ledger_collect_/, `dedicated disposable database required, got: ${pgEnv.PGDATABASE}`);
    container = resolveFixtureContainer();
    assert.ok(container, 'fixture DB container required for the real-psql shim');
    // CONDITIONAL provisioning: an existing same-named database (another
    // run's, or unmarked) is NEVER provisioned over — created fresh only when
    // absent, stamped with THIS-RUN ownership by the shared helper
    runNonce = randomUUID();
    const provisioned = provisionDedicatedDatabase({ container, user: pgEnv.PGUSER, database: pgEnv.PGDATABASE, runNonce });
    assert.equal(provisioned.created, true, `conditional provisioning refused: ${provisioned.reason}`);
    // ALL provisioning flows through the CONTAINER channel only (a URL
    // mismatch cannot be touched by it); the guard verifies identity +
    // same-instance + THIS-RUN ownership before anything flows through the URL
    const provisionSql = [
      'CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());',
      'CREATE TABLE migrations (id serial PRIMARY KEY, timestamp bigint NOT NULL, name varchar NOT NULL);',
      "INSERT INTO schema_migrations(filename) VALUES ('20260101_one.sql'), ('20260102_two.sql');",
      "INSERT INTO migrations(timestamp, name) VALUES (1781749821162, 'CreateTypeormMetadata1781749821162');",
    ].join('\n');
    const provision = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', pgEnv.PGDATABASE], { input: provisionSql, encoding: 'utf8' });
    assert.equal(provision.status, 0, `fixture provisioning failed: ${provision.stderr}`);
    await assertDedicatedLedgerFixture({ fixtureUrl, container, expectedRunNonce: runNonce });
    // the psql shim: the collector's `psql` call resolves to the fixture
    // container's own client — a REAL psql on the REAL database
    shimBin = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-collect-shim-'));
    // the shim is a REAL psql against the fixture container. The dedicated
    // PGCOLLECT_FAIL_PORT variable (never the connection env itself) injects
    // a REAL connection refusal inside the container for the failure test —
    // the normal path keeps the container's own local-socket connection
    fs.writeFileSync(path.join(shimBin, 'psql'), [
      '#!/bin/sh',
      'set --',
      '[ -n "$PGCOLLECT_FAIL_PORT" ] && set -- "$@" -e "PGPORT=$PGCOLLECT_FAIL_PORT"',
      `exec docker exec -i "$@" ${container} psql -X -At -v ON_ERROR_STOP=1 -U '${pgEnv.PGUSER}' -d '${pgEnv.PGDATABASE}' "$@"`,
      '',
    ].join('\n'), { mode: 0o755 });
    dataSource = new Client({ connectionString: fixtureUrl });
    await dataSource.connect();
    fixturePid = (await dataSource.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  });
  after(async () => {
    await dataSource?.end().catch(() => undefined);
    fs.rmSync(shimBin, { recursive: true, force: true });
    // scoped cleanup: only THIS suite's dedicated database
    spawnSync('docker', ['exec', container, 'psql', '-X', '-U', pgEnv.PGUSER, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${pgEnv.PGDATABASE}`], { encoding: 'utf8' });
  });

  test('guard rejection leaves BOTH databases unchanged (foreign nonce / missing marker)', async () => {
    // a FOREIGN dedicated database carrying ANOTHER run's nonce, plus one
    // with NO marker at all — both must be refused, and the refusal must
    // change nothing on either side (rows, schemas, and the instance's
    // database list are snapshotted before and after)
    const foreignDb = `ledger_collect_foreign_${randomUUID().slice(0, 8)}`;
    const noMarkerDb = `ledger_collect_nomarker_${randomUUID().slice(0, 8)}`;
    const created = spawnSync('docker', ['exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', 'postgres', '-c', `CREATE DATABASE ${foreignDb}`, '-c', `CREATE DATABASE ${noMarkerDb}`], { encoding: 'utf8' });
    assert.equal(created.status, 0, created.stderr);
    try {
      const seedForeign = spawnSync('docker', ['exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', foreignDb], {
        input: [
          `CREATE TABLE ${OWNER_MARKER_TABLE} (run_nonce text PRIMARY KEY);`,
          "INSERT INTO ledger_fixture_owner (run_nonce) VALUES ('someone-elses-run');",
          'CREATE TABLE sentinel (v text);',
          "INSERT INTO sentinel VALUES ('untouched');",
        ].join('\n'),
        encoding: 'utf8',
      });
      assert.equal(seedForeign.status, 0, seedForeign.stderr);
      const foreignUrl = new URL(fixtureUrl);
      foreignUrl.pathname = `/${foreignDb}`;
      const noMarkerUrl = new URL(fixtureUrl);
      noMarkerUrl.pathname = `/${noMarkerDb}`;
      const readSide = (db, sql) => spawnSync('docker', ['exec', container, 'psql', '-X', '-At', '-U', pgEnv.PGUSER, '-d', db, '-c', sql], { encoding: 'utf8' }).stdout.trim();
      const foreignFingerprint = `SELECT (SELECT run_nonce FROM ${OWNER_MARKER_TABLE}) || '|' || (SELECT v FROM sentinel)`;
      const dbList = "SELECT string_agg(datname, ',' ORDER BY datname) FROM pg_database WHERE datname LIKE 'ledger_collect_%'";
      const beforeForeign = readSide(foreignDb, foreignFingerprint);
      const beforeMine = (await dataSource.query(`SELECT run_nonce FROM ${OWNER_MARKER_TABLE}`)).rows;
      const beforeDbs = readSide('postgres', dbList);
      for (const [label, url] of [['foreign nonce', foreignUrl], ['missing marker', noMarkerUrl]]) {
        await assert.rejects(
          () => assertDedicatedLedgerFixture({ fixtureUrl: url.toString(), container, expectedRunNonce: runNonce }),
          /ownership mismatch|marker missing|does not exist/,
          `${label} database must be refused by the ownership guard`,
        );
      }
      const afterForeign = readSide(foreignDb, foreignFingerprint);
      assert.equal(afterForeign, beforeForeign, 'the foreign database changed during a REJECTED guard call');
      const afterMine = (await dataSource.query(`SELECT run_nonce FROM ${OWNER_MARKER_TABLE}`)).rows;
      assert.deepEqual(afterMine, beforeMine, "this suite's database changed during a REJECTED guard call");
      const afterDbs = readSide('postgres', dbList);
      assert.equal(afterDbs, beforeDbs, "the instance's database list changed during a REJECTED guard call");
    } finally {
      spawnSync('docker', ['exec', container, 'psql', '-X', '-U', pgEnv.PGUSER, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${foreignDb}`, '-c', `DROP DATABASE IF EXISTS ${noMarkerDb}`], { encoding: 'utf8' });
    }
  });

  test('normal: one JSON document, both tables, one snapshot, schema marker', () => {
    const run = runCollector();
    assert.equal(run.status, 0, run.stderr);
    const doc = JSON.parse(run.stdout);
    assert.equal(doc.schema, 'phoenix.ledger-readonly-collection/v1');
    assert.equal(doc.db_mode, 'ci');
    assert.deepEqual(doc.schema_migrations.map((r) => r.filename), ['20260101_one.sql', '20260102_two.sql']);
    assert.deepEqual(doc.migrations, [{ name: 'CreateTypeormMetadata1781749821162', timestamp: 1781749821162 }]);
    assert.match(doc.server_version, /^1[68]\./);
    assert.ok(/^\d+:\d+:$/.test(doc.snapshot), `snapshot identity: ${doc.snapshot}`);
    assert.ok(!Number.isNaN(Date.parse(doc.transaction_timestamp)));
    // scope: no business tables, no env, no credentials anywhere in the document
    const text = run.stdout;
    assert.doesNotMatch(text, /PGPASSWORD|POSTGRES_PASSWORD|password/);
  });

  test('lock conflict: lock_timeout fires bounded, the blocker keeps its lock, nothing of the collector survives', async () => {
    const blocker = new Client({ connectionString: fixtureUrl });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('LOCK TABLE migrations IN ACCESS EXCLUSIVE MODE');
      const started = Date.now();
      const run = runCollector(['--lock-timeout-ms', '500']);
      const elapsed = Date.now() - started;
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /LEDGER_COLLECT_ERROR: .*(lock_timeout|canceling statement)/i);
      assert.ok(elapsed < 5_000, `lock refusal took ${elapsed}ms — not bounded by lock_timeout`);
      // the blocker still holds its lock; no COLLECTOR connection, query or
      // transaction survives (the blocker's and the fixture's own backends
      // are excluded by pid)
      const blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const activity = await pgStatSnapshot();
      const residue = activity.filter((row) => row.pid !== blockerPid && row.pid !== fixturePid && (/json_agg|schema_migrations|migrations/.test(row.query) || row.state === 'idle in transaction'));
      assert.deepEqual(residue, [], `collector residue: ${JSON.stringify(activity)}`);
      await blocker.query('ROLLBACK');
      // after release the collection succeeds
      const retried = runCollector();
      assert.equal(retried.status, 0, retried.stderr);
    } finally {
      await blocker.end().catch(() => undefined);
    }
  });

  test('connection failure refuses bounded', () => {
    const started = Date.now();
    const run = runCollector([], { env: { PGCOLLECT_FAIL_PORT: '1' } });
    const elapsed = Date.now() - started;
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /LEDGER_COLLECT_ERROR: /);
    assert.ok(elapsed < 15_000, `connection failure took ${elapsed}ms`);
  });

  test('garbage psql output is an error, never a plausible document', () => {
    const garbageBin = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-collect-garbage-'));
    try {
      fs.writeFileSync(path.join(garbageBin, 'psql'), '#!/bin/sh\necho "not json at all"; echo "more noise" >&2\nexit 0\n', { mode: 0o755 });
      const priorBin = shimBin;
      shimBin = garbageBin;
      const run = runCollector();
      shimBin = priorBin;
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /LEDGER_COLLECT_ERROR: /);
      assert.throws(() => JSON.parse(run.stdout));
    } finally {
      fs.rmSync(garbageBin, { recursive: true, force: true });
    }
  });

  test('client bound: a hanging psql is SIGKILLed at the client timeout', () => {
    const hangBin = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-collect-hang-'));
    try {
      fs.writeFileSync(path.join(hangBin, 'psql'), '#!/bin/sh\nsleep 30\n', { mode: 0o755 });
      const priorBin = shimBin;
      shimBin = hangBin;
      const started = Date.now();
      const run = runCollector(['--client-timeout-ms', '600']);
      const elapsed = Date.now() - started;
      shimBin = priorBin;
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /LEDGER_COLLECT_ERROR: /);
      assert.ok(elapsed < 5_000, `client kill took ${elapsed}ms — the 600ms bound did not fire`);
    } finally {
      fs.rmSync(hangBin, { recursive: true, force: true });
    }
  });

  test('server-side proof: statement_timeout cancels the query and aborts the transaction', async () => {
    // the EXACT statement shape the collector uses, with pg_sleep standing in
    // for a slow read: the server must cancel (57014) and the transaction
    // must abort — nothing outlives the command
    const statement = [
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;',
      "SET LOCAL lock_timeout='2000ms';",
      "SET LOCAL statement_timeout='400ms';",
      'SELECT pg_sleep(30);',
      'ROLLBACK;',
    ].join('\n');
    const killed = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', pgEnv.PGDATABASE], { input: statement, encoding: 'utf8', timeout: 20_000 });
    assert.notEqual(killed.status, 0, 'statement_timeout must fail the psql command');
    assert.match(String(killed.stderr || killed.stdout), /canceling statement due to statement timeout/);
    // the aborted transaction released: no sleeping query, no open transaction remains
    const activity = await pgStatSnapshot();
    assert.ok(!activity.some((row) => /pg_sleep/.test(row.query)), `sleeping query survived: ${JSON.stringify(activity)}`);
    assert.ok(!activity.some((row) => row.state === 'idle in transaction'), `aborted transaction survived: ${JSON.stringify(activity)}`);
    // the same proof for lock_timeout: a blocked SELECT is cancelled and releases
    const blocker = new Client({ connectionString: fixtureUrl });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('LOCK TABLE migrations IN ACCESS EXCLUSIVE MODE');
      const statement2 = [
        'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;',
        "SET LOCAL lock_timeout='400ms';",
        "SET LOCAL statement_timeout='10000ms';",
        'SELECT count(*) FROM migrations;',
        'ROLLBACK;',
      ].join('\n');
      const killed2 = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', pgEnv.PGDATABASE], { input: statement2, encoding: 'utf8', timeout: 20_000 });
      assert.notEqual(killed2.status, 0, 'lock_timeout must fail the psql command');
      assert.match(String(killed2.stderr || killed2.stdout), /canceling statement due to lock timeout/);
      await blocker.query('ROLLBACK');
    } finally {
      await blocker.end().catch(() => undefined);
    }
  });
});
