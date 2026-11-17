import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ClsService } from 'nestjs-cls';
import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { WmsService } from './wms.service';
import { LabelsService } from '../terminal/labels.service';
import { guardPackagingSourceReferences, guardPackingSourceReferences } from '../bff/packaging-protection';
import { resolvePackagingSourceContext } from '../bff/packaging-readiness';
import { ProductionInboundService } from '../sales-v2/services/production-inbound.service';
import { TempProductionReversalDictSeed1794904000000 } from '../../database/migrations/1794904000000-TempProductionReversalDictSeed';
import { GenericCrudService } from '../generic-crud/generic-crud.service';
import { inspectTempProductionReversal, TempReversalPlan, TempReversalApprovalVerifier } from './temp-production-reversal-case';
import { readTempProductionReversalState, singaporeBusinessDate, TEMP_PRODUCTION_REVERSAL_CASE as c } from './temp-production-reversal';

const url=process.env.TEMP_REVERSAL_PG_URL;
const baseline=process.env.TEMP_REVERSAL_BASELINE_DB||'phoenix_temp_reversal_baseline_v2';
const suite=url?describe:describe.skip;
suite('WmsService exact correction on owned PostgreSQL',()=>{
  let db:DataSource;
  let admin:DataSource;
  let caseDatabase='';let created=false;let iteration=0;
  const cls={get:()=>({isGlobal:true})} as unknown as ClsService;
  const release='b'.repeat(40);
  // This verifier exists only in test assembly. Production has no provider.
  const fixtureVerifier:TempReversalApprovalVerifier={runningReleaseSha:release,verify:async plan=>({caseId:c.id,planSha256:plan.planSha256,
    snapshotSha256:plan.snapshotSha256,releaseSha:plan.releaseSha,migrationLedgerSha256:plan.migrationLedgerSha256,
    executionDate:plan.executionDate,approvalRef:'OWNED-FIXTURE-NOT-PRODUCTION',technicalActor:'fixture-technical-actor',
    executionRun:'fixture-run',financialEvidenceRef:'owned-finance-fixture',financialEvidenceSha256:'d'.repeat(64),
    backupReceiptRef:'owned-backup-fixture',backupArchiveSha256:'e'.repeat(64),backupVerifiedAt:new Date().toISOString()})};
  const service=(em=db.manager)=>new WmsService(em,cls,fixtureVerifier);
  const opened:QueryRunner[]=[];
  const plan=()=>db.manager.transaction('REPEATABLE READ',async manager=>{
    await manager.query('SET TRANSACTION READ ONLY');return inspectTempProductionReversal(manager,release);
  });
  beforeAll(async()=>{
    const p=new URL(url!);
    if(p.hostname!=='127.0.0.1'||p.port!=='44889'||p.pathname!=='/phoenix_temp_reversal_fixture')throw Error('Owned reversal fixture required');
    admin=await new DataSource({type:'postgres',url,entities:[],synchronize:false,migrationsRun:false,installExtensions:false}).initialize();
    if(!/^phoenix_temp_reversal_baseline(?:_v\d+)?$/.test(baseline))throw Error('Owned baseline name required');
    const [{present}]=await admin.query("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1) AS present",[baseline]);
    if(!present)throw Error('Install the real 195 SQL + 114 TS owned baseline first');
  });
  afterAll(async()=>{if(admin?.isInitialized)await admin.destroy();});
  afterEach(async()=>{for(const runner of opened.splice(0)){
    if(runner.isTransactionActive)await runner.rollbackTransaction();if(!runner.isReleased)await runner.release();
  }if(db?.isInitialized)await db.destroy();if(created){await admin.query(`DROP DATABASE "${caseDatabase}"`);created=false;}});
  beforeEach(async()=>{
    caseDatabase=`temp_reversal_case_${process.pid}_${++iteration}`;
    if(!/^temp_reversal_case_\d+_\d+$/.test(caseDatabase))throw Error('Owned database name required');
    // Clone actual cold-install schema/constraints/ledger, never invented columns.
    await admin.query(`CREATE DATABASE "${caseDatabase}" TEMPLATE "${baseline}"`);created=true;
    const address=new URL(url!);address.pathname='/'+caseDatabase;
    db=await new DataSource({type:'postgres',url:address.toString(),entities:[],synchronize:false,migrationsRun:false,installExtensions:false}).initialize();
    // Documented legacy compatibility delta only; cold-install HOLD is tested
    // separately. These CREATE definitions are read verbatim from the snapshot,
    // not inferred from a candidate field list.
    const snapshot=readFileSync(resolve(__dirname,'../../../../..','docs/schema-snapshot.sql'),'utf8');
    const inboundSequence=snapshot.match(/CREATE SEQUENCE public\.wms_inbound_items_id_seq\n[\s\S]*?;/)?.[0];
    if(!inboundSequence)throw Error('Documented inbound sequence missing');await db.query(inboundSequence);
    for(const table of ['qa_inspections','qa_non_conformance','qa_product_inspections','wms_inbound_items']){
      const ddl=snapshot.match(new RegExp(`CREATE TABLE public\\.${table} \\([\\s\\S]*?\\n\\);`))?.[0];
      if(!ddl)throw Error('Documented legacy DDL missing: '+table);await db.query(ddl);
    }
    await db.query('TRUNCATE inv_ledger,inv_batches,brd_daily_logs CASCADE');
    for(const t of c.targets){
      await db.query(`INSERT INTO inv_batches(id,batch_no,qty,qty_available,company_code,warehouse_code,location_code,source_type,source_no,
        collection_batch_ref,egg_date,product_code,sku_code,grade_code_std,quality_grade,unit,spec_code,packaging_spec,base_quantity_version,
        store_code,material_code,legacy_source,status) VALUES($1,$2,30,30,$3,$4,$5,'TEMP_PRODUCTION',$6,$7,$8,$9,$10,$11,$11,'枚','LOOSE','LOOSE',1,NULL,NULL,NULL,'AVAILABLE')`,
      [t.id,t.batchNo,c.companyCode,c.warehouseCode,c.locationCode,c.sourceNo,c.collectionRef,c.originalDate,t.product,t.sku,t.grade]);
      await db.query(`INSERT INTO inv_ledger(id,batch_no,change_type,qty_change,ref_no,company_code,warehouse_code,location_code,sku_code,
        quality_grade,log_date,store_code,unit,created_at) VALUES($1,$2,'TEMP_PRODUCTION_INBOUND',30,$3,$4,$5,$6,$7,$8,$9,$4,NULL,'2026-11-17T01:02:51Z')`,
      [t.ledgerId,t.batchNo,c.sourceNo,c.companyCode,c.warehouseCode,c.locationCode,t.sku,t.grade,c.originalDate]);
    }
    await db.query("SELECT setval(pg_get_serial_sequence('inv_ledger','id'),1000)");
    await db.query(`INSERT INTO brd_daily_logs(id,log_date,house_code,shift,farm_code,company_code,flock_no,eggs_produced,eggs_by_grade)
      VALUES(106,'2026-11-17','HOUSE_MS_01','DAILY','LPH_MENGSAI','COMP-LAO-AGRI','FK-MUXSEJUAGOI',47930,'{"DIRTY":540,"BROKEN":230,"GRADE_0":540,"GRADE_1":11880,"GRADE_2":32760,"GRADE_3":1980}');
      `);
  });
  it('preflight is truly read-only, stable and explicit about pending financial authority',async()=>{
    const a=await plan(),b=await plan();
    expect(a.checks.filter(check=>!['CLEAR','NOT_APPLICABLE'].includes(check.status))).toEqual([]);
    expect(a.localStatus).toBe('CLEAR');expect(a.snapshotSha256).toBe(b.snapshotSha256);
    expect(a.financialAuthority).toBe('PENDING');expect(a.executionStatus).toBe('HOLD_FINANCIAL_AUTHORITY');
    await expect(db.manager.transaction('REPEATABLE READ',async manager=>{
      await manager.query('SET TRANSACTION READ ONLY');await manager.query('UPDATE inv_batches SET qty=0');
    })).rejects.toThrow('read-only');
  });
  it('real cold-install gaps remain UNKNOWN while inapplicable candidate aliases are explicit N/A',async()=>{
    await db.query('DROP TABLE qa_inspections,qa_non_conformance,qa_product_inspections,wms_inbound_items');
    const cold=await plan();expect(cold.localStatus).toBe('HOLD');
    expect(cold.checks.find(check=>check.code==='REFERENCE_SCHEMA:qa_non_conformance')?.status).toBe('UNKNOWN');
    expect(cold.checks.find(check=>check.code==='REFERENCE_SCHEMA:qa_product_inspections')?.status).toBe('UNKNOWN');
    expect(cold.checks.find(check=>check.code==='REFERENCE_SCHEMA:wms_inbound_items')?.status).toBe('UNKNOWN');
    expect(cold.checks.find(check=>check.code==='QA_JSON_SCHEMA:items_json')?.status).toBe('UNKNOWN');
    expect(cold.checks.find(check=>check.code==='HISTORICAL_CANDIDATE:brd_flocks.batch_no')?.status).toBe('NOT_APPLICABLE');
    expect(cold.checks.find(check=>check.code==='HISTORICAL_CANDIDATE:wms_stock_transfers.batch_no')?.status).toBe('NOT_APPLICABLE');
  });
  it('dedicated dictionary migration replays, safely removes its unused row and preserves pre-existing ownership',async()=>{
    const migration=new TempProductionReversalDictSeed1794904000000();
    await db.transaction(async manager=>{
      const q=manager.queryRunner!;await migration.up(q);await migration.up(q);
      expect(await q.query("SELECT 1 FROM typeorm_metadata WHERE name='TempProductionReversalDictSeed1794904000000'")).toHaveLength(1);
      await migration.down(q);expect(await q.query("SELECT 1 FROM sys_dict WHERE dict_type='INV_LEDGER_CHANGE_TYPE' AND dict_code='TEMP_PRODUCTION_REVERSAL'")).toHaveLength(0);
      await migration.up(q);
      await q.query("DELETE FROM typeorm_metadata WHERE name='TempProductionReversalDictSeed1794904000000'");
      await migration.up(q);await migration.down(q);
      expect(await q.query("SELECT 1 FROM sys_dict WHERE dict_type='INV_LEDGER_CHANGE_TYPE' AND dict_code='TEMP_PRODUCTION_REVERSAL'")).toHaveLength(1);
    });
  });
  it('dictionary down holds once immutable correction ledgers exist',async()=>{
    await service().reverseReviewedTempProductionInbound(await plan());
    await expect(db.transaction(manager=>new TempProductionReversalDictSeed1794904000000().down(manager.queryRunner!))).rejects.toThrow('immutable correction ledger');
    expect(await db.query("SELECT 1 FROM sys_dict WHERE dict_type='INV_LEDGER_CHANGE_TYPE' AND dict_code='TEMP_PRODUCTION_REVERSAL'")).toHaveLength(1);
  });
  it('checks actual QA serialized JSON including escaped text; malformed legacy JSON stays UNKNOWN',async()=>{
    const escaped=JSON.stringify([{batch:c.targets[0].batchNo}]).replace('EGG','\\u0045GG');
    await db.query('INSERT INTO qa_inspections(id,items_json) VALUES(1,$1)',[escaped]);
    expect((await plan()).checks.find(check=>check.code==='QA_JSON_REFERENCE:items_json')?.status).toBe('AMBIGUOUS');
    await db.query("UPDATE qa_inspections SET items_json='{broken'");
    expect((await plan()).checks.find(check=>check.code==='QA_JSON_REFERENCE:items_json')?.status).toBe('UNKNOWN');
  });
  it('does not confuse a packaging source numeric id with an inventory id',async()=>{
    await db.query("INSERT INTO pkg_source_batches(id,batch_code,source_inbound_no) VALUES(413,'UNRELATED','UNRELATED'); INSERT INTO pkg_exceptions(related_batch_id) VALUES('413')");
    expect((await plan()).checks.find(check=>check.code==='PACKAGING_EXCEPTION_CHAIN_REFERENCE')?.status).toBe('CLEAR');
    await db.query('UPDATE pkg_source_batches SET batch_code=$1 WHERE id=413',[c.targets[0].batchNo]);
    expect((await plan()).checks.find(check=>check.code==='PACKAGING_EXCEPTION_CHAIN_REFERENCE')?.status).toBe('AMBIGUOUS');
  });
  it('matches existing operational ledger canonical bytes for empty, fractional-millisecond legacy and ordered bigint TS vectors',async()=>{
    const ops=readFileSync(resolve(__dirname,'../../../../..','scripts/ops/chanjet-admission-schema-receipt.mjs'),'utf8');
    const sql=ops.match(/export const LEDGER_SQL = `([^`]+)`;/)![1];
    await db.query('TRUNCATE schema_migrations,migrations');
    for(const seed of ['',`INSERT INTO schema_migrations VALUES('b.sql','2026-11-17T01:00:00.123456Z'),('a.sql','2026-11-17T00:00:00.999999Z');
      INSERT INTO migrations(timestamp,name) VALUES(1794904000000,'Z'),(1794899000000,'A'),(1794904000000,'A');`]){
      if(seed)await db.query(seed);
      const rows=await db.query(sql), raw=String(Object.values(rows[0])[0]);
      const expected=createHash('sha256').update(JSON.stringify(JSON.parse(raw))).digest('hex');
      expect((await plan()).migrationLedgerSha256).toBe(expected);
    }
  });
  it('production service with no verifier holds without changing quantity or ledger',async()=>{
    await expect(new WmsService(db.manager,cls).reverseReviewedTempProductionInbound(await plan())).rejects.toThrow('not integrated');
    expect(await db.query('SELECT id FROM inv_ledger')).toHaveLength(2);
    expect((await db.query('SELECT qty FROM inv_batches')).map((r:{qty:string})=>Number(r.qty))).toEqual([30,30]);
  });
  it('actual WMS transaction writes exactly two negative ledgers, preserves dates/store mismatch/unknown money and replays once',async()=>{
    const approved=await plan(),before=await db.query('SELECT to_jsonb(d) AS fact FROM brd_daily_logs d');
    const result=await service().reverseReviewedTempProductionInbound(approved);expect(result.outcome).toBe('COMPLETED');
    expect(await readTempProductionReversalState(db.manager)).toBe('REVERSED');
    const rows=await db.query('SELECT qty_change,log_date::text,store_code,cost_change,unit FROM inv_ledger ORDER BY id');
    expect(rows.map((r:{qty_change:string})=>Number(r.qty_change))).toEqual([30,30,-30,-30]);
    expect(rows.slice(0,2).map((r:{log_date:string})=>r.log_date)).toEqual([c.originalDate,c.originalDate]);
    expect(rows.slice(2).map((r:{log_date:string})=>r.log_date)).toEqual([singaporeBusinessDate(),singaporeBusinessDate()]);
    expect(rows.slice(2).every((r:{store_code:null;cost_change:null;unit:string})=>r.store_code===null&&r.cost_change===null&&r.unit==='枚')).toBe(true);
    expect(await db.query('SELECT to_jsonb(d) AS fact FROM brd_daily_logs d')).toEqual(before);
    expect((await service().reverseReviewedTempProductionInbound(approved)).outcome).toBe('ALREADY_COMPLETED');
    expect(await db.query('SELECT id FROM inv_ledger')).toHaveLength(4);
    const close=await service().getDailyCloseSummary(singaporeBusinessDate());
    expect(close.data?.outbound_qty).toBe(0);expect(close.data?.correction_net_qty).toBe(-60);
  });
  it('stale available quantity and new downstream drafts fail CAS and leave original positive rows intact',async()=>{
    const approved=await plan();await db.query('UPDATE inv_batches SET qty_available=29 WHERE id=413');
    await expect(service().reverseReviewedTempProductionInbound(approved)).rejects.toThrow('CAS_HOLD');
    await db.query('UPDATE inv_batches SET qty_available=30 WHERE id=413');
    await db.query('INSERT INTO wms_outbound_items(batch_no) VALUES($1)',[c.targets[0].batchNo]);
    await expect(service().reverseReviewedTempProductionInbound(approved)).rejects.toThrow('CAS_HOLD');
    expect(await db.query('SELECT id FROM inv_ledger')).toHaveLength(2);
  });
  it('normalizes code whitespace like existing WMS resolution; it cannot hide a pending draft or bypass real guarded writers',async()=>{
    const alias=` ${c.targets[0].batchNo} `;
    await db.query('INSERT INTO wms_outbound_items(batch_no) VALUES($1)',[alias]);
    expect((await plan()).checks.find(check=>check.code==='REFERENCE:wms_outbound_items')?.status).toBe('MATCH');
    await db.query('DELETE FROM wms_outbound_items');
    await service().reverseReviewedTempProductionInbound(await plan());
    const printed=await new LabelsService(db.manager).recordPrint({batch_no:alias},7);
    expect(printed.msg).toContain('已核验冲销');
    await expect(new GenericCrudService(db.manager).create('wms_stocktake',{stocktake_no:'OWNED-BLOCKED',item:alias})).rejects.toThrow('已核验冲销');
    await expect(service().pdaStocktakeCount({lines:[{batch_no:alias,counted_qty:30}]},{username:'fixture-operator'})).rejects.toThrow('已核验冲销');
    expect(await db.query("SELECT 1 FROM wms_stocktake WHERE stocktake_no='OWNED-BLOCKED'")).toHaveLength(0);
    expect(await db.query('SELECT id FROM inv_ledger')).toHaveLength(4);
  });
  it('real replay SQL excludes only the complete corrected pair; ordinary zero and BROKEN rows still cause exact differences',async()=>{
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,source_type,source_no,collection_batch_ref,egg_date,quality_grade,
      grade_code_std,spec_code,qty,qty_available,product_code,sku_code,warehouse_code,location_code,status)
      VALUES('OWNED-NORMAL',$1,'TEMP_PRODUCTION',$2,$3,$4,'GRADE_1','GRADE_1','LOOSE',30,30,'OWNED-PRODUCT','OWNED-SKU',$5,$6,'AVAILABLE')`,
    [c.companyCode,c.sourceNo,c.collectionRef,c.originalDate,c.warehouseCode,c.locationCode]);
    const create=jest.fn();
    const inbound=new ProductionInboundService(db,cls,{createProductionBatch:create} as never,
      {resolveMode:async()=> 'TEMP_PRODUCTION_INBOUND'} as never,{} as never,{} as never);
    // Authorized master-context seam only; real persisted inventory/proof SQL
    // and replay comparisons run below. Other suites cover context authorization.
    jest.spyOn(inbound as any,'resolveMasterContext').mockResolvedValue({companyCode:c.companyCode,houseCode:c.houseCode,
      farmCode:c.farmCode,warehouseCode:c.warehouseCode,locationCode:c.locationCode});
    const request={companyCode:c.companyCode,houseCode:c.houseCode,eggDate:c.originalDate,idempotencyKey:c.sourceNo,items:[{grade:'GRADE_1',qty:30,spec:'LOOSE'}]};
    await expect(inbound.recordProductionInbound(request)).rejects.toThrow('数量或档位不同');
    await service().reverseReviewedTempProductionInbound(await plan());
    expect(await inbound.recordProductionInbound(request)).toMatchObject({idempotent:true,totalInbound:30});
    expect(create).not.toHaveBeenCalled();
    await db.query("UPDATE inv_batches SET qty=0,qty_available=0 WHERE batch_no='OWNED-NORMAL'");
    await expect(inbound.recordProductionInbound(request)).rejects.toThrow('数量或档位不同');
    await db.query("UPDATE inv_batches SET qty=30,qty_available=30 WHERE batch_no='OWNED-NORMAL'");
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,source_type,source_no,collection_batch_ref,egg_date,quality_grade,
      grade_code_std,spec_code,qty,qty_available,warehouse_code,location_code,status)
      VALUES('OWNED-BROKEN-ZERO',$1,'TEMP_PRODUCTION',$2,$3,$4,'BROKEN','BROKEN','LOOSE',0,0,$5,$6,'DAMAGED')`,
    [c.companyCode,c.sourceNo,c.collectionRef,c.originalDate,c.warehouseCode,c.locationCode]);
    await expect(inbound.recordProductionInbound(request)).rejects.toThrow('数量或档位不同');
    expect(create).not.toHaveBeenCalled();
  });
  it('partial evidence, a changed daily and changed cost stay HOLD',async()=>{
    await db.query("UPDATE inv_batches SET unit_cost=1 WHERE id=413");expect((await plan()).localStatus).toBe('HOLD');
    await db.query('UPDATE inv_batches SET unit_cost=0 WHERE id=413');
    await db.query('UPDATE brd_daily_logs SET eggs_produced=47990');expect((await plan()).localStatus).toBe('HOLD');
  });
  it('rejects a wrong daily company at initial preflight rather than merely hashing it',async()=>{
    await db.query("UPDATE brd_daily_logs SET company_code='OTHER'");
    expect((await plan()).checks.find(check=>check.code==='ORIGINAL_DAILY_UNCHANGED')?.status).toBe('MATCH');
  });
  it('distinguishes exact local voucher links from unrelated-type numeric ambiguity',async()=>{
    await db.query(`INSERT INTO chanjet_voucher_drafts(id,company_code,source_biz_type,source_biz_id,voucher_lines,raw_data) VALUES(1,$1,'OTHER','106','[]',NULL)`,[c.companyCode]);
    let p=await plan();expect(p.checks.find(x=>x.code==='LOCAL_VOUCHER_EXPLICIT_LINK')?.status).toBe('CLEAR');
    expect(p.checks.find(x=>x.code==='LOCAL_VOUCHER_NUMERIC_ID_ONLY')?.status).toBe('AMBIGUOUS');
    await db.query('UPDATE chanjet_voucher_drafts SET source_biz_id=$1',[c.sourceNo]);
    p=await plan();expect(p.checks.find(x=>x.code==='LOCAL_VOUCHER_EXPLICIT_LINK')?.status).toBe('MATCH');
  });
  it('rejects altered displayed snapshot and a changed execution day even when someone retains an approved hash',async()=>{
    const approved=await plan();approved.snapshot.batches[0].company_code='OTHER';
    await expect(service().reverseReviewedTempProductionInbound(approved)).rejects.toThrow('AUTHORITY_HOLD');
    const next=await plan();next.executionDate='2026-11-19';
    await expect(service().reverseReviewedTempProductionInbound(next)).rejects.toThrow('AUTHORITY_HOLD');
    expect(await db.query('SELECT id FROM inv_ledger')).toHaveLength(2);
  });
  it('completed retry preserves its receipt but reports post-state contamination or later context drift as HOLD',async()=>{
    const approved=await plan();await service().reverseReviewedTempProductionInbound(approved);
    await db.query('INSERT INTO qa_non_conformance(id,batch_no) VALUES(1,$1)',[c.targets[0].batchNo]);
    const dirty=await service().reverseReviewedTempProductionInbound(approved);
    expect(dirty.outcome).toBe('HOLD_POST_STATE');expect(dirty).toHaveProperty('previousOutcome','COMPLETED');
    await db.query('DELETE FROM qa_non_conformance');
    await db.query("INSERT INTO migrations(timestamp,name) VALUES(1794905000000,'LaterLegitimateSchema')");
    expect((await service().reverseReviewedTempProductionInbound(approved)).outcome).toBe('HOLD_CONTEXT_DRIFT');
    expect(await db.query('SELECT id FROM inv_ledger')).toHaveLength(4);
  });
  it('a real second-ledger failure rolls both quantities and the first negative row back',async()=>{
    const approved=await plan();
    await db.query(`CREATE FUNCTION reject_second_correction() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.change_type='TEMP_PRODUCTION_REVERSAL' AND NEW.batch_no='EGG-20261117-00007' THEN
        RAISE EXCEPTION 'owned second ledger fault'; END IF;RETURN NEW;END $$;
      CREATE TRIGGER owned_second_ledger BEFORE INSERT ON inv_ledger FOR EACH ROW EXECUTE FUNCTION reject_second_correction()`);
    try {
      await expect(service().reverseReviewedTempProductionInbound(approved)).rejects.toThrow('owned second ledger fault');
      expect((await db.query('SELECT qty,qty_available FROM inv_batches ORDER BY id')).map((row:{qty:string;qty_available:string})=>[Number(row.qty),Number(row.qty_available)])).toEqual([[30,30],[30,30]]);
      expect(await db.query('SELECT id FROM inv_ledger')).toHaveLength(2);
    } finally {await db.query('DROP TRIGGER owned_second_ledger ON inv_ledger;DROP FUNCTION reject_second_correction()');}
  });
  const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};};
  async function packagingGraph(){
    await db.query(`INSERT INTO pkg_source_batches(id,batch_code,source_inbound_no,house_code,production_date)
      VALUES(9001,'SRC-OWNED',$1,$2,$3)`,[c.targets[0].batchNo,c.houseCode,c.originalDate]);
    await db.query(`INSERT INTO pkg_grading_records(id,code,idempotency_key,payload_hash) VALUES(9002,'GRD-OWNED','owned-key',$1)`,['a'.repeat(64)]);
    await db.query("INSERT INTO pkg_grading_source_links(grading_id,source_batch_id,input_qty) VALUES(9002,9001,30)");
    await db.query("INSERT INTO pkg_packing_records(id,code,grading_code,grading_codes_json) VALUES(9003,'PKG-OWNED','GRD-OWNED','[\"GRD-OWNED\"]')");
  }
  it('whole DAILY source remains writable while OPEN and becomes ambiguous only after the strict reversal pair',async()=>{
    const source={batch_code:'SRC-WHOLE',source_inbound_no:c.sourceNo,house_code:c.houseCode};
    await db.transaction(async manager=>{
      await guardPackagingSourceReferences(manager,[source]);
      await manager.query('INSERT INTO pkg_source_batches(batch_code,source_inbound_no,house_code) VALUES($1,$2,$3)',[source.batch_code,source.source_inbound_no,source.house_code]);
    });
    expect(await db.query("SELECT id FROM pkg_source_batches WHERE batch_code='SRC-WHOLE'")).toHaveLength(1);
    await db.query("DELETE FROM pkg_source_batches WHERE batch_code='SRC-WHOLE'");
    await service().reverseReviewedTempProductionInbound(await plan());
    await expect(db.transaction(manager=>guardPackagingSourceReferences(manager,[source]))).rejects.toThrow('缺少逐批权威关联');
    await packagingGraph();
    await db.query('UPDATE pkg_source_batches SET source_inbound_no=$1 WHERE id=9001',[c.sourceNo]);
    await expect(db.transaction(manager=>guardPackingSourceReferences(manager,'PKG-OWNED','PRINT'))).rejects.toThrow('缺少逐批权威关联');
    await db.query('DELETE FROM inv_ledger WHERE ref_no=$1',['TEMP-PROD-REV-'+c.targets[1].ledgerId]);
    const partialAttempt=db.transaction(async manager=>{
      await guardPackagingSourceReferences(manager,[source]);
      await manager.query("INSERT INTO pkg_source_batches(batch_code,source_inbound_no) VALUES('SRC-PARTIAL',$1)",[c.sourceNo]);
    });
    await expect(partialAttempt).rejects.toBeInstanceOf(ConflictException);
    await expect(partialAttempt).rejects.toThrow('误入库更正证据不完整');
    expect(await db.query("SELECT id FROM pkg_source_batches WHERE batch_code='SRC-PARTIAL'")).toHaveLength(0);
  });
  it('actual normal-grade WMS association stays usable; a mixed header with a trimmed case detail is held as a whole',async()=>{
    await service().reverseReviewedTempProductionInbound(await plan());
    await db.query(`INSERT INTO inv_batches(id,batch_no,qty,qty_available,company_code,warehouse_code,location_code,source_type,source_no,
      collection_batch_ref,egg_date,product_code,sku_code,grade_code_std,quality_grade,unit,spec_code,packaging_spec,base_quantity_version,status)
      SELECT 9001,'EGG-OWNED-NORMAL',30,30,company_code,warehouse_code,location_code,source_type,source_no,collection_batch_ref,egg_date,
      'PRD-EGG-1','SKU-1-LOOSE','GRADE_1','GRADE_1',unit,spec_code,packaging_spec,base_quantity_version,status FROM inv_batches WHERE id=413`);
    await db.query("INSERT INTO wms_inbound(task_no,status) VALUES('IN-NORMAL','COMPLETED'),('IN-MIXED','COMPLETED')");
    await db.query("INSERT INTO wms_inbound_items(task_no,batch_no,qty) VALUES('IN-NORMAL','EGG-OWNED-NORMAL',30),('IN-MIXED','EGG-OWNED-NORMAL',30),('IN-MIXED',$1,30)",[' '+c.targets[1].batchNo+' ']);
    await db.transaction(async manager=>{
      await guardPackagingSourceReferences(manager,[{batch_code:'SRC-NORMAL',source_inbound_no:'IN-NORMAL',house_code:c.houseCode}]);
      await manager.query("INSERT INTO pkg_source_batches(batch_code,source_inbound_no,house_code) VALUES('SRC-NORMAL','IN-NORMAL',$1)",[c.houseCode]);
    });
    await expect(db.transaction(manager=>guardPackagingSourceReferences(manager,[{batch_code:'SRC-MIXED',source_inbound_no:'IN-MIXED',house_code:c.houseCode}]))).rejects.toThrow('缺少逐批权威关联');
    expect((await db.query("SELECT qty,qty_available FROM inv_batches WHERE batch_no='EGG-OWNED-NORMAL'")).map((r:{qty:string;qty_available:string})=>[Number(r.qty),Number(r.qty_available)])).toEqual([[30,30]]);
    // This proves case protection against real header/detail membership only.
    // The BFF API still lacks per-input quantity/stock authorization; it cannot
    // select the normal subset of a mixed or whole-DAILY source by a client flag.
  });
  it('packaging locks the complete house set before case rows; actual legacy resolver safely re-enters the same house',async()=>{
    await db.query(`INSERT INTO brd_farms(farm_code,company_code,status) VALUES($1,$2,'ACTIVE') ON CONFLICT(farm_code) DO NOTHING`,[c.farmCode,c.companyCode]);
    await db.query(`INSERT INTO brd_houses(house_code,farm_code,status) VALUES($1,$2,'ACTIVE') ON CONFLICT(house_code) DO NOTHING`,[c.houseCode,c.farmCode]);
    const trace:string[]=[];
    await db.transaction(async manager=>{
      const observed={query:async(sql:string,args?:unknown[])=>{trace.push(sql);return manager.query(sql,args);}} as EntityManager;
      await guardPackagingSourceReferences(observed,[{batch_code:'SRC-OWNED',source_inbound_no:c.targets[0].batchNo,house_code:c.houseCode}]);
      const firstHouse=trace.findIndex(sql=>sql.includes('phoenix:daily-house'));
      const firstBatch=trace.findIndex(sql=>sql.includes('FOR UPDATE'));
      expect(firstHouse).toBeGreaterThanOrEqual(0);expect(firstBatch).toBeGreaterThan(firstHouse);
      const context=await resolvePackagingSourceContext(observed,{houseCode:c.houseCode,eggDate:c.originalDate,historical:true});
      expect(context.houseCodes).toEqual([c.houseCode]);
      expect(trace.filter(sql=>sql.includes('phoenix:daily-house'))).toHaveLength(2);
      expect(trace.some(sql=>sql.includes('physical-stock-v1'))).toBe(false);
    });
  });
  it('pure PRINT resolves actual grading links and takes rows without house or physical pool locks',async()=>{
    await packagingGraph();const trace:string[]=[];
    await db.transaction(async manager=>{
      const observed={query:async(sql:string,args?:unknown[])=>{trace.push(sql);return manager.query(sql,args);}} as EntityManager;
      await guardPackingSourceReferences(observed,'PKG-OWNED','PRINT');
    });
    expect(trace.some(sql=>sql.includes('FOR UPDATE'))).toBe(true);
    expect(trace.join('\n')).not.toMatch(/pg_advisory|physical-stock/);
  });
  it('ordinary raw collection does not acquire case locks or require an absent warehouse module',async()=>{
    await db.query('ALTER TABLE wms_inbound RENAME TO owned_absent_wms_inbound');
    const trace:string[]=[];
    await db.transaction(async manager=>{
      const observed={query:async(sql:string,args?:unknown[])=>{trace.push(sql);return manager.query(sql,args);}} as EntityManager;
      await guardPackagingSourceReferences(observed,[{batch_code:'SRC-ORDINARY',source_inbound_no:'SRC-ORDINARY',house_code:c.houseCode}]);
    });
    expect(trace.join('\n')).not.toMatch(/FOR UPDATE|pg_advisory/);
  });
  async function blocked(waiter:number,blocker:number){
    const until=Date.now()+5000;
    while(Date.now()<until){const [r]=await db.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked',[waiter,blocker]);
      if(r.blocked)return;await new Promise(resolve=>setTimeout(resolve,20));}
    throw Error('Real PostgreSQL blocking edge not observed');
  }
  it('actual WMS waits behind an actual reference transaction and then holds, without stock writes',async()=>{
    const approved=await plan(),reference=db.createQueryRunner();opened.push(reference);await reference.connect();await reference.startTransaction();
    const [{pid:referencePid}]=await reference.query('SELECT pg_backend_pid() AS pid');
    // Same guard used by real labels/draft writers, followed by its real INSERT.
    const {lockTempProductionReferences}=await import('./temp-production-reversal');
    await lockTempProductionReferences(reference.manager,[c.targets[1].batchNo]);
    await reference.query("INSERT INTO lbl_records(label_no,batch_no) VALUES('OWNED-REFERENCE',$1)",[c.targets[1].batchNo]);
    const started=deferred();let correctionPid=0;
    const em={transaction:(callback:(manager:EntityManager)=>Promise<unknown>)=>db.transaction(async manager=>{
      const [{pid}]=await manager.query('SELECT pg_backend_pid() AS pid');correctionPid=pid;started.resolve();return callback(manager);
    })} as EntityManager;
    const pending=service(em).reverseReviewedTempProductionInbound(approved).then(()=>null,error=>error as Error);
    await started.promise;await blocked(correctionPid,referencePid);await reference.commitTransaction();
    expect((await pending)?.message).toContain('CAS_HOLD');
    expect(await db.query('SELECT id FROM inv_ledger')).toHaveLength(2);
  });
  it('actual correction commits first: actual waiting LabelsService observes the committed pair and creates no audit',async()=>{
    const approved=await plan(),atCommit=deferred(),releaseCommit=deferred();let correctionPid=0;
    const em={transaction:(callback:(manager:EntityManager)=>Promise<unknown>)=>db.transaction(async manager=>{
      const [{pid}]=await manager.query('SELECT pg_backend_pid() AS pid');correctionPid=pid;
      const result=await callback(manager);atCommit.resolve();await releaseCommit.promise;return result;
    })} as EntityManager;
    let correctionFailure:unknown;
    const correction=service(em).reverseReviewedTempProductionInbound(approved).catch(error=>{correctionFailure=error;atCommit.resolve();return null;});
    await atCommit.promise;
    if(correctionFailure)throw correctionFailure;
    const labelStarted=deferred();let labelPid=0;
    const labelEm={transaction:(callback:(manager:EntityManager)=>Promise<unknown>)=>db.transaction(async manager=>{
      const [{pid}]=await manager.query('SELECT pg_backend_pid() AS pid');labelPid=pid;labelStarted.resolve();return callback(manager);
    })} as EntityManager;
    const reference=new LabelsService(labelEm).recordPrint({batch_no:c.targets[1].batchNo},7);
    try{await labelStarted.promise;await blocked(labelPid,correctionPid);}finally{releaseCommit.resolve();}
    expect((await correction)?.outcome).toBe('COMPLETED');expect((await reference).code).toBe(500);
    expect(await db.query('SELECT id FROM lbl_records')).toHaveLength(0);
    expect(await readTempProductionReversalState(db.manager)).toBe('REVERSED');
  });
  it('packaging reference first: real WMS waits on the house, then refuses its fresh downstream source',async()=>{
    const approved=await plan(),reference=db.createQueryRunner();opened.push(reference);await reference.connect();await reference.startTransaction();
    const [{pid:referencePid}]=await reference.query('SELECT pg_backend_pid() AS pid');
    await guardPackagingSourceReferences(reference.manager,[{batch_code:'SRC-OWNED',source_inbound_no:c.targets[0].batchNo,house_code:c.houseCode}]);
    await reference.query('INSERT INTO pkg_source_batches(batch_code,source_inbound_no,house_code) VALUES($1,$2,$3)',['SRC-OWNED',c.targets[0].batchNo,c.houseCode]);
    const started=deferred();let correctionPid=0;
    const em={transaction:(callback:(manager:EntityManager)=>Promise<unknown>)=>db.transaction(async manager=>{
      const [{pid}]=await manager.query('SELECT pg_backend_pid() AS pid');correctionPid=pid;started.resolve();return callback(manager);
    })} as EntityManager;
    const pending=service(em).reverseReviewedTempProductionInbound(approved).then(()=>null,error=>error as Error);
    await started.promise;await blocked(correctionPid,referencePid);await reference.commitTransaction();
    expect((await pending)?.message).toContain('CAS_HOLD');expect(await db.query('SELECT id FROM inv_ledger')).toHaveLength(2);
  });
  it('WMS first: a real packaging writer waits on house then rejects the corrected source and inserts nothing',async()=>{
    const approved=await plan(),atCommit=deferred(),releaseCommit=deferred();let correctionPid=0;let failure:unknown;
    const em={transaction:(callback:(manager:EntityManager)=>Promise<unknown>)=>db.transaction(async manager=>{
      const [{pid}]=await manager.query('SELECT pg_backend_pid() AS pid');correctionPid=pid;const result=await callback(manager);
      atCommit.resolve();await releaseCommit.promise;return result;
    })} as EntityManager;
    const correction=service(em).reverseReviewedTempProductionInbound(approved).catch(error=>{failure=error;atCommit.resolve();return null;});
    await atCommit.promise;if(failure)throw failure;
    const reference=db.createQueryRunner();opened.push(reference);await reference.connect();await reference.startTransaction();
    const [{pid:referencePid}]=await reference.query('SELECT pg_backend_pid() AS pid');
    const pending=guardPackagingSourceReferences(reference.manager,[{batch_code:'SRC-OWNED',source_inbound_no:c.targets[0].batchNo,house_code:c.houseCode}]).then(()=>null,error=>error as Error);
    try{await blocked(referencePid,correctionPid);}finally{releaseCommit.resolve();}
    expect((await correction)?.outcome).toBe('COMPLETED');expect((await pending)?.message).toContain('已核验冲销');
    await reference.rollbackTransaction();expect(await db.query('SELECT id FROM pkg_source_batches WHERE source_inbound_no=$1',[c.targets[0].batchNo])).toHaveLength(0);
  });
});
