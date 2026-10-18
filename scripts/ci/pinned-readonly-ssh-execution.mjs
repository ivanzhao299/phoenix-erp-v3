/** Exact Batch 2 readonly transport. No key parsing, provider request, deploy or
 * authority substitution: the unchanged remote root/trusted-path/FD9 guard runs. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isIP } from 'node:net';
import { buildPinnedReadonlySshTransportPlan, READONLY_SSH_HOST } from './pinned-readonly-ssh-transport.mjs';

export const TARGET_SHA = '9155dcccd7578288a2ccedc9f2ec3f0dd0bf1f7e';
// Public material previously verified against the approved fixed fingerprint.
const PUBLIC_HOST_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDJlcVNXdq35Ju39WInV2am1gid6raMkWzDZr2GUyd38';
export const REMOTE_BODY = String.raw`set -Eeuo pipefail
set +x
cd /data/phoenix-erp
DEPLOY_REPO_ROOT="$(pwd -P)"
eval "$(printf '%s' "$PRODUCTION_CONTROL_BOOTSTRAP_B64" | base64 -d)"
export GIT_OPTIONAL_LOCKS=0
git() { command git -c "safe.directory=$DEPLOY_REPO_ROOT" -c core.hooksPath=/dev/null -c core.fsmonitor=false "$@"; }
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=all)"
test "$(printf '%s' "$FORENSIC_PROGRAM_B64" | base64 -d | sha256sum | cut -d' ' -f1)" = "$FORENSIC_PROGRAM_SHA256"
printf '%s' "$FORENSIC_PROGRAM_B64" | base64 -d | /usr/bin/timeout --signal=TERM --kill-after=5s 240s node --input-type=module -
echo FORENSIC_CONTROL_SHELL_COMPLETE=true
`;
const B64_FIELDS = ['PRODUCTION_CONTRACT_B64', 'PRODUCTION_PATH_HELPER_B64', 'PRODUCTION_CONTROL_BOOTSTRAP_B64', 'FORENSIC_SCHEMA_CONTRACT_B64', 'FORENSIC_SCHEMA_HELPER_B64', 'FORENSIC_INVENTORY_B64', 'FORENSIC_PROGRAM_B64', 'FORENSIC_TOPOLOGY_B64'];
export const PAYLOAD_FIELDS = Object.freeze([...B64_FIELDS, 'FORENSIC_PROGRAM_SHA256', 'FORENSIC_TOPOLOGY_SHA256', 'FORENSIC_TARGET_SHA', 'FORENSIC_RUNNER_SHA']);
const SOURCE_FILES = Object.freeze({ PRODUCTION_CONTRACT_B64: 'scripts/ops/production-config-contract.json', PRODUCTION_PATH_HELPER_B64: 'scripts/ops/production-trusted-paths.mjs', PRODUCTION_CONTROL_BOOTSTRAP_B64: 'scripts/ops/production-control-bootstrap.sh', FORENSIC_SCHEMA_CONTRACT_B64: 'apps/api/src/common/database/api-bootstrap-schema-contract.json', FORENSIC_SCHEMA_HELPER_B64: 'scripts/ops/api-bootstrap-schema-preflight.mjs' });
const SHA = /^[a-f0-9]{40}$/, HASH = /^[a-f0-9]{64}$/;
const digest = value => createHash('sha256').update(value).digest('hex');
const hold = reason => { throw new Error(`PINNED_READONLY_EXECUTION_HOLD=${reason}`); };
const object = value => value && Object.getPrototypeOf(value) === Object.prototype;
const childEnvironment = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' });
export function validateConnection({ host, port, proxyHost, username }) {
  if (host !== READONLY_SSH_HOST || port !== '22' || (proxyHost ?? '') !== '') hold('ENDPOINT_PORT_OR_PROXY');
  if (typeof username !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/.test(username) || username === 'phoenix-codex-deploy') hold('PROTECTED_IDENTITY_REQUIRED');
}
function base64(value) {
  if (typeof value !== 'string' || value.length > 2 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) hold('PAYLOAD_BASE64');
  const bytes = Buffer.from(value, 'base64'); if (bytes.toString('base64') !== value) hold('PAYLOAD_BASE64'); return bytes;
}
export function reviewedPayload(fields, approval) {
  if (!object(fields) || Object.keys(fields).sort().join(',') !== [...PAYLOAD_FIELDS].sort().join(',') || !object(approval)) hold('PAYLOAD_FIELDS');
  if (fields.FORENSIC_TARGET_SHA !== TARGET_SHA || fields.FORENSIC_RUNNER_SHA !== approval.runnerSha || !SHA.test(approval.runnerSha || '')
    || fields.FORENSIC_PROGRAM_SHA256 !== approval.programSha256 || !HASH.test(approval.programSha256 || '')
    || fields.FORENSIC_TOPOLOGY_SHA256 !== approval.topologySha256 || !HASH.test(approval.topologySha256 || '')) hold('EXACT_SOURCE_PINS');
  for (const key of B64_FIELDS) {
    const bytes = base64(fields[key]);
    const expected = key === 'FORENSIC_PROGRAM_B64' ? approval.programSha256 : key === 'FORENSIC_TOPOLOGY_B64' ? approval.topologySha256 : approval.sourceDigests?.[key];
    if (!HASH.test(expected || '') || digest(bytes) !== expected) hold('PAYLOAD_SOURCE_MISMATCH');
  }
  // Values are canonical base64 or hex only; no caller script/path is accepted.
  const payload = PAYLOAD_FIELDS.map(key => `export ${key}='${fields[key]}'\n`).join('') + REMOTE_BODY;
  if (Buffer.byteLength(payload) > 1024 * 1024) hold('PAYLOAD_SIZE');
  return { payload, sha256: digest(payload), bodySha256: digest(REMOTE_BODY) };
}
function directoryChain(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.normalize(directory) !== directory) hold('RUNNER_PATH');
  const parts = directory.split('/').filter(Boolean), result = []; let current = '/';
  for (const part of ['', ...parts]) { if (part) current = path.join(current, part); const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) hold('RUNNER_PARENT_TYPE');
    if ((stat.mode & 0o022) && !(stat.uid === 0 && (stat.mode & 0o1000))) hold('RUNNER_PARENT_PERMISSIONS');
    result.push({ path: current, dev: stat.dev, ino: stat.ino, uid: stat.uid, gid: stat.gid, mode: stat.mode }); }
  return result;
}
function fileIdentity(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o7777) !== 0o600) hold('RUNNER_FILE_METADATA');
  return [stat.dev, stat.ino, stat.uid, stat.gid, stat.mode, stat.nlink, stat.size, stat.mtimeMs, stat.ctimeMs];
}
export function snapshotRunnerFiles(directory, identityFile, knownHostsFile) {
  const chain = directoryChain(directory), dir = chain.at(-1);
  if (dir.uid !== process.getuid() || (dir.mode & 0o7777) !== 0o700 || path.dirname(identityFile) !== directory || path.dirname(knownHostsFile) !== directory || identityFile === knownHostsFile) hold('RUNNER_PRIVATE_DIRECTORY');
  // Private identity bytes are never opened/read by this program.
  return { chain, identity: fileIdentity(identityFile), knownHosts: fileIdentity(knownHostsFile) };
}
export function verifyRunnerFiles(previous, directory, identityFile, knownHostsFile) {
  if (JSON.stringify(snapshotRunnerFiles(directory, identityFile, knownHostsFile)) !== JSON.stringify(previous)) hold('RUNNER_METADATA_CHANGED');
}

/** Bounded capture: stderr is never returned or printed, including on failure. */
export function captureSsh(plan, { spawnProcess = spawn, timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    let child, output = [], stdoutBytes = 0, stderrBytes = 0, failure, closed = false, killTimer;
    const abort = reason => { failure ||= reason; try { child?.kill('SIGTERM'); } catch {} if (!killTimer) killTimer = setTimeout(() => { try { child?.kill('SIGKILL'); } catch {} }, 1000); };
    const timer = setTimeout(() => abort('SSH_TIMEOUT'), timeoutMs);
    const finish = (code, signal) => { if (closed) return; closed = true; clearTimeout(timer); clearTimeout(killTimer);
      if (failure || code !== 0 || signal) reject(new Error('PINNED_READONLY_EXECUTION_HOLD=' + (failure || 'SSH_PROCESS_FAILED')));
      else resolve(Buffer.concat(output).toString('utf8')); };
    try {
      child = spawnProcess(plan.executable, plan.args, { env: childEnvironment, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
      child.stdout.on('data', chunk => { const bytes = Buffer.from(chunk); stdoutBytes += bytes.length; if (stdoutBytes > 512 * 1024) abort('SSH_STDOUT_LIMIT'); else output.push(bytes); });
      child.stderr.on('data', chunk => { stderrBytes += Buffer.byteLength(chunk); if (stderrBytes > 64 * 1024) abort('SSH_STDERR_LIMIT'); });
      child.once('error', () => { failure = 'SSH_SPAWN_FAILED'; finish(null); }); child.once('close', finish);
      child.stdin.on('error', () => { failure ||= 'SSH_STDIN_FAILED'; }); child.stdin.end(plan.stdin);
    } catch { failure = 'SSH_SPAWN_FAILED'; finish(null); }
  });
}

// Closed diagnostic vocabulary: arbitrary remote strings/unknown fields cannot
// enter the artifact. Hashes, timestamps, approved paths and IPs are typed below.
const KEYS = new Set(`schema collectedAt target runnerSha classificationScope context uid trustedPathsAndFd9 errors stage classification checkout sha branch clean originMainSha floor version floorSha phase chanjetPolicy readonlyApprovalIsNull readonlyApprovalPresent active configSha outcome pins api web db migrationBaseline revision imageId transaction policyTransition exists runId operation expiresAt expired runtime activePinsMatch containers id image ociRevision created startedAt running health restartCount mounts type destination readOnly source flags CHANJET_READONLY_SYNC_ENABLED CHANJET_ERP_INBOUND_SYNC_ENABLED CHANJET_SYNC_POLICY health installedGuard targetFloorCheck criticalFiles file oldBlob targetBlob migrationScope schemaCompatibility status tables columns extensions retiredConstraints asyncJobs scope otherAsyncTaskFamilies runningJobs queuedJobs recoveryCandidates legacyRunningJobs writebackPending wmsWritebackPending mappingConflicts boundFailedDeployEvidence pre post startup files transactionRecordExists latestCompleteEvidenceTriplet targetSha snapshots runtimeMatchesPost result stdoutLineCount stderrLineCount errorSignalCount schemaWriteSignalCount sensitiveLineCount rawOutput bindingMatches hostTopology controlRecordsUnchanged controlRecordComparison operationsAttemptedByThisDiagnostic checkoutUpdate floorWrite activeWrite transactionWrite containerSwitch migration databaseWrite chanjetSync startedAt finishedAt verification docker processes systemd cron collectionBudget maximumMs elapsedMs outputBudget maximumBytes observedBytes truncated truncations observedCount maximumCount completeSafetyProof productionMutation continuousDrainProof admissionOrApprovalGranted unverifiedBoundaries inventoryStable networks observedContainerCount observedNetworkCount pid restarting restartPolicy service projectClass privileged addedCapabilities unknownCapabilityCount networkMode pidMode ipcMode ports containerPort protocol published hosts hostAddress hostPort exposure endpointId category readWrite sourcePathSha256 destinationPathSha256 driver internal attachable ingress memberIds bridgeInterface namespaceReference hostExecutorCompleteness ppid realUid effectiveUid startTicks executableClass executablePathSha256 namespaces net mnt relationToPid1 identitySha256 cgroupSha256 executionLocation containerIds executorRole units serviceCount timerCount unitCommandsInspected unsupportedServiceRows unsupportedTimerRows unitNameSha256 unitClass unitType activeState subState loadState unitFileState mainPid controlPid restart fragmentPathSha256 hasDropIns triggersCount triggeredByCount triggerTargetSha256 triggeredByTargetSha256 periodicDirectories sourceCoverage otherSchedulers sourcePathSha256 entryCount reason commandFailure gid mode bytes entries environmentAssignmentCount hasRebootEntry hasChanjetReference hasPhoenixReference hasDockerReference hasNetworkToolReference commandSafety commandContentsExported observedUnitCount observedFileCount apiRevision ledger canonicalCount appliedCount canonicalAppliedCount retiredAppliedCount pendingCount duplicateCount unknownCount timestampMismatchCount legacyAppliedCount legacyCanonicalCount legacyExactSet baseline changed`.split(/\s+/));
const WORDS = new Set(`HOLD_SCHEMA_OR_WRITE_SIGNAL HOLD_STARTUP_ERROR UNVERIFIED_STARTUP_EVIDENCE PASS_REDACTED_SUMMARY PASS FAIL HOLD SUCCESS CODE_HOLD CONFIG_READY_HOLD IN_PROGRESS SWITCHING ROLLING_BACK ROLLED_BACK OPEN PREPARED READY COMPLETED ACTIVE INACTIVE READONLY_VERIFY READONLY_ACTIVE INVALID_OR_UNSET UNVERIFIED UNVERIFIED_READ_FAILED SNAPSHOT_ONLY READONLY_SNAPSHOT READONLY_SNAPSHOT_UNVERIFIED_TRUNCATED UNVERIFIED_OUTPUT_TRUNCATED UNVERIFIED_ENUMERATION_TRUNCATED CURRENT_COLLECTION_TIME_NOT_FAILED_RUN_REPLAY EXACT_FAILED_RUN_FILE_PRESENCE_ONLY LATEST_COMPLETE_TRIPLET_NOT_LAST_SUCCESS_ASSERTION UNVERIFIED_NO_COMPLETE_TRIPLET CHANJET_JOBS_AND_WRITEBACK_ONLY PINNED_RAW_BYTES_AND_FILE_IDENTITY PROC_1_ONLY_NOT_HOST_ATTESTATION FIXED_SYSTEM_AND_SPOOL_PATHS_ONLY CONTINUOUS_INGRESS_ENFORCEMENT TASK_DRAIN_AND_SIDE_EFFECTS HOST_EXECUTOR_COMPLETENESS EXTERNAL_ORCHESTRATORS UNLISTED_CRON_AND_USER_SCHEDULERS PROCESS_AND_CONTAINER_RACES ENUMERATION_LIMIT_TRUNCATED TOTAL_BUDGET_EXHAUSTED_TRUNCATED OUTPUT_SIZE_LIMIT_TRUNCATED DOCKER_CONTAINERS DOCKER_NETWORKS PROCESSES SYSTEMD_UNITS CRON_DIRECTORY_ENTRIES CRON_SOURCES COLLECTOR OUTPUT DOCKER_INVENTORY_UNAVAILABLE CONTAINER_DISAPPEARED_OR_METADATA_UNAVAILABLE CONTAINER_INSPECT_COMMAND_UNAVAILABLE CONTAINER_INSPECT_JSON_UNVERIFIED CONTAINER_INSPECT_FIELD_COUNT_UNVERIFIED CONTAINER_INSPECT_IDENTITY_UNVERIFIED CONTAINER_INSPECT_PROCESS_FIELDS_UNVERIFIED CONTAINER_INSPECT_STARTED_AT_UNVERIFIED CONTAINER_INSPECT_PROJECTION_UNVERIFIED COMMAND_TIMEOUT COMMAND_EXECUTABLE_UNAVAILABLE OBJECT_METADATA_UNAVAILABLE TEMPLATE_INDEX_UNAVAILABLE TEMPLATE_FIELD_UNAVAILABLE METADATA_ACCESS_DENIED DOCKER_DAEMON_UNAVAILABLE COMMAND_FAILURE_UNCLASSIFIED NETWORK_ATTACHMENT_METADATA MOUNT_METADATA NETWORK_DISAPPEARED_OR_METADATA_UNAVAILABLE NETWORK_INVENTORY_UNAVAILABLE PROC_ENUMERATION_UNAVAILABLE NAMESPACE_METADATA NAMESPACE_UNAVAILABLE PROCESS_EXIT_REUSE_OR_METADATA_UNAVAILABLE UNIT_NAME_UNSUPPORTED UNIT_DISAPPEARED_OR_METADATA_UNAVAILABLE SYSTEMD_METADATA_UNAVAILABLE PERIODIC_SCRIPT_CONTENT_NOT_INSPECTED PERIODIC_CRON_DIRECTORY_UNAVAILABLE CRON_DIRECTORY_UNAVAILABLE CRON_FILE_SYMLINK_RACE_SIZE_OR_UNAVAILABLE PORT_METADATA HOST_PORT_METADATA UNVERIFIED_CONTENT_NOT_EXPORTED OTHER SENSITIVE_PATH DOCKER_SOCKET BROAD_HOST_PATH PUBLIC_BACKGROUND_CONTROL PRIVATE_PRODUCTION_CONTROL DATABASE_DATA UPLOADS LOOPBACK ALL_INTERFACES SPECIFIC_ADDRESS PHOENIX OTHER_UNVERIFIED HOST NONE BRIDGE DEFAULT NAMED_OR_SHARED_UNVERIFIED PRIVATE_OR_DEFAULT CONTAINER_SHARED SAME DIFFERENT KNOWN_DOCKER_CONTAINER UNKNOWN_CONTAINER_UNVERIFIED HOST_OR_UNCLASSIFIED CONTAINER_ROLE_FROM_DOCKER_METADATA UNVERIFIED_NO_ARGUMENTS_INSPECTED NODE CONTAINER_ENGINE INIT CRON WEB_PROXY SSH POSTGRESQL INTERPRETER TIMER SERVICE UNCHANGED ALL NET_ADMIN NET_RAW SYS_ADMIN SYS_PTRACE SYS_MODULE DAC_READ_SEARCH DAC_OVERRIDE CHOWN SETUID SETGID SYS_CHROOT MKNOD AUDIT_WRITE SETFCAP NET_BIND_SERVICE healthy unhealthy starting no always unless-stopped on-failure on-success on-abnormal on-watchdog on-abort api web db bind volume tmpfs tcp udp sctp bridge host overlay null macvlan ipvlan local swarm global active inactive activating deactivating failed reloading running exited dead waiting elapsed start stop loaded not-found error masked enabled disabled static indirect generated transient enabled-runtime linked linked-runtime main true false`.split(/\s+/));
function strictTree(value, key = '', depth = 0) {
  if (depth > 16) hold('RESULT_DEPTH');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) hold('RESULT_NUMBER'); return; }
  if (Array.isArray(value)) { if (value.length > 1024) hold('RESULT_ARRAY_LIMIT'); for (const item of value) strictTree(item, key, depth + 1); return; }
  if (object(value)) { for (const [childKey, item] of Object.entries(value)) { if (!KEYS.has(childKey)) hold('RESULT_UNKNOWN_FIELD'); strictTree(item, childKey, depth + 1); } return; }
  if (typeof value !== 'string' || value.length > 512) hold('RESULT_VALUE');
  if (WORDS.has(value) || HASH.test(value) || SHA.test(value) || /^sha256:[a-f0-9]{64}$/.test(value)) return;
  if (['collectedAt', 'created', 'startedAt', 'finishedAt', 'expiresAt'].includes(key) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value) && Number.isFinite(Date.parse(value))) return;
  if (['runId', 'startTicks'].includes(key) && /^\d+(?:-\d+)?$/.test(value)) return;
  if (key === 'schema' && ['phoenix.batch2-config-forensics/v1', 'phoenix.maintenance-host-topology/v1'].includes(value)) return;
  if (key === 'classification' && /^(?:CONFIG_HOLD|MIGRATION_SCOPE|DEPLOY_EVIDENCE_HOLD|RUNTIME_HOLD)=[A-Z0-9_]{1,80}$/.test(value)) return;
  if (key === 'stage' && /^(?:runtime|container_(?:api|web|db)|flags|http_(?:api|web)|installed_guard|target_floor|critical_files|migration_scope|ledger|schema|jobs|latest_complete_triplet_not_success_verdict|host_topology|control_record_postcheck)$/.test(value)) return;
  if (['file', 'changed'].includes(key) && /^(?:apps\/api\/|apps\/web\/|scripts\/|nginx\/|\.github\/workflows\/)[A-Za-z0-9_./-]+$|^docker-compose\.yml$/.test(value) && !value.includes('..')) return;
  if (key === 'changed' && /^migrations\/[A-Za-z0-9_.-]+\.(?:sql|ts|js|mjs)$/.test(value) && !value.includes('..')) return;
  if (key === 'destination' && ['/var/lib/postgresql/data', '/app/uploads', '/run/phoenix-background-control'].includes(value)) return;
  if (key === 'source' && /^\/(?:var\/lib\/docker\/volumes\/[a-z0-9_-]+\/_data|data\/[a-z0-9_/-]+)$/.test(value)) return;
  if (key === 'bridgeInterface' && /^(?:docker0|br-[a-f0-9]{12})$/.test(value)) return;
  if (key === 'hostAddress' && isIP(value)) return;
  if (key === 'extensions' && ['pgcrypto', 'uuid-ossp'].includes(value)) return;
  if (['health', 'api', 'web'].includes(key) && /^[1-5][0-9]{2}$/.test(value)) return;
  // Field names already passed the fixed KEYS vocabulary. Reveal the key only,
  // never the rejected value, to diagnose future closed-schema drift safely.
  hold('RESULT_STRING_' + key.toUpperCase());
}
export function parseDiagnosticOutput(stdout, runnerSha) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 512 * 1024 || stdout.includes('\r')) hold('RESULT_ENCODING_OR_SIZE');
  const lines = stdout.split('\n').filter(Boolean);
  if (lines.length !== 2 || !lines[0].startsWith('CONFIG_FORENSICS_JSON=') || lines[1] !== 'FORENSIC_CONTROL_SHELL_COMPLETE=true') hold('RESULT_MARKERS');
  const json = lines[0].slice('CONFIG_FORENSICS_JSON='.length);
  let data; try { data = JSON.parse(json); } catch { hold('RESULT_JSON'); }
  if (JSON.stringify(data) !== json) hold('RESULT_NONCANONICAL_JSON');
  if (!object(data) || data.schema !== 'phoenix.batch2-config-forensics/v1' || data.target !== TARGET_SHA || data.runnerSha !== runnerSha || data.context?.uid !== 0 || data.context?.trustedPathsAndFd9 !== 'PASS') hold('RESULT_BINDING_OR_CONTEXT');
  if (!object(data.operationsAttemptedByThisDiagnostic) || Object.keys(data.operationsAttemptedByThisDiagnostic).sort().join(',') !== 'activeWrite,chanjetSync,checkoutUpdate,containerSwitch,databaseWrite,floorWrite,migration,transactionWrite'
    || Object.values(data.operationsAttemptedByThisDiagnostic).some(value => value !== false)) hold('RESULT_MUTATION_BOUNDARY');
  if (data.hostTopology && ['completeSafetyProof', 'productionMutation', 'continuousDrainProof', 'admissionOrApprovalGranted'].some(key => data.hostTopology[key] !== false)) hold('RESULT_TOPOLOGY_BOUNDARY');
  strictTree(data); return data;
}
export async function executeReviewedAudit(options, dependencies = {}) {
  validateConnection(options.connection);
  const reviewed = reviewedPayload(options.fields, options.approval);
  const basePlan = buildPinnedReadonlySshTransportPlan({ publicHostKey: PUBLIC_HOST_KEY, username: options.connection.username, identityFile: options.identityFile, knownHostsFile: options.knownHostsFile,
    runnerTemporaryDirectory: options.directory, credentialOrigin: 'EXISTING_PROTECTED_PRODUCTION_ENTRY', remotePayload: reviewed.payload, approvedPayloadSha256: reviewed.sha256 });
  // Fixed deployment connection contract; never accept caller SSH options.
  const plan = Object.freeze({ ...basePlan, args: Object.freeze([...basePlan.args.slice(0, 2), '-oKexAlgorithms=curve25519-sha256', ...basePlan.args.slice(2)]) });
  // Validate private path before creating only the public known_hosts file.
  const privateDir = directoryChain(options.directory).at(-1);
  if (privateDir.uid !== process.getuid() || (privateDir.mode & 0o7777) !== 0o700 || path.dirname(options.identityFile) !== options.directory || path.dirname(options.knownHostsFile) !== options.directory) hold('RUNNER_PRIVATE_DIRECTORY');
  fileIdentity(options.identityFile);
  const fd = fs.openSync(options.knownHostsFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, plan.knownHostsLine); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const snapshot = snapshotRunnerFiles(options.directory, options.identityFile, options.knownHostsFile);
  if (dependencies.beforeExecute) await dependencies.beforeExecute();
  verifyRunnerFiles(snapshot, options.directory, options.identityFile, options.knownHostsFile);
  const stdout = await captureSsh(plan, dependencies);
  verifyRunnerFiles(snapshot, options.directory, options.identityFile, options.knownHostsFile);
  return { diagnostic: parseDiagnosticOutput(stdout, options.approval.runnerSha), transport: { schema: 'phoenix.pinned-readonly-ssh-receipt/v1', hostKeyAlgorithm: 'ssh-ed25519', hostKeyFingerprint: plan.hostKeyFingerprint,
    payloadSha256: reviewed.sha256, bodySha256: reviewed.bodySha256, runnerSha: options.approval.runnerSha, targetSha: TARGET_SHA, sshExitCode: 0, productionMutation: false, continuousDrainProof: false } };
}

async function main() {
  if (process.argv.slice(2).join(' ') !== '--execute') hold('EXPLICIT_REVIEWED_EXECUTION_REQUIRED');
  const fields = Object.fromEntries(PAYLOAD_FIELDS.map(key => [key, process.env[key]]));
  const runGit = args => execFileSync('/usr/bin/git', args, { encoding: 'utf8', env: childEnvironment, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, maxBuffer: 2 * 1024 * 1024 }).trim();
  const runnerSha = process.env.GITHUB_SHA;
  if (!SHA.test(runnerSha || '') || runGit(['rev-parse', 'HEAD']) !== runnerSha || runnerSha !== process.env.APPROVED_RUNNER_SHA) hold('EXACT_RUNNER_SHA');
  for (const file of ['scripts/ci/pinned-readonly-ssh-execution.mjs', 'scripts/ci/pinned-readonly-ssh-transport.mjs', '.github/workflows/chanjet-readonly-restoration.yml']) {
    const expected = execFileSync('/usr/bin/git', ['show', `${runnerSha}:${file}`], { env: childEnvironment, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
    if (digest(fs.readFileSync(file)) !== digest(expected)) hold('REVIEWED_RUNNER_SOURCE_CHANGED');
  }
  const sourceDigests = {};
  for (const [key, file] of Object.entries(SOURCE_FILES)) {
    const bytes = execFileSync('/usr/bin/git', ['show', `${TARGET_SHA}:${file}`], { env: childEnvironment, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, maxBuffer: 2 * 1024 * 1024 }); sourceDigests[key] = digest(bytes);
  }
  sourceDigests.FORENSIC_INVENTORY_B64 = digest(fs.readFileSync(path.join(process.env.RUNNER_TEMP || '', 'inventory.json')));
  const approval = { runnerSha, programSha256: process.env.APPROVED_PROGRAM_SHA256, topologySha256: process.env.APPROVED_TOPOLOGY_SHA256, sourceDigests };
  for (const [file, expected] of [['scripts/ops/batch2-config-hold-diagnostic.mjs', approval.programSha256], ['scripts/ops/maintenance-host-topology-diagnostic.mjs', approval.topologySha256]]) if (digest(fs.readFileSync(file)) !== expected) hold('RUNNER_PROGRAM_PIN');
  const result = await executeReviewedAudit({ connection: { host: process.env.DEPLOY_HOST, port: process.env.DEPLOY_PORT, proxyHost: process.env.DEPLOY_PROXY_HOST, username: process.env.DEPLOY_USER },
    fields, approval, directory: process.env.READONLY_SSH_DIRECTORY, identityFile: process.env.READONLY_SSH_IDENTITY, knownHostsFile: path.join(process.env.READONLY_SSH_DIRECTORY || '', 'known_hosts') });
  directoryChain(process.env.RUNNER_TEMP);
  const artifactDirectory = path.join(process.env.RUNNER_TEMP, 'config-forensics');
  fs.mkdirSync(artifactDirectory, { mode: 0o700 });
  const artifact = path.join(artifactDirectory, 'result.json');
  fs.writeFileSync(artifact, JSON.stringify(result.diagnostic, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(path.join(artifactDirectory, 'transport.json'), JSON.stringify(result.transport, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(result.transport));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); } catch (error) { console.error(/^PINNED_READONLY_EXECUTION_HOLD=[A-Z_]+$/.test(error?.message || '') ? error.message : 'PINNED_READONLY_EXECUTION_HOLD=CONTROLLED_TRANSPORT_OR_RESULT_FAILURE'); process.exitCode = 1; }
}
