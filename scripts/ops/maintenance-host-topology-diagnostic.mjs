/** Root read-only topology evidence. No CLI, admission decision or lifecycle
 * command. The caller must supply its existing protected root/FD9 guard. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';

export const TOPOLOGY_SCHEMA = 'phoenix.maintenance-host-topology/v1';
export const TOPOLOGY_MAXIMUM_MS = 60000;
export const TOPOLOGY_MAXIMUM_OUTPUT_BYTES = 384 * 1024;
export const TOPOLOGY_COMMAND_ENV = Object.freeze({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C', LC_ALL: 'C', SYSTEMD_COLORS: '0', SYSTEMD_PAGER: 'cat', DOCKER_HOST: 'unix:///var/run/docker.sock' });
const LIMITS = { containers: 32, networks: 32, processes: 256, units: 256, cronEntries: 128, cronSources: 256 };
const ID = /^[a-f0-9]{64}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const properties = 'Id,ActiveState,SubState,LoadState,UnitFileState,MainPID,ControlPID,Restart,FragmentPath,DropInPaths,Triggers,TriggeredBy,ControlGroup,WorkingDirectory,InvocationID';
const dockerFields = ['.Id', '.Image', '.State.Running', '.State.Health.Status', '.State.StartedAt', '.State.Pid', '.State.Restarting', '.RestartCount',
  '.HostConfig.RestartPolicy.Name', '.HostConfig.Privileged', '.HostConfig.CapAdd', '.HostConfig.NetworkMode', '.HostConfig.PidMode', '.HostConfig.IpcMode',
  '.NetworkSettings.Ports', '.NetworkSettings.Networks', '.Mounts', '(index .Config.Labels "com.docker.compose.service")', '(index .Config.Labels "com.docker.compose.project")', '.Name'];
const dockerTemplate = dockerFields.map(field => field === '.State.Health.Status' ? '{{if (index .State "Health")}}{{json .State.Health.Status}}{{else}}null{{end}}' : `{{json ${field}}}`).join('\t');
export const TOPOLOGY_CONTAINER_PROJECTION = dockerTemplate;
const networkTemplate = ['.Id', '.Driver', '.Scope', '.Internal', '.Attachable', '.Ingress', '.Containers', '(index .Options "com.docker.network.bridge.name")'].map(field => `{{json ${field}}}`).join('\t');
const unitPattern = /^[A-Za-z0-9][A-Za-z0-9_.@:-]{0,199}\.(?:service|timer)$/;
const knownCaps = new Set(['ALL', 'NET_ADMIN', 'NET_RAW', 'SYS_ADMIN', 'SYS_PTRACE', 'SYS_MODULE', 'DAC_READ_SEARCH', 'DAC_OVERRIDE', 'CHOWN', 'SETUID', 'SETGID', 'SYS_CHROOT', 'MKNOD', 'AUDIT_WRITE', 'SETFCAP', 'NET_BIND_SERVICE']);
const unknown = reason => ({ verification: 'UNVERIFIED', reason });
const safeBoolean = value => typeof value === 'boolean' ? value : 'UNVERIFIED';
const parseRows = text => text.trim() ? text.trim().split('\n') : [];
const validTime = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{1,9}Z$/.test(value) && Number.isFinite(Date.parse(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const privateUnitNames=new WeakMap();
const privateNodePins=new WeakMap();
const sensitivePublicName=value=>/secret|token|password|credential|private|certificate|[a-f0-9]{32}/i.test(value);
/** Public operational metadata only. Never argv, flags, script contents or an
 * assertion of business ownership/permission to stop a process. */
export function projectNodeEntry(commandLine){
 const text=Buffer.isBuffer(commandLine)?commandLine.toString('utf8'):commandLine;
 if(typeof text!=='string'||Buffer.byteLength(text)>8192||!text.endsWith('\0')||Buffer.from(text,'utf8').toString('utf8')!==text||(Buffer.isBuffer(commandLine)&&!Buffer.from(text,'utf8').equals(commandLine)))return {entryClass:'UNVERIFIED'};
 const argv=text.split('\0'),entry=argv[1];
 if(!entry||entry.startsWith('-')||!path.isAbsolute(entry)||path.normalize(entry)!==entry||entry.includes('\n')||entry.includes('\r'))return {entryClass:'UNVERIFIED'};
 const basename=path.basename(entry);
 if(['ProcessContainerFork.js','ProcessContainer.js','Daemon.js'].includes(basename))return {entryClass:'PROCESS_MANAGER_WRAPPER',nodeEntryBasename:basename,nodeEntrySha256:hash(entry)};
 if(!/^[a-z][a-z0-9._-]{0,63}\.(?:cjs|mjs|js)$/.test(basename)||sensitivePublicName(basename))return {entryClass:'UNVERIFIED',nodeEntrySha256:hash(entry)};
 return {entryClass:'SCRIPT_BASENAME_ONLY',nodeEntryBasename:basename,nodeEntrySha256:hash(entry)};
}
export function projectNodePackage(value){
 if(!object(value)||typeof value.name!=='string'||typeof value.version!=='string'
  ||!/^(@[a-z0-9][a-z0-9._-]{0,31}\/)?[a-z0-9][a-z0-9._-]{0,47}$/.test(value.name)||sensitivePublicName(value.name)
  ||!/^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[a-z0-9.-]{1,32})?(?:\+[a-z0-9.-]{1,32})?$/i.test(value.version)||sensitivePublicName(value.version))return {packageEvidenceClass:'UNVERIFIED'};
 return {packageEvidenceClass:'CWD_PACKAGE_METADATA_ONLY',packageName:value.name,packageVersion:value.version};
}
export function boundedProcCommandLine(file,budget){
 if(!/^\/proc\/[1-9][0-9]*\/cmdline$/.test(file))throw Error('UNVERIFIED');
 budget();const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{const data=Buffer.alloc(8193);let at=0;
  while(at<data.length){budget();const size=fs.readSync(fd,data,at,data.length-at,null);budget();if(!size)break;at+=size;}
  if(at>8192)throw Error('UNVERIFIED');budget();const raw=data.subarray(0,at),text=raw.toString('utf8');if(!Buffer.from(text,'utf8').equals(raw))throw Error('UNVERIFIED');return text;
 }finally{fs.closeSync(fd);}
}
const metadataPin=stat=>[stat.dev,stat.ino,stat.uid,stat.gid,stat.mode,stat.nlink,stat.size,stat.mtimeMs,stat.ctimeMs];
export function readNodeCwdPackage(directory,budget){
 if(!path.isAbsolute(directory)||path.normalize(directory)!==directory||directory==='/'||/(?:^|\/)(?:\.ssh|secrets?)(?:\/|$)/i.test(directory))throw Error('UNVERIFIED');
 const chain=[];let current='/';
 for(const part of ['',...directory.split('/').filter(Boolean)]){
  if(part)current=path.join(current,part);budget();const stat=fs.lstatSync(current);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o022))throw Error('UNVERIFIED');chain.push({file:current,pin:metadataPin(stat)});
 }
 const file=path.join(directory,'package.json');budget();const initial=fs.lstatSync(file);
 if(!initial.isFile()||initial.isSymbolicLink()||initial.nlink!==1||initial.uid!==0||(initial.mode&0o022)||initial.size<1||initial.size>131072)throw Error('UNVERIFIED');
 budget();const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);let value;
 try{
  budget();const opened=fs.fstatSync(fd);budget();if(!opened.isFile()||JSON.stringify(metadataPin(initial))!==JSON.stringify(metadataPin(opened)))throw Error('UNVERIFIED');
  const data=Buffer.alloc(initial.size+1);let at=0;
  while(at<data.length){budget();const size=fs.readSync(fd,data,at,data.length-at,null);budget();if(!size)break;at+=size;}
  budget();const afterRead=fs.fstatSync(fd);budget();if(at!==initial.size||JSON.stringify(metadataPin(initial))!==JSON.stringify(metadataPin(afterRead)))throw Error('UNVERIFIED');
  value=projectNodePackage(JSON.parse(data.subarray(0,at).toString('utf8')));
 }finally{fs.closeSync(fd);}
 budget();if(JSON.stringify(metadataPin(initial))!==JSON.stringify(metadataPin(fs.lstatSync(file))))throw Error('UNVERIFIED');
 for(const entry of chain){budget();if(JSON.stringify(entry.pin)!==JSON.stringify(metadataPin(fs.lstatSync(entry.file))))throw Error('UNVERIFIED');}
 return value;
}
function readCronFile(file, expected, budget) {
  budget();
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    budget();
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.size > 256 * 1024 || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'uid', 'gid', 'mode'].some(key => before[key] !== expected[key])) throw new Error('UNVERIFIED');
    budget(); const content = fs.readFileSync(fd, 'utf8'); budget(); const after = fs.fstatSync(fd);
    if (['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'uid', 'gid', 'mode'].some(key => before[key] !== after[key])) throw new Error('UNVERIFIED');
    return content;
  } finally { fs.closeSync(fd); }
}

const COMMAND_FAILURES = new Set(['COMMAND_TIMEOUT', 'COMMAND_EXECUTABLE_UNAVAILABLE', 'OBJECT_METADATA_UNAVAILABLE', 'TEMPLATE_INDEX_UNAVAILABLE', 'TEMPLATE_FIELD_UNAVAILABLE', 'METADATA_ACCESS_DENIED', 'DOCKER_DAEMON_UNAVAILABLE', 'COMMAND_FAILURE_UNCLASSIFIED']);
/** Categorization of a failed read only; never forwards raw errors or proves absence. */
export function classifyReadonlyMetadataFailure(error) {
  if (error?.code === 'ETIMEDOUT') return 'COMMAND_TIMEOUT';
  if (error?.code === 'ENOENT') return 'COMMAND_EXECUTABLE_UNAVAILABLE';
  const text = Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8') : typeof error?.stderr === 'string' ? error.stderr : '';
  if (/No such (?:object|container):/i.test(text)) return 'OBJECT_METADATA_UNAVAILABLE';
  if (text.includes('index of untyped nil')) return 'TEMPLATE_INDEX_UNAVAILABLE';
  if (text.includes("can't evaluate field")) return 'TEMPLATE_FIELD_UNAVAILABLE';
  if (/permission denied/i.test(text)) return 'METADATA_ACCESS_DENIED';
  if (text.includes('Cannot connect to the Docker daemon')) return 'DOCKER_DAEMON_UNAVAILABLE';
  return 'COMMAND_FAILURE_UNCLASSIFIED';
}

/** Fixed read-only command allowlist, including the exact inspect projections.
 * stdout/stderr are never forwarded on failure. No shell or credential argv. */
export function readonlyTopologyCommand(binary, args, { timeoutMs = 10000 } = {}) {
  const a = JSON.stringify(args);
  const dockerAllowed = binary === '/usr/bin/docker' && (
    a === JSON.stringify(['ps', '-a', '--no-trunc', '-q']) || a === JSON.stringify(['network', 'ls', '--no-trunc', '-q'])
    || (args.length === 4 && args[0] === 'inspect' && ID.test(args[1]) && args[2] === '--format' && args[3] === dockerTemplate)
    || (args.length === 5 && args[0] === 'image' && args[1] === 'inspect' && IMAGE.test(args[2]) && args[3] === '--format' && args[4] === '{{json (index .Config.Labels "org.opencontainers.image.revision")}}')
    || (args.length === 5 && args[0] === 'network' && args[1] === 'inspect' && ID.test(args[2]) && args[3] === '--format' && args[4] === networkTemplate));
  const systemdAllowed = binary === '/usr/bin/systemctl' && (
    a === JSON.stringify(['list-units', '--type=service', '--all', '--no-pager', '--output=json'])
    || a === JSON.stringify(['list-timers', '--all', '--no-pager', '--output=json'])
    || (args.length === 4 && args[0] === 'show' && args[1] === '--no-pager' && args[2] === `--property=${properties}` && unitPattern.test(args[3])));
  if (!dockerAllowed && !systemdAllowed) throw new Error('TOPOLOGY_HOLD=READONLY_COMMAND_REQUIRED');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error('TOPOLOGY_HOLD=COMMAND_BUDGET_REQUIRED');
  try {
    return execFileSync(binary, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024,
      env: TOPOLOGY_COMMAND_ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) { throw new Error('TOPOLOGY_HOLD=READONLY_METADATA_UNAVAILABLE_' + classifyReadonlyMetadataFailure(error)); }
}
function executableClass(exe) {
  const name = path.basename(exe);
  if (/^node(?:js)?$/.test(name)) return 'NODE';
  if (/^(dockerd|docker-proxy|containerd|containerd-shim-runc-v2|runc)$/.test(name)) return 'CONTAINER_ENGINE';
  if (/^(systemd|init)$/.test(name)) return 'INIT';
  if (/^(cron|crond|anacron)$/.test(name)) return 'CRON';
  if (/^(nginx|apache2|httpd|caddy)$/.test(name)) return 'WEB_PROXY';
  if (/^sshd$/.test(name)) return 'SSH';
  if (/^(postgres|postmaster)$/.test(name)) return 'POSTGRESQL';
  if (/^(sh|bash|dash|python3?|perl|ruby)$/.test(name)) return 'INTERPRETER';
  return 'OTHER';
}
function unitClass(unit) {
  if (/^(docker|containerd)(?:\.|-)/.test(unit)) return 'CONTAINER_ENGINE';
  if (/^(cron|crond|anacron)(?:\.|-)/.test(unit)) return 'CRON';
  if (/^(nginx|apache2|httpd|caddy)(?:\.|-)/.test(unit)) return 'WEB_PROXY';
  if (/^phoenix(?:[-_.]|$)/.test(unit)) return 'PHOENIX';
  return 'OTHER';
}
function modeClass(mode) { return mode === 'host' ? 'HOST' : mode === '' || mode === 'private' || mode === 'default' ? 'PRIVATE_OR_DEFAULT' : typeof mode === 'string' && /^container:[a-f0-9]{12,64}$/.test(mode) ? 'CONTAINER_SHARED' : 'OTHER_UNVERIFIED'; }
function limited(values, count, scope, io) {
  if (values.length > count) io.truncations.push({ scope, reason: 'ENUMERATION_LIMIT_TRUNCATED', observedCount: values.length, maximumCount: count });
  return values.slice(0, count);
}
function hasUnverified(value) {
  if (typeof value === 'string') return value.includes('UNVERIFIED') || value.includes('TRUNCATED');
  if (Array.isArray(value)) return value.some(hasUnverified);
  return object(value) && Object.values(value).some(hasUnverified);
}
function mountClass(mount) {
  const source = mount?.Source, destination = mount?.Destination;
  if (typeof source !== 'string' || typeof destination !== 'string') return unknown('MOUNT_METADATA');
  let category = 'OTHER';
  if (/(?:^|\/)(?:\.env(?:\.|$)|\.ssh|id_rsa|id_ed25519|secrets?)(?:\/|$)/i.test(source + '/' + destination)) category = 'SENSITIVE_PATH';
  else if (source === '/var/run/docker.sock' || destination === '/var/run/docker.sock') category = 'DOCKER_SOCKET';
  else if (['/', '/etc', '/proc', '/sys', '/var', '/var/lib'].includes(source)) category = 'BROAD_HOST_PATH';
  else if (source === '/var/lib/phoenix-background-control' && destination === '/run/phoenix-background-control') category = 'PUBLIC_BACKGROUND_CONTROL';
  else if (source === '/var/lib/phoenix-erp' || source.startsWith('/var/lib/phoenix-erp/')) category = 'PRIVATE_PRODUCTION_CONTROL';
  else if (destination === '/var/lib/postgresql/data') category = 'DATABASE_DATA';
  else if (destination === '/app/uploads') category = 'UPLOADS';
  const type = ['bind', 'volume', 'tmpfs'].includes(mount.Type) ? mount.Type : 'UNVERIFIED';
  return { category, type, readWrite: safeBoolean(mount.RW), sourcePathSha256: hash(source), destinationPathSha256: hash(destination) };
}
function portMappings(ports) {
  if (ports === null) return [];
  if (!object(ports)) return [unknown('PORT_METADATA')];
  return Object.entries(ports).map(([key, mappings]) => {
    const match = /^(\d{1,5})\/(tcp|udp|sctp)$/.exec(key);
    if (!match || Number(match[1]) > 65535 || Number(match[1]) < 1 || (mappings !== null && !Array.isArray(mappings))) return unknown('PORT_METADATA');
    return { containerPort: Number(match[1]), protocol: match[2], published: mappings !== null, hosts: (mappings || []).map(m => {
      if (!m || !isIP(m.HostIp) || !/^\d{1,5}$/.test(m.HostPort) || Number(m.HostPort) < 1 || Number(m.HostPort) > 65535) return unknown('HOST_PORT_METADATA');
      return { hostAddress: m.HostIp, hostPort: Number(m.HostPort), exposure: ['127.0.0.1', '::1'].includes(m.HostIp) ? 'LOOPBACK' : ['0.0.0.0', '::'].includes(m.HostIp) ? 'ALL_INTERFACES' : 'SPECIFIC_ADDRESS' };
    }) };
  });
}
async function dockerTopology(io) {
  let ids;
  try { ids = parseRows(await io.execute('/usr/bin/docker', ['ps', '-a', '--no-trunc', '-q'])).sort(); if (ids.some(id => !ID.test(id)) || new Set(ids).size !== ids.length) throw 0; }
  catch { return { ...unknown('DOCKER_INVENTORY_UNAVAILABLE'), containers: [], networks: [], inventoryStable: 'UNVERIFIED' }; }
  const containers = [];
  for (const id of limited(ids, LIMITS.containers, 'DOCKER_CONTAINERS', io)) {
    if (io.expired()) break;
    let failure = 'CONTAINER_INSPECT_COMMAND_UNAVAILABLE';
    try {
      const text = await io.execute('/usr/bin/docker', ['inspect', id, '--format', dockerTemplate]);
      failure = 'CONTAINER_INSPECT_JSON_UNVERIFIED';
      const values = text.split('\t').map(JSON.parse);
      failure = 'CONTAINER_INSPECT_FIELD_COUNT_UNVERIFIED';
      if (values.length !== dockerFields.length) throw 0;
      const [actualId, imageId, running, health, startedAt, pid, restarting, restartCount, restartPolicy, privileged, caps, networkMode, pidMode, ipcMode, ports, networks, mounts, service, project, name] = values;
      failure = 'CONTAINER_INSPECT_IDENTITY_UNVERIFIED';
      if (actualId !== id || !IMAGE.test(imageId)) throw 0;
      failure = 'CONTAINER_INSPECT_PROCESS_FIELDS_UNVERIFIED';
      if (!Number.isInteger(pid) || pid < 0 || !Number.isInteger(restartCount) || restartCount < 0) throw 0;
      failure = 'CONTAINER_INSPECT_STARTED_AT_UNVERIFIED';
      if (!validTime(startedAt)) throw 0;
      failure = 'CONTAINER_INSPECT_PROJECTION_UNVERIFIED';
      let revision = 'UNVERIFIED';
      try { const v = JSON.parse(await io.execute('/usr/bin/docker', ['image', 'inspect', imageId, '--format', '{{json (index .Config.Labels "org.opencontainers.image.revision")}}'])); if (SHA.test(v)) revision = v; } catch {}
      const capabilityNames = Array.isArray(caps) ? caps.filter(c => knownCaps.has(c)) : [];
      if (await io.execute('/usr/bin/docker', ['inspect', id, '--format', dockerTemplate]) !== text) throw 0;
      containers.push({ nameSha256: typeof name === 'string' ? hash(name) : 'UNVERIFIED', projectNameSha256: typeof project === 'string' ? hash(project) : 'UNVERIFIED', serviceNameSha256: typeof service === 'string' ? hash(service) : 'UNVERIFIED', verification: 'SNAPSHOT_ONLY', id, imageId, ociRevision: revision, running: safeBoolean(running), health: ['healthy', 'unhealthy', 'starting'].includes(health) ? health : 'UNVERIFIED',
        startedAt, pid, restarting: safeBoolean(restarting), restartCount, restartPolicy: ['no', 'always', 'unless-stopped', 'on-failure'].includes(restartPolicy) ? restartPolicy : 'UNVERIFIED',
        service: ['api', 'web', 'db'].includes(service) ? service : 'OTHER_UNVERIFIED', projectClass: typeof project === 'string' && /^phoenix[a-z0-9_-]*$/.test(project) ? 'PHOENIX' : 'OTHER_UNVERIFIED',
        privileged: safeBoolean(privileged), addedCapabilities: capabilityNames, unknownCapabilityCount: Array.isArray(caps) ? caps.length - capabilityNames.length : caps === null ? 0 : 'UNVERIFIED',
        networkMode: ['host', 'none', 'bridge', 'default'].includes(networkMode) ? networkMode.toUpperCase() : 'NAMED_OR_SHARED_UNVERIFIED', pidMode: modeClass(pidMode), ipcMode: modeClass(ipcMode),
        ports: portMappings(ports), networks: object(networks) ? Object.values(networks).map(n => ID.test(n?.NetworkID) ? { id: n.NetworkID, endpointId: ID.test(n.EndpointID) ? n.EndpointID : 'UNVERIFIED' } : unknown('NETWORK_ATTACHMENT_METADATA')) : [unknown('NETWORK_ATTACHMENT_METADATA')],
        mounts: Array.isArray(mounts) ? mounts.map(mountClass) : [unknown('MOUNT_METADATA')] });
    } catch (error) {
      const code = /^TOPOLOGY_HOLD=READONLY_METADATA_UNAVAILABLE_([A-Z_]+)$/.exec(error?.message || '')?.[1];
      containers.push({ id, ...unknown(failure), ...(failure === 'CONTAINER_INSPECT_COMMAND_UNAVAILABLE' ? { commandFailure: COMMAND_FAILURES.has(code) ? code : 'COMMAND_FAILURE_UNCLASSIFIED' } : {}) });
    }
  }
  const networks = [];
  try {
    const networkIds = parseRows(await io.execute('/usr/bin/docker', ['network', 'ls', '--no-trunc', '-q'])).sort();
    if (networkIds.some(id => !ID.test(id)) || new Set(networkIds).size !== networkIds.length) throw 0;
    for (const id of limited(networkIds, LIMITS.networks, 'DOCKER_NETWORKS', io)) {
      if (io.expired()) break;
      try {
        const [actualId, driver, scope, internal, attachable, ingress, members, bridgeName] = (await io.execute('/usr/bin/docker', ['network', 'inspect', id, '--format', networkTemplate])).split('\t').map(JSON.parse);
        if (actualId !== id || (members !== null && !object(members)) || Object.keys(members || {}).some(member => !ID.test(member))) throw 0;
        networks.push({ id, verification: 'SNAPSHOT_ONLY', driver: ['bridge', 'host', 'overlay', 'null', 'macvlan', 'ipvlan'].includes(driver) ? driver : 'UNVERIFIED',
          scope: ['local', 'swarm', 'global'].includes(scope) ? scope : 'UNVERIFIED', internal: safeBoolean(internal), attachable: safeBoolean(attachable), ingress: safeBoolean(ingress),
          memberIds: Object.keys(members || {}).sort(), bridgeInterface: typeof bridgeName === 'string' && /^(?:docker0|br-[a-f0-9]{12})$/.test(bridgeName) ? bridgeName : 'UNVERIFIED' });
      } catch { networks.push({ id, ...unknown('NETWORK_DISAPPEARED_OR_METADATA_UNAVAILABLE') }); }
    }
  } catch { networks.push(unknown('NETWORK_INVENTORY_UNAVAILABLE')); }
  let inventoryStable = 'UNVERIFIED';
  try { inventoryStable = JSON.stringify(ids) === JSON.stringify(parseRows(await io.execute('/usr/bin/docker', ['ps', '-a', '--no-trunc', '-q'])).sort()); } catch {}
  if (ids.length > LIMITS.containers) inventoryStable = 'UNVERIFIED_ENUMERATION_TRUNCATED';
  return { verification: inventoryStable === true && containers.every(c => c.verification === 'SNAPSHOT_ONLY') ? 'SNAPSHOT_ONLY' : 'UNVERIFIED', inventoryStable, containers, networks };
}
function statIdentity(text) {
  const end = text.lastIndexOf(')'); const fields = text.slice(end + 2).trim().split(/\s+/);
  if (end < 1 || !/^\d+$/.test(fields[19] || '') || !/^\d+$/.test(fields[1] || '')) throw 0;
  return { startTicks: fields[19], ppid: Number(fields[1]) };
}
async function processTopology(io, containerIds) {
  let names; try { names = (await io.readdir('/proc')).filter(name => /^\d+$/.test(name)); } catch { return { ...unknown('PROC_ENUMERATION_UNAVAILABLE'), processes: [] }; }
  const references = {};
  for (const ns of ['net', 'mnt', 'pid']) { if (io.expired()) break; try { references[ns] = await io.readlink(`/proc/1/ns/${ns}`); } catch {} }
  const processes = [];let inspectedNodeCount=0;
  for (const name of limited(names, LIMITS.processes, 'PROCESSES', io)) {
    if (io.expired()) break;
    const pid = Number(name);
    try {
      const first = statIdentity(await io.readFile(`/proc/${name}/stat`)); const status = await io.readFile(`/proc/${name}/status`);
      const uid = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(status); const ppid = /^PPid:\s+(\d+)\s*$/m.exec(status);
      if (!uid || !ppid || Number(ppid[1]) !== first.ppid) throw 0;
      const exe = await io.readlink(`/proc/${name}/exe`); const namespaces = {},namespaceRaw={};
      for (const ns of ['net', 'mnt', 'pid']) { try { const value = await io.readlink(`/proc/${name}/ns/${ns}`);namespaceRaw[ns]=value; namespaces[ns] = /^\w+:\[\d+\]$/.test(value) ? { relationToPid1: references[ns] ? value === references[ns] ? 'SAME' : 'DIFFERENT' : 'UNVERIFIED', identitySha256: hash(value) } : unknown('NAMESPACE_METADATA'); } catch { namespaces[ns] = unknown('NAMESPACE_UNAVAILABLE'); } }
      const cgroup = await io.readFile(`/proc/${name}/cgroup`); const matches = [...cgroup.matchAll(/(?:docker[-/]|cri-containerd[-/]|libpod[-/])([a-f0-9]{64})(?:\.scope|\/|$)/g)].map(m => m[1]);
      const known = [...new Set(matches.filter(id => containerIds.includes(id)))];
      let cwdSha256 = 'UNVERIFIED',cwd; try { cwd = await io.readlink(`/proc/${name}/cwd`); if (path.isAbsolute(cwd) && cwd === await io.readlink(`/proc/${name}/cwd`)) cwdSha256 = hash(cwd); } catch {}
      let nodePublicMetadata,commandLineHash;
      if(executableClass(exe)==='NODE'&&matches.length===0&&Number(uid[1])===0&&Number(uid[2])===0){
        nodePublicMetadata={entryClass:'UNVERIFIED',packageEvidenceClass:'UNVERIFIED',businessOwner:'UNKNOWN',stopAuthorized:false};
        if(inspectedNodeCount++<16){
          try{const commandLine=await io.readNodeCommandLine(`/proc/${name}/cmdline`);commandLineHash=hash(commandLine);Object.assign(nodePublicMetadata,projectNodeEntry(commandLine));}catch{}
          if(cwd&&cwdSha256!=='UNVERIFIED'&&namespaces.mnt?.relationToPid1==='SAME'){try{Object.assign(nodePublicMetadata,await io.readNodePackage(cwd));}catch{}}
        }
      }
      const groupPaths = cgroup.trim().split('\n').map(line => /^\d+:[^:]*:(\/[^\r\n]*)$/.exec(line)?.[1]);
      const systemdControlGroupSha256 = groupPaths.length && groupPaths.every(Boolean) ? [...new Set(groupPaths)].sort().map(hash) : 'UNVERIFIED';
      const second = statIdentity(await io.readFile(`/proc/${name}/stat`));
      const secondStatus = await io.readFile(`/proc/${name}/status`);
      if (JSON.stringify(first) !== JSON.stringify(second) || /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(secondStatus)?.[0] !== uid[0]
        || await io.readFile(`/proc/${name}/cgroup`) !== cgroup||await io.readlink(`/proc/${name}/exe`)!==exe) throw 0;
      if(cwdSha256!=='UNVERIFIED'&&await io.readlink(`/proc/${name}/cwd`)!==cwd)throw 0;
      for(const ns of Object.keys(namespaceRaw))if(await io.readlink(`/proc/${name}/ns/${ns}`)!==namespaceRaw[ns])throw 0;
      if(commandLineHash&&hash(await io.readNodeCommandLine(`/proc/${name}/cmdline`))!==commandLineHash)throw 0;
      const row={ pid, ppid: first.ppid, realUid: Number(uid[1]), effectiveUid: Number(uid[2]), startTicks: first.startTicks, verification: 'SNAPSHOT_ONLY',
        executableClass: executableClass(exe), executablePathSha256: hash(exe), cwdSha256, systemdControlGroupSha256, namespaces, cgroupSha256: hash(cgroup),
        executionLocation: known.length === 1 ? 'KNOWN_DOCKER_CONTAINER' : matches.length ? 'UNKNOWN_CONTAINER_UNVERIFIED' : 'HOST_OR_UNCLASSIFIED', containerIds: known,
        executorRole: known.length ? 'CONTAINER_ROLE_FROM_DOCKER_METADATA' : 'UNVERIFIED_NO_ARGUMENTS_INSPECTED',...(nodePublicMetadata?{nodePublicMetadata}: {}) };
      if(nodePublicMetadata)privateNodePins.set(row,{first,statusUid:uid[0],exe,cwd,cgroup,namespaceRaw,commandLineHash});
      processes.push(row);
    } catch { processes.push({ pid, ...unknown('PROCESS_EXIT_REUSE_OR_METADATA_UNAVAILABLE') }); }
  }
  return { verification: hasUnverified(processes) ? 'UNVERIFIED' : 'SNAPSHOT_ONLY', namespaceReference: 'PROC_1_ONLY_NOT_HOST_ATTESTATION', hostExecutorCompleteness: 'UNVERIFIED', processes };
}
async function systemdTopology(io) {
  try {
    const services = JSON.parse(await io.execute('/usr/bin/systemctl', ['list-units', '--type=service', '--all', '--no-pager', '--output=json']));
    const timers = JSON.parse(await io.execute('/usr/bin/systemctl', ['list-timers', '--all', '--no-pager', '--output=json']));
    if (!Array.isArray(services) || !Array.isArray(timers)) throw 0;
    const names = [...new Set([...services.map(s => s.unit), ...timers.flatMap(t => [t.unit, t.activates])].filter(n => typeof n === 'string'))]; const units = [];
    for (const unit of limited(names, LIMITS.units, 'SYSTEMD_UNITS', io)) {
      if (io.expired()) break;
      if (!unitPattern.test(unit)) { units.push({ unitNameSha256: hash(unit), ...unknown('UNIT_NAME_UNSUPPORTED') }); continue; }
      try {
        const text = await io.execute('/usr/bin/systemctl', ['show', '--no-pager', `--property=${properties}`, unit]); const metadata = {};
        for (const line of text.split('\n')) { const i = line.indexOf('='); if (i > 0) metadata[line.slice(0, i)] = line.slice(i + 1); }
        if (metadata.Id !== unit) throw 0;
        let mainProcess = unknown('PROCESS_EXIT_REUSE_OR_METADATA_UNAVAILABLE');
        if (/^[1-9][0-9]*$/.test(metadata.MainPID || '')) {
          const main = metadata.MainPID;
          const first = statIdentity(await io.readFile(`/proc/${main}/stat`));
          const status = await io.readFile(`/proc/${main}/status`);
          const uid = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(status);
          const second = statIdentity(await io.readFile(`/proc/${main}/stat`));
          const afterStatus = await io.readFile(`/proc/${main}/status`);
          if (!uid || JSON.stringify(first) !== JSON.stringify(second) || /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(afterStatus)?.[0] !== uid[0]) throw 0;
          if (await io.execute('/usr/bin/systemctl', ['show', '--no-pager', `--property=${properties}`, unit]) !== text) throw 0;
          mainProcess = { pid: Number(main), startTicks: first.startTicks, realUid: Number(uid[1]), effectiveUid: Number(uid[2]), verification: 'SNAPSHOT_ONLY' };
        }
        const controlGroupSha256 = typeof metadata.ControlGroup === 'string' && metadata.ControlGroup.startsWith('/') ? hash(metadata.ControlGroup) : 'UNVERIFIED';
        const workingDirectorySha256 = typeof metadata.WorkingDirectory === 'string' && metadata.WorkingDirectory.startsWith('/') ? hash(metadata.WorkingDirectory) : 'UNVERIFIED';
        const invocationIdSha256 = /^[a-f0-9]{32}$/.test(metadata.InvocationID || '') ? hash(metadata.InvocationID) : 'UNVERIFIED';
        const state = (value, allowed) => allowed.includes(value) ? value : 'UNVERIFIED';
        const unitRow={ mainProcess, controlGroupSha256, workingDirectorySha256, invocationIdSha256, unitNameSha256: hash(unit), unitClass: unitClass(unit), unitType: unit.endsWith('.timer') ? 'TIMER' : 'SERVICE', verification: 'SNAPSHOT_ONLY',
          activeState: state(metadata.ActiveState, ['active', 'inactive', 'activating', 'deactivating', 'failed', 'reloading']), subState: state(metadata.SubState, ['running', 'exited', 'dead', 'waiting', 'elapsed', 'failed', 'start', 'stop']),
          loadState: state(metadata.LoadState, ['loaded', 'not-found', 'error', 'masked']), unitFileState: state(metadata.UnitFileState, ['enabled', 'disabled', 'static', 'masked', 'indirect', 'generated', 'transient', 'enabled-runtime', 'linked', 'linked-runtime']),
          mainPid: /^\d+$/.test(metadata.MainPID || '') ? Number(metadata.MainPID) : 'UNVERIFIED', controlPid: /^\d+$/.test(metadata.ControlPID || '') ? Number(metadata.ControlPID) : 'UNVERIFIED',
          restart: state(metadata.Restart, ['no', 'always', 'on-success', 'on-failure', 'on-abnormal', 'on-watchdog', 'on-abort']),
          fragmentPathSha256: hash(metadata.FragmentPath || ''), hasDropIns: Boolean(metadata.DropInPaths), triggersCount: metadata.Triggers?.split(/\s+/).filter(Boolean).length || 0,
          triggeredByCount: metadata.TriggeredBy?.split(/\s+/).filter(Boolean).length || 0,
          triggerTargetSha256: (metadata.Triggers || '').split(/\s+/).filter(Boolean).map(hash),
          triggeredByTargetSha256: (metadata.TriggeredBy || '').split(/\s+/).filter(Boolean).map(hash) };
        privateUnitNames.set(unitRow,unit);units.push(unitRow);
      } catch { units.push({ unitNameSha256: hash(unit), ...unknown('UNIT_DISAPPEARED_OR_METADATA_UNAVAILABLE') }); }
    }
    return { verification: hasUnverified(units) ? 'UNVERIFIED' : 'SNAPSHOT_ONLY', serviceCount: services.length, timerCount: timers.length, units, unitCommandsInspected: false,
      unsupportedServiceRows: services.filter(s => !unitPattern.test(s.unit || '')).length, unsupportedTimerRows: timers.filter(t => !unitPattern.test(t.unit || '')).length };
  } catch { return { ...unknown('SYSTEMD_METADATA_UNAVAILABLE'), units: [], unitCommandsInspected: false }; }
}
async function joinNodeUnitMetadata(io,processes,systemd){
 for(const row of processes.processes){
  const saved=privateNodePins.get(row);if(!saved||io.expired())continue;
  try{
   const base='/proc/'+row.pid;
   if(JSON.stringify(statIdentity(await io.readFile(base+'/stat')))!==JSON.stringify(saved.first)
    ||/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(await io.readFile(base+'/status'))?.[0]!==saved.statusUid
    ||await io.readlink(base+'/exe')!==saved.exe||await io.readFile(base+'/cgroup')!==saved.cgroup)throw 0;
   if(saved.cwd&&await io.readlink(base+'/cwd')!==saved.cwd)throw 0;
   for(const ns of Object.keys(saved.namespaceRaw))if(await io.readlink(base+'/ns/'+ns)!==saved.namespaceRaw[ns])throw 0;
   if(saved.commandLineHash&&hash(await io.readNodeCommandLine(base+'/cmdline'))!==saved.commandLineHash)throw 0;
   if(JSON.stringify(statIdentity(await io.readFile(base+'/stat')))!==JSON.stringify(saved.first)
    ||/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(await io.readFile(base+'/status'))?.[0]!==saved.statusUid)throw 0;
   const matches=systemd.units.filter(unit=>unit.verification==='SNAPSHOT_ONLY'&&Array.isArray(row.systemdControlGroupSha256)&&row.systemdControlGroupSha256.includes(unit.controlGroupSha256));
   row.nodePublicMetadata.unitProcessJoin='UNVERIFIED';
   if(matches.length===1){
    const unit=matches[0],main=unit.mainProcess;
    if(main?.verification==='SNAPSHOT_ONLY'&&main.pid===row.pid&&main.startTicks===row.startTicks&&main.realUid===row.realUid&&main.effectiveUid===row.effectiveUid)row.nodePublicMetadata.unitProcessJoin='EXACT_MAIN_PROCESS';
    else if(main?.verification==='SNAPSHOT_ONLY'&&main.pid!==row.pid)row.nodePublicMetadata.unitProcessJoin='SAME_CGROUP_PROCESS';
    const name=privateUnitNames.get(unit);
    if(row.nodePublicMetadata.unitProcessJoin!=='UNVERIFIED'&&typeof name==='string'&&/^[a-z][a-z0-9_-]{0,47}\.service$/.test(name)&&!sensitivePublicName(name))row.nodePublicMetadata.unitPublicName=name;
   }
  }catch{row.verification='UNVERIFIED';row.nodePublicMetadata={entryClass:'UNVERIFIED',packageEvidenceClass:'UNVERIFIED',unitProcessJoin:'UNVERIFIED',businessOwner:'UNKNOWN',stopAuthorized:false};}
 }
}
async function cronTopology(io) {
  const files = [], sources = ['/etc/crontab'];
  const periodicDirectories = [];
  for (const directory of ['/etc/cron.hourly', '/etc/cron.daily', '/etc/cron.weekly', '/etc/cron.monthly']) {
    if (io.expired()) break;
    try { const s = await io.lstat(directory); if (!s.isDirectory() || s.isSymbolicLink()) throw 0; const entries = await io.readdir(directory); periodicDirectories.push({ sourcePathSha256: hash(directory), entryCount: entries.length, verification: 'UNVERIFIED', reason: 'PERIODIC_SCRIPT_CONTENT_NOT_INSPECTED' }); }
    catch { periodicDirectories.push({ sourcePathSha256: hash(directory), ...unknown('PERIODIC_CRON_DIRECTORY_UNAVAILABLE') }); }
  }
  for (const directory of ['/etc/cron.d', '/var/spool/cron/crontabs', '/var/spool/cron']) {
    if (io.expired()) break;
    try {
      const stat = await io.lstat(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) throw 0;
      const entries = await io.readdir(directory);
      for (const name of limited(entries, LIMITS.cronEntries, 'CRON_DIRECTORY_ENTRIES', io)) { if (!/^[^/\0]{1,255}$/.test(name) || name === '.' || name === '..') continue; sources.push(path.join(directory, name)); }
    } catch { files.push({ sourcePathSha256: hash(directory), ...unknown('CRON_DIRECTORY_UNAVAILABLE') }); }
  }
  for (const source of limited(sources, LIMITS.cronSources, 'CRON_SOURCES', io)) {
    if (io.expired()) break;
    try {
      if (/(?:^|\/)(?:\.env(?:\.|$)|id_rsa|id_ed25519|.*\.pem$)/i.test(source)) throw 0;
      const before = await io.lstat(source);
      if (!before.isFile() || before.isSymbolicLink() || before.size > 256 * 1024 || before.nlink !== 1) throw 0;
      const text = await io.readCronFile(source, before); const after = await io.lstat(source);
      if (['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'uid', 'gid', 'mode'].some(k => before[k] !== after[k])) throw 0;
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')); const assignments = lines.filter(l => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l)); const entries = lines.filter(l => !assignments.includes(l));
      files.push({ sourcePathSha256: hash(source), verification: 'SNAPSHOT_ONLY', uid: before.uid, gid: before.gid, mode: before.mode & 0o7777, bytes: before.size,
        entries: entries.length, environmentAssignmentCount: assignments.length, hasRebootEntry: entries.some(l => /^@reboot\s/.test(l)), hasChanjetReference: /chanjet/i.test(text),
        hasPhoenixReference: /phoenix/i.test(text), hasDockerReference: /\bdocker\b/.test(text), hasNetworkToolReference: /\b(?:curl|wget|ssh|scp|sftp)\b/.test(text),
        commandSafety: 'UNVERIFIED_CONTENT_NOT_EXPORTED', commandContentsExported: false });
    } catch { files.push({ sourcePathSha256: hash(source), ...unknown('CRON_FILE_SYMLINK_RACE_SIZE_OR_UNAVAILABLE') }); }
  }
  return { verification: hasUnverified(files) || hasUnverified(periodicDirectories) ? 'UNVERIFIED' : 'SNAPSHOT_ONLY', sourceCoverage: 'FIXED_SYSTEM_AND_SPOOL_PATHS_ONLY', otherSchedulers: 'UNVERIFIED', periodicDirectories, files };
}

export async function collectMaintenanceHostTopology(dependencies = {}) {
  const now = dependencies.now || Date.now; const clock = dependencies.budgetNow || dependencies.now || (() => performance.now());
  const startedMs = now(); const startedBudgetMs = clock(); const deadline = startedBudgetMs + TOPOLOGY_MAXIMUM_MS;
  const expired = () => clock() >= deadline;
  const budget = () => { if (expired()) throw new Error('TOPOLOGY_HOLD=COLLECTION_BUDGET_EXHAUSTED'); };
  const wrap = fn => async (...args) => { budget(); const result = await fn(...args); budget(); return result; };
  const guard = dependencies.guard || (async () => false); const uid = dependencies.uid || (() => process.getuid());
  const check = async () => {
    budget();
    let authorized = false;
    try { authorized = uid() === 0 && await guard() === true; } catch { /* Never relay a guard's potentially sensitive diagnostic text. */ }
    budget();
    if (!authorized) throw new Error('TOPOLOGY_HOLD=PROTECTED_ROOT_CONTEXT_REQUIRED');
  };
  await check(); const startedAt = new Date(startedMs).toISOString(); const truncations = [];
  const execute = dependencies.execute || readonlyTopologyCommand;
  const io = { expired, truncations, execute: async (binary, args) => { budget(); const remaining = Math.min(10000, Math.floor(deadline - clock())); if (remaining < 1) throw new Error('TOPOLOGY_HOLD=COLLECTION_BUDGET_EXHAUSTED'); const result = await execute(binary, args, { timeoutMs: remaining }); budget(); return result; },
    readFile: wrap(dependencies.readFile || (file => fs.readFileSync(file, 'utf8'))), lstat: wrap(dependencies.lstat || (file => fs.lstatSync(file))),
    readdir: wrap(dependencies.readdir || (directory => fs.readdirSync(directory))), readlink: wrap(dependencies.readlink || (file => fs.readlinkSync(file))),
    readCronFile: wrap((file, expected) => (dependencies.readCronFile || readCronFile)(file, expected, budget)),
    readNodeCommandLine:wrap(file=>(dependencies.readNodeCommandLine||boundedProcCommandLine)(file,budget)),
    readNodePackage:wrap(directory=>(dependencies.readNodePackage||readNodeCwdPackage)(directory,budget)) };
  const docker = await dockerTopology(io); if (!expired()) await check();
  const processes = expired() ? { ...unknown('TOTAL_BUDGET_EXHAUSTED_TRUNCATED'), processes: [] } : await processTopology(io, docker.containers.map(c => c.id)); if (!expired()) await check();
  const systemd = expired() ? { ...unknown('TOTAL_BUDGET_EXHAUSTED_TRUNCATED'), units: [] } : await systemdTopology(io); if (!expired()) await check();
  if(!expired())await joinNodeUnitMetadata(io,processes,systemd);if(!expired())await check();
  const cron = expired() ? { ...unknown('TOTAL_BUDGET_EXHAUSTED_TRUNCATED'), files: [] } : await cronTopology(io); if (!expired()) await check();
  const finishedMs = now(); const elapsedMs = Math.max(0, clock() - startedBudgetMs); const budgetExpired = expired(); if (budgetExpired) truncations.push({ scope: 'COLLECTOR', reason: 'TOTAL_BUDGET_EXHAUSTED_TRUNCATED' });
  const result = { schema: TOPOLOGY_SCHEMA, startedAt, finishedAt: new Date(finishedMs).toISOString(), result: truncations.length ? 'READONLY_SNAPSHOT_UNVERIFIED_TRUNCATED' : 'READONLY_SNAPSHOT',
    verification: hasUnverified({ docker, processes, systemd, cron }) || truncations.length ? 'UNVERIFIED' : 'SNAPSHOT_ONLY', docker, processes, systemd, cron,
    collectionBudget: { maximumMs: TOPOLOGY_MAXIMUM_MS, elapsedMs, expired: budgetExpired }, truncations,
    completeSafetyProof: false, productionMutation: false, continuousDrainProof: false, admissionOrApprovalGranted: false,
    unverifiedBoundaries: ['CONTINUOUS_INGRESS_ENFORCEMENT', 'TASK_DRAIN_AND_SIDE_EFFECTS', 'HOST_EXECUTOR_COMPLETENESS', 'EXTERNAL_ORCHESTRATORS', 'UNLISTED_CRON_AND_USER_SCHEDULERS', 'PROCESS_AND_CONTAINER_RACES'] };
  result.outputBudget = { maximumBytes: TOPOLOGY_MAXIMUM_OUTPUT_BYTES, truncated: false };
  const outputBytes = Buffer.byteLength(JSON.stringify(result));
  if (outputBytes <= TOPOLOGY_MAXIMUM_OUTPUT_BYTES) return result;
  return { schema: result.schema, startedAt, finishedAt: result.finishedAt, result: 'READONLY_SNAPSHOT_UNVERIFIED_TRUNCATED', verification: 'UNVERIFIED',
    collectionBudget: result.collectionBudget, outputBudget: { maximumBytes: TOPOLOGY_MAXIMUM_OUTPUT_BYTES, observedBytes: outputBytes, truncated: true },
    truncations: [...truncations, { scope: 'OUTPUT', reason: 'OUTPUT_SIZE_LIMIT_TRUNCATED' }],
    docker: { verification: 'UNVERIFIED', inventoryStable: 'UNVERIFIED_OUTPUT_TRUNCATED', observedContainerCount: docker.containers.length, observedNetworkCount: docker.networks.length },
    processes: { verification: 'UNVERIFIED', observedCount: processes.processes.length }, systemd: { verification: 'UNVERIFIED', observedUnitCount: systemd.units.length }, cron: { verification: 'UNVERIFIED', observedFileCount: cron.files.length },
    completeSafetyProof: false, productionMutation: false, continuousDrainProof: false, admissionOrApprovalGranted: false, unverifiedBoundaries: result.unverifiedBoundaries };
}
