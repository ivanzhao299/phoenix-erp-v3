import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export type SkuUsage = 'any' | 'sale' | 'stock' | 'sale-stock';

type CompanyScopeDecision = {
  scope_type: string; scope_code: string; status: string; sale_enabled: boolean; stock_enabled: boolean;
  effective_date: string | null; expire_date: string | null; today: string;
};

export const SKU_IDENTITY_FIELDS = ['product_code', 'grade_code', 'spec_code'] as const;

/** Shared SKU rules. Call locking methods only inside the caller's transaction. */
export class SkuPolicy {
  /** SQL for fresh selections only; historical reads deliberately do not use this predicate. */
  static usableSql(alias = 's', usage: SkuUsage = 'any'): string {
    const sale = usage === 'sale' || usage === 'sale-stock';
    const stock = usage === 'stock' || usage === 'sale-stock';
    return `${alias}.status='ACTIVE'
      AND (${alias}.effective_date IS NULL OR ${alias}.effective_date <= CURRENT_DATE)
      AND (${alias}.expire_date IS NULL OR ${alias}.expire_date >= CURRENT_DATE)
      AND EXISTS (SELECT 1 FROM mst_products p WHERE p.product_code=${alias}.product_code AND p.status='ACTIVE')
      AND EXISTS (SELECT 1 FROM product_grades g WHERE g.grade_code=${alias}.grade_code AND g.status='ACTIVE'${sale ? ' AND g.is_saleable=true' : ''}${stock ? ' AND g.is_storable=true' : ''})
      AND EXISTS (SELECT 1 FROM packaging_specs sp WHERE sp.spec_code=${alias}.spec_code AND sp.status='ACTIVE')`;
  }

  static usage(value?: string): SkuUsage {
    if (value === undefined || value === 'any') return 'any';
    if (value === 'sale' || value === 'stock' || value === 'sale-stock') return value;
    throw new BadRequestException('SKU usage 必须为 any / sale / stock / sale-stock');
  }

  static code(skuCode: unknown): string {
    if (typeof skuCode !== 'string' || !skuCode.trim() || skuCode !== skuCode.trim()) {
      throw new BadRequestException('skuCode 必须为非空且无首尾空格的 SKU 编码；历史兼容请省略该字段');
    }
    return skuCode;
  }

  /**
   * 可选 SKU 编码：undefined/null/空串/纯空格 视为"未提供"（物料/legacy 路径），
   * 返回 null；非空但含首尾空格仍走 code() 拒绝，防漂移护栏不放松。
   * 前端 JSON 里 "" 是"无值"的事实表示（mappedPickValue 的 `?? ""` 约定），
   * 与"字段缺省"必须等价对待，否则物料行永远进不了 legacy 兼容路径。
   */
  static optionalCode(skuCode: unknown): string | null {
    if (skuCode === undefined || skuCode === null) return null;
    if (typeof skuCode === 'string' && !skuCode.trim()) return null;
    return this.code(skuCode);
  }

  static async requireUsable(manager: Pick<EntityManager, 'query'>, skuCode: unknown, usage: SkuUsage = 'any', companyCode?: string) {
    skuCode = this.code(skuCode);
    usage = this.usage(usage);
    // Lock the SKU before reading its identity, then only its three parent rows.
    // Locks live until the caller's business transaction commits or rolls back.
    const [sku] = await manager.query(
      `SELECT *, effective_date::text AS effective_date, expire_date::text AS expire_date, CURRENT_DATE::text AS today
         FROM product_skus WHERE sku_code=$1 FOR SHARE`, [skuCode],
    );
    if (!sku || sku.status !== 'ACTIVE'
        || (sku.effective_date && sku.effective_date > sku.today)
        || (sku.expire_date && sku.expire_date < sku.today)) throw new BadRequestException(`SKU ${skuCode} 不存在、未启用或不在生效期内`);
    // Phase-4 sales/POS/procurement callers have no organization-aware resolver
    // yet. Fail closed for new variant SKUs instead of granting global use.
    const organizationRequired = sku.variety_code != null || sku.org_context_required === true;
    if (organizationRequired) {
      if (typeof companyCode !== 'string' || !companyCode.trim() || companyCode !== companyCode.trim()) {
        throw new BadRequestException('新 SKU 需公司适用范围接口，禁止无公司上下文的新业务');
      }
      const companies = await manager.query(
        `SELECT org_code FROM sys_organizations WHERE org_type = 'COMPANY' AND status = 'ACTIVE'
          AND COALESCE(company_code, org_code) = $1 FOR SHARE`, [companyCode],
      );
      if (!companies.length) throw new BadRequestException(`公司 ${companyCode} 不存在或已停用`);
      const scopes: CompanyScopeDecision[] = await manager.query(
        `SELECT scope_type, scope_code, status, sale_enabled, stock_enabled,
                effective_date::text AS effective_date, expire_date::text AS expire_date,
                CURRENT_DATE::text AS today
           FROM md_sku_org_scope WHERE sku_code = $1 AND scope_type = 'COMPANY' AND scope_code = $2
           FOR SHARE`, [skuCode, companyCode],
      );
      const companyScopes = scopes.filter(row => row.scope_type === 'COMPANY' && row.scope_code === companyCode);
      if (companyScopes.length !== 1 || companyScopes.some(row => row.status !== 'ACTIVE' || !row.today
          || (row.effective_date && row.effective_date > row.today) || (row.expire_date && row.expire_date < row.today)
          || ((usage === 'sale' || usage === 'sale-stock') && row.sale_enabled !== true)
          || ((usage === 'stock' || usage === 'sale-stock') && row.stock_enabled !== true))) {
        throw new BadRequestException(`SKU ${skuCode} 不适用于公司 ${companyCode}（无有效 COMPANY 适用范围或用途被禁用）`);
      }
    }
    for (const [table, key] of [['mst_products', 'product_code'], ['product_grades', 'grade_code'], ['packaging_specs', 'spec_code']]) {
      const [parent] = await manager.query(`SELECT * FROM ${table} WHERE ${key}=$1 FOR SHARE`, [sku[key]]);
      if (!parent || parent.status !== 'ACTIVE') throw new BadRequestException(`SKU ${skuCode} 的 ${key} 不存在或未启用`);
      if (key === 'product_code' && ((organizationRequired && (sku.variety_code === undefined || parent.variety_code === undefined))
        || (sku.variety_code !== undefined && parent.variety_code !== undefined && sku.variety_code !== parent.variety_code))) {
        throw new BadRequestException(`SKU ${skuCode} 与父产品商业品种不一致或主档不明确`);
      }
      if (key === 'spec_code') sku.base_unit = parent.base_unit;
      if (key === 'grade_code') {
        if ((usage === 'sale' || usage === 'sale-stock') && parent.is_saleable !== true) throw new BadRequestException(`SKU ${skuCode} 等级不可销售`);
        if ((usage === 'stock' || usage === 'sale-stock') && parent.is_storable !== true) throw new BadRequestException(`SKU ${skuCode} 等级不可库存`);
      }
    }
    if (sku.variety_code != null) {
      const varieties = await manager.query(`SELECT variety_code,status,
        effective_date::text AS effective_date,expire_date::text AS expire_date
        FROM md_product_varieties WHERE variety_code=$1 FOR SHARE`, [sku.variety_code]);
      if (varieties.length !== 1 || varieties[0].variety_code !== sku.variety_code || varieties[0].status !== 'ACTIVE'
        || (varieties[0].effective_date && varieties[0].effective_date > sku.today)
        || (varieties[0].expire_date && varieties[0].expire_date < sku.today)) {
        throw new BadRequestException(`SKU ${skuCode} 的商业品种不存在、未启用或不在生效期内`);
      }
    }
    return sku;
  }

  static async lockForUpdate(manager: EntityManager, skuCode: string) {
    try {
      const [sku] = await manager.query('SELECT * FROM product_skus WHERE sku_code=$1 FOR UPDATE NOWAIT', [skuCode]);
      if (!sku) throw new NotFoundException(`SKU ${skuCode} not found`);
      return sku;
    } catch (error) {
      if ((error as { code?: string }).code === '55P03') {
        throw new ConflictException('SKU 正在被业务使用，修改未保存，请稍后重试');
      }
      throw error;
    }
  }

  static async assertIdentityChange(manager: EntityManager, before: Record<string, unknown>, changes: Record<string, unknown>) {
    if (changes.sku_code !== undefined && changes.sku_code !== before.sku_code) {
      throw new BadRequestException('SKU 编码不可修改');
    }
    const changed = SKU_IDENTITY_FIELDS.filter(key => changes[key] !== undefined && changes[key] !== before[key]);
    if (!changed.length) return;
    for (const key of changed) {
      if (typeof changes[key] !== 'string' || !(changes[key] as string).trim()) {
        throw new BadRequestException(`${key} 必须为非空编码`);
      }
    }

    await this.assertUnreferenced(manager, before);
  }

  static async assertUnreferenced(manager: EntityManager, before: Record<string, unknown>) {
    await manager.query(`SET LOCAL statement_timeout = '2s'`);

    // Discover actual base-table columns, including legacy item_code aliases and packaging JSON.
    // Unlike the UI reference summary, any metadata/lock/probe failure aborts the edit.
    const columns: Array<{ table_name: string; column_name: string; data_type: string }> = await manager.query(`
      SELECT c.table_name, c.column_name, c.data_type
        FROM information_schema.columns c
        JOIN information_schema.tables t USING (table_catalog, table_schema, table_name)
       WHERE c.table_schema=current_schema() AND t.table_type='BASE TABLE'
         AND c.table_name <> 'product_skus'
         AND (c.column_name IN ('sku_code','item_code')
           OR (LEFT(c.table_name,4)='wms_' AND c.column_name='item')
           OR ((LEFT(c.table_name,4)='pkg_' OR c.column_name='quantity_snapshot') AND c.data_type IN ('json','jsonb')))
       ORDER BY c.table_name,c.column_name`);
    for (const required of ['sal_order_items', 'sal_price_items', 'inv_batches', 'inv_ledger']) {
      if (!columns.some(c => c.table_name === required && c.column_name === 'sku_code')) {
        throw new ConflictException(`无法完整核验 SKU 引用：缺少 ${required}.sku_code`);
      }
    }
    const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const tables = [...new Set(columns.map(c => c.table_name))];
    const probe = async (deadline?: number) => {
      for (const table of tables) {
        if (deadline !== undefined && Date.now() > deadline) {
          throw new ConflictException('SKU 引用核验超时，身份变更未保存，请稍后重试');
        }
        const predicates = columns.filter(c => c.table_name === table).map(c => {
          const column = quote(c.column_name);
          return ['json', 'jsonb'].includes(c.data_type)
            ? `jsonb_path_exists(${column}::jsonb, '$.**.skuCode ? (@ == $sku)', jsonb_build_object('sku',to_jsonb($1::text)))
               OR jsonb_path_exists(${column}::jsonb, '$.**.sku_code ? (@ == $sku)', jsonb_build_object('sku',to_jsonb($1::text)))`
            : `${column}::text=$1`;
        });
        const rows = await manager.query(`SELECT 1 FROM ${quote(table)} WHERE ${predicates.join(' OR ')} LIMIT 1`, [before.sku_code]);
        if (rows.length) throw new ConflictException(`SKU ${before.sku_code} 已被 ${table} 引用，不可修改产品、等级或规格；请新建 SKU`);
      }
    };
    // The usual referenced case needs no business-table locks. Only an unreferenced
    // identity edit takes short-lived locks and probes again to close the insert race.
    await probe();
    try {
      await manager.query(`LOCK TABLE ${tables.map(quote).join(',')} IN SHARE MODE NOWAIT`);
    } catch (error) {
      if ((error as { code?: string }).code === '55P03') {
        throw new ConflictException('SKU 引用表正在处理业务，身份变更未保存，请稍后重试');
      }
      throw error;
    }
    await probe(Date.now() + 2000);
  }
}
