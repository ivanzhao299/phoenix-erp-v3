import { ForbiddenException } from '@nestjs/common';
import { InventoryAnalyticsService } from './inventory-analytics.service';

const scope = {
  isGlobal: false,
  scopeLevel: 'COMPANY' as const,
  allowedCompanyCodes: ['COMP-A'],
  allowedProjectCodes: [],
  allowedWarehouseCodes: ['WH-A'],
  allowedFarmCodes: [],
  allowedSiteCodes: [],
  userId: 'operator-a',
};

function createService() {
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('GROUP BY COALESCE(b.status')) {
      return [{ status: 'AVAILABLE', cnt: '1', value: '100', cost_pending_batches: 0, cost_pending_quantity: '0' }];
    }
    if (sql.includes("change_type IN ('OUTBOUND','SALES','TRANSFER')")) return [{ qty: '60' }];
    if (sql.includes("SUM(b.qty),0)::text AS qty")) return [{ qty: '90' }];
    if (sql.includes("change_type IN ('FIFO_OUT','SALE_OUTBOUND')")) return [{ unit: '枚', qty: '30' }];
    if (sql.includes('AS transfer_out')) return [{ unit: '枚', transfer_out: '0', sale_return: '0', other_out: '0', reserved: '30', released: '0' }];
    if (sql.includes('AS quantity')) return [{ unit: '枚', quantity: '0' }];
    if (sql.includes('SUM(b.qty_available)')) return [{ unit: '枚', qty: '60' }];
    if (sql.includes("GROUP BY 1 ORDER BY 1")) return [];
    if (sql.includes('SELECT COUNT(*)::text AS c')) return [{ c: '0' }];
    return [];
  });
  return { service: new InventoryAnalyticsService({ query } as any), query };
}

describe('InventoryAnalyticsService', () => {
  it('keeps the legacy turnover field while adding scoped actual-sales-to-available by unit', async () => {
    const { service, query } = createService();
    const result = await service.compute({ companyCode: 'COMP-A', warehouseCode: 'WH-A' }, scope as any);

    expect(result).toMatchObject({
      status: 'AVAILABLE',
      turnover30Day: 0.67,
      salesOutToAvailableStatus: 'AVAILABLE',
      salesOutToAvailable30Day: 30 / 60,
      salesOutToAvailableByUnit: [{ unit: '枚', sold30Day: 30, available: 60, rate: 0.5 }],
    });
    expect(query).toHaveBeenCalledTimes(9);
    for (const [, params] of query.mock.calls) expect(params).toEqual([['COMP-A'], ['WH-A'], null, null, null]);
    const actualSalesQuery = query.mock.calls.find(([sql]) => sql.includes("change_type IN ('FIFO_OUT','SALE_OUTBOUND')"))?.[0];
    expect(actualSalesQuery).toContain('GROUP BY COALESCE(NULLIF(btrim(b.unit)');
    expect(actualSalesQuery).not.toContain('RESERVED');
    expect(actualSalesQuery).not.toContain('TRANSFER');
    expect(actualSalesQuery).toContain('l.qty_change<0');
    expect(result.otherMovementsByUnit).toEqual([{ unit: '枚', transferOut: 0, saleReturn: 0, otherOut: 0, reserved: 30, released: 0 }]);
  });

  it('does not collapse different units or divide by a zero available balance', async () => {
    const { service } = createService();
    const result = await service.compute({}, { ...scope, isGlobal: true } as any);
    expect(result.salesOutToAvailableStatus).toBe('AVAILABLE');

    const mixed = createService();
    mixed.query.mockImplementation(async (sql: string) => {
      if (sql.includes('GROUP BY COALESCE(b.status')) return [];
      if (sql.includes("change_type IN ('OUTBOUND','SALES','TRANSFER')")) return [{ qty: '0' }];
      if (sql.includes("SUM(b.qty),0)::text AS qty")) return [{ qty: '0' }];
      if (sql.includes("change_type IN ('FIFO_OUT','SALE_OUTBOUND')")) return [{ unit: '枚', qty: '2' }];
      if (sql.includes('AS transfer_out')) return [{ unit: '枚', transfer_out: '0', sale_return: '0', other_out: '0', reserved: '0', released: '0' }];
      if (sql.includes('AS quantity')) return [{ unit: '枚', quantity: '0' }];
      if (sql.includes('SUM(b.qty_available)')) return [{ unit: 'kg', qty: '3' }];
      if (sql.includes("GROUP BY 1 ORDER BY 1")) return [];
      if (sql.includes('SELECT COUNT(*)::text AS c')) return [{ c: '0' }];
      return [];
    });
    const mixedResult = await mixed.service.compute({}, { ...scope, isGlobal: true } as any);
    expect(mixedResult.salesOutToAvailableStatus).toBe('MIXED_UNITS');
    expect(mixedResult.salesOutToAvailable30Day).toBeNull();

    mixed.query.mockImplementation(async (sql: string) => {
      if (sql.includes('GROUP BY COALESCE(b.status')) return [];
      if (sql.includes("change_type IN ('OUTBOUND','SALES','TRANSFER')")) return [{ qty: '2' }];
      if (sql.includes("SUM(b.qty),0)::text AS qty")) return [{ qty: '0' }];
      if (sql.includes("change_type IN ('FIFO_OUT','SALE_OUTBOUND')")) return [{ unit: '枚', qty: '2' }];
      if (sql.includes('AS transfer_out')) return [{ unit: '枚', transfer_out: '0', sale_return: '0', other_out: '0', reserved: '0', released: '0' }];
      if (sql.includes('AS quantity')) return [{ unit: '枚', quantity: '0' }];
      if (sql.includes('SUM(b.qty_available)')) return [{ unit: '枚', qty: '0' }];
      if (sql.includes("GROUP BY 1 ORDER BY 1")) return [];
      if (sql.includes('SELECT COUNT(*)::text AS c')) return [{ c: '0' }];
      return [];
    });
    const soldOut = await mixed.service.compute({}, { ...scope, isGlobal: true } as any);
    expect(soldOut.salesOutToAvailableStatus).toBe('NO_STOCK');
    expect(soldOut.salesOutToAvailable30Day).toBeNull();
    expect(soldOut.salesOutToAvailableByUnit).toMatchObject([{ unit: '枚', available: 0, rate: null }]);
  });

  it('denies cross-company, cross-warehouse, and empty non-global scopes before querying', async () => {
    const { service, query } = createService();
    await expect(service.compute({ companyCode: 'COMP-B' }, scope as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.compute({ warehouseCode: 'WH-B' }, scope as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.compute({}, { ...scope, allowedWarehouseCodes: [] } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns unavailable instead of fabricated zeros when a source query fails', async () => {
    const { service, query } = createService();
    query.mockRejectedValueOnce(new Error('synthetic database read failure'));
    const result = await service.compute({}, scope as any);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.salesOutToAvailableStatus).toBe('UNAVAILABLE');
    expect(result.salesOutToAvailable30Day).toBeNull();
    expect(result.capitalOccupation).toBeNull();
  });
});
