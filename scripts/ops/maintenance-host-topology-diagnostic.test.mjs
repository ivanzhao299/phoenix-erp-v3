import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMaintenanceHostTopology, readonlyTopologyCommand, classifyReadonlyMetadataFailure, TOPOLOGY_SCHEMA, TOPOLOGY_COMMAND_ENV, TOPOLOGY_MAXIMUM_OUTPUT_BYTES } from './maintenance-host-topology-diagnostic.mjs';

const secret = 'DO_NOT_EXPORT_SENSITIVE_SENTINEL';
const container = 'a'.repeat(64), image = `sha256:${'b'.repeat(64)}`, network = 'c'.repeat(64), endpoint = 'd'.repeat(64);
const now = Date.parse('2026-10-18T10:00:00.000Z');
function fileStat({ directory = false, symlink = false, ...extra } = {}) { return { dev: 1, ino: 1, size: 100, mtimeMs: 1, ctimeMs: 1, uid: 0, gid: 0, mode: 0o100600, nlink: 1, isDirectory: () => directory, isFile: () => !directory, isSymbolicLink: () => symlink, ...extra }; }
function processStat(pid, ticks = '123') { const tail = Array(20).fill('0'); tail[0] = 'S'; tail[1] = pid === '1' ? '0' : '1'; tail[19] = ticks; return `${pid} (${secret}) ${tail.join(' ')}`; }
function fixture(overrides = {}) {
  const calls = [], reads = [], links = [];
  const execute = async (binary, args) => {
    calls.push({ binary, args });
    if (binary === '/usr/bin/docker') {
      if (args[0] === 'ps') return container;
      if (args[0] === 'image') return JSON.stringify('e'.repeat(40));
      if (args[0] === 'network' && args[1] === 'ls') return network;
      if (args[0] === 'network' && args[1] === 'inspect') return [network, 'bridge', 'local', false, true, false, { [container]: { Name: secret, IPv4Address: secret } }, secret].map(JSON.stringify).join('\t');
      if (args[0] === 'inspect') return [container, image, true, 'healthy', '2026-10-17T10:00:00.123456789Z', 2, false, 0, 'unless-stopped', false, ['NET_ADMIN', secret], 'bridge', '', '',
        { '3100/tcp': [{ HostIp: '127.0.0.1', HostPort: '3100' }] }, { [secret]: { NetworkID: network, EndpointID: endpoint, Aliases: [secret] } },
        [{ Type: 'bind', Source: `/secret/${secret}/.env`, Destination: `/private/${secret}`, RW: false }, { Type: 'bind', Source: '/var/lib/phoenix-background-control', Destination: '/run/phoenix-background-control', RW: false }], 'api', secret].map(JSON.stringify).join('\t');
    }
    if (binary === '/usr/bin/systemctl') {
      if (args[0] === 'list-units') return JSON.stringify([{ unit: 'phoenix-api.service', description: secret }]);
      if (args[0] === 'list-timers') return JSON.stringify([{ unit: 'phoenix-cron.timer', activates: 'phoenix-api.service', description: secret }]);
      if (args[0] === 'show') return `Id=${args.at(-1)}\nActiveState=active\nSubState=running\nLoadState=loaded\nUnitFileState=enabled\nMainPID=2\nControlPID=0\nRestart=no\nFragmentPath=/private/${secret}\nDropInPaths=/private/${secret}\nTriggers=phoenix-api.service\nTriggeredBy=phoenix-cron.timer`;
    }
    throw new Error(`FIXTURE_UNSUPPORTED ${secret}`);
  };
  const readFile = async file => {
    reads.push(file);
    if (file === '/proc/1/stat') return processStat('1'); if (file === '/proc/2/stat') return processStat('2');
    if (file.endsWith('/status')) return `Name:\t${secret}\nPPid:\t${file.includes('/1/') ? '0' : '1'}\nUid:\t0\t0\t0\t0\n`;
    if (file.endsWith('/cgroup')) return `0::/system.slice/docker-${container}.scope\n${secret}`;
    if (['/etc/crontab', '/etc/cron.d/phoenix', '/var/spool/cron/crontabs/root', '/var/spool/cron/root'].includes(file)) return `# ${secret}\nPASSWORD=${secret}\n@reboot root docker run ${secret}\n* * * * * root curl https://example.invalid/${secret} # chanjet phoenix`;
    throw new Error(secret);
  };
  const readlink = async file => {
    links.push(file);
    if (file.endsWith('/exe')) return `/private/${secret}/node`;
    if (file.endsWith('/net')) return 'net:[4026531840]'; if (file.endsWith('/mnt')) return 'mnt:[4026531841]'; if (file.endsWith('/pid')) return 'pid:[4026531842]';
    throw new Error(secret);
  };
  const readdir = async dir => dir === '/proc' ? ['1', '2', '7', 'self', 'net'] : dir === '/etc/cron.d' ? ['phoenix', '.env'] : ['root'];
  const lstat = async file => fileStat({ directory: ['/etc/cron.d', '/var/spool/cron/crontabs', '/var/spool/cron'].includes(file) });
  return { dependencies: { guard: async () => true, uid: () => 0, now: () => now, execute, readFile, readCronFile: readFile, readlink, readdir, lstat, ...overrides }, calls, reads, links, execute };
}

test('default guard and nonroot identity deny before any metadata read', async () => {
  const f = fixture(); await assert.rejects(collectMaintenanceHostTopology({ ...f.dependencies, guard: undefined }), /PROTECTED_ROOT_CONTEXT_REQUIRED/); assert.deepEqual(f.calls, []);
  await assert.rejects(collectMaintenanceHostTopology({ ...f.dependencies, uid: () => 1002 }), /PROTECTED_ROOT_CONTEXT_REQUIRED/); assert.deepEqual(f.calls, []);
  await assert.rejects(collectMaintenanceHostTopology({ ...f.dependencies, guard: async () => { throw new Error(secret); } }), error => error.message === 'TOPOLOGY_HOLD=PROTECTED_ROOT_CONTEXT_REQUIRED'); assert.deepEqual(f.calls, []);
});
test('whitelisted topology output contains no environment, command, path, label or metadata sentinels', async () => {
  const f = fixture(); const result = await collectMaintenanceHostTopology(f.dependencies); const json = JSON.stringify(result);
  assert.equal(result.schema, TOPOLOGY_SCHEMA); assert.equal(json.includes(secret), false);
  assert.equal(result.productionMutation, false); assert.equal(result.completeSafetyProof, false); assert.equal(result.continuousDrainProof, false); assert.equal(result.admissionOrApprovalGranted, false);
  assert.equal(result.docker.containers[0].id, container); assert.deepEqual(result.docker.containers[0].addedCapabilities, ['NET_ADMIN']);
  assert.equal(result.docker.containers[0].unknownCapabilityCount, 1); assert.equal(result.docker.containers[0].ports[0].hosts[0].exposure, 'LOOPBACK');
  assert.equal(result.docker.containers[0].mounts[0].category, 'SENSITIVE_PATH'); assert.equal(result.docker.networks[0].memberIds[0], container);
  assert.equal(result.processes.processes.find(p => p.pid === 2).executionLocation, 'KNOWN_DOCKER_CONTAINER');
  assert.equal(result.processes.processes.find(p => p.pid === 7).verification, 'UNVERIFIED');
  assert.ok(result.cron.files.some(f => f.entries === 2 && f.environmentAssignmentCount === 1));
  assert.ok(!f.reads.some(p => p.includes('.env') || p.includes('cmdline') || p.includes('environ') || p.includes('.ssh')));
  for (const { args } of f.calls) assert.ok(!args.join(' ').includes('Config.Env') && !args.join(' ').includes('Health.Log') && !args.includes('start') && !args.includes('stop'));
});
test('process exit or PID reuse marks only that process UNVERIFIED without classifying it safe', async () => {
  let reads = 0; const f = fixture(); const original = f.dependencies.readFile;
  f.dependencies.readFile = async file => file === '/proc/2/stat' ? processStat('2', ++reads === 1 ? '100' : '101') : original(file);
  const result = await collectMaintenanceHostTopology(f.dependencies); assert.equal(result.processes.processes.find(p => p.pid === 2).verification, 'UNVERIFIED'); assert.equal(result.completeSafetyProof, false);
});
test('container inventory race is UNVERIFIED, never a drain or maintenance decision', async () => {
  const f = fixture(); let reads = 0; const original = f.execute;
  f.dependencies.execute = async (binary, args) => args[0] === 'ps' ? ++reads === 1 ? container : '' : original(binary, args);
  const result = await collectMaintenanceHostTopology(f.dependencies); assert.equal(result.docker.inventoryStable, false); assert.equal(result.docker.verification, 'UNVERIFIED');
});
test('unavailable Docker/systemd/cron metadata produces sanitized UNVERIFIED evidence', async () => {
  const f = fixture({ execute: async () => { throw new Error(secret); }, lstat: async () => { throw new Error(secret); } });
  const result = await collectMaintenanceHostTopology(f.dependencies); assert.equal(result.docker.verification, 'UNVERIFIED'); assert.equal(result.systemd.verification, 'UNVERIFIED');
  assert.ok(result.cron.files.every(f => f.verification === 'UNVERIFIED')); assert.equal(JSON.stringify(result).includes(secret), false);
});
test('cron symlink and file metadata race do not export or classify command contents', async () => {
  const f = fixture(); const original = f.dependencies.lstat; let reads = 0;
  f.dependencies.lstat = async file => file === '/etc/crontab' ? fileStat({ symlink: true }) : file === '/etc/cron.d/phoenix' ? fileStat({ mtimeMs: ++reads }) : original(file);
  const result = await collectMaintenanceHostTopology(f.dependencies); assert.ok(result.cron.files.filter(f => f.verification === 'UNVERIFIED').length >= 3);
  assert.equal(result.cron.files.some(f => Object.hasOwn(f, 'command')), false); assert.equal(JSON.stringify(result).includes(secret), false);
});
test('fixed executor rejects lifecycle, shell, environment, broad inspect and unsafe unit requests before execution', () => {
  for (const [binary, args] of [['/usr/bin/docker', ['stop', container]], ['/bin/sh', ['-c', 'true']], ['/usr/bin/docker', ['inspect', container]],
    ['/usr/bin/docker', ['inspect', container, '--format', '{{json .Config.Env}}']], ['/usr/bin/docker', ['inspect', container, '--format', '{{json .State}}']],
    ['/usr/bin/systemctl', ['show', '--property=Environment', 'phoenix-api.service']], ['/usr/bin/systemctl', ['restart', 'phoenix-api.service']]]) assert.throws(() => readonlyTopologyCommand(binary, args), /READONLY_COMMAND_REQUIRED/);
});
test('lost protected guard on later phase refuses the snapshot instead of returning a partial success', async () => {
  const f = fixture(); let checks = 0; f.dependencies.guard = async () => ++checks < 3;
  await assert.rejects(collectMaintenanceHostTopology(f.dependencies), /PROTECTED_ROOT_CONTEXT_REQUIRED/);
});
test('60-second total budget prevents every new execute/read after expiry and clamps per-command remaining timeout', async () => {
  const f = fixture(); let clock = now; const calls = []; const original = f.execute;
  f.dependencies.now = () => clock;
  f.dependencies.execute = async (binary, args, options) => {
    calls.push({ at: clock, timeoutMs: options.timeoutMs }); const result = await original(binary, args);
    clock += calls.length === 1 ? 59000 : 1000; return result;
  };
  const result = await collectMaintenanceHostTopology(f.dependencies);
  assert.equal(calls.length, 2); assert.deepEqual(calls.map(c => c.timeoutMs), [10000, 1000]); assert.ok(calls.every(c => c.at < now + 60000));
  assert.equal(f.reads.length, 0); assert.equal(f.links.length, 0); assert.equal(result.collectionBudget.expired, true);
  assert.equal(result.result, 'READONLY_SNAPSHOT_UNVERIFIED_TRUNCATED'); assert.equal(result.verification, 'UNVERIFIED');
});
test('read budget expiry stops subsequent readlink/readFile/execute operations', async () => {
  const f = fixture(); let clock = now; const readdir = f.dependencies.readdir; const beforeExpiryCalls = [];
  f.dependencies.now = () => clock;
  f.dependencies.readdir = async directory => { const values = await readdir(directory); if (directory === '/proc') { beforeExpiryCalls.push(f.calls.length); clock += 60000; } return values; };
  const result = await collectMaintenanceHostTopology(f.dependencies);
  assert.equal(result.collectionBudget.expired, true); assert.equal(f.calls.length, beforeExpiryCalls[0]); assert.equal(f.links.length, 0); assert.equal(f.reads.length, 0);
});
test('guard crossing the deadline refuses before metadata IO with a fixed error', async () => {
  const f = fixture(); let clock = now; f.dependencies.now = () => clock; f.dependencies.guard = async () => { clock += 60000; return true; };
  await assert.rejects(collectMaintenanceHostTopology(f.dependencies), error => error.message === 'TOPOLOGY_HOLD=COLLECTION_BUDGET_EXHAUSTED'); assert.equal(f.calls.length, 0);
});
test('enumeration cap is explicit and cannot claim a complete stable Docker inventory', async () => {
  const f = fixture(); const original = f.execute; const many = Array.from({ length: 40 }, (_, i) => i.toString(16).padStart(64, '0'));
  f.dependencies.execute = async (binary, args, options) => args[0] === 'ps' ? many.join('\n') : original(binary, args, options);
  const result = await collectMaintenanceHostTopology(f.dependencies);
  assert.equal(result.docker.containers.length, 32); assert.equal(result.docker.inventoryStable, 'UNVERIFIED_ENUMERATION_TRUNCATED');
  assert.ok(result.truncations.some(x => x.scope === 'DOCKER_CONTAINERS')); assert.equal(result.verification, 'UNVERIFIED');
});
test('large sanitized topology collapses to a bounded UNVERIFIED aggregate under 384 KiB', async () => {
  const f = fixture(); const original = f.execute; const members = Object.fromEntries(Array.from({ length: 8000 }, (_, i) => [i.toString(16).padStart(64, '0'), { Name: secret }]));
  f.dependencies.execute = async (binary, args, options) => args[0] === 'network' && args[1] === 'inspect' ? [network, 'bridge', 'local', false, true, false, members, 'docker0'].map(JSON.stringify).join('\t') : original(binary, args, options);
  const result = await collectMaintenanceHostTopology(f.dependencies);
  assert.equal(result.outputBudget.truncated, true); assert.equal(result.verification, 'UNVERIFIED'); assert.equal(result.docker.inventoryStable, 'UNVERIFIED_OUTPUT_TRUNCATED');
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= TOPOLOGY_MAXIMUM_OUTPUT_BYTES); assert.ok(!JSON.stringify(result).includes(secret));
});
test('Cron ownership/mode races and any unknown entry propagate to top-level UNVERIFIED', async () => {
  for (const field of ['uid', 'gid', 'mode']) {
    const f = fixture(); let count = 0; const original = f.dependencies.lstat;
    f.dependencies.lstat = async file => file === '/etc/crontab' ? fileStat({ [field]: ++count === 1 ? 0 : 1 }) : original(file);
    const result = await collectMaintenanceHostTopology(f.dependencies); assert.equal(result.verification, 'UNVERIFIED'); assert.equal(result.cron.verification, 'UNVERIFIED');
  }
});
test('fixed command environment pins the local Docker socket and carries no ambient endpoint/TLS overrides', () => {
  assert.equal(TOPOLOGY_COMMAND_ENV.DOCKER_HOST, 'unix:///var/run/docker.sock');
  for (const key of ['DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'HOME', 'SSH_AUTH_SOCK']) assert.equal(Object.hasOwn(TOPOLOGY_COMMAND_ENV, key), false);
});

test('the observed 193-service plus 18-timer census fits while all safety decisions stay denied',async()=>{
  const f=fixture();const original=f.execute;
  f.dependencies.execute=async(binary,args,options)=>{
    if(binary==='/usr/bin/systemctl'&&args[0]==='list-units')return JSON.stringify(Array.from({length:193},(_,i)=>({unit:`observed-${i}.service`})));
    if(binary==='/usr/bin/systemctl'&&args[0]==='list-timers')return JSON.stringify(Array.from({length:18},(_,i)=>({unit:`observed-${i}.timer`,activates:`observed-${i}.service`})));
    return original(binary,args,options);
  };
  const result=await collectMaintenanceHostTopology(f.dependencies);
  assert.equal(result.systemd.units.length,211);assert.equal(result.systemd.units.filter(u=>u.unitType==='TIMER').length,18);
  assert.ok(!result.truncations.some(x=>x.scope==='SYSTEMD_UNITS'));assert.equal(result.completeSafetyProof,false);assert.equal(result.admissionOrApprovalGranted,false);
});
test('the enlarged systemd census still has a fixed cap and reports overflow as unverified',async()=>{
  const f=fixture();const original=f.execute;
  f.dependencies.execute=async(binary,args,options)=>binary==='/usr/bin/systemctl'&&args[0]==='list-units'?JSON.stringify(Array.from({length:300},(_,i)=>({unit:`overflow-${i}.service`}))):original(binary,args,options);
  const result=await collectMaintenanceHostTopology(f.dependencies);
  assert.equal(result.systemd.units.length,256);assert.ok(result.truncations.some(x=>x.scope==='SYSTEMD_UNITS'&&x.maximumCount===256));assert.equal(result.verification,'UNVERIFIED');assert.equal(result.completeSafetyProof,false);
});

test('container failures report a closed stage code without raw metadata or relaxed validation', async () => {
  for (const [kind,reason] of [['command','CONTAINER_INSPECT_COMMAND_UNAVAILABLE'],['json','CONTAINER_INSPECT_JSON_UNVERIFIED'],['count','CONTAINER_INSPECT_FIELD_COUNT_UNVERIFIED'],['identity','CONTAINER_INSPECT_IDENTITY_UNVERIFIED'],['process','CONTAINER_INSPECT_PROCESS_FIELDS_UNVERIFIED'],['time','CONTAINER_INSPECT_STARTED_AT_UNVERIFIED']]) {
    const f=fixture();const original=f.execute;
    f.dependencies.execute=async(binary,args,options)=>{
      if(binary!=='/usr/bin/docker'||args[0]!=='inspect') return original(binary,args,options);
      if(kind==='command')throw new Error(secret);if(kind==='json')return secret;if(kind==='count')return 'null';
      const values=(await original(binary,args,options)).split('\t').map(JSON.parse);
      if(kind==='identity')values[0]='f'.repeat(64);if(kind==='process')values[5]=-1;if(kind==='time')values[4]='0001-01-01T00:00:00Z';
      return values.map(JSON.stringify).join('\t');
    };
    const result=await collectMaintenanceHostTopology(f.dependencies);assert.equal(result.docker.containers[0].reason,reason);
    assert.equal(result.docker.verification,'UNVERIFIED');assert.equal(result.completeSafetyProof,false);assert.ok(!JSON.stringify(result).includes(secret));
  }
});
test('service and timer relations use stable hashes and preserve unsupported identities without exporting names',async()=>{
  const f=fixture();const result=await collectMaintenanceHostTopology(f.dependencies);
  const service=result.systemd.units.find(x=>x.unitType==='SERVICE');const timer=result.systemd.units.find(x=>x.unitType==='TIMER');
  assert.deepEqual(timer.triggerTargetSha256,[service.unitNameSha256]);assert.deepEqual(service.triggeredByTargetSha256,[timer.unitNameSha256]);
  assert.ok(!JSON.stringify(result).includes('phoenix-api.service'));
  const original=f.execute;f.dependencies.execute=async(binary,args,options)=>binary==='/usr/bin/systemctl'&&args[0]==='list-units'?JSON.stringify([{unit:'bad name.service'}]):original(binary,args,options);
  const invalid=(await collectMaintenanceHostTopology(f.dependencies)).systemd.units.find(x=>x.reason==='UNIT_NAME_UNSUPPORTED');
  assert.match(invalid.unitNameSha256,/^[a-f0-9]{64}$/);assert.equal(invalid.verification,'UNVERIFIED');
});

test('failed command classifier exports only a closed category, never stderr or object names',()=>{
  for(const [error,expected] of [[{code:'ETIMEDOUT'},'COMMAND_TIMEOUT'],[{code:'ENOENT'},'COMMAND_EXECUTABLE_UNAVAILABLE'],[{stderr:`Error: No such container: ${secret}`},'OBJECT_METADATA_UNAVAILABLE'],[{stderr:Buffer.from(`index of untyped nil ${secret}`)},'TEMPLATE_INDEX_UNAVAILABLE'],[{stderr:`can't evaluate field ${secret}`},'TEMPLATE_FIELD_UNAVAILABLE'],[{stderr:`permission denied ${secret}`},'METADATA_ACCESS_DENIED'],[{stderr:`Cannot connect to the Docker daemon ${secret}`},'DOCKER_DAEMON_UNAVAILABLE'],[{code:secret,stderr:secret},'COMMAND_FAILURE_UNCLASSIFIED']]){
    assert.equal(classifyReadonlyMetadataFailure(error),expected);assert.ok(!classifyReadonlyMetadataFailure(error).includes(secret));
  }
});
test('command classifications remain failed snapshots and reject injected category strings',async()=>{
  for(const code of ['TEMPLATE_FIELD_UNAVAILABLE',secret]){
    const f=fixture();const original=f.execute;f.dependencies.execute=async(binary,args,options)=>{if(binary==='/usr/bin/docker'&&args[0]==='inspect')throw new Error('TOPOLOGY_HOLD=READONLY_METADATA_UNAVAILABLE_'+code);return original(binary,args,options);};
    const result=await collectMaintenanceHostTopology(f.dependencies);assert.equal(result.docker.containers[0].commandFailure,code===secret?'COMMAND_FAILURE_UNCLASSIFIED':code);assert.equal(result.docker.verification,'UNVERIFIED');assert.equal(result.completeSafetyProof,false);assert.ok(!JSON.stringify(result).includes(secret));
  }
});
