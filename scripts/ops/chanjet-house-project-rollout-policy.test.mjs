import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOUSE_PROJECT_ROLLOUT_TARGETS,
  resolveHouseProjectRolloutTarget,
} from './chanjet-house-project-rollout-policy.mjs';

test('rollout policy has twelve unique reviewed production targets', () => {
  assert.equal(HOUSE_PROJECT_ROLLOUT_TARGETS.length, 12);
  assert.equal(new Set(HOUSE_PROJECT_ROLLOUT_TARGETS.map((target) => target.houseCode)).size, 12);
  assert.deepEqual(
    HOUSE_PROJECT_ROLLOUT_TARGETS.filter((target) => target.order > 0).map((target) => target.order),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  );
});

test('resolver returns the exact reviewed tuple and rejects arbitrary targets', () => {
  assert.deepEqual(resolveHouseProjectRolloutTarget('HOUSE_DP_06'), {
    order: 11,
    bookId: '3537748712226818',
    houseCode: 'HOUSE_DP_06',
    expectedName: '公鸡舍',
    farmCode: 'FARM-DP',
    projectCategoryCode: '00',
    phase: 'DONGPENG',
  });
  assert.throws(() => resolveHouseProjectRolloutTarget('HOUSE_DP_07'), /not a unique reviewed rollout target/);
  assert.throws(() => resolveHouseProjectRolloutTarget(''), /not a unique reviewed rollout target/);
});
