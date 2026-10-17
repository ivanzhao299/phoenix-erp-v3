import { DAILY_EXPORT_SNAPSHOT, DAILY_EXPORT_MAX_ROWS } from './daily-export-policy';
import { Injectable, BadRequestException, ForbiddenException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { BREEDING_FARMS_TABLE, BreedingScopedTable } from './crud.constants';
import { OrgOwnershipService } from '../org/services/org-ownership.service';
import { schemaMismatch } from '../../common/database/schema-compatibility';
import { redactSensitive } from '../../common/logging/redact-sensitive';

@Injectable()
export class GenericCrudService {
  private static readonly RETIRED_COLUMNS: Readonly<Record<string, ReadonlySet<string>>> = {
    brd_houses: new Set(['company_code', 'site_code', 'store_code']),
  };
  private static readonly CRUD_ROUTE_ID_ALIAS: Record<string, string> = {
    wms_locations: 'location_code',
    wms_zones: 'zone_code',
  };

  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  private readonly logger = new Logger(GenericCrudService.name);

  private rejectSchemaMismatch(error: unknown, table: string): void {
    const e = error as { code?: string; driverError?: { code?: string }; message?: string };
    if (!['42703', '42P01'].includes(e.code || e.driverError?.code || '')) return;
    const column = e.code === '42P01' || e.driverError?.code === '42P01'
      ? undefined : e.message?.match(/column "([A-Za-z0-9_]+)"/)?.[1];
    this.logger.error(`SCHEMA_MISMATCH table=${table}${column ? ` column=${column}` : ''}`);
    throw schemaMismatch(table, column);
  }

  private assertColumnsAllowed(table: string, columns: Iterable<string>): void {
    const retired = GenericCrudService.RETIRED_COLUMNS[table];
    if (!retired) return;
    const hit = Array.from(columns).find((column) => retired.has(column));
    if (hit) {
      throw new BadRequestException(`列 ${table}.${hit} 已永久退役，禁止查询、写入或自动补列`);
    }
  }

  private async validateFarmSiteMapping(body: Record<string, any>): Promise<void> {
    const mappedSiteCode = typeof body.mapped_site_code === 'string'
      ? body.mapped_site_code.trim()
      : body.mapped_site_code;
    body.mapped_site_code = mappedSiteCode || null; // NULL is the explicit UNMAPPED marker.
    if (!mappedSiteCode) return;
    const rows: Array<{ company_code: string | null }> = await this.entityManager.query(
      `SELECT COALESCE(NULLIF(site.company_code, ''), NULLIF(parent.company_code, ''),
                       CASE WHEN parent.org_type = 'COMPANY' THEN parent.org_code END) AS company_code
         FROM sys_organizations site
         LEFT JOIN sys_organizations parent ON parent.id = site.parent_id
        WHERE site.org_code = $1
          AND site.org_type = 'SITE'
          AND site.status = 'ACTIVE'
        LIMIT 1`,
      [mappedSiteCode],
    );
    if (rows.length !== 1) {
      throw new BadRequestException(`mapped_site_code ${mappedSiteCode} 未指向 ACTIVE SITE`);
    }
    const companyCode = typeof body.company_code === 'string' ? body.company_code.trim() : body.company_code;
    if (!companyCode || rows[0].company_code !== companyCode) {
      throw new BadRequestException(
        `农场公司 ${companyCode || '<EMPTY>'} 与 SITE ${mappedSiteCode} 所属公司 ${rows[0].company_code || '<EMPTY>'} 不一致`,
      );
    }
  }



  async findAll(table: string, query: any) {
    if (['pkg_packing_boxes','pkg_packing_code_registry','pkg_packing_code_claims','pkg_packing_events','pkg_packing_operations'].includes(table)) throw new ForbiddenException('包装证据必须使用专用范围查询');
    const { sql, queryValues } = this.buildFindAllSql(table, query);

    try {
      const rows = await this.entityManager.query(sql, queryValues);
      if (table === 'brd_daily_logs') {
        return await this.enrichDailyLogRows(rows);
      }
      return this.withCrudRouteIdAlias(table, rows);
    } catch (e) {
      this.rejectSchemaMismatch(e, table);
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  async assertOperationalWarehouseCodes(codes: unknown[]): Promise<void> {
    const normalized = [...new Set(codes.map((code) => String(code ?? '').trim()).filter(Boolean))];
    if (normalized.length === 0) return;
    const blocked: Array<{ warehouse_code: string }> = await this.entityManager.query(`
      SELECT warehouse_code FROM wms_warehouses
      WHERE warehouse_code = ANY($1) AND domain <> 'OPERATIONAL'
    `, [normalized]);
    if (blocked.length > 0) {
      throw new ForbiddenException(
        `非操作仓禁止仓储操作：${blocked.map((row) => row.warehouse_code).join('、')}`,
      );
    }
  }

  private withCrudRouteIdAlias(table: string, rows: any[]): any[] {
    const aliasColumn = GenericCrudService.CRUD_ROUTE_ID_ALIAS[table];
    if (!aliasColumn || !Array.isArray(rows)) return rows;

    return rows.map((row) => {
      if (!row || typeof row !== 'object' || row[aliasColumn] === undefined || row[aliasColumn] === null) {
        return row;
      }
      return { ...row, id: row[aliasColumn] };
    });
  }

  private extractRows(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw) && raw.length === 2 && Array.isArray(raw[0]) && typeof raw[1] === 'number') {
      return raw[0];
    }
    if (Array.isArray(raw)) return raw;
    return [];
  }

  private async enrichDailyLogRows(rows: any[]): Promise<any[]> {
    if (!Array.isArray(rows) || rows.length === 0) return rows;

    const normalizedRows = rows.map((row) => this.normalizeDailyLogDateFields(row));

    const reasonTypes: Array<{ field: 'culling_reason' | 'mortality_reason'; dictType: string }> = [
      { field: 'culling_reason', dictType: 'BRD_CULLING_REASON' },
      { field: 'mortality_reason', dictType: 'BRD_MORTALITY_REASON' },
    ];
    const codesByType = new Map<string, Set<string>>();

    for (const row of normalizedRows) {
      for (const { field, dictType } of reasonTypes) {
        for (const token of this.splitReasonTokens(row?.[field])) {
          if (!codesByType.has(dictType)) codesByType.set(dictType, new Set());
          codesByType.get(dictType)!.add(token);
        }
      }
    }

    const dictParams: unknown[] = [];
    const whereParts: string[] = [];
    for (const [dictType, codes] of codesByType.entries()) {
      if (codes.size === 0) continue;
      dictParams.push(dictType, Array.from(codes));
      const typeIdx = dictParams.length - 1;
      const codesIdx = dictParams.length;
      whereParts.push(`(dict_type = $${typeIdx} AND dict_code = ANY($${codesIdx}))`);
    }
    if (whereParts.length === 0) return normalizedRows;

    const dictRows: Array<{
      dict_type: string;
      dict_code: string;
      label: string | null;
    }> = await this.entityManager.query(
      `SELECT dict_type, dict_code, COALESCE(dict_label_zh, name, dict_code) AS label
         FROM sys_dict
        WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
          AND (${whereParts.join(' OR ')})`,
      dictParams,
    );
    if (dictRows.length === 0) return normalizedRows;

    const labelByTypeAndCode = new Map<string, string>();
    for (const dict of dictRows) {
      if (dict.label) labelByTypeAndCode.set(`${dict.dict_type}:${dict.dict_code}`, dict.label);
    }

    return normalizedRows.map((row) => {
      const next = { ...row };
      for (const { field, dictType } of reasonTypes) {
        const original = row?.[field];
        if (typeof original !== 'string' || original.trim() === '') continue;
        next[`${field}_code`] = original;
        next[field] = this.translateReasonValue(original, dictType, labelByTypeAndCode);
      }
      return next;
    });
  }

  private normalizeDailyLogDateFields(row: any): any {
    if (!row || typeof row !== 'object') return row;
    const next = { ...row };
    if (Object.prototype.hasOwnProperty.call(next, 'log_date')) {
      next.log_date = this.toDateOnly(next.log_date);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'business_date')) {
      next.business_date = this.toDateOnly(next.business_date);
    }
    return next;
  }

  private toDateOnly(value: unknown): unknown {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      // PostgreSQL DATE is parsed as local midnight: UTC conversion can shift the day.
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    return value;
  }

  private splitReasonTokens(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    return value
      .split(/[；;,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private translateReasonValue(value: string, dictType: string, labels: Map<string, string>): string {
    return this.splitReasonTokens(value)
      .map((token) => labels.get(`${dictType}:${token}`) ?? token)
      .join('；');
  }

  async findAllInventoryScoped(table: 'inv_batches' | 'inv_ledger', query: any, allowedWarehouseCodes: string[] | null) {
    const extraWhere: string[] = [];
    const extraValues: unknown[] = [];

    if (allowedWarehouseCodes !== null) {
      if (allowedWarehouseCodes.length === 0) {
        extraWhere.push('1=0');
      } else if (table === 'inv_batches') {
        extraWhere.push(`"warehouse_code" = ANY($${this.nextParamIndex(query, extraValues.length)})`);
        extraValues.push(allowedWarehouseCodes);
      } else {
        const idx = this.nextParamIndex(query, extraValues.length);
        extraWhere.push(`(
          "warehouse_code" = ANY($${idx})
          OR EXISTS (
            SELECT 1 FROM "inv_batches" b
            WHERE b."batch_no" = "${table}"."batch_no"
              AND b."warehouse_code" = ANY($${idx})
          )
        )`);
        extraValues.push(allowedWarehouseCodes);
      }
    }

    const { sql, queryValues } = this.buildFindAllSql(table, query, extraWhere, extraValues);

    try {
      const rows = await this.entityManager.query(sql, queryValues);
      return rows;
    } catch (e) {
      this.rejectSchemaMismatch(e, table);
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  async findAllBreedingScoped(
    table: BreedingScopedTable,
    query: any,
    scope: { farmCodes: string[]; siteCodes: string[]; companyCodes: string[] } | null,
  ) {
    const extraWhere: string[] = [];
    const extraValues: unknown[] = [];
    if (scope !== null) {
      const ors: string[] = [];
      const siteColumn = table === BREEDING_FARMS_TABLE ? 'mapped_site_code' : 'site_code';
      if (scope.farmCodes.length > 0) {
        ors.push(`"farm_code" = ANY($${this.nextParamIndex(query, extraValues.length)})`);
        extraValues.push(scope.farmCodes);
      }
      if (scope.siteCodes.length > 0) {
        const idx = this.nextParamIndex(query, extraValues.length);
        ors.push(table === BREEDING_FARMS_TABLE
          ? `"${siteColumn}" = ANY($${idx})`
          : OrgOwnershipService.farmScopePredicate(table, 'site', `$${idx}`));
        extraValues.push(scope.siteCodes);
      }
      if (scope.companyCodes.length > 0) {
        const idx = this.nextParamIndex(query, extraValues.length);
        ors.push(table === BREEDING_FARMS_TABLE
          ? `"company_code" = ANY($${idx})`
          : OrgOwnershipService.farmScopePredicate(table, 'company', `$${idx}`));
        extraValues.push(scope.companyCodes);
      }
      extraWhere.push(ors.length > 0 ? `(${ors.join(' OR ')})` : '1=0');
    }

    const { sql, queryValues } = this.buildFindAllSql(table, query, extraWhere, extraValues);
    try {
      return await this.entityManager.query(sql, queryValues);
    } catch (e) {
      this.rejectSchemaMismatch(e, table);
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  private nextParamIndex(query: any, extraValueCount: number): number {
    let idx = 1;
    for (const [key] of Object.entries(query)) {
      if (this.isControlQueryParam(key)) continue;
      if (key.endsWith('__like')) {
        const col = key.slice(0, -6);
        if (/^[a-zA-Z0-9_]+$/.test(col)) idx++;
        continue;
      }
      if (/^[a-zA-Z0-9_]+$/.test(key)) idx++;
    }
    return idx + extraValueCount;
  }

  private isControlQueryParam(key: string): boolean {
    return ['limit', 'offset', 'page', 'pageSize', 'pageNumber', 'pageNo', 'size', 'sortBy', 'sortDesc', 'orderBy', 'orderDir', '_t', '_'].includes(key);
  }

  private buildFindAllSql(table: string, query: any, extraWhere: string[] = [], extraValues: unknown[] = []) {
    const exportSnapshot = table === 'brd_daily_logs' && query[DAILY_EXPORT_SNAPSHOT] === true;
    const limit = exportSnapshot ? DAILY_EXPORT_MAX_ROWS + 1 : Math.min(Math.max(Number(query.limit) || 100, 1), 1000);
    const offset = exportSnapshot ? 0 : Math.max(Number(query.offset) || 0, 0);

    const whereClauses = [];
    if (['pkg_work_shifts','pkg_source_batches','pkg_grading_records','pkg_packing_records'].includes(table)) whereClauses.push('is_test = false');
    if (table === 'pkg_handover_records') whereClauses.push(`NOT EXISTS (SELECT 1 FROM pkg_packing_records p WHERE p.code=pkg_handover_records.packing_code AND p.is_test)`);
    const queryValues = [];
    let paramIndex = 1;

    // Warehouse master-data CRUD is an operational surface. Finance mapping
    // warehouses remain queryable through the dedicated Chanjet chain only.
    if (table === 'wms_warehouses') {
      whereClauses.push(`"domain" = 'OPERATIONAL'`);
    } else if (table === 'wms_zones' || table === 'wms_locations') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM wms_warehouses operational_warehouse
        WHERE operational_warehouse.warehouse_code = "${table}"."warehouse_code"
          AND operational_warehouse.domain = 'OPERATIONAL'
      )`);
    }

    const SAFE_KEY = /^[a-zA-Z0-9_]+$/;
    for (const [key, val] of Object.entries(query)) {
      // 分页/排序/反缓存类 query param 不参与 WHERE 拼接
      // pageSize / pageNumber 等是前端 selectors（HouseSelector 等）的约定，
      // 漏过滤会被当列名拼到 SQL 抛 "column does not exist" 500 — 此前导致 brd_houses 下拉全空。
      if (this.isControlQueryParam(key)) continue;
      // Support LIKE prefix filter: key ending with __like → column = key minus suffix, value used as-is
      if (key.endsWith('__like')) {
        const col = key.slice(0, -6);
        if (!SAFE_KEY.test(col)) continue;
        this.assertColumnsAllowed(table, [col]);
        whereClauses.push(`"${col}" LIKE $${paramIndex}`);
        queryValues.push(val);
        paramIndex++;
        continue;
      }
      if (!SAFE_KEY.test(key)) continue;
      this.assertColumnsAllowed(table, [key]);
      if (Array.isArray(val)) {
        if (val.length === 0) {
          whereClauses.push('1=0');
          continue;
        }
        whereClauses.push(`"${key}" = ANY($${paramIndex})`);
        queryValues.push(val);
        paramIndex++;
        continue;
      }
      whereClauses.push(`"${key}" = $${paramIndex}`);
      queryValues.push(val);
      paramIndex++;
    }
    for (const where of extraWhere) {
      whereClauses.push(where);
    }
    queryValues.push(...extraValues);
    paramIndex += extraValues.length;

    // Read-only name expansion is deliberately table-scoped.  Never infer JOINs
    // from a column suffix: unrelated CRUD tables frequently reuse *_code.
    const localizedReadSource: Record<string, string> = {
      wms_locations: `(SELECT base.*,
        wh.warehouse_name, wh.warehouse_name_zh, wh.warehouse_name_en, wh.warehouse_name_lo,
        zone.zone_name, store.store_name, store.store_name_en, store.store_name_lo
        FROM wms_locations base
        LEFT JOIN wms_warehouses wh ON wh.warehouse_code = base.warehouse_code
        LEFT JOIN wms_zones zone ON zone.zone_code = base.zone_code AND zone.warehouse_code = base.warehouse_code
        LEFT JOIN mst_stores store ON store.store_code = base.store_code) AS "wms_locations"`,
      inv_batches: `(SELECT base.*,
        wh.warehouse_name, wh.warehouse_name_zh, wh.warehouse_name_en, wh.warehouse_name_lo,
        loc.location_name, store.store_name, store.store_name_en, store.store_name_lo,
        sku.sku_name, sku.sku_name_en, sku.sku_name_lo,
        mat.material_name, mat.material_name_en, mat.material_name_lo,
        prod.product_name, prod.product_name_zh, prod.product_name_en, prod.product_name_lo
        FROM inv_batches base
        LEFT JOIN wms_warehouses wh ON wh.warehouse_code = base.warehouse_code
        LEFT JOIN wms_locations loc ON loc.location_code = base.location_code
        LEFT JOIN mst_stores store ON store.store_code = base.store_code
        LEFT JOIN product_skus sku ON sku.sku_code = base.sku_code
        LEFT JOIN mst_materials mat ON base.material_code IS NOT NULL AND mat.material_code = base.material_code
        LEFT JOIN mst_products prod ON base.product_code IS NOT NULL AND prod.product_code = base.product_code) AS "inv_batches"`,
      wms_inbound: `(SELECT base.*,
        wh.warehouse_name, wh.warehouse_name_zh, wh.warehouse_name_en, wh.warehouse_name_lo,
        COALESCE(mat.material_name, sku.sku_name, prod.product_name_zh, prod.product_name, to_jsonb(base)->>'item_name') AS item_name,
        COALESCE(mat.material_name_en, sku.sku_name_en, prod.product_name_en) AS item_name_en,
        COALESCE(mat.material_name_lo, sku.sku_name_lo, prod.product_name_lo) AS item_name_lo,
        op.real_name AS operator_name
        FROM wms_inbound base
        LEFT JOIN wms_warehouses wh ON wh.warehouse_code = base.warehouse_code
        LEFT JOIN mst_materials mat ON to_jsonb(base)->>'item_type' = 'MATERIAL' AND mat.material_code = COALESCE(to_jsonb(base)->>'material_code', base.item)
        LEFT JOIN product_skus sku ON to_jsonb(base)->>'item_type' = 'SKU' AND sku.sku_code = COALESCE(to_jsonb(base)->>'sku_code', base.item)
        LEFT JOIN mst_products prod ON prod.product_code = to_jsonb(base)->>'product_code'
        LEFT JOIN sys_user op ON op.username = base.operator) AS "wms_inbound"`,
      wms_outbound: `(SELECT base.*,
        wh.warehouse_name, wh.warehouse_name_zh, wh.warehouse_name_en, wh.warehouse_name_lo,
        COALESCE(mat.material_name, sku.sku_name, prod.product_name_zh, prod.product_name, to_jsonb(base)->>'item_name') AS item_name,
        COALESCE(mat.material_name_en, sku.sku_name_en, prod.product_name_en) AS item_name_en,
        COALESCE(mat.material_name_lo, sku.sku_name_lo, prod.product_name_lo) AS item_name_lo,
        op.real_name AS operator_name, pick.real_name AS picker_name,
        COALESCE(base.destination_code, base.destination_house_code, base.destination_customer_code,
          base.destination_warehouse_code, base.destination_store_code, base.department_code,
          base.project_code, base.receiver_username) AS destination_display_code,
        CASE base.destination_type
          WHEN 'HOUSE' THEN house.house_name WHEN 'CUSTOMER' THEN customer.customer_name
          WHEN 'WAREHOUSE' THEN dwh.warehouse_name_zh WHEN 'STORE' THEN dest_store.store_name
          WHEN 'DEPARTMENT' THEN dept.org_name WHEN 'PROJECT' THEN project.project_name
          WHEN 'EMPLOYEE' THEN receiver.real_name WHEN 'SUPPLIER' THEN supplier.supplier_name
          WHEN 'OTHER' THEN base.destination_code END AS destination_name,
        CASE WHEN base.destination_type = 'WAREHOUSE' THEN dwh.warehouse_name_en
             WHEN base.destination_type = 'STORE' THEN dest_store.store_name_en END AS destination_name_en,
        CASE WHEN base.destination_type = 'WAREHOUSE' THEN dwh.warehouse_name_lo
             WHEN base.destination_type = 'STORE' THEN dest_store.store_name_lo END AS destination_name_lo
        FROM wms_outbound base
        LEFT JOIN wms_warehouses wh ON wh.warehouse_code = base.warehouse_code
        LEFT JOIN mst_materials mat ON to_jsonb(base)->>'item_type' = 'MATERIAL' AND mat.material_code = COALESCE(to_jsonb(base)->>'material_code', base.item)
        LEFT JOIN product_skus sku ON to_jsonb(base)->>'item_type' = 'SKU' AND sku.sku_code = COALESCE(to_jsonb(base)->>'sku_code', base.item)
        LEFT JOIN mst_products prod ON prod.product_code = to_jsonb(base)->>'product_code'
        LEFT JOIN sys_user op ON op.username = base.operator
        LEFT JOIN sys_user pick ON pick.username = base.picker
        LEFT JOIN brd_houses house ON base.destination_type = 'HOUSE' AND house.house_code = COALESCE(base.destination_code, base.destination_house_code)
        LEFT JOIN sal_customers customer ON base.destination_type = 'CUSTOMER' AND customer.customer_no = COALESCE(base.destination_code, base.destination_customer_code)
        LEFT JOIN wms_warehouses dwh ON base.destination_type = 'WAREHOUSE' AND dwh.warehouse_code = COALESCE(base.destination_code, base.destination_warehouse_code)
        LEFT JOIN mst_stores dest_store ON base.destination_type = 'STORE' AND dest_store.store_code = COALESCE(base.destination_code, base.destination_store_code)
        LEFT JOIN sys_organizations dept ON base.destination_type = 'DEPARTMENT' AND dept.org_type = 'DEPARTMENT' AND dept.org_code = COALESCE(base.destination_code, base.department_code)
        LEFT JOIN biz_projects project ON base.destination_type = 'PROJECT' AND project.project_code = COALESCE(base.destination_code, base.project_code)
        LEFT JOIN sys_user receiver ON base.destination_type = 'EMPLOYEE' AND receiver.username = COALESCE(base.destination_code, base.receiver_username)
        LEFT JOIN prc2_suppliers supplier ON base.destination_type = 'SUPPLIER' AND supplier.supplier_code = base.destination_code) AS "wms_outbound"`,
      wms_transfer: `(SELECT base.*,
        fw.warehouse_name AS from_warehouse_name, fw.warehouse_name_zh AS from_warehouse_name_zh,
        fw.warehouse_name_en AS from_warehouse_name_en, fw.warehouse_name_lo AS from_warehouse_name_lo,
        tw.warehouse_name AS to_warehouse_name, tw.warehouse_name_zh AS to_warehouse_name_zh,
        tw.warehouse_name_en AS to_warehouse_name_en, tw.warehouse_name_lo AS to_warehouse_name_lo,
        op.real_name AS operator_name
        FROM wms_transfer base
        LEFT JOIN wms_warehouses fw ON fw.warehouse_code = base.from_warehouse
        LEFT JOIN wms_warehouses tw ON tw.warehouse_code = base.to_warehouse
        LEFT JOIN sys_user op ON op.username = base.operator) AS "wms_transfer"`,
      wms_stocktake: `(SELECT base.*,
        wh.warehouse_name, wh.warehouse_name_zh, wh.warehouse_name_en, wh.warehouse_name_lo,
        COALESCE(mat.material_name, sku.sku_name, prod.product_name_zh, prod.product_name) AS item_name,
        COALESCE(mat.material_name_en, sku.sku_name_en, prod.product_name_en) AS item_name_en,
        COALESCE(mat.material_name_lo, sku.sku_name_lo, prod.product_name_lo) AS item_name_lo,
        op.real_name AS operator_name, auditor.real_name AS auditor_name
        FROM wms_stocktake base
        LEFT JOIN wms_warehouses wh ON wh.warehouse_code = base.warehouse_code
        LEFT JOIN mst_materials mat ON mat.material_code = base.item
        LEFT JOIN product_skus sku ON sku.sku_code = base.item
        LEFT JOIN mst_products prod ON prod.product_code = base.item
        LEFT JOIN sys_user op ON op.username = base.operator
        LEFT JOIN sys_user auditor ON auditor.username = base.auditor) AS "wms_stocktake"`,
      inv_ledger: `(SELECT base.*, op.real_name AS operator_name,
        store.store_name, store.store_name_en, store.store_name_lo
        FROM inv_ledger base
        LEFT JOIN sys_user op ON op.username = base.operator
        LEFT JOIN mst_stores store ON store.store_code = base.store_code) AS "inv_ledger"`,
    };
    let sql = `SELECT * FROM ${localizedReadSource[table] ?? `"${table}"`}`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    // The legacy breeding daily page reverses this list before rendering.
    // Select the newest page first, then return that page oldest-first so the
    // client reversal remains correct even when total rows exceed the limit.
    if (table === 'brd_daily_logs') {
      sql = `SELECT * FROM (${sql} ORDER BY "log_date" DESC, "created_at" DESC NULLS LAST, "id" DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}) AS "daily_logs_page" ORDER BY "log_date" ASC, "created_at" ASC NULLS FIRST, "id" ASC`;
    } else {
      const stableDefaultOrder: Record<string, string> = {
        inv_batches: '"inbound_date" DESC NULLS LAST, "batch_no" DESC, "id" DESC',
        inv_ledger: '"created_at" DESC, "id" DESC',
        wms_inbound: '"created_at" DESC, "id" DESC',
        wms_outbound: '"created_at" DESC, "id" DESC',
        wms_transfer: '"created_at" DESC, "id" DESC',
        wms_stocktake: '"created_at" DESC, "id" DESC',
        wms_loss: '"created_at" DESC, "id" DESC',
      };
      const orderBy = stableDefaultOrder[table];
      if (orderBy) sql += ` ORDER BY ${orderBy}`;
      sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    }
    queryValues.push(limit, offset);

    return { sql, queryValues };
  }

  async create(table: string, body: any) {
    if (['pkg_work_shifts','pkg_source_batches','pkg_grading_records','pkg_packing_records','pkg_handover_records','pkg_packing_boxes','pkg_packing_code_registry','pkg_packing_code_claims','pkg_packing_events','pkg_packing_operations'].includes(table)) throw new ForbiddenException('包装链必须使用专用作业接口，禁止通用修改/删除');
    if (table === BREEDING_FARMS_TABLE) await this.validateFarmSiteMapping(body);
    const fields = Object.keys(body);
    const values = Object.values(body);

    if (fields.length === 0) throw new BadRequestException('Empty body');
    this.assertColumnsAllowed(table, fields);

    const placeholders = fields.map((_, i) => `$${i + 1}`).join(',');
    const quotedFields = fields.map((f) => `"${f}"`).join(',');
    const sql = `INSERT INTO "${table}" (${quotedFields}) VALUES (${placeholders})`;

    try {
      await this.entityManager.query(sql, values);
      return { msg: 'Created successfully' };
    } catch (e) {
      this.rejectSchemaMismatch(e, table);
      this.handleConstraintError(e, table);
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  async findOneByColumn(table: string, pkName: string, id: any) {
    const SAFE_KEY = /^[a-zA-Z0-9_]+$/;
    if (!SAFE_KEY.test(pkName)) {
      throw new BadRequestException('Security Violation: Invalid primary key column');
    }
    this.assertColumnsAllowed(table, [pkName]);
    if (['pkg_packing_boxes','pkg_packing_code_registry','pkg_packing_code_claims','pkg_packing_events','pkg_packing_operations'].includes(table)) throw new ForbiddenException('包装证据必须使用专用范围查询');
    const packagingFilter = table === 'pkg_handover_records' ? ' AND NOT EXISTS (SELECT 1 FROM pkg_packing_records p WHERE p.code=pkg_handover_records.packing_code AND p.is_test)' : ['pkg_work_shifts','pkg_source_batches','pkg_grading_records','pkg_packing_records'].includes(table) ? ' AND is_test = false' : '';
    const sql = `SELECT * FROM "${table}" WHERE "${pkName}" = $1${packagingFilter} LIMIT 1`;
    try {
      const rows = await this.entityManager.query(sql, [id]);
      return rows[0] ?? null;
    } catch (e) {
      this.rejectSchemaMismatch(e, table);
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  async update(table: string, pkName: string, id: any, body: any) {
    if (['pkg_work_shifts','pkg_source_batches','pkg_grading_records','pkg_packing_records','pkg_handover_records','pkg_packing_boxes','pkg_packing_code_registry','pkg_packing_code_claims','pkg_packing_events','pkg_packing_operations'].includes(table)) throw new ForbiddenException('包装链必须使用专用作业接口，禁止通用修改/删除');
    console.log(`[SVC Update START] table=${table} pk=${pkName} id=${id} body=${JSON.stringify(redactSensitive(body))}`);
    if (table === BREEDING_FARMS_TABLE) {
      const current = await this.findOneByColumn(table, pkName, id);
      if (!current) throw new BadRequestException('Record not found');
      const merged = { ...current, ...body };
      await this.validateFarmSiteMapping(merged);
      if (Object.prototype.hasOwnProperty.call(body, 'mapped_site_code')) {
        body.mapped_site_code = merged.mapped_site_code;
      }
    }
    const fields = Object.keys(body || {});
    const values = Object.values(body);

    if (fields.length === 0) throw new BadRequestException('Empty body');
    this.assertColumnsAllowed(table, [pkName, ...fields]);

    const setClauses = fields.map((f, i) => `"${f}" = $${i + 1}`).join(',');
    const hasUpdatedAt = fields.includes('updated_at');

    let finalSql: string;
    // ✅ 修复：updated_at 全部改用参数化写法（JS Date 对象），避免 TEXT 列类型不匹配
    if (hasUpdatedAt) {
      finalSql = `UPDATE "${table}" SET ${setClauses} WHERE "${pkName}" = $${fields.length + 1} RETURNING "${pkName}"`;
      values.push(id);
    } else {
      // $n+1 = updated_at（JS Date 自动转换）, $n+2 = PK
      finalSql = `UPDATE "${table}" SET ${setClauses}, "updated_at" = $${fields.length + 1} WHERE "${pkName}" = $${fields.length + 2} RETURNING "${pkName}"`;
      values.push(new Date(), id);
    }

    console.log(`[CRUD Update] ${table} WHERE ${pkName}=${id} | fields: ${fields.join(',')}`);

    try {
      const raw = await this.entityManager.query(finalSql, values);
      if (this.extractRows(raw).length === 0) throw new BadRequestException('Record not found');
      return { msg: 'Updated successfully' };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.rejectSchemaMismatch(e, table);
      this.handleConstraintError(e, table);
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  async remove(table: string, pkName: string, id: any) {
    if (['pkg_work_shifts','pkg_source_batches','pkg_grading_records','pkg_packing_records','pkg_handover_records','pkg_packing_boxes','pkg_packing_code_registry','pkg_packing_code_claims','pkg_packing_events','pkg_packing_operations'].includes(table)) throw new ForbiddenException('包装链必须使用专用作业接口，禁止通用修改/删除');
    this.assertColumnsAllowed(table, [pkName]);
    if (table === 'brd_farms') {
      const houses = await this.entityManager.query(`SELECT 1 FROM "brd_houses" WHERE farm_code = $1 LIMIT 1`, [id]);
      if (houses && houses.length > 0) {
        throw new BadRequestException('该养殖场下仍有登记的鸡舍，无法直接删除！请先清空关联鸡舍。');
      }
    }

    const sql = `DELETE FROM "${table}" WHERE "${pkName}" = $1 RETURNING "${pkName}"`;
    console.log(`[CRUD Delete] ${table} WHERE ${pkName}=${id}`);
    try {
      const raw = await this.entityManager.query(sql, [id]);
      if (this.extractRows(raw).length === 0) {
        throw new BadRequestException('Record not found');
      }
      console.log(`[CRUD Delete] ✅ success`);
      return { msg: 'Deleted successfully' };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.rejectSchemaMismatch(e, table);
      this.handleConstraintError(e, table);
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  private handleConstraintError(e: any, table: string) {
    const msg = e.message || '';
    if (msg.includes('unique constraint') || msg.includes('duplicate key')) {
      // 从 PG 消息里提取违反约束的字段名，如 "Key (dict_code)=(PKG_EGG_GRADE_5)"
      const colMatch = msg.match(/Key \(([^)]+)\)/);
      const col = colMatch ? colMatch[1] : '';
      throw new BadRequestException(col
        ? `「${col}」已存在相同值，请修改后重试`
        : `「${table}」存在重复值，请检查后重试`);
    }
    if (msg.includes('null value in column')) {
      // 提取具体字段名，如 `null value in column "dict_code" of relation "sys_dict"`
      const colMatch = msg.match(/null value in column "([^"]+)"/);
      const col = colMatch ? colMatch[1] : '';
      throw new BadRequestException(col
        ? `必填字段「${col}」不能为空，请填写后重试`
        : `必填字段不能为空，请检查所有必填项`);
    }
    if (msg.includes('foreign key constraint')) {
      throw new BadRequestException('关联数据不存在，请先确认关联记录已创建');
    }
  }
}
