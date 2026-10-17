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
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { assertDedicatedLedgerFixture, OWNER_MARKER_TABLE } from './ledger-fixture-guard.mjs';

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
let stageRunNonce = '';

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
    // THIS-RUN OWNERSHIP on the staging database too: a per-run nonce is
    // written through the CONTAINER channel and the guard then verifies it
    // from BOTH views before any seeding or destructive operation
    stageRunNonce = randomUUID();
    const marker = spawnSync('docker', ['exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pgEnv.PGUSER, '-d', stageDb, '-c', `CREATE TABLE ${OWNER_MARKER_TABLE} (run_nonce text PRIMARY KEY)`, '-c', `INSERT INTO ${OWNER_MARKER_TABLE} (run_nonce) VALUES ('${stageRunNonce}')`], { encoding: 'utf8' });
    assert.equal(marker.status, 0, `stage ownership marker write failed: ${marker.stderr}`);
    const stageUrl = new URL(fixtureUrl);
    stageUrl.pathname = `/${stageDb}`;
    const stageClient = new Client({ connectionString: stageUrl.toString() });
    await stageClient.connect();
    try {
      await assertDedicatedLedgerFixture({ fixtureUrl: stageUrl.toString(), container, client: stageClient, expectedRunNonce: stageRunNonce });
    } finally {
      await stageClient.end().catch(() => undefined);
    }
    // seed the PRODUCTION-SHAPED ledger state (169 legacy applied + 84
    // canonical applied + the retired row) so the staged collection and the
    // adapter mapping run against realistic data, not another test's residue
    // the legacy baseline from the CHECKED-OUT directory (never a git ref —
    // a shallow CI checkout has no origin/main)
    const legacy = fs.readdirSync(path.join(repoRoot, 'apps/api/migrations')).filter((n) => /2026.*\.sql$/.test(n)).sort();
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
    const blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    try {
      await blocker.query('BEGIN');
      await blocker.query('LOCK TABLE migrations IN ACCESS EXCLUSIVE MODE');
      const stageDir = path.join(work, 'staging-teardown');
      fs.mkdirSync(stageDir, { recursive: true });
      fs.copyFileSync(collector, path.join(stageDir, 'ledger-readonly-collect.mjs'));
      // THE CLIENT-KILL PROOF. The transport shim forwards the collection
      // statement to the REAL container psql IN THE BACKGROUND (so the query
      // genuinely reaches the server and blocks on the blocker's lock) and
      // then hangs in the foreground for 30s — the foreground hang can ONLY
      // be ended by the collector's client-side kill. Bounds: lock 1000ms,
      // statement 1000ms, client 2000ms (== sum — the collector's cross-check
      // allows exactly this), so the SERVER bound ends the backend while the
      // CLIENT bound ends the wedged transport.
      const killShimBin = path.join(work, 'kill-shim');
      fs.mkdirSync(killShimBin, { recursive: true });
      const realDocker = execFileSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).trim();
      fs.writeFileSync(path.join(killShimBin, 'docker'), [
        '#!/bin/sh',
        '[ "$1" = compose ] || { echo "UNEXPECTED_DOCKER_CALL: $*" >&2; exit 64; }',
        'shift 4',
        // preserve stdin across the async list (a non-interactive shell's
        // background jobs default to /dev/null — fd3 carries the real pipe),
        // background the REAL transport (the session reaches the server),
        // then wedge the foreground so ONLY the client kill can end it
        'exec 3<&0',
        `"${realDocker}" exec -i ${container} psql -X -At -v ON_ERROR_STOP=1 -U '${pgEnv.PGUSER}' -d '${stageDb}' <&3 >/dev/null 2>&1 &`,
        'sleep 30',
        '',
      ].join('\n'), { mode: 0o755 });
      const startedAt = Date.now();
      const child = spawn(process.execPath, ['ledger-readonly-collect.mjs', '--db-mode', 'prod', '--lock-timeout-ms', '1000', '--statement-timeout-ms', '1000', '--client-timeout-ms', '2000'], {
        cwd: stageDir, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, MIG_MODE: 'prod', PATH: `${killShimBin}:${process.env.PATH}` },
      });
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d; });
      // (1) PROVE THE JOB STARTED: the collection backend is waiting on the
      // blocker's lock on the server — capture its EXACT pid before anything
      // is torn down
      // poll through a DEDICATED OBSERVER connection (an idle-in-transaction
      // lock holder's view of pg_stat_activity is not a reliable observer —
      // the observer sees the active collection backend and its exact pid)
      const observer = new Client({ connectionString: stageBlockerUrl.toString() });
      await observer.connect();
      let jobPid = 0;
      let jobSeenActive = false;
      try {
        const startedDeadline = Date.now() + 4_000;
        while (Date.now() < startedDeadline && !jobSeenActive) {
          const waiting = await observer.query(`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND pid <> ${blockerPid} AND query ILIKE '%json_agg%' AND query ILIKE '%migrations%' AND state = 'active'`);
          if (waiting.rows.length) { jobPid = waiting.rows[0].pid; jobSeenActive = true; }
          else await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } finally {
        await observer.end().catch(() => undefined);
      }
      assert.ok(jobPid > 0, 'the collection job never started (no active collection backend observed)');
      // (2) PROVE THE CLIENT TIMEOUT ACTUALLY FIRED: the wedged transport
      // (sleep 30) can only end via the collector's 2s client kill — the
      // exit must arrive at ≈2s (never near 30s) carrying the timeout error
      const exitCode = await new Promise((resolve) => child.on('exit', resolve));
      const elapsed = Date.now() - startedAt;
      assert.notEqual(exitCode, 0, 'the client-killed run must fail');
      assert.ok(elapsed < 4_500, `collector exited at ${elapsed}ms — the client timeout did not fire (transport wedge must be killed at ~2000ms)`);
      assert.match(stderr, /LEDGER_COLLECT_ERROR/);
      // (3) PROVE BOUNDED TEARDOWN BY THE EXACT BACKEND PID: the captured
      // pid must vanish within the server-side lock bound plus slack — the
      // pid is the identity, no query-text approximation
      const teardownObserver = new Client({ connectionString: stageBlockerUrl.toString() });
      await teardownObserver.connect();
      try {
        const teardownDeadline = startedAt + 1_000 + 3_000;
        let survived = true;
        while (Date.now() < teardownDeadline) {
          const alive = await teardownObserver.query(`SELECT 1 FROM pg_stat_activity WHERE pid = ${jobPid}`);
          survived = alive.rows.length > 0;
          if (!survived) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.equal(survived, false, `backend pid ${jobPid} outlived the server-side teardown bound`);
        const idle = await teardownObserver.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction' AND pid <> ${blockerPid}`);
        assert.equal(idle.rows[0].n, 0, 'an aborted transaction survived the teardown');
      } finally {
        await teardownObserver.end().catch(() => undefined);
      }
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

  // ── the offline CLI contract — every counterexample is a REAL CLI run ────
  // exit 0 = PASS evaluation, exit 1 = BLOCK evaluation (real verdict with
  // the failure list), exit 2 = input refusal (never an evaluation)
  function runAdapterCli(args) {
    const run = spawnSync(process.execPath, [adapter, ...args], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' };
  }

  test('offline CLI: a REAL evaluation BLOCK exits 1 with the true failure list', () => {
    // a collection missing ONE applied legacy row → legacy_missing BLOCK
    const collection = realCollectionDocument(stageDb);
    collection.schema_migrations = collection.schema_migrations.filter((row) => row.filename !== collection.schema_migrations[0].filename);
    const blockFile = path.join(work, 'collection-block.json');
    fs.writeFileSync(blockFile, JSON.stringify(collection));
    const run = runAdapterCli(['--collection', blockFile, '--inventory', path.join(repoRoot, 'docs/ops/evidence/inv-pr399.json'), '--legacy-dir', path.join(repoRoot, 'apps/api/migrations'), '--retired', path.join(repoRoot, 'scripts/ci/retired-typeorm-migrations.json'), '--mode', 'pre-migration']);
    assert.equal(run.code, 1, `BLOCK must exit 1, got ${run.code}: ${run.stderr}`);
    assert.match(run.stdout, /LEDGER_OFFLINE_EVALUATION=BLOCK/);
    assert.match(run.stdout, /legacy_missing/);
  });

  test('offline CLI: every input counterexample is refused with exit 2 (a REAL CLI run each)', () => {
    const goodCollection = path.join(work, 'collection.json');
    fs.writeFileSync(goodCollection, JSON.stringify(realCollectionDocument(stageDb)));
    const base = ['--collection', goodCollection, '--inventory', path.join(repoRoot, 'docs/ops/evidence/inv-pr399.json'), '--legacy-dir', path.join(repoRoot, 'apps/api/migrations'), '--retired', path.join(repoRoot, 'scripts/ci/retired-typeorm-migrations.json'), '--mode', 'pre-migration'];
    // fixture files for the wrong-shape counterexamples
    const nonJson = path.join(work, 'non-json.json');
    fs.writeFileSync(nonJson, 'this is not json at all {{{');
    const badTimestamp = path.join(work, 'inv-bad-ts.json');
    fs.writeFileSync(badTimestamp, JSON.stringify({ canonicalTypeorm: [{ effective_name: 'X', timestamp: 'not-13-digits' }] }));
    const emptyInventory = path.join(work, 'inv-empty.json');
    fs.writeFileSync(emptyInventory, JSON.stringify({ canonicalTypeorm: [] }));
    const emptyLegacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-empty-legacy-'));
    // retired-registry counterexamples (the deep validator's own refusals)
    const retiredNotArray = path.join(work, 'retired-not-array.json');
    fs.writeFileSync(retiredNotArray, JSON.stringify({ nope: true }));
    const retiredBadEntry = path.join(work, 'retired-bad-entry.json');
    fs.writeFileSync(retiredBadEntry, JSON.stringify([{ name: 'X1787647200000', timestamp: '1787647200000', removal_commit: 'not-a-sha', classification: 'KNOWN_RETIRED_APPLIED' }]));
    const retiredDuplicate = path.join(work, 'retired-duplicate.json');
    const goodEntry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/ci/retired-typeorm-migrations.json'), 'utf8'))[0];
    fs.writeFileSync(retiredDuplicate, JSON.stringify([goodEntry, goodEntry]));
    const rowsNoArrays = path.join(work, 'rows-not-arrays.json');
    fs.writeFileSync(rowsNoArrays, JSON.stringify({ schema: 'phoenix.ledger-readonly-collection/v1', schema_migrations: 'nope', migrations: 7 }));
    const noProvenance = path.join(work, 'no-provenance.json');
    fs.writeFileSync(noProvenance, JSON.stringify({ schema: 'phoenix.ledger-readonly-collection/v1', schema_migrations: [], migrations: [] }));
    const malformedRow = path.join(work, 'malformed-row.json');
    fs.writeFileSync(malformedRow, JSON.stringify({ schema: 'phoenix.ledger-readonly-collection/v1', snapshot: 'x', server_version: '18', schema_migrations: [{ filename: 'a.sql' }], migrations: [{ name: 'n', timestamp: 'short' }] }));
    const retiree = (() => { const f = path.join(work, 'collection.json'); return f; })();
    void retiree;
    for (const [label, args, pattern] of [
      ['no collection arg', base.filter((_, i) => i > 1), /MISSING_INPUT: --collection is required/],
      ['no inventory arg', [base[0], base[1], ...base.slice(4)], /MISSING_INPUT: --inventory is required/],
      ['no legacy-dir arg', base.slice(0, 4), /MISSING_INPUT: --legacy-dir is required/],
      ['no retired arg', base.slice(0, 6), /MISSING_INPUT: --retired is required/],
      ['unreadable collection', ['--collection', path.join(work, 'absent-file.json'), ...base.slice(2)], /MISSING_INPUT: cannot read collection/],
      ['non-JSON collection', ['--collection', nonJson, ...base.slice(2)], /INVALID_INPUT: collection .* is not valid JSON/],
      ['wrong collection schema', ['--collection', (() => { const f = path.join(work, 'wrong-schema.json'); fs.writeFileSync(f, JSON.stringify({ schema: 'something/else' })); return f; })(), ...base.slice(2)], /INVALID_INPUT: collection schema mismatch/],
      ['rows not arrays', ['--collection', rowsNoArrays, ...base.slice(2)], /INVALID_INPUT: collection document lacks the two ledger row arrays/],
      ['missing snapshot provenance', ['--collection', noProvenance, ...base.slice(2)], /INVALID_INPUT: collection document lacks the single-snapshot provenance/],
      ['malformed ledger rows', ['--collection', malformedRow, ...base.slice(2)], /INVALID_INPUT: migrations row malformed/],
      ['inventory malformed entry', ['--collection', base[1], '--inventory', badTimestamp, ...base.slice(4)], /INVALID_INPUT: inventory entry malformed/],
      ['inventory empty', ['--collection', base[1], '--inventory', emptyInventory, ...base.slice(4)], /INVALID_INPUT: inventory carries no canonicalTypeorm entries/],
      ['legacy dir has no SQL', ['--collection', base[1], '--inventory', base[3], '--legacy-dir', emptyLegacyDir, ...base.slice(6)], /INVALID_INPUT: --legacy-dir contains no legacy SQL migrations/],
      ['unknown argument', [...base, '--bogus'], /unknown argument: --bogus/],
      ['retired registry not an array', [...base.slice(0, 6), '--retired', retiredNotArray], /INVALID_INPUT: retired registry/],
      ['retired registry malformed entry', [...base.slice(0, 6), '--retired', retiredBadEntry], /INVALID_INPUT: retired registry .*invalid retired registry entry/],
      ['retired registry duplicate identity', [...base.slice(0, 6), '--retired', retiredDuplicate], /INVALID_INPUT: retired registry .*duplicate retired registry identity/],
    ]) {
      const run = runAdapterCli(args);
      assert.equal(run.code, 2, `${label}: refusal must exit 2, got ${run.code} (stdout: ${run.stdout.slice(0, 120)})`);
      assert.match(run.stderr, pattern, `${label}: refusal reason`);
    }
    fs.rmSync(emptyLegacyDir, { recursive: true, force: true });
  });
});

function spawnStaged(stageDir, dockerShimBin) {
  const run = spawnSync(process.execPath, ['ledger-readonly-collect.mjs', '--db-mode', 'prod', '--client-timeout-ms', '20000'], {
    cwd: stageDir, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, MIG_MODE: 'prod', PATH: `${dockerShimBin}:${process.env.PATH}` },
  });
  return { status: run.status ?? 1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' };
}
