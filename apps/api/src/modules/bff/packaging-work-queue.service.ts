import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PackagingHistoryService } from './packaging-history.service';
import { hasPerm } from '../../auth/permissions.util';
import { identifiableEggStockHouse, initialEggStockHouseReferences } from '../sales-v2/services/initial-egg-inventory-route';

type Bucket = 'CURRENT' | 'CARRYOVER' | 'REVIEW';
type QueueRow = {
  kind: 'SOURCE' | 'GRADING' | 'PACKING';
  entity_id: string;
  code: string;
  shift_id: string;
  production_date: string | null;
  quantity: string | number | null;
  unit: string;
  action: string;
  reason: string;
  href: string | null;
  company_code?: string;
  site_code?: string;
  house_code?: string;
  route_code?: string;
  source_batch_code?: string;
};

/** Read-only, scope-bound work queue. Each category is calculated in one SQL statement. */
@Injectable()
export class PackagingWorkQueueService {
  private readonly cursorKey = randomBytes(32);
  constructor(private readonly history: PackagingHistoryService) {}

  async sites(req: any) {
    const scope: any = await this.history.scope(req);
    const alternatives = scope.alternatives || [scope];
    const params: any[] = [];
    const allowed = alternatives.map((s: any) => {
      params.push(!!s.isGlobal, s.allowedCompanyCodes || [], s.allowedFarmCodes || []);
      const i = params.length - 2;
      return `($${i}::boolean OR (f.company_code=ANY($${i+1}::text[]) AND f.farm_code=ANY($${i+2}::text[])))`;
    }).join(' OR ');
    return this.history.em.query(`SELECT f.farm_code AS "siteCode", COALESCE(to_jsonb(f)->>'farm_name',f.farm_code) AS "siteName"
      FROM brd_farms f WHERE f.status='ACTIVE' AND (${allowed}) ORDER BY f.farm_code`, params);
  }

  async list(q: Record<string, string>, req: any) {
    const bucket = q.bucket as Bucket;
    if (!['CURRENT', 'CARRYOVER', 'REVIEW'].includes(bucket)) throw new BadRequestException('INVALID_FILTER');
    const siteCode = String(q.siteCode || '');
    const shiftId = String(q.shiftId || '');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(siteCode) || (bucket === 'CURRENT' && !/^[1-9]\d*$/.test(shiftId)) || (shiftId && !/^[1-9]\d*$/.test(shiftId))) throw new BadRequestException('INVALID_FILTER');
    const pageSize = Number(q.pageSize || 50);
    if (![25, 50, 100].includes(pageSize)) throw new BadRequestException('INVALID_FILTER');
    const scope: any = await this.history.scope(req);
    const alternatives = scope.alternatives || [scope];
    const uid = String(req.user.userId ?? req.user.id ?? req.user.user_id);
    const scopeKey = createHmac('sha256', this.cursorKey).update(JSON.stringify({uid, bucket, siteCode, shiftId, alternatives: alternatives.map((s: any) => [s.isGlobal, s.allowedCompanyCodes, s.allowedFarmCodes, s.allowedWarehouseCodes]), version:req.user.perms_version ?? null})).digest('hex');
    const cursor = this.decode(q.cursor, scopeKey);
    const params: any[] = [siteCode, shiftId || null];
    const visibility = alternatives.map((s: any) => {
      params.push(!!s.isGlobal, s.allowedCompanyCodes || [], s.allowedFarmCodes || []);
      const i = params.length - 2;
      return `($${i}::boolean OR (f.status='ACTIVE' AND f.company_code=ANY($${i+1}::text[]) AND ws.site_id=ANY($${i+2}::text[])))`;
    }).join(' OR ');
    const sourceOwnerMismatch = `(ss.id IS NULL OR ss.is_test OR ss.batch_status='VOID'
      OR sf.farm_code IS DISTINCT FROM f.farm_code OR sf.company_code IS DISTINCT FROM f.company_code)`;
    const packingGradeCodes = `CASE WHEN jsonb_typeof(p.grading_codes_json)='array'
      AND p.grading_codes_json<>'[]'::jsonb THEN p.grading_codes_json
      ELSE jsonb_build_array(p.grading_code) END`;
    const warehouseVisible = alternatives.map((s: any) => {
      params.push(!!s.isGlobal, s.allowedCompanyCodes || [], s.allowedFarmCodes || [], s.allowedWarehouseCodes || []);
      const i = params.length - 3;
      return `($${i}::boolean OR (f.company_code=ANY($${i+1}::text[]) AND ws.site_id=ANY($${i+2}::text[])
        AND NOT EXISTS (
          SELECT 1 FROM (
            SELECT x->>'company_code' company_code,x->>'warehouse_code' warehouse_code FROM jsonb_array_elements(inv.rows) x
            UNION ALL
            SELECT x->>'company_code',x->>'warehouse_code' FROM jsonb_array_elements(led.rows) x
            UNION ALL
            SELECT x->>'companyCode',x->>'warehouseCode'
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(receipt.payload->'groups')='array'
              THEN receipt.payload->'groups' ELSE '[]'::jsonb END) x
            UNION ALL
            SELECT w.company_code,w.warehouse_code FROM jsonb_array_elements(ho.rows) x
            LEFT JOIN wms_locations loc ON loc.location_code=x->>'location'
            LEFT JOIN wms_warehouses w ON w.warehouse_code=loc.warehouse_code
          ) evidence_scope
          LEFT JOIN wms_warehouses w ON w.warehouse_code=evidence_scope.warehouse_code
          WHERE evidence_scope.company_code IS DISTINCT FROM f.company_code
            OR w.company_code IS DISTINCT FROM f.company_code
            OR NOT COALESCE(w.warehouse_code=ANY($${i+3}::text[]),false)
        )
        AND (receipt.payload IS NULL OR COALESCE(jsonb_typeof(receipt.payload->'groups')='array'
          AND receipt.payload->'groups'<>'[]'::jsonb,false))))`;
    }).join(' OR ');
    const productionRead = hasPerm(req.user?.permissions, 'MENU_PROD_INBOUND', 'V');
    const userId = String(req.user.userId ?? req.user.id ?? req.user.user_id);
    const productionScope = productionRead
      ? await this.history.scopes.resolve(userId, req.user.roles || [], 'MENU_PROD_INBOUND', req.user.perms_version)
      : null;
    params.push(bucket);
    const bucketBind = `$${params.length}`;
    const afterDateBind = `$${params.length + 1}`;
    const afterKindBind = `$${params.length + 2}`;
    const afterIdBind = `$${params.length + 3}`;
    const limitBind = `$${params.length + 4}`;
    const sql = `WITH site_farm AS MATERIALIZED (
      SELECT farm_code,company_code,status,NULLIF(to_jsonb(f)->>'mapped_site_code','') mapped_site_code
      FROM brd_farms f WHERE farm_code=$1
    ), site_packings AS MATERIALIZED (
      SELECT p.* FROM pkg_packing_records p JOIN pkg_work_shifts ws ON ws.id=p.shift_id
      WHERE ws.site_id=$1 AND NOT ws.is_test AND NOT p.is_test AND p.status='ACTIVE'
    ), packing_by_grade AS MATERIALIZED (
      SELECT grades.code,
        SUM(p.total_eggs) FILTER (WHERE jsonb_array_length(${packingGradeCodes})=1) packed_qty,
        BOOL_OR(jsonb_array_length(${packingGradeCodes})<>1 OR p.total_eggs IS NULL OR p.total_eggs<=0) allocation_unknown
      FROM site_packings p CROSS JOIN LATERAL (
        SELECT DISTINCT code FROM jsonb_array_elements_text(${packingGradeCodes}) AS links(code)
      ) grades
      WHERE grades.code IS NOT NULL
      GROUP BY grades.code
    ), pack_candidates AS MATERIALIZED (
      SELECT p.* FROM site_packings p JOIN pkg_work_shifts ws ON ws.id=p.shift_id
      WHERE (${bucketBind}::text='CURRENT' AND ws.status='OPEN' AND p.shift_id::text=$2)
        OR (${bucketBind}::text='CARRYOVER' AND ws.status='CLOSED' AND ($2::text IS NULL OR p.shift_id::text<>$2))
        OR (${bucketBind}::text='REVIEW' AND ($2::text IS NULL OR p.shift_id::text=$2))
    ), expected_packing_grades AS MATERIALIZED (
      SELECT p.id,ws.site_id,expected.code
      FROM pack_candidates p JOIN pkg_work_shifts ws ON ws.id=p.shift_id
      CROSS JOIN LATERAL jsonb_array_elements_text(${packingGradeCodes}) expected(code)
    ), site_source_days AS MATERIALIZED (
      SELECT DISTINCT s.production_date FROM pkg_source_batches s JOIN pkg_work_shifts ws ON ws.id=s.shift_id
      WHERE ws.site_id=$1 AND NOT ws.is_test AND NOT s.is_test
    ), temp_stock_origins AS MATERIALIZED (
      SELECT DISTINCT b.egg_date,origin.house_code
      FROM inv_batches b JOIN site_farm f ON f.company_code=b.company_code
      JOIN site_source_days days ON days.production_date=b.egg_date
      LEFT JOIN LATERAL (
        SELECT btrim(house_code) AS house_code
        FROM (${initialEggStockHouseReferences('b', 'b.egg_date')}) refs
        WHERE ${identifiableEggStockHouse}
      ) origin ON true
      WHERE b.source_type='TEMP_PRODUCTION'
    ), packing_lineage AS MATERIALIZED (
      SELECT expected.id,
        BOOL_OR(pg.is_test OR pg.status IS DISTINCT FROM 'ACTIVE' OR ${sourceOwnerMismatch}) invalid,
        BOOL_OR(cutover.id IS NOT NULL OR day_route.entry_mode='TEMP_PRODUCTION' OR temp.egg_date IS NOT NULL) competing_route
      FROM expected_packing_grades expected JOIN site_farm f ON f.farm_code=expected.site_id
      LEFT JOIN pkg_grading_records pg ON pg.code=expected.code
      LEFT JOIN pkg_grading_source_links gl ON gl.grading_id=pg.id
      LEFT JOIN pkg_source_batches ss ON ss.id=gl.source_batch_id
      LEFT JOIN brd_houses sh ON sh.house_code=ss.house_code LEFT JOIN brd_farms sf ON sf.farm_code=sh.farm_code
      LEFT JOIN production_cutover_scopes cutover ON cutover.company_code=f.company_code
        AND cutover.house_code=ss.house_code AND cutover.state<>'DRAFT'
      LEFT JOIN brd_egg_day_routes day_route ON day_route.company_code=f.company_code
        AND day_route.house_code=ss.house_code AND day_route.production_date=ss.production_date
      LEFT JOIN temp_stock_origins temp ON temp.egg_date=ss.production_date
        AND (temp.house_code IS NULL OR temp.house_code=ss.house_code)
      GROUP BY expected.id
    ), eligible_packing AS MATERIALIZED (
      SELECT p.* FROM pack_candidates p WHERE p.id IN (
        SELECT lineage.id FROM packing_lineage lineage WHERE NOT lineage.invalid
          AND (${bucketBind}::text='REVIEW' OR NOT COALESCE(lineage.competing_route,false))
      )
    ), source_candidates AS MATERIALIZED (
      SELECT s.*,ws.status shift_status,ws.production_date shift_date, f.company_code,
        f.mapped_site_code official_site_code,
        mode.mode inventory_mode,cutover.state cutover_state,cutover.first_production_date
      FROM pkg_source_batches s JOIN pkg_work_shifts ws ON ws.id=s.shift_id AND NOT ws.is_test
      JOIN brd_houses h ON h.house_code=s.house_code JOIN site_farm f ON f.farm_code=h.farm_code AND f.farm_code=ws.site_id
      LEFT JOIN LATERAL (SELECT mode FROM inv_source_mode WHERE (scope_level='SITE' AND scope_code=ws.site_id)
        OR (scope_level='COMPANY' AND scope_code=f.company_code) OR (scope_level='GROUP' AND scope_code='ALL')
        ORDER BY CASE scope_level WHEN 'SITE' THEN 1 WHEN 'COMPANY' THEN 2 ELSE 3 END LIMIT 1) mode ON true
      LEFT JOIN LATERAL (SELECT cs.state,cs.first_production_date FROM production_cutover_scopes cs
        WHERE cs.company_code=f.company_code AND cs.house_code=s.house_code AND cs.state<>'DRAFT'
        ORDER BY cs.version DESC LIMIT 1) cutover ON true
      WHERE f.status='ACTIVE' AND NOT s.is_test AND s.batch_status IN ('RECEIVED','CLOSED')
        AND ws.site_id=$1 AND (${visibility})
        AND ((${bucketBind}::text='CURRENT' AND ws.status='OPEN' AND s.shift_id::text=$2)
          OR (${bucketBind}::text='CARRYOVER' AND ws.status='CLOSED' AND ($2::text IS NULL OR s.shift_id::text<>$2))
          OR (${bucketBind}::text='REVIEW' AND ($2::text IS NULL OR s.shift_id::text=$2)))
        AND NOT EXISTS(SELECT 1 FROM production_raw_receipts raw WHERE raw.source_batch_id=s.id AND raw.state='POSTED')
    ), raw_reference_keys AS MATERIALIZED (
      SELECT s.id,official_raw_reference_token(ref.code) token
      FROM source_candidates s CROSS JOIN LATERAL (VALUES (s.batch_code),(s.source_inbound_no)) ref(code)
      WHERE s.cutover_state='ACTIVE' AND s.inventory_mode='PACKAGING_INBOUND'
        AND official_raw_reference_token(ref.code) IS NOT NULL
    ), existing_raw_references AS MATERIALIZED (
      SELECT official_raw_reference_token(ref.code) token
      FROM inv_batches b CROSS JOIN LATERAL (VALUES (b.batch_no),(b.source_no)) ref(code)
      WHERE EXISTS(SELECT 1 FROM raw_reference_keys)
      UNION ALL
      SELECT official_raw_reference_token(ref.code)
      FROM wms_inbound inbound CROSS JOIN LATERAL (VALUES (to_jsonb(inbound)->>'task_no'),(to_jsonb(inbound)->>'inbound_no')) ref(code)
      WHERE EXISTS(SELECT 1 FROM raw_reference_keys)
    ), raw_claimed_sources AS MATERIALIZED (
      SELECT DISTINCT keys.id FROM raw_reference_keys keys JOIN existing_raw_references found ON found.token=keys.token
      UNION
      SELECT DISTINCT keys.id FROM raw_reference_keys keys JOIN brd_egg_source_receipts r ON r.source_key='PACKAGING:'||keys.id
    ), visible AS (
      SELECT 'SOURCE' kind, s.id::text entity_id,s.batch_code code,s.shift_id::text shift_id,s.production_date::text production_date,
        CASE WHEN ${bucketBind}::text='REVIEW' THEN NULL ELSE remaining.qty END::numeric quantity,'eggs' unit,
        route.code action,route.reason,NULL::text href,s.company_code,
        s.official_site_code site_code,s.house_code,s.batch_code source_batch_code,route.code route_code
      FROM source_candidates s
      LEFT JOIN raw_claimed_sources claimed ON claimed.id=s.id
      LEFT JOIN LATERAL (
        SELECT SUM(l.input_qty) input_qty,BOOL_OR(l.input_qty IS NULL) allocation_unknown,COUNT(*)>0 has_active_links
        FROM pkg_grading_source_links l JOIN pkg_grading_records g ON g.id=l.grading_id AND NOT g.is_test AND g.status='ACTIVE'
        WHERE l.source_batch_id=s.id
      ) linked ON true
      CROSS JOIN LATERAL (
        SELECT COALESCE(NULLIF(s.total_qty,0),s.received_qty,0)-COALESCE(s.dirty_qty,0)-COALESCE(s.cracked_qty,0)-COALESCE(linked.input_qty,0) qty
      ) remaining
      LEFT JOIN brd_egg_day_routes day_route ON day_route.company_code=s.company_code
        AND day_route.house_code=s.house_code AND day_route.production_date=s.production_date
      CROSS JOIN LATERAL (
        SELECT day_route.entry_mode='TEMP_PRODUCTION' OR EXISTS(
          SELECT 1 FROM temp_stock_origins temp WHERE temp.egg_date=s.production_date
            AND (temp.house_code IS NULL OR temp.house_code=s.house_code)
        ) AS prior_temp
      ) stock
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN stock.prior_temp THEN 'The production day already has an initial inventory route'
          WHEN COALESCE(linked.allocation_unknown,false) OR remaining.qty<0 THEN 'Uncertain or over-allocated grading source quantity'
          WHEN s.cutover_state IN ('FENCED','SUSPENDED') THEN 'Formal production cutover is not active'
          WHEN s.cutover_state='ACTIVE' AND s.production_date<s.first_production_date THEN 'Production date precedes formal cutover'
          WHEN s.cutover_state='ACTIVE' AND s.inventory_mode IS NULL THEN 'Formal cutover has no explicit inventory mode'
          WHEN s.cutover_state='ACTIVE' AND s.inventory_mode='PACKAGING_INBOUND'
            AND (COALESCE(linked.has_active_links,false) OR day_route.entry_mode IS NOT NULL
              OR s.batch_status<>'RECEIVED' OR (s.lay_date IS NOT NULL AND s.lay_date<>s.production_date)
              OR s.shift_date<s.production_date OR claimed.id IS NOT NULL
              OR EXISTS(SELECT 1 FROM pkg_grading_source_links gl JOIN pkg_grading_records gr ON gr.id=gl.grading_id
                WHERE gl.source_batch_id=s.id AND NOT gr.is_test AND gr.status IS DISTINCT FROM 'VOID'))
              THEN 'Existing source evidence prevents formal raw collection'
          WHEN s.cutover_state='ACTIVE' AND s.inventory_mode='PACKAGING_INBOUND' THEN 'Formal raw collection requires signed handover'
          WHEN s.cutover_state='ACTIVE' THEN 'Use formal installment production inbound'
          WHEN s.inventory_mode='PACKAGING_INBOUND' THEN 'Awaiting grading'
          ELSE 'Use temporary production inbound' END AS reason
      ) classification
      CROSS JOIN LATERAL (
        SELECT classification.reason,CASE classification.reason
          WHEN 'The production day already has an initial inventory route' THEN 'SOURCE_ALLOCATION_REVIEW'
          WHEN 'Uncertain or over-allocated grading source quantity' THEN 'SOURCE_ALLOCATION_REVIEW'
          WHEN 'Formal production cutover is not active' THEN 'CUTOVER_REVIEW'
          WHEN 'Production date precedes formal cutover' THEN 'CUTOVER_REVIEW'
          WHEN 'Formal cutover has no explicit inventory mode' THEN 'CUTOVER_REVIEW'
          WHEN 'Existing source evidence prevents formal raw collection' THEN 'SOURCE_ALLOCATION_REVIEW'
          WHEN 'Formal raw collection requires signed handover' THEN 'FORMAL_RAW'
          WHEN 'Use formal installment production inbound' THEN 'FORMAL_INSTALLMENTS'
          WHEN 'Awaiting grading' THEN 'GRADE' ELSE 'LEGACY_TEMP_INBOUND' END AS code
      ) route
      WHERE ((${bucketBind}::text='REVIEW' AND route.code IN ('SOURCE_ALLOCATION_REVIEW','CUTOVER_REVIEW'))
        OR (${bucketBind}::text<>'REVIEW' AND remaining.qty>0 AND route.code NOT IN ('SOURCE_ALLOCATION_REVIEW','CUTOVER_REVIEW')))
      UNION ALL
      SELECT 'GRADING',g.id::text,g.code,g.shift_id::text,g.production_date::text,
        CASE WHEN ${bucketBind}::text='REVIEW' THEN NULL ELSE remainder.qty END::numeric,'eggs',
        CASE WHEN ${bucketBind}::text='REVIEW' THEN 'REVIEW' ELSE 'PACK' END,
        CASE WHEN ${bucketBind}::text='REVIEW' THEN 'Existing packing allocation requires review' ELSE 'Available for packing' END,
        CASE WHEN ${bucketBind}::text='CURRENT' THEN '/terminal/packaging/packing' ELSE NULL END,
        f.company_code,ws.site_id,NULL::text,NULL::text,NULL::text
      FROM pkg_grading_records g JOIN pkg_work_shifts ws ON ws.id=g.shift_id AND NOT ws.is_test
      JOIN site_farm f ON f.farm_code=ws.site_id
      LEFT JOIN packing_by_grade used ON used.code=g.code
      CROSS JOIN LATERAL (
        SELECT g.total_output-COALESCE(used.packed_qty,0) qty,
          COALESCE(used.allocation_unknown,false) OR COALESCE(used.packed_qty,0)>g.total_output AS needs_review
      ) remainder
      WHERE f.status='ACTIVE' AND NOT g.is_test AND g.status='ACTIVE' AND ws.site_id=$1
        AND (${visibility}) AND COALESCE(g.total_output,0)>0
        AND EXISTS(SELECT 1 FROM pkg_grading_source_links gl WHERE gl.grading_id=g.id)
        AND NOT EXISTS(SELECT 1 FROM pkg_grading_source_links gl LEFT JOIN pkg_source_batches ss ON ss.id=gl.source_batch_id
          LEFT JOIN brd_houses sh ON sh.house_code=ss.house_code LEFT JOIN brd_farms sf ON sf.farm_code=sh.farm_code
          WHERE gl.grading_id=g.id AND (${sourceOwnerMismatch}
            OR EXISTS(SELECT 1 FROM production_cutover_scopes cs WHERE cs.company_code=f.company_code AND cs.house_code=ss.house_code AND cs.state<>'DRAFT')))
        AND ((${bucketBind}::text='CURRENT' AND ws.status='OPEN' AND g.shift_id::text=$2 AND NOT remainder.needs_review AND remainder.qty>0)
          OR (${bucketBind}::text='CARRYOVER' AND ws.status='CLOSED' AND ($2::text IS NULL OR g.shift_id::text<>$2)
            AND NOT remainder.needs_review AND remainder.qty>0)
          OR (${bucketBind}::text='REVIEW' AND ($2::text IS NULL OR g.shift_id::text=$2) AND remainder.needs_review))
      UNION ALL
      SELECT 'PACKING',p.id::text,p.code,p.shift_id::text,p.production_date::text,
        CASE WHEN ${bucketBind}::text='REVIEW' THEN NULL ELSE p.total_eggs END::numeric,'eggs',
        CASE WHEN ${bucketBind}::text='REVIEW' THEN 'PARTIAL_HANDOVER' ELSE 'VIEW' END,
        CASE WHEN ${bucketBind}::text='REVIEW' THEN 'Partial handover or inventory evidence needs review'
          WHEN ${bucketBind}::text='CURRENT' THEN 'Awaiting handover' ELSE 'Closed shift carryover' END,
        '/terminal/packaging/history/'||p.code,f.company_code,ws.site_id,NULL::text,NULL::text,
        CASE WHEN ${bucketBind}::text='REVIEW' THEN 'PARTIAL_HANDOVER' ELSE 'VIEW' END
      FROM eligible_packing p JOIN pkg_work_shifts ws ON ws.id=p.shift_id JOIN site_farm f ON f.farm_code=ws.site_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(to_jsonb(b)),'[]'::jsonb) rows FROM inv_batches b
        WHERE ${bucketBind}::text='REVIEW' AND (b.packaging_batch_ref=p.code OR b.source_no=p.code)
      ) inv ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(to_jsonb(l)),'[]'::jsonb) rows FROM inv_ledger l
        WHERE ${bucketBind}::text='REVIEW' AND (l.ref_no=p.code
          OR l.batch_no=ANY(ARRAY(SELECT x->>'batch_no' FROM jsonb_array_elements(inv.rows) x)))
      ) led ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(to_jsonb(h)),'[]'::jsonb) rows FROM pkg_handover_records h
        WHERE ${bucketBind}::text='REVIEW' AND h.packing_code=p.code
      ) ho ON true
      LEFT JOIN LATERAL (SELECT e.payload FROM pkg_packing_events e WHERE e.packing_id=p.id
        AND e.event_type='COMMIT_RECEIPT' AND ${bucketBind}::text='REVIEW') receipt ON true
      LEFT JOIN LATERAL (SELECT mode FROM inv_source_mode WHERE (scope_level='SITE' AND scope_code=ws.site_id)
        OR (scope_level='COMPANY' AND scope_code=f.company_code) OR (scope_level='GROUP' AND scope_code='ALL')
        ORDER BY CASE scope_level WHEN 'SITE' THEN 1 WHEN 'COMPANY' THEN 2 ELSE 3 END LIMIT 1) effective_mode ON true
      WHERE f.status='ACTIVE' AND (${visibility})
        AND ((${bucketBind}::text='REVIEW' AND (jsonb_array_length(ho.rows)>0 OR jsonb_array_length(inv.rows)>0
              OR jsonb_array_length(led.rows)>0 OR receipt.payload IS NOT NULL)
              AND (${warehouseVisible})
              AND packing_posting_state(to_jsonb(p),inv.rows,led.rows,ho.rows,receipt.payload)<>'COMMITTED')
          OR (${bucketBind}::text<>'REVIEW' AND effective_mode.mode='PACKAGING_INBOUND'
            AND NOT EXISTS(SELECT 1 FROM pkg_packing_events e WHERE e.packing_id=p.id AND e.event_type='COMMIT_RECEIPT')
            AND NOT EXISTS(SELECT 1 FROM pkg_handover_records h WHERE h.packing_code=p.code)
            AND NOT EXISTS(SELECT 1 FROM inv_batches b WHERE b.packaging_batch_ref=p.code OR b.source_no=p.code)
            AND NOT EXISTS(SELECT 1 FROM inv_ledger l WHERE l.ref_no=p.code)))
    ), counts AS (SELECT kind,count(*)::int n FROM visible GROUP BY kind),
    page AS (
      SELECT * FROM visible WHERE ${afterKindBind}::text IS NULL
        OR (${afterDateBind}::text IS NULL AND production_date IS NULL AND (kind,entity_id)>(${afterKindBind}::text,${afterIdBind}::text))
        OR (${afterDateBind}::text IS NOT NULL AND (production_date<${afterDateBind}::text OR production_date IS NULL
          OR (production_date=${afterDateBind}::text AND (kind,entity_id)>(${afterKindBind}::text,${afterIdBind}::text))))
      ORDER BY production_date DESC NULLS LAST,kind,entity_id LIMIT ${limitBind}
    )
    SELECT COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY production_date DESC NULLS LAST,kind,entity_id) FROM page),'[]') items,
      COALESCE((SELECT jsonb_object_agg(kind,n) FROM counts),'{}') counts`;
    const rows = await this.history.em.query(sql, [...params, cursor?.date ?? null, cursor?.kind ?? null, cursor?.id ?? null, pageSize + 1]);
    const row: {items: QueueRow[]; counts: Record<string, number>} = rows[0];
    const page = row.items.slice(0, pageSize);
    const formalCandidates = page.filter(x => ['FORMAL_RAW','FORMAL_INSTALLMENTS'].includes(x.route_code ?? ''));
    const legacyCandidates = page.filter(x => x.route_code === 'LEGACY_TEMP_INBOUND');
    const routeIds = new Set<string>();
    if (productionScope && (formalCandidates.length || legacyCandidates.length)) {
      const visibleRoutes = await this.history.em.query(`SELECT s.id::text id FROM pkg_source_batches s
        JOIN pkg_work_shifts ws ON ws.id=s.shift_id AND ws.site_id=$3
        JOIN brd_houses h ON h.house_code=s.house_code JOIN brd_farms f ON f.farm_code=h.farm_code
        JOIN wms_warehouses w ON w.company_code=f.company_code AND w.status='ACTIVE' AND w.type='EGG_FARM'
          AND w.domain='OPERATIONAL' AND (to_jsonb(w)->>'site_code' IS NULL OR to_jsonb(w)->>'site_code'=to_jsonb(f)->>'mapped_site_code')
          AND ($8::boolean OR w.warehouse_code=ANY($7::text[]))
        LEFT JOIN production_cutover_scopes cs ON cs.company_code=f.company_code AND cs.house_code=s.house_code AND cs.state='ACTIVE'
          AND s.production_date>=cs.first_production_date
        LEFT JOIN production_inventory_domains d ON d.scope_id=cs.id AND d.company_code=f.company_code AND d.warehouse_code=w.warehouse_code
        WHERE ((s.id=ANY($1::bigint[]) AND d.scope_id IS NOT NULL)
          OR (s.id=ANY($2::bigint[]) AND cs.id IS NULL))
          AND ($4::boolean OR (f.company_code=ANY($5::text[]) AND f.farm_code=ANY($6::text[])))`,
        [formalCandidates.map(x => x.entity_id),legacyCandidates.map(x => x.entity_id),siteCode,
          !!productionScope.isGlobal,productionScope.allowedCompanyCodes || [],productionScope.allowedFarmCodes || [],
          productionScope.allowedWarehouseCodes || [],!!productionScope.isGlobal]);
      for (const row of visibleRoutes) routeIds.add(String(row.id));
    }
    const items = page.map(x => {
      let href = x.action === 'GRADE' && bucket === 'CURRENT' ? '/terminal/packaging/grading' : x.href;
      if (['FORMAL_RAW','FORMAL_INSTALLMENTS','LEGACY_TEMP_INBOUND'].includes(x.route_code ?? '')) {
        const canRoute = Boolean(productionScope && x.site_code && routeIds.has(x.entity_id));
        if (canRoute) {
          const query = new URLSearchParams({companyCode:x.company_code ?? '',siteCode:x.site_code ?? '',
            houseCode:x.house_code ?? '',eggDate:x.production_date ?? '',queueAction:x.route_code ?? ''});
          if (x.route_code === 'FORMAL_RAW' && x.source_batch_code) query.set('sourceBatchCode',x.source_batch_code);
          href = x.route_code === 'LEGACY_TEMP_INBOUND'
            ? `/breeding/daily-inbound?${query.toString()}`
            : `/breeding/production-inbound?${query.toString()}`;
        } else {
          href = null;
          x.action = 'FORMAL_ROUTE_READ_ONLY';
        }
      }
      if (x.route_code === 'CUTOVER_REVIEW') href = null;
      return {kind:x.kind,code:x.code,shiftId:x.shift_id,productionDate:x.production_date,
        quantity:x.quantity === null ? null : Number(x.quantity),unit:x.unit,action:x.action,reason:x.reason,href,routeCode:x.route_code ?? null};
    });
    const last = page.at(-1);
    const nextCursor = row.items.length > pageSize && last ? this.encode(scopeKey, [last.production_date, last.kind, last.entity_id]) : null;
    return {items, counts: row.counts || {}, nextCursor};
  }

  private encode(key: string, tuple: any[]) { const body=Buffer.from(JSON.stringify({key,tuple})).toString('base64url'); return `${body}.${createHmac('sha256',this.cursorKey).update(body).digest('base64url')}`; }
  private decode(value: string | undefined, key: string) {
    if (!value) return null;
    if (typeof value !== 'string' || value.length > 2048) throw new BadRequestException('INVALID_FILTER');
    const [body, signature, extra] = String(value).split('.');
    if (!body || !signature || extra) throw new BadRequestException('INVALID_FILTER');
    const expected=createHmac('sha256',this.cursorKey).update(body).digest(); let supplied: Buffer;
    try { supplied=Buffer.from(signature,'base64url'); } catch { throw new BadRequestException('INVALID_FILTER'); }
    if (supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) throw new BadRequestException('INVALID_FILTER');
    try { const v=JSON.parse(Buffer.from(body,'base64url').toString()); if(v.key!==key||!Array.isArray(v.tuple)||v.tuple.length!==3) throw Error(); return {key:v.key,date:v.tuple[0],kind:v.tuple[1],id:v.tuple[2]}; } catch { throw new BadRequestException('INVALID_FILTER'); }
  }
}
