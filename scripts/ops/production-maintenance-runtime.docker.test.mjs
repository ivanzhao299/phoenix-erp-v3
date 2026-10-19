/** Explicit isolated Docker fixtures; no production discovery, no removals.
 * Resource manifest is retained for the coordinating root's verified cleanup. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync, fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { validateStoppedSamples, validateDatabaseQuiescence, validateExecutorInventory, evaluateLegacyReconciliation, LEGACY_DOMAINS, DockerNetworkIsolationProducer } from './production-maintenance-runtime.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { TERMINATION_POLICY_SCHEMA } from './production-maintenance-termination-policy.mjs';
import { MAINTENANCE_OPERATIONS } from './production-maintenance-transition.mjs';

const enabled = process.env.MAINTENANCE_DOCKER_FIXTURE === '1';
const manifestPath = process.env.MAINTENANCE_FIXTURE_MANIFEST;
const owner = `legacy-maintenance-${randomUUID()}`;
const resources = [];
const docker = (args, { timeoutMs = 30000 } = {}) => execFileSync('/usr/bin/docker', ['--host','unix:///var/run/docker.sock',...args], { encoding: 'utf8', env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs }).trim();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const revision = 'a'.repeat(40);
function record(id, role, type = 'container') {
  assert.match(id, /^[a-f0-9]{64}$/);
  resources.push({ id, role, type, owner, label: 'phoenix.test.kind=legacy-maintenance' });
  fs.writeFileSync(manifestPath, JSON.stringify({ schema: 'phoenix.isolated-maintenance-resources/v1', owner, createdAt: new Date().toISOString(), resources, cleanupExecuted: false }, null, 2), { mode: 0o600 });
}
function owned(id) {
  assert.match(id, /^[a-f0-9]{64}$/);
  const labels = JSON.parse(docker(['inspect', id, '--format', '{{json .Config.Labels}}']));
  assert.equal(labels['phoenix.test.owner'], owner); assert.equal(labels['phoenix.test.kind'], 'legacy-maintenance');
}
function inspect(id) {
  owned(id);
  const [imageId, state, restartCount] = docker(['inspect', id, '--format', '{{json .Image}}\t{{json .State}}\t{{json .RestartCount}}']).split('\t').map(JSON.parse);
  return { id, imageId, revision, startedAt: state.StartedAt, restartCount, running: state.Running, pid: state.Pid, status: state.Status,
    restarting: state.Restarting, dead: state.Dead, exitCode: state.ExitCode, oomKilled: state.OOMKilled, checkedAt: new Date().toISOString() };
}
function sql(id, statement) {
  owned(id);
  return docker(['exec', id, 'psql', '-U', 'maintenance_fixture', '-d', 'maintenance_fixture', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', statement]);
}
async function pg(major) {
  const id = docker(['run', '-d', '--pull=never', '--label', 'phoenix.test.kind=legacy-maintenance', '--label', `phoenix.test.owner=${owner}`, '--label', `phoenix.test.role=pg${major}`,
    '--restart=no', '--tmpfs', major >= 18 ? '/var/lib/postgresql:rw' : '/var/lib/postgresql/data:rw', '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=isolated-maintenance-test-only', '-e', 'POSTGRES_USER=maintenance_fixture', '-e', 'POSTGRES_DB=maintenance_fixture', `postgres:${major}-alpine`, '-c', 'max_prepared_transactions=5']);
  record(id, `pg${major}`); owned(id);
  const ports = JSON.parse(docker(['inspect', id, '--format', '{{json .NetworkSettings.Ports}}']));
  assert.equal(ports['5432/tcp'].length, 1); assert.equal(ports['5432/tcp'][0].HostIp, '127.0.0.1');
  const deadline = Date.now() + 30000;
  for (;;) { try { if (sql(id, 'SELECT 1') === '1') break; } catch {} if (Date.now() > deadline) throw new Error('owned fixture startup timeout'); await wait(100); }
  assert.equal(Math.floor(Number(sql(id, "SELECT current_setting('server_version_num')")) / 10000), major);
  sql(id, 'CREATE TABLE fixture_delivery_receipts(id integer PRIMARY KEY); CREATE TABLE fixture_iot_commits(id integer PRIMARY KEY); CREATE TABLE fixture_jobs(id integer PRIMARY KEY,status text NOT NULL);');
  return id;
}
function child(mode, id, endpoint = '') {
  return fork(new URL('./production-maintenance-runtime.fixture.mjs', import.meta.url), [mode, id, endpoint], {
    execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { PATH: process.env.PATH, MAINTENANCE_OWNED_FIXTURE: '1', MAINTENANCE_FIXTURE_OWNER: owner } });
}
async function milestone(worker, event) {
  let timer;
  try { const message = await Promise.race([once(worker, 'message').then(([m]) => m), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('fixture child milestone timeout')), 15000); })]); assert.equal(message.event, event); }
  finally { clearTimeout(timer); }
}
function baseDatabase() { return { ownershipComplete: true, remainingConnections: 0, openTransactions: 0, preparedTransactions: 0, persistentRunning: 0, persistentQueued: 0 }; }
const domains = () => LEGACY_DOMAINS.map(domain => ({ domain, disposition: 'RECONCILED', unknownEffects: 0, pendingWrites: 0, requiresReplay: false, requiresBusinessMutation: false }));

test('actual isolated Docker legacy transition, crashes and residual work PG16 + PG18', { skip: !enabled, timeout: 180000 }, async t => {
  assert.ok(typeof manifestPath === 'string' && path.isAbsolute(manifestPath) && (manifestPath.startsWith('/tmp/') || manifestPath.includes('/artifacts/')), 'explicit isolated resource manifest required');
  assert.equal(fs.existsSync(manifestPath), false, 'never overwrite another resource manifest');
  fs.writeFileSync(manifestPath, JSON.stringify({ schema: 'phoenix.isolated-maintenance-resources/v1', owner, createdAt: new Date().toISOString(), resources: [], cleanupExecuted: false }, null, 2), { mode: 0o600, flag: 'wx' });
  for (const major of [16, 18]) {
    const id = await pg(major);
    await t.test(`PG${major}: process crash after external send cannot prove notification non-delivery`, async () => {
      let externalReceipts = 0;
      const server = http.createServer((req, res) => { req.resume(); req.on('end', () => { externalReceipts++; res.end('accepted'); }); });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const worker = child('send-before-log', id, `http://127.0.0.1:${server.address().port}/notify`);
      try {
        await milestone(worker, 'external-send-complete'); const exited = once(worker, 'exit'); worker.kill('SIGKILL'); await exited;
        assert.equal(externalReceipts, 1); assert.equal(sql(id, 'SELECT count(*) FROM fixture_delivery_receipts'), '0');
        const evidence = domains(); evidence[0].disposition = 'UNKNOWN'; evidence[0].unknownEffects = 1;
        assert.equal(evaluateLegacyReconciliation(evidence).result, 'HOLD');
        assert.equal(evaluateLegacyReconciliation(evidence).legacyDrainResult, 'UNSUPPORTED');
      } finally { worker.kill('SIGKILL'); await new Promise(resolve => server.close(resolve)); }
    });
    await t.test(`PG${major}: child crash leaves first IoT commit and cannot imply whole-job rollback`, async () => {
      const worker = child('partial-iot', id);
      try {
        await milestone(worker, 'first-commit-complete'); const exited = once(worker, 'exit'); worker.kill('SIGKILL'); await exited;
        assert.equal(sql(id, 'SELECT string_agg(id::text,\',\' ORDER BY id) FROM fixture_iot_commits'), '1');
        const evidence = domains(); evidence[1].disposition = 'UNKNOWN'; evidence[1].unknownEffects = 1;
        assert.equal(evaluateLegacyReconciliation(evidence).result, 'HOLD');
      } finally { worker.kill('SIGKILL'); }
    });
    await t.test(`PG${major}: prepared transaction survives API session loss and blocks transition`, () => {
      sql(id, "BEGIN; INSERT INTO fixture_iot_commits(id) VALUES (3); PREPARE TRANSACTION 'maintenance_owned_prepared';");
      const count = Number(sql(id, "SELECT count(*) FROM pg_prepared_xacts WHERE database=current_database()"));
      assert.equal(count, 1); assert.throws(() => validateDatabaseQuiescence({ ...baseDatabase(), preparedTransactions: count }), /DATABASE_OR_PERSISTENT_WORK_REMAINS/);
      sql(id, "ROLLBACK PREPARED 'maintenance_owned_prepared';");
    });
    await t.test(`PG${major}: actual residual client transaction blocks stop certification`, async () => {
      owned(id);
      const worker = spawn('/usr/bin/docker', ['--host','unix:///var/run/docker.sock','exec', id, 'psql', '-U', 'maintenance_fixture', '-d', 'maintenance_fixture', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c',
        "SET application_name='maintenance-fixture-residual'; BEGIN; SELECT pg_sleep(3); ROLLBACK;"], { env: { PATH: process.env.PATH }, stdio: 'ignore' });
      const done = once(worker, 'exit');
      const deadline = Date.now() + 2000; let counts;
      do {
        counts = sql(id, "SELECT count(*)||','||count(*) FILTER (WHERE xact_start IS NOT NULL) FROM pg_stat_activity WHERE application_name='maintenance-fixture-residual' AND datname=current_database()").split(',').map(Number);
        if (counts[0] > 0) break;
        assert.ok(Date.now() < deadline, 'fixture transaction admission timeout'); await wait(30);
      } while (true);
      assert.deepEqual(counts, [1, 1]);
      assert.throws(() => validateDatabaseQuiescence({ ...baseDatabase(), remainingConnections: counts[0], openTransactions: counts[1] }), /DATABASE_OR_PERSISTENT_WORK_REMAINS/);
      assert.equal((await done)[0], 0);
    });
    await t.test(`PG${major}: persistent queued task blocks even with zero in-flight sessions`, () => {
      sql(id, "INSERT INTO fixture_jobs VALUES (1,'QUEUED');");
      const count = Number(sql(id, "SELECT count(*) FROM fixture_jobs WHERE status='QUEUED'"));
      assert.equal(count, 1); assert.throws(() => validateDatabaseQuiescence({ ...baseDatabase(), persistentQueued: count }), /DATABASE_OR_PERSISTENT_WORK_REMAINS/);
    });
  }
  await t.test('actual retained executor stop is verified, revival and missed worker rejected', async () => {
    const id = docker(['run', '-d', '--pull=never', '--label', 'phoenix.test.kind=legacy-maintenance', '--label', `phoenix.test.owner=${owner}`, '--label', 'phoenix.test.role=old-executor', '--restart=no', 'alpine:3.23', 'sleep', '600']);
    record(id, 'old-executor'); const before = inspect(id); assert.equal(before.running, true);
    owned(id); docker(['stop', '--time', '1', id]); const first = inspect(id); await wait(1100); const second = inspect(id);
    assert.equal(validateStoppedSamples(before, first, second).revives, false);
    owned(id); docker(['start', id]); const revived = inspect(id);
    assert.throws(() => validateStoppedSamples(before, first, revived), /STOPPED_RUNTIME_IDENTITY_CHANGED|OLD_EXECUTOR_NOT_STOPPED/);
    assert.throws(() => validateExecutorInventory({ dockerExecutorIds: [], allDockerIds: [id], classifiedNonExecutorIds: [], hostInventoryComplete: true, unaccountedExecutors: 0 }, [before]), /UNACCOUNTED_EXECUTOR/);
    owned(id); docker(['stop', '--time', '1', id]);
  });
  await t.test('actual bridge isolation blocks published HTTP and an established stream while retaining Web/DB', async () => {
    const networkName = `maintenance-fixture-${randomUUID()}`;
    const networkId = docker(['network', 'create', '--driver', 'bridge', '--label', 'phoenix.test.kind=legacy-maintenance', '--label', `phoenix.test.owner=${owner}`, networkName]);
    record(networkId, 'isolated-bridge', 'network');
    const code = "const http=require('http');process.on('SIGTERM',()=>process.exit(0));http.createServer((q,s)=>{if(q.url==='/stream'){s.writeHead(200);s.write('begin\\n');const t=setInterval(()=>s.write('tick\\n'),50);q.on('close',()=>clearInterval(t))}else{s.end('healthy')}}).listen(3100,'0.0.0.0')";
    const id = docker(['run', '-d', '--pull=never', '--label', 'phoenix.test.kind=legacy-maintenance', '--label', `phoenix.test.owner=${owner}`, '--label', 'phoenix.test.role=api-stream',
      '--network', networkId, '--restart=always', '-p', '127.0.0.1::3100', '--health-cmd', "node -e \"fetch('http://127.0.0.1:3100/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"", '--health-interval', '1s', '--health-timeout', '1s', 'node:20-alpine', 'node', '-e', code]);
    record(id, 'api-stream'); owned(id);
    const deadline = Date.now() + 15000;
    while (docker(['inspect', id, '--format', '{{.State.Health.Status}}']) !== 'healthy') { if (Date.now() > deadline) throw new Error('HTTP fixture health timeout'); await wait(100); }
    const portInfo = JSON.parse(docker(['inspect', id, '--format', '{{json .NetworkSettings.Ports}}']))['3100/tcp'];
    assert.equal(portInfo.length, 1); assert.equal(portInfo[0].HostIp, '127.0.0.1');
    const endpoint = `http://127.0.0.1:${portInfo[0].HostPort}`;
    assert.equal((await fetch(endpoint, { signal: AbortSignal.timeout(1500) })).status, 200);
    const before = { ...inspect(id), running: true, health: 'healthy' };
    const pgPins = resources.filter(r => r.role.startsWith('pg')).map(r => inspect(r.id));
    const webId = docker(['run', '-d', '--pull=never', '--label', 'phoenix.test.kind=legacy-maintenance', '--label', `phoenix.test.owner=${owner}`, '--label', 'phoenix.test.role=web',
      '--restart=no', '-p', '127.0.0.1::3000', '--health-cmd', "node -e \"fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"", '--health-interval', '1s', '--health-timeout', '1s',
      'node:20-alpine', 'node', '-e', "require('http').createServer((q,s)=>s.end('web fixture')).listen(3000,'0.0.0.0')"]);
    record(webId, 'web'); owned(webId);
    const webDeadline = Date.now() + 15000;
    while (docker(['inspect', webId, '--format', '{{.State.Health.Status}}']) !== 'healthy') { if (Date.now() > webDeadline) throw new Error('Web fixture health timeout'); await wait(100); }
    const webPortInfo = JSON.parse(docker(['inspect', webId, '--format', '{{json .NetworkSettings.Ports}}']))['3000/tcp'];
    assert.equal(webPortInfo.length, 1); assert.equal(webPortInfo[0].HostIp, '127.0.0.1');
    const webEndpoint = `http://127.0.0.1:${webPortInfo[0].HostPort}`;
    assert.equal((await fetch(webEndpoint, { signal: AbortSignal.timeout(1500) })).status, 200);
    const now = Date.now(), preWeb = { ...inspect(webId), revision: 'c'.repeat(40), health: 'healthy' };
    const context = { schema: 'phoenix.legacy-maintenance-context/v1', protocolVersion: 1, owner: '12345-1', previousFloorSha: revision, previousApiSha: revision,
      previousWebSha: preWeb.revision, targetSha: 'b'.repeat(40), window: { start: new Date(now - 1000).toISOString(), end: new Date(now + 120000).toISOString() },
      candidate: { revision: 'b'.repeat(40), imageId: before.imageId }, sourceHelperSha256: '1'.repeat(64), schemaEvidenceSha256: '2'.repeat(64), migrationPaths: [],
      preSnapshot: { api: before, web: preWeb, db: { ...pgPins[0], health: 'healthy', mountsSha256: '3'.repeat(64) } }, executors: [before],
      networkIsolation: { networks: [{ id: networkId, name: networkName, driver: 'bridge' }], approvedMounts: [] } };
    context.terminationPolicy={schema:TERMINATION_POLICY_SCHEMA,protocol:'STOP_AND_RECONCILE',owner:context.owner,targetSha:context.targetSha,window:context.window,
      executors:[Object.fromEntries(['id','imageId','revision','startedAt','restartCount'].map(k=>[k,before[k]]))],method:'DOCKER_STOP',stopSignal:'SIGTERM',timeoutSeconds:30,
      timeoutEscalation:'DOCKER_SIGKILL',commandTimeoutMs:35000,maxAttempts:1,recoveryOperator:'isolated-fixture-operator'};
    const infrastructureEvidence = { body: { hostInventoryComplete: true, orchestratorsDisabled: true, unknownHostExecutors: 0, swarmActive: false, watchtowerPresent: false,
      classifiedNonExecutorIds: resources.filter(r => r.type === 'container' && r.id !== id).map(r => r.id) } };
    // The fixture's universe is this explicitly owned capsule. Production uses
    // real all-host ps plus independently verified host inventory, never this adapter.
    const capsuleRun = (args, options) => args[0] === 'ps' ? resources.filter(r => r.type === 'container').map(r => r.id).join('\n') : docker(args, options);
    const intents = [];
    const producer = new DockerNetworkIsolationProducer({ context, approval: { fixtureOnly: true,purpose:'MAINTENANCE',payload:{protocol:'STOP_AND_RECONCILE',operations:MAINTENANCE_OPERATIONS,terminationPolicySha256:canonicalDigest(context.terminationPolicy)} }, infrastructureEvidence,
      store: { directory: '/fixture-only', immutable: (file, value) => { assert.equal(intents.some(i=>i.file===file),false); intents.push({ file, value:structuredClone(value) }); },
        read:file=>structuredClone(intents.find(i=>i.file===file)?.value) },
      authority: { verifyAuthority: async () => true, verifyInfrastructure: async () => true } }, { guard: () => {}, run: capsuleRun });
    const streamAbort = new AbortController();
    const stream = await fetch(endpoint + '/stream', { signal: streamAbort.signal });
    const reader = stream.body.getReader(); assert.ok((await reader.read()).value.length > 0);
    const receipt = await producer.fenceIngress();
    assert.equal(intents.length, 1); assert.equal(receipt.body.state, 'FROZEN'); assert.equal(receipt.body.businessEffects, 'UNKNOWN_REQUIRES_STOP_AND_RECONCILE');
    await assert.rejects(fetch(endpoint, { signal: AbortSignal.timeout(1000) }));
    // Drain packets already buffered before detach, then demand a real quiet
    // read interval. An application AbortSignal alone must not count as proof
    // that an established TCP stream stopped delivering after network detach.
    let quietOrClosed = false;
    const streamDeadline = Date.now() + 3000;
    while (Date.now() < streamDeadline) {
      const next = reader.read().then(value => ({ value }), () => ({ closed: true }));
      const sample = await Promise.race([next, wait(300).then(() => ({ quiet: true }))]);
      if (sample.quiet || sample.closed || sample.value?.done) { quietOrClosed = true; break; }
    }
    assert.equal(quietOrClosed, true, 'existing stream kept delivering after the only endpoint was removed');
    streamAbort.abort();
    await producer.observeIngress();
    const isolated = producer.inspect(id); assert.equal(isolated.attached.length, 0); assert.equal(isolated.restartPolicy, 'no');
    const first = await producer.stop(id); await wait(1100); const second = producer.inspect(id);
    assert.equal(intents.length,2);assert.equal(intents[1].value.terminationPolicySha256,canonicalDigest(context.terminationPolicy));
    assert.equal(first.terminationObservation,'NOT_COLLECTED');assert.equal(first.legacyDrainResult,'UNSUPPORTED');
    assert.equal(validateStoppedSamples(before, first, second).revives, false);
    for (let index = 0; index < pgPins.length; index++) {
      const actual = inspect(pgPins[index].id);
      for (const key of ['id', 'imageId', 'startedAt', 'restartCount', 'running']) assert.equal(actual[key], pgPins[index][key]);
    }
    const postWeb = inspect(webId);
    for (const key of ['id', 'imageId', 'startedAt', 'restartCount', 'running']) assert.equal(postWeb[key], preWeb[key]);
    assert.equal((await fetch(webEndpoint, { signal: AbortSignal.timeout(1500) })).status, 200);
    // A privileged external actor reconnecting the retained old container is
    // detected; no automatic re-isolation/rollback/restart is attempted.
    docker(['network', 'connect', networkId, id]);
    await assert.rejects(producer.observeIngress(), /NETWORK_ISOLATION_LOST|UNKNOWN_EXECUTOR_NETWORK/);
  });
});
