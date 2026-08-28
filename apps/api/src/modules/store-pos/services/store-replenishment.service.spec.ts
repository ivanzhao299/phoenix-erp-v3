import { ForbiddenException } from '@nestjs/common';
import { StoreReplenishmentService } from './store-replenishment.service';

function build(options: { scope?: any; rows?: any[] } = {}) {
  const scope = options.scope ?? {
    isGlobal: false,
    allowedCompanyCodes: ['XINGCHI'],
    allowedWarehouseCodes: ['DP-01', 'DP-02', 'DP-03', 'DP-04'],
  };
  const ds = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM store_replenishment_requests r')) return options.rows ?? [];
      if (sql.includes('FROM wms_warehouses WHERE')) return [
        { warehouseCode: 'DP-01' }, { warehouseCode: 'DP-02' },
        { warehouseCode: 'DP-03' }, { warehouseCode: 'DP-04' },
      ];
      return [];
    }),
    transaction: jest.fn(),
  } as any;
  const storeScope = {
    listMembershipStores: jest.fn(async () => []),
    resolveStoreContext: jest.fn(async () => ({
      storeId: '1', storeCode: 'STORE-HS-001', storeName: '会晒店', companyCode: 'XINGCHI',
      role: '', roles: [], warehouseCodes: ['HS-STORE-WH'], timezone: 'Asia/Vientiane', businessDayCutoff: '00:00:00',
    })),
    resolve: jest.fn(),
  } as any;
  const cls = { get: (key: string) => key === 'dataScope' ? scope : { roles: ['ROLE_WMS_MGR'] } } as any;
  const wms = { createTransfer: jest.fn() } as any;
  return { service: new StoreReplenishmentService(ds, cls, storeScope, wms), ds, storeScope, wms };
}

describe('StoreReplenishmentService approver scope', () => {
  it('returns the approver four scoped warehouses without requiring store membership and excludes the store warehouse', async () => {
    const { service, ds, storeScope } = build();
    await expect(service.sourceWarehouses('STORE-HS-001')).resolves.toHaveLength(4);
    expect(storeScope.resolve).not.toHaveBeenCalled();
    expect(storeScope.resolveStoreContext).toHaveBeenCalledWith('STORE-HS-001', 'SALES');
    expect(ds.query).toHaveBeenCalledWith(expect.stringContaining('NOT (warehouse_code=ANY($2::text[]))'), [
      'XINGCHI', ['HS-STORE-WH'], false, ['DP-01', 'DP-02', 'DP-03', 'DP-04'],
    ]);
  });

  it('rejects approval when the request is not visible in the approver warehouse scope', async () => {
    const { service, wms } = build({ rows: [] });
    await expect(service.approve(99, { sourceWarehouseCode: 'DP-01' }, { username: 'liu' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(wms.createTransfer).not.toHaveBeenCalled();
  });
});
