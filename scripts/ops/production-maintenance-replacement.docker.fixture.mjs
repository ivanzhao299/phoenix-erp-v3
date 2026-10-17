/** Local owned capsule only. Not a production guard or a production receipt.
 * No cleanup is automatic: full immutable IDs are written for the root agent. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { inspectReplacementRuntime } from './production-maintenance-replacement.mjs';
import { canonicalDigest, createMaintenanceEvidence } from './production-maintenance-receipts.mjs';
import { LEGACY_EVIDENCE_DOMAINS } from './background-control-legacy-transition.mjs';

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export class OwnedComposeCapsule {
  constructor(manifest) {
    assert.ok(path.isAbsolute(manifest) && manifest.includes('/artifacts/'));
    assert.equal(fs.existsSync(manifest), false, 'never overwrite a resource manifest');
    this.owner = `replacement-${randomUUID()}`; this.project = `phoenix-${this.owner}`; this.manifest = manifest;
    this.root = path.join(path.dirname(manifest), this.owner); fs.mkdirSync(this.root, { mode: 0o700 });
    this.stateDirectory = path.join(this.root, 'state'); fs.mkdirSync(this.stateDirectory, { mode: 0o700 });
    this.resources = []; this.files = []; this.record();
  }
  record() { fs.writeFileSync(this.manifest, JSON.stringify({ schema: 'phoenix.owned-compose-replacement-fixture/v1', fixtureOnly: true, productionReceipt: false,
    owner: this.owner, project: this.project, root: this.root, resources: this.resources, files: this.files, cleanupExecuted: false }, null, 2), { mode: 0o600 }); }
  docker(args, { timeoutMs = 30000, env = {} } = {}) {
    return execFileSync('/usr/bin/docker', args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024,
      env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  }
  write(name, content, mode = 0o600) { const file = path.join(this.root, name); fs.writeFileSync(file, content, { mode, flag: 'wx' }); this.files.push(file); this.record(); return file; }
  own(id, role, type = 'container') {
    assert.match(id, type === 'image' ? /^sha256:[a-f0-9]{64}$/ : /^[a-f0-9]{64}$/);
    const labels = JSON.parse(this.docker(type === 'image' ? ['image', 'inspect', id, '--format', '{{json .Config.Labels}}'] : type === 'network' ? ['network', 'inspect', id, '--format', '{{json .Labels}}'] : ['inspect', id, '--format', '{{json .Config.Labels}}']));
    assert.equal(labels['phoenix.test.owner'], this.owner); assert.equal(labels['phoenix.test.kind'], 'maintenance-replacement');
    if (!this.resources.some(r => r.id === id)) this.resources.push({ id, role, type, owner: this.owner }); this.record(); return id;
  }
  captureOwnedProject() {
    for (const id of this.docker(['ps', '-a', '--no-trunc', '--filter', `label=phoenix.test.owner=${this.owner}`, '-q']).split('\n').filter(Boolean)) {
      const role = this.docker(['inspect', id, '--format', '{{ index .Config.Labels "com.docker.compose.service" }}']);
      this.own(id, `captured-${role}`);
    }
    for (const id of this.docker(['network', 'ls', '--no-trunc', '--filter', `label=phoenix.test.owner=${this.owner}`, '-q']).split('\n').filter(Boolean)) this.own(id, 'captured-bridge', 'network');
  }
  capsuleRun = (args, options) => {
    if (args[0] === 'ps') return this.docker(['ps', '-a', '--no-trunc', '--filter', `label=phoenix.test.owner=${this.owner}`, '-q']);
    return this.docker(args, options);
  };
  async start() {
    assert.equal(Number(process.versions.node.split('.')[0]), 20, 'run the actual fixture on Node20');
    this.docker(['image', 'inspect', 'node:20-alpine', '--format', '{{.Id}}']);
    for (const [role, revision] of [['old', 'a'.repeat(40)], ['candidate', 'b'.repeat(40)]]) {
      const dockerfile = this.write(`Dockerfile.${role}`, `FROM node:20-alpine\nLABEL org.opencontainers.image.revision="${revision}"\nLABEL phoenix.test.owner="${this.owner}"\nLABEL phoenix.test.kind="maintenance-replacement"\n`);
      this.docker(['build', '--pull=false', '--network=none', '-f', dockerfile, '-t', `${this.project}:${role}`, this.root], { timeoutMs: 60000 });
      this[`${role}Image`] = this.own(JSON.parse(this.docker(['image', 'inspect', `${this.project}:${role}`, '--format', '{{json .Id}}'])), role, 'image');
    }
    const source = path.join(this.root, 'public-control'); fs.mkdirSync(source, { mode: 0o755 });
    const manifestFile = path.join(source, 'manifest.json');
    fs.writeFileSync(manifestFile, JSON.stringify({ protocolVersion: 1, generation: 1, phase: 'FENCED', participants: [], fixtureOnly: true }), { mode: 0o444, flag: 'wx' }); fs.chmodSync(source, 0o555);
    this.files.push(source, manifestFile); this.record(); this.publicSource = source;
    const apiCode = `process.on('SIGTERM',()=>process.exit(0));const fs=require('fs'),http=require('http');http.createServer((q,s)=>{const p=JSON.parse(fs.readFileSync('/run/phoenix-background-control/manifest.json'));if(q.method!=='GET'&&p.phase!=='OPEN'){s.writeHead(503);s.end('FENCED')}else{s.end('fixture-only')}}).listen(3100,'0.0.0.0')`;
    const service = role => ({ image: '${API_IMAGE}', restart: 'no', labels: { 'phoenix.test.owner': this.owner, 'phoenix.test.kind': 'maintenance-replacement' },
      command: role === 'api' ? ['node', '-e', apiCode] : ['node', '-e', 'setInterval(()=>{},1000)'],
      healthcheck: { test: ['CMD', 'node', '-e', 'process.exit(0)'], interval: '1s', timeout: '1s', retries: 3 } });
    const config = { services: { api: { ...service('api'), ports: ['127.0.0.1::3100'], volumes: [{ type: 'bind', source, target: '/run/phoenix-background-control', read_only: true, bind: { create_host_path: false } }] },
      web: service('web'), db: service('db') }, networks: { default: { labels: { 'phoenix.test.owner': this.owner, 'phoenix.test.kind': 'maintenance-replacement' } } } };
    this.write('docker-compose.yml', JSON.stringify(config)); this.write('.env', '');
    this.composeFileSha256 = createHash('sha256').update(fs.readFileSync(path.join(this.root, 'docker-compose.yml'))).digest('hex');
    this.docker(['compose', '--project-name', this.project, '--env-file', path.join(this.root, '.env'), '-f', path.join(this.root, 'docker-compose.yml'), 'up', '-d', '--no-build', '--pull', 'never'], { env: { API_IMAGE: this.oldImage }, timeoutMs: 60000 });
    for (const role of ['api', 'web', 'db']) this[`${role}Id`] = this.own(this.docker(['ps', '-a', '--no-trunc', '--filter', `label=com.docker.compose.project=${this.project}`, '--filter', `label=com.docker.compose.service=${role}`, '-q']), role);
    this.networkId = this.own(this.docker(['network', 'ls', '--no-trunc', '--filter', `label=com.docker.compose.project=${this.project}`, '-q']), 'bridge', 'network');
    const deadline = Date.now() + 15000;
    while (['api', 'web', 'db'].some(role => this.inspect(this[`${role}Id`]).health !== 'healthy')) { assert.ok(Date.now() < deadline); await delay(100); }
    this.pre = Object.fromEntries(['api', 'web', 'db'].map(role => [role, this.inspect(this[`${role}Id`])]));
    this.pre.db.mountsSha256 = canonicalDigest([]);
    // Explicit owned fixture effects reproduce the old runtime's maintenance
    // stop; these are NOT a production maintenance authority or reconciliation.
    this.own(this.apiId, 'api'); this.docker(['network', 'disconnect', this.networkId, this.apiId]);
    this.docker(['stop', '--time', '1', this.apiId]);
    const first = this.inspect(this.apiId); await delay(1100); const second = this.inspect(this.apiId);
    this.stopped = { protocol: 'STOP_AND_RECONCILE', legacyDrainResult: 'UNSUPPORTED', ingressFenceDigest: '1'.repeat(64),
      executors: [{ ...this.pre.api, before: this.pre.api, first, second }],
      database: { ownershipComplete: true, remainingConnections: 0, openTransactions: 0, preparedTransactions: 0, persistentRunning: 0, persistentQueued: 0 } };
    const now = Date.now();
    this.context = { schema: 'phoenix.legacy-maintenance-context/v1', protocolVersion: 1, owner: '987654321-1', previousFloorSha: 'a'.repeat(40), previousApiSha: 'a'.repeat(40),
      previousWebSha: 'a'.repeat(40), targetSha: 'b'.repeat(40), window: { start: new Date(now - 30000).toISOString(), end: new Date(now + 180000).toISOString() },
      candidate: { revision: 'b'.repeat(40), imageId: this.candidateImage }, sourceHelperSha256: '2'.repeat(64), schemaEvidenceSha256: '3'.repeat(64), migrationPaths: [],
      preSnapshot: this.pre, executors: [this.pre.api], replacement: { project: this.project, composeFileSha256: this.composeFileSha256 } };
    const envelope = (kind, body) => createMaintenanceEvidence(kind, this.context, body);
    this.prerequisites = { stopped: envelope('STOP_LEGACY', this.stopped),
      reconciliation: envelope('RECONCILIATION', { domains: LEGACY_EVIDENCE_DOMAINS.map(domain => ({ domain, disposition: 'RECONCILED', unknownEffects: 0, pendingWrites: 0, requiresReplay: false, requiresBusinessMutation: false })) }),
      isolation: envelope('INGRESS_FENCE', { state: 'FROZEN', continuous: true, lastVerifiedAt: new Date().toISOString(), leaseExpiresAt: this.context.window.end,
        revival: { restartPolicy: 'no', orchestratorsDisabled: true, executorIds: [this.apiId] }, inventory: { allDockerIds: this.capsuleRun(['ps']).split('\n').sort() } }),
      recovery: envelope('RECOVERY_MATERIAL', { materialsAvailable: true, materialsSha256: canonicalDigest({ source: this.root, oldImage: this.oldImage, oldExecutor: this.pre.api }) }) };
    return this;
  }
  inspect(id) { this.own(id, this.resources.find(r => r.id === id)?.role || 'candidate'); return inspectReplacementRuntime(id, this.capsuleRun); }
  store(state) {
    return { directory: this.stateDirectory, assertCurrent() {}, readState: () => state,
      assertOwnedIntent: (operation, from, digest) => { assert.equal(operation, 'REPLACE_CANDIDATE'); assert.equal(from, 'PROMOTION_PREPARED'); assert.equal(digest, state.stateDigest); return { operation, from, digest, fixtureOnly: true }; },
      immutable: (file, value) => { assert.equal(path.dirname(file), this.stateDirectory); const fd = fs.openSync(file, 'wx', 0o600); try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        this.files.push(file); this.record(); } };
  }
}
