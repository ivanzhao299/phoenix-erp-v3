import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { SkuPolicy, SkuUsage } from './sku-policy';

export type CommercialActor = DataScopeContext;
export interface CommercialContextInput { companyCode: string; actor: CommercialActor | undefined }
const brand: unique symbol = Symbol('VerifiedCommercialContext');
export interface VerifiedCommercialContext {
  readonly [brand]: true;
  readonly companyCode: string;
  readonly warehouseCodes: readonly string[];
}
const bindings = new WeakMap<object, EntityManager>();
function code(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new BadRequestException('商业上下文编码必须显式提供且无首尾空格');
  return value;
}
function transaction(manager: EntityManager): void {
  if (!manager?.queryRunner?.isTransactionActive) throw new ForbiddenException('商业上下文必须绑定活动事务 manager');
}
function authorize(actor: CommercialActor | undefined, companyCode: string, warehouses: readonly string[]): void {
  if (!actor || typeof actor.userId !== 'string' || !actor.userId.trim()
      || (actor.isGlobal !== true && (actor.isGlobal !== false || !Array.isArray(actor.allowedCompanyCodes)
        || !actor.allowedCompanyCodes.includes(companyCode) || !Array.isArray(actor.allowedWarehouseCodes)
        || warehouses.some(w => !actor.allowedWarehouseCodes.includes(w))))) {
    throw new ForbiddenException('商业公司/仓库不在 actor DataScope');
  }
}
async function mint(manager: EntityManager, companyCode: string, warehouses: readonly string[]): Promise<VerifiedCommercialContext> {
  transaction(manager);
  code(companyCode);
  const companies = await manager.query(`SELECT org_code FROM sys_organizations WHERE org_type='COMPANY'
    AND status='ACTIVE' AND COALESCE(company_code,org_code)=$1 FOR SHARE`, [companyCode]);
  if (companies.length !== 1) throw new ForbiddenException('商业公司不存在、归属不唯一或未启用');
  const warehouseCodes = [...new Set(warehouses.map(code))].sort();
  if (warehouseCodes.length) {
    const rows = await manager.query(`SELECT warehouse_code,company_code,status FROM wms_warehouses
      WHERE warehouse_code=ANY($1::text[]) ORDER BY warehouse_code FOR SHARE`, [warehouseCodes]);
    if (rows.length !== warehouseCodes.length || warehouseCodes.some(w => rows.filter((r: any) => r.warehouse_code === w
      && r.company_code === companyCode && r.status === 'ACTIVE').length !== 1)) throw new ForbiddenException('商业仓库未启用或不属于指定公司');
  }
  const context: VerifiedCommercialContext = Object.freeze({ [brand]: true as const, companyCode, warehouseCodes: Object.freeze(warehouseCodes) });
  bindings.set(context, manager);
  return context;
}
/** Pricing-only authorization intentionally does not require a warehouse. Never take actor from a request body. */
export async function validateCompanyCommercialContext(manager: EntityManager, input: CommercialContextInput): Promise<VerifiedCommercialContext> {
  transaction(manager);
  authorize(input.actor, code(input.companyCode), []);
  return mint(manager, input.companyCode, []);
}
export async function validateCommercialStockContext(manager: EntityManager, input: CommercialContextInput & { warehouseCodes: readonly string[] }): Promise<VerifiedCommercialContext> {
  transaction(manager);
  if (!Array.isArray(input.warehouseCodes) || !input.warehouseCodes.length) throw new ForbiddenException('商业库存必须显式提供授权仓库');
  authorize(input.actor, code(input.companyCode), input.warehouseCodes.map(code));
  return mint(manager, input.companyCode, input.warehouseCodes);
}
export function assertCommercialContext(context: VerifiedCommercialContext, manager: EntityManager, expected: { companyCode: string; warehouseCodes?: readonly string[] }): void {
  transaction(manager);
  if (!context || bindings.get(context) !== manager || context.companyCode !== expected.companyCode
      || (expected.warehouseCodes !== undefined && (!expected.warehouseCodes.length
        || expected.warehouseCodes.some(w => !context.warehouseCodes.includes(code(w)))))) {
    throw new ForbiddenException('商业上下文伪造、事务不一致或公司/实际仓库不匹配');
  }
}
/** Callback-only authority comes from a locked persisted approved order, never caller-supplied company/warehouse. */
export async function storedApprovedSalesOrderContext(manager: EntityManager, orderId: string): Promise<VerifiedCommercialContext> {
  transaction(manager);
  const [order] = await manager.query(`SELECT id,company_code,fulfillment_warehouse_code,status FROM sal_sales_orders WHERE id=$1 FOR SHARE`, [orderId]);
  if (!order || !['APPROVED', 'ALLOCATED', 'PICKED', 'LOADED', 'SHIPPED', 'PARTIALLY_DELIVERED'].includes(order.status)) throw new ForbiddenException('订单没有已批准商业库存上下文');
  return mint(manager, code(order.company_code), [code(order.fulfillment_warehouse_code)]);
}
/** Recheck StoreScope's server-resolved selection under this stock transaction. */
export async function validateStoreCommercialContext(manager: EntityManager, input: CommercialContextInput & { storeCode: string; warehouseCodes: readonly string[] }): Promise<VerifiedCommercialContext> {
  const context = await validateCommercialStockContext(manager, input);
  const stores = await manager.query(`SELECT id,company_code FROM store_master WHERE store_code=$1 AND status='ACTIVE' FOR SHARE`, [code(input.storeCode)]);
  if (stores.length !== 1 || stores[0].company_code !== context.companyCode) throw new ForbiddenException('门店公司与商业上下文不一致');
  const rows = await manager.query(`SELECT warehouse_code FROM store_warehouse_bindings WHERE store_id=$1 AND purpose='SALES'
    AND status='ACTIVE' AND (effective_from IS NULL OR effective_from<=NOW()) AND (effective_to IS NULL OR effective_to>=NOW()) FOR SHARE`, [stores[0].id]);
  if (context.warehouseCodes.some(w => !rows.some((r: any) => r.warehouse_code === w))) throw new ForbiddenException('商业仓库不在有效门店 SALES 绑定');
  return context;
}
/** Commercial eligibility is independent of production house/source profiles. All parents and company scope are locked. */
export async function assertCommercialSkuUsable(manager: EntityManager, skuCode: string, context: VerifiedCommercialContext, usage: SkuUsage = 'sale-stock') {
  assertCommercialContext(context, manager, { companyCode: context?.companyCode });
  const sku = await SkuPolicy.requireUsable(manager, skuCode, usage, context.companyCode);
  const [product] = await manager.query('SELECT product_code,variety_code,unit,unit_zh FROM mst_products WHERE product_code=$1 FOR SHARE', [sku.product_code]);
  if (!product || product.variety_code !== sku.variety_code || !(product.unit_zh || product.unit)
      || (product.unit_zh || product.unit) !== sku.base_unit) throw new BadRequestException('商业 SKU 父产品品种或基本单位不一致');
  // Even ANY/legacy-commercial selection needs an explicit COMPANY authorization; ALL never grants use.
  const rows = await manager.query(`SELECT scope_type,scope_code,status,sale_enabled,stock_enabled,
    effective_date::text AS effective_date,expire_date::text AS expire_date,CURRENT_DATE::text AS today
    FROM md_sku_org_scope WHERE sku_code=$1 AND scope_type='COMPANY' AND scope_code=$2 FOR SHARE`, [skuCode, context.companyCode]);
  if (rows.length !== 1 || rows.some((r: any) => r.scope_type !== 'COMPANY' || r.scope_code !== context.companyCode
    || r.status !== 'ACTIVE' || !r.today || (r.effective_date && r.effective_date > r.today) || (r.expire_date && r.expire_date < r.today)
    || ((usage === 'sale' || usage === 'sale-stock') && r.sale_enabled !== true)
    || ((usage === 'stock' || usage === 'sale-stock') && r.stock_enabled !== true))) throw new ForbiddenException('SKU 缺少有效商业 COMPANY 用途授权');
  return sku;
}
