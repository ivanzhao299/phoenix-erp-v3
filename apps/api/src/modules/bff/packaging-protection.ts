import { assertOfficialInventoryBatches } from '../wms/official-inventory';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { lockTempProductionCaseRows, assertTempProductionReferenceAllowed, readTempProductionReversalState, TEMP_PRODUCTION_REVERSAL_CASE } from '../wms/temp-production-reversal';

type SourceReference = { batch_code?: unknown; source_inbound_no?: unknown; house_code?: unknown };
type CaseReferences = { batchNos: string[]; wholeDaily: boolean; mixedHeader: boolean };

/** Resolve actual WMS details; client source text is never an authorization token. */
async function caseBatchReferences(manager: Pick<EntityManager, 'query'>, sources: SourceReference[]): Promise<CaseReferences> {
  const c = TEMP_PRODUCTION_REVERSAL_CASE;
  const refs = [...new Set(sources.flatMap(source => [source.batch_code, source.source_inbound_no])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map(value=>value.trim()))];
  if (!refs.length) return { batchNos: [], wholeDaily: false, mixedHeader: false };
  const known = c.targets.map(target => target.batchNo);
  const direct = refs.filter(ref => known.includes(ref as typeof known[number]));
  const wholeDaily = refs.includes(c.sourceNo);
  const [relations]=await manager.query("SELECT to_regclass('wms_inbound') AS header,to_regclass('wms_inbound_items') AS lines");
  const headers = relations?.header ? await manager.query(`SELECT task_no,to_jsonb(h)->>'inbound_no' AS inbound_no FROM wms_inbound h
    WHERE (h.task_no=ANY($1::text[]) OR to_jsonb(h)->>'inbound_no'=ANY($1::text[])) AND h.status='COMPLETED'`,[refs]) : [];
  // Raw collection sources are independent of warehouse inbound. Do not make
  // ordinary packaging require a legacy detail table when no real header maps.
  if(headers.length&&!relations.lines)throw new ConflictException('入库来源缺少可核验明细结构，请先核对来源');
  const details: Array<{batch_no:string;task_no:string;inbound_no:string|null}> = headers.length ? await manager.query(`
    SELECT DISTINCT BTRIM(i.batch_no) AS batch_no,h.task_no,to_jsonb(h)->>'inbound_no' AS inbound_no FROM wms_inbound h
      JOIN wms_inbound_items i ON i.task_no=h.task_no
      WHERE h.task_no=ANY($1::text[]) AND i.batch_no IS NOT NULL`,[headers.map((row:{task_no:string})=>row.task_no)]) : [];
  const linked = details.filter(row => known.includes(row.batch_no as typeof known[number]));
  const mixedHeader = linked.some(row => details.some(detail => detail.task_no === row.task_no && !known.includes(detail.batch_no as typeof known[number])));
  const result = [...new Set([...refs, ...details.map(row => row.batch_no)])];
  const hasCaseReference = (source: SourceReference) => [source.batch_code, source.source_inbound_no].some(value => {
    const ref=typeof value==='string'?value.trim():value;
    return direct.includes(String(ref)) || linked.some(row => ref===row.task_no || ref===row.inbound_no);
  });
  if (sources.some(source => hasCaseReference(source) && source.house_code !== c.houseCode)) {
    throw new ConflictException('库存批次与包装来源鸡舍不一致，停止建立关联');
  }
  return { batchNos: result, wholeDaily, mixedHeader };
}

async function assertPackagingReferences(manager: EntityManager, references: CaseReferences): Promise<void> {
  const targets = references.wholeDaily ? TEMP_PRODUCTION_REVERSAL_CASE.targets.map(target => target.batchNo) : references.batchNos;
  await lockTempProductionCaseRows(manager, targets);
  // OPEN retains ordinary behavior. Corrupt/partial markers throw from the
  // strict classifier. A complete pair makes only this whole/mixed operation
  // ambiguous; there is no per-input batch quantity authority in this API.
  if ((references.wholeDaily || references.mixedHeader) && await readTempProductionReversalState(manager) === 'REVERSED') {
    throw new ConflictException('该日报或混合入库来源包含多个批次，缺少逐批权威关联，请核验包装来源');
  }
  await assertOfficialInventoryBatches(manager, references.batchNos);
  await assertTempProductionReferenceAllowed(manager, references.batchNos);
}

/** Only source identities read/authorized by the caller; no user-supplied lock flags. */
export async function guardPackagingSourceReferences(manager: EntityManager, sources: SourceReference[]): Promise<void> {
  const references = await caseBatchReferences(manager, sources);
  if (!references.batchNos.length && !references.wholeDaily) return;
  // Existing output generation subsequently resolves/locks all source houses.
  // Take that complete sorted house set before any input batch, using the
  // same key as production-inbound/correction. No quantity pool is added here.
  const houses = [...new Set([...sources.map(source => source.house_code), ...(references.wholeDaily ? [TEMP_PRODUCTION_REVERSAL_CASE.houseCode] : [])]
    .filter((value): value is string => typeof value === 'string' && value.length > 0))].sort();
  for (const house of houses) await manager.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1))", [house]);
  await assertPackagingReferences(manager, references);
}

export async function guardPackingSourceReferences(manager: EntityManager, code: string, operation: 'PRINT' | 'INVENTORY'): Promise<void> {
  const rows = await manager.query(`SELECT DISTINCT s.id,s.batch_code,s.source_inbound_no,s.house_code
    FROM pkg_packing_records p
    JOIN pkg_grading_records g ON g.code=p.grading_code
      OR g.code IN (SELECT jsonb_array_elements_text(COALESCE(p.grading_codes_json,'[]'::jsonb)))
    JOIN pkg_grading_source_links l ON l.grading_id=g.id
    JOIN pkg_source_batches s ON s.id=l.source_batch_id WHERE p.code=$1 ORDER BY s.id`, [code]);
  if (operation === 'PRINT') {
    // Pure printing does not enter production output generation or acquire pools/houses.
    await assertPackagingReferences(manager, await caseBatchReferences(manager, rows));
  } else await guardPackagingSourceReferences(manager, rows);
}

/** Explicit opt-in plus server-verified RBAC; names and client body flags carry no authority. */
export function packagingTestMode(req?: any): boolean {
  const mode = req?.headers?.['x-packaging-mode'];
  if (mode === undefined || mode === 'real') return false;
  if (mode !== 'test') throw new BadRequestException('无效的包装运行模式');
  const user = req?.user;
  if (user?.role !== 'ROLE_ADMIN' && !user?.roles?.includes('ROLE_ADMIN')) {
    throw new ForbiddenException('包装测试模式仅允许管理员显式调用');
  }
  return true;
}

export function assertPackagingMode(row: any, isTest: boolean): void {
  if (!row || row.is_test !== isTest) throw new ConflictException('记录不存在或不属于当前包装运行模式');
}

/** All terminal packing writers use this transaction lock, including VOID and inventory replay. */
export async function lockPacking(manager: EntityManager, code: string): Promise<void> {
  await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`terminal-packing:${code}`]);
}

export async function assertPackingCanEnterInventory(manager: Pick<EntityManager, 'query'>, code: string): Promise<any> {
  const [row] = await manager.query(`SELECT p.*, p.production_date::text AS production_date_text, ws.is_test AS shift_is_test
    FROM pkg_packing_records p LEFT JOIN pkg_work_shifts ws ON ws.id=p.shift_id WHERE p.code=$1`, [code]);
  if (!row || row.status !== 'ACTIVE' || row.is_test !== false || row.shift_is_test === true) {
    throw new ConflictException('测试或作废包装禁止交接及库存消费');
  }
  return row;
}

export async function assertNoPackingDownstream(manager: EntityManager, code: string): Promise<void> {
  const [r] = await manager.query(`SELECT
    EXISTS(SELECT 1 FROM pkg_handover_records WHERE packing_code=$1) AS handover,
    EXISTS(SELECT 1 FROM inv_batches WHERE packaging_batch_ref=$1 OR source_no=$1) AS inventory,
    EXISTS(SELECT 1 FROM inv_ledger WHERE ref_no=$1 OR batch_no=$1 OR batch_no IN
      (SELECT batch_no FROM inv_batches WHERE packaging_batch_ref=$1 OR source_no=$1)) AS ledger,
    (EXISTS(SELECT 1 FROM sal_order_item_batch_allocations WHERE batch_no=$1)
      OR EXISTS(SELECT 1 FROM store_sale_allocations WHERE batch_no=$1)
      OR EXISTS(SELECT 1 FROM sal_store_sale_items WHERE batch_no=$1)
      OR EXISTS(SELECT 1 FROM sal_order_items i CROSS JOIN LATERAL regexp_split_to_table(COALESCE(i.allocated_batch_no,''),'\\s*,\\s*') b WHERE b=$1)) AS sales`, [code]);
  if (!r || r.handover || r.inventory || r.ledger || r.sales) {
    throw new ConflictException('包装已有交接或库存/流水依赖，必须先经逆向业务处理');
  }
}
