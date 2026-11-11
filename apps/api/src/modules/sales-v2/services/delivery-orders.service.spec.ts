import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import type { ClsService } from 'nestjs-cls';
import { DeliveryOrdersService } from './delivery-orders.service';
import { assertCommercialContext } from '../../product-master/services/commercial-context';
import { EggInventoryService } from './egg-inventory.service';

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
        expect(sql).toContain("SUM(COALESCE((quantity_snapshot->>'baseQty')::numeric,qty)) AS order_qty");
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


describe('DeliveryOrdersService finishLoading approved commercial authority', () => {
  function finishFixture(options: { managed?: boolean; orderStatus?: string; deliveryCompany?: string;
    lockedCompany?: string; orderCompany?: string | null; orderWarehouse?: string; transactionActive?: boolean;
    realInventory?: boolean; commercialSale?: boolean; physicalStock?: boolean; missingPrice?: boolean } = {}) {
    const pending: string[] = []; const committed: string[] = [];
    const state = { qty: 10, ledger: 0, outbound: 0 };
    const quantity = { version: 1, basis: 'BASE', productCode: 'EGG', gradeCode: 'A', specCode: 'TRAY30', skuCode: 'TRAY', baseUnit: '枚', tradeUnit: '枚', factor: 1, baseQty: 2 };
    let realInventory: EggInventoryService | undefined;
    const manager: any = { queryRunner: { isTransactionActive: options.transactionActive !== false } };
    manager.query = jest.fn(async (sql: string, params: any[] = []) => {
      if (/^\s*(INSERT|UPDATE|WITH changed)/.test(sql)) pending.push(sql);
      if (options.realInventory) {
        if (sql.includes('FROM product_skus')) return [{ sku_code: params[0], product_code: 'EGG', grade_code: 'A', spec_code: params[0] === 'TRAY' ? 'TRAY30' : 'LOOSE', variety_code: 'EGG_PINK', org_context_required: true, status: 'ACTIVE', today: '2026-11-11' }];
        if (sql.includes('FROM md_sku_org_scope')) return [{ scope_type: 'COMPANY', scope_code: 'COMP-A', status: 'ACTIVE', today: '2026-11-11', stock_enabled: params[0] === 'TRAY' || options.physicalStock !== false, sale_enabled: params[0] === 'TRAY' && options.commercialSale !== false }];
        if (sql.includes('FROM mst_products')) return [{ product_code: 'EGG', variety_code: 'EGG_PINK', status: 'ACTIVE', unit: '枚' }];
        if (sql.includes('FROM product_grades')) return [{ status: 'ACTIVE', is_saleable: true, is_storable: true }];
        if (sql.includes('FROM packaging_specs')) return [{ status: 'ACTIVE', base_unit: '枚' }];
        if (sql.includes('FROM md_product_varieties')) return [{ variety_code: 'EGG_PINK', status: 'ACTIVE' }];
        if (sql.includes('FROM sal_order_item_batch_allocations a')) return [{ id: 'A-1', batch_no: 'B-LOOSE', product_code: 'EGG', grade_code_std: 'A', spec_code: 'LOOSE', unit: '枚', sku_code: 'LOOSE', variety_code: 'EGG_PINK', company_code: 'COMP-A', warehouse_code: 'WH-A', status: 'AVAILABLE', base_quantity_version: 1, material_code: null, legacy_source: null, qty: state.qty, reserved_qty: 2, released_qty: 0, outbound_qty: state.outbound, sale_sku_code: 'TRAY', sale_qty: 2, quantity_snapshot: quantity,
          price_snapshot: options.missingPrice ? null : { version: 1, companyCode: 'COMP-A', skuCode: 'TRAY', currencyCode: 'LAK', priceBookId: 'PB-1', priceItemId: 'PI-1', publishVersion: 1, resolvedUnitPrice: 100, actualUnitPrice: 100, priceQuantitySnapshot: quantity } }];
        if (sql.includes('UPDATE inv_batches')) { expect(params.slice(2)).toEqual(['COMP-A', 'WH-A']); state.qty -= Number(params[0]); return [{ batch_no: 'B-LOOSE' }]; }
        if (sql.includes('INSERT INTO inv_ledger')) { state.ledger++; return [{ id: state.ledger }]; }
        if (sql.includes('INSERT INTO sal_order_item_batch_allocation_actions')) return [];
        if (sql.includes('UPDATE sal_order_item_batch_allocations')) { state.outbound += Number(params[0]); return [{ id: 'A-1' }]; }
      }
      if (sql.includes('FROM sal_delivery_orders WHERE id=$1 FOR UPDATE')) return [{ id: '201', delivery_no: 'DV-1', status: 'LOADING', company_code: options.lockedCompany ?? 'COMP-A', fulfillment_warehouse_code: 'WH-A' }];
      if (sql.includes('SELECT id FROM changed')) return [{ id: '201' }];
      if (sql.includes('doi.id AS delivery_item_id')) {
        expect(sql).toContain('WHERE oi.sales_order_id=doi.sales_order_id');
        expect(sql).not.toContain('JOIN sal_order_items oi ON oi.sales_order_id = doi.sales_order_id');
        return [{ delivery_item_id: '301', sales_order_id: '101', planned_qty: 2, order_no: 'SO-1', company_code: options.orderCompany === undefined ? 'COMP-A' : options.orderCompany, status: 'ALLOCATED', managed_commercial: options.managed !== false }];
      }
      if (sql.includes('FROM sal_sales_orders WHERE id=$1 FOR SHARE')) return [{ id: '101', company_code: options.orderCompany === undefined ? 'COMP-A' : options.orderCompany, fulfillment_warehouse_code: options.orderWarehouse ?? 'WH-A', status: options.orderStatus ?? 'ALLOCATED' }];
      if (sql.includes('FROM sys_organizations')) return [{ org_code: params[0] }];
      if (sql.includes('FROM wms_warehouses')) return [{ warehouse_code: options.orderWarehouse ?? 'WH-A', company_code: options.orderCompany === undefined ? 'COMP-A' : options.orderCompany, status: 'ACTIVE' }];
      if (sql.includes('UPDATE sal_delivery_order_items SET loaded_qty=')) return [];
      throw new Error(`Unexpected delivery transaction SQL: ${sql}`);
    });
    const ds = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT * FROM sal_delivery_orders WHERE id = $1')) return [{ id: '201', delivery_no: 'DV-1', company_code: options.deliveryCompany ?? 'COMP-A', status: 'LOADING' }];
        throw new Error(`Unexpected delivery external SQL: ${sql}`);
      }),
      transaction: jest.fn(async (fn: any) => { try { const result = await fn(manager); committed.push(...pending); return result; } finally { pending.length = 0; } }),
    };
    const inventory = { confirmOutbound: jest.fn(async (...args: any[]) => {
      if (options.managed !== false) {
        expect(args).toHaveLength(8);
        expect(args[6]).toBe(manager);
        assertCommercialContext(args[7], manager, { companyCode: 'COMP-A', warehouseCodes: ['WH-A'] });
      } else expect(args).toHaveLength(7);
      if (realInventory) return realInventory.confirmOutbound(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7]);
      return 2;
    }) };
    const lifecycle = { appendEvent: jest.fn() };
    const cls = { get: jest.fn((key: string) => key === 'dataScope'
      ? { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: ['WH-A'] }
      : { userId: 'actor-1', username: 'loader' }) };
    if (options.realInventory) realInventory = new EggInventoryService(ds as any, cls as any);
    const service = new DeliveryOrdersService(ds as any, cls as any, inventory as any, lifecycle as any);
    jest.spyOn(service, 'findById').mockResolvedValue({ id: '201', status: 'LOADED' } as any);
    return { service, ds, manager, inventory, lifecycle, committed, state };
  }

  it.each(['APPROVED', 'ALLOCATED', 'PICKED', 'LOADED'])('mints same-manager context only from a persisted %s order', async orderStatus => {
    const f = finishFixture({ orderStatus });
    await expect(f.service.finishLoading('201', { companyCode: 'FORGED', commercialContext: { companyCode: 'FORGED' }, approved: true } as any)).resolves.toMatchObject({ status: 'LOADED' });
    const args = f.inventory.confirmOutbound.mock.calls[0];
    expect(args.slice(0, 7)).toEqual(['101', 'SO-1', 'COMP-A', 'DV-1', '201', 2, f.manager]);
    expect(args[7].warehouseCodes).toEqual(['WH-A']);
    expect(Object.isFrozen(args[7])).toBe(true);
    expect(f.manager.query).toHaveBeenCalledWith(expect.stringContaining('FROM sal_sales_orders WHERE id=$1 FOR SHARE'), ['101']);
    expect(f.inventory.confirmOutbound).toHaveBeenCalledTimes(1);
    expect(f.lifecycle.appendEvent).toHaveBeenCalledWith(f.manager, expect.objectContaining({ salesOrderId: '101', eventType: 'OUTBOUND_CONFIRMED' }));
  });

  it.each(['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED'])('rejects managed %s without using body approval claims', async orderStatus => {
    const f = finishFixture({ orderStatus });
    await expect(f.service.finishLoading('201', { approved: true, status: 'APPROVED' } as any)).rejects.toThrow('订单没有已批准商业库存上下文');
    expect(f.inventory.confirmOutbound).not.toHaveBeenCalled();
    expect(f.committed).toEqual([]);
  });

  it('integrates finishLoading -> real EggInventory -> real commercial policy for TRAY consumption from stock-only LOOSE', async () => {
    const f = finishFixture({ realInventory: true });
    await expect(f.service.finishLoading('201', {})).resolves.toMatchObject({ status: 'LOADED' });
    expect(f.state).toEqual({ qty: 8, ledger: 1, outbound: 2 });
    expect(f.inventory.confirmOutbound).toHaveBeenCalledTimes(1);
    expect(f.manager.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO inv_ledger'), expect.arrayContaining(['LOOSE', 'COMP-A', 'WH-A']));
  });

  it.each([{ commercialSale: false }, { physicalStock: false }, { missingPrice: true }])('integrated managed loading rejects commercial/physical/price veto %j before stock writes', async options => {
    const f = finishFixture({ realInventory: true, ...options });
    await expect(f.service.finishLoading('201', {})).rejects.toThrow();
    expect(f.state).toEqual({ qty: 10, ledger: 0, outbound: 0 });
    expect(f.committed).toEqual([]);
  });

  it('retains the original seven-argument legacy ALL path without minting managed company authority', async () => {
    const f = finishFixture({ managed: false, orderCompany: null });
    await f.service.finishLoading('201', {});
    expect(f.inventory.confirmOutbound.mock.calls[0]).toEqual(['101', 'SO-1', 'ALL', 'DV-1', '201', 2, f.manager]);
    expect(f.manager.query.mock.calls.some(([sql]: [string]) => sql.includes('FROM sal_sales_orders WHERE id=$1 FOR SHARE'))).toBe(false);
  });

  it('does not mint a context for a non-transaction manager', async () => {
    const f = finishFixture({ transactionActive: false });
    await expect(f.service.finishLoading('201', {})).rejects.toThrow('活动事务 manager');
    expect(f.inventory.confirmOutbound).not.toHaveBeenCalled();
    expect(f.committed).toEqual([]);
  });

  it.each([{ orderCompany: 'COMP-B' }, { orderWarehouse: 'WH-B' }])('rejects stored order and delivery ownership mismatch %j', async options => {
    const f = finishFixture(options);
    await expect(f.service.finishLoading('201', {})).rejects.toThrow('配送单与已批准销售订单公司/履约仓不一致');
    expect(f.inventory.confirmOutbound).not.toHaveBeenCalled();
    expect(f.committed).toEqual([]);
  });

  it('preserves actor delivery ownership before the stock transaction', async () => {
    const f = finishFixture({ deliveryCompany: 'COMP-B' });
    await expect(f.service.finishLoading('201', {})).rejects.toThrow('无权访问公司 COMP-B');
    expect(f.ds.transaction).not.toHaveBeenCalled();
  });

  it('rechecks delivery ownership under lock instead of accepting a concurrently changed company', async () => {
    const f = finishFixture({ lockedCompany: 'COMP-B' });
    await expect(f.service.finishLoading('201', {})).rejects.toThrow('无权完成当前公司配送单装车');
    expect(f.inventory.confirmOutbound).not.toHaveBeenCalled();
    expect(f.committed).toEqual([]);
  });
});
