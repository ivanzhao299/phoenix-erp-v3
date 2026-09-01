import { ForbiddenException } from '@nestjs/common';
import {
  SalesActivityService,
  mergeSalesActivityRows,
  resolveRequestedSources,
  type SalesActivityRow,
} from './sales-activity.service';
import * as fs from 'node:fs';

const row = (sourceType: 'ORDER' | 'POS', sourceId: string, occurredAt: string): SalesActivityRow => ({
  sourceType,
  sourceId,
  documentNo: `${sourceType}-${sourceId}`,
  companyCode: 'C1',
  storeCode: sourceType === 'POS' ? 'S1' : null,
  customerCode: null,
  customerName: '散客',
  status: sourceType === 'POS' ? 'COMPLETED' : 'RECEIVED',
  displayCategory: sourceType === 'POS' ? 'COMPLETED_SALE' : 'RECEIVED_ORDER',
  amount: 10,
  currency: 'CNY',
  businessDate: '2026-09-01',
  occurredAt,
  detailHref: sourceType === 'POS' ? `/store-pos?saleId=${sourceId}&storeCode=S1` : `/sales2/orders?orderId=${sourceId}`,
});

describe('sales activity facade contract', () => {
  it('is a read-only facade and cannot become a finance, inventory, or settlement writer', () => {
    const source = fs.readFileSync(require.resolve('./sales-activity.service'), 'utf8');
    expect(source).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|MERGE\s+INTO)\b/i);
    expect(source).not.toMatch(/StoreSettlementService|FinanceArAdapter|fin_cash_transactions|inv_ledger/);
  });

  it('uses the frozen DTO and stable tuple sort without document-number dedupe', () => {
    const merged = mergeSalesActivityRows([
      row('ORDER', 'same', '2026-09-01T10:00:00.000Z'),
      row('POS', 'same', '2026-09-01T10:00:00.000Z'),
      row('POS', 'later', '2026-09-01T11:00:00.000Z'),
    ], 3);
    expect(merged.map(x => [x.sourceType, x.sourceId])).toEqual([
      ['POS', 'later'],
      ['ORDER', 'same'],
      ['POS', 'same'],
    ]);
  });

  it('crops ALL to available sources and rejects a directly requested unauthorized source', () => {
    expect(resolveRequestedSources('ALL', ['ORDER'])).toEqual(['ORDER']);
    expect(() => resolveRequestedSources('POS', ['ORDER'])).toThrow(ForbiddenException);
  });

  it('does not silently map a source-specific status to the other source', async () => {
    const ds = { query: jest.fn().mockResolvedValue([]) } as any;
    const cls = { get: jest.fn((key: string) => key === 'user'
      ? { userId: 'U1', roles: ['ROLE_USER'], permissions: ['MENU_SALES2_ORDER:V', 'MENU_STORE_POS:V'] }
      : { isGlobal: false, allowedCompanyCodes: ['C1'], allowedWarehouseCodes: ['W1'] }) } as any;
    const storeScope = { listMembershipStores: jest.fn().mockResolvedValue([{
      storeCode: 'S1', hasSalesWarehouse: true, hasWarehouseScopeIntersection: true,
    }]) } as any;
    const scopeService = { resolve: jest.fn().mockResolvedValue({ isGlobal: false, allowedCompanyCodes: ['C1'], allowedWarehouseCodes: ['W1'] }) } as any;
    const svc = new SalesActivityService(ds, cls, storeScope, scopeService);
    await svc.list({ source: 'ALL', status: 'COMPLETED', page: 1, limit: 20 });
    const sql = ds.query.mock.calls.map((call: any[]) => String(call[0]));
    expect(sql.some((value: string) => value.includes('FROM sal_store_sales'))).toBe(true);
    expect(sql.some((value: string) => value.includes('FROM sal_sales_orders'))).toBe(false);
  });

  it('returns hasMore without a fabricated total', async () => {
    const ds = { query: jest.fn().mockResolvedValue([]) } as any;
    const cls = { get: jest.fn((key: string) => key === 'user'
      ? { permissions: ['MENU_SALES2_ORDER:V'] }
      : { isGlobal: false, allowedCompanyCodes: ['C1'], allowedWarehouseCodes: [] }) } as any;
    const svc = new SalesActivityService(ds, cls, { listMembershipStores: jest.fn() } as any, { resolve: jest.fn() } as any);
    const result = await svc.list({ source: 'ALL', page: 1, limit: 20 });
    expect(result).toMatchObject({ availableSources: ['ORDER'], hasMore: false, page: 1, limit: 20 });
    expect(result).not.toHaveProperty('total');
  });

  it.each([
    ['POS user without membership', { userId: 'U1', permissions: ['MENU_STORE_POS:V'] }],
    ['global admin without membership', { userId: 'A1', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] }],
  ])('fails closed for %s', async (_label, user) => {
    const ds = { query: jest.fn() } as any;
    const cls = { get: jest.fn((key: string) => key === 'user' ? user : { isGlobal: true }) } as any;
    const storeScope = { listMembershipStores: jest.fn().mockResolvedValue([]) } as any;
    const dataScope = { resolve: jest.fn().mockResolvedValue({ isGlobal: true, allowedCompanyCodes: [], allowedWarehouseCodes: [] }) } as any;
    const svc = new SalesActivityService(ds, cls, storeScope, dataScope);
    await expect(svc.list({ source: 'POS' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(ds.query).not.toHaveBeenCalled();
  });

  it('queries all visible POS stores once with a parameterized ANY array', async () => {
    const ds = { query: jest.fn().mockResolvedValue([]) } as any;
    const user = { userId: 'U1', permissions: ['MENU_STORE_POS:V'] };
    const cls = { get: jest.fn((key: string) => key === 'user' ? user : null) } as any;
    const storeScope = { listMembershipStores: jest.fn().mockResolvedValue([
      { storeCode: 'S1', hasSalesWarehouse: true, hasWarehouseScopeIntersection: true },
      { storeCode: 'S2', hasSalesWarehouse: true, hasWarehouseScopeIntersection: true },
      { storeCode: 'S3', hasSalesWarehouse: false, hasWarehouseScopeIntersection: false },
    ]) } as any;
    const posScope = { isGlobal: false, allowedCompanyCodes: ['C1'], allowedWarehouseCodes: ['W1'] };
    const svc = new SalesActivityService(ds, cls, storeScope, { resolve: jest.fn().mockResolvedValue(posScope) } as any);
    await svc.list({ source: 'POS' });
    expect(storeScope.listMembershipStores).toHaveBeenCalledWith(user, posScope);
    expect(ds.query).toHaveBeenCalledTimes(1);
    expect(ds.query.mock.calls[0][0]).toContain('store_code=ANY($1::text[])');
    expect(ds.query.mock.calls[0][1][0]).toEqual(['S1', 'S2']);
  });

  it('returns the POS-only and empty available-source states without widening access', async () => {
    const posDs = { query: jest.fn().mockResolvedValue([]) } as any;
    const posUser = { userId: 'U1', permissions: ['MENU_STORE_POS:V'] };
    const posSvc = new SalesActivityService(
      posDs,
      { get: jest.fn((key: string) => key === 'user' ? posUser : null) } as any,
      { listMembershipStores: jest.fn().mockResolvedValue([{ storeCode: 'S1', hasSalesWarehouse: true, hasWarehouseScopeIntersection: true }]) } as any,
      { resolve: jest.fn().mockResolvedValue({ isGlobal: false, allowedCompanyCodes: ['C1'], allowedWarehouseCodes: ['W1'] }) } as any,
    );
    await expect(posSvc.list({ source: 'ALL' })).resolves.toMatchObject({ availableSources: ['POS'] });

    const emptyDs = { query: jest.fn() } as any;
    const emptySvc = new SalesActivityService(
      emptyDs,
      { get: jest.fn((key: string) => key === 'user' ? { permissions: [] } : null) } as any,
      { listMembershipStores: jest.fn() } as any,
      { resolve: jest.fn() } as any,
    );
    await expect(emptySvc.list({ source: 'ALL' })).resolves.toMatchObject({ availableSources: [], data: [] });
    expect(emptyDs.query).not.toHaveBeenCalled();
  });

  it('always includes and queries ORDER for a global admin', async () => {
    const ds = { query: jest.fn().mockResolvedValue([]) } as any;
    const svc = new SalesActivityService(
      ds,
      { get: jest.fn((key: string) => key === 'user'
        ? { userId: 'A1', roles: ['ROLE_ADMIN'], permissions: ['*'] }
        : { isGlobal: true, allowedCompanyCodes: [] }) } as any,
      { listMembershipStores: jest.fn().mockResolvedValue([]) } as any,
      { resolve: jest.fn().mockResolvedValue({ isGlobal: true, allowedCompanyCodes: [], allowedWarehouseCodes: [] }) } as any,
    );
    const result = await svc.list({ source: 'ALL' });
    expect(result.availableSources).toContain('ORDER');
    expect(ds.query).toHaveBeenCalledTimes(1);
    expect(ds.query.mock.calls[0][0]).toContain('FROM sal_sales_orders');
    expect(ds.query.mock.calls[0][0]).not.toContain('company_code=ANY');
  });
});
