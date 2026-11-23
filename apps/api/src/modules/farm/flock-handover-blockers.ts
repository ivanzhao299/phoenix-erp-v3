import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OrgScope, scopeWhere } from './farm.service';

export interface HandoverBlocker {
  reference: string;
  reason: 'SOURCE_MISMATCH' | 'AWAITING_SIGNATURE' | 'WRONG_OR_DUPLICATE_ROUTE' | 'AWAITING_POSTING' | 'OPEN_DOCUMENT' | 'AFTER_CLOSE_DATE' | 'OTHER_SCOPE_REVIEW';
}

// Called only for a new intent, under the same house lock as closing. Replays can still read the original.
export async function assertFlockOpenForHandover(manager: EntityManager, company: string, house: string, productionDate: string) {
  const [balance]=await manager.query(`SELECT b.closed_on FROM (SELECT flock_no FROM brd_flock_occupancies
    WHERE company_code=$1 AND house_code=$2 AND began_on<=$3 ORDER BY began_on DESC,id LIMIT 1) o
    JOIN brd_flock_balances b ON b.flock_no=o.flock_no FOR SHARE OF b`,[company,house,productionDate]);
  if (balance?.closed_on) throw new ConflictException({code:'FLOCK_HANDOVER_CLOSED',message:'该群已关闭，不能新增交接；请查询原回执或办理受控差异核验'});
}

/** Stable signed source identities determine which flock can close. Later stock consumption or a
 * report amendment does not undo a completed handover. The posting caller holds the shared house lock. */
export async function flockHandoverBlockers(manager: EntityManager, occupancyId: string, through: string, scope: OrgScope): Promise<HandoverBlocker[]> {
  const [schema] = await manager.query(`SELECT to_regclass('production_physical_handovers') AS handovers,
    to_regclass('production_raw_receipts') AS raw`);
  if (!schema.handovers) return [];
  const rawJoin = schema.raw
    ? "LEFT JOIN production_raw_receipts r ON r.handover_id=h.id AND r.state<>'CANCELLED'"
    : 'LEFT JOIN (SELECT NULL::uuid AS id, NULL::text AS state, NULL::uuid AS handover_id) r ON false';
  const rawQuantity = schema.raw
    ? `(SELECT SUM(rs.quantity) FROM production_raw_receipt_segments rs WHERE rs.receipt_id=r.id
          AND rs.handover_line_id::text=s->>'id' AND rs.daily_log_id=dl.id AND rs.occupancy_id=o.id
          AND rs.flock_no=o.flock_no AND rs.grade_code=s->>'gradeCode')`
    : 'NULL::bigint';

  const params:unknown[]=[occupancyId,through];
  const visible=scopeWhere(scope,params,'o.')||'true';
  return manager.query(`WITH occupancy AS (
    SELECT o.* FROM brd_flock_occupancies o JOIN brd_flock_occupancies selected
      ON selected.id=$1 AND o.flock_no=selected.flock_no AND o.company_code=selected.company_code AND o.began_on<=selected.began_on
  ), work AS (
    SELECT o.id AS occupancy_id,h.handover_ref AS reference, CASE
      WHEN h.production_date>$2::date THEN 'AFTER_CLOSE_DATE'
      WHEN NOT facts.valid THEN 'SOURCE_MISMATCH'
      WHEN h.state='DRAFT' THEN 'AWAITING_SIGNATURE'
      WHEN (h.payload ? 'rawCollection' AND d.id IS NOT NULL)
        OR (NOT (h.payload ? 'rawCollection') AND r.id IS NOT NULL) THEN 'WRONG_OR_DUPLICATE_ROUTE'
      WHEN COALESCE(d.state,r.state,'')<>'POSTED' THEN 'AWAITING_POSTING'
      WHEN NOT facts.posted THEN 'SOURCE_MISMATCH'
    END AS reason
    FROM occupancy o JOIN production_physical_handovers h ON h.company_code=o.company_code AND h.house_code=o.house_code
      AND h.production_date>=o.began_on AND (o.ended_on IS NULL OR h.production_date<o.ended_on)
      AND h.state<>'CANCELLED'
    LEFT JOIN production_inbound_documents d ON d.kind='INBOUND' AND d.state<>'CANCELLED' AND d.company_code=h.company_code
      AND d.house_code=h.house_code AND d.production_date=h.production_date AND d.scope_id=h.scope_id AND d.handover_ref=h.handover_ref
    ${rawJoin}
    CROSS JOIN LATERAL (
      SELECT COUNT(*)=COUNT(DISTINCT s->>'id') AND COALESCE(bool_and(dl.id IS NOT NULL AND (s->>'occupancyId') IS NOT DISTINCT FROM o.id
        AND (s->>'flockNo') IS NOT DISTINCT FROM o.flock_no),false) AS valid,
        COALESCE(bool_and((CASE WHEN h.payload ? 'rawCollection' THEN ${rawQuantity}
          ELSE (SELECT SUM(a.quantity) FROM production_inbound_allocations a
            JOIN production_inbound_lines l ON l.document_id=a.document_id AND l.line_no=a.line_no
            WHERE a.document_id=d.id AND a.direction=1 AND a.daily_log_id=dl.id AND l.grade_code=s->>'gradeCode'
              AND a.source_snapshot->>'handoverId'=h.id::text AND a.source_snapshot->>'handoverContentHash'=h.content_hash
              AND a.source_snapshot->>'handoverLineId'=s->>'id') END)::text IS NOT DISTINCT FROM s->>'quantity'
              AND jsonb_typeof(s->'quantity')='number'),false) AS posted
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(h.payload->'sources')='array' THEN h.payload->'sources' ELSE '[]'::jsonb END) s
      LEFT JOIN brd_daily_logs dl ON dl.id=CASE WHEN pg_input_is_valid(s->>'dailyLogId','bigint') THEN (s->>'dailyLogId')::bigint END AND dl.occupancy_id=o.id AND dl.flock_no=o.flock_no
        AND dl.house_code=o.house_code AND dl.log_date=h.production_date
    ) facts
    UNION ALL
    SELECT o.id,d.document_no, CASE WHEN d.production_date>$2::date THEN 'AFTER_CLOSE_DATE' ELSE 'OPEN_DOCUMENT' END FROM occupancy o JOIN production_inbound_documents d
      ON d.company_code=o.company_code AND d.house_code=o.house_code AND d.production_date>=o.began_on
      AND (o.ended_on IS NULL OR d.production_date<o.ended_on) AND d.state IN ('DRAFT','READY','APPROVED')
    UNION ALL
    SELECT o.id,dl.id::text, 'AFTER_CLOSE_DATE' FROM occupancy o JOIN brd_daily_logs dl ON dl.occupancy_id=o.id
      AND dl.flock_no=o.flock_no AND dl.house_code=o.house_code AND dl.log_date>$2::date
  )
  SELECT DISTINCT CASE WHEN ${visible} THEN w.reference ELSE '其他授权场区' END AS reference,
    CASE WHEN ${visible} THEN w.reason ELSE 'OTHER_SCOPE_REVIEW' END AS reason
  FROM work w JOIN occupancy o ON o.id=w.occupancy_id WHERE w.reason IS NOT NULL ORDER BY reference,reason LIMIT 50`,params);
}
