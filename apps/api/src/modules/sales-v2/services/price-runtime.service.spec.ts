import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PriceRuntimeService } from './price-runtime.service';
import { PriceItemsService } from './price-items.service';
import { SalesOrdersService } from './sales-orders.service';
import { ValidatePriceDto } from '../dto/price-item.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { assertCommercialContext, validateCommercialStockContext } from '../../product-master/services/commercial-context';

// Entirely synthetic: no database connection and no real commercial amounts.
function fixture() {
  const sku: any = { sku_code: 'SYN-TRAY30', product_code: 'SYN-EGG', grade_code: 'SYN-G', spec_code: 'SYN-TRAY30',
    status: 'ACTIVE', org_context_required: true, variety_code: 'SYN-V', today: '2026-11-11' };
  const actor: any = { userId: 'synthetic-user', isGlobal: false, allowedCompanyCodes: ['SYN-A'], allowedWarehouseCodes: ['SYN-WH'],
    allowedProjectCodes: [], allowedFarmCodes: [], allowedSiteCodes: [], scopeLevel: 'COMPANY' };
  const order: any = { id: '1', order_no: 'SYN-SO', company_code: 'SYN-A', fulfillment_warehouse_code: 'SYN-WH',
    currency_code: 'SYN', status: 'DRAFT' };
  const snapshot: any = { version: 1, basis: 'PACKAGE', productCode: sku.product_code, gradeCode: sku.grade_code,
    skuCode: sku.sku_code, specCode: sku.spec_code, baseUnit: '枚', tradeUnit: '托', factor: 30, packageFactor: 30, baseQty: 30 };
  const price: any = { item_id: '2', book_id: '3', price_book_no: 'SYN-PB', unit_price: '2', floor_price: null, ceiling_price: null,
    currency_code: 'SYN', sku_code: sku.sku_code, grade_code_std: sku.grade_code, spec_code: sku.spec_code,
    publish_version: 1, quantity_snapshot: snapshot, tier: 3 };
  const state = { sale: true, stock: true, gradeSaleable: true, price: true, warehouseCompany: 'SYN-A', managed: true, scopeType: 'COMPANY' };
  const query = jest.fn(async (sql: string, params?: any[]) => {
    if (sql.includes('SELECT TRUE AS managed')) return state.managed ? [{ managed: true }] : [];
    if (sql.includes('FROM sal_price_items pi') && sql.includes('AS item_id')) return state.price ? [price] : [];
    if (sql.includes('FROM product_skus')) {
      if (sql.includes('JOIN mst_products')) return [{ ...sku, unit: '枚', unit_zh: '枚', base_unit: '枚', display_unit: '托', qty_per_unit: 30 }];
      return [{ ...sku, ...(state.managed ? {} : { org_context_required: false, variety_code: null }) }];
    }
    if (sql.includes('FROM sys_organizations')) return [{ org_code: 'SYN-A' }];
    if (sql.includes('FROM wms_warehouses')) return [{ warehouse_code: 'SYN-WH', company_code: state.warehouseCompany, status: 'ACTIVE' }];
    if (sql.includes('FROM md_sku_org_scope')) return [{ scope_type: state.scopeType, scope_code: 'SYN-A', status: 'ACTIVE',
      sale_enabled: state.sale, stock_enabled: state.stock, today: '2026-11-11' }];
    if (sql.includes('FROM mst_products')) return [{ status: 'ACTIVE', variety_code: 'SYN-V' }];
    if (sql.includes('FROM product_grades')) return [{ status: 'ACTIVE', is_saleable: state.gradeSaleable, is_storable: true }];
    if (sql.includes('FROM packaging_specs')) return [{ status: 'ACTIVE', base_unit: '枚' }];
    if (sql.includes('FROM md_product_varieties')) return [{ variety_code: 'SYN-V', status: 'ACTIVE' }];
    if (sql.includes('FROM sal_price_books')) return [{ id: '3', company_code: 'SYN-A', status: 'DRAFT' }];
    if (sql.includes('COUNT(*) AS cnt')) return [{ cnt: '0' }];
    if (sql.includes('FROM sal_sales_orders') || sql.includes('INSERT INTO sal_sales_orders') || sql.includes('UPDATE sal_sales_orders')) return [order];
    if (sql.includes('INSERT INTO sal_price_items')) return [{ id: '2', quantity_snapshot: params?.[13] }];
    return [];
  });
  const manager: any = { query, queryRunner: { isTransactionActive: true } };
  const ds: any = { query, manager, transaction: jest.fn((fn: any) => fn(manager)) };
  const cls: any = { get: (key: string) => key === 'dataScope' ? actor : key === 'user' ? { userId: actor.userId, username: 'synthetic' } : undefined };
  const runtime = new PriceRuntimeService(ds, cls);
  const inventory = { reserveInventory: jest.fn().mockResolvedValue(true) };
  const lifecycle: any = { appendEvent: jest.fn(), transitionStatus: jest.fn() };
  const sales = new SalesOrdersService(ds, cls, {} as any, runtime, {} as any, {} as any, {} as any, inventory as any, lifecycle,
    { get: jest.fn(), register: jest.fn() } as any);
  const dto: any = { companyCode: 'SYN-A', fulfillmentWarehouseCode: 'SYN-WH', currencyCode: 'SYN',
    items: [{ skuCode: sku.sku_code, productCode: 'IGNORED', qty: 2, quantityBasis: 'PACKAGE' }] };
  const priceDto: any = { companyCode: 'SYN-A', skuCode: sku.sku_code, productCode: 'IGNORED', currencyCode: 'SYN', qty: 2, quantityBasis: 'PACKAGE' };
  return { sku, actor, order, snapshot, price, state, query, manager, ds, cls, runtime, inventory, sales, dto, priceDto };
}

describe('managed commercial Sales linkage', () => {
  it.each(['create', 'update'])('%s retains the exact price identity/version/currency and quantity snapshots', async mode => {
    const f = fixture();
    if (mode === 'create') await f.sales.createDraft(f.dto);
    else await f.sales.updateDraft('1', { items: f.dto.items, currencyCode: 'SYN' });
    const insert = f.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO sal_order_items'))!;
    const values = insert[1]!;
    const quantity = JSON.parse(values[16]);
    const price = JSON.parse(values[17]);
    expect(quantity).toMatchObject({ skuCode: 'SYN-TRAY30', factor: 30, baseQty: 60, basis: 'PACKAGE' });
    expect(price).toMatchObject({ version: 1, companyCode: 'SYN-A', skuCode: 'SYN-TRAY30', currencyCode: 'SYN',
      priceBookId: '3', priceItemId: '2', publishVersion: 1, priceQuantitySnapshot: f.snapshot });
    expect(values[11]).toBe(4); // synthetic 2 trays * synthetic 2 currency units
  });

  it('retains explicit validation currency through the existing DTO whitelist', async () => {
    const dto = plainToInstance(ValidatePriceDto, { companyCode: 'SYN-A', productCode: 'SYN-EGG', skuCode: 'SYN-TRAY30',
      qty: 2, unitPrice: 2, quantityBasis: 'PACKAGE', currencyCode: 'SYN' });
    expect(await validate(dto, { whitelist: true })).toEqual([]);
    expect(dto.currencyCode).toBe('SYN');
  });
  it('rejects actor/company spoofing in direct pricing calls', async () => {
    const f = fixture();
    await expect(f.runtime.resolvePrice({ ...f.priceDto, companyCode: 'SYN-OTHER' })).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not treat an absent pricing actor as global', async () => {
    const f = fixture(); f.cls.get = () => undefined;
    await expect(f.runtime.resolvePrice(f.priceDto)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not grant new SKU commercial use from an ALL scope', async () => {
    const f = fixture(); f.state.scopeType = 'ALL';
    await expect(f.sales.createDraft(f.dto)).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['create', 'update'])('%s rejects a stock warehouse owned by another company before writes', async mode => {
    const f = fixture(); f.state.warehouseCompany = 'SYN-OTHER';
    await expect(mode === 'create' ? f.sales.createDraft(f.dto) : f.sales.updateDraft('1', { items: f.dto.items }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(f.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE|DELETE)/.test(sql.trim()))).toBe(false);
  });
  it('rejects sale-disabled company scope even when stock is enabled', async () => {
    const f = fixture(); f.state.sale = false;
    await expect(f.sales.createDraft(f.dto)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects stock-disabled company scope even when sale is enabled', async () => {
    const f = fixture(); f.state.stock = false;
    await expect(f.sales.createDraft(f.dto)).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['currency', 'unit'])('rejects missing explicit %s instead of guessing', async missing => {
    const f = fixture();
    if (missing === 'currency') delete f.dto.currencyCode;
    else delete f.dto.items[0].quantityBasis;
    await expect(f.sales.createDraft(f.dto)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('cannot use custom-price fallback when no effective exact price exists', async () => {
    const f = fixture(); f.state.price = false; f.dto.items[0].actualUnitPrice = 3;
    await expect(f.sales.createDraft(f.dto)).rejects.toThrow('禁止自定义价格回退');
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO sal_sales_orders'))).toBe(false);
  });
  it.each(['sku', 'currency', 'version', 'snapshot'])('rejects a non-exact %s price result', async mismatch => {
    const f = fixture();
    if (mismatch === 'sku') f.price.sku_code = null;
    if (mismatch === 'currency') f.price.currency_code = 'OTHER';
    if (mismatch === 'version') f.price.publish_version = 0;
    if (mismatch === 'snapshot') f.price.quantity_snapshot = null;
    await expect(f.runtime.resolvePrice(f.priceDto)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('requires ACTIVE/effective company-specific SKU/currency/publishVersion in SQL; no ALL or identity fallback', async () => {
    const f = fixture(); await f.runtime.resolvePrice(f.priceDto);
    const [sql, params] = f.query.mock.calls.find(([sql]) => sql.includes('AS item_id'))!;
    expect(sql).toContain("pb.status       = 'ACTIVE'");
    expect(sql).toContain("pi.status       = 'ACTIVE'");
    expect(sql).toContain('pb.company_code = $1');
    expect(sql).toContain('pi.sku_code=$2 AND pb.publish_version>0 AND pi.currency_code=$9');
    expect(sql).toContain('pb.effective_from <= CURRENT_DATE');
    expect(sql).toContain('pb.effective_to   >= CURRENT_DATE');
    expect(params?.[13]).toBe(true);
  });
  it('cannot reuse a verified context with another transaction manager', async () => {
    const f = fixture();
    const context = await validateCommercialStockContext(f.manager, { companyCode: 'SYN-A', warehouseCodes: ['SYN-WH'], actor: f.actor });
    const other = { ...f.manager };
    await expect(f.runtime.resolvePrice(f.priceDto, other, context)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('passes stored approved-order authority separately as reserve sixth argument, without an actor', async () => {
    const f = fixture(); f.order.status = 'APPROVED';
    f.cls.get = () => undefined;
    await f.sales.approveCallback('1', f.manager);
    const args = f.inventory.reserveInventory.mock.calls[0] as unknown as any[];
    expect(args.slice(0, 5)).toEqual(['1', 'SYN-SO', 'SYN-A', f.manager, 'SYN-WH']);
    expect(() => assertCommercialContext(args[5], f.manager, { companyCode: 'SYN-A', warehouseCodes: ['SYN-WH'] })).not.toThrow();
  });
  it('keeps a mixed ordinary line on its legacy pricing path instead of imposing managed authorization', async () => {
    const f = fixture();
    const original = f.runtime.resolvePrice.bind(f.runtime);
    jest.spyOn(f.runtime, 'resolvePrice').mockImplementation((dto, manager, context) => {
      if (!dto.skuCode) return Promise.reject(new NotFoundException());
      return original(dto, manager, context);
    });
    f.dto.items.push({ productCode: 'SYN-LEGACY', qty: 2, actualUnitPrice: 3 });
    await f.sales.createDraft(f.dto);
    const inserts = f.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO sal_order_items'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0][0]).toContain('sku_code');
    expect(inserts[1][0]).not.toContain('sku_code');
    expect(JSON.parse(inserts[1][1]?.[16]).version).toBeUndefined();
  });
  it('preserves historical no-SKU ordinary custom-price fallback', async () => {
    const f = fixture();
    f.dto.items = [{ productCode: 'SYN-LEGACY', qty: 2, actualUnitPrice: 3 }];
    jest.spyOn(f.runtime, 'resolvePrice').mockRejectedValue(new NotFoundException());
    await f.sales.createDraft(f.dto);
    const insert = f.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO sal_order_items'))!;
    expect(insert[0]).not.toContain('sku_code');
    expect(insert[1]?.[8]).toBe(3);
  });
});

describe('managed price preparation without circular sale authorization', () => {
  it('prepares a confirmed stock-only company price with ANY and a saleable grade', async () => {
    const f = fixture(); f.state.sale = false;
    const maintenance = new PriceItemsService(f.ds, f.cls);
    await maintenance.createItem({ priceBookId: 3, productCode: 'IGNORED', skuCode: f.sku.sku_code,
      unitPrice: 2, currencyCode: 'SYN', quantityBasis: 'PACKAGE' });
    const [, params] = f.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO sal_price_items'))!;
    expect(params?.[1]).toBe('SYN-EGG');
    expect(params?.[13]).toMatchObject({ basis: 'PACKAGE', factor: 30, baseQty: 30 });
  });
  it.each(['currency', 'unit'])('refuses to prepare managed prices with guessed %s', async missing => {
    const f = fixture();
    const dto: any = { priceBookId: 3, productCode: 'IGNORED', skuCode: f.sku.sku_code, unitPrice: 2, currencyCode: 'SYN', quantityBasis: 'BASE' };
    delete dto[missing === 'currency' ? 'currencyCode' : 'quantityBasis'];
    await expect(new PriceItemsService(f.ds, f.cls).createItem(dto)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('supports stock-only preparation in bulk imports as well', async () => {
    const f = fixture(); f.state.sale = false;
    await expect(new PriceItemsService(f.ds, f.cls).bulkImport({ priceBookId: 3, items: [{ priceBookId: 3,
      productCode: 'IGNORED', skuCode: f.sku.sku_code, unitPrice: 2, currencyCode: 'SYN', quantityBasis: 'PACKAGE' }] }))
      .resolves.toEqual({ imported: 1, total: 1 });
  });
  it('updates a stock-only prepared price without rewriting its stored quantity snapshot', async () => {
    const f = fixture(); f.state.sale = false;
    const original = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('SELECT pi.*') && sql.includes('WHERE pi.id')) return [{ id: '2', sku_code: f.sku.sku_code,
        company_code: 'SYN-A', book_status: 'DRAFT', currency_code: 'SYN', quantity_snapshot: f.snapshot }];
      if (sql.includes('UPDATE sal_price_items')) return [{ id: '2' }];
      return original(sql, params);
    });
    await new PriceItemsService(f.ds, f.cls).updateItem('2', { unitPrice: 3 });
    const [sql] = f.query.mock.calls.find(([sql]) => sql.includes('UPDATE sal_price_items'))!;
    expect(sql).not.toContain('quantity_snapshot');
    expect(f.snapshot.baseQty).toBe(30);
  });
  it('copies a confirmed stock-only price and its snapshot without recomputing historical units', async () => {
    const f = fixture(); f.state.sale = false;
    const original = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('SELECT * FROM sal_price_items WHERE')) return [{ sku_code: f.sku.sku_code,
        currency_code: 'SYN', quantity_snapshot: f.snapshot, unit_price: 2 }];
      return original(sql, params);
    });
    await expect(new PriceItemsService(f.ds, f.cls).copyFromBook('3', '4')).resolves.toEqual({ copied: 1 });
    const [, params] = f.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO sal_price_items'))!;
    expect(params?.[13]).toBe(f.snapshot);
  });
  it('rejects a nonsaleable grade even for preparation', async () => {
    const f = fixture(); f.state.gradeSaleable = false;
    await expect(new PriceItemsService(f.ds, f.cls).createItem({ priceBookId: 3, productCode: 'IGNORED', skuCode: f.sku.sku_code,
      unitPrice: 2, currencyCode: 'SYN', quantityBasis: 'BASE' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
