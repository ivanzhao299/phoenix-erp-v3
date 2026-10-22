/** Owned isolated real ERP image evidence only. Never a production/FD9 receipt. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { capturedDatabaseStatements, classifySql, parseBootControlIdentity, verifyCapturedControlIdentity, sliceCapturedWindow } from './api-bootstrap-mutations.mjs';
import { exerciseActualErpRootBinding, performExpectedFaultTerm, performExpectedFaultKill, validateExpectedFaultShutdown } from './maintenance-erp-root-binding.fixture.mjs';
import { API_READINESS_PROGRAM } from '../ops/production-maintenance-candidate-health.mjs';
import { exerciseActualErpPhaseCorrelation } from './maintenance-erp-phase-correlation.fixture.mjs';
import { selectOwnedComposeSubnet } from './owned-compose-ipam.mjs';
import { CONTRACT, secureJson, verifyContext } from '../ops/production-config-guard.mjs';
import {verifyArchivedApiDependencyLock} from './maintenance-api-dependency-lock.fixture.mjs';
import {assertUnreplacedArchiveStore,readUnreplacedGit,verifyExtractedGitTree} from './maintenance-archived-source.fixture.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KIND = 'maintenance-erp-candidate';
const DB = 'api_bootstrap_fixture';
const ADMIN = 'erp_fixture_admin';
const WRITER = 'erp_candidate_writer';
const RO = 'erp_candidate_readonly';
const ROOT_NODE = process.execPath; // Constructor independently enforces Node major 20.
export const CONTROL_TARGET = '/run/phoenix-background-control';
const hash = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hold = code => { throw new Error(`ERP_CANDIDATE_FIXTURE_HOLD=${code}`); };
const safeEnv = () => ({ PATH: process.env.PATH, DOCKER_HOST: 'unix:///var/run/docker.sock' });
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', env: safeEnv(),
  timeout: 30000, maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
const git = args => readUnreplacedGit(REPO,args).trim();
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";

export function permittedDependencyFile(relative) {
  return !relative.split(path.sep).some(part => /^(?:node_modules|\.git|\.env(?:\..*)?|\.npmrc|\.yarnrc(?:\.yml)?|\.ssh|test|tests|__tests__|examples|coverage)$/i.test(part))
    && !/(?:\.(?:pem|key|p12|pfx)|id_rsa|id_ed25519)$/i.test(relative);
}
export function requireOwnedResource(resource, owner, kind = KIND) {
  if (!/^[a-f0-9]{64}$/.test(resource?.Id || '') || resource?.Config?.Labels?.['phoenix.test.owner'] !== owner
    || resource?.Config?.Labels?.['phoenix.test.kind'] !== kind) hold('UNOWNED_RESOURCE');
  return resource;
}
export function verifyLiveControlRow(status, rows, databaseOid) {
  const p = status?.controlSession;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(status?.bootId || '')
    || status.poisoned !== false || status.stopping !== false || p?.connected !== true || p.broken !== false
    || p.applicationName !== `phoenix-fence:${status.bootId}` || !Array.isArray(rows) || rows.length !== 1
    || rows[0].pid !== p.sessionPid || Number(rows[0].datid) !== p.databaseOid || Number(databaseOid) !== p.databaseOid
    || typeof p.backendStartedAtUs !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(p.backendStartedAtUs)
    || rows[0].backend_started_at_us !== p.backendStartedAtUs || p.backendStartedAtUs.slice(0,23)+'Z' !== p.backendStartedAt
    || new Date(rows[0].backend_start).toISOString() !== p.backendStartedAt) hold('CONTROL_SESSION_BINDING');
  return { unique: true, bootId: status.bootId, ...p };
}
function resolvePackage(name, from) {
  let cursor = from;
  while (true) {
    const candidate = path.join(cursor, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
    const parent = path.dirname(cursor); if (parent === cursor) return null; cursor = parent;
  }
}
export function copyProductionDependencies(apiRoot, destination) {
  const manifest = JSON.parse(fs.readFileSync(path.join(apiRoot, 'package.json'), 'utf8'));
  const records = new Map();
  const copy = source => {
    if (records.has(source)) return records.get(source);
    const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    const id = `${metadata.name.replaceAll('/', '_').replaceAll('@', '')}-${hash(source).slice(0, 12)}`;
    const target = path.join(destination, '.capsule', id);
    const result = { name: metadata.name, version: metadata.version, directory: target, dependencies: {} }; records.set(source, result);
    fs.cpSync(source, target, { recursive: true, dereference: true, filter: candidate => {
      const relative = path.relative(source, candidate);
      if (!permittedDependencyFile(relative)) return false;
      if (fs.lstatSync(candidate).isSymbolicLink()) {
        const actual = fs.realpathSync(candidate);
        if (actual !== source && !actual.startsWith(source + path.sep)) hold('DEPENDENCY_SYMLINK_ESCAPE');
        if (!permittedDependencyFile(path.relative(source, actual))) return false;
      }
      return true;
    } });
    for (const name of Object.keys({ ...metadata.dependencies, ...metadata.optionalDependencies, ...metadata.peerDependencies })) {
      const dependency = resolvePackage(name, source); if (!dependency) {
        if (metadata.dependencies?.[name] && !metadata.optionalDependencies?.[name]) hold('RUNTIME_DEPENDENCY_MISSING');
        continue;
      }
      const child = copy(dependency); const link = path.join(target, 'node_modules', name);
      fs.mkdirSync(path.dirname(link), { recursive: true }); fs.symlinkSync(path.relative(path.dirname(link), child.directory), link);
      result.dependencies[name] = child.version;
    }
    return result;
  };
  fs.mkdirSync(destination, { recursive: true });
  for (const name of Object.keys(manifest.dependencies)) {
    const source = resolvePackage(name, apiRoot); if (!source) hold('DIRECT_RUNTIME_DEPENDENCY_MISSING');
    const child = copy(source); const link = path.join(destination, name);
    fs.mkdirSync(path.dirname(link), { recursive: true }); fs.symlinkSync(path.relative(path.dirname(link), child.directory), link);
  }
  return [...records.values()].map(({ name, version, dependencies }) => ({ name, version, dependencies }));
}

export function ownedNetworkPreload(owner) {
  // Only transport observation/denial and a loopback provider. No clock, SQL, Nest or HTTP handler replacement.
  return `'use strict';
const fs=require('fs'),net=require('net'),http=require('http');
if(process.env.ERP_CANDIDATE_FIXTURE!==${JSON.stringify(owner)}||process.env.DB_HOST!=='fixture-db'||process.env.DB_NAME!=='${DB}')throw Error('OWNED_ERP_CAPSULE_REQUIRED');
const events='/tmp/erp-candidate-network.jsonl';
const record=kind=>fs.appendFileSync(events,JSON.stringify({kind,at:new Date().toISOString()})+'\\n',{mode:0o600});
let providerCalls=0;
const provider=http.createServer((q,s)=>{s.setHeader('Content-Type','application/json');if(q.url==='/_fixture/status'){s.end(JSON.stringify({providerCalls}));return;}providerCalls++;record('LOOPBACK_PROVIDER_ATTEMPT');s.writeHead(503);s.end('{"fixtureOnly":true}');});
provider.listen(3099,'127.0.0.1',()=>provider.unref());
const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const p=Array.isArray(args[0])?args[0][0]:args[0];const host=typeof p==='object'?p.host:typeof args[1]==='string'?args[1]:undefined;const port=typeof p==='object'?p.port:p;
if(host&&!['127.0.0.1','localhost','::1'].includes(host)&&!(host==='fixture-db'&&Number(port)===5432)){record('FORBIDDEN_TCP_ATTEMPT');throw Error('ERP_FIXTURE_EXTERNAL_TCP_FORBIDDEN');}return connect.apply(this,args);};
const fetch=global.fetch;global.fetch=async(...args)=>{const u=new URL(String(args[0]));if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)){record('NON_LOOPBACK_FETCH_ATTEMPT');throw Error('ERP_FIXTURE_EXTERNAL_FETCH_FORBIDDEN');}return fetch(...args);};
const pg=require('pg');const pgConnect=pg.Client.prototype.connect;pg.Client.prototype.connect=function(...args){this.connectionParameters.application_name=process.env.ERP_CAPTURE_APP;return pgConnect.apply(this,args);};
`;
}

export class OwnedErpCandidateCapsule {
  #legacyCandidates=new WeakMap();
  constructor({ artifactDirectory, owner } = {}) {
    assert.equal(Number(process.versions.node.split('.')[0]), 20, 'Use the project Node20 baseline');
    if (owner !== undefined && (typeof owner !== 'string' || !/^[0-9]{1,20}-[0-9]{1,10}$/.test(owner))) hold('NUMERIC_PHASE_OWNER_REQUIRED');
    this.owner = owner ?? `erp-candidate-${randomUUID()}`;
    const base = path.resolve(artifactDirectory || path.join(REPO, 'artifacts/maintenance-erp-candidate'));
    if (!base.startsWith(path.join(REPO, 'artifacts') + path.sep) || fs.existsSync(path.join(base, this.owner))) hold('OWNED_ARTIFACT_DIRECTORY');
    fs.mkdirSync(base, { recursive: true, mode: 0o700 });
    this.root = path.join(base, this.owner); fs.mkdirSync(this.root, { mode: 0o700 });
    this.resources = []; this.results = [];this.legacyObservations=[]; this.record();
  }
  record(extra = {}) { fs.writeFileSync(path.join(this.root, 'resources.json'), JSON.stringify({ schema: 'phoenix.owned-erp-candidate/v1',
    fixtureOnly: true, productionReceipt: false, owner: this.owner, sourceSha: this.sourceSha, imageId: this.imageId,
    sourceTreeHash: this.sourceTreeHash, fixtureScriptSha256: this.fixtureScriptSha256,
    resources: this.resources, results: this.results,legacyObservations:this.legacyObservations, cleanupExecuted: false, ...extra }, null, 2), { mode: 0o600 }); }
  docker(args, options = {}) { return run('/usr/bin/docker', args, options); }
  inspectContainer(id) {
    const f = this.docker(['inspect', id, '--format', '{{json .Id}}\t{{json .Image}}\t{{json .Config.Labels}}\t{{json .State}}\t{{json .RestartCount}}\t{{json .Mounts}}\t{{json .NetworkSettings.Ports}}']).split('\t').map(JSON.parse);
    return requireOwnedResource({ Id: f[0], Image: f[1], Config: { Labels: f[2] }, State: f[3], RestartCount: f[4], Mounts: f[5], Ports: f[6] }, this.owner);
  }
  own(id, role, type = 'container') {
    assert.match(id, type === 'image' ? /^sha256:[a-f0-9]{64}$/ : /^[a-f0-9]{64}$/);
    if (type === 'container') this.inspectContainer(id);
    else {
      const labels = JSON.parse(this.docker([type, 'inspect', id, '--format', type === 'image' ? '{{json .Config.Labels}}' : '{{json .Labels}}']));
      assert.equal(labels['phoenix.test.owner'], this.owner); assert.equal(labels['phoenix.test.kind'], KIND);
    }
    if (!this.resources.some(r => r.id === id)) this.resources.push({ id, role, type }); this.record(); return id;
  }
  labels() { return ['--label', `phoenix.test.owner=${this.owner}`, '--label', `phoenix.test.kind=${KIND}`]; }
  async build({sourceRevision}={}) {
    assertUnreplacedArchiveStore(REPO);
    const instrumentationSha=git(['rev-parse','HEAD']);
    this.sourceSha = sourceRevision??instrumentationSha; assert.match(this.sourceSha, /^[a-f0-9]{40}$/);
    if(this.sourceSha!==instrumentationSha){
      // The only historical executable in this release exercise is the actual
      // approved legacy baseline. Never relabel current code as the old API.
      assert.equal(this.sourceSha,'226878864f184d26f41a890e666ebed52547db14');
      git(['merge-base','--is-ancestor',this.sourceSha,instrumentationSha]);
      this.archivedDependencyLock=verifyArchivedApiDependencyLock({
        previousLock:git(['show',`${this.sourceSha}:pnpm-lock.yaml`]),currentLock:git(['show',`${instrumentationSha}:pnpm-lock.yaml`]),
        previousManifest:git(['show',`${this.sourceSha}:apps/api/package.json`]),currentManifest:git(['show',`${instrumentationSha}:apps/api/package.json`])});
    }
    git(['diff','--quiet','HEAD','--','apps/api/src','apps/api/tsconfig.json','apps/api/tsconfig.build.json','apps/api/package.json','pnpm-lock.yaml']);
    for(const file of ['pnpm-lock.yaml','apps/api/package.json'])
      assert.ok(fs.readFileSync(path.join(REPO,file)).equals(readUnreplacedGit(REPO,['show',`${instrumentationSha}:${file}`],{binary:true})),'BUILD_PHYSICAL_MANIFEST_OR_LOCK_DRIFT');
    const context = path.join(this.root, 'image-context'); fs.mkdirSync(context, { mode: 0o700 });
    const source = path.join(context, 'tracked-source'); fs.mkdirSync(source, { mode: 0o700 });
    const selected = ['apps/api/src', 'apps/api/tsconfig.json', 'apps/api/tsconfig.build.json', 'apps/api/package.json'];
    const tree = git(['ls-tree', '-r', this.sourceSha, '--', ...selected]);
    if (tree.split('\n').some(line => /^120000\s/.test(line) || /\t.*(?:\/\.env(?:\.|$)|\.(?:pem|key|p12|pfx)$)/i.test(line))) hold('ARCHIVE_SOURCE_NOT_APPROVED');
    this.sourceTreeHash = hash(tree);
    this.fixtureScriptSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
    const archive = readUnreplacedGit(REPO,['archive','--format=tar',this.sourceSha,...selected],{binary:true});
    run('tar', ['-x', '-C', source], { input: archive });
    const archiveIdentity=verifyExtractedGitTree(REPO,this.sourceSha,selected,source);
    const api = path.join(source, 'apps/api'); fs.symlinkSync(fs.realpathSync(path.join(REPO, 'apps/api/node_modules')), path.join(api, 'node_modules'));
    const compiler = path.join(REPO, 'apps/api/node_modules/typescript/bin/tsc');
    run(ROOT_NODE, [compiler, '-p', path.join(api, 'tsconfig.build.json'), '--outDir', path.join(context, 'dist'), '--rootDir', path.join(api, 'src'), '--incremental', 'false'], { timeout: 120000 });
    fs.unlinkSync(path.join(api, 'node_modules'));
    assert.deepEqual(verifyExtractedGitTree(REPO,this.sourceSha,selected,source),archiveIdentity);
    const dependencies = copyProductionDependencies(path.join(REPO, 'apps/api'), path.join(context, 'node_modules'));
    // Use the exact archived source and its tracked mode. A private root-owned
    // checkout can legitimately materialize package.json0600 under umask077;
    // copying that physical mode would make the UID1000 runtime unreadable.
    fs.copyFileSync(path.join(api, 'package.json'), path.join(context, 'package.json'));
    fs.writeFileSync(path.join(context, 'fixture-preload.cjs'), ownedNetworkPreload(this.owner));
    fs.writeFileSync(path.join(context, '.dockerignore'), '*\n!dist\n!dist/**\n!node_modules\n!node_modules/**\n!package.json\n!fixture-preload.cjs\n');
    fs.writeFileSync(path.join(this.root, 'capsule-build.json'), JSON.stringify({ sourceSha: this.sourceSha, sourceTreeHash: this.sourceTreeHash,
      fixtureScriptSha256: this.fixtureScriptSha256,instrumentationSha,archiveIdentity,archivedDependencyLock:this.archivedDependencyLock??null, pnpmLockSha256: hash(fs.readFileSync(path.join(REPO, 'pnpm-lock.yaml'))),
      dependencies, excluded: ['.env', 'keys', 'private directories', 'tests', 'full repository mount'], nodeBaseline: 20 }, null, 2));
    const base = this.docker(['image', 'inspect', 'node:20-bookworm-slim', '--format', '{{.Id}}']);
    const tag = `phoenix-${this.owner}:candidate`;
    this.docker(['build', '--pull=false', '--network=none', '--build-arg', `SOURCE_SHA=${this.sourceSha}`, '--build-arg', `FIXTURE_OWNER=${this.owner}`,
      '-f', path.join(REPO, 'scripts/ci/maintenance-erp-candidate.Dockerfile'), '-t', tag, context], { timeout: 180000 });
    this.imageId = this.own(this.docker(['image', 'inspect', tag, '--format', '{{.Id}}']), 'actual-erp-api', 'image');
    const fields = this.docker(['image', 'inspect', this.imageId, '--format', '{{json .Config.Labels}}\t{{json .RootFS.Layers}}']).split('\t').map(JSON.parse);
    assert.equal(fields[0]['org.opencontainers.image.revision'], this.sourceSha);
    const baseLayers = JSON.parse(this.docker(['image', 'inspect', base, '--format', '{{json .RootFS.Layers}}']));
    assert.deepEqual(fields[1].slice(0, baseLayers.length), baseLayers); this.record({ sourceTreeHash: this.sourceTreeHash, nodeBaseImageId: base });
    assert.equal(git(['rev-parse','HEAD']),instrumentationSha,'BUILD_INSTRUMENTATION_HEAD_CHANGED');
    return this;
  }
  helper(source, script, input = '') {
    if (!path.resolve(source).startsWith(this.root + path.sep)) hold('UNOWNED_ROOT_HELPER_PATH');
    const id = this.own(this.docker(['create', '--pull=never', '-i', ...this.labels(), '--network=none', '--mount', `type=bind,source=${source},target=/control`,
      'node:20-bookworm-slim', 'node', '-e', script]), 'root-public-helper');
    const output = this.docker(['start', '-a', '-i', id], { input });
    assert.equal(this.inspectContainer(id).State.ExitCode, 0); return output;
  }
  publishRootManifest(candidate, manifest) {
    if (manifest.owner !== this.owner || manifest.targetSha !== this.sourceSha || !Number.isSafeInteger(manifest.generation)) hold('MANIFEST_OWNER_TARGET');
    this.helper(candidate.publicSource, `const fs=require('fs');let raw='';process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{const m=JSON.parse(raw);const p='/control/manifest.tmp';const fd=fs.openSync(p,'wx',0o444);fs.writeFileSync(fd,JSON.stringify(m)+'\\n');fs.fchmodSync(fd,0o444);fs.fsyncSync(fd);fs.closeSync(fd);fs.renameSync(p,'/control/manifest.json');const d=fs.openSync('/control','r');fs.fsyncSync(d);fs.closeSync(d);});`, JSON.stringify(manifest));
  }
  sql(pg, statement, { role = ADMIN, app = 'erp-fixture-control' } = {}) {
    this.inspectContainer(pg.id);
    return this.docker(['exec', '-i', '-e', `PGAPPNAME=${app}`, pg.id, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', role, '-d', DB], { input: statement });
  }
  logs(id) {
    this.inspectContainer(id);
    const result = spawnSync('/usr/bin/docker', ['logs', id], { encoding: 'utf8', env: safeEnv(), timeout: 10000, maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) hold('OWNED_LOG_CAPTURE_FAILED');
    // PostgreSQL's LOG stream is stderr. Never silently discard it as stdout-only exec would.
    return result.stdout + '\n' + result.stderr;
  }
  async startPostgres(major, { nativeDataSource } = {}) {
    if (![16, 18].includes(major)) hold('PG_MAJOR');
    // Only the separately preflighted, exclusive hosted-VM fixture may use
    // this fixed bind. The normal portable capsule keeps its owned tmpfs.
    if (nativeDataSource !== undefined) {
      assert.equal(process.getuid(), 0); assert.equal(nativeDataSource, '/data/maintenance-native-pg');
      const entry = fs.lstatSync(nativeDataSource);
      assert.ok(entry.isDirectory() && !entry.isSymbolicLink()); assert.equal(fs.realpathSync(nativeDataSource), nativeDataSource);
      assert.equal(entry.uid, 0); assert.deepEqual(fs.readdirSync(nativeDataSource), []);
      verifyContext(CONTRACT.repository, CONTRACT.stateDirectory);
      const marker = secureJson('/var/lib/phoenix-erp/production-deployment-state/native-candidate-host-fixture.json');
      assert.equal(marker.schema, 'phoenix.exclusive-native-host-fixture/v1'); assert.equal(marker.fixtureOnly, true); assert.equal(marker.productionReceipt, false);
      assert.equal(marker.parentShellPid, process.ppid); assert.equal(marker.sourceSha, this.sourceSha); assert.equal(marker.major, major);
      const mounted = JSON.parse(run('/usr/bin/findmnt', ['-J', '--mountpoint', '/data'])).filesystems;
      assert.equal(mounted.length, 1); assert.equal(mounted[0].target, '/data'); assert.equal(mounted[0].fstype, 'ext4');
      assert.match(mounted[0].source, /^\/dev\/loop[0-9]+$/);
      const loop = JSON.parse(run('/usr/sbin/losetup', ['-J', '--list', mounted[0].source, '--output', 'NAME,BACK-FILE'])).loopdevices;
      assert.equal(loop.length, 1); assert.equal(loop[0].name, mounted[0].source);
      assert.equal(loop[0]['back-file'], path.join(marker.resourceDirectory, 'data.ext4'));
    }
    const networkIds = this.docker(['network', 'ls', '-q', '--no-trunc']).split('\n').filter(Boolean);
    assert.ok(networkIds.length < 512);
    const occupied = networkIds.length ? this.docker(['network', 'inspect', ...networkIds, '--format', '{{json .IPAM.Config}}']).split('\n')
      .flatMap(line => (JSON.parse(line) || []).map(item => item.Subnet).filter(value => typeof value === 'string' && !value.includes(':'))) : [];
    const routes = JSON.parse(run('/usr/sbin/ip', ['-j', '-4', 'route', 'show'], { timeout: 3000, maxBuffer: 65536 }));
    for (const route of routes) if (route.dst && route.dst !== 'default') occupied.push(route.dst.includes('/') ? route.dst : route.dst + '/32');
    const isolatedSubnet = selectOwnedComposeSubnet(occupied, parseInt(hash(this.owner + major).slice(0, 4), 16) % 512);
    const networkName = `phoenix-${this.owner}-pg${major}`;
    const networkAttempt = nativeDataSource === undefined ? null : { type: 'network', name: networkName, state: 'CREATE_OUTCOME_UNVERIFIED' };
    if (networkAttempt) { this.nativeHostCreationAttempts = [networkAttempt]; this.record({ nativeHostCreationAttempts: this.nativeHostCreationAttempts }); }
    const networkId = this.own(this.docker(['network', 'create', '--internal', '--subnet', isolatedSubnet, ...this.labels(), networkName]), `pg${major}-internal-network`, 'network');
    if (networkAttempt) { networkAttempt.id = networkId; networkAttempt.state = 'OWNED_ID_VERIFIED'; }
    assert.equal(this.docker(['network', 'inspect', networkId, '--format', '{{.Internal}}']), 'true');
    assert.deepEqual(JSON.parse(this.docker(['network', 'inspect', networkId, '--format', '{{json .IPAM.Config}}'])).map(row => row.Subnet), [isolatedSubnet]);
    assert.equal(this.docker(['network', 'inspect', networkId, '--format', '{{.EnableIPv6}}']), 'false');
    const mount = major === 16 ? '/var/lib/postgresql/data' : '/var/lib/postgresql';
    const databaseAttempt = nativeDataSource === undefined ? null : { type: 'container', name: `phoenix-native-${this.owner}-pg${major}`, state: 'CREATE_OUTCOME_UNVERIFIED' };
    if (databaseAttempt) { this.nativeHostCreationAttempts.push(databaseAttempt); this.record({ nativeHostCreationAttempts: this.nativeHostCreationAttempts }); }
    const id = this.own(this.docker(['run', '--pull=never', ...(databaseAttempt ? ['--name', databaseAttempt.name] : []), '-d', ...this.labels(), '--network', networkId, '--network-alias', 'fixture-db', '--restart=no',
      '--publish', '127.0.0.1::5432', '--mount', nativeDataSource === undefined
        ? `type=tmpfs,destination=${mount},tmpfs-size=268435456` : `type=bind,source=${nativeDataSource},destination=${mount}`,
      '-e', `POSTGRES_USER=${ADMIN}`, '-e', `POSTGRES_DB=${DB}`, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
      '--health-cmd', `pg_isready -U ${ADMIN} -d ${DB}`, '--health-interval', '1s', '--health-timeout', '2s', '--health-retries', '30',
      `postgres:${major}-alpine`, '-c', 'log_statement=all', '-c', 'log_min_error_statement=error', '-c', 'log_line_prefix=bootstrap-db=%d user=%u app=%a pid=%p ']), `pg${major}`);
    if (databaseAttempt) { databaseAttempt.id = id; databaseAttempt.state = 'OWNED_ID_VERIFIED'; }
    const pg = { id, major, networkId, isolatedSubnet }; const deadline = Date.now() + 30000;
    while (true) {
      try {
        this.sql(pg, 'SELECT 1;');
        if (this.inspectContainer(id).State.Health.Status === 'healthy' && this.docker(['exec', id, 'cat', '/proc/1/comm']) === 'postgres') break;
      } catch { /* The init server is not the final postmaster. */ }
      if (Date.now() > deadline) hold('PG_START_TIMEOUT'); await sleep(200);
    }
    const actualMajor = Math.floor(Number(this.sql(pg, 'SHOW server_version_num;')) / 10000); assert.equal(actualMajor, major);
    const schema = fs.readFileSync(path.join(REPO, 'scripts/ci/api-bootstrap-schema-fixture.sql'), 'utf8');
    this.sql(pg, `${schema}\nCREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE mon_device_realtime_snapshot(property_code text);CREATE TABLE mon_device_property_history(property_code text);CREATE TABLE mon_device_alert_event(property_code text);
      CREATE TABLE sys_menu(menu_code text);CREATE TABLE sys_chanjet_state(key varchar(16) PRIMARY KEY,app_ticket text,certificate text,tokens jsonb,updated_at timestamptz);
      CREATE TABLE erp_fixture_canary(id bigserial PRIMARY KEY,value text);INSERT INTO erp_fixture_canary(value) VALUES('synthetic-only');
      CREATE ROLE ${WRITER} LOGIN;GRANT CONNECT ON DATABASE ${DB} TO ${WRITER};GRANT USAGE,CREATE ON SCHEMA public TO ${WRITER};GRANT ALL ON ALL TABLES IN SCHEMA public TO ${WRITER};GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${WRITER};
      CREATE ROLE ${RO} LOGIN;ALTER ROLE ${RO} SET default_transaction_read_only=on;GRANT CONNECT ON DATABASE ${DB} TO ${RO};GRANT USAGE ON SCHEMA public TO ${RO};GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${RO};GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${RO};`);
    pg.writerCapability = this.verifyWriterCapability(pg); return pg;
  }
  verifyWriterCapability(pg) {
    const readonly = this.sql(pg, "BEGIN;INSERT INTO erp_fixture_canary(id,value) VALUES(-1,'owned-rollback-capability-canary');ROLLBACK;SHOW transaction_read_only;", { role: WRITER, app: 'erp-writer-capability' });
    assert.equal(readonly, 'off');
    return { transactionReadOnly: false, realInsertSucceededThenRolledBack: true, sequenceTouched: false };
  }
  request(candidate, pathname, { method = 'GET', body } = {}) {
    const script = `fetch(process.argv[1],{method:process.argv[2],${body === undefined ? '' : "headers:{'content-type':'application/json'},body:process.argv[3],"}signal:AbortSignal.timeout(3000)}).then(async r=>{const t=await r.text();let b;try{b=JSON.parse(t)}catch{b=null}process.stdout.write(JSON.stringify({status:r.status,body:b}),()=>process.exit(0))}).catch(()=>process.exit(2))`;
    return JSON.parse(this.docker(['exec', candidate.id, 'node', '-e', script, `http://127.0.0.1:3100${pathname}`, method, ...(body === undefined ? [] : [JSON.stringify(body)])]));
  }
  status(candidate) { const response = this.request(candidate, '/api/internal/background/status'); assert.equal(response.status, 200); return response.body; }
  verifySession(candidate, status = this.status(candidate)) {
    const name = `phoenix-fence:${status.bootId}`;
    const payload = JSON.parse(this.sql(candidate.pg, `SELECT json_build_object('oid',(SELECT oid FROM pg_database WHERE datname=current_database()),'rows',(SELECT coalesce(json_agg(x),'[]'::json) FROM (SELECT pid,datid,backend_start,to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS backend_started_at_us FROM pg_stat_activity WHERE application_name=${literal(name)}) x));`));
    return verifyLiveControlRow(status, payload.rows, payload.oid);
  }
  /** Actual historical source with a modern FENCED projection deliberately
   * mounted. Only observes its unsupported protocol; never calls it DRAINED. */
  async startLegacySource(pg) {
    assert.equal(this.sourceSha,'226878864f184d26f41a890e666ebed52547db14');assert.ok(this.archivedDependencyLock);
    const originalPg=this.inspectContainer(pg.id);assert.equal(originalPg.State.Running,true);assert.equal(originalPg.RestartCount,0);
    assert.ok(this.resources.some(r=>r.id===pg.networkId&&r.type==='network'));
    const pgPin=Object.freeze({id:originalPg.Id,imageId:originalPg.Image,startedAt:originalPg.State.StartedAt,restartCount:originalPg.RestartCount,networkId:pg.networkId,major:pg.major});
    const publicSource=path.join(this.root,`pg${pg.major}-LEGACY-public`);fs.mkdirSync(publicSource,{mode:0o755});
    this.helper(publicSource,"const fs=require('fs');fs.chownSync('/control',0,0);fs.chmodSync('/control',0o555);");
    const legacy={pg,mode:'LEGACY_SOURCE_UNFENCED',publicSource,captureApp:`legacy-${pg.major}-${this.owner}`};
    this.publishRootManifest(legacy,{protocolVersion:1,phase:'FENCED',owner:this.owner,generation:1,targetSha:this.sourceSha,participants:[]});
    const values={NODE_ENV:'production',APP_ENV:'production',PORT:'3100',DB_HOST:'fixture-db',DB_PORT:'5432',DB_USER:WRITER,DB_NAME:DB,
      DB_PASSWORD:'',JWT_SECRET:'owned-erp-candidate-fixture-only-at-least-32-characters',CHANJET_SYNC_POLICY:'HOLD',CHANJET_READONLY_SYNC_ENABLED:'false',
      CHANJET_ERP_INBOUND_SYNC_ENABLED:'false',CHANJET_APP_KEY:'owned-fixture-app-key',CHANJET_APP_SECRET:'owned-fixture-app-secret',
      CHANJET_PROVIDER_BASE_URL:'http://127.0.0.1:3099',ERP_CANDIDATE_FIXTURE:this.owner,ERP_CAPTURE_APP:legacy.captureApp};
    legacy.id=this.own(this.docker(['run','--pull=never','-d',...this.labels(),'--network',pg.networkId,'--restart=no','--read-only','--cap-drop=ALL',
      '--security-opt=no-new-privileges','--publish','127.0.0.1::3100','--tmpfs','/tmp:rw,nosuid,nodev,size=16777216,mode=1777',
      '--tmpfs','/app/uploads:rw,nosuid,nodev,size=16777216,uid=1000,gid=1000','--mount',`type=bind,source=${publicSource},target=${CONTROL_TARGET},readonly`,
      ...Object.entries(values).flatMap(([key,value])=>['-e',`${key}=${value}`]),this.imageId]),`pg${pg.major}-actual-legacy-source`);
    const deadline=Date.now()+45000;
    for(;;){
      const live=this.inspectContainer(legacy.id);assert.equal(live.Image,this.imageId);assert.equal(live.RestartCount,0);
      if(!live.State.Running)hold('ACTUAL_LEGACY_SOURCE_EXITED');
      try{const ready=this.request(legacy,'/api/readiness');if(ready.status===200&&ready.body?.status==='READY'&&ready.body?.db==='connected'&&live.State.Health?.Status==='healthy'){legacy.readiness=ready;break;}}catch{}
      if(Date.now()>=deadline)hold('ACTUAL_LEGACY_SOURCE_START_TIMEOUT');await sleep(100);
    }
    const live=this.inspectContainer(legacy.id);assert.equal(live.Config.Labels['org.opencontainers.image.revision'],this.sourceSha);
    const mount=live.Mounts.find(row=>row.Destination===CONTROL_TARGET);assert.equal(mount?.Source,publicSource);assert.equal(mount?.RW,false);
    const unsupported=this.request(legacy,'/api/internal/background/status');assert.equal(unsupported.status,404);
    legacy.originalPin={id:legacy.id,imageId:live.Image,startedAt:live.State.StartedAt,restartCount:live.RestartCount};
    this.#legacyCandidates.set(legacy,{pin:Object.freeze({...legacy.originalPin}),pgPin,pgReference:pg,owner:this.owner,sourceSha:this.sourceSha,
      captureApp:legacy.captureApp,originalRole:`pg${pg.major}-actual-legacy-source`,stopAttempted:false});
    const observation={stage:'ACTUAL_LEGACY_STARTUP',capturedAt:new Date().toISOString(),sourceSha:this.sourceSha,pgMajor:pg.major,runtime:legacy.originalPin,readiness:'PASS',mountedModernProjection:'FENCED',modernStatusHttp:404,
      modernDrain:'UNSUPPORTED',continuousDrainProof:false,productionRuntimeEquivalent:false};
    this.legacyObservations.push(observation);this.record({actualLegacyStartup:observation});
    return legacy;
  }
  async stopLegacySource(legacy) {
    const saved=this.#legacyCandidates.get(legacy);assert.ok(saved,'UNREGISTERED_LEGACY_SOURCE');
    assert.equal(saved.stopAttempted,false,'LEGACY_STOP_ALREADY_ATTEMPTED');
    // The returned observation is mutable. It never grants lifecycle authority:
    // validate it before any mutation and execute only against private pins.
    assert.equal(this.owner,saved.owner);assert.equal(this.sourceSha,saved.sourceSha);
    assert.equal(this.sourceSha,'226878864f184d26f41a890e666ebed52547db14');assert.equal(this.imageId,saved.pin.imageId);
    assert.equal(legacy.id,saved.pin.id);assert.deepEqual(legacy.originalPin,saved.pin);
    assert.equal(legacy.pg,saved.pgReference);assert.equal(legacy.captureApp,saved.captureApp);
    for(const key of ['id','major','networkId'])assert.equal(legacy.pg[key],saved.pgPin[key]);
    assert.equal(this.resources.filter(r=>r.id===saved.pin.id&&r.type==='container'&&r.role===saved.originalRole).length,1);
    assert.equal(this.resources.filter(r=>r.id===saved.pgPin.id&&r.type==='container'&&r.role===`pg${saved.pgPin.major}`).length,1);
    assert.equal(this.resources.filter(r=>r.id===saved.pgPin.networkId&&r.type==='network'&&r.role===`pg${saved.pgPin.major}-internal-network`).length,1);
    const before=this.inspectContainer(saved.pin.id);assert.equal(before.Id,saved.pin.id);assert.equal(before.State.Running,true);
    assert.equal(before.Image,saved.pin.imageId);assert.equal(before.State.StartedAt,saved.pin.startedAt);assert.equal(before.RestartCount,saved.pin.restartCount);
    assert.equal(before.Config.Labels['org.opencontainers.image.revision'],saved.sourceSha);
    const database=this.inspectContainer(saved.pgPin.id);assert.equal(database.Id,saved.pgPin.id);assert.equal(database.Image,saved.pgPin.imageId);
    assert.equal(database.State.StartedAt,saved.pgPin.startedAt);assert.equal(database.RestartCount,saved.pgPin.restartCount);assert.equal(database.State.Running,true);
    const network=JSON.parse(this.docker(['network','inspect',saved.pgPin.networkId,'--format','{{json .}}']));
    assert.equal(network.Id,saved.pgPin.networkId);assert.equal(network.Internal,true);
    assert.equal(network.Labels['phoenix.test.owner'],saved.owner);assert.equal(network.Labels['phoenix.test.kind'],KIND);
    // Persist the attempt before issuing the only stop. A timeout or unknown
    // result cannot authorize a second mutation, even if the caller retries.
    saved.stopAttempted=true;this.record({legacyStopAttempt:{id:saved.pin.id,state:'ATTEMPT_STARTED'}});
    this.docker(['stop','--signal','SIGTERM','--time','30',saved.pin.id],{timeout:35000});
    const after=this.inspectContainer(saved.pin.id);assert.equal(after.State.Running,false);assert.equal(after.State.Pid,0);assert.equal(after.State.OOMKilled,false);assert.equal(after.Image,before.Image);
    assert.equal(after.State.StartedAt,before.State.StartedAt);assert.equal(after.RestartCount,0);
    // Actual backend disappearance is observed independently in the owned DB;
    // this does not reconcile committed business work or prepared transactions.
    let remaining;const deadline=Date.now()+5000;
    do{remaining=Number(this.sql(saved.pgPin,`SELECT count(*) FROM pg_stat_activity WHERE application_name=${literal(saved.captureApp)};`));if(remaining===0)break;await sleep(25);}while(Date.now()<deadline);
    assert.equal(remaining,0);
    const value={stage:'ACTUAL_LEGACY_STOP',capturedAt:new Date().toISOString(),sourceSha:saved.sourceSha,pgMajor:saved.pgPin.major,runtime:saved.pin,exitCode:after.State.ExitCode,backendCountAfterStop:remaining,modernDrain:'UNSUPPORTED',
      fiveDomainReconciliation:'NOT_RUN',revivalProtection:'NOT_PROVED',continuousIngressProof:false,fixtureOnly:true,productionAuthority:false};
    this.legacyObservations.push(value);this.record({actualLegacyStop:value});return value;
  }
  async startCandidate(pg, mode, { role = 'default' } = {}) {
    if (!['missing', 'FENCED'].includes(mode)) hold('STARTUP_MUST_DENY');
    assert.ok(role === 'default' || (role === 'root-binding-fault' && mode === 'FENCED'));
    const suffix = role === 'default' ? '' : '-' + role;
    const publicSource = path.join(this.root, `pg${pg.major}-${mode}${suffix}-public`); fs.mkdirSync(publicSource, { mode: 0o755 });
    this.helper(publicSource, "const fs=require('fs');fs.chownSync('/control',0,0);fs.chmodSync('/control',0o555);");
    const candidate = { pg, mode, role, publicSource, captureApp: `erp-${pg.major}-${mode}${suffix}-${randomUUID().slice(0, 8)}` };
    if (mode === 'FENCED') this.publishRootManifest(candidate, { protocolVersion: 1, phase: 'FENCED', owner: this.owner, generation: 1, targetSha: this.sourceSha, participants: [] });
    candidate.begin = `SELECT ${literal(`${candidate.captureApp}-BEGIN`)}`; this.sql(pg, candidate.begin + ';');
    const env = { NODE_ENV: 'production', APP_ENV: 'production', PORT: '3100', DB_HOST: 'fixture-db', DB_PORT: '5432', DB_USER: WRITER, DB_NAME: DB,
      DB_PASSWORD: '', JWT_SECRET: 'owned-erp-candidate-fixture-only-at-least-32-characters', CHANJET_SYNC_POLICY: 'HOLD',
      CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false', CHANJET_APP_KEY: 'owned-fixture-app-key',
      CHANJET_APP_SECRET: 'owned-fixture-app-secret', CHANJET_PROVIDER_BASE_URL: 'http://127.0.0.1:3099', ERP_CANDIDATE_FIXTURE: this.owner, ERP_CAPTURE_APP: candidate.captureApp };
    candidate.id = this.own(this.docker(['run', '--pull=never', '-d', ...this.labels(), '--network', pg.networkId, '--restart=no', '--read-only', '--cap-drop=ALL',
      '--security-opt=no-new-privileges', '--publish', '127.0.0.1::3100', '--tmpfs', '/tmp:rw,nosuid,nodev,size=16777216,mode=1777',
      '--tmpfs', '/app/uploads:rw,nosuid,nodev,size=16777216,uid=1000,gid=1000', '--mount', `type=bind,source=${publicSource},target=${CONTROL_TARGET},readonly`,
      ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]), this.imageId]), `pg${pg.major}-${mode}${suffix}-actual-erp`);
    const deadline = Date.now() + 45000;
    while (true) {
      try {
        const readiness = this.request(candidate, '/api/readiness');
        if (readiness.status === 200) { assert.equal(readiness.body.status, 'READY'); assert.equal(readiness.body.db, 'connected'); candidate.readiness = readiness; break; }
      } catch { /* Startup is bounded, never replaced. */ }
      if (Date.now() > deadline || this.inspectContainer(candidate.id).State.Running !== true) { fs.writeFileSync(path.join(this.root, `pg${pg.major}-${mode}-failed-start.log`), this.logs(candidate.id)); hold('ACTUAL_ERP_START_FAILED'); }
      await sleep(200);
    }
    const runtime = this.inspectContainer(candidate.id);
    const mount = runtime.Mounts.find(item => item.Destination === CONTROL_TARGET);
    assert.equal(mount.Type, 'bind'); assert.equal(mount.RW, false); assert.equal(mount.Source, publicSource);
    assert.equal(runtime.Image, this.imageId); assert.equal(runtime.Config.Labels['org.opencontainers.image.revision'], this.sourceSha);
    assert.equal(runtime.RestartCount, 0);
    const protections = this.docker(['inspect', candidate.id, '--format', '{{json .HostConfig.ReadonlyRootfs}}\t{{json .HostConfig.CapDrop}}\t{{json .HostConfig.SecurityOpt}}\t{{json .Config.User}}']).split('\t').map(JSON.parse);
    assert.equal(protections[0], true); assert.ok(protections[1].some(cap => cap.toUpperCase() === 'ALL'));
    assert.ok(protections[2].some(option => option.startsWith('no-new-privileges'))); assert.equal(protections[3], '1000:1000');
    const versions = JSON.parse(this.docker(['exec', candidate.id, 'node', '-e', "console.log(JSON.stringify({major:Number(process.versions.node.split('.')[0])}))"])); assert.equal(versions.major, 20);
    candidate.boot = parseBootControlIdentity(this.logs(candidate.id)); candidate.initialStatus = this.status(candidate);
    assert.equal(candidate.initialStatus.bootId, candidate.boot.bootId); assert.equal(candidate.initialStatus.phase, mode === 'missing' ? 'HOLD' : 'FENCED');
    assert.equal(candidate.initialStatus.owner, mode === 'missing' ? null : this.owner);
    assert.equal(candidate.initialStatus.generation, mode === 'missing' ? null : 1);
    assert.equal(candidate.initialStatus.inFlight, 0); assert.equal(candidate.initialStatus.taskGraphs, 0); this.verifySession(candidate);
    const denied = this.request(candidate, '/api/auth/login', { method: 'POST', body: {} }); assert.equal(denied.status, 503);
    if (this.owner.match(/^[0-9]+-[0-9]+$/)) {
      const healthyDeadline = Date.now() + 10000;
      while (this.inspectContainer(candidate.id).State.Health?.Status !== 'healthy') {
        if (Date.now() >= healthyDeadline) hold('ACTUAL_ERP_HEALTHCHECK_REQUIRED'); await sleep(100);
      }
    }
    candidate.ready = `SELECT ${literal(`${candidate.captureApp}-READY`)}`; this.sql(pg, candidate.ready + ';'); candidate.readyAt = Date.now();
    return candidate;
  }
  fingerprint(pg) {
    const tables = this.sql(pg, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;").split('\n').filter(Boolean);
    const data = this.sql(pg, tables.map(table => `SELECT ${literal(table)},count(*)::text,md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM public.${quote(table)} t`).join(' UNION ALL ') + ';');
    const sequences = this.sql(pg, "SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;").split('\n').filter(Boolean);
    const sequenceState = sequences.length ? this.sql(pg, sequences.map(sequence => `SELECT ${literal(sequence)},last_value,is_called FROM public.${quote(sequence)}`).join(' UNION ALL ') + ';') : '';
    const schema = this.docker(['exec', pg.id, 'pg_dump', '-U', ADMIN, '-d', DB, '--schema-only', '--no-owner', '--no-privileges']).replace(/^\\(?:un)?restrict .*$/gm, '');
    return { schema: hash(schema), data: hash(data), sequences: hash(sequenceState), tableCount: tables.length, sequenceCount: sequences.length };
  }
  network(candidate) {
    const script = "const fs=require('fs');console.log(JSON.stringify(fs.existsSync('/tmp/erp-candidate-network.jsonl')?fs.readFileSync('/tmp/erp-candidate-network.jsonl','utf8').trim().split('\\n').filter(Boolean).map(JSON.parse):[]))";
    return JSON.parse(this.docker(['exec', candidate.id, 'node', '-e', script]));
  }
  async verifyDefaultWindow(pg, candidates, before) {
    if (!before || typeof before.schema !== 'string' || typeof before.data !== 'string' || typeof before.sequences !== 'string') hold('PRE_STARTUP_FINGERPRINT_REQUIRED');
    const latestReady = Math.max(...candidates.map(c => c.readyAt));
    const nextMinute = Math.floor(latestReady / 60000 + 1) * 60000;
    while (Date.now() < nextMinute + 1800) await sleep(Math.min(500, nextMinute + 1800 - Date.now()));
    for (const candidate of candidates) {
      const second = this.status(candidate); assert.equal(second.phase, candidate.initialStatus.phase); assert.equal(second.inFlight, 0); assert.equal(second.taskGraphs, 0);
      this.verifySession(candidate, second); assert.deepEqual(this.network(candidate), []);
      candidate.end = `SELECT ${literal(`${candidate.captureApp}-DEFAULT_END`)}`; this.sql(pg, candidate.end + ';');
      const all = sliceCapturedWindow(this.logs(pg.id), candidate.begin, candidate.end, 'erp-fixture-control');
      const records = all.filter(r => [candidate.captureApp, second.controlSession.applicationName].includes(r.app));
      const classifications = records.map(record => ({ kind: classifySql(record.sql, record.controlParameters), sqlSha256: hash(record.sql) }));
      const bad = classifications.filter(r => !['READ', 'SESSION', 'CONTROL_SESSION'].includes(r.kind));
      fs.writeFileSync(path.join(this.root, `pg${pg.major}-${candidate.mode}-startup-sql.json`), JSON.stringify({ records, classifications, bad }, null, 2));
      fs.writeFileSync(path.join(this.root, `pg${pg.major}-${candidate.mode}-runtime.log`), this.logs(candidate.id));
      assert.deepEqual(bad, [], 'Actual writer startup must not even attempt mutations');
      const binding = verifyCapturedControlIdentity(records, candidate.captureApp, candidate.boot, [candidate.initialStatus, second]);
      const afterReady = sliceCapturedWindow(this.logs(pg.id), candidate.ready, candidate.end, 'erp-fixture-control')
        .filter(r => r.app === second.controlSession.applicationName && /pg_try_advisory_lock_shared/.test(r.sql) && r.controlParameters?.[1] === '1');
      assert.ok(afterReady.length > 0, 'Real Cron-minute admission attempts must be observed after readiness, not only a quiet instant');
      const result = { fixtureOnly: true, productionReceipt: false, sourceSha: this.sourceSha, imageId: this.imageId,
        pgMajor: pg.major, pgContainerId: pg.id, mode: candidate.mode, container: this.inspectContainer(candidate.id),
        apiReadiness: candidate.readiness, nodeMajor: 20,
        runtimeWriterCapability: pg.writerCapability,
        bootId: second.bootId, status: second, controlSessionBinding: binding, observedFrom: new Date(candidate.readyAt).toISOString(),
        observedUntil: new Date().toISOString(), crossedRealCronMinute: new Date(nextMinute).toISOString(), observedCronAdmissions: afterReady.length,
        startupMutationAttempts: 0, providerAttempts: 0, controlMount: { source: candidate.publicSource, target: CONTROL_TARGET, readonly: true, ownerUid: 0 },
        productionTrustedPaths: 'NOT_RUN', productionFD9: 'NOT_RUN' };
      this.results.push(result); this.record();
    }
    const after = this.fingerprint(pg);
    assert.deepEqual(after, before, 'Default-denied startup/real Cron window must preserve actual schema/data/sequences');
    for (const result of this.results.filter(result => result.pgMajor === pg.major && result.mode)) {
      result.fingerprintBefore = before; result.fingerprintAfter = after;
    }
    this.record();
    return before;
  }
  verifyActualReadiness(candidate) {
    const observedFrom = new Date().toISOString();
    const before = this.inspectContainer(candidate.id), statusBefore = this.status(candidate), fingerprintBefore = this.fingerprint(candidate.pg);
    assert.equal(before.Config.Labels['org.opencontainers.image.revision'], this.sourceSha);
    assert.equal(statusBefore.phase, 'FENCED'); this.verifySession(candidate, statusBefore);
    const proof = JSON.parse(this.docker(['exec', candidate.id, '/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin', '/usr/local/bin/node', '-e', API_READINESS_PROGRAM]));
    assert.equal(proof.status, 200); assert.equal(proof.ready, true); assert.equal(proof.dbConnected, true);
    assert.match(proof.bodySha256, /^[a-f0-9]{64}$/); assert.ok(proof.bodyBytes > 0 && proof.bodyBytes <= 4096);
    const after = this.inspectContainer(candidate.id), statusAfter = this.status(candidate), fingerprintAfter = this.fingerprint(candidate.pg);
    for (const key of ['Id', 'Image', 'RestartCount']) assert.equal(after[key], before[key]);
    assert.equal(after.State.StartedAt, before.State.StartedAt); assert.equal(after.State.Running, true);
    assert.equal(statusAfter.bootId, statusBefore.bootId); assert.equal(statusAfter.phase, 'FENCED'); this.verifySession(candidate, statusAfter);
    assert.deepEqual(fingerprintAfter, fingerprintBefore);
    const runtimePin = v => ({ id: v.Id, imageId: v.Image, revision: v.Config.Labels['org.opencontainers.image.revision'],
      startedAt: v.State.StartedAt, restartCount: v.RestartCount, running: v.State.Running, health: v.State.Health.Status });
    const statusPin = v => ({ bootId: v.bootId, owner: v.owner, generation: v.generation, phase: v.phase, inFlight: v.inFlight,
      pendingChildren: v.pendingChildren, taskGraphs: v.taskGraphs, controlSession: Object.fromEntries(
        ['connected', 'broken', 'sessionPid', 'databaseOid', 'backendStartedAt', 'backendStartedAtUs', 'applicationName'].map(key => [key, v.controlSession[key]])) });
    const result = { schema: 'phoenix.actual-erp-readiness-fixture/v1', result: 'PASS', fixtureOnly: true, productionReceipt: false,
      sourceSha: this.sourceSha, imageId: this.imageId, pgMajor: candidate.pg.major, apiContainerId: candidate.id, bootId: statusAfter.bootId,
      owner: this.owner, interval: { start: observedFrom, end: new Date().toISOString() }, programSha256: hash(API_READINESS_PROGRAM),
      beforeRuntime: runtimePin(before), afterRuntime: runtimePin(after), beforeStatus: statusPin(statusBefore), afterStatus: statusPin(statusAfter),
      fingerprintBefore, fingerprintAfter, fixedProgramProof: proof, unchangedRuntime: true, schemaDataSequencesUnchanged: true, fullHealthCollectorPositive: 'NOT_RUN',
      webHttpActual: 'NOT_RUN', productionStorageAndFd9: 'NOT_RUN', registryInstalled: false };
    fs.writeFileSync(path.join(this.root, `pg${candidate.pg.major}-actual-readiness-probe.json`), JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
    this.results.push(result); this.record(); return result;
  }
  async controlledOpen(candidate) {
    assert.equal(candidate.mode, 'FENCED'); const before = this.inspectContainer(candidate.id); const status = this.status(candidate); this.verifySession(candidate, status);
    const begin = `SELECT ${literal(`${candidate.captureApp}-OPEN_BEGIN`)}`; this.sql(candidate.pg, begin + ';');
    const open = { protocolVersion: 1, phase: 'OPEN', owner: this.owner, generation: 2, targetSha: this.sourceSha,
      participants: [{ bootId: status.bootId, containerId: candidate.id, revision: this.sourceSha, allowedKinds: ['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION'] }] };
    this.publishRootManifest(candidate, open); assert.equal(this.status(candidate).phase, 'OPEN');
    const allowed = this.request(candidate, '/api/auth/login', { method: 'POST', body: {} });
    assert.equal(allowed.status, 200); assert.equal(allowed.body.code, 400); // Actual AuthController validation contract.
    this.publishRootManifest(candidate, { ...open, phase: 'FENCED', generation: 3 });
    const deadline = Date.now() + 10000;
    while (this.status(candidate).inFlight !== 0) { if (Date.now() > deadline) hold('FENCE_DRAIN_TIMEOUT'); await sleep(100); }
    const final = this.status(candidate); assert.equal(final.phase, 'FENCED'); assert.equal(final.poisoned, false); this.verifySession(candidate, final);
    assert.equal(this.request(candidate, '/api/auth/login', { method: 'POST', body: {} }).status, 503);
    assert.deepEqual(this.network(candidate), []);
    const after = this.inspectContainer(candidate.id); assert.equal(after.Id, before.Id); assert.equal(after.State.StartedAt, before.State.StartedAt); assert.equal(after.Image, before.Image);
    const end = `SELECT ${literal(`${candidate.captureApp}-OPEN_END`)}`; this.sql(candidate.pg, end + ';');
    const records = sliceCapturedWindow(this.logs(candidate.pg.id), begin, end, 'erp-fixture-control')
      .filter(record => [candidate.captureApp, final.controlSession.applicationName].includes(record.app));
    const classifications = records.map(record => ({ kind: classifySql(record.sql, record.controlParameters), sqlSha256: hash(record.sql) }));
    assert.equal(classifications.some(record => record.kind === 'SCHEMA_MUTATION'), false, 'OPEN is never runtime migration authorization');
    const openMutationAttempts = classifications.filter(record => ['BUSINESS_DATA_MUTATION', 'SEQUENCE_MUTATION'].includes(record.kind)).length;
    fs.writeFileSync(path.join(this.root, `pg${candidate.pg.major}-open-window-sql.json`), JSON.stringify({ records, classifications, openMutationAttempts }, null, 2));
    const result = { pgMajor: candidate.pg.major, fixtureOnly: true, actualErpAppModule: true, transition: 'FENCED_OPEN_FENCED',
      bootId: final.bootId, sameContainer: true, noRestart: true, deniedStatus: 503, admittedStatus: 200, admittedBusinessCode: 400,
      finalStatus: final, grantedKinds: open.participants[0].allowedKinds, chanjetKinds: [], providerAttempts: 0, openMutationAttempts, productionReceipt: false };
    this.results.push(result); this.record(); return result;
  }
  detectorCanary(pg) {
    const before = this.fingerprint(pg); const app = `erp-detector-${pg.major}-${randomUUID().slice(0, 8)}`;
    const probes = ['CREATE TABLE erp_forbidden_canary(id integer)', "/* DETAIL: Parameters: */ CREATE TABLE erp_forbidden_comment(id integer)",
      "UPDATE erp_fixture_canary SET value='forbidden'", "SELECT nextval('erp_fixture_canary_id_seq')"];
    for (const sql of probes) {
      let refused = false; try { this.sql(pg, sql + ';', { role: RO, app }); } catch (error) { refused = /read-only|permission denied/i.test(String(error.stderr)); }
      assert.equal(refused, true, 'Read-only detector canary must be denied by real PostgreSQL');
    }
    const records = capturedDatabaseStatements(this.logs(pg.id), DB).filter(r => r.app === app);
    const kinds = records.map(r => classifySql(r.sql));
    assert.ok(['SCHEMA_MUTATION', 'BUSINESS_DATA_MUTATION', 'SEQUENCE_MUTATION'].every(kind => kinds.includes(kind)));
    const comment = records.filter(r => r.sql.includes('/* DETAIL: Parameters: */'));
    assert.ok(comment.some(r => r.sourceLevel === 'LOG')); assert.ok(comment.some(r => r.sourceLevel === 'STATEMENT'));
    assert.ok(comment.every(r => classifySql(r.sql) === 'SCHEMA_MUTATION'));
    const after = this.fingerprint(pg); assert.deepEqual(after, before);
    const result = { pgMajor: pg.major, rejectedAttempts: 4, detectedKinds: kinds, commentedDdlLogAndStatement: true, actualMutations: 0,
      fingerprintBefore: before, fingerprintAfter: after, records };
    fs.writeFileSync(path.join(this.root, `pg${pg.major}-detector-canary.json`), JSON.stringify(result, null, 2));
    return result;
  }
  stopCandidate(candidate) {
    this.inspectContainer(candidate.id); this.docker(['stop', '--time', '35', candidate.id], { timeout: 45000 });
    const stopped = this.inspectContainer(candidate.id); assert.equal(stopped.State.ExitCode, 0); assert.equal(stopped.State.OOMKilled, false);
    const evidence = { id: stopped.Id, exitCode: stopped.State.ExitCode, oomKilled: stopped.State.OOMKilled, finishedAt: stopped.State.FinishedAt, forceKilled: false };
    for (const result of this.results.filter(result => result.pgMajor === candidate.pg.major && result.mode === candidate.mode)) result.shutdownEvidence = evidence;
    this.record(); return evidence;
  }
  async teardownExpectedFault(candidate, binding) {
    assert.equal(candidate.role, 'root-binding-fault'); assert.equal(binding.originalChildrenClosed, true);
    assert.equal(binding.result, 'PROBES_VERIFIED_PENDING_FAULT_TEARDOWN');
    const count = text => text.split(/\r?\n/).filter(line => line === 'BACKGROUND_SHUTDOWN_HOLD').length;
    const markersBeforeTerm = count(this.logs(candidate.id)); assert.equal(markersBeforeTerm, 0);
    // First prove the signal was handled as HOLD. Do not hide the fault behind
    // docker stop's timeout or send a second SIGTERM after the once listener.
    const priorStatus = this.status(candidate), before = this.inspectContainer(candidate.id);
    performExpectedFaultTerm(before, binding, priorStatus, markersBeforeTerm, () => this.docker(['kill', '--signal', 'SIGTERM', candidate.id]));
    const deadline = Date.now() + 10000; let markersAfterTerm, status;
    do {
      const live = this.inspectContainer(candidate.id); assert.equal(live.State.Running, true);
      markersAfterTerm = count(this.logs(candidate.id)); status = this.status(candidate);
      if (markersAfterTerm === 1 && status.stopping === true) break;
      await sleep(100);
    } while (Date.now() < deadline);
    status = this.status(candidate);
    const deniedStatus = this.request(candidate, '/api/auth/login', { method: 'POST', body: {} }).status;
    const afterTerm = this.inspectContainer(candidate.id);
    // inspectContainer verifies immutable owner labels immediately before the
    // explicit owner-only fault teardown, always using the original full ID.
    const evidence = { signals: ['SIGTERM'], markersBeforeTerm, markersAfterTerm, status, expectedBootId: binding.finalApiStatus.bootId,
      expectedControl: binding.finalApiStatus.controlSession, deniedStatus, rootOriginalChildrenClosed: binding.originalChildrenClosed };
    performExpectedFaultKill(before, afterTerm, evidence, () => this.docker(['kill', '--signal', 'SIGKILL', candidate.id]));
    let stopped;
    for (let n = 0; n < 30; n++) { stopped = this.inspectContainer(candidate.id); if (!stopped.State.Running) break; await sleep(100); }
    return validateExpectedFaultShutdown(before, afterTerm, stopped, { ...evidence, signals: ['SIGTERM', 'SIGKILL'] });
  }
  async exercise() {
    for (const major of [16, 18]) {
      const pg = await this.startPostgres(major);
      const before = this.fingerprint(pg);
      const candidates = [await this.startCandidate(pg, 'missing'), await this.startCandidate(pg, 'FENCED')];
      await this.verifyDefaultWindow(pg, candidates, before); this.detectorCanary(pg); this.verifyActualReadiness(candidates[1]); await this.controlledOpen(candidates[1]);
      // Keep owned identities/receipts for root review. No deletion and no production state cleanup.
      for (const candidate of candidates) this.stopCandidate(candidate);
      const fault = await this.startCandidate(pg, 'FENCED', { role: 'root-binding-fault' });
      if (/^[0-9]+-[0-9]+$/.test(this.owner)) this.results.push(await exerciseActualErpPhaseCorrelation(this, fault));
      const binding = await exerciseActualErpRootBinding(this, fault);
      try { binding.faultShutdown = await this.teardownExpectedFault(fault, binding); binding.result = 'PASS'; }
      catch (teardownError) {
        // Redacted diagnostic only: retain the first failing assertion's
        // class/message plus the container's post-mortem exit state so an
        // isolated fixture HOLD names its actual origin.
        binding.result = 'FAIL';
        let postMortem = {};
        try {
          const [state] = this.docker(['inspect', fault.id, '--format', '{{json .State}}\t{{json .RestartCount}}']).split('\t').map(JSON.parse);
          postMortem.running = state.Running; postMortem.exitCode = state.ExitCode; postMortem.oomKilled = state.OOMKilled;
        } catch (stateError) { postMortem.stateError = String(stateError?.message || stateError).split('\n')[0].slice(0, 160); }
        try {
          // Raw logs without the owned-resource assertions: the container may
          // legitimately already be stopped when this diagnostic runs.
          const rawLogs = spawnSync('/usr/bin/docker', ['logs', fault.id], { encoding: 'utf8', env: safeEnv(), timeout: 10000, maxBuffer: 16 * 1024 * 1024 });
          const logLines = (String(rawLogs.stdout ?? '') + '\n' + String(rawLogs.stderr ?? '')).split(/\r?\n/);
          postMortem.markers = logLines.filter(line => line === 'BACKGROUND_SHUTDOWN_HOLD').length;
          postMortem.shutdownSignals = logLines.filter(line => line.startsWith('BACKGROUND_SHUTDOWN_')).slice(-6);
          postMortem.logTail = logLines.filter(Boolean).slice(-8);
          postMortem.logsStatus = rawLogs.status;
        } catch (logsError) { postMortem.logsError = String(logsError?.message || logsError).split('\n')[0].slice(0, 160); }
        binding.faultShutdown = { outcome: 'UNVERIFIED', productionReceipt: false,
          failure: { name: teardownError?.name || null, message: (teardownError?.message || null) && teardownError.message.split('\n')[0].slice(0, 240), operator: teardownError?.operator || null,
            actual: teardownError?.actual === undefined ? null : String(teardownError.actual).slice(0, 200),
            expected: teardownError?.expected === undefined ? null : String(teardownError.expected).slice(0, 200) }, postMortem };
        throw Error('ACTUAL_ERP_FAULT_SHUTDOWN_UNVERIFIED');
      }
      finally { fs.writeFileSync(path.join(this.root, `pg${major}-actual-erp-root-binding.json`), JSON.stringify(binding, null, 2), { mode: 0o600, flag: 'wx' }); }
      this.results.push(binding);
      this.record();
    }
    const result = { schema: 'phoenix.real-erp-candidate-fixture-evidence/v1', outcome: 'PASS', fixtureOnly: true, productionReceipt: false,
      owner: this.owner, sourceSha: this.sourceSha, imageId: this.imageId, results: this.results, productionFD9: 'NOT_RUN', productionMutation: false };
    fs.writeFileSync(path.join(this.root, 'summary.json'), JSON.stringify(result, null, 2)); return result;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = new OwnedErpCandidateCapsule({ owner: `${Date.now()}-${process.pid}` });
  try { await fixture.build(); const result = await fixture.exercise(); console.log(JSON.stringify({ outcome: result.outcome, evidenceDirectory: fixture.root, sourceSha: result.sourceSha })); }
  catch (error) { fixture.record({ outcome: 'FAIL', failureCode: String(error.message).slice(0, 160) }); console.error(`ERP_CANDIDATE_FIXTURE_FAILED evidence=${fixture.root}`); process.exitCode = 1; }
}
