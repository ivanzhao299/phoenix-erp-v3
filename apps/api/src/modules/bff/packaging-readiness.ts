import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

type Db = Pick<EntityManager, 'query'>;
export interface PackagingIdentity {
  grade: string; specCode?: string | null; specName?: string | null;
  productCode?: string | null; skuCode?: string | null;
}
function fail(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
function one(rows: any[], kind: string, label: string) {
  if (!rows.length) fail(`${kind}_MISSING`, `${label}主数据缺失，请在主数据中心维护`);
  const active = rows.filter(r => r.status === 'ACTIVE');
  if (!active.length) fail(`${kind}_INACTIVE`, `${label}主数据已失效`);
  if (active.length !== 1) fail(`${kind}_AMBIGUOUS`, `${label}存在多个有效候选，需核实权威关系`);
  return active[0];
}

/** One resolver for options, submit and confirm. Never infer a product from a code template. */
export async function resolvePackagingIdentity(db: Db, input: PackagingIdentity) {
  const grade = one(await db.query('SELECT * FROM product_grades WHERE grade_code=$1 FOR SHARE', [input.grade]), 'GRADE', `等级 ${input.grade} `);
  if (!grade.is_saleable || !grade.is_storable) fail('GRADE_NOT_STORABLE', `等级 ${input.grade} 不可售或不可库存`);
  if (!input.specCode && !input.specName) fail('SPEC_MISSING', '包装规格缺失');
  const spec = one(await db.query(`SELECT * FROM packaging_specs WHERE ${input.specCode ? 'spec_code' : 'spec_name'}=$1 FOR SHARE`, [input.specCode || input.specName]), 'SPEC', `规格 ${input.specCode || input.specName} `);
  const candidates = await db.query(`SELECT * FROM product_skus WHERE grade_code=$1 AND spec_code=$2
    AND ($3::text IS NULL OR product_code=$3) FOR SHARE`, [input.grade, spec.spec_code, input.productCode || null]);
  const sku = one(candidates, 'SKU', `${input.grade}/${spec.spec_code} SKU `);
  if (input.skuCode && sku.sku_code !== input.skuCode) fail('SKU_MISMATCH', 'SKU 与产品、等级、规格不匹配');
  const product = one(await db.query('SELECT * FROM mst_products WHERE product_code=$1 FOR SHARE', [sku.product_code]), 'PRODUCT', `产品 ${sku.product_code} `);
  if (!(Number(spec.qty_per_unit) > 0)) fail('SPEC_INVALID', '包装规格单位数量无效');
  return { grade: input.grade, productCode: product.product_code as string, skuCode: sku.sku_code as string,
    specCode: spec.spec_code as string, specName: spec.spec_name as string, qtyPerUnit: Number(spec.qty_per_unit) };
}

export async function listPackagingReadyCombinations(db: Db) {
  const rows = await db.query(`SELECT s.grade_code, s.spec_code, s.product_code FROM product_skus s
    JOIN mst_products p ON p.product_code=s.product_code AND p.status='ACTIVE'
    JOIN product_grades g ON g.grade_code=s.grade_code AND g.status='ACTIVE' AND g.is_saleable AND g.is_storable
    JOIN packaging_specs ps ON ps.spec_code=s.spec_code AND ps.status='ACTIVE'
    WHERE s.status='ACTIVE' ORDER BY s.grade_code, s.spec_code, s.product_code`);
  const ready = [];
  for (const row of rows) {
    try { ready.push(await resolvePackagingIdentity(db, { grade: row.grade_code, specCode: row.spec_code, productCode: row.product_code })); }
    catch (error) { if (!(error instanceof ConflictException)) throw error; }
  }
  return ready;
}
