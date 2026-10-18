/** Session lifetime must cover FENCE -> deploy -> verified SUCCESS -> OPEN. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { CONTRACT, secureJson, verifyContext } from './production-config-guard.mjs';
import { executionEnv, captureRuntime } from './capture-production-runtime.mjs';
import { assertContained } from './production-trusted-paths.mjs';
import { verifyEvidenceFiles, verifyLiveSnapshot } from './production-deployment-evidence.mjs';
import { BackgroundManifestPublisher, PUBLIC_DIRECTORY, fail, validateBinding, validateParticipants } from './background-control-manifest.mjs';

export const LOCK_NAMESPACE = 17455;
export const ADMISSION_KEY = 1;
export const EXECUTION_KEY = 2;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeDocker = args => execFileSync('docker', args, { env: executionEnv(), encoding: 'utf8', timeout: 10000, maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Long-lived psql session inside the fixed DB container. No credential argv/env
 * crosses the boundary and SQL is limited to this protocol's fixed lock keys. */
export class DockerPostgresControlSession {
  constructor({ commandTimeoutMs = 5000 } = {}, dependencies = {}) {
    this.commandTimeoutMs = commandTimeoutMs; this.child = null; this.pending = null; this.broken = false;
    this.queue = Promise.resolve(); this.errorCode = null; this.launch = dependencies.spawn || spawn;
  }
  connected() { return Boolean(this.child && !this.broken && this.child.exitCode === null); }
  async start() {
    if (this.broken) fail('CONTROL_SESSION_LOST');
    if (this.child) return;
    this.child = this.launch('docker', ['exec', '-i', 'phoenix-v3-db', 'sh', '-c', 'exec psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -X -qAt --set=ON_ERROR_STOP=1'],
      { env: executionEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    const lose = () => { this.broken = true; this.errorCode = 'CONTROL_SESSION_LOST'; if (this.pending) { this.pending.reject(new Error('BACKGROUND_HOLD=CONTROL_SESSION_LOST')); this.pending = null; } };
    this.child.on('error', lose); this.child.on('exit', lose);
    // Never relay database stderr, which may contain deployment connection data.
    this.child.stderr.on('data', () => {});
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      const pending = this.pending; if (!pending) { lose(); return; }
      if (!/^[tf]$/.test(line)) { lose(); return; }
      this.pending = null; pending.resolve(line === 't');
    });
    await this.query('SELECT true;');
  }
  async query(sql) {
    const operation = this.queue.then(async () => {
      if (!this.connected() || this.pending) fail('CONTROL_SESSION_LOST');
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.broken = true; this.pending = null; reject(new Error('BACKGROUND_HOLD=CONTROL_SESSION_TIMEOUT')); this.child?.kill(); }, this.commandTimeoutMs);
        this.pending = { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } };
        this.child.stdin.write(sql + '\n', error => { if (error && this.pending) this.pending.reject(new Error('BACKGROUND_HOLD=CONTROL_SESSION_LOST')); });
      });
    });
    this.queue = operation.catch(() => undefined); return operation;
  }
  async tryLock(key) {
    if (![ADMISSION_KEY, EXECUTION_KEY].includes(key)) fail('LOCK_KEY');
    await this.start(); return this.query(`SELECT pg_try_advisory_lock(${LOCK_NAMESPACE},${key});`);
  }
  async unlock(key) {
    if (![ADMISSION_KEY, EXECUTION_KEY].includes(key)) fail('LOCK_KEY');
    return this.query(`SELECT pg_advisory_unlock(${LOCK_NAMESPACE},${key});`);
  }
  async ping() { return this.query('SELECT true;'); }
  async verifyParticipants(participants) {
    await this.start();
    const seen = new Set();
    for (const p of participants) {
      if (seen.has(p.sessionPid)) fail('PARTICIPANT_DATABASE_IDENTITY'); seen.add(p.sessionPid);
      const backendStartMs = Date.parse(p.backendStartedAt);
      if (![p.sessionPid, p.databaseOid, backendStartMs].every(value => Number.isSafeInteger(value) && value > 0)
        || typeof p.backendStartedAt !== 'string' || new Date(backendStartMs).toISOString() !== p.backendStartedAt
        || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.bootId)) fail('PARTICIPANT_DATABASE_IDENTITY');
      // Advisory locks are scoped to a database. PID+backend start prevents PID
      // reuse; current database OID prevents certifying locks in another DB.
      const sql = `SELECT count(*)=1 AND coalesce(bool_and(pid=${p.sessionPid} AND datid=${p.databaseOid} AND floor(extract(epoch from backend_start)*1000)::bigint=${backendStartMs} AND datid=(SELECT oid FROM pg_database WHERE datname=current_database())),false) FROM pg_stat_activity WHERE application_name='phoenix-fence:${p.bootId}';`;
      if (await this.query(sql) !== true) fail('PARTICIPANT_DATABASE_IDENTITY');
    }
    return true;
  }
  async close() {
    if (!this.child) return;
    const child = this.child; this.child = null;
    // A clean psql EOF ends its PostgreSQL session. Give docker exec time to
    // relay EOF instead of killing the client first and orphaning psql locks.
    child.stdin.end();
    if (child.exitCode !== null) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('BACKGROUND_HOLD=CONTROL_SESSION_CLOSE_TIMEOUT')); }, 2000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
export function inventoryApiContainers(project, run = safeDocker) {
  if (!/^phoenix[a-z0-9_-]*$/.test(project || '')) fail('PROJECT_BINDING');
  const ids = run(['ps', '--no-trunc', '-q', '--filter', `label=com.docker.compose.project=${project}`, '--filter', 'label=com.docker.compose.service=api']).split('\n').filter(Boolean).sort();
  if (!ids.length || ids.some(id => !/^[a-f0-9]{64}$/.test(id)) || new Set(ids).size !== ids.length) fail('EXECUTOR_INVENTORY');
  return ids;
}
export function inspectApiParticipant(expected, project, run = safeDocker) {
  validateParticipants([expected]);
  try {
    const fields = run(['inspect', expected.containerId, '--format', '{{json .Id}}\t{{json .Image}}\t{{json .State.Running}}\t{{json .State.Health.Status}}\t{{json .State.StartedAt}}\t{{json .RestartCount}}\t{{json .Config.Labels}}\t{{json .Mounts}}']).split('\t').map(JSON.parse);
    const [containerId, imageId, running, health, startedAt, restartCount, labels, mounts] = fields;
    const revision = run(['image', 'inspect', imageId, '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}']);
    if (containerId !== expected.containerId || revision !== expected.revision || !/^sha256:[a-f0-9]{64}$/.test(imageId)
      || running !== true || health !== 'healthy' || !Number.isFinite(Date.parse(startedAt)) || !Number.isInteger(restartCount)
      || labels?.['com.docker.compose.project'] !== project || labels?.['com.docker.compose.service'] !== 'api'
      || !Array.isArray(mounts) || !mounts.some(m => m.Type === 'bind' && m.Source === PUBLIC_DIRECTORY && m.Destination === '/run/phoenix-background-control' && m.RW === false)) fail('PARTICIPANT_RUNTIME_BINDING');
    const code = "fetch('http://127.0.0.1:3100/api/internal/background/status',{signal:AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok)process.exit(2);process.stdout.write(await r.text())}).catch(()=>process.exit(3))";
    const status = JSON.parse(run(['exec', containerId, 'node', '-e', code]));
    return { containerId, revision, imageId, startedAt, restartCount, status };
  } catch (error) { if (error.message.startsWith('BACKGROUND_HOLD=')) throw error; fail('PARTICIPANT_INSPECTION_FAILED'); }
}
export function verifyParticipantStatus(actual, expected, manifest) {
  const s = actual?.status;
  if (!s || s.protocolVersion !== 1 || actual.containerId !== expected.containerId || actual.revision !== expected.revision
    || s.bootId !== expected.bootId || s.poisoned !== false || s.stopping !== false
    || s.controlSession?.connected !== true || s.controlSession?.broken !== false
    || ![s.controlSession.sessionPid, s.controlSession.databaseOid, Date.parse(s.controlSession.backendStartedAt)].every(value => Number.isSafeInteger(value) && value > 0)
    || typeof s.controlSession.backendStartedAt !== 'string' || new Date(s.controlSession.backendStartedAt).toISOString() !== s.controlSession.backendStartedAt) fail('PARTICIPANT_MISSING_POISONED_OR_UNCONNECTED');
  if (manifest && (s.owner !== manifest.owner || s.generation !== manifest.generation || s.phase !== manifest.phase)) fail('PARTICIPANT_FENCE_NOT_OBSERVED');
  for (const key of ['inFlight', 'pendingChildren', 'taskGraphs']) if (!Number.isSafeInteger(s[key]) || s[key] < 0) fail('PARTICIPANT_COUNT_INVALID');
  return s;
}
export function verifyCompletedDeployment(binding, participants) {
  validateBinding(binding); validateParticipants(participants, { targetSha: binding.targetSha });
  verifyContext(CONTRACT.repository, CONTRACT.stateDirectory);
  if (fs.existsSync(path.join(CONTRACT.stateDirectory, 'transaction.json')) || fs.existsSync(path.join(CONTRACT.stateDirectory, 'policy-transition.json'))) fail('UNFINISHED_DEPLOY_TRANSACTION');
  const deployment = secureJson(path.join(CONTRACT.stateDirectory, `deploy-${binding.owner}.json`));
  const active = secureJson(path.join(CONTRACT.stateDirectory, 'active.json'));
  const floor = secureJson(path.join(CONTRACT.stateDirectory, 'floor.json'));
  if (deployment.version !== CONTRACT.version || active.version !== CONTRACT.version || floor.version !== CONTRACT.version
    || deployment.outcome !== 'SUCCESS' || active.outcome !== 'SUCCESS' || deployment.target !== binding.targetSha
    || deployment.configSha !== binding.targetSha || active.configSha !== binding.targetSha || floor.phase !== 'READY'
    || deployment.switched?.api !== true || deployment.switched?.web !== false
    || deployment.floorSha !== binding.targetSha || floor.floorSha !== binding.targetSha || active.floorSha !== binding.targetSha
    || deployment.previous?.api?.revision !== binding.previousFloorSha || deployment.active?.api?.revision !== binding.targetSha
    || active.active?.api?.revision !== binding.targetSha || floor.chanjetPolicy !== 'HOLD' || floor.readonlyApproval !== null
    || !Array.isArray(deployment.migrationPaths) || deployment.migrationPaths.length !== 0
    || JSON.stringify(deployment.active) !== JSON.stringify(active.active)) fail('DEPLOY_SUCCESS_BINDING');
  const evidence = deployment.evidence;
  if (!evidence || !evidence.pre || !evidence.post || !evidence.log) fail('DEPLOY_EVIDENCE_REQUIRED');
  for (const file of [evidence.pre, evidence.post, evidence.log]) assertContained(file, CONTRACT.stateDirectory);
  const [runId, attempt] = [binding.owner, binding.owner.split('-').at(-1)];
  const evidenceBinding = { runId, runAttempt: attempt, targetSha: binding.targetSha, configFloorSha: binding.targetSha };
  // Read protected formal receipts, then independently re-inspect live identity.
  const post = secureJson(evidence.post);
  verifyEvidenceFiles(evidence.pre, evidence.post, evidence.log, evidenceBinding);
  const live = verifyLiveSnapshot(post, evidenceBinding);
  if (JSON.stringify(captureRuntime()) !== JSON.stringify(active.active)
    || participants.length !== 1 || participants[0].containerId !== live.api.id || participants[0].revision !== live.api.ociRevision) fail('SUCCESS_RUNTIME_CHANGED');
  return true;
}
export class BackgroundFenceCoordinator {
  constructor(options, dependencies = {}) {
    validateBinding(options.binding); validateParticipants(options.participants, { targetSha: options.binding.previousFloorSha });
    if (!Number.isSafeInteger(options.timeoutMs ?? 30000) || (options.timeoutMs ?? 30000) < 1 || (options.timeoutMs ?? 30000) > 1800000) fail('DRAIN_TIMEOUT_BOUND');
    this.binding = options.binding; this.participants = options.participants; this.project = options.project;
    this.timeoutMs = options.timeoutMs ?? 30000; this.pollMs = options.pollMs ?? 50;
    this.publisher = dependencies.publisher || options.publisher || new BackgroundManifestPublisher();
    this.session = dependencies.session || new DockerPostgresControlSession();
    this.inspect = dependencies.inspectParticipant || (p => inspectApiParticipant(p, this.project));
    this.inventory = dependencies.inventory || (() => inventoryApiContainers(this.project));
    this.verifySuccess = dependencies.verifySuccess || (b => verifyCompletedDeployment(b, b.participants));
    this.now = dependencies.now || Date.now; this.sleep = dependencies.sleep || sleep;
    this.held = new Set(); this.manifest = null; this.ready = false; this.closed = false; this.opened = false;
  }
  verifyInventory(participants) {
    const actual = this.inventory().sort(); const expected = participants.map(p => p.containerId).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('EXECUTOR_INVENTORY_CHANGED');
  }
  async inspectParticipants(participants, manifest, requireZero) {
    this.verifyInventory(participants);
    const snapshots = []; const sessions = [];
    for (const p of participants) {
      const actual = await this.inspect(p); const status = verifyParticipantStatus(actual, p, manifest);
      if (requireZero && (status.inFlight !== 0 || status.pendingChildren !== 0 || status.taskGraphs !== 0)) fail('LOCAL_GRAPH_NOT_QUIESCENT');
      sessions.push({ ...status.controlSession, bootId: p.bootId });
      snapshots.push({ containerId: p.containerId, bootId: p.bootId, revision: p.revision, startedAt: actual.startedAt, restartCount: actual.restartCount });
    }
    this.verifyInventory(participants);
    if (typeof this.session.verifyParticipants !== 'function' || await this.session.verifyParticipants(sessions) !== true) fail('PARTICIPANT_DATABASE_IDENTITY');
    return snapshots;
  }
  async acquire(key, deadline) {
    while (true) {
      if (await this.session.tryLock(key)) { this.held.add(key); if (this.now() > deadline) fail('DRAIN_TIMEOUT'); return; }
      // Count alone is never sufficient: identities and session must stay alive
      // even when a task's database lock vanished because its process crashed.
      await this.inspectParticipants(this.participants, this.manifest, false);
      if (this.now() >= deadline) fail('DRAIN_TIMEOUT');
      await this.sleep(Math.min(this.pollMs, Math.max(1, deadline - this.now())));
    }
  }
  async fenceAndDrain() {
    if (this.closed || this.manifest) fail('COORDINATOR_REUSE');
    try {
      // Unsupported legacy API fails before claiming a modern drain proof.
      this.publisher.guard();
      await this.inspectParticipants(this.participants, null, false);
      this.manifest = this.publisher.fence(this.binding, this.participants);
      const deadline = this.now() + this.timeoutMs;
      await this.acquire(ADMISSION_KEY, deadline); await this.acquire(EXECUTION_KEY, deadline);
      const participants = await this.verifyQuiescent(); this.ready = true;
      return { protocolVersion: 1, outcome: 'DRAINED', ...this.binding, generation: this.manifest.generation, participants };
    } catch (error) {
      try { this.publisher.hold(this.binding, /^BACKGROUND_HOLD=([A-Z0-9_]+)$/.exec(error.message)?.[1] || 'DRAIN_FAILED'); } catch { /* Remain denied; never reopen on error. */ }
      try { await this.close(); } catch { /* Preserve first HOLD reason; no automatic recovery. */ } throw error;
    }
  }
  async verifyLease() {
    if (this.closed || !this.manifest || !this.held.has(ADMISSION_KEY) || !this.held.has(EXECUTION_KEY) || !this.session.connected()) fail('FENCE_SESSION_NOT_HELD');
    this.publisher.assertOwned(this.binding); await this.session.ping();
    if (!this.session.connected()) fail('CONTROL_SESSION_LOST');
    return true;
  }
  async verifyQuiescent(participants = this.participants) {
    if (this.closed || !this.manifest || !this.held.has(ADMISSION_KEY) || !this.held.has(EXECUTION_KEY) || !this.session.connected()) fail('FENCE_SESSION_NOT_HELD');
    this.publisher.assertOwned(this.binding);
    await this.session.ping();
    return this.inspectParticipants(participants, this.manifest, true);
  }
  async openAfterSuccess(participants) {
    if (!this.ready || this.opened) fail('DRAIN_PROOF_REQUIRED');
    validateParticipants(participants, { targetSha: this.binding.targetSha });
    await this.verifyQuiescent(participants);
    const manifest = await this.publisher.open(this.binding, participants, async b => {
      if (!this.session.connected() || await this.verifySuccess(b) !== true) return false;
      await this.verifyQuiescent(participants); return true;
    });
    this.opened = true; await this.close(); return manifest;
  }
  async close() {
    if (this.closed) return; this.closed = true; this.ready = false;
    // Session close always releases locks; never changes public state or deletes
    // transaction markers. A crashed process is therefore durably fail-closed.
    let releaseError;
    if (this.session.connected()) {
      for (const key of [EXECUTION_KEY, ADMISSION_KEY]) if (this.held.has(key)) {
        try { if (await this.session.unlock(key) !== true) fail('CONTROL_LOCK_OWNERSHIP_LOST'); }
        catch (error) { releaseError ||= error; }
      }
    }
    try { await this.session.close(); } finally { this.held.clear(); }
    if (releaseError) throw releaseError;
  }
}
