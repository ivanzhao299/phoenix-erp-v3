import { BadRequestException } from '@nestjs/common';
import { SkuAvailabilityService } from './sku-availability.service';

/**
 * 阶段3：SkuAvailabilityService 契约测试
 * 覆盖：品种收窄 / 组织适用范围（SITE>FARM>COMPANY>ALL）/ 多义拒绝 /
 *       无品种上下文走无变体兼容通道 / 用途开关 / 显式 SKU 校验。
 */
describe('SkuAvailabilityService', () => {
  const makeDb = (handler: (sql: string, params?: unknown[]) => any[]) => ({ query: jest.fn(handler) as any });
  const service = (handler: (sql: string, params?: unknown[]) => any[]) =>
    new SkuAvailabilityService(makeDb(handler) as never);

  const skuRow = (sku: string, variety: string | null, grade = 'GRADE_1', spec = 'LOOSE', product = 'PRD-EGG-RED-1') =>
    ({ sku_code: sku, product_code: product, variety_code: variety, grade_code: grade, spec_code: spec });
  const scopeRow = (type: string, code: string, sale = true, stock = true) =>
    ({ scope_type: type, scope_code: code, sale_enabled: sale, stock_enabled: stock });

  it('resolves a variety SKU through the company scope', async () => {
    const svc = service((sql) => {
      if (sql.includes('FROM product_skus')) return [skuRow('SKU-R-1-LOOSE', 'EGG_RED')];
      if (sql.includes('md_sku_org_scope')) return [scopeRow('ALL', ''), scopeRow('COMPANY', 'COMP-A')];
      return [];
    });
    const result = await svc.resolve({ companyCode: 'COMP-A', gradeCode: 'GRADE_1', varietyCode: 'EGG_RED', usage: 'stock' });
    expect(result).toMatchObject({ skuCode: 'SKU-R-1-LOOSE', varietyCode: 'EGG_RED', scopeType: 'COMPANY', scopeCode: 'COMP-A', stockEnabled: true });
  });

  it('rejects when multiple SKUs match the same variety/grade/spec/company', async () => {
    // 同变体下两个 SKU（异常主数据）→ 拒绝
    await expect(service((sql) => {
      if (sql.includes('FROM product_skus')) return [skuRow('SKU-R-1-LOOSE', 'EGG_RED'), skuRow('SKU-R-1-B', 'EGG_RED', 'GRADE_1', 'LOOSE')];
      if (sql.includes('md_sku_org_scope')) return [scopeRow('ALL', '')];
      return [];
    }).resolve({ companyCode: 'COMP-A', gradeCode: 'GRADE_1', varietyCode: 'EGG_RED', usage: 'stock' }))
      .rejects.toThrow('匹配多个可用 SKU');
  });

  it('fails closed when no scope row exists for the company', async () => {
    const svc = service((sql) => {
      if (sql.includes('FROM product_skus')) return [skuRow('SKU-R-1-LOOSE', 'EGG_RED')];
      if (sql.includes('md_sku_org_scope')) return [];  // 无 ANY 行 → 不可用
      return [];
    });
    await expect(svc.resolve({ companyCode: 'COMP-B', gradeCode: 'GRADE_1', varietyCode: 'EGG_RED', usage: 'stock' }))
      .rejects.toThrow('不适用于公司 COMP-B');
  });

  it('rejects stock usage when the scope disables stock_enabled', async () => {
    const svc = service((sql) => {
      if (sql.includes('FROM product_skus')) return [skuRow('SKU-R-1-LOOSE', 'EGG_RED')];
      if (sql.includes('md_sku_org_scope')) return [scopeRow('COMPANY', 'COMP-A', true, false)];
      return [];
    });
    await expect(svc.resolve({ companyCode: 'COMP-A', gradeCode: 'GRADE_1', varietyCode: 'EGG_RED', usage: 'stock' }))
      .rejects.toThrow('不适用于公司 COMP-A');
  });

  it('prefers the most specific scope: SITE over FARM over COMPANY over ALL', async () => {
    const svc = service((sql) => {
      if (sql.includes('FROM product_skus')) return [skuRow('SKU-R-1-LOOSE', 'EGG_RED')];
      if (sql.includes('md_sku_org_scope')) return [
        scopeRow('ALL', ''), scopeRow('COMPANY', 'COMP-A'),
        scopeRow('FARM', 'FARM-A', true, false), scopeRow('SITE', 'SITE-A', true, true),
      ];
      return [];
    });
    const result = await svc.resolve({ companyCode: 'COMP-A', farmCode: 'FARM-A', siteCode: 'SITE-A', gradeCode: 'GRADE_1', varietyCode: 'EGG_RED', usage: 'stock' });
    expect(result).toMatchObject({ scopeType: 'SITE', stockEnabled: true });
  });

  it('without variety context only resolves variety-less legacy SKUs', async () => {
    const svc = service((sql) => {
      if (sql.includes('FROM product_skus')) {
        // 服务端收窄条件：p.variety_code IS NULL
        expect(sql).toContain('p.variety_code IS NULL');
        return [skuRow('SKU-1-LOOSE', null, 'GRADE_1', 'LOOSE', 'PRD-EGG-1')];
      }
      if (sql.includes('md_sku_org_scope')) return [scopeRow('ALL', '')];
      return [];
    });
    const result = await svc.resolve({ companyCode: 'COMP-A', gradeCode: 'GRADE_1', usage: 'stock' });
    expect(result).toMatchObject({ skuCode: 'SKU-1-LOOSE', varietyCode: null });
  });

  it('reports missing SKU with the variety context in the message', async () => {
    const svc = service((sql) => {
      if (sql.includes('FROM product_skus')) return [];
      return [];
    });
    await expect(svc.resolve({ companyCode: 'COMP-A', gradeCode: 'GRADE_9', varietyCode: 'EGG_RED', usage: 'stock' }))
      .rejects.toThrow('品种 EGG_RED');
  });

  it('derives varieties from the house flocks when varietyCode is absent', async () => {
    const svc = service((sql) => {
      if (sql.includes('brd_flocks')) return [{ breed_code: 'HY_LINE_BROWN' }];
      if (sql.includes('md_variety_breeds')) return [{ variety_code: 'EGG_RED' }];
      if (sql.includes('FROM product_skus')) return [skuRow('SKU-R-1-LOOSE', 'EGG_RED')];
      if (sql.includes('md_sku_org_scope')) return [scopeRow('ALL', '')];
      return [];
    });
    const result = await svc.resolve({ companyCode: 'COMP-A', houseCode: 'HOUSE-A', gradeCode: 'GRADE_1', usage: 'stock' });
    expect(result).toMatchObject({ skuCode: 'SKU-R-1-LOOSE', varietyCode: 'EGG_RED' });
  });

  it('assertUsable validates an explicit skuCode against company scope', async () => {
    const svc = service((sql) => {
      if (sql.includes('FROM product_skus s')) return [skuRow('SKU-R-1-LOOSE', 'EGG_RED')];
      if (sql.includes('md_sku_org_scope')) return [scopeRow('COMPANY', 'COMP-A')];
      return [];
    });
    const result = await svc.assertUsable('SKU-R-1-LOOSE', { companyCode: 'COMP-A', usage: 'sale' });
    expect(result).toMatchObject({ skuCode: 'SKU-R-1-LOOSE', scopeType: 'COMPANY', saleEnabled: true });
    await expect(service((sql) => {
      if (sql.includes('FROM product_skus s')) return [];
      return [];
    }).assertUsable('SKU-GONE', { companyCode: 'COMP-A' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
