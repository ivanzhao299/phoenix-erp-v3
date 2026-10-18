/** Source-built historical Nest ERP fixture. Never the production OCI image or a drain receipt. */
import fs from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OwnedErpCandidateCapsule, copyProductionDependencies, requireOwnedResource } from './maintenance-erp-candidate.fixture.mjs';
import { classifySql, sliceCapturedWindow } from './api-bootstrap-mutations.mjs';

export const LEGACY_SHA = '226878864f184d26f41a890e666ebed52547db14';
export const LEGACY_KIND = 'maintenance-legacy-erp';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DB = 'api_bootstrap_fixture', ADMIN = 'erp_fixture_admin', WRITER = 'erp_candidate_writer';
const sha = value => createHash('sha256').update(value).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeEnv = () => ({ PATH: process.env.PATH, DOCKER_HOST: 'unix:///var/run/docker.sock' });
const git = args => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: ROOT, env: safeEnv(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const literal = value => "'" + value.replaceAll("'", "''") + "'";

// Only this immutable, previously inspected iproute2 capsule is a diagnostic tool.
const ROUTE_RECEIPT = 'artifacts/maintenance-legacy-erp/legacy-host-route-diagnostic-ada0e880-0422-4ab7-879c-51a20e87ead8/host-route-diagnostic-recovered.json';
const ROUTE_RECEIPT_SHA = '1f5f426bdaa82f1540ed1ef8f4d8e1a920c59672810eb6f154472788f868ed92';
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export function normalizeRouteTable(value = 'main') {
  if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
  assert.ok((Number.isSafeInteger(value) && value >= 0) || ['main', 'local', 'default', 'unspec'].includes(value), 'Unknown route table: HOLD');
  return value;
}
export function cidrRange(value) {
  assert.equal(typeof value, 'string');
  const [address, rawPrefix, extra] = value.split('/'); assert.equal(extra, undefined);
  const family = isIP(address); assert.ok(family, 'Unknown address family: HOLD');
  const bits = family === 4 ? 32 : 128, prefix = rawPrefix === undefined ? bits : Number(rawPrefix);
  assert.ok((rawPrefix === undefined || /^\d+$/.test(rawPrefix)) && Number.isSafeInteger(prefix) && prefix >= 0 && prefix <= bits);
  let integer;
  if (family === 4) integer = address.split('.').reduce((out, octet) => (out << 8n) + BigInt(octet), 0n);
  else {
    assert.ok(!address.includes('.'), 'Mapped address requires explicit reviewed parser: HOLD');
    const halves = address.split('::'); assert.ok(halves.length <= 2);
    const left = halves[0] ? halves[0].split(':') : [], right = halves[1] ? halves[1].split(':') : [];
    const words = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    assert.equal(words.length, 8); integer = words.reduce((out, word) => (out << 16n) + BigInt('0x' + word), 0n);
  }
  const hostBits = BigInt(bits - prefix), start = (integer >> hostBits) << hostBits;
  return { family, prefix, start, end: start + (1n << hostBits) - 1n };
}
export function cidrsOverlap(a, b) { const x = cidrRange(a), y = cidrRange(b); return x.family === y.family && x.start <= y.end && y.start <= x.end; }
export function requirePrivateFixtureSubnet(value) {
  const range = cidrRange(value); assert.equal(range.family, 4); assert.equal(range.prefix, 24);
  assert.ok(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'].some(block => { const x = cidrRange(block); return range.start >= x.start && range.end <= x.end; }));
  return value;
}
export function validateNetworkSnapshot(snapshot, subnet, excludedNetworkId) {
  requirePrivateFixtureSubnet(subnet);
  for (const network of snapshot.networks) {
    assert.match(network.id, /^[a-f0-9]{64}$/);
    for (const prefix of network.prefixes) { cidrRange(prefix); if (network.id !== excludedNetworkId) assert.equal(cidrsOverlap(prefix, subnet), false, 'Docker IPAM overlap: HOLD'); }
  }
  for (const route of snapshot.routes) {
    normalizeRouteTable(route.table);
    if (route.destination === 'default') continue;
    cidrRange(route.destination);
    if (!route.expectedNewNetwork) assert.equal(cidrsOverlap(route.destination, subnet), false, 'Daemon host route overlap: HOLD');
  }
  const exact = new Set(snapshot.routes.map(route => { if (route.destination === 'default') return ''; const r = cidrRange(route.destination); return `${r.family}:${r.start}/${r.prefix}`; }));
  for (const network of snapshot.networks.filter(network => network.driver === 'bridge')) for (const prefix of network.prefixes) {
    const r = cidrRange(prefix); assert.ok(exact.has(`${r.family}:${r.start}/${r.prefix}`), 'Daemon host namespace not proven: HOLD');
  }
  return true;
}
export function classifyOwnedNetworkDelta(before, after, id, subnet) {
  const added = after.networks.filter(network => network.id === id); assert.equal(added.length, 1);
  const network = added[0]; assert.equal(network.driver, 'bridge'); assert.equal(network.internal, true);
  assert.equal(network.enableIPv6, false, 'IPv6 new routes have no reviewed allowlist: HOLD');
  assert.deepEqual(network.prefixes, [subnet]); assert.equal(network.ipam.length, 1);
  assert.equal(network.ipam[0].subnet, subnet);
  const range = cidrRange(requirePrivateFixtureSubnet(subnet)), gateway = cidrRange(network.ipam[0].gateway);
  assert.equal(gateway.family, 4); assert.equal(gateway.prefix, 32);
  assert.ok(gateway.start > range.start && gateway.end < range.end, 'Actual IPAM gateway must be inside the owned subnet');
  const counts = new Map(); for (const route of before.routes) counts.set(route.digest, (counts.get(route.digest) || 0) + 1);
  const routes = after.routes.map(route => ({ ...route, expectedNewNetwork: false })), delta = [];
  for (const route of routes) { const count = counts.get(route.digest) || 0; if (count) counts.set(route.digest, count - 1); else delta.push(route); }
  assert.ok([...counts.values()].every(count => count === 0), 'Existing daemon route removed or changed: HOLD');
  assert.equal(delta.length, 3, 'Only the exact three reviewed IPv4 bridge routes are allowed: HOLD');
  const tableIs = (value, name, number) => { const normalized = normalizeRouteTable(value); return normalized === name || normalized === number; };
  const exactPrefix = route => { const value = cidrRange(route.destination); return value.family === 4 && value.prefix === 24 && value.start === range.start; };
  const main = delta.filter(route => route.family === 4 && exactPrefix(route) && route.type === 'unicast' && tableIs(route.table, 'main', 254));
  assert.equal(main.length, 1, 'Exact owned /24 main unicast route required: HOLD');
  const device = main[0].deviceDigest; assert.match(device, /^[a-f0-9]{64}$/); assert.notEqual(device, sha(''), 'Device identity missing: HOLD');
  const expected = [{ start: range.start, prefix: 24, type: 'unicast', table: 'main', tableNumber: 254 },
    { start: gateway.start, prefix: 32, type: 'local', table: 'local', tableNumber: 255 },
    { start: range.end, prefix: 32, type: 'broadcast', table: 'local', tableNumber: 255 }];
  for (const rule of expected) {
    const matches = delta.filter(route => { const value = cidrRange(route.destination); return route.family === 4 && value.family === 4 && value.start === rule.start && value.prefix === rule.prefix
      && route.deviceDigest === device && route.type === rule.type && tableIs(route.table, rule.table, rule.tableNumber); });
    assert.equal(matches.length, 1, 'Unexpected route prefix, family, type, table, or device: HOLD'); matches[0].expectedNewNetwork = true;
  }
  assert.ok(delta.every(route => route.expectedNewNetwork), 'Unexpected new route: HOLD');
  return { ...after, routes };
}
export function verifyNetworkDelta(before, after, id, subnet) {
  const old = before.networks.map(network => canonical(network)).sort(), existing = after.networks.filter(network => network.id !== id).map(network => canonical(network)).sort();
  assert.deepEqual(existing, old, 'Foreign Docker IPAM drift: HOLD');
  const checked = classifyOwnedNetworkDelta(before, after, id, subnet);
  return validateNetworkSnapshot(checked, subnet, id);
}

export function sourceBuiltLegacyIdentity(revision, packageBlob, installedPackageBlob, lockBlob, installedLockBlob) {
  assert.equal(revision, LEGACY_SHA, 'Historical source is pinned, never current main');
  assert.equal(packageBlob, installedPackageBlob, 'No implicit dependency substitution');
  assert.equal(lockBlob, installedLockBlob, 'Historical lock must match installed reviewed baseline');
  return { revision, sourceBuilt: true, productionImageEquivalent: false };
}
export function validateStoppedLegacy(before, samples, remainingSessions) {
  assert.equal(before.State.Running, true);
  assert.equal(samples.length, 2);
  for (const sample of samples) {
    assert.equal(sample.Id, before.Id); assert.equal(sample.Image, before.Image);
    assert.equal(sample.State.Running, false); assert.equal(sample.State.OOMKilled, false);
    assert.equal(sample.State.StartedAt, before.State.StartedAt); assert.equal(sample.RestartCount, before.RestartCount);
    assert.ok(Number.isInteger(sample.State.ExitCode));
  }
  assert.equal(samples[0].State.ExitCode, samples[1].State.ExitCode);
  assert.ok(Number.isSafeInteger(remainingSessions) && remainingSessions >= 0);
  return { protocol: 'STOP_AND_RECONCILE', legacyDrainResult: 'UNSUPPORTED', stopped: true,
    forcedAfterTimeout: samples[0].State.ExitCode === 137, productionEligible: false,
    actualRemainingSessions: remainingSessions, noSessionProof: remainingSessions === 0 ? 'SAMPLE_ZERO' : 'FAILED_NONZERO',
    businessReconciliation: 'HOLD', productionReceipt: false, fixtureOnly: true };
}
export function planSyntheticSeedCleanup(tables, truncateGuardTables) {
  const guard = new Set(truncateGuardTables);
  for (const table of tables) if (guard.has(table.name)) assert.equal(Number(table.rows), 0, 'Protected historical audit/config object is not empty: no fixture reset permitted');
  return { truncateTables: tables.filter(table => !guard.has(table.name)).map(table => table.name),
    unchangedProtectedEmptyTables: [...guard] };
}
export function identifyBlockedLegacyAuthStartup(events, log) {
  const warnings = (log.match(/启动自愈 triggerAppTicket 失败: LEGACY_FIXTURE_EXTERNAL_FETCH_FORBIDDEN/g) || []).length;
  const known = events.length === 1 && warnings === 1 && events[0].kind === 'FORBIDDEN_FETCH_ATTEMPT'
    && events[0].caller === 'CHANJET_AUTH_TRIGGER_APP_TICKET';
  return { providerAttempts: events.length, knownBlockedAuthStartupAttempts: known ? 1 : 0,
    unidentifiedBlockedRequests: events.length === 0 || known ? 0 : events.length,
    chanjetAuthRequests: 'HOLD', productionEligible: false };
}

export function legacyTransportPreload(owner) {
  return `'use strict';
const fs=require('fs'),net=require('net');
if(process.env.LEGACY_ERP_FIXTURE!==${JSON.stringify(owner)}||process.env.DB_HOST!=='fixture-db'||process.env.DB_NAME!=='${DB}')throw Error('OWNED_LEGACY_FIXTURE_REQUIRED');
const record=kind=>{const stack=new Error().stack||'';const frames=stack.match(/\\/app\\/dist\\/[a-zA-Z0-9_./-]+\\.js:\\d+:\\d+/g)||[];const caller=stack.split('\\n').some(line=>line.includes('.triggerAppTicket (')&&line.includes('/modules/chanjet/chanjet-auth.service.js:'))?'CHANJET_AUTH_TRIGGER_APP_TICKET':'UNCLASSIFIED';fs.appendFileSync('/tmp/erp-candidate-network.jsonl',JSON.stringify({kind,at:new Date().toISOString(),caller,sourceFrames:frames.slice(0,8)})+'\\n',{mode:0o600})};
const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...a){const p=Array.isArray(a[0])?a[0][0]:a[0];const h=typeof p==='object'?p.host:typeof a[1]==='string'?a[1]:undefined;const n=typeof p==='object'?p.port:p;if(h&&!['127.0.0.1','localhost','::1'].includes(h)&&!(h==='fixture-db'&&Number(n)===5432)){record('FORBIDDEN_TCP_ATTEMPT');throw Error('LEGACY_FIXTURE_EXTERNAL_TCP_FORBIDDEN')}return connect.apply(this,a)};
const fetch=global.fetch;global.fetch=async(...a)=>{const u=new URL(String(a[0]));if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)){record('FORBIDDEN_FETCH_ATTEMPT');throw Error('LEGACY_FIXTURE_EXTERNAL_FETCH_FORBIDDEN')}record('LOOPBACK_PROVIDER_ATTEMPT');throw Error('LEGACY_EMPTY_DATA_PROVIDER_NOT_EXPECTED')};
const pg=require('pg'),connectPg=pg.Client.prototype.connect;pg.Client.prototype.connect=function(...a){this.connectionParameters.application_name=process.env.ERP_CAPTURE_APP;return connectPg.apply(this,a)};
`;
}

export class OwnedLegacyErpCapsule extends OwnedErpCandidateCapsule {
  constructor({ pgMajors = [16, 18], subnet = null } = {}) { super({ artifactDirectory: path.join(ROOT, 'artifacts/maintenance-legacy-erp') }); assert.ok(pgMajors.length > 0 && new Set(pgMajors).size === pgMajors.length && pgMajors.every(major => [16, 18].includes(major))); this.pgMajors = pgMajors; this.explicitSubnet = subnet === null ? null : requirePrivateFixtureSubnet(subnet); if (subnet !== null) assert.deepEqual(pgMajors, [18], 'Explicit subnet currently reviewed for PG18-only'); this.sourceSha = LEGACY_SHA; this.sourceIdentity = { sourceBuilt: true, productionImageEquivalent: false }; }
  labels() { return ['--label', `phoenix.test.owner=${this.owner}`, '--label', `phoenix.test.kind=${LEGACY_KIND}`]; }
  inspectContainer(id) {
    const values = this.docker(['inspect', id, '--format', '{{json .Id}}\t{{json .Image}}\t{{json .Config.Labels}}\t{{json .State}}\t{{json .RestartCount}}\t{{json .Mounts}}\t{{json .NetworkSettings.Ports}}']).split('\t').map(JSON.parse);
    return requireOwnedResource({ Id: values[0], Image: values[1], Config: { Labels: values[2] }, State: values[3], RestartCount: values[4], Mounts: values[5], Ports: values[6] }, this.owner, LEGACY_KIND);
  }
  own(id, role, type = 'container') {
    assert.match(id, type === 'image' ? /^sha256:[a-f0-9]{64}$/ : /^[a-f0-9]{64}$/);
    if (type === 'container') this.inspectContainer(id);
    else { const labels = JSON.parse(this.docker([type, 'inspect', id, '--format', type === 'image' ? '{{json .Config.Labels}}' : '{{json .Labels}}'])); assert.equal(labels['phoenix.test.owner'], this.owner); assert.equal(labels['phoenix.test.kind'], LEGACY_KIND); }
    if (!this.resources.some(resource => resource.id === id)) this.resources.push({ id, role, type }); this.record(); return id;
  }
  async build() {
    this.sourceIdentity = sourceBuiltLegacyIdentity(this.sourceSha, git(['rev-parse', `${LEGACY_SHA}:apps/api/package.json`]), git(['rev-parse', 'HEAD:apps/api/package.json']), git(['rev-parse', `${LEGACY_SHA}:pnpm-lock.yaml`]), git(['rev-parse', 'HEAD:pnpm-lock.yaml']));
    const selected = ['apps/api/src', 'apps/api/tsconfig.json', 'apps/api/tsconfig.build.json', 'apps/api/package.json', 'apps/api/ddl', 'apps/api/migrations'];
    const context = path.join(this.root, 'image-context'), source = path.join(context, 'tracked-source'); fs.mkdirSync(source, { recursive: true, mode: 0o700 });
    const tree = git(['ls-tree', '-r', LEGACY_SHA, '--', ...selected]);
    assert.equal(tree.split('\n').some(line => /^120000\s/.test(line) || /\t.*(?:\/\.env(?:\.|$)|\.(?:pem|key|p12|pfx)$)/i.test(line)), false);
    this.sourceTreeHash = sha(tree); this.fixtureScriptSha256 = sha(fs.readFileSync(fileURLToPath(import.meta.url)));
    const archive = execFileSync('git', ['archive', LEGACY_SHA, ...selected], { cwd: ROOT, env: safeEnv(), maxBuffer: 64 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', source], { input: archive, env: safeEnv() });
    const api = path.join(source, 'apps/api'); this.archivedApi = api;
    fs.symlinkSync(fs.realpathSync(path.join(ROOT, 'apps/api/node_modules')), path.join(api, 'node_modules'));
    execFileSync(process.execPath, [path.join(ROOT, 'apps/api/node_modules/typescript/bin/tsc'), '-p', path.join(api, 'tsconfig.build.json'), '--outDir', path.join(context, 'dist'), '--rootDir', path.join(api, 'src'), '--incremental', 'false'], { env: safeEnv(), timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    fs.unlinkSync(path.join(api, 'node_modules'));
    const dependencies = copyProductionDependencies(path.join(ROOT, 'apps/api'), path.join(context, 'node_modules'));
    fs.copyFileSync(path.join(api, 'package.json'), path.join(context, 'package.json')); fs.writeFileSync(path.join(context, 'fixture-preload.cjs'), legacyTransportPreload(this.owner));
    execFileSync(process.execPath, ['--check', path.join(context, 'fixture-preload.cjs')], { env: safeEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    fs.writeFileSync(path.join(context, '.dockerignore'), '*\n!dist\n!dist/**\n!node_modules\n!node_modules/**\n!package.json\n!fixture-preload.cjs\n');
    const dockerfile = path.join(this.root, 'Dockerfile');
    fs.writeFileSync(dockerfile, `FROM node:20-bookworm-slim\nLABEL org.opencontainers.image.revision="${LEGACY_SHA}" phoenix.test.owner="${this.owner}" phoenix.test.kind="${LEGACY_KIND}"\nWORKDIR /app\nCOPY dist ./dist\nCOPY node_modules ./node_modules\nCOPY package.json fixture-preload.cjs ./\nRUN mkdir uploads && chown 1000:1000 uploads\nUSER 1000:1000\nCMD ["node","--require","/app/fixture-preload.cjs","dist/main.js"]\n`, { mode: 0o600 });
    const tag = `phoenix-${this.owner}:legacy-source`;
    this.docker(['build', '--pull=false', '--network=none', '-f', dockerfile, '-t', tag, context], { timeout: 180000 });
    this.imageId = this.own(this.docker(['image', 'inspect', tag, '--format', '{{.Id}}']), 'source-built-legacy', 'image');
    fs.writeFileSync(path.join(this.root, 'capsule-build.json'), JSON.stringify({ ...this.sourceIdentity, sourceTreeHash: this.sourceTreeHash, fixtureScriptSha256: this.fixtureScriptSha256, dependencies, imageId: this.imageId }, null, 2), { mode: 0o600 });
    return this;
  }
  captureDaemonNetwork(stage, subnet, newNetworkId = null) {
    const receiptBytes = fs.readFileSync(path.join(ROOT, ROUTE_RECEIPT)); assert.equal(sha(receiptBytes), ROUTE_RECEIPT_SHA);
    const receipt = JSON.parse(receiptBytes); assert.equal(receipt.daemonNamespaceVerified, true);
    const image = receipt.containers[0].imageId; assert.match(image, /^sha256:[a-f0-9]{64}$/);
    const imageMeta = JSON.parse(this.docker(['image', 'inspect', image, '--format', '{{json .}}']));
    assert.equal(imageMeta.Config.Labels['phoenix.test.owner'], receipt.owner);
    assert.equal(imageMeta.Config.Labels['phoenix.test.kind'], 'maintenance-legacy-host-route-diagnostic');
    assert.deepEqual(imageMeta.Config.Entrypoint, ['/diag/ld-linux-x86-64.so.2', '--library-path', '/diag', '/diag/ip']);
    const rows = [], helpers = [];
    for (const family of [4, 6]) {
      const query = ['-j', `-${family}`, 'route', 'show', 'table', 'all'];
      const id = this.own(this.docker(['create', '--pull=never', ...this.labels(), '--network=host', '--restart=no', '--read-only', '--user=1000:1000', '--cap-drop=ALL', '--security-opt=no-new-privileges', image, ...query]), `${stage}-route-ipv${family}`);
      this.docker(['start', '-a', id]);
      const meta = JSON.parse(this.docker(['inspect', id, '--format', '{{json .}}']));
      assert.equal(meta.State.ExitCode, 0); assert.equal(meta.HostConfig.NetworkMode, 'host'); assert.equal(meta.HostConfig.ReadonlyRootfs, true);
      assert.equal(meta.HostConfig.Privileged, false); assert.equal(meta.Config.User, '1000:1000'); assert.deepEqual(meta.HostConfig.CapDrop, ['ALL']);
      assert.ok(meta.HostConfig.SecurityOpt.includes('no-new-privileges')); assert.equal(meta.Mounts.length, 0);
      assert.equal(Object.keys(meta.HostConfig.PortBindings || {}).length, 0); assert.deepEqual(meta.Config.Cmd, query);
      const raw = JSON.parse(this.docker(['logs', id])); assert.ok(Array.isArray(raw));
      for (const row of raw) { assert.equal(typeof row.dst, 'string', 'Unknown route destination: HOLD'); assert.ok(row.dst.length > 0); if (row.dst !== 'default') assert.equal(cidrRange(row.dst).family, family); rows.push({ family, destination: row.dst, table: normalizeRouteTable(row.table), digest: sha(canonical(row)), deviceDigest: sha(String(row.dev || '')), type: row.type || 'unicast' }); }
      helpers.push({ id, imageId: image, family, count: raw.length, exitCode: 0 });
    }
    const ids = this.docker(['network', 'ls', '--no-trunc', '--format', '{{.ID}}']).split('\n').filter(Boolean);
    assert.ok(ids.length > 0);
    const networkMeta = JSON.parse(this.docker(['network', 'inspect', ...ids]));
    for (const network of networkMeta) { assert.ok(Array.isArray(network.IPAM.Config || [])); for (const config of network.IPAM.Config || []) assert.equal(typeof config.Subnet, 'string', 'Unknown Docker IPAM subnet: HOLD'); }
    const networks = networkMeta.map(network => ({ id: network.Id, driver: network.Driver, internal: network.Internal,
      enableIPv6: network.EnableIPv6, ipam: (network.IPAM.Config || []).map(config => ({ subnet: config.Subnet, gateway: config.Gateway })),
      metadataDigest: sha(canonical({ Driver: network.Driver, Internal: network.Internal, EnableIPv4: network.EnableIPv4, EnableIPv6: network.EnableIPv6, IPAM: network.IPAM, Options: network.Options, Labels: network.Labels })),
      prefixes: (network.IPAM.Config || []).flatMap(config => [config.Subnet, config.IPRange].filter(Boolean)).sort() }));
    const snapshot = { stage, newNetworkId, at: new Date().toISOString(), fixtureOnly: true, toolReceiptSha256: ROUTE_RECEIPT_SHA, numericStringRouteTablesNormalized: true, networks, routes: rows, helpers };
    fs.writeFileSync(path.join(this.root, `${stage}-daemon-network.json`), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    return snapshot;
  }
  async startPostgres(major) {
    assert.ok([16, 18].includes(major));
    const before = this.explicitSubnet ? this.captureDaemonNetwork('pre-network', this.explicitSubnet) : null;
    if (before) validateNetworkSnapshot(before, this.explicitSubnet);
    const networkId = this.own(this.docker(['network', 'create', '--internal', ...(this.explicitSubnet ? ['--subnet', this.explicitSubnet] : []), ...this.labels(), `phoenix-${this.owner}-legacy-pg${major}`]), `pg${major}-network`, 'network');
    if (before) verifyNetworkDelta(before, this.captureDaemonNetwork('post-network', this.explicitSubnet, networkId), networkId, this.explicitSubnet);
    assert.equal(this.docker(['network', 'inspect', networkId, '--format', '{{.Internal}}']), 'true');
    const id = this.own(this.docker(['run', '--pull=never', '-d', ...this.labels(), '--network', networkId, '--network-alias', 'fixture-db', '--restart=no',
      '--publish', '127.0.0.1::5432', '--mount', `type=tmpfs,destination=${major === 16 ? '/var/lib/postgresql/data' : '/var/lib/postgresql'},tmpfs-size=536870912`,
      '-e', `POSTGRES_USER=${ADMIN}`, '-e', `POSTGRES_DB=${DB}`, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', `postgres:${major}-alpine`,
      '-c', 'log_statement=all', '-c', 'log_min_error_statement=error', '-c', 'log_line_prefix=bootstrap-db=%d user=%u app=%a pid=%p ']), `pg${major}`);
    const pg = { id, networkId, major }, deadline = Date.now() + 30000;
    while (true) { try { this.sql(pg, 'SELECT 1;'); break; } catch { assert.ok(Date.now() < deadline, 'Owned PG startup deadline'); await pause(200); } }
    assert.equal(Math.floor(Number(this.sql(pg, 'SHOW server_version_num;')) / 10000), major);
    await this.setupHistoricalSchema(pg); return pg;
  }
  async setupHistoricalSchema(pg) {
    const ddl = path.join(this.archivedApi, 'ddl'), migrations = path.join(this.archivedApi, 'migrations');
    const files = [...fs.readdirSync(ddl).filter(name => name.endsWith('.sql')).sort().map(name => path.join(ddl, name)),
      path.join(migrations, 'v3_schema_complete.sql'), ...fs.readdirSync(migrations).filter(name => /^2026.*\.sql$/.test(name)).sort().map(name => path.join(migrations, name))];
    const applied = files.map(file => ({ file: path.relative(this.archivedApi, file), sha256: sha(fs.readFileSync(file)) }));
    this.sql(pg, 'CREATE TABLE schema_migrations(filename text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());');
    // Preserve the formal runner's fresh psql session for every file, without hundreds
    // of host Docker round-trips. Only the exact archived SQL directories are mounted.
    const commands = ['set -eu'];
    for (const { file } of applied) {
      assert.match(file, /^(ddl|migrations)\/[a-zA-Z0-9_.-]+\.sql$/);
      commands.push(`echo APPLYING_${file}`, `psql -X -q -v ON_ERROR_STOP=1 -h fixture-db -U ${ADMIN} -d ${DB} -f /fixture/${file}`);
      if (/^migrations\/2026/.test(file)) commands.push(`printf '%s\\n' "INSERT INTO schema_migrations(filename) VALUES('${path.basename(file)}');" | psql -X -q -v ON_ERROR_STOP=1 -h fixture-db -U ${ADMIN} -d ${DB}`);
    }
    const schemaId = this.own(this.docker(['create', '--pull=never', ...this.labels(), '--network', pg.networkId, '--restart=no', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--mount', `type=bind,source=${ddl},target=/fixture/ddl,readonly`, '--mount', `type=bind,source=${migrations},target=/fixture/migrations,readonly`,
      `postgres:${pg.major}-alpine`, 'sh', '-c', commands.join('\n')]), `pg${pg.major}-historical-schema`);
    try { this.docker(['start', '-a', schemaId], { timeout: 180000 }); assert.equal(this.inspectContainer(schemaId).State.ExitCode, 0); }
    catch (error) {
      // Never echo historical seed/SQL source or its potentially sensitive values.
      fs.writeFileSync(path.join(this.root, `pg${pg.major}-schema-failure.json`), JSON.stringify({ fixtureOnly: true, schemaContainerId: schemaId, intendedFiles: applied,
        errorDigest: sha(String(error.stderr || error.message)), result: 'HOLD' }, null, 2), { mode: 0o600 });
      throw new Error('LEGACY_FIXTURE_HOLD=HISTORICAL_SCHEMA_CHAIN_FAILED');
    }
    this.sql(pg, `CREATE TABLE IF NOT EXISTS migrations(id serial PRIMARY KEY,timestamp bigint NOT NULL,name varchar NOT NULL);
      INSERT INTO migrations(timestamp,name) SELECT (extract(epoch FROM applied_at)*1000)::bigint,regexp_replace(filename,'\\.sql$','') FROM schema_migrations;`);
    const migrationId = this.own(this.docker(['create', '--pull=never', ...this.labels(), '--network', pg.networkId, '--restart=no', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '-e', 'DB_HOST=fixture-db', '-e', 'DB_PORT=5432', '-e', `DB_USER=${ADMIN}`, '-e', `DB_NAME=${DB}`, '-e', 'DB_PASSWORD=', this.imageId,
      'node', 'node_modules/typeorm/cli.js', '-d', 'dist/database/data-source.js', 'migration:run']), `pg${pg.major}-schema-migrator`);
    this.docker(['start', '-a', migrationId], { timeout: 120000 }); assert.equal(this.inspectContainer(migrationId).State.ExitCode, 0);
    // Existing CI-only contract for documented legacy runtime tables with no canonical
    // migration. This augments a successful full historical chain; it never substitutes
    // for a failed migration or changes any existing table/constraint.
    const tablesBefore = this.sql(pg, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;").split('\n').filter(Boolean);
    const startupFixturePath = path.join(ROOT, 'scripts/ci/api-bootstrap-schema-fixture.sql');
    const startupFixtureSql = fs.readFileSync(startupFixturePath, 'utf8');
    assert.doesNotMatch(startupFixtureSql.replace(/--[^\n]*/g, ''), /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|MERGE|DROP|ALTER)\b/i);
    this.sql(pg, startupFixtureSql);
    const tablesAfter = this.sql(pg, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;").split('\n').filter(Boolean);
    const startupSchemaFixture = { path: 'scripts/ci/api-bootstrap-schema-fixture.sql', sha256: sha(startupFixtureSql),
      createdTables: tablesAfter.filter(table => !tablesBefore.includes(table)), canonicalMigrationEquivalent: false };
    const tableNames = this.sql(pg, "SELECT quote_ident(tablename) FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('migrations','schema_migrations') ORDER BY tablename;").split('\n').filter(Boolean);
    const counts = JSON.parse(this.sql(pg, `SELECT json_agg(x) FROM (${tableNames.map(name => `SELECT ${literal(name)} name,count(*) rows FROM public.${name}`).join(' UNION ALL ')}) x;`));
    const protectedTables = JSON.parse(this.sql(pg, "SELECT coalesce(json_agg(DISTINCT quote_ident(c.relname)),'[]'::json) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND (t.tgtype::int & 32)<>0;"));
    const cleanup = planSyntheticSeedCleanup(counts, protectedTables);
    // No guard is disabled and no protected audit/config relation is touched. RESTRICT
    // deliberately refuses a protected FK dependency instead of cascading around it.
    if (cleanup.truncateTables.length) this.sql(pg, `TRUNCATE ${cleanup.truncateTables.map(name => `public.${name}`).join(',')} RESTART IDENTITY RESTRICT;`);
    const remaining = Number(this.sql(pg, `SELECT sum(rows) FROM (${tableNames.map(name => `SELECT count(*) rows FROM public.${name}`).join(' UNION ALL ')}) x;`)); assert.equal(remaining, 0);
    this.sql(pg, `CREATE ROLE ${WRITER} LOGIN;GRANT CONNECT ON DATABASE ${DB} TO ${WRITER};GRANT USAGE ON SCHEMA public TO ${WRITER};GRANT ALL ON ALL TABLES IN SCHEMA public TO ${WRITER};GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${WRITER};`);
    pg.schema = { historicalSourceSha: LEGACY_SHA, rawFiles: applied, typeormMigratorId: migrationId, typeormExit: 0, startupSchemaFixture, businessTablesEmptied: cleanup.truncateTables.length,
      unchangedProtectedEmptyTables: cleanup.unchangedProtectedEmptyTables, remainingBusinessRows: remaining, guardsDisabled: false,
      fullHistoricalChain: true, productionSchemaEquivalent: 'UNVERIFIED' };
    fs.writeFileSync(path.join(this.root, `pg${pg.major}-schema.json`), JSON.stringify(pg.schema, null, 2), { mode: 0o600 });
  }
  async startLegacy(pg) {
    const candidate = { pg, mode: 'LEGACY_EMPTY', captureApp: `legacy-${pg.major}-${randomUUID().slice(0, 8)}` };
    candidate.begin = `SELECT ${literal(`${candidate.captureApp}-BEGIN`)}`; this.sql(pg, candidate.begin + ';');
    const env = { NODE_ENV: 'production', APP_ENV: 'production', PORT: '3100', DB_HOST: 'fixture-db', DB_PORT: '5432', DB_USER: WRITER, DB_NAME: DB, DB_PASSWORD: '',
      JWT_SECRET: 'isolated-legacy-fixture-only-at-least-32-characters', CHANJET_SYNC_POLICY: 'HOLD', CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false',
      CHANJET_APP_KEY: 'owned-fixture-only', CHANJET_APP_SECRET: 'owned-fixture-only', CHANJET_PROVIDER_BASE_URL: 'http://127.0.0.1:3099', LEGACY_ERP_FIXTURE: this.owner, ERP_CAPTURE_APP: candidate.captureApp };
    candidate.id = this.own(this.docker(['run', '--pull=never', '-d', ...this.labels(), '--network', pg.networkId, '--restart=no', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=16777216,mode=1777', '--tmpfs', '/app/uploads:rw,nosuid,nodev,size=16777216,uid=1000,gid=1000',
      ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]), this.imageId]), `pg${pg.major}-actual-old-nest`);
    const deadline = Date.now() + 45000;
    while (true) {
      try { const response = this.request(candidate, '/api/readiness'); if (response.status === 200 && response.body.status === 'READY' && response.body.db === 'connected') { candidate.readiness = response; break; } } catch { /* bounded real startup */ }
      if (Date.now() > deadline || !this.inspectContainer(candidate.id).State.Running) throw new Error('LEGACY_FIXTURE_HOLD=OLD_NEST_STARTUP_FAILED');
      await pause(200);
    }
    candidate.before = this.inspectContainer(candidate.id);
    assert.equal(candidate.before.Image, this.imageId); assert.equal(candidate.before.Config.Labels['org.opencontainers.image.revision'], LEGACY_SHA); assert.equal(candidate.before.RestartCount, 0);
    assert.equal(this.request(candidate, '/api/internal/background/status').status, 404, 'Old runtime must not be represented as a modern participant');
    const apiNetworks = Object.values(JSON.parse(this.docker(['inspect', candidate.id, '--format', '{{json .NetworkSettings.Networks}}'])));
    assert.equal(apiNetworks.length, 1); assert.equal(apiNetworks[0].NetworkID, pg.networkId);
    assert.match(apiNetworks[0].IPAddress, /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[0-9.]+$/);
    candidate.externalUrl = `http://${apiNetworks[0].IPAddress}:3100/api/readiness`;
    candidate.ingressClientId = this.own(this.docker(['run', '--pull=never', '-d', ...this.labels(), '--network', pg.networkId, '--restart=no', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      'node:20-bookworm-slim', 'node', '-e', 'setInterval(()=>{},1000)']), `pg${pg.major}-external-ingress-client`);
    const probe = this.externalProbe(candidate); assert.equal(probe.connected, true); assert.equal(probe.status, 200); assert.equal(probe.body.status, 'READY');
    candidate.ready = `SELECT ${literal(`${candidate.captureApp}-READY`)}`; this.sql(pg, candidate.ready + ';');
    candidate.readyAt = Date.now(); return candidate;
  }
  externalProbe(candidate) {
    this.inspectContainer(candidate.ingressClientId);
    const script = "fetch(process.argv[1],{signal:AbortSignal.timeout(1500)}).then(async r=>console.log(JSON.stringify({connected:true,status:r.status,body:await r.json()}))).catch(()=>console.log(JSON.stringify({connected:false})))";
    return JSON.parse(this.docker(['exec', candidate.ingressClientId, 'node', '-e', script, candidate.externalUrl]));
  }
  databaseSessions(candidate) {
    const result = JSON.parse(this.sql(candidate.pg, `SELECT json_build_object('serverCheckedAt',clock_timestamp(),
      'preparedTransactionsInFixtureDatabase',(SELECT count(*) FROM pg_prepared_xacts WHERE database=current_database()),
      'sessions',(SELECT coalesce(json_agg(x),'[]'::json) FROM (SELECT pid,backend_start,state,xact_start,query_start,state_change,
        wait_event_type,wait_event,backend_type,client_addr::text,client_port,
        extract(epoch FROM (clock_timestamp()-backend_start))::numeric(18,3) AS backend_age_seconds
        FROM pg_stat_activity WHERE application_name=${literal(candidate.captureApp)} ORDER BY pid) x));`));
    return { ...result, observedAt: new Date().toISOString(), applicationName: candidate.captureApp,
      idleBackends: result.sessions.filter(session => session.state === 'idle' && session.xact_start === null).length,
      activeBackends: result.sessions.filter(session => session.state === 'active').length,
      inTransactionBackends: result.sessions.filter(session => session.xact_start !== null).length,
      sqlTextCollected: false, productionEligible: false };
  }
  async observeAndStop(candidate) {
    const { pg } = candidate, nextMinute = Math.floor(candidate.readyAt / 60000 + 1) * 60000;
    while (Date.now() < nextMinute + 1800) await pause(Math.min(500, nextMinute + 1800 - Date.now()));
    const end = `SELECT ${literal(`${candidate.captureApp}-OBSERVED`)}`; this.sql(pg, end + ';');
    const records = sliceCapturedWindow(this.logs(pg.id), candidate.ready, end, 'erp-fixture-control').filter(record => record.app === candidate.captureApp);
    assert.ok(records.some(record => /sys_notification_rules/i.test(record.sql)), 'Actual old minute Cron must run');
    const classifications = records.map(record => ({ kind: classifySql(record.sql, record.controlParameters), sqlSha256: sha(record.sql) }));
    const networkEvents = this.network(candidate);
    const blockedRequests = identifyBlockedLegacyAuthStartup(networkEvents, this.logs(candidate.id));
    fs.writeFileSync(path.join(this.root, `pg${pg.major}-blocked-provider-observation.json`), JSON.stringify({ fixtureOnly: true, productionReceipt: false,
      events: networkEvents, ...blockedRequests, actualRemoteTransmission: 0, guardEvidence: { dockerNetworkId: pg.networkId, dockerInternal: true,
        onlyApiNetworkVerified: true, preloadSha256: sha(fs.readFileSync(path.join(this.root, 'image-context/fixture-preload.cjs'))),
        nonLoopbackFetchAndTcpThrowBeforeOriginalTransport: true }, productionSchemaEquivalent: 'UNVERIFIED' }, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(this.root, `pg${pg.major}-old-runtime-window.json`), JSON.stringify({ records, classifications, crossedRealCronMinute: new Date(nextMinute).toISOString() }, null, 2), { mode: 0o600 });
    // Root-external fixture enforcement, not an old-process in-memory promise.
    const beforeDisconnectAt = new Date().toISOString();
    this.docker(['network', 'disconnect', pg.networkId, candidate.id]);
    const afterDisconnectAt = new Date().toISOString();
    const networks = JSON.parse(this.docker(['inspect', candidate.id, '--format', '{{json .NetworkSettings.Networks}}'])); assert.deepEqual(Object.keys(networks), []);
    assert.equal(this.externalProbe(candidate).connected, false, 'Independently pre-verified external client must really lose ingress before stop');
    assert.equal(this.docker(['inspect', candidate.id, '--format', '{{.HostConfig.RestartPolicy.Name}}']), 'no');
    const beforeStopAt = new Date().toISOString();
    this.docker(['stop', '--time', '35', candidate.id], { timeout: 45000 });
    const afterStopAt = new Date().toISOString();
    const first = this.inspectContainer(candidate.id), firstObservedAt = new Date().toISOString();
    await pause(1500); const second = this.inspectContainer(candidate.id), secondObservedAt = new Date().toISOString();
    const database = this.databaseSessions(candidate), remaining = database.sessions.length;
    this.docker(['stop', '--time', '5', candidate.ingressClientId]);
    fs.writeFileSync(path.join(this.root, `pg${pg.major}-old-stop-observation.json`), JSON.stringify({ fixtureOnly: true, productionReceipt: false,
      before: candidate.before, first, second, remainingDatabaseSessions: remaining, actualExternalIngressDenied: true,
      timing: { beforeDisconnectAt, afterDisconnectAt, beforeStopAt, afterStopAt, firstObservedAt, secondObservedAt }, database,
      forcedAfterTimeout: first.State.ExitCode === 137, legacyDrainResult: 'UNSUPPORTED', businessReconciliation: 'HOLD' }, null, 2), { mode: 0o600 });
    const outcome = validateStoppedLegacy(candidate.before, [first, second], remaining);
    const result = { ...outcome, pgMajor: pg.major, sourceSha: LEGACY_SHA, sourceBuilt: true, productionImageEquivalent: false, imageId: this.imageId,
      containerId: candidate.id, startupReadiness: candidate.readiness, runtimeStatements: records.length,
      actualRuntimeMutationAttempts: classifications.filter(item => /MUTATION/.test(item.kind)).length,
      crossedRealCronMinute: new Date(nextMinute).toISOString(), ...blockedRequests, actualRemoteTransmission: 0, isolatedNetwork: true, actualExternalIngressDenied: true,
      ingressClientId: candidate.ingressClientId, ingressProbe: 'INDEPENDENT_OWNED_CONTAINER', hostPublishedPort: false,
      restartPolicy: 'no', stoppedSamples: [first, second], remainingDatabaseSessions: remaining, database,
      timing: { beforeDisconnectAt, afterDisconnectAt, beforeStopAt, afterStopAt, firstObservedAt, secondObservedAt },
      domains: ['NOTIFICATION_EXTERNAL_SEND', 'IOT_PARTIAL_COMMITS', 'CHANJET_AUTH_REQUESTS', 'DATABASE_TRANSACTIONS', 'PERSISTENT_TASKS'].map(domain => ({ domain, outcome: 'HOLD_NOT_RECONCILED' })),
      deterministicNotificationScenario: 'NOT_RUN', deterministicIotPartialCommitScenario: 'NOT_RUN', productionTrustedPaths: 'NOT_RUN', productionFD9: 'NOT_RUN' };
    this.results.push(result); this.record();
    if (blockedRequests.unidentifiedBlockedRequests > 0) throw new Error('LEGACY_FIXTURE_HOLD=UNIDENTIFIED_BLOCKED_PROVIDER_REQUEST');
    return result;
  }
  async exercise() {
    for (const major of this.pgMajors) { const pg = await this.startPostgres(major); const candidate = await this.startLegacy(pg); await this.observeAndStop(candidate); }
    const result = { schema: 'phoenix.source-built-legacy-erp-fixture/v1', outcome: 'HOLD', fixtureObservation: 'COMPLETE', fixtureOnly: true, productionReceipt: false, productionEligible: false,
      sourceSha: LEGACY_SHA, imageId: this.imageId, sourceBuilt: true, productionImageEquivalent: false, pgSelection: this.pgMajors, notRunPgMajors: [16,18].filter(major => !this.pgMajors.includes(major)), explicitSubnet: this.explicitSubnet, results: this.results, legacyTransitionAcceptance: 'HOLD', productionMutation: false };
    fs.writeFileSync(path.join(this.root, 'summary.json'), JSON.stringify(result, null, 2), { mode: 0o600 }); return result;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.ok(process.argv.length === 2 || (process.argv.length === 4 && process.argv[2] === '--pg18-only-explicit-subnet'));
  const fixture = new OwnedLegacyErpCapsule(process.argv[2] ? { pgMajors: [18], subnet: process.argv[3] } : {});
  try { await fixture.build(); await fixture.exercise(); console.log(JSON.stringify({ outcome: 'HOLD', fixtureObservation: 'COMPLETE', evidenceDirectory: fixture.root, legacyTransitionAcceptance: 'HOLD', productionEligible: false })); }
  catch (error) { fixture.record({ outcome: 'HOLD', failureCode: String(error.message).slice(0, 160) }); console.error(`LEGACY_ERP_FIXTURE_HOLD evidence=${fixture.root}`); process.exitCode = 1; }
}
