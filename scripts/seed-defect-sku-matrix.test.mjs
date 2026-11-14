import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFECT_GRADES, DEFECT_LINES, DEFECT_SPEC_CODE, defectSkuMatrix, databaseConfig, readReadiness, applyMatrix } from './seed-defect-sku-matrix.mjs';

test('matrix covers three lines x four defect grades with LOOSE spec only', () => {
  const matrix = defectSkuMatrix();
  assert.equal(matrix.length, 12);
  assert.deepEqual([...new Set(matrix.map(row => row.spec_code))], [DEFECT_SPEC_CODE]);
  assert.deepEqual(matrix.map(row => row.sku_code), [
    'SKU-0-DIRTY-LOOSE', 'SKU-0-CRACKED-LOOSE', 'SKU-0-BROKEN-LOOSE', 'SKU-0-DAMAGED-LOOSE',
    'SKU-R-DIRTY-LOOSE', 'SKU-R-CRACKED-LOOSE', 'SKU-R-BROKEN-LOOSE', 'SKU-R-DAMAGED-LOOSE',
    'SKU-P-DIRTY-LOOSE', 'SKU-P-CRACKED-LOOSE', 'SKU-P-BROKEN-LOOSE', 'SKU-P-DAMAGED-LOOSE',
  ]);
});

test('every defect SKU is stock-scoped, never sale-enabled, org-gated', () => {
  for (const row of defectSkuMatrix()) {
    assert.equal(row.status, 'ACTIVE');
    assert.equal(row.org_context_required, true);
    assert.equal(row.scope.scope_type, 'COMPANY');
    assert.equal(row.scope.stock_enabled, true);
    assert.equal(row.scope.sale_enabled, false);
    assert.equal(row.scope.status, 'ACTIVE');
  }
});

test('lines mirror the approved activation catalog companies and varieties', () => {
  assert.deepEqual(DEFECT_LINES.map(line => [line.product_code, line.variety_code, line.company_code]), [
    ['PRD-EGG-0', null, 'COMP-LAO-AGRI'],
    ['PRD-EGG-RED', 'EGG_RED', 'COMP-LAO-XINGCHI'],
    ['PRD-EGG-PINK', 'EGG_PINK', 'COMP-LAO-XINGCHI'],
  ]);
  assert.deepEqual(DEFECT_GRADES.map(row => row.grade_code), ['DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED']);
});

test('database configuration has no implicit credentials', () => {
  assert.throws(() => databaseConfig({}), /必须显式设置 DATABASE_URL/);
  assert.deepEqual(databaseConfig({ DATABASE_URL: 'postgres://explicit' }), { connectionString: 'postgres://explicit' });
});

function readyClient() {
  const desired = defectSkuMatrix();
  return {
    async query(sql, values = []) {
      if (sql.includes('FROM mst_products WHERE product_code')) {
        return { rows: DEFECT_LINES.map(line => ({ product_code: line.product_code, product_name: `${line.line_label}蛋`, status: 'ACTIVE', variety_code: line.variety_code })) };
      }
      if (sql.includes('FROM product_grades WHERE grade_code')) {
        return { rows: DEFECT_GRADES.map(row => ({ grade_code: row.grade_code, status: 'ACTIVE', stock_managed: true })) };
      }
      if (sql.includes('FROM packaging_specs')) return { rows: [{ spec_code: 'LOOSE', status: 'ACTIVE' }] };
      if (sql.includes('FROM sys_organizations')) {
        return { rows: DEFECT_LINES.map(line => ({ company_code: line.company_code })) };
      }
      if (sql.includes('FROM product_skus WHERE sku_code')) return { rows: [] };
      if (sql.includes('FROM md_sku_org_scope WHERE sku_code')) return { rows: [] };
      if (sql.startsWith('INSERT INTO product_skus')) return { rowCount: 1 };
      if (sql.startsWith('INSERT INTO md_sku_org_scope')) return { rowCount: 1 };
      return { rows: [] };
    },
  };
}

test('dry-run inserts missing matrix then rolls back', async () => {
  const calls = [];
  const client = { query: async (sql, values) => { calls.push(sql); return readyClient().query(sql, values); } };
  const result = await applyMatrix(client, { dryRun: true, log() {} });
  assert.equal(result.applied, false);
  assert.equal(result.insertedSkus, 12);
  assert.equal(result.insertedScopes, 12);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(calls.filter(sql => sql.startsWith('INSERT INTO product_skus')).length, 12);
  assert.equal(calls.filter(sql => sql.startsWith('INSERT INTO md_sku_org_scope')).length, 12);
});

test('apply fails closed when a defect grade is not stock-managed yet', async () => {
  const base = readyClient();
  const client = {
    async query(sql, values) {
      if (sql.includes('FROM product_grades WHERE grade_code')) {
        return { rows: DEFECT_GRADES.map(row => ({ grade_code: row.grade_code, status: 'ACTIVE', stock_managed: row.grade_code === 'BROKEN' ? false : true })) };
      }
      return base.query(sql, values);
    },
  };
  await assert.rejects(() => applyMatrix(client, { dryRun: true, log() {} }), /seed-grade-inventory-policy/);
});

test('readiness reports conflict when an existing SKU identity differs', async () => {
  const base = readyClient();
  const desired = defectSkuMatrix();
  const client = {
    async query(sql, values) {
      if (sql.includes('FROM product_skus WHERE sku_code')) {
        return { rows: [{ sku_code: desired[0].sku_code, product_code: 'PRD-OTHER', grade_code: desired[0].grade_code, spec_code: 'LOOSE', variety_code: null, status: 'ACTIVE', org_context_required: true }] };
      }
      return base.query(sql, values);
    },
  };
  const readiness = await readReadiness(client);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.conflicts.length, 1);
  assert.match(readiness.conflicts[0].detail, /身份与期望不一致/);
});
