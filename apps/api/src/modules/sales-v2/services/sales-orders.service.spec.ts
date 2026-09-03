import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import type { ClsService } from 'nestjs-cls';
import { SalesOrdersService } from './sales-orders.service';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { CreditCustomerMasterNotFoundException } from './credit-domain.errors';

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
    const loggerError = jest.fn();
    (service as any).logger = { error: loggerError };
    const rejection = service.submit('103', {} as any);
    await expect(rejection).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(rejection).rejects.toMatchObject({
      response: expect.not.objectContaining({ stack: expect.anything() }),
    });
    expect(ds.transaction).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('"orderNo":"SO-CREDIT-FAIL"'),
      expect.stringContaining('Error: credit database unavailable'),
    );
    expect(loggerError.mock.calls[0][0]).toContain('"customerCode":"CUS-1"');
    expect(loggerError.mock.calls[0][0]).toContain('"companyCode":"COMP-1"');
    expect(loggerError.mock.calls[0][0]).toContain('"errorName":"Error"');
    expect(loggerError.mock.calls[0][0]).toContain('"errorCode":"UNKNOWN_EXECUTION_ERROR"');
  });

  it('passes the explicit missing-customer credit domain error through as 409', async () => {
    const order = { id: '104', order_no: 'SO-CREDIT-MISSING', status: 'DRAFT', customer_code: 'CUS-X', company_code: 'COMP-1' };
    const query = jest.fn().mockResolvedValue([order]);
    const ds = { query, manager: { query }, transaction: jest.fn() } as any;
    const service = new SalesOrdersService(
      ds, { get: jest.fn(() => ({ isGlobal: true, allowedCompanyCodes: [] })) } as any,
      {} as any, {} as any, {} as any,
      { evaluateCreditStatus: jest.fn().mockRejectedValue(new CreditCustomerMasterNotFoundException()) } as any,
      {} as any, {} as any, {} as any, { get: jest.fn(), register: jest.fn() } as any,
    );
    await expect(service.submit('104', {} as any)).rejects.toMatchObject({ status: 409 });
    expect(ds.transaction).not.toHaveBeenCalled();
  });

  it('keeps frozen and blacklist evaluations as 403', async () => {
    const order = { id: '105', order_no: 'SO-CREDIT-FROZEN', status: 'DRAFT', customer_code: 'CUS-F', company_code: 'COMP-1' };
    const query = jest.fn().mockResolvedValue([order]);
    const ds = { query, manager: { query }, transaction: jest.fn() } as any;
    const service = new SalesOrdersService(
      ds, { get: jest.fn(() => ({ isGlobal: true, allowedCompanyCodes: [] })) } as any,
      {} as any, {} as any, {} as any,
      { evaluateCreditStatus: jest.fn().mockResolvedValue({
        allowOrder: false, requireApproval: false, creditWarning: false, reason: '客户账户已冻结，禁止下单',
        creditStatus: 'FROZEN', policyMode: 'LIMITED', snapshot: {},
      }) } as any,
      {} as any, {} as any, {} as any, { get: jest.fn(), register: jest.fn() } as any,
    );
    await expect(service.submit('105', {} as any)).rejects.toBeInstanceOf(ForbiddenException);
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
    const inventory = { reserveInventory: jest.fn().mockResolvedValue(true) };
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

  it('uses the approval callback contract when fail-open startApproval returns null', async () => {
    const f = submitFixture({ below_floor_price: true });
    f.approvalEngine.startApproval.mockImplementation(async (_params: any, mgr: any) => {
      await f.service.approveCallback('201', mgr);
      return null;
    });
    f.manager.query.mockResolvedValue([{
      ...f.order, status: 'APPROVED', wf_instance_id: null, trigger_codes: ['BELOW_FLOOR_PRICE'],
    }]);
    await expect(f.service.submit('201', {} as any)).resolves.toMatchObject({ status: 'APPROVED' });
    expect(f.inventory.reserveInventory).toHaveBeenCalledTimes(1);
    expect(f.lifecycle.appendEvent).toHaveBeenCalledWith(
      f.manager, expect.objectContaining({ eventType: 'AUTO_APPROVED_NO_RULE' }),
    );
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

  it('rejects an approval side-effect callback unless the order is already APPROVED', async () => {
    const f = submitFixture();
    f.manager.query.mockResolvedValueOnce([{
      id: '201', order_no: 'SO-APPROVAL-1', company_code: 'COMP-A',
      status: 'CANCELLED', wf_instance_id: 'WF-1', trigger_codes: [],
    }]);
    await expect(f.service.approveCallback('201', f.manager as any)).rejects.toThrow('拒绝执行批准副作用');
    expect(f.inventory.reserveInventory).not.toHaveBeenCalled();
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
