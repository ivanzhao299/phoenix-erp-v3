/** Pure transport planner, not a production connection or authority producer.
 * The protected caller must retain its real identity, file metadata checks,
 * approved payload, remote root/trusted-path/FD9 guard and execution receipts. */
import path from 'node:path';
import { createHash } from 'node:crypto';

export const READONLY_SSH_HOST = '47.236.122.224';
export const READONLY_SSH_PORT = 22;
export const READONLY_SSH_FINGERPRINT = 'SHA256:Y4WEXMJ24a4r1KxOw0det4qcCFNxj65mZeIG9oQOJcI';
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = reason => { throw new Error(`PINNED_READONLY_SSH_HOLD=${reason}`); };
const fingerprintPattern = /^SHA256:[A-Za-z0-9+/]{43}$/;
const approvedFields = new Set(['publicHostKey', 'username', 'identityFile', 'knownHostsFile', 'runnerTemporaryDirectory', 'credentialOrigin', 'remotePayload', 'approvedPayloadSha256']);

/** Parse public bytes only. This function does not read a private key, scan a
 * host, trust an endpoint, authenticate a user or authorize a connection. */
export function validateEd25519PublicHostKey(material, expectedFingerprint) {
  if (typeof material !== 'string' || material.length > 1024 || typeof expectedFingerprint !== 'string' || !fingerprintPattern.test(expectedFingerprint)) fail('PUBLIC_KEY_AND_APPROVED_FINGERPRINT_REQUIRED');
  const match = /^ssh-ed25519 ([A-Za-z0-9+/]+={0,2})$/.exec(material.trim());
  if (!match) fail('ED25519_PUBLIC_KEY_MATERIAL_REQUIRED');
  const blob = Buffer.from(match[1], 'base64');
  if (blob.toString('base64') !== match[1] || blob.length !== 51 || blob.readUInt32BE(0) !== 11 || blob.subarray(4, 15).toString('ascii') !== 'ssh-ed25519'
    || blob.readUInt32BE(15) !== 32 || blob.subarray(19).length !== 32) fail('INVALID_ED25519_PUBLIC_KEY_WIRE_FORMAT');
  const fingerprint = 'SHA256:' + createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
  if (fingerprint !== expectedFingerprint) fail('APPROVED_HOST_FINGERPRINT_MISMATCH');
  return Object.freeze({ algorithm: 'ssh-ed25519', publicKey: `ssh-ed25519 ${match[1]}`, fingerprint, publicBlobSha256: digest(blob) });
}
function containedTemporaryFile(file, directory) {
  if (typeof file !== 'string' || typeof directory !== 'string' || !path.isAbsolute(file) || !path.isAbsolute(directory)
    || path.normalize(file) !== file || path.normalize(directory) !== directory || directory === '/' || !/^\/[A-Za-z0-9_./-]+$/.test(file)
    || !/^\/[A-Za-z0-9_./-]+$/.test(directory)) fail('EXPLICIT_RUNNER_TEMPORARY_FILES_REQUIRED');
  const relative = path.relative(directory, file);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) fail('IDENTITY_AND_KNOWN_HOSTS_MUST_BE_RUNNER_TEMPORARY');
  return file;
}

/** Configuration candidate only. It intentionally exports no execute method.
 * Neither the real endpoint nor its approved pin can be overridden by callers.
 * Unknown extra options are rejected, rather than passed to an SSH subprocess. */
export function buildPinnedReadonlySshTransportPlan(options) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(key => !approvedFields.has(key))) fail('UNREVIEWED_TRANSPORT_OPTION');
  const { publicHostKey, username, identityFile, knownHostsFile, runnerTemporaryDirectory, credentialOrigin, remotePayload, approvedPayloadSha256 } = options;
  if (typeof username !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/.test(username) || username === 'phoenix-codex-deploy'
    || credentialOrigin !== 'EXISTING_PROTECTED_PRODUCTION_ENTRY') fail('EXPLICIT_EXISTING_PROTECTED_IDENTITY_REQUIRED');
  containedTemporaryFile(identityFile, runnerTemporaryDirectory); containedTemporaryFile(knownHostsFile, runnerTemporaryDirectory);
  if (identityFile === knownHostsFile || /^\/home\/jinhuit\/(?:\.ssh|\.config)(?:\/|$)/.test(identityFile)) fail('LOCAL_OR_AMBIGUOUS_IDENTITY_FORBIDDEN');
  if (typeof remotePayload !== 'string' || Buffer.byteLength(remotePayload) < 1 || Buffer.byteLength(remotePayload) > 1024 * 1024
    || !/^[a-f0-9]{64}$/.test(approvedPayloadSha256 || '') || digest(Buffer.from(remotePayload, 'utf8')) !== approvedPayloadSha256) fail('EXACT_APPROVED_REMOTE_PAYLOAD_REQUIRED');
  const hostKey = validateEd25519PublicHostKey(publicHostKey, READONLY_SSH_FINGERPRINT);
  const knownHostsLine = `${READONLY_SSH_HOST} ${hostKey.publicKey}\n`;
  const args = ['-F', '/dev/null', '-T', '-oBatchMode=yes', '-oIdentitiesOnly=yes', '-oIdentityAgent=none', '-oPreferredAuthentications=publickey',
    '-oPasswordAuthentication=no', '-oKbdInteractiveAuthentication=no', '-oNumberOfPasswordPrompts=0', '-oHostKeyAlgorithms=ssh-ed25519',
    '-oStrictHostKeyChecking=yes', `-oUserKnownHostsFile=${knownHostsFile}`, '-oGlobalKnownHostsFile=/dev/null', '-oVerifyHostKeyDNS=no', '-oUpdateHostKeys=no',
    '-oCheckHostIP=yes', '-oCanonicalizeHostname=no', '-oControlMaster=no', '-oControlPath=none', '-oProxyCommand=none', '-oProxyJump=none',
    '-oConnectionAttempts=1', '-oConnectTimeout=15', '-p', String(READONLY_SSH_PORT), '-i', identityFile, '--', `${username}@${READONLY_SSH_HOST}`, 'bash', '-se'];
  return Object.freeze({ schema: 'phoenix.pinned-readonly-ssh-transport-plan/v1', executable: '/usr/bin/ssh', args: Object.freeze(args),
    stdin: remotePayload, payloadSha256: approvedPayloadSha256, knownHostsLine, knownHostsSha256: digest(knownHostsLine), hostKeyFingerprint: hostKey.fingerprint,
    requiredRunnerFilePolicy: Object.freeze({ identityMode: '0600', knownHostsMode: '0600', parentMode: '0700', symlinks: 'DENY', singleLink: true, verifyAgainBeforeExecution: true }),
    hostKeyMaterialVerification: 'MATCHES_APPROVED_PUBLIC_FINGERPRINT', protectedIdentityVerification: 'UNVERIFIED_REQUIRES_EXISTING_PROTECTED_ENTRY',
    remoteRootTrustedPathsFd9Verification: 'UNVERIFIED_REQUIRES_ORIGINAL_REMOTE_GUARD', runnerFileMetadataVerification: 'UNVERIFIED_PURE_PLAN',
    productionConnectionExecuted: false, productionRecoveryVerified: false, productionAuthorized: false, result: 'CONFIGURATION_CANDIDATE_ONLY' });
}
