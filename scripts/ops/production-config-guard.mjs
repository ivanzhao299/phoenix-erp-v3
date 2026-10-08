import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { REVISION, IMAGE_ID, executionEnv, captureRuntime } from './capture-production-runtime.mjs';
import { envRecords } from './update-managed-chanjet-env.mjs';
export const CONTRACT = JSON.parse(fs.readFileSync(new URL('./production-config-contract.json', import.meta.url)));
export const MIGRATION_PATHS = ['apps/api/src/database/migrations', 'apps/api/migrations', 'apps/api/ddl', 'migrations', 'scripts/db-migrate.sh', 'scripts/deploy-schema-first.sh'];
export function git(root, args) { return execFileSync('git', ['-c', `safe.directory=${root}`, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
export function requireCleanMain(root, target) {
  if (git(root, ['branch', '--show-current']) !== 'main' || git(root, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('CONFIG_HOLD=WORKTREE_NOT_CLEAN_MAIN');
  if (target && git(root, ['rev-parse', 'HEAD']) !== target) throw new Error('CONFIG_HOLD=TARGET_MISMATCH');
}
export function migrationScope(root, apiRevision, target) {
  if (!REVISION.test(apiRevision) || !REVISION.test(target)) throw new Error('MIGRATION_SCOPE=HOLD');
  try { git(root, ['cat-file', '-e', `${apiRevision}^{commit}`]); git(root, ['merge-base', '--is-ancestor', apiRevision, target]); }
  catch { throw new Error('MIGRATION_SCOPE=HOLD'); }
  return { baseline: apiRevision, target, changed: git(root, ['diff', '--name-only', apiRevision, target, '--', ...MIGRATION_PATHS]).split('\n').filter(Boolean) };
}
export function assertFloor(root, floor, target = git(root, ['rev-parse', 'HEAD']), { targetTree = false } = {}) {
  if (floor.version !== CONTRACT.version || floor.phase !== 'READY' || !REVISION.test(floor.floorSha) || !REVISION.test(target)) throw new Error('CONFIG_HOLD=FLOOR_NOT_READY');
  try { git(root, ['merge-base', '--is-ancestor', floor.floorSha, target]); }
  catch { throw new Error('CONFIG_HOLD=BELOW_FLOOR'); }
  for (const file of CONTRACT.criticalFiles) {
    let approved;
    try { approved = execFileSync('git', ['-c', `safe.directory=${root}`, 'show', `${floor.floorSha}:${file}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { throw new Error('CONFIG_HOLD=FLOOR_CAPABILITY_MISSING'); }
    const current = targetTree
      ? execFileSync('git', ['-c', `safe.directory=${root}`, 'show', `${target}:${file}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
      : fs.readFileSync(path.join(root, file));
    if (!current.equals(approved)) throw new Error('CONFIG_HOLD=FLOOR_CONTRACT_CHANGED');
  }
}
export function assertFloorMonotonic(root, previousFloor, proposedFloor) {
  if (!REVISION.test(previousFloor || '') || !REVISION.test(proposedFloor || '')) throw new Error('CONFIG_HOLD=FLOOR_ANCHOR');
  try { git(root, ['merge-base', '--is-ancestor', previousFloor, proposedFloor]); }
  catch { throw new Error('CONFIG_HOLD=FLOOR_REGRESSION'); }
}
export function rollbackEligibility(root, floor, image) {
  if (!image || !REVISION.test(image.revision) || !IMAGE_ID.test(image.imageId)) return { allowed: false, reason: 'INVALID_RUNTIME_IDENTITY' };
  try {
    git(root, ['merge-base', '--is-ancestor', floor.floorSha, image.revision]);
    // The old executable must carry the same verified gate contracts, not just a descendant label.
    for (const file of CONTRACT.criticalFiles.filter(file => file.startsWith('apps/api/'))) {
      if (git(root, ['show', `${image.revision}:${file}`]) !== git(root, ['show', `${floor.floorSha}:${file}`])) return { allowed: false, reason: 'API_GATE_CONTRACT_CHANGED' };
    }
    return { allowed: true, reason: 'VERIFIED_FLOOR_GATES' };
  } catch { return { allowed: false, reason: 'PRE_FLOOR_API_RECOVERY_HOLD' }; }
}
export function secureJson(file) {
  const metadata = fs.lstatSync(file);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== process.getuid() || (metadata.mode & 0o777) !== 0o600) throw new Error('CONFIG_HOLD=STATE_PERMISSIONS');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export function assertRuntimePins(actual, expected) {
  for (const service of ['api', 'web']) {
    if (actual[service]?.imageId !== expected[service]?.imageId || actual[service]?.revision !== expected[service]?.revision) throw new Error('CONFIG_HOLD=ACTIVE_RUNTIME_DRIFT');
  }
}
export function assertTransactionOwnership(directory, runId) {
  const marker = path.join(directory, 'transaction.json');
  if (!fs.existsSync(marker)) return false;
  const transaction = secureJson(marker);
  if (!runId || transaction.runId !== runId || transaction.phase !== 'IN_PROGRESS') throw new Error('CONFIG_HOLD=UNFINISHED_TRANSACTION');
  return true;
}
export function verifyContext(root, stateDirectory) {
  if (fs.realpathSync(root) !== CONTRACT.repository || fs.realpathSync(stateDirectory) !== CONTRACT.stateDirectory) throw new Error('CONFIG_HOLD=UNAPPROVED_CONTEXT');
  const state = fs.lstatSync(stateDirectory);
  if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== process.getuid() || (state.mode & 0o777) !== 0o700) throw new Error('CONFIG_HOLD=STATE_DIRECTORY');
  // Lock is held by the workflow shell for the whole Git/config/container transaction.
  const lock = fs.statSync(path.join(stateDirectory, 'mutation.lock'));
  const inherited = fs.statSync(`/proc/${process.ppid}/fd/9`);
  if (lock.dev !== inherited.dev || lock.ino !== inherited.ino) throw new Error('CONFIG_HOLD=HOST_LOCK_REQUIRED');
  try { execFileSync('flock', ['-n', path.join(stateDirectory, 'mutation.lock'), 'true'], { stdio: 'ignore' }); }
  catch { return; }
  throw new Error('CONFIG_HOLD=HOST_LOCK_NOT_HELD');
}
export function validateEffectiveConfig(config, tuple) {
  const environment = config.services.api.environment;
  if (environment.CHANJET_READONLY_SYNC_ENABLED !== 'false' || environment.CHANJET_ERP_INBOUND_SYNC_ENABLED !== 'false') throw new Error('CONFIG_HOLD=CHANJET_HOLD_REQUIRED');
  if (tuple.PHOENIX_DATA_MOUNT_GUARD !== 'true' || tuple.CHANJET_READONLY_SYNC_ENABLED !== 'false' || tuple.CHANJET_ERP_INBOUND_SYNC_ENABLED !== 'false') throw new Error('CONFIG_HOLD=APPROVED_TUPLE');
  for (const [service, key, destination] of [['db', 'PHOENIX_PG_DATA_DIR', '/var/lib/postgresql/data'], ['api', 'PHOENIX_UPLOADS_DIR', '/app/uploads']]) {
    const source = tuple[key]; const mount = config.services[service].volumes.find(volume => volume.target === destination);
    if (!source?.startsWith('/data/') || path.normalize(source) !== source || !mount || mount.type !== 'bind' || mount.source !== source) throw new Error('CONFIG_HOLD=STORAGE_TUPLE');
  }
}
export function guardProduction(root, stateDirectory, images) {
  verifyContext(root, stateDirectory); requireCleanMain(root);
  const owningTransaction = assertTransactionOwnership(stateDirectory, process.env.DEPLOY_RUN_ID);
  if (!owningTransaction) assertRuntimePins(captureRuntime(), secureJson(path.join(stateDirectory, 'active.json')).active);
  const floor = secureJson(path.join(stateDirectory, 'floor.json'));
  const priorFloor = secureJson(path.join(stateDirectory, 'active.json')).floorSha;
  assertFloorMonotonic(root, priorFloor, floor.floorSha);
  assertFloor(root, floor);
  const envFile = path.join(root, '.env'); const metadata = fs.lstatSync(envFile);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) throw new Error('CONFIG_HOLD=ENV_PERMISSIONS');
  if (!/^phoenix[a-z0-9_-]*$/.test(floor.project || '')) throw new Error('CONFIG_HOLD=APPROVED_PROJECT');
  const requiredKeys = ['PHOENIX_DATA_MOUNT_GUARD', 'PHOENIX_PG_DATA_DIR', 'PHOENIX_UPLOADS_DIR', 'CHANJET_READONLY_SYNC_ENABLED', 'CHANJET_ERP_INBOUND_SYNC_ENABLED'];
  if (JSON.stringify(Object.keys(floor.operationalTuple || {}).sort()) !== JSON.stringify(requiredKeys.sort())) throw new Error('CONFIG_HOLD=TUPLE_KEYS');
  const records = envRecords(fs.readFileSync(envFile, 'utf8'));
  for (const [key, value] of Object.entries(floor.operationalTuple || {})) {
    if (records.find(record => record.key === key)?.raw.trimEnd() !== `${key}=${value}`) throw new Error('CONFIG_HOLD=ENV_TUPLE_CHANGED');
  }
  const env = { ...executionEnv(), API_IMAGE: images.api.imageId, WEB_IMAGE: images.web.imageId };
  execFileSync('bash', ['scripts/ops/require-phoenix-data-mount.sh'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const config = JSON.parse(execFileSync('docker', ['compose', '--project-name', floor.project, '--env-file', envFile, '-f', path.join(root, 'docker-compose.yml'), 'config', '--format', 'json'], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  validateEffectiveConfig(config, floor.operationalTuple);
  const hold = execFileSync('docker', ['inspect', 'phoenix-v3-api', '--format', '{{range .Config.Env}}{{if eq . "CHANJET_READONLY_SYNC_ENABLED=false"}}{{println "readonly=false"}}{{end}}{{if eq . "CHANJET_ERP_INBOUND_SYNC_ENABLED=false"}}{{println "inbound=false"}}{{end}}{{end}}'], { env: executionEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (hold.split(/\s+/).sort().join(',') !== 'inbound=false,readonly=false') throw new Error('CONFIG_HOLD=LIVE_CHANJET_FLAGS');
  for (const service of ['db', 'api', 'web']) {
    const project = execFileSync('docker', ['inspect', `phoenix-v3-${service}`, '--format', '{{ index .Config.Labels "com.docker.compose.project" }}'], { env: executionEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (project !== floor.project) throw new Error('CONFIG_HOLD=LIVE_PROJECT_MISMATCH');
  }
  // Compare approved paths to actual current mounts, not just existing directories.
  for (const [service, key, destination] of [['db', 'PHOENIX_PG_DATA_DIR', '/var/lib/postgresql/data'], ['api', 'PHOENIX_UPLOADS_DIR', '/app/uploads']]) {
    const mounts = JSON.parse(execFileSync('docker', ['inspect', `phoenix-v3-${service}`, '--format', '{{json .Mounts}}'], { env: executionEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    if (!mounts.some(mount => mount.Type === 'bind' && mount.Destination === destination && mount.Source === floor.operationalTuple[key])) throw new Error('CONFIG_HOLD=LIVE_MOUNT_MISMATCH');
  }
  return floor;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = fs.realpathSync(process.cwd());
    const images = secureJson(path.join(CONTRACT.stateDirectory, 'active.json')).active;
    const floor = guardProduction(root, CONTRACT.stateDirectory, images);
    if (process.argv[2] === '--target') assertFloor(root, floor, process.argv[3], { targetTree: true });
    console.log('PRODUCTION_CONFIG_GUARD=PASS');
  } catch { console.error('PRODUCTION_CONFIG_GUARD=HOLD'); process.exitCode = 1; }
}
