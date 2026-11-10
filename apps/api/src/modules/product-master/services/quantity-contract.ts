import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export type QuantityBasis = 'BASE' | 'PACKAGE';
export interface QuantitySnapshot {
  version: 1;
  basis: QuantityBasis;
  productCode: string;
  gradeCode: string;
  skuCode: string;
  specCode: string;
  baseUnit: string;
  tradeUnit: string;
  factor: number;
  baseQty: number;
  packageFactor?: number;
  priceFactor?: number;
  priceUnit?: string;
}
type Queryable = Pick<EntityManager, 'query'>;

export function positiveQuantity(value: unknown, label = '数量'): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) throw new BadRequestException(`${label}必须为有限正数`);
  return n;
}
export function baseQuantity(qty: number, factor: number, unit: string): number {
  const base = positiveQuantity(qty) * positiveQuantity(factor, '换算系数');
  if (!Number.isFinite(base) || base > 99999999999.99 || (unit === '枚' && !Number.isSafeInteger(Math.round(base * 1e8) / 1e8))) {
    throw new BadRequestException('基础数量超出精度范围；枚必须为整数，不能四舍五入');
  }
  if (Math.abs(base * 100 - Math.round(base * 100)) > 1e-6) throw new BadRequestException('基础数量最多两位小数，避免分配账静默舍入');
  return Math.round(base * 100) / 100;
}

/** Only explicit new requests opt into conversion. Missing basis preserves historical base quantity. */
export async function resolveQuantity(db: Queryable, item: {
  qty: number; quantityBasis?: QuantityBasis; skuCode?: string; productCode?: string;
}): Promise<QuantitySnapshot | null> {
  positiveQuantity(item.qty);
  if (item.quantityBasis === undefined) return null;
  if (Math.abs(item.qty * 100 - Math.round(item.qty * 100)) > 1e-6) throw new BadRequestException('交易数量最多两位小数');
  if (!['BASE', 'PACKAGE'].includes(item.quantityBasis) || !item.skuCode) throw new BadRequestException('明确计量必须选择 SKU，并指定 BASE / PACKAGE');
  const [r] = await db.query(`SELECT s.product_code,s.grade_code,s.spec_code,p.unit,p.unit_zh,
    sp.base_unit,sp.display_unit,sp.qty_per_unit
    FROM product_skus s JOIN mst_products p ON p.product_code=s.product_code
    JOIN packaging_specs sp ON sp.spec_code=s.spec_code WHERE s.sku_code=$1 FOR SHARE OF s,p,sp`, [item.skuCode]);
  const baseUnit = r?.unit_zh || r?.unit;
  if (!r || !baseUnit || baseUnit !== r.base_unit || !r.display_unit || !r.grade_code) throw new BadRequestException('产品基本单位与规格基本单位不一致或不明确，请治理主档');
  const packageFactor = positiveQuantity(r.qty_per_unit, '规格换算系数');
  const factor = item.quantityBasis === 'PACKAGE' ? packageFactor : 1;
  const snapshot: QuantitySnapshot = { version: 1, basis: item.quantityBasis, productCode: r.product_code, gradeCode: r.grade_code,
    skuCode: item.skuCode, specCode: r.spec_code, baseUnit, tradeUnit: item.quantityBasis === 'PACKAGE' ? r.display_unit : baseUnit,
    factor, packageFactor, baseQty: baseQuantity(item.qty, factor, baseUnit) };
  savedQuantity({ qty: item.qty, quantity_snapshot: snapshot });
  return snapshot;
}

/** Never consult mutable SKU/spec master data for a saved transaction. */
export function savedQuantity(row: { qty?: unknown; quantity_snapshot?: QuantitySnapshot | null }): number {
  if (row.quantity_snapshot == null) return positiveQuantity(row.qty);
  const s = row.quantity_snapshot;
  if (typeof s !== 'object' || Array.isArray(s) || s.version !== 1
      || ![s.baseUnit,s.tradeUnit,s.productCode,s.gradeCode,s.skuCode,s.specCode].every(v => typeof v === 'string' && v.length>0 && v===v.trim())
      || !['BASE','PACKAGE'].includes(s.basis) || typeof s.factor !== 'number' || typeof s.baseQty !== 'number'
      || (s.basis === 'BASE' && s.factor !== 1)
      || Math.abs(Number(row.qty)*100-Math.round(Number(row.qty)*100))>1e-6
      || baseQuantity(positiveQuantity(row.qty),s.factor,s.baseUnit)!==s.baseQty) throw new BadRequestException('计量快照无效，拒绝按当前规格猜测');
  return Number(s.baseQty);
}

export function poolKey(company: string, warehouse: string, s: QuantitySnapshot): string {
  return JSON.stringify(['physical-stock-v1', company, warehouse, s.productCode, s.gradeCode, s.baseUnit]);
}
export async function lockQuantityPools(db: Queryable, requests: Array<{ company: string; warehouses: string[]; snapshot: QuantitySnapshot | null }>): Promise<void> {
  const keys: string[] = [];
  for (const r of requests) {
    if (!r.snapshot) continue;
    const warehouses = r.warehouses;
    if (!warehouses.length || warehouses.some(w => !w)) throw new BadRequestException('共享库存操作必须指定授权仓库');
    for (const w of warehouses) keys.push(poolKey(r.company, w, r.snapshot));
  }
  for (const key of [...new Set(keys)].sort()) await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}
export function assertBatchPool(batch: any, s: QuantitySnapshot): void {
  if (batch.product_code !== s.productCode || batch.grade_code_std !== s.gradeCode || batch.unit !== s.baseUnit || batch.material_code || batch.legacy_source || batch.base_quantity_version !== 1) {
    throw new ConflictException('批次实物身份或基本单位与交易快照不符；缺失身份的历史批次须先治理');
  }
}
export async function sharedBatches(db: Queryable, company: string, warehouses: string[], s: QuantitySnapshot) {
  await lockQuantityPools(db, [{ company, warehouses, snapshot: s }]);
  return db.query(`SELECT * FROM inv_batches WHERE company_code=$1 AND product_code=$2 AND grade_code_std=$3 AND unit=$4
    AND material_code IS NULL AND legacy_source IS NULL AND base_quantity_version=1 AND status='AVAILABLE' AND qty_available>0
    AND (expire_date IS NULL OR expire_date>=CURRENT_DATE)
    AND (cardinality($5::varchar[])=0 OR warehouse_code=ANY($5::varchar[]))
    ORDER BY expire_date ASC NULLS LAST,created_at ASC,batch_no ASC FOR UPDATE`,
    [company, s.productCode, s.gradeCode, s.baseUnit, warehouses]);
}
