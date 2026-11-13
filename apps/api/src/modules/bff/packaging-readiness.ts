import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SkuAvailabilityService } from '../product-master/services/sku-availability.service';
import { OrgOwnershipService } from '../org/services/org-ownership.service';

type Db = Pick<EntityManager, 'query'>;
export interface PackagingSourceContext {
  companyCode: string;
  farmCode: string;
  siteCode?: string | null;
  eggDate: string;
  varietyCode?: string | null;
  houseCodes: string[];
  productMode?: 'STANDARD' | 'VARIANT';
  sourceProfileCode?: string;
  sourceProfileCodes?: string[];
  sourceProfileRefs?: Array<{ profileCode: string; houseCode: string }>;
  houseProfiles?: Record<string, { sourceProfileCode: string; productMode: 'STANDARD' | 'VARIANT'; varietyCode: string | null }>;
}
export interface PackagingIdentity {
  grade: string; specCode?: string | null; specName?: string | null;
  productCode?: string | null; skuCode?: string | null;
  varietyCode?: string | null;
  /** Initial inventory state from the grade policy; defects stay stock-managed but non-saleable. */
  stockStatus?: 'AVAILABLE' | 'RESERVED' | 'QUARANTINE' | 'DAMAGED' | 'FROZEN';
  sourceContext?: PackagingSourceContext;
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

/** The shift owns the farm/date; grading links, never caller-supplied variety, own provenance. */
export async function resolvePackagingSourceContext(db: Db, input: {
  packingCode?: string; shiftId?: number | string; gradingCodes?: string[];
  houseCode?: string; eggDate?: string; historical?: boolean;
}): Promise<PackagingSourceContext> {
  let shiftId = input.shiftId;
  let gradingCodes = input.gradingCodes;
  if (input.packingCode) {
    const [packing] = await db.query(`SELECT shift_id, grading_code, grading_codes_json, production_date::text AS egg_date FROM pkg_packing_records WHERE code=$1 FOR SHARE`, [input.packingCode]);
    if (!packing) fail('PACKING_MISSING', '包装记录不存在');
    shiftId = packing.shift_id;
    const codes = typeof packing.grading_codes_json === 'string' ? JSON.parse(packing.grading_codes_json) : packing.grading_codes_json;
    gradingCodes = Array.isArray(codes) && codes.length ? codes : [packing.grading_code].filter(Boolean);
    if (input.eggDate && input.eggDate !== packing.egg_date) fail('SOURCE_DATE_MISMATCH', '包装权威生产日期不匹配');
    input = { ...input, eggDate: packing.egg_date };
  }
  let farmCode: string | undefined, eggDate = input.eggDate;
  let houses: any[];
  if (shiftId) {
    const [shift] = await db.query(`SELECT site_id, is_test, production_date::text AS egg_date FROM pkg_work_shifts WHERE id=$1 FOR SHARE`, [shiftId]);
    if (!shift?.site_id || !shift.egg_date) fail('SOURCE_MISSING', '包装班次缺权威场站或生产日期');
    if (eggDate && eggDate !== shift.egg_date) fail('SOURCE_DATE_MISMATCH', '包装与班次生产日期不匹配');
    farmCode = shift.site_id; eggDate = shift.egg_date;
    if (!gradingCodes?.length) fail('SOURCE_MISSING', '包装缺分级来源关联');
    const grades = await db.query(`SELECT g.code FROM pkg_grading_records g WHERE g.code=ANY($1::text[])
      AND g.status='ACTIVE' AND g.is_test=$2 AND EXISTS (SELECT 1 FROM pkg_grading_source_links l WHERE l.grading_id=g.id) FOR SHARE`, [gradingCodes, shift.is_test]);
    if (grades.length !== new Set(gradingCodes).size) fail('SOURCE_MISSING', '包装缺有效分级来源关联');
    await db.query(`SELECT s.id FROM pkg_source_batches s JOIN pkg_grading_source_links l ON l.source_batch_id=s.id
      JOIN pkg_grading_records g ON g.id=l.grading_id WHERE g.code=ANY($1::text[]) FOR SHARE OF s, l`, [gradingCodes]);
    houses = await db.query(`SELECT DISTINCT s.house_code, s.production_date::text AS egg_date, s.batch_status, s.is_test, g.is_test AS grading_is_test
      FROM pkg_grading_source_links l JOIN pkg_grading_records g ON g.id=l.grading_id
      LEFT JOIN pkg_source_batches s ON s.id=l.source_batch_id WHERE g.code=ANY($1::text[])`, [gradingCodes]);
    if (houses.some(h => ['VOID', 'CANCELLED', 'SCRAPPED'].includes(h.batch_status) || h.is_test !== h.grading_is_test || h.egg_date !== eggDate)) fail('SOURCE_INVALID', '包装来源失效、模式或生产日期不一致');
  } else {
    if (!input.houseCode) fail('SOURCE_MISSING', '包装缺权威来源鸡舍/班次');
    houses = [{ house_code: input.houseCode }];
  }
  if (!eggDate || !/^\d{4}-\d{2}-\d{2}$/.test(eggDate) || !Number.isFinite(Date.parse(`${eggDate}T00:00:00Z`))
    || new Date(`${eggDate}T00:00:00Z`).toISOString().slice(0, 10) !== eggDate) fail('SOURCE_DATE_MISSING', '包装权威生产日期缺失或无效');
  if (!houses.length || houses.some(h => !h.house_code)) fail('SOURCE_MISSING', '包装缺来源鸡舍');
  const houseCodes = [...new Set<string>(houses.map(h => h.house_code))].sort();
  let context: PackagingSourceContext | undefined;
  const houseProfiles: NonNullable<PackagingSourceContext['houseProfiles']> = {};
  const profileCodes = new Set<string>();
  const identities = new Set<string>();
  let productMode: 'STANDARD' | 'VARIANT' | undefined;
  let varietyCode: string | null | undefined;
  const availability = new SkuAvailabilityService(db as DataSource);
  for (const houseCode of houseCodes) {
    const rows = await db.query(`SELECT h.house_code, h.farm_code, f.company_code, ${OrgOwnershipService.FARM_SITE_SQL} AS site_code
      FROM brd_houses h JOIN ${OrgOwnershipService.FARM_TABLE} f ON f.farm_code=h.farm_code
      WHERE h.house_code=$1 ${input.historical ? '' : "AND h.status='ACTIVE' AND f.status='ACTIVE'"} FOR SHARE OF h, f`, [houseCode]);
    const row = rows[0];
    if (rows.length !== 1 || !row.company_code || !row.farm_code || (farmCode && farmCode !== row.farm_code)
      || (context && (context.companyCode !== row.company_code || context.farmCode !== row.farm_code))) fail('SOURCE_ORG_MISMATCH', '来源鸡舍与包装班次公司/场站权威归属不一致');
    context = { companyCode: row.company_code, farmCode: row.farm_code, siteCode: row.site_code, eggDate, houseCodes };
    if (!input.historical) {
      const profile = await availability.resolveSourceProfile({ ...context, houseCode }, db);
      productMode = profile.productMode;
      varietyCode = profile.varietyCode;
      identities.add(JSON.stringify([productMode, varietyCode]));
      profileCodes.add(profile.profileCode);
      houseProfiles[houseCode] = { sourceProfileCode: profile.profileCode, productMode, varietyCode };
    }
  }
  if (input.historical) return context!;
  if (identities.size !== 1) fail('SOURCE_VARIETY_AMBIGUOUS', '包装来源混品种或混STANDARD/VARIANT模式，禁止包装');
  const sourceProfileRefs = houseCodes.map(houseCode => ({ houseCode, profileCode: houseProfiles[houseCode].sourceProfileCode }));
  return { ...context!, varietyCode, productMode, sourceProfileCode: sourceProfileRefs.length === 1 ? sourceProfileRefs[0].profileCode : undefined,
    sourceProfileCodes: [...profileCodes], sourceProfileRefs, houseProfiles };
}

/** Fresh writes always validate every source house, including explicit product/SKU selections. */
export async function resolvePackagingIdentity(db: Db, input: PackagingIdentity) {
  const context = input.sourceContext;
  if (!context?.companyCode || !context.sourceProfileRefs?.length || !context.productMode || !context.houseCodes?.length
    || (context.productMode === 'VARIANT' && !context.varietyCode)
    || (context.productMode === 'STANDARD' && context.varietyCode != null)) fail('SOURCE_MISSING', '包装缺权威组织、生产日期或来源配置');
  if (input.varietyCode !== undefined && input.varietyCode !== context.varietyCode) fail('VARIETY_MISMATCH', '显式品种与权威来源不匹配');
  if (input.skuCode != null && !input.skuCode.trim()) fail('SKU_MISSING', 'SKU 编码不能为空');
  if (!input.specCode && !input.specName) fail('SPEC_MISSING', '包装规格缺失');
  // Packaging grants stock operations, not sales authorization. The nine-grade
  // policy deliberately keeps defect grades in inventory with an internal
  // status (QUARANTINE/DAMAGED), so only stock management must be enabled here.
  const grade = one(await db.query('SELECT * FROM product_grades WHERE grade_code=$1 FOR SHARE', [input.grade]), 'GRADE', `等级 ${input.grade} `);
  const stockManaged = grade.stock_managed ?? (grade.default_stock_status ? true : grade.is_storable);
  if (stockManaged !== true) fail('GRADE_INELIGIBLE', '包装等级未启用库存管理');
  // A non-saleable grade is only accepted when the reviewed policy has
  // assigned an explicit internal status. This keeps a pre-seed legacy row
  // from silently changing behavior during the migration window.
  if ((grade.sale_enabled ?? grade.is_saleable) !== true && !grade.default_stock_status) {
    fail('GRADE_POLICY_MISSING', '不可售等级缺少内部库存状态策略');
  }
  const stockStatus = grade.default_stock_status
    ?? ((grade.sale_enabled ?? grade.is_saleable) === true ? 'AVAILABLE' : 'QUARANTINE');
  if (!['AVAILABLE', 'RESERVED', 'QUARANTINE', 'DAMAGED', 'FROZEN'].includes(stockStatus)) {
    fail('GRADE_POLICY_INVALID', `等级 ${input.grade} 的库存状态策略无效`);
  }
  const spec = one(await db.query(`SELECT * FROM packaging_specs WHERE ${input.specCode ? 'spec_code' : 'spec_name'}=$1 FOR SHARE`, [input.specCode || input.specName]), 'SPEC', `规格 ${input.specCode || input.specName} `);
  if (!(Number(spec.qty_per_unit) > 0)) fail('SPEC_INVALID', '包装规格单位数量无效');
  const availability = new SkuAvailabilityService(db as DataSource);
  let identity: Awaited<ReturnType<SkuAvailabilityService['resolve']>> | undefined;
  for (const houseCode of context.houseCodes) {
    const sku = await availability.resolve({ ...context, sourceProfileCode: context.houseProfiles?.[houseCode]?.sourceProfileCode ?? context.sourceProfileCode,
      houseCode, gradeCode: input.grade, specCode: spec.spec_code, usage: 'stock' }, db);
    if ((input.skuCode && sku.skuCode !== input.skuCode) || (input.productCode && sku.productCode !== input.productCode)
      || (identity && sku.skuCode !== identity.skuCode)) fail('SKU_MISMATCH', 'SKU 与来源品种、产品、等级、规格不匹配');
    identity = sku;
  }
  return { grade: input.grade, productCode: identity!.productCode, skuCode: identity!.skuCode,
    varietyCode: identity!.varietyCode ?? null, specCode: spec.spec_code as string, specName: spec.spec_name as string,
    stockStatus: stockStatus as PackagingIdentity['stockStatus'], qtyPerUnit: Number(spec.qty_per_unit) };
}

/** No context means no options, not a global variant catalogue. */
export async function listPackagingReadyCombinations(db: Db, context?: PackagingSourceContext) {
  if (!context) return [];
  const rows = await db.query(`SELECT DISTINCT grade_code, spec_code FROM product_skus WHERE variety_code IS NOT DISTINCT FROM $1 ORDER BY grade_code, spec_code`, [context.varietyCode]);
  const ready = [];
  for (const row of rows) {
    try { ready.push(await resolvePackagingIdentity(db, { grade: row.grade_code, specCode: row.spec_code, sourceContext: context })); }
    catch (error) { if (!(error instanceof ConflictException) && !(error instanceof BadRequestException)) throw error; }
  }
  return ready;
}
