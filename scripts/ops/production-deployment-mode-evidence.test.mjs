import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { MODE_EVIDENCE_SCHEMA, compareSnapshots, verifyEvidenceFiles, verifyLiveSnapshot, summarizeStartupLogs, startupBundle } from './production-deployment-evidence.mjs';
import * as verifier from './production-deployment-evidence.mjs';
import { deploymentMode, beginState } from './production-deployment-state.mjs';
import { completedDeploymentEvidenceBinding } from './background-control-coordinator.mjs';
import { readFormalDeploymentEvidence } from './chanjet-readonly-production-audit.mjs';
const target = 'a'.repeat(40), previous = 'b'.repeat(40);
const image = c => `sha256:${c.repeat(64)}`;
const binding = mode => ({ runId: '123-1', runAttempt: 1, targetSha: target, configFloorSha: target, deployMode: mode, evidenceSchema: MODE_EVIDENCE_SCHEMA });
const clone = value => structuredClone(value);
function fixture(mode) {
  const meta = (service, i) => ({ service, container: `phoenix-v3-${service}`, id: String(i).repeat(64), created: '2026-10-18T01:00:00Z', startedAt: '2026-10-18T01:00:01Z',
    image: image(String(i)), ociRevision: service === 'db' ? null : previous, running: true, health: 'healthy', restartCount: 0,
    mounts: [{ type: 'bind', source: `/data/${service}`, destination: `/app/${service}`, readOnly: false }] });
  const pre = { schema: MODE_EVIDENCE_SCHEMA, phase: 'PRE_SNAPSHOT', deployMode: mode, deployRunId: '123-1', deployRunAttempt: 1,
    targetSha: target, configFloorSha: target, capturedAt: '2026-10-18T01:01:00Z', containers: { db: meta('db', 1), api: meta('api', 2), web: meta('web', 3) } };
  const post = clone(pre); post.phase = 'POST_SNAPSHOT'; post.capturedAt = '2026-10-18T01:02:00Z';
  const services = mode === 'full' ? ['api', 'web'] : [mode];
  const logs = {};
  for (const service of services) {
    const item = post.containers[service]; item.id = (service === 'api' ? '4' : '5').repeat(64); item.image = image(service === 'api' ? '4' : '5');
    item.created = '2026-10-18T01:01:01Z'; item.startedAt = '2026-10-18T01:01:02Z'; item.ociRevision = target;
    logs[service] = summarizeStartupLogs({ ...binding(mode), floorSha: target, service, containerId: item.id, startedAt: item.startedAt,
      capturedAt: '2026-10-18T01:02:01Z', stdout: `2026-10-18T01:01:03Z ${service === 'api' ? 'API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS' : '✓ Ready in 1.2s'}\n`,
      readinessVerified: true, webHttpVerified: true });
  }
  return { pre, post, log: startupBundle(post, logs) };
}
function withFiles(f, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mode-evidence-'));
  try {
    const files = {};
    for (const name of ['pre', 'post', 'log']) { files[name] = path.join(dir, `deploy-123-1-${name === 'log' ? 'startup' : name}-evidence.json`); fs.writeFileSync(files[name], JSON.stringify(f[name])); }
    return fn(files, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function verify(f, mode = f.pre.deployMode) { return withFiles(f, files => verifyEvidenceFiles(files.pre, files.post, files.log, binding(mode))); }
function runFor(post) {
  return args => {
    if (args[0] === 'inspect') {
      const x = post.containers[args[1].replace('phoenix-v3-', '')];
      return [x.id, x.created, x.image, { StartedAt: x.startedAt, Running: x.running, Health: { Status: x.health } }, x.restartCount,
        x.mounts.map(m => ({ Type: m.type, Source: m.source, Destination: m.destination, RW: !m.readOnly }))].map(JSON.stringify).join('\t');
    }
    const x = Object.values(post.containers).find(x => x.image === args[2]);
    return JSON.stringify(x.ociRevision ? { 'org.opencontainers.image.revision': x.ociRevision } : {});
  };
}
for (const mode of ['api', 'web', 'full']) {
  test(`${mode} mode binds actual switched service startup and unchanged peers`, () => {
    const f = fixture(mode); const result = verify(f); assert.equal(result.deployMode, mode); assert.equal(result.startup, 'PASS_REDACTED_SUMMARY');
    assert.equal(result.comparison.db, 'UNCHANGED');
    assert.equal(result.comparison.web, mode === 'api' ? 'UNCHANGED' : 'TARGET_VERIFIED');
    verifyLiveSnapshot(f.post, binding(mode), runFor(f.post));
    withFiles(f, (_, dir) => {
      const actual = Object.fromEntries(['api', 'web'].map(s => [s, { revision: f.post.containers[s].ociRevision, imageId: f.post.containers[s].image }]));
      assert.equal(readFormalDeploymentEvidence(dir, actual, target, verifier, runFor(f.post)).status, 'PASS');
      actual.web.revision = previous === actual.web.revision ? target : previous;
      assert.equal(readFormalDeploymentEvidence(dir, actual, target, verifier, runFor(f.post)).status, 'HOLD');
    });
  });
}
test('Web mode requires Web startup evidence and rejects API-only schema/readiness substitutes', () => {
  const f = fixture('web'); assert.equal(f.log.services.api, undefined); assert.equal(f.log.services.web.phase, 'WEB_STARTUP_LOG');
  for (const change of [x => { x.log.services = { api: x.log.services.web }; }, x => { x.log.services.web.phase = 'API_STARTUP_LOG'; },
    x => { x.log.services.web.eventCounts.WEB_HTTP_PASS = 0; }, x => { x.log.services.web.eventCounts.WEB_STARTUP_PASS = 0; },
    x => { x.log.services.web.eventCounts.READINESS_HTTP_PASS = 0; }]) {
    const altered = clone(f); change(altered); assert.throws(() => verify(altered), /STARTUP/);
  }
  const item = f.post.containers.web;
  const apiText = summarizeStartupLogs({ ...binding('web'), floorSha: target, service: 'web', containerId: item.id, startedAt: item.startedAt,
    capturedAt: '2026-10-18T01:02:01Z', stdout: '2026-10-18T01:01:03Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n', readinessVerified: true, webHttpVerified: true });
  assert.equal(apiText.result, 'UNVERIFIED_STARTUP_EVIDENCE');
});
test('mode cannot be changed, removed or reinterpreted through CLI/transaction binding', () => {
  const f = fixture('web'); assert.throws(() => verify(f, 'api'), /MODE_BINDING/);
  for (const key of ['pre', 'post', 'log']) for (const mode of [undefined, 'api', 'invalid']) {
    const altered = clone(f); if (mode === undefined) delete altered[key].deployMode; else altered[key].deployMode = mode;
    assert.throws(() => verify(altered), /MODE_BINDING/);
  }
  const downgraded = clone(f); for (const key of ['pre', 'post', 'log']) { downgraded[key].schema = 'phoenix.production-deployment-evidence/v2'; delete downgraded[key].deployMode; }
  assert.throws(() => verify(downgraded, 'web'), /MODE_BINDING/);
});
test('untouched API and DB retain full identity, health, mounts and restart count', () => {
  const f = fixture('web');
  for (const service of ['api', 'db']) for (const [key, value] of Object.entries({ id: '9'.repeat(64), image: image('9'), created: '2026-10-17T01:00:00Z',
    startedAt: '2026-10-18T01:01:10Z', restartCount: 1, running: false, health: 'unhealthy', mounts: [] })) {
    const altered = clone(f); altered.post.containers[service][key] = value; assert.throws(() => verify(altered), /CHANGED|IDENTITY/);
  }
  const ociDrift = clone(f); ociDrift.post.containers.api.ociRevision = target; assert.throws(() => verify(ociDrift), /API_CHANGED/);
});
test('target, timestamps, fresh candidate, startup digest and run attempt fail closed', () => {
  const f = fixture('web');
  for (const change of [x => { x.post.containers.web.ociRevision = previous; }, x => { x.post.containers.web.id = x.pre.containers.web.id; },
    x => { x.post.containers.web.startedAt = x.pre.containers.web.startedAt; }, x => { x.post.containers.web.restartCount = 1; },
    x => { x.post.capturedAt = '2026-10-18T00:00:00Z'; }, x => { x.log.services.web.containerId = x.pre.containers.web.id; },
    x => { x.log.services.web.combinedDigest = ''; }, x => { x.log.services.web.schemaWriteSignalCount = 1; },
    x => { x.log.services.web.errorSignalCount = 1; }, x => { x.log.deployRunAttempt = 2; }, x => { x.log.services.web.targetSha = previous; },
    x => { x.log.services.web.capturedAt = '2026-10-18T01:01:59Z'; }]) {
    const altered = clone(f); change(altered); assert.throws(() => verify(altered), /DEPLOY_EVIDENCE_HOLD/);
  }
});
test('live re-inspect rejects restarts and identity changes after POST', () => {
  const f = fixture('web');
  for (const service of ['api', 'db', 'web']) for (const [key, value] of Object.entries({ id: '9'.repeat(64), restartCount: 1, mounts: [], ociRevision: 'f'.repeat(40) })) {
    if (service === 'db' && key === 'ociRevision') continue;
    const live = clone(f.post); live.containers[service][key] = value;
    assert.throws(() => verifyLiveSnapshot(f.post, binding('web'), runFor(live)), /TOCTOU|IDENTITY/);
  }
});
test('transaction persists exact deployment mode and rejects incompatible build selection', () => {
  for (const mode of ['api', 'web', 'full']) {
    assert.equal(deploymentMode({ mode, buildApi: mode !== 'web', buildWeb: mode !== 'api' }), mode);
    assert.throws(() => deploymentMode({ mode, buildApi: false, buildWeb: false }), /DEPLOY_MODE/);
    const state = beginState({ previous: { api: { revision: previous, imageId: image('1') }, web: { revision: previous, imageId: image('2') } }, configSha: target, target, scope: { baseline: previous, target, changed: [] }, floor: { floorSha: target }, mode });
    assert.equal(state.deployMode, mode);
  }
});

function legacyFixture() {
  const f = fixture('api');
  f.log = f.log.services.api;
  for (const receipt of [f.pre, f.post, f.log]) { receipt.schema = 'phoenix.production-deployment-evidence/v2'; delete receipt.deployMode; }
  return f;
}
function auditFixture(f, live = f.post, suppliedVerifier = verifier) {
  const actual = Object.fromEntries(['api', 'web'].map(s => [s, { revision: live.containers[s].ociRevision, imageId: live.containers[s].image }]));
  return withFiles(f, (_, dir) => readFormalDeploymentEvidence(dir, actual, target, suppliedVerifier, runFor(live)));
}
test('formal audit uses one strict verifier for legacy v2 and rejects forged mode properties', () => {
  const f = legacyFixture(); assert.equal(auditFixture(f).status, 'PASS');
  for (const key of ['pre', 'post', 'log']) for (const mode of ['api', 'web', 'full']) {
    const altered = clone(f); altered[key].deployMode = mode;
    assert.equal(auditFixture(altered).status, 'HOLD', `${key} forged mode ${mode}`);
  }
  for (const change of [x => { x.log.result = 'HOLD_STARTUP_ERROR'; }, x => { x.log.rawOutput = true; },
    x => { x.log.combinedDigest = ''; }, x => { x.log.schemaWriteSignalCount = 1; },
    x => { x.pre.configFloorSha = previous; }, x => { x.post.deployRunAttempt = 2; }]) {
    const altered = clone(f); change(altered); assert.equal(auditFixture(altered).status, 'HOLD');
  }
});
for (const schema of ['legacy-v2', 'v3']) {
  test(`formal ${schema} audit refuses same-image recreate, restart and mount drift after POST`, () => {
    const f = schema === 'legacy-v2' ? legacyFixture() : fixture('web');
    for (const service of ['api', 'web', 'db']) for (const [key, value] of Object.entries({ id: '9'.repeat(64),
      startedAt: '2026-10-18T01:03:00Z', created: '2026-10-17T01:00:00Z', restartCount: 1, mounts: [], health: 'unhealthy', running: false })) {
      const live = clone(f.post); live.containers[service][key] = value;
      assert.equal(auditFixture(f, live).status, 'HOLD', `${service} ${key}`);
    }
    assert.equal(auditFixture(f, f.post, {}).status, 'HOLD');
  });
}

test('formal audit refuses actual floor mismatch for legacy v2 and v3 receipts', () => {
  for (const f of [legacyFixture(), fixture('web')]) withFiles(f, (_, dir) => {
    const actual = Object.fromEntries(['api', 'web'].map(s => [s, { revision: f.post.containers[s].ociRevision, imageId: f.post.containers[s].image }]));
    assert.equal(readFormalDeploymentEvidence(dir, actual, previous, verifier, runFor(f.post)).status, 'HOLD');
  });
});

test('new standalone auditor carries its reviewed verifier beside actual old installed sources', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-evidence-audit-'));
  const helpers = ['production-deployment-evidence.mjs', 'production-atomic-state.mjs', 'production-config-contract.json', 'production-config-guard.mjs',
    'production-trusted-paths.mjs', 'capture-production-runtime.mjs', 'update-managed-chanjet-env.mjs', 'chanjet-readonly-policy.mjs', 'chanjet-admission-schema-receipt.mjs'];
  try {
    const stage = path.join(dir, 'reviewed-audit'); fs.mkdirSync(stage);
    fs.copyFileSync('scripts/ops/chanjet-readonly-production-audit.mjs', path.join(stage, 'audit.mjs'));
    for (const name of helpers) fs.copyFileSync(path.join('scripts/ops', name), path.join(stage, name));
    const auditor = await import(pathToFileURL(path.join(stage, 'audit.mjs')).href);
    const newVerifier = await auditor.loadAuditEvidenceVerifier();
    const frozenBytes = fs.readFileSync('scripts/ops/fixtures/production-evidence-v2-22687886.fixture.json');
    assert.equal(createHash('sha256').update(frozenBytes).digest('hex'), 'ceb2e48c2bc20d1104d5c762f52bee0c73baffde0c77611cd1996a635e2dbd49');
    const frozen = JSON.parse(frozenBytes);
    assert.deepEqual(frozen.sourceRefs, ['226878864f184d26f41a890e666ebed52547db14', '9155dcccd7578288a2ccedc9f2ec3f0dd0bf1f7e']);
    for (const ref of frozen.sourceRefs) {
      const old = path.join(dir, ref); fs.mkdirSync(old);
      for (const name of helpers) {
        const entry = frozen.files[name], bytes = gunzipSync(Buffer.from(entry.gzipBase64, 'base64'));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
        assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), entry.blobSha);
        fs.writeFileSync(path.join(old, name), bytes);
      }
      const installedOld = await import(pathToFileURL(path.join(old, 'production-deployment-evidence.mjs')).href);
      assert.equal(installedOld.evidenceMode, undefined, 'the compatibility case must really load the old helper');
      const f = legacyFixture();
      withFiles(f, (_, evidenceDir) => {
        const actual = Object.fromEntries(['api', 'web'].map(s => [s, { revision: f.post.containers[s].ociRevision, imageId: f.post.containers[s].image }]));
        assert.equal(auditor.readFormalDeploymentEvidence(evidenceDir, actual, target, installedOld, runFor(f.post)).status, 'HOLD');
        assert.equal(auditor.readFormalDeploymentEvidence(evidenceDir, actual, target, newVerifier, runFor(f.post)).status, 'PASS');
        f.pre.deployMode = 'web';
        fs.writeFileSync(path.join(evidenceDir, 'deploy-123-1-pre-evidence.json'), JSON.stringify(f.pre));
        assert.equal(auditor.readFormalDeploymentEvidence(evidenceDir, actual, target, newVerifier, runFor(f.post)).status, 'HOLD');
      });
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// The coordinator independently enforces the record's evidence generation;
// it cannot infer an old contract merely from receipts supplied at OPEN.
test('coordinator requires v3 API evidence for a mode-bound successful deployment', () => {
  const f = fixture('api');
  const expected = completedDeploymentEvidenceBinding({ deployMode: 'api' }, { owner: '123-1', targetSha: target });
  assert.equal(expected.evidenceSchema, MODE_EVIDENCE_SCHEMA);
  withFiles(f, files => assert.equal(verifyEvidenceFiles(files.pre, files.post, files.log, expected).deployMode, 'api'));
  const downgraded = clone(f);
  for (const receipt of [downgraded.pre, downgraded.post, downgraded.log]) { receipt.schema = 'phoenix.production-deployment-evidence/v2'; delete receipt.deployMode; }
  withFiles(downgraded, files => assert.throws(() => verifyEvidenceFiles(files.pre, files.post, files.log, expected), /MODE_BINDING/));
});
test('coordinator refuses non-API and missing typed-legacy mode records', () => {
  for (const state of [{ deployMode: 'web' }, { deployMode: 'full' }, { deployMode: undefined }, { deployMode: null }, { maintenance: {} }]) {
    assert.throws(() => completedDeploymentEvidenceBinding(state, { owner: '123-1', targetSha: target }), /DEPLOY_SUCCESS_MODE_BINDING/);
  }
});
test('coordinator preserves only genuinely unbound historical API evidence', () => {
  const expected = completedDeploymentEvidenceBinding({}, { owner: '123-1', targetSha: target });
  assert.equal(expected.deployMode, 'api'); assert.equal(expected.evidenceSchema, 'phoenix.production-deployment-evidence/v2');
  assert.equal(expected.runId, '123-1'); assert.equal(expected.targetSha, target);
});
