/** Explicit local fixture. Real application background-control components,
 * PostgreSQL and Compose; Web is a health peer, not a full ERP/UI acceptance.
 * Private/root filesystem and formal production evidence are owned adapters.
 * Never reads .env, production state, credentials or a registry. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BackgroundManifestPublisher } from '../ops/background-control-manifest.mjs';
import { BackgroundFenceCoordinator, assertReanchorPromotion, completedDeploymentEvidenceBinding } from '../ops/background-control-coordinator.mjs';
import { executeFencedDeployment } from '../ops/background-deployment-session.mjs';
import { assertReanchorAbortRuntime } from '../ops/reconcile-background-control.mjs';
import { beginState } from '../ops/production-deployment-state.mjs';
import { captureSnapshot, compareSnapshots } from '../ops/production-deployment-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
assert.equal(process.env.FLOCK_REANCHOR_COMPOSE_FIXTURE, '1', 'explicit owned fixture opt-in required');
assert.equal(process.versions.node.split('.')[0], '20');
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const { Client } = requireApi('pg');
const F = 'e'.repeat(40), R = 'a'.repeat(40), T = 'b'.repeat(40);
const owner = `reanchor-${randomUUID()}`, project = `phoenix-${owner}`;
const directory = fs.mkdtempSync(path.join(root, 'artifacts/flock-lifecycle-supervision-20261117/reanchor-compose-'));
const dbName = 'fence_reanchor_compose_test';
const ports = { api: 3372, web: 3373 };
const pgOptions = { host: '127.0.0.1', port: 56418, user: 'fence_fixture', database: dbName, connectionTimeoutMillis: 3000 };
const exec = (program, args, options = {}) => execFileSync(program, args, { encoding: 'utf8', timeout: 30000,
  maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
const docker = (args, options) => exec('/usr/bin/docker', args, options);
const json = file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
const write = (file, value) => fs.writeFileSync(path.join(directory, file), JSON.stringify(value), { mode: 0o600 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { fixtureOnly: true, productionReceipt: false, scope: 'REAL_BACKGROUND_COMPONENTS_PG_COMPOSE_WEB_HEALTH_PEER',
  formalProductionRootAndEvidence: 'OWNED_ADAPTERS_ONLY', owner, project, directory, scenarios: [] };
const resources = { containers: [], images: [], volumes: [] };
const persist = () => { write('report.json', report); write('resources.json', resources); };
const labels = { 'phoenix.test.owner': owner, 'phoenix.test.kind': 'flock-reanchor-compose' };
const assertOwned = id => assert.equal(JSON.parse(docker(['inspect', id, '--format', '{{json .Config.Labels}}']))['phoenix.test.owner'], owner);
const inspect = service => {
  const id = docker(['ps', '--no-trunc', '--filter', `label=com.docker.compose.project=${project}`, '--filter', `label=com.docker.compose.service=${service}`, '-q']);
  assert.match(id, /^[a-f0-9]{64}$/); assertOwned(id);
  const m = JSON.parse(docker(['inspect', id, '--format', '{{json .}}']));
  return { id, imageId: m.Image, revision: m.Config.Labels['org.opencontainers.image.revision'], health: m.State.Health?.Status,
    running: m.State.Running, startedAt: m.State.StartedAt, restartCount: m.RestartCount };
};
const runtime = () => Object.fromEntries(['api', 'web'].map(service => { const m = inspect(service); return [service, { imageId: m.imageId, revision: m.revision }]; }));
const compose = args => {
  docker(['compose', '-p', project, '-f', path.join(directory, 'compose.json'), ...args], {
    env: { PATH: process.env.PATH, API_IMAGE: `${project}:${report.apiTarget ? 'target' : 'old'}`, WEB_IMAGE: report.webImageOverride || `${project}:${report.webTarget ? 'target' : 'old'}` }, timeout: 60000 });
};
function ownedEvidenceDocker(args) {
  const actual = [...args];
  if (actual[0] === 'inspect') {
    const roles = { 'phoenix-v3-api': 'api', 'phoenix-v3-web': 'web' };
    if (roles[actual[1]]) actual[1] = inspect(roles[actual[1]]).id;
    else if (actual[1] === 'phoenix-v3-db') actual[1] = report.databaseContainer;
    else throw Error('OWNED_EVIDENCE_CONTAINER_ROUTE');
  } else if (actual[0] === 'image' && actual[1] === 'inspect') {
    const allowed = [...resources.images, docker(['inspect', report.databaseContainer, '--format', '{{.Image}}'])];
    assert.ok(allowed.includes(actual[2]), 'only explicitly owned service images may be inspected');
  } else throw Error('OWNED_EVIDENCE_COMMAND_ROUTE');
  return docker(actual);
}
const snapshot = (phase, mode, runId) => captureSnapshot({ phase, deployMode: mode, runId, runAttempt: 1, targetSha: T, floorSha: T }, ownedEvidenceDocker);
async function status() {
  const response = await fetch(`http://127.0.0.1:${ports.api}/api/internal/background/status`, { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200); return response.json();
}
async function healthy(service) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { try { const m = inspect(service); if (m.health === 'healthy') return m; } catch {} await wait(100); }
  throw Error('OWNED_FIXTURE_HEALTH_TIMEOUT');
}
let controller, volume, publicValue;
function publish(value) {
  const source = "const fs=require('fs');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{JSON.parse(s);fs.writeFileSync('/control/next.json',s,{mode:0o444});fs.renameSync('/control/next.json','/control/manifest.json')})";
  docker(['exec', '-i', controller, 'node', '-e', source], { input: JSON.stringify(value), stdio: ['pipe', 'pipe', 'pipe'] });
  publicValue = JSON.parse(JSON.stringify(value));
}
async function makeSession() {
  const client = new Client(pgOptions); await client.connect(); let connected = true;
  client.on('end', () => { connected = false; }); client.on('error', () => { connected = false; });
  return { connected: () => connected,
    tryLock: async key => (await client.query('SELECT pg_try_advisory_lock(17455,$1) AS ok', [key])).rows[0].ok,
    unlock: async key => (await client.query('SELECT pg_advisory_unlock(17455,$1) AS ok', [key])).rows[0].ok,
    ping: async () => { await client.query('SELECT true'); return true; },
    verifyParticipants: async participants => {
      for (const p of participants) {
        const result = await client.query("SELECT count(*)=1 AND coalesce(bool_and(pid=$1 AND datid=$2 AND floor(extract(epoch from backend_start)*1000)::bigint=$3 AND datid=(SELECT oid FROM pg_database WHERE datname=current_database())),false) AS ok FROM pg_stat_activity WHERE application_name=$4", [p.sessionPid, p.databaseOid, Date.parse(p.backendStartedAt), `phoenix-fence:${p.bootId}`]);
        if (!result.rows[0].ok) return false;
      } return true;
    }, close: async () => { if (connected) { connected = false; await client.end(); } } };
}
async function participant() { const m = inspect('api'), s = await status(); return { containerId: m.id, revision: m.revision, bootId: s.bootId, allowedKinds: ['LOCAL'] }; }

try {
  // Refuse occupied fixture ports before creating any resources.
  const net = await import('node:net');
  for (const port of Object.values(ports)) await new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(resolve)); });
  assert.equal(docker(['inspect', 'phoenix-reanchor-pg18-20261117', '--format', '{{.Config.Image}}']), 'postgres:18-alpine');
  report.databaseContainer = docker(['inspect', 'phoenix-reanchor-pg18-20261117', '--format', '{{.Id}}']);
  const databaseDeadline = Date.now() + 20000;
  while (docker(['inspect', report.databaseContainer, '--format', '{{.State.Health.Status}}']) !== 'healthy') {
    assert.ok(Date.now() < databaseDeadline, 'owned PostgreSQL must become ready'); await wait(100);
  }
  const admin = new Client({ ...pgOptions, database: 'fence_test' }); await admin.connect();
  try { if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).rowCount) await admin.query(`CREATE DATABASE ${dbName}`); }
  finally { await admin.end(); }
  for (const [tag, revision] of [['old', R], ['target', T]]) {
    const file = path.join(directory, `Dockerfile.${tag}`);
    fs.writeFileSync(file, `FROM node:20-bookworm-slim\nLABEL org.opencontainers.image.revision="${revision}"\nLABEL phoenix.test.owner="${owner}"\nLABEL phoenix.test.kind="flock-reanchor-compose"\n`);
    docker(['build', '--pull=false', '--network=none', '-f', file, '-t', `${project}:${tag}`, directory], { timeout: 60000 });
    resources.images.push(docker(['image', 'inspect', `${project}:${tag}`, '--format', '{{.Id}}']));
  }
  volume = `${project}-public`; docker(['volume', 'create', '--label', `phoenix.test.owner=${owner}`, volume]); resources.volumes.push(volume);
  controller = docker(['run', '-d', '--label', `phoenix.test.owner=${owner}`, '--label', 'phoenix.test.kind=flock-reanchor-compose', '--mount', `type=volume,source=${volume},target=/control`, `${project}:old`, 'node', '-e', 'setInterval(()=>{},1000)']); resources.containers.push(controller);
  // Resolve dependency symlinks to their actual project paths; mount only
  // compiled modules and dependencies, never the repository or an env file.
  const deps = fs.realpathSync(path.join(root, 'apps/api/node_modules'));
  const workspaceDeps = fs.realpathSync(path.join(root, 'node_modules'));
  const apiScript = path.join(root, 'scripts/test/flock-reanchor-api.cjs');
  const apiConfig = path.join(directory, 'api-config.json');
  fs.writeFileSync(apiConfig, JSON.stringify({host: docker(['inspect', 'phoenix-reanchor-pg18-20261117', '--format', '{{(index .NetworkSettings.Networks "bridge").IPAddress}}']), port: 5432, username: pgOptions.user, database: dbName}));
  const service = (kind, port) => ({ image: kind === 'api' ? '${API_IMAGE}' : '${WEB_IMAGE}', network_mode: 'bridge', ports: [`127.0.0.1:${port}:${port}`], restart: 'no',
    labels: { ...labels, 'org.opencontainers.image.revision': kind === 'api' ? '${API_REVISION}' : '${WEB_REVISION}' },
    healthcheck: { test: ['CMD', 'node', '-e', `fetch('http://127.0.0.1:${port}/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`], interval: '1s', timeout: '2s', retries: 10 } });
  const config = { services: { api: { ...service('api', ports.api),
    command: ['node', '/fixture-api.cjs'], environment: { NODE_PATH: deps, FLOCK_REANCHOR_API_FIXTURE: '1' }, volumes: [
      { type: 'bind', source: apiScript, target: '/fixture-api.cjs', read_only: true },
      { type: 'bind', source: apiConfig, target: '/fixture-api-config.json', read_only: true },
      { type: 'bind', source: path.join(root, 'apps/api/dist'), target: '/compiled', read_only: true },
      { type: 'bind', source: deps, target: deps, read_only: true }, { type: 'bind', source: workspaceDeps, target: workspaceDeps, read_only: true },
      { type: 'volume', source: volume, target: '/run/phoenix-background-control', read_only: true } ] },
    web: { ...service('web', ports.web), command: ['node', '-e', `require('http').createServer((q,s)=>s.end('owned-web-health-peer')).listen(${ports.web},'0.0.0.0')`] } },
    volumes: { [volume]: { external: true } } };
  // Revision checks inspect the immutable image label, never this convenient
  // service config field. Remove the unneeded interpolation labels.
  delete config.services.api.labels['org.opencontainers.image.revision']; delete config.services.web.labels['org.opencontainers.image.revision'];
  fs.writeFileSync(path.join(directory, 'compose.json'), JSON.stringify(config));
  write('fixture-context.json', { fixtureOnly: true, productionReceipt: false, owner, project, F, R, T });
  const inspectOriginal = inspect;
  publish({ protocolVersion: 1, owner: '1-1', generation: 1, phase: 'FENCED', targetSha: R, participants: [] });
  compose(['up', '-d', '--no-build', '--pull', 'never']); await healthy('api'); await healthy('web');
  // Container labels inherit the image revision, which is the fixture identity.
  assert.equal(inspectOriginal('api').revision, R);
  for (const failBeforeApi of [true, false]) {
    const runId = failBeforeApi ? '2026111701-1' : '2026111702-1';
    const binding = { owner: runId, previousFloorSha: R, targetSha: T, deployMode: 'api', previousConfigFloorSha: F };
    const old = runtime(), beforeWeb = inspect('web'), oldParticipant = await participant();
    const apiPre = snapshot('PRE_SNAPSHOT', 'api', runId); write(`api-pre-${runId}.json`, apiPre);
    const floor = { version: 3, phase: 'READY', floorSha: F, chanjetPolicy: 'HOLD', readonlyApproval: null,
      operationalTuple: { CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' } };
    const active = { version: 3, floorSha: F, configSha: R, outcome: 'SUCCESS', active: old };
    write('floor.json', floor); write('active.json', active);
    let highWater = failBeforeApi ? 2 : publicValue.generation + 1;
    const open = { protocolVersion: 1, owner: '1-1', generation: highWater, phase: 'OPEN', targetSha: R, participants: [oldParticipant] };
    publish(open); write('background-control.json', { protocolVersion: 1, owner: '1-1', generation: highWater, phase: 'OPEN', previousFloorSha: R, targetSha: R, manifestDigest: createHash('sha256').update(JSON.stringify(open)).digest('hex') });
    const publisher = new BackgroundManifestPublisher({}, { guard: () => {}, inspect: () => ({}), readPrivate: () => json('background-control.json'), readPublic: () => publicValue,
      writePrivate: value => write('background-control.json', value), writePublic: publish, readHighWater: () => highWater, writeHighWater: value => { highWater = value; } });
    const session = await makeSession();
    const coordinator = new BackgroundFenceCoordinator({ binding, participants: [oldParticipant], project, timeoutMs: 5000 }, {
      publisher, session, inventory: () => [inspect('api').id],
      inspectParticipant: async () => { const m = inspect('api'); return { containerId: m.id, revision: m.revision, startedAt: m.startedAt, restartCount: m.restartCount, status: await status() }; },
      verifySuccess: async b => {
        const deployment = json('deployment.json'), promoted = json('promotion.json'); assertReanchorPromotion(b, promoted);
        assert.equal(deployment.outcome, 'SUCCESS'); assert.deepEqual(deployment.active, runtime());
        assert.equal(json('floor.json').floorSha, T); assert.equal(inspect('web').id, beforeWeb.id);
        const apiPost = snapshot('POST_SNAPSHOT', 'api', runId); write(`api-post-${runId}.json`, apiPost);
        assert.equal(compareSnapshots(apiPre, apiPost, 'api').apiRevision, T);
        assert.equal(completedDeploymentEvidenceBinding(deployment, b).configFloorSha, T); return true;
      } });
    const body = path.join(root, 'scripts/test/flock-reanchor-compose-body.mjs');
    const work = fetch(`http://127.0.0.1:${ports.api}/fixture/work`, { signal: AbortSignal.timeout(5000) });
    const workDeadline = Date.now() + 2000;
    while ((await status()).inFlight === 0) { assert.ok(Date.now() < workDeadline, 'actual background graph must enter before FENCE'); await wait(5); }
    const run = executeFencedDeployment({ binding, project, participants: [oldParticipant], script: 'owned compose body', maximumMs: 90000 }, {
      maintenanceAdmission: () => {}, coordinator, verifyMain: () => true,
      persistProof: proof => { write(`background-drain-${runId}.json`, proof); write('manifest-copy.json', publicValue); },
      spawnBody: () => spawn(process.execPath, [body, directory, runId, project, failBeforeApi ? 'FAIL_BEFORE_API' : 'SUCCESS'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], detached: true }),
      discoverNew: async () => [await participant()] });
    if (failBeforeApi) {
      await assert.rejects(run, /DEPLOY_BODY_FAILED/); assert.equal((await work).status, 200);
      assert.equal(publicValue.phase, 'FENCED'); assert.equal(inspect('web').id, beforeWeb.id); assert.deepEqual(runtime(), old);
      assertReanchorAbortRuntime(json('background-control.json'), json('promotion.json'), runtime());
      report.scenarios.push({ name: 'API_BODY_FAILURE_NO_WEB_SWITCH', outcome: 'PASS', publicPhase: publicValue.phase, restoreAuthorizationVerified: true });
    } else {
      assert.equal((await run).outcome, 'SUCCESS'); assert.equal((await work).status, 200);
      assert.equal(publicValue.phase, 'OPEN'); assert.equal(inspect('web').id, beforeWeb.id); assert.equal((await status()).phase, 'OPEN');
      const newApi = inspect('api'); report.apiTarget = true;
      const webPre = snapshot('PRE_SNAPSHOT', 'web', '2026111703-1'); write('web-pre.json', webPre);
      const webState = beginState({ previous: runtime(), configSha: T, target: T, scope: { baseline: T, target: T, changed: [] }, floor: json('floor.json'), mode: 'web', evidence: { fixtureOnly: true } });
      write('web-deployment.json', webState);
      report.webImageOverride = `${project}:missing-unbuilt-image`;
      assert.throws(() => compose(['up', '-d', '--no-deps', '--wait', '--no-build', '--pull', 'never', 'web']));
      assert.equal(inspect('web').id, beforeWeb.id); assert.equal(inspect('api').id, newApi.id);
      assert.equal(json('web-deployment.json').outcome, 'PREPARED');
      report.scenarios.push({ name: 'WEB_IMAGE_FAILURE_STAYS_INCOMPLETE_API_UNCHANGED', outcome: 'PASS', finalReleaseComplete: false });
      delete report.webImageOverride; report.webTarget = true;
      compose(['up', '-d', '--no-deps', '--wait', '--no-build', '--pull', 'never', 'web']); await healthy('web');
      assert.equal(inspect('api').id, newApi.id); assert.equal(inspect('web').revision, T);
      const webPost = snapshot('POST_SNAPSHOT', 'web', '2026111703-1'); write('web-post.json', webPost);
      assert.equal(compareSnapshots(webPre, webPost, 'web').webRevision, T);
      write('web-deployment.json', { ...webState, outcome: 'SUCCESS', switched: { api: false, web: true }, active: runtime() });
      write('active.json', { ...json('active.json'), active: runtime() });
      assert.deepEqual(json('active.json').active, runtime());
      assert.equal(docker(['inspect', 'phoenix-reanchor-pg18-20261117', '--format', '{{.Id}}']), report.databaseContainer);
      report.scenarios.push({ name: 'DESCENDANT_DRAIN_PROMOTION_API_OPEN_THEN_WEB', outcome: 'PASS', api: inspect('api').revision, web: inspect('web').revision, floor: json('floor.json').floorSha });
    }
    persist();
  }
  report.outcome = 'PASS';
} catch (error) {
  report.outcome = 'FAIL'; report.error = String(error?.message || 'fixture failure').slice(0, 500);
  try {
    for (const id of docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]).split('\n').filter(Boolean)) {
      assertOwned(id); fs.writeFileSync(path.join(directory, `owned-container-${id.slice(0,12)}.log`), docker(['logs', '--tail', '30', id]), { mode: 0o600 });
    }
  } catch {}
  throw error;
}
finally {
  persist();
  if (fs.existsSync(path.join(directory, 'compose.json'))) {
    try { for (const id of docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]).split('\n').filter(Boolean)) assertOwned(id); compose(['down', '--remove-orphans']); } catch { report.cleanupIncomplete = true; }
  }
  if (controller) { try { assertOwned(controller); docker(['rm', '-f', controller]); } catch { report.cleanupIncomplete = true; } }
  if (volume) { try { assert.equal(JSON.parse(docker(['volume', 'inspect', volume, '--format', '{{json .Labels}}']))['phoenix.test.owner'], owner); docker(['volume', 'rm', volume]); } catch { report.cleanupIncomplete = true; } }
  persist(); console.log(JSON.stringify({ fixtureOnly: true, productionReceipt: false, outcome: report.outcome, scenarios: report.scenarios, cleanupIncomplete: report.cleanupIncomplete || false, directory }));
}
