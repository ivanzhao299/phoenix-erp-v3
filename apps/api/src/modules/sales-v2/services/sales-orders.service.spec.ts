import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import type { ClsService } from 'nestjs-cls';
import { SalesOrdersService } from './sales-orders.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('SalesOrdersService draft creation', () => {
  function makeService(query: jest.Mock) {
    const manager = { query };
    const ds = { query, manager, transaction: jest.fn((fn: any) => fn(manager)) } as unknown as DataSource;
    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'dataScope') return { isGlobal: true, allowedCompanyCodes: [] };
        if (key === 'user') return { userId: '1', username: 'guodapeng', name: '郭大鹏' };
        return undefined;
      }),
    } as unknown as ClsService;

    const priceRuntime = {
      resolvePrice: jest.fn(async () => ({
        unitPrice: 12,
        floorPrice: null,
        ceilingPrice: null,
        priceBookId: '88',
        priceBookNo: 'PB-ACTIVE',
      })),
    };

    const service = new SalesOrdersService(
      ds,
      cls,
      {} as any,
      priceRuntime as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { appendEvent: jest.fn() } as any,
      { get: jest.fn(() => ({})), register: jest.fn() } as any,
    );

    return { service, priceRuntime };
  }

  it('retries order item insert without sku_code when production schema lacks the optional column', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('COUNT(*) AS cnt FROM sal_sales_orders')) {
        return [{ cnt: '0' }];
      }
      if (sql.includes('INSERT INTO sal_sales_orders')) {
        return [{ id: '101', order_no: 'SO-20260708-00001', status: 'DRAFT' }];
      }
      if (sql.includes('INSERT INTO sal_order_items') && sql.includes('sku_code')) {
        const err = new Error('column "sku_code" of relation "sal_order_items" does not exist') as Error & { code: string };
        err.code = '42703';
        throw err;
      }
      if (sql.includes('INSERT INTO sal_order_items')) {
        return [];
      }
      if (sql.includes('SELECT * FROM sal_order_items')) {
        return [{ id: '501', sales_order_id: '101', product_code: 'PRD-EGG-1' }];
      }
      return [];
    });
    const { service } = makeService(query);

    await expect(service.createDraft({
      companyCode: 'COMP-MENGSE',
      currencyCode: 'LAK',
      items: [{
        skuCode: 'SKU-1-30',
        productCode: 'PRD-EGG-1',
        qty: 10,
        actualUnitPrice: 12,
      }],
    })).resolves.toMatchObject({
      id: '101',
      items: [{ id: '501', product_code: 'PRD-EGG-1' }],
    });

    const itemInserts = query.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes('INSERT INTO sal_order_items'));

    expect(itemInserts).toHaveLength(2);
    expect(itemInserts[0]).toContain('sku_code');
    expect(itemInserts[1]).not.toContain('sku_code');
  });

  it('resolves a legacy customer code through the canonical sal_customers columns', async () => {
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM sal_customers')) {
        expect(sql).toContain('customer_no = $1 OR legacy_customer_code = $1');
        expect(sql).not.toMatch(/\bcustomer_code\s*=\s*\$1/);
        expect(params).toEqual(['CUS-LEGACY', 'COMP-LAO-AGRI']);
        return [{
          id: '7',
          customer_no: 'CUS-00007',
          legacy_customer_code: 'CUS-LEGACY',
          customer_name: '试点客户',
          company_code: 'COMP-LAO-AGRI',
          channel_code: 'CH-MS-DIRECT',
        }];
      }
      if (sql.includes('COUNT(*) AS cnt FROM sal_sales_orders')) return [{ cnt: '0' }];
      if (sql.includes('INSERT INTO sal_sales_orders')) {
        expect(params?.[2]).toBe('CUS-00007');
        return [{ id: '102', order_no: 'SO-20260715-00001', status: 'DRAFT' }];
      }
      if (sql.includes('INSERT INTO sal_order_items')) return [];
      if (sql.includes('SELECT * FROM sal_order_items')) return [];
      return [];
    });
    const { service } = makeService(query);

    await expect(service.createDraft({
      companyCode: 'COMP-LAO-AGRI',
      customerCode: 'CUS-LEGACY',
      items: [{ productCode: 'PRD-EGG-1', qty: 1, actualUnitPrice: 12 }],
    })).resolves.toMatchObject({ id: '102' });
  });

  it('fails closed when the authoritative credit service is unavailable', async () => {
    const order = { id: '103', order_no: 'SO-CREDIT-FAIL', status: 'DRAFT', customer_code: 'CUS-1', company_code: 'COMP-1' };
    const query = jest.fn().mockResolvedValue([order]);
    const ds = { query, manager: { query }, transaction: jest.fn() } as any;
    const cls = { get: jest.fn((key: string) => key === 'dataScope'
      ? { isGlobal: true, allowedCompanyCodes: [] }
      : { userId: '1', username: 'risk-user' }) } as any;
    const service = new SalesOrdersService(
      ds, cls, {} as any, {} as any, {} as any,
      { evaluateCreditStatus: jest.fn().mockRejectedValue(new Error('credit database unavailable')) } as any,
      {} as any, {} as any, {} as any, { get: jest.fn(), register: jest.fn() } as any,
    );
    await expect(service.submit('103', {} as any)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(ds.transaction).not.toHaveBeenCalled();
  });
});

describe('SalesOrdersService APPROVED inventory boundary', () => {
  function submitFixture(orderOverrides: Record<string, unknown> = {}) {
    const order = {
      id: '201', order_no: 'SO-APPROVAL-1', status: 'DRAFT', customer_code: null,
      company_code: 'COMP-A', company_name: 'A Company', below_floor_price: false,
      total_amount: 100, ...orderOverrides,
    };
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const ds = {
      query: jest.fn().mockResolvedValue([order]), manager,
      transaction: jest.fn((fn: any) => fn(manager)),
    } as any;
    const approvalEngine = { startApproval: jest.fn() };
    const inventory = { reserveInventory: jest.fn().mockResolvedValue(undefined) };
    const lifecycle = {
      appendEvent: jest.fn().mockResolvedValue(undefined),
      transitionStatus: jest.fn().mockResolvedValue({ ...order, status: 'APPROVED' }),
    };
    const cls = { get: jest.fn((key: string) => key === 'dataScope'
      ? { isGlobal: true, allowedCompanyCodes: [] }
      : { userId: '1', username: 'sales-user' }) };
    const service = new SalesOrdersService(
      ds, cls as any, approvalEngine as any, {} as any, {} as any, {} as any,
      {} as any, inventory as any, lifecycle as any, { get: jest.fn(), register: jest.fn() } as any,
    );
    return { service, ds, manager, approvalEngine, inventory, lifecycle, order };
  }

  it('reserves inventory in the same transaction when submission needs no approval', async () => {
    const f = submitFixture();
    await expect(f.service.submit('201', {} as any)).resolves.toMatchObject({ status: 'APPROVED' });
    expect(f.inventory.reserveInventory).toHaveBeenCalledTimes(1);
    expect(f.inventory.reserveInventory).toHaveBeenCalledWith(
      '201', 'SO-APPROVAL-1', 'COMP-A', f.manager,
    );
  });

  it('does not reserve when submission starts a required approval workflow', async () => {
    const f = submitFixture({ below_floor_price: true });
    f.approvalEngine.startApproval.mockResolvedValue({ id: 'WF-1' });
    f.lifecycle.transitionStatus.mockResolvedValue({ ...f.order, status: 'PENDING_APPROVAL' });
    await expect(f.service.submit('201', {} as any)).resolves.toMatchObject({ status: 'PENDING_APPROVAL' });
    expect(f.inventory.reserveInventory).not.toHaveBeenCalled();
  });

  it('reserves only when the workflow final-approval callback runs', async () => {
    const f = submitFixture();
    f.manager.query.mockResolvedValueOnce([{
      id: '201', order_no: 'SO-APPROVAL-1', company_code: 'COMP-A',
      status: 'APPROVED', wf_instance_id: 'WF-1', trigger_codes: ['BELOW_FLOOR_PRICE'],
    }]);
    await f.service.approveCallback('201', f.manager as any);
    expect(f.inventory.reserveInventory).toHaveBeenCalledTimes(1);
    expect(f.inventory.reserveInventory).toHaveBeenCalledWith(
      '201', 'SO-APPROVAL-1', 'COMP-A', f.manager,
    );
  });

  it('propagates reservation failure so the submission transaction cannot commit', async () => {
    const f = submitFixture();
    f.inventory.reserveInventory.mockRejectedValue(new Error('inventory shortage'));
    await expect(f.service.submit('201', {} as any)).rejects.toThrow('inventory shortage');
    expect(f.ds.transaction).toHaveBeenCalledTimes(1);
    expect(f.lifecycle.appendEvent).not.toHaveBeenCalledWith(
      f.manager, expect.objectContaining({ eventType: 'INVENTORY_RESERVED' }),
    );
  });
});
