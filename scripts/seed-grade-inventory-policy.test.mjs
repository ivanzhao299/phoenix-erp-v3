import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADE_POLICY, databaseConfig, applyPolicy } from './seed-grade-inventory-policy.mjs';

test('policy covers all nine grades and separates sale from inventory', () => {
  assert.deepEqual(GRADE_POLICY.map(row => row.grade_code), [
    'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED',
  ]);
  assert.ok(GRADE_POLICY.every(row => row.stock_managed === true));
  assert.deepEqual(GRADE_POLICY.filter(row => row.sale_enabled).map(row => row.grade_code), ['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5']);
  assert.deepEqual(GRADE_POLICY.filter(row => !row.sale_enabled).map(row => row.default_stock_status), ['QUARANTINE', 'QUARANTINE', 'DAMAGED', 'DAMAGED']);
});

test('database configuration has no implicit credentials', () => {
  assert.throws(() => databaseConfig({}), /必须显式设置 DATABASE_URL/);
  assert.deepEqual(databaseConfig({ DATABASE_URL: 'postgres://explicit' }), { connectionString: 'postgres://explicit' });
});

test('dry-run updates all grades then rolls back', async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes('FROM product_grades')) return { rows: GRADE_POLICY.map(row => ({ ...row })) };
      if (sql.includes('FROM product_skus')) return { rows: [{ active_skus: 9, stock_scoped_skus: 9, sale_scoped_saleable_skus: 5 }] };
      return { rows: [] };
    },
  };
  const result = await applyPolicy(client, { dryRun: true, log() {} });
  assert.equal(result.applied, false);
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.equal(calls.filter(call => call.sql.includes('UPDATE product_grades')).length, 9);
});
