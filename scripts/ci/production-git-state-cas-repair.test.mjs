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

const authority = {
  EXPECTED_HEAD_SHA: '129fdb85c81ab0c201044daf021caf778b37b40b',
  EXPECTED_OLD_LOCAL_MAIN_SHA: 'fb70fbad9a163d9e3cbb02a76506766babe89db2',
  EXPECTED_NEW_LOCAL_MAIN_SHA: '129fdb85c81ab0c201044daf021caf778b37b40b',
  EXPECTED_HEAD_TREE: '86738ebce37021d8ece4d40b995051245e197450',
  EXPECTED_OLD_LOCAL_MAIN_TREE: 'c7455cd4ab361fcdf35d4f0ba4e2b8b6929d0806',
  SOURCE_BRANCH_STATE_AUDIT_RUN: '36277000839',
};

function assertRemoteEnvironmentClosed(source) {
  const script = remoteScript(source);
  const transported = new Set(source.match(/^\s+envs: ([^\n]+)$/m)[1].split(',').map((v) => v.trim()));
  const assigned = new Set([...script.matchAll(/(?:^|[;\s])([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));
  const referenced = new Set([...script.matchAll(/\$(?:\{([A-Z][A-Z0-9_]*)(?=[}:?\-+%#/])|([A-Z][A-Z0-9_]*))/g)].map((m) => m[1] || m[2]));
  // No implicit runner environment is available over SSH. Authority must always
  // be transported, even if someone later adds a local default assignment.
  for (const name of new Set([...referenced].filter((v) => !assigned.has(v)).concat(Object.keys(authority)))) {
    assert.ok(transported.has(name), `${name} must be transported`);
  }
  const sshEnv = source.split('      - name: Execute one-time')[1].split('        with:')[0];
  for (const name of transported) assert.match(sshEnv, new RegExp(`^          ${name}: .+$`, 'm'));
}

test('REMOTE_ENV_CLOSURE=PASS; REMOTE_REPAIR_ENVIRONMENT_COMPLETE=YES', () => {
  assertRemoteEnvironmentClosed(repairWorkflow);
  const inputs = repairWorkflow.split('permissions:')[0];
  for (const [name, value] of Object.entries(authority)) {
    assert.match(repairWorkflow, new RegExp(`^      ${name}: ${value}$`, 'm'));
    assert.ok(repairWorkflow.includes(`${name}: \u0024{{ env.${name} }}`));
    assert.doesNotMatch(inputs, new RegExp(name, 'i'));
  }
  assert.doesNotMatch(repairWorkflow, /GHCR_USER/);
});

test('closure rejects every missing authority transmission and new external dependency', () => {
  for (const name of Object.keys(authority)) {
    const broken = repairWorkflow.replace(/^(\s+envs: )([^\n]+)$/m, (_, prefix, names) =>
      prefix + names.split(',').filter((v) => v !== name).join(','));
    assert.throws(() => assertRemoteEnvironmentClosed(broken), new RegExp(name));
  }
  assert.throws(() => assertRemoteEnvironmentClosed(repairWorkflow + '\n            echo "$EXPECTED_FUTURE_GATE"\n'), /EXPECTED_FUTURE_GATE/);
});

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

test('generic deploy rejects detached entry and retains safe main during image rollback', () => {
  assert.doesNotMatch(deployWorkflow, /git switch --detach|git reset --hard|git update-ref -m "deployment rollback/);
  assert.match(deployWorkflow, /CURRENT_BRANCH=.*git symbolic-ref --short -q HEAD/);
  assert.match(deployWorkflow, /\[ "\$CURRENT_BRANCH" != "main" \]/);
  assert.match(deployWorkflow, /CODE_SYNCED=false/);
  assert.match(deployWorkflow, /CODE_SYNCED=true/);
  assert.match(deployWorkflow, /rollback-plan/);
  assert.match(deployWorkflow, /safe config retained/);
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
