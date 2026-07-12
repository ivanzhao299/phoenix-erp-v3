import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import type { ClsService } from 'nestjs-cls';
import { SalesOrdersService } from './sales-orders.service';

describe('SalesOrdersService draft creation', () => {
  function makeService(query: jest.Mock) {
    const ds = { query } as unknown as DataSource;
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
});
