import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';

export interface FormalSourceAllocation {
  dailyLogId: number; reportHash: string; quantity: number;
  occupancyId: string; flockNo: string; houseCode: string; productionDate: string;
  snapshot: Record<string, unknown>;
}
export interface FormalProductionLineContext {
  documentId: string; documentNo: string; lineNo: number; scopeId: string;
  companyCode: string; houseCode: string; productionDate: string;postingDate:string;
  gradeCode: string; skuCode: string; productCode: string; quantity: number;
  contentHash: string; actor: string; allocations: FormalSourceAllocation[];
}
type BoundContext = FormalProductionLineContext & { batchNo?: string; recorded?: boolean };
const contexts = new WeakMap<object, BoundContext>();

/** An in-process transaction capability; never accepted as a DTO field or actor flag. */
export async function withFormalProductionLine<T>(m: EntityManager, context: FormalProductionLineContext, work: () => Promise<T>): Promise<T> {
  if (!m.queryRunner?.isTransactionActive || contexts.has(m)) throw new ConflictException('FORMAL_POSTING_TRANSACTION_REQUIRED');
  const bound: BoundContext = { ...context }; contexts.set(m, bound);
  try {
    const result = await work();
    if (!bound.batchNo || !bound.recorded) throw new ConflictException('FORMAL_POSTING_SOURCE_INCOMPLETE');
    return result;
  } finally { contexts.delete(m); }
}

export async function qualifyFormalProductionBatch(m: EntityManager, batchNo: string, p: {
  sourceNo?: string; sourceType?: string; companyCode: string; houseCode?: string;
  eggDate: string;postingDate?:string; qty: number; productCode: string; skuCode: string | null; grade: string;
}): Promise<void> {
  const c = contexts.get(m); if (!c) return;
  if (c.batchNo || p.sourceType !== 'TEMP_PRODUCTION' || p.sourceNo !== c.documentNo
    || p.companyCode !== c.companyCode || p.houseCode !== c.houseCode || p.eggDate !== c.productionDate
    || p.postingDate!==c.postingDate
    || p.qty !== c.quantity || p.productCode !== c.productCode || p.skuCode !== c.skuCode || p.grade !== c.gradeCode
    || c.allocations.reduce((n,a) => n+a.quantity,0) !== p.qty) throw new ConflictException('FORMAL_POSTING_IDENTITY_MISMATCH');
  await m.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,
    disposition,origin_kind,origin_ref,evidence_sha256,created_by,source_type,source_no)
    VALUES($1,$2,$3,$4,$5,'QUALIFIED','PRODUCTION',$6,$7,$8,'TEMP_PRODUCTION',$9)`,
  [batchNo,c.scopeId,c.companyCode,c.productCode,c.skuCode,`${c.documentNo}:${c.lineNo}`,c.contentHash,c.actor,c.documentNo]);
  c.batchNo = batchNo;
}

/** Allocations, raw receipt and exact trace are views of one input, not separate quantities. */
export async function recordFormalProductionSources(m: EntityManager, batchNo: string, profile: unknown): Promise<boolean> {
  const c = contexts.get(m); if (!c) return false;
  if (c.batchNo !== batchNo || c.recorded) throw new ConflictException('FORMAL_POSTING_SOURCE_MISMATCH');
  await m.query(`INSERT INTO brd_egg_day_routes(company_code,house_code,production_date,entry_mode)
    VALUES($1,$2,$3,'TEMP_PRODUCTION') ON CONFLICT DO NOTHING`, [c.companyCode,c.houseCode,c.productionDate]);
  const [route] = await m.query('SELECT entry_mode FROM brd_egg_day_routes WHERE company_code=$1 AND house_code=$2 AND production_date=$3', [c.companyCode,c.houseCode,c.productionDate]);
  if (route?.entry_mode !== 'TEMP_PRODUCTION') throw new ConflictException('同一舍日已走包装路径，不能重复生产入库');
  for (const a of c.allocations) {
    const sourceKey = `PIN:${c.documentId}:${c.lineNo}:${a.dailyLogId}`;
    const linkId = randomUUID();
    await m.query(`INSERT INTO brd_egg_source_receipts(company_code,source_key,daily_log_id,occupancy_id,
      house_code,production_date,quantity,entry_mode) VALUES($1,$2,$3,$4,$5,$6,$7,'TEMP_PRODUCTION')`,
    [c.companyCode,sourceKey,a.dailyLogId,a.occupancyId,a.houseCode,a.productionDate,a.quantity]);
    await m.query(`INSERT INTO inv_flock_source_links(id,batch_no,daily_log_id,occupancy_id,flock_no,house_code,
      company_code,production_date,source_key,grading_code,source_input_qty,batch_output_qty,allocated_output_qty,
      precision,source_profile_snapshot,origin_batch_no)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'',$10,$11,$10,'EXACT',$12,$2)`,
    [linkId,batchNo,a.dailyLogId,a.occupancyId,a.flockNo,a.houseCode,c.companyCode,a.productionDate,sourceKey,
      a.quantity,c.quantity,JSON.stringify(profile)]);
    // The orchestrator inserts its line, then the allocations, after the inventory writer returns.
    a.snapshot = { ...a.snapshot, sourceKey, sourceLinkId: linkId };
  }
  c.recorded = true;
  return true;
}
