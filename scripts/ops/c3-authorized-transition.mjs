// Temporary, independently reviewed orchestration for the exact authorized release.
// Policy, state writing, validators and runtime capture are loaded from that merged release.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

export const TARGET = '23c7af86dd122379d01248a3b9542b8165f31498';
const OLD_API = '017633c5fb0a090d7b8cda375125d1832668f304';
const OLD_WEB = '5425089bcb51338d4780d6f37782440bade8b90c';
const BACKUP = '.env.pre-verification-20261005T114700+08:00';
const OLD_ARCHIVE = `/home/phoenix-codex-deploy/production-checkout-recovery/20261008T063137+0800/${BACKUP}`;
const BACKUP_SHA = '637c78b837ebb5f6798e74f175d42718a424c5fe932bc6f02b3ee9f1ff7a9754';
export const FILES = [
  'docker-compose.yml', 'scripts/ops/production-config-contract.json',
  'scripts/ops/production-trusted-paths.mjs', 'scripts/ops/capture-production-runtime.mjs',
  'scripts/ops/update-managed-chanjet-env.mjs', 'scripts/ops/production-config-guard.mjs',
  'scripts/ops/production-deployment-state.mjs', 'scripts/ops/verify-config-floor-transition.mjs',
  'scripts/ops/require-phoenix-data-mount.sh',
];
const tuple = {
  PHOENIX_DATA_MOUNT_GUARD: 'true', PHOENIX_PG_DATA_DIR: '/data/phoenix-erp-data/postgres',
  PHOENIX_UPLOADS_DIR: '/data/phoenix-erp-data/uploads',
  CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false',
};
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hold = reason => { throw new Error(`C3_HOLD=${reason}`); };
const requireGate = (value, reason) => { if (!value) hold(reason); };
const run = (program, args, options = {}) => execFileSync(program, args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, ...options,
});
const metadata = file => {
  const s = fs.lstatSync(file); return { dev: s.dev, ino: s.ino, uid: s.uid, gid: s.gid,
    mode: s.mode & 0o7777, size: s.size, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs };
};
const absent = file => !fs.lstatSync(file, { throwIfNoEntry: false });
export function decodePackage(encoded, expectedDigest) {
  const compressed = Buffer.from(encoded, 'base64');
  requireGate(/^[a-f0-9]{64}$/.test(expectedDigest || '') && hash(compressed) === expectedDigest, 'PACKAGE_DIGEST');
  const bundle = JSON.parse(gunzipSync(compressed, { maxOutputLength: 1024 * 1024 }).toString('utf8'));
  requireGate(bundle.sourceSha === TARGET && JSON.stringify(Object.keys(bundle.files).sort()) === JSON.stringify([...FILES].sort()), 'PACKAGE_SOURCE_OR_PATHS');
  const bytes = {};
  for (const file of FILES) {
    const entry = bundle.files[file]; bytes[file] = Buffer.from(entry.base64, 'base64');
    requireGate(hash(bytes[file]) === entry.sha256, 'PACKAGE_FILE_DIGEST');
  }
  return bytes;
}
const dataModule = bytes => import(`data:text/javascript;base64,${bytes.toString('base64')}`);
function writeExclusive(file, bytes, trust, contract) {
  const before = trust.inspectTrustedDirectory(path.dirname(file), contract);
  requireGate(absent(file), 'DESTINATION_ALREADY_EXISTS');
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { trust.assertRegularFile(fs.fstatSync(fd)); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  trust.assertSameDirectory(before, trust.inspectTrustedDirectory(path.dirname(file), contract));
  requireGate(hash(trust.readPinnedFile(file, { contract })) === hash(bytes), 'WRITE_VERIFICATION');
  const parent = fs.openSync(path.dirname(file), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}
function createDirectory(directory, trust, contract) {
  const before = trust.inspectTrustedDirectory(path.dirname(directory), contract);
  requireGate(absent(directory), 'DIRECTORY_ALREADY_EXISTS');
  fs.mkdirSync(directory, { mode: 0o700 });
  trust.assertSameDirectory(before, trust.inspectTrustedDirectory(path.dirname(directory), contract));
  trust.inspectTrustedDirectory(directory, contract);
}
export function gitCommand(root, trust) {
  let configured = '';
  try { configured = run('git', ['-c', `safe.directory=${root}`, 'config', '--get', 'core.sshCommand'], { cwd: root }).trim(); } catch {}
  const env = { ...process.env, GIT_ATTR_NOSYSTEM: '1', GIT_SSH_COMMAND: trust.strictSshCommand(process.env.GIT_SSH_COMMAND || configured, process.env.GIT_SSH) };
  // Git's post-merge hook/fsmonitor must never execute operator code in the unsafe interval.
  return args => run('git', ['-c', `safe.directory=${root}`, '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
    '-c', 'core.attributesFile=/dev/null', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', ...args], { cwd: root, env });
}
function assertNoCheckoutFilters(root, git) {
  // With global attributes disabled, reject all other attribute sources before restore/FF.
  const info = path.join(git(['rev-parse', '--absolute-git-dir']).trim(), 'info/attributes');
  requireGate(absent(info) || (fs.lstatSync(info).isFile() && !fs.lstatSync(info).isSymbolicLink() && fs.readFileSync(info).length === 0), 'LOCAL_CHECKOUT_ATTRIBUTES');
  for (const revision of ['HEAD', TARGET]) requireGate(!git(['ls-tree', '-r', '--name-only', revision]).split('\n').some(f => path.basename(f) === '.gitattributes'), 'TREE_CHECKOUT_ATTRIBUTES');
}
function restoreArchivedCompose(file, oldBytes, safeBytes) {
  const before = fs.lstatSync(file);
  requireGate(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && fs.readFileSync(file).equals(oldBytes), 'RECOVERY_COMPOSE_CHANGED');
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd);
    requireGate(opened.dev === before.dev && opened.ino === before.ino && opened.size === before.size, 'RECOVERY_FILE_IDENTITY');
    fs.ftruncateSync(fd, 0); fs.writeFileSync(fd, safeBytes); fs.fsyncSync(fd);
    const named = fs.lstatSync(file);
    requireGate(named.dev === opened.dev && named.ino === opened.ino && fs.readFileSync(file).equals(safeBytes), 'RECOVERY_WRITE');
  } finally { fs.closeSync(fd); }
}
function readonlySnapshot(root, capture, trust) {
  const runtime = capture.captureRuntime();
  requireGate(runtime.api.revision === OLD_API && runtime.web.revision === OLD_WEB, 'UNEXPECTED_RUNNING_REVISION');
  const services = {};
  for (const name of ['db', 'api', 'web']) {
    // Inspect structure privately; serialize only explicitly permitted identity/health fields.
    const record = JSON.parse(run('docker', ['inspect', `phoenix-v3-${name}`], { env: capture.executionEnv() }))[0];
    requireGate(record.State.Running && record.State.Health?.Status === 'healthy', 'CURRENT_SERVICE_UNHEALTHY');
    services[name] = { id: record.Id, image: record.Image, startedAt: record.State.StartedAt,
      project: record.Config.Labels['com.docker.compose.project'] };
    requireGate(/^phoenix[a-z0-9_-]*$/.test(services[name].project || ''), 'COMPOSE_PROJECT');
    if (name === 'api') for (const flag of ['CHANJET_READONLY_SYNC_ENABLED', 'CHANJET_ERP_INBOUND_SYNC_ENABLED']) {
      requireGate(record.Config.Env.filter(line => line.startsWith(flag + '=')).join('') === `${flag}=false`, 'LIVE_CHANJET_FLAGS');
    }
    const destination = name === 'db' ? '/var/lib/postgresql/data' : name === 'api' ? '/app/uploads' : undefined;
    if (destination) requireGate(record.Mounts.some(m => m.Type === 'bind' && m.Destination === destination
      && m.Source === (name === 'db' ? tuple.PHOENIX_PG_DATA_DIR : tuple.PHOENIX_UPLOADS_DIR)), 'LIVE_STORAGE');
  }
  requireGate(new Set(Object.values(services).map(s => s.project)).size === 1, 'PROJECT_MISMATCH');
  const liveEnv = trust.readPinnedFile(path.join(root, '.env'), { uid: 1002, trustedParent: false });
  for (const [key, value] of Object.entries(tuple)) requireGate(liveEnv.toString().split(/\r?\n/).filter(l => l.startsWith(key + '=')).join('') === `${key}=${value}`, 'ENV_TUPLE');
  return { runtime, services, envSha256: hash(liveEnv) };
}
function assertSnapshot(actual, expected) {
  requireGate(JSON.stringify(actual) === JSON.stringify(expected), 'CONTAINER_OR_ENV_CHANGED');
}
function checkDirty(git) {
  requireGate(git(['branch', '--show-current']).trim() === 'main' && git(['rev-parse', 'HEAD']).trim() === OLD_API, 'INITIAL_CHECKOUT');
  requireGate(git(['status', '--porcelain', '--untracked-files=all']) === ` M docker-compose.yml\n?? ${BACKUP}\n`, 'INITIAL_DIRTY_SET');
}
function checkRemote(git) {
  requireGate(git(['remote', 'get-url', 'origin']).trim() === 'git@github.com:ivanzhao299/phoenix-erp-v3.git', 'REMOTE_IDENTITY');
  requireGate(git(['ls-remote', 'origin', 'refs/heads/main']).trim() === `${TARGET}\trefs/heads/main`, 'REMOTE_TARGET_MOVED');
}
export function reconcileCheckout({ git, safeCompose, oldCompose, restoreSafe }) {
  // No Docker/Compose call is possible within this synchronous, bounded interval.
  git(['restore', '--source=HEAD', '--worktree', '--', 'docker-compose.yml']);
  try {
    requireGate(git(['status', '--porcelain', '--untracked-files=all']) === '', 'POST_RESTORE_DIRT');
    git(['merge', '--ff-only', 'origin/main']);
    requireGate(git(['rev-parse', 'HEAD']).trim() === TARGET && git(['branch', '--show-current']).trim() === 'main'
      && git(['status', '--porcelain', '--untracked-files=all']) === '', 'POST_FF_CHECKOUT');
  } catch (error) {
    // Approved ADR exact-file safety recovery only if FF left the original HEAD intact.
    if (git(['rev-parse', 'HEAD']).trim() === OLD_API && git(['status', '--porcelain', '--untracked-files=all']) === ''
      && hash(Buffer.from(git(['show', 'HEAD:docker-compose.yml']))) === hash(oldCompose)) restoreSafe(safeCompose);
    throw error;
  }
}
export async function execute(phase) {
  process.umask(0o077);
  requireGate(process.env.C3_APPROVAL === 'EXECUTE_EXACT_23C7_C3' && /^\d+-\d+$/.test(process.env.DEPLOY_RUN_ID || ''), 'EXPLICIT_APPROVAL');
  const bytes = decodePackage(process.env.C3_PACKAGE_B64 || '', process.env.C3_PACKAGE_SHA256);
  const trust = await dataModule(bytes['scripts/ops/production-trusted-paths.mjs']);
  const capture = await dataModule(bytes['scripts/ops/capture-production-runtime.mjs']);
  const contract = JSON.parse(bytes['scripts/ops/production-config-contract.json']);
  trust.assertRootIdentity(contract); trust.assertNoLegacyState(contract);
  const root = fs.realpathSync(process.cwd()); requireGate(root === contract.repository, 'REPOSITORY_CONTEXT');
  const git = gitCommand(root, trust);
  const runId = process.env.DEPLOY_RUN_ID;
  const readonlyCloseout = ['post-preflight', 'post-deploy'].includes(phase);
  const sourceRunId = readonlyCloseout ? '37738116329-1' : runId;
  const packageRoot = path.join(contract.archiveDirectory, `c3-${sourceRunId}`, 'merged-source');
  const archiveRoot = path.dirname(packageRoot);
  const original = path.join(root, BACKUP);
  if (readonlyCloseout) {
    for (const file of FILES) requireGate(trust.readPinnedFile(path.join(packageRoot, file), { contract }).equals(bytes[file]), 'STAGED_MERGED_PACKAGE_CHANGED');
    trust.bootstrapPreflight(contract);
    if (phase === 'post-preflight') { console.log('POST_DEPLOY_TRUSTED_PREFLIGHT=PASS'); return; }
    const guard = await import(pathToFileURL(path.join(packageRoot, 'scripts/ops/production-config-guard.mjs')));
    guard.verifyContext(root, contract.stateDirectory);
    requireGate(absent(path.join(contract.stateDirectory, 'transaction.json')), 'UNFINISHED_TRANSACTION');
    requireGate(git(['rev-parse', 'HEAD']).trim() === TARGET, 'POST_DEPLOY_HEAD');
    const actual = capture.captureRuntime();
    requireGate(actual.api.revision === TARGET && actual.web.revision === TARGET, 'POST_DEPLOY_RUNTIME_REVISION');
    const active = guard.secureJson(path.join(contract.stateDirectory, 'active.json'));
    requireGate(active.outcome === 'SUCCESS' && active.configSha === TARGET && active.floorSha === TARGET, 'ACTIVE_STATE_NOT_SUCCESS');
    guard.assertRuntimePins(actual, active.active);
    guard.guardProduction(root, contract.stateDirectory, actual);
    const deployState = guard.secureJson(path.join(contract.stateDirectory, 'deploy-37738270604-1.json'));
    requireGate(deployState.outcome === 'SUCCESS' && deployState.target === TARGET && deployState.migrationBaseline === OLD_API
      && deployState.migrationPaths.length === 0, 'DEPLOY_STATE_EVIDENCE');
    const inputs = guard.secureJson(path.join(contract.stateDirectory, `c3-inputs-${sourceRunId}.json`));
    const statuses = {};
    for (const service of ['db', 'api', 'web']) {
      const record = JSON.parse(run('docker', ['inspect', `phoenix-v3-${service}`], { env: capture.executionEnv() }))[0];
      requireGate(record.State.Running && record.State.Health?.Status === 'healthy', 'POST_DEPLOY_SERVICE_HEALTH');
      statuses[service] = { id: record.Id, image: record.Image, startedAt: record.State.StartedAt, health: record.State.Health.Status };
      if (service === 'db') requireGate(record.Id === inputs.snapshot.services.db.id && record.State.StartedAt === inputs.snapshot.services.db.startedAt, 'DB_RESTARTED');
    }
    requireGate(hash(trust.readPinnedFile(path.join(root, '.env'), { uid: 1002, trustedParent: false })) === inputs.snapshot.envSha256, 'LIVE_ENV_CHANGED');
    requireGate(absent(original) && JSON.stringify(metadata(OLD_ARCHIVE)) === JSON.stringify(inputs.historicalMetadata)
      && hash(trust.readPinnedFile(OLD_ARCHIVE, { uid: 1002, trustedParent: false })) === BACKUP_SHA, 'OLD_EVIDENCE_CHANGED');
    const health = {};
    for (const [key, url] of Object.entries({ api: 'http://127.0.0.1:3100/api/health', readiness: 'http://127.0.0.1:3100/api/readiness', web: 'http://127.0.0.1:3000/' })) {
      health[key] = run('curl', ['-sS', '-L', '--max-time', '15', '-o', '/dev/null', '-w', '%{http_code}', url], { env: capture.executionEnv() }).trim();
      requireGate(health[key] === '200', 'POST_DEPLOY_HTTP_HEALTH');
    }
    const logs = spawnSync('docker', ['logs', '--since', statuses.api.startedAt, 'phoenix-v3-api'], { env: capture.executionEnv(), encoding: 'utf8', timeout: 60000, stdio: ['ignore','pipe','pipe'] });
    requireGate(logs.status === 0 && !logs.error, 'STARTUP_LOG_INSPECTION');
    const startup = logs.stdout + logs.stderr;
    const critical = (startup.match(/42703|QueryFailedError|startup crash|password authentication failed|foreign key constraint/gi) || []).length;
    requireGate(critical === 0, 'CRITICAL_STARTUP_ERRORS');
    console.log(JSON.stringify({ POST_DEPLOY_CONFIG_GUARD: 'PASS', target: TARGET, actual, health, statuses,
      worktreeClean: true, configFloorVersion: 2, migrationBaseline: deployState.migrationBaseline, migrationPaths: [],
      dbUnchanged: true, envUnchanged: true, historicalEvidenceUnchanged: true, criticalStartupErrors: critical,
      operationalTuple: tuple }));
  } else if (phase === 'initialize') {
    trust.inspectTrustedDirectory('/var/lib', contract);
    requireGate(absent(contract.controlRoot), 'EXISTING_CONTROL_TREE_REQUIRES_RECONCILIATION');
    checkRemote(git); checkDirty(git);
    requireGate(fs.readFileSync(path.join(root, 'docker-compose.yml')).equals(bytes['docker-compose.yml']), 'COMPOSE_EQUIVALENCE');
    const sourceBytes = trust.readPinnedFile(original, { uid: 1002, trustedParent: false });
    const historicalBytes = trust.readPinnedFile(OLD_ARCHIVE, { uid: 1002, trustedParent: false });
    requireGate(hash(sourceBytes) === BACKUP_SHA && hash(historicalBytes) === BACKUP_SHA, 'HISTORICAL_ARCHIVE_HASH');
    const originalMetadata = metadata(original); const historicalMetadata = metadata(OLD_ARCHIVE);
    const snapshot = readonlySnapshot(root, capture, trust);
    run('bash', ['-c', bytes['scripts/ops/require-phoenix-data-mount.sh'].toString()], { cwd: root, env: capture.executionEnv() });
    git(['fetch', 'origin', 'main']);
    requireGate(git(['rev-parse', 'origin/main']).trim() === TARGET, 'FETCH_TARGET_MOVED'); checkDirty(git);
    git(['merge-base', '--is-ancestor', OLD_API, TARGET]);
    assertNoCheckoutFilters(root, git);
    for (const file of FILES) requireGate(Buffer.from(git(['show', `${TARGET}:${file}`])).equals(bytes[file]), 'MERGED_PACKAGE_NOT_AUTHENTIC');
    createDirectory(contract.controlRoot, trust, contract);
    createDirectory(contract.stateDirectory, trust, contract);
    createDirectory(contract.archiveDirectory, trust, contract);
    createDirectory(archiveRoot, trust, contract);
    createDirectory(packageRoot, trust, contract);
    createDirectory(path.join(packageRoot, 'scripts'), trust, contract);
    createDirectory(path.join(packageRoot, 'scripts/ops'), trust, contract);
    for (const file of FILES) writeExclusive(path.join(packageRoot, file), bytes[file], trust, contract);
    const { atomicState } = await import(pathToFileURL(path.join(packageRoot, 'scripts/ops/production-deployment-state.mjs')));
    atomicState(path.join(contract.stateDirectory, 'mutation.lock'), { version: 2, purpose: 'C3_INITIALIZATION', runId });
    atomicState(path.join(contract.stateDirectory, `c3-inputs-${runId}.json`), { version: 2, target: TARGET,
      originalMetadata, historicalMetadata, snapshot, operationalTuple: tuple });
    console.log('ROOT_CONTROL_INITIALIZATION=PASS');
  } else if (phase === 'transition') {
    // Load policy/state functions from the SHA-authenticated, root-restricted package only.
    for (const file of FILES) requireGate(trust.readPinnedFile(path.join(packageRoot, file), { contract }).equals(bytes[file]), 'STAGED_MERGED_PACKAGE_CHANGED');
    const state = await import(pathToFileURL(path.join(packageRoot, 'scripts/ops/production-deployment-state.mjs')));
    const guard = await import(pathToFileURL(path.join(packageRoot, 'scripts/ops/production-config-guard.mjs')));
    const verifier = await import(pathToFileURL(path.join(packageRoot, 'scripts/ops/verify-config-floor-transition.mjs')));
    guard.verifyContext(root, contract.stateDirectory);
    requireGate(absent(path.join(contract.stateDirectory, 'transaction.json')), 'UNFINISHED_TRANSACTION');
    const inputs = guard.secureJson(path.join(contract.stateDirectory, `c3-inputs-${runId}.json`));
    checkRemote(git); checkDirty(git); assertSnapshot(readonlySnapshot(root, capture, trust), inputs.snapshot);
    requireGate(JSON.stringify(metadata(original)) === JSON.stringify(inputs.originalMetadata)
      && JSON.stringify(metadata(OLD_ARCHIVE)) === JSON.stringify(inputs.historicalMetadata), 'ORIGINAL_EVIDENCE_CHANGED');
    const scope = guard.migrationScope(root, inputs.snapshot.runtime.api.revision, TARGET);
    requireGate(scope.changed.length === 0, 'MIGRATION_PATH_DIFF');
    state.atomicState(path.join(contract.stateDirectory, 'transaction.json'), { version: 2, phase: 'IN_PROGRESS',
      purpose: 'AUTHORIZED_C3_INITIALIZATION', runId, target: TARGET });
    const archiveBackup = path.join(archiveRoot, BACKUP + '.root-copy');
    const sourceBytes = trust.readPinnedFile(original, { uid: 1002, trustedParent: false });
    requireGate(hash(sourceBytes) === BACKUP_SHA && hash(trust.readPinnedFile(OLD_ARCHIVE, { uid: 1002, trustedParent: false })) === BACKUP_SHA, 'REVERIFIED_BACKUP_HASH');
    writeExclusive(archiveBackup, sourceBytes, trust, contract);
    writeExclusive(path.join(archiveRoot, 'compose-current.yml'), fs.readFileSync(path.join(root, 'docker-compose.yml')), trust, contract);
    writeExclusive(path.join(archiveRoot, 'compose-local.patch'), Buffer.from(git(['diff', '--', 'docker-compose.yml'])), trust, contract);
    const oldCompose = Buffer.from(git(['show', 'HEAD:docker-compose.yml']));
    writeExclusive(path.join(archiveRoot, 'compose-head.yml'), oldCompose, trust, contract);
    const proof = verifier.verifyTransition({ root, target: TARGET, archiveBackup, operationalTuple: tuple, expectedBackupSha256: BACKUP_SHA });
    state.atomicState(path.join(contract.stateDirectory, 'transition-proof.json'), proof);
    console.log('C3_READONLY_ELIGIBILITY=PASS\nARCHIVE_VERIFICATION=PASS\nCOMPOSE_EQUIVALENCE=PASS');
    assertSnapshot(readonlySnapshot(root, capture, trust), inputs.snapshot);
    requireGate(JSON.stringify(metadata(original)) === JSON.stringify(inputs.originalMetadata), 'SOURCE_BEFORE_MOVE');
    assertNoCheckoutFilters(root, git);
    const preservedOriginal = path.join(archiveRoot, BACKUP + '.preserved-original');
    requireGate(absent(preservedOriginal), 'MOVE_DESTINATION_EXISTS');
    // Exact cross-filesystem move; historical UID1002 copy stays untouched. No wildcard/delete.
    run('mv', ['--no-clobber', '--', original, preservedOriginal]);
    requireGate(absent(original) && hash(trust.readPinnedFile(preservedOriginal, { uid: 1002, trustedParent: false })) === BACKUP_SHA
      && metadata(preservedOriginal).mode === inputs.originalMetadata.mode && metadata(preservedOriginal).gid === inputs.originalMetadata.gid, 'PRESERVED_ORIGINAL_VERIFICATION');
    reconcileCheckout({ git, safeCompose: bytes['docker-compose.yml'], oldCompose,
      restoreSafe: safe => { restoreArchivedCompose(path.join(root, 'docker-compose.yml'), oldCompose, safe); console.log('SAFE_COMPOSE_RECOVERY=PASS'); } });
    const floor = { version: 2, phase: 'READY', floorSha: TARGET,
      project: inputs.snapshot.services.db.project, operationalTuple: tuple };
    state.atomicState(path.join(contract.stateDirectory, 'floor.json'), floor);
    state.atomicState(path.join(contract.stateDirectory, 'active.json'), { version: 2, configSha: TARGET, floorSha: TARGET,
      active: inputs.snapshot.runtime, protectedImages: Object.values(inputs.snapshot.runtime).map(i => i.imageId),
      outcome: 'C3_CONFIG_READY', migrationBaseline: inputs.snapshot.runtime.api.revision });
    guard.guardProduction(root, contract.stateDirectory, inputs.snapshot.runtime);
    assertSnapshot(readonlySnapshot(root, capture, trust), inputs.snapshot);
    requireGate(JSON.stringify(metadata(OLD_ARCHIVE)) === JSON.stringify(inputs.historicalMetadata)
      && hash(trust.readPinnedFile(OLD_ARCHIVE, { uid: 1002, trustedParent: false })) === BACKUP_SHA, 'HISTORICAL_EVIDENCE_CHANGED');
    state.atomicState(path.join(contract.stateDirectory, `c3-evidence-${runId}.json`), { version: 2, target: TARGET, runId,
      proof, previousRuntime: inputs.snapshot.runtime, containersUnchanged: true, migrationBaseline: scope.baseline,
      migrationPaths: scope.changed, runMigration: false, originalMetadata: inputs.originalMetadata,
      historicalMetadata: inputs.historicalMetadata, preservedOriginal, outcome: 'C3_PASS' });
    requireGate(guard.assertTransactionOwnership(contract.stateDirectory, runId), 'TRANSACTION_OWNERSHIP');
    const marker = guard.secureJson(path.join(contract.stateDirectory, 'transaction.json'));
    requireGate(marker.purpose === 'AUTHORIZED_C3_INITIALIZATION' && marker.target === TARGET, 'TRANSACTION_PURPOSE');
    fs.unlinkSync(path.join(contract.stateDirectory, 'transaction.json'));
    const parent = fs.openSync(contract.stateDirectory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
    guard.guardProduction(root, contract.stateDirectory, inputs.snapshot.runtime);
    console.log(`CHECKOUT_RECONCILIATION=PASS\nWORKTREE_CLEAN=YES\nCONFIG_FLOOR_VERSION=2\nCONFIG_FLOOR_ACTIVATED=PASS\nC3_CONTAINER_MUTATION=NO\nMIGRATION_PATH_DIFF=0\nRUN_MIG=false\nTARGET_SHA=${TARGET}`);
  } else hold('UNKNOWN_PHASE');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  execute(process.argv[2]).catch(error => { console.error(/^C3_HOLD=[A-Z_]+$/.test(error.message) ? error.message : 'C3_HOLD=VALIDATION_OR_OPERATION_FAILED'); process.exitCode = 1; });
}
