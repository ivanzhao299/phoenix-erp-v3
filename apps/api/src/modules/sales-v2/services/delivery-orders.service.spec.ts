import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import type { ClsService } from 'nestjs-cls';
import { DeliveryOrdersService } from './delivery-orders.service';

describe('DeliveryOrdersService creation', () => {
  it('accepts a visible sales order number without casting it to bigint', async () => {
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
        expect(params).toEqual([[], ['SO-20260725-00001']]);
        return [{
          id: '101',
          order_no: 'SO-20260725-00001',
          customer_code: 'CUS-1',
          customer_name: '测试客户',
          delivery_address: '测试地址',
          total_amount: '12',
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
    const service = new DeliveryOrdersService(ds, cls, {} as any);

    await expect(service.create({
      companyCode: 'COMP-1',
      salesOrderIds: ['SO-20260725-00001'],
    })).resolves.toMatchObject({
      id: '201',
      delivery_no: 'DV-20260725-0001',
    });

    expect(managerQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sal_delivery_order_items'),
      expect.arrayContaining(['101', 'SO-20260725-00001']),
    );
    expect(managerQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET status='ALLOCATED'"),
      [['101']],
    );
  });
});
