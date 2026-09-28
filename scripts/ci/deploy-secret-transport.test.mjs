import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const secretNames = ['CHANJET_APP_KEY', 'CHANJET_APP_SECRET', 'CHANJET_ORG_ID', 'CHANJET_CERT', 'CHANJET_MSG_SECRET'];

test('deployment transports Chanjet secrets through the SSH env channel', () => {
  const deployJob = workflow.slice(workflow.indexOf('name: Deploy ·'));
  for (const name of secretNames) {
    assert.match(deployJob, new RegExp(`${name}: \\\${\\{ secrets\\.${name} \\\}\\}`));
    assert.match(deployJob, new RegExp(`envs: [^\\n]*${name}`));
  }
  assert.doesNotMatch(deployJob, /inject_env\s+CHANJET/);
  assert.match(deployJob, /JSON\.stringify\(value\)/);
  assert.match(deployJob, /fs\.renameSync\(temporary, path\)/);
  assert.match(deployJob, /fs\.chmodSync\(path, 0o600\)/);
});
