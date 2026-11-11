import { EntityManager } from 'typeorm';
import { EggInventoryService } from './egg-inventory.service';
import { QuantitySnapshot } from '../../product-master/services/quantity-contract';
import { validateCommercialStockContext, VerifiedCommercialContext } from '../../product-master/services/commercial-context';

const quantity: QuantitySnapshot = { version: 1, basis: 'PACKAGE', productCode: 'P', gradeCode: 'G', skuCode: 'TRAY', specCode: 'TRAY30', baseUnit: '枚', tradeUnit: '托', factor: 30, packageFactor: 30, baseQty: 30 };
const price = () => ({ version: 1, companyCode: 'C', skuCode: 'TRAY', currencyCode: 'LAK', priceBookId: 'PB', priceItemId: 'PI', publishVersion: 1,
  resolvedUnitPrice: 100, actualUnitPrice: 100, priceQuantitySnapshot: { ...quantity } });
function fixture() {
  const batch: any = { batch_no: 'B', product_code: 'P', grade_code_std: 'G', unit: '枚', sku_code: 'LOOSE', spec_code: 'LOOSE', variety_code: 'V',
    company_code: 'C', warehouse_code: 'W', qty: 60, qty_available: 60, status: 'AVAILABLE', base_quantity_version: 1, material_code: null, legacy_source: null };
  const state = { physicalSale: false, physicalStock: true, commercialSale: true, physicalVariety: 'V', productVariety: 'V', specUnit: '枚', allocations: [] as any[], ledger: 0, writes: 0 };
  const item: any = { id: 'I', sales_order_id: 'O', product_code: 'P', sku_code: 'TRAY', qty: 1, quantity_snapshot: { ...quantity }, price_snapshot: price() };
  const manager = { queryRunner: { isTransactionActive: true }, query: jest.fn(async (sql: string, args: any[] = []): Promise<any[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('pg_advisory_xact_lock')) return [];
    if (s.includes('FROM sys_organizations')) return [{ org_code: 'C' }];
    if (s.includes('FROM wms_warehouses')) return [{ warehouse_code: 'W', company_code: 'C', status: 'ACTIVE' }];
    if (s.includes('FROM product_skus')) return [{ sku_code: args[0], product_code: 'P', grade_code: 'G', spec_code: args[0] === 'TRAY' ? 'TRAY30' : 'LOOSE',
      variety_code: args[0] === 'TRAY' ? 'V' : state.physicalVariety, org_context_required: true, status: 'ACTIVE', today: '2026-11-11' }];
    if (s.includes('FROM md_sku_org_scope')) return [{ scope_type: 'COMPANY', scope_code: 'C', status: 'ACTIVE', today: '2026-11-11',
      sale_enabled: args[0] === 'TRAY' ? state.commercialSale : state.physicalSale, stock_enabled: args[0] === 'TRAY' || state.physicalStock }];
    if (s.includes('FROM mst_products')) return [{ status: 'ACTIVE', variety_code: state.productVariety, unit: '枚' }];
    if (s.includes('FROM product_grades')) return [{ status: 'ACTIVE', is_saleable: true, is_storable: true }];
    if (s.includes('FROM packaging_specs')) return [{ status: 'ACTIVE', base_unit: state.specUnit }];
    if (s.includes('FROM md_product_varieties')) return [{ variety_code: args[0], status: 'ACTIVE' }];
    if (s.startsWith('SELECT * FROM inv_batches')) return [{ ...batch }];
    if (s.startsWith('SELECT * FROM sal_order_items')) return [item];
    if (s.includes('FROM sal_order_item_batch_allocations a')) return state.allocations.map(a => ({ ...batch, ...a, sale_sku_code: item.sku_code, sale_qty: item.qty, quantity_snapshot: item.quantity_snapshot, price_snapshot: item.price_snapshot }));
    if (s.startsWith('WITH changed AS ( UPDATE inv_batches')) {
      if (args[2] !== batch.company_code || args[3] !== batch.warehouse_code) return [];
      if (s.includes('SET qty_available = qty_available - $1')) batch.qty_available -= Number(args[0]);
      else if (s.includes('SET qty = qty - $1')) batch.qty -= Number(args[0]);
      state.writes++; return [{ batch_no: 'B' }];
    }
    if (s.startsWith('INSERT INTO inv_ledger')) return [{ id: String(++state.ledger) }];
    if (s.startsWith('INSERT INTO sal_order_item_batch_allocations')) { state.allocations.push({ id: 'A', batch_no: 'B', reserved_qty: args[2], outbound_qty: 0, released_qty: 0 }); return []; }
    if (s.startsWith('UPDATE sal_order_items') || s.startsWith('INSERT INTO sal_order_item_batch_allocation_actions')) return [];
    if (s.startsWith('WITH changed AS ( UPDATE sal_order_item_batch_allocations')) { state.allocations[0].outbound_qty += Number(args[0]); return [{ id: 'A' }]; }
    throw new Error(s);
  }) };
  const ds = { transaction: jest.fn(async (fn: (m: any) => Promise<any>) => fn(manager)) };
  const service = new EggInventoryService(ds as never, { get: jest.fn() } as never);
  const mgr = manager as unknown as EntityManager;
  const context = () => validateCommercialStockContext(mgr, { companyCode: 'C', warehouseCodes: ['W'], actor: { userId: 'U', isGlobal: false, allowedCompanyCodes: ['C'], allowedWarehouseCodes: ['W'] } as any });
  const allocate = (ctx: VerifiedCommercialContext | undefined, patch = {}) => service.allocateByFIFO({ productCode: 'P', companyCode: 'C', skuCode: 'TRAY', qty: 30, refNo: 'SO', note: 'commercial', fulfillmentWarehouseCode: 'W', quantitySnapshot: { ...quantity }, priceSnapshot: price(), ...patch }, mgr, ctx);
  return { batch, state, item, manager: mgr, service, context, allocate };
}

describe('commercial inventory allocation (real policy, isolated SQL double)', () => {
  it('TRAY30 commercial SKU consumes stock-only LOOSE pool without requiring physical sale flag/price', async () => {
    const f = fixture();
    await expect(f.allocate(await f.context())).resolves.toMatchObject([{ batchNo: 'B', allocatedQty: 30, skuCode: 'LOOSE' }]);
    expect(f.batch.qty_available).toBe(30);
    expect(f.state.writes).toBe(1);
    expect(f.state.ledger).toBe(1);
  });
  it('reserves then confirms managed existing allocations with the same transaction-bound authority', async () => {
    const f = fixture(), context = await f.context();
    await expect(f.service.reserveInventory('O', 'SO', 'C', f.manager, 'W', context)).resolves.toBe(true);
    await expect(f.service.reserveInventory('O', 'SO', 'C', f.manager, 'W', context)).resolves.toBe(false);
    await expect(f.service.confirmOutbound('O', 'SO', 'C', 'D', 'D1', 30, f.manager, context)).resolves.toBe(30);
    expect(f.batch.qty).toBe(30);
    expect(f.state.ledger).toBe(2);
  });
  it.each(['missing-quantity', 'missing-price', 'missing-explicit-sku', 'cross-pack', 'cross-unit', 'cross-variety', 'null-history', 'wrong-warehouse', 'wrong-company', 'stock-veto', 'sale-veto', 'wrong-price-company', 'wrong-price-pack', 'invalid-factor', 'fractional-eggs', 'quantity-mismatch', 'physical-pack-mismatch'])('rejects %s before inventory writes', async kind => {
    const f = fixture(), context = await f.context();
    const patch: any = {};
    if (kind === 'missing-quantity') patch.quantitySnapshot = null;
    if (kind === 'missing-price') patch.priceSnapshot = null;
    if (kind === 'missing-explicit-sku') patch.skuCode = undefined;
    if (kind === 'cross-pack') patch.quantitySnapshot = { ...quantity, specCode: 'LOOSE' };
    if (kind === 'cross-unit') patch.quantitySnapshot = { ...quantity, baseUnit: 'kg' };
    if (kind === 'cross-variety') f.batch.variety_code = 'OTHER';
    if (kind === 'null-history') f.batch.variety_code = null;
    if (kind === 'wrong-warehouse') f.batch.warehouse_code = 'OTHER';
    if (kind === 'wrong-company') f.batch.company_code = 'OTHER';
    if (kind === 'stock-veto') f.state.physicalStock = false;
    if (kind === 'sale-veto') f.state.commercialSale = false;
    if (kind === 'wrong-price-company') patch.priceSnapshot = { ...price(), companyCode: 'OTHER' };
    if (kind === 'wrong-price-pack') patch.priceSnapshot = { ...price(), priceQuantitySnapshot: { ...quantity, specCode: 'LOOSE' } };
    if (kind === 'invalid-factor') patch.quantitySnapshot = { ...quantity, factor: 1 };
    if (kind === 'fractional-eggs') patch.quantitySnapshot = { ...quantity, baseQty: 0.5 };
    if (kind === 'quantity-mismatch') patch.qty = 31;
    if (kind === 'physical-pack-mismatch') f.batch.spec_code = 'TRAY30';
    await expect(f.allocate(context, patch)).rejects.toThrow();
    expect(f.state.writes).toBe(0); expect(f.state.ledger).toBe(0);
  });
  it('rejects forged and wrong-manager contexts', async () => {
    const f = fixture(), context = await f.context();
    await expect(f.allocate({ ...context })).rejects.toThrow();
    await expect(f.allocate(await fixture().context())).rejects.toThrow();
    expect(f.state.writes).toBe(0);
  });
  it('legacy entry without third context still rejects explicit managed SKU', async () => {
    const f = fixture();
    await expect(f.allocate(undefined)).rejects.toThrow('公司上下文');
    expect(f.state.writes).toBe(0);
  });
  it('revalidates saved physical variety and price before outbound consumption', async () => {
    const f = fixture(), context = await f.context();
    await f.service.reserveInventory('O', 'SO', 'C', f.manager, 'W', context);
    f.batch.variety_code = 'OTHER';
    await expect(f.service.confirmOutbound('O', 'SO', 'C', 'D', 'D1', 30, f.manager, context)).rejects.toThrow();
    expect(f.batch.qty).toBe(60);
    f.batch.variety_code = 'V'; f.item.price_snapshot = null;
    await expect(f.service.confirmOutbound('O', 'SO', 'C', 'D', 'D1', 30, f.manager, context)).rejects.toThrow();
    expect(f.batch.qty).toBe(60);
  });
});
