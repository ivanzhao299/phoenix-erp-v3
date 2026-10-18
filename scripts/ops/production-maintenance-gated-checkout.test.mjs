import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { RegisteredMainFastForward, inspectCheckoutGit, checkoutGitEnvironment } from './production-maintenance-gated-checkout.mjs';
const worker = fileURLToPath(new URL('../ci/maintenance-gated-checkout-worker.mjs', import.meta.url));
const launcher = fileURLToPath(new URL('./production-maintenance-gated-checkout.py', import.meta.url));
const git = (root, ...args) => execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', GIT_CONFIG_NOSYSTEM: '1' } }).trim();
function fixture({ many = 0 } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-gated-checkout-'));
  const root = path.join(directory, 'repo'); fs.mkdirSync(root); const evidence = path.join(directory, 'evidence'); fs.mkdirSync(evidence, { mode: 0o700 });
  const lockFile = path.join(directory, 'mutation.lock'); fs.writeFileSync(lockFile, '', { mode: 0o600 });
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Owned Fixture'); git(root, 'config', 'user.email', 'fixture@invalid.local');
  fs.writeFileSync(path.join(root, 'old.txt'), 'old\n'); git(root, 'add', 'old.txt'); git(root, 'commit', '-m', 'owned old'); const previousSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'switch', '-c', 'target'); fs.writeFileSync(path.join(root, 'new.txt'), 'new\n');
  if (many) { fs.mkdirSync(path.join(root, 'files')); for (let i = 0; i < many; i++) fs.writeFileSync(path.join(root, 'files', `${i}.txt`), 'owned-fixture\n'.repeat(1024)); }
  git(root, 'add', 'new.txt', ...(many ? ['files'] : [])); git(root, 'commit', '-m', 'owned target'); const targetSha = git(root, 'rev-parse', 'HEAD'); git(root, 'switch', 'main');
  git(root, 'update-ref', 'refs/remotes/origin/main', targetSha);
  return { directory, root, evidence, lockFile, previousSha, targetSha };
}
async function runWorker(f, mode = 'normal', holdLock = true) {
  const request = path.join(f.directory, 'request.json'); fs.writeFileSync(request, JSON.stringify({ ...f, mode }), { mode: 0o600 });
  const executable = holdLock ? '/bin/bash' : process.execPath;
  const args = holdLock ? ['-c', holdLock === 'unlocked' ? 'exec 9<> "$1"; shift; exec "$@"' : 'exec 9<> "$1"; flock -n 9 || exit 65; shift; exec "$@"', 'owned-checkout', f.lockFile, process.execPath, worker, request] : [worker, request];
  const child = spawn(executable, args,
    { env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume(); child.stderr.resume();
  const [code] = await once(child, 'close'); assert.equal(code, 0);
  return fs.existsSync(path.join(f.evidence, 'result.json')) ? JSON.parse(fs.readFileSync(path.join(f.evidence, 'result.json'))) : null;
}
function lockHeld(lockFile) {
  try { execFileSync('/usr/bin/flock', ['-n', lockFile, '/usr/bin/true'], { stdio: 'ignore' }); return false; } catch { return true; }
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function resumeOwnedGit(proof) {
  // Never signal a recycled or unidentified PID, even during fixture cleanup.
  const stat = fs.readFileSync(`/proc/${proof.pid}/stat`, 'utf8');
  assert.equal(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19], proof.startTicks);
  assert.equal(fs.readlinkSync(`/proc/${proof.pid}/exe`), '/usr/bin/git');
  process.kill(proof.pid, 'SIGCONT');
}

test('native exact clean main fast-forward uses actual registered child close and preserves main', async () => {
  const f = fixture(), result = await runWorker(f);
  assert.equal(result.status, 'PASS'); assert.equal(result.result.productionAdmission, false); assert.equal(result.result.closeVerified, true);
  assert.equal(result.reuseRefused, true); assert.equal(result.childrenRemaining, 0);
  assert.equal(git(f.root, 'branch', '--show-current'), 'main'); assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.targetSha);
  assert.equal(git(f.root, 'status', '--porcelain'), ''); assert.equal(lockHeld(f.lockFile), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.evidence, 'child.json'))).registered, true);
});
test('missing compiled capabilities and self FD9 fail closed before launcher or Git', async () => {
  const f = fixture(); const absent = new RegisteredMainFastForward(f);
  await assert.rejects(absent.run(), /COMPILED_CAPABILITIES/); assert.equal(fs.readdirSync(f.evidence).length, 0);
  const noFd = await runWorker(f, 'normal', false); assert.equal(noFd.status, 'HOLD');
  assert.match(noFd.code, /SELF_FD9/); assert.equal(fs.readdirSync(f.evidence).filter(x => x !== 'result.json').length, 0);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.previousSha);
});
test('registration refusal and final admission revocation never send GO and join ungranted launcher', async () => {
  for (const mode of ['registration-refused', 'abort-before-go']) {
    const f = fixture(), result = await runWorker(f, mode);
    assert.equal(result.status, 'HOLD'); assert.equal(result.reuseRefused, true); assert.equal(result.childrenRemaining, 0);
    assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.previousSha); assert.equal(fs.existsSync(path.join(f.evidence, 'intent.json')), true);
    assert.equal(lockHeld(f.lockFile), false);
  }
});
test('controller exits before GO: EOF refuses Git and inherited lock closes naturally', async () => {
  const f = fixture(); assert.equal(await runWorker(f, 'exit-before-go'), null);
  const until = Date.now() + 6000; while (lockHeld(f.lockFile) && Date.now() < until) await wait(10);
  assert.equal(lockHeld(f.lockFile), false); assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.previousSha);
});
test('controller exits after GO: live fixed Git retains FD9 until its actual exit', async () => {
  const f = fixture({ many: 3000 }); assert.equal(await runWorker(f, 'stop-git-exit-parent'), null);
  const proof = JSON.parse(fs.readFileSync(path.join(f.evidence, 'exec-proof.json')));
  // Parent exited. A lock held now can only come from the registered descendant.
  try { assert.equal(lockHeld(f.lockFile), true, 'actual stopped Git still owns the original open description'); }
  finally { resumeOwnedGit(proof); }
  const until = Date.now() + 20000; while (lockHeld(f.lockFile) && Date.now() < until) await wait(10);
  assert.equal(lockHeld(f.lockFile), false, 'no lingering descendant retains FD9');
  // Parent death may break Git stdout. Either exact target or old is retained;
  // no SUCCESS receipt is permitted, and the actual state needs manual review.
  assert.equal(fs.existsSync(path.join(f.evidence, 'result.json')), false);
  assert.ok([f.previousSha, f.targetSha].includes(git(f.root, 'rev-parse', 'HEAD')));
});
test('dirty/untracked, detached, divergent and remote drift are refused before intent', () => {
  const cases = [
    f => fs.writeFileSync(path.join(f.root, 'old.txt'), 'dirty'),
    f => fs.writeFileSync(path.join(f.root, 'untracked'), 'x'),
    f => git(f.root, 'switch', '--detach', f.previousSha),
    f => git(f.root, 'update-ref', 'refs/remotes/origin/main', f.previousSha),
    f => { fs.writeFileSync(path.join(f.root, 'diverge.txt'), 'diverge'); git(f.root, 'add', 'diverge.txt'); git(f.root, 'commit', '-m', 'diverge'); f.previousSha = git(f.root, 'rev-parse', 'HEAD'); }
  ];
  for (const change of cases) { const f = fixture(); change(f); assert.throws(() => inspectCheckoutGit(f.root, f.previousSha, f.targetSha, checkoutGitEnvironment({ HOME: '/nonexistent' }))); assert.equal(fs.readdirSync(f.evidence).length, 0); }
});
test('configured executable filters/signatures/merge options and partial clone are refused without invoking them', () => {
  for (const key of ['filter.fixture.smudge', 'filter.fixture.process', 'merge.verifySignatures', 'merge.fixture.driver', 'branch.main.mergeOptions', 'remote.origin.promisor']) {
    const f = fixture(); git(f.root, 'config', key, '/unreachable-must-never-execute');
    assert.throws(() => inspectCheckoutGit(f.root, f.previousSha, f.targetSha, checkoutGitEnvironment({ HOME: '/nonexistent' })), /EXECUTABLE_CONFIG_UNSUPPORTED/);
  }
  assert.throws(() => checkoutGitEnvironment({ HOME: '/nonexistent', GIT_CONFIG_COUNT: '1' }), /ENVIRONMENT_UNSUPPORTED/);
  assert.throws(() => checkoutGitEnvironment({ HOME: '/nonexistent', LD_PRELOAD: '/unreachable' }), /ENVIRONMENT_UNSUPPORTED/);
});
test('ignored collision is never overwritten; actual failed Git keeps exclusive intent and refuses retry', async () => {
  const f = fixture(); fs.writeFileSync(path.join(f.root, '.git/info/exclude'), 'new.txt\n'); fs.writeFileSync(path.join(f.root, 'new.txt'), 'do-not-overwrite\n');
  const result = await runWorker(f); assert.equal(result.status, 'HOLD'); assert.equal(result.code, 'MAINTENANCE_HOLD=CHECKOUT_GIT_RESULT_HOLD');
  assert.equal(result.reuseRefused, true); assert.equal(result.childrenRemaining, 0); assert.equal(fs.readFileSync(path.join(f.root, 'new.txt'), 'utf8'), 'do-not-overwrite\n');
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.previousSha); assert.equal(fs.existsSync(path.join(f.evidence, 'intent.json')), true);
});
test('same inode through a different open description cannot impersonate inherited FD9', async () => {
  const f = fixture(); const owner = spawn('/usr/bin/python3', ['-I', '-c', 'import os,fcntl,time,sys; f=os.open(sys.argv[1],os.O_RDONLY); fcntl.flock(f,fcntl.LOCK_EX); print("READY",flush=True); time.sleep(3)', f.lockFile], { stdio: ['ignore', 'pipe', 'ignore'] });
  await once(owner.stdout, 'data');
  const fd = fs.openSync(f.lockFile, 'r');
  const child = spawn('/usr/bin/python3', ['-I', launcher, f.root, f.targetSha, f.lockFile, 'a'.repeat(64)], { stdio: ['pipe', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', fd] });
  child.stdout.resume(); child.stderr.resume(); child.stdin.end(`GO ${'a'.repeat(64)}\n`);
  const [code] = await once(child, 'close'); fs.closeSync(fd); assert.equal(code, 64); assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.previousSha); await once(owner, 'close');
});
test('index hiding flags, sparse checkout and gitlinks cannot produce a false clean observation', () => {
  const safe = checkoutGitEnvironment({ HOME: '/nonexistent' });
  for (const flag of ['--assume-unchanged', '--skip-worktree']) {
    const f = fixture(); git(f.root, 'update-index', flag, 'old.txt'); fs.writeFileSync(path.join(f.root, 'old.txt'), 'hidden local modification\n');
    assert.equal(git(f.root, 'status', '--porcelain'), '');
    assert.throws(() => inspectCheckoutGit(f.root, f.previousSha, f.targetSha, safe), /INDEX_OR_SUBMODULE_UNSUPPORTED/);
    assert.equal(fs.readFileSync(path.join(f.root, 'old.txt'), 'utf8'), 'hidden local modification\n');
  }
  const sparse = fixture(); git(sparse.root, 'config', 'core.sparseCheckout', 'false');
  assert.throws(() => inspectCheckoutGit(sparse.root, sparse.previousSha, sparse.targetSha, safe), /EXECUTABLE_CONFIG_UNSUPPORTED/);
  const sub = fixture(); git(sub.root, 'update-index', '--add', '--cacheinfo', `160000,${sub.previousSha},nested`);
  assert.throws(() => inspectCheckoutGit(sub.root, sub.previousSha, sub.targetSha, safe), /INDEX_OR_SUBMODULE_UNSUPPORTED/);
});
test('every native preflight read and final inspection shares the caller deadline', () => {
  const f = fixture(); let reads = 0;
  assert.throws(() => inspectCheckoutGit(f.root, f.previousSha, f.targetSha, checkoutGitEnvironment({ HOME: '/nonexistent' }), () => {
    if (++reads === 12) throw new Error('FIXTURE_DEADLINE'); return 10000;
  }), /DEADLINE|NATIVE_GIT_REFUSED/);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.previousSha);
});

test('unlocked descriptor and linked worktree are refused without changing state', async () => {
  const f = fixture(), result = await runWorker(f, 'normal', 'unlocked');
  assert.equal(result.status, 'HOLD'); assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.previousSha); assert.equal(lockHeld(f.lockFile), false);
  const linked = path.join(f.directory, 'linked'); git(f.root, 'worktree', 'add', '-b', 'owned-linked', linked, f.previousSha);
  assert.throws(() => inspectCheckoutGit(linked, f.previousSha, f.targetSha, checkoutGitEnvironment({ HOME: '/nonexistent' })), /LINKED_WORKTREE_UNSUPPORTED/);
});

test('timeout after actual Git exec retains original child debt and FD9, without success or retry', async () => {
  const f = fixture({ many: 3000 }); const result = await runWorker(f, 'stop-git-timeout');
  const proof = JSON.parse(fs.readFileSync(path.join(f.evidence, 'exec-proof.json')));
  try {
    assert.equal(result.status, 'HOLD'); assert.match(result.code, /CLOSE_UNVERIFIED/);
    assert.equal(result.childrenRemaining, 1); assert.equal(result.childClosed, false); assert.equal(result.reuseRefused, true);
    assert.equal(lockHeld(f.lockFile), true);
  } finally { resumeOwnedGit(proof); }
  const until = Date.now() + 20000; while (lockHeld(f.lockFile) && Date.now() < until) await wait(10);
  assert.equal(lockHeld(f.lockFile), false);
});
