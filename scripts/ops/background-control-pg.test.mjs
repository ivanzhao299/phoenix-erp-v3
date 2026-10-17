/** Explicit opt-in; owns only fence_coordinator_test on known loopback fixtures.
 * Does not read .env, production credentials, Docker production containers, or
 * use the core worker's fence_test database/advisory locks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { BackgroundManifestPublisher } from './background-control-manifest.mjs';
import { BackgroundFenceCoordinator } from './background-control-coordinator.mjs';
const enabled = process.env.BACKGROUND_COORDINATOR_PG_FIXTURE === '1';
const fixtureMajor = process.env.BACKGROUND_COORDINATOR_PG_MAJOR;
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const pgPath = enabled ? requireApi.resolve('pg') : null;
const Client = enabled ? requireApi('pg').Client : null;
const old = 'a'.repeat(40), target = 'b'.repeat(40);
const binding = { owner: '12345-1', previousFloorSha: old, targetSha: target };
const participant = { bootId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', containerId: '1'.repeat(64), revision: old, allowedKinds: ['LOCAL'] };
const options = port => ({ host: '127.0.0.1', port, user: 'fence_fixture', database: 'fence_coordinator_test', connectionTimeoutMillis: 3000 });
async function fixture(port) {
  const admin = new Client({ ...options(port), database: 'fence_test' }); await admin.connect();
  try { const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname='fence_coordinator_test'"); if (!exists.rowCount) await admin.query('CREATE DATABASE fence_coordinator_test'); }
  finally { await admin.end(); }
  const client = new Client(options(port)); await client.connect(); let connected = true;
  client.on('error', () => { connected = false; }); client.on('end', () => { connected = false; });
  const session = { connected: () => connected, tryLock: async key => (await client.query('SELECT pg_try_advisory_lock(17455,$1) AS locked', [key])).rows[0].locked,
    unlock: async key => (await client.query('SELECT pg_advisory_unlock(17455,$1) AS unlocked', [key])).rows[0].unlocked,
    ping: async () => { await client.query('SELECT 1'); return true; },
    verifyParticipants: async participants => {
      for (const p of participants) {
        const result = await client.query("SELECT count(*)=1 AND coalesce(bool_and(pid=$1 AND datid=$2 AND floor(extract(epoch from backend_start)*1000)::bigint=$3 AND datid=(SELECT oid FROM pg_database WHERE datname=current_database())),false) AS verified FROM pg_stat_activity WHERE application_name=$4", [p.sessionPid, p.databaseOid, Date.parse(p.backendStartedAt), 'phoenix-fence:'+p.bootId]);
        if (result.rows[0].verified !== true) return false;
      }
      return true;
    }, close: async () => { connected = false; await client.end(); } };
  let record = null, manifest = null, active = 1, missing = false;
  let controlIdentity = (await client.query('SELECT pg_backend_pid() AS pid, (SELECT oid::int FROM pg_database WHERE datname=current_database()) AS oid, backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()')).rows[0];
  const publisher = new BackgroundManifestPublisher({}, { guard: () => {}, inspect: () => ({}), readPrivate: () => record, readPublic: () => manifest,
    writePrivate: value => { record = value; }, writePublic: value => { manifest = value; } });
  const coordinator = new BackgroundFenceCoordinator({ binding, participants: [participant], project: 'phoenix', timeoutMs: 2000, pollMs: 10 }, {
    publisher, session, inventory: () => missing ? [] : [participant.containerId], verifySuccess: async () => true,
    inspectParticipant: async () => ({ containerId: participant.containerId, revision: old, startedAt: new Date().toISOString(), restartCount: 0,
      status: { protocolVersion: 1, bootId: participant.bootId, phase: manifest?.phase || 'HOLD', owner: manifest?.owner || null, generation: manifest?.generation || null,
        inFlight: active, pendingChildren: 0, taskGraphs: active, poisoned: false, stopping: false, controlSession: { connected: true, broken: false, sessionPid: controlIdentity.pid, databaseOid: controlIdentity.oid, backendStartedAt: controlIdentity.backend_start.toISOString() } } }),
  });
  return { coordinator, session, publisher, get manifest() { return manifest; }, identity: value => { controlIdentity = value; }, zero: () => { active = 0; }, missing: () => { missing = true; } };
}
async function worker(port) {
  const source = `const{Client}=require(${JSON.stringify(pgPath)});(async()=>{const c=new Client(${JSON.stringify({...options(port), application_name: 'phoenix-fence:'+participant.bootId})});await c.connect();await c.query('SELECT pg_advisory_lock_shared(17455,2)');const identity=(await c.query('SELECT pg_backend_pid() AS pid, (SELECT oid::int FROM pg_database WHERE datname=current_database()) AS oid, backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()')).rows[0];process.send({event:'locked',identity});process.on('message',async m=>{if(m==='release'){await c.query('SELECT pg_advisory_unlock_shared(17455,2)');process.send({event:'released'})}})})().catch(()=>process.exit(2));`;
  const child = fork('-e', [source], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { PATH: process.env.PATH } });
  const [message] = await once(child, 'message'); assert.equal(message.event, 'locked'); child.backgroundIdentity={...message.identity,backend_start:new Date(message.identity.backend_start)}; return child;
}
const until = async predicate => { const deadline = Date.now() + 1500; while (!predicate()) { if (Date.now() > deadline) throw new Error('fixture wait timeout'); await new Promise(resolve => setTimeout(resolve, 5)); } };
for (const [label, port] of [['PG16', 56416], ['PG18', 56418]]) {
  test(`${label}: real multi-process execution session must drain while coordinator admission gate blocks new work`, { skip: !enabled || Boolean(fixtureMajor && label !== 'PG'+fixtureMajor) }, async () => {
    const f = await fixture(port); const child = await worker(port); f.identity(child.backgroundIdentity); let settled = false;
    const result = f.coordinator.fenceAndDrain().then(value => { settled = true; return value; });
    const peer = new Client(options(port)); await peer.connect();
    try {
      await until(() => f.manifest?.phase === 'FENCED');
      let denied = false;
      for (let i = 0; i < 100; i++) {
        const row = (await peer.query('SELECT pg_try_advisory_lock_shared(17455,1) AS granted')).rows[0];
        if (!row.granted) { denied = true; break; }
        await peer.query('SELECT pg_advisory_unlock_shared(17455,1)'); await new Promise(resolve => setTimeout(resolve, 5));
      }
      assert.equal(denied, true); assert.equal(settled, false);
      f.zero(); const released = once(child, 'message'); child.send('release'); await released;
      assert.equal((await result).outcome, 'DRAINED'); assert.equal(f.manifest.phase, 'FENCED');
      assert.equal((await peer.query('SELECT pg_try_advisory_lock_shared(17455,1) AS granted')).rows[0].granted, false);
      await f.coordinator.close();
      assert.equal((await peer.query('SELECT pg_try_advisory_lock_shared(17455,1) AS granted')).rows[0].granted, true);
      await peer.query('SELECT pg_advisory_unlock_shared(17455,1)');
    } finally { child.kill(); await f.coordinator.close(); await peer.end(); }
  });
  test(`${label}: crashed execution process dropping PostgreSQL lock never certifies quiescence`, { skip: !enabled || Boolean(fixtureMajor && label !== 'PG'+fixtureMajor) }, async () => {
    const f = await fixture(port); const child = await worker(port); f.identity(child.backgroundIdentity);
    const result = f.coordinator.fenceAndDrain();
    // Attach assertion before injecting failure, avoiding an unhandled rejection.
    const rejected = assert.rejects(result, /EXECUTOR_INVENTORY_CHANGED|PARTICIPANT_DATABASE_IDENTITY/);
    try {
      await until(() => f.manifest?.phase === 'FENCED'); f.missing(); child.kill('SIGKILL');
      await rejected; assert.equal(f.manifest.phase, 'FENCED'); assert.equal(f.session.connected(), false);
    } finally { child.kill(); await f.coordinator.close(); }
  });
}

for (const [label, port] of [['PG16', 56416], ['PG18', 56418]]) {
  test(`${label}: wrong database, reused PID, or duplicate boot application name rejects before FENCED publication`, { skip: !enabled || Boolean(fixtureMajor && label !== 'PG'+fixtureMajor) }, async () => {
    for (const scenario of ['WRONG_DATABASE', 'REUSED_PID', 'DUPLICATE_BOOT']) {
      const f = await fixture(port); const peers = [];
      try {
        const api = new Client({ ...options(port), database: scenario === 'WRONG_DATABASE' ? 'fence_test' : 'fence_coordinator_test', application_name: 'phoenix-fence:'+participant.bootId });
        peers.push(api); await api.connect();
        const identity = (await api.query('SELECT pg_backend_pid() AS pid, (SELECT oid::int FROM pg_database WHERE datname=current_database()) AS oid, backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()')).rows[0];
        if (scenario === 'REUSED_PID') identity.pid += 100000;
        if (scenario === 'DUPLICATE_BOOT') { const duplicate = new Client({ ...options(port), application_name: 'phoenix-fence:'+participant.bootId }); peers.push(duplicate); await duplicate.connect(); }
        f.identity(identity); f.zero();
        await assert.rejects(f.coordinator.fenceAndDrain(), /PARTICIPANT_DATABASE_IDENTITY/); assert.equal(f.manifest, null);
      } finally { await f.coordinator.close(); for (const peer of peers) await peer.end(); }
    }
  });
}
test('PG18 root cluster rejects an otherwise valid PG16 API control session before publication', {
  skip: !enabled || process.env.BACKGROUND_COORDINATOR_CROSS_CLUSTER_FIXTURE !== '1',
}, async () => {
  const f = await fixture(56418); const api = new Client({ ...options(56416), application_name: 'phoenix-fence:'+participant.bootId });
  try {
    await api.connect();
    const identity = (await api.query('SELECT pg_backend_pid() AS pid, (SELECT oid::int FROM pg_database WHERE datname=current_database()) AS oid, backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()')).rows[0];
    f.identity(identity); f.zero();
    await assert.rejects(f.coordinator.fenceAndDrain(), /PARTICIPANT_DATABASE_IDENTITY/); assert.equal(f.manifest, null);
  } finally { await f.coordinator.close(); await api.end(); }
});
