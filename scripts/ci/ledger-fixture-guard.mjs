// R4.2d shared guard for the ledger collection fixtures (single source —
// BOTH fixture suites, and any future one, must run this BEFORE any
// destructive operation). Every check is an ACTUAL verification, not a
// naming convention:
//
//   identity   — the fixture URL is loopback-only
//   name       — the database is in the dedicated disposable namespace
//                (^ledger_collect_)
//   instance   — the URL view and the container view report the IDENTICAL
//                server identity (same server_version AND the database is
//                listed in the container's pg_database)
//   ownership  — when expectedRunNonce is given, an ownership marker table
//                (ledger_fixture_owner.run_nonce) is read through BOTH the
//                container's psql AND the URL connection: both must return
//                EXACTLY this run's nonce. A database provisioned by another
//                run (or never provisioned by the harness at all) is
//                refused — a name collision cannot pass it.
//
// The guard NEVER writes: a rejected call leaves every database unchanged
// (the suites' negative tests snapshot both sides to prove it).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DEDICATED_NAMESPACE = /^ledger_collect_/;
export const OWNER_MARKER_TABLE = 'ledger_fixture_owner';

function containerPsql(container, user, database, sql) {
  return spawnSync('docker', ['exec', container, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database, '-c', sql], { encoding: 'utf8' });
}

export function assertDedicatedLedgerFixture({ fixtureUrl, container, client, expectedRunNonce } = {}) {
  const parsed = new URL(fixtureUrl);
  // identity: loopback only
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname), `isolated loopback fixture required, got host: ${parsed.hostname}`);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  const user = decodeURIComponent(parsed.username || 'postgres');
  // name: the dedicated disposable namespace — never a real database
  assert.match(database, DEDICATED_NAMESPACE, `dedicated disposable database required (namespace ${DEDICATED_NAMESPACE}), got: ${database}`);
  assert.ok(container, 'fixture DB container required for the real-psql transport');

  const { Client } = require('../../apps/api/node_modules/pg');
  const withUrlClient = async (fn) => {
    if (client) return fn(client, false);
    const probe = new Client({ connectionString: new URL(fixtureUrl).toString() });
    await probe.connect();
    try { return await fn(probe, true); } finally { await probe.end().catch(() => undefined); }
  };

  return (async () => {
    // instance: the database exists ON the container and both views agree
    // on the server identity
    const listed = containerPsql(container, user, 'postgres', `SELECT 1 FROM pg_database WHERE datname = '${database}'`);
    assert.equal(listed.status, 0, `container instance unreachable (${container}): ${listed.stderr}`);
    assert.equal(listed.stdout.trim(), '1', `database ${database} does not exist on container ${container} — URL/container instance mismatch`);
    const urlVersion = await withUrlClient((c) => c.query('SHOW server_version').then((r) => r.rows[0].server_version));
    const containerVersion = containerPsql(container, user, database, 'SHOW server_version');
    assert.equal(containerVersion.status, 0, `container view of ${database} unreachable: ${containerVersion.stderr}`);
    assert.equal(urlVersion.split(' ').pop(), containerVersion.stdout.trim().split(' ').pop(), `URL and container report different servers: ${urlVersion} vs ${containerVersion.stdout.trim()}`);

    // ownership: this run's nonce must be readable IDENTICALLY through the
    // container AND through the URL connection — proves the database the
    // URL addresses is not only on this instance but was provisioned by
    // THIS harness run
    if (expectedRunNonce) {
      const containerNonce = containerPsql(container, user, database, `SELECT run_nonce FROM ${OWNER_MARKER_TABLE} LIMIT 1`);
      assert.equal(containerNonce.status, 0, `ownership marker missing/unreadable through the container: ${(containerNonce.stderr || '').slice(0, 160)}`);
      assert.equal(containerNonce.stdout.trim(), expectedRunNonce, 'container ownership mismatch: marker nonce does not belong to this run');
      const urlNonce = await withUrlClient((c) => c.query(`SELECT run_nonce FROM ${OWNER_MARKER_TABLE} LIMIT 1`).then((r) => r.rows[0]));
      assert.equal(String(urlNonce?.run_nonce ?? ''), expectedRunNonce, 'URL ownership mismatch: the URL addresses a database not provisioned by this run');
    }
    return { database, container, server_version: urlVersion };
  })();
}
