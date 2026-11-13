import { EntityManager } from 'typeorm';
import { SkuPolicy } from './sku-policy';
import { ProductMasterService } from './product-master.service';
import { LookupController } from '../controllers/lookup.controller';
import { PriceRuntimeService } from '../../sales-v2/services/price-runtime.service';
import { ChanjetWmsBridgeService } from '../../chanjet/chanjet-wms-bridge.service';
import { ChanjetErpMasterBusinessReviewService } from '../../chanjet/chanjet-erp-master-business-review.service';
import { PriceItemsService } from '../../sales-v2/services/price-items.service';
import { EggInventoryService } from '../../sales-v2/services/egg-inventory.service';
import { WmsService } from '../../wms/wms.service';
import { StorePosService } from '../../store-pos/services/store-pos.service';
import { StoreReplenishmentService } from '../../store-pos/services/store-replenishment.service';
import { resolvePackagingIdentity } from '../../bff/packaging-readiness';

const current = { variety_code: null as string | null, sku_code: 'SKU-1', product_code: 'P', product_name: '产品', sku_name: '商品', grade_code: 'G', spec_code: 'S', status: 'ACTIVE', today: '2026-11-10', effective_date: '2026-11-10', expire_date: '2026-11-10' };
function fixture(options: { sku?: Record<string, unknown> | null; parent?: string; parentStatus?: string | null; saleable?: boolean; storable?: boolean } = {}) {
  const sku = options.sku === null ? null : { ...current, ...options.sku };
  const query = jest.fn(async (sql: string, _values?: unknown[]): Promise<Record<string, any>[]> => {
    if (sql.includes('FROM product_skus')) return sku ? [sku] : [];
    const table = ['mst_products', 'product_grades', 'packaging_specs'].find(table => sql.includes(`FROM ${table}`));
    if (table) return table === options.parent && options.parentStatus === null ? [] : [{ variety_code: sku?.variety_code ?? null, status: table === options.parent ? options.parentStatus : 'ACTIVE', product_code: 'P', grade_code: 'G', spec_code: 'S', spec_name: '规格', qty_per_unit: 30, base_unit: '枚', is_saleable: options.saleable ?? true, is_storable: options.storable ?? true }];
    if (sql.includes('FROM sal_price_books')) return [{ id: 1, company_code: 'C', status: 'DRAFT' }];
    if (sql.includes('INSERT INTO')) return [{ id: 1 }];
    return [];
  });
  const manager = { query } as unknown as EntityManager;
  const ds = { query: jest.fn(async (sql: string, values?: unknown[]) => {
    if (/product_skus|FOR SHARE/.test(sql)) throw new Error('master identity read outside transaction');
    return query(sql, values);
  }), transaction: jest.fn(async (run: (m: EntityManager) => unknown) => run(manager)) };
  const cls = { get: (key: string) => key === 'dataScope' ? { isGlobal: true } : { username: 'test' } };
  return { query, manager, ds, cls, sku };
}

describe('shared SKU availability', () => {
  it.each(['mst_products', 'product_grades', 'packaging_specs'])('rejects missing/frozen %s and locks only exact reference rows', async parent => {
    for (const parentStatus of [null, 'FROZEN', 'ARCHIVED']) {
      const f = fixture({ parent, parentStatus });
      await expect(SkuPolicy.requireUsable(f.manager, 'SKU-1', 'sale-stock')).rejects.toMatchObject({ status: 400 });
      expect(f.query.mock.calls.every(([sql]) => sql.includes('WHERE') && sql.endsWith('FOR SHARE'))).toBe(true);
    }
  });
  it.each([
    { effective_date: '2026-11-11' }, { expire_date: '2026-11-09' }, { status: 'FROZEN' },
  ])('rejects unavailable SKU before parent reads %o', async sku => {
    const f = fixture({ sku });
    await expect(SkuPolicy.requireUsable(f.manager, 'SKU-1')).rejects.toMatchObject({ status: 400 });
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it('accepts both inclusive endpoints and locks SKU before product, grade and spec', async () => {
    const f = fixture(); await expect(SkuPolicy.requireUsable(f.manager, 'SKU-1', 'sale-stock')).resolves.toMatchObject(current);
    expect(f.query.mock.calls.map(([sql]) => sql.match(/FROM (\w+)/)![1])).toEqual(['product_skus', 'mst_products', 'product_grades', 'packaging_specs']);
    expect(f.query.mock.calls.map(([, values]) => values)).toEqual([['SKU-1'], ['P'], ['G'], ['S']]);
  });
  it('applies sale and stock eligibility independently', async () => {
    const f = fixture({ saleable: false });
    await expect(SkuPolicy.requireUsable(f.manager, 'SKU-1', 'sale')).rejects.toThrow('不可销售');
    await expect(SkuPolicy.requireUsable(f.manager, 'SKU-1', 'stock')).resolves.toBeDefined();
    await expect(SkuPolicy.requireUsable(fixture({ storable: false }).manager, 'SKU-1', 'stock')).rejects.toThrow('不可库存');
  });
  it.each([null, '', ' ', ' SKU-1', 1])('rejects explicitly invalid code %p without lookup', async code => {
    const f = fixture(); await expect(SkuPolicy.requireUsable(f.manager, code)).rejects.toMatchObject({ status: 400 }); expect(f.query).not.toHaveBeenCalled();
  });
  it('uses the same predicate for SKU and inventory lookup but leaves management/history reads complete', async () => {
    const em = { query: jest.fn().mockResolvedValue([{ ...current, status: 'FROZEN' }]) };
    const svc = new ProductMasterService(em as any, {} as any);
    await svc.listSkus({ usage: 'sale' }); expect(em.query.mock.calls[0][0]).toContain(SkuPolicy.usableSql('product_skus', 'sale'));
    const lookup = new LookupController(svc, em as any, {} as any, {} as any, {} as any);
    await lookup.inventoryItems(); expect(em.query.mock.calls[1][0]).toContain(SkuPolicy.usableSql('ps', 'stock'));
    await expect(svc.getSku('SKU-1')).resolves.toMatchObject({ status: 'FROZEN' });
    expect(em.query.mock.calls[2][0]).not.toMatch(/ACTIVE|effective_date|is_saleable|is_storable/);
    await svc.listSkus({ status: 'FROZEN' }); expect(em.query.mock.calls[3][0]).not.toMatch(/EXISTS|CURRENT_DATE/);
  });
  it('exposes minimal ACTIVE parent lookups without a management menu', async () => {
    const em = { query: jest.fn().mockResolvedValue([]) }; const lookup = new LookupController({} as any, em as any, {} as any, {} as any, {} as any);
    await lookup.products(); await lookup.productGrades(); await lookup.packagingSpecs();
    for (const [sql] of em.query.mock.calls) { expect(sql).toContain("status='ACTIVE'"); expect(sql).not.toContain('SELECT *'); }
  });
});

describe('new transaction consumers', () => {
  const price = { priceBookId: '1', productCode: 'SPOOF', skuCode: 'SKU-1', unitPrice: 10 };
  it('creates prices with locked authoritative identity and rejects explicit empty/null SKU', async () => {
    const f = fixture(); const service = new PriceItemsService(f.ds as any, f.cls as any);
    await service.createItem(price as any);
    const insert = f.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO sal_price_items'))!;
    expect(insert[1]![1]).toBe('P'); expect(insert[1]!.slice(-3)).toEqual(['G', 'S', null]); expect(f.ds.transaction).toHaveBeenCalledTimes(1);
    for (const skuCode of ['', null]) await expect(service.createItem({ ...price, skuCode } as any)).rejects.toMatchObject({ status: 400 });
  });
  it('fails a bulk import explicitly rather than silently skipping an unavailable SKU', async () => {
    const f = fixture({ parent: 'mst_products', parentStatus: 'FROZEN' }); const service = new PriceItemsService(f.ds as any, f.cls as any);
    await expect(service.bulkImport({ priceBookId: '1', items: [price] } as any)).rejects.toMatchObject({ status: 400 });
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
  });
  it('revalidates copied price references in the copy transaction', async () => {
    const f = fixture({ sku: { expire_date: '2026-11-09' } }); const original = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, values) => sql.includes('FROM sal_price_items') ? [{ sku_code: 'SKU-1' }] : original(sql, values));
    await expect(new PriceItemsService(f.ds as any, f.cls as any).copyFromBook('1', '2')).rejects.toMatchObject({ status: 400 });
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
  });
  it('rejects an invalid SKU price request before trying legacy prices or successful validation fallback', async () => {
    const f = fixture({ sku: null });
    // Explicit SKU requests use the authoritative locked identity read; they
    // must reject before any legacy price fallback or product-code fallback.
    const service = new PriceRuntimeService({ query: f.query } as any, f.cls as any);
    await expect(service.validatePrice({ skuCode: 'BAD', productCode: 'FALLBACK', companyCode: 'C', unitPrice: 10 } as any)).rejects.toMatchObject({ status: 400 });
    expect(f.query.mock.calls.some(([sql]) => sql.includes('FROM sal_price_items'))).toBe(false);
    expect(f.query.mock.calls[0][0]).toContain('FROM product_skus');
    expect(f.query.mock.calls[0][0]).toContain('FOR SHARE');
  });
  it('rejects newly approved SKU mappings after a parent freezes and saves valid mappings with the lock manager', async () => {
    for (const frozen of [false, true]) {
      const f = fixture(frozen ? { parent: 'product_grades', parentStatus: 'FROZEN' } : {});
      const save = jest.fn(); Object.assign(f.manager, { save });
      const service = Object.assign(Object.create(ChanjetWmsBridgeService.prototype), { mappingRepository: { manager: { transaction: f.ds.transaction }, save: jest.fn() } });
      const result = service.saveMappingTarget({ erpCode: 'SKU-1', erpEntityType: 'SKU' });
      if (frozen) { await expect(result).rejects.toMatchObject({ status: 400 }); expect(save).not.toHaveBeenCalled(); }
      else { await result; expect(save).toHaveBeenCalledTimes(1); expect(service.mappingRepository.save).not.toHaveBeenCalled(); }
    }
  });
  it('rechecks business-review SKU targets through the review transaction manager', async () => {
    const f = fixture({ sku: { effective_date: '2026-11-11' } });
    const service = Object.create(ChanjetErpMasterBusinessReviewService.prototype);
    const runner = { manager: f.manager, query: jest.fn() };
    await expect(service.assertTarget(runner, { targetTable: 'product_skus', targetCode: 'SKU-1' })).rejects.toMatchObject({ status: 400 });
    expect(runner.query).not.toHaveBeenCalled();
  });
  it('rejects unavailable production SKU before batch or ledger writes', async () => {
    const f = fixture({ parent: 'packaging_specs', parentStatus: 'FROZEN' });
    const service = Object.assign(Object.create(EggInventoryService.prototype), { ds: f.ds });
    await expect(service.createProductionBatch({ skuCode: 'SKU-1', productCode: 'FALLBACK', companyCode: 'C', qty: 1, eggDate: '2026-11-10' })).rejects.toMatchObject({ status: 400 });
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
  });
  it('does not downgrade an explicit WMS SKU to material or a legacy product', async () => {
    const f = fixture({ sku: null }); const service = new WmsService({ query: f.query, transaction: f.ds.transaction } as any, f.cls as any);
    await expect((service as any).resolveInventoryItem(f.manager, 'SKU-1', 'SKU')).rejects.toMatchObject({ status: 400 });
    expect(f.query.mock.calls.some(([sql]) => sql.includes('mst_materials'))).toBe(false);
    for (const sku_code of ['', null]) {
      await expect(service.confirmInbound({ task_no: 'WI', items: [{ sku_code, product_code: 'P', qty: 1 }] }, {})).rejects.toMatchObject({ status: 400 });
    }
  });
  it('keeps the locked spec base unit when resolving a non-egg inventory SKU', async () => {
    const f = fixture(); const original = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, values) => sql.includes('FROM packaging_specs') ? [{ status: 'ACTIVE', base_unit: 'kg' }] : original(sql, values));
    const service = new WmsService(f.manager, f.cls as any);
    await expect((service as any).resolveInventoryItem(f.manager, 'SKU-1', 'SKU')).resolves.toMatchObject({ unit: 'kg', productCode: 'P', skuCode: 'SKU-1' });
  });
  it('rejects a POS SKU before price fallback and creates no sale', async () => {
    const f = fixture({ saleable: false });
    const service = Object.assign(Object.create(StorePosService.prototype), { ds: f.ds, cls: f.cls, storeScope: { resolve: jest.fn().mockResolvedValue({ storeCode: 'ST', companyCode: 'C' }) }, genSaleNo: jest.fn().mockResolvedValue('POS-1'), resolveItemPrice: jest.fn() });
    await expect(service.createSale({ storeCode: 'ST', items: [{ skuCode: 'SKU-1', productCode: 'FALLBACK', qty: 1 }] })).rejects.toThrow('不可销售');
    expect(service.resolveItemPrice).not.toHaveBeenCalled(); expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
  });
  it('checks and names replenishment lines in the request transaction', async () => {
    const f = fixture(); const service = new StoreReplenishmentService(f.ds as any, f.cls as any, { resolve: jest.fn().mockResolvedValue({ storeId: '1', warehouseCodes: ['WH'] }) } as any, {} as any);
    await service.create({ storeCode: 'ST', lines: [{ skuCode: 'SKU-1', skuName: 'FAKE', qty: 1 }] });
    const insert = f.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO store_replenishment_request_lines'))!;
    expect(insert[1]![2]).toBe('商品'); expect(f.ds.transaction).toHaveBeenCalledTimes(1);
  });
  it('keeps packaging ambiguity checks and date checks with authoritative organization/date/variety context', async () => {
    const sourceContext = { companyCode: 'C', farmCode: 'F', siteCode: 'SITE', eggDate: '2026-11-10', varietyCode: 'VAR', houseCodes: ['HOUSE'],
      productMode: 'VARIANT' as const, sourceProfileCode: 'PROFILE', sourceProfileRefs: [{ profileCode: 'PROFILE', houseCode: 'HOUSE' }],
      houseProfiles: { HOUSE: { sourceProfileCode: 'PROFILE', productMode: 'VARIANT' as const, varietyCode: 'VAR' } } };
    const input = { grade: 'G', specCode: 'S', sourceContext };
    const packagingFixture = (sku: Record<string, unknown> = {}, duplicate = false) => {
      const f = fixture({ sku: { variety_code: 'VAR', product_variety_code: 'VAR', ...sku } });
      const original = f.query.getMockImplementation()!;
      f.query.mockImplementation(async (sql, values) => {
        if (sql.includes('FROM sys_organizations')) return [{ org_code: 'C' }];
        if (sql.includes('FROM brd_houses')) return [{ house_code: 'HOUSE', farm_code: 'F', company_code: 'C', site_code: 'SITE' }];
        if (sql.includes('FROM md_egg_source_profiles')) return [{ profile_code: 'PROFILE', company_code: 'C', farm_code: 'F', site_code: 'SITE', house_code: 'HOUSE', product_mode: 'VARIANT', variety_code: 'VAR', effective_date: '2026-01-01', status: 'ACTIVE' }];
        if (sql.includes('FROM brd_flocks')) return [{ flock_no: 'FLOCK', farm_code: 'F', breed_code: 'BREED', status: 'LAYING', placement_date: '2026-01-01' }];
        if (sql.includes('FROM sys_dict')) return [{ dict_code: 'BREED' }];
        if (sql.includes('FROM md_variety_breeds')) return [{ variety_code: 'VAR' }];
        if (sql.includes('FROM md_product_varieties')) return [{ variety_code: 'VAR',status:'ACTIVE',effective_date:'2026-01-01',expire_date:null }];
        if (sql.includes('FROM md_sku_org_scope')) return [{ scope_type: 'COMPANY', scope_code: 'C', status: 'ACTIVE', sale_enabled: true, stock_enabled: true, today: '2026-11-10' }];
        const rows = await original(sql, values);
        return duplicate && sql.includes('FROM product_skus s JOIN') ? [...rows, { ...rows[0], sku_code: 'OTHER' }] : rows;
      });
      return f;
    };
    const f = packagingFixture();
    await expect(resolvePackagingIdentity(f.manager, input)).resolves.toMatchObject({ skuCode: 'SKU-1', qtyPerUnit: 30, varietyCode: 'VAR' });
    const locks = f.query.mock.calls.filter(([sql]) => sql.includes('FOR SHARE'));
    const skuLock = locks.findIndex(([sql]) => sql.includes('FROM product_skus'));
    expect(skuLock).toBeGreaterThanOrEqual(0);
    expect(locks.findIndex(([sql]) => sql.includes('FROM mst_products'))).toBeGreaterThan(skuLock);
    await expect(resolvePackagingIdentity(packagingFixture({ effective_date: '2026-11-11' }).manager, input)).rejects.toThrow('生效期');
    await expect(resolvePackagingIdentity(packagingFixture({}, true).manager, input)).rejects.toThrow('多个可用 SKU');
    await expect(resolvePackagingIdentity(f.manager, { grade: 'G', specCode: 'S' })).rejects.toMatchObject({ response: { code: 'SOURCE_MISSING' } });
  });
});
