import { PackagingInventoryIntegrationService } from './packaging-inventory-integration.service';

describe('PackagingInventoryIntegrationService terminal handover', () => {
  it('posts idempotent unified inventory even when the legacy source mode is TEMP', async () => {
    const ds = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM pkg_packing_records')) return [{
          code: 'PKG-1', production_date: '2026-08-06', shift_id: 9,
          batches_json: [{ grade: 'L', eggs: 300, spec: null }],
        }];
        if (sql.includes('FROM sys_dict')) return [];
        if (sql.includes('FROM pkg_work_shifts')) return [{ site_id: 'SITE-1' }];
        if (sql.includes('WHERE packaging_batch_ref')) return [];
        if (sql.includes('FROM sal_customers')) return [{ company_code: 'COMP-1' }];
        if (sql.includes('FROM product_grades')) return [{ grade_code: 'L', is_saleable: true }];
        return [];
      }),
    };
    const eggInv = {
      createProductionBatch: jest.fn().mockResolvedValue({ batch_no: 'EGG-20260806-00001' }),
    };
    const modeSvc = { resolveMode: jest.fn().mockResolvedValue('TEMP_PRODUCTION_INBOUND') };
    const cls = { get: jest.fn().mockReturnValue({ username: 'tester' }) };
    const service = new PackagingInventoryIntegrationService(
      ds as never, cls as never, eggInv as never, modeSvc as never,
    );

    await expect(service.completeTerminalPacking('PKG-1')).resolves.toMatchObject({
      totalInbound: 300,
      mode: 'TEMP_PRODUCTION_INBOUND',
      skippedByMode: false,
    });
    expect(eggInv.createProductionBatch).toHaveBeenCalledWith(expect.objectContaining({
      qty: 300,
      packagingBatchRef: 'PKG-1',
      ledgerChangeType: 'PACKAGING_INBOUND',
    }));
  });
});
