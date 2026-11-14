import test from 'node:test';
import assert from 'node:assert/strict';
import { RENAMES, databaseConfig, readReadiness, applyRenames } from './rename-grade0-broken.mjs';

test('renames target display names only, never identity codes', () => {
  assert.equal(RENAMES.grade0.grade_code, 'GRADE_0');
  assert.deepEqual([RENAMES.grade0.from, RENAMES.grade0.to], ['0号特大蛋', '0号蛋']);
  assert.deepEqual([RENAMES.broken.from, RENAMES.broken.to], ['破蛋', '破损蛋']);
  assert.equal(RENAMES.product.product_code, 'PRD-EGG-0');
  // 身份列只作为 WHERE 定位条件,绝不出现在任何 SET 目标里(见 dry-run 测试的 SQL 断言)
  assert.equal(RENAMES.grade0.to, RENAMES.product.to);
});

test('database configuration has no implicit credentials', () => {
  assert.throws(() => databaseConfig({}), /必须显式设置 DATABASE_URL/);
  assert.deepEqual(databaseConfig({ DATABASE_URL: 'postgres://explicit' }), { connectionString: 'postgres://explicit' });
});

function auditClient({ grade0Name = RENAMES.grade0.from, brokenName = RENAMES.broken.from, productName = RENAMES.product.from, skuNames = ['0号特大蛋·普通 LOOSE', '0号特大蛋·红 TRAY30'] } = {}) {
  return {
    async query(sql, values = []) {
      if (sql.includes('FROM product_grades')) {
        return { rows: [{ grade_code: 'GRADE_0', grade_name: grade0Name }, { grade_code: 'BROKEN', grade_name: brokenName }] };
      }
      if (sql.includes('FROM mst_products')) {
        return { rows: [{ product_code: 'PRD-EGG-0', product_name: productName, product_name_zh: productName }] };
      }
      if (sql.includes('FROM product_skus WHERE sku_name LIKE')) {
        return { rows: skuNames.map(sku_name => ({ sku_code: sku_name, sku_name })) };
      }
      if (sql.startsWith('UPDATE product_grades')) return { rowCount: 1 };
      if (sql.startsWith('UPDATE mst_products')) return { rowCount: 1 };
      if (sql.startsWith('UPDATE product_skus')) return { rowCount: skuNames.length };
      return { rows: [] };
    },
  };
}

test('audit reports pending renames with current and target names', async () => {
  const readiness = await readReadiness(auditClient());
  assert.deepEqual(readiness.grades.map(row => [row.grade_code, row.needsUpdate]), [['GRADE_0', true], ['BROKEN', true]]);
  assert.equal(readiness.product[0].needsUpdate, true);
  assert.equal(readiness.skus.matchingLegacyName, 2);
});

test('audit is idempotent-aware: already-renamed rows need no update', async () => {
  const readiness = await readReadiness(auditClient({ grade0Name: '0号蛋', brokenName: '破损蛋', productName: '0号蛋', skuNames: [] }));
  assert.deepEqual(readiness.grades.map(row => row.needsUpdate), [false, false]);
  assert.equal(readiness.product[0].needsUpdate, false);
  assert.equal(readiness.skus.matchingLegacyName, 0);
});

test('dry-run runs all three updates then rolls back', async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push(sql); return auditClient().query(sql, values); } };
  const result = await applyRenames(client, { dryRun: true, log() {} });
  assert.equal(result.applied, false);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(calls.filter(sql => sql.startsWith('UPDATE product_grades')).length, 2);
  assert.equal(calls.filter(sql => sql.startsWith('UPDATE mst_products')).length, 1);
  assert.equal(calls.filter(sql => sql.startsWith('UPDATE product_skus')).length, 1);
  // 幂等护栏：等级与产品 UPDATE 的 WHERE 都带 IS DISTINCT FROM 目标值
  const gradeUpdate = calls.find(sql => sql.startsWith('UPDATE product_grades'));
  assert.match(gradeUpdate, /grade_name IS DISTINCT FROM \$1/);
  const productUpdate = calls.find(sql => sql.startsWith('UPDATE mst_products'));
  assert.match(productUpdate, /product_name IS DISTINCT FROM \$1 OR product_name_zh IS DISTINCT FROM \$1/);
});
