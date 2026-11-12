import { StorePosService } from './store-pos.service';
import { validateStoreCommercialContext } from '../../product-master/services/commercial-context';

const quantity = { version: 1, basis: 'PACKAGE', skuCode: 'TRAY', productCode: 'P', gradeCode: 'G', specCode: 'T30', baseUnit: '枚', tradeUnit: '托', factor: 30, packageFactor: 30, baseQty: 30 };
const priceQuantity = { ...quantity, baseQty: 30 };
const price = { priceBookId: '1', priceItemId: '2', publishVersion: 1, unitPrice: 9, currencyCode: 'TST', skuCode: 'TRAY', quantitySnapshot: quantity, priceQuantitySnapshot: priceQuantity };
const store = { storeCode: 'STORE', companyCode: 'C', warehouseCodes: ['W'] };
const actor = { userId: 'test', isGlobal: false, allowedCompanyCodes: ['C'], allowedWarehouseCodes: ['W'] };
function fixture() {
  const scope = { sale: true, stock: true, duplicate: false };
  const stock = [{ batch_no: 'LOOSE-B', sku_code: 'LOOSE', product_code: 'P', variety_code: 'V', grade_code_std: 'G', spec_code: 'L', unit: '枚', base_quantity_version: 1, company_code: 'C', warehouse_code: 'W', qty_available: 30 }];
  const manager: any = { queryRunner: { isTransactionActive: true }, query: jest.fn(async (sql: string, args: any[] = []) => {
    if (sql.includes('pg_advisory_xact_lock')) return [];
    if (sql.includes('FROM sys_organizations')) return [{ org_code: 'C' }];
    if (sql.includes('FROM wms_warehouses')) return [{ warehouse_code: 'W', company_code: 'C', status: 'ACTIVE' }];
    if (sql.includes('FROM store_master')) return [{ id: 1, company_code: 'C' }];
    if (sql.includes('FROM store_warehouse_bindings')) return [{ warehouse_code: 'W' }];
    if (sql.includes('JOIN mst_products p ON p.product_code=s.product_code')) return [{ product_code: 'P', grade_code: 'G', spec_code: 'T30', unit: '枚', base_unit: '枚', display_unit: '托', qty_per_unit: 30 }];
    if (sql.includes('FROM sal_store_shift_closings')) return [{ id: 3, business_date: '2026-11-11' }];
    if (sql.includes('INSERT INTO sal_store_sales')) return [{ id: 1 }];
    if (sql.includes('FROM product_skus')) return ['TRAY', 'LOOSE'].includes(args[0]) ? [{ sku_code: args[0], product_code: 'P', grade_code: 'G', spec_code: args[0] === 'TRAY' ? 'T30' : 'L', base_unit: '枚', variety_code: 'V', org_context_required: true, status: 'ACTIVE', today: '2026-11-11' }] : [];
    if (sql.includes('FROM md_sku_org_scope')) {
      const row = { scope_type: 'COMPANY', scope_code: 'C', status: 'ACTIVE', sale_enabled: args[0] === 'TRAY' && scope.sale, stock_enabled: scope.stock, today: '2026-11-11' };
      return scope.duplicate ? [row, row] : [row];
    }
    if (sql.includes('FROM mst_products')) return [{ status: 'ACTIVE', variety_code: 'V', unit: '枚' }];
    if (sql.includes('FROM product_grades')) return [{ status: 'ACTIVE', is_saleable: true, is_storable: true }];
    if (sql.includes('FROM packaging_specs')) return [{ status: 'ACTIVE', base_unit: '枚' }];
    if (sql.includes('FROM md_product_varieties')) return [{ variety_code: 'V', status: 'ACTIVE' }];
    if (sql.includes('FROM inv_batches')) return stock;
    if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'LOOSE-B' }];
    if (sql.includes('SELECT id FROM changed')) return [{ id: 1 }];
    return [];
  }) };
  const service: any = Object.create(StorePosService.prototype);
  service.cls = { get: (key: string) => key === 'dataScope' ? actor : { username: 'synthetic' } };
  service.priceRuntime = { resolvePrice: jest.fn(async () => structuredClone(price)) };
  service.logger = { warn: jest.fn() };
  const sale = { id: 1, sale_no: 'SYNTHETIC', store_code: 'STORE', company_code: 'C', currency_code: 'TST', warehouseCodes: ['W'], items: [{ id: 2, sku_code: 'TRAY', product_code: 'P', grade_code: 'G', packaging_spec: 'T30', qty: 1, unit_price: 9, price_book_id: 1, price_item_id: 2, price_publish_version: 1, quantity_snapshot: structuredClone(quantity), price_snapshot: structuredClone(price) }] };
  return { manager, service, sale, scope, stock };
}

describe('verified POS commercial linkage (synthetic only)', () => {
  it.each(['COMPANY', 'UNIT', 'CURRENCY', 'UNKNOWN'])('createSale rejects supplied %s before any sale/money insert', async change => {
    const f = fixture();
    f.service.storeScope = { resolve: jest.fn(async () => store) };
    f.service.genSaleNo = jest.fn(async () => 'SYNTHETIC');
    f.service.ds = { transaction: (run: any) => run(f.manager) };
    const dto: any = { ...store, companyCode: change === 'COMPANY' ? 'OTHER' : 'C', saleType: 'CASH', currencyCode: change === 'CURRENCY' ? undefined : 'TST', items: [{ skuCode: change === 'UNKNOWN' ? 'MASKED' : 'TRAY', qty: 1, quantityBasis: change === 'UNIT' ? undefined : 'PACKAGE', unitPrice: 1 }] };
    await expect(f.service.createSale(dto)).rejects.toThrow();
    expect(f.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('INSERT INTO sal_store_sales'))).toBe(false);
  });

  it('createSale uses authoritative store company and server prices, not supplied item price', async () => {
    const f = fixture();
    f.service.storeScope = { resolve: jest.fn(async () => store) };
    f.service.genSaleNo = jest.fn(async () => 'SYNTHETIC');
    f.service.ds = { transaction: (run: any) => run(f.manager) };
    const result = await f.service.createSale({ ...store, saleType: 'CASH', currencyCode: 'TST', items: [{ skuCode: 'TRAY', qty: 1, quantityBasis: 'PACKAGE', unitPrice: 1, productCode: 'SPOOF' }] });
    expect(result.totalAmount).toBe(9);
    expect(f.service.priceRuntime.resolvePrice.mock.calls[0][0]).toMatchObject({ companyCode: 'C', productCode: 'P', skuCode: 'TRAY' });
  });

  it('authorizes commercial TRAY30 while consuming STOCK-only LOOSE without a LOOSE sale price', async () => {
    const f = fixture();
    await f.service.prepareCommercialPayment(f.manager, f.sale, store);
    const result = await f.service.fifoDeductItems(f.sale, f.manager);
    expect(result).toEqual([{ itemId: 2, batchNo: 'LOOSE-B', warehouseCode: 'W', qty: 30 }]);
    expect(f.service.priceRuntime.resolvePrice).toHaveBeenCalledTimes(1);
    expect(f.service.priceRuntime.resolvePrice.mock.calls[0][0].skuCode).toBe('TRAY');
    expect(f.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('INSERT INTO inv_ledger'))).toBe(true);
  });

  it.each(['sale', 'stock', 'duplicate'] as const)('blocks invalid company %s scope before any deduction', async key => {
    const f = fixture();
    if (key === 'duplicate') f.scope.duplicate = true; else f.scope[key] = false;
    await expect(f.service.prepareCommercialPayment(f.manager, f.sale, store)).rejects.toThrow();
    expect(f.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('UPDATE inv_batches'))).toBe(false);
  });

  it.each(['sku', 'quantity', 'price', 'currency', 'version', 'unit'] as const)('rejects stored %s snapshot mismatch before stock writes', async change => {
    const f = fixture(); const i: any = f.sale.items[0];
    if (change === 'sku') i.quantity_snapshot.skuCode = 'LOOSE';
    if (change === 'quantity') i.quantity_snapshot.baseQty = 29;
    if (change === 'price') i.price_snapshot.unitPrice = 8;
    if (change === 'currency') i.price_snapshot.currencyCode = 'OTHER';
    if (change === 'version') i.price_publish_version = 2;
    if (change === 'unit') i.quantity_snapshot.baseUnit = 'unknown';
    await expect(f.service.prepareCommercialPayment(f.manager, f.sale, store)).rejects.toThrow();
    expect(f.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('UPDATE inv_batches'))).toBe(false);
  });

  it('does not partially deduct a commercial pool shortage', async () => {
    const f = fixture(); f.stock[0].qty_available = 29;
    await f.service.prepareCommercialPayment(f.manager, f.sale, store);
    await expect(f.service.fifoDeductItems(f.sale, f.manager)).rejects.toThrow('缺 1');
    expect(f.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('UPDATE inv_batches'))).toBe(false);
  });

  it.each(['variety_code', 'spec_code', 'product_code', 'grade_code_std', 'unit', 'company_code', 'warehouse_code'] as const)('rejects physical stock %s outside the verified pool', async field => {
    const f = fixture(); (f.stock[0] as any)[field] = 'OTHER';
    await f.service.prepareCommercialPayment(f.manager, f.sale, store);
    await expect(f.service.fifoDeductItems(f.sale, f.manager)).rejects.toThrow();
    expect(f.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('UPDATE inv_batches'))).toBe(false);
  });

  it('rejects an unpriced managed SKU before any mutation', async () => {
    const f = fixture(); f.service.priceRuntime.resolvePrice.mockRejectedValue(new Error('unpriced'));
    await expect(f.service.prepareCommercialPayment(f.manager, f.sale, store)).rejects.toThrow('unpriced');
    expect(f.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('UPDATE inv_batches'))).toBe(false);
  });

  it('does not accept a structurally forged context', async () => {
    const f = fixture(); (f.sale as any).commercialContext = { companyCode: 'C', warehouseCodes: ['W'] };
    await expect(f.service.fifoDeductItems(f.sale, f.manager)).rejects.toThrow('伪造');
  });

  it('rejects a context minted by another payment transaction', async () => {
    const f = fixture();
    (f.sale as any).commercialContext = await validateStoreCommercialContext(f.manager, { ...store, actor } as any);
    const other = { ...f.manager, queryRunner: { isTransactionActive: true } };
    await expect(f.service.fifoDeductItems(f.sale, other)).rejects.toThrow('事务');
  });

  it.each(['completeCashSale', 'completeCreditSale', 'completeMixedSale'])('%s uses the same verified transaction for stock and every tender', async method => {
    const f = fixture(); Object.assign(f.sale, { total_amount: 9, customer_code: 'SYNTHETIC' });
    f.service.storeScope = { assertSaleScoped: jest.fn(async () => ({ context: store })) };
    f.service.ds = { transaction: (run: any) => run(f.manager) };
    f.service.lockSaleForPayment = jest.fn(async () => f.sale);
    f.service.auditPriceDrift = jest.fn(async () => undefined);
    f.service.writeCashTransaction = jest.fn(async () => undefined);
    f.service.createArInvoice = jest.fn(async () => 7);
    f.service.getSale = jest.fn(async () => ({ status: 'COMPLETED' }));
    await f.service[method](1, { idempotencyKey: 'NEW', cashAccountId: 1, paidAmount: method === 'completeMixedSale' ? 3 : undefined });
    const tenders = f.manager.query.mock.calls.filter(([sql]: any[]) => sql.includes('INSERT INTO sal_store_sale_tenders'));
    expect(tenders).toHaveLength(method === 'completeMixedSale' ? 2 : 1);
    if (method !== 'completeCreditSale') expect(f.service.writeCashTransaction.mock.calls[0][0]).toBe(f.manager);
    if (method !== 'completeCashSale') expect(f.service.createArInvoice.mock.calls[0][0]).toBe(f.manager);
    if (method === 'completeMixedSale') expect(tenders.map(([, args]: any[]) => args[3])).toEqual([3, 6]);
  });

  it.each(['completeCashSale', 'completeCreditSale', 'completeMixedSale'])('%s propagates late failures through the enclosing rollback boundary', async method => {
    const f = fixture(); Object.assign(f.sale, { total_amount: 9, customer_code: 'SYNTHETIC' });
    let rolledBack = false;
    f.service.storeScope = { assertSaleScoped: jest.fn(async () => ({ context: store })) };
    f.service.ds = { transaction: async (run: any) => { try { return await run(f.manager); } catch (error) { rolledBack = true; throw error; } } };
    f.service.lockSaleForPayment = jest.fn(async () => f.sale);
    f.service.auditPriceDrift = jest.fn(async () => undefined);
    f.service.writeCashTransaction = jest.fn(async () => { throw new Error('synthetic money failure'); });
    f.service.createArInvoice = jest.fn(async () => { throw new Error('synthetic money failure'); });
    await expect(f.service[method](1, { idempotencyKey: 'NEW', cashAccountId: 1, paidAmount: method === 'completeMixedSale' ? 3 : undefined })).rejects.toThrow('synthetic money failure');
    expect(rolledBack).toBe(true);
    expect(f.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('INSERT INTO sal_store_sale_tenders'))).toBe(false);
  });

  it.each(['completeCashSale', 'completeCreditSale', 'completeMixedSale'])('%s replays without today reclassification or writes', async method => {
    const f = fixture();
    f.service.storeScope = { assertSaleScoped: jest.fn(async () => ({ context: store })) };
    f.service.ds = { transaction: (run: any) => run(f.manager) };
    f.service.lockSaleForPayment = jest.fn(async () => ({ idempotentReplay: true }));
    f.service.prepareCommercialPayment = jest.fn(); f.service.getSale = jest.fn(async () => ({ status: 'COMPLETED' }));
    await f.service[method](1, { idempotencyKey: 'REPLAY' });
    expect(f.service.prepareCommercialPayment).not.toHaveBeenCalled();
    expect(f.manager.query).not.toHaveBeenCalled();
  });

  it.each(['completeCashSale', 'completeCreditSale', 'completeMixedSale'])('%s fails scope before money or stock mutations', async method => {
    const f = fixture(); f.scope.sale = false;
    f.service.storeScope = { assertSaleScoped: jest.fn(async () => ({ context: store })) };
    f.service.ds = { transaction: (run: any) => run(f.manager) };
    f.service.lockSaleForPayment = jest.fn(async () => f.sale);
    f.service.getSale = jest.fn();
    await expect(f.service[method](1, { idempotencyKey: 'NEW', paidAmount: 3 })).rejects.toThrow();
    expect(f.manager.query.mock.calls.some(([sql]: any[]) => /UPDATE inv_batches|INSERT INTO (fin_|sal_store_sale_tenders)/.test(sql))).toBe(false);
  });
});
