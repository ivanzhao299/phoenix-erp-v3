import { ForbiddenException } from '@nestjs/common';
import { StoreReplenishmentService } from './store-replenishment.service';

function build(options: { scope?: any; rows?: any[]; targetWarehouseCodes?: string[] } = {}) {
  const scope = options.scope ?? {
    isGlobal: false,
    allowedCompanyCodes: ['XINGCHI'],
    allowedWarehouseCodes: ['DP-01', 'DP-02', 'DP-03', 'DP-04'],
  };
  const ds = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM store_replenishment_requests r')) return options.rows ?? [];
      if (sql.includes('FROM store_replenishment_request_lines')) return [
        { id: 1, sku_code: 'SKU-EGG', requested_qty: 2 },
      ];
      if (sql.includes('FROM inv_batches')) return [
        { batch_no: 'B-DP-01', available: 2 },
      ];
      if (sql.includes('UPDATE store_replenishment_requests')) return [{ id: 7, status: 'APPROVED' }];
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
      role: '', roles: [], warehouseCodes: options.targetWarehouseCodes ?? ['HS-STORE-WH'], timezone: 'Asia/Vientiane', businessDayCutoff: '00:00:00',
    })),
    resolve: jest.fn(),
  } as any;
  const cls = { get: (key: string) => key === 'dataScope' ? scope : { roles: ['ROLE_WMS_MGR'] } } as any;
  const wms = {
    createTransfer: jest.fn(),
    createStoreReplenishmentTransfer: jest.fn(async () => ({ transfer_no: 'TR-STORE-1', status: 'PENDING' })),
  } as any;
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

  it('approves from Liu Shanjun scoped source into the store SALES binding warehouse', async () => {
    const request = {
      id: 7, status: 'SUBMITTED', request_no: 'SR-HS-1', store_code: 'STORE-HS-001',
      source_warehouse_code: null, target_warehouse_code: 'HS-STORE-WH',
    };
    const { service, storeScope, wms } = build({ rows: [request] });

    await expect(service.approve(7, { sourceWarehouseCode: 'DP-01' }, { username: 'liushanjun' }))
      .resolves.toMatchObject({ status: 'APPROVED' });
    expect(storeScope.resolveStoreContext).toHaveBeenCalledWith('STORE-HS-001', 'SALES');
    expect(wms.createStoreReplenishmentTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ from_warehouse: 'DP-01', to_warehouse: 'HS-STORE-WH' }),
      { username: 'liushanjun' },
      expect.objectContaining({ storeCode: 'STORE-HS-001', warehouseCodes: ['HS-STORE-WH'] }),
    );
    expect(wms.createTransfer).not.toHaveBeenCalled();
  });

  it('rejects approval when the source warehouse is outside the approver scope', async () => {
    const request = { id: 7, status: 'SUBMITTED', store_code: 'STORE-HS-001', target_warehouse_code: 'HS-STORE-WH' };
    const { service, wms } = build({ rows: [request] });
    await expect(service.approve(7, { sourceWarehouseCode: 'OUTSIDE-WH' }, { username: 'liushanjun' }))
      .rejects.toThrow('源仓不在仓库 DataScope');
    expect(wms.createStoreReplenishmentTransfer).not.toHaveBeenCalled();
  });

  it('fails closed when the request target is not an active SALES binding of its store', async () => {
    const request = {
      id: 7, status: 'SUBMITTED', request_no: 'SR-HS-FORGED', store_code: 'STORE-HS-001',
      target_warehouse_code: 'FORGED-WH',
    };
    const { service, wms } = build({ rows: [request], targetWarehouseCodes: ['HS-STORE-WH'] });
    await expect(service.approve(7, { sourceWarehouseCode: 'DP-01' }, { username: 'liushanjun' }))
      .rejects.toThrow('目标仓不是该门店有效 SALES 绑定仓');
    expect(wms.createStoreReplenishmentTransfer).not.toHaveBeenCalled();
  });
});
