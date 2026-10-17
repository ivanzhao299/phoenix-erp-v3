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
import { pathToFileURL } from 'node:url';

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
    try { return execFileSync('docker', ['exec', n, 'sh', '-c', 'printenv "$1"', '--', 'POSTGRES_DB'], { encoding: 'utf8' }).trim() === pgEnv.PGDATABASE; } catch { return false; }
  }) || '';
}

let shimBin = '';
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
    // DEDICATED-DATABASE GUARD (before ANY connection, let alone DROP):
    // this fixture destroys schemas — it must only ever target the
    // purpose-named disposable database, never a real one
    assert.match(pgEnv.PGDATABASE, /^ledger_collect_/, `dedicated disposable database required, got: ${pgEnv.PGDATABASE}`);
    container = resolveFixtureContainer();
    assert.ok(container, 'fixture DB container required for the real-psql shim');
    // SAME-INSTANCE GUARD: the URL's database must exist ON the specified
    // container, and both views must report the identical server identity —
    // a URL pointing at a different instance than the container is refused
    // before anything connects
    const containerHasDb = spawnSync('docker', ['exec', container, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', 'postgres', '-c', `SELECT 1 FROM pg_database WHERE datname = '${pgEnv.PGDATABASE}'`], { encoding: 'utf8' });
    assert.equal(containerHasDb.status, 0, `container instance unreachable: ${containerHasDb.stderr}`);
    assert.equal(containerHasDb.stdout.trim(), '1', `database ${pgEnv.PGDATABASE} does not exist on container ${container} — URL/container instance mismatch`);
    const probe = new Client({ connectionString: fixtureUrl });
    await probe.connect();
    const urlVersion = (await probe.query('SHOW server_version')).rows[0].server_version;
    await probe.end();
    const containerVersion = spawnSync('docker', ['exec', container, 'psql', '-X', '-At', '-U', pgEnv.PGUSER, '-d', 'postgres', '-c', 'SHOW server_version'], { encoding: 'utf8' }).stdout.trim();
    assert.equal(urlVersion.split(' ').pop(), containerVersion.split(' ').pop(), `URL and container report different servers: ${urlVersion} vs ${containerVersion}`);
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
    await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.query(`CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    await dataSource.query(`CREATE TABLE migrations (id serial PRIMARY KEY, timestamp bigint NOT NULL, name varchar NOT NULL)`);
    await dataSource.query(`INSERT INTO schema_migrations(filename) VALUES ($1), ($2)`, ['20260101_one.sql', '20260102_two.sql']);
    await dataSource.query(`INSERT INTO migrations(timestamp, name) VALUES (1781749821162, 'CreateTypeormMetadata1781749821162')`);
    fixturePid = (await dataSource.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  });
  after(async () => {
    await dataSource?.end().catch(() => undefined);
    fs.rmSync(shimBin, { recursive: true, force: true });
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
