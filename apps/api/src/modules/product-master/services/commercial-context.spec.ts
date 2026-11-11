import { EntityManager } from 'typeorm';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { assertCommercialContext, assertCommercialSkuUsable, storedApprovedSalesOrderContext,
  validateCommercialStockContext, validateCompanyCommercialContext } from './commercial-context';

const actor = { userId: 'U', isGlobal: false, allowedCompanyCodes: ['C'], allowedWarehouseCodes: ['W'] } as DataScopeContext;
function fixture() {
  const state = { company: true, warehouseCompany: 'C', warehouseStatus: 'ACTIVE', scope: true, sale: true,
    productVariety: 'V', productUnit: '枚', orderStatus: 'APPROVED', productStatus: 'ACTIVE', scopeExpiry: null as string | null };
  const manager = { queryRunner: { isTransactionActive: true }, query: jest.fn(async (sql: string, args: any[]) => {
    if (sql.includes('FROM sys_organizations')) return state.company ? [{ org_code: 'C' }] : [];
    if (sql.includes('FROM wms_warehouses')) return [{ warehouse_code: 'W', company_code: state.warehouseCompany, status: state.warehouseStatus }];
    if (sql.includes('FROM sal_sales_orders')) return [{ company_code: 'C', fulfillment_warehouse_code: 'W', status: state.orderStatus }];
    if (sql.includes('FROM product_skus')) return [{ sku_code: args[0], product_code: 'P', grade_code: 'G', spec_code: 'TRAY30', variety_code: 'V', org_context_required: true, status: 'ACTIVE', today: '2026-11-11' }];
    if (sql.includes('FROM md_sku_org_scope')) return state.scope ? [{ scope_type: 'COMPANY', scope_code: 'C', status: 'ACTIVE', sale_enabled: state.sale, stock_enabled: true, today: '2026-11-11', expire_date: state.scopeExpiry }] : [];
    if (sql.includes('FROM mst_products')) return [{ product_code: 'P', status: state.productStatus, variety_code: state.productVariety, unit: state.productUnit }];
    if (sql.includes('FROM product_grades')) return [{ status: 'ACTIVE', is_saleable: true, is_storable: true }];
    if (sql.includes('FROM packaging_specs')) return [{ status: 'ACTIVE', base_unit: '枚' }];
    if (sql.includes('FROM md_product_varieties')) return [{ variety_code: 'V', status: 'ACTIVE' }];
    throw new Error(sql);
  }) };
  return { state, manager: manager as unknown as EntityManager };
}

describe('server-only transaction-bound commercial context', () => {
  it('company pricing authorization requires no warehouse and snapshots immutable codes', async () => {
    const f = fixture();
    const context = await validateCompanyCommercialContext(f.manager, { companyCode: 'C', actor });
    expect(context.warehouseCodes).toEqual([]);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.warehouseCodes)).toBe(true);
    expect(() => assertCommercialContext(context, f.manager, { companyCode: 'C', warehouseCodes: ['W'] })).toThrow();
  });
  it('does not turn absent, malformed or warehouse-limited actors into global authority', async () => {
    for (const invalid of [undefined, {}, { isGlobal: true }, { ...actor, allowedCompanyCodes: [] }, { ...actor, allowedWarehouseCodes: [] }]) {
      const f = fixture();
      await expect(validateCommercialStockContext(f.manager, { companyCode: 'C', warehouseCodes: ['W'], actor: invalid as DataScopeContext })).rejects.toThrow();
    }
  });
  it.each(['INACTIVE', 'FOREIGN', 'MISSING-COMPANY'])('checks active exact warehouse ownership: %s', async kind => {
    const f = fixture();
    if (kind === 'INACTIVE') f.state.warehouseStatus = 'INACTIVE';
    if (kind === 'FOREIGN') f.state.warehouseCompany = 'OTHER';
    if (kind === 'MISSING-COMPANY') f.state.company = false;
    await expect(validateCommercialStockContext(f.manager, { companyCode: 'C', warehouseCodes: ['W'], actor })).rejects.toThrow();
  });
  it('rejects forged/cloned, wrong manager, company, warehouse and ended-transaction contexts', async () => {
    const f = fixture();
    const input = ['W'];
    const context = await validateCommercialStockContext(f.manager, { companyCode: 'C', warehouseCodes: input, actor });
    input.push('X');
    expect(context.warehouseCodes).toEqual(['W']);
    for (const bad of [{ context: { ...context }, manager: f.manager, companyCode: 'C', warehouseCodes: ['W'] },
      { context, manager: fixture().manager, companyCode: 'C', warehouseCodes: ['W'] },
      { context, manager: f.manager, companyCode: 'OTHER', warehouseCodes: ['W'] },
      { context, manager: f.manager, companyCode: 'C', warehouseCodes: ['X'] }]) {
      expect(() => assertCommercialContext(bad.context, bad.manager, bad)).toThrow();
    }
    Object.assign(f.manager.queryRunner!, { isTransactionActive: false });
    expect(() => assertCommercialContext(context, f.manager, { companyCode: 'C' })).toThrow();
  });
  it('stored callbacks derive immutable authority only from approved persisted order', async () => {
    const f = fixture();
    for (const status of ['APPROVED', 'ALLOCATED', 'PICKED', 'LOADED', 'SHIPPED', 'PARTIALLY_DELIVERED']) {
      f.state.orderStatus = status;
      await expect(storedApprovedSalesOrderContext(f.manager, 'O')).resolves.toMatchObject({ companyCode: 'C', warehouseCodes: ['W'] });
    }
    for (const status of ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED']) {
      f.state.orderStatus = status;
      await expect(storedApprovedSalesOrderContext(f.manager, 'O')).rejects.toThrow();
    }
  });
  it('commercial eligibility requires no house, and ANY still requires exact COMPANY scope', async () => {
    const f = fixture();
    const context = await validateCompanyCommercialContext(f.manager, { companyCode: 'C', actor });
    await expect(assertCommercialSkuUsable(f.manager, 'SKU', context, 'any')).resolves.toMatchObject({ variety_code: 'V' });
    f.state.scope = false;
    await expect(assertCommercialSkuUsable(f.manager, 'SKU', context, 'any')).rejects.toThrow();
    expect(f.manager.query).not.toHaveBeenCalledWith(expect.stringContaining('brd_houses'), expect.anything());
  });
  it.each(['PRODUCT-VARIETY', 'PRODUCT-UNIT', 'SALE-FLAG', 'PARENT-INACTIVE', 'SCOPE-EXPIRED'])('rejects parent or company life/use inconsistency: %s', async kind => {
    const f = fixture();
    const context = await validateCompanyCommercialContext(f.manager, { companyCode: 'C', actor });
    if (kind === 'PRODUCT-VARIETY') f.state.productVariety = 'OTHER';
    if (kind === 'PRODUCT-UNIT') f.state.productUnit = 'kg';
    if (kind === 'SALE-FLAG') f.state.sale = false;
    if (kind === 'PARENT-INACTIVE') f.state.productStatus = 'INACTIVE';
    if (kind === 'SCOPE-EXPIRED') f.state.scopeExpiry = '2026-11-10';
    await expect(assertCommercialSkuUsable(f.manager, 'SKU', context, 'sale')).rejects.toThrow();
  });
});
