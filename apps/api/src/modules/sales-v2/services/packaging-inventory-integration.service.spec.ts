import { PackagingInventoryIntegrationService } from './packaging-inventory-integration.service';
import { ConflictException } from '@nestjs/common';

/** SQL doubles exercise the real readiness/availability services; PG coverage is in packaging-readiness.pg.spec. */
describe('PackagingInventoryIntegrationService terminal provenance', () => {
  const packing = { is_test: false, status: 'ACTIVE', code: 'PKG-1', production_date: '2026-08-06',
    egg_date: '2026-08-06', shift_id: 9, site_id: 'FARM', grading_codes_json: ['GR'],
    batches_json: [{ grade: 'L', eggs: 30, boxes: 1, specId: 'SPEC' }] };
  function setup(mode = 'PACKAGING_INBOUND', record: any = packing) {
    const sku = { sku_code: 'SKU', product_code: 'PRODUCT', grade_code: 'L', spec_code: 'SPEC',
      variety_code: 'VAR', product_variety_code: 'VAR', status: 'ACTIVE',today:'2026-11-11',effective_date:null,expire_date:null };
    const query = jest.fn(async (sql: string): Promise<any[]> => {
      if (sql.includes('FROM pkg_packing_records')) return [record];
      if (sql.includes('FROM inv_batches') || sql.includes('FROM inv_ledger')) return [];
      if (sql.includes('FROM pkg_work_shifts')) return [{ site_id: record.site_id, egg_date: record.egg_date, is_test: false }];
      if (sql.includes('SELECT g.code FROM pkg_grading_records')) return [{ code: 'GR' }];
      if (sql.includes('SELECT DISTINCT s.house_code')) return [{ house_code: 'HOUSE', egg_date: record.egg_date, batch_status: 'RECEIVED', is_test: false, grading_is_test: false }];
      if (sql.includes('FROM brd_houses')) return [{ house_code: 'HOUSE', farm_code: 'FARM', site_code: 'SITE', company_code: 'COMP' }];
      if (sql.includes('SELECT company_code FROM')) return [{ company_code: 'COMP' }];
      if (sql.includes('FROM sys_organizations')) return [{ org_code: 'COMP' }];
      if (sql.includes('FROM md_egg_source_profiles')) return [{ profile_code: 'PROFILE', company_code: 'COMP', farm_code: 'FARM', site_code: 'SITE', house_code: 'HOUSE', product_mode: 'VARIANT', variety_code: 'VAR', effective_date: '2026-01-01', status: 'ACTIVE' }];
      if (sql.includes('FROM brd_flocks')) return [{ flock_no: 'FLOCK', farm_code: 'FARM', breed_code: 'BREED', status: 'LAYING', placement_date: '2026-01-01' }];
      if (sql.includes('FROM md_variety_breeds')) return [{ variety_code: 'VAR' }];
      if (sql.includes('FROM md_product_varieties')) return [{ variety_code: 'VAR',status:'ACTIVE',effective_date:'2026-01-01',expire_date:null }];
      if (sql.includes('FROM sys_dict')) return sql.includes("dict_type = 'BRD_BREED'") ? [{ dict_code: 'BREED' }] : [];
      if (sql.includes('FROM md_sku_org_scope')) return [{ scope_type: 'COMPANY', scope_code: 'COMP', status: 'ACTIVE', sale_enabled: false, stock_enabled: true, today: '2026-11-11' }];
      if (sql.includes('FROM product_skus')) return [sku];
      if (sql.includes('FROM product_grades')) return [{ grade_code: 'L', is_saleable: true, is_storable: true, status: 'ACTIVE' }];
      if (sql.includes('FROM packaging_specs')) return [{ spec_code: 'SPEC', spec_name: '30 eggs', qty_per_unit: 30, status: 'ACTIVE', base_unit: '枚' }];
      if (sql.includes('FROM mst_products')) return [{ product_code: 'PRODUCT', variety_code: 'VAR', status: 'ACTIVE' }];
      return [];
    });
    const ds: any = { query }; ds.transaction = (work: any) => work(ds);
    const eggInv = { createProductionBatch: jest.fn().mockResolvedValue({ batch_no: 'EGG-20260806-00001' }) };
    const modeSvc = { resolveMode: jest.fn().mockResolvedValue(mode) };
    const service = new PackagingInventoryIntegrationService(ds, { get: () => ({ username: 'tester' }) } as never, eggInv as never, modeSvc as never);
    return { service, ds, eggInv, modeSvc, sku };
  }
  const location = { warehouseCode: 'WH', locationCode: 'LOC' };
  it('forwards authoritative company/date and variety snapshot through the caller transaction', async () => {
    const { service, ds, eggInv, modeSvc } = setup();
    await expect(service.completeTerminalPacking('PKG-1', { ...location, manager: ds })).resolves.toMatchObject({ totalInbound: 30, skippedByMode: false });
    expect(modeSvc.resolveMode).toHaveBeenCalledWith({ siteCode: 'FARM', companyCode: 'COMP' }, ds);
    expect(eggInv.createProductionBatch).toHaveBeenCalledWith(expect.objectContaining({ companyCode: 'COMP', eggDate: '2026-08-06', varietyCode: 'VAR', sourceProfileRefs: [{ profileCode: 'PROFILE', houseCode: 'HOUSE' }], productCode: 'PRODUCT', skuCode: 'SKU', specCode: 'SPEC', qty: 30, collectionBatchRef: 'SHIFT-9', ...location }), ds);
    expect(ds.query).toHaveBeenCalledWith(expect.stringContaining('FROM md_sku_org_scope'), ['SKU', 'COMP', 'FARM', 'SITE']);
  });
  it('TEMP mode does not write packaging inventory', async () => {
    const { service, eggInv } = setup('TEMP_PRODUCTION_INBOUND');
    await expect(service.completeTerminalPacking('PKG-1', location)).resolves.toMatchObject({ totalInbound: 0, skippedByMode: true });
    expect(eggInv.createProductionBatch).not.toHaveBeenCalled();
  });
  it.each(['scope', 'profile', 'company', 'SKU', 'spec'])('rejects missing %s before a batch write', async kind => {
    const { service, ds, eggInv } = setup();
    const original = ds.query.getMockImplementation();
    const table = { scope: 'md_sku_org_scope', profile: 'md_egg_source_profiles', company: 'sys_organizations', SKU: 'product_skus', spec: 'packaging_specs' }[kind];
    ds.query.mockImplementation((sql: string) => sql.includes(`FROM ${table}`) ? Promise.resolve([]) : original(sql));
    await expect(service.completeTerminalPacking('PKG-1', location)).rejects.toThrow();
    expect(eggInv.createProductionBatch).not.toHaveBeenCalled();
  });
  it('explicit identity cannot override provenance variety', async () => {
    const { service, eggInv } = setup('PACKAGING_INBOUND', { ...packing, batches_json: [{ ...packing.batches_json[0], productCode: 'PRODUCT', skuCode: 'SKU', varietyCode: 'OTHER' }] });
    await expect(service.completeTerminalPacking('PKG-1', location)).rejects.toThrow('品种');
    expect(eggInv.createProductionBatch).not.toHaveBeenCalled();
  });
  it('rejects missing shift ownership rather than guessing from customers/environment', async () => {
    const { service, modeSvc, ds } = setup('PACKAGING_INBOUND', { ...packing, site_id: null, shift_id: null });
    await expect(service.completeTerminalPacking('PKG-1', location)).rejects.toThrow('缺权威场站');
    expect(modeSvc.resolveMode).not.toHaveBeenCalled();
    expect(ds.query.mock.calls.some(([sql]: [string]) => sql.includes('sal_customers'))).toBe(false);
  });
  it('uses shift farm ownership for inventory-mode historical reads', async () => {
    const { service, modeSvc } = setup();
    await expect(service.getTerminalInventoryMode('PKG-1')).resolves.toBe('PACKAGING_INBOUND');
    expect(modeSvc.resolveMode).toHaveBeenCalledWith({ siteCode: 'FARM', companyCode: 'COMP' });
  });
  it('refuses missing authoritative business date at the shared write entry', async () => {
    const { service, eggInv } = setup();
    await expect(service.generateSaleableFromOutputs('PKG-1', [{ grade: 'L', qty: 30, specCode: 'SPEC' }])).rejects.toThrow('日期');
    expect(eggInv.createProductionBatch).not.toHaveBeenCalled();
  });
});

describe('PackagingInventoryIntegrationService legacy owner policy', () => {
  function fixture(options: { owners?: any[]; configured?: string; existing?: boolean } = {}) {
    const ownerQuery = jest.fn().mockResolvedValue(options.owners ?? [{ house_code: 'HOUSE', farm_code: 'FARM', company_code: 'COMP', site_code: 'SITE' }]);
    const query = jest.fn(async (sql: string): Promise<any[]> => {
      if (sql.includes('FROM pkg_tasks')) return [{ task_no: 'OLD-PACK', house_code: 'HOUSE', shift_id: 7, grade_results: { L: 30 } }];
      if (sql.includes('FROM inv_batches')) return options.existing ? [{ batch_no: 'SAVED' }] : [];
      if (sql.includes('FROM md_egg_source_profiles')) return options.configured ? [{ profile_code: 'PROFILE', status: options.configured }] : [];
      if (sql.includes('FROM pkg_work_shifts')) return [{ site_id: 'FARM', egg_date: '2026-01-01' }];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const ds = { query, manager: { query: ownerQuery } };
    const eggInv = { createProductionBatch: jest.fn() };
    const service = new PackagingInventoryIntegrationService(ds as never, {} as never, eggInv as never, {} as never);
    return { service, ds, ownerQuery, eggInv };
  }

  it.each(['ACTIVE', 'INACTIVE'])('rejects fresh legacy inventory for %s configured company using canonical ownership on ds.manager', async configured => {
    const f = fixture({ configured });
    await expect(f.service.completePackagingBatch('OLD-PACK')).rejects.toBeInstanceOf(ConflictException);
    expect(f.ownerQuery).toHaveBeenCalledWith(expect.stringContaining('FROM brd_houses'), ['HOUSE']);
    expect(f.ds.query).toHaveBeenCalledWith(expect.stringContaining('FROM md_egg_source_profiles'), ['COMP']);
    expect(f.eggInv.createProductionBatch).not.toHaveBeenCalled();
  });

  it.each([{ owners: [] }, { owners: [{ house_code: 'HOUSE', farm_code: 'FARM', company_code: null }] }, { owners: [
    { house_code: 'HOUSE', farm_code: 'FARM', company_code: 'COMP' },
    { house_code: 'HOUSE', farm_code: 'OTHER', company_code: 'COMP-B' },
  ] }])('keeps missing or ambiguous owner failures as HTTP conflicts', async ({ owners }) => {
    const f = fixture({ owners });
    await expect(f.service.completePackagingBatch('OLD-PACK')).rejects.toMatchObject({ status: 409 });
    expect(f.eggInv.createProductionBatch).not.toHaveBeenCalled();
    expect(f.ds.query.mock.calls.some(([sql]) => sql.includes('FROM md_egg_source_profiles'))).toBe(false);
  });

  it('skips new owner classification for existing inventory history replay', async () => {
    const f = fixture({ existing: true, owners: [] });
    jest.spyOn(f.service, 'generateSaleableFromOutputs').mockResolvedValue({ refNo: 'OLD-PACK', idempotent: true, companyCode: 'COMP', batches: [], skippedNonSaleable: [], totalInbound: 30 });
    await expect(f.service.completePackagingBatch('OLD-PACK')).resolves.toMatchObject({ taskNo: 'OLD-PACK', idempotent: true });
    expect(f.ownerQuery).not.toHaveBeenCalled();
    expect(f.ds.query.mock.calls.some(([sql]) => sql.includes('FROM md_egg_source_profiles'))).toBe(false);
    expect(f.eggInv.createProductionBatch).not.toHaveBeenCalled();
  });
});
