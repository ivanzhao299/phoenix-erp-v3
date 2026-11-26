import 'reflect-metadata';
import * as postingClock from '../../wms/temp-production-reversal';
import { ProductionDocumentContinuations1795400100000 } from '../../../database/migrations/1795400100000-ProductionDocumentContinuations';
import { assertOfficialInventoryBatches, officialInventoryCostKnownPredicate } from '../../wms/official-inventory';
import { inspectProductionCutoverEvidence, readProductionCutoverEvidence } from '../../wms/production-cutover-evidence';
import { cutoverEvidenceHash } from '../../wms/production-cutover-evidence';
import { CutoverProvenanceSigner, proveCrossCompanyTransfer } from '../../wms/cutover-cross-company-proof';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { installProductionInboundFixture } from './production-inbound.pg-fixture';
import { ProductionInboundDocumentsService, InboundDraftInput } from './production-inbound-documents.service';
import { ProductionInboundService } from './production-inbound.service';
import { EggInventoryService } from './egg-inventory.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { SkuAvailabilityService } from '../../product-master/services/sku-availability.service';
import { TransferCostEvidence1795658700000 } from '../../../database/migrations/1795658700000-TransferCostEvidence';
import { AlignWmsTransactionForms1787731200000 } from '../../../database/migrations/1787731200000-AlignWmsTransactionForms';
import { UpgradeWmsTransferLifecycle1787965200000 } from '../../../database/migrations/1787965200000-UpgradeWmsTransferLifecycle';
import { qualifyPurchaseInventory, purchaseReceiptBatchNo } from '../../wms/purchase-inventory-qualification';
import { sharedBatches } from '../../product-master/services/quantity-contract';
import { AddWmsDefectDisposition1794405000000 } from '../../../database/migrations/1794405000000-AddWmsDefectDisposition';
import { writeInvLedger } from '../../wms/inventory-ledger.writer';
import { INV_LEDGER_CHANGE_TYPE } from '../../wms/inv-ledger-change-types';
import { WmsService } from '../../wms/wms.service';
import { InventoryAnalyticsService } from '../../analytics/services/inventory-analytics.service';
import { effectiveExactProductionByGrade, effectiveProductionReceiptQuantity } from '../../farm/effective-production-source';

const url = process.env.OFFICIAL_INVENTORY_PG_URL;
const fixture = url ? describe : describe.skip;
fixture('formal installment documents — actual PostgreSQL 18 inventory and provenance', () => {
  let db: DataSource; let service: ProductionInboundDocumentsService; let legacy: ProductionInboundService;
  const schema = `inbound_documents_${process.pid}`;
  const grades = ['GRADE_0','GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','DIRTY','BROKEN'];
  let scope: any; let actor: any;
  const cls = { get:(key: string) => key === 'dataScope' ? scope : actor };
  const day = '2026-11-18';
  const proofSigner:CutoverProvenanceSigner={key:'SYNTHETIC-OWNED-CUTOVER-TRANSFER-PROOF-KEY',keyId:'owned-test-v1'};
  const input = (quantity = 100, gradeCode = 'GRADE_1'): InboundDraftInput => ({ companyCode:'COMP-A',houseCode:'HOUSE-A',
    eggDate:day,warehouseCode:'WH-A',locationCode:'LOC-A',intentKey:randomUUID(),handoverRef:`FIXTURE-${randomUUID()}`,
    evidenceFileIds:['FILE-HANDOVER'],items:[{ gradeCode,quantity,specCode:'LOOSE' }] });
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || !['/installments_fixture','/phoenix_temp_reversal_fixture'].includes(parsed.pathname)) throw new Error('Owned loopback fixture required');
    db = await new DataSource({ type:'postgres',url,entities:[],synchronize:false,migrationsRun:false,installExtensions:false,
      extra:{ options:`-c search_path=${schema}`,max:10 } }).initialize();
    const [{ server_version:version }] = await db.query('SHOW server_version');
    if (!version.startsWith('18.')) throw new Error('PostgreSQL 18 required');
    await db.query(`CREATE SCHEMA "${schema}"`); await installProductionInboundFixture(db,grades);
    await db.query(`CREATE TABLE wms_stocktake(id bigserial PRIMARY KEY,stocktake_no text,date date,act_qty numeric,diff_qty numeric,status text,created_at timestamptz DEFAULT now());
      CREATE TABLE store_master(id bigint PRIMARY KEY,store_code text,status text,company_code text);
      ALTER TABLE wms_warehouses ADD COLUMN owner_store_id bigint;
      CREATE TABLE mst_materials(material_code text PRIMARY KEY,material_name text,material_type text,unit text,status text);
      CREATE TABLE prc2_receipts(id bigint PRIMARY KEY,receipt_no text,company_code text,warehouse_code text,status text);
      CREATE TABLE prc2_receipt_items(id bigint PRIMARY KEY,receipt_id bigint REFERENCES prc2_receipts(id),item_code text,actual_qty numeric,unit text);`);
    const continuation = db.createQueryRunner();
    try { await new ProductionDocumentContinuations1795400100000().up(continuation); }
    finally { await continuation.release(); }
    const transfer=db.createQueryRunner();await transfer.connect();try{await new AlignWmsTransactionForms1787731200000().up(transfer);await new UpgradeWmsTransferLifecycle1787965200000().up(transfer);await new TransferCostEvidence1795658700000().up(transfer);}finally{await transfer.release();}
    const defect=db.createQueryRunner();await defect.connect();try{await new AddWmsDefectDisposition1794405000000().up(defect);}finally{await defect.release();}
    await db.query(`CREATE TABLE inv_source_mode(scope_level text,scope_code text,mode text);
      INSERT INTO inv_source_mode VALUES('GROUP','ALL','TEMP_PRODUCTION_INBOUND');
      CREATE TABLE brd_medication_records(flock_no text,status text,start_date date,withdraw_until date);
      CREATE TABLE sys_user(user_id int PRIMARY KEY,username text,status int DEFAULT 1);
      INSERT INTO sys_user(user_id,username) VALUES(1,'maker'),(2,'approver'),(3,'receiver');
      ALTER TABLE file_metadata ADD COLUMN checksum text;
      ALTER TABLE product_grades ADD COLUMN stock_managed boolean DEFAULT true,
        ADD COLUMN sale_enabled boolean DEFAULT true,ADD COLUMN default_stock_status text DEFAULT 'AVAILABLE';
      UPDATE product_grades SET sale_enabled=false,is_saleable=false,default_stock_status='QUARANTINE' WHERE grade_code='DIRTY';
      UPDATE product_grades SET sale_enabled=false,is_saleable=false,default_stock_status='DAMAGED' WHERE grade_code='BROKEN';
      INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,store_code,uploaded_by,checksum)
      VALUES('FILE-HANDOVER','ACTIVE','PROTECTED','application/pdf','PRODUCTION_INBOUND','HOUSE','HOUSE-A','COMP-A','SITE-A','maker',repeat('e',64));`);
    await db.query(`INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,store_code,uploaded_by,checksum)
      VALUES('FILE-FINANCE','ACTIVE','PROTECTED','application/pdf','PRODUCTION_INBOUND','HOUSE','HOUSE-A','COMP-A','SITE-A','approver',repeat('f',64));`);
  });
  afterAll(async () => { if (db?.isInitialized) { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy(); } });
  async function resetFixture(mode:"DAILY"|"AMPM"="DAILY",reportDay:string=day,baselineDay='2026-11-17') {
    // Clear only this test-owned schema, including append-only continuation history.
    await db.query(`ALTER TABLE production_inbound_reissues DISABLE TRIGGER trg_reissue_truncate;
      TRUNCATE production_source_state_events,production_inventory_domain_states,prc2_receipt_items,prc2_receipts,wms_transfer_discrepancies,wms_transfer_items,wms_transfer,wms_stocktake,wms_defect_dispositions,production_physical_handovers,production_posting_periods,production_posting_period_events,production_inbound_allocations,production_inbound_lines,production_inbound_documents,
      production_opening_receipts,production_inbound_days,production_batch_roots,production_batch_qualifications,
      production_inventory_domains,production_cutover_scopes,inv_ledger,inv_batches,brd_daily_logs,inv_flock_source_links,
      brd_egg_source_receipts,brd_egg_day_routes,brd_flock_occupancies,brd_flock_documents RESTART IDENTITY CASCADE;
      ALTER TABLE production_inbound_reissues ENABLE TRIGGER trg_reissue_truncate;
      INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,house_code,business_date,payload,status,created_by)
      VALUES('SYNTHETIC-BASELINE','SYNTHETIC-COUNT',repeat('b',64),'BASELINE','COMP-A','FARM-A','HOUSE-A','${baselineDay}','{}','POSTED','fixture');
      INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,capacity_snapshot,opened_document_id)
      VALUES('SYNTHETIC-OCC','FLOCK-A','HOUSE-A','COMP-A','FARM-A','SITE-A','${baselineDay}',5000,'SYNTHETIC-BASELINE');
      INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,
        warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
      VALUES('20000000-0000-0000-0000-000000000001','COMP-A','HOUSE-A',1,'${baselineDay}','DRAFT','WH-A',
        'FLOCK-A','PROFILE-A',repeat('c',64),'{"synthetic":true}','fixture');
      INSERT INTO production_inventory_domains VALUES('20000000-0000-0000-0000-000000000001','COMP-A','WH-A','PRD-EGG-RAW');
      UPDATE production_cutover_scopes SET state='FENCED';
      UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now();
      INSERT INTO brd_daily_logs(house_code,flock_no,log_date,shift,eggs_by_grade,occupancy_id,company_code,farm_code,site_code)
      ${mode==='DAILY'?`VALUES('HOUSE-A','FLOCK-A','${reportDay}','DAILY','{"GRADE_0":0,"GRADE_1":1000,"GRADE_2":100,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0,"DIRTY":0,"BROKEN":0}','SYNTHETIC-OCC','COMP-A','FARM-A','SITE-A')`:
        `VALUES('HOUSE-A','FLOCK-A','${reportDay}','AM','{"GRADE_0":0,"GRADE_1":100,"GRADE_2":0,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0,"DIRTY":0,"BROKEN":0}','SYNTHETIC-OCC','COMP-A','FARM-A','SITE-A'),('HOUSE-A','FLOCK-A','${reportDay}','PM','{"GRADE_0":0,"GRADE_1":200,"GRADE_2":0,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0,"DIRTY":0,"BROKEN":0}','SYNTHETIC-OCC','COMP-A','FARM-A','SITE-A')`};
      UPDATE product_skus SET status='ACTIVE'; UPDATE file_metadata SET status='ACTIVE';
      UPDATE sys_user SET status=1;`);
    scope = { isGlobal:false,allowedCompanyCodes:['COMP-A'],allowedWarehouseCodes:['WH-A'] };
    actor = { userId:1,username:'maker',permissions:['MENU_PROD_INBOUND:V,C,E'] };
    const skus = new SkuAvailabilityService(db); const inv = new EggInventoryService(db,cls as any,skus);
    legacy = new ProductionInboundService(db,cls as any,inv,{ resolveMode:async () => 'TEMP_PRODUCTION_INBOUND' } as any,
      new OrgOwnershipService(db.manager),skus);
    service = new ProductionInboundDocumentsService(db,cls as any,legacy,inv,skus);
    const maker=actor;actor={userId:2,username:'approver',permissions:['MENU_FIN2_AR_LEDGER:E']};
    await service.setPostingPeriod({companyCode:'COMP-A',houseCode:'HOUSE-A',periodMonth:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date()).slice(0,7),
      state:'OPEN',expectedVersion:0,evidenceFileId:'FILE-FINANCE',reason:'Synthetic isolated fixture period opening'});actor=maker;
  }
  beforeEach(()=>resetFixture());
  async function physical(p:InboundDraftInput) {
    const reports=await db.query('SELECT id,shift FROM brd_daily_logs WHERE house_code=$1 AND log_date=$2 ORDER BY id',[p.houseCode,p.eggDate]);
    const segments:Array<{dailyLogId:number;gradeCode:string;quantity:number;evidenceFileId:string}>=[];
    for(const item of p.items) {
      const sources=item.allocations??(reports.length===1?[{dailyLogId:reports[0].id,quantity:item.quantity,evidenceFileId:'FILE-HANDOVER'}]:[]);
      for(const a of sources) {
        const old=segments.find(s=>s.dailyLogId===a.dailyLogId&&s.gradeCode===item.gradeCode);
        if(old)old.quantity+=a.quantity;else segments.push({dailyLogId:a.dailyLogId,gradeCode:item.gradeCode,quantity:a.quantity,evidenceFileId:a.evidenceFileId??'FILE-HANDOVER'});
      }
    }
    const doc=await service.createPhysicalHandover({companyCode:p.companyCode,houseCode:p.houseCode,eggDate:p.eggDate,
      warehouseCode:p.warehouseCode,handoverRef:p.handoverRef!,segments});
    const maker=actor;actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E']};
    try { await service.confirmPhysicalHandover(doc.id,doc.version,doc.content_hash); } finally {actor=maker;}
    return doc;
  }
  async function ready(p = input()) {
    await physical(p);const d = await service.create(p); return service.ready(d.id,d.version,`SUBMIT-${randomUUID()}`);
  }
  const post = (d: any) => service.post(d.id,d.submit_key,d.content_hash);
  const totals = async () => (await db.query(`SELECT (SELECT count(*)::int FROM inv_batches) AS batches,
    (SELECT count(*)::int FROM inv_ledger) AS ledgers,(SELECT count(*)::int FROM production_inbound_lines) AS lines,
    (SELECT count(*)::int FROM brd_egg_source_receipts) AS receipts,(SELECT count(*)::int FROM inv_flock_source_links) AS links`))[0];

  it('captures a stable read-only cutover snapshot including consumed stock and explicit missing closure tables',async()=>{
    const posted=await post(await ready());const target={companyCode:'COMP-A',warehouseCode:'WH-A',productCodes:['PRD-EGG-RAW'],houses:[{houseCode:'HOUSE-A',firstProductionDate:'2026-11-19'}]};
    const before=await totals();const a=await inspectProductionCutoverEvidence(db,target),b=await inspectProductionCutoverEvidence(db,target);
    expect(a.snapshotSha256).toBe(b.snapshotSha256);expect(a.releaseAdmission).toBe(false);expect(a.activationAuthorized).toBe(false);
    expect(a.snapshot.batches.map(r=>r.batch_no)).toContain(posted.batches[0].batchNo);
    expect(a.snapshot.missingTables).toContain('sal_order_item_batch_allocations');expect(await totals()).toEqual(before);
    await db.query('UPDATE inv_batches SET qty=qty-40,qty_available=qty_available-40 WHERE batch_no=$1',[posted.batches[0].batchNo]);
    await db.query("INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no) VALUES($1,'FIFO_OUT',-40,'SYNTHETIC-SALE')",[posted.batches[0].batchNo]);
    const changed=await inspectProductionCutoverEvidence(db,target);expect(changed.snapshotSha256).not.toBe(a.snapshotSha256);
    expect(changed.snapshot.batches.find(r=>r.batch_no===posted.batches[0].batchNo)?.qty).toBe(60);
    await expect(readProductionCutoverEvidence(db.manager,target)).rejects.toThrow('TRANSACTION_REQUIRED');
  });
  it('follows a real transfer child across company boundaries while excluding unrelated other-company stock',async()=>{
    const posted=await post(await ready());scope.allowedCompanyCodes.push('COMP-B');scope.allowedWarehouseCodes.push('WH-B');
    const wms=new WmsService(db.manager,cls as any);await wms.confirmTransfer({transfer_no:'EVIDENCE-CROSS-COMPANY',from_warehouse:'WH-A',to_warehouse:'WH-B',items:[{batch_no:posted.batches[0].batchNo,qty:20}]},{username:'maker'});
    const [child]=await db.query("SELECT batch_no FROM inv_batches WHERE source_no='EVIDENCE-CROSS-COMPANY'");
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,source_type,source_no,qty,qty_available)
      VALUES('OTHER-COMPANY','COMP-B','WH-A','PRD-EGG-RAW','SKU-GRADE_1','PURCHASE','UNRELATED',3,3)`);
    const p={companyCode:'COMP-A',warehouseCode:'WH-A',productCodes:['PRD-EGG-RAW'],houses:[{houseCode:'HOUSE-A',firstProductionDate:'2026-11-19'}]};
    const result=await inspectProductionCutoverEvidence(db,p,{signer:{key:'',keyId:'unconfigured'}});expect(result.snapshot.batches.map(b=>b.batch_no)).not.toContain('OTHER-COMPANY');
    expect(result.snapshot.batches.map(b=>b.batch_no)).not.toContain(child.batch_no);
    expect(result.snapshot.warnings).toContain('CROSS_COMPANY_DESCENDANTS_REQUIRE_SEPARATE_AUTHORITY');
    expect(result.snapshot.boundary.productCodes).toEqual(['PRD-EGG-RAW']);expect(result.assessment).toBe('EVIDENCE_ONLY');
  });
  it('seals a received cross-company handover without exposing the foreign root or changing its proof when the foreign remainder is sold',async()=>{
    const posted=await post(await ready()),root=posted.batches[0].batchNo;
    scope.allowedCompanyCodes.push('COMP-B');scope.allowedWarehouseCodes.push('WH-B');
    const wms=new WmsService(db.manager,cls as any);
    await wms.confirmTransfer({transfer_no:'SYNTHETIC-PRIVATE-RECEIPT',from_warehouse:'WH-A',to_warehouse:'WH-B',items:[{batch_no:root,qty:20}]},{username:'maker'});
    const [child]=await db.query("SELECT * FROM inv_batches WHERE source_no='SYNTHETIC-PRIVATE-RECEIPT'");
    const boundary={companyCode:'COMP-B',warehouseCode:'WH-B',productCodes:['PRD-EGG-RAW'],houses:[{houseCode:'HOUSE-B',firstProductionDate:'2026-11-19'}]};
    const before=await inspectProductionCutoverEvidence(db,boundary,{signer:proofSigner});
    expect(before.snapshot.crossCompanyProofs).toHaveLength(1);expect(before.snapshot.crossCompanyProofs[0]).toMatchObject({direction:'RECEIVED',batchNo:child.batch_no,quantity:20,unit:'枚'});
    expect(before.snapshot.warnings.filter(w=>w.startsWith('CROSS_COMPANY_'))).toEqual([]);
    expect(before.snapshot.batches.map(b=>b.batch_no)).toEqual([child.batch_no]);
    const visible=JSON.stringify(before.snapshot);
    expect(visible).not.toContain('HOUSE-A');expect(visible).not.toContain('FILE-HANDOVER');expect(visible).not.toContain('source_snapshot');
    expect(visible).not.toContain(root);expect(visible).not.toContain('evidence_sha256');
    expect(before.snapshot.ledger[0].operator).toBeNull();expect(before.snapshot.qualification[0]).not.toHaveProperty('scope_id');
    await db.transaction(async m=>{
      await m.query('UPDATE inv_batches SET qty=qty-5,qty_available=qty_available-5 WHERE batch_no=$1',[root]);
      await writeInvLedger(m,{batchNo:root,changeType:INV_LEDGER_CHANGE_TYPE.FIFO_OUT,qtyChange:-5,costChange:0,operator:'maker',
        companyCode:'COMP-A',warehouseCode:'WH-A',refNo:'SYNTHETIC-FOREIGN-REMAINDER-SALE',note:'Foreign private customer sale'});
    });
    const after=await inspectProductionCutoverEvidence(db,boundary,{signer:proofSigner});
    expect(after.snapshotSha256).toBe(before.snapshotSha256);
    expect(after.snapshot.crossCompanyProofs).toEqual(before.snapshot.crossCompanyProofs);
    await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED'");
    const paused=await inspectProductionCutoverEvidence(db,boundary,{signer:proofSigner});
    expect(paused.snapshot.warnings).toContain('CROSS_COMPANY_SOURCE_PROOF_REQUIRED');expect(paused.snapshot.crossCompanyProofs).toEqual([]);
    expect(JSON.stringify(paused.snapshot.batches)).not.toContain(root+'"');
  });
  it('revalidates a cross-company purchase through its real intermediate transfer and holds cancelled receipts or unmatched received quantities',async()=>{
    const {wms,batch}=await purchase();scope.allowedCompanyCodes.push('COMP-B');scope.allowedWarehouseCodes.push('WH-B');
    await wms.confirmTransfer({transfer_no:'SYNTHETIC-PURCHASE-ANCESTOR',from_warehouse:'WH-A2',to_warehouse:'WH-A',items:[{batch_no:batch,qty:20}]},{username:'maker'});
    const [parent]=await db.query("SELECT batch_no FROM inv_batches WHERE source_no='SYNTHETIC-PURCHASE-ANCESTOR'");
    await wms.confirmTransfer({transfer_no:'SYNTHETIC-PURCHASE-CROSS',from_warehouse:'WH-A',to_warehouse:'WH-B',items:[{batch_no:parent.batch_no,qty:10}]},{username:'maker'});
    const [child]=await db.query("SELECT batch_no FROM inv_batches WHERE source_no='SYNTHETIC-PURCHASE-CROSS'");
    const proof=(signer=proofSigner)=>db.transaction('REPEATABLE READ',async m=>{
      await m.query('SET TRANSACTION READ ONLY');
      const [local]=await m.query('SELECT to_jsonb(b) AS fact FROM inv_batches b WHERE batch_no=$1',[child.batch_no]);
      const [foreign]=await m.query('SELECT to_jsonb(b) AS fact FROM inv_batches b WHERE batch_no=$1',[parent.batch_no]);
      return proveCrossCompanyTransfer(m,local.fact,foreign.fact,cutoverEvidenceHash,false,signer);
    });
    const original=await proof();expect(original.publicProof).toMatchObject({batchNo:child.batch_no,quantity:10});expect(original.rootNos).toEqual([batch]);
    await expect(proof({key:'',keyId:'unconfigured'})).rejects.toThrow('SIGNER_UNAVAILABLE');
    await db.query("UPDATE prc2_receipts SET status='CANCELLED' WHERE receipt_no='SYNTHETIC-PURCHASE'");
    await expect(proof()).rejects.toThrow('SOURCE_HOLD');
    await db.query("UPDATE prc2_receipts SET status='CONFIRMED' WHERE receipt_no='SYNTHETIC-PURCHASE'");
    expect((await proof()).publicProof.proofSha256).toBe(original.publicProof.proofSha256);
    await db.query("UPDATE wms_transfer_items SET received_qty=9 WHERE transfer_no='SYNTHETIC-PURCHASE-CROSS'");
    await expect(proof()).rejects.toThrow('SOURCE_HOLD');
  });
  it('holds the actual completed transfer head and line against a concurrent received-quantity edit during signed-source validation',async()=>{
    const posted=await post(await ready());scope.allowedCompanyCodes.push('COMP-B');scope.allowedWarehouseCodes.push('WH-B');
    const wms=new WmsService(db.manager,cls as any);
    await wms.confirmTransfer({transfer_no:'SYNTHETIC-LOCKED-CROSS',from_warehouse:'WH-A',to_warehouse:'WH-B',items:[{batch_no:posted.batches[0].batchNo,qty:20}]},{username:'maker'});
    const reader=db.createQueryRunner(),writer=db.createQueryRunner();await reader.connect();await writer.connect();await reader.startTransaction();
    try{
      const [local]=await reader.query("SELECT to_jsonb(b) AS fact FROM inv_batches b WHERE source_no='SYNTHETIC-LOCKED-CROSS'");
      const [foreign]=await reader.query('SELECT to_jsonb(b) AS fact FROM inv_batches b WHERE batch_no=$1',[posted.batches[0].batchNo]);
      await proveCrossCompanyTransfer(reader.manager,local.fact,foreign.fact,cutoverEvidenceHash,true,proofSigner);
      await writer.startTransaction();await writer.query("SET LOCAL lock_timeout='100ms'");
      await expect(writer.query("UPDATE wms_transfer_items SET received_qty=19 WHERE transfer_no='SYNTHETIC-LOCKED-CROSS'")).rejects.toThrow('lock timeout');
      await writer.rollbackTransaction();await reader.commitTransaction();
      await writer.query("UPDATE wms_transfer_items SET received_qty=19 WHERE transfer_no='SYNTHETIC-LOCKED-CROSS'");
      await expect(db.transaction(m=>proveCrossCompanyTransfer(m,local.fact,foreign.fact,cutoverEvidenceHash,true,proofSigner))).rejects.toThrow('SOURCE_HOLD');
    }finally{if(reader.isTransactionActive)await reader.rollbackTransaction();if(writer.isTransactionActive)await writer.rollbackTransaction();await reader.release();await writer.release();}
  });
  it('freezes expired qualified physical stock without inventing a disposal or changing its original receipt',async()=>{
    await resetFixture('DAILY','2026-10-01','2026-09-30');
    const d=await ready({...input(),eggDate:'2026-10-01'}),original=await post(d),batchNo=original.batches[0].batchNo;
    // Empty actual allocation columns used by the scheduler's reservation exclusion.
    await db.query('CREATE TABLE sal_order_item_batch_allocations(id bigint,batch_no text,reserved_qty numeric,outbound_qty numeric,released_qty numeric)');
    try{
    const inventory=new EggInventoryService(db,cls as any,new SkuAvailabilityService(db));
    const before=await db.query('SELECT to_jsonb(l) AS fact FROM inv_ledger l ORDER BY id');
    await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED'");
    expect((await inventory.markExpiredBatches('COMP-A')).expired).toBe(0);
    expect((await db.query('SELECT status FROM inv_batches WHERE batch_no=$1',[batchNo]))[0].status).toBe('AVAILABLE');
    await db.query("UPDATE production_cutover_scopes SET state='ACTIVE'");
    await expect(inventory.markExpiredBatches('COMP-A',db.manager)).rejects.toThrow('实际事务');
    await expect(db.transaction(async m=>{
      expect((await inventory.markExpiredBatches('COMP-A',m)).frozenForReview).toEqual([{batchNo,companyCode:'COMP-A',warehouseCode:'WH-A'}]);
      expect((await m.query('SELECT status FROM inv_batches WHERE batch_no=$1',[batchNo]))[0].status).toBe('FROZEN');
      throw new Error('Synthetic outer transaction abort');
    })).rejects.toThrow('Synthetic outer transaction abort');
    expect((await db.query('SELECT status FROM inv_batches WHERE batch_no=$1',[batchNo]))[0].status).toBe('AVAILABLE');
    const result=await inventory.markExpiredBatches('COMP-A');
    expect(result).toMatchObject({written:0,frozenForReview:[{batchNo,companyCode:'COMP-A',warehouseCode:'WH-A'}]});
    expect((await db.query('SELECT qty::text,qty_available::text,status FROM inv_batches WHERE batch_no=$1',[batchNo]))[0])
      .toEqual({qty:'100',qty_available:'0',status:'FROZEN'});
    expect(await db.query('SELECT to_jsonb(l) AS fact FROM inv_ledger l ORDER BY id')).toEqual(before);
    expect(await post(d)).toEqual(original);expect((await inventory.markExpiredBatches('COMP-A')).expired).toBe(0);
    expect((await service.balance('COMP-A','HOUSE-A','2026-10-01','WH-A')).grades.GRADE_1).toEqual({reported:1000,posted:100,remaining:900});
    expect((await db.query("SELECT qty-SUM(l.qty_change) AS difference FROM inv_batches b JOIN inv_ledger l USING(batch_no) WHERE batch_no=$1 GROUP BY b.qty",[batchNo]))[0].difference).toBe('0');
    }finally{await db.query('DROP TABLE sal_order_item_batch_allocations');}
  });
  it('keeps expiry within warehouse scope and reclassifies an actual purchase admitted after the candidate snapshot',async()=>{
    const {batch:batchNo}=await purchase();
    await db.query("UPDATE inv_batches SET expire_date='2026-10-31' WHERE batch_no=$1",[batchNo]);
    await db.query('CREATE TABLE sal_order_item_batch_allocations(id bigint,batch_no text,reserved_qty numeric,outbound_qty numeric,released_qty numeric)');
    try{
      const inventory=new EggInventoryService(db,cls as any,new SkuAvailabilityService(db));
      scope.allowedWarehouseCodes=['WH-A'];expect((await inventory.markExpiredBatches('COMP-A')).expired).toBe(0);
      expect((await db.query('SELECT status FROM inv_batches WHERE batch_no=$1',[batchNo]))[0].status).toBe('AVAILABLE');
      scope.allowedWarehouseCodes.push('WH-A2');let admitted=false;
      const result=await db.transaction(async m=>{
        const query=m.query.bind(m);m.query=async(sql:string,parameters?:any[])=>{
          const rows=await query(sql,parameters);
          if(!admitted&&sql.includes('FOR UPDATE OF b SKIP LOCKED')){
            expect((await db.query('SELECT count(*)::int AS n FROM production_batch_qualifications WHERE batch_no=$1',[batchNo]))[0].n).toBe(0);
            await db.transaction(other=>qualifyPurchaseInventory(other,{batchNo,companyCode:'COMP-A',warehouseCode:'WH-A2',productCode:'PRD-EGG-RAW',skuCode:'SKU-GRADE_1',
              receiptNo:'SYNTHETIC-PURCHASE',receiptItemId:'11',itemCode:'SKU-GRADE_1',quantity:100,unitCost:2,actor:'maker',baseUnit:'枚',
              admission:{scopeId:'20000000-0000-0000-0000-000000000001',companyCode:'COMP-A',warehouseCode:'WH-A',productCode:'PRD-EGG-RAW'}}));
            admitted=true;
          }
          return rows;
        };
        return inventory.markExpiredBatches('COMP-A',m);
      });
      expect(admitted).toBe(true);expect(result).toMatchObject({written:0,frozenForReview:[{batchNo,warehouseCode:'WH-A2'}]});
      expect((await db.query('SELECT qty::text,status FROM inv_batches WHERE batch_no=$1',[batchNo]))[0]).toEqual({qty:'100',status:'FROZEN'});
      expect((await db.query("SELECT count(*)::int AS n FROM inv_ledger WHERE batch_no=$1 AND change_type='EXPIRE_WRITEOFF'",[batchNo]))[0].n).toBe(0);
    }finally{await db.query('DROP TABLE sal_order_item_batch_allocations');}
  });
  it('skips a busy formal product without rolling back unrelated OFF-company expiry and retries the formal hold later',async()=>{
    await resetFixture('DAILY','2026-10-01','2026-09-30');const original=await post(await ready({...input(),eggDate:'2026-10-01'})),batchNo=original.batches[0].batchNo;
    await db.query('CREATE TABLE sal_order_item_batch_allocations(id bigint,batch_no text,reserved_qty numeric,outbound_qty numeric,released_qty numeric)');
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,material_code,source_type,source_no,unit,qty,qty_available,status,expire_date)
      VALUES('SYNTHETIC-OFF-MATERIAL','COMP-B','WH-B','SYNTHETIC-MATERIAL','PURCHASE','SYNTHETIC-OFF-RECEIPT','盒',7,7,'AVAILABLE','2026-10-31')`);
    const lock=db.createQueryRunner();await lock.connect();await lock.startTransaction();
    try{
      await lock.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:inventory-product'),hashtext('COMP-A:PRD-EGG-RAW'))");
      const scheduler=new EggInventoryService(db,{get:()=>undefined} as any,new SkuAvailabilityService(db));
      const result=await scheduler.markExpiredBatches();expect(result).toMatchObject({written:1,skippedBusy:[{batchNo,companyCode:'COMP-A'}]});
      expect((await db.query('SELECT qty::text,status FROM inv_batches WHERE batch_no=$1',[batchNo]))[0]).toEqual({qty:'100',status:'AVAILABLE'});
      expect((await db.query("SELECT status FROM inv_batches WHERE batch_no='SYNTHETIC-OFF-MATERIAL'"))[0].status).toBe('EXPIRED');
      await lock.rollbackTransaction();expect((await scheduler.markExpiredBatches('COMP-A')).frozenForReview).toEqual([{batchNo,companyCode:'COMP-A',warehouseCode:'WH-A'}]);
    }finally{if(lock.isTransactionActive)await lock.rollbackTransaction();await lock.release();await db.query('DROP TABLE sal_order_item_batch_allocations');}
  });
  it('keeps a suspended expired allocation read-only and sends warehouse-scoped review without authorizing disposal',async()=>{
    await resetFixture('DAILY','2026-10-01','2026-09-30');const original=await post(await ready({...input(),eggDate:'2026-10-01'})),batchNo=original.batches[0].batchNo;
    await db.query('CREATE TABLE sal_order_item_batch_allocations(id bigint,batch_no text,reserved_qty numeric,outbound_qty numeric,released_qty numeric)');
    try{
      // Owned open-reservation facts; the scheduled review must never release or dispose them.
      await db.transaction(async m=>{
        await m.query('UPDATE inv_batches SET qty_available=qty_available-10 WHERE batch_no=$1',[batchNo]);
        await writeInvLedger(m,{batchNo,changeType:INV_LEDGER_CHANGE_TYPE.RESERVED,qtyChange:-10,costChange:0,companyCode:'COMP-A',warehouseCode:'WH-A',
          operator:'maker',refNo:'SYNTHETIC-OPEN-RESERVATION',note:'Synthetic persisted open allocation'});
        await m.query('INSERT INTO sal_order_item_batch_allocations VALUES(1,$1,10,0,0)',[batchNo]);
      });
      await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED'");
      const recipients={resolve:jest.fn().mockResolvedValue(['synthetic-authorized-reader'])},notifications={create:jest.fn().mockResolvedValue(undefined)};
      const inventory=new EggInventoryService(db,cls as any,new SkuAvailabilityService(db),recipients as any,notifications as any);
      const before=await db.query('SELECT to_jsonb(l) AS fact FROM inv_ledger l ORDER BY id');
      const result=await inventory.markExpiredBatches('COMP-A');
      expect(result).toMatchObject({expired:0,written:0,skippedInUse:[{batchNo,companyCode:'COMP-A',warehouseCode:'WH-A',openAllocations:10}]});
      expect((await db.query('SELECT qty::text,qty_available::text,status FROM inv_batches WHERE batch_no=$1',[batchNo]))[0])
        .toEqual({qty:'100',qty_available:'90',status:'AVAILABLE'});
      expect(await db.query('SELECT to_jsonb(l) AS fact FROM inv_ledger l ORDER BY id')).toEqual(before);
      expect(recipients.resolve).toHaveBeenCalledWith('COMP-A',['MENU_SALES2_INVENTORY'],'WH-A');
      const content=notifications.create.mock.calls[0][0].content;expect(content).toContain('不授予暂停来源写入权限');expect(content).not.toContain('再执行过期报废');
      expect((await db.query('SELECT state FROM production_cutover_scopes'))[0].state).toBe('SUSPENDED');
    }finally{await db.query('DROP TABLE sal_order_item_batch_allocations');}
  });
  it('1000 → 100 → sell 40 → 900; original receipt stays 100 and stock is 960', async () => {
    const p = input(100); const d = await ready(p); const first = await post(d);
    await db.query('UPDATE inv_batches SET qty=qty-40,qty_available=qty_available-40 WHERE batch_no=$1',[first.batches[0].batchNo]);
    await db.query(`INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no) VALUES($1,'FIFO_OUT',-40,'SYNTHETIC-SALE')`,[first.batches[0].batchNo]);
    const secondDocument = await ready(input(900));
    const second = await post(secondDocument);
    expect(second.totalInbound).toBe(900); expect((await post(d)).totalInbound).toBe(100);
    expect((await service.create(p)).id).toBe(d.id);
    const balance = await service.balance('COMP-A','HOUSE-A',day,'WH-A');
    expect(balance.grades.GRADE_1).toEqual({ reported:1000,posted:1000,remaining:0 });
    expect((await db.query('SELECT sum(qty)::int AS quantity FROM inv_batches'))[0].quantity).toBe(960);
    expect((await service.get(d.id)).lines[0]).toMatchObject({ quantity:100,current_quantity:'60' });
    expect(balance).toMatchObject({stockBasisVersion:2,currentStock:{GRADE_1:960},
      stockByGrade:{GRADE_1:{attributableQty:960,warehouseQty:960,mixedBatchCount:0}}});
    const [segment]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1',[secondDocument.id]);
    const {approved}=await reversal(secondDocument,[{allocationId:segment.id,quantity:30}]);
    await post(approved);
    expect(await service.balance('COMP-A','HOUSE-A',day,'WH-A')).toMatchObject({
      stockByGrade:{GRADE_1:{attributableQty:930,warehouseQty:930}},grades:{GRADE_1:{reported:1000,posted:970,remaining:30}}});
    expect((await post(d)).totalInbound).toBe(100);

  });

  it('two connections posting the same key yield one immutable receipt; changed hash has no effect', async () => {
    const d = await ready(); const outcomes = await Promise.all([post(d),post(d)]);
    expect(outcomes[0]).toEqual(outcomes[1]);
    await expect(service.post(d.id,d.submit_key,'0'.repeat(64))).rejects.toThrow();
    expect(await totals()).toEqual({ batches:1,ledgers:1,lines:1,receipts:1,links:1 });
  });

  it('distinct frozen documents race for the last balance; only the legal total posts', async () => {
    const a = await ready(input(700)); const b = await ready(input(700));
    const outcomes = await Promise.allSettled([post(a),post(b)]);
    expect(outcomes.filter(o => o.status==='fulfilled')).toHaveLength(1);
    expect((await db.query('SELECT sum(quantity)::int AS n FROM production_inbound_lines'))[0].n).toBe(700);
  });

  it('second grade ledger failure rolls back the whole document, qualification and source links', async () => {
    const p = input(); p.items.push({ gradeCode:'GRADE_2',quantity:10 }); const d = await ready(p);
    await db.query("ALTER TABLE inv_ledger ADD CONSTRAINT reject_second_grade CHECK(quality_grade IS DISTINCT FROM 'GRADE_2')");
    try {
      await expect(post(d)).rejects.toThrow();
      expect(await totals()).toEqual({ batches:0,ledgers:0,lines:0,receipts:0,links:0 });
      expect((await db.query('SELECT count(*)::int AS n FROM production_batch_qualifications'))[0].n).toBe(0);
      expect((await service.get(d.id)).state).toBe('READY');
    } finally { await db.query('ALTER TABLE inv_ledger DROP CONSTRAINT reject_second_grade'); }
  });

  it('posted retry survives disabled SKU and suspended cutover; fresh writes do not', async () => {
    const p = input(); const d = await ready(p); const original = await post(d);
    await db.query("UPDATE product_skus SET status='INACTIVE'; UPDATE production_cutover_scopes SET state='SUSPENDED'");
    expect(await post(d)).toEqual(original); expect((await service.create(p)).id).toBe(d.id);
    await expect(service.create(input())).rejects.toThrow();
    expect((await service.balance('COMP-A','HOUSE-A',day,'WH-A')).grades.GRADE_1.posted).toBe(100);
  });

  it('cannot use an old DAILY or generic TEMP path to post into the cutover domain', async () => {
    await expect(legacy.recordProductionInbound({ companyCode:'COMP-A',houseCode:'HOUSE-A',warehouseCode:'WH-A',
      locationCode:'LOC-A',eggDate:day,items:[{ grade:'GRADE_1',qty:100 }] })).rejects.toThrow();
    expect(await totals()).toEqual({ batches:0,ledgers:0,lines:0,receipts:0,links:0 });
  });

  it('holds the whole day when one reported shift has no matching flock and occupancy', async () => {
    await resetFixture('AMPM');
    const [am]=await db.query("SELECT id FROM brd_daily_logs WHERE shift='AM'");
    const draft=input(5);
    draft.items[0].allocations=[{dailyLogId:am.id,quantity:5}];
    const frozen=await ready(draft);
    const receipt=await post(frozen);
    // This fixture represents a row predating the official identity trigger.
    await db.transaction(async m => {
      await m.query("SET LOCAL session_replication_role='replica'");
      await m.query("UPDATE brd_daily_logs SET flock_no='FLOCK-B' WHERE shift='PM'");
    });
    expect((await service.balance('COMP-A','HOUSE-A',day,'WH-A')).sourceReviewRequired).toBe(true);
    await expect(physical({...draft,handoverRef:'UNVERIFIED-SHIFT'})).rejects.toThrow('占栏');
    expect(await post(frozen)).toEqual(receipt);
    const [allocation]=await db.query("SELECT id FROM production_inbound_allocations WHERE document_id=$1",[frozen.id]);
    const {approved}=await reversal(frozen,[{allocationId:allocation.id,quantity:2}]);
    await expect(post(approved)).resolves.toBeDefined();
  });

  it('does not turn unsupported multi-shift quota sharing into EXACT provenance', async () => {
    await resetFixture('AMPM');
    const d=await service.create(input(150)); await expect(service.ready(d.id,d.version,'NO-PHYSICAL')).rejects.toThrow('收发双方确认');
    expect(await totals()).toEqual({ batches:0,ledgers:0,lines:0,receipts:0,links:0 });
  });

  async function reversal(d: any, segment: { allocationId:string;quantity:number }[]) {
    const draft=await service.createReversal(d.id,{ intentKey:randomUUID(),reason:'Synthetic actual handover correction',segments:segment,evidenceFileIds:['FILE-HANDOVER'] });
    const frozen=await service.ready(draft.id,draft.version,`REV-${randomUUID()}`);
    actor={ userId:2,username:'approver',permissions:['MENU_PROD_INBOUND:V,C,E,A','MENU_FIN2_AR_LEDGER:E'] };
    const lines=await db.query('SELECT batch_no FROM production_inbound_lines WHERE document_id=$1',[d.id]);
    const financialInput={ contentHash:frozen.content_hash,
      financialEvidenceFileId:'FILE-FINANCE',periodStatus:'OPEN',costs:lines.map((l:any)=>({batchNo:l.batch_no,costStatus:'UNKNOWN' as const,unitCost:0})) };
    const clearance=await service.recordFinancialClearance(frozen.id,{...financialInput,periodStatus:'OPEN'});
    expect((await service.recordFinancialClearance(frozen.id,{...financialInput,periodStatus:'OPEN'})).id).toBe(clearance.id);
    actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E,A']};
    const approved=await service.approveReversal(frozen.id,frozen.version,frozen.content_hash,clearance.id);
    return { frozen,approved,clearance };
  }

  async function lastMonthEnd(): Promise<string> {
    const [row]=await db.query(`SELECT (date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date-1)::text AS day`);
    return row.day;
  }
  async function waitForBlockedBy(pid: number) {
    for (let i=0;i<200;i++) {
      const [row]=await db.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) LIMIT 1',[pid]);
      if (row) return Number(row.pid);
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw new Error('Expected a second PostgreSQL connection to wait on the fixture lock');
  }

  it('T09 atomically retains one successor, preserves keys, and rolls back an injected link failure',async()=>{
    const key=randomUUID(),previous=await lastMonthEnd();
    const clock=jest.spyOn(postingClock,'singaporeBusinessDate').mockReturnValue(previous);
    let d:any;
    try { d=await ready(); } finally { clock.mockRestore(); }
    await db.query(`ALTER TABLE production_inbound_reissues ADD CONSTRAINT injected_link_failure CHECK(false)`);
    try { await expect(service.reissue(d.id,d.version,key)).rejects.toThrow('injected_link_failure'); }
    finally { await db.query('ALTER TABLE production_inbound_reissues DROP CONSTRAINT injected_link_failure'); }
    expect((await service.get(d.id)).state).toBe('READY');
    expect(await db.query('SELECT id FROM production_inbound_documents WHERE intent_key=$1',[key])).toEqual([]);
    const outcomes=await Promise.all([service.reissue(d.id,d.version,key),service.reissue(d.id,d.version,randomUUID())]);
    expect(outcomes.map(o=>o.outcome).sort()).toEqual(['DRAFT','EXISTING']);
    expect(outcomes[0].documentId).toBe(outcomes[1].documentId);
    await expect(db.query('TRUNCATE production_inbound_reissues')).rejects.toThrow('PRODUCTION_REISSUE_IMMUTABLE');
    await expect(db.query('TRUNCATE production_inbound_documents CASCADE')).rejects.toThrow('PRODUCTION_REISSUE_IMMUTABLE');
    const next=await service.get(outcomes[0].documentId);
    expect(next).toMatchObject({state:'DRAFT',handover_ref:d.handover_ref,submit_key:null,content_hash:null,version:1});
    expect((await service.get(d.id))).toMatchObject({state:'CANCELLED',submit_key:d.submit_key,intent_key:d.intent_key});
    const rollback=db.createQueryRunner();
    try {await expect(new ProductionDocumentContinuations1795400100000().down(rollback)).rejects.toThrow('PRODUCTION_CONTINUATION_DOWN_BLOCKED');}
    finally {await rollback.release();}
    expect((await service.reissue(d.id,d.version,key)).documentId).toBe(next.id);
    const frozen=await service.ready(next.id,next.version,randomUUID()),receipt=await post(frozen);
    expect((await service.reissue(frozen.id,1,key))).toEqual({outcome:'POSTED',documentId:frozen.id,receipt});
    expect(await totals()).toMatchObject({batches:1,lines:1,ledgers:1});
  });

  it('T09 returns the exact receipt when an in-flight post commits ahead of reissue',async()=>{
    const doc=await ready(),q=db.createQueryRunner();
    await db.query(`CREATE FUNCTION hold_fixture_post() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_advisory_xact_lock(91123,9); RETURN NEW; END $$;
      CREATE TRIGGER hold_fixture_post BEFORE UPDATE ON production_inbound_documents
        FOR EACH ROW WHEN (NEW.state='POSTED') EXECUTE FUNCTION hold_fixture_post()`);
    try {
      await q.startTransaction();
      await q.query('SELECT pg_advisory_xact_lock(91123,9)');
      const [{pid}]=await q.query('SELECT pg_backend_pid() AS pid');
      const posting=post(doc),postingPid=await waitForBlockedBy(pid);
      const reissuing=service.reissue(doc.id,doc.version,randomUUID());
      await waitForBlockedBy(postingPid);
      await q.commitTransaction();
      const receipt=await posting;
      expect(await reissuing).toEqual({outcome:'POSTED',documentId:doc.id,receipt});
      expect(await db.query('SELECT 1 FROM production_inbound_reissues')).toEqual([]);
    } finally {
      if(q.isTransactionActive)await q.rollbackTransaction();await q.release();
      await db.query('DROP TRIGGER hold_fixture_post ON production_inbound_documents;DROP FUNCTION hold_fixture_post()');
    }
  });

  it('T09 serializes a manual cancellation against reissue without orphaning a successor',async()=>{
    const clock=jest.spyOn(postingClock,'singaporeBusinessDate').mockReturnValue(await lastMonthEnd());
    let d:any;try { d=await ready(); } finally {clock.mockRestore();}
    const outcomes=await Promise.allSettled([service.cancel(d.id,d.version),service.reissue(d.id,d.version,randomUUID())]);
    expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);
    const docs=await db.query('SELECT id,state FROM production_inbound_documents');
    const links=await db.query('SELECT predecessor_id,successor_id FROM production_inbound_reissues');
    expect(docs.filter((x:any)=>x.state==='DRAFT')).toHaveLength(links.length);
    if (links.length) expect(links).toEqual([{predecessor_id:d.id,successor_id:docs.find((x:any)=>x.state==='DRAFT').id}]);
  });

  it('T08 rejects ordinary frozen quantities after a separately signed period closes and reopens',async()=>{
    const doc=await ready(),maker=actor,periodMonth=postingClock.singaporeBusinessDate().slice(0,7);
    actor={userId:2,username:'approver',permissions:['MENU_FIN2_AR_LEDGER:E,A']};
    const p={companyCode:'COMP-A',houseCode:'HOUSE-A',periodMonth,evidenceFileId:'FILE-FINANCE',reason:'Synthetic signing change'};
    await service.setPostingPeriod({...p,state:'CLOSED',expectedVersion:1});
    await service.setPostingPeriod({...p,state:'OPEN',expectedVersion:2});
    actor=maker;
    await expect(post(doc)).rejects.toMatchObject({response:{code:'PRODUCTION_PERIOD_CHANGED'}});
    expect((await service.get(doc.id)).state).toBe('READY');expect(await totals()).toMatchObject({batches:0,ledgers:0});
  });

  it.each(['INBOUND','REVERSAL'])('T08 final commit rejects prior month %s after a real lock wait',async kind=>{
    const prior=await lastMonthEnd(),maker=actor;
    let original:any,segment:any;
    if(kind==='REVERSAL') {
      original=await ready();await post(original);
      [segment]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1',[original.id]);
      actor={userId:2,username:'approver',permissions:['MENU_FIN2_AR_LEDGER:E']};
      await service.setPostingPeriod({companyCode:'COMP-A',houseCode:'HOUSE-A',periodMonth:prior.slice(0,7),state:'OPEN',expectedVersion:0,
        evidenceFileId:'FILE-FINANCE',reason:'Synthetic previous month period for boundary simulation'});actor=maker;
    }
    // Application preflight still observes the last day of the prior month. PostgreSQL uses its actual wall clock at COMMIT.
    const clock=jest.spyOn(postingClock,'singaporeBusinessDate').mockReturnValue(prior);
    const blocker=db.createQueryRunner();
    let frozen:any;
    try {
      frozen=kind==='INBOUND'?await ready():(await reversal(original,[{allocationId:segment.id,quantity:100}])).approved;
      const before=await totals();
      await blocker.startTransaction();
      const [{pid}]=await blocker.query('SELECT pg_backend_pid() AS pid');
      if(kind==='INBOUND') await blocker.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`production-period:COMP-A:${prior.slice(0,7)}`]);
      else await blocker.query('SELECT batch_no FROM inv_batches FOR UPDATE');
      const posting=post(frozen).then(()=>'',e=>String(e.message));
      await waitForBlockedBy(pid);await blocker.commitTransaction();
      expect(await posting).toContain('PRODUCTION_POSTING_DAY_CHANGED');
      expect(await totals()).toEqual(before);
      expect((await service.get(frozen.id)).state).toBe(kind==='INBOUND'?'READY':'APPROVED');
    } finally {
      if(blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();clock.mockRestore();
    }
    actor=maker;
    const successor=await service.reissue(frozen.id,frozen.version,randomUUID());
    const d=await service.get(successor.documentId);
    expect(d).toMatchObject({state:'DRAFT',approved_by:null,approval_evidence:null,submit_key:null});
    if (kind==='REVERSAL') {
      expect(d.original_document_id).toBe(original.id);
      const refrozen=await service.ready(d.id,d.version,randomUUID());
      await expect(post(refrozen)).rejects.toThrow('审核');
      expect(await db.query('SELECT 1 FROM production_financial_clearances WHERE document_id=$1',[d.id])).toEqual([]);
    }
  });

  it('T07 both lock orders serialize JSON quality registration and complete reversal, including escaped failed items',async()=>{
    await db.query('CREATE TABLE qa_inspections(id int PRIMARY KEY,status text,items_json jsonb,fail_items_json text)');
    const q=db.createQueryRunner();
    try {
      await new ProductionDocumentContinuations1795400100000().up(q);
      const original=await ready(),receipt=await post(original),batch=receipt.batches[0].batchNo;
      const [segment]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1',[original.id]);
      const {approved}=await reversal(original,[{allocationId:segment.id,quantity:100}]);
      await q.startTransaction();
      const [{pid}]=await q.query('SELECT pg_backend_pid() AS pid');
      await q.query('INSERT INTO qa_inspections VALUES(1,$1,$2,NULL)',['IN_PROGRESS',JSON.stringify([{batch_no:batch}])]);
      const reversalFirst=post(approved).then(()=>null,e=>e.getResponse().code);
      await waitForBlockedBy(pid);await q.commitTransaction();
      expect(await reversalFirst).toBe('PRODUCTION_REVERSAL_DOWNSTREAM_HOLD');
      await q.query('UPDATE qa_inspections SET status=$1,items_json=NULL,fail_items_json=$2',['UNKNOWN',JSON.stringify(JSON.stringify([{id:batch}]))]);
      await expect(post(approved)).rejects.toMatchObject({response:{code:'PRODUCTION_REVERSAL_DOWNSTREAM_HOLD'}});
      await q.query("UPDATE qa_inspections SET status='VOID'");
      const real=(service as any).postReversal.bind(service);
      let unlock!:()=>void,locked!:(pid:number)=>void;
      const release=new Promise<void>(done=>{unlock=done;});
      const holding=new Promise<number>(done=>{locked=done;});
      const hook=jest.spyOn(service as any,'postReversal').mockImplementation(async(...args:any[])=>{
        const result=await real(...args);
        const [{pid}]=await args[0].query('SELECT pg_backend_pid() AS pid');locked(pid);await release;return result;
      });
      try {
        const reversing=post(approved);await holding;
        const inspection=q.query("UPDATE qa_inspections SET status='PENDING'").then(()=>'',e=>String(e.message));
        expect(await inspection).toContain('PRODUCTION_QUALITY_BATCH_BUSY');unlock();
        expect((await reversing).totalReversed).toBe(100);
        await expect(q.query("UPDATE qa_inspections SET status='PENDING'")).rejects.toThrow('PRODUCTION_QUALITY_BATCH_REVERSED');
      } finally {unlock();hook.mockRestore();}
      expect((await q.query('SELECT status FROM qa_inspections'))[0].status).toBe('VOID');
    } finally {
      if(q.isTransactionActive)await q.rollbackTransaction();await q.release();
      await db.query('DROP TABLE qa_inspections');
    }
  });

  it('T07 old API batch then QA row lock cannot deadlock a QA updater already holding that row',async()=>{
    await db.query('CREATE TABLE qa_non_conformance(id int PRIMARY KEY,batch_no text,status text)');
    const qa=db.createQueryRunner(),old=db.createQueryRunner();
    try {
      await new ProductionDocumentContinuations1795400100000().up(qa);
      const receipt=await post(await ready()),batch=receipt.batches[0].batchNo;
      await db.query("INSERT INTO qa_non_conformance VALUES(1,$1,'VOID')",[batch]);
      await qa.startTransaction();await old.startTransaction();
      await qa.query('SELECT 1 FROM qa_non_conformance WHERE id=1 FOR UPDATE');
      const [{pid}]=await qa.query('SELECT pg_backend_pid() AS pid');
      await old.query('SELECT 1 FROM inv_batches WHERE batch_no=$1 FOR UPDATE',[batch]);
      const oldLookup=old.query('SELECT status FROM qa_non_conformance WHERE batch_no=$1 FOR SHARE',[batch]);
      await waitForBlockedBy(pid);
      await expect(qa.query("UPDATE qa_non_conformance SET status='OPEN' WHERE id=1")).rejects.toThrow('PRODUCTION_QUALITY_BATCH_BUSY');
      await qa.rollbackTransaction();
      expect(await oldLookup).toEqual([{status:'VOID'}]);await old.commitTransaction();
    } finally {
      if(qa.isTransactionActive)await qa.rollbackTransaction();if(old.isTransactionActive)await old.rollbackTransaction();
      await qa.release();await old.release();await db.query('DROP TABLE qa_non_conformance');
    }
  });

  it.each([10,100])('T07 database protects older writers that do not scan QA JSON, including reversal of %i eggs',async quantity=>{
    await db.query('CREATE TABLE qa_inspections(id int PRIMARY KEY,status text,items_json jsonb,fail_items_json jsonb)');
    const q=db.createQueryRunner();
    try {
      await new ProductionDocumentContinuations1795400100000().up(q);
      const original=await ready(),receipt=await post(original),batch=receipt.batches[0].batchNo;
      const [segment]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1',[original.id]);
      const {approved}=await reversal(original,[{allocationId:segment.id,quantity}]);
      // Simulate the pre-migration API's missing JSON scan. The DB must reject even when every application check passes.
      const old=jest.spyOn(service as any,'validateReversal').mockImplementation(async(m:any)=>({
        original,batches:await m.query('SELECT * FROM inv_batches WHERE batch_no=$1 FOR UPDATE',[batch])}));
      try {
        await q.startTransaction();
        const [{pid}]=await q.query('SELECT pg_backend_pid() AS pid');
        await q.query("INSERT INTO qa_inspections VALUES(1,'PENDING',NULL,$1)",[JSON.stringify([{source:original.document_no}])]);
        const writing=post(approved).then(()=>'',e=>String(e.message));
        await waitForBlockedBy(pid);await q.commitTransaction();
        expect(await writing).toContain('PRODUCTION_REVERSAL_DOWNSTREAM_HOLD');
        expect((await service.get(approved.id)).state).toBe('APPROVED');
        expect(Number((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[batch]))[0].qty)).toBe(100);
        await q.query("UPDATE qa_inspections SET status='CANCELLED'");
        expect((await post(approved)).totalReversed).toBe(quantity);
        const register=()=>q.query("UPDATE qa_inspections SET status='PENDING'");
        if(quantity===100) await expect(register()).rejects.toThrow('PRODUCTION_QUALITY_BATCH_REVERSED');
        else {await register();expect(Number((await q.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[batch]))[0].qty)).toBe(90);}
      } finally {old.mockRestore();}
    } finally {
      if(q.isTransactionActive)await q.rollbackTransaction();await q.release();await db.query('DROP TABLE qa_inspections');
    }
  });

  it('AM100 / PM200 → 150(100/50) → reverse PM30 → PM180; sources and quota count compensation once', async () => {
    await resetFixture('AMPM');
    const reports=await db.query('SELECT id,shift FROM brd_daily_logs ORDER BY id'); const am=reports[0].id,pm=reports[1].id;
    const p=input(150); p.items[0].allocations=[{dailyLogId:am,quantity:100,evidenceFileId:'FILE-HANDOVER'},
      {dailyLogId:pm,quantity:50,evidenceFileId:'FILE-HANDOVER'}];
    const d=await ready(p); await post(d);
    const sourceBalances=async()=> (await service.balance('COMP-A','HOUSE-A',day,'WH-A')).sourceBalances.filter(row=>row.gradeCode==='GRADE_1');
    const before=[
      {dailyLogId:am,shift:'AM',productionDate:day,flockNo:'FLOCK-A',occupancyId:'SYNTHETIC-OCC',gradeCode:'GRADE_1',confirmedQty:100,ordinaryNet:100,rawUsedQty:0,remaining:0},
      {dailyLogId:pm,shift:'PM',productionDate:day,flockNo:'FLOCK-A',occupancyId:'SYNTHETIC-OCC',gradeCode:'GRADE_1',confirmedQty:200,ordinaryNet:50,rawUsedQty:0,remaining:150},
    ];
    expect(await sourceBalances()).toEqual(before);
    const exhausted=input(1);exhausted.items[0].allocations=[{dailyLogId:am,quantity:1}];
    await expect(ready(exhausted)).rejects.toThrow('来源可入余额不足');
    const [segment]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1 AND daily_log_id=$2',[d.id,pm]);
    const { approved }=await reversal(d,[{allocationId:segment.id,quantity:30}]);
    expect(await sourceBalances()).toEqual(before);
    const receipt=await post(approved); expect(receipt.totalReversed).toBe(30); expect(await post(approved)).toEqual(receipt);
    expect((await service.balance('COMP-A','HOUSE-A',day,'WH-A')).grades.GRADE_1).toEqual({reported:300,posted:120,remaining:180});
    expect(await sourceBalances()).toEqual([before[0],{...before[1],ordinaryNet:20,remaining:180}]);
    expect(await effectiveProductionReceiptQuantity(db.manager,am)).toBe(100);
    expect(await effectiveProductionReceiptQuantity(db.manager,pm)).toBe(20);
    expect((await effectiveExactProductionByGrade(db.manager,pm)).get('GRADE_1')).toBe(20);
    const [correctionFloor]=await db.query(`SELECT SUM(a.quantity*a.direction)::int AS quantity FROM production_inbound_allocations a
      JOIN production_inbound_documents doc ON doc.id=a.document_id AND doc.state='POSTED' WHERE a.daily_log_id=$1`,[pm]);
    expect(correctionFloor.quantity).toBe(20);
    actor={userId:1,username:'maker',permissions:['MENU_PROD_INBOUND:V,C,E']}; const next=input(180);next.items[0].allocations=[{dailyLogId:pm,quantity:180,evidenceFileId:'FILE-HANDOVER'}];
    await post(await ready(next));
    expect((await service.balance('COMP-A','HOUSE-A',day,'WH-A')).grades.GRADE_1.posted).toBe(300);
    expect(await effectiveProductionReceiptQuantity(db.manager,pm)).toBe(200);
    expect((await db.query("SELECT cost_change FROM inv_ledger WHERE change_type='PRODUCTION_INBOUND_REVERSAL'"))[0].cost_change).toBeNull();
  });

  it('rechecks finance evidence after approval and never posts a zero value for unknown cost', async () => {
    const d=await ready(); await post(d); const [a]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1',[d.id]);
    const { approved }=await reversal(d,[{allocationId:a.id,quantity:30}]);
    await db.query("UPDATE file_metadata SET status='INACTIVE' WHERE file_id='FILE-FINANCE'");
    await expect(post(approved)).rejects.toThrow('财务核验凭据已变化');
    expect((await db.query('SELECT qty FROM inv_batches'))[0].qty).toBe('100');
    expect((await service.get(approved.id)).state).toBe('APPROVED');
  });

  it('a same-day close after finance approval blocks posting; reopening invalidates the old clearance version', async () => {
    const d=await ready();await post(d);const [a]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1',[d.id]);
    const { approved }=await reversal(d,[{allocationId:a.id,quantity:20}]);
    const periodMonth=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date()).slice(0,7);
    actor={userId:2,username:'approver',permissions:['MENU_PROD_INBOUND:V,E,A','MENU_FIN2_AR_LEDGER:E']};
    await service.setPostingPeriod({companyCode:'COMP-A',houseCode:'HOUSE-A',periodMonth,state:'CLOSED',expectedVersion:1,
      evidenceFileId:'FILE-FINANCE',reason:'Synthetic close after approval'});
    await expect(post(approved)).rejects.toThrow('已经关账');
    actor.permissions=['MENU_PROD_INBOUND:V,C,E,A','MENU_FIN2_AR_LEDGER:V,E,A'];
    await service.setPostingPeriod({companyCode:'COMP-A',houseCode:'HOUSE-A',periodMonth,state:'OPEN',expectedVersion:2,
      evidenceFileId:'FILE-FINANCE',reason:'Synthetic separately authorized reopening'});
    await expect(post(approved)).rejects.toThrow('期间已变化');
    expect((await db.query('SELECT qty FROM inv_batches'))[0].qty).toBe('100');
  });

  it('preserves a NULL original cost as UNKNOWN and rejects confirming it as a real zero', async () => {
    const d=await ready();await post(d);
    await db.query('ALTER TABLE inv_batches ALTER COLUMN unit_cost DROP NOT NULL; UPDATE inv_batches SET unit_cost=NULL');
    try {
      const [a]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1',[d.id]);
      const draft=await service.createReversal(d.id,{intentKey:randomUUID(),reason:'Synthetic null cost evidence',segments:[{allocationId:a.id,quantity:20}],evidenceFileIds:['FILE-HANDOVER']});
      const r=await service.ready(draft.id,draft.version,randomUUID());
      actor={userId:2,username:'approver',permissions:['MENU_PROD_INBOUND:V,C,E,A','MENU_FIN2_AR_LEDGER:E']};
      const [line]=await db.query('SELECT batch_no FROM production_inbound_lines WHERE document_id=$1',[d.id]);
      await expect(service.recordFinancialClearance(r.id,{contentHash:r.content_hash,financialEvidenceFileId:'FILE-FINANCE',periodStatus:'OPEN',
        costs:[{batchNo:line.batch_no,costStatus:'CONFIRMED',unitCost:0}]})).rejects.toThrow('成本与原批记录不一致');
      const c=await service.recordFinancialClearance(r.id,{contentHash:r.content_hash,financialEvidenceFileId:'FILE-FINANCE',periodStatus:'OPEN',
        costs:[{batchNo:line.batch_no,costStatus:'UNKNOWN',unitCost:null}]});
      expect(c.costs[0].recordedUnitCost).toBeNull();
      actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E,A']};
      const approved=await service.approveReversal(r.id,r.version,r.content_hash,c.id);await post(approved);
      expect((await db.query("SELECT cost_change FROM inv_ledger WHERE change_type='PRODUCTION_INBOUND_REVERSAL'"))[0].cost_change).toBeNull();
      const inv=new EggInventoryService(db,cls as any,new SkuAvailabilityService(db));
      const value=await inv.getInventoryValuation({companyCode:'COMP-A',warehouseCode:'WH-A'});
      expect(value.summary.costPending).toEqual({qty:80,batchCount:1});
      expect(value.rows[0].totalCost).toBeNull();
      const kpis=await new InventoryAnalyticsService(db.manager).compute({companyCode:'COMP-A',warehouseCode:'WH-A'});
      expect(kpis.capitalOccupation).toBeNull();expect(kpis.costPendingBatches).toBe(1);expect(kpis.costPendingQuantity).toBe(80);
      expect((await new InventoryAnalyticsService(db.manager).compute({companyCode:'COMP-B',warehouseCode:'WH-A'})).capitalOccupation).toBe(0);
    } finally { await db.query('UPDATE inv_batches SET unit_cost=0; ALTER TABLE inv_batches ALTER COLUMN unit_cost SET NOT NULL'); }
  });

  it('distinguishes a finance-confirmed genuine zero from an unpriced zero placeholder', async () => {
    const d=await ready();await post(d);const [a]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1',[d.id]);
    const draft=await service.createReversal(d.id,{intentKey:randomUUID(),reason:'Synthetic verified actual zero',segments:[{allocationId:a.id,quantity:20}],evidenceFileIds:['FILE-HANDOVER']});
    const r=await service.ready(draft.id,draft.version,randomUUID());actor={userId:2,username:'approver',permissions:['MENU_PROD_INBOUND:V,C,E,A','MENU_FIN2_AR_LEDGER:E']};
    const [line]=await db.query('SELECT batch_no FROM production_inbound_lines WHERE document_id=$1',[d.id]);
    const c=await service.recordFinancialClearance(r.id,{contentHash:r.content_hash,financialEvidenceFileId:'FILE-FINANCE',periodStatus:'OPEN',
      costs:[{batchNo:line.batch_no,costStatus:'CONFIRMED',unitCost:0}]});
    actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E,A']};
    await post(await service.approveReversal(r.id,r.version,r.content_hash,c.id));
    expect((await db.query("SELECT cost_change::numeric AS value FROM inv_ledger WHERE change_type='PRODUCTION_INBOUND_REVERSAL'"))[0].value).toBe('0.000000');
    await expect(db.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,change_type,qty_change,cost_change,ref_no)
      VALUES($1,'COMP-A','WH-A','PRODUCTION_INBOUND_REVERSAL',-20,0,$2)`,[line.batch_no,r.document_no])).rejects.toThrow('COST_CLEARANCE_HOLD');
  });
  it('invalidates an approved reversal when qualification changes with the same unit cost',async()=>{
    const original=await ready();await post(original);
    const [allocation]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1',[original.id]);
    const [line]=await db.query('SELECT batch_no FROM production_inbound_lines WHERE document_id=$1',[original.id]);
    const draft=await service.createReversal(original.id,{intentKey:randomUUID(),reason:'Synthetic qualification variation',
      segments:[{allocationId:allocation.id,quantity:20}],evidenceFileIds:['FILE-HANDOVER']});
    const frozen=await service.ready(draft.id,draft.version,randomUUID());
    actor={userId:2,username:'approver',permissions:['MENU_PROD_INBOUND:V,C,E,A','MENU_FIN2_AR_LEDGER:E']};
    const clearance=await service.recordFinancialClearance(frozen.id,{contentHash:frozen.content_hash,financialEvidenceFileId:'FILE-FINANCE',
      periodStatus:'OPEN',costs:[{batchNo:line.batch_no,costStatus:'UNKNOWN',unitCost:0}]});
    actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E,A']};
    const approved=await service.approveReversal(frozen.id,frozen.version,frozen.content_hash,clearance.id);
    const [trigger]=await db.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='production_batch_qualifications'::regclass
      AND NOT tgisinternal AND (tgtype & 16)<>0`);
    expect(trigger.tgname).toMatch(/^[a-z_][a-z0-9_]*$/);
    const [prior]=await db.query('SELECT cost_status FROM production_batch_qualifications WHERE batch_no=$1',[line.batch_no]);
    const update=async(status:string)=>db.transaction(async m=>{
      await m.query('ALTER TABLE production_batch_qualifications DISABLE TRIGGER '+trigger.tgname);
      await m.query('UPDATE production_batch_qualifications SET cost_status=$1 WHERE batch_no=$2',[status,line.batch_no]);
      await m.query('ALTER TABLE production_batch_qualifications ENABLE TRIGGER '+trigger.tgname);
    });
    await update(prior.cost_status==='UNKNOWN'?'CONFIRMED':'UNKNOWN');
    try {
      await expect(post(approved)).rejects.toThrow('原成本快照已变化');
      await expect(service.cancel(approved.id,approved.version)).rejects.toThrow('请由系统管理员处置');
      expect((await db.query('SELECT state FROM production_inbound_documents WHERE id=$1',[approved.id]))[0].state).toBe('APPROVED');
      Reflect.set(actor,'role','ROLE_ADMIN');
      expect((await service.cancel(approved.id,approved.version)).state).toBe('CANCELLED');
    } finally {
      await update(prior.cost_status);
      Reflect.deleteProperty(actor,'role');
    }
  });
  it('uses exact decimal original costs and rejects duplicate or orphaned approved reversal ledgers',async()=>{
    const d=await ready();await post(d);const [a]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1',[d.id]);
    const [line]=await db.query('SELECT batch_no FROM production_inbound_lines WHERE document_id=$1',[d.id]);
    await db.query("UPDATE inv_batches SET unit_cost='100000000000.000020' WHERE batch_no=$1",[line.batch_no]);
    const draft=await service.createReversal(d.id,{intentKey:randomUUID(),reason:'Synthetic exact decimal cost',segments:[{allocationId:a.id,quantity:4}],evidenceFileIds:['FILE-HANDOVER']});
    const r=await service.ready(draft.id,draft.version,randomUUID());actor={userId:2,username:'approver',permissions:['MENU_PROD_INBOUND:V,C,E,A','MENU_FIN2_AR_LEDGER:E']};
    const c=await service.recordFinancialClearance(r.id,{contentHash:r.content_hash,financialEvidenceFileId:'FILE-FINANCE',periodStatus:'OPEN',
      costs:[{batchNo:line.batch_no,costStatus:'CONFIRMED',unitCost:100000000000.00002}]});
    actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E,A']};
    const approved=await service.approveReversal(r.id,r.version,r.content_hash,c.id);
    const raw=(m:EntityManager)=>m.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,change_type,qty_change,cost_change,ref_no)
      VALUES($1,'COMP-A','WH-A','PRODUCTION_INBOUND_REVERSAL',-4,'-400000000000.000080',$2)`,[line.batch_no,r.document_no]);
    await expect(db.transaction(async m=>{await raw(m);await raw(m);})).rejects.toThrow('uq_official_reversal_ledger_source');
    await expect(db.transaction(raw)).rejects.toThrow('REVERSAL_LEDGER_LINE_HOLD');
    await post(approved);
    expect((await db.query("SELECT cost_change::text AS value FROM inv_ledger WHERE change_type='PRODUCTION_INBOUND_REVERSAL'"))[0].value).toBe('-400000000000.000080');
  });

  it('keeps production date separate from frozen booking date and denies fresh posts to a V-only user', async () => {
    await resetFixture('DAILY','2026-11-17');
    const p=input();p.eggDate='2026-11-17';const d=await ready(p);const receipt=await post(d);
    const [b]=await db.query('SELECT egg_date::text,inbound_date::text FROM inv_batches');
    const [l]=await db.query('SELECT log_date::text FROM inv_ledger');
    expect(b).toEqual({egg_date:'2026-11-17',inbound_date:receipt.postingDate});expect(l.log_date).toBe(receipt.postingDate);
    actor={userId:1,username:'maker',permissions:['MENU_PROD_INBOUND:V']};expect(await post(d)).toEqual(receipt);
  });

  it('binds EXACT to two-party structured segments and rechecks the original attachment checksum', async () => {
    const d=await ready();await db.query("UPDATE file_metadata SET checksum=repeat('d',64) WHERE file_id='FILE-HANDOVER'");
    try {await expect(post(d)).rejects.toThrow('原证据失效或摘要已改变');expect((await totals()).batches).toBe(0);}
    finally {await db.query("UPDATE file_metadata SET checksum=repeat('e',64) WHERE file_id='FILE-HANDOVER'");}
  });

  it('recovers a cancelled original intent after the same handover was reopened', async () => {
    const p=input();await physical(p);const first=await service.create(p);await service.cancel(first.id,first.version);
    const second=await service.create({...p,intentKey:randomUUID()});expect(second.id).not.toBe(first.id);
    expect((await service.create(p)).id).toBe(first.id);
  });

  it('audits immutable posted net/source facts, accepts sales depletion and holds an orphan reversal without changing the global audit', async () => {
    const d=await ready();const receipt=await post(d);const batch=receipt.batches[0].batchNo;
    await db.query('UPDATE inv_batches SET qty=qty-40,qty_available=qty_available-40 WHERE batch_no=$1',[batch]);
    await db.query("INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no) VALUES($1,'SALES',-40,'SYNTHETIC-AUDIT-SALE')",[batch]);
    const audit=()=>{
      const child=spawnSync(process.execPath,[resolve(__dirname,'../../../../../..','scripts/ops/audit-production-installments.mjs'),
        '--database-url-env','OFFICIAL_INVENTORY_PG_URL','--schema',schema],{env:{...process.env,OFFICIAL_INVENTORY_PG_URL:url!},encoding:'utf8'});
      return {status:child.status,result:JSON.parse(child.stdout||child.stderr)};
    };
    const good=audit();expect(good.status).toBe(0);expect(good.result.integrityStatus).toBe('PASS');expect(good.result.releaseAdmission).toBe(false);
    expect(good.result.transaction).toMatchObject({read_only:'on',isolation:'repeatable read'});
    expect(good.result.counts).toMatchObject({posted_inbound:1,posted_reversals:0});
    const orphan="INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no) VALUES($1,'PRODUCTION_INBOUND_REVERSAL',-1,'SYNTHETIC-ORPHAN-REVERSAL')";
    await expect(db.query(orphan,[batch])).rejects.toThrow('COST_CLEARANCE_HOLD');
    // Deliberate pre-guard corruption in this owned schema: the read-only audit must still diagnose historical drift.
    await db.transaction(async m=>{
      await m.query('ALTER TABLE inv_ledger DISABLE TRIGGER trg_official_inventory_ledger_cost;ALTER TABLE inv_ledger DISABLE TRIGGER trg_official_reversal_ledger_line');
      await m.query(orphan,[batch]);
      await m.query('ALTER TABLE inv_ledger ENABLE TRIGGER trg_official_inventory_ledger_cost;ALTER TABLE inv_ledger ENABLE TRIGGER trg_official_reversal_ledger_line');
    });
    const held=audit();expect(held.status).toBe(2);expect(held.result.integrityStatus).toBe('HOLD');
    expect(held.result.checks.find((c:any)=>c.name==='orphanReversalLedger').count).toBe(1);
    expect((await post(d)).totalInbound).toBe(100);expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[batch]))[0].qty).toBe('60');
  });

  async function purchase(unit='枚',unitCost=2) {
    scope.allowedWarehouseCodes.push('WH-A2');await db.query("UPDATE wms_warehouses SET type='PURCHASE_RECV' WHERE warehouse_code='WH-A2'");
    await db.query("INSERT INTO prc2_receipts VALUES(10,'SYNTHETIC-PURCHASE','COMP-A','WH-A2','CONFIRMED')");
    await db.query("INSERT INTO prc2_receipt_items VALUES(11,10,'SKU-GRADE_1',100,$1)",[unit]);
    const wms=new WmsService(db.manager,cls as any);
    const r=await db.transaction(m=>wms.inboundFromReceipt(m,{refNo:'SYNTHETIC-PURCHASE',warehouseCode:'WH-A2',operator:'maker',inboundDate:day,
      items:[{receiptItemId:'11',itemCode:'SKU-GRADE_1',qty:100,unit,unitCost}]}));
    return {wms,batch:r.batchNos[0]};
  }
  async function setSyntheticDomainState(id:string,state:'ACTIVE'|'SUSPENDED'){
    await db.transaction(async m=>{
      const [d]=await m.query('SELECT * FROM production_inventory_domain_states WHERE id=$1',[id]);
      const file=`FILE-DOMAIN-${d.warehouse_code}`;
      await m.query(`INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,store_code,uploaded_by,checksum)
        VALUES($1,'ACTIVE','PROTECTED','application/pdf','PRODUCTION_CUTOVER','WAREHOUSE',$2,'COMP-A','SITE-A','maker',repeat('d',64)) ON CONFLICT DO NOTHING`,[file,d.warehouse_code]);
      await m.query(`INSERT INTO production_inventory_domain_events(id,domain_id,state,version,intent_key,content_hash,reason,signed_by,evidence_file_id,evidence_checksum)
        VALUES($1,$2,$3,$4,$5,repeat('d',64),'Isolated synthetic state operation','1',$6,repeat('d',64))`,[randomUUID(),id,state,d.version+1,randomUUID(),file]);
      await m.query('UPDATE production_inventory_domain_states SET state=$2,version=version+1 WHERE id=$1',[id,state]);
    });
  }
  async function syntheticActiveDomain(id:string,warehouse:string,openingLines:any[]=[],writeOpening?:(m:any,manifestId:string)=>Promise<any>){
    await db.transaction(async m=>{
      const manifest=randomUUID();
      await m.query(`INSERT INTO production_cutover_manifests(id,document_no,company_code,warehouse_code,intent_key,creation_hash,boundary,payload,created_by)
        VALUES($1,$2,'COMP-A',$3,$2,repeat('d',64),$4,$5,'isolated count maker')`,[manifest,`COUNT-${manifest}`,warehouse,
          JSON.stringify({productCodes:['PRD-EGG-RAW'],houses:[{houseCode:'HOUSE-A',firstProductionDate:'2026-11-17'}]}),JSON.stringify({openingLines,postingDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date())})]);
      await m.query(`UPDATE production_cutover_manifests SET state='READY',version=version+1,snapshot='{}',snapshot_sha256=repeat('d',64),content_hash=repeat('d',64) WHERE id=$1`,[manifest]);
      for(const [role,actor,name] of [['BUSINESS','1','maker'],['FINANCE','2','approver']]){
        const file=`FILE-COUNT-${warehouse}-${role}`;
        await m.query(`INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,store_code,uploaded_by,checksum)
          VALUES($1,'ACTIVE','PROTECTED','application/pdf','PRODUCTION_CUTOVER','WAREHOUSE',$2,'COMP-A','SITE-A',$3,repeat('d',64)) ON CONFLICT DO NOTHING`,[file,warehouse,name]);
        await m.query(`INSERT INTO production_cutover_signatures(id,manifest_id,signature_role,content_hash,snapshot_sha256,signed_by,evidence_file_id,evidence_checksum,reason)
          VALUES($1,$2,$3,repeat('d',64),repeat('d',64),$4,$5,repeat('d',64),'Isolated synthetic count signature')`,[randomUUID(),manifest,role,actor,file]);
      }
      await m.query(`UPDATE production_cutover_manifests SET state='APPROVED',version=version+1 WHERE id=$1`,[manifest]);
      await m.query(`INSERT INTO production_inventory_domain_states(id,company_code,warehouse_code,product_code,created_by)
        VALUES($1,'COMP-A',$2,'PRD-EGG-RAW','isolated count maker')`,[id,warehouse]);
      const openingReceipt=randomUUID();
      for(const [state,version] of [['FENCED',1],['ACTIVE',2]]){
        await m.query(`INSERT INTO production_inventory_domain_events(id,domain_id,state,version,manifest_id,intent_key,content_hash,reason,signed_by,evidence_file_id,evidence_checksum)
          VALUES($1::uuid,$2,$3,$4,$5,$1::text,repeat('d',64),'Synthetic zero opening state operation','1',$6,repeat('d',64))`,
          [randomUUID(),id,state,version,manifest,`FILE-COUNT-${warehouse}-BUSINESS`]);
        await m.query('UPDATE production_inventory_domain_states SET state=$2,version=$3 WHERE id=$1',[id,state,version]);
        if(state==='FENCED')await m.query(`INSERT INTO production_opening_domain_claims(domain_id,manifest_id,opening_receipt_id,scope_id,content_hash,claimed_by)
          VALUES($1,$2,$3,'20000000-0000-0000-0000-000000000001',repeat('d',64),'1')`,[id,manifest,openingReceipt]);
      }
      const receipt=writeOpening?await writeOpening(m,manifest):{synthetic:true,totalOpening:0,batches:[]};
      await m.query(`INSERT INTO production_opening_receipts(id,handover_ref,company_code,warehouse_code,scope_id,evidence_sha256,manifest,created_by,receipt)
        VALUES($1,$2,'COMP-A',$3,'20000000-0000-0000-0000-000000000001',repeat('d',64),$4,'1',$5)`,[openingReceipt,`SYNTHETIC-ZERO-${manifest}`,warehouse,JSON.stringify({manifestId:manifest}),JSON.stringify(receipt)]);
      await m.query(`UPDATE production_cutover_manifests SET state='APPLIED',version=version+1,applied_at=now(),receipt=$2 WHERE id=$1`,[manifest,JSON.stringify(receipt)]);
    });
  }
  it('separates a shared inventory-domain pause from a house pause and a purchase-source pause',async()=>{
    await syntheticActiveDomain('50000000-0000-0000-0000-000000000001','WH-A');
    const production=await post(await ready());const {wms,batch}=await purchase();
    await wms.confirmTransfer({transfer_no:'SHARED-PURCHASE',from_warehouse:'WH-A2',to_warehouse:'WH-A',items:[{batch_no:batch,qty:20}]},{username:'maker'});
    const [child]=await db.query("SELECT batch_no FROM inv_batches WHERE source_no='SHARED-PURCHASE'");
    await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED'");
    await expect(assertOfficialInventoryBatches(db,[production.batches[0].batchNo])).rejects.toThrow();
    await expect(wms.createTransfer({transfer_no:'PAUSED-PENDING',from_warehouse:'WH-A',to_warehouse:'WH-A2',items:[{batch_no:production.batches[0].batchNo,qty:1}]},{username:'maker'})).rejects.toThrow('测试期');
    await expect(assertOfficialInventoryBatches(db,[child.batch_no])).resolves.toBeUndefined();
    await wms.confirmTransfer({transfer_no:'SHARED-PURCHASE-NEXT',from_warehouse:'WH-A',to_warehouse:'WH-A2',items:[{batch_no:child.batch_no,qty:10}]},{username:'maker'});
    const [grandchild]=await db.query("SELECT batch_no FROM inv_batches WHERE source_no='SHARED-PURCHASE-NEXT'");
    await setSyntheticDomainState('50000000-0000-0000-0000-000000000001','SUSPENDED');
    await expect(assertOfficialInventoryBatches(db,[child.batch_no])).rejects.toThrow();
    await expect(assertOfficialInventoryBatches(db,[batch,grandchild.batch_no])).resolves.toBeUndefined();
    await setSyntheticDomainState('50000000-0000-0000-0000-000000000001','ACTIVE');
    await syntheticActiveDomain('50000000-0000-0000-0000-000000000002','WH-A2');
    await setSyntheticDomainState('50000000-0000-0000-0000-000000000002','SUSPENDED');
    await expect(assertOfficialInventoryBatches(db,[child.batch_no])).resolves.toBeUndefined();
    await expect(assertOfficialInventoryBatches(db,[batch,grandchild.batch_no])).rejects.toThrow();
    await setSyntheticDomainState('50000000-0000-0000-0000-000000000002','ACTIVE');
    await db.query(`INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,store_code,uploaded_by,checksum)
      VALUES('FILE-SOURCE-PAUSE','ACTIVE','PROTECTED','application/pdf','INVENTORY_SOURCE_CONTROL','BATCH',$1,'COMP-A','SITE-A','maker',repeat('a',64))`,[batch]);
    await db.query(`INSERT INTO production_source_state_events(id,root_batch_no,company_code,source_warehouse_code,state,version,intent_key,
      content_hash,reason,signed_by,evidence_file_id,evidence_checksum) VALUES($1,$2,'COMP-A','WH-A2','SUSPENDED',1,'SOURCE-PAUSE',repeat('a',64),
      'Synthetic isolated source-control fact','1','FILE-SOURCE-PAUSE',repeat('a',64))`,[randomUUID(),batch]);
    for(const no of [batch,child.batch_no,grandchild.batch_no]){
      await expect(assertOfficialInventoryBatches(db,[no])).rejects.toThrow();
      await expect(assertOfficialInventoryBatches(db,[no],false)).resolves.toBeUndefined();
    }
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,source_type,source_no,qty,qty_available)
      VALUES('OTHER-PRODUCT','COMP-A','WH-A','PRD-STD','SKU-STD','PURCHASE','UNRELATED',3,3)`);
    await expect(assertOfficialInventoryBatches(db,['OTHER-PRODUCT'])).resolves.toBeUndefined();
  });
  it('records an ordinary sale cost as unknown while retaining a proven zero for availability-only movements',async()=>{
    const posted=await post(await ready()),batch=posted.batches[0].batchNo;
    await db.transaction(async m=>{
      await m.query('UPDATE inv_batches SET qty=qty-10,qty_available=qty_available-10 WHERE batch_no=$1',[batch]);
      await writeInvLedger(m,{batchNo:batch,changeType:INV_LEDGER_CHANGE_TYPE.FIFO_OUT,qtyChange:-10,costChange:0,operator:'maker',companyCode:'COMP-A',warehouseCode:'WH-A',refNo:'SYNTHETIC-SALE',note:'Synthetic ordinary sale using the shared actual writer'});
      await m.query('UPDATE inv_batches SET qty_available=qty_available-5 WHERE batch_no=$1',[batch]);
      await writeInvLedger(m,{batchNo:batch,changeType:INV_LEDGER_CHANGE_TYPE.RESERVED,qtyChange:-5,costChange:0,operator:'maker',companyCode:'COMP-A',warehouseCode:'WH-A',refNo:'SYNTHETIC-RESERVATION',note:'Availability only; no physical cost movement'});
    });
    const entries=await db.query("SELECT change_type,cost_change::text AS cost FROM inv_ledger WHERE batch_no=$1 AND change_type IN ('FIFO_OUT','RESERVED') ORDER BY id",[batch]);
    expect(entries).toEqual([{change_type:'FIFO_OUT',cost:null},{change_type:'RESERVED',cost:'0.000000'}]);
    const [known]=await db.query(`SELECT official_inventory_cost_known(b.batch_no) AS persisted,${officialInventoryCostKnownPredicate('b')} AS queried FROM inv_batches b WHERE batch_no=$1`,[batch]);
    expect(known).toEqual({persisted:false,queried:false});
    await expect(db.query("UPDATE inv_ledger SET cost_change=0 WHERE batch_no=$1 AND change_type='FIFO_OUT'",[batch])).rejects.toThrow('LEDGER_HISTORY_IMMUTABLE');
    await expect(db.query("DELETE FROM inv_ledger WHERE batch_no=$1 AND change_type='FIFO_OUT'",[batch])).rejects.toThrow('LEDGER_HISTORY_IMMUTABLE');
    await db.query("INSERT INTO inv_ledger(batch_no,change_type,qty_change,cost_change,ref_no) VALUES($1,'TEMP_PRODUCTION_INBOUND',0,0,'SYNTHETIC-OLD-WRITER-BOUNDARY')",[batch]);
    expect((await db.query("SELECT cost_change FROM inv_ledger WHERE ref_no='SYNTHETIC-OLD-WRITER-BOUNDARY'"))[0].cost_change).toBeNull();
  });
  it('does not turn an ordinary unknown-cost row into a finance-confirmed reversal by changing only its type',async()=>{
    const d=await post(await ready());
    await expect(db.query(`INSERT INTO inv_ledger(batch_no,company_code,change_type,qty_change,cost_change,ref_no)
      VALUES($1,'COMP-A','PRODUCTION_INBOUND_REVERSAL',-1,0,'SYNTHETIC-UNAPPROVED-COST')`,[d.batches[0].batchNo])).rejects.toThrow('COST_CLEARANCE_HOLD');
    expect((await db.query('SELECT count(*)::int AS n FROM inv_ledger'))[0].n).toBe(1);
  });
  it('retains unrelated OFF stock financial zeros without admitting it to a formal scope',async()=>{
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,source_type,source_no,qty,qty_available,unit_cost)
      VALUES('SYNTHETIC-OFF-COST','COMP-B','WH-B','PRD-EGG-RAW','SKU-GRADE_1','PURCHASE','SYNTHETIC-OFF',10,10,0);
      INSERT INTO inv_ledger(batch_no,change_type,qty_change,cost_change,ref_no) VALUES('SYNTHETIC-OFF-COST','PURCHASE_INBOUND',10,0,'SYNTHETIC-OFF')`);
    expect((await db.query("SELECT cost_change::text AS cost FROM inv_ledger WHERE batch_no='SYNTHETIC-OFF-COST'"))[0].cost).toBe('0.000000');
    await db.query("UPDATE inv_ledger SET cost_change=1 WHERE batch_no='SYNTHETIC-OFF-COST'");
    expect((await db.query("SELECT cost_change::text AS cost FROM inv_ledger WHERE batch_no='SYNTHETIC-OFF-COST'"))[0].cost).toBe('1.000000');
    await expect(db.transaction('REPEATABLE READ',m=>m.query("UPDATE inv_ledger SET cost_change=2 WHERE batch_no='SYNTHETIC-OFF-COST'"))).rejects.toThrow('ISOLATION_HOLD');
  });
  it('shares qualification locks with maintenance of preexisting orphan history even without a physical batch',async()=>{
    // Owned fault fixture for a preexisting NOT VALID foreign-key orphan; ordinary inserts remain guarded.
    await db.transaction(async m=>{
      await m.query('ALTER TABLE inv_ledger DISABLE TRIGGER ALL');
      await m.query("INSERT INTO inv_ledger(batch_no,change_type,qty_change,cost_change,ref_no) VALUES('SYNTHETIC-MISSING-BATCH','FIFO_OUT',-1,0,'SYNTHETIC-HISTORICAL-ORPHAN')");
      await m.query('ALTER TABLE inv_ledger ENABLE TRIGGER ALL');
    });
    const registration=`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,disposition,origin_kind,origin_ref,evidence_sha256,created_by)
      VALUES('SYNTHETIC-MISSING-BATCH','20000000-0000-0000-0000-000000000001','COMP-A','PRD-EGG-RAW','SKU-GRADE_1',
        'ARCHIVED_TEST','PRODUCTION','SYNTHETIC-HISTORICAL-ORPHAN',repeat('a',64),'fixture')`;
    const writer=db.createQueryRunner();await writer.connect();await writer.startTransaction();
    try{
      await writer.query("UPDATE inv_ledger SET cost_change=1 WHERE batch_no='SYNTHETIC-MISSING-BATCH'");
      await expect(db.query(registration)).rejects.toThrow('ROOT_BUSY');
      await writer.rollbackTransaction();await writer.startTransaction();await writer.query(registration);
      await expect(db.query("DELETE FROM inv_ledger WHERE batch_no='SYNTHETIC-MISSING-BATCH'")).rejects.toThrow('ROOT_BUSY');
      await writer.commitTransaction();
      await expect(db.query("UPDATE inv_ledger SET cost_change=2 WHERE batch_no='SYNTHETIC-MISSING-BATCH'")).rejects.toThrow('LEDGER_HISTORY_IMMUTABLE');
      expect((await db.query("SELECT cost_change::text AS cost FROM inv_ledger WHERE batch_no='SYNTHETIC-MISSING-BATCH'"))[0].cost).toBe('0.000000');
    }finally{if(writer.isTransactionActive)await writer.rollbackTransaction();await writer.release();}
  });
  it('posts approved counted opening once through WMS with unknown versus confirmed zero cost and no daily quota',async()=>{
    await db.query(`INSERT INTO sys_dict(dict_type,dict_code,status) VALUES('INV_STOCK_STATUS','AVAILABLE','ACTIVE'),('INV_STOCK_STATUS','QUARANTINE','ACTIVE') ON CONFLICT DO NOTHING`);
    const wms=new WmsService(db.manager,cls as any),postingDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date());
    const common={skuCode:'SKU-GRADE_1',productCode:'PRD-EGG-RAW',gradeCode:'GRADE_1',specCode:'LOOSE',locationCode:'LOC-A',productionDate:'2026-11-17',expireDate:'2099-12-31'};
    let posted:any,manifestId='';
    await syntheticActiveDomain('50000000-0000-0000-0000-000000000001','WH-A',[
      {...common,quantity:50,stockStatus:'QUARANTINE',costStatus:'UNKNOWN',unitCost:null,qualityConfirmed:false},
      {...common,quantity:20,stockStatus:'AVAILABLE',costStatus:'CONFIRMED',unitCost:0,qualityConfirmed:true}],async(m,id)=>{
        manifestId=id;posted=await wms.postApprovedOpening(m,id);return posted;
      });
    expect(posted).toMatchObject({totalOpening:70,postingDate});
    const rows=await db.query(`SELECT b.qty,b.qty_available,b.source_type,b.collection_batch_ref,b.source_profile_code,
      q.cost_status,${officialInventoryCostKnownPredicate('b')} AS cost_known FROM inv_batches b JOIN production_batch_qualifications q USING(batch_no) ORDER BY b.batch_no`);
    expect(rows).toEqual([expect.objectContaining({qty:'50',qty_available:'0',source_type:'OPENING',collection_batch_ref:null,source_profile_code:null,cost_status:'UNKNOWN',cost_known:false}),
      expect.objectContaining({qty:'20',qty_available:'20',cost_status:'CONFIRMED',cost_known:true})]);
    expect((await service.balance('COMP-A','HOUSE-A',day,'WH-A')).grades.GRADE_1.posted).toBe(0);
    expect(await totals()).toEqual({batches:2,ledgers:2,lines:0,receipts:0,links:0});
    await db.query("UPDATE product_skus SET status='DISABLED'; UPDATE file_metadata SET status='DISABLED'");
    expect(await db.transaction(m=>wms.postApprovedOpening(m,manifestId))).toEqual(posted);
    expect((await db.query('SELECT count(*)::int AS n FROM inv_ledger'))[0].n).toBe(2);
    await db.query("UPDATE product_skus SET status='ACTIVE'; UPDATE file_metadata SET status='ACTIVE'");
    await db.transaction(async m=>{
      const batch=posted.batches[1].batchNo;await m.query('UPDATE inv_batches SET qty=qty-1,qty_available=qty_available-1 WHERE batch_no=$1',[batch]);
      await writeInvLedger(m,{batchNo:batch,changeType:INV_LEDGER_CHANGE_TYPE.FIFO_OUT,qtyChange:-1,costChange:0,operator:'maker',companyCode:'COMP-A',warehouseCode:'WH-A',refNo:'SYNTHETIC-KNOWN-ZERO-SALE',note:'Confirmed actual zero remains zero'});
    });
    expect((await db.query("SELECT cost_change::text AS cost FROM inv_ledger WHERE ref_no='SYNTHETIC-KNOWN-ZERO-SALE'"))[0].cost).toBe('0.000000');
  });
  it('rejects a forged second opening root even when it copies an actual signed manifest/domain',async()=>{
    await syntheticActiveDomain('50000000-0000-0000-0000-000000000001','WH-A');
    const [manifest]=await db.query('SELECT * FROM production_cutover_manifests');
    await expect(db.transaction(async m=>{
      await m.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,disposition,origin_kind,origin_ref,
        evidence_sha256,created_by,source_type,source_no,cost_status,inventory_domain_id,source_warehouse_code,source_quantity,source_unit,opening_manifest_id)
        VALUES('FORGED-OPENING','20000000-0000-0000-0000-000000000001','COMP-A','PRD-EGG-RAW','SKU-GRADE_1','QUALIFIED','OPENING','COPIED-SECOND-LINE',
          repeat('d',64),'1','OPENING',$1,'UNKNOWN','50000000-0000-0000-0000-000000000001','WH-A',100,'枚',$2)`,[manifest.document_no,manifest.id]);
      await m.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,source_type,source_no,unit,qty,qty_available)
        VALUES('FORGED-OPENING','COMP-A','WH-A','PRD-EGG-RAW','SKU-GRADE_1','OPENING',$1,'枚',100,100)`,[manifest.document_no]);
    })).rejects.toThrow('SOURCE_REJECTED');
    expect((await db.query('SELECT count(*)::int AS n FROM production_batch_qualifications'))[0].n).toBe(0);
  });
  it('rejects raw state shortcuts and a domain event committed without its matching projection',async()=>{
    await expect(db.query(`INSERT INTO production_inventory_domain_states(id,company_code,warehouse_code,product_code,state,created_by)
      VALUES($1,'COMP-A','WH-A','PRD-EGG-RAW','ACTIVE','fixture')`,[randomUUID()])).rejects.toThrow('INITIAL_STATE');
    await syntheticActiveDomain('50000000-0000-0000-0000-000000000001','WH-A');
    await expect(db.query(`INSERT INTO production_inventory_domain_events(id,domain_id,state,version,intent_key,content_hash,reason,signed_by,evidence_file_id,evidence_checksum)
      VALUES($1,'50000000-0000-0000-0000-000000000001','SUSPENDED',3,'BARE-EVENT',repeat('d',64),'Synthetic missing projection','1','FILE-COUNT-WH-A-BUSINESS',repeat('d',64))`,[randomUUID()]))
      .rejects.toThrow('EVENT_PROJECTION_REQUIRED');
    expect((await db.query('SELECT count(*)::int AS n FROM production_inventory_domain_events'))[0].n).toBe(2);
  });
  it('holds first-domain fencing behind a prior stock writer even when no domain row existed at the write',async()=>{
    const writer=db.createQueryRunner();await writer.connect();await writer.startTransaction();
    try{
      await writer.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,source_type,source_no,qty,qty_available)
        VALUES('BEFORE-FIRST-DOMAIN','COMP-A','WH-A2','PRD-EGG-RAW','SKU-GRADE_1','PURCHASE','SYNTHETIC-OFF',10,10)`);
      await expect(syntheticActiveDomain('50000000-0000-0000-0000-000000000002','WH-A2')).rejects.toThrow('PRODUCT_BUSY');
      expect((await db.query('SELECT count(*)::int AS n FROM production_inventory_domain_states'))[0].n).toBe(0);
      await writer.rollbackTransaction();
      await syntheticActiveDomain('50000000-0000-0000-0000-000000000002','WH-A2');
    }finally{if(writer.isTransactionActive)await writer.rollbackTransaction();await writer.release();}
  });
  it('fences late purchase qualification behind an existing source-only operation on an unqualified root',async()=>{
    const {batch}=await purchase();const reader=db.createQueryRunner();await reader.connect();await reader.startTransaction();
    const admit=()=>db.transaction(m=>qualifyPurchaseInventory(m,{batchNo:batch,companyCode:'COMP-A',warehouseCode:'WH-A2',productCode:'PRD-EGG-RAW',skuCode:'SKU-GRADE_1',
      receiptNo:'SYNTHETIC-PURCHASE',receiptItemId:'11',itemCode:'SKU-GRADE_1',quantity:100,unitCost:2,actor:'maker',baseUnit:'枚',
      admission:{scopeId:'20000000-0000-0000-0000-000000000001',companyCode:'COMP-A',warehouseCode:'WH-A',productCode:'PRD-EGG-RAW'}}));
    try{
      await assertOfficialInventoryBatches(reader.manager,[batch]);
      await expect(admit()).rejects.toThrow('ROOT_BUSY');
      await reader.commitTransaction();await admit();
      await expect(assertOfficialInventoryBatches(db,[batch])).resolves.toBeUndefined();
    }finally{if(reader.isTransactionActive)await reader.rollbackTransaction();await reader.release();}
  });
  it('keeps independent purchase admission, descendants and unknown-cost valuation controlled with a DRAFT house audit anchor',async()=>{
    await syntheticActiveDomain('50000000-0000-0000-0000-000000000002','WH-A2');
    await db.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
      VALUES('20000000-0000-0000-0000-000000000002','COMP-A','HOUSE-A',2,'2026-11-19','DRAFT','WH-A2','FLOCK-A','PROFILE-A',repeat('c',64),'{}','fixture');
      INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code,inventory_domain_id)
        VALUES('20000000-0000-0000-0000-000000000002','COMP-A','WH-A2','PRD-EGG-RAW','50000000-0000-0000-0000-000000000002')`);
    const {wms,batch}=await purchase('枚',0);
    const [q]=await db.query('SELECT * FROM production_batch_qualifications WHERE batch_no=$1',[batch]);
    expect(q).toMatchObject({scope_id:'20000000-0000-0000-0000-000000000002',cost_status:'UNKNOWN',origin_kind:'PURCHASE'});
    await wms.confirmTransfer({transfer_no:'DRAFT-ANCHOR-CHILD',from_warehouse:'WH-A2',to_warehouse:'WH-A',items:[{batch_no:batch,qty:20}]},{username:'maker'});
    const [child]=await db.query("SELECT batch_no FROM inv_batches WHERE source_no='DRAFT-ANCHOR-CHILD'");
    await wms.confirmTransfer({transfer_no:'DRAFT-ANCHOR-GRANDCHILD',from_warehouse:'WH-A',to_warehouse:'WH-A2',items:[{batch_no:child.batch_no,qty:10}]},{username:'maker'});
    const costs=await db.query(`SELECT ${officialInventoryCostKnownPredicate('b')} AS known FROM inv_batches b`);
    expect(costs).toHaveLength(3);expect(costs.every((c:any)=>c.known===false)).toBe(true);
    await expect(db.query("UPDATE inv_batches SET source_no='FORGED-RECEIPT' WHERE batch_no=$1",[batch])).rejects.toThrow('IDENTITY_IMMUTABLE');
  });
  it('checks NEW purchase-root quantity and identity before a raw batch mutation can commit',async()=>{
    const {wms,batch}=await purchase();
    await wms.confirmTransfer({transfer_no:'TUPLE-BASELINE',from_warehouse:'WH-A2',to_warehouse:'WH-A',items:[{batch_no:batch,qty:20}]},{username:'maker'});
    for(const sql of ["qty=101,qty_available=101","unit='kg'","warehouse_code='WH-A'","source_no='COPIED-OTHER-RECEIPT'"])
      await expect(db.query(`UPDATE inv_batches SET ${sql} WHERE batch_no=$1`,[batch])).rejects.toThrow(/SOURCE_QUANTITY_IDENTITY_HOLD|IDENTITY_IMMUTABLE|SOURCE_IDENTITY_MISMATCH/);
    expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[batch]))[0].qty).toBe('80');
  });
  it('rejects fractional base eggs at real in-transit receipt and rolls back every target fact',async()=>{
    const original=await post(await ready()),wms=new WmsService(db.manager,cls as any);scope.allowedWarehouseCodes.push('WH-A2');
    const batch=original.batches[0].batchNo;
    await wms.createTransfer({transfer_no:'FRACTIONAL-RECEIPT',from_warehouse:'WH-A',to_warehouse:'WH-A2',items:[{batch_no:batch,qty:10}]},{username:'maker'});
    await wms.dispatchTransfer('FRACTIONAL-RECEIPT',{username:'maker'});
    await expect(wms.receiveTransfer('FRACTIONAL-RECEIPT',{items:[{batch_no:batch,received_qty:0.5,damaged_qty:0}]},{username:'maker'})).rejects.toThrow();
    expect((await db.query("SELECT status FROM wms_transfer WHERE transfer_no='FRACTIONAL-RECEIPT'"))[0].status).toBe('IN_TRANSIT');
    expect((await db.query("SELECT count(*)::int AS n FROM inv_batches WHERE source_type='TRANSFER'"))[0].n).toBe(0);
    const received=await wms.receiveTransfer('FRACTIONAL-RECEIPT',{receive_all:true},{username:'maker'});expect(received.code).toBe(200);
  });
  it('admits a real persisted base-unit purchase only when its actual transfer enters the approved domain', async () => {
    const {wms,batch}=await purchase();expect(batch).toBe(purchaseReceiptBatchNo('SYNTHETIC-PURCHASE','11'));
    expect((await db.query('SELECT count(*)::int AS n FROM production_batch_qualifications'))[0].n).toBe(0);
    await wms.confirmTransfer({transfer_no:'PURCHASE-TO-FARM',from_warehouse:'WH-A2',to_warehouse:'WH-A',items:[{batch_no:batch,qty:20}]},{username:'maker'});
    const [root]=await db.query('SELECT * FROM production_batch_qualifications WHERE batch_no=$1',[batch]);expect(root).toMatchObject({origin_kind:'PURCHASE',origin_ref:'SYNTHETIC-PURCHASE:11',company_code:'COMP-A'});
    const [child]=await db.query("SELECT * FROM inv_batches WHERE source_type='TRANSFER' AND source_no='PURCHASE-TO-FARM'");
    expect(child).toMatchObject({qty:'20',grade_code_std:'GRADE_1',spec_code:'LOOSE',base_quantity_version:1,sku_code:'SKU-GRADE_1'});
    expect((await db.query('SELECT root_batch_no FROM production_batch_roots WHERE batch_no=$1',[child.batch_no]))[0].root_batch_no).toBe(batch);
    expect((await db.query('SELECT SUM(qty)::int AS n FROM inv_batches'))[0].n).toBe(100);
    const pool=await db.transaction(m=>sharedBatches(m,'COMP-A',['WH-A'],{version:1,basis:'BASE',productCode:'PRD-EGG-RAW',gradeCode:'GRADE_1',
      skuCode:'SKU-GRADE_1',specCode:'LOOSE',baseUnit:'枚',tradeUnit:'枚',factor:1,baseQty:20}));
    expect(pool.map((b:{batch_no:string})=>b.batch_no)).toEqual([child.batch_no]);
    expect((await service.balance('COMP-A','HOUSE-A',day,'WH-A')).grades.GRADE_1.posted).toBe(0);
  });
  it('keeps suspended production readable but skips it in an operational pool that still accepts an independent purchase child',async()=>{
    const posted=await post(await ready()),{wms,batch}=await purchase();
    await wms.confirmTransfer({transfer_no:'SYNTHETIC-PURCHASE-BESIDE-SUSPENDED',from_warehouse:'WH-A2',to_warehouse:'WH-A',items:[{batch_no:batch,qty:20}]},{username:'maker'});
    await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED'");
    await expect(assertOfficialInventoryBatches(db,[posted.batches[0].batchNo],false)).resolves.toBeUndefined();
    const pool=await db.transaction(m=>sharedBatches(m,'COMP-A',['WH-A'],{version:1,basis:'BASE',productCode:'PRD-EGG-RAW',gradeCode:'GRADE_1',
      skuCode:'SKU-GRADE_1',specCode:'LOOSE',baseUnit:'枚',tradeUnit:'枚',factor:1,baseQty:20}));
    expect(pool).toHaveLength(1);expect(pool[0].source_no).toBe('SYNTHETIC-PURCHASE-BESIDE-SUSPENDED');expect(pool[0].qty_available).toBe('20');
    await expect(assertOfficialInventoryBatches(db,[pool[0].batch_no])).resolves.toBeUndefined();
  });
  it('rejects a legacy unknown batch that merely copies a receipt label, preserving admission for the real original',async()=>{
    const {wms,batch}=await purchase();await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,
      grade_code_std,spec_code,unit,base_quantity_version,status,qty,qty_available,source_type,source_no)
      VALUES('UNPROVEN-OLD-NUMBER','COMP-A','WH-A2','PRD-EGG-RAW','SKU-GRADE_1','GRADE_1','LOOSE','枚',1,'AVAILABLE',30,30,'PURCHASE','SYNTHETIC-PURCHASE')`);
    await db.query("INSERT INTO inv_ledger(batch_no,qty_change,change_type,ref_no) VALUES('UNPROVEN-OLD-NUMBER',30,'PURCHASE_INBOUND','SYNTHETIC-PURCHASE')");
    await expect(wms.confirmTransfer({transfer_no:'UNKNOWN-RECEIPT-LABEL',from_warehouse:'WH-A2',to_warehouse:'WH-A',items:[{batch_no:'UNPROVEN-OLD-NUMBER',qty:20}]},{username:'maker'})).rejects.toThrow('采购根原行');
    expect((await db.query('SELECT count(*)::int AS n FROM production_batch_qualifications'))[0].n).toBe(0);
    await wms.confirmTransfer({transfer_no:'PROVEN-ORIGINAL',from_warehouse:'WH-A2',to_warehouse:'WH-A',items:[{batch_no:batch,qty:20}]},{username:'maker'});
    expect((await db.query("SELECT batch_no FROM production_batch_qualifications WHERE origin_kind='PURCHASE'"))[0].batch_no).toBe(batch);
  });
  for(const withLedger of [false,true])it(`does not hide an over-receipt root by deducting before admission (extra ledger=${withLedger})`,async()=>{
    const {wms,batch}=await purchase();await db.query('UPDATE inv_batches SET qty=120,qty_available=120 WHERE batch_no=$1',[batch]);
    if(withLedger)await db.query("INSERT INTO inv_ledger(batch_no,qty_change,change_type,ref_no) VALUES($1,20,'STOCKTAKE_UP','SYNTHETIC-EXTRA')",[batch]);
    await expect(wms.confirmTransfer({transfer_no:'OVER-RECEIPT',from_warehouse:'WH-A2',to_warehouse:'WH-A',items:[{batch_no:batch,qty:30}]},{username:'maker'})).rejects.toThrow('初始入库、余额或额外入账');
    expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[batch]))[0].qty).toBe('120');
    expect((await db.query('SELECT count(*)::int AS n FROM production_batch_qualifications'))[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM wms_transfer'))[0].n).toBe(0);
  });
  it('closes either conflicting product identity while preserving a material with the same code',async()=>{
    for(const [product,sku] of [['PRD-EGG-RAW','SKU-STD'],['PRD-STD','SKU-GRADE_1']]){
      await expect(db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,source_type,source_no,qty,qty_available)
        VALUES($1,'COMP-A','WH-A',$2,$3,'PURCHASE','UNPROVEN',1,1)`,[`MISMATCH-${sku}`,product,sku])).rejects.toThrow('OFFICIAL_INVENTORY_SOURCE_REJECTED');
    }
    for(const company of [null,'ALL'])await expect(db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,source_type,source_no,qty,qty_available)
      VALUES($1,$2,'WH-A','PRD-EGG-RAW','SKU-GRADE_1','PURCHASE','UNOWNED',1,1)`,[`UNOWNED-${company}`,company])).rejects.toThrow('OFFICIAL_INVENTORY_SOURCE_REJECTED');
    await db.query(`INSERT INTO mst_materials(material_code,material_name,material_type,unit,status) VALUES('PRD-EGG-RAW','Distinct material namespace','PACKAGING','kg','ACTIVE');
      INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,material_code,item_type,unit,source_type,source_no,qty,qty_available)
      VALUES('ACTUAL-MATERIAL','COMP-A','WH-A',NULL,NULL,'PRD-EGG-RAW','MATERIAL','kg','MATERIAL','UNRELATED',3,3)`);
    await expect(assertOfficialInventoryBatches(db,['ACTUAL-MATERIAL'])).resolves.toBeUndefined();
  });
  it('rolls back the complete transfer when a confirmed purchase has no verified base-unit quantity', async () => {
    const {wms,batch}=await purchase('箱');
    await expect(wms.confirmTransfer({transfer_no:'UNVERIFIED-UNIT',from_warehouse:'WH-A2',to_warehouse:'WH-A',items:[{batch_no:batch,qty:20}]},{username:'maker'})).rejects.toThrow('正式采购来源');
    expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[batch]))[0].qty).toBe('100');
    expect((await db.query('SELECT count(*)::int AS n FROM inv_ledger'))[0].n).toBe(1);
    expect((await db.query('SELECT count(*)::int AS n FROM production_batch_qualifications'))[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM wms_transfer'))[0].n).toBe(0);
  });

  it('moves genuine zero-available restricted stock without changing its state, grade, root or source profile', async () => {
    await db.query(`UPDATE brd_daily_logs SET eggs_by_grade='{"GRADE_0":0,"GRADE_1":0,"GRADE_2":0,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0,"DIRTY":100,"BROKEN":100}'`);
    scope.allowedWarehouseCodes.push('WH-A2');const wms=new WmsService(db.manager,cls as any);
    for(const [grade,status] of [['DIRTY','QUARANTINE'],['BROKEN','DAMAGED']]) {
      const original=await post(await ready(input(100,grade)));const batch=original.batches[0].batchNo;
      const [before]=await db.query('SELECT * FROM inv_batches WHERE batch_no=$1',[batch]);expect(before.qty_available).toBe('0');
      const body={disposition_no:`FIXTURE-${grade}`,batch_no:batch,qty:20,action:'TRANSFER',target_warehouse_code:'WH-A2',target_location_code:'LOC-A2',reason:'Synthetic actual restricted stock transfer'};
      const result=await wms.disposeDefectInventory(body,{username:'maker',permissions:['MENU_INV_BATCH:E']});expect(result.code).toBe(200);
      const [source]=await db.query('SELECT qty,qty_available FROM inv_batches WHERE batch_no=$1',[batch]);expect(source).toEqual({qty:'80',qty_available:'0'});
      const [child]=await db.query("SELECT * FROM inv_batches WHERE source_type='DEFECT_TRANSFER' AND source_no=$1",[body.disposition_no]);
      expect(child).toMatchObject({status,qty:'20',qty_available:'0',grade_code_std:grade,sku_code:before.sku_code,
        variety_code:before.variety_code,source_profile_code:before.source_profile_code,source_profile_snapshot:before.source_profile_snapshot,base_quantity_version:1,inventory_class:'DEFECT_SALE'});
      expect((await db.query('SELECT root_batch_no FROM production_batch_roots WHERE batch_no=$1',[child.batch_no])).map((r:any)=>r.root_batch_no)).toEqual([batch]);
      expect((await wms.disposeDefectInventory(body,{username:'maker',permissions:['MENU_INV_BATCH:E']})).idempotent).toBe(true);
    }
  });

  it('never moves or writes ledger facts for an archived restricted source, including a warehouse outside the initial domain', async () => {
    scope.allowedWarehouseCodes.push('WH-A2');
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,location_code,product_code,sku_code,grade_code_std,quality_grade,
      status,qty,qty_available,source_type,source_no) VALUES('SYNTHETIC-OLD-DIRTY','COMP-A','WH-A2','LOC-A2','PRD-EGG-RAW','SKU-DIRTY','DIRTY','DIRTY','QUARANTINE',30,0,'LEGACY_TEST','OLD');
      INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,disposition,origin_kind,origin_ref,evidence_sha256,created_by)
      VALUES('SYNTHETIC-OLD-DIRTY','20000000-0000-0000-0000-000000000001','COMP-A','PRD-EGG-RAW','SKU-DIRTY','ARCHIVED_TEST','PRODUCTION','OLD-SYNTHETIC',repeat('a',64),'fixture');`);
    await expect(new WmsService(db.manager,cls as any).disposeDefectInventory({disposition_no:'ARCHIVE-BLOCK',batch_no:'SYNTHETIC-OLD-DIRTY',qty:10,
      action:'TRANSFER',target_warehouse_code:'WH-A',reason:'Synthetic archive must hold'}, {username:'maker',permissions:['MENU_INV_BATCH:E']})).rejects.toThrow('OFFICIAL_INVENTORY_SOURCE_REJECTED');
    expect((await db.query("SELECT qty FROM inv_batches WHERE batch_no='SYNTHETIC-OLD-DIRTY'"))[0].qty).toBe('30');
    expect((await db.query('SELECT count(*)::int AS n FROM inv_ledger'))[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM wms_defect_dispositions'))[0].n).toBe(0);
  });

  it('requires the approved warehouse domain even when the caller has another same-company warehouse', async () => {
    await expect(service.balance('COMP-A','HOUSE-A',day,undefined as any)).rejects.toThrow('仓库无效');
    scope.allowedWarehouseCodes.push('WH-A2');
    await expect(service.balance('COMP-A','HOUSE-A',day,'WH-A2')).rejects.toThrow('测试期记录已归档');
  });

  it('posts ordinary inbound without a separately opened monthly finance period', async () => {
    await db.query('TRUNCATE production_posting_periods,production_posting_period_events');
    const receipt=await post(await ready());expect(receipt.totalInbound).toBe(100);
  });

  it('cancels an unposted signed physical handover with audit and explicitly re-signs its successor', async () => {
    const p=input();const original=await physical(p);const d=await service.create(p);
    actor={userId:2,username:'approver',permissions:['MENU_PROD_INBOUND:V,A,E']};
    await expect(service.cancelPhysicalHandover(original.id,2,'Synthetic returned handover',['FILE-FINANCE'])).rejects.toThrow('先取消');
    await service.cancel(d.id,d.version);
    const cancelled=await service.cancelPhysicalHandover(original.id,2,'Synthetic physical difference and return',['FILE-FINANCE']);
    expect(cancelled.state).toBe('CANCELLED');
    expect((await db.query('SELECT original_hash,actor FROM production_handover_cancellations WHERE handover_id=$1',[original.id]))[0])
      .toEqual({original_hash:original.content_hash,actor:'2'});
    actor={userId:1,username:'maker',permissions:['MENU_PROD_INBOUND:V,C,E']};
    const [report]=await db.query('SELECT id FROM brd_daily_logs');
    const corrected={companyCode:p.companyCode,houseCode:p.houseCode,eggDate:p.eggDate,warehouseCode:p.warehouseCode,
      handoverRef:p.handoverRef!,segments:[{dailyLogId:report.id,gradeCode:'GRADE_1',quantity:90,evidenceFileId:'FILE-HANDOVER'}]};
    await expect(service.createPhysicalHandover(corrected)).rejects.toThrow('重新签认');
    const successor=await service.createPhysicalHandover({...corrected,replacesId:original.id});
    expect(successor.replaces_id).toBe(original.id);expect(successor.state).toBe('DRAFT');
    actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E']};
    await service.confirmPhysicalHandover(successor.id,1,successor.content_hash);
    actor={userId:1,username:'maker',permissions:['MENU_PROD_INBOUND:V,C,E']};
    const next=await service.create({...p,intentKey:randomUUID(),items:[{gradeCode:'GRADE_1',quantity:90,specCode:'LOOSE'}]});
    const receipt=await post(await service.ready(next.id,next.version,randomUUID()));expect(receipt.totalInbound).toBe(90);
    actor={userId:2,username:'approver',permissions:['MENU_PROD_INBOUND:V,A,E']};
    await expect(service.cancelPhysicalHandover(successor.id,2,'Cannot reuse posted physical',['FILE-FINANCE'])).rejects.toThrow('已过账交接');
    await expect(db.query("UPDATE production_handover_cancellations SET reason='tamper' WHERE handover_id=$1",[original.id])).rejects.toThrow();
  });

  it('uses only its pinned transaction connection with a two-connection pool', async () => {
    const a=input(100),b=input(100);await physical(a);await physical(b);
    const first=await service.create(a),second=await service.create(b);
    const limited=await new DataSource({...db.options,extra:{options:`-c search_path=${schema} -c statement_timeout=3000 -c lock_timeout=3000`,max:2,connectionTimeoutMillis:1000}} as any).initialize();
    try {
      const skus=new SkuAvailabilityService(limited);const inv=new EggInventoryService(limited,cls as any,skus);
      const master=new ProductionInboundService(limited,cls as any,inv,{} as any,new OrgOwnershipService(limited.manager),skus);
      const api=new ProductionInboundDocumentsService(limited,cls as any,master,inv,skus);
      const ready=await Promise.all([api.ready(first.id,first.version,randomUUID()),api.ready(second.id,second.version,randomUUID())]);
      const result=await Promise.all(ready.map(d=>api.post(d.id,d.submit_key,d.content_hash)));expect(result).toHaveLength(2);
    }finally{await limited.destroy();}
  });
});
