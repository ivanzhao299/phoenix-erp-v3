import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StoreInventoryQueryService } from './store-inventory-query.service';

function setup(options: { warehouses?: string[]; rows?: any[] } = {}) {
  const warehouses = options.warehouses ?? ['WH-SALES', 'WH-RET'];
  const ds = { query: jest.fn(async (sql: string) => {
    if (sql.includes('SUM(b.qty)')) return [{ onHand: '12', available: '7', quarantine: '3', reserved: '2' }];
    if (sql.includes('COUNT(*)')) return [{ total: '2' }];
    return options.rows ?? [{ batch_no: 'RET-POS-1-1', status: 'QUARANTINE', source_no: 'POS-1', ledger_change_type: 'SALE_RETURN' }];
  }) } as any;
  const scope = { resolveInventory: jest.fn(async () => ({
    storeCode: 'STORE-A', storeName: 'A', companyCode: 'COMP-A', warehouseCodes: warehouses,
  })) } as any;
  return { service: new StoreInventoryQueryService(ds, scope), ds, scope };
}

describe('StoreInventoryQueryService', () => {
  it('uses scoped warehouses, keeps all positive on-hand statuses, and exposes explicit KPIs', async () => {
    const { service, ds } = setup();
    const result = await service.query({ storeCode: 'STORE-A' });
    expect(result.summary).toEqual({ onHand: 12, available: 7, quarantine: 3, reserved: 2 });
    expect(result.rows[0]).toMatchObject({ status: 'QUARANTINE', source_no: 'POS-1', ledger_change_type: 'SALE_RETURN' });
    for (const call of ds.query.mock.calls) {
      expect(call[0]).toContain('b.warehouse_code=ANY($1::varchar[])');
      expect(call[0]).toContain('COALESCE(b.qty,0)>0');
      expect(call[1][0]).toEqual(['WH-SALES', 'WH-RET']);
    }
  });

  it('makes the available tab an exact AVAILABLE status filter', async () => {
    const { service, ds } = setup();
    await service.query({ storeCode: 'STORE-A', status: 'AVAILABLE' });
    const filtered = ds.query.mock.calls.slice(1);
    expect(filtered.every((call: any[]) => call[0].includes('b.status=$2'))).toBe(true);
    expect(filtered.every((call: any[]) => call[1][1] === 'AVAILABLE')).toBe(true);
  });

  it('makes the quarantine tab exact and joins the return ledger by batch and warehouse', async () => {
    const { service, ds } = setup();
    await service.query({ storeCode: 'STORE-A', status: 'QUARANTINE' });
    const rowsSql = String(ds.query.mock.calls.find((call: any[]) => call[0].includes('LEFT JOIN LATERAL'))?.[0]);
    expect(rowsSql).toContain('il.batch_no=b.batch_no AND il.warehouse_code=b.warehouse_code');
    expect(rowsSql).toContain('ledger.change_type AS ledger_change_type');
  });

  it('rejects invalid status and warehouses outside the resolved intersection', async () => {
    const { service } = setup();
    await expect(service.query({ storeCode: 'STORE-A', status: 'UNKNOWN' as any })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.query({ storeCode: 'STORE-A', warehouseCode: 'WH-X' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates fail-closed membership/scope errors', async () => {
    const { service, scope } = setup();
    scope.resolveInventory.mockRejectedValueOnce(new ForbiddenException('无有效库存仓权限交集'));
    await expect(service.query({ storeCode: 'STORE-A' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
