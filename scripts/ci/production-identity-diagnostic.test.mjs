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
});
