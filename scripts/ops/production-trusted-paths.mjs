import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const hold = reason => { throw new Error(`CONFIG_HOLD=${reason}`); };
export function validateContract(contract) {
  if (![2, 3].includes(contract.version) || contract.executionUid !== 0 || !/^\/var\/lib\/[a-z0-9-]+$/.test(contract.controlRoot || '')
    || contract.stateDirectory !== path.join(contract.controlRoot, 'production-deployment-state')
    || contract.archiveDirectory !== path.join(contract.controlRoot, 'production-checkout-recovery')
    || JSON.stringify(contract.controlMounts) !== JSON.stringify([{ target: '/', root: '/', filesystem: 'ext4' }])) hold('CONTROL_CONTRACT');
  return contract;
}
export function ancestors(directory) {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory || (directory !== '/' && directory.endsWith('/'))) hold('NONCANONICAL_PATH');
  const result = ['/']; let current = '';
  for (const segment of directory.split('/').filter(Boolean)) { current += `/${segment}`; result.push(current); }
  return result;
}
const decodeMount = value => value.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
export function parseMountInfo(source) {
  return source.trim().split('\n').map(line => {
    const [left, right] = line.split(' - '); const parts = left?.split(' '); const extra = right?.split(' ');
    if (!extra || parts.length < 6 || extra.length < 3 || !/^\d+$/.test(parts[0])) hold('MOUNTINFO_UNAVAILABLE');
    return { id: parts[0], device: parts[2], root: decodeMount(parts[3]), target: decodeMount(parts[4]), filesystem: extra[0] };
  });
}
export function readACLs(directories) {
  // Linux POSIX ACL xattrs are metadata, not file contents. No extra server package/install is required.
  const source = `import os,errno,json,sys\nr=[]\nfor p in json.loads(sys.argv[1]):\n a=[]\n for n in ['system.posix_acl_access','system.posix_acl_default']:\n  try:\n   os.getxattr(p,n,follow_symlinks=False);a.append(True)\n  except OSError as e:\n   if e.errno!=errno.ENODATA: raise\n   a.append(False)\n r.append(a)\nprint(json.dumps(r))\n`;
  try { return JSON.parse(execFileSync('/usr/bin/python3', ['-I', '-S', '-c', source, JSON.stringify(directories)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch { hold('ACL_METADATA_UNAVAILABLE'); }
}
export function validateDirectorySnapshots(directory, snapshots, mounts, acls, contract) {
  validateContract(contract); const names = ancestors(directory);
  if (snapshots.length !== names.length || acls.length !== names.length) hold('PATH_METADATA_UNAVAILABLE');
  for (let i = 0; i < names.length; i++) {
    const stat = snapshots[i];
    if (!stat.directory || stat.symlink || stat.realpath !== names[i]) hold('PATH_SYMLINK_OR_TYPE');
    if (stat.uid !== 0 || (stat.mode & 0o022)) hold('UNTRUSTED_ANCESTOR');
    if (!Array.isArray(acls[i]) || acls[i].length !== 2 || acls[i].some(present => present !== false)) hold('EXTENDED_ACL');
    if (names[i] === contract.controlRoot || names[i].startsWith(contract.controlRoot + '/')) {
      if ((stat.mode & 0o7777) !== 0o700) hold('CONTROL_DIRECTORY_MODE');
    }
  }
  const relevant = mounts.filter(mount => names.includes(mount.target) || mount.target === contract.controlRoot || mount.target.startsWith(contract.controlRoot + '/'));
  if (!relevant.length || relevant.some(mount => !contract.controlMounts.some(allowed => allowed.target === mount.target && allowed.root === mount.root && allowed.filesystem === mount.filesystem))) hold('UNEXPECTED_CONTROL_MOUNT');
  if (new Set(relevant.map(mount => mount.target)).size !== relevant.length) hold('STACKED_CONTROL_MOUNT');
  return snapshots.map((stat, i) => ({ path: names[i], dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode,
    mounts: relevant.map(({ id, device, target, root, filesystem }) => ({ id, device, target, root, filesystem })) }));
}
export function inspectTrustedDirectory(directory, contract, dependencies = {}) {
  const io = dependencies.fs || fs; const names = ancestors(directory);
  try {
    const snapshots = names.map(name => { const stat = io.lstatSync(name); return { directory: stat.isDirectory(), symlink: stat.isSymbolicLink(), realpath: io.realpathSync(name), uid: stat.uid, mode: stat.mode, dev: stat.dev, ino: stat.ino }; });
    const mounts = (dependencies.mounts || (() => parseMountInfo(fs.readFileSync('/proc/self/mountinfo', 'utf8'))))();
    const acls = (dependencies.acls || readACLs)(names);
    return validateDirectorySnapshots(directory, snapshots, mounts, acls, contract);
  } catch (error) { if (error.message.startsWith('CONFIG_HOLD=')) throw error; hold('PATH_METADATA_UNAVAILABLE'); }
}
export function assertSameDirectory(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) hold('PATH_CHANGED_DURING_OPERATION');
}
export function assertRegularFile(stat, { uid = 0, mode = 0o600 } = {}) {
  if (!stat.isFile() || stat.isSymbolicLink?.() || stat.uid !== uid || (stat.mode & 0o7777) !== mode || stat.nlink !== 1) hold('FILE_PERMISSIONS_OR_LINK');
}
const identity = stat => [stat.dev, stat.ino, stat.uid, stat.mode, stat.nlink, stat.size, stat.mtimeMs, stat.ctimeMs];
export function readPinnedFile(file, { contract, uid = 0, trustedParent = true } = {}, dependencies = {}) {
  const io = dependencies.fs || fs; const inspect = dependencies.inspectDirectory || (directory => inspectTrustedDirectory(directory, contract));
  const before = trustedParent ? inspect(path.dirname(file)) : undefined;
  let fd;
  try {
    const initial = io.lstatSync(file); assertRegularFile(initial, { uid });
    fd = io.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = io.fstatSync(fd); assertRegularFile(opened, { uid });
    if (JSON.stringify(identity(initial)) !== JSON.stringify(identity(opened))) hold('FILE_CHANGED_BEFORE_READ');
    const bytes = io.readFileSync(fd);
    const after = io.fstatSync(fd); const named = io.lstatSync(file);
    assertRegularFile(after, { uid }); assertRegularFile(named, { uid });
    if (JSON.stringify(identity(opened)) !== JSON.stringify(identity(after)) || JSON.stringify(identity(after)) !== JSON.stringify(identity(named))) hold('FILE_CHANGED_DURING_READ');
    if (trustedParent) assertSameDirectory(before, inspect(path.dirname(file)));
    return bytes;
  } catch (error) { if (error.message.startsWith('CONFIG_HOLD=')) throw error; hold('FILE_READ_FAILED'); }
  finally { if (fd !== undefined) io.closeSync(fd); }
}
export function assertContained(file, root) {
  if (!path.isAbsolute(file) || path.normalize(file) !== file || !file.startsWith(root + '/') || !path.relative(root, file) || file.endsWith('/')) hold('ARCHIVE_OUTSIDE_APPROVED_ROOT');
}
export function assertRootIdentity(contract, uid = process.getuid()) {
  validateContract(contract); if (uid !== contract.executionUid) hold('ROOT_ACTIONS_IDENTITY_REQUIRED');
}
export function assertNoLegacyState(contract, io = fs) {
  if (io.existsSync(contract.legacyStateDirectory) || io.lstatSync?.(contract.legacyStateDirectory, { throwIfNoEntry: false })) hold('LEGACY_STATE_RECONCILIATION_REQUIRED');
}
export function bootstrapPreflight(contract, dependencies = {}) {
  assertRootIdentity(contract, dependencies.uid ?? process.getuid());
  const io = dependencies.fs || fs;
  if ((dependencies.root || io.realpathSync(process.cwd())) !== contract.repository) hold('UNAPPROVED_REPOSITORY_CONTEXT');
  assertNoLegacyState(contract, io);
  const inspect = dependencies.inspectDirectory || (directory => inspectTrustedDirectory(directory, contract));
  inspect(contract.stateDirectory); inspect(contract.archiveDirectory);
  // Must already be initialized by separately authorized C3. Never create/truncate a lock at admission.
  readPinnedFile(path.join(contract.stateDirectory, 'mutation.lock'), { contract }, { ...dependencies, inspectDirectory: inspect });
  return contract.stateDirectory;
}
export function strictSshCommand(base = '', program = '') {
  if (program && !['ssh', '/usr/bin/ssh'].includes(program)) hold('CUSTOM_GIT_SSH_REVIEW_REQUIRED');
  const selected = base || program || 'ssh';
  const match = selected.match(/^(ssh|\/usr\/bin\/ssh)(?:\s+([\s\S]*))?$/);
  if (!match || /[\r\n;&|`$<>\\]/.test(selected)) hold('CUSTOM_GIT_SSH_REVIEW_REQUIRED');
  // Mandatory options come first: OpenSSH uses the first value. Existing -i/-F and config identity selection stay intact.
  return `${match[1]} -oBatchMode=yes -oStrictHostKeyChecking=yes -oUpdateHostKeys=no -oControlMaster=no -oControlPath=none -oConnectTimeout=10${match[2] ? ' ' + match[2] : ''}`;
}

/** Linux fdinfo lists flock locks belonging to this actual open description.
 * A lock held by another process on another open description is insufficient.
 * Standalone use proves only a local lock; callers retain root/path authority. */
export function assertWorkflowFd9Lock(file,holderPid){
 if(process.platform!=='linux'||!Number.isSafeInteger(holderPid)||holderPid<=1)hold('WORKFLOW_FD9_HOLDER_REQUIRED');
 const fd=`/proc/${holderPid}/fd/9`,info=`/proc/${holderPid}/fdinfo/9`,uid=process.getuid();
 const pin=s=>[s.dev,s.ino,s.uid,s.mode,s.nlink];
 const sample=()=>{
  const named=fs.lstatSync(file),opened=fs.statSync(fd);assertRegularFile(named,{uid});assertRegularFile(opened,{uid});
  if(JSON.stringify(pin(named))!==JSON.stringify(pin(opened)))hold('HOST_LOCK_REQUIRED');
  const lines=fs.readFileSync(info,'utf8').split('\n').filter(line=>line.startsWith('lock:'));
  if(lines.length!==1)hold('WORKFLOW_FD9_NOT_LOCK_OWNER');
  const match=/^lock:\s+\d+:\s+FLOCK\s+ADVISORY\s+WRITE\s+[0-9]+\s+[a-f0-9]+:[a-f0-9]+:([0-9]+)\s+0\s+EOF$/.exec(lines[0]);
  if(!match||match[1]!==String(opened.ino))hold('WORKFLOW_FD9_NOT_LOCK_OWNER');
  return {pin:pin(named),lock:lines[0]};
 };
 try{if(JSON.stringify(sample())!==JSON.stringify(sample()))hold('WORKFLOW_FD9_LOCK_CHANGED');}
 catch(error){if(error.message.startsWith('CONFIG_HOLD='))throw error;hold('WORKFLOW_FD9_LOCK_UNVERIFIED');}
}
