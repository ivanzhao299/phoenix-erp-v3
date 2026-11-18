import 'reflect-metadata';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { installProductionInboundFixture } from './production-inbound.pg-fixture';
import { ProductionInboundDocumentsService, InboundDraftInput } from './production-inbound-documents.service';
import { ProductionInboundService } from './production-inbound.service';
import { EggInventoryService } from './egg-inventory.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { SkuAvailabilityService } from '../../product-master/services/sku-availability.service';
import { AlignWmsTransactionForms1787731200000 } from '../../../database/migrations/1787731200000-AlignWmsTransactionForms';
import { UpgradeWmsTransferLifecycle1787965200000 } from '../../../database/migrations/1787965200000-UpgradeWmsTransferLifecycle';
import { purchaseReceiptBatchNo } from '../../wms/purchase-inventory-qualification';
import { sharedBatches } from '../../product-master/services/quantity-contract';
import { AddWmsDefectDisposition1794405000000 } from '../../../database/migrations/1794405000000-AddWmsDefectDisposition';
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
      CREATE TABLE store_master(id bigint PRIMARY KEY,store_code text,status text);
      ALTER TABLE wms_warehouses ADD COLUMN owner_store_id bigint;
      CREATE TABLE mst_materials(material_code text PRIMARY KEY,material_name text,material_type text,unit text,status text);
      CREATE TABLE prc2_receipts(id bigint PRIMARY KEY,receipt_no text,company_code text,warehouse_code text,status text);
      CREATE TABLE prc2_receipt_items(id bigint PRIMARY KEY,receipt_id bigint REFERENCES prc2_receipts(id),item_code text,actual_qty numeric,unit text);`);
    const transfer=db.createQueryRunner();await transfer.connect();try{await new AlignWmsTransactionForms1787731200000().up(transfer);await new UpgradeWmsTransferLifecycle1787965200000().up(transfer);}finally{await transfer.release();}
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
  async function resetFixture(mode:"DAILY"|"AMPM"="DAILY",reportDay:"2026-11-17"|"2026-11-18"=day) {
    await db.query(`TRUNCATE prc2_receipt_items,prc2_receipts,wms_transfer_discrepancies,wms_transfer_items,wms_transfer,wms_stocktake,wms_defect_dispositions,production_physical_handovers,production_posting_periods,production_posting_period_events,production_inbound_allocations,production_inbound_lines,production_inbound_documents,
      production_opening_receipts,production_inbound_days,production_batch_roots,production_batch_qualifications,
      production_inventory_domains,production_cutover_scopes,inv_ledger,inv_batches,brd_daily_logs,inv_flock_source_links,
      brd_egg_source_receipts,brd_egg_day_routes,brd_flock_occupancies,brd_flock_documents RESTART IDENTITY CASCADE;
      INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,house_code,business_date,payload,status,created_by)
      VALUES('SYNTHETIC-BASELINE','SYNTHETIC-COUNT',repeat('b',64),'BASELINE','COMP-A','FARM-A','HOUSE-A','2026-11-17','{}','POSTED','fixture');
      INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,capacity_snapshot,opened_document_id)
      VALUES('SYNTHETIC-OCC','FLOCK-A','HOUSE-A','COMP-A','FARM-A','SITE-A','2026-11-17',5000,'SYNTHETIC-BASELINE');
      INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,
        warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
      VALUES('20000000-0000-0000-0000-000000000001','COMP-A','HOUSE-A',1,'2026-11-17','DRAFT','WH-A',
        'FLOCK-A','PROFILE-A',repeat('c',64),'{"synthetic":true}','fixture');
      INSERT INTO production_inventory_domains VALUES('20000000-0000-0000-0000-000000000001','COMP-A','WH-A','PRD-EGG-RAW');
      UPDATE production_cutover_scopes SET state='FENCED';
      UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now();
      INSERT INTO brd_daily_logs(house_code,flock_no,log_date,shift,eggs_by_grade,occupancy_id,company_code,farm_code,site_code)
      ${mode==='DAILY'?`VALUES('HOUSE-A','FLOCK-A','${reportDay}','DAILY','{"GRADE_1":1000,"GRADE_2":100}','SYNTHETIC-OCC','COMP-A','FARM-A','SITE-A')`:
        `VALUES('HOUSE-A','FLOCK-A','${reportDay}','AM','{"GRADE_1":100}','SYNTHETIC-OCC','COMP-A','FARM-A','SITE-A'),('HOUSE-A','FLOCK-A','${reportDay}','PM','{"GRADE_1":200}','SYNTHETIC-OCC','COMP-A','FARM-A','SITE-A')`};
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

  it('1000 → 100 → sell 40 → 900; original receipt stays 100 and stock is 960', async () => {
    const p = input(100); const d = await ready(p); const first = await post(d);
    await db.query('UPDATE inv_batches SET qty=qty-40,qty_available=qty_available-40 WHERE batch_no=$1',[first.batches[0].batchNo]);
    await db.query(`INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no) VALUES($1,'FIFO_OUT',-40,'SYNTHETIC-SALE')`,[first.batches[0].batchNo]);
    const second = await post(await ready(input(900)));
    expect(second.totalInbound).toBe(900); expect((await post(d)).totalInbound).toBe(100);
    expect((await service.create(p)).id).toBe(d.id);
    const balance = await service.balance('COMP-A','HOUSE-A',day,'WH-A');
    expect(balance.grades.GRADE_1).toEqual({ reported:1000,posted:1000,remaining:0 });
    expect((await db.query('SELECT sum(qty)::int AS quantity FROM inv_batches'))[0].quantity).toBe(960);
    expect((await service.get(d.id)).lines[0]).toMatchObject({ quantity:100,current_quantity:'60' });
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
    const approved=await service.approveReversal(frozen.id,frozen.version,frozen.content_hash,clearance.id);
    return { frozen,approved,clearance };
  }

  it('AM100 / PM200 → 150(100/50) → reverse PM30 → PM180; sources and quota count compensation once', async () => {
    await resetFixture('AMPM');
    const reports=await db.query('SELECT id,shift FROM brd_daily_logs ORDER BY id'); const am=reports[0].id,pm=reports[1].id;
    const p=input(150); p.items[0].allocations=[{dailyLogId:am,quantity:100,evidenceFileId:'FILE-HANDOVER'},
      {dailyLogId:pm,quantity:50,evidenceFileId:'FILE-HANDOVER'}];
    const d=await ready(p); await post(d);
    const [segment]=await db.query('SELECT id FROM production_inbound_allocations WHERE document_id=$1 AND daily_log_id=$2',[d.id,pm]);
    const { approved }=await reversal(d,[{allocationId:segment.id,quantity:30}]);
    const receipt=await post(approved); expect(receipt.totalReversed).toBe(30); expect(await post(approved)).toEqual(receipt);
    expect((await service.balance('COMP-A','HOUSE-A',day,'WH-A')).grades.GRADE_1).toEqual({reported:300,posted:120,remaining:180});
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
    await post(await service.approveReversal(r.id,r.version,r.content_hash,c.id));
    expect((await db.query("SELECT cost_change::numeric AS value FROM inv_ledger WHERE change_type='PRODUCTION_INBOUND_REVERSAL'"))[0].value).toBe('0.000000');
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
    await db.query("INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no) VALUES($1,'PRODUCTION_INBOUND_REVERSAL',-1,'SYNTHETIC-ORPHAN-REVERSAL')",[batch]);
    const held=audit();expect(held.status).toBe(2);expect(held.result.integrityStatus).toBe('HOLD');
    expect(held.result.checks.find((c:any)=>c.name==='orphanReversalLedger').count).toBe(1);
    expect((await post(d)).totalInbound).toBe(100);expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[batch]))[0].qty).toBe('60');
  });

  async function purchase(unit='枚') {
    scope.allowedWarehouseCodes.push('WH-A2');await db.query("UPDATE wms_warehouses SET type='PURCHASE_RECV' WHERE warehouse_code='WH-A2'");
    await db.query("INSERT INTO prc2_receipts VALUES(10,'SYNTHETIC-PURCHASE','COMP-A','WH-A2','CONFIRMED')");
    await db.query("INSERT INTO prc2_receipt_items VALUES(11,10,'SKU-GRADE_1',100,$1)",[unit]);
    const wms=new WmsService(db.manager,cls as any);
    const r=await db.transaction(m=>wms.inboundFromReceipt(m,{refNo:'SYNTHETIC-PURCHASE',warehouseCode:'WH-A2',operator:'maker',inboundDate:day,
      items:[{receiptItemId:'11',itemCode:'SKU-GRADE_1',qty:100,unit,unitCost:2}]}));
    return {wms,batch:r.batchNos[0]};
  }
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
  it('rolls back the complete transfer when a confirmed purchase has no verified base-unit quantity', async () => {
    const {wms,batch}=await purchase('箱');
    await expect(wms.confirmTransfer({transfer_no:'UNVERIFIED-UNIT',from_warehouse:'WH-A2',to_warehouse:'WH-A',items:[{batch_no:batch,qty:20}]},{username:'maker'})).rejects.toThrow('正式采购来源');
    expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[batch]))[0].qty).toBe('100');
    expect((await db.query('SELECT count(*)::int AS n FROM inv_ledger'))[0].n).toBe(1);
    expect((await db.query('SELECT count(*)::int AS n FROM production_batch_qualifications'))[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM wms_transfer'))[0].n).toBe(0);
  });

  it('moves genuine zero-available restricted stock without changing its state, grade, root or source profile', async () => {
    await db.query(`UPDATE brd_daily_logs SET eggs_by_grade='{"DIRTY":100,"BROKEN":100}'`);
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
