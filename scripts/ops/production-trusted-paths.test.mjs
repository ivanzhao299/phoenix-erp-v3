import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CONTRACT, assertStateVersion } from './production-config-guard.mjs';
import { ancestors, validateDirectorySnapshots, parseMountInfo, assertSameDirectory, assertRegularFile, assertContained,
  readPinnedFile, strictSshCommand, bootstrapPreflight, assertRootIdentity } from './production-trusted-paths.mjs';
import { atomicState } from './production-deployment-state.mjs';

function model(directory = CONTRACT.stateDirectory) {
  const names = ancestors(directory);
  return { directory, snapshots: names.map((name, i) => ({ directory: true, symlink: false, realpath: name, uid: 0, mode: name === CONTRACT.controlRoot || name.startsWith(CONTRACT.controlRoot + '/') ? 0o700 : 0o755, dev: 1, ino: i + 1 })),
    mounts: [{ id: '1', target: '/', root: '/', filesystem: 'ext4', device: '1:1' }], acls: names.map(() => [false, false]) };
}
const validate = fixture => validateDirectorySnapshots(fixture.directory, fixture.snapshots, fixture.mounts, fixture.acls, CONTRACT);
const metadata = overrides => ({ uid: 0, mode: 0o600, nlink: 1, isFile: () => true, isSymbolicLink: () => false, ...overrides });
function temporary(run) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-trust-')); try { return run(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
function stateIO(dir, inspectDirectory = () => [{ path: dir }]) {
  const rootStat = stat => Object.assign(Object.create(stat), { uid: 0 });
  return { contract: { ...CONTRACT, stateDirectory: dir }, inspectDirectory,
    fs: { ...fs, fstatSync: fd => rootStat(fs.fstatSync(fd)), lstatSync: (...args) => rootStat(fs.lstatSync(...args)) } };
}

test('v2 root-controlled complete ancestor chain and exact control directory modes pass', () => {
  assert.equal(CONTRACT.version, 2); assert.equal(CONTRACT.executionUid, 0);
  assert.equal(validate(model()).length, ancestors(CONTRACT.stateDirectory).length);
  assert.equal(validate(model(CONTRACT.archiveDirectory)).length, ancestors(CONTRACT.archiveDirectory).length);
});
for (const mode of [0o700, 0o750, 0o755]) test(`UID1002-owned parent ${mode.toString(8)} fails despite a root-owned 0700 leaf`, () => {
  const fixture = model(); fixture.snapshots[2].uid = 1002; fixture.snapshots[2].mode = mode;
  assert.throws(() => validate(fixture), /UNTRUSTED_ANCESTOR/);
});
test('group or world writable ancestors are rejected', () => {
  for (const mode of [0o775, 0o777, 0o1777]) { const f = model(); f.snapshots[1].mode = mode; assert.throws(() => validate(f), /UNTRUSTED_ANCESTOR/); }
});
test('symlink ancestors and canonical path substitution fail closed', () => {
  const f = model(); f.snapshots[2].symlink = true; assert.throws(() => validate(f), /PATH_SYMLINK/);
  f.snapshots[2].symlink = false; f.snapshots[2].realpath = '/elsewhere'; assert.throws(() => validate(f), /PATH_SYMLINK/);
  assert.throws(() => ancestors('/var/lib/../lib/phoenix-erp'), /NONCANONICAL/);
});
test('same-device bind, nested control mounts and unknown root filesystem are rejected', () => {
  for (const mount of [{ id: '2', target: '/var', root: '/elsewhere', filesystem: 'ext4', device: '1:1' },
    { id: '2', target: CONTRACT.archiveDirectory + '/nested', root: '/', filesystem: 'ext4', device: '1:1' }]) {
    const f = model(); f.mounts.push(mount); assert.throws(() => validate(f), /UNEXPECTED_CONTROL_MOUNT/);
  }
  const f = model(); f.mounts[0].filesystem = 'nfs'; assert.throws(() => validate(f), /UNEXPECTED_CONTROL_MOUNT/);
});
test('mount parsing handles kernel escapes and rejects missing or stacked mount information', () => {
  const parsed = parseMountInfo('1 0 1:1 / / rw - ext4 /dev/fixture rw\n2 1 1:1 /with\\040space /var/lib/with\\040space rw - ext4 /dev/fixture rw');
  assert.equal(parsed[1].root, '/with space'); assert.equal(parsed[1].target, '/var/lib/with space');
  assert.throws(() => parseMountInfo(''), /MOUNTINFO_UNAVAILABLE/);
  const f = model(); f.mounts.push({ ...f.mounts[0], id: '2' }); assert.throws(() => validate(f), /STACKED_CONTROL_MOUNT/);
});
test('extended access/default ACLs and unavailable ACL metadata hold', () => {
  for (const acl of [[true, false], [false, true], undefined, []]) { const f = model(); f.acls[1] = acl; assert.throws(() => validate(f), /EXTENDED_ACL/); }
  const f = model(); f.acls.pop(); assert.throws(() => validate(f), /PATH_METADATA_UNAVAILABLE/);
});
test('wrong state owner and wrong archive owner both fail the root file contract', () => {
  for (const label of ['state', 'archive']) assert.throws(() => assertRegularFile(metadata({ uid: 1002, label })), /FILE_PERMISSIONS/);
  assertRegularFile(metadata());
});
test('wrong state file mode, hardlink and symlink are rejected', () => {
  for (const mode of [0o644, 0o640, 0o400, 0o4600]) assert.throws(() => assertRegularFile(metadata({ mode })), /FILE_PERMISSIONS/);
  assert.throws(() => assertRegularFile(metadata({ nlink: 2 })), /FILE_PERMISSIONS/);
  assert.throws(() => assertRegularFile(metadata({ isSymbolicLink: () => true })), /FILE_PERMISSIONS/);
  const f = model(); f.snapshots.at(-1).mode = 0o750; assert.throws(() => validate(f), /CONTROL_DIRECTORY_MODE/);
});
test('archive canonical containment rejects legacy HOME paths and prefix lookalikes', () => {
  assertContained(CONTRACT.archiveDirectory + '/run/backup.env', CONTRACT.archiveDirectory);
  for (const file of [CONTRACT.archiveDirectory + '-other/backup.env', CONTRACT.archiveDirectory + '/../backup.env', '/home/phoenix-codex-deploy/production-checkout-recovery/copy.env']) assert.throws(() => assertContained(file, CONTRACT.archiveDirectory), /OUTSIDE_APPROVED/);
});
test('root execution cannot be replaced by the current non-root test UID or v1 contract', () => {
  assertRootIdentity(CONTRACT, 0);
  assert.throws(() => assertRootIdentity(CONTRACT, 1002), /ROOT_ACTIONS_IDENTITY/);
  assert.throws(() => assertRootIdentity({ ...CONTRACT, version: 1 }, 0), /CONTROL_CONTRACT/);
  assert.throws(() => assertStateVersion({ version: 1 }), /STATE_VERSION/);
});
test('renamed ancestors or mount remapping during an operation HOLD', () => {
  const before = validate(model()); const moved = structuredClone(before); moved.at(-1).ino++;
  assert.throws(() => assertSameDirectory(before, moved), /PATH_CHANGED/);
  moved.at(-1).ino--; moved[0].mounts[0].id = '2'; assert.throws(() => assertSameDirectory(before, moved), /PATH_CHANGED/);
});
test('pinned reads retain original bytes/inode/mode; original evidence need not be root-owned', () => temporary(dir => {
  const file = path.join(dir, 'original.env'); fs.writeFileSync(file, 'FAKE_BACKUP', { mode: 0o600 }); const before = fs.statSync(file);
  const bytes = readPinnedFile(file, { uid: before.uid, trustedParent: false }); assert.equal(bytes.toString(), 'FAKE_BACKUP');
  const after = fs.statSync(file); for (const key of ['uid', 'ino', 'mode', 'mtimeMs']) assert.equal(after[key], before[key]);
}));
test('source symlink and replacement between lstat/open fail', () => temporary(dir => {
  const file = path.join(dir, 'copy'); const other = path.join(dir, 'other'); fs.writeFileSync(file, 'A', { mode: 0o600 }); fs.writeFileSync(other, 'B', { mode: 0o600 });
  const io = { ...fs, openSync(name, flags) { fs.renameSync(file, file + '.old'); fs.renameSync(other, file); return fs.openSync(name, flags); } };
  assert.throws(() => readPinnedFile(file, { uid: process.getuid(), trustedParent: false }, { fs: io }), /FILE_CHANGED_BEFORE/);
  fs.symlinkSync(file, path.join(dir, 'link')); assert.throws(() => readPinnedFile(path.join(dir, 'link'), { uid: process.getuid(), trustedParent: false }), /FILE_PERMISSIONS/);
}));
test('replacement after FD open cannot substitute read bytes or pass the final identity check', () => temporary(dir => {
  const file = path.join(dir, 'copy'); fs.writeFileSync(file, 'ORIGINAL', { mode: 0o600 });
  const io = { ...fs, readFileSync(fd) { const bytes = fs.readFileSync(fd); fs.renameSync(file, file + '.old'); fs.writeFileSync(file, 'NEW', { mode: 0o600 }); return bytes; } };
  assert.throws(() => readPinnedFile(file, { uid: process.getuid(), trustedParent: false }, { fs: io }), /FILE_CHANGED_DURING/);
}));
test('parent inode substitution during a pinned read fails', () => temporary(dir => {
  const file = path.join(dir, 'copy'); fs.writeFileSync(file, 'A', { mode: 0o600 }); let count = 0;
  assert.throws(() => readPinnedFile(file, { uid: process.getuid() }, { inspectDirectory: () => [{ ino: ++count }] }), /PATH_CHANGED/);
}));
test('state atomic write refuses a changed parent before rename and preserves existing marker', () => temporary(dir => {
  const file = path.join(dir, 'transaction.json'); const deps = stateIO(dir); atomicState(file, { marker: 'ORIGINAL' }, deps);
  let count = 0;
  assert.throws(() => atomicState(file, { marker: 'NEW' }, stateIO(dir, () => [{ ino: ++count }])), /PATH_CHANGED/);
  assert.equal(JSON.parse(fs.readFileSync(file)).marker, 'ORIGINAL'); assert.deepEqual(fs.readdirSync(dir), ['transaction.json']);
}));
test('failed write/fsync retains previous marker and cleans only its owned temporary', () => temporary(dir => {
  const file = path.join(dir, 'transaction.json'); const deps = stateIO(dir); atomicState(file, { marker: 'ORIGINAL' }, deps);
  deps.fs.fsyncSync = () => { throw Error('synthetic disk failure'); };
  assert.throws(() => atomicState(file, { marker: 'NEW' }, deps), /synthetic/);
  assert.equal(JSON.parse(fs.readFileSync(file)).marker, 'ORIGINAL'); assert.deepEqual(fs.readdirSync(dir), ['transaction.json']);
}));
test('strict SSH preserves selected identity options and rejects opaque alternate authentication programs', () => {
  const command = strictSshCommand("ssh -i '/approved/identity path' -oIdentitiesOnly=yes -oStrictHostKeyChecking=no");
  assert.match(command, /StrictHostKeyChecking=yes.*StrictHostKeyChecking=no/); assert.match(command, /-i '\/approved\/identity path'/);
  assert.throws(() => strictSshCommand('sshpass -p fake ssh'), /CUSTOM_GIT_SSH/);
  assert.throws(() => strictSshCommand('ssh; echo unsafe'), /CUSTOM_GIT_SSH/);
  assert.throws(() => strictSshCommand('', '/unreviewed/program'), /CUSTOM_GIT_SSH/);
});
test('OpenSSH resolves mandatory strict policy ahead of preexisting weaker options', () => {
  const command = strictSshCommand('ssh -oStrictHostKeyChecking=no');
  const result = spawnSync('bash', ['-c', `${command} -G git@github.com`], { encoding: 'utf8' });
  assert.equal(result.status, 0); assert.match(result.stdout, /^stricthostkeychecking true$/m);
});
test('bootstrap refuses existing legacy state rather than orphaning pending v1 transactions', () => {
  const dependencies = { uid: 0, root: CONTRACT.repository, fs: { existsSync: () => true } };
  assert.throws(() => bootstrapPreflight(CONTRACT, dependencies), /LEGACY_STATE_RECONCILIATION/);
});
test('failed lock preflight causes zero lock creation/opening in actual Bash bootstrap', () => temporary(dir => {
  const bin = path.join(dir, 'bin'); fs.mkdirSync(bin); fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\nexit 23\n', { mode: 0o755 });
  const script = fs.readFileSync('scripts/ops/production-control-bootstrap.sh', 'utf8');
  const result = spawnSync('bash', ['-c', `set -Eeuo pipefail\n${script}`], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PRODUCTION_CONTRACT_B64: 'fixture', PRODUCTION_PATH_HELPER_B64: 'fixture', DEPLOY_REPO_ROOT: dir } });
  assert.equal(result.status, 23); assert.equal(fs.existsSync(path.join(dir, 'mutation.lock')), false);
}));
test('all production mutation workflows stage one contract/helper/bootstrap; no active path literals drift', () => {
  const bootstrap = fs.readFileSync('scripts/ops/production-control-bootstrap.sh', 'utf8');
  assert.ok(bootstrap.indexOf('bootstrapPreflight') < bootstrap.indexOf('exec 9<>')); assert.match(bootstrap, /flock -n 9/);
  assert.doesNotMatch(bootstrap, /exec 9>|mkdir|chmod|chown/);
  for (const file of ['deploy.yml', 'production-disk-maintenance.yml', 'phase1-controlled-production-execution.yml']) {
    const source = fs.readFileSync('.github/workflows/' + file, 'utf8');
    for (const payload of ['PRODUCTION_CONTRACT_B64', 'PRODUCTION_PATH_HELPER_B64', 'PRODUCTION_CONTROL_BOOTSTRAP_B64']) assert.match(source, new RegExp(payload));
    assert.match(source, /base64 -w0 scripts\/ops\/production-config-contract.json/);
    assert.doesNotMatch(source, /STATE_DIR=\/|\/home\/phoenix-codex-deploy\/production-deployment-state/);
  }
});
test('existing /data, false-false, image rollback and clean gate remain code-only contracts', () => {
  const compose = fs.readFileSync('docker-compose.yml','utf8'); const workflow = fs.readFileSync('.github/workflows/deploy.yml','utf8');
  assert.match(compose, /PHOENIX_PG_DATA_DIR:-phoenix_pg_data/); assert.match(compose, /PHOENIX_UPLOADS_DIR:-phoenix_uploads/);
  for (const flag of ['CHANJET_READONLY_SYNC_ENABLED','CHANJET_ERP_INBOUND_SYNC_ENABLED']) assert.match(compose, new RegExp(flag+': \\$\\{'+flag+':-false\\}'));
  assert.match(workflow, /require-phoenix-data-mount.sh/); assert.match(workflow, /git status --porcelain --untracked-files=all/);
  assert.doesNotMatch(workflow, /git reset --hard/); assert.equal(CONTRACT.migrationBaseline,'RUNNING_API_REVISION'); assert.equal(CONTRACT.legacyApiRollback,'HOLD');
});


test('actual bootstrap keeps FD9 held, does not truncate the lock, and releases it on shell exit', () => temporary(dir => {
  const lock = path.join(dir, 'mutation.lock'); fs.writeFileSync(lock, 'PRESERVE_LOCK_BYTES', { mode: 0o600 });
  const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'node'), `#!/bin/sh
case "$*" in
 *bootstrapPreflight*) printf '%s\\n' "$FIXTURE_DIR";;
 *strictSshCommand*) printf '%s\\n' 'ssh -oStrictHostKeyChecking=yes';;
 *) exit 29;;
esac
`, { mode: 0o755 });
  const script = fs.readFileSync('scripts/ops/production-control-bootstrap.sh', 'utf8');
  const result = spawnSync('bash', ['-c', `set -Eeuo pipefail\n${script}\ntest -e /proc/$$/fd/9\nif flock -n "$STATE_DIR/mutation.lock" true; then exit 31; fi\necho FD9_HELD\n`], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FIXTURE_DIR: dir, PRODUCTION_CONTRACT_B64: 'fixture', PRODUCTION_PATH_HELPER_B64: 'fixture', DEPLOY_REPO_ROOT: dir, GIT_SSH_COMMAND: 'ssh' } });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /FD9_HELD/);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'PRESERVE_LOCK_BYTES');
  assert.equal(spawnSync('flock', ['-n', lock, 'true']).status, 0);
}));
