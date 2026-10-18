/** Synthetic Docker/catalog/logs and owned Node root responder; NOT real HTTP,
 * PostgreSQL, production storage/FD9, governance or release proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { candidateBindingFixture } from '../ci/maintenance-candidate-binding-fixture.mjs';
import { observeCandidateHealthAndStartup, API_READINESS_PROGRAM, WEB_HTTP_PROGRAM } from './production-maintenance-candidate-health.mjs';
import { fixture as phaseFixture, harness, toStopped } from '../ci/maintenance-transition-fixture.mjs';
import { MODE_EVIDENCE_SCHEMA } from './production-deployment-evidence.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
async function fixture() {
  const f = await candidateBindingFixture(); f.adopt(); delete f.request.mode;
  const mounts = { api: [{ type: 'bind', source: '/data/owned-fixture/uploads', destination: '/app/uploads', readOnly: false }],
    web: [], db: [{ type: 'bind', source: '/data/owned-fixture/pg', destination: '/var/lib/postgresql/data', readOnly: false }] };
  const metadata = (service, pin) => ({ service, container: `phoenix-v3-${service}`, id: pin.id, image: pin.imageId, ociRevision: service === 'db' ? null : pin.revision,
    created: new Date(Date.parse(pin.startedAt) - 1000).toISOString(), startedAt: pin.startedAt, restartCount: pin.restartCount, running: true, health: 'healthy', mounts: mounts[service] });
  const pre = { schema: MODE_EVIDENCE_SCHEMA, deployMode: 'api', phase: 'PRE_SNAPSHOT', deployRunId: f.context.owner, deployRunAttempt: 1,
    targetSha: f.context.targetSha, configFloorSha: f.context.targetSha, capturedAt: new Date(f.now - 15000).toISOString(),
    containers: Object.fromEntries(['api', 'web', 'db'].map(service => [service, metadata(service, f.context.preSnapshot[service])])) };
  const post = structuredClone(pre); post.phase = 'POST_SNAPSHOT'; post.containers.api = metadata('api', f.candidate);
  const preFile = path.join(f.store.directory, `maintenance-formal-pre-${f.context.owner}.json`); f.records.set(preFile, pre);
  const probes = { api: { status: 200, ready: true, dbConnected: true, bodySha256: hash('synthetic body'), bodyBytes: 30 },
    web: { status: 307, accepted: true, locationSameOrigin: true, bodyDiscarded: true } };
  const log = { status: 0, signal: null, stdout: `${f.candidate.startedAt} API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n${f.candidate.startedAt} Nest application successfully started\n`, stderr: '' };
  const calls = [];
  const read = args => {
    calls.push(args);
    if (args[0] === 'exec') {
      const service = args[1] === f.candidate.id ? 'api' : 'web'; assert.equal(args[1], service === 'api' ? f.candidate.id : f.context.preSnapshot.web.id);
      assert.deepEqual(args.slice(2, -1), ['/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin', '/usr/local/bin/node', '-e']);
      assert.equal(args.at(-1), service === 'api' ? API_READINESS_PROGRAM : WEB_HTTP_PROGRAM); return JSON.stringify(probes[service]);
    }
    if (args[0] === 'inspect') {
      const service = args[1].replace('phoenix-v3-', ''); const m = post.containers[service]; assert.ok(m);
      return [m.id, m.created, m.image, { StartedAt: m.startedAt, Running: m.running, Health: { Status: m.health } }, m.restartCount,
        m.mounts.map(v => ({ Type: v.type, Source: v.source, Destination: v.destination, RW: !v.readOnly }))].map(JSON.stringify).join('\t');
    }
    assert.equal(args[0], 'image'); const m = Object.values(post.containers).find(v => v.image === args[2]); assert.ok(m);
    return JSON.stringify(m.ociRevision ? { 'org.opencontainers.image.revision': m.ociRevision } : {});
  };
  const dependencies = { guard() {}, store: f.store, now: () => f.now, monotonicNow: () => 0, bindingDependencies: f.dependencies, read,
    logs: args => { calls.push(args); assert.deepEqual(args, ['logs', '--timestamps', '--since', f.candidate.startedAt, '--until', new Date(f.now).toISOString(), f.candidate.id]); return log; } };
  return { ...f, pre, post, probes, log, calls, dependencies, get closed() { return f.closed; } };
}
async function using(action) { const f = await fixture(); try { return await action(f); } finally { await f.lease.close(); assert.equal(f.closed, true); } }
test('fixed adopted VERIFY observation derives readiness and redacted startup summary without writing or closing root', () => using(async f => {
  const records = f.records.size, result = await observeCandidateHealthAndStartup(f.request, f.dependencies);
  assert.equal(result.result, 'OBSERVATION_ONLY'); assert.equal(result.apiReadiness.ready, true); assert.equal(result.webHttp.status, 307);
  assert.equal(result.startup.services.api.result, 'PASS_REDACTED_SUMMARY'); assert.equal(result.startup.services.api.rawOutput, false);
  assert.equal(result.registryInstalled, false); assert.equal(result.continuousIngressProof, false); assert.equal(result.admissionOrApprovalGranted, false);
  assert.equal(f.records.size, records); assert.equal(f.closed, false);
  assert.ok(f.calls.every(args => ['inspect', 'image', 'exec', 'logs'].includes(args[0])));
}));
for (const [name, mutate] of [
  ['API200 with not-ready body', f => { f.probes.api.ready = false; }],
  ['API503', f => { f.probes.api.status = 503; }],
  ['unknown API output field', f => { f.probes.api.rawBody = 'MUST_NEVER_RETURN'; }],
  ['Web external redirect', f => { f.probes.web.locationSameOrigin = false; }],
  ['Web500', f => { f.probes.web.status = 500; }],
  ['wrong post API identity', f => { f.post.containers.api.id = 'd'.repeat(64); }],
  ['restarted Web', f => { f.post.containers.web.restartCount = 1; }],
  ['DB mount drift', f => { f.post.containers.db.mounts[0].source += '/other'; }],
  ['stale owner PRE', f => { f.pre.deployRunId = '999-1'; }],
  ['PRE before authorized window', f => { f.pre.capturedAt = new Date(Date.parse(f.context.window.start) - 1).toISOString(); }],
  ['startup error', f => { f.log.stderr = `${f.candidate.startedAt} ERROR: startup failed\n`; }],
  ['startup schema write', f => { f.log.stderr = `${f.candidate.startedAt} ALTER TABLE forbidden ADD COLUMN x int\n`; }],
  ['missing schema compatibility signal', f => { f.log.stdout = `${f.candidate.startedAt} started\n`; }],
  ['truncated log transport', f => { f.log.error = Object.assign(new Error('MUST_NOT_RETURN'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }); }]
]) test('rejects '+name+' while retaining original root', () => using(async f => {
  mutate(f); await assert.rejects(observeCandidateHealthAndStartup(f.request, f.dependencies), /CANDIDATE_HEALTH_HOLD=/); assert.equal(f.closed, false);
}));
test('raw startup secrets are redacted and only their classified count/digest survive', () => using(async f => {
  f.log.stderr = `${f.candidate.startedAt} token=SYNTHETIC_SECRET_SENTINEL\n`;
  const result = await observeCandidateHealthAndStartup(f.request, f.dependencies);
  assert.equal(result.startup.services.api.sensitiveLineCount, 1); assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET_SENTINEL'), false);
}));
test('late probes, abort and unsupported request flags never return a successful observation', () => using(async f => {
  const controller = new AbortController(); controller.abort(); await assert.rejects(observeCandidateHealthAndStartup({ ...f.request, signal: controller.signal }, f.dependencies), /DEADLINE_OR_ABORT/);
  assert.equal(f.calls.length, 0);
  await assert.rejects(observeCandidateHealthAndStartup({ ...f.request, readinessVerified: true }, f.dependencies), /FIXED_REQUEST_REQUIRED/);
  let elapsed = 0; const original = f.dependencies.read; f.dependencies.monotonicNow = () => elapsed;
  f.dependencies.read = args => { const result = original(args); elapsed = 1001; return result; };
  await assert.rejects(observeCandidateHealthAndStartup({ ...f.request, timeoutMs: 1000 }, f.dependencies), /HTTP_PROBE_UNVERIFIED|DEADLINE_OR_ABORT/);
  assert.equal(f.closed, false);
}));
test('runtime/control changes during log capture invalidate the completed read set', () => using(async f => {
  const logs = f.dependencies.logs; f.dependencies.logs = args => { const value = logs(args); f.status.bootId = '11234567-0123-4123-8123-0123456789ab'; return value; };
  await assert.rejects(observeCandidateHealthAndStartup(f.request, f.dependencies), /CANDIDATE_HEALTH_HOLD=/); assert.equal(f.closed, false);
}));
async function program(program, response) {
  const output = []; let exit = null; const calls = [];
  await runInNewContext(program, { Buffer, URL, AbortSignal, require: name => { assert.equal(name, 'node:crypto'); return { createHash }; },
    fetch: async (url, options) => { calls.push([url, options]); return response; }, process: { stdout: { write: value => output.push(value) }, exit: code => { exit = code; } } });
  return { output: output.join(''), exit, calls };
}
test('fixed API program checks the actual response body, bounds streaming and never outputs raw content (synthetic fetch)', async () => {
  const body = { code: 0, data: { status: 'READY', db: 'connected', timestamp: new Date().toISOString() } };
  const good = await program(API_READINESS_PROGRAM, new Response(JSON.stringify(body))); assert.equal(JSON.parse(good.output).ready, true);
  assert.equal(good.calls[0][0], 'http://127.0.0.1:3100/api/readiness'); assert.equal(good.calls[0][1].redirect, 'manual');
  const bad = await program(API_READINESS_PROGRAM, new Response(JSON.stringify({ ...body, code: 403 }))); assert.equal(JSON.parse(bad.output).ready, false);
  const overflow = await program(API_READINESS_PROGRAM, new Response('x'.repeat(4097))); assert.equal(overflow.exit, 64); assert.equal(overflow.output, '');
});
test('fixed Web program never follows redirects and accepts only its origin (synthetic fetch)', async () => {
  const good = await program(WEB_HTTP_PROGRAM, new Response(null, { status: 307, headers: { location: '/login' } })); assert.equal(JSON.parse(good.output).accepted, true);
  const bad = await program(WEB_HTTP_PROGRAM, new Response(null, { status: 307, headers: { location: 'https://external.invalid/' } })); assert.equal(JSON.parse(bad.output).accepted, false);
  assert.equal(bad.calls.length, 1); assert.equal(bad.calls[0][0], 'http://127.0.0.1:3000/'); assert.equal(bad.calls[0][1].redirect, 'manual');
});

for (const [name, mutate] of [
  ['Web restarts', f => { f.post.containers.web.restartCount++; }],
  ['DB name resolves to another ID', f => { f.post.containers.db.id = 'e'.repeat(64); }]
]) test('rejects '+name+' during logs via final native live re-inspection', () => using(async f => {
  const logs = f.dependencies.logs; f.dependencies.logs = args => { const result = logs(args); mutate(f); return result; };
  await assert.rejects(observeCandidateHealthAndStartup(f.request, f.dependencies), /CANDIDATE_HEALTH_HOLD=/); assert.equal(f.closed, false);
}));
test('actual private CF receipt chain without owned VERIFY intent cannot reach readiness or logs', () => using(async f => {
  const h = harness(phaseFixture({ context: f.context, clock: () => f.now }), { now: () => f.now });
  await toStopped(h); await h.engine.reconcile({ evidence: h.reconciliation }); await h.engine.preparePromotion(); await h.engine.replaceCandidate(); await h.engine.startCandidate();
  const state = h.store.readState(); assert.equal(state.phase, 'CANDIDATE_FENCED'); assert.equal(h.store.markerFile && (await import('node:fs')).existsSync(h.store.markerFile), false);
  const replacementEvidence = h.engine.receipt(state, 'CANDIDATE_REPLACEMENT');
  await assert.rejects(observeCandidateHealthAndStartup({ ...f.request, expectedStateDigest: state.stateDigest, replacementEvidence },
    { ...f.dependencies, store: h.store, bindingDependencies: { ...f.dependencies.bindingDependencies, store: h.store } }), /CANDIDATE_HEALTH_HOLD=/);
  assert.equal(f.calls.length, 0); assert.equal(f.closed, false);
}));

for (const field of ['now', 'monotonicNow']) test('rejects '+field+' rollback between fixed reads', () => using(async f => {
  let clock = field === 'now' ? f.now : 0, count = 0; f.dependencies[field] = () => clock;
  const read = f.dependencies.read; f.dependencies.read = args => { const result = read(args); clock += ++count === 1 ? 2 : -1; return result; };
  await assert.rejects(observeCandidateHealthAndStartup(f.request, f.dependencies), /CANDIDATE_HEALTH_HOLD=/);
  assert.equal(f.calls.length, 2); assert.equal(f.closed, false);
}));
test('nonfinite clocks and unclassified transport errors fail closed without leaking content', () => using(async f => {
  await assert.rejects(observeCandidateHealthAndStartup(f.request, { ...f.dependencies, now: () => NaN }), /DEADLINE_OR_ABORT/);
  assert.equal(f.calls.length, 0);
  f.dependencies.read = () => { throw new Error('SYNTHETIC_TRANSPORT_SENTINEL'); };
  await assert.rejects(observeCandidateHealthAndStartup(f.request, f.dependencies), error => /^CANDIDATE_HEALTH_HOLD=[A-Z_]+$/.test(error.message) && !error.message.includes('SYNTHETIC_TRANSPORT_SENTINEL'));
}));
