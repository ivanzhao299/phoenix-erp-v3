import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const repairWorkflow = readFileSync(new URL('.github/workflows/production-git-state-cas-repair.yml', root), 'utf8');
const deployWorkflow = readFileSync(new URL('.github/workflows/deploy.yml', root), 'utf8');

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
}

function remoteScript(source) {
  const marker = '          script: |\n';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1);
  return source.slice(start + marker.length).split('\n')
    .filter((line) => line.startsWith('            '))
    .map((line) => line.slice(12)).join('\n');
}

test('repair workflow is manual, main-only, serial, and explicitly bound', () => {
  assert.match(repairWorkflow, /on:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(repairWorkflow, /\n\s+(push|pull_request|schedule|workflow_run|workflow_call):/);
  assert.match(repairWorkflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(repairWorkflow, /environment: production/);
  assert.match(repairWorkflow, /permissions:\s*\n\s+contents: read/);
  assert.match(repairWorkflow, /cancel-in-progress:\s*false/);
  assert.match(repairWorkflow, /REPAIR_PRODUCTION_GIT_STATE_CAS/);
  assert.match(repairWorkflow, /expected_repair_sha/);
  assert.match(repairWorkflow, /EXPECTED_HEAD_SHA: 129fdb85c81ab0c201044daf021caf778b37b40b/);
  assert.match(repairWorkflow, /EXPECTED_OLD_LOCAL_MAIN_SHA: fb70fbad9a163d9e3cbb02a76506766babe89db2/);
  assert.match(repairWorkflow, /git update-ref -m/);
  assert.match(repairWorkflow, /git symbolic-ref HEAD refs\/heads\/main/);
});

test('repair remote script is Git-only and contains no fetch or service mutation', () => {
  const script = remoteScript(repairWorkflow);
  for (const forbidden of [
    /^\s*git fetch\b/m, /^\s*git pull\b/m, /^\s*git switch\b/m,
    /^\s*git checkout\b/m, /^\s*git reset\b/m, /^\s*git merge(?!-base)\b/m,
    /^\s*git rebase\b/m, /^\s*git branch -f\b/m, /^\s*git update-ref refs\/remotes/m,
    /^\s*git stash\b/m, /^\s*git clean\b/m, /^\s*git commit\b/m,
  ]) assert.doesNotMatch(script, forbidden);
  for (const forbidden of ['psql', 'pg_dump', 'pg_restore', 'docker compose', 'migration', 'restart']) {
    assert.doesNotMatch(script, new RegExp(`\\b${forbidden}\\b`, 'i'));
  }
  assert.match(script, /git ls-remote origin refs\/heads\/main/);
  assert.match(script, /refs\/heads\/main.*\$EXPECTED_NEW_LOCAL_MAIN_SHA/s);
});

test('generic deploy rejects detached entry and uses attached-main CAS rollback', () => {
  assert.doesNotMatch(deployWorkflow, /git switch --detach/);
  assert.doesNotMatch(deployWorkflow, /if ! git symbolic-ref -q HEAD[^\n]*git switch main/);
  assert.match(deployWorkflow, /CURRENT_BRANCH=.*git symbolic-ref --short -q HEAD/);
  assert.match(deployWorkflow, /\[ "\$CURRENT_BRANCH" != "main" \]/);
  assert.match(deployWorkflow, /CODE_SYNCED=false/);
  assert.match(deployWorkflow, /CODE_SYNCED=true/);
  assert.match(deployWorkflow, /git update-ref -m "deployment rollback \$\{DEPLOY_RUN_ID\}" refs\/heads\/main "\$PREV_SHA" "\$TARGET_SHA"/);
  assert.match(deployWorkflow, /GIT_ROLLBACK_SKIPPED=CODE_NOT_CONFIRMED_SYNCED/);
  assert.match(deployWorkflow, /GIT_ROLLBACK_BLOCKED=UNEXPECTED_GIT_STATE/);
});

test('CAS repair fixture changes only main ref and then attaches HEAD', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-cas-repair-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@example.invalid');
    git(dir, 'config', 'user.name', 'CAS Test');
    writeFileSync(join(dir, 'state.txt'), 'stable\n');
    git(dir, 'add', 'state.txt');
    git(dir, 'commit', '-qm', 'stable');
    const stable = git(dir, 'rev-parse', 'HEAD');
    writeFileSync(join(dir, 'state.txt'), 'failed\n');
    git(dir, 'commit', '-qam', 'failed deploy');
    const failed = git(dir, 'rev-parse', 'HEAD');
    git(dir, 'checkout', '--detach', stable);
    const treeBefore = git(dir, 'rev-parse', 'HEAD^{tree}');
    git(dir, 'update-ref', 'refs/heads/main', stable, failed);
    git(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    assert.equal(git(dir, 'branch', '--show-current'), 'main');
    assert.equal(git(dir, 'rev-parse', 'HEAD'), stable);
    assert.equal(git(dir, 'rev-parse', 'refs/heads/main'), stable);
    assert.equal(git(dir, 'rev-parse', 'HEAD^{tree}'), treeBefore);
    assert.equal(git(dir, 'status', '--porcelain'), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stale old-value CAS is rejected without changing refs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-cas-stale-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@example.invalid');
    git(dir, 'config', 'user.name', 'CAS Test');
    writeFileSync(join(dir, 'state.txt'), 'one\n');
    git(dir, 'add', 'state.txt');
    git(dir, 'commit', '-qm', 'one');
    const current = git(dir, 'rev-parse', 'HEAD');
    assert.throws(() => execFileSync('git', ['-C', dir, 'update-ref', 'refs/heads/main', current, '0'.repeat(40)], { stdio: 'pipe' }));
    assert.equal(git(dir, 'rev-parse', 'refs/heads/main'), current);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('HEAD-changed and dirty-worktree gates block before CAS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-cas-gates-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@example.invalid');
    git(dir, 'config', 'user.name', 'CAS Test');
    writeFileSync(join(dir, 'state.txt'), 'one\n');
    git(dir, 'add', 'state.txt');
    git(dir, 'commit', '-qm', 'one');
    const expected = git(dir, 'rev-parse', 'HEAD');
    writeFileSync(join(dir, 'state.txt'), 'two\n');
    git(dir, 'commit', '-qam', 'two');
    const changedGate = 'test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD_SHA"';
    assert.throws(() => execFileSync('bash', ['-euc', changedGate], { cwd: dir, env: { ...process.env, EXPECTED_HEAD_SHA: expected }, stdio: 'pipe' }));
    execFileSync('git', ['-C', dir, 'checkout', '--detach', expected], { stdio: 'pipe' });
    writeFileSync(join(dir, 'state.txt'), 'dirty\n');
    const dirtyGate = 'test -z "$(git status --porcelain --untracked-files=all)"';
    assert.throws(() => execFileSync('bash', ['-euc', dirtyGate], { cwd: dir, stdio: 'pipe' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('attached-main rollback restores the branch by CAS and leaves it attached', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-deploy-rollback-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@example.invalid');
    git(dir, 'config', 'user.name', 'CAS Test');
    writeFileSync(join(dir, 'state.txt'), 'previous\n');
    git(dir, 'add', 'state.txt');
    git(dir, 'commit', '-qm', 'previous');
    const previous = git(dir, 'rev-parse', 'HEAD');
    writeFileSync(join(dir, 'state.txt'), 'target\n');
    git(dir, 'commit', '-qam', 'target');
    const target = git(dir, 'rev-parse', 'HEAD');
    git(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git(dir, 'update-ref', 'refs/heads/main', previous, target);
    assert.equal(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
    assert.equal(git(dir, 'rev-parse', 'HEAD'), previous);
    assert.equal(git(dir, 'rev-parse', 'refs/heads/main'), previous);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repair remote script passes shell syntax validation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-cas-shell-'));
  const path = join(dir, 'repair.sh');
  try {
    writeFileSync(path, `${remoteScript(repairWorkflow)}\n`);
    execFileSync('bash', ['-n', path], { stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
