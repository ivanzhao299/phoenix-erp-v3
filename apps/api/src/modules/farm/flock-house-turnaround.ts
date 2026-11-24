import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

interface HouseState {
  state: 'OCCUPIED' | 'DIRTY' | 'CLEANING' | 'READY';
  document_id: string;
  last_occupied_on: string | null;
}
interface HouseStep {
  id: string;
  step: 'VACATED' | 'CLEAN_START' | 'CLEAN_ACCEPT';
  day: string;
  sequence: number;
  signed: boolean;
}
interface HouseEvidence {
  steps: HouseStep[];
  previously_used: boolean;
  open_occupancy: boolean;
}

// Correlated to the selected house h. Read the most recently posted document for each physical step.
export const HOUSE_TURNAROUND_EVIDENCE = `SELECT
  COALESCE((SELECT jsonb_agg(recent) FROM (
    SELECT DISTINCT ON (step) * FROM (
      SELECT id, CASE WHEN kind IN ('CLOSE','TRANSFER') THEN 'VACATED' ELSE kind END AS step,
        business_date::text AS day, posted_at IS NOT NULL AS signed, row_number() OVER (ORDER BY posted_at,id) AS sequence
      FROM brd_flock_documents
      WHERE house_code=h.house_code AND status='POSTED' AND kind IN ('CLOSE','TRANSFER','CLEAN_START','CLEAN_ACCEPT')
    ) history ORDER BY step,sequence DESC
  ) recent),'[]'::jsonb) AS steps,
  (EXISTS(SELECT 1 FROM brd_flock_occupancies WHERE house_code=h.house_code)
    OR EXISTS(SELECT 1 FROM brd_flocks WHERE house_code=h.house_code)
    OR EXISTS(SELECT 1 FROM brd_daily_logs WHERE house_code=h.house_code)
    OR EXISTS(SELECT 1 FROM brd_flock_documents WHERE house_code=h.house_code AND status='POSTED' AND kind IN ('ADMIT','BASELINE'))) AS previously_used,
  EXISTS(SELECT 1 FROM brd_flock_occupancies WHERE house_code=h.house_code AND ended_on IS NULL) AS open_occupancy`;

export function turnaroundBoundary(state: HouseState | undefined, evidence: HouseEvidence): HouseStep | null | undefined {
  const { steps,previously_used }=evidence;
  // null denotes the first cleaning of a genuinely unused house. undefined requires historical review.
  if (!state) return previously_used || steps.length ? undefined : null;
  const vacated=steps.find(row=>row.step==='VACATED');
  const clean=steps.find(row=>row.step==='CLEAN_START');
  const accepted=steps.find(row=>row.step==='CLEAN_ACCEPT');
  const current=state.state==='DIRTY'?vacated:state.state==='CLEANING'?clean:accepted;
  if (!current?.signed || current.id!==state.document_id || (vacated?.day??null)!==state.last_occupied_on) return undefined;
  if (previously_used && !vacated || vacated && !vacated.signed) return undefined;
  if (state.state!=='DIRTY' && (!clean?.signed || (vacated && (clean.sequence<=vacated.sequence || clean.day<vacated.day)))) return undefined;
  if (state.state==='READY' && (!accepted || !clean || accepted.sequence<=clean.sequence || accepted.day<clean.day)) return undefined;
  return current;
}

export function houseEntryReadiness(state: HouseState | undefined, evidence: HouseEvidence, hasLiveFlock: boolean) {
  if (state?.state==='OCCUPIED' || evidence.open_occupancy || hasLiveFlock) return 'OCCUPIED';
  if (turnaroundBoundary(state,evidence)===undefined) return 'HISTORY_REVIEW';
  return state?.state??'FIRST_CLEAN';
}

function assertTurnaroundDate(house: string, current: HouseStep | null | undefined, day: string) {
  if (current===undefined) throw new ConflictException({code:'FLOCK_HOUSE_HISTORY_REVIEW',houseCode:house,
    message:'鸡舍上次腾舍、清洗或验收依据不完整，请核对历史单据和实盘记录'});
  if (current && day<current.day) throw new ConflictException({
    code:'FLOCK_HOUSE_BUSINESS_DATE_CONFLICT',houseCode:house,documentId:current.id,earliestBusinessDate:current.day,
    message:`业务日期早于鸡舍最近的腾舍、清洗或验收单（${current.day}），请核对实际日期`,
  });
}

/** The transaction holds the same house lock as occupancy and cleaning changes. */
export async function assertHouseTurnaround(manager: EntityManager, house: string, state: HouseState | undefined, day: string) {
  const [evidence]=await manager.query(`SELECT e.* FROM (SELECT $1::text AS house_code) h
    CROSS JOIN LATERAL (${HOUSE_TURNAROUND_EVIDENCE}) e`,[house]);
  if (evidence.open_occupancy) throw new BadRequestException('鸡舍仍有有效占栏，不能办理清舍');
  assertTurnaroundDate(house,turnaroundBoundary(state,evidence),day);
}

export async function assertHouseReadyForEntry(manager: EntityManager, house: string, day: string, expectedVersion?: number) {
  const [row]=await manager.query(`SELECT s.state,s.document_id,s.version,s.last_occupied_on::text AS last_occupied_on,e.*,
    EXISTS(SELECT 1 FROM brd_flocks x WHERE x.house_code=h.house_code
      AND (x.status IS DISTINCT FROM 'RETIRED' OR COALESCE(x.current_qty,0)>0)) AS has_live_flock
    FROM (SELECT $1::text AS house_code) h LEFT JOIN brd_flock_house_states s ON s.house_code=h.house_code
    CROSS JOIN LATERAL (${HOUSE_TURNAROUND_EVIDENCE}) e`,[house]);
  const state=row.state?row:undefined;
  const readiness=houseEntryReadiness(state,row,row.has_live_flock);
  const blockers={
    OCCUPIED:'目标鸡舍仍有在栏鸡群，请先按实际情况腾舍并完成清舍验收',
    FIRST_CLEAN:'新空舍尚未完成首次清洗消毒和清舍验收，请先办理首次清洗及验收',
    DIRTY:'该鸡舍已腾空，请先办理清洗消毒及清舍验收',
    CLEANING:'该鸡舍正在清洗消毒，请先完成清舍验收',
  };
  if (readiness!=='READY' && readiness!=='HISTORY_REVIEW') {
    throw new BadRequestException({code:'FLOCK_HOUSE_ENTRY_'+readiness,houseCode:house,message:blockers[readiness]});
  }
  assertTurnaroundDate(house,turnaroundBoundary(state,row),day);
  if (row.last_occupied_on && day<=row.last_occupied_on) throw new BadRequestException('一期禁止同舍同日换群');
  if (expectedVersion!==undefined && row.version!==expectedVersion) throw new ConflictException({
    code:'FLOCK_HOUSE_ENTRY_VERSION_CHANGED',houseCode:house,message:'鸡舍验收或占栏版本已变化，请取消原单并按实际资料重新制单审核',
  });
}
