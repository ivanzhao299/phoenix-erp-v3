import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const workflowPath = new URL('.github/workflows/production-git-branch-state-audit.yml', root);
const workflow = readFileSync(workflowPath, 'utf8');

function remoteScript(source) {
  const marker = '          script: |\n';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'production SSH script must be present');
  return source
    .slice(start + marker.length)
    .split('\n')
    .filter((line) => line.startsWith('            '))
    .map((line) => line.slice(12))
    .join('\n');
}

const script = remoteScript(workflow);

test('production Git branch-state audit is manual, read-only, and main-only', () => {
  assert.match(workflow, /on:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+(push|pull_request|schedule|workflow_run|workflow_call):/);
  assert.match(workflow, /environment: production-readonly/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /RUN_PRODUCTION_GIT_BRANCH_STATE_AUDIT/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
});

test('remote script captures local, cached, and live main refs without mutation', () => {
  for (const token of [
    'LOCAL_MAIN_EXISTS', 'LOCAL_MAIN_SHA', 'HEAD_EQUALS_LOCAL_MAIN',
    'HEAD_IS_ANCESTOR_OF_LOCAL_MAIN', 'LOCAL_MAIN_IS_ANCESTOR_OF_HEAD',
    'HEAD_TREE', 'LOCAL_MAIN_TREE', 'HEAD_TREE_EQUALS_LOCAL_MAIN',
    'LOCAL_ORIGIN_MAIN_EXISTS', 'LOCAL_ORIGIN_MAIN_SHA', 'REMOTE_MAIN_SHA',
    'ORIGIN_REPOSITORY', 'ORIGIN_MATCH', 'MAIN_TRACKING_REMOTE',
    'MAIN_TRACKING_MERGE', 'ORIGIN_FETCH_REFSPEC_VALID',
    'LOCAL_MAIN_MATCHES_KNOWN_FAILED_DEPLOY_TARGET',
  ]) assert.match(script, new RegExp(token));

  for (const command of [
    'git rev-parse', 'git branch --show-current', 'git show-ref',
    'git merge-base', 'git ls-remote', 'git config', 'git status',
  ]) assert.match(script, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  for (const forbidden of [
    /^\s*git fetch\b/m, /^\s*git pull\b/m, /^\s*git switch\b/m,
    /^\s*git checkout\b/m, /^\s*git reset\b/m, /^\s*git merge(?!-base)\b/m,
    /^\s*git rebase\b/m, /^\s*git branch -f\b/m, /^\s*git update-ref\b/m,
    /^\s*git stash\b/m, /^\s*git clean\b/m, /^\s*git commit\b/m,
  ]) assert.doesNotMatch(script, forbidden);
  for (const forbidden of ['psql', 'docker compose', 'pg_dump', 'pg_restore', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE']) {
    assert.doesNotMatch(script, new RegExp(`\\b${forbidden}\\b`, 'i'));
  }
});

test('remote script passes shell syntax validation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'production-git-audit-'));
  const path = join(dir, 'audit.sh');
  try {
    writeFileSync(path, `${script}\n`);
    execFileSync('bash', ['-n', path], { stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('workflow includes rollback root-cause evidence without changing production state', () => {
  assert.match(workflow, /DETACHED_ROLLBACK_PATH_PRESENT/);
  assert.match(workflow, /git switch --detach "\$PREV_SHA"/);
});
