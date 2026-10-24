import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHealthyPre, validateLegacyIsolatedPreStop, validateExecutorInventory, validateContinuousFence, validateStoppedSamples,
  validateDatabaseQuiescence, evaluateLegacyReconciliation, inspectDockerRuntime, LEGACY_DOMAINS, assertNoHostControlMount, DockerNetworkIsolationProducer } from './production-maintenance-runtime.mjs';
import { MAINTENANCE_OPERATIONS } from './production-maintenance-transition.mjs';
import { bindingDigest, canonicalDigest } from './production-maintenance-receipts.mjs';
import { openFixtureAuthority, prepareFixtureAuthorityApproval } from '../ci/maintenance-fixture-authority.fixture.mjs';

const old = 'a'.repeat(40), time = Date.parse('2026-10-18T01:00:00.000Z');
const pin = { id: '1'.repeat(64), imageId: 'sha256:'+'2'.repeat(64), revision: old,
  startedAt: new Date(time - 60000).toISOString(), restartCount: 0, running: true, health: 'healthy', restarting: false, dead: false, pid: 123 };
const healthy = () => ({ api: { ...pin }, web: { ...pin, id: '3'.repeat(64) }, db: { ...pin, id: '4'.repeat(64) } });
const inventory = () => ({ dockerExecutorIds: [pin.id], hostInventoryComplete: true, unaccountedExecutors: 0, allDockerIds: [pin.id, '3'.repeat(64)], classifiedNonExecutorIds: ['3'.repeat(64)] });
const fence = () => ({ state: 'FROZEN', continuous: true, mechanismId: 'test-only-gate', enforcedAt: new Date(time - 1000).toISOString(),
  lastVerifiedAt: new Date(time).toISOString(), leaseExpiresAt: new Date(time + 10000).toISOString(),
  revival: { state: 'ENFORCED', restartPolicy: 'no', orchestratorsDisabled: true, executorIds: [pin.id] } });
const stopped = offset => ({ ...pin, running: false, pid: 0, status: 'exited', exitCode: 137, oomKilled: false, checkedAt: new Date(time + offset).toISOString() });
const database = () => ({ ownershipComplete: true, remainingConnections: 0, openTransactions: 0, preparedTransactions: 0, persistentRunning: 0, persistentQueued: 0 });
test('healthy PRE checks Running and Health independently of installed config guard', () => {
  assert.equal(validateHealthyPre(healthy()).api.running, true);
  for (const name of ['api', 'web', 'db']) for (const change of [{ running: false }, { health: 'unhealthy' }, { pid: 0 }, { restarting: true }]) {
    const snapshot = healthy(); Object.assign(snapshot[name], change); assert.throws(() => validateHealthyPre(snapshot), /PRE_RUNTIME_NOT_HEALTHY/);
  }
});
test('full Docker and host inventory rejects missed replica, unknown host worker and unclassified container', () => {
  assert.equal(validateExecutorInventory(inventory(), [pin]).unaccountedExecutors, 0);
  for (const change of [{ hostInventoryComplete: false }, { unaccountedExecutors: 1 }, { dockerExecutorIds: [] }, { allDockerIds: [pin.id, '3'.repeat(64), '9'.repeat(64)] }]) {
    assert.throws(() => validateExecutorInventory({ ...inventory(), ...change }, [pin]), /UNACCOUNTED_EXECUTOR|UNCLASSIFIED_DOCKER_RUNTIME/);
  }
});
test('continuous fence requires a live producer, bounded freshness and enforced revival prevention', () => {
  assert.equal(validateContinuousFence(fence(), [pin], time).state, 'FROZEN');
  for (const proof of [{ ...fence(), continuous: false }, { ...fence(), lastVerifiedAt: new Date(time - 6000).toISOString() },
    { ...fence(), leaseExpiresAt: new Date(time).toISOString() }, { ...fence(), revival: { ...fence().revival, restartPolicy: 'always' } }]) {
    assert.throws(() => validateContinuousFence(proof, [pin], time), /CONTINUOUS_INGRESS_OR_REVIVAL_PROOF/);
  }
});
test('stopped PID does not conceal revival, identity change or insufficient observation', () => {
  assert.equal(validateStoppedSamples(pin, stopped(0), stopped(1000)).revives, false);
  for (const change of [{ running: true, pid: 7 }, { restartCount: 1 }, { startedAt: new Date(time).toISOString() }, { id: '9'.repeat(64) }]) {
    assert.throws(() => validateStoppedSamples(pin, stopped(0), { ...stopped(1000), ...change }), /OLD_EXECUTOR_NOT_STOPPED|STOPPED_RUNTIME_IDENTITY_CHANGED/);
  }
  assert.throws(() => validateStoppedSamples(pin, stopped(0), stopped(999)), /STOP_OBSERVATION_INTERVAL/);
});
test('lost sessions never imply prepared-transaction or persistent-task quiescence', () => {
  assert.equal(validateDatabaseQuiescence(database()).remainingConnections, 0);
  for (const key of ['remainingConnections', 'openTransactions', 'preparedTransactions', 'persistentRunning', 'persistentQueued']) {
    assert.throws(() => validateDatabaseQuiescence({ ...database(), [key]: 1 }), /DATABASE_OR_PERSISTENT_WORK_REMAINS/);
  }
  assert.throws(() => validateDatabaseQuiescence({ ...database(), ownershipComplete: false }), /DATABASE_OR_PERSISTENT_WORK_REMAINS/);
});
test('send-before-log and partial commit uncertainty remains HOLD with no task completion claim', () => {
  const domains = LEGACY_DOMAINS.map(domain => ({ domain, disposition: 'RECONCILED', unknownEffects: 0, pendingWrites: 0, requiresReplay: false, requiresBusinessMutation: false }));
  assert.equal(evaluateLegacyReconciliation(domains).result, 'RECONCILED');
  domains[0].unknownEffects = 1; domains[1].disposition = 'UNKNOWN';
  const result = evaluateLegacyReconciliation(domains); assert.equal(result.result, 'HOLD'); assert.equal(result.legacyDrainResult, 'UNSUPPORTED');
  assert.deepEqual(result.reasons, ['NOTIFICATION_EXTERNAL_SEND_UNRECONCILED', 'IOT_PARTIAL_COMMITS_UNRECONCILED']);
});
test('Docker inspection emits allowlisted state without raw config or credentials', () => {
  const calls = [];
  const actual = inspectDockerRuntime(pin.id, args => { calls.push(args); return args[0] === 'image' ? old : [pin.id, pin.imageId, 0, 'no',
    true, 'healthy', 123, 'running', false, false, 0, false, pin.startedAt].map(JSON.stringify).join('\t'); });
  assert.equal(actual.health, 'healthy'); assert.equal(actual.revision, old); assert.equal(calls.length, 2);
  assert.equal('Env' in actual, false); assert.throws(() => inspectDockerRuntime('short'), /FULL_CONTAINER_ID_REQUIRED/);
});
test('host control mount ancestors and data roots cannot bypass network isolation', () => {
  for (const source of ['/', '/run', '/var/run', '/var', '/var/lib', '/var/lib/docker', '/var/lib/docker/volumes', '/proc', '/sys', '/dev', '/data', '/data/phoenix-erp-data', '/data/phoenix-erp-data/postgres']) {
    assert.throws(() => assertNoHostControlMount(source), /EXECUTOR_HOST_CONTROL_MOUNT/);
  }
  assert.doesNotThrow(() => assertNoHostControlMount('/data/phoenix-erp-data/uploads'));
});
function isolationFixture({ change = {}, authority = null, sidecarMode = null, at = time } = {}) {
  let now = at, mutations = 0;
  const network = { id: '5'.repeat(64), name: 'fixture-net', driver: 'bridge' };
  const context = { schema: 'phoenix.legacy-maintenance-context/v1', protocolVersion: 1, owner: '12345-1', previousFloorSha: old, previousApiSha: old,
    previousWebSha: old, targetSha: 'b'.repeat(40), window: { start: new Date(at - 1000).toISOString(), end: new Date(at + 60000).toISOString() },
    candidate: { revision: 'b'.repeat(40), imageId: pin.imageId }, sourceHelperSha256: '1'.repeat(64), schemaEvidenceSha256: '2'.repeat(64), migrationPaths: [],
    preSnapshot: { ...healthy(), db: { ...healthy().db, mountsSha256: '3'.repeat(64) } }, executors: [pin],
    networkIsolation: { networks: [network], approvedMounts: change.mounts?.map(m => ({ source: m.Source, destination: m.Destination, readWrite: m.RW })) || [] } };
  const sidecarId = '8'.repeat(64);
  const infrastructureEvidence = { body: { hostInventoryComplete: true, orchestratorsDisabled: true, unknownHostExecutors: 0, swarmActive: false, watchtowerPresent: false, classifiedNonExecutorIds: sidecarMode ? [sidecarId] : [] } };
  const value = { networkMode: 'fixture-net', restartPolicy: 'always', privileged: false, pidMode: '', mounts: [],
    networks: { 'fixture-net': { NetworkID: network.id } }, labels: {}, capAdd: null, devices: [], deviceRequests: null, ipcMode: 'private', utsMode: '', ...change };
  const run = args => {
    if (args[0] === 'ps') return sidecarMode ? `${pin.id}\n${sidecarId}` : pin.id;
    if (args[0] === 'info') return 'inactive';
    if (args[0] === 'network' && args[1] === 'inspect') return [network.id, network.name, network.driver, 'local'].map(JSON.stringify).join('\t');
    if (args[0] === 'inspect' && args[1] === sidecarId) return sidecarMode.map(JSON.stringify).join('\t');
    if (args[0] === 'inspect') return [pin.id, pin.imageId, 0, true, value.health ?? 'healthy', pin.pid, 'running', false, false, 0, false, pin.startedAt,
      value.networkMode, value.restartPolicy, value.privileged, value.pidMode, value.mounts, value.networks, value.labels?.['com.docker.swarm.service.id'] || null,
      value.capAdd, value.devices, value.deviceRequests, value.ipcMode, value.utsMode].map(JSON.stringify).join('\t');
    mutations++; return '';
  };
  const producer = new DockerNetworkIsolationProducer({ context, approval: { purpose:'MAINTENANCE',payload:{protocol:'STOP_AND_RECONCILE',operations:MAINTENANCE_OPERATIONS} }, infrastructureEvidence, now: () => now,
    store: { directory: '/fixture-only', immutable: () => {} }, authority: authority || { verifyAuthority: async () => true, verifyInfrastructure: async () => true } }, { guard: () => {}, run });
  return { producer, context, infrastructureEvidence, mutations: () => mutations, advance: milliseconds => { now += milliseconds; } };
}
test('missing fence suboperations or an unknown observation cannot borrow another approval scope',async()=>{
 for(const missing of ['FENCE_INGRESS','DISABLE_RESTART_POLICY','DISCONNECT_LEGACY_NETWORKS']){
  const f=isolationFixture();f.producer.approval.payload.operations=MAINTENANCE_OPERATIONS.filter(op=>op!==missing);
  await assert.rejects(f.producer.fenceIngress(),/NETWORK_APPROVAL_SCOPE_REQUIRED/);assert.equal(f.mutations(),0);
 }
 const f=isolationFixture();await assert.rejects(f.producer.authorized('OPEN_CANDIDATE'),/NETWORK_APPROVAL_SCOPE_REQUIRED/);
 f.producer.approval.payload.operations=MAINTENANCE_OPERATIONS.filter(op=>op!=='FENCE_INGRESS');
 await assert.rejects(f.producer.authorized('OBSERVE_NETWORK_ISOLATION'),/NETWORK_APPROVAL_SCOPE_REQUIRED/);assert.equal(f.mutations(),0);
});
test('actual separate signed maintenance authority accepts typed network observation and rejects revocation',async()=>{
 const f=isolationFixture({at:Date.now()}),initial={context:f.context,records:[{purpose:'MAINTENANCE',payload:f.producer.approval.payload}]};
 const proposal=prepareFixtureAuthorityApproval(initial,'MAINTENANCE'),service=await openFixtureAuthority(initial),requests=[];
 f.producer.approval=proposal;
 f.producer.authority={verifyAuthority:async(a,e)=>{requests.push(e);return service.reader.verifyAuthority(a,e);},
  verifyInfrastructure:async(value,expected)=>canonicalDigest(value)===canonicalDigest(f.infrastructureEvidence)&&bindingDigest(expected.context)===bindingDigest(f.context)};
 try{
  await f.producer.authorized('DISCONNECT_LEGACY_NETWORKS');await f.producer.authorized('OBSERVE_NETWORK_ISOLATION');
  assert.deepEqual(requests.map(r=>[r.purpose,r.operation]),[['MAINTENANCE','DISCONNECT_LEGACY_NETWORKS'],['MAINTENANCE','FENCE_INGRESS']]);
  assert.equal(requests[1].observationOperation,'OBSERVE_NETWORK_ISOLATION');assert.equal(f.mutations(),0);
  await service.controller.revoke('MAINTENANCE');
  await assert.rejects(f.producer.authorized('OBSERVE_NETWORK_ISOLATION'),/INDEPENDENT_NETWORK_MAINTENANCE_AUTHORITY_REQUIRED/);assert.equal(f.mutations(),0);
 }finally{await service.controller.close();}
});
test('host/shared network, unknown network and privileged namespace configurations fail before mutations', async () => {
  for (const change of [{ networkMode: 'host' }, { networkMode: 'container:another' }, { networks: { other: { NetworkID: '9'.repeat(64) } } },
    { privileged: true }, { capAdd: ['NET_ADMIN'] }, { capAdd: ['SYS_ADMIN'] }, { devices: [{}] }, { deviceRequests: [{}] }, { ipcMode: 'host' }, { utsMode: 'host' },
    { mounts: [{ Type: 'bind', Source: '/var/run', Destination: '/fixture', RW: true }] }]) {
    const fixture = isolationFixture({ change });
    await assert.rejects(fixture.producer.fenceIngress(), /UNSUPPORTED_LEGACY_EXECUTOR_CONFIGURATION|UNKNOWN_EXECUTOR_NETWORK|EXECUTOR_HOST_CONTROL_MOUNT/);
    assert.equal(fixture.mutations(), 0);
  }
});
test('authority unavailability and expiry during asynchronous review never permit a late mutation', async () => {
  const rejected = isolationFixture({ authority: {} });
  await assert.rejects(rejected.producer.fenceIngress(), /INDEPENDENT_NETWORK_MAINTENANCE_AUTHORITY_REQUIRED/); assert.equal(rejected.mutations(), 0);
  let fixture;
  fixture = isolationFixture({ authority: { verifyAuthority: async () => { fixture.advance(61000); return true; }, verifyInfrastructure: async () => true } });
  await assert.rejects(fixture.producer.fenceIngress(), /MAINTENANCE_WINDOW_CLOSED/); assert.equal(fixture.mutations(), 0);
});
test('classified sidecar sharing an API network or PID namespace cannot bypass isolation', async () => {
  for (const sidecarMode of [[`container:${pin.id}`, ''], ['fixture-net', `container:${pin.id}`]]) {
    const fixture = isolationFixture({ sidecarMode });
    await assert.rejects(fixture.producer.fenceIngress(), /UNSUPPORTED_SHARED_NAMESPACE_SIDECAR/);
    assert.equal(fixture.mutations(), 0);
  }
});
test('remaining window must contain the full bounded stop budget', async () => {
  const fixture = isolationFixture(); fixture.advance(30000);
  await assert.rejects(fixture.producer.mutate('STOP_LEGACY', ['stop', '--signal', 'SIGTERM', '--time', '30', pin.id], 35000), /MAINTENANCE_WINDOW_CLOSED/);
  assert.equal(fixture.mutations(), 0);
});
test('mutation adapter accepts only fixed typed commands for exact approved identities', async () => {
  const fixture = isolationFixture();
  for (const [operation, args, budget] of [['STOP_LEGACY', ['rm', '-f', pin.id], 35000], ['STOP_LEGACY', ['stop', '--time', '30', '9'.repeat(64)], 35000],
    ['DISABLE_RESTART_POLICY', ['update', '--restart=always', pin.id], 10000], ['DISCONNECT_LEGACY_NETWORKS', ['network', 'disconnect', '9'.repeat(64), pin.id], 10000],
    ['STOP_LEGACY', ['stop', '--time', '30', pin.id], -1]]) {
    await assert.rejects(fixture.producer.mutate(operation, args, budget), /TYPED_MAINTENANCE_COMMAND_REQUIRED/);
  }
  assert.equal(fixture.mutations(), 0);
});

test('isolated legacy STOP retains healthy admission and exact live isolation despite DB readiness loss',()=>{
 const isolated={...pin,health:'unhealthy',restartPolicy:'no',status:'running',oomKilled:false,attached:[]};
 assert.equal(validateLegacyIsolatedPreStop(pin,isolated),isolated);
 assert.throws(()=>validateLegacyIsolatedPreStop({...pin,health:'unhealthy'},isolated),/LEGACY_PRE_STOP_BINDING/);
 for(const change of [{id:'9'.repeat(64)},{imageId:'sha256:'+'9'.repeat(64)},{revision:'9'.repeat(40)},{startedAt:new Date(time).toISOString()},{restartCount:1},{running:false},{pid:0},{status:'exited'},{restarting:true},{dead:true},{oomKilled:true},{restartPolicy:'unless-stopped'},{attached:[{id:'network'}]},{attached:undefined}])assert.throws(()=>validateLegacyIsolatedPreStop(pin,{...isolated,...change}),/LEGACY_PRE_STOP_BINDING/);
});

test('legacy unhealthy admission still prevents every isolation mutation before STOP',async()=>{
 const f=isolationFixture({change:{health:'unhealthy'}});await assert.rejects(f.producer.fenceIngress(),/LEGACY_PRE_ISOLATION_NOT_HEALTHY/);assert.equal(f.mutations(),0);
});
