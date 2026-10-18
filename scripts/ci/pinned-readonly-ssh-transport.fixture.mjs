/** Owned loopback-only synthetic SSH integration. Not production transport.
 * Importing this module executes no Docker/SSH action. No private key is read by
 * JavaScript: only ssh-keygen, ssh and sshd consume synthetic private files. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { validateEd25519PublicHostKey } from './pinned-readonly-ssh-transport.mjs';

export const SSH_FIXTURE_PURPOSE = 'owned-synthetic-ssh-hostkey-integration';
export const SSH_FIXTURE_CAPABILITIES = Object.freeze(['SETUID', 'SETGID', 'SYS_CHROOT']);
const KEY = /^[a-f0-9]{64}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = reason => { throw new Error(`SSH_FIXTURE_HOLD=${reason}`); };
const commandEnv = Object.freeze({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C', LC_ALL: 'C', DOCKER_HOST: 'unix:///var/run/docker.sock' });
const filenames = ['pinned-readonly-ssh-transport.mjs', 'pinned-readonly-ssh-transport.fixture.mjs', 'pinned-readonly-ssh-transport.Dockerfile'];

export function sourceManifest(directory = path.dirname(fileURLToPath(import.meta.url))) {
  const entries = filenames.map(name => {
    const fd = fs.openSync(path.join(directory, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try { if (!fs.fstatSync(fd).isFile() || fs.fstatSync(fd).size > 1024 * 1024) fail('SOURCE_FILE_TYPE'); return { name, sha256: sha(fs.readFileSync(fd)) }; } finally { fs.closeSync(fd); }
  });
  return { schema: 'phoenix.synthetic-ssh-source/v1', entries, sha256: sha(JSON.stringify(entries)) };
}
export function fixtureCreateArgs({ imageId, owner, sourceSha256, name }) {
  if (!IMAGE.test(imageId) || !/^[a-f0-9-]{36}$/.test(owner) || !KEY.test(sourceSha256) || name !== `phoenix-ssh-fixture-${owner}`) fail('OWNERSHIP_MANIFEST');
  return ['create', '--name', name, '--network', 'none', '--read-only', '--tmpfs', '/run:rw,nosuid,nodev,noexec,size=16m,mode=0755',
    '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777', '--cap-drop', 'ALL', ...SSH_FIXTURE_CAPABILITIES.flatMap(cap => ['--cap-add', cap]),
    '--security-opt', 'no-new-privileges:true', '--pids-limit', '64', '--memory', '256m', '--cpus', '1', '--user', '0:0',
    '--label', `phoenix.ssh-fixture.owner=${owner}`, '--label', `phoenix.ssh-fixture.purpose=${SSH_FIXTURE_PURPOSE}`,
    '--label', `phoenix.ssh-fixture.source=${sourceSha256}`, imageId];
}
export function verifyOwnedFixture(actual, manifest) {
  if (!actual || !KEY.test(manifest?.containerId) || actual.id !== manifest.containerId || actual.imageId !== manifest.imageId || !IMAGE.test(actual.imageId)
    || actual.owner !== manifest.owner || actual.purpose !== SSH_FIXTURE_PURPOSE || actual.sourceSha256 !== manifest.sourceSha256
    || actual.network !== 'none' || actual.privileged !== false || actual.readOnly !== true || !Array.isArray(actual.capabilities)
    || actual.capabilities.map(cap => typeof cap === 'string' ? cap.replace(/^CAP_/, '') : '').sort().join(',') !== [...SSH_FIXTURE_CAPABILITIES].sort().join(',') || !Array.isArray(actual.capDrop) || !actual.capDrop.includes('ALL')
    || !Array.isArray(actual.securityOpt) || !actual.securityOpt.includes('no-new-privileges:true')
    || (actual.ports !== null && (!actual.ports || Object.keys(actual.ports).length)) || !Array.isArray(actual.mounts)
    || actual.mounts.some(m => m.Type !== 'tmpfs' || !['/run', '/tmp'].includes(m.Destination))) fail('CONTAINER_NOT_EXACT_OWNED_ISOLATION');
  return true;
}
export function dockerCommand(args, options = {}, execute = execFileSync) {
  try { return execute('/usr/bin/docker', args, { encoding: 'utf8', env: { ...commandEnv, ...(options.dockerConfig ? { DOCKER_CONFIG: options.dockerConfig } : {}) }, timeout: options.timeoutMs || 10000,
    maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (error) {
    fail('DOCKER_OPERATION_FAILED_SANITIZED');
  }
}
function inspectOwned(manifest, run, { requireExited = false } = {}) {
  const template = ['.Id', '.Image', '(index .Config.Labels "phoenix.ssh-fixture.owner")', '(index .Config.Labels "phoenix.ssh-fixture.purpose")',
    '(index .Config.Labels "phoenix.ssh-fixture.source")', '.HostConfig.NetworkMode', '.HostConfig.Privileged', '.HostConfig.ReadonlyRootfs', '.HostConfig.CapAdd', '.HostConfig.CapDrop', '.HostConfig.SecurityOpt', '.HostConfig.PortBindings', '.Mounts', '.State.Running', '.State.ExitCode'].map(s => `{{json ${s}}}`).join('\t');
  const values = run(['inspect', manifest.containerId, '--format', template]).split('\t').map(JSON.parse);
  const [id, imageId, owner, purpose, sourceSha256, network, privileged, readOnly, capabilities, capDrop, securityOpt, ports, mounts, running, exitCode] = values;
  verifyOwnedFixture({ id, imageId, owner, purpose, sourceSha256, network, privileged, readOnly, capabilities, capDrop, securityOpt, ports, mounts }, manifest);
  if (requireExited && (running !== false || exitCode !== 0)) fail('CONTAINER_NOT_EXITED_SUCCESSFULLY');
  return { running, exitCode };
}

function verifySource(directory, source) {
  if (sourceManifest(directory).sha256 !== source.sha256) fail('SOURCE_CHANGED');
}
function inspectImage(manifest, run) {
  const template = '{{json .Id}}\t{{json (index .Config.Labels "phoenix.ssh-fixture.owner")}}\t{{json (index .Config.Labels "phoenix.ssh-fixture.source")}}';
  const [id, owner, sourceSha256] = run(['image', 'inspect', manifest.imageId, '--format', template]).split('\t').map(JSON.parse);
  if (id !== manifest.imageId || owner !== manifest.owner || sourceSha256 !== manifest.sourceSha256) fail('IMAGE_SOURCE_OWNERSHIP');
}
function cleanupTemporary(temporary, original) {
  const current = fs.lstatSync(temporary);
  if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== original.dev || current.ino !== original.ino || current.uid !== original.uid) fail('TEMPORARY_OWNERSHIP');
  if (fs.existsSync(path.join(temporary, 'context'))) { const context = fs.lstatSync(path.join(temporary, 'context')); if (!context.isDirectory() || context.isSymbolicLink() || context.uid !== original.uid) fail('TEMPORARY_OWNERSHIP'); fs.chmodSync(path.join(temporary, 'context'), 0o700); }
  fs.rmSync(temporary, { recursive: true });
}

/** Explicit test-window entry only. Copy immutable public inputs into a private,
 * exclusive context. No name discovery or nonzero-exit result acceptance. */
export async function runOwnedSshFixture({ authorization } = {}, dependencies = {}) {
  if (authorization !== 'OWNED_LOOPBACK_TEST_WINDOW_RELEASED') fail('DOCKER_WINDOW_NOT_RELEASED');
  const rawDocker = dependencies.docker || dockerCommand, directory = dependencies.sourceDirectory || path.dirname(fileURLToPath(import.meta.url));
  const source = sourceManifest(directory), owner = randomUUID();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-owned-ssh-build-')); fs.chmodSync(temporary, 0o700);
  const original = fs.lstatSync(temporary), context = path.join(temporary, 'context'), dockerConfig = path.join(temporary, '.docker-config');
  const manifest = { schema: 'phoenix.owned-synthetic-ssh/v1', owner, sourceSha256: source.sha256, name: `phoenix-ssh-fixture-${owner}` };
  let resourceState = 'NO_CONTAINER_ACTION', result, cleanup = 'NOT_RUN', failure;
  const run = (args, options = {}) => { try { return rawDocker(args, { ...options, dockerConfig }); } catch { fail('DOCKER_OPERATION_FAILED_SANITIZED'); } };
  try {
    fs.mkdirSync(context, { mode: 0o700 }); fs.mkdirSync(dockerConfig, { mode: 0o700 });
    // Only public files; create-only destination and exact frozen-byte digest.
    for (const entry of source.entries) {
      const input = path.join(directory, entry.name), fd = fs.openSync(input, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      let bytes;
      try { const before = fs.fstatSync(fd); if (!before.isFile() || before.size > 1024 * 1024) fail('SOURCE_FILE_TYPE'); bytes = fs.readFileSync(fd); const after = fs.fstatSync(fd);
        if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || sha(bytes) !== entry.sha256) fail('SOURCE_CHANGED');
      } finally { fs.closeSync(fd); }
      fs.writeFileSync(path.join(context, entry.name), bytes, { mode: 0o400, flag: 'wx' });
    }
    fs.chmodSync(context, 0o500); verifySource(context, source); verifySource(directory, source);
    const built = run(['build', '--quiet', '--label', `phoenix.ssh-fixture.source=${source.sha256}`, '--label', `phoenix.ssh-fixture.owner=${owner}`,
      '--file', path.join(context, 'pinned-readonly-ssh-transport.Dockerfile'), context], { timeoutMs: 300000 });
    if (!IMAGE.test(built)) fail('IMMUTABLE_IMAGE_ID_REQUIRED'); manifest.imageId = built;
    verifySource(context, source); verifySource(directory, source); inspectImage(manifest, run);
    // A create failure may have created an unknown container. Never search by name.
    resourceState = 'CREATE_ATTEMPT_UNKNOWN_ID';
    const created = run(fixtureCreateArgs(manifest));
    if (!KEY.test(created)) fail('FULL_CREATED_CONTAINER_ID_REQUIRED');
    manifest.containerId = created; resourceState = 'KNOWN_FULL_ID';
    inspectOwned(manifest, run); inspectImage(manifest, run); verifySource(context, source); verifySource(directory, source);
    const output = run(['start', '--attach', manifest.containerId], { timeoutMs: 90000 });
    // CLI success and a PASS line are insufficient: independently inspect the
    // exact owned container's terminal state before accepting its evidence.
    inspectOwned(manifest, run, { requireExited: true }); inspectImage(manifest, run); verifySource(context, source); verifySource(directory, source);
    const lines = output.split('\n').filter(row => row.startsWith('SSH_FIXTURE_RESULT=')); if (lines.length !== 1) fail('ALLOWLISTED_RESULT_REQUIRED');
    result = JSON.parse(lines[0].slice('SSH_FIXTURE_RESULT='.length));
    if (result.scope !== 'SYNTHETIC_LOOPBACK_ONLY' || result.productionConnectionExecuted !== false || result.productionAuthorized !== false || result.result !== 'PASS') fail('RESULT_SCOPE_OR_FAILURE');
  } catch (error) { failure = error; }
  finally {
    if (manifest.containerId) {
      try { inspectOwned(manifest, run); inspectImage(manifest, run); run(['rm', '--force', manifest.containerId]); cleanup = 'OWNED_CONTAINER_REMOVED'; resourceState = 'KNOWN_CONTAINER_REMOVED'; }
      catch { cleanup = 'HOLD_OWNERSHIP_OR_CLEANUP_FAILED'; failure ||= new Error('SSH_FIXTURE_HOLD=OWNED_CLEANUP_FAILED'); }
    } else cleanup = resourceState === 'CREATE_ATTEMPT_UNKNOWN_ID' ? 'HOLD_UNKNOWN_CONTAINER_ID_NO_CLEANUP' : 'NO_KNOWN_CONTAINER';
    try { cleanupTemporary(temporary, original); } catch { failure ||= new Error('SSH_FIXTURE_HOLD=TEMPORARY_CLEANUP_FAILED'); }
  }
  if (failure) {
    const error = new Error(/^SSH_FIXTURE_HOLD=[A-Z_]+$/.test(failure.message) ? failure.message : 'SSH_FIXTURE_HOLD=OPERATION_FAILED_SANITIZED');
    error.evidence = { manifest, resourceState, cleanup, productionConnectionExecuted: false, productionAuthorized: false }; throw error;
  }
  return { schema: 'phoenix.synthetic-ssh-integration/v1', manifest, source, result, cleanup, productionConnectionExecuted: false, productionAuthorized: false };
}

function sshTool(binary, args, { input, timeout = 10000 } = {}) {
  try { return { status: 0, stdout: execFileSync(binary, args, { encoding: 'utf8', input, timeout, maxBuffer: 256 * 1024, env: commandEnv, stdio: ['pipe', 'pipe', 'pipe'] }), stderr: '' }; }
  catch (error) { return { status: Number.isInteger(error.status) ? error.status : 255, stdout: typeof error.stdout === 'string' ? error.stdout : error.stdout?.toString('utf8') || '', stderr: typeof error.stderr === 'string' ? error.stderr : error.stderr?.toString('utf8') || '' }; }
}
function publicMaterial(file) {
  if (!file.endsWith('.pub')) fail('PUBLIC_FILE_ONLY');
  return fs.readFileSync(file, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
}
function publicFingerprint(file) {
  if (!file.endsWith('.pub')) fail('PUBLIC_FILE_ONLY');
  const result = sshTool('/usr/bin/ssh-keygen', ['-l', '-E', 'sha256', '-f', file]);
  const match = /^\d+ (SHA256:[A-Za-z0-9+/]{43})\s/m.exec(result.stdout); if (result.status || !match) fail('PUBLIC_FINGERPRINT_UNAVAILABLE'); return match[1];
}
async function waitReady(server, port) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) fail('SSHD_EXITED_BEFORE_READY');
    const ready = await new Promise(resolve => { const socket = net.createConnection({ host: '127.0.0.1', port }); const finish = value => { socket.destroy(); resolve(value); }; socket.setTimeout(200, () => finish(false)); socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); });
    if (ready) return; await new Promise(resolve => setTimeout(resolve, 50));
  }
  fail('LOOPBACK_SSHD_READY_TIMEOUT');
}
async function stopServer(server) {
  if (server.exitCode !== null || server.signalCode !== null) return;
  server.kill('SIGTERM');
  await new Promise(resolve => { const timer = setTimeout(() => { server.kill('SIGKILL'); resolve(); }, 1000); server.once('exit', () => { clearTimeout(timer); resolve(); }); });
}
async function handshakeCase({ directory, name, hostKeys, expectedPublic, expectedFingerprint, clientKey, expectation }) {
  const port = 2222, known = path.join(directory, `known-${name}`), marker = path.join(directory, `marker-${name}`), config = path.join(directory, `sshd-${name}.conf`);
  validateEd25519PublicHostKey(expectedPublic, expectedFingerprint);
  fs.writeFileSync(known, `[127.0.0.1]:${port} ${expectedPublic}\n`, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(config, [`Port ${port}`, 'ListenAddress 127.0.0.1', `PidFile ${path.join(directory, `sshd-${name}.pid`)}`, ...hostKeys.map(file => `HostKey ${file}`), 'UsePAM no', 'PermitRootLogin yes',
    `AuthorizedKeysFile ${clientKey}.pub`, 'StrictModes yes', 'PasswordAuthentication no', 'KbdInteractiveAuthentication no', 'ChallengeResponseAuthentication no', 'AuthenticationMethods publickey',
    'AllowAgentForwarding no', 'AllowTcpForwarding no', 'X11Forwarding no', 'PermitTunnel no', 'PermitTTY no', 'PrintMotd no', 'PrintLastLog no', 'LogLevel ERROR', 'MaxStartups 4', 'MaxSessions 2'].join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  const preflight = sshTool('/usr/sbin/sshd', ['-t', '-f', config]); if (preflight.status) fail('SYNTHETIC_SSHD_CONFIGURATION');
  const server = spawn('/usr/sbin/sshd', ['-D', '-e', '-f', config], { env: commandEnv, stdio: ['ignore', 'ignore', 'pipe'] }); let log = ''; let logTruncated = false;
  server.stderr.on('data', bytes => { if (log.length + bytes.length > 128 * 1024) logTruncated = true; else log += bytes.toString('utf8'); }); server.on('error', () => { logTruncated = true; });
  try {
    await waitReady(server, port);
    const args = ['-vv', '-F', '/dev/null', '-T', '-oBatchMode=yes', '-oIdentitiesOnly=yes', '-oIdentityAgent=none', '-oPasswordAuthentication=no', '-oKbdInteractiveAuthentication=no',
      '-oHostKeyAlgorithms=ssh-ed25519', '-oStrictHostKeyChecking=yes', `-oUserKnownHostsFile=${known}`, '-oGlobalKnownHostsFile=/dev/null', '-oVerifyHostKeyDNS=no', '-oUpdateHostKeys=no',
      '-oProxyCommand=none', '-oProxyJump=none', '-oConnectionAttempts=1', '-oConnectTimeout=3', '-p', String(port), '-i', clientKey, '--', 'root@127.0.0.1', 'sh', '-se'];
    const nonce = randomUUID().replaceAll('-', ''); const command = `test ! -e '${marker}'\ntouch '${marker}'\nprintf '%s\\n' '${nonce}'\n`;
    // execFileSync returns successful stderr separately only through spawnSync;
    // use the same fixed SSH command with a tiny wrapper that retains no raw log.
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync('/usr/bin/ssh', args, { input: command, encoding: 'utf8', timeout: 10000, maxBuffer: 256 * 1024, env: commandEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    const stderr = result.stderr || ''; const selected = /Server host key: ([a-z0-9@.-]+) (SHA256:[A-Za-z0-9+/]{43})/.exec(stderr);
    const executed = fs.existsSync(marker);
    const failureClass = /REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed|No ED25519 host key is known/.test(stderr) ? 'HOST_KEY_MISMATCH'
      : /no matching host key type found/i.test(stderr) ? 'NO_MATCHING_HOST_KEY_ALGORITHM' : result.status === 0 ? 'NONE' : 'UNEXPECTED_SANITIZED_FAILURE';
    const passed = !logTruncated && (expectation === 'ED25519_SUCCESS' ? result.status === 0 && executed && result.stdout.trim() === nonce && selected?.[1] === 'ssh-ed25519' && selected[2] === expectedFingerprint
      : expectation === 'WRONG_PIN_DENIED' ? result.status !== 0 && !executed && failureClass === 'HOST_KEY_MISMATCH'
        : expectation === 'RSA_ONLY_DENIED' && result.status !== 0 && !executed && failureClass === 'NO_MATCHING_HOST_KEY_ALGORITHM');
    return { name, expectation, result: passed ? 'PASS' : 'FAIL', sshExitCode: Number.isInteger(result.status) ? result.status : 'UNVERIFIED', hostKeyAlgorithm: selected?.[1] || 'NONE',
      fingerprintMatchedSyntheticApproval: selected ? selected[2] === expectedFingerprint : false, remoteCommandExecuted: executed, failureClass, stderrSha256: sha(stderr), serverLogSha256: sha(log), serverLogTruncated: logTruncated };
  } finally { await stopServer(server); }
}
export async function insideOwnedFixture() {
  // The host-side full-ID inspection is required too. These checks are not a
  // substitute for the production guard or proof of a trusted production entry.
  if (process.getuid() !== 0 || !fs.existsSync('/.dockerenv')) fail('OWNED_CONTAINER_REQUIRED');
  fs.mkdirSync('/run/sshd', { recursive: true, mode: 0o755 });
  const directory = fs.mkdtempSync('/run/ssh-transport-fixture-'); fs.chmodSync(directory, 0o700);
  const generate = (name, type, extra = []) => { const file = path.join(directory, name); if (sshTool('/usr/bin/ssh-keygen', ['-q', '-t', type, ...extra, '-N', '', '-f', file]).status) fail('SYNTHETIC_KEY_GENERATION'); return file; };
  const ed = generate('host-ed25519', 'ed25519'), rsa = generate('host-rsa', 'rsa', ['-b', '2048']), ecdsa = generate('host-ecdsa', 'ecdsa', ['-b', '256']);
  const wrong = generate('wrong-ed25519', 'ed25519'), client = generate('client-ed25519', 'ed25519');
  const edPublic = publicMaterial(ed + '.pub'), edFingerprint = publicFingerprint(ed + '.pub'); const wrongPublic = publicMaterial(wrong + '.pub'), wrongFingerprint = publicFingerprint(wrong + '.pub');
  const cases = [];
  cases.push(await handshakeCase({ directory, name: 'multiple-hostkeys', hostKeys: [rsa, ecdsa, ed], expectedPublic: edPublic, expectedFingerprint: edFingerprint, clientKey: client, expectation: 'ED25519_SUCCESS' }));
  cases.push(await handshakeCase({ directory, name: 'wrong-pin', hostKeys: [rsa, ecdsa, ed], expectedPublic: wrongPublic, expectedFingerprint: wrongFingerprint, clientKey: client, expectation: 'WRONG_PIN_DENIED' }));
  cases.push(await handshakeCase({ directory, name: 'rsa-only', hostKeys: [rsa], expectedPublic: edPublic, expectedFingerprint: edFingerprint, clientKey: client, expectation: 'RSA_ONLY_DENIED' }));
  return { schema: 'phoenix.synthetic-loopback-ssh/v1', scope: 'SYNTHETIC_LOOPBACK_ONLY', result: cases.every(c => c.result === 'PASS') ? 'PASS' : 'FAIL', cases,
    publicMaterials: 'SYNTHETIC_ONLY', productionConnectionExecuted: false, productionAuthorized: false, productionRootFd9Verified: false, productionRecoveryVerified: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).join(' ') !== '--inside-owned-fixture') { console.error('SSH_FIXTURE_HOLD=EXPLICIT_CONTAINER_ENTRY_REQUIRED'); process.exitCode = 1; }
  else { try { const result = await insideOwnedFixture(); console.log('SSH_FIXTURE_RESULT=' + JSON.stringify(result)); if (result.result !== 'PASS') process.exitCode = 1; }
    catch { console.error('SSH_FIXTURE_HOLD=ISOLATED_HANDSHAKE_FAILED_SANITIZED'); process.exitCode = 1; } }
}
