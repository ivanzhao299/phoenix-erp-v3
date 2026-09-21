import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const workflow = readFileSync(
  new URL('../../.github/workflows/production-identity-diagnostic.yml', import.meta.url),
  'utf8',
);

test('production identity diagnostic remains manual and read-only', () => {
  assert.match(workflow, /\bon:\s*\n\s+workflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.match(workflow, /environment:\s+production-readonly/);
  assert.match(workflow, /RUN_PRODUCTION_IDENTITY_DIAGNOSTIC/);
  assert.match(workflow, /appleboy\/ssh-action@v1/);
  assert.match(workflow, /DIAG_STAGE=SSH_CONNECTED/);
  assert.match(workflow, /DIAG_RESULT=PASS/);

  for (const forbidden of [
    'push:',
    'pull_request:',
    'schedule:',
    'workflow_run:',
    'script_stop',
    'capture_stdout',
    'docker compose',
    'psql',
    'migration',
    'bridge',
    'git fetch',
    'git pull',
    'git reset',
    'git clean',
    'git stash',
    'git switch',
    'git checkout',
    'INSERT',
    'UPDATE',
    'DELETE',
    'restart',
    'docker compose up',
    'docker compose down',
    'docker compose restart',
    'production deploy',
  ]) {
    assert.doesNotMatch(workflow, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `forbidden token: ${forbidden}`);
  }

  const headCapture = workflow.indexOf('DIAG_STAGE=HEAD_CAPTURED');
  const originCheck = workflow.indexOf('DIAG_STAGE=ORIGIN_CHECKED');
  const worktreeCheck = workflow.indexOf('DIAG_STAGE=WORKTREE_CHECKED');
  const nodeCheck = workflow.indexOf('DIAG_STAGE=NODE_CHECKED');
  assert.ok(headCapture >= 0 && headCapture < originCheck);
  assert.ok(originCheck < worktreeCheck && worktreeCheck < nodeCheck);
  assert.match(workflow, /DIAG_RESULT=RELEASE_NOT_ALIGNED/);
  assert.match(workflow, /DIAG_RESULT=BLOCKED/);
  assert.match(workflow, /DIAG_FAILURE=(?:ORIGIN_MISMATCH|WORKTREE_DIRTY|NODE_MISSING|HEAD_MISMATCH|LEDGER_SCRIPT_MISSING)/);
  assert.doesNotMatch(workflow, /HEAD_MATCH=false[\s\S]{0,120}exit 34/);
});
