/** Real owned Node control child; synthetic HTTP, Docker, PG catalog and logs.
 * This tests lifecycle composition, not native health or production authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { phaseFixture } from '../ci/maintenance-owned-candidate.fixture.mjs';
import { now } from '../ci/maintenance-transition-fixture.mjs';
import { MODE_EVIDENCE_SCHEMA } from './production-deployment-evidence.mjs';
import { OwnedCandidateBindingObserver } from './production-maintenance-owned-candidate-observer.mjs';
import { API_READINESS_PROGRAM, WEB_HTTP_PROGRAM, observeCandidateHealthAndStartup } from './production-maintenance-candidate-health.mjs';
const hash = v => createHash('sha256').update(v).digest('hex');
const until = async p => { const end = performance.now() + 2000; while (!p()) { assert.ok(performance.now() < end); await new Promise(r => setTimeout(r, 3)); } };
async function using(action, extra = () => ({})) {
  const f = await phaseFixture(), context = f.h.context, c = f.h.candidate.api;
  let observer;
  try {
    const metadata = (service, pin) => ({ service, container: `phoenix-v3-${service}`, id: pin.id, image: pin.imageId,
      ociRevision: service === 'db' ? null : pin.revision, created: new Date(Date.parse(pin.startedAt) - 1000).toISOString(),
      startedAt: pin.startedAt, restartCount: pin.restartCount, running: true, health: 'healthy', mounts: service === 'api'
        ? [{ type: 'bind', source: '/data/owned-fixture/uploads', destination: '/app/uploads', readOnly: false }]
        : service === 'db' ? [{ type: 'bind', source: '/data/owned-fixture/pg', destination: '/var/lib/postgresql/data', readOnly: false }] : [] });
    const pre = { schema: MODE_EVIDENCE_SCHEMA, deployMode: 'api', phase: 'PRE_SNAPSHOT', deployRunId: context.owner,
      deployRunAttempt: Number(context.owner.split('-').at(-1)), targetSha: context.targetSha, configFloorSha: context.targetSha,
      capturedAt: new Date(now - 15000).toISOString(), containers: Object.fromEntries(['api', 'web', 'db'].map(k => [k, metadata(k, context.preSnapshot[k])])) };
    f.h.store.immutable(path.join(f.h.store.directory, `maintenance-formal-pre-${context.owner}.json`), pre);
    const post = structuredClone(pre); post.phase = 'POST_SNAPSHOT'; post.containers.api = metadata('api', c);
    let logHook = () => {};
    const healthDependencies = { guard() {}, store: f.h.store, now: () => now, monotonicNow: () => 0,
      read(args) {
        if (args[0] === 'exec') {
          assert.deepEqual(args.slice(2, -1), ['/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin', '/usr/local/bin/node', '-e']);
          if (args[1] === c.id) { assert.equal(args.at(-1), API_READINESS_PROGRAM); return JSON.stringify({ status: 200, ready: true, dbConnected: true, bodySha256: hash('synthetic'), bodyBytes: 9 }); }
          assert.equal(args[1], context.preSnapshot.web.id); assert.equal(args.at(-1), WEB_HTTP_PROGRAM);
          return JSON.stringify({ status: 307, accepted: true, locationSameOrigin: true, bodyDiscarded: true });
        }
        if (args[0] === 'inspect') {
          const m = post.containers[args[1].replace('phoenix-v3-', '')]; assert.ok(m);
          return [m.id, m.created, m.image, { StartedAt: m.startedAt, Running: m.running, Health: { Status: m.health } }, m.restartCount,
            m.mounts.map(v => ({ Type: v.type, Source: v.source, Destination: v.destination, RW: !v.readOnly }))].map(JSON.stringify).join('\t');
        }
        assert.equal(args[0], 'image'); const m = Object.values(post.containers).find(v => v.image === args[2]); assert.ok(m);
        return JSON.stringify(m.ociRevision ? { 'org.opencontainers.image.revision': m.ociRevision } : {});
      }, logs() { logHook(); return { status: 0, signal: null, stdout: `${c.startedAt} API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n${c.startedAt} Nest application successfully started\n`, stderr: '' }; } };
    const additions = extra(f);
    const dependencies = { bindingDependencies: f.dependencies, now: () => now, ...additions, healthDependencies: { ...healthDependencies, ...(additions.healthDependencies || {}) } };
    observer = new OwnedCandidateBindingObserver({ context, replacementEvidence: f.request('PRE_ADOPTION').replacementEvidence, rootLease: f.root }, dependencies);
    const request = () => ({ expectedStateDigest: f.h.store.readState().stateDigest });
    const inVerify = async body => {
      const original = f.h.adapters.verifyCandidate;
      f.h.adapters.verifyCandidate = async req => { f.adopt(); await observer.observe({ ...request(), mode: 'ADOPTED' }); await body(); return original(req); };
      return f.h.engine.verifyCandidate();
    };
    return await action({ ...f, observer, request, inVerify, post, logs(fn) { logHook = fn; } });
  } finally { await observer?.close().catch(() => undefined); await f.close(); }
}
test('default health collector is joined to original-root lifecycle without minting formal evidence', () => using(async f => {
  await f.inVerify(async () => {
    const result = await f.observer.observeHealth(f.request());
    assert.equal(result.schema, 'phoenix.candidate-health-observation/v1'); assert.equal(result.result, 'OBSERVATION_ONLY');
    assert.equal(result.apiReadiness.ready, true); assert.equal(result.startup.services.api.rawOutput, false);
    assert.equal(result.originalChildPid, f.root.session.child.pid); assert.equal(result.fullCandidateLease, false);
    assert.equal(result.outerProcessSupervisionRequired, true); assert.equal(result.admissionOrApprovalGranted, false);
    assert.equal(f.observer.cleanupDebt().pendingReads, 0); assert.equal(f.root.session.child.exitCode, null);
  });
  const released = await f.observer.close(); assert.equal(released.rootRelease.ownedBackendGone, true);
}));
test('health requires a preceding accepted adopted binding', () => using(async f => {
  await assert.rejects(f.observer.observeHealth(f.request()), /ADOPTED_BINDING_BEFORE_HEALTH_REQUIRED/);
  await assert.rejects(f.observer.observe({ ...f.request(), mode: 'PRE_ADOPTION' }), /OWNED_CANDIDATE_HOLD=/);
}));
for (const field of ['mode', 'url', 'rootLease', 'collector', 'approval']) test(`health request refuses ${field}`, () => using(async f => {
  await f.inVerify(async () => { await assert.rejects(f.observer.observeHealth({ ...f.request(), [field]: 'untrusted' }), /FIXED_OBSERVATION_REQUIRED/); });
}));
test('health timeout keeps abort-ignoring real work as debt; root cannot close early', () => {
  let entered = false, release;
  return using(async f => {
    await f.inVerify(async () => {
      const work = f.observer.observeHealth({ ...f.request(), timeoutMs: 1000 }), rejected = assert.rejects(work, /OWNED_CANDIDATE_HOLD=/);
      await until(() => entered); await rejected; assert.equal(f.observer.cleanupDebt().pendingReads, 1);
      await assert.rejects(f.observer.close({ timeoutMs: 10 }), /CLEANUP_UNVERIFIED/); assert.equal(f.root.session.child.exitCode, null);
      release(); await new Promise(r => setImmediate(r)); assert.equal(f.observer.cleanupDebt().pendingReads, 0);
      await assert.rejects(f.observer.close(), /CLEANUP_UNVERIFIED/);
    });
  }, () => ({ collectHealth: async (req, deps) => { const result = await observeCandidateHealthAndStartup(req, deps); return new Promise(resolve => { entered = true; release = () => resolve(result); }); } }));
});
test('binding observation cannot overlap health; late health result cannot erase poison', () => {
  let entered = false, release;
  return using(async f => {
    await f.inVerify(async () => {
      const work = f.observer.observeHealth(f.request()), rejected = assert.rejects(work, /OWNED_CANDIDATE_HOLD=/);
      await until(() => entered); await assert.rejects(f.observer.observe({ ...f.request(), mode: 'ADOPTED' }), /CONCURRENT_OR_DOWNGRADED_READ/);
      await rejected; release(); await new Promise(r => setImmediate(r)); await assert.rejects(f.observer.observeHealth(f.request()), /OWNED_CANDIDATE_HOLD=/);
    });
  }, () => ({ collectHealth: async (req, deps) => { const result = await observeCandidateHealthAndStartup(req, deps); return new Promise(resolve => { entered = true; release = () => resolve(result); }); } }));
});
for (const [name, change] of [['Web restart', f => f.post.containers.web.restartCount++], ['DB identity', f => f.post.containers.db.id = 'f'.repeat(64)],
  ['original child loss', f => { f.root.session.child.killed = true; }]]) test(`health ${name} remains a sticky refusal`, () => using(async f => {
  await f.inVerify(async () => { const child = f.root.session.child; f.logs(() => change(f));
    try { await assert.rejects(f.observer.observeHealth(f.request()), /OWNED_CANDIDATE_HOLD=/); }
    finally { child.killed = false; }
    await assert.rejects(f.observer.observeHealth(f.request()), /OWNED_CANDIDATE_HOLD=/);
  });
}));

test('health binding with only a different CF digest cannot replace the accepted lease anchor', () => using(async f => {
  await f.inVerify(async () => { await assert.rejects(f.observer.observeHealth(f.request()), /OWNED_CANDIDATE_HOLD=/);
    assert.equal(f.observer.cleanupDebt().manualRecoveryRequired, true); });
}, () => ({ healthDependencies: { collectBinding: async (req, deps) => {
  const { collectCandidateServerBinding } = await import('./production-maintenance-candidate-binding.mjs');
  const value = await collectCandidateServerBinding(req, deps); value.stateDigest = 'e'.repeat(64); return value;
} } })));
test('committed VF cannot be used as the CF VERIFY health intent', () => using(async f => {
  await f.inVerify(async () => { await f.observer.observeHealth(f.request()); });
  assert.equal(f.h.store.readState().phase, 'VERIFIED_FENCED');
  await assert.rejects(f.observer.observeHealth(f.request()), /OWNED_CANDIDATE_HOLD=/);
}));
test('close joins abort-cooperative health work before original root release', () => {
  let entered = false, settled = false;
  return using(async f => {
    await f.inVerify(async () => {
      const work = f.observer.observeHealth(f.request()), rejected = assert.rejects(work, /OWNED_CANDIDATE_HOLD=/);
      await until(() => entered); const released = await f.observer.close(); await rejected;
      assert.equal(settled, true); assert.equal(released.pendingReads, 0); assert.equal(released.rootRelease.ownedBackendGone, true);
      await assert.rejects(f.observer.observeHealth(f.request()), /OWNED_CANDIDATE_HOLD=/);
    });
  }, () => ({ collectHealth: req => new Promise((_, reject) => { entered = true;
    req.signal.addEventListener('abort', () => { settled = true; reject(new Error('SYNTHETIC_COOPERATIVE_HEALTH_ABORT')); }, { once: true }); }) }));
});
