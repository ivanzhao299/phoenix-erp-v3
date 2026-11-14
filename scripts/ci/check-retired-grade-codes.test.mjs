import test from 'node:test';
import assert from 'node:assert/strict';
import { extractGradeCodesFromTsArray, isAllowlistedForRetiredCode, canarySources, runCheck } from './check-retired-grade-codes.mjs';

test('parses grade codes out of a TS constant array', () => {
  const source = `
const FALLBACK: ProductGrade[] = [
  { grade_code: 'GRADE_0', grade_name: '0号蛋' },
  { grade_code: 'DIRTY', grade_name: '脏蛋' },
];
const OTHER = [1];`;
  assert.deepEqual(extractGradeCodesFromTsArray(source, 'const FALLBACK: ProductGrade[] = ['), ['GRADE_0', 'DIRTY']);
  assert.deepEqual(extractGradeCodesFromTsArray(`PKG_EGG_DEFECT: [\n  { code:'DIRTY' },\n  { code:'BROKEN' },\n],`, 'PKG_EGG_DEFECT: ['), ['DIRTY', 'BROKEN']);
  assert.throws(() => extractGradeCodesFromTsArray(source, 'const MISSING = ['), /ANCHOR_MISSING/);
});

test('allowlist covers fixtures, migrations, legacy mapping and the gate itself', () => {
  for (const file of [
    'apps/api/src/modules/farm/farm.service.spec.ts',
    'apps/web/src/__tests__/daily-grade-export.dom.test.tsx',
    'apps/api/src/database/migrations/1794500000000-FreezeRetiredEggGrades.ts',
    'apps/api/migrations/20260530_product_master_h2.sql',
    'apps/api/src/modules/sales-v2/services/egg-inventory.service.ts',
    'scripts/ci/check-retired-grade-codes.mjs',
    'scripts/seed-defect-sku-matrix.mjs',
  ]) assert.equal(isAllowlistedForRetiredCode(file), true, file);
  for (const file of [
    'apps/web/src/hooks/useProductGrades.ts',
    'apps/api/src/modules/wms/wms-defect-disposition-policy.ts',
    'scripts/seed-grade-inventory-policy.test.mjs',
  ]) {
    // 测试文件在白名单内；其余两个业务文件不在
    const expected = /\.(spec|test)\./.test(file);
    assert.equal(isAllowlistedForRetiredCode(file), expected, file);
  }
});

test('canary flags a source that reintroduces retired codes', async () => {
  const goodPolicy = { GRADE_POLICY: [
    { grade_code: 'GRADE_0' }, { grade_code: 'GRADE_1' }, { grade_code: 'GRADE_2' }, { grade_code: 'GRADE_3' },
    { grade_code: 'GRADE_4' }, { grade_code: 'GRADE_5' }, { grade_code: 'DIRTY' }, { grade_code: 'BROKEN' },
  ] };
  const goodMatrix = { DEFECT_GRADES: [{ grade_code: 'DIRTY' }, { grade_code: 'BROKEN' }] };
  const ok = await runCheck({ loadModules: async () => ({ policy: goodPolicy, matrix: goodMatrix }) });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));

  const badPolicy = { GRADE_POLICY: [...goodPolicy.GRADE_POLICY, { grade_code: 'CRACKED' }] };
  const bad = await runCheck({ loadModules: async () => ({ policy: badPolicy, matrix: goodMatrix }) });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => e.includes('CANARY_RETIRED_CODE') && e.includes('CRACKED')));

  const badMatrix = { DEFECT_GRADES: [{ grade_code: 'DIRTY' }, { grade_code: 'BROKEN' }, { grade_code: 'DAMAGED' }] };
  const bad2 = await runCheck({ loadModules: async () => ({ policy: goodPolicy, matrix: badMatrix }) });
  assert.ok(bad2.errors.some(e => e.includes('CANARY_DEFECT_ENUM')), JSON.stringify(bad2.errors));
});

test('live repository sources satisfy the canary (self-check)', async () => {
  const result = await runCheck({ loadModules: async () => ({
    policy: await import('../seed-grade-inventory-policy.mjs'),
    matrix: await import('../seed-defect-sku-matrix.mjs'),
  }) });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  // 四个权威源都被检查到
  const sources = canarySources(
    { GRADE_POLICY: [{ grade_code: 'GRADE_0' }] },
    { DEFECT_GRADES: [{ grade_code: 'DIRTY' }] },
  );
  assert.equal(sources.length, 4);
});
