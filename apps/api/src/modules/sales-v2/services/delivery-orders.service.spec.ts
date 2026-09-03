import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import type { ClsService } from 'nestjs-cls';
import { DeliveryOrdersService } from './delivery-orders.service';

describe('DeliveryOrdersService creation', () => {
  it('uses ordered item quantity rather than order amount for delivery quantities', async () => {
    let transactionCommitted = false;
    const managerQuery = jest.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO sal_delivery_orders')) {
        return [{ id: '201', delivery_no: 'DV-20260725-0001' }];
      }
      return [];
    });
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('COUNT(*) AS cnt FROM sal_delivery_orders')) return [{ cnt: '0' }];
      if (sql.includes('FROM sal_sales_orders')) {
        expect(sql).toContain('id = ANY($1::bigint[])');
        expect(sql).toContain('order_no = ANY($2::text[])');
        expect(sql).toContain('SUM(qty) AS order_qty');
        expect(params).toEqual([[], ['SO-20260725-00001']]);
        return [{
          id: '101',
          order_no: 'SO-20260725-00001',
          customer_code: 'CUS-1',
          customer_name: '测试客户',
          delivery_address: '测试地址',
          total_amount: '500',
          order_qty: '10', outbound_qty: '0',
          status: 'APPROVED',
          company_code: 'COMP-1',
        }];
      }
      if (sql.includes('SELECT * FROM sal_delivery_orders WHERE id = $1')) {
        expect(transactionCommitted).toBe(true);
        return [{ id: '201', delivery_no: 'DV-20260725-0001', company_code: 'COMP-1' }];
      }
      if (sql.includes('FROM sal_delivery_order_items')) return [];
      if (sql.includes('FROM sal_receipts')) return [];
      return [];
    });
    const ds = {
      query,
      transaction: jest.fn(async (callback: (manager: { query: typeof managerQuery }) => unknown) => {
        const result = await callback({ query: managerQuery });
        transactionCommitted = true;
        return result;
      }),
    } as unknown as DataSource;
    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'dataScope') return { isGlobal: true, allowedCompanyCodes: [] };
        if (key === 'user') return { userId: '1', username: 'admin' };
        return undefined;
      }),
    } as unknown as ClsService;
    const service = new DeliveryOrdersService(ds, cls, {} as any, { appendEvent: jest.fn() } as any);

    await expect(service.create({
      companyCode: 'COMP-1',
      salesOrderIds: ['SO-20260725-00001'],
    })).resolves.toMatchObject({
      id: '201',
      delivery_no: 'DV-20260725-0001',
    });

    expect(managerQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sal_delivery_order_items'),
      ['201', '101', 'SO-20260725-00001', 'CUS-1', '测试客户', '测试地址', 10],
    );
    expect(managerQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sal_delivery_orders'),
      expect.arrayContaining([1, 10]),
    );
    expect(managerQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET status='ALLOCATED'"),
      [['101']],
    );
  });

  it('does not force-close a delivery item without a terminal receipt record', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM sal_delivery_orders WHERE id = $1')) {
        return [{ id: '201', delivery_no: 'DV-1', company_code: 'COMP-1', status: 'ARRIVED' }];
      }
      if (sql.includes('COUNT(*) AS cnt FROM sal_delivery_order_items')) return [{ cnt: '1' }];
      return [];
    });
    const ds = { query } as unknown as DataSource;
    const cls = { get: jest.fn((key: string) => key === 'dataScope' ? { isGlobal: true, allowedCompanyCodes: [] } : { userId: '1' }) } as unknown as ClsService;
    const service = new DeliveryOrdersService(ds, cls, {} as any, { appendEvent: jest.fn() } as any);
    await expect(service.complete('201', { remark: '主管例外闭合' })).rejects.toThrow('缺少终态签收记录');
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("SET status='COMPLETED'"), expect.anything());
  });
});
