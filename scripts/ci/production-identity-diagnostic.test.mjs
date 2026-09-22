import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const workflow = readFileSync(
  new URL('../../.github/workflows/production-identity-diagnostic.yml', import.meta.url),
  'utf8',
);
const remoteWorkflow = readFileSync(
  new URL('../../.github/workflows/production-git-remote-diagnostic.yml', import.meta.url),
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

  assert.match(remoteWorkflow, /\bon:\s*\n\s+workflow_dispatch:/);
  assert.match(remoteWorkflow, /production-readonly/);
  assert.match(remoteWorkflow, /contents:\s+read/);
  assert.match(remoteWorkflow, /RUN_PRODUCTION_REMOTE_DIAGNOSTIC/);
  assert.match(remoteWorkflow, /ORIGIN_REPOSITORY=/);
  assert.match(remoteWorkflow, /REMOTE_CLASSIFICATION=/);
  assert.doesNotMatch(remoteWorkflow, /echo\s+"\$ORIGIN_URL"/);
  assert.doesNotMatch(remoteWorkflow, /echo\s+"\$ORIGIN_PUSHURL"/);
  for (const forbidden of [
    'git remote set-url',
    'git remote add',
    'git remote remove',
    'git fetch',
    'git pull',
    'git push',
    'git checkout',
    'git switch',
    'git reset',
    'git clean',
    'git stash',
    'docker compose',
    'migration',
    'ledger-preflight',
    'psql',
    'INSERT',
    'UPDATE',
    'DELETE',
    'restart',
    'capture_stdout',
    'script_stop',
  ]) {
    assert.doesNotMatch(remoteWorkflow, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `remote forbidden token: ${forbidden}`);
  }
});

test('production Git remote diagnostic is valid YAML and manual-only', () => {
  const parser = spawnSync('python3', ['-c', `
import pathlib
import sys
try:
    import yaml
except Exception as exc:
    print(f'PyYAML is required for workflow parsing: {exc}', file=sys.stderr)
    raise SystemExit(2)

workflow = yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
on = workflow.get(True, workflow.get('on', {}))
assert isinstance(on, dict), 'workflow on must be a mapping'
assert set(on) == {'workflow_dispatch'}, f'unexpected triggers: {set(on)}'
assert isinstance(on['workflow_dispatch'], dict)
assert workflow['name'] == 'Production Git Remote Diagnostic'
job = workflow['jobs']['production-git-remote-diagnostic']
assert 'workflow_dispatch' in job['if']
assert "refs/heads/main" in job['if']
assert job['environment'] == 'production-readonly'
assert workflow['permissions']['contents'] == 'read'
`, '.github/workflows/production-git-remote-diagnostic.yml'], { encoding: 'utf8' });
  assert.equal(parser.status, 0, parser.stderr || parser.stdout);
  assert.equal(parser.error, undefined, parser.error?.message);
});
