/** GitHub-hosted disposable host fixture. Never a production/Docker/OCI receipt.
 * The API uses its real fixed reader, RO directory mount and PG lock backend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import networkFixture from './background-control-api-network-fixture.cjs';

export const TARGET = '/run/phoenix-background-control';
export const STATE = '/run/phoenix-background-ci-fixture';
export const KINDS = ['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION'];
const REPO = 'ivanzhao299/phoenix-erp-v3';
const FIXTURE_KEYS = ['GITHUB_ACTIONS','CI','RUNNER_ENVIRONMENT','RUNNER_OS','RUNNER_ARCH','GITHUB_REPOSITORY','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB','GITHUB_SHA','GITHUB_WORKSPACE','RUNNER_TEMP','NODE_ENV','APP_ENV','DB_HOST','DB_PORT','DB_USER','DB_NAME','PORT','BACKGROUND_FIXTURE_POSTGRES_ID'];
const safeEnv = () => ({ PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', DOCKER_HOST: 'unix:///var/run/docker.sock' });
const hold = code => { throw new Error(`CI_BACKGROUND_HOLD=${code}`); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const exec = (cmd, args, options = {}) => execFileSync(cmd, args, { env: safeEnv(), encoding: 'utf8', timeout: 10000, maxBuffer: 128 * 1024, stdio: ['ignore','pipe','pipe'], ...options }).trim();
const git = (root, args) => exec('git', ['-c', `safe.directory=${root}`, '-c','core.hooksPath=/dev/null',...args], { cwd: root });
function processStat(pid) {
  const text = fs.readFileSync(`/proc/${pid}/stat`,'utf8'); const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
  const uid = Number(fs.readFileSync(`/proc/${pid}/status`,'utf8').match(/^Uid:\s+(\d+)/m)?.[1]);
  return { pid: Number(pid), ppid: Number(fields[1]), start: fields[19], uid, exe: fs.realpathSync(`/proc/${pid}/exe`), cwd: fs.realpathSync(`/proc/${pid}/cwd`) };
}
export function findRunnerAncestor(pid = process.pid, read = processStat) {
  for (let i = 0; i < 32 && pid > 1; i++) {
    const p = read(pid);
    // Hosted diagnostic run 39057912017 established this versioned cached layout.
    // Keep the absolute directory, numeric version and Worker binary exact.
    if (/^\/home\/runner\/runners\/[^/]+\/bin\/Runner\.Worker$/.test(p.exe)
      || /^\/home\/runner\/actions-runner\/cached\/\d+\.\d+\.\d+\/bin\/Runner\.Worker$/.test(p.exe)) return { pid: p.pid, start: p.start, exe: p.exe };
    pid = p.ppid;
  }
  hold('REAL_HOSTED_RUNNER_REQUIRED');
}
export function validateContext(c, facts) {
  if (c.GITHUB_ACTIONS !== 'true' || c.CI !== 'true' || c.RUNNER_ENVIRONMENT !== 'github-hosted' || c.RUNNER_OS !== 'Linux'
    || !['X64','ARM64'].includes(c.RUNNER_ARCH) || c.GITHUB_REPOSITORY !== REPO || c.NODE_ENV !== 'test' || c.APP_ENV !== 'test') hold('HOSTED_TEST_CI_ONLY');
  if (!/^\d+$/.test(c.GITHUB_RUN_ID || '') || !/^\d+$/.test(c.GITHUB_RUN_ATTEMPT || '') || !/^[A-Za-z0-9_-]{1,80}$/.test(c.GITHUB_JOB || '')
    || !/^[a-f0-9]{40}$/.test(c.GITHUB_SHA || '') || !/^[a-f0-9]{64}$/.test(c.BACKGROUND_FIXTURE_POSTGRES_ID || '')) hold('EXACT_JOB_SERVICE_BINDING');
  if (c.GITHUB_WORKSPACE !== '/home/runner/work/phoenix-erp-v3/phoenix-erp-v3' || c.RUNNER_TEMP !== '/home/runner/work/_temp'
    || facts.workspace !== c.GITHUB_WORKSPACE || facts.temp !== c.RUNNER_TEMP || facts.production || !facts.runner
    || facts.head !== c.GITHUB_SHA || !facts.originApproved || !facts.mainRegular || !Number.isInteger(c.uid) || c.uid < 1
    || facts.workspaceUid !== c.uid || facts.tempUid !== c.uid) hold('ISOLATED_WORKSPACE_REQUIRED');
  if (c.DB_HOST !== '127.0.0.1' || String(c.DB_PORT) !== '5432' || c.DB_USER !== 'phoenix_v3' || c.DB_NAME !== 'phoenix_erp'
    || String(c.PORT || '3100') !== '3100') hold('LOOPBACK_FIXTURE_DATABASE_ONLY');
  return { owner: `ci-${c.GITHUB_RUN_ID}-${c.GITHUB_RUN_ATTEMPT}-${c.GITHUB_JOB}`, targetSha: c.GITHUB_SHA };
}
function contextFacts(c) {
  const workspace = fs.realpathSync(c.GITHUB_WORKSPACE); const temp = fs.realpathSync(c.RUNNER_TEMP);
  const file = path.join(workspace,'apps/api/dist/main.js'); const s = fs.lstatSync(file);
  const origin = git(workspace,['remote','get-url','origin']);
  return { workspace, temp, workspaceUid: fs.statSync(workspace).uid, tempUid: fs.statSync(temp).uid,
    production: ['/data/phoenix-erp','/var/lib/phoenix-erp/production-deployment-state'].some(f => fs.existsSync(f)), runner: findRunnerAncestor(),
    head: git(workspace,['rev-parse','HEAD']), originApproved: /^(?:https:\/\/github\.com\/|git@github\.com:)ivanzhao299\/phoenix-erp-v3(?:\.git)?$/.test(origin),
    mainRegular: s.isFile() && !s.isSymbolicLink() && fs.realpathSync(file) === file };
}
function approvedContext(c) {
  // Reject obviously invalid requests before reading arbitrary supplied paths.
  validateContext(c, { workspace: c.GITHUB_WORKSPACE, temp: c.RUNNER_TEMP, workspaceUid: c.uid, tempUid: c.uid, runner: true, head: c.GITHUB_SHA, originApproved: true, mainRegular: true });
  return validateContext(c, contextFacts(c));
}
export function validateDatabaseContainer(c, inspect) {
  const ports = inspect.NetworkSettings?.Ports?.['5432/tcp'];
  if (inspect.Id !== c.BACKGROUND_FIXTURE_POSTGRES_ID || !/^postgres:(?:16(?:\.\d+)*|18(?:\.\d+)*)-alpine$/.test(inspect.Config?.Image || '')
    || inspect.State?.Running !== true || inspect.State?.Health?.Status !== 'healthy' || !Array.isArray(ports) || ports.length < 1
    || ports.some(p => p.HostPort !== '5432' || p.HostIp !== '127.0.0.1')
    || !Array.isArray(inspect.Mounts) || inspect.Mounts.some(m => m.Type === 'bind' && (m.Source?.startsWith('/data/') || m.Source?.startsWith('/var/lib/phoenix')))) hold('JOB_POSTGRES_SERVICE_REQUIRED');
  return true;
}
function database(c, sql) {
  // Never inspect Config.Env or a connection string, even in this fixture.
  const fields=exec('docker',['inspect',c.BACKGROUND_FIXTURE_POSTGRES_ID,'--format','{{json .Id}}\t{{json .Config.Image}}\t{{json .State}}\t{{json .NetworkSettings.Ports}}\t{{json .Mounts}}']).split('\t').map(JSON.parse);
  validateDatabaseContainer(c,{Id:fields[0],Config:{Image:fields[1]},State:fields[2],NetworkSettings:{Ports:fields[3]},Mounts:fields[4]});
  const result = exec('docker',['exec','-i',c.BACKGROUND_FIXTURE_POSTGRES_ID,'psql','-X','-qAt','--set=ON_ERROR_STOP=1','--username=phoenix_v3','--dbname=phoenix_erp'],
    { input: `BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; ${sql} ROLLBACK;`, stdio: ['pipe','pipe','pipe'] });
  try { return JSON.parse(result); } catch { hold('DATABASE_IDENTITY_UNVERIFIED'); }
}
export function validateStatus(s, { owner, generation, phase, sha } = {}) {
  const control = s?.controlSession;
  if (s?.protocolVersion !== 1 || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s.bootId || '')
    || s.phase !== phase || s.owner !== owner || s.generation !== generation || s.poisoned !== false || s.stopping !== false
    || !control || control.connected !== true || control.broken !== false || !Number.isSafeInteger(control.sessionPid) || control.sessionPid < 1
    || !Number.isSafeInteger(control.databaseOid) || control.databaseOid < 1 || !Number.isFinite(Date.parse(control.backendStartedAt))
    || control.applicationName !== `phoenix-fence:${s.bootId}` || !/^[a-f0-9]{40}$/.test(sha || '')) hold('REAL_FENCED_BOOT_REQUIRED');
  for (const name of ['inFlight','pendingChildren','taskGraphs']) if (!Number.isSafeInteger(s[name]) || s[name] < 0) hold('TASK_GRAPH_UNVERIFIED');
  return s;
}
async function status() {
  const r = await fetch('http://127.0.0.1:3100/api/internal/background/status', { signal: AbortSignal.timeout(3000), redirect: 'error' });
  if (!r.ok) hold('STATUS_UNAVAILABLE'); return r.json();
}
function verifySession(c, s) {
  const p = s.controlSession;
  const db = database(c, `SELECT json_build_object('database',current_database(),'role',current_user,'oid',(SELECT oid FROM pg_database WHERE datname=current_database()),'bound',(SELECT count(*)=1 AND coalesce(bool_and(pid=${p.sessionPid} AND datid=${p.databaseOid} AND usename='phoenix_v3' AND floor(extract(epoch FROM backend_start)*1000)::bigint=${Date.parse(p.backendStartedAt)}),false) FROM pg_stat_activity WHERE application_name='phoenix-fence:${s.bootId}'));`);
  if (db.database !== 'phoenix_erp' || db.role !== 'phoenix_v3' || Number(db.oid) !== p.databaseOid || db.bound !== true) hold('CONTROL_SESSION_WRONG_DATABASE');
}
function rootOnly() { if (process.getuid() !== 0 || Number(process.env.SUDO_UID) < 1) hold('SUDO_HOST_FIXTURE_ONLY'); }
function privateRecord() {
  const parent = fs.lstatSync(STATE); const file = path.join(STATE,'state.json'); const s = fs.lstatSync(file);
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== 0 || (parent.mode & 0o777) !== 0o700
    || !s.isFile() || s.isSymbolicLink() || s.uid !== 0 || (s.mode & 0o777) !== 0o600 || s.nlink !== 1) hold('ROOT_RECEIPT_UNTRUSTED');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function writePrivate(record) {
  const file = path.join(STATE,'state.json'); const temporary = path.join(STATE,`state-${randomBytes(8).toString('hex')}.tmp`);
  fs.writeFileSync(temporary,JSON.stringify(record)+'\n',{ mode: 0o600, flag: 'wx' }); fs.renameSync(temporary,file);
}
function prepareNetworkAudit(c) {
  const file=path.join(c.RUNNER_TEMP,`phoenix-background-network-${randomBytes(16).toString('hex')}.jsonl`);
  const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW,0o600);
  fs.fchmodSync(fd,0o600);return {path:file,fd,close:()=>fs.closeSync(fd)};
}
function bindNetworkAudit(input,c,launcher) {
  const a=input.networkAudit;const base=c.RUNNER_TEMP;
  if(!Number.isSafeInteger(a?.fd)||a.fd<3||typeof a.path!=='string'||path.dirname(a.path)!==base
    ||!/^phoenix-background-network-[a-f0-9]{32}\.jsonl$/.test(path.basename(a.path)))hold('NETWORK_AUDIT_REQUIRED');
  const s=fs.lstatSync(a.path);const procFd=`/proc/${launcher.pid}/fd/${a.fd}`;const f=fs.statSync(procFd);
  const flags=Number.parseInt(fs.readFileSync(`/proc/${launcher.pid}/fdinfo/${a.fd}`,'utf8').match(/^flags:\s+([0-7]+)$/m)?.[1]||'0',8);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.uid!==c.uid||(s.mode&0o777)!==0o600||s.size!==0
    ||fs.realpathSync(procFd)!==a.path||f.dev!==s.dev||f.ino!==s.ino||!(flags&fs.constants.O_APPEND))hold('NETWORK_AUDIT_UNTRUSTED');
  const file=path.join(STATE,'network.jsonl');
  // Change ownership through an O_NOFOLLOW descriptor, never a user-writable
  // pathname that could be exchanged for a symlink between checks.
  const fd=fs.openSync(a.path,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {
    const held=fs.fstatSync(fd);
    if(held.dev!==s.dev||held.ino!==s.ino||!held.isFile()||held.nlink!==1||held.uid!==c.uid||(held.mode&0o777)!==0o600)hold('NETWORK_AUDIT_UNTRUSTED');
    fs.fchownSync(fd,0,0);fs.renameSync(a.path,file);
    const after=fs.lstatSync(file);const current=processStat(launcher.pid);const procAfter=fs.statSync(procFd);
    if(after.dev!==held.dev||after.ino!==held.ino||after.nlink!==1||!after.isFile()||after.uid!==0||(after.mode&0o777)!==0o600
      ||current.start!==launcher.start||current.uid!==launcher.uid||fs.realpathSync(procFd)!==file||procAfter.dev!==held.dev||procAfter.ino!==held.ino)hold('NETWORK_AUDIT_UNTRUSTED');
    return {dev:after.dev,ino:after.ino};
  }finally{fs.closeSync(fd);}
}
function verifyNetworkAudit(r) {
  const file=path.join(STATE,'network.jsonl');const s=fs.lstatSync(file);
  if(!r.networkAudit||!r.api||!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o777)!==0o600||s.nlink!==1
    ||s.dev!==r.networkAudit.dev||s.ino!==r.networkAudit.ino||s.size>16*1024*1024)hold('NETWORK_AUDIT_UNTRUSTED');
  const text=fs.readFileSync(file,'utf8');
  return {...networkFixture.readAudit(text,r.api.pid),sha256:createHash('sha256').update(text).digest('hex')};
}
function mountRows() { return fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').filter(Boolean).map(line => line.split(' ')); }
export function controlPathExists(file, stat = fs.lstatSync) {
  try { stat(file); return true; }
  catch(error) { if(error.code==='ENOENT')return false;hold('CONTROL_PATH_UNVERIFIED'); }
}
export function cleanupNotStarted({ exists = controlPathExists, rows = mountRows } = {}) {
  if(exists(STATE))return null;
  // A dangling path, an orphaned mount, or inaccessible metadata is not proof
  // that this job never started. Never unmount or delete an unknown owner.
  if(exists(TARGET)||rows().some(parts=>parts[4]===TARGET))hold('ORPHANED_CONTROL');
  return {phase:'NOT_STARTED'};
}
export function inspectCleanupProcess(pid, { read = processStat, probe = p => process.kill(p,0) } = {}) {
  try { return read(pid); }
  catch(error) {
    if(!['ENOENT','ESRCH'].includes(error.code))hold('API_PROCESS_STATE_UNVERIFIED');
    // Missing cwd/exe metadata can yield ENOENT while the process is alive.
    // Confirm kernel-level absence rather than treating that as a stopped API.
    try { probe(pid); }
    catch(probeError) { if(probeError.code==='ESRCH')return null;hold('API_PROCESS_STATE_UNVERIFIED'); }
    hold('API_PROCESS_STATE_UNVERIFIED');
  }
}
export async function waitFixtureProcessExit(api, dependencies = {}) {
  const inspect=dependencies.inspect||inspectCleanupProcess;
  for(let n=0;n<100;n++) {
    const current=inspect(api.pid);
    if(!current)return;
    if(current.start!==api.start)hold('API_PID_REUSED');
    await (dependencies.sleep||sleep)(100);
  }
  hold('API_SHUTDOWN_TIMEOUT');
}
function assertOwnedSource(r, requireMount = true) {
  const s = fs.lstatSync(r.source); const target = fs.lstatSync(TARGET);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== 0 || (s.mode & 0o777) !== 0o555 || s.dev !== r.sourceDev || s.ino !== r.sourceIno
    || !target.isDirectory() || target.isSymbolicLink() || target.uid !== 0) hold('SOURCE_IDENTITY_CHANGED');
  if (requireMount) {
    const rows = mountRows().filter(p => p[4] === TARGET); const t = fs.statSync(TARGET);
    if (rows.length !== 1 || !rows[0][5].split(',').includes('ro') || t.dev !== s.dev || t.ino !== s.ino) hold('READONLY_MOUNT_UNVERIFIED');
  }
}
function assertOwnedPublic(r) {
  const file=path.join(TARGET,'manifest.json');const s=fs.lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o777)!==0o444||s.nlink!==1||s.size>65536)hold('PUBLIC_MANIFEST_UNTRUSTED');
  const m=JSON.parse(fs.readFileSync(file,'utf8'));
  if(m.protocolVersion!==1||m.owner!==r.owner||m.targetSha!==r.sha||!['OPEN','FENCED'].includes(m.phase)||![1,2,3].includes(m.generation))hold('DIFFERENT_PUBLIC_OWNER');
}
function publish(r, manifest) {
  assertOwnedSource(r);assertOwnedPublic(r);
  const dir = fs.openSync(r.source,fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try {
    const t = `/proc/self/fd/${dir}/manifest-${randomBytes(8).toString('hex')}.tmp`;
    const fd = fs.openSync(t,fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,0o444);
    try { fs.fchmodSync(fd,0o444); fs.writeFileSync(fd,JSON.stringify(manifest)+'\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    assertOwnedSource(r); fs.renameSync(t,`/proc/self/fd/${dir}/manifest.json`); fs.fsyncSync(dir); assertOwnedSource(r);
  } finally { fs.closeSync(dir); }
}
function sameJob(r, c) {
  const b = approvedContext(c); if (r.owner !== b.owner || r.sha !== b.targetSha || r.uid !== c.uid || r.postgresId !== c.BACKGROUND_FIXTURE_POSTGRES_ID) hold('DIFFERENT_JOB_OWNER');
  const runner = findRunnerAncestor(); if (runner.pid !== r.runner.pid || runner.start !== r.runner.start) hold('RUNNER_IDENTITY_CHANGED');
}
export function validateApiListeners(rows,sockets) {
  const listeners=rows.filter(p=>p[3]==='0A'&&p[1]?.split(':')[1]==='0C1C');
  if(listeners.length!==1||!sockets.has(listeners[0][9])
    ||!['0100007F','00000000000000000000000001000000'].includes(listeners[0][1].split(':')[0]))hold('API_LISTENER_NOT_OWNED_LOOPBACK');
  return true;
}
function verifyApiProcess(r,c,pid,requireListener=false) {
  const proc=processStat(pid);const launcher=processStat(r.launcher.pid);
  if(proc.ppid!==r.launcher.pid||launcher.start!==r.launcher.start||launcher.uid!==r.uid||proc.uid!==r.uid
    ||proc.cwd!==path.join(c.GITHUB_WORKSPACE,'apps/api')||!/\/node$/.test(proc.exe))hold('OWNED_API_PROCESS_REQUIRED');
  if(requireListener){
    const sockets=new Set(fs.readdirSync(`/proc/${pid}/fd`).flatMap(name=>{try{const m=fs.readlinkSync(`/proc/${pid}/fd/${name}`).match(/^socket:\[(\d+)\]$/);return m?[m[1]]:[];}catch{return[];}}));
    const rows=['tcp','tcp6'].flatMap(name=>fs.readFileSync(`/proc/${pid}/net/${name}`,'utf8').trim().split('\n').slice(1).map(line=>line.trim().split(/\s+/)));
    validateApiListeners(rows,sockets);
  }
  return proc;
}
async function rootOperation(operation, input) {
  rootOnly(); const c = input.context; const binding = approvedContext(c);
  if (Number(process.env.SUDO_UID) !== c.uid) hold('CALLER_IDENTITY_CHANGED');
  if (operation === 'root-prepare') {
    if (fs.existsSync(STATE) || fs.existsSync(TARGET) || mountRows().some(p => p[4] === TARGET)) hold('EXISTING_CONTROL_PATH');
    const db = database(c,"SELECT json_build_object('database',current_database(),'role',current_user);");
    if (db.database !== 'phoenix_erp' || db.role !== 'phoenix_v3') hold('DATABASE_IDENTITY_UNVERIFIED');
    if(!Number.isSafeInteger(input.launcher?.pid)||input.launcher.pid<2||!/^\d+$/.test(input.launcher.start||''))hold('LAUNCHER_IDENTITY_REQUIRED');
    const launcher=processStat(input.launcher.pid);const runtime=fs.lstatSync('/run');
    if(launcher.start!==input.launcher.start||launcher.uid!==c.uid||launcher.cwd!==path.join(c.GITHUB_WORKSPACE,'apps/api')||!/\/node$/.test(launcher.exe)
      ||!runtime.isDirectory()||runtime.isSymbolicLink()||runtime.uid!==0||(runtime.mode&0o022)!==0||fs.realpathSync('/run')!=='/run')hold('LAUNCHER_IDENTITY_REQUIRED');
    const source = path.join(c.RUNNER_TEMP,`phoenix-background-ci-${randomBytes(16).toString('hex')}`);
    fs.mkdirSync(STATE,{mode:0o700});
    let r = { schema:'phoenix.ci-host-background-fixture/v1',identityClass:'CI_HOST_FIXTURE_NOT_OCI',owner:binding.owner,sha:binding.targetSha,uid:c.uid,source,postgresId:c.BACKGROUND_FIXTURE_POSTGRES_ID,runner:findRunnerAncestor(),phase:'PREPARING',launcher:input.launcher };
    writePrivate(r);r={...r,networkAudit:bindNetworkAudit(input,c,launcher)};writePrivate(r);
    fs.mkdirSync(source,{mode:0o555});fs.chmodSync(source,0o555); const stat = fs.lstatSync(source); r = { ...r,sourceDev:stat.dev,sourceIno:stat.ino };
    writePrivate(r); fs.mkdirSync(TARGET,{mode:0o755});fs.chmodSync(TARGET,0o755);
    fs.writeFileSync(path.join(source,'manifest.json'),JSON.stringify({protocolVersion:1,phase:'FENCED',owner:r.owner,generation:1,targetSha:r.sha,participants:[]})+'\n',{mode:0o444,flag:'wx'});
    fs.chmodSync(path.join(source,'manifest.json'),0o444);
    exec('mount',['--bind',source,TARGET]); exec('mount',['-o','remount,bind,ro,nosuid,nodev,noexec',TARGET]); assertOwnedSource(r);
    r.phase='FENCED'; writePrivate(r); return {phase:r.phase,owner:r.owner,identityClass:r.identityClass};
  }
  if (operation === 'root-cleanup') { const absent=cleanupNotStarted();if(absent)return absent; }
  const r = privateRecord(); sameJob(r,c);
  if(operation==='root-register'){
    if(r.phase!=='FENCED'||r.api)hold('ONE_FIXTURE_PROCESS_ONLY');
    const api=verifyApiProcess(r,c,input.pid);writePrivate({...r,api});return{phase:'REGISTERED',owner:r.owner};
  }
  if (operation === 'root-open') {
    if (r.phase !== 'FENCED') hold('INITIAL_HOLD_REQUIRED'); assertOwnedSource(r);
    const proc=verifyApiProcess(r,c,input.pid,true);
    if(!r.api||r.api.pid!==proc.pid||r.api.start!==proc.start)hold('REGISTERED_PROCESS_REQUIRED');
    const networkAudit=verifyNetworkAudit(r);
    const initial = validateStatus(await status(),{owner:r.owner,generation:1,phase:'FENCED',sha:r.sha});
    if (initial.inFlight || initial.pendingChildren || initial.taskGraphs) hold('STARTUP_NOT_QUIESCENT'); verifySession(c,initial);
    const fixtureId = createHash('sha256').update(`ci-host:${r.owner}:${input.pid}:${proc.start}:${initial.bootId}`).digest('hex');
    const manifest = {protocolVersion:1,phase:'OPEN',owner:r.owner,generation:2,targetSha:r.sha,participants:[{bootId:initial.bootId,containerId:fixtureId,revision:r.sha,allowedKinds:KINDS}]};
    // The root receipt commits expected OPEN before public admission. A crash
    // leaves reconciliation evidence, never a secret or production identity.
    writePrivate({...r,phase:'OPEN',api:proc,bootId:initial.bootId,fixtureId}); publish(r,manifest);
    return {phase:'OPEN',initialPhase:'FENCED',initialGeneration:1,initialInFlight:0,identityClass:r.identityClass,owner:r.owner,bootId:initial.bootId,fixtureId,apiPid:proc.pid,apiProcessStart:proc.start,postgresServiceId:r.postgresId,controlSession:initial.controlSession,allowedKinds:KINDS,productionReceipt:false,chanjetKinds:[],networkAudit:{...networkAudit,captureWindow:'STARTUP_ONLY_NOT_FINAL'}};
  }
  if (operation === 'root-cleanup') {
    assertOwnedSource(r);
    publish(r,{protocolVersion:1,phase:'FENCED',owner:r.owner,generation:3,targetSha:r.sha,participants:[]});
    if (r.api) {
      const current=inspectCleanupProcess(r.api.pid);
      if (current && (current.start !== r.api.start || current.uid !== r.uid || current.exe !== r.api.exe || current.cwd !== r.api.cwd)) hold('API_PID_REUSED');
      if (current) {
        const deadline=Date.now()+15000;let drained=!r.bootId;
        while (!drained&&Date.now()<deadline) {
          try {const s=validateStatus(await status(),{owner:r.owner,generation:3,phase:'FENCED',sha:r.sha});if(s.bootId===r.bootId&&!s.inFlight&&!s.pendingChildren&&!s.taskGraphs){verifySession(c,s);drained=true;}}
          catch {/* Never treat a missing or poisoned participant as successful drain. */}
          if(!drained)await sleep(100);
        }
        process.kill(r.api.pid,'SIGTERM');
        if(!drained){writePrivate({...r,phase:'HOLD_CLEANUP_DRAIN_UNVERIFIED'});hold('CLEANUP_DRAIN_TIMEOUT');}
        await waitFixtureProcessExit(r.api);
      }
    }
    const networkAudit=verifyNetworkAudit(r);
    if(fs.readdirSync(STATE).sort().join(',')!=='network.jsonl,state.json')hold('UNKNOWN_ROOT_STATE_FILE');
    assertOwnedSource(r); exec('umount',[TARGET]);
    const file=path.join(r.source,'manifest.json');const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||s.nlink!==1)hold('SOURCE_FILE_CHANGED');
    fs.unlinkSync(file);fs.rmdirSync(r.source);fs.rmdirSync(TARGET);fs.unlinkSync(path.join(STATE,'network.jsonl'));fs.unlinkSync(path.join(STATE,'state.json'));fs.rmdirSync(STATE);
    return {phase:'CLOSED',owner:r.owner,identityClass:r.identityClass,productionReceipt:false,networkAudit:{...networkAudit,captureWindow:'FULL_OWNED_API_LIFETIME'}};
  }
  hold('OPERATION');
}
function rootCall(operation, context, other = {}) {
  const output = execFileSync('sudo',['-n',process.execPath,fs.realpathSync(new URL(import.meta.url)),operation],{ input:JSON.stringify({context,...other}),env:{...safeEnv()},encoding:'utf8',timeout:45000,maxBuffer:32768,stdio:['pipe','pipe','pipe'] });
  return JSON.parse(output);
}
function cleanupFailure(invoke,context,primary) {
  try {invoke('root-cleanup',context);}
  catch(error) {
    const result=new Error('CI_BACKGROUND_HOLD=CLEANUP_INCOMPLETE');
    const code=e=>/^CI_BACKGROUND_HOLD=([A-Z0-9_]+)$/.exec(e?.message||'')?.[1]||'UNVERIFIED';
    result.primaryHold=code(primary);result.cleanupHold=code(error);throw result;
  }
  throw primary;
}
export async function runFixture(operation, context, dependencies = {}) {
  const approve = dependencies.approve || approvedContext; const invoke = dependencies.rootCall || rootCall;
  approve(context); // No sudo, writes or API process until all readonly checks succeed.
  if(operation==='cleanup')return invoke('root-cleanup',context);
  if(operation!=='start')hold('OPERATION');
  const launcher = (dependencies.processStat || processStat)(process.pid);
  const audit=(dependencies.prepareNetworkAudit||prepareNetworkAudit)(context);
  try {invoke('root-prepare',context,{launcher,networkAudit:{path:audit.path,fd:audit.fd}});}catch(error){audit.close();cleanupFailure(invoke,context,error);}
  const start = dependencies.start || (()=>{
    const log=fs.openSync(path.join(context.RUNNER_TEMP,'api.log'),'a',0o600);
    try{return spawn(process.execPath,['--require',fs.realpathSync(new URL('./background-control-api-network-fixture.cjs',import.meta.url)),'dist/main.js'],{cwd:path.join(context.GITHUB_WORKSPACE,'apps/api'),env:{...process.env,NODE_OPTIONS:''},stdio:['ignore',log,log,audit.fd],detached:true});}finally{fs.closeSync(log);}
  });
  let child;try{child=start();}catch(error){cleanupFailure(invoke,context,error);}finally{audit.close();}child.on?.('error',()=>{}); child.unref?.();
  try {
    invoke('root-register',context,{pid:child.pid});
    const now=dependencies.now||Date.now;const deadline=now()+90000;let ready=false;
    while(now()<deadline){
      if(child.exitCode!==null)hold('API_STARTUP_FAILED');
      try{const s=await (dependencies.status||status)();if(s.phase==='FENCED'){ready=true;break;}}catch{/* bounded wait; never OPEN on timeout */}
      await (dependencies.sleep||sleep)(250);
    }
    if(!ready)hold('API_STARTUP_TIMEOUT');
    const result=invoke('root-open',context,{pid:child.pid});
    (dependencies.persist||((value)=>fs.writeFileSync(path.join(context.RUNNER_TEMP,'background-control-api-fixture.json'),JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'})))(result);
    return result;
  } catch(error) {cleanupFailure(invoke,context,error);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const operation=process.argv[2];let result;
    if(operation?.startsWith('root-')){const input=fs.readFileSync(0,'utf8');if(input.length>16384)hold('REQUEST_LIMIT');result=await rootOperation(operation,JSON.parse(input));}
    else {const context=Object.fromEntries(FIXTURE_KEYS.map(k=>[k,process.env[k]]));context.uid=process.getuid();result=await runFixture(operation,context);}
    console.log(JSON.stringify(result));
  }catch(error){
    console.error(/^CI_BACKGROUND_HOLD=[A-Z0-9_]+$/.test(error.message)?error.message:'CI_BACKGROUND_HOLD=FIXTURE_UNVERIFIED');
    if(/^[A-Z0-9_]+$/.test(error.primaryHold||'')&&/^[A-Z0-9_]+$/.test(error.cleanupHold||''))console.error(JSON.stringify({primaryHold:error.primaryHold,cleanupHold:error.cleanupHold}));
    process.exitCode=1;
  }
}
