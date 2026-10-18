// Opt-in actual ERP Next standalone image test. Only explicitly labelled local
// fixtures are created/inspected; no production names, files or endpoints exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import * as evidence from '../ops/production-deployment-evidence.mjs';
import { readFormalDeploymentEvidence } from '../ops/chanjet-readonly-production-audit.mjs';
const image = process.env.WEB_EVIDENCE_E2E_IMAGE;
if (process.env.WEB_EVIDENCE_E2E_REQUIRED === 'true' && !image) throw Error('ERP_WEB_FIXTURE_IMAGE_REQUIRED');
test('actual ERP Next Web mode preserves peers and rejects HTTP/OCI/recreate/restart faults', { skip: !image, timeout: 180000 }, async () => {
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  const targetSha = process.env.WEB_EVIDENCE_E2E_TARGET_SHA;
  assert.match(targetSha || '', /^[a-f0-9]{40}$/);
  const owner = `web-evidence-e2e-${randomUUID()}`;
  const artifactRoot = path.resolve('artifacts/web-only-evidence-protocol');
  const dir = path.join(artifactRoot, owner); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dockerConfig = path.join(dir, 'docker-config'); fs.mkdirSync(dockerConfig, { mode: 0o700 });
  const env = { PATH: process.env.PATH, DOCKER_HOST: 'unix:///var/run/docker.sock', DOCKER_CONFIG: dockerConfig };
  const docker = args => execFileSync('docker', args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }).trim();
  const labels = JSON.parse(docker(['image', 'inspect', image, '--format', '{{json .Config.Labels}}']));
  assert.equal(labels['phoenix.fixture.kind'], 'erp-web-evidence'); assert.equal(labels['org.opencontainers.image.revision'], targetSha);
  const resources = [], ids = {};
  const persist = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  const saveResources = () => persist('resources.json', { owner, image, containers: resources, cleanupOwner: 'root agent', teardownExecuted: false });
  const ownedId = id => {
    assert.match(id, /^[a-f0-9]{64}$/);
    assert.equal(JSON.parse(docker(['inspect', id, '--format', '{{json (index .Config.Labels "phoenix.fixture.owner")}}'])), owner);
    return id;
  };
  const start = (service, command = []) => {
    const name = `phoenix-${owner}-${service}`;
    const apiOnly = service === 'api'; const database = service === 'db';
    const commandArgs = ['run', '-d', '--name', name, '--label', `phoenix.fixture.owner=${owner}`, '--label', 'phoenix.fixture.purpose=web-evidence',
      '--health-interval=1s', '--health-timeout=3s', '--health-retries=30', '--health-start-period=1s'];
    if (database) commandArgs.push('--tmpfs', '/var/lib/postgresql:rw', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_DB=web_evidence_fixture',
      '--health-cmd', 'pg_isready -U postgres -d web_evidence_fixture', '-p', '127.0.0.1::5432', 'postgres:18-alpine');
    else commandArgs.push('--restart=on-failure:1', '-e', `PHOENIX_FIXTURE_OWNER=${owner}`,
      '--health-cmd', `node -e 'fetch("http://127.0.0.1:${apiOnly ? 3100 : 3000}/${apiOnly ? 'api/readiness' : ''}").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'`,
      '-p', `127.0.0.1::${apiOnly ? 3100 : 3000}`, image, 'node', '/fixture/web-evidence-runtime.fixture.mjs', ...command);
    const id = docker(commandArgs); resources.push({ service, name, id }); saveResources(); ownedId(id); return id;
  };
  const waitHealthy = async (id, minimumRestarts = 0) => {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      ownedId(id);
      const raw = docker(['inspect', id, '--format', '{{json .State.Health.Status}}\t{{json .RestartCount}}']).split('\t').map(JSON.parse);
      if (raw[0] === 'healthy' && raw[1] >= minimumRestarts) return;
      await delay(250);
    }
    throw Error('OWNED_FIXTURE_HEALTH_TIMEOUT');
  };
  const port = (id, containerPort) => {
    const values = JSON.parse(docker(['inspect', ownedId(id), '--format', `{{json (index .NetworkSettings.Ports "${containerPort}/tcp")}}`]));
    assert.ok(values.length && values.every(x => x.HostIp === '127.0.0.1')); return values[0].HostPort;
  };
  const run = args => {
    const selected = [...args];
    if (selected[0] === 'inspect') {
      const service = selected[1].replace('phoenix-v3-', ''); assert.ok(['db', 'api', 'web'].includes(service));
      selected[1] = ownedId(ids[service]);
    } else assert.ok(selected[0] === 'image' && selected[1] === 'inspect');
    return docker(selected);
  };
  const binding = { runId: `${Date.now()}-1`, runAttempt: 1, targetSha, configFloorSha: targetSha, deployMode: 'web', evidenceSchema: evidence.MODE_EVIDENCE_SCHEMA };
  ids.api = start('api', ['--peer-only']); ids.db = start('db'); ids.web = start('web-before');
  for (const id of Object.values(ids)) await waitHealthy(id);
  const pre = evidence.captureSnapshot({ phase: 'PRE_SNAPSHOT', ...binding, floorSha: targetSha }, run);
  persist('pre.json', pre);
  ids.web = start('web-candidate'); await waitHealthy(ids.web);
  const apiUrl = `http://127.0.0.1:${port(ids.api, 3100)}/api/readiness`;
  const webUrl = `http://127.0.0.1:${port(ids.web, 3000)}`;
  const apiResponse = await fetch(apiUrl); const webResponse = await fetch(webUrl);
  assert.equal(apiResponse.status, 200); assert.equal(webResponse.status, 200); assert.match(await webResponse.text(), /<html/i);
  const post = evidence.captureSnapshot({ phase: 'POST_SNAPSHOT', ...binding, floorSha: targetSha }, run);
  const capturedAt = new Date().toISOString();
  const streams = evidence.captureDockerLogStreams({ containerId: ownedId(ids.web), startedAt: post.containers.web.startedAt, capturedAt },
    args => spawnSync('docker', args, { env, encoding: 'utf8', timeout: 20000, maxBuffer: evidence.MAX_LOG_BYTES, stdio: ['ignore', 'pipe', 'pipe'] }));
  const summaryArgs = { ...binding, floorSha: targetSha, service: 'web', containerId: ids.web, startedAt: post.containers.web.startedAt, capturedAt,
    stdout: streams.stdout, stderr: streams.stderr, readinessVerified: apiResponse.ok, webHttpVerified: webResponse.ok };
  const summary = evidence.summarizeStartupLogs(summaryArgs);
  assert.equal(summary.result, 'PASS_REDACTED_SUMMARY');
  assert.ok(summary.stdoutLineCount > 0 && summary.stderrLineCount > 0);
  assert.match(streams.stdout, /Next\.js|Next.js/); assert.match(streams.stdout, /Ready in \d+(?:\.\d+)?\s*(?:ms|s)/);
  assert.match(streams.stderr, /WEB_EVIDENCE_FIXTURE_STDERR_CHANNEL=READY/);
  const log = evidence.startupBundle(post, { web: summary });
  const files = { pre: path.join(dir, `deploy-${binding.runId}-pre-evidence.json`), post: path.join(dir, `deploy-${binding.runId}-post-evidence.json`), log: path.join(dir, `deploy-${binding.runId}-startup-evidence.json`) };
  for (const [key, value] of Object.entries({ pre, post, log })) fs.writeFileSync(files[key], JSON.stringify(value), { mode: 0o600 });
  const verified = evidence.verifyEvidenceFiles(files.pre, files.post, files.log, binding);
  assert.equal(verified.comparison.api, 'UNCHANGED'); assert.equal(verified.comparison.db, 'UNCHANGED');
  evidence.verifyLiveSnapshot(post, binding, run);
  const actual = Object.fromEntries(['api', 'web'].map(service => [service, { revision: post.containers[service].ociRevision, imageId: post.containers[service].image }]));
  assert.equal(readFormalDeploymentEvidence(dir, actual, targetSha, evidence, run).status, 'PASS');
  persist('startup-stream-proof.json', { stdoutLineCount: summary.stdoutLineCount, stderrLineCount: summary.stderrLineCount,
    actualNextReadyMarker: true, fixtureStderrChannelMarker: true, rawLogsPersisted: false, digest: summary.combinedDigest });

  // A real HTTP 503 passes through the actual ERP Next rewrite to the owned
  // loopback mock. HTTP success cannot be inherited from the earlier smoke.
  const failureResponse = await fetch(`${webUrl}/api/__fixture/http-failure`); assert.equal(failureResponse.status, 503);
  const failedSummary = evidence.summarizeStartupLogs({ ...summaryArgs, webHttpVerified: failureResponse.ok });
  assert.equal(failedSummary.result, 'UNVERIFIED_STARTUP_EVIDENCE');
  const failedFile = path.join(dir, 'http-failure-startup.json'); fs.writeFileSync(failedFile, JSON.stringify(evidence.startupBundle(post, { web: failedSummary })));
  assert.throws(() => evidence.verifyEvidenceFiles(files.pre, files.post, failedFile, binding), /STARTUP_LOG/);

  // Compare the real immutable image OCI label against a wrong approved target.
  const wrongTarget = targetSha === 'b'.repeat(40) ? 'c'.repeat(40) : 'b'.repeat(40);
  const wrong = { pre: structuredClone(pre), post: structuredClone(post), log: structuredClone(log) };
  for (const value of Object.values(wrong)) value.targetSha = wrongTarget;
  wrong.log.services.web.targetSha = wrongTarget;
  const wrongFiles = {};
  for (const [key, value] of Object.entries(wrong)) { wrongFiles[key] = path.join(dir, `wrong-oci-${key}.json`); fs.writeFileSync(wrongFiles[key], JSON.stringify(value)); }
  assert.throws(() => evidence.verifyEvidenceFiles(wrongFiles.pre, wrongFiles.post, wrongFiles.log, { ...binding, targetSha: wrongTarget }), /WEB_IDENTITY/);

  // Recreate the same actual ERP image in a second owned candidate instance.
  ids.web = start('web-recreated'); await waitHealthy(ids.web);
  const recreated = evidence.metadataFor('web', run);
  assert.equal(recreated.image, post.containers.web.image); assert.notEqual(recreated.id, post.containers.web.id);
  assert.throws(() => evidence.verifyLiveSnapshot(post, binding, run), /WEB_TOCTOU/);
  const beforeRestart = evidence.captureSnapshot({ phase: 'POST_SNAPSHOT', ...binding, floorSha: targetSha }, run);
  assert.equal(beforeRestart.containers.web.restartCount, 0);
  const restartUrl = `http://127.0.0.1:${port(ids.web, 3000)}/api/__fixture/restart`;
  const restartResponse = await fetch(restartUrl, { method: 'POST', headers: { 'x-fixture-owner': owner } }); assert.equal(restartResponse.status, 200);
  await waitHealthy(ids.web, 1);
  const afterRestart = evidence.captureSnapshot({ phase: 'POST_SNAPSHOT', ...binding, floorSha: targetSha }, run);
  assert.equal(afterRestart.containers.web.id, beforeRestart.containers.web.id);
  assert.ok(afterRestart.containers.web.restartCount >= 1); assert.notEqual(afterRestart.containers.web.startedAt, beforeRestart.containers.web.startedAt);
  assert.throws(() => evidence.verifyLiveSnapshot(beforeRestart, binding, run), /WEB_TOCTOU/);
  assert.throws(() => evidence.compareSnapshots(pre, afterRestart, 'web'), /WEB_SWITCH_BINDING/);
  persist('results.json', { result: 'PASS', targetSha, image, deployMode: 'web', apiAndDbUnchanged: true,
    realNextStartup: 'PASS', timestampedStdoutAndStderr: 'PASS', apiReadinessHttp: apiResponse.status, webHttp: webResponse.status,
    webFailureHttp: failureResponse.status, httpFailureRejected: true, wrongOciRejected: true, sameImageNewContainerRejected: true,
    restartCountBefore: beforeRestart.containers.web.restartCount, restartCountAfter: afterRestart.containers.web.restartCount,
    restartRejected: true, productionAccess: false, rawLogsPersisted: false, mockScope: 'API peer health and in-container loopback rewrite only; ERP Web is the real standalone build' });
  console.log(`WEB_EVIDENCE_REAL_NEXT_E2E=PASS ARTIFACT_DIR=${dir}`);
});
