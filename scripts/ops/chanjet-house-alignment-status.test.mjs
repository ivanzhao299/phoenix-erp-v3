import assert from 'node:assert/strict';
import test from 'node:test';

import { statusOf } from './chanjet-house-alignment-status.mjs';

test('maps Chanjet project status A and I to production states', () => {
  assert.deepEqual(statusOf({ status: 'A' }), { raw: 'A', productionState: 'ACTIVE' });
  assert.deepEqual(statusOf({ status: 'I' }), { raw: 'I', productionState: 'INACTIVE' });
});

test('reads object-shaped statusEnum from raw payload', () => {
  assert.deepEqual(
    statusOf({ rawData: { statusEnum: { value: 'A', name: '启用' } } }),
    { raw: 'A', productionState: 'ACTIVE' },
  );
});

test('boolean stop flags retain priority over textual status', () => {
  assert.deepEqual(
    statusOf({ status: 'A', rawData: { isStopped: true } }),
    { raw: 'isStopped=true', productionState: 'INACTIVE' },
  );
});
