import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dockerCommand, fixtureCreateArgs, verifyOwnedFixture, sourceManifest, runOwnedSshFixture, SSH_FIXTURE_CAPABILITIES, SSH_FIXTURE_PURPOSE } from './pinned-readonly-ssh-transport.fixture.mjs';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const manifest = { containerId: 'a'.repeat(64), imageId: 'sha256:' + 'b'.repeat(64), owner, sourceSha256: 'c'.repeat(64), name: `phoenix-ssh-fixture-${owner}` };
function actual() { return { id: manifest.containerId, imageId: manifest.imageId, owner, purpose: SSH_FIXTURE_PURPOSE, sourceSha256: manifest.sourceSha256,
  network: 'none', privileged: false, readOnly: true, capabilities: [...SSH_FIXTURE_CAPABILITIES], capDrop: ['ALL'], securityOpt: ['no-new-privileges:true'], ports: null, mounts: [] }; }
test('pure: create plan owns only network-none immutable-ID container without host mounts, published ports or credentials', () => {
  const args = fixtureCreateArgs(manifest);
  assert.deepEqual(args.slice(0, 5), ['create', '--name', manifest.name, '--network', 'none']); assert.equal(args.at(-1), manifest.imageId);
  assert.ok(args.includes('--read-only')); assert.ok(args.includes('--cap-drop')); assert.ok(args.includes('ALL')); assert.ok(args.includes('no-new-privileges:true'));
  for (const flag of ['--privileged', '--network=host', '--mount', '--volume', '-v', '--publish', '-p', '--env-file', '--env', '-e']) assert.ok(!args.includes(flag));
  assert.deepEqual(args.flatMap((value, index) => value === '--cap-add' ? [args[index + 1]] : []), ['SETUID', 'SETGID', 'SYS_CHROOT']);
});
test('pure: owner, source digest, full ID and immutable image must all match before lifecycle/cleanup', () => {
  assert.equal(verifyOwnedFixture(actual(), manifest), true);
  for (const change of [{ id: 'd'.repeat(64) }, { owner: 'other-owner' }, { sourceSha256: 'e'.repeat(64) }, { imageId: 'sha256:' + 'f'.repeat(64) }, { purpose: 'other-task' }]) assert.throws(() => verifyOwnedFixture({ ...actual(), ...change }, manifest), /NOT_EXACT_OWNED/);
});
test('pure: host networking, added capability, socket/volume mounts, published ports and writable rootfs deny', () => {
  for (const change of [{ network: 'host' }, { privileged: true }, { readOnly: false }, { capabilities: [...SSH_FIXTURE_CAPABILITIES, 'SYS_ADMIN'] }, { capDrop: [] }, { securityOpt: [] },
    { ports: { '2222/tcp': [{ HostPort: '2222' }] } }, { mounts: [{ Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock' }] },
    { mounts: [{ Type: 'volume', Destination: '/anything' }] }]) assert.throws(() => verifyOwnedFixture({ ...actual(), ...change }, manifest), /NOT_EXACT_OWNED/);
});
test('pure: source manifest includes exact source-only inputs and no environment or SSH credential files', () => {
  const source = sourceManifest(); assert.match(source.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(source.entries.map(e => e.name), ['pinned-readonly-ssh-transport.mjs', 'pinned-readonly-ssh-transport.fixture.mjs', 'pinned-readonly-ssh-transport.Dockerfile']);
  const dockerfile = fs.readFileSync(fileURLToPath(new URL('./pinned-readonly-ssh-transport.Dockerfile', import.meta.url)), 'utf8');
  assert.ok(dockerfile.includes('COPY pinned-readonly-ssh-transport.mjs pinned-readonly-ssh-transport.fixture.mjs /fixture/'));
  assert.ok(!/COPY\s+\.\s|\.env|known_hosts|\.ssh/.test(dockerfile));
});
test('pure: no Docker window authorization means no Docker command or fixture resource allocation', async () => {
  let commands = 0;
  await assert.rejects(runOwnedSshFixture({}, { docker: () => { commands++; throw new Error('SHOULD_NOT_RUN'); } }), /DOCKER_WINDOW_NOT_RELEASED/);
  assert.equal(commands, 0);
});
test('pure: fixture cannot be mistaken for production host/pin handshake or guard proof', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('./pinned-readonly-ssh-transport.fixture.mjs', import.meta.url)), 'utf8');
  assert.ok(source.includes("host: '127.0.0.1'")); assert.ok(source.includes("'root@127.0.0.1'")); assert.ok(source.includes("scope: 'SYNTHETIC_LOOPBACK_ONLY'"));
  assert.ok(source.includes('productionConnectionExecuted: false')); assert.ok(source.includes('productionRootFd9Verified: false'));
  assert.ok(!source.includes('47.236.122.224')); assert.ok(!source.includes('Y4WEXMJ24a4r1Kx'));
});

// Dependency fixtures below execute no Docker command or SSH process.
function syntheticSource() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-fixture-pure-source-'));
  for (const entry of sourceManifest().entries) fs.copyFileSync(fileURLToPath(new URL(`./${entry.name}`, import.meta.url)), path.join(directory, entry.name));
  return directory;
}
function fakeEngine(hook = () => {}) {
  const calls = []; let owner, digest, context;
  const run = (args, options) => {
    calls.push(args); hook(args, { context, calls, options });
    if (args[0] === 'build') { context = args.at(-1); owner = args.find(v => v.startsWith('phoenix.ssh-fixture.owner=')).split('=')[1]; digest = args.find(v => v.startsWith('phoenix.ssh-fixture.source=')).split('=')[1]; hook(['BUILT'], { context, calls, options }); return manifest.imageId; }
    if (args[0] === 'image') return [manifest.imageId, owner, digest].map(JSON.stringify).join('\t');
    if (args[0] === 'create') return manifest.containerId;
    if (args[0] === 'inspect') return [manifest.containerId, manifest.imageId, owner, SSH_FIXTURE_PURPOSE, digest, 'none', false, true, [...SSH_FIXTURE_CAPABILITIES], ['ALL'], ['no-new-privileges:true'], null, [], false, 0].map(JSON.stringify).join('\t');
    if (args[0] === 'start') return 'SSH_FIXTURE_RESULT=' + JSON.stringify({ scope: 'SYNTHETIC_LOOPBACK_ONLY', result: 'PASS', productionConnectionExecuted: false, productionAuthorized: false });
    if (args[0] === 'rm') return manifest.containerId;
    throw new Error('UNEXPECTED');
  };
  return { run, calls, getContext: () => context };
}
const released = { authorization: 'OWNED_LOOPBACK_TEST_WINDOW_RELEASED' };
test('pure: PASS result line followed by process exit 42 always denies, without leaking output', () => {
  const failure = Object.assign(new Error('sensitive-stderr-sentinel'), { status: 42, stdout: 'SSH_FIXTURE_RESULT={"result":"PASS"}', stderr: 'sensitive-stderr-sentinel' });
  assert.throws(() => dockerCommand(['start', '--attach', manifest.containerId], {}, () => { throw failure; }), error => error.message === 'SSH_FIXTURE_HOLD=DOCKER_OPERATION_FAILED_SANITIZED');
});
test('pure: copied context exact digest and image labels gate create, successful cleanup uses only full ID', async () => {
  const engine = fakeEngine(); const result = await runOwnedSshFixture(released, { docker: engine.run });
  assert.equal(result.cleanup, 'OWNED_CONTAINER_REMOVED'); assert.equal(result.source.sha256, result.manifest.sourceSha256);
  assert.ok(!fs.existsSync(path.dirname(engine.getContext())));
  assert.ok(engine.calls.filter(args => ['start', 'inspect', 'rm'].includes(args[0])).every(args => args.includes(manifest.containerId)));
});
test('pure: original source changes during build reject before container create and clean exclusive temp', async () => {
  const directory = syntheticSource(); const engine = fakeEngine(args => { if (args[0] === 'BUILT') fs.appendFileSync(path.join(directory, 'pinned-readonly-ssh-transport.Dockerfile'), '\n# concurrent change\n'); });
  try { await assert.rejects(runOwnedSshFixture(released, { sourceDirectory: directory, docker: engine.run }), /SOURCE_CHANGED/); assert.ok(!engine.calls.some(a => a[0] === 'create')); assert.ok(!fs.existsSync(path.dirname(engine.getContext()))); }
  finally { fs.rmSync(directory, { recursive: true }); }
});
test('pure: copied context changes during build reject before image/container admission', async () => {
  const engine = fakeEngine((args, state) => { if (args[0] === 'BUILT') { const file = path.join(state.context, 'pinned-readonly-ssh-transport.Dockerfile'); fs.chmodSync(file, 0o600); fs.appendFileSync(file, '\n# altered\n'); } });
  await assert.rejects(runOwnedSshFixture(released, { docker: engine.run }), /SOURCE_CHANGED/); assert.ok(!engine.calls.some(a => ['create', 'image'].includes(a[0])));
});
test('pure: build failure cleans temporary root and performs no container search or cleanup', async () => {
  let temporary; const calls = [];
  await assert.rejects(runOwnedSshFixture(released, { docker: (args) => { calls.push(args); temporary = path.dirname(args.at(-1)); throw new Error('sensitive-build-error'); } }), error => {
    assert.equal(error.message, 'SSH_FIXTURE_HOLD=DOCKER_OPERATION_FAILED_SANITIZED'); assert.equal(error.evidence.resourceState, 'NO_CONTAINER_ACTION'); return true;
  });
  assert.equal(calls.length, 1); assert.ok(!fs.existsSync(temporary));
});
test('pure: create exception or unknown ID preserves HOLD without name discovery or arbitrary cleanup', async () => {
  for (const mode of ['exception', 'invalid']) {
    const engine = fakeEngine(args => { if (args[0] === 'create' && mode === 'exception') throw new Error('sensitive-create-failure'); });
    const run = (args, options) => { const output = engine.run(args, options); return args[0] === 'create' && mode === 'invalid' ? 'short-id' : output; };
    await assert.rejects(runOwnedSshFixture(released, { docker: run }), error => { assert.equal(error.evidence.cleanup, 'HOLD_UNKNOWN_CONTAINER_ID_NO_CLEANUP'); assert.equal(error.evidence.resourceState, 'CREATE_ATTEMPT_UNKNOWN_ID'); return true; });
    assert.ok(!engine.calls.some(a => ['ps', 'inspect', 'rm', 'start'].includes(a[0]))); assert.ok(!fs.existsSync(path.dirname(engine.getContext())));
  }
});
test('pure: source image-label mismatch denies container creation', async () => {
  const engine = fakeEngine(); const run = (args, opts) => args[0] === 'image' ? [manifest.imageId, 'wrong-owner', manifest.sourceSha256].map(JSON.stringify).join('\t') : engine.run(args, opts);
  await assert.rejects(runOwnedSshFixture(released, { docker: run }), /IMAGE_SOURCE_OWNERSHIP/); assert.ok(!engine.calls.some(a => a[0] === 'create'));
});
test('pure: failed start cannot return PASS and exact owned container is inspected before cleanup', async () => {
  const engine = fakeEngine(args => { if (args[0] === 'start') throw Object.assign(new Error('SECRET_SENTINEL'), { status: 42, stdout: 'SSH_FIXTURE_RESULT={"result":"PASS"}' }); });
  await assert.rejects(runOwnedSshFixture(released, { docker: engine.run }), error => { assert.equal(error.message, 'SSH_FIXTURE_HOLD=DOCKER_OPERATION_FAILED_SANITIZED'); assert.equal(error.evidence.cleanup, 'OWNED_CONTAINER_REMOVED'); return true; });
  const removal = engine.calls.findIndex(a => a[0] === 'rm'); assert.equal(engine.calls[removal - 2][0], 'inspect'); assert.equal(engine.calls[removal - 1][0], 'image');
});

test('pure: CLI success with PASS stdout cannot conceal running or nonzero-exit container state', async () => {
  for (const [running, exitCode] of [[false, 42], [true, 0], [true, 42], [null, 0], [false, null]]) {
    const engine = fakeEngine();
    const run = (args, options) => {
      const output = engine.run(args, options);
      if (args[0] !== 'inspect') return output;
      const values = output.split('\t').map(JSON.parse); values[13] = running; values[14] = exitCode;
      return values.map(JSON.stringify).join('\t');
    };
    await assert.rejects(runOwnedSshFixture(released, { docker: run }), error => {
      assert.equal(error.message, 'SSH_FIXTURE_HOLD=CONTAINER_NOT_EXITED_SUCCESSFULLY');
      assert.equal(error.evidence.cleanup, 'OWNED_CONTAINER_REMOVED'); return true;
    });
    assert.ok(engine.calls.some(args => args[0] === 'start'));
  }
});

const enabled = process.env.PHOENIX_SSH_FIXTURE_DOCKER === 'run-owned-loopback-fixture'
  && process.env.PHOENIX_SSH_FIXTURE_WINDOW === 'released-by-coordinator';
test('real Docker: synthetic multi-key ED25519 success, wrong pin refusal and RSA-only no fallback', { skip: !enabled, timeout: 450000 }, async () => {
  const evidence = await runOwnedSshFixture({ authorization: 'OWNED_LOOPBACK_TEST_WINDOW_RELEASED' });
  assert.equal(evidence.result.result, 'PASS'); assert.equal(evidence.cleanup, 'OWNED_CONTAINER_REMOVED'); assert.equal(evidence.result.scope, 'SYNTHETIC_LOOPBACK_ONLY');
  assert.equal(evidence.result.productionConnectionExecuted, false); assert.equal(evidence.result.productionAuthorized, false); assert.equal(evidence.result.productionRootFd9Verified, false);
  const [success, wrongPin, rsaOnly] = evidence.result.cases;
  assert.equal(success.hostKeyAlgorithm, 'ssh-ed25519'); assert.equal(success.remoteCommandExecuted, true);
  assert.equal(wrongPin.failureClass, 'HOST_KEY_MISMATCH'); assert.equal(wrongPin.remoteCommandExecuted, false);
  assert.equal(rsaOnly.failureClass, 'NO_MATCHING_HOST_KEY_ALGORITHM'); assert.equal(rsaOnly.remoteCommandExecuted, false);
  // Only the allowlisted synthetic result may be emitted. Never raw tool logs,
  // key file contents, command output, production metadata or credentials.
  console.log('OWNED_SSH_FIXTURE_EVIDENCE=' + JSON.stringify(evidence));
});
