import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { git, CONTRACT } from './production-config-guard.mjs';
import { envRecords } from './update-managed-chanjet-env.mjs';
import { assertRootIdentity, assertContained, readPinnedFile, assertNoLegacyState } from './production-trusted-paths.mjs';
import { REVISION } from './capture-production-runtime.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function verifyTransition({ root, target, archiveBackup, operationalTuple, expectedBackupSha256 }, dependencies = {}) {
  if (!REVISION.test(target) || git(root, ['rev-parse', 'origin/main']) !== target || git(root, ['branch', '--show-current']) !== 'main') throw new Error('TRANSITION_HOLD=TARGET');
  const declared = JSON.parse(git(root, ['show', `${target}:scripts/ops/production-config-contract.json`]));
  if (JSON.stringify(declared) !== JSON.stringify(CONTRACT)) throw new Error('TRANSITION_HOLD=TARGET_CONTRACT');
  for (const file of CONTRACT.criticalFiles) git(root, ['cat-file', '-e', `${target}:${file}`]);
  const previous = git(root, ['rev-parse', 'HEAD']); git(root, ['merge-base', '--is-ancestor', previous, target]);
  const backupName = '.env.pre-verification-20261005T114700+08:00';
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean);
  // git() trims leading whitespace from the first porcelain line; match path/status explicitly.
  if (dirty.length !== 2 || !dirty.some(line => /^ ?M docker-compose.yml$/.test(line)) || !dirty.some(line => line === `?? ${backupName}`)) throw new Error('TRANSITION_HOLD=UNKNOWN_DIRT');
  const tracked = git(root, ['show', 'HEAD:docker-compose.yml']) + '\n';
  const needle = '      CHANJET_MSG_SECRET: ${CHANJET_MSG_SECRET:-}\n';
  if (!tracked.includes(needle)) throw new Error('TRANSITION_HOLD=BASE_COMPOSE');
  const equivalent = tracked.replace(needle, needle + '      CHANJET_READONLY_SYNC_ENABLED: ${CHANJET_READONLY_SYNC_ENABLED:-false}\n      CHANJET_ERP_INBOUND_SYNC_ENABLED: ${CHANJET_ERP_INBOUND_SYNC_ENABLED:-false}\n');
  const current = fs.readFileSync(path.join(root, 'docker-compose.yml'));
  const targetCompose = git(root, ['show', `${target}:docker-compose.yml`]) + '\n';
  if (!current.equals(Buffer.from(equivalent)) || !current.equals(Buffer.from(targetCompose))) throw new Error('TRANSITION_HOLD=COMPOSE_NOT_EQUIVALENT');
  const records = envRecords(fs.readFileSync(path.join(root, '.env'), 'utf8'));
  const keys = ['PHOENIX_DATA_MOUNT_GUARD','PHOENIX_PG_DATA_DIR','PHOENIX_UPLOADS_DIR','CHANJET_READONLY_SYNC_ENABLED','CHANJET_ERP_INBOUND_SYNC_ENABLED'];
  if (JSON.stringify(Object.keys(operationalTuple).sort()) !== JSON.stringify(keys.sort())) throw new Error('TRANSITION_HOLD=TUPLE');
  for (const key of keys) if (records.find(record => record.key === key)?.raw.trimEnd() !== `${key}=${operationalTuple[key]}`) throw new Error('TRANSITION_HOLD=ENV_TUPLE');
  if (operationalTuple.PHOENIX_DATA_MOUNT_GUARD !== 'true' || operationalTuple.CHANJET_READONLY_SYNC_ENABLED !== 'false' || operationalTuple.CHANJET_ERP_INBOUND_SYNC_ENABLED !== 'false' || !operationalTuple.PHOENIX_PG_DATA_DIR.startsWith('/data/') || !operationalTuple.PHOENIX_UPLOADS_DIR.startsWith('/data/')) throw new Error('TRANSITION_HOLD=REQUIRED_HOLD_STORAGE');
  if (!/^[a-f0-9]{64}$/.test(expectedBackupSha256 || '')) throw new Error('TRANSITION_HOLD=APPROVED_BACKUP_HASH_REQUIRED');
  const source = path.join(root, backupName); const sourceMetadata = fs.lstatSync(source);
  // Original UID1002 evidence is read via a pinned no-follow FD, never rewritten/chowned.
  const sourceBytes = readPinnedFile(source, { uid: sourceMetadata.uid, trustedParent: false });
  const archiveBytes = (dependencies.readArchive || (file => {
    assertRootIdentity(CONTRACT); assertNoLegacyState(CONTRACT); assertContained(file, CONTRACT.archiveDirectory);
    return readPinnedFile(file, { contract: CONTRACT });
  }))(archiveBackup);
  const sourceAfter = fs.lstatSync(source);
  if ([sourceMetadata.dev,sourceMetadata.ino,sourceMetadata.size,sourceMetadata.mtimeMs].join(':') !== [sourceAfter.dev,sourceAfter.ino,sourceAfter.size,sourceAfter.mtimeMs].join(':')) throw new Error('TRANSITION_HOLD=SOURCE_CHANGED');
  const digest = hash(sourceBytes);
  if (digest !== expectedBackupSha256 || digest !== hash(archiveBytes)) throw new Error('TRANSITION_HOLD=BACKUP_HASH');
  return { version: CONTRACT.version, executionUid: CONTRACT.executionUid, archiveDirectory: CONTRACT.archiveDirectory, archiveBackup,
    target, previous, composeSha256: hash(current), backupSha256: digest, backupInode: sourceMetadata.ino, backupSize: sourceMetadata.size, compositionEquivalent: true, archiveVerified: true,
    recoveryAuthorized: false, composeDuringIntermediateStateAllowed: false };

}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = fs.realpathSync(process.cwd()); if (root !== CONTRACT.repository) throw new Error('TRANSITION_HOLD=CONTEXT');
    assertRootIdentity(CONTRACT); assertContained(process.argv[3], CONTRACT.archiveDirectory);
    const tuple = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
    console.log(JSON.stringify(verifyTransition({ root, target: process.argv[2], archiveBackup: process.argv[3], operationalTuple: tuple, expectedBackupSha256: process.argv[5] })));
  } catch { console.error('TRANSITION_ELIGIBILITY=HOLD'); process.exitCode = 1; }
}
