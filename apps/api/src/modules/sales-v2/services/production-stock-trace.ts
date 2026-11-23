import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { deriveOrgScope } from '../../farm/farm.service';
import { officialInventoryPredicate } from '../../wms/official-inventory';

export interface StockTraceScope {
  company: string;
  warehouse: string;
  house: string;
  day: string;
  authority: DataScopeContext;
}

export interface StockBatchFilter {
  view?: 'warehouse' | 'source';
  gradeCode?: string;
  batchNo?: string;
  after?: string;
  limit?: string;
}

export interface GradeStock {
  attributableQty: number | null;
  knownAttributableQty: number;
  warehouseQty: number;
  mixedBatchCount: number;
  unmeasuredBatchCount: number;
}

export interface StockSource {
  kind: 'INBOUND' | 'RAW' | 'PURCHASE' | 'OPENING' | 'EXISTING_VERIFIED';
  documentId: string | null;
  documentNo: string | null;
  handoverRef: string | null;
  warehouseCode: string;
  originBatchNo: string | null;
  rawSegmentId: string | null;
  productionDate: string | null;
  houseCode: string | null;
  dailyLogId: string | null;
  occupancyId: string | null;
  flockNo: string | null;
  gradeCode: string | null;
}

export interface StockBatch {
  batchNo: string;
  gradeCode: string | null;
  warehouseCode: string;
  locationCode: string | null;
  skuCode: string;
  unit: string | null;
  status: string;
  inventoryClass: string | null;
  batchQty: number | null;
  availableQty: number | null;
  attributableQty: number | null;
  attribution: 'EXACT' | 'OTHER' | 'MIXED' | 'UNRESOLVED' | 'UNMEASURED';
  sources: StockSource[];
}

export function validateStockFilter(filter: StockBatchFilter) {
  if (filter.view !== undefined && !['warehouse', 'source'].includes(filter.view)) {
    throw new BadRequestException('批次查询范围无效');
  }
  for (const value of [filter.gradeCode, filter.batchNo, filter.after]) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 100 || value.trim() !== value)) {
      throw new BadRequestException('批次查询条件无效');
    }
  }
  if (filter.limit !== undefined && (typeof filter.limit !== 'string' || !/^[1-9]\d{0,2}$/.test(filter.limit) || Number(filter.limit) > 200)) {
    throw new BadRequestException('每页数量须为 1 至 200 的整数');
  }
  return Number(filter.limit ?? 50);
}

function params(scope: StockTraceScope, filter: StockBatchFilter = {}) {
  const farm = deriveOrgScope({dataScope:scope.authority});
  return [scope.company, scope.warehouse, scope.house, scope.day,
    scope.authority.isGlobal ? null : scope.authority.allowedWarehouseCodes,
    scope.authority.isGlobal || farm.companyCodes?.includes(scope.company),
    farm.farmCodes ?? [], farm.siteCodes ?? [],
    filter.gradeCode ?? null, filter.batchNo ?? null, filter.after ?? null];
}

// Reduce all production and external roots to one classification per physical batch before summing stock.
// RELATED_INPUT and raw quantities are input facts, never quantity shares of a mixed output.
async function stockQuery(manager: EntityManager, detail: boolean, boundedWarehousePage = false) {
  const [schema] = await manager.query("SELECT to_regclass('production_batch_raw_roots') IS NOT NULL AS raw, to_regprocedure('official_inventory_qualification_controlled(text)') IS NOT NULL AS controlled");
  const rawFacts = schema.raw ? `
    UNION ALL
    SELECT edge.batch_no, 'RAW', NULL::text, segment.id::text, doc.company_code, doc.warehouse_code,
      doc.house_code, doc.production_date, segment.daily_log_id, segment.occupancy_id, segment.flock_no,
      segment.grade_code, doc.id, doc.document_no, handover.handover_ref,false AS purchased
    FROM batches b JOIN production_batch_raw_roots edge ON edge.batch_no=b.batch_no
    JOIN production_raw_receipt_segments segment ON segment.id=edge.raw_segment_id
    JOIN production_raw_receipts doc ON doc.id=segment.receipt_id AND doc.state='POSTED'
    JOIN production_physical_handovers handover ON handover.id=doc.handover_id` : '';
  const sources = detail ? `,
      COALESCE(jsonb_agg(jsonb_build_object(
        'kind',kind,'documentId',document_id,'documentNo',document_no,'handoverRef',handover_ref,
        'originBatchNo',root_batch,'rawSegmentId',raw_id,'productionDate',production_date::text,
        'houseCode',house_code,'warehouseCode',warehouse_code,'dailyLogId',daily_log_id::text,'occupancyId',occupancy_id,'flockNo',flock_no,
        'gradeCode',source_grade) ORDER BY kind,document_no,root_batch,daily_log_id,source_grade,raw_id)
        FILTER (WHERE readable AND (daily_log_id IS NOT NULL OR kind IN ('PURCHASE','OPENING','EXISTING_VERIFIED'))), '[]'::jsonb) AS sources` : '';
  return `WITH batches AS (
    SELECT b.batch_no,b.warehouse_code,b.location_code,b.sku_code,b.grade_code_std AS grade,
      b.unit,b.status,b.qty,b.qty_available,b.inventory_class,q.origin_kind,
      COALESCE(b.unit='枚' AND b.qty=trunc(b.qty) AND b.qty>=0,false) AS measured
    FROM inv_batches b JOIN production_batch_qualifications q ON q.batch_no=b.batch_no AND q.disposition='QUALIFIED'
    WHERE b.company_code=$1 AND b.warehouse_code=$2 AND ${officialInventoryPredicate('b')}
      AND CASE WHEN EXISTS (SELECT 1 FROM production_inventory_domains d JOIN production_cutover_scopes s ON s.id=d.scope_id
        WHERE d.company_code=b.company_code AND d.warehouse_code=b.warehouse_code AND d.product_code=b.product_code
          AND s.state IN ('ACTIVE','SUSPENDED')) THEN true
        ELSE ${schema.controlled ? 'official_inventory_qualification_controlled(b.batch_no)' : 'false'} END
      AND ($9::text IS NULL OR b.grade_code_std=$9) AND ($10::text IS NULL OR b.batch_no=$10)
      AND ($11::text IS NULL OR b.batch_no COLLATE "C">$11::text COLLATE "C")
    ${boundedWarehousePage ? 'ORDER BY b.batch_no COLLATE "C" LIMIT $12' : ''}
  ), inventory_roots AS (
    SELECT batch_no,batch_no AS root_batch FROM batches WHERE origin_kind<>'DERIVED'
    UNION
    SELECT r.batch_no,r.root_batch_no FROM batches b JOIN production_batch_roots r ON r.batch_no=b.batch_no
  ), facts AS (
    SELECT r.batch_no,CASE WHEN external.batch_no IS NULL THEN 'INBOUND' ELSE root.origin_kind END AS kind,
      r.root_batch,NULL::text AS raw_id,COALESCE(d.company_code,external.company_code) AS company_code,
      COALESCE(l.warehouse_code,external.warehouse_code) AS warehouse_code,
      d.house_code,d.production_date,a.daily_log_id,a.source_snapshot->>'occupancy_id' AS occupancy_id,
      a.source_snapshot->>'flock_no' AS flock_no,COALESCE(l.grade_code,external.grade_code_std) AS source_grade,d.id AS document_id,d.document_no,d.handover_ref,COALESCE(root.origin_kind='PURCHASE',false) AS purchased
    FROM inventory_roots r
    LEFT JOIN production_batch_qualifications root ON root.batch_no=r.root_batch
    LEFT JOIN inv_batches external ON external.batch_no=r.root_batch AND root.origin_kind IN ('PURCHASE','OPENING','EXISTING_VERIFIED')
    LEFT JOIN (production_inbound_lines l JOIN production_inbound_documents d ON d.id=l.document_id
      AND d.kind='INBOUND' AND d.state='POSTED') ON l.batch_no=r.root_batch
    LEFT JOIN production_inbound_allocations a ON a.document_id=l.document_id AND a.line_no=l.line_no AND a.direction=1
    ${rawFacts}
  ), visible_facts AS (
    SELECT f.*,
      COALESCE(f.company_code=$1 AND ($5::text[] IS NULL OR f.warehouse_code=ANY($5))
        AND (f.kind IN ('PURCHASE','OPENING','EXISTING_VERIFIED') OR $6::boolean OR o.farm_code=ANY($7::text[]) OR o.site_code=ANY($8::text[])),false) AS readable
    FROM facts f LEFT JOIN brd_flock_occupancies o ON o.id=f.occupancy_id AND o.company_code=f.company_code
      AND o.house_code=f.house_code AND o.flock_no=f.flock_no
  ), provenance AS (
    SELECT batch_no,
      bool_or(COALESCE(readable AND house_code=$3 AND production_date=$4::date,false)) AS related,
      bool_and(COALESCE(readable AND daily_log_id IS NOT NULL AND occupancy_id IS NOT NULL AND flock_no IS NOT NULL
        AND house_code=$3 AND production_date=$4::date,false)) AS all_here,
      count(DISTINCT (company_code,house_code,production_date)) FILTER (WHERE readable AND daily_log_id IS NOT NULL) AS house_days,
      bool_or(purchased) AS has_purchase,
      bool_or(NOT purchased AND (NOT readable OR daily_log_id IS NULL OR occupancy_id IS NULL OR flock_no IS NULL)) AS unresolved
      ${sources}
    FROM visible_facts GROUP BY batch_no
  ), classified AS (
    SELECT b.*,COALESCE(p.related,false) AS related,
      CASE WHEN NOT b.measured THEN 'UNMEASURED'
        WHEN p.all_here THEN 'EXACT'
        WHEN p.house_days>1 OR (p.has_purchase AND p.related) THEN 'MIXED'
        WHEN p.batch_no IS NULL OR p.unresolved THEN 'UNRESOLVED'
        ELSE 'OTHER' END AS attribution
      ${detail ? ",COALESCE(p.sources,'[]'::jsonb) AS sources" : ''}
    FROM batches b LEFT JOIN provenance p ON p.batch_no=b.batch_no
  )`;
}

export async function stockByGrade(manager: EntityManager, scope: StockTraceScope): Promise<Record<string,GradeStock>> {
  const query = await stockQuery(manager, false);
  const rows = await manager.query(`${query}
    SELECT grade,COALESCE(SUM(qty) FILTER (WHERE measured),0)::float8 AS "warehouseQty",
      COALESCE(SUM(qty) FILTER (WHERE attribution='EXACT'),0)::float8 AS "knownAttributableQty",
      CASE WHEN bool_or(attribution='UNRESOLVED' OR related AND attribution<>'EXACT') THEN NULL
        ELSE COALESCE(SUM(qty) FILTER (WHERE attribution='EXACT'),0)::float8 END AS "attributableQty",
      COUNT(*) FILTER (WHERE related AND attribution='MIXED')::int AS "mixedBatchCount",
      COUNT(*) FILTER (WHERE NOT measured)::int AS "unmeasuredBatchCount"
    FROM classified WHERE qty IS DISTINCT FROM 0 AND grade IS NOT NULL GROUP BY grade`, params(scope));
  return Object.fromEntries(rows.map(({grade,...stock}: {grade:string} & GradeStock) => [grade,stock]));
}

export async function stockBatchQuery(manager: EntityManager, scope: StockTraceScope, filter: StockBatchFilter, pageLimit?: number) {
  // Warehouse membership is known before tracing roots. Source membership is known after tracing.
  const cte = await stockQuery(manager, true, pageLimit !== undefined && filter.view !== 'source');
  const args = params(scope,filter);
  return {sql:`${cte}
    SELECT batch_no AS "batchNo",grade AS "gradeCode",warehouse_code AS "warehouseCode",
      location_code AS "locationCode",sku_code AS "skuCode",unit,status,inventory_class AS "inventoryClass",
      qty::float8 AS "batchQty",qty_available::float8 AS "availableQty",attribution,sources,
      CASE WHEN attribution='EXACT' THEN qty::float8 WHEN attribution='OTHER' THEN 0 ELSE NULL END AS "attributableQty"
    FROM classified
    WHERE ${filter.view==='source' ? 'related' : 'true'}
    ORDER BY batch_no COLLATE "C" ${pageLimit === undefined ? '' : 'LIMIT $12'}`,
    args:pageLimit === undefined ? args : [...args,pageLimit]};
}

// Quote dynamic cells and neutralize spreadsheet formulas in identifier fields.
export function stockCsvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  const safe = /^\s*[=+@-]|^[\t\r\n]/.test(text) && typeof value !== 'number' ? "'"+text : text;
  return '"'+safe.replace(/"/g,'""')+'"';
}
