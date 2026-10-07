import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

mkdirSync('artifacts', { recursive: true });
const temp = mkdtempSync(path.resolve('artifacts/deploy-git-trust-'));
after(() => rmSync(temp, { recursive: true, force: true }));
const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const fragment = workflow.match(/            DEPLOY_REPO_ROOT="\$\(pwd -P\)"\n            git\(\) \{\n              command git -c "safe.directory=\$DEPLOY_REPO_ROOT" "\$@"\n            \}/)?.[0].replace(/^ {12}/gm, '');
assert.ok(fragment, 'deployment must use the path-scoped Git wrapper');
const fixture = name => {
  const dir = path.join(temp, name);
  mkdirSync(dir);
  execFileSync('git', ['init', '--initial-branch=main', dir], { stdio: 'ignore' });
  return dir;
};
const repo = fixture('approved');
const outside = fixture('outside');
const env = { ...process.env, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1', OUTSIDE_REPO: outside };

test('reproduces dubious ownership and allows only the approved checkout', () => {
  const denied = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: repo, env, encoding: 'utf8' });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /dubious ownership/);
  const allowed = execFileSync('bash', ['-c', `${fragment}\ngit symbolic-ref --short HEAD`], { cwd: repo, env, encoding: 'utf8' });
  assert.equal(allowed.trim(), 'main');
  const other = spawnSync('bash', ['-c', `${fragment}\ngit -C "$OUTSIDE_REPO" symbolic-ref --short HEAD`], { cwd: repo, env, encoding: 'utf8' });
  assert.notEqual(other.status, 0);
  assert.match(other.stderr, /dubious ownership/);
});

test('retains main/dirty/revision guards without wildcard or persistent trust', () => {
  assert.doesNotMatch(fragment, /--global|safe\.directory=\*|chown/);
  assert.match(workflow, /if \[ "\$CURRENT_BRANCH" != "main" \]/);
  assert.match(workflow, /git status --porcelain --untracked-files=all/);
  assert.match(workflow, /if \[ "\$\(git rev-parse HEAD\)" != "\$TARGET_SHA" \]/);
});
