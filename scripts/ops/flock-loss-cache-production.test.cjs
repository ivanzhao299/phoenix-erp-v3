'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { partitionInventory, collectPlan } = require('./flock-loss-cache-production.cjs');

const day = (company, house, date, count, managed = count) =>
  ({ company, house, day: date, report_count: String(count), managed_count: String(managed) });

test('partitions all months without overlapping house-days and reconciles excluded rows', () => {
  const rows = [
    day('A','H1','2025-01-01',3000), day('A','H2','2025-01-01',2,1),
    day('A','H1','2025-01-02',3000), day('A','H3','2025-01-02',5100),
    day('A','H3','2025-01-06',1), day('A','H2','2025-02-04',22),
    day('B','H4','2025-01-01',5), day('B','H5','2025-01-03',3,0),
    day('B','H 6','2025-01-06',2), day(null,'H7','2025-01-03',4),
  ];
  const result = partitionInventory(rows);
  assert.equal(result.companyCount, 2);
  assert.equal(result.inventoryRows, 11139);
  assert.equal(result.plannedRows, 6029);
  assert.deepEqual(result.holds, {
    missingCompany: 4, missingOccupancy: 4, unsupportedIdentity: 2, oversizedHouseDay: 5100,
  });
  assert.deepEqual(result.scopes, [
    { company: 'A', houses: ['H1'], from: '2025-01-01', through: '2025-01-01' },
    { company: 'A', houses: ['H1'], from: '2025-01-02', through: '2025-01-02' },
    { company: 'A', houses: ['H3'], from: '2025-01-06', through: '2025-01-06' },
    { company: 'A', houses: ['H2'], from: '2025-01-01', through: '2025-01-01' },
    { company: 'A', houses: ['H2'], from: '2025-02-04', through: '2025-02-04' },
    { company: 'B', houses: ['H4'], from: '2025-01-01', through: '2025-01-01' },
  ]);
});

test('enforces house and row batch limits', () => {
  const houses = Array.from({ length: 105 }, (_, i) => day('A', 'H' + i, '2025-01-01', 48));
  const countBound = [day('B','B1','2025-01-01',4000), day('B','B2','2025-01-01',1500)];
  const result = partitionInventory([...houses, ...countBound]);
  assert.deepEqual(result.scopes.map(scope => scope.houses.length), [100, 5, 1, 1]);
});

function database(allowed, rows) {
  return { transaction: async (isolation, work) => {
    assert.equal(isolation, 'REPEATABLE READ');
    return work({ query: async sql => {
      if (sql.startsWith('SET TRANSACTION READ ONLY')) return [];
      if (sql.includes("current_setting('transaction_read_only')")) return [{ ready: allowed }];
      return rows;
    } });
  } };
}

test('requires a read-only primary and a single target fingerprint across all historical scopes', async () => {
  await assert.rejects(collectPlan(database(false, []), () => assert.fail('no scan'), {}), /READ_ONLY/);
  const rows = [day('A','H1','2025-01-01',2), day('B','H2','2025-01-01',1)];
  const changed = (_, scope) => ({ targetFingerprint: scope.company, rows: [], eligible: 0 });
  await assert.rejects(collectPlan(database(true, rows), changed, {}), /PLAN_TARGET_CHANGED/);
  const plans = (_, scope) => scope.company === 'A'
    ? { targetFingerprint: 'target', rows: [{ holds: [] }, { holds: ['REPORT_IDENTITY'] }], eligible: 1, scope }
    : { targetFingerprint: 'target', rows: [], eligible: 0 };
  const result = await collectPlan(database(true, rows), plans, { runId: '1' });
  await assert.rejects(collectPlan(database(true, [day('A','H1','2025-01-01',1)]), plans, {}), /COUNTS_MISMATCH/);
  assert.equal(result.receipt.eligible, 1);
  assert.equal(result.receipt.held, 1);
  assert.deepEqual(result.receipt.reasons, { REPORT_IDENTITY: 1 });
  assert.equal(result.receipt.batchesWithDifferences, 1);
  assert.match(result.receipt.digest, /^[0-9a-f]{64}$/);
  assert.notEqual(result.receipt.digest, (await collectPlan(database(true, rows), plans, { runId: '2' })).receipt.digest);
});
