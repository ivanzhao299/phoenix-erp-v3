import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

interface HouseState {
  state: 'DIRTY' | 'CLEANING' | 'READY';
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
    OR EXISTS(SELECT 1 FROM brd_flocks WHERE house_code=h.house_code)) AS previously_used`;

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

/** The transaction holds the same house lock as occupancy and cleaning changes. */
export async function assertHouseTurnaround(manager: EntityManager,house:string,state: HouseState | undefined,day:string) {
  const [evidence]=await manager.query(`SELECT e.* FROM (SELECT $1::text AS house_code) h
    CROSS JOIN LATERAL (${HOUSE_TURNAROUND_EVIDENCE}) e`,[house]);
  const current=turnaroundBoundary(state,evidence);
  if (current===undefined) throw new ConflictException({code:'FLOCK_HOUSE_HISTORY_REVIEW',houseCode:house,
    message:'鸡舍上次腾舍、清洗或验收依据不完整，请核对历史单据和实盘记录'});
  if (current && day<current.day) throw new ConflictException({
    code:'FLOCK_HOUSE_BUSINESS_DATE_CONFLICT',houseCode:house,documentId:current.id,earliestBusinessDate:current.day,
    message:`业务日期早于鸡舍最近的腾舍、清洗或验收单（${current.day}），请核对实际日期`,
  });
}
