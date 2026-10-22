/** A typed, single-use legacy replacement. This is neither modern DRAINED nor
 * an OPEN receipt. Interrupted effects retain the maintenance intent for humans.
 * No CLI, arbitrary shell, discovery fallback or automatic retry is provided. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CONTRACT, verifyContext, git } from './production-config-guard.mjs';
import { executionEnv } from './capture-production-runtime.mjs';
import { MaintenanceReceiptStore, bindingDigest, canonicalDigest, createMaintenanceEvidence,
  validateMaintenanceContext, validateMaintenanceEvidence, validateRuntimePin, HASH, same, hold, iso as validIso } from './production-maintenance-receipts.mjs';
import { validateStoppedLegacy } from './production-maintenance-transition.mjs';
import {verifyCommittedLegacyReconciliation} from './production-maintenance-reconciliation.mjs';
import { PUBLIC_DIRECTORY } from './background-control-manifest.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const commandBudgetMs = 60000;
const iso = ms => new Date(ms).toISOString();
const safeFields = '{{json .Id}}\t{{json .Image}}\t{{json .State}}\t{{json .RestartCount}}\t{{json .HostConfig.RestartPolicy.Name}}\t{{json .NetworkSettings.Networks}}\t{{json .Config.Labels}}';
const bodyHashes = ['replacementIntentSha256', 'operationIntentSha256', 'stoppedEvidenceSha256', 'reconciliationEvidenceSha256', 'isolationEvidenceSha256',
  'recoveryEvidenceSha256', 'composeFileSha256', 'overrideSha256', 'commandSha256', 'eventsSha256', 'preInventorySha256', 'postInventorySha256'];
// The pinned expectation defines the compared identity: the API executor pin
// always carries an OCI revision; the database pin legitimately has none (its
// exact image is already pinned by imageId), and an absent image label
// renders as the empty string rather than undefined.
const pinsMatch = (a, b) => ['id', 'imageId', 'startedAt', 'restartCount'].every(key => a?.[key] === b?.[key])
  && (b?.revision === undefined || a?.revision === b?.revision);

export function replacementCommand({ root, project, overrideFile }) {
  if (!path.isAbsolute(root) || path.normalize(root) !== root || !/^phoenix[a-z0-9_-]{1,63}$/.test(project || '')
    || !path.isAbsolute(overrideFile) || path.normalize(overrideFile) !== overrideFile) hold('REPLACEMENT_COMPOSE_BINDING');
  return ['compose', '--project-name', project, '--env-file', path.join(root, '.env'), '-f', path.join(root, 'docker-compose.yml'), '-f', overrideFile,
    'up', '-d', '--no-deps', '--force-recreate', '--no-build', '--pull', 'never', 'api'];
}
function command(args, { timeoutMs = 10000, env = executionEnv() } = {}) {
  try { return execFileSync('/usr/bin/docker', args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024,
    env, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (error) {
    const failure = Error('MAINTENANCE_HOLD=REPLACEMENT_DOCKER_COMMAND_FAILED');
    // Fixed non-secret stderr class lines only, for isolated fixture triage.
    failure.replacementCommandDetail = String(error?.stderr || '').split('\n')
      .filter(line => /^(?:Error|error|invalid|failed|manifest|no such|pull access)/i.test(line.trim())).map(line => line.trim().slice(0, 120)).slice(0, 3);
    throw failure;
  }
}
export function inspectReplacementRuntime(id, run = command) {
  if (!HASH.test(id)) hold('REPLACEMENT_FULL_ID_REQUIRED');
  const [actualId, imageId, state, restartCount, restartPolicy, networks, labels] = run(['inspect', id, '--format', safeFields]).split('\t').map(JSON.parse);
  if (actualId !== id) hold('REPLACEMENT_IDENTITY_CHANGED');
  const revision = run(['image', 'inspect', imageId, '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}']);
  return { id, imageId, revision, startedAt: state.StartedAt, restartCount, restartPolicy, running: state.Running,
    health: state.Health?.Status || 'none', pid: state.Pid, status: state.Status, restarting: state.Restarting, dead: state.Dead,
    exitCode: state.ExitCode, oomKilled: state.OOMKilled, checkedAt: iso(Date.now()), networks: Object.keys(networks).sort(),
    project: labels?.['com.docker.compose.project'] || '', service: labels?.['com.docker.compose.service'] || '' };
}
function inventory(run) {
  const ids = run(['ps', '-a', '--no-trunc', '-q']).split('\n').filter(Boolean).sort();
  if (ids.some(id => !HASH.test(id)) || new Set(ids).size !== ids.length) hold('REPLACEMENT_INVENTORY_INVALID');
  return ids;
}
function unchangedServices(pre, run) {
  for (const service of ['web', 'db']) {
    const actual = inspectReplacementRuntime(pre[service].id, run);
    if (!pinsMatch(actual, pre[service]) || !actual.running || actual.health !== 'healthy') {
      const error = Error('MAINTENANCE_HOLD=REPLACEMENT_WEB_DB_CHANGED');
      // Fixed non-secret pin fields only, for isolated fixture triage.
      error.webDbDifference = { service, actual: { id: actual.id, imageId: actual.imageId, running: actual.running,
        health: actual.health, restartCount: actual.restartCount, startedAt: actual.startedAt },
        expected: { id: pre[service].id, imageId: pre[service].imageId, restartCount: pre[service].restartCount, startedAt: pre[service].startedAt } };
      throw error;
    }
  }
}
/** Fixed projection: arbitrary labels are never received, and action command
 * suffixes are removed before retention. Nanoseconds never pass through Number. */
export const replacementEventFormat = '{"Type":{{json .Type}},"Action":{{json .Action}},"Actor":{"ID":{{json .Actor.ID}},"Attributes":{'
  + '"com.docker.compose.project":{{if index .Actor.Attributes "com.docker.compose.project"}}{{json (index .Actor.Attributes "com.docker.compose.project")}}{{else}}null{{end}},'
  + '"com.docker.compose.service":{{if index .Actor.Attributes "com.docker.compose.service"}}{{json (index .Actor.Attributes "com.docker.compose.service")}}{{else}}null{{end}}}},"timeNano":"{{.TimeNano}}"}';
function nano(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,21}$/.test(value)) hold('REPLACEMENT_EVENT_PRECISE_CLOCK_REQUIRED');
  return BigInt(value);
}
const isoNano = value => { if (!validIso(value)) hold('REPLACEMENT_EVENT_INTERVAL'); return BigInt(Date.parse(value)) * 1000000n; };
export function redactReplacementEvent(event) {
  const action = event?.Action?.split(':')[0];
  if (!/^[a-z_]{1,40}$/.test(event?.Type || '') || !/^[a-z_]{1,40}$/.test(action || '')
    || typeof event.Actor?.ID !== 'string') hold('REPLACEMENT_EVENT_SHAPE');
  nano(event.timeNano);
  const attributes = {};
  for (const key of ['com.docker.compose.project', 'com.docker.compose.service']) {
    const value = event.Actor?.Attributes?.[key];
    if (value !== undefined && value !== null) { if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(value)) hold('REPLACEMENT_EVENT_SCOPE'); attributes[key] = value; }
  }
  if (event.Type === 'container' && !HASH.test(event.Actor.ID)) hold('REPLACEMENT_EVENT_FULL_CONTAINER_ID');
  const id = event.Type === 'container' ? event.Actor.ID : canonicalDigest({ opaqueDockerIdentity: event.Actor.ID });
  return { Type: event.Type, Action: action, Actor: { ID: id, Attributes: attributes }, timeNano: event.timeNano };
}
function eventsFrom(text) {
  if (!text.trim()) return [];
  try { return text.trim().split('\n').map(row => redactReplacementEvent(JSON.parse(row))); } catch { hold('REPLACEMENT_EVENT_PARSE'); }
}
/** Matching bounded stream/history is interval evidence only. It does not prove
 * exclusive issuer, subscription readiness or continuous host ingress exclusion.
 * No target signals or automatic observer KILL/reconnect are performed here. */
export class DockerReplacementEvents {
  #originalChild = null; #originalPid = null; #originalSignal = null;
  get child() { return this.#originalChild; }
  constructor({ run = command, spawnProcess = spawn, registerChild = () => {}, env = executionEnv() } = {}) {
    this.run = run; this.spawnProcess = spawnProcess; this.registerChild = registerChild; this.env = env; this.rows = []; this.tail = ''; this.bytes = 0;
    this.used = false; this.failed = false; this.closing = false; this.closed = false; this.closeAttempted = false;
  }
  async start(start) {
    if (this.used) hold('REPLACEMENT_OBSERVER_SINGLE_USE'); this.used = true; isoNano(start); this.startAt = start;
    this.#originalChild = this.spawnProcess('/usr/bin/docker', ['events', '--since', start, '--format', replacementEventFormat], { env: this.env, stdio: ['ignore', 'pipe', 'pipe'] });
    this.#originalPid = this.child.pid; this.#originalSignal = this.child.kill.bind(this.child);
    this.closedPromise = new Promise(resolve => { this.child.once('close', () => { this.closed = true; if (!this.closing) this.failed = true; resolve(); }); });
    const fail = () => { this.failed = true; };
    this.child.on('error', fail); this.child.once('exit', () => { if (!this.closing) fail(); });
    this.child.stdout.on('error', fail); this.child.stderr.on('error', fail); this.child.stderr.on('data', fail);
    this.child.stdout.on('data', bytes => {
      this.bytes += bytes.length; if (this.bytes > 65536) { fail(); return; }
      this.tail += bytes.toString('utf8');
      for (;;) {
        const end = this.tail.indexOf('\n'); if (end < 0) break;
        const line = this.tail.slice(0, end); this.tail = this.tail.slice(end + 1);
        try { if (line.length > 4096 || this.rows.length >= 255) throw Error('bound'); this.rows.push(redactReplacementEvent(JSON.parse(line))); } catch { fail(); }
      }
      if (this.tail.length > 4096) fail();
    });
    // Retain the original object and close waiter BEFORE registration can fail.
    try { this.registerChild(this.child); } catch { this.failed = true; hold('REPLACEMENT_OBSERVER_REGISTRATION_FAILED'); }
    await wait(200); this.assertLive();
  }
  assertLive() {
    if (!this.child || this.failed || this.closing || this.closed || this.child.exitCode !== null || this.child.signalCode !== null || !this.#originalPid || this.child.pid !== this.#originalPid) { this.failed = true; hold('REPLACEMENT_OBSERVER_NOT_RUNNING'); }
  }
  verifyFinalCoverage() {
    const start = isoNano(this.startAt), end = isoNano(this.endAt);
    const stream = this.rows.filter(event => { const at = nano(event.timeNano); if (at < start) hold('REPLACEMENT_EVENT_BEFORE_INTERVAL'); return at < end; });
    // Sorted digests must not hide duplicated/reordered lifecycle observations.
    if (this.failed || this.history.length >= 256 || stream.length >= 256 || !same(this.history, stream)) { this.failed = true; hold('REPLACEMENT_EVENT_COVERAGE_UNPROVEN'); }
    return structuredClone(this.history);
  }
  async finish(end) {
    try {
    this.assertLive();
    if (this.endAt || isoNano(end) <= isoNano(this.startAt)) hold('REPLACEMENT_EVENT_INTERVAL'); this.endAt = end;
    this.history = eventsFrom(this.run(['events', '--since', this.startAt, '--until', end, '--format', replacementEventFormat]));
    for (const row of this.history) if (nano(row.timeNano) < isoNano(this.startAt) || nano(row.timeNano) >= isoNano(end)) hold('REPLACEMENT_EVENT_HISTORY_INTERVAL');
    await wait(250); this.assertLive(); return this.verifyFinalCoverage();
    } catch (error) { this.failed = true; throw error; }
  }
  async close() {
    if (this.closeAttempted) hold('REPLACEMENT_OBSERVER_CLOSE_SINGLE_USE'); this.closeAttempted = true;
    if (!this.child) return { stdioClosed: true, observerAbsent: true, continuityClaim: false };
    const preFailed = this.failed || this.closed || this.child.exitCode !== null || this.child.signalCode !== null;
    this.closing = true; let timer;
    if (this.child.pid !== this.#originalPid) { this.failed = true; hold('REPLACEMENT_OBSERVER_ORIGINAL_IDENTITY_LOST'); }
    if (!this.closed) this.#originalSignal('SIGTERM');
    try { await Promise.race([this.closedPromise, new Promise((_, reject) => { timer = setTimeout(() => { this.failed = true; reject(new Error('MAINTENANCE_HOLD=REPLACEMENT_OBSERVER_STDIO_CLOSE_TIMEOUT')); }, 2000); })]); }
    finally { clearTimeout(timer); }
    if (preFailed || this.failed || !this.closed || this.tail !== '') { this.failed = true; hold('REPLACEMENT_OBSERVER_CLEANUP_OR_EVIDENCE_FAILED'); }
    if (this.endAt) this.verifyFinalCoverage();
    return { originalPid: this.#originalPid, stdioClosed: true, automaticKill: false, continuityClaim: false };
  }
  cleanupDebt() { return { originalPid: this.#originalPid, closeAttempted: this.closeAttempted, stdioClosed: this.closed, pendingOriginalChild: !!this.child && !this.closed, evidenceFailed: this.failed }; }
  snapshot() { return structuredClone(this.rows); }
}
export function validateReplacementLifecycle(events, { oldId, candidateId, project, start, end }) {
  if (!Array.isArray(events) || events.length >= 256 || !events.length) hold('REPLACEMENT_LIFECYCLE_REQUIRED');
  const relevant = events.filter(event => event.Type === 'container');
  let destroyed, created, started;
  for (const event of relevant) {
    const id = event.Actor?.ID, attrs = event.Actor?.Attributes || {}, at = nano(event.timeNano);
    if (!HASH.test(id || '') || at < isoNano(start) || at >= isoNano(end)) hold('REPLACEMENT_EVENT_CLOCK_OR_ID');
    if (id !== oldId && id !== candidateId && ['create', 'start', 'restart', 'unpause', 'die', 'destroy', 'stop', 'kill', 'rename', 'update'].includes(event.Action)) hold('REPLACEMENT_CONCURRENT_CONTAINER_MUTATION');
    if (id === oldId) {
      if (event.Action === 'start' || event.Action === 'restart' || event.Action === 'unpause') hold('REPLACEMENT_OLD_REVIVED');
      if (event.Action === 'destroy') { if (destroyed) hold('REPLACEMENT_DUPLICATE_DESTROY'); destroyed = event; }
    }
    if (attrs['com.docker.compose.project'] === project && attrs['com.docker.compose.service'] === 'api' && id !== oldId && id !== candidateId) hold('REPLACEMENT_UNKNOWN_EXECUTOR_EVENT');
    if (id === candidateId) {
      if (attrs['com.docker.compose.project'] !== project || attrs['com.docker.compose.service'] !== 'api') hold('REPLACEMENT_CANDIDATE_EVENT_SCOPE');
      if (event.Action === 'create') { if (created) hold('REPLACEMENT_DUPLICATE_CREATE'); created = event; }
      if (event.Action === 'start') { if (started) hold('REPLACEMENT_DUPLICATE_START'); started = event; }
      if (['die', 'destroy', 'restart', 'stop', 'kill', 'unpause'].includes(event.Action)) hold('REPLACEMENT_CANDIDATE_UNSTABLE');
    }
  }
  if (!destroyed || !created || !started || nano(created.timeNano) > nano(started.timeNano)
    || nano(destroyed.timeNano) > nano(started.timeNano)) hold('REPLACEMENT_LIFECYCLE_INCOMPLETE');
  return { oldDestroy: canonicalDigest(destroyed), candidateCreate: canonicalDigest(created), candidateStart: canonicalDigest(started) };
}
/** This checks structure and exact identity. It NEVER substitutes for independent
 * evidence/authority verification by the protocol or isolation owner. */
export function validateCandidateReplacement(envelope, context, { now = Date.now(), publicSource = PUBLIC_DIRECTORY } = {}) {
  const body = validateMaintenanceEvidence(envelope, 'CANDIDATE_REPLACEMENT', context, now);
  if (body.eventProjection !== 'ALLOWLISTED_DOCKER_EVENTS_V2_STRING_NANO' || body.protocol !== 'CONTROLLED_COMPOSE_REPLACEMENT' || body.legacyDrainResult !== 'UNSUPPORTED'
    || body.oldDisposition !== 'REMOVED_BY_CONTROLLED_REPLACEMENT' || body.owner !== context.owner
    || !same(body.oldExecutor, context.preSnapshot.api) || bodyHashes.some(key => !HASH.test(body[key] || ''))
    || body.unexpectedExecutors !== 0 || body.oldImageRetained !== true || body.webDbUnchanged !== true
    || body.coverageScope !== 'FIXED_REPLACEMENT_INTERVAL_ONLY' || body.postReplacementState !== 'HOLD_CANDIDATE_REVALIDATION_REQUIRED'
    || !same(body.candidatePublicMount, { source: publicSource, destination: '/run/phoenix-background-control', type: 'bind', readOnly: true })
    || body.runMigration !== false || body.webSwitched !== false || !body.interval || !validIso(body.interval.start) || !validIso(body.interval.end)
    || Date.parse(body.interval.start) < Date.parse(context.window.start) || Date.parse(body.interval.end) > now
    || Date.parse(body.interval.end) >= Date.parse(context.window.end) || Date.parse(body.interval.start) >= Date.parse(body.interval.end)) hold('REPLACEMENT_TOMBSTONE_INVALID');
  validateRuntimePin(body.candidate);
  if (body.candidate.id === body.oldExecutor.id || body.candidate.imageId !== context.candidate.imageId
    || body.candidate.revision !== context.targetSha || body.candidate.running !== true || body.candidate.restartPolicy !== 'no'
    || body.candidate.restartCount !== 0 || body.candidate.service !== 'api' || body.candidate.project !== body.project
    || !Number.isSafeInteger(body.candidate.pid) || body.candidate.pid <= 0 || body.candidate.status !== 'running'
    || body.candidate.restarting !== false || body.candidate.dead !== false
    || Date.parse(body.candidate.startedAt) < Date.parse(body.interval.start) || Date.parse(body.candidate.startedAt) > Date.parse(body.interval.end)
    || !/^phoenix[a-z0-9_-]{1,63}$/.test(body.project || '') || !HASH.test(body.recoveryMaterialsSha256 || '')
    || !body.lifecycle || ['oldDestroy', 'candidateCreate', 'candidateStart'].some(key => !HASH.test(body.lifecycle[key] || ''))) hold('REPLACEMENT_CANDIDATE_IDENTITY');
  return body;
}

export class ControlledComposeReplacement {
  constructor({ context, approval, state, prerequisites, project }, dependencies = {}) {
    validateMaintenanceContext(context);
    if (context.executors.length !== 1) hold('REPLACEMENT_SINGLE_API_ONLY');
    this.context = structuredClone(context); this.approval = approval; this.state = state; this.prerequisites = prerequisites; this.project = project;
    this.store = dependencies.store || new MaintenanceReceiptStore(context);
    this.guard = dependencies.guard || (() => verifyContext(CONTRACT.repository, CONTRACT.stateDirectory));
    this.verifyAuthority = dependencies.verifyAuthority || (async () => false);
    this.verifyEvidence = dependencies.verifyEvidence || (async () => false);
    this.verifyPublicFence = dependencies.verifyPublicFence || (async () => false);
    this.publicSource = dependencies.publicSource || PUBLIC_DIRECTORY;
    this.run = dependencies.run || command; this.execute = dependencies.execute || command;
    this.events = dependencies.events || new DockerReplacementEvents(); this.now = dependencies.now || Date.now;
    this.verifySource = dependencies.verifySource || (() => {
      const root = CONTRACT.repository;
      if (fs.realpathSync(root) !== root || git(root, ['rev-parse', 'HEAD']) !== context.targetSha
        || git(root, ['status', '--porcelain', '--untracked-files=no'])) hold('REPLACEMENT_TARGET_CHECKOUT_REQUIRED');
      if (git(root, ['ls-remote', 'origin', 'refs/heads/main'], { timeoutMs: 10000 }) !== `${context.targetSha}\trefs/heads/main`) hold('REPLACEMENT_REMOTE_MAIN_CHANGED');
      const file = path.join(root, 'docker-compose.yml'), stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022)) hold('REPLACEMENT_UNTRUSTED_COMPOSE');
      const bytes = fs.readFileSync(file);
      if (git(root, ['hash-object', file]) !== git(root, ['rev-parse', `${context.targetSha}:docker-compose.yml`])) hold('REPLACEMENT_COMPOSE_TARGET_BLOB');
      return { root, composeFileSha256: createHash('sha256').update(bytes).digest('hex') };
    });
  }
  window(budget = 0) {
    const now = this.now();
    if (now < Date.parse(this.context.window.start) || now + budget >= Date.parse(this.context.window.end)) hold('REPLACEMENT_WINDOW_INSUFFICIENT');
  }
  async admission() {
    this.guard(); this.window(commandBudgetMs + 5000);
    if (this.state?.phase !== 'PROMOTION_PREPARED' || !HASH.test(this.state.stateDigest || '')) hold('REPLACEMENT_PHASE_REQUIRED');
    this.store.assertCurrent();
    if (this.store.readState().stateDigest !== this.state.stateDigest) hold('REPLACEMENT_STATE_CHANGED');
    const marker = this.store.assertOwnedIntent('REPLACE_CANDIDATE', 'PROMOTION_PREPARED', this.state.stateDigest);
    if (await this.verifyAuthority(this.approval, { purpose: 'MAINTENANCE', operation: 'REPLACE_CANDIDATE', context: this.context, bindingDigest: bindingDigest(this.context), targetSha: this.context.targetSha }) !== true) hold('REPLACEMENT_INDEPENDENT_APPROVAL_REQUIRED');
    return marker;
  }
  async priorEvidence() {
    const bodies = {};
    for (const [name, kind] of Object.entries({ stopped: 'STOP_LEGACY', reconciliation: 'RECONCILIATION', isolation: 'INGRESS_FENCE', recovery: 'RECOVERY_MATERIAL' })) {
      const envelope = this.prerequisites?.[name];
      bodies[name] = validateMaintenanceEvidence(envelope, kind, this.context, this.now());
      if (await this.verifyEvidence(envelope, { kind, context: this.context }) !== true) hold('REPLACEMENT_PRIOR_EVIDENCE_UNVERIFIED');
    }
    validateStoppedLegacy(bodies.stopped, this.context, bodies.stopped.ingressFenceDigest, this.now());
    await verifyCommittedLegacyReconciliation({envelope:this.prerequisites.reconciliation,context:this.context,state:this.state,
      store:this.store,maintenanceApproval:this.approval,verifyAuthority:this.verifyAuthority});
    const fence = bodies.isolation;
    if (fence.state !== 'FROZEN' || fence.continuous !== true || fence.revival?.restartPolicy !== 'no'
      || fence.revival.orchestratorsDisabled !== true || !same(fence.revival.executorIds, [this.context.preSnapshot.api.id])
      || !validIso(fence.lastVerifiedAt) || !validIso(fence.leaseExpiresAt) || Date.parse(fence.lastVerifiedAt) > this.now()
      || Date.parse(fence.lastVerifiedAt) < Date.parse(this.context.window.start) || this.now() - Date.parse(fence.lastVerifiedAt) > 30000
      || Date.parse(fence.leaseExpiresAt) > Date.parse(this.context.window.end) || Date.parse(fence.leaseExpiresAt) <= this.now() + commandBudgetMs
      || bodies.recovery.materialsAvailable !== true || !HASH.test(bodies.recovery.materialsSha256 || '')) hold('REPLACEMENT_CURRENT_ISOLATION_OR_RECOVERY_REQUIRED');
    if (await this.verifyPublicFence({ context: this.context, owner: this.context.owner, phase: 'FENCED', participants: [] }) !== true) hold('REPLACEMENT_PUBLIC_STARTUP_DENY_UNVERIFIED');
    return bodies;
  }
  async replace() {
    const marker = await this.admission(); const bodies = await this.priorEvidence();
    const source = this.verifySource();
    if (!HASH.test(source.composeFileSha256 || '') || this.context.replacement?.composeFileSha256 !== source.composeFileSha256
      || this.context.replacement?.project !== this.project) hold('REPLACEMENT_COMPOSE_DIGEST_REQUIRED');
    const old = this.context.preSnapshot.api, current = inspectReplacementRuntime(old.id, this.run);
    if (!pinsMatch(current, old) || current.running || current.pid !== 0 || current.status !== 'exited' || current.restarting || current.dead
      || current.restartPolicy !== 'no' || current.networks.length || current.project !== this.project || current.service !== 'api') hold('REPLACEMENT_OLD_NOT_EXACT_STOPPED_ISOLATED');
    const preInventory = inventory(this.run);
    const approvedInventory = bodies.isolation.inventory;
    if (!approvedInventory || !same(preInventory, approvedInventory.allDockerIds?.slice().sort())) hold('REPLACEMENT_COMPLETE_INVENTORY_REQUIRED');
    unchangedServices(this.context.preSnapshot, this.run);
    const actualImage = this.run(['image', 'inspect', this.context.candidate.imageId, '--format', '{{json .Id}}\t{{json .Config.Labels}}']).split('\t').map(JSON.parse);
    if (actualImage[0] !== this.context.candidate.imageId || actualImage[1]?.['org.opencontainers.image.revision'] !== this.context.targetSha) hold('REPLACEMENT_CANDIDATE_IMAGE_REQUIRED');
    // Compose resolves `image:` as a repository reference, not a bare local
    // image ID; retag the already-verified candidate image locally under an
    // exact owner-scoped name so `--pull never --no-build` resolves it.
    const localCandidateTag = `phoenix-maintenance-${this.context.owner}:candidate`;
    this.run(['tag', this.context.candidate.imageId, localCandidateTag]);
    const override = { services: { api: { image: localCandidateTag, restart: 'no' } } };
    const overrideFile = path.join(this.store.directory, `maintenance-replacement-compose-${this.context.owner}.json`);
    const args = replacementCommand({ root: source.root, project: this.project, overrideFile });
    const intent = { schema: 'phoenix.maintenance-replacement-intent/v1', owner: this.context.owner, bindingDigest: bindingDigest(this.context),
      operationIntentSha256: canonicalDigest(marker), oldExecutor: old, candidate: this.context.candidate, project: this.project,
      composeFileSha256: source.composeFileSha256, overrideSha256: canonicalDigest(override), commandSha256: canonicalDigest(args),
      stoppedEvidenceSha256: this.prerequisites.stopped.evidenceSha256, reconciliationEvidenceSha256: this.prerequisites.reconciliation.evidenceSha256,
      isolationEvidenceSha256: this.prerequisites.isolation.evidenceSha256, recoveryEvidenceSha256: this.prerequisites.recovery.evidenceSha256,
      preInventorySha256: canonicalDigest(preInventory), preparedAt: iso(this.now()) };
    // Exclusive root writes precede EVERY possible container mutation.
    this.store.immutable(overrideFile, override);
    this.store.immutable(path.join(this.store.directory, `maintenance-replacement-intent-${this.context.owner}.json`), intent);
    const start = iso(this.now()); let events, observerCloseAttempted = false, effectError = null;
    try {
      const daemonTime = Date.parse(this.run(['info', '--format', '{{.SystemTime}}']));
      if (!Number.isFinite(daemonTime) || Math.abs(daemonTime - this.now()) > 1000) hold('REPLACEMENT_DAEMON_CLOCK_UNPROVEN');
      await this.events.start(start);
      await this.admission(); await this.priorEvidence();
      const lastOld = inspectReplacementRuntime(old.id, this.run);
      if (!same(this.verifySource(), source) || !same(inventory(this.run), preInventory)
        || !pinsMatch(lastOld, old) || lastOld.running || lastOld.pid !== 0 || lastOld.status !== 'exited' || lastOld.restarting || lastOld.dead
        || lastOld.restartPolicy !== 'no' || lastOld.networks.length) hold('REPLACEMENT_PRE_EFFECT_DRIFT');
      this.execute(args, { timeoutMs: commandBudgetMs, env: { ...executionEnv(), API_IMAGE: this.context.candidate.imageId,
        WEB_IMAGE: this.context.preSnapshot.web.imageId, CHANJET_SYNC_POLICY: 'HOLD', CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' } });
      this.window(); this.guard();
      const after = inventory(this.run), added = after.filter(id => !preInventory.includes(id)), removed = preInventory.filter(id => !after.includes(id));
      if (!same(removed, [old.id]) || added.length !== 1) hold('REPLACEMENT_UNEXPECTED_INVENTORY_DELTA');
      const candidate = inspectReplacementRuntime(added[0], this.run);
      if (candidate.imageId !== this.context.candidate.imageId || candidate.revision !== this.context.targetSha || !candidate.running
        || candidate.restartPolicy !== 'no' || candidate.restartCount !== 0 || candidate.project !== this.project || candidate.service !== 'api') hold('REPLACEMENT_CANDIDATE_DRIFT');
      const mounts = JSON.parse(this.run(['inspect', candidate.id, '--format', '{{json .Mounts}}']));
      const controlMounts = mounts.filter(m => typeof m.Destination === 'string' && ('/run/phoenix-background-control' === m.Destination
        || '/run/phoenix-background-control'.startsWith(m.Destination + '/')));
      if (controlMounts.length !== 1 || controlMounts[0].Type !== 'bind' || controlMounts[0].Source !== this.publicSource
        || controlMounts[0].Destination !== '/run/phoenix-background-control' || controlMounts[0].RW !== false) hold('REPLACEMENT_CANDIDATE_CONTROL_MOUNT_UNPROVEN');
      const candidatePublicMount = { source: this.publicSource, destination: '/run/phoenix-background-control', type: 'bind', readOnly: true };
      unchangedServices(this.context.preSnapshot, this.run);
      if (JSON.parse(this.run(['image', 'inspect', old.imageId, '--format', '{{json .Id}}'])) !== old.imageId) hold('REPLACEMENT_OLD_IMAGE_NOT_RETAINED');
      await this.admission(); this.window();
      if (!same(this.verifySource(), source) || !same(inventory(this.run), after)
        || !pinsMatch(inspectReplacementRuntime(candidate.id, this.run), candidate)) hold('REPLACEMENT_POST_EFFECT_DRIFT');
      if (await this.verifyPublicFence({ context: this.context, owner: this.context.owner, phase: 'FENCED', participants: [] }) !== true
        || Date.parse(bodies.isolation.leaseExpiresAt) <= this.now() + 5000) hold('REPLACEMENT_POST_EFFECT_FENCE_OR_LEASE_LOST');
      // Cover all potentially slow authority, remote-main and runtime probes.
      // This tombstone is explicitly bounded; the next typed phase MUST establish
      // continuous candidate fencing. It grants no future ingress/OPEN authority.
      await wait(20); const end = iso(this.now()); events = await this.events.finish(end);
      const lifecycle = validateReplacementLifecycle(events, { oldId: old.id, candidateId: candidate.id, project: this.project, start, end });
      // Close/join the ORIGINAL observer and validate its final flushed data
      // before any completed receipt. Exit alone is not stdio closure.
      observerCloseAttempted = true; await this.events.close(); this.window(); this.guard();
      if (Date.parse(bodies.isolation.leaseExpiresAt) <= this.now() + 5000) hold('REPLACEMENT_POST_EFFECT_LEASE_EXPIRED');
      const body = { protocol: 'CONTROLLED_COMPOSE_REPLACEMENT', legacyDrainResult: 'UNSUPPORTED', oldDisposition: 'REMOVED_BY_CONTROLLED_REPLACEMENT',
        owner: this.context.owner, oldExecutor: old, candidate, project: this.project, replacementIntentSha256: canonicalDigest(intent),
        ...Object.fromEntries(bodyHashes.filter(key => key in intent).map(key => [key, intent[key]])), eventsSha256: canonicalDigest(events),
        preInventorySha256: canonicalDigest(preInventory), postInventorySha256: canonicalDigest(after), recoveryMaterialsSha256: bodies.recovery.materialsSha256,
        unexpectedExecutors: 0, oldImageRetained: true, webDbUnchanged: true, runMigration: false, webSwitched: false, interval: { start, end }, lifecycle,
        eventProjection: 'ALLOWLISTED_DOCKER_EVENTS_V2_STRING_NANO', candidatePublicMount,
        coverageScope: 'FIXED_REPLACEMENT_INTERVAL_ONLY', postReplacementState: 'HOLD_CANDIDATE_REVALIDATION_REQUIRED' };
      const envelope = createMaintenanceEvidence('CANDIDATE_REPLACEMENT', this.context, body, { capturedAt: iso(this.now()) });
      validateCandidateReplacement(envelope, this.context, { now: this.now(), publicSource: this.publicSource });
      this.store.immutable(path.join(this.store.directory, `maintenance-replacement-events-${this.context.owner}.json`), { events });
      this.store.immutable(path.join(this.store.directory, `maintenance-replacement-${this.context.owner}.json`), envelope);
      return envelope;
    } catch (error) {
      effectError = error;
      let cleanupReason = null;
      if (!observerCloseAttempted) {
        observerCloseAttempted = true;
        try { await this.events.close(); } catch (cleanup) { cleanupReason = /^MAINTENANCE_HOLD=[A-Z_]+$/.test(cleanup?.message || '') ? cleanup.message : 'MAINTENANCE_HOLD=REPLACEMENT_OBSERVER_CLEANUP_FAILED'; }
      } else if (this.events.cleanupDebt?.().evidenceFailed) cleanupReason = 'MAINTENANCE_HOLD=REPLACEMENT_OBSERVER_CLEANUP_OR_EVIDENCE_FAILED';
      // Best-effort immutable diagnostics never clear the pending operation or
      // turn a partial effect into success. If authority/storage was lost, the
      // original error remains authoritative and no unsafe fallback is used.
      try {
        let captured = [];
        try { captured = this.events.snapshot?.() || []; } catch {}
        const reason = /^MAINTENANCE_HOLD=[A-Z_]+$/.test(error?.message || '') ? error.message : 'MAINTENANCE_HOLD=REPLACEMENT_EFFECT_FAILED';
        this.store.immutable(path.join(this.store.directory, `maintenance-replacement-failure-${this.context.owner}.json`), {
          schema: 'phoenix.maintenance-replacement-failure/v1', owner: this.context.owner, bindingDigest: bindingDigest(this.context),
          outcome: 'HOLD', reason, cleanupReason, observerCleanupDebt: this.events.cleanupDebt?.() || { status: 'NOT_AVAILABLE' }, capturedAt: iso(this.now()), replacementIntentSha256: canonicalDigest(intent),
          eventProjection: 'ALLOWLISTED_DOCKER_EVENTS_V2_STRING_NANO', events: captured.slice(0, 255), eventsTruncated: captured.length > 255,
          continuityClaim: false, automaticRecoveryAttempted: false });
      } catch {}
      throw error;
    } finally { if (!observerCloseAttempted) { observerCloseAttempted = true; try { await this.events.close(); } catch (cleanup) { if (!effectError) throw cleanup; } } }
  }
}
