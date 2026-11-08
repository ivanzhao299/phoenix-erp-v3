import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentMigrationScope } from './production-deployment-state.mjs';

const baseline = 'a'.repeat(40);
const target = 'b'.repeat(40);
const changed = ['apps/api/src/database/migrations/1790000000000-ConsolidateBreedingDailyLogs.ts'];

test('web-only deployment ignores migrations owned by a future API/full release', () => {
  const discovered = { baseline, target, changed };
  const effective = deploymentMigrationScope(discovered, 'web');
  assert.deepEqual(effective, { baseline, target, changed: [] });
  assert.deepEqual(discovered.changed, changed);
});

test('api and full deployments retain strict migration receipt scope', () => {
  for (const mode of ['api', 'full']) {
    const discovered = { baseline, target, changed };
    assert.equal(deploymentMigrationScope(discovered, mode), discovered);
  }
});

test('deployment migration scope fails closed on malformed input or mode', () => {
  assert.throws(() => deploymentMigrationScope({ baseline, target, changed: 'bad' }, 'web'), /STATE_HOLD=BASELINE/);
  assert.throws(() => deploymentMigrationScope({ baseline, target, changed }, 'invalid'), /STATE_HOLD=DEPLOY_MODE/);
});
