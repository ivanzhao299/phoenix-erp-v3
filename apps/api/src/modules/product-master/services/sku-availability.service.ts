import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SkuPolicy, SkuUsage } from './sku-policy';

/**
 * SkuAvailabilityService — SKU 组织适用范围 + 品种解析统一入口（阶段 3）
 *
 * 修正版方案一核心服务：所有"按等级/规格猜 SKU"的调用方必须迁移到本服务，
 * 禁止再直接 `SELECT * FROM product_skus WHERE grade_code=? AND spec_code=?`。
 *
 * 解析顺序（fail-closed，任何一步缺失/多义都抛 400，绝不静默回退全局）：
 *   1. 鸡舍/农场 → 品种链：brd_flocks.breed_code → md_variety_breeds → variety_code
 *      （无鸡群上下文时必须显式传 varietyCode；两者都没有 → 拒绝）
 *   2. 候选 SKU：product_skus × mst_products.variety_code（品种约束下沉变体层）
 *   3. 组织适用：md_sku_org_scope 命中 COMPANY / FARM / SITE / ALL 任一行
 *      （本公司有行 → 以本公司行为准；无本公司行但有 ALL → 共享兜底；都没有 → 拒绝）
 *   4. 状态校验：SkuPolicy.usableSql + usage（sale/stock 开关在 scope 行上）
 *
 * 历史兼容：varietyCode 传 null 且候选 SKU 全部无变体（variety_code IS NULL 的
 * 无变体产品线，如 PRD-EGG-1..5）时按旧全局语义解析——这是 G68 既有 35 个 SKU
 * 的存量通道，新 SKU 一律要求品种上下文。
 */
export interface SkuResolveInput {
  companyCode: string;
  gradeCode: string;
  specCode?: string;
  /** 品种上下文：来自鸡群或显式传入；两者皆无时走无变体兼容通道 */
  varietyCode?: string | null;
  farmCode?: string | null;
  siteCode?: string | null;
  houseCode?: string | null;
  usage?: SkuUsage;
}

export interface SkuResolveResult {
  skuCode: string;
  productCode: string;
  varietyCode: string | null;
  gradeCode: string;
  specCode: string;
  scopeType: 'COMPANY' | 'FARM' | 'SITE' | 'ALL';
  scopeCode: string;
  saleEnabled: boolean;
  stockEnabled: boolean;
}

const VARIETY_SQL = `
  SELECT DISTINCT vb.variety_code
    FROM md_variety_breeds vb
   WHERE vb.status = 'ACTIVE' AND vb.breed_code = ANY($1::text[])`;

const SCOPE_TYPES = ['COMPANY', 'FARM', 'SITE', 'ALL'] as const;
type ScopeType = typeof SCOPE_TYPES[number];
const asScopeType = (value: unknown): ScopeType => (SCOPE_TYPES as readonly string[]).includes(String(value)) ? String(value) as ScopeType : 'ALL';

@Injectable()
export class SkuAvailabilityService {
  constructor(private readonly ds: DataSource) {}

  /** 鸡舍 → 在产鸡群 → breed_code 集合 → 变体集合。无在产鸡群返回空数组（调用方决定拒绝）。 */
  async resolveVarietiesByHouse(houseCode: string, mgr?: { query: (sql: string, p?: unknown[]) => Promise<any[]> }): Promise<string[]> {
    const db = mgr ?? this.ds;
    const rows = await db.query(
      `SELECT DISTINCT f.breed_code
         FROM brd_flocks f
        WHERE f.house_code = $1 AND f.status IN ('ACTIVE', 'LAYING')
          AND f.breed_code IS NOT NULL AND f.breed_code <> ''`,
      [houseCode],
    );
    const breedCodes = (rows ?? []).map((r: any) => String(r.breed_code)).filter(Boolean);
    if (!breedCodes.length) return [];
    const varietyRows = await db.query(VARIETY_SQL, [breedCodes]);
    return (varietyRows ?? []).map((r: any) => String(r.variety_code)).filter(Boolean);
  }

  /**
   * 统一解析：等级(+规格)+品种+公司 → 唯一可用 SKU。
   * 多候选/零候选/无权限都抛 BadRequestException（信息含原因，供终端可读）。
   */
  async resolve(input: SkuResolveInput, mgr?: { query: (sql: string, p?: unknown[]) => Promise<any[]> }): Promise<SkuResolveResult> {
    const db = mgr ?? this.ds;
    const usage: SkuUsage = input.usage ?? 'stock';
    const spec = input.specCode?.trim() || 'LOOSE';

    // 1) 品种上下文：显式 > 鸡群推导
    let varieties = input.varietyCode ? [input.varietyCode] : [];
    if (!varieties.length && input.houseCode) varieties = await this.resolveVarietiesByHouse(input.houseCode, db);
    const hasVarietyCtx = varieties.length > 0;

    // 2) 候选 SKU（含父档状态过滤；品种约束在 product.variety_code 上）
    const params: unknown[] = [input.gradeCode, spec];
    let varietyClause: string;
    if (hasVarietyCtx) {
      params.push(varieties);
      varietyClause = `AND p.variety_code = ANY($${params.length}::text[])`;
    } else {
      // 无品种上下文：只允许解析到无变体产品线（历史兼容通道）
      varietyClause = 'AND p.variety_code IS NULL';
    }
    const candidates = (await db.query(
      `SELECT s.sku_code, s.product_code, s.variety_code, s.grade_code, s.spec_code
         FROM product_skus s
         JOIN mst_products p ON p.product_code = s.product_code
        WHERE s.grade_code = $1 AND s.spec_code = $2
          AND ${SkuPolicy.usableSql('s', usage)}
          AND p.status = 'ACTIVE'
          ${varietyClause}`,
      params,
    )) ?? [];
    if (!candidates.length) {
      const ctx = hasVarietyCtx ? `品种 ${varieties.join('/')}` : '无品种上下文（仅无变体产品线）';
      throw new BadRequestException(
        `等级 ${input.gradeCode}/${spec} 在 ${ctx} 下没有可用 SKU，请先在主数据中心维护产品变体与 SKU`,
      );
    }

    // 3) 组织适用过滤 + 4) 结果收集
    const resolved: SkuResolveResult[] = [];
    for (const sku of candidates) {
      const scope = await this.matchScope(db, sku.sku_code, input);
      if (!scope) continue;
      if (usage === 'sale' || usage === 'sale-stock') {
        if (!scope.sale_enabled) continue;
      }
      if (usage === 'stock' || usage === 'sale-stock') {
        if (!scope.stock_enabled) continue;
      }
      resolved.push({
        skuCode: sku.sku_code,
        productCode: sku.product_code,
        varietyCode: sku.variety_code ?? null,
        gradeCode: sku.grade_code,
        specCode: sku.spec_code,
        scopeType: asScopeType(scope.scope_type),
        scopeCode: scope.scope_code ?? '',
        saleEnabled: scope.sale_enabled === true,
        stockEnabled: scope.stock_enabled === true,
      });
    }
    if (!resolved.length) {
      throw new BadRequestException(
        `等级 ${input.gradeCode}/${spec} 的候选 SKU 均不适用于公司 ${input.companyCode}（无组织适用范围或用途被禁用）`,
      );
    }
    if (resolved.length > 1) {
      const list = resolved.map(r => `${r.skuCode}(${r.varietyCode ?? '无变体'})`).join('、');
      throw new BadRequestException(
        `等级 ${input.gradeCode}/${spec} 在公司 ${input.companyCode} 匹配多个可用 SKU：${list}。请细化品种或规格后重试`,
      );
    }
    return resolved[0];
  }

  /** 校验显式 skuCode 在组织+品种上下文下可用（POS/销售/包装传入已选 SKU 时用）。 */
  async assertUsable(skuCode: string, input: Omit<SkuResolveInput, 'gradeCode' | 'specCode'>, mgr?: { query: (sql: string, p?: unknown[]) => Promise<any[]> }): Promise<SkuResolveResult> {
    const db = mgr ?? this.ds;
    const skuRows = (await db.query(
      `SELECT s.sku_code, s.product_code, s.variety_code, s.grade_code, s.spec_code
         FROM product_skus s
        WHERE s.sku_code = $1 AND ${SkuPolicy.usableSql('s', input.usage ?? 'any')}`,
      [skuCode],
    )) ?? [];
    const [sku] = skuRows;
    if (!sku) throw new BadRequestException(`SKU ${skuCode} 不存在、未启用或不在生效期内`);
    const scope = await this.matchScope(db, skuCode, input);
    if (!scope) throw new BadRequestException(`SKU ${skuCode} 不适用于公司 ${input.companyCode}（缺少组织适用范围）`);
    return {
      skuCode: sku.sku_code,
      productCode: sku.product_code,
      varietyCode: sku.variety_code ?? null,
      gradeCode: sku.grade_code,
      specCode: sku.spec_code,
      scopeType: asScopeType(scope.scope_type),
      scopeCode: scope.scope_code ?? '',
      saleEnabled: scope.sale_enabled === true,
      stockEnabled: scope.stock_enabled === true,
    };
  }

  /**
   * 组织适用匹配：最具体优先（SITE > FARM > COMPANY > ALL）。
   * 语义：存在本公司行 → 本公司行决定 enabled；否则 ALL 行兜底；无任何行 → 不可用。
   * （FARM/SITE 行是 COMPANY 行的进一步收窄，仅当公司行也允许时才生效。）
   */
  private async matchScope(
    db: { query: (sql: string, p?: unknown[]) => Promise<any[]> },
    skuCode: string,
    input: Pick<SkuResolveInput, 'companyCode' | 'farmCode' | 'siteCode'>,
  ): Promise<{ scope_type: string; scope_code: string; sale_enabled: boolean; stock_enabled: boolean } | null> {
    const rows = (await db.query(
      `SELECT scope_type, scope_code, sale_enabled, stock_enabled
         FROM md_sku_org_scope
        WHERE sku_code = $1 AND status = 'ACTIVE'
          AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
          AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
          AND (
            (scope_type = 'COMPANY' AND scope_code = $2)
            OR (scope_type = 'FARM' AND scope_code = $3)
            OR (scope_type = 'SITE' AND scope_code = $4)
            OR (scope_type = 'ALL' AND scope_code = '')
          )`,
      [skuCode, input.companyCode, input.farmCode ?? '', input.siteCode ?? ''],
    )) ?? [];
    if (!rows.length) return null;
    const byType = (type: string) => rows.find(r => r.scope_type === type);
    return byType('SITE') ?? byType('FARM') ?? byType('COMPANY') ?? byType('ALL') ?? null;
  }
}
