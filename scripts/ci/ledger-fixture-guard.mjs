// R4.2d shared guard for the ledger collection fixtures (single source —
// BOTH fixture suites, and any future one, must run this BEFORE any
// destructive operation):
//   identity  — the fixture URL is loopback-only
//   name      — the database is in the dedicated disposable namespace
//               (^ledger_collect_)
//   ownership — the database EXISTS on the specified container (the URL and
//               the container are the SAME instance: both views must report
//               the identical server identity)
// Nothing here connects for writes, drops, or creates — the guard only
// verifies identity and instance ownership up front.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const DEDICATED_NAMESPACE = /^ledger_collect_/;

export function assertDedicatedLedgerFixture({ fixtureUrl, container, client } = {}) {
  const parsed = new URL(fixtureUrl);
  // identity: loopback only
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname), `isolated loopback fixture required, got host: ${parsed.hostname}`);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  const user = decodeURIComponent(parsed.username || 'postgres');
  // name: the dedicated disposable namespace — never a real database
  assert.match(database, DEDICATED_NAMESPACE, `dedicated disposable database required (namespace ${DEDICATED_NAMESPACE}), got: ${database}`);
  assert.ok(container, 'fixture DB container required for the real-psql transport');
  // ownership: the database must exist ON the specified container, and the
  // URL view and the container view must report the identical server
  // identity — a URL that points at a different instance than the container
  // is refused here, before anything destructive runs
  const onContainer = spawnSync('docker', ['exec', container, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', 'postgres', '-c', `SELECT 1 FROM pg_database WHERE datname = '${database}'`], { encoding: 'utf8' });
  assert.equal(onContainer.status, 0, `container instance unreachable (${container}): ${onContainer.stderr}`);
  assert.equal(onContainer.stdout.trim(), '1', `database ${database} does not exist on container ${container} — URL/container instance mismatch`);
  if (client) {
    // `client` is an already-connected pg Client over the fixture URL; both
    // views must agree on the server identity
    return client.query('SHOW server_version').then((res) => {
      const urlVersion = res.rows[0].server_version;
      const containerVersion = spawnSync('docker', ['exec', container, 'psql', '-X', '-At', '-U', user, '-d', 'postgres', '-c', 'SHOW server_version'], { encoding: 'utf8' }).stdout.trim();
      assert.equal(urlVersion.split(' ').pop(), containerVersion.split(' ').pop(), `URL and container report different servers: ${urlVersion} vs ${containerVersion}`);
      return { database, container, server_version: urlVersion };
    });
  }
  return { database, container };
}
