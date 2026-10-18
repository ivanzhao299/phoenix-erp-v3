import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load, JSON_SCHEMA } from 'js-yaml';

const workflow = load(readFileSync('.github/workflows/deploy.yml', 'utf8'), { schema: JSON_SCHEMA });
const secretNames = ['CHANJET_APP_KEY', 'CHANJET_APP_SECRET', 'CHANJET_ORG_ID', 'CHANJET_CERT', 'CHANJET_MSG_SECRET'];

test('formal deployment transports managed credentials only through the SSH env channel', () => {
  const steps = workflow.jobs.deploy.steps.filter(step => step.uses === 'appleboy/ssh-action@v1');
  assert.equal(steps.length, 1);
  const step = steps[0];
  const envs = step.with.envs.split(',');
  for (const name of secretNames) {
    assert.equal(step.env[name], '${{ secrets.' + name + ' }}');
    assert.ok(envs.includes(name));
    assert.ok(!step.with.script.includes('${{ secrets.' + name));
  }
  assert.doesNotMatch(step.with.script, /inject_env\s+CHANJET/);
  assert.match(step.with.script, /if \[ "\$\{ROTATE_CHANJET_CREDENTIALS:-false\}" = true \]; then\s+export PHOENIX_ENV_STAGING_DIRECTORY=\/data\/\.phoenix-env-staging\s+node scripts\/ops\/update-managed-chanjet-env\.mjs\s+fi/);
});
