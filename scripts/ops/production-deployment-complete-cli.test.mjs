import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { captureSnapshot, summarizeStartupLogs, startupBundle } from './production-deployment-evidence.mjs';

// Execute the unchanged CLI, evidence verification and atomic writes in a child
// process. Only host admission (root/mount/git/lock) and Docker are local shims;
// no production paths, Docker socket, credentials or database are reachable.
const ops = path.dirname(new URL(import.meta.url).pathname);
const target = 'a'.repeat(40), previous = 'b'.repeat(40), runId = '123456-1';
const image = c => `sha256:${c.repeat(64)}`;
const pins = { api: { imageId: image('a'), revision: target }, web: { imageId: image('b'), revision: previous } };
function fixture(t, { badEvidence = false, runtimeDrift = false, metadataDrift = false, deployMode, wrongMode, legacyEvidence = false, maintenancePending = false, operation = 'complete' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-complete-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const selected = deployMode === 'full' ? ['api', 'web'] : [deployMode || 'api'];
  const pins = { api: { imageId: image('a'), revision: deployMode === 'web' ? previous : target }, web: { imageId: image('b'), revision: deployMode && deployMode !== 'api' ? target : previous } };
  const stateDir = path.join(dir, 'state'); fs.mkdirSync(stateDir, { mode: 0o700 });
  for (const name of fs.readdirSync(ops).filter(x => /\.(mjs|json)$/.test(x) && !x.endsWith('.test.mjs'))) {
    fs.copyFileSync(path.join(ops, name), path.join(dir, name));
  }
  // Diagnostic mode runs the exact old state/evidence CLI sources against the
  // same valid fixture. This reproduced Node 20 exit 13 before the fix.
  if (process.env.COMPLETE_BASELINE_REF) {
    for (const name of ['production-deployment-state.mjs', 'production-deployment-evidence.mjs']) {
      fs.writeFileSync(path.join(dir, name), execFileSync('git', ['show', `${process.env.COMPLETE_BASELINE_REF}:scripts/ops/${name}`]));
    }
  }
  const write = (name, value) => { const file = path.join(stateDir, name); fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); return file; };
  const metadata = Object.fromEntries(['db', 'api', 'web'].map((service, i) => [service, {
    id: String(i + 1).repeat(64), created: '2026-10-13T00:00:00Z', image: image(String(i + 1)),
    state: { Running: true, StartedAt: '2026-10-13T00:00:01Z', Health: { Status: 'healthy' } }, mounts: [],
    revision: service === 'db' ? null : pins[service].revision,
  }]));
  metadata.api.image = pins.api.imageId; metadata.web.image = pins.web.imageId;
  const dockerRunner = metadata => args => {
    if (args[0] === 'inspect') {
      const service = args[1].replace('phoenix-v3-', ''); const m = metadata[service];
      if (args[3] === '{{.Image}}') return m.image;
      return [m.id, m.created, m.image, m.state, 0, m.mounts].map(JSON.stringify).join('\t');
    }
    const m = Object.values(metadata).find(x => x.image === args[2]);
    if (args[4].includes('json')) return JSON.stringify(m.revision ? { 'org.opencontainers.image.revision': m.revision } : {});
    return m.revision;
  };
  const dockerResult = dockerRunner(metadata);
  const binding = { runId, runAttempt: 1, targetSha: target, floorSha: target, ...(deployMode ? { deployMode } : {}) };
  let pre, post, log;
  if (deployMode) {
    const before = structuredClone(metadata);
    for (const service of selected) {
      before[service].id = (service === 'api' ? '4' : '5').repeat(64); before[service].image = image(service === 'api' ? '4' : '5'); before[service].revision = previous;
      metadata[service].created = '2026-10-13T00:00:02Z'; metadata[service].state.StartedAt = '2026-10-13T00:00:03Z';
    }
    pre = captureSnapshot({ ...binding, phase: 'PRE_SNAPSHOT', capturedAt: '2026-10-13T00:00:02Z' }, dockerRunner(before));
    post = captureSnapshot({ ...binding, phase: 'POST_SNAPSHOT', capturedAt: '2026-10-13T00:00:04Z' }, dockerResult);
    const summaries = Object.fromEntries(selected.map(service => [service, summarizeStartupLogs({ ...binding, service,
      containerId: post.containers[service].id, startedAt: post.containers[service].startedAt, capturedAt: '2026-10-13T00:00:05Z',
      stdout: `2026-10-13T00:00:04Z ${service === 'api' ? 'API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS' : 'Ready in 100ms'}\n`, readinessVerified: true, webHttpVerified: true })]));
    log = startupBundle(post, summaries);
  } else {
    pre = captureSnapshot({ ...binding, phase: 'PRE_SNAPSHOT' }, dockerResult);
    post = captureSnapshot({ ...binding, phase: 'POST_SNAPSHOT' }, dockerResult);
    log = summarizeStartupLogs({ ...binding, containerId: post.containers.api.id, startedAt: post.containers.api.startedAt,
      capturedAt: '2026-10-13T00:00:03Z', stdout: '2026-10-13T00:00:02Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n', readinessVerified: true });
  }
  if (legacyEvidence) {
    log = log.services.api;
    for (const receipt of [pre, post, log]) { receipt.schema = 'phoenix.production-deployment-evidence/v2'; delete receipt.deployMode; }
  }
  if (badEvidence) { if (deployMode) log.services[selected[0]].result = 'HOLD_STARTUP_ERROR'; else log.result = 'HOLD_STARTUP_ERROR'; }
  const evidence = { pre: write('pre.json', pre), post: write('post.json', post), log: write('log.json', log) };
  const state = { version: 3, ...(deployMode ? { deployMode } : {}), outcome: 'SWITCHING', target, configSha: target, floorSha: target, active: pins,
    previous: { ...pins, api: { imageId: image('c'), revision: previous } }, candidates: { api: pins.api },
    switched: { api: selected.includes('api'), web: selected.includes('web') }, protectedImages: [pins.api.imageId, pins.web.imageId], migrationPaths: [], evidence };
  write(`deploy-${runId}.json`, state);
  write('active.json', { version: 3, outcome: 'CONFIG_READY_HOLD', active: state.previous });
  write('floor.json', { version: 3, floorSha: target });
  write('transaction.json', { version: 3, phase: 'IN_PROGRESS', runId });
  write('policy-transition.json', { version: 3, phase: 'IN_PROGRESS', operation: 'CODE_HOLD', runId });
  if (maintenancePending) write('maintenance-current.json', { owner: '999999-1' });
  // Guard shim only replaces unrelated host admission; CLI ownership remains
  // bound to the fixture marker. All complete checks run from real sources.
  fs.writeFileSync(path.join(dir, 'production-config-guard.mjs'), `
import fs from 'node:fs'; import path from 'node:path';
export const CONTRACT = { version: 3, stateDirectory: ${JSON.stringify(stateDir)} };
export const secureJson = f => JSON.parse(fs.readFileSync(f));
export const assertStateVersion = r => { if(r.version!==3) throw Error('CONFIG_HOLD=STATE_VERSION'); return r; };
export const verifyContext = (root, directory) => { if(root!==${JSON.stringify(dir)}||directory!==CONTRACT.stateDirectory) throw Error('CONFIG_HOLD=FIXTURE_CONTEXT'); };
export const guardProduction = () => secureJson(path.join(CONTRACT.stateDirectory,'floor.json'));
export const assertTransactionOwnership = (directory, id) => secureJson(path.join(directory,'transaction.json')).runId === id;
export const migrationScope = () => { throw Error('UNEXPECTED_OPERATION'); };
export const git = migrationScope; export const rollbackEligibility = () => ({allowed:true});
`);
  // Real file type/mode/link and atomic rename/fsync checks, with local UID and
  // fixture directory identity instead of the production mount/ACL authority.
  fs.copyFileSync(path.join(ops, 'production-trusted-paths.mjs'), path.join(dir, 'real-trusted.mjs'));
  fs.writeFileSync(path.join(dir, 'production-trusted-paths.mjs'), `
import fs from 'node:fs';
export { assertSameDirectory, assertContained } from './real-trusted.mjs';
import { assertRegularFile as regular, readPinnedFile as read } from './real-trusted.mjs';
export const inspectTrustedDirectory = directory => { const s=fs.lstatSync(directory); return {dev:s.dev,ino:s.ino,mode:s.mode}; };
export const assertRegularFile = s => regular(s,{uid:process.getuid()});
export const readPinnedFile = (f,o) => read(f,{...o,uid:process.getuid()},{inspectDirectory:inspectTrustedDirectory});
`);
  if (runtimeDrift) metadata.api.revision = previous;
  if (metadataDrift) metadata.db.id = '9'.repeat(64);
  fs.writeFileSync(path.join(dir, 'docker-fixture.json'), JSON.stringify(metadata));
  fs.writeFileSync(path.join(dir, 'docker'), `#!${process.execPath}
import fs from 'node:fs';
const m=JSON.parse(fs.readFileSync(new URL('./docker-fixture.json',import.meta.url))); const a=process.argv.slice(2);
if(a[0]==='inspect') {const x=m[a[1].replace('phoenix-v3-','')]; if(a[3]==='{{.Image}}') console.log(x.image); else console.log([x.id,x.created,x.image,x.state,0,x.mounts].map(JSON.stringify).join('\\t'));}
else if(a[0]==='image'&&a[1]==='inspect') {const x=Object.values(m).find(x=>x.image===a[2]); console.log(a[4].includes('json')?JSON.stringify(x.revision?{'org.opencontainers.image.revision':x.revision}:{}):x.revision);}
else process.exit(99);
`, { mode: 0o700 });
  // Rename shim .mjs and launcher so Node 20 never treats it as CommonJS.
  fs.renameSync(path.join(dir, 'docker'), path.join(dir, 'docker.mjs'));
  fs.writeFileSync(path.join(dir, 'docker'), `#!/bin/sh\nexec '${process.execPath}' '${path.join(dir, 'docker.mjs')}' "$@"\n`, { mode: 0o700 });
  const runtime = path.join(dir, 'capture-production-runtime.mjs');
  fs.writeFileSync(runtime, fs.readFileSync(runtime, 'utf8').replace("PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'", `PATH: ${JSON.stringify(dir)}`));
  const before = Object.fromEntries(['active.json', `deploy-${runId}.json`, 'transaction.json', 'policy-transition.json'].map(n => [n, fs.readFileSync(path.join(stateDir, n), 'utf8')]));
  const result = spawnSync(process.execPath, [path.join(dir, 'production-deployment-state.mjs'), operation], {
    cwd: dir, encoding: 'utf8', timeout: 15000, env: { PATH: dir, DEPLOY_RUN_ID: runId, DEPLOY_RUN_ATTEMPT: '1', ...(deployMode ? { DEPLOY_MODE: wrongMode || deployMode } : {}) },
  });
  return { dir, stateDir, before, result };
}

test('real complete CLI exits zero, persists SUCCESS and removes both markers', t => {
  const { stateDir, result } = fixture(t);
  assert.equal(result.error, undefined); assert.equal(result.signal, null);
  assert.equal(result.status, 0, `stderr=${result.stderr}`);
  assert.match(result.stdout, /^DEPLOYMENT_STATE=SUCCESS\s*$/);
  for (const name of ['active.json', `deploy-${runId}.json`]) assert.equal(JSON.parse(fs.readFileSync(path.join(stateDir, name))).outcome, 'SUCCESS');
  for (const name of ['transaction.json', 'policy-transition.json']) assert.equal(fs.existsSync(path.join(stateDir, name)), false);
});
test('real complete CLI refuses an active maintenance lifecycle without changing deployment receipts', t => {
  const { stateDir, before, result } = fixture(t, { maintenancePending: true });
  assert.equal(result.status, 1); assert.doesNotMatch(result.stdout, /SUCCESS/);
  for (const [name, bytes] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(stateDir, name), 'utf8'), bytes);
  assert.equal(fs.existsSync(path.join(stateDir, 'maintenance-current.json')), true);
});
test('read-only rollback plan remains available during an active maintenance lifecycle', t => {
  const { stateDir, before, result } = fixture(t, { maintenancePending: true, operation: 'rollback-plan' });
  assert.equal(result.status, 0, result.stderr); assert.ok(Array.isArray(JSON.parse(result.stdout)));
  for (const [name, bytes] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(stateDir, name), 'utf8'), bytes);
});
for (const [name, options] of [['bad evidence', { badEvidence: true }], ['runtime drift', { runtimeDrift: true }], ['live DB metadata drift', { metadataDrift: true }]]) {
  test(`real complete CLI holds on ${name} without writing state or clearing markers`, t => {
    const { stateDir, before, result } = fixture(t, options);
    assert.equal(result.status, 1, `stderr=${result.stderr}`); assert.equal(result.signal, null);
    assert.match(result.stderr, /STATE_HOLD=/); assert.doesNotMatch(result.stdout, /SUCCESS/);
    for (const [file, bytes] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(stateDir, file), 'utf8'), bytes);
  });
}

test('minimal top-level-await cycle exits 13 without a signal', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'complete-cycle-minimal-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'state.mjs'), "export const atomicState = () => {};\nawait import('./evidence.mjs');\nconsole.log('COMPLETE_RETURN');\n");
  fs.writeFileSync(path.join(dir, 'evidence.mjs'), "import { atomicState } from './state.mjs';\nexport const verify = atomicState;\n");
  const result = spawnSync(process.execPath, [path.join(dir, 'state.mjs')], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 13); assert.equal(result.signal, null);
  assert.doesNotMatch(result.stdout, /COMPLETE_RETURN/);
});

test('standard sed preview and tail drain their producers under pipefail', () => {
  const result = spawnSync('bash', ['-c', `set -Eeuo pipefail
seq 1 200000 | sed -n '1,20p' > /dev/null
test "\${PIPESTATUS[*]}" = '0 0'
seq 1 200000 | tail -1 > /dev/null
test "\${PIPESTATUS[*]}" = '0 0'
echo REPORT_RETURN
`], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /REPORT_RETURN/);
});

for (const deployMode of ['api', 'web', 'full']) {
  test(`real v3 ${deployMode} complete CLI verifies mode-bound receipts and live pins`, t => {
    const { stateDir, result } = fixture(t, { deployMode });
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /DEPLOYMENT_STATE=SUCCESS/);
    assert.equal(fs.existsSync(path.join(stateDir, 'transaction.json')), false);
  });
}
test('real Web-only complete CLI holds a changed mode without clearing transaction markers', t => {
  const { stateDir, before, result } = fixture(t, { deployMode: 'web', wrongMode: 'api' });
  assert.equal(result.status, 1); assert.match(result.stderr, /DEPLOY_MODE/);
  for (const [file, bytes] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(stateDir, file), 'utf8'), bytes);
});

test('new mode-bound transaction refuses legacy v2 receipts in the real complete CLI', t => {
  const { stateDir, before, result } = fixture(t, { deployMode: 'api', legacyEvidence: true });
  assert.equal(result.status, 1); assert.doesNotMatch(result.stdout, /DEPLOYMENT_STATE=SUCCESS/);
  for (const [file, bytes] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(stateDir, file), 'utf8'), bytes);
});
