import { PackagingInventoryIntegrationService } from './packaging-inventory-integration.service';

describe('PackagingInventoryIntegrationService terminal handover', () => {
  function setup(mode: 'TEMP_PRODUCTION_INBOUND' | 'PACKAGING_INBOUND', packing: Record<string, any>) {
    const ds: any = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM pkg_packing_records')) return [packing];
        if (sql.includes('FROM sys_dict')) return [];
        if (sql.includes('WHERE packaging_batch_ref')) return [];
        if (sql.includes('FROM sal_customers')) return [{ company_code: 'COMP-1' }];
        if (sql.includes('SELECT company_code FROM')) return [{ company_code: 'COMP-1' }];
        if (sql.includes('FROM product_grades')) return [{ grade_code: 'L', is_saleable: true, is_storable: true, status: 'ACTIVE' }];
        if (sql.includes('FROM packaging_specs')) return [{ spec_code: 'PKG_PACK_SPEC_3', qty_per_unit: 30, status: 'ACTIVE' }];
        if (sql.includes('FROM mst_products')) return [{ product_code: 'REGISTERED-EGG', status: 'ACTIVE' }];
        if (sql.includes('FROM product_skus')) return [{ sku_code: 'EGG-L-PKG_PACK_SPEC_3', product_code: 'REGISTERED-EGG', status: 'ACTIVE' }];
        return [];
      }),
    };
    ds.transaction = (work: any) => work(ds);
    const eggInv = {
      createProductionBatch: jest.fn().mockResolvedValue({ batch_no: 'EGG-20260806-00001' }),
    };
    const modeSvc = { resolveMode: jest.fn().mockResolvedValue(mode) };
    const cls = { get: jest.fn().mockReturnValue({ username: 'tester' }) };
    const service = new PackagingInventoryIntegrationService(
      ds as never, cls as never, eggInv as never, modeSvc as never,
    );
    return { service, ds, eggInv, modeSvc };
  }

  const packing = {
    is_test: false, status: 'ACTIVE', code: 'PKG-1', production_date: '2026-08-06', shift_id: 9, site_id: 'FARM-MS',
    batches_json: [{ grade: 'L', eggs: 300, specId: 'PKG_PACK_SPEC_3' }],
  };

  it('uses shift site and skips packaging inventory when that site is TEMP', async () => {
    const { service, eggInv, modeSvc } = setup('TEMP_PRODUCTION_INBOUND', packing);

    await expect(service.completeTerminalPacking('PKG-1', { warehouseCode: 'WMS-1', locationCode: 'LOC-1' })).resolves.toMatchObject({
      totalInbound: 0,
      mode: 'TEMP_PRODUCTION_INBOUND',
      skippedByMode: true,
    });
    expect(modeSvc.resolveMode).toHaveBeenCalledWith({ siteCode: 'FARM-MS', companyCode: 'COMP-1' }, expect.anything());
    expect(eggInv.createProductionBatch).not.toHaveBeenCalled();
  });

  it('uses shift site and posts inventory when that site is PACKAGING', async () => {
    const { service, eggInv, modeSvc } = setup('PACKAGING_INBOUND', packing);

    await expect(service.completeTerminalPacking('PKG-1', { warehouseCode: 'WMS-1', locationCode: 'LOC-1' })).resolves.toMatchObject({
      totalInbound: 300,
      mode: 'PACKAGING_INBOUND',
      skippedByMode: false,
    });
    expect(modeSvc.resolveMode).toHaveBeenCalledWith({ siteCode: 'FARM-MS', companyCode: 'COMP-1' }, expect.anything());
    expect(eggInv.createProductionBatch).toHaveBeenCalledWith(expect.objectContaining({
      companyCode: 'COMP-1',
      qty: 300,
      packagingBatchRef: 'PKG-1',
      collectionBatchRef: 'SHIFT-9',
    }), expect.anything());
  });

  it('preserves specId and resolves the authoritative product-grade-spec SKU', async () => {
    const { service, eggInv, ds } = setup('PACKAGING_INBOUND', {
      ...packing,
      batches_json: [{ grade: 'L', eggs: 30, spec: '精品礼盒(30枚/盒)', specId: 'PKG_PACK_SPEC_3' }],
    });

    await service.completeTerminalPacking('PKG-1', { warehouseCode: 'WMS-1', locationCode: 'LOC-1' });

    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE spec_code=$1'),
      ['PKG_PACK_SPEC_3'],
    );
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE grade_code=$1 AND spec_code=$2'),
      ['L', 'PKG_PACK_SPEC_3', null],
    );
    expect(eggInv.createProductionBatch).toHaveBeenCalledWith(expect.objectContaining({
      productCode: 'REGISTERED-EGG',
      gradeCodeStd: 'L',
      specCode: 'PKG_PACK_SPEC_3',
      skuCode: 'EGG-L-PKG_PACK_SPEC_3',
    }), expect.anything());
  });

  it('blocks inventory when an explicit specId has no ACTIVE master record', async () => {
    const withSpec = { ...packing, batches_json: [{ grade: 'L', eggs: 30, specId: 'MISSING-SPEC' }] };
    const { service, eggInv, ds } = setup('PACKAGING_INBOUND', withSpec);
    ds.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pkg_packing_records')) return [withSpec];
      if (sql.includes('FROM sys_dict')) return [];
      if (sql.includes('WHERE packaging_batch_ref')) return [];
      if (sql.includes('SELECT company_code FROM')) return [{ company_code: 'COMP-1' }];
      if (sql.includes('FROM product_grades')) return [{ grade_code: 'L', is_saleable: true, is_storable: true, status: 'ACTIVE' }];
      if (sql.includes('FROM packaging_specs')) return [];
      return [];
    });

    await expect(service.completeTerminalPacking('PKG-1', { warehouseCode: 'WMS-1', locationCode: 'LOC-1' }))
      .rejects.toThrow('规格 MISSING-SPEC 主数据缺失');
    expect(eggInv.createProductionBatch).not.toHaveBeenCalled();
  });

  it('blocks inventory when the authoritative SKU is missing', async () => {
    const withSpec = { ...packing, batches_json: [{ grade: 'L', eggs: 30, specId: 'PKG_PACK_SPEC_3' }] };
    const { service, eggInv, ds } = setup('PACKAGING_INBOUND', withSpec);
    ds.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pkg_packing_records')) return [withSpec];
      if (sql.includes('FROM sys_dict')) return [];
      if (sql.includes('WHERE packaging_batch_ref')) return [];
      if (sql.includes('SELECT company_code FROM')) return [{ company_code: 'COMP-1' }];
      if (sql.includes('FROM product_grades')) return [{ grade_code: 'L', is_saleable: true, is_storable: true, status: 'ACTIVE' }];
      if (sql.includes('FROM packaging_specs')) return [{ spec_code: 'PKG_PACK_SPEC_3', qty_per_unit: 30, status: 'ACTIVE' }];
      if (sql.includes('FROM mst_products')) return [{ product_code: 'REGISTERED-EGG', status: 'ACTIVE' }];
        if (sql.includes('FROM product_skus')) return [];
      return [];
    });

    await expect(service.completeTerminalPacking('PKG-1', { warehouseCode: 'WMS-1', locationCode: 'LOC-1' }))
      .rejects.toThrow('L/PKG_PACK_SPEC_3 SKU 主数据缺失');
    expect(eggInv.createProductionBatch).not.toHaveBeenCalled();
  });

  it('passes the handover warehouse, location and transaction manager to inventory writes', async () => {
    const { service, eggInv, ds } = setup('PACKAGING_INBOUND', packing);
    const manager = { query: jest.fn((sql: string, params?: unknown[]) => (ds.query as any)(sql, params)) } as any;

    await service.completeTerminalPacking('PKG-1', {
      warehouseCode: 'WMS-MS-01', locationCode: 'CS-KW-MS01', manager,
    });

    expect(eggInv.createProductionBatch).toHaveBeenCalledWith(expect.objectContaining({
      warehouseCode: 'WMS-MS-01', locationCode: 'CS-KW-MS01',
    }), manager);
  });

  it('refuses to guess ownership when the packing record has no shift', async () => {
    const { service, modeSvc } = setup('TEMP_PRODUCTION_INBOUND', {
      ...packing, shift_id: null, site_id: null,
    });

    await expect(service.completeTerminalPacking('PKG-1', { warehouseCode: 'WMS-1', locationCode: 'LOC-1' })).rejects.toThrow('缺权威场站');
    expect(modeSvc.resolveMode).not.toHaveBeenCalled();
  });

  it('uses the same shift site when refreshing terminal inventory mode', async () => {
    const { service, modeSvc } = setup('PACKAGING_INBOUND', packing);

    await expect(service.getTerminalInventoryMode('PKG-1')).resolves.toBe('PACKAGING_INBOUND');
    expect(modeSvc.resolveMode).toHaveBeenCalledWith({ siteCode: 'FARM-MS', companyCode: 'COMP-1' });
  });

  it('fails closed when protection schema is missing', async () => {
    const { service, ds, modeSvc } = setup('TEMP_PRODUCTION_INBOUND', {
      is_test: false, status: 'ACTIVE', code: 'PKG-1', production_date: '2026-08-06',
      batches_json: [{ grade: 'L', eggs: 300, specId: 'PKG_PACK_SPEC_3' }],
    });
    let packingQueries = 0;
    ds.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pkg_packing_records')) {
        packingQueries += 1;
        if (sql.includes('p.shift_id')) throw Object.assign(new Error('column does not exist'), { code: '42703' });
        return [{
          is_test: false, status: 'ACTIVE', code: 'PKG-1', production_date: '2026-08-06',
          batches_json: [{ grade: 'L', eggs: 300, specId: 'PKG_PACK_SPEC_3' }],
        }];
      }
      if (sql.includes('FROM sys_dict')) return [];
      if (sql.includes('WHERE packaging_batch_ref')) return [];
      if (sql.includes('FROM sal_customers')) return [{ company_code: 'COMP-1' }];
      if (sql.includes('SELECT company_code FROM')) return [{ company_code: 'COMP-1' }];
      return [];
    });

    await expect(service.completeTerminalPacking('PKG-1', { warehouseCode: 'WMS-1', locationCode: 'LOC-1' })).rejects.toMatchObject({ code: '42703' });
    expect(packingQueries).toBe(1);
    expect(modeSvc.resolveMode).not.toHaveBeenCalled();
  });
});
