import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { SkuPolicy, SkuUsage } from './sku-policy';

/** Fresh selections only. Historical reads must not use this fail-closed gate. */
export interface SkuResolveInput {
  companyCode: string;
  gradeCode: string;
  specCode?: string;
  varietyCode?: string | null;
  farmCode?: string | null;
  siteCode?: string | null;
  houseCode?: string | null;
  /** Required with houseCode: the egg business date, never inferred from today's flock. */
  eggDate?: string | null;
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

type Db = Pick<EntityManager, 'query'>;
type Context = Omit<SkuResolveInput, 'gradeCode' | 'specCode'>;
type Scope = { scope_type: 'COMPANY' | 'FARM' | 'SITE'; scope_code: string; sale_enabled: boolean; stock_enabled: boolean };
type ScopeRow = Scope & { status: string; effective_date: string | null; expire_date: string | null; today: string };
type SkuRow = {
  sku_code: string; product_code: string; variety_code: string | null; product_variety_code: string | null;
  grade_code: string; spec_code: string;
};

/**
 * COMPANY is mandatory; FARM/SITE are additional vetoes, never grants. ALL is
 * historical schema data, not an authorization fallback. Every decision row is
 * read FOR SHARE. For writes, pass the caller's transaction manager so locks live
 * through the inventory/sales write (a DataSource-only call cannot do that).
 */
@Injectable()
export class SkuAvailabilityService {
  constructor(private readonly ds: DataSource) {}

  private date(value: unknown, label: string): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${label} 必须为有效的 YYYY-MM-DD 日期`);
    }
    return value;
  }

  private async context(input: Context, db: Db): Promise<Context> {
    if (!input.companyCode?.trim() || input.companyCode !== input.companyCode.trim()) {
      throw new BadRequestException('必须显式提供有效 companyCode');
    }
    const [company] = await db.query(
      `SELECT org_code FROM sys_organizations
        WHERE org_type = 'COMPANY' AND status = 'ACTIVE'
          AND COALESCE(company_code, org_code) = $1 FOR SHARE`, [input.companyCode],
    );
    if (!company) throw new BadRequestException(`公司 ${input.companyCode} 不存在或已停用`);
    const result = { ...input };
    if (input.eggDate != null) result.eggDate = this.date(input.eggDate, 'eggDate');
    if (input.houseCode) {
      if (!input.eggDate) throw new BadRequestException('鸡舍推导必须提供 eggDate 业务日期');
      const rows = await db.query(
        `SELECT h.house_code, h.farm_code, f.company_code,
                ${OrgOwnershipService.FARM_SITE_SQL} AS site_code
           FROM brd_houses h
           JOIN ${OrgOwnershipService.FARM_TABLE} f ON f.farm_code = h.farm_code
          WHERE h.house_code = $1 AND h.status = 'ACTIVE' AND f.status = 'ACTIVE'
          FOR SHARE OF h, f`, [input.houseCode],
      );
      const house = rows[0];
      if (rows.length !== 1 || !house.farm_code || house.company_code !== input.companyCode
          || (input.farmCode && input.farmCode !== house.farm_code)
          || (input.siteCode && input.siteCode !== house.site_code)) {
        throw new BadRequestException('鸡舍与 company/farm/site 权威归属不一致或未启用');
      }
      result.farmCode = house.farm_code;
      result.siteCode = house.site_code || undefined;
    } else if (input.farmCode || input.siteCode) {
      const rows = await db.query(
        `SELECT f.farm_code, f.company_code, ${OrgOwnershipService.FARM_SITE_SQL} AS site_code
           FROM ${OrgOwnershipService.FARM_TABLE} f
          WHERE f.status = 'ACTIVE'
            AND (($1::text <> '' AND f.farm_code = $1)
              OR ($1::text = '' AND ${OrgOwnershipService.FARM_SITE_SQL} = $2))
          FOR SHARE OF f`, [input.farmCode ?? '', input.siteCode ?? ''],
      );
      const farm = rows[0];
      // Same site -> farm uniqueness rule as OrgOwnershipService; don't guess.
      if (rows.length !== 1 || farm.company_code !== input.companyCode
          || (input.siteCode && input.siteCode !== farm.site_code)) {
        throw new BadRequestException('farm/site 不属于指定公司、映射不唯一或未启用');
      }
      result.farmCode = farm.farm_code;
      result.siteCode = farm.site_code || undefined;
    }
    return result;
  }

  /** Full organization/date context is required; a bare house code is not provenance. */
  async resolveVarietiesByHouse(input: Context, mgr?: Db): Promise<string[]> {
    const db = mgr ?? this.ds;
    const context = await this.context(input, db);
    if (!context.houseCode) throw new BadRequestException('鸡舍推导必须提供 houseCode');
    return this.houseVarieties(context, db);
  }

  private async houseVarieties(input: Context, db: Db): Promise<string[]> {
    const eggDate = this.date(input.eggDate, 'eggDate');
    // Do not filter breed/status in SQL: doing so silently discards uncertain
    // overlapping flocks and can turn a mixed/unknown house into a single variety.
    const flocks = await db.query(
      `SELECT f.flock_no, f.farm_code, f.breed_code, f.status,
              f.placement_date::text AS placement_date, f.start_date::text AS start_date,
              f.elimination_date::text AS elimination_date
         FROM brd_flocks f WHERE f.house_code = $1 FOR SHARE OF f`, [input.houseCode],
    );
    const breeds = new Set<string>();
    for (const flock of flocks) {
      const placement = flock.placement_date == null ? null : this.date(flock.placement_date, '鸡群入栏日期');
      // The flock UI explicitly persists its entry date as start_date. Accept
      // that established field only when it does not contradict placement_date.
      const start = flock.start_date == null ? null : this.date(flock.start_date, '鸡群开始日期');
      if (placement && start && placement !== start) throw new BadRequestException('鸡群入栏日期 placement_date/start_date 不一致，无法确定来源');
      const placed = placement ?? start;
      const ended = flock.elimination_date == null ? null : this.date(flock.elimination_date, '鸡群退群日期');
      if (placed && ended && ended < placed) throw new BadRequestException('鸡群入栏/退群日期矛盾，无法确定来源');
      if ((placed && placed > eggDate) || (ended && ended < eggDate)) continue;
      // Date-only exit cannot establish whether this day's eggs precede exit.
      if (!placed || ended === eggDate || flock.farm_code !== input.farmCode
          || !['ACTIVE', 'LAYING', 'PEAK', 'DECLINING'].includes(flock.status)
          || typeof flock.breed_code !== 'string' || !flock.breed_code.trim()
          || flock.breed_code !== flock.breed_code.trim()) {
        throw new BadRequestException('鸡舍存在品种、归属或在栏日期不确定的鸡群，拒绝推导');
      }
      breeds.add(flock.breed_code);
    }
    if (!breeds.size) throw new BadRequestException('业务日期没有可确认的在产鸡群品种');
    const varieties = new Set<string>();
    for (const breed of [...breeds].sort()) {
      const dict = await db.query(
        `SELECT dict_code FROM sys_dict WHERE dict_type = 'BRD_BREED'
          AND dict_code = $1 AND status = 'ACTIVE' FOR SHARE`, [breed],
      );
      if (!dict.length) throw new BadRequestException(`鸡群品种 ${breed} 不存在或 BRD_BREED 未启用`);
      const mappings = await db.query(
        `SELECT variety_code FROM md_variety_breeds
          WHERE breed_code = $1 AND status = 'ACTIVE' FOR SHARE`, [breed],
      );
      if (!mappings.length) throw new BadRequestException(`鸡群品种 ${breed} 未映射有效品种`);
      for (const row of mappings) {
        await this.requireVariety(row.variety_code, eggDate, db);
        varieties.add(row.variety_code);
      }
    }
    if (varieties.size !== 1) throw new BadRequestException('鸡舍存在多个品种，无法确定单一来源，拒绝推导');
    return [...varieties];
  }

  private async requireVariety(code: unknown, businessDate: string | null | undefined, db: Db): Promise<void> {
    if (typeof code !== 'string' || !code.trim() || code !== code.trim()) {
      throw new BadRequestException('缺少有效品种，禁止回退全局无变体 SKU');
    }
    const [row] = await db.query(
      `SELECT variety_code FROM md_product_varieties
        WHERE variety_code = $1 AND status = 'ACTIVE'
          AND (effective_date IS NULL OR effective_date <= COALESCE($2::date, CURRENT_DATE))
          AND (expire_date IS NULL OR expire_date >= COALESCE($2::date, CURRENT_DATE))
        FOR SHARE`, [code, businessDate ?? null],
    );
    if (!row) throw new BadRequestException(`品种 ${code} 不存在、未启用或不在业务日期有效期内`);
  }

  private async varieties(input: Context, db: Db): Promise<string[]> {
    let varieties: string[] = [];
    if (input.houseCode) varieties = await this.houseVarieties(input, db);
    if (input.varietyCode != null) {
      await this.requireVariety(input.varietyCode, input.eggDate, db);
      // A mixed house cannot be made single-variety by an explicit override.
      if (input.houseCode && (varieties.length !== 1 || varieties[0] !== input.varietyCode)) {
        throw new BadRequestException('显式品种与鸡舍推导品种不一致');
      }
      varieties = [input.varietyCode];
    }
    if (!varieties.length) throw new BadRequestException('缺少有效品种，禁止回退全局无变体 SKU');
    return varieties;
  }

  /** Grade/spec + validated provenance -> exactly one SKU. */
  async resolve(input: SkuResolveInput, mgr?: Db): Promise<SkuResolveResult> {
    const db = mgr ?? this.ds;
    const usage = SkuPolicy.usage(input.usage ?? 'stock');
    const context = await this.context(input, db);
    const varieties = await this.varieties(context, db);
    const spec = input.specCode?.trim() || 'LOOSE';
    // Include either side so a SKU/product variety mismatch is rejected rather
    // than hidden by a join predicate. Lock every candidate and validate all.
    const candidates = await db.query(
      `SELECT s.sku_code, s.product_code, s.variety_code, s.grade_code, s.spec_code,
              p.variety_code AS product_variety_code
         FROM product_skus s JOIN mst_products p ON p.product_code = s.product_code
        WHERE s.grade_code = $1 AND s.spec_code = $2
          AND (p.variety_code = ANY($3::text[]) OR s.variety_code = ANY($3::text[]))
        ORDER BY s.sku_code FOR SHARE OF s, p`, [input.gradeCode, spec, varieties],
    );
    if (!candidates.length) {
      throw new BadRequestException(`等级 ${input.gradeCode}/${spec} 在品种 ${varieties.join('/')} 下没有可用 SKU`);
    }
    const resolved: SkuResolveResult[] = [];
    for (const sku of candidates) {
      await this.validateSku(sku, varieties, usage, db);
      const scope = await this.matchScope(db, sku.sku_code, context, usage);
      if (scope) resolved.push(this.result(sku, scope));
    }
    if (!resolved.length) throw new BadRequestException(`候选 SKU 均不适用于公司 ${input.companyCode}（无组织适用范围或用途被禁用）`);
    if (resolved.length > 1) throw new BadRequestException(`等级 ${input.gradeCode}/${spec} 匹配多个可用 SKU：${resolved.map(r => r.skuCode).join('、')}`);
    return resolved[0];
  }

  /** Explicit SKU selections obey the same provenance, parent and usage gates. */
  async assertUsable(skuCode: string, input: Context, mgr?: Db): Promise<SkuResolveResult> {
    const db = mgr ?? this.ds;
    skuCode = SkuPolicy.code(skuCode);
    const usage = SkuPolicy.usage(input.usage ?? 'stock');
    const context = await this.context(input, db);
    const varieties = await this.varieties(context, db);
    const [sku] = await db.query(
      `SELECT s.sku_code, s.product_code, s.variety_code, s.grade_code, s.spec_code,
              p.variety_code AS product_variety_code
         FROM product_skus s JOIN mst_products p ON p.product_code = s.product_code
        WHERE s.sku_code = $1 FOR SHARE OF s, p`, [skuCode],
    );
    if (!sku) throw new BadRequestException(`SKU ${skuCode} 不存在、未启用或不在生效期内`);
    await this.validateSku(sku, varieties, usage, db);
    const scope = await this.matchScope(db, skuCode, context, usage);
    if (!scope) throw new BadRequestException(`SKU ${skuCode} 不适用于公司 ${input.companyCode}（组织范围或用途被禁用）`);
    return this.result(sku, scope);
  }

  private async validateSku(sku: SkuRow, varieties: string[], usage: SkuUsage, db: Db): Promise<void> {
    if (!sku.variety_code || sku.variety_code !== sku.product_variety_code || !varieties.includes(sku.variety_code)) {
      throw new BadRequestException(`SKU ${sku.sku_code} 与产品品种不一致或不符合来源品种`);
    }
    // Also locks SKU, product, grade and spec; no unlocked EXISTS-only decisions.
    await SkuPolicy.requireUsable(db, sku.sku_code, usage);
  }

  private result(sku: SkuRow, scope: Scope): SkuResolveResult {
    return {
      skuCode: sku.sku_code, productCode: sku.product_code, varietyCode: sku.variety_code,
      gradeCode: sku.grade_code, specCode: sku.spec_code,
      scopeType: scope.scope_type, scopeCode: scope.scope_code,
      saleEnabled: scope.sale_enabled, stockEnabled: scope.stock_enabled,
    };
  }

  private async matchScope(db: Db, skuCode: string, input: Context, usage: SkuUsage): Promise<Scope | null> {
    // Read inactive/expired rows too: a more specific veto must not disappear.
    const rows: ScopeRow[] = await db.query(
      `SELECT scope_type, scope_code, sale_enabled, stock_enabled, status,
              effective_date::text AS effective_date, expire_date::text AS expire_date,
              CURRENT_DATE::text AS today
         FROM md_sku_org_scope WHERE sku_code = $1
          AND ((scope_type = 'COMPANY' AND scope_code = $2)
            OR (scope_type = 'FARM' AND scope_code = $3 AND $3 <> '')
            OR (scope_type = 'SITE' AND scope_code = $4 AND $4 <> ''))
         ORDER BY scope_type, scope_code FOR SHARE`,
      [skuCode, input.companyCode, input.farmCode ?? '', input.siteCode ?? ''],
    );
    const applicable = rows.filter(r => (r.scope_type === 'COMPANY' && r.scope_code === input.companyCode)
      || (r.scope_type === 'FARM' && !!input.farmCode && r.scope_code === input.farmCode)
      || (r.scope_type === 'SITE' && !!input.siteCode && r.scope_code === input.siteCode));
    if (!applicable.some(r => r.scope_type === 'COMPANY')) return null;
    if (applicable.some(r => r.status !== 'ACTIVE' || !r.today
        || (r.effective_date && r.effective_date > r.today) || (r.expire_date && r.expire_date < r.today)
        || ((usage === 'sale' || usage === 'sale-stock') && r.sale_enabled !== true)
        || ((usage === 'stock' || usage === 'sale-stock') && r.stock_enabled !== true))) return null;
    const selected = applicable.find(r => r.scope_type === 'SITE')
      ?? applicable.find(r => r.scope_type === 'FARM')
      ?? applicable.find(r => r.scope_type === 'COMPANY');
    if (!selected) return null;
    return { ...selected, sale_enabled: applicable.every(r => r.sale_enabled === true), stock_enabled: applicable.every(r => r.stock_enabled === true) };
  }
}
