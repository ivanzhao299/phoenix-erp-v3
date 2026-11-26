import { officialInventoryPredicate, officialLedgerPredicate, assertOfficialInventoryBatches } from '../wms/official-inventory';
import { writeHenhouse } from './henhouse-write-policy';
import { DataScopeContext } from '../org/services/data-scope.service';
import { occupancyLossesSql } from '../farm/production-report-facts';
import { DAILY_EXPORT_MAX_ROWS } from './daily-export-policy';
import { Injectable, BadRequestException, ConflictException, ForbiddenException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { BREEDING_FARMS_TABLE, BreedingScopedTable } from './crud.constants';
import { OrgOwnershipService } from '../org/services/org-ownership.service';
import { schemaMismatch } from '../../common/database/schema-compatibility';
import { redactSensitive } from '../../common/logging/redact-sensitive';
import { writeFlock } from './flock-write-policy';
import { lockTempProductionReferences } from '../wms/temp-production-reversal';

@Injectable()
export class GenericCrudService {
  /** New operational obligations/references. Historical QA inspection reads are unchanged. */
  private static readonly BATCH_REFERENCE_FIELDS: Readonly<Record<string, readonly string[]>> = {
    wms_outbound: ['batch_no'], wms_stocktake: ['item', 'batch_no'],
    store_receiving_items: ['batch_no'], qa_non_conformance: ['batch_no'], qa_product_inspections: ['batch_no'],
    ord_order_items: ['batch_no'],
  };
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
      // Serialize flock DATE fields in PostgreSQL, before node-postgres converts
      // date-only values into local-midnight Date objects (which shift on JSON).
      const rows = table === 'brd_flocks'
        ? (await this.entityManager.query(`SELECT row_to_json(flock_rows) AS flock_fact FROM (${sql}) flock_rows`, queryValues)).map((row: { flock_fact: Record<string, unknown> }) => row.flock_fact)
        : await this.entityManager.query(sql, queryValues);
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
    const extraWhere: string[] = [table === 'inv_batches'
      ? officialInventoryPredicate('inv_batches')
      : officialLedgerPredicate()];
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

  async exportDailyReports(date: string, query: Record<string, unknown>, scope: DataScopeContext | null) {
    const params: unknown[] = [date];
    const filters: string[] = [];
    for (const key of ['house_code', 'farm_code', 'site_code']) {
      if (Object.keys(query).some(k => k.startsWith(key + '['))) throw new BadRequestException('无效范围编码');
      const value = query[key];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !value.trim()) throw new BadRequestException('无效范围编码');
      params.push(value);
      filters.push(`r->>'${key}' = $${params.length}`);
    }
    if (!scope?.isGlobal) {
      params.push(scope?.allowedBreedingFarmCodes ?? [], scope?.allowedBreedingSiteCodes ?? [], scope?.allowedBreedingCompanyCodes ?? []);
      const farm = params.length - 2, site = params.length - 1, company = params.length;
      // Legacy reports may have stale ownership fields. Managed facts have immutable occupancy ownership.
      filters.push(`(CASE WHEN r->>'occupancy_id' IS NOT NULL THEN
          (r->>'farm_code' = ANY($${farm}::text[]) OR r->>'site_code' = ANY($${site}::text[]) OR r->>'company_code' = ANY($${company}::text[]))
        ELSE EXISTS (SELECT 1 FROM brd_houses h JOIN brd_farms f ON f.farm_code=h.farm_code AND f.status='ACTIVE'
          WHERE h.house_code=r->>'house_code' AND (f.farm_code=ANY($${farm}::text[]) OR f.mapped_site_code=ANY($${site}::text[]) OR f.company_code=ANY($${company}::text[]))) END)`);
    }
    const [schema] = await this.entityManager.query("SELECT to_regclass('brd_flock_events') AS ledger");
    const reports = `SELECT to_jsonb(d) || jsonb_build_object('row_kind','REPORT') ${schema?.ledger
      ? "|| CASE WHEN d.occupancy_id IS NOT NULL THEN jsonb_build_object('mortality_qty',0,'elimination_qty',0) ELSE '{}'::jsonb END" : ''} AS r
      FROM brd_daily_logs d WHERE d.log_date=$1::date`;
    const events = schema?.ledger ? ` UNION ALL SELECT to_jsonb(e) || jsonb_build_object('id','loss:' || e.occupancy_id || ':' || e.log_date,
      'row_kind','FLOCK_EVENT') FROM (${occupancyLossesSql}) e WHERE e.log_date=$1::date` : '';
    const result = await this.entityManager.query(`SELECT r FROM (${reports}${events}) facts
      ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''} ORDER BY r->>'house_code',r->>'id' LIMIT ${DAILY_EXPORT_MAX_ROWS + 1}`, params);
    if (result.length > DAILY_EXPORT_MAX_ROWS) throw new BadRequestException('EXPORT_TOO_LARGE');
    return this.enrichDailyLogRows(result.map((item: {r: Record<string, unknown>}) => item.r));
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
      const isDailyLog = table === 'brd_daily_logs';
      const siteColumn = table === BREEDING_FARMS_TABLE ? 'mapped_site_code' : 'site_code';
      if (scope.farmCodes.length > 0) {
        const farmColumn = isDailyLog ? 'ownership_farm.farm_code' : '"farm_code"';
        ors.push(`${farmColumn} = ANY($${this.nextParamIndex(query, extraValues.length)})`);
        extraValues.push(scope.farmCodes);
      }
      if (scope.siteCodes.length > 0) {
        const idx = this.nextParamIndex(query, extraValues.length);
        ors.push(isDailyLog
          ? `NULLIF(to_jsonb(ownership_farm)->>'mapped_site_code', '') = ANY($${idx})`
          : table === BREEDING_FARMS_TABLE
          ? `"${siteColumn}" = ANY($${idx})`
          : OrgOwnershipService.farmScopePredicate(table, 'site', `$${idx}`));
        extraValues.push(scope.siteCodes);
      }
      if (scope.companyCodes.length > 0) {
        const idx = this.nextParamIndex(query, extraValues.length);
        ors.push(isDailyLog
          ? `ownership_farm.company_code = ANY($${idx})`
          : table === BREEDING_FARMS_TABLE
          ? `"company_code" = ANY($${idx})`
          : OrgOwnershipService.farmScopePredicate(table, 'company', `$${idx}`));
        extraValues.push(scope.companyCodes);
      }
      // Historical scope snapshots can be missing or stale. Resolve the report's
      // house through the authoritative ACTIVE farm, as the write path does.
      const predicate = ors.length > 0 ? `(${ors.join(' OR ')})` : '1=0';
      extraWhere.push(isDailyLog ? `EXISTS (
        SELECT 1 FROM brd_houses ownership_house
        JOIN ${OrgOwnershipService.FARM_TABLE} ownership_farm
          ON ownership_farm.farm_code = ownership_house.farm_code AND ownership_farm.status = 'ACTIVE'
        WHERE ownership_house.house_code = "brd_daily_logs"."house_code" AND ${predicate}
      )` : predicate);
    }

    const { sql, queryValues } = this.buildFindAllSql(table, query, extraWhere, extraValues);
    try {
      const rows = table === 'brd_flocks'
        ? (await this.entityManager.query(`SELECT row_to_json(flock_rows) AS flock_fact FROM (${sql}) flock_rows`, queryValues)).map((row: { flock_fact: Record<string, unknown> }) => row.flock_fact)
        : await this.entityManager.query(sql, queryValues);
      return table === 'brd_daily_logs' ? await this.enrichDailyLogRows(rows) : rows;
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
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 1000);
    const offset = Math.max(Number(query.offset) || 0, 0);

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
        const column = key.slice(0, -6);
        if (!SAFE_KEY.test(column)) continue;
        this.assertColumnsAllowed(table, [column]);
        whereClauses.push(`"${column}" LIKE $${paramIndex}`);
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

  static assertNoDerivedQuantityFields(body: unknown): void {
    if (body && typeof body==='object' && ['quantity_snapshot','base_quantity_version','price_snapshot','valuation_snapshot'].some(key => Object.prototype.hasOwnProperty.call(body,key))) {
      throw new ForbiddenException('计量、价格与库存可信来源快照由专用业务接口生成，禁止通用写入');
    }
  }

  async create(table: string, body: any) {
    if (['brd_flock_','brd_egg_','inv_flock_','production_'].some(prefix=>table.startsWith(prefix))) throw new ForbiddenException('生命周期事件账禁止通用写入');
    if (table === 'brd_daily_logs') throw new ForbiddenException('日报必须使用专用日报接口，禁止通用写入');
    if(table.startsWith('production_'))throw new ForbiddenException('正式库存及切换事实必须使用专用受控接口');
    if (['wms_inbound_items','wms_outbound_items','inv_batches','inv_ledger'].includes(table)) throw new ForbiddenException('WMS 明细及快照必须使用专用单据接口，禁止通用修改/删除');
    GenericCrudService.assertNoDerivedQuantityFields(body);
    if (['mst_products', 'product_skus'].includes(table)) throw new ForbiddenException('产品/SKU 必须使用主数据领域接口，禁止通用 CRUD 写入');
    if (['pkg_work_shifts','pkg_source_batches','pkg_grading_records','pkg_packing_records','pkg_handover_records','pkg_packing_boxes','pkg_packing_code_registry','pkg_packing_code_claims','pkg_packing_events','pkg_packing_operations'].includes(table)) throw new ForbiddenException('包装链必须使用专用作业接口，禁止通用修改/删除');
    if (table === 'brd_flocks') return writeFlock(this.entityManager, body);
    if (table === 'brd_houses') {this.assertColumnsAllowed(table,Object.keys(body));return writeHenhouse(this.entityManager,body);}
    if (table === BREEDING_FARMS_TABLE) await this.validateFarmSiteMapping(body);
    const fields = Object.keys(body);
    const values = Object.values(body);

    if (fields.length === 0) throw new BadRequestException('Empty body');
    this.assertColumnsAllowed(table, fields);

    const placeholders = fields.map((_, i) => `$${i + 1}`).join(',');
    const quotedFields = fields.map((f) => `"${f}"`).join(',');
    const sql = `INSERT INTO "${table}" (${quotedFields}) VALUES (${placeholders})`;

    try {
      const references = GenericCrudService.BATCH_REFERENCE_FIELDS[table];
      if (references) await this.entityManager.transaction(async manager => {
        await lockTempProductionReferences(manager, references.map(field => body[field]));
        await assertOfficialInventoryBatches(manager, references.map(field => body[field]).filter((value): value is string => typeof value === 'string'));
        await manager.query(sql, values);
      });
      else await this.entityManager.query(sql, values);
      return { msg: 'Created successfully' };
    } catch (e) {
      if (e instanceof ConflictException) throw e;
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
      const rows = table === 'brd_flocks'
        ? (await this.entityManager.query(`SELECT row_to_json(flock_row) AS flock_fact FROM (${sql}) flock_row`, [id])).map((row: { flock_fact: Record<string, unknown> }) => row.flock_fact)
        : await this.entityManager.query(sql, [id]);
      return rows[0] ?? null;
    } catch (e) {
      this.rejectSchemaMismatch(e, table);
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  async update(table: string, pkName: string, id: any, body: any) {
    if (['brd_flock_','brd_egg_','inv_flock_','production_'].some(prefix=>table.startsWith(prefix))) throw new ForbiddenException('生命周期事件账禁止通用写入');
    if (table === 'brd_daily_logs') throw new ForbiddenException('日报必须使用专用日报接口，禁止通用写入');
    if(table.startsWith('production_'))throw new ForbiddenException('正式库存及切换事实必须使用专用受控接口');
    if (['wms_inbound_items','wms_outbound_items','inv_batches','inv_ledger'].includes(table)) throw new ForbiddenException('WMS 明细及快照必须使用专用单据接口，禁止通用修改/删除');
    GenericCrudService.assertNoDerivedQuantityFields(body);
    if (['mst_products', 'product_skus'].includes(table)) throw new ForbiddenException('产品/SKU 必须使用主数据领域接口，禁止通用 CRUD 写入');
    if (['pkg_work_shifts','pkg_source_batches','pkg_grading_records','pkg_packing_records','pkg_handover_records','pkg_packing_boxes','pkg_packing_code_registry','pkg_packing_code_claims','pkg_packing_events','pkg_packing_operations'].includes(table)) throw new ForbiddenException('包装链必须使用专用作业接口，禁止通用修改/删除');
    if (table === 'brd_flocks') return writeFlock(this.entityManager, body, { pkName, id });
    if (table === 'brd_houses') {this.assertColumnsAllowed(table,[pkName,...Object.keys(body)]);return writeHenhouse(this.entityManager,body,{pkName,id});}
    console.log(`[SVC Update START] table=${table} pk=${pkName} id=${id} body=${JSON.stringify(redactSensitive(body))}`);
    if (table === BREEDING_FARMS_TABLE) {
      const current = await this.findOneByColumn(table, pkName, id);
      if (!current) throw new BadRequestException('Record not found');
      for(const key of ['farm_code','company_code','mapped_site_code'])if(body[key]!==undefined&&String(body[key]??'')!==String(current[key]??'')&&(await this.entityManager.query('SELECT 1 FROM brd_houses WHERE farm_code=$1 LIMIT 1',[current.farm_code])).length)throw new BadRequestException('农场已有关联鸡舍，不能直接变更编码、公司或场区，须先核对历史占栏与追溯归属');
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
      const references = GenericCrudService.BATCH_REFERENCE_FIELDS[table];
      const execute = async (manager: EntityManager) => {
        if (references) {
          const [current] = await manager.query(`SELECT * FROM "${table}" WHERE "${pkName}"=$1 FOR UPDATE`, [id]);
          if (!current) throw new BadRequestException('Record not found');
          await lockTempProductionReferences(manager, references.flatMap(field => [current[field], body[field]]));
        await assertOfficialInventoryBatches(manager, references.flatMap(field => [current[field], body[field]]).filter((value): value is string => typeof value === 'string'));
        }
        return manager.query(finalSql, values);
      };
      const raw = references ? await this.entityManager.transaction(execute) : await execute(this.entityManager);
      if (this.extractRows(raw).length === 0) throw new BadRequestException('Record not found');
      return { msg: 'Updated successfully' };
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof ConflictException) throw e;
      this.rejectSchemaMismatch(e, table);
      this.handleConstraintError(e, table);
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  async remove(table: string, pkName: string, id: any) {
    if (['brd_flock_','brd_egg_','inv_flock_','production_'].some(prefix=>table.startsWith(prefix))) throw new ForbiddenException('生命周期事件账禁止通用写入');
    if (['brd_flocks','brd_houses'].includes(table)) throw new ForbiddenException('鸡群与鸡舍须保留追溯档案，禁止物理删除');
    if (table === 'brd_daily_logs') throw new ForbiddenException('日报必须使用专用日报接口，禁止通用写入');
    if(table.startsWith('production_'))throw new ForbiddenException('正式库存及切换事实必须使用专用受控接口');
    if (['wms_inbound_items','wms_outbound_items','inv_batches','inv_ledger'].includes(table)) throw new ForbiddenException('WMS 明细及快照必须使用专用单据接口，禁止通用修改/删除');
    if (['mst_products', 'product_skus'].includes(table)) throw new ForbiddenException('产品/SKU 必须使用主数据领域接口，禁止通用 CRUD 写入');
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
      const references = GenericCrudService.BATCH_REFERENCE_FIELDS[table];
      const execute = async (manager: EntityManager) => {
        if (references) {
          const [current] = await manager.query(`SELECT * FROM "${table}" WHERE "${pkName}"=$1 FOR UPDATE`, [id]);
          if (!current) throw new BadRequestException('Record not found');
          await lockTempProductionReferences(manager, references.map(field => current[field]));
        await assertOfficialInventoryBatches(manager, references.map(field => current[field]).filter((value): value is string => typeof value === 'string'));
        }
        return manager.query(sql, [id]);
      };
      const raw = references ? await this.entityManager.transaction(execute) : await execute(this.entityManager);
      if (this.extractRows(raw).length === 0) {
        throw new BadRequestException('Record not found');
      }
      console.log(`[CRUD Delete] ✅ success`);
      return { msg: 'Deleted successfully' };
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof ConflictException) throw e;
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
