/** Production maintenance adapters. No CLI and no ambient authority fallback.
 * A stopped legacy process is STOP_AND_RECONCILE, never a DRAIN receipt. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { CONTRACT, verifyContext } from './production-config-guard.mjs';
import { executionEnv } from './capture-production-runtime.mjs';
import { canonicalDigest, bindingDigest, createMaintenanceEvidence, validateMaintenanceContext } from './production-maintenance-receipts.mjs';
import { requireLegacyTerminationApproval } from './production-maintenance-termination-policy.mjs';

const ID = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const hold = reason => { throw new Error(`MAINTENANCE_HOLD=${reason}`); };
// Tokens are private, single-use and minted only after durable exact-ID intent.
// A caller cannot use the public mutation adapter as an alternate STOP entry.
const stopPermissions = new WeakMap();
const attemptedStops = new WeakMap();
const activeStops = new WeakMap();
const stopDebts = new WeakMap();

/** One monotonic 60s admission/effect/inspection budget. The original window
 * also sets a monotonic deadline, so a frozen wall clock cannot extend it.
 * Pending readonly approval work is observed, aborted and never called closed
 * merely because the bounded wait timed out. It cannot revive permission. */
function boundedStopScope(context,wall,monotonic,checkBinding) {
  const start=monotonic(),wallStart=wall();let last=start,lastWall=wallStart,failed=false;
  if(!Number.isFinite(start)||!Number.isFinite(wallStart))hold('STOP_ADMISSION_CLOCK');
  const deadline=start+Math.min(60000,Date.parse(context.window.end)-wallStart);
  const controller=new AbortController(),pending=new Set();
  const cancel=()=>{failed=true;controller.abort();};
  const remaining=()=>{
    try{checkBinding();}catch(error){cancel();throw error;}
    const at=monotonic(),clock=wall();
    if(failed||!Number.isFinite(at)||!Number.isFinite(clock)||at<last||clock<lastWall||at>=deadline
      ||clock<Date.parse(context.window.start)||clock>=Date.parse(context.window.end)){cancel();hold('STOP_ADMISSION_DEADLINE_OR_CLOCK');}
    last=at;lastWall=clock;const left=Math.floor(deadline-at);if(left<1){cancel();hold('STOP_ADMISSION_DEADLINE_OR_CLOCK');}return left;
  };
  return {remaining,signal:controller.signal,cancel,pending,
    async wait(action){
      const before=remaining(),ms=Math.min(10000,before);
      const work=Promise.resolve().then(()=>{remaining();return action({signal:controller.signal,timeoutMs:ms});});pending.add(work);
      work.then(()=>pending.delete(work),()=>pending.delete(work));
      let timer;
      try{const result=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{cancel();reject(Error('MAINTENANCE_HOLD=STOP_AUTHORIZATION_TIMEOUT'));},ms);})]);
        if(before-remaining()>=ms){cancel();hold('STOP_AUTHORIZATION_TIMEOUT');}return result;}
      catch(error){cancel();throw error;}finally{clearTimeout(timer);}
    },
    read(run,args){const before=remaining(),ms=Math.min(10000,before);const value=run(args,{timeoutMs:ms});
      if(before-remaining()>=ms){cancel();hold('STOP_READ_TIMEOUT');}return value;}
  };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const STATE_FIELDS = '{{json .State.Running}}\t{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}\t{{json .State.Pid}}\t{{json .State.Status}}\t{{json .State.Restarting}}\t{{json .State.Dead}}\t{{json .State.ExitCode}}\t{{json .State.OOMKilled}}\t{{json .State.StartedAt}}';
export const LEGACY_DOMAINS = ['NOTIFICATION_EXTERNAL_SEND', 'IOT_PARTIAL_COMMITS', 'CHANJET_AUTH_REQUESTS', 'DATABASE_TRANSACTIONS', 'PERSISTENT_TASKS'];
export const runtimeDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function validateRuntimePin(pin, { revisionRequired = true } = {}) {
  if (!pin || !ID.test(pin.id) || !/^sha256:[a-f0-9]{64}$/.test(pin.imageId)
    || (revisionRequired && !SHA.test(pin.revision)) || !iso(pin.startedAt)
    || !Number.isSafeInteger(pin.restartCount) || pin.restartCount < 0) hold('RUNTIME_IDENTITY');
  return pin;
}
export function validateHealthyPre(snapshot) {
  for (const name of ['api', 'web', 'db']) {
    const pin = validateRuntimePin(snapshot?.[name], { revisionRequired: name !== 'db' });
    if (pin.running !== true || pin.health !== 'healthy' || pin.restarting !== false
      || pin.dead !== false || !Number.isSafeInteger(pin.pid) || pin.pid <= 0) hold('PRE_RUNTIME_NOT_HEALTHY');
  }
  return snapshot;
}
export function validateExecutorInventory(inventory, expected) {
  if (!Array.isArray(expected) || expected.length < 1 || expected.length > 128) hold('EXECUTOR_INVENTORY');
  const ids = expected.map(p => validateRuntimePin(p).id).sort();
  if (new Set(ids).size !== ids.length || inventory?.hostInventoryComplete !== true
    || inventory?.unaccountedExecutors !== 0 || !same(inventory?.dockerExecutorIds?.slice().sort(), ids)
    || !Array.isArray(inventory.allDockerIds) || !Array.isArray(inventory.classifiedNonExecutorIds)) hold('UNACCOUNTED_EXECUTOR');
  const all = inventory.allDockerIds.slice().sort(), classified = [...ids, ...inventory.classifiedNonExecutorIds].sort();
  if (all.some(id => !ID.test(id)) || new Set(all).size !== all.length || new Set(classified).size !== classified.length || !same(all, classified)) hold('UNCLASSIFIED_DOCKER_RUNTIME');
  return inventory;
}
/** The receipt must be produced by an installed, independently verified ingress
 * controller. A snapshot or a caller's boolean is not an enforcement mechanism. */
export function validateContinuousFence(proof, expected, now = Date.now()) {
  const ids = expected.map(p => p.id).sort();
  if (!proof || proof.state !== 'FROZEN' || proof.continuous !== true
    || typeof proof.mechanismId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(proof.mechanismId)
    || !iso(proof.enforcedAt) || !iso(proof.lastVerifiedAt) || !iso(proof.leaseExpiresAt)
    || Date.parse(proof.enforcedAt) > Date.parse(proof.lastVerifiedAt) || Date.parse(proof.lastVerifiedAt) > now
    || now - Date.parse(proof.lastVerifiedAt) > 5000 || Date.parse(proof.leaseExpiresAt) <= now
    || proof.revival?.state !== 'ENFORCED' || proof.revival.restartPolicy !== 'no'
    || proof.revival.orchestratorsDisabled !== true || !same(proof.revival.executorIds?.slice().sort(), ids)) hold('CONTINUOUS_INGRESS_OR_REVIVAL_PROOF');
  return proof;
}
export function validateStoppedSamples(before, first, second, { minimumIntervalMs = 1000 } = {}) {
  validateRuntimePin(before);
  for (const sample of [first, second]) {
    validateRuntimePin(sample);
    for (const field of ['id', 'imageId', 'revision', 'startedAt', 'restartCount']) if (sample[field] !== before[field]) hold('STOPPED_RUNTIME_IDENTITY_CHANGED');
    if (sample.running !== false || sample.pid !== 0 || sample.status !== 'exited' || sample.restarting !== false
      || sample.dead !== false || !Number.isInteger(sample.exitCode) || typeof sample.oomKilled !== 'boolean'
      || !iso(sample.checkedAt)) hold('OLD_EXECUTOR_NOT_STOPPED');
  }
  if (Date.parse(second.checkedAt) - Date.parse(first.checkedAt) < minimumIntervalMs) hold('STOP_OBSERVATION_INTERVAL');
  return { ...before, before, running: false, revives: false, first, second };
}
export function validateDatabaseQuiescence(proof) {
  // Prepared xacts can survive all API sessions; persistent queued work can be
  // admitted by another executor. Neither can be inferred from PID disappearance.
  if (!proof || proof.ownershipComplete !== true
    || ['remainingConnections', 'openTransactions', 'preparedTransactions', 'persistentRunning', 'persistentQueued'].some(key => proof[key] !== 0)) hold('DATABASE_OR_PERSISTENT_WORK_REMAINS');
  return proof;
}
export function evaluateLegacyReconciliation(domains) {
  const findings = LEGACY_DOMAINS.filter(domain => {
    const item = Array.isArray(domains) && domains.find(d => d.domain === domain);
    return !item || item.disposition !== 'RECONCILED' || item.unknownEffects !== 0 || item.pendingWrites !== 0
      || item.requiresReplay !== false || item.requiresBusinessMutation !== false;
  });
  return { protocol: 'STOP_AND_RECONCILE', legacyDrainResult: 'UNSUPPORTED', result: findings.length ? 'HOLD' : 'RECONCILED', reasons: findings.map(domain => `${domain}_UNRECONCILED`) };
}

/** Output only the allowlisted fields, never Docker Config.Env or mounts. */
export function inspectDockerRuntime(id, run = productionDockerRead) {
  if (!ID.test(id)) hold('FULL_CONTAINER_ID_REQUIRED');
  const [actualId, imageId, restartCount, restartPolicy, running, health, pid, status, restarting, dead, exitCode, oomKilled, startedAt] = run(['inspect', id, '--format', `{{json .Id}}\t{{json .Image}}\t{{json .RestartCount}}\t{{json .HostConfig.RestartPolicy.Name}}\t${STATE_FIELDS}`])
    .split('\t').map(JSON.parse);
  if (actualId !== id || !/^sha256:[a-f0-9]{64}$/.test(imageId)) hold('RUNTIME_IDENTITY');
  const revision = run(['image', 'inspect', imageId, '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}']);
  return { id, imageId, revision, startedAt, restartCount, restartPolicy,
    running, health: health || 'none', pid, status, restarting, dead,
    exitCode, oomKilled, checkedAt: new Date().toISOString() };
}

export function productionDockerRead(args) {
  productionRuntimeGuard();
  const permitted = args[0] === 'inspect' || args[0] === 'ps' || (args[0] === 'image' && args[1] === 'inspect');
  if (!permitted) hold('READONLY_DOCKER_COMMAND_REQUIRED');
  try { return execFileSync('/usr/bin/docker', args, { encoding: 'utf8', env: executionEnv(), timeout: 10000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { hold('DOCKER_INSPECTION_FAILED'); }
}
export function productionRuntimeGuard() {
  // Existing verifier validates UID 0, private 0700 trusted paths and the real
  // inherited FD 9 inode/held flock. Never replace with UID/env assertions.
  verifyContext(CONTRACT.repository, CONTRACT.stateDirectory);
}

/** Transport implementations are explicit dependencies. No installed production
 * ingress controller => HOLD; this library never invents firewall rules. */
export class LegacyMaintenanceRuntime {
  constructor({ context, authority, transport, evidenceFactory, now = Date.now }) {
    this.context = context; this.authority = authority; this.transport = transport; this.evidenceFactory = evidenceFactory; this.now = now;
    this.ingress = null;
  }
  async authorize(operation) {
    productionRuntimeGuard();
    if (!this.authority || await this.authority.verifyAuthorization?.(this.context, operation) !== true
      || await this.authority.verifyContext?.(this.context) !== true) hold('IMMUTABLE_AUTHORIZATION_REQUIRED');
  }
  async verifiedFence() {
    const envelope = await this.transport?.observeIngress?.(this.context);
    if (!envelope || await this.authority?.verifyEvidence?.(envelope, 'INGRESS_FENCE', this.context) !== true) hold('INGRESS_PRODUCER_UNIMPLEMENTED');
    validateContinuousFence(envelope.body, this.context.executors, this.now());
    return envelope;
  }
  async fenceIngress() {
    await this.authorize('FENCE_INGRESS');
    if (typeof this.transport?.fenceIngress !== 'function') hold('INGRESS_PRODUCER_UNIMPLEMENTED');
    await this.transport.fenceIngress(this.context);
    const envelope = await this.verifiedFence();
    const inventory = await this.transport.inventory(this.context);
    validateExecutorInventory(inventory, this.context.executors);
    this.ingress = envelope;
    return envelope;
  }
  async stopLegacy() {
    await this.authorize('STOP_LEGACY');
    if (!this.ingress) hold('INGRESS_RECEIPT_REQUIRED');
    const interval = { start: new Date(this.now()).toISOString() }, executors = [];
    validateExecutorInventory(await this.transport.inventory(this.context), this.context.executors);
    for (const expected of this.context.executors) {
      await this.verifiedFence();
      const before = await this.transport.inspect(expected.id);
      validateRuntimePin(before);
      if (['id', 'imageId', 'revision', 'startedAt', 'restartCount'].some(k => before[k] !== expected[k])
        || before.restartPolicy !== 'no' || before.running !== true || before.health !== 'healthy') hold('LEGACY_PRE_STOP_BINDING');
      await this.authorize('STOP_LEGACY');
      await this.transport.stop(expected.id, { timeoutSeconds: 30 });
      const first = await this.transport.inspect(expected.id);
      await this.transport.wait(1000);
      await this.verifiedFence();
      const second = await this.transport.inspect(expected.id);
      executors.push(validateStoppedSamples(expected, first, second));
    }
    validateExecutorInventory(await this.transport.inventory(this.context), this.context.executors);
    const database = validateDatabaseQuiescence(await this.transport.databaseQuiescence(this.context));
    const fence = await this.verifiedFence();
    interval.end = new Date(this.now()).toISOString();
    if (typeof this.evidenceFactory !== 'function') hold('EVIDENCE_FACTORY_UNIMPLEMENTED');
    return this.evidenceFactory('STOP_LEGACY', this.context, { protocol: 'STOP_AND_RECONCILE', legacyDrainResult: 'UNSUPPORTED',
      ingressFenceDigest: this.ingress.evidenceSha256, executors, database, interval,
      continuousFenceEvidenceSha256: fence.evidenceSha256 });
  }
}

const ISOLATION_INSPECT = `{{json .Id}}\t{{json .Image}}\t{{json .RestartCount}}\t${STATE_FIELDS}\t{{json .HostConfig.NetworkMode}}\t{{json .HostConfig.RestartPolicy.Name}}\t{{json .HostConfig.Privileged}}\t{{json .HostConfig.PidMode}}\t{{json .Mounts}}\t{{json .NetworkSettings.Networks}}\t{{json (index .Config.Labels "com.docker.swarm.service.id")}}\t{{json .HostConfig.CapAdd}}\t{{json .HostConfig.Devices}}\t{{json .HostConfig.DeviceRequests}}\t{{json .HostConfig.IpcMode}}\t{{json .HostConfig.UTSMode}}`;
function productionDockerCommand(args, { timeoutMs = 10000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 35000) hold('BOUNDED_DOCKER_COMMAND_REQUIRED');
  try { return execFileSync('/usr/bin/docker', args, { encoding: 'utf8', env: executionEnv(), timeout: timeoutMs, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { hold('DOCKER_MAINTENANCE_COMMAND_FAILED'); }
}
export function assertNoHostControlMount(source) {
  if (!path.isAbsolute(source) || path.normalize(source) !== source || source.endsWith('/')) hold('EXECUTOR_HOST_CONTROL_MOUNT');
  const controls = ['/run', '/var/run', '/var/lib/docker', '/var/lib/containerd', '/proc', '/sys', '/dev', '/etc', '/root', '/home', '/data/phoenix-erp-data/postgres'];
  if (controls.some(control => source === control || source.startsWith(control + '/') || control.startsWith(source + '/')) || source === '/') hold('EXECUTOR_HOST_CONTROL_MOUNT');
}
/** Enforces the bounded Docker part of an approved maintenance window. Root or
 * another Docker authority can reconnect/start containers; this is why host
 * orchestrator exclusion and continual independently verified inventory are
 * mandatory, not inferred from restart=no. No automatic reconnect is provided. */
export class DockerNetworkIsolationProducer {
  constructor({ context, approval, infrastructureEvidence, store, authority, now = Date.now }, dependencies = {}) {
    validateMaintenanceContext(context);
    this.context = structuredClone(context); this.approval = approval; this.infrastructureEvidence = infrastructureEvidence;
    this.store = store; this.authority = authority; this.now = now;
    this.guard = dependencies.guard || productionRuntimeGuard; this.run = dependencies.run || productionDockerCommand;
    this.enforcedAt = null; this.networks = context.networkIsolation?.networks;
    stopPermissions.set(this,new Set());
    attemptedStops.set(this,new Set());
    stopDebts.set(this,new Set());
    this.monotonic=dependencies.monotonic||(()=>performance.now());
    if (!Array.isArray(this.networks) || !this.networks.length || this.networks.length > 32
      || this.networks.some(n => !ID.test(n.id) || !/^[a-zA-Z0-9_.-]{1,128}$/.test(n.name) || n.driver !== 'bridge')
      || new Set(this.networks.map(n => n.id)).size !== this.networks.length) hold('APPROVED_BRIDGE_NETWORK_INVENTORY_REQUIRED');
  }
  async authorized(operation,scope) {
    scope?.remaining();
    this.guard();
    this.assertWindow();
    if (operation==='STOP_LEGACY') requireLegacyTerminationApproval(this.approval,this.context);
    const now = this.now();
    const request={purpose:'FENCE_INGRESS',operation,bindingDigest:bindingDigest(this.context),targetSha:this.context.targetSha,context:this.context};
    const checkAuthority=options=>this.authority?.verifyAuthority?.(this.approval,{...request,...options});
    const checkInfrastructure=options=>this.authority?.verifyInfrastructure?.(this.infrastructureEvidence,{context:this.context,now,...options});
    if ((scope?await scope.wait(checkAuthority):await checkAuthority({}))!==true
      ||(scope?await scope.wait(checkInfrastructure):await checkInfrastructure({}))!==true)hold('INDEPENDENT_NETWORK_MAINTENANCE_AUTHORITY_REQUIRED');
    scope?.remaining();
    this.guard(); this.assertWindow();
    const body = this.infrastructureEvidence?.body;
    if (body?.hostInventoryComplete !== true || body?.orchestratorsDisabled !== true || body?.unknownHostExecutors !== 0
      || body?.swarmActive !== false || body?.watchtowerPresent !== false || !Array.isArray(body?.classifiedNonExecutorIds)) hold('UNPROVEN_HOST_ORCHESTRATOR_EXCLUSION');
    const read=args=>scope?scope.read(this.run,args):this.run(args);
    const all = read(['ps', '-a', '--no-trunc', '-q']).split('\n').filter(Boolean).sort();
    validateExecutorInventory({ hostInventoryComplete: true, unaccountedExecutors: 0, dockerExecutorIds: this.context.executors.map(p => p.id), allDockerIds: all, classifiedNonExecutorIds: body.classifiedNonExecutorIds }, this.context.executors);
    for (const id of body.classifiedNonExecutorIds) {
      // A supposedly non-executor sidecar sharing the old API's namespace can
      // still reach loopback after bridge detach. No shared-namespace exception.
      const [networkMode, pidMode] = read(['inspect', id, '--format', '{{json .HostConfig.NetworkMode}}\t{{json .HostConfig.PidMode}}']).split('\t').map(JSON.parse);
      if ([networkMode, pidMode].some(mode => typeof mode !== 'string' || mode.startsWith('container:'))) hold('UNSUPPORTED_SHARED_NAMESPACE_SIDECAR');
    }
    if (read(['info', '--format', '{{.Swarm.LocalNodeState}}']) !== 'inactive') hold('SWARM_ORCHESTRATOR_UNSUPPORTED');
    for (const network of this.networks) {
      const [id, name, driver, networkScope] = read(['network', 'inspect', network.id, '--format', '{{json .Id}}\t{{json .Name}}\t{{json .Driver}}\t{{json .Scope}}']).split('\t').map(JSON.parse);
      if (id !== network.id || name !== network.name || driver !== 'bridge' || networkScope !== 'local') hold('APPROVED_BRIDGE_NETWORK_CHANGED');
    }
    this.assertWindow();
  }
  assertWindow(budgetMs = 0) {
    const now = this.now();
    if (!Number.isFinite(now)||now < Date.parse(this.context.window.start) || now + budgetMs >= Date.parse(this.context.window.end)) hold('MAINTENANCE_WINDOW_CLOSED');
  }
  async mutate(operation, args, budgetMs, stopPermission,scope) {
    const executor = id => this.context.executors.some(p => p.id === id);
    const approved = (operation === 'DISABLE_RESTART_POLICY' && args.length === 3 && args[0] === 'update' && args[1] === '--restart=no' && executor(args[2]) && budgetMs === 10000)
      || (operation === 'DISCONNECT_LEGACY_NETWORKS' && args.length === 4 && args[0] === 'network' && args[1] === 'disconnect' && this.networks.some(n => n.id === args[2]) && executor(args[3]) && budgetMs === 10000)
      || (operation === 'STOP_LEGACY' && args.length === 6 && args[0] === 'stop' && args[1] === '--signal' && args[2] === 'SIGTERM'
        && args[3] === '--time' && args[4] === '30' && executor(args[5]) && budgetMs === 35000);
    if (!approved) hold('TYPED_MAINTENANCE_COMMAND_REQUIRED');
    this.guard();this.assertWindow(budgetMs);
    if(operation==='STOP_LEGACY'){
      const permissions=stopPermissions.get(this);
      if(!permissions.has(stopPermission)||stopPermission.id!==args[5])hold('STOP_TYPED_INTENT_REQUIRED');
      permissions.delete(stopPermission);
    }
    await this.authorized(operation,scope);
    if(operation==='STOP_LEGACY'){
      const actual=this.inspect(args[5],scope);
      if(actual.attached.length||actual.restartPolicy!=='no')hold('NETWORK_ISOLATION_LOST');
      if(!actual.running||actual.pid<=0||actual.status!=='running'||actual.restarting||actual.dead||actual.oomKilled)hold('LEGACY_NOT_RUNNING_BEFORE_STOP');
      const {policySha256}=requireLegacyTerminationApproval(this.approval,this.context);
      if(stopPermission.contextDigest!==bindingDigest(this.context)||stopPermission.policySha256!==policySha256
        ||stopPermission.approvalDigest!==canonicalDigest(this.approval)||stopPermission.commandSha256!==canonicalDigest(args)
        ||stopPermission.store!==this.store)hold('STOP_AUTHORIZATION_BINDING_CHANGED');
      scope?.remaining();let persisted;try{persisted=this.store.read(stopPermission.intentFile);}catch{hold('STOP_INTENT_CHANGED');}scope?.remaining();
      if(canonicalDigest(persisted)!==stopPermission.intentDigest)hold('STOP_INTENT_CHANGED');
    }
    this.guard(); this.assertWindow(budgetMs);
    if(operation==='STOP_LEGACY'&&(!scope||scope.remaining()<35000))hold('STOP_FULL_COMMAND_BUDGET_UNAVAILABLE');
    const beforeCommand=scope?.remaining();
    const result = this.run(args, { timeoutMs: budgetMs });
    if(scope&&beforeCommand-scope.remaining()>=budgetMs)hold('STOP_COMMAND_ACCEPTANCE_TIMEOUT');
    this.assertWindow(); return result;
  }
  inspect(id,scope) {
    if (!this.context.executors.some(p => p.id === id)) hold('UNAPPROVED_EXECUTOR');
    const [actualId, imageId, restartCount, running, health, pid, status, restarting, dead, exitCode, oomKilled, startedAt,
      networkMode, restartPolicy, privileged, pidMode, mounts, networks, swarmServiceId, capAdd, devices, deviceRequests, ipcMode, utsMode] = (scope?scope.read(this.run,['inspect',id,'--format',ISOLATION_INSPECT]):this.run(['inspect',id,'--format',ISOLATION_INSPECT])).split('\t').map(JSON.parse);
    const expected = this.context.executors.find(p => p.id === id);
    if (actualId !== id || imageId !== expected.imageId || startedAt !== expected.startedAt || restartCount !== expected.restartCount
      || privileged !== false || !['', 'private'].includes(pidMode) || typeof networkMode !== 'string' || ['host', 'none'].includes(networkMode) || networkMode.startsWith('container:')
      || (capAdd && (!Array.isArray(capAdd) || capAdd.length)) || (devices && (!Array.isArray(devices) || devices.length))
      || (deviceRequests && (!Array.isArray(deviceRequests) || deviceRequests.length)) || !['', 'private'].includes(ipcMode) || !['', 'private'].includes(utsMode)
      || swarmServiceId || !Array.isArray(mounts)
      || mounts.some(m => m.Type !== 'bind' || !Array.isArray(this.context.networkIsolation.approvedMounts)
        || !this.context.networkIsolation.approvedMounts.some(a => a.source === m.Source && a.destination === m.Destination && a.readWrite === m.RW))) hold('UNSUPPORTED_LEGACY_EXECUTOR_CONFIGURATION');
    for (const mount of mounts) assertNoHostControlMount(mount.Source);
    const attached = Object.entries(networks || {}).map(([name, n]) => ({ name, id: n.NetworkID }));
    if (attached.some(n => !this.networks.some(a => a.id === n.id && a.name === n.name))) hold('UNKNOWN_EXECUTOR_NETWORK');
    return { ...expected, running, health: health || 'none', pid, status,
      restarting, dead, exitCode, oomKilled,
      restartPolicy, attached, checkedAt: new Date(this.now()).toISOString() };
  }
  async fenceIngress() {
    await this.authorized('DISCONNECT_LEGACY_NETWORKS');
    for (const p of this.context.executors) {
      const actual = this.inspect(p.id);
      if (!actual.running || actual.health !== 'healthy' || !actual.attached.length) hold('LEGACY_PRE_ISOLATION_NOT_HEALTHY');
    }
    if (typeof this.store?.immutable !== 'function' || typeof this.store?.directory !== 'string') hold('IMMUTABLE_INTENT_STORE_REQUIRED');
    // O_EXCL immutable store refuses accidental retry. Parent state machine also
    // holds its pending marker before entering this effect.
    this.store.immutable(`${this.store.directory}/maintenance-network-intent-${this.context.owner}.json`, {
      schema: 'phoenix.maintenance-network-intent/v1', bindingDigest: bindingDigest(this.context),
      executorIds: this.context.executors.map(p => p.id), networkIds: this.networks.map(n => n.id),
      previousRestartPolicies: this.context.executors.map(p => ({ id: p.id, policy: this.inspect(p.id).restartPolicy })),
      protocol: 'STOP_AND_RECONCILE', automaticReconnect: false, recordedAt: new Date(this.now()).toISOString() });
    for (const p of this.context.executors) {
      await this.mutate('DISABLE_RESTART_POLICY', ['update', '--restart=no', p.id], 10000);
      const actual = this.inspect(p.id);
      if (actual.restartPolicy !== 'no') hold('RESTART_POLICY_NOT_DISABLED');
      for (const network of actual.attached) {
        await this.mutate('DISCONNECT_LEGACY_NETWORKS', ['network', 'disconnect', network.id, p.id], 10000);
      }
    }
    this.enforcedAt = new Date(this.now()).toISOString();
    return this.observeIngress();
  }
  async observeIngress(scope) {
    await this.authorized('OBSERVE_NETWORK_ISOLATION',scope);
    if (!this.enforcedAt) hold('NETWORK_ISOLATION_NOT_ESTABLISHED');
    for (const p of this.context.executors) {
      const actual = this.inspect(p.id,scope);
      if (actual.attached.length !== 0 || actual.restartPolicy !== 'no' || actual.restarting) hold('NETWORK_ISOLATION_LOST');
    }
    const capturedAt = new Date(this.now()).toISOString();
    return createMaintenanceEvidence('INGRESS_FENCE', this.context, { state: 'FROZEN', continuous: true,
      mechanismId: 'docker-network-isolation-v1', enforcedAt: this.enforcedAt, lastVerifiedAt: capturedAt,
      leaseExpiresAt: this.context.window.end,
      revival: { state: 'ENFORCED', restartPolicy: 'no', orchestratorsDisabled: true, executorIds: this.context.executors.map(p => p.id) },
      retainedExecutorIds: this.context.executors.map(p => p.id), disconnectedNetworkIds: this.networks.map(n => n.id),
      businessEffects: 'UNKNOWN_REQUIRES_STOP_AND_RECONCILE', hostInfrastructureEvidenceSha256: canonicalDigest(this.infrastructureEvidence),
    }, { capturedAt });
  }
  async stop(id) {
    if(this.cleanupDebt().pendingAuthorityPromises>0)hold('STOP_PENDING_AUTHORITY_DEBT');
    if(attemptedStops.get(this).has(id)||activeStops.has(this))hold('STOP_ATTEMPT_REUSED_OR_ACTIVE');
    attemptedStops.get(this).add(id);
    const entryContext=bindingDigest(this.context),entryApproval=canonicalDigest(this.approval);
    const scope=boundedStopScope(this.context,this.now,this.monotonic,()=>{
      if(bindingDigest(this.context)!==entryContext||canonicalDigest(this.approval)!==entryApproval)hold('STOP_ADMISSION_BINDING_CHANGED');
    });activeStops.set(this,scope);
    try{
    await this.observeIngress(scope); await this.authorized('STOP_LEGACY',scope);
    const actual = this.inspect(id,scope);
    if (actual.attached.length || actual.restartPolicy !== 'no') hold('NETWORK_ISOLATION_LOST');
    if(!actual.running||actual.pid<=0||actual.status!=='running'||actual.restarting||actual.dead||actual.oomKilled)hold('LEGACY_NOT_RUNNING_BEFORE_STOP');
    const {policySha256}=requireLegacyTerminationApproval(this.approval,this.context);
    const command=['stop','--signal','SIGTERM','--time','30',id];
    this.guard();this.assertWindow(35000);
    if(typeof this.store?.immutable!=='function'||typeof this.store?.read!=='function'||!path.isAbsolute(this.store?.directory||''))hold('IMMUTABLE_STOP_INTENT_STORE_REQUIRED');
    const intentFile=path.join(this.store.directory,`maintenance-stop-intent-${this.context.owner}-${id}.json`);
    const intent={
      schema:'phoenix.maintenance-stop-intent/v1',bindingDigest:bindingDigest(this.context),owner:this.context.owner,
      targetSha:this.context.targetSha,terminationPolicySha256:policySha256,commandSha256:canonicalDigest(command),
      executor:Object.fromEntries(['id','imageId','revision','startedAt','restartCount'].map(k=>[k,actual[k]])),
      maxAttempts:1,automaticRetry:false,recordedAt:new Date(this.now()).toISOString()
    };
    const permission=Object.freeze({id,intentFile,intentDigest:canonicalDigest(intent),store:this.store,
      contextDigest:bindingDigest(this.context),policySha256,approvalDigest:canonicalDigest(this.approval),commandSha256:canonicalDigest(command)});
    scope.remaining();this.store.immutable(intentFile,intent);scope.remaining();stopPermissions.get(this).add(permission);
    try{await this.mutate('STOP_LEGACY',command,35000,permission,scope);}
    finally{stopPermissions.get(this).delete(permission);}
    this.guard();this.assertWindow();scope.remaining();const stopped = this.inspect(id,scope);this.guard();this.assertWindow();scope.remaining();
    if (stopped.running || stopped.pid !== 0 || stopped.status !== 'exited' || stopped.oomKilled!==false) hold('OLD_EXECUTOR_NOT_STOPPED');
    return {...stopped,terminationPolicySha256:policySha256,terminationObservation:'NOT_COLLECTED',legacyDrainResult:'UNSUPPORTED'};
    }finally{scope.cancel();if(scope.pending.size)stopDebts.get(this).add(scope);activeStops.delete(this);}
  }
  /** Local readonly bookkeeping, never executor drain/authority evidence.
   * Abort and timeout do not join an uncooperative underlying verifier. */
  cleanupDebt(){
    const debts=stopDebts.get(this);let pendingAuthorityPromises=0;
    for(const scope of debts){if(!scope.pending.size)debts.delete(scope);else pendingAuthorityPromises+=scope.pending.size;}
    return {pendingAuthorityPromises,unsettledStopScopes:debts.size,productionEvidence:false};
  }
}
