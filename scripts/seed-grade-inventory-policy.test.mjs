import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADE_POLICY, RETIRED_GRADES, databaseConfig, applyPolicy } from './seed-grade-inventory-policy.mjs';

test('policy covers the eight live grades and separates sale from inventory', () => {
  assert.deepEqual(GRADE_POLICY.map(row => row.grade_code), [
    'GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'BROKEN',
  ]);
  assert.ok(GRADE_POLICY.every(row => row.stock_managed === true));
  assert.deepEqual(GRADE_POLICY.filter(row => row.sale_enabled).map(row => row.grade_code), ['GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5']);
  assert.deepEqual(GRADE_POLICY.filter(row => !row.sale_enabled).map(row => row.default_stock_status), ['QUARANTINE', 'DAMAGED']);
  // 8 档制终态：退役码绝不再出现在策略里
  assert.deepEqual(RETIRED_GRADES, ['CRACKED', 'DAMAGED']);
  assert.ok(GRADE_POLICY.every(row => !RETIRED_GRADES.includes(row.grade_code)));
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
      if (sql.includes("status = 'ACTIVE'")) return { rows: [] };
      if (sql.includes('FROM product_grades')) return { rows: GRADE_POLICY.map(row => ({ ...row })) };
      if (sql.includes('FROM product_skus')) return { rows: [{ active_skus: 8, stock_scoped_skus: 8, sale_scoped_saleable_skus: 6 }] };
      return { rows: [] };
    },
  };
  const result = await applyPolicy(client, { dryRun: true, log() {} });
  assert.equal(result.applied, false);
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.equal(calls.filter(call => call.sql.includes('UPDATE product_grades')).length, 8);
});

test('apply fails closed when a retired grade is still ACTIVE', async () => {
  const base = {
    async query(sql, values = []) {
      if (sql.includes("status = 'ACTIVE'")) return { rows: [{ grade_code: 'CRACKED', status: 'ACTIVE' }] };
      if (sql.includes('FROM product_grades')) return { rows: GRADE_POLICY.map(row => ({ ...row })) };
      if (sql.includes('FROM product_skus')) return { rows: [{ active_skus: 8, stock_scoped_skus: 8, sale_scoped_saleable_skus: 6 }] };
      return { rows: [] };
    },
  };
  const client = { query: async (sql, values) => base.query(sql, values) };
  await assert.rejects(() => applyPolicy(client, { dryRun: true, log() {} }), /退役等级仍为 ACTIVE：CRACKED/);
});
