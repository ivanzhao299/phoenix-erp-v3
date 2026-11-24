import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CONTRACT } from './production-config-guard.mjs';
import { ancestors, assertRegularFile, inspectTrustedDirectory, parseMountInfo, readACLs } from './production-trusted-paths.mjs';

export const physicalParent = '/data/backups/opt/phoenix-erp-backups';
const alias = '/opt/phoenix-erp-backups';
export const volumeUuid = '834b8d17-5559-4167-b19d-daafd37a1cde';
const hold = reason => { throw Error('BACKUP_PATH_HOLD=' + reason); };
const beneath = (name, parent) => name === parent || name.startsWith(parent + '/');

// The legacy name is checked only as metadata. All archive I/O uses the
// canonical directory, whose dedicated volume is pinned separately from state.
export function physicalPins(directory, {
  io = fs, acls = readACLs,
  optPins = () => inspectTrustedDirectory('/opt', CONTRACT),
  mountInfo = () => parseMountInfo(io.readFileSync('/proc/self/mountinfo', 'utf8')),
  mountedVolume = () => execFileSync('/usr/bin/findmnt', ['--noheadings', '--raw', '--output', 'UUID,MAJ:MIN', '--mountpoint', '/data'],
    { encoding: 'utf8', timeout: 5000 }).trim(),
} = {}) {
  if (directory !== physicalParent && !/^pending-migration-[0-9]+-[0-9]+$/.test(path.basename(directory))) hold('NAMESPACE');
  if (directory !== physicalParent && path.dirname(directory) !== physicalParent) hold('NAMESPACE');
  const opt = optPins();
  const link = io.lstatSync(alias);
  if (!link.isSymbolicLink() || link.uid !== 0 || io.realpathSync(alias) !== physicalParent) hold('BACKUP_ALIAS');
  const names = ancestors(directory);
  const mounts = mountInfo().filter(m => names.includes(m.target) || beneath(m.target, physicalParent));
  const data = mounts.find(m => m.target === '/data');
  const root = mounts.find(m => m.target === '/');
  if (mounts.length !== 2 || !root || !data || root.device === data.device ||
      mounts.some(m => m.root !== '/' || m.filesystem !== 'ext4') ||
      mountedVolume().trim().split(/\s+/).join(' ') !== volumeUuid + ' ' + data.device) hold('BACKUP_VOLUME');
  const uuidDevice = io.statSync('/dev/disk/by-uuid/' + volumeUuid);
  if (!uuidDevice.isBlockDevice()) hold('BACKUP_UUID_DEVICE');
  const devNumber = BigInt(uuidDevice.rdev);
  const major = ((devNumber >> 8n) & 0xfffn) | ((devNumber >> 32n) & ~0xfffn);
  const minor = (devNumber & 0xffn) | ((devNumber >> 12n) & ~0xffn);
  if (data.device !== major + ':' + minor) hold('BACKUP_DEVICE_ID');
  const permissions = acls(names);
  if (permissions.length !== names.length) hold('ACL_METADATA');
  const chain = names.map((name, i) => {
    const stat = io.lstatSync(name);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) ||
        io.realpathSync(name) !== name || (beneath(name, physicalParent) && (stat.mode & 0o7777) !== 0o700)) hold('PHYSICAL_DIRECTORY');
    if (!Array.isArray(permissions[i]) || permissions[i].length !== 2 || permissions[i].some(value => value !== false)) hold('PHYSICAL_ACL');
    return { name, dev:stat.dev, ino:stat.ino, mode:stat.mode, uid:stat.uid };
  });
  if (chain[1].dev !== uuidDevice.rdev || chain[0].dev === chain[1].dev || chain.slice(1).some(s => s.dev !== chain[1].dev)) hold('BACKUP_DEVICE');
  return { chain, mounts, volumeUuid, opt, alias:{ dev:link.dev, ino:link.ino } };
}

export function archiveEvidence(directory, runId, target, expectedDigest, io = fs) {
  if (directory !== path.join(physicalParent, 'pending-migration-' + runId) ||
      !/^[0-9]+-[0-9]+$/.test(runId) || !/^[a-f0-9]{40}$/.test(target) || !/^[a-f0-9]{64}$/.test(expectedDigest)) hold('ARCHIVE_INPUT');
  const archive = path.join(directory, 'phoenix_erp_pre_' + target.slice(0, 12) + '.dump');
  const pin = s => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs];
  const identity = s => pin(s).join(':');
  const before = io.lstatSync(archive);
  assertRegularFile(before);
  const fd = io.openSync(archive, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = io.fstatSync(fd);
    assertRegularFile(opened);
    if (identity(before) !== identity(opened) || !opened.size) hold('ARCHIVE_IDENTITY');
    const chunk = Buffer.alloc(1024 * 1024), hash = createHash('sha256');
    let length;
    while ((length = io.readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, length));
    if (hash.digest('hex') !== expectedDigest || identity(opened) !== identity(io.fstatSync(fd)) ||
        identity(opened) !== identity(io.lstatSync(archive))) hold('ARCHIVE_CHANGED');
    io.fsyncSync(fd);
    return {schema:'phoenix.vet-1124-migration-backup/v1', runId, sourceSha:target, archive, archivePin:pin(opened), bytes:opened.size, sha256:expectedDigest, volumeUuid};
  } finally { io.closeSync(fd); }
}
