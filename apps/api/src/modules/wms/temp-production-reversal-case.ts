import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  classifyTempProductionReversal, exactReversalNumber, reversalPlanHash, ReversalFact, ReversalQuery,
  TEMP_PRODUCTION_REVERSAL_CASE as c, ReversalCaseState, singaporeBusinessDate,
  REVERSAL_TYPE, REVERSAL_BUSINESS_TYPE, reversalReference,
} from './temp-production-reversal';

export type CaseCheck = { code: string; status: 'CLEAR' | 'MATCH' | 'AMBIGUOUS' | 'UNKNOWN' | 'NOT_APPLICABLE'; count?: number; evidence?: string };
export interface TempReversalPlan {
  schema: 'phoenix.temp-production-reversal-plan/v1';
  caseId: typeof c.id;
  releaseSha: string;
  migrationLedgerSha256: string;
  inspectedAt: string;
  executionDate: string;
  state: ReversalCaseState | 'BROKEN';
  snapshotSha256: string;
  planSha256: string;
  localStatus: 'CLEAR' | 'HOLD';
  financialAuthority: 'PENDING';
  executionStatus: 'HOLD_FINANCIAL_AUTHORITY';
  checks: CaseCheck[];
  snapshot: { batches: ReversalFact[]; originals: ReversalFact[]; daily: ReversalFact[] };
}

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pick = (row: ReversalFact, fields: readonly string[]): ReversalFact => Object.fromEntries(fields.map(field => [field,
  Object.prototype.hasOwnProperty.call(row, field) ? row[field] : { columnAbsent: true }]));
const batchFields = ['id','batch_no','qty','qty_available','company_code','warehouse_code','location_code','source_type','source_no',
  'collection_batch_ref','packaging_batch_ref','egg_date','product_code','sku_code','grade_code_std','quality_grade','unit','spec_code','packaging_spec',
  'base_quantity_version','store_code','material_code','legacy_source','status','unit_cost','created_at','updated_at'];
const originalFields = ['id','batch_no','change_type','qty_change','ref_no','company_code','warehouse_code','location_code',
  'sku_code','quality_grade','log_date','store_code','unit','business_type','unit_cost','cost_change','created_at'];

// Every active reference is checked regardless of draft/closed/zero quantity.
// Historical/ambiguous fields are deliberately reported, never guessed into a FK.
const references: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['wms_inbound_items',['batch_no']], ['wms_outbound',['batch_no']], ['wms_outbound_items',['batch_no']],
  ['wms_transfer',['batch_no']], ['wms_transfer_items',['source_batch_no','target_batch_no']],
  ['wms_stocktake',['batch_no','item']], ['wms_defect_dispositions',['batch_no','target_batch_no']],
  ['wms_stock_balance',['batch_no']], ['wms_stock_ledger',['batch_no']],
  ['sal_order_item_batch_allocations',['batch_no']], ['store_sale_allocations',['batch_no']],
  ['sal_store_sale_items',['batch_no']], ['pos_sale_items',['batch_no']], ['qa_non_conformance',['batch_no']],
  ['qa_product_inspections',['batch_no']], ['lbl_records',['batch_no']], ['pkg_tasks',['batch_no']],
  ['brd_vaccinations',['inventory_batch_no','batch_no']], ['brd_vaccination_issue_lines',['inventory_batch_no']],
  ['brd_medication_records',['inventory_batch_no','batch_no']], ['brd_medication_issue_lines',['inventory_batch_no']],
  ['inv_flock_source_links',['batch_no','origin_batch_no']],
];

// Confirmed absent from the canonical chain. If an old runtime actually has
// these literal columns, inspect them rather than fabricating them in a fixture.
const historicalCandidates: ReadonlyArray<readonly [string,string,string]> = [
  ['brd_flocks','batch_no','1794899000000-FlockBaseSchema: flock identity is flock_no; no inventory batch writer'],
  ['wms_stock_transfers','batch_no','Canonical chain and active WMS use wms_transfer/wms_transfer_items'],
  ['ord_order_items','batch_no','Legacy SELECT oi.* does not establish a batch column; no canonical column DDL'],
  ['store_receiving_items','batch_no','Legacy trace/CRUD only; canonical receiving chain uses transfer items'],
  ['qa_inspections','batch_no','QualityService creates items_json/fail_items_json, not this candidate column'],
];

type ColumnSet = Set<string> & { relationKind: string };
const physicalColumns=(metadata:Map<string,ColumnSet>,table:string,fields:readonly string[])=>
  ['r','p'].includes(metadata.get(table)?.relationKind||'') && fields.every(field=>metadata.get(table)?.has(field));

async function columns(db: ReversalQuery): Promise<Map<string, ColumnSet>> {
  // Catalog presence must not be confused with information_schema privilege
  // filtering. Unsupported views/foreign tables are UNKNOWN, not queried.
  const rows: Array<{ table_name: string; column_name: string | null; relation_kind: string }> = await db.query(`
    SELECT c.relname AS table_name,a.attname AS column_name,c.relkind AS relation_kind FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname=current_schema()`);
  const result = new Map<string, ColumnSet>();
  for (const row of rows) {
    if (!result.has(row.table_name)) result.set(row.table_name, Object.assign(new Set<string>(),{relationKind:row.relation_kind}));
    if(row.column_name)result.get(row.table_name)!.add(row.column_name);
  }
  return result;
}

async function localFinancialChecks(db: ReversalQuery, metadata: Map<string, ColumnSet>): Promise<CaseCheck[]> {
  const required = ['id','company_code','source_biz_type','source_biz_id','voucher_lines','raw_data'];
  if (!physicalColumns(metadata,'chanjet_voucher_drafts',required)) {
    return [{ code: 'LOCAL_VOUCHER_SCHEMA', status: 'UNKNOWN' }];
  }
  // An exact batch/source string is an explicit link. A bare numeric id only
  // establishes ambiguity (ids from unrelated business types commonly collide).
  // Read JSON recursively as scalar strings, without returning financial payloads.
  const rows: Array<{ explicit: boolean; id_only: boolean; count: string }> = await db.query(`
    WITH candidates AS (
      SELECT id,
        (source_biz_id=ANY($2::text[]) OR EXISTS(
          SELECT 1 FROM jsonb_path_query(jsonb_build_array(voucher_lines,raw_data),'strict $.** ? (@.type() == "string")') v
           WHERE v #>> '{}' = ANY($2::text[]))) AS explicit,
        source_biz_id=ANY($3::text[]) AS id_only
      FROM chanjet_voucher_drafts WHERE company_code=$1
    ) SELECT explicit,id_only,COUNT(*)::text AS count FROM candidates WHERE explicit OR id_only GROUP BY explicit,id_only`,
  [c.companyCode,[c.sourceNo,...c.targets.map(t => t.batchNo)],[String(c.dailyId),...c.targets.map(t => String(t.ledgerId))]]);
  const explicit = rows.filter(row => row.explicit).reduce((n,row) => n + Number(row.count),0);
  const ambiguous = rows.filter(row => !row.explicit && row.id_only).reduce((n,row) => n + Number(row.count),0);
  const checks: CaseCheck[] = [
    { code: 'LOCAL_VOUCHER_EXPLICIT_LINK', status: explicit ? 'MATCH' : 'CLEAR', count: explicit },
    { code: 'LOCAL_VOUCHER_NUMERIC_ID_ONLY', status: ambiguous ? 'AMBIGUOUS' : 'CLEAR', count: ambiguous },
  ];
  if (!physicalColumns(metadata,'chanjet_writeback_outbox',['draft_id'])) checks.push({ code: 'LOCAL_OUTBOX_SCHEMA', status: 'UNKNOWN' });
  else {
    const [row] = await db.query(`SELECT COUNT(*)::text AS count FROM chanjet_writeback_outbox o
      JOIN chanjet_voucher_drafts d ON d.id=o.draft_id WHERE d.company_code=$1
        AND d.source_biz_id=ANY($2::text[])`, [c.companyCode,[c.sourceNo,...c.targets.map(t=>t.batchNo),String(c.dailyId),...c.targets.map(t=>String(t.ledgerId))]]);
    checks.push({ code: 'LOCAL_OUTBOX_CANDIDATE_LINK', status: Number(row.count) ? 'AMBIGUOUS' : 'CLEAR', count: Number(row.count) });
  }
  return checks;
}

/** Caller owns a repeatable-read READ ONLY preflight or the already locked apply transaction. */
export async function inspectTempProductionReversal(db: ReversalQuery, releaseSha: string): Promise<TempReversalPlan> {
  if (!/^[a-f0-9]{40}$/.test(releaseSha)) throw new ConflictException('RELEASE_SHA_REQUIRED');
  const metadata = await columns(db), checks: CaseCheck[] = [];
  if(['inv_batches','inv_ledger','brd_daily_logs','sys_dict'].some(table=>!physicalColumns(metadata,table,[])))throw new ConflictException('TEMP_REVERSAL_CORE_SCHEMA_HOLD');
  const nos = c.targets.map(target => target.batchNo);
  const batches: ReversalFact[] = (await db.query('SELECT to_jsonb(b) AS fact FROM inv_batches b WHERE batch_no=ANY($1::text[]) ORDER BY batch_no', [nos])).map((row: { fact: ReversalFact })=>row.fact);
  const ledgers: ReversalFact[] = (await db.query('SELECT to_jsonb(l) AS fact FROM inv_ledger l WHERE BTRIM(batch_no)=ANY($1::text[]) ORDER BY id', [nos])).map((row: { fact: ReversalFact })=>row.fact);
  const daily: ReversalFact[] = (await db.query(`SELECT to_jsonb(d) AS fact FROM brd_daily_logs d
    WHERE log_date=$1::date AND house_code=$2 ORDER BY id`, [c.originalDate,c.houseCode])).map((row: { fact: ReversalFact })=>row.fact);
  let state: TempReversalPlan['state'] = 'OPEN';
  try { state = classifyTempProductionReversal(batches,ledgers); }
  catch { state='BROKEN'; checks.push({ code: 'STRICT_CORRECTION_PAIR', status: 'MATCH' }); }
  if (state === 'OPEN') {
    const originalsCorrect = batches.length===2 && ledgers.length===2 && c.targets.every(target=>{
      const b=batches.find(row=>row.batch_no===target.batchNo), l=ledgers.find(row=>exactReversalNumber(row.id)===target.ledgerId);
      return b && l && exactReversalNumber(b.id)===target.id && exactReversalNumber(b.qty)===30 && exactReversalNumber(b.qty_available)===30
        && b.company_code===c.companyCode && b.warehouse_code===c.warehouseCode && b.location_code===c.locationCode
        && b.source_type==='TEMP_PRODUCTION' && b.source_no===c.sourceNo && b.collection_batch_ref===c.collectionRef && b.packaging_batch_ref===null
        && b.egg_date===c.originalDate && b.product_code===target.product && b.sku_code===target.sku
        && b.grade_code_std===target.grade && b.quality_grade===target.grade && b.unit==='枚'
        && b.spec_code==='LOOSE' && b.packaging_spec==='LOOSE' && exactReversalNumber(b.base_quantity_version)===1
        && b.store_code===null && b.material_code===null && b.legacy_source===null && b.status==='AVAILABLE'
        && l.batch_no===target.batchNo && l.change_type==='TEMP_PRODUCTION_INBOUND' && exactReversalNumber(l.qty_change)===30
        && l.ref_no===c.sourceNo && l.company_code===c.companyCode && l.warehouse_code===c.warehouseCode && l.location_code===c.locationCode
        && l.sku_code===target.sku && l.quality_grade===target.grade && l.log_date===c.originalDate
        && l.store_code===c.companyCode && l.unit===null && l.business_type===null;
    });
    checks.push({ code:'EXACT_ORIGINAL_IDENTITY_AND_30_AVAILABLE', status:originalsCorrect?'CLEAR':'MATCH' });
  }
  const expectedGrades={DIRTY:540,BROKEN:230,GRADE_0:540,GRADE_1:11880,GRADE_2:32760,GRADE_3:1980};
  const originalDaily=daily.length===1 && exactReversalNumber(daily[0].id)===106 && daily[0].shift==='DAILY'
    && daily[0].company_code===c.companyCode && daily[0].farm_code===c.farmCode && daily[0].flock_no==='FK-MUXSEJUAGOI' && exactReversalNumber(daily[0].eggs_produced)===47930
    && digest(Object.entries((daily[0].eggs_by_grade||{}) as object).sort())===digest(Object.entries(expectedGrades).sort());
  checks.push({code:'ORIGINAL_DAILY_UNCHANGED',status:originalDaily?'CLEAR':'MATCH'});
  const costUntouched = batches.length===2 && batches.every(b=>exactReversalNumber(b.unit_cost)===0)
    && c.targets.every(t=>{const original=ledgers.find(row=>exactReversalNumber(row.id)===t.ledgerId);
      return original?.cost_change===null && (!Object.prototype.hasOwnProperty.call(original,'unit_cost') || original.unit_cost===null || exactReversalNumber(original.unit_cost)===0);});
  checks.push({code:'POST_SCHEMA_UNKNOWN_COST_PLACEHOLDER_UNCHANGED',status:costUntouched?'CLEAR':'UNKNOWN'});
  const dict = await db.query(`SELECT 1 FROM sys_dict WHERE dict_type='INV_LEDGER_CHANGE_TYPE' AND dict_code='TEMP_PRODUCTION_REVERSAL'
    AND dict_value='TEMP_PRODUCTION_REVERSAL' AND status='ACTIVE'`);
  checks.push({code:'DEDICATED_CORRECTION_TYPE_ACTIVE',status:dict.length===1?'CLEAR':'UNKNOWN'});

  for (const [table,fields] of references) {
    const available=metadata.get(table);
    if (!available || !['r','p'].includes(available.relationKind) || fields.some(field=>!available.has(field))) {
      checks.push({code:`REFERENCE_SCHEMA:${table}`,status:'UNKNOWN'}); continue;
    }
    const where=fields.map(field=>`BTRIM("${field}"::text)=ANY($1::text[])`).join(' OR ');
    const [row]=await db.query(`SELECT COUNT(*)::text AS count FROM "${table}" WHERE ${where}`,[nos]);
    const count=Number(row.count); checks.push({code:`REFERENCE:${table}`,status:count?'MATCH':'CLEAR',count});
  }
  for(const [table,field,evidence] of historicalCandidates){
    const available=metadata.get(table);
    if(!available || (['r','p'].includes(available.relationKind)&&!available.has(field))){
      checks.push({code:`HISTORICAL_CANDIDATE:${table}.${field}`,status:'NOT_APPLICABLE',evidence});continue;
    }
    if(!['r','p'].includes(available.relationKind)){checks.push({code:`HISTORICAL_CANDIDATE:${table}.${field}`,status:'UNKNOWN',evidence});continue;}
    const [row]=await db.query(`SELECT COUNT(*)::text AS count FROM "${table}" WHERE BTRIM("${field}"::text)=ANY($1::text[])`,[nos]);
    checks.push({code:`HISTORICAL_CANDIDATE:${table}.${field}`,status:Number(row.count)?'AMBIGUOUS':'CLEAR',count:Number(row.count),evidence});
  }
  // Actual quality writer serializes arbitrary items JSON. Preserve the old
  // trace's substring coverage and decode escaped JSON before scalar scanning.
  for(const field of ['items_json','fail_items_json']){
    if(!physicalColumns(metadata,'qa_inspections',[field])){
      checks.push({code:`QA_JSON_SCHEMA:${field}`,status:'UNKNOWN'});continue;
    }
    const [row]=await db.query(`WITH raw AS(SELECT to_jsonb(q)->$2 AS value FROM qa_inspections q), decoded AS(
      SELECT value,CASE WHEN jsonb_typeof(value)='string' THEN NOT pg_input_is_valid(value #>> '{}','jsonb') ELSE false END AS invalid,
        CASE WHEN jsonb_typeof(value)='string' THEN CASE WHEN pg_input_is_valid(value #>> '{}','jsonb')
          THEN (value #>> '{}')::jsonb ELSE NULL END ELSE value END AS parsed FROM raw)
      SELECT COUNT(*) FILTER(WHERE EXISTS(SELECT 1 FROM unnest($1::text[]) batch
        WHERE position(batch IN value::text)>0 OR position(batch IN parsed::text)>0))::text AS count,
        COUNT(*) FILTER(WHERE invalid)::text AS invalid_count FROM decoded`,[nos,field]);
    checks.push({code:`QA_JSON_REFERENCE:${field}`,status:Number(row.invalid_count)?'UNKNOWN':Number(row.count)?'AMBIGUOUS':'CLEAR',count:Number(row.count)});
  }
  if (!physicalColumns(metadata,'sal_order_items',['allocated_batch_no'])) checks.push({code:'REFERENCE_SCHEMA:sal_order_items',status:'UNKNOWN'});
  else {
    const [row]=await db.query(`SELECT COUNT(*)::text AS count FROM sal_order_items i WHERE EXISTS(
      SELECT 1 FROM regexp_split_to_table(COALESCE(i.allocated_batch_no,''),'\\s*,\\s*') token WHERE BTRIM(token)=ANY($1::text[]))`,[nos]);
    checks.push({code:'REFERENCE:sal_order_items',status:Number(row.count)?'MATCH':'CLEAR',count:Number(row.count)});
  }
  if (!physicalColumns(metadata,'pkg_source_batches',['source_inbound_no','batch_code'])) {
    checks.push({code:'REFERENCE_SCHEMA:pkg_source_batches',status:'UNKNOWN'});
  } else {
    const [row]=await db.query(`SELECT COUNT(*)::text AS count FROM pkg_source_batches
      WHERE BTRIM(source_inbound_no)=ANY($1::text[]) OR BTRIM(batch_code)=ANY($1::text[])`,[[...nos,c.sourceNo]]);
    checks.push({code:'REFERENCE:pkg_source_batches',status:Number(row.count)?'MATCH':'CLEAR',count:Number(row.count)});
  }
  // related_batch_id is a packaging source/packing id or code, never an ERP
  // inventory id. Resolve the real source -> grading -> packing chain first.
  const packagingColumns: Record<string,string[]>={pkg_exceptions:['batch_no','related_batch_id'],
    pkg_source_batches:['id','batch_code','source_inbound_no'],pkg_grading_source_links:['source_batch_id','grading_id'],
    pkg_grading_records:['id','code'],pkg_packing_records:['id','code','grading_code','grading_codes_json']};
  if(Object.entries(packagingColumns).some(([table,fields])=>!['r','p'].includes(metadata.get(table)?.relationKind||'')||fields.some(field=>!metadata.get(table)?.has(field)))){
    checks.push({code:'PACKAGING_EXCEPTION_CHAIN_SCHEMA',status:'UNKNOWN'});
  }else{
    const [row]=await db.query(`WITH sources AS (
      SELECT id,batch_code FROM pkg_source_batches WHERE BTRIM(batch_code)=ANY($1::text[]) OR BTRIM(source_inbound_no)=ANY($2::text[])
    ), gradings AS (SELECT g.code FROM pkg_grading_records g JOIN pkg_grading_source_links l ON l.grading_id=g.id JOIN sources s ON s.id=l.source_batch_id),
    packings AS (SELECT p.id,p.code FROM pkg_packing_records p WHERE EXISTS(SELECT 1 FROM gradings g WHERE p.grading_code=g.code OR p.grading_codes_json ? g.code))
    SELECT COUNT(*)::text AS count FROM pkg_exceptions e WHERE BTRIM(e.batch_no)=ANY($1::text[])
      OR EXISTS(SELECT 1 FROM sources s WHERE e.related_batch_id IN(s.id::text,s.batch_code))
      OR EXISTS(SELECT 1 FROM packings p WHERE e.related_batch_id IN(p.id::text,p.code))`,[nos,[...nos,c.sourceNo]]);
    checks.push({code:'PACKAGING_EXCEPTION_CHAIN_REFERENCE',status:Number(row.count)?'AMBIGUOUS':'CLEAR',count:Number(row.count)});
  }
  checks.push(...await localFinancialChecks(db,metadata));
  let migrationLedgerSha256='';
  try {
    const [row]=await db.query(`SELECT jsonb_build_object('legacy',coalesce((SELECT jsonb_agg(jsonb_build_object('filename',filename,'applied_at',extract(epoch from applied_at)*1000) ORDER BY filename) FROM schema_migrations),'[]'::jsonb),'typeorm',coalesce((SELECT jsonb_agg(jsonb_build_object('timestamp',timestamp,'name',name) ORDER BY timestamp,name) FROM migrations),'[]'::jsonb))::text AS ledger_text`);
    const ledger=JSON.parse(row.ledger_text) as {typeorm:Array<{timestamp:number|string;name:string}>};
    migrationLedgerSha256=digest(ledger);
    const required=[
      ['1794879957217','InvBatchesIntegrityConstraints1794879957217'],['1794880267031','InvLedgerChangeTypeDictSeed1794880267031'],
      ['1794885912725','InvEggCostingColumns1794885912725'],['1794899000000','FlockBaseSchema1794899000000'],
      ['1794900000000','FlockLifecycleLedger1794900000000'],['1794901000000','FlockProductionProvenance1794901000000'],
      ['1794902000000','FlockActivitySources1794902000000'],['1794903000000','FlockReportCorrection1794903000000'],
      ['1794904000000','TempProductionReversalDictSeed1794904000000'],
    ];
    checks.push({code:'REQUIRED_CASE_SCHEMA_MIGRATIONS_RECEIPTED',status:required.every(([timestamp,name])=>
      ledger.typeorm.some(entry=>String(entry.timestamp)===timestamp&&entry.name===name))?'CLEAR':'UNKNOWN'});
  } catch { checks.push({code:'MIGRATION_LEDGER_UNREADABLE',status:'UNKNOWN'}); }
  const snapshot={batches:batches.map(row=>pick(row,batchFields)), originals:ledgers.filter(row=>c.targets.some(t=>exactReversalNumber(row.id)===t.ledgerId)).map(row=>pick(row,originalFields)),
    daily:daily.map(row=>pick(row,['id','log_date','house_code','shift','farm_code','company_code','flock_no','eggs_produced','eggs_by_grade','created_at','updated_at']))};
  const snapshotSha256=digest({snapshot,checks,migrationLedgerSha256});
  const executionDate=singaporeBusinessDate();
  return {schema:'phoenix.temp-production-reversal-plan/v1',caseId:c.id,releaseSha,migrationLedgerSha256,
    inspectedAt:new Date().toISOString(),executionDate,state,snapshotSha256,
    planSha256:reversalPlanHash(snapshotSha256,releaseSha,migrationLedgerSha256,executionDate),
    localStatus:checks.every(check=>['CLEAR','NOT_APPLICABLE'].includes(check.status))?'CLEAR':'HOLD',financialAuthority:'PENDING',executionStatus:'HOLD_FINANCIAL_AUTHORITY',checks,snapshot};
}

/** No production provider is registered. Tests inject an owned fixture verifier. */
export const TEMP_REVERSAL_APPROVAL_VERIFIER = Symbol('TEMP_REVERSAL_APPROVAL_VERIFIER');
export interface TempReversalAuthority {
  caseId: string; planSha256: string; snapshotSha256: string; releaseSha: string; migrationLedgerSha256: string;
  executionDate: string; approvalRef: string; technicalActor: string; executionRun: string;
  financialEvidenceRef: string; financialEvidenceSha256: string;
  backupReceiptRef: string; backupArchiveSha256: string; backupVerifiedAt: string;
}
export interface TempReversalApprovalVerifier {
  /** Runtime release from the trusted controlled context, never request input. */
  readonly runningReleaseSha: string;
  /** Trusted server-side adapter must verify sealed source, actual approval and fresh backup. */
  verify(plan: TempReversalPlan): Promise<TempReversalAuthority>;
}

export function assertReversalAuthorityBinding(plan: TempReversalPlan, authority: TempReversalAuthority): void {
  const now=Date.now(), inspected=Date.parse(plan.inspectedAt), backup=Date.parse(authority.backupVerifiedAt);
  const bound=['caseId','planSha256','snapshotSha256','releaseSha','migrationLedgerSha256','executionDate'] as const;
  if (plan.schema!=='phoenix.temp-production-reversal-plan/v1' || plan.caseId!==c.id || plan.localStatus!=='CLEAR'
    || bound.some(field=>authority[field]!==plan[field])
    || plan.snapshotSha256!==digest({snapshot:plan.snapshot,checks:plan.checks,migrationLedgerSha256:plan.migrationLedgerSha256})
    || plan.planSha256!==reversalPlanHash(plan.snapshotSha256,plan.releaseSha,plan.migrationLedgerSha256,plan.executionDate)
    || plan.executionDate!==singaporeBusinessDate() || !Number.isFinite(inspected) || inspected>now+30000 || now-inspected>600000
    || !Number.isFinite(backup) || backup>now+30000 || now-backup>600000
    || ![authority.approvalRef,authority.technicalActor,authority.executionRun,authority.financialEvidenceRef,authority.backupReceiptRef]
      .every(value=>typeof value==='string' && value.length>0 && value===value.trim())
    || ![authority.financialEvidenceSha256,authority.backupArchiveSha256].every(value=>/^[a-f0-9]{64}$/.test(value))) {
    throw new ConflictException('TEMP_REVERSAL_AUTHORITY_HOLD: plan, date, sealed authority or fresh backup binding invalid');
  }
}

export function correctionLedgerParameters(plan: TempReversalPlan, authority: TempReversalAuthority) {
  return c.targets.map(target=>({
    batchNo:target.batchNo,changeType:REVERSAL_TYPE,qtyChange:-target.qty,operator:authority.technicalActor,
    storeCode:null,refNo:reversalReference(target.ledgerId),
    note:JSON.stringify({case_id:c.id,version:1,original_ledger_id:target.ledgerId,original_date:c.originalDate,
      original_cost_evidence:c.costEvidence,cost_status:'UNKNOWN_PRE_SCHEMA',original_store_code:c.companyCode,corrected_store_code:null,
      approval_ref:authority.approvalRef,execution_run:authority.executionRun,technical_actor:authority.technicalActor,
      snapshot_sha256:plan.snapshotSha256,release_sha:plan.releaseSha,migration_ledger_sha256:plan.migrationLedgerSha256,
      plan_sha256:plan.planSha256,execution_date:authority.executionDate,
      financial_evidence_ref:authority.financialEvidenceRef,financial_evidence_sha256:authority.financialEvidenceSha256,
      backup_receipt_ref:authority.backupReceiptRef,backup_archive_sha256:authority.backupArchiveSha256}),
    companyCode:c.companyCode,warehouseCode:c.warehouseCode,locationCode:c.locationCode,skuCode:target.sku,
    qualityGrade:target.grade,logDate:authority.executionDate,unit:'枚',costChange:null,businessType:REVERSAL_BUSINESS_TYPE,
  }));
}

const scopedWrites=new WeakMap<object,Map<string,Record<string,unknown>>>();

/** Internal WMS transaction capability, never a boolean/string accepted from HTTP. */
export async function withCorrectionLedgerWrites<T>(db: ReversalQuery, plan: TempReversalPlan, authority: TempReversalAuthority, write:()=>Promise<T>): Promise<T> {
  assertReversalAuthorityBinding(plan,authority);
  if (scopedWrites.has(db)) throw new ConflictException('TEMP_REVERSAL_WRITE_SCOPE_HOLD');
  const expected=new Map(correctionLedgerParameters(plan,authority).map(params=>[params.batchNo as string,params]));
  scopedWrites.set(db,expected);
  try {
    const result=await write();
    if(expected.size)throw new ConflictException('TEMP_REVERSAL_WRITE_INCOMPLETE');
    return result;
  } finally { scopedWrites.delete(db); }
}

/** The ordinary unified writer cannot invent the dedicated type/ref/quantity. */
export function consumeCorrectionLedgerWrite(db: ReversalQuery, params: Record<string,unknown>): void {
  const writes=scopedWrites.get(db), expected=writes?.get(String(params.batchNo));
  if(!expected || Object.keys(params).length!==Object.keys(expected).length
    || Object.keys(expected).some(key=>JSON.stringify(params[key])!==JSON.stringify(expected[key]))) {
    throw new ConflictException('TEMP_REVERSAL_WRITE_HOLD: dedicated correction requires the validated WMS transaction');
  }
  writes!.delete(String(params.batchNo));
}
