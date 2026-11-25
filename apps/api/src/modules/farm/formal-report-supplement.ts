import { BadRequestException, ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

type FormalReportCoordinate = {
  houseCode: string;
  flockNo: string;
  businessDate: string;
  occupancyId: string;
  companyCode: string;
  farmCode: string;
  siteCode: string;
};

/** A previous month, exactly one effective occupancy, and its already reported sibling shifts. */
export async function availableFormalReportShifts(db: EntityManager, identity: FormalReportCoordinate): Promise<string[]> {
  const {houseCode, flockNo, businessDate, occupancyId, companyCode, farmCode, siteCode} = identity;
  const [schema] = await db.query("SELECT to_regclass('production_cutover_scopes') AS cutover");
  if (!schema?.cutover) return [];

  const rows: { shift: string }[] = await db.query(`
    WITH eligible AS (
      SELECT o.id
      FROM brd_flock_occupancies o
      JOIN brd_flock_balances b ON b.flock_no=o.flock_no AND b.company_code=o.company_code
      WHERE o.id=$1 AND o.flock_no=$2 AND o.house_code=$3 AND o.company_code=$4 AND o.farm_code=$5 AND COALESCE(o.site_code,'')=$6
        AND o.began_on<=$7::date AND (o.ended_on IS NULL OR o.ended_on>$7::date)
        AND NOT EXISTS (SELECT 1 FROM brd_flock_occupancies overlap WHERE overlap.id<>o.id AND overlap.house_code=o.house_code
          AND overlap.began_on<=$7::date AND (overlap.ended_on IS NULL OR overlap.ended_on>$7::date))
        AND $7::date<date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Singapore')::date
        AND (b.baseline_on<$7::date OR b.baseline_on=$7::date AND NOT EXISTS (
          SELECT 1 FROM brd_flock_events e WHERE e.flock_no=o.flock_no AND e.kind='BASELINE'))
        AND (SELECT count(*) FROM production_cutover_scopes s WHERE s.house_code=o.house_code AND s.state<>'DRAFT')=1
        AND EXISTS (SELECT 1 FROM production_cutover_scopes s WHERE s.company_code=o.company_code
          AND s.house_code=o.house_code AND s.first_production_date<=$7::date AND s.state='ACTIVE')
        AND NOT EXISTS (SELECT 1 FROM brd_flock_documents d WHERE d.kind='CLOSE' AND d.status='POSTED'
          AND d.flock_no=o.flock_no AND d.house_code=o.house_code AND d.business_date=$7::date)
    ), expected AS (
      SELECT dict_code,sort_no FROM sys_dict
      WHERE dict_type='PRODUCTION_REPORT_SHIFT' AND status='ACTIVE' AND dict_code<>'DAILY'
    ), actual AS (
      SELECT shift,occupancy_id,flock_no,company_code,farm_code,site_code,business_date
      FROM brd_daily_logs WHERE house_code=$3 AND log_date=$7::date
    )
    SELECT e.dict_code AS shift FROM expected e
    WHERE EXISTS (SELECT 1 FROM eligible)
      AND EXISTS (SELECT 1 FROM actual)
      AND (SELECT count(*)=count(DISTINCT shift) FROM actual)
      AND NOT EXISTS (
        SELECT 1 FROM actual a LEFT JOIN expected ex ON ex.dict_code=a.shift
        WHERE ex.dict_code IS NULL OR a.occupancy_id IS DISTINCT FROM $1 OR a.flock_no IS DISTINCT FROM $2
          OR a.company_code IS DISTINCT FROM $4 OR a.farm_code IS DISTINCT FROM $5 OR COALESCE(a.site_code,'') IS DISTINCT FROM $6
          OR a.business_date IS DISTINCT FROM $7::date
      )
      AND NOT EXISTS (SELECT 1 FROM actual a WHERE a.shift=e.dict_code)
    ORDER BY e.sort_no,e.dict_code`,[occupancyId,flockNo,houseCode,companyCode,farmCode,siteCode,businessDate]);
  return rows.length===1 ? [rows[0].shift] : [];
}

export async function requireFormalReportShift(db: EntityManager, identity: FormalReportCoordinate, shift: string) {
  if (!(await availableFormalReportShifts(db, identity)).includes(shift)) {
    throw new ConflictException({code:'FLOCK_FORMAL_SHIFT_UNAVAILABLE',message:'该班次已存在，或原舍日、占栏、正式分班范围已变化'});
  }
}

export function formalReportShiftInput(value: unknown, occupancyId: unknown) {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(value) || value === 'DAILY'
    || typeof occupancyId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(occupancyId)) {
    throw new BadRequestException('须指定正式班次与完整历史占栏编号');
  }
}

export async function hasFormalReportAuthorization(db: EntityManager, documentId: string) {
  const [authorization] = await db.query(`
    SELECT a.id FROM brd_flock_documents d JOIN brd_flock_documents a
      ON a.company_code=d.company_code AND a.flock_no=d.flock_no AND a.house_code=d.house_code
      AND a.payload->>'authorizedSourceKey'=d.source_key AND a.payload->>'authorizedShiftDocumentId'=d.id
    WHERE d.id=$1 AND a.kind='HISTORY_AUTH' AND a.status='POSTED'
      AND a.payload->>'periodFrom'<=d.business_date::text AND a.payload->>'periodTo'>=d.business_date::text
      AND (COALESCE(d.payload->>'periodApprovalRef','')='' OR a.id=d.payload->>'periodApprovalRef')
    LIMIT 1`, [documentId]);
  return Boolean(authorization);
}
