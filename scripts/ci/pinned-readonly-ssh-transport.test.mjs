import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as transport from './pinned-readonly-ssh-transport.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
// Public host material only. Read-only local ssh-keygen -F selection and -l
// confirmed this ED25519 public fingerprint against the existing approved pin.
// No private key is present, loaded, generated or printed by these tests.
const approvedPublicHostKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDJlcVNXdq35Ju39WInV2am1gid6raMkWzDZr2GUyd38';
const payload = '# original approved remote payload bytes\nset -Eeuo pipefail\nset +x\n# original root/trusted-path/FD9 guard remains here\n';
function options() { return { publicHostKey: approvedPublicHostKey, username: 'root', identityFile: '/tmp/approved-runner/identity', knownHostsFile: '/tmp/approved-runner/known_hosts',
  runnerTemporaryDirectory: '/tmp/approved-runner', credentialOrigin: 'EXISTING_PROTECTED_PRODUCTION_ENTRY', remotePayload: payload, approvedPayloadSha256: digest(payload) }; }
function syntheticPublicKey(byte = 0) {
  const blob = Buffer.concat([Buffer.from([0, 0, 0, 11]), Buffer.from('ssh-ed25519'), Buffer.from([0, 0, 0, 32]), Buffer.alloc(32, byte)]);
  return { line: 'ssh-ed25519 ' + blob.toString('base64'), fingerprint: 'SHA256:' + createHash('sha256').update(blob).digest('base64').replace(/=+$/, '') };
}
test('approved public ED25519 material matches the fixed production pin without a connection', () => {
  const parsed = transport.validateEd25519PublicHostKey(approvedPublicHostKey, transport.READONLY_SSH_FINGERPRINT);
  assert.equal(parsed.algorithm, 'ssh-ed25519'); assert.equal(parsed.fingerprint, 'SHA256:Y4WEXMJ24a4r1KxOw0det4qcCFNxj65mZeIG9oQOJcI');
});
test('plan forces only ED25519 host key and strict known_hosts on the fixed endpoint', () => {
  const plan = transport.buildPinnedReadonlySshTransportPlan(options());
  assert.equal(plan.executable, '/usr/bin/ssh'); assert.ok(plan.args.includes('-oHostKeyAlgorithms=ssh-ed25519')); assert.ok(plan.args.includes('-oStrictHostKeyChecking=yes'));
  assert.ok(plan.args.includes('-oGlobalKnownHostsFile=/dev/null')); assert.ok(plan.args.includes('-oVerifyHostKeyDNS=no')); assert.ok(plan.args.includes('-oUpdateHostKeys=no'));
  assert.deepEqual(plan.args.slice(-4), ['--', 'root@47.236.122.224', 'bash', '-se']); assert.equal(plan.knownHostsLine, `47.236.122.224 ${approvedPublicHostKey}\n`);
  assert.equal(plan.stdin, payload); assert.equal(plan.payloadSha256, digest(payload));
});
test('unknown extra host/pin/proxy/SSH options are rejected rather than forwarded or silently ignored', () => {
  for (const [key, value] of [['host', '127.0.0.1'], ['fingerprint', syntheticPublicKey().fingerprint], ['port', 2222], ['proxy', 'jump'], ['proxy_host', 'jump'], ['ssh_args', '-oStrictHostKeyChecking=no'], ['execute', () => true]]) {
    assert.throws(() => transport.buildPinnedReadonlySshTransportPlan({ ...options(), [key]: value }), /UNREVIEWED_TRANSPORT_OPTION/);
  }
});
test('synthetic public wire material can be parsed generically but cannot override production pin', () => {
  const synthetic = syntheticPublicKey(1); assert.equal(transport.validateEd25519PublicHostKey(synthetic.line, synthetic.fingerprint).fingerprint, synthetic.fingerprint);
  assert.throws(() => transport.buildPinnedReadonlySshTransportPlan({ ...options(), publicHostKey: synthetic.line }), /APPROVED_HOST_FINGERPRINT_MISMATCH/);
});
test('RSA/ECDSA/host certificate, multiline known_hosts and malformed SSH wire formats deny', () => {
  const key = syntheticPublicKey();
  for (const material of [key.line.replace('ssh-ed25519 ', 'ssh-rsa '), key.line.replace('ssh-ed25519 ', 'ecdsa-sha2-nistp256 '), key.line.replace('ssh-ed25519 ', 'ssh-ed25519-cert-v01@openssh.com '),
    key.line + '\n' + key.line, '47.236.122.224 ' + key.line, key.line + ' comment', 'ssh-ed25519 AAAA', key.line.slice(0, -1), key.line + '=']) assert.throws(() => transport.validateEd25519PublicHostKey(material, key.fingerprint));
});
test('client authentication cannot fall back to local alias, agent, password, ambient config or proxy', () => {
  const plan = transport.buildPinnedReadonlySshTransportPlan(options());
  for (const option of ['-oIdentityAgent=none', '-oIdentitiesOnly=yes', '-oPasswordAuthentication=no', '-oKbdInteractiveAuthentication=no', '-oBatchMode=yes', '-oProxyCommand=none', '-oProxyJump=none', '-oControlMaster=no', '-oControlPath=none']) assert.ok(plan.args.includes(option));
  assert.deepEqual(plan.args.slice(0, 2), ['-F', '/dev/null']);
  for (const changes of [{ username: undefined }, { username: 'phoenix-codex-deploy' }, { username: 'root;id' }, { credentialOrigin: 'LOCAL_ALIAS' },
    { identityFile: '/home/jinhuit/.ssh/phoenix_prod_codex' }, { identityFile: '/tmp/other/key' }, { identityFile: '/tmp/approved-runner/../key' }, { knownHostsFile: '/dev/null' },
    { knownHostsFile: '/tmp/approved-runner/%h' }, { knownHostsFile: '/tmp/approved-runner/first second' }, { identityFile: '/tmp/approved-runner/${HOME}' }]) {
    assert.throws(() => transport.buildPinnedReadonlySshTransportPlan({ ...options(), ...changes }));
  }
});
test('remote audit bytes are preserved exactly; mismatched hash or empty payload cannot be transported', () => {
  const p = options(); assert.equal(transport.buildPinnedReadonlySshTransportPlan(p).stdin, p.remotePayload);
  for (const changes of [{ remotePayload: '' }, { remotePayload: payload + '\n' }, { approvedPayloadSha256: '0'.repeat(64) }, { knownHostsFile: p.identityFile }]) assert.throws(() => transport.buildPinnedReadonlySshTransportPlan({ ...p, ...changes }));
});
test('a root username and correct host pin do not manufacture identity, root/FD9, authorization or recovery proof', () => {
  const plan = transport.buildPinnedReadonlySshTransportPlan(options());
  assert.equal(plan.productionAuthorized, false); assert.equal(plan.productionConnectionExecuted, false); assert.equal(plan.productionRecoveryVerified, false);
  assert.equal(plan.protectedIdentityVerification, 'UNVERIFIED_REQUIRES_EXISTING_PROTECTED_ENTRY'); assert.equal(plan.remoteRootTrustedPathsFd9Verification, 'UNVERIFIED_REQUIRES_ORIGINAL_REMOTE_GUARD');
  assert.equal(plan.runnerFileMetadataVerification, 'UNVERIFIED_PURE_PLAN'); assert.equal(Object.hasOwn(transport, 'execute'), false); assert.equal(Object.hasOwn(transport, 'connect'), false);
});
test('hold errors never echo supplied credential paths, payload contents or malformed public material', () => {
  const secret = 'SENSITIVE_SENTINEL_DO_NOT_ECHO';
  assert.throws(() => transport.buildPinnedReadonlySshTransportPlan({ ...options(), remotePayload: secret }), e => !e.message.includes(secret) && /^PINNED_READONLY_SSH_HOLD=/.test(e.message));
  assert.throws(() => transport.validateEd25519PublicHostKey(secret, transport.READONLY_SSH_FINGERPRINT), e => !e.message.includes(secret));
});

test('actual OpenSSH resolves the planned algorithms and identity policy without connecting', t => {
  if (!fs.existsSync('/usr/bin/ssh')) { t.skip('NOT_RUN: OpenSSH client unavailable'); return; }
  const plan = transport.buildPinnedReadonlySshTransportPlan(options());
  const result = spawnSync(plan.executable, ['-G', ...plan.args], { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin' } });
  assert.equal(result.status, 0, 'OpenSSH configuration resolution failed');
  const config = new Map(result.stdout.trim().split('\n').map(line => { const split = line.indexOf(' '); return [line.slice(0, split), line.slice(split + 1)]; }));
  assert.equal(config.get('hostname'), transport.READONLY_SSH_HOST);
  assert.equal(config.get('hostkeyalgorithms'), 'ssh-ed25519');
  assert.equal(config.get('stricthostkeychecking'), 'true');
  assert.equal(config.get('identityagent'), 'none');
  assert.equal(config.get('identitiesonly'), 'yes');
  assert.equal(config.get('passwordauthentication'), 'no');
  assert.equal(config.get('userknownhostsfile'), options().knownHostsFile);
});
