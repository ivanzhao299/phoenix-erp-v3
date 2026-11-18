import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { installProductionInboundFixture } from './production-inbound.pg-fixture';
import { ProductionInboundDocumentsService, InboundDraftInput } from './production-inbound-documents.service';
import { ProductionInboundService } from './production-inbound.service';
import { EggInventoryService } from './egg-inventory.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { SkuAvailabilityService } from '../../product-master/services/sku-availability.service';
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
  beforeEach(async () => {
    await db.query(`TRUNCATE production_physical_handovers,production_posting_periods,production_posting_period_events,production_inbound_allocations,production_inbound_lines,production_inbound_documents,
      production_opening_receipts,production_inbound_days,production_batch_roots,production_batch_qualifications,
      production_inventory_domains,production_cutover_scopes,inv_ledger,inv_batches,brd_daily_logs,inv_flock_source_links,
      brd_egg_source_receipts,brd_egg_day_routes,brd_flock_occupancies,brd_flock_documents RESTART IDENTITY CASCADE;
      INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,house_code,business_date,payload,status,created_by)
      VALUES('SYNTHETIC-BASELINE','SYNTHETIC-COUNT',repeat('b',64),'BASELINE','COMP-A','FARM-A','HOUSE-A','2026-11-17','{}','POSTED','fixture');
      INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,capacity_snapshot,opened_document_id)
      VALUES('SYNTHETIC-OCC','FLOCK-A','HOUSE-A','COMP-A','FARM-A','SITE-A','2026-11-17',5000,'SYNTHETIC-BASELINE');
      INSERT INTO brd_daily_logs(house_code,flock_no,log_date,shift,eggs_by_grade,occupancy_id)
      VALUES('HOUSE-A','FLOCK-A','2026-11-18','DAILY','{"GRADE_1":1000,"GRADE_2":100}', 'SYNTHETIC-OCC');
      INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,
        warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
      VALUES('20000000-0000-0000-0000-000000000001','COMP-A','HOUSE-A',1,'2026-11-17','DRAFT','WH-A',
        'FLOCK-A','PROFILE-A',repeat('c',64),'{"synthetic":true}','fixture');
      INSERT INTO production_inventory_domains VALUES('20000000-0000-0000-0000-000000000001','COMP-A','WH-A','PRD-EGG-RAW');
      UPDATE production_cutover_scopes SET state='FENCED';
      UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now();
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
  });
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
    await db.query(`DELETE FROM brd_daily_logs; INSERT INTO brd_daily_logs(house_code,flock_no,log_date,shift,eggs_by_grade,occupancy_id)
      VALUES('HOUSE-A','FLOCK-A','2026-11-18','AM','{"GRADE_1":100}','SYNTHETIC-OCC'),
        ('HOUSE-A','FLOCK-A','2026-11-18','PM','{"GRADE_1":200}','SYNTHETIC-OCC')`);
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
    await db.query(`DELETE FROM brd_daily_logs; INSERT INTO brd_daily_logs(house_code,flock_no,log_date,shift,eggs_by_grade,occupancy_id)
      VALUES('HOUSE-A','FLOCK-A','2026-11-18','AM','{"GRADE_1":100}','SYNTHETIC-OCC'),
        ('HOUSE-A','FLOCK-A','2026-11-18','PM','{"GRADE_1":200}','SYNTHETIC-OCC')`);
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
    await db.query("UPDATE brd_daily_logs SET log_date='2026-11-17'");
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
