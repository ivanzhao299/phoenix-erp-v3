import { PackagingInventoryIntegrationService } from './packaging-inventory-integration.service';

describe('PackagingInventoryIntegrationService terminal handover', () => {
  function setup(mode: 'TEMP_PRODUCTION_INBOUND' | 'PACKAGING_INBOUND', packing: Record<string, any>) {
    const ds = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM pkg_packing_records')) return [packing];
        if (sql.includes('FROM sys_dict')) return [];
        if (sql.includes('WHERE packaging_batch_ref')) return [];
        if (sql.includes('FROM sal_customers')) return [{ company_code: 'COMP-1' }];
        if (sql.includes('FROM product_grades')) return [{ grade_code: 'L', is_saleable: true }];
        return [];
      }),
    };
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
    code: 'PKG-1', production_date: '2026-08-06', shift_id: 9, site_id: 'FARM-MS',
    batches_json: [{ grade: 'L', eggs: 300, spec: null }],
  };

  it('uses shift site and skips packaging inventory when that site is TEMP', async () => {
    const { service, eggInv, modeSvc } = setup('TEMP_PRODUCTION_INBOUND', packing);

    await expect(service.completeTerminalPacking('PKG-1')).resolves.toMatchObject({
      totalInbound: 0,
      mode: 'TEMP_PRODUCTION_INBOUND',
      skippedByMode: true,
    });
    expect(modeSvc.resolveMode).toHaveBeenCalledWith({ siteCode: 'FARM-MS', companyCode: 'COMP-1' });
    expect(eggInv.createProductionBatch).not.toHaveBeenCalled();
  });

  it('uses shift site and posts inventory when that site is PACKAGING', async () => {
    const { service, eggInv, modeSvc } = setup('PACKAGING_INBOUND', packing);

    await expect(service.completeTerminalPacking('PKG-1')).resolves.toMatchObject({
      totalInbound: 300,
      mode: 'PACKAGING_INBOUND',
      skippedByMode: false,
    });
    expect(modeSvc.resolveMode).toHaveBeenCalledWith({ siteCode: 'FARM-MS', companyCode: 'COMP-1' });
    expect(eggInv.createProductionBatch).toHaveBeenCalledWith(expect.objectContaining({
      companyCode: 'COMP-1',
      qty: 300,
      packagingBatchRef: 'PKG-1',
      collectionBatchRef: 'SHIFT-9',
    }));
  });

  it('falls back to company/group mode when the packing record has no shift', async () => {
    const { service, modeSvc } = setup('TEMP_PRODUCTION_INBOUND', {
      ...packing, shift_id: null, site_id: null,
    });

    await service.completeTerminalPacking('PKG-1');

    expect(modeSvc.resolveMode).toHaveBeenCalledWith({ siteCode: null, companyCode: 'COMP-1' });
  });

  it('uses the same shift site when refreshing terminal inventory mode', async () => {
    const { service, modeSvc } = setup('PACKAGING_INBOUND', packing);

    await expect(service.getTerminalInventoryMode('PKG-1')).resolves.toBe('PACKAGING_INBOUND');
    expect(modeSvc.resolveMode).toHaveBeenCalledWith({ siteCode: 'FARM-MS', companyCode: 'COMP-1' });
  });

  it('supports legacy packing tables without shift_id', async () => {
    const { service, ds, modeSvc } = setup('TEMP_PRODUCTION_INBOUND', {
      code: 'PKG-1', production_date: '2026-08-06',
      batches_json: [{ grade: 'L', eggs: 300, spec: null }],
    });
    let packingQueries = 0;
    ds.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pkg_packing_records')) {
        packingQueries += 1;
        if (sql.includes('p.shift_id')) throw Object.assign(new Error('column does not exist'), { code: '42703' });
        return [{
          code: 'PKG-1', production_date: '2026-08-06',
          batches_json: [{ grade: 'L', eggs: 300, spec: null }],
        }];
      }
      if (sql.includes('FROM sys_dict')) return [];
      if (sql.includes('WHERE packaging_batch_ref')) return [];
      if (sql.includes('FROM sal_customers')) return [{ company_code: 'COMP-1' }];
      return [];
    });

    await expect(service.completeTerminalPacking('PKG-1')).resolves.toMatchObject({ skippedByMode: true });
    expect(packingQueries).toBe(2);
    expect(modeSvc.resolveMode).toHaveBeenCalledWith({ siteCode: null, companyCode: 'COMP-1' });
  });
});
