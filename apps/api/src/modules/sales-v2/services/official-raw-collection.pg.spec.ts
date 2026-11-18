import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { OfficialRawCollectionReceipts1795005390930 } from '../../../database/migrations/1795005390930-OfficialRawCollectionReceipts';
import { installProductionInboundFixture } from './production-inbound.pg-fixture';
import { OfficialRawCollectionService } from './official-raw-collection.service';
import { ProductionInboundDocumentsService } from './production-inbound-documents.service';
import { ProductionInboundService } from './production-inbound.service';
import { EggInventoryService } from './egg-inventory.service';
import { InventorySourceModeService } from './inventory-source-mode.service';
import { SkuAvailabilityService } from '../../product-master/services/sku-availability.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { effectiveExactProductionByGrade,effectiveProductionReceiptQuantity } from '../../farm/effective-production-source';

const url=process.env.OFFICIAL_INVENTORY_PG_URL;
(url?describe:describe.skip)('official raw collection — actual signed sources without an inventory parent',()=>{
  let db:DataSource,raw:OfficialRawCollectionService,documents:ProductionInboundDocumentsService,scope:any,actor:any;
  const schema=`raw_collection_${process.pid}`,day='2026-11-18',grades=['GRADE_0','GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','DIRTY','BROKEN'];
  const cls={get:(key:string)=>key==='dataScope'?scope:actor};
  const maker=()=>{actor={userId:1,username:'maker',permissions:['MENU_PROD_INBOUND:V,C,E']};};
  const reviewer=()=>{actor={userId:2,username:'reviewer',permissions:['MENU_PROD_INBOUND:V,A,E']};};
  beforeAll(async()=>{
    const u=new URL(url!);if(u.hostname!=='127.0.0.1'||!['/phoenix_temp_reversal_fixture','/installments_fixture'].includes(u.pathname))throw Error('Owned fixture required');
    db=await new DataSource({type:'postgres',url,synchronize:false,migrationsRun:false,installExtensions:false,
      extra:{options:`-c search_path=${schema}`,max:10}}).initialize();
    if(!(await db.query('SHOW server_version'))[0].server_version.startsWith('18.'))throw Error('PG18 required');
    await db.query(`CREATE SCHEMA "${schema}"`);await installProductionInboundFixture(db,grades);
    await db.query(`ALTER TABLE pkg_source_batches ADD COLUMN batch_code text,ADD COLUMN source_inbound_no text,ADD COLUMN shift_id int,
      ADD COLUMN total_qty int,ADD COLUMN dirty_qty int DEFAULT 0,ADD COLUMN cracked_qty int DEFAULT 0,ADD COLUMN batch_status text;
      CREATE TABLE pkg_work_shifts(id int PRIMARY KEY,site_id text,production_date date,is_test boolean);
      CREATE TABLE wms_inbound(inbound_no text PRIMARY KEY,status text);
      CREATE TABLE sys_user(user_id int PRIMARY KEY,username text,status int DEFAULT 1);
      INSERT INTO sys_user VALUES(1,'maker',1),(2,'reviewer',1),(3,'receiver',1);
      ALTER TABLE file_metadata ADD COLUMN checksum text;
      INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,store_code,uploaded_by,checksum)
        VALUES('RAW-EVIDENCE','ACTIVE','PROTECTED','application/pdf','PRODUCTION_INBOUND','HOUSE','HOUSE-A','COMP-A','SITE-A','maker',repeat('a',64));
      CREATE TABLE inv_source_mode(scope_level text,scope_code text,mode text);
      INSERT INTO inv_source_mode VALUES('GROUP','ALL','PACKAGING_INBOUND');
      CREATE TABLE brd_medication_records(flock_no text,status text,start_date date,withdraw_until date);`);
    const q=db.createQueryRunner();await q.connect();try{await new OfficialRawCollectionReceipts1795005390930().up(q);}finally{await q.release();}
    const skus=new SkuAvailabilityService(db),inventory=new EggInventoryService(db,cls as never,skus);
    const legacy=new ProductionInboundService(db,cls as never,inventory,new InventorySourceModeService(db,cls as never),new OrgOwnershipService(db.manager),skus);
    documents=new ProductionInboundDocumentsService(db,cls as never,legacy,inventory,skus);raw=new OfficialRawCollectionService(db,cls as never,skus);
  });
  afterAll(async()=>{if(db?.isInitialized){await db.query(`DROP SCHEMA "${schema}" CASCADE`);await db.destroy();}});
  async function reset(ampm=false,reported=1000){
    await db.query(`TRUNCATE production_raw_receipt_segments,production_raw_receipts,production_handover_cancellations,production_physical_handovers,
      production_posting_periods,production_posting_period_events,production_inbound_allocations,production_inbound_lines,production_inbound_documents,
      production_inbound_days,production_batch_roots,production_batch_qualifications,production_inventory_domains,production_cutover_scopes,
      inv_ledger,inv_batches,brd_egg_source_receipts,brd_egg_day_routes,inv_flock_source_links,brd_daily_logs,brd_flock_occupancies,brd_flock_documents,
      pkg_source_batches,pkg_work_shifts,wms_inbound RESTART IDENTITY CASCADE;
      DELETE FROM inv_source_mode;INSERT INTO inv_source_mode VALUES('GROUP','ALL','PACKAGING_INBOUND');UPDATE md_egg_source_profiles SET status='ACTIVE';UPDATE sys_user SET status=1;
      UPDATE file_metadata SET status='ACTIVE';
      INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,house_code,business_date,payload,status,created_by)
        VALUES('RAW-BASE','RAW-SYNTHETIC-COUNT',repeat('b',64),'BASELINE','COMP-A','FARM-A','HOUSE-A','2026-11-17','{}','POSTED','fixture');
      INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,capacity_snapshot,opened_document_id)
        VALUES('RAW-OCC','FLOCK-A','HOUSE-A','COMP-A','FARM-A','SITE-A','2026-11-17',5000,'RAW-BASE');
      INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
        VALUES('40000000-0000-0000-0000-000000000001','COMP-A','HOUSE-A',1,'2026-11-17','DRAFT','WH-A','FLOCK-A','PROFILE-A',repeat('c',64),'{"synthetic":true}','fixture');
      INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code)
        VALUES('40000000-0000-0000-0000-000000000001','COMP-A','WH-A','PRD-EGG-RAW');
      UPDATE production_cutover_scopes SET state='FENCED';UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now();
      INSERT INTO pkg_work_shifts VALUES(1,'FARM-A','2026-11-18',false);`);
    for(const [shift,n] of ampm?[['AM',100],['PM',200]]:[['DAILY',reported]])await db.query(`INSERT INTO brd_daily_logs(house_code,flock_no,log_date,shift,
      eggs_by_grade,occupancy_id,company_code,farm_code,site_code) VALUES('HOUSE-A','FLOCK-A',$1,$2,$3,'RAW-OCC','COMP-A','FARM-A','SITE-A')`,
      [day,shift,JSON.stringify(Object.fromEntries(grades.map(g=>[g,g==='GRADE_1'?n:0])))]);
    scope={isGlobal:false,allowedCompanyCodes:['COMP-A'],allowedWarehouseCodes:['WH-A']};maker();
  }
  beforeEach(()=>reset());
  async function physical(qty=100,id=1,parts?:Array<{dailyLogId:number;quantity:number}>,confirm=true,handoverRef=randomUUID(),sourceReference?:string){
    await db.query(`INSERT INTO pkg_source_batches(id,house_code,flock_code,received_qty,production_date,lay_date,is_test,batch_code,source_inbound_no,
      shift_id,total_qty,dirty_qty,cracked_qty,batch_status) VALUES($1,'HOUSE-A','FLOCK-A',$2,$3,$3,false,$4,$5,1,$2,0,0,'RECEIVED')`,[id,qty,day,`SYNTHETIC-RAW-${id}`,sourceReference??`SYNTHETIC-RAW-${id}`]);
    const reports=await db.query('SELECT id FROM brd_daily_logs ORDER BY id');
    const handover=await documents.createPhysicalHandover({companyCode:'COMP-A',houseCode:'HOUSE-A',eggDate:day,warehouseCode:'WH-A',handoverRef,rawCollectionSourceId:String(id),
      segments:(parts??[{dailyLogId:reports[0].id,quantity:qty}]).map(s=>({...s,gradeCode:'GRADE_1',evidenceFileId:'RAW-EVIDENCE'}))});
    if(confirm){actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E']};await documents.confirmPhysicalHandover(handover.id,handover.version,handover.content_hash);maker();}
    const input={companyCode:'COMP-A',houseCode:'HOUSE-A',productionDate:day,warehouseCode:'WH-A',sourceBatchId:String(id),handoverId:handover.id,intentKey:randomUUID()};
    return {input,handover};
  }
  async function draft(qty=100,id=1,parts?:Array<{dailyLogId:number;quantity:number}>){
    const d=await physical(qty,id,parts);return {...d,doc:await raw.create(d.input)};
  }
  async function approved(qty=100,id=1,parts?:Array<{dailyLogId:number;quantity:number}>){
    const d=await draft(qty,id,parts),frozen=await raw.ready(d.doc.id,0,randomUUID());reviewer();const a=await raw.approve(frozen.id,frozen.version,frozen.content_hash);maker();return {...d,approved:a};
  }
  const counts=async()=> (await db.query(`SELECT (SELECT count(*)::int FROM inv_batches) batches,(SELECT count(*)::int FROM inv_ledger) ledger,
    (SELECT count(*)::int FROM production_raw_receipt_segments) segments,(SELECT COALESCE(SUM(quantity),0)::int FROM brd_egg_source_receipts) received`))[0];
  it('posts an actual two-shift receipt once, preserves exact report/occupancy facts and creates no inventory parent',async()=>{
    await reset(true);const reports=await db.query('SELECT id FROM brd_daily_logs ORDER BY id');
    const {approved:a}=await approved(300,1,[{dailyLogId:reports[0].id,quantity:100},{dailyLogId:reports[1].id,quantity:200}]);
    const results=await Promise.allSettled([raw.post(a.id,a.submit_key,a.content_hash),raw.post(a.id,a.submit_key,a.content_hash)]);
    for(const result of results)if(result.status==='rejected')throw result.reason;
    const [one,two]=results.map(r=>(r as PromiseFulfilledResult<any>).value);
    expect(one).toEqual(two);expect(one).toMatchObject({quantity:300,inventoryCreated:false});expect(await counts()).toEqual({batches:0,ledger:0,segments:2,received:300});
    expect(await effectiveProductionReceiptQuantity(db.manager,reports[0].id)).toBe(100);
    expect((await effectiveExactProductionByGrade(db.manager,reports[1].id)).get('GRADE_1')).toBe(200);
    await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED';UPDATE md_egg_source_profiles SET status='INACTIVE'");
    actor={userId:4,username:'viewer',permissions:['MENU_PROD_INBOUND:V']};expect(await raw.post(a.id,a.submit_key,a.content_hash)).toEqual(one);
    expect((await raw.get(a.id)).segments).toHaveLength(2);
  });
  it('holds a second real handover when its report-grade quota is already consumed and rolls back all new source facts',async()=>{
    await reset(false,100);const first=await approved(),second=await approved(100,2);
    await raw.post(first.approved.id,first.approved.submit_key,first.approved.content_hash);const before=await counts();
    await expect(raw.post(second.approved.id,second.approved.submit_key,second.approved.content_hash)).rejects.toMatchObject({status:409});
    expect(await counts()).toEqual(before);expect((await raw.get(second.approved.id)).state).toBe('APPROVED');
  });
  it('rejects self approval and stale content, and requires an active approving identity at posting',async()=>{
    const {doc}=await draft(),frozen=await raw.ready(doc.id,0,randomUUID());actor.permissions=['MENU_PROD_INBOUND:V,C,E,A'];
    await expect(raw.approve(doc.id,frozen.version,frozen.content_hash)).rejects.toMatchObject({status:409});reviewer();
    await expect(raw.approve(doc.id,frozen.version,'f'.repeat(64))).rejects.toMatchObject({status:409});
    const a=await raw.approve(doc.id,frozen.version,frozen.content_hash);maker();await db.query('UPDATE sys_user SET status=0 WHERE user_id=2');
    await expect(raw.post(doc.id,a.submit_key,a.content_hash)).rejects.toMatchObject({status:409});expect((await counts()).received).toBe(0);
  });
  it('protects a posted raw collection, physical handover, report floor and original receipt without creating stock',async()=>{
    const {approved:a,handover}=await approved();await raw.post(a.id,a.submit_key,a.content_hash);
    for(const sql of ["UPDATE pkg_source_batches SET received_qty=101 WHERE id=1",`UPDATE production_raw_receipts SET state='CANCELLED',version=version+1 WHERE id='${a.id}'`,
      "UPDATE brd_daily_logs SET eggs_by_grade=jsonb_set(eggs_by_grade,'{GRADE_1}','99')",`UPDATE production_physical_handovers SET state='CANCELLED',version=version+1 WHERE id='${handover.id}'`])
      await expect(db.query(sql)).rejects.toThrow();
    expect(await counts()).toEqual({batches:0,ledger:0,segments:1,received:100});
  });
  it.each(['company','warehouse','paused','mode','test','quantity','report'])('holds %s source facts without source credits',async kind=>{
    const d=await draft();
    if(kind==='company')scope.allowedCompanyCodes=['COMP-B'];if(kind==='warehouse')scope.allowedWarehouseCodes=['WH-B'];
    if(kind==='paused')await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED'");
    if(kind==='mode')await db.query("UPDATE inv_source_mode SET mode='TEMP_PRODUCTION_INBOUND'");
    if(kind==='test')await db.query('UPDATE pkg_source_batches SET is_test=true');if(kind==='quantity')await db.query('UPDATE pkg_source_batches SET received_qty=99');
    if(kind==='report')await db.query("UPDATE brd_daily_logs SET eggs_by_grade=eggs_by_grade-'GRADE_0'");
    await expect(raw.ready(d.doc.id,0,randomUUID())).rejects.toThrow();expect((await counts()).received).toBe(0);
  });
  it('binds both signatures to the actual collection row and shift, and rejects a source swap',async()=>{
    const p=await physical();
    await db.query(`INSERT INTO pkg_source_batches SELECT 2,house_code,flock_code,received_qty,production_date,lay_date,is_test,
      'SYNTHETIC-RAW-2','SYNTHETIC-RAW-2',shift_id,total_qty,dirty_qty,cracked_qty,batch_status FROM pkg_source_batches WHERE id=1`);
    await expect(raw.create({...p.input,sourceBatchId:'2'})).rejects.toMatchObject({status:409});
    expect((await counts()).received).toBe(0);
  });
  it('requires re-signing when the actual packaging shift changes before receiver confirmation',async()=>{
    const p=await physical(100,1,undefined,false);await db.query("UPDATE pkg_work_shifts SET site_id='OTHER-FARM'");
    actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E']};
    await expect(documents.confirmPhysicalHandover(p.handover.id,0,p.handover.content_hash)).rejects.toMatchObject({status:409});
    expect((await db.query('SELECT state FROM production_physical_handovers'))[0].state).toBe('DRAFT');
  });
  it('holds old PACKAGING credits and an ambiguous report allocation before a RAW claim',async()=>{
    const p=await physical();const [r]=await db.query('SELECT id FROM brd_daily_logs');
    await db.query("INSERT INTO brd_egg_day_routes VALUES('COMP-A','HOUSE-A',$1,'PACKAGING')",[day]);
    await db.query(`INSERT INTO brd_egg_source_receipts(company_code,source_key,daily_log_id,occupancy_id,house_code,production_date,quantity,entry_mode)
      VALUES('COMP-A','PACKAGING:1',$2,'RAW-OCC','HOUSE-A',$1,100,'PACKAGING')`,[day,r.id]);
    await expect(raw.create(p.input)).rejects.toMatchObject({status:409});
    expect((await counts()).received).toBe(100);expect((await db.query('SELECT count(*)::int AS n FROM production_raw_receipts'))[0].n).toBe(0);
  });
  it('blocks the legacy source writer and grading links once the source is claimed, with no partial writes',async()=>{
    await draft();const [r]=await db.query('SELECT id FROM brd_daily_logs');
    await expect(db.transaction(async m=>{
      await m.query(`INSERT INTO brd_egg_day_routes VALUES('COMP-A','HOUSE-A',$1,'PACKAGING')`,[day]);
      await m.query(`INSERT INTO brd_egg_source_receipts(company_code,source_key,daily_log_id,occupancy_id,house_code,production_date,quantity,entry_mode)
        VALUES('COMP-A','PACKAGING:1',$1,'RAW-OCC','HOUSE-A',$2,100,'PACKAGING')`,[r.id,day]);
    })).rejects.toThrow('RAW_RECEIPT_LEGACY_CONSUMPTION_HOLD');
    await expect(db.query('INSERT INTO pkg_grading_source_links VALUES(1,1,100)')).rejects.toThrow('RAW_RECEIPT_LEGACY_CONSUMPTION_HOLD');
    expect(await counts()).toEqual({batches:0,ledger:0,segments:0,received:0});
    expect((await db.query('SELECT count(*)::int AS n FROM brd_egg_day_routes'))[0].n).toBe(0);
  });
  it('rejects a source writer with a stale RR snapshot after actual RAW commit and rejects a NULL status',async()=>{
    const {approved:a}=await approved();const q=db.createQueryRunner();await q.connect();await q.startTransaction('REPEATABLE READ');
    try{
      await q.query('SELECT * FROM pkg_source_batches WHERE id=1');
      await raw.post(a.id,a.submit_key,a.content_hash);
      await expect(q.query('UPDATE pkg_source_batches SET received_qty=101 WHERE id=1')).rejects.toThrow('RAW_ORIGIN_ISOLATION_HOLD');
    }finally{await q.rollbackTransaction();await q.release();}
    await expect(db.query('UPDATE pkg_source_batches SET batch_status=NULL WHERE id=1')).rejects.toThrow('RAW_RECEIPT_COLLECTION_IMMUTABLE');
    expect((await counts()).received).toBe(100);
  });
  it('uses actual farm SITE inheritance instead of the mapped organization site',async()=>{
    await db.query("INSERT INTO inv_source_mode VALUES('SITE','SITE-A','TEMP_PRODUCTION_INBOUND'),('SITE','FARM-A','PACKAGING_INBOUND')");
    const {approved:a}=await approved();await raw.post(a.id,a.submit_key,a.content_hash);expect((await counts()).received).toBe(100);
    await reset();await db.query("INSERT INTO inv_source_mode VALUES('SITE','SITE-A','PACKAGING_INBOUND'),('SITE','FARM-A','TEMP_PRODUCTION_INBOUND')");
    await expect(draft()).rejects.toMatchObject({status:409});expect((await counts()).received).toBe(0);
  });
  it('blocks a phantom SITE override until posting commits and applies it to the next receipt',async()=>{
    const {approved:a}=await approved();const transaction=db.transaction.bind(db),q=db.createQueryRunner();await q.connect();let sawLock=false;
    const spy=jest.spyOn(db,'transaction').mockImplementationOnce((async(fn:any)=>transaction(async m=>{
      const query=m.query.bind(m);m.query=(async(sql:string,args?:any[])=>{
        const result=await query(sql,args);
        if(sql==='LOCK TABLE inv_source_mode IN SHARE MODE'&&!sawLock){sawLock=true;await q.query("SET lock_timeout='100ms'");
          await expect(q.query("INSERT INTO inv_source_mode VALUES('SITE','FARM-A','TEMP_PRODUCTION_INBOUND')")).rejects.toMatchObject({code:'55P03'});}
        return result;
      }) as typeof m.query;return fn(m);
    })) as any);
    try{await raw.post(a.id,a.submit_key,a.content_hash);}finally{spy.mockRestore();await q.release();}
    expect(sawLock).toBe(true);await db.query("INSERT INTO inv_source_mode VALUES('SITE','FARM-A','TEMP_PRODUCTION_INBOUND')");
    await expect(draft(100,2)).rejects.toMatchObject({status:409});expect((await counts()).received).toBe(100);
  });
  it.each(['missing-source','wrong-document','wrong-date','inventory-true','missing-inventory-flag'])('database rejects %s despite a direct posting attempt',async kind=>{
    const d=await draft(),p=d.handover.payload;
    const payload={quantity:100,source:p.rawCollection.sourceSnapshot,
      profile:{profileCode:'PROFILE-A',productMode:'VARIANT',varietyCode:'EGG_RED',houseCode:'HOUSE-A',farmCode:'FARM-A',siteCode:'SITE-A'},
      handoverHash:d.handover.content_hash,sources:kind==='missing-source'?[]:p.sources};
    await expect(db.transaction(async m=>{
      await m.query(`UPDATE production_raw_receipts SET state='READY',version=1,payload=$2,content_hash=repeat('a',64),submit_key='direct-attempt',expected_posting_date='2026-11-18',ready_at=now(),ready_by='1' WHERE id=$1`,[d.doc.id,JSON.stringify(payload)]);
      await m.query("UPDATE production_raw_receipts SET state='APPROVED',version=2,approved_by='2',approved_hash=content_hash,approved_at=now() WHERE id=$1",[d.doc.id]);
      await m.query("INSERT INTO brd_egg_day_routes VALUES('COMP-A','HOUSE-A',$1,'PACKAGING')",[day]);
      for(const source of p.sources){const key=`RAW:${d.doc.id}:${source.id}`;
        await m.query(`INSERT INTO brd_egg_source_receipts(company_code,source_key,daily_log_id,occupancy_id,house_code,production_date,quantity,entry_mode)
          VALUES('COMP-A',$1,$2,'RAW-OCC','HOUSE-A',$3,100,'PACKAGING')`,[key,source.dailyLogId,day]);
        await m.query(`INSERT INTO production_raw_receipt_segments(id,receipt_id,company_code,handover_line_id,daily_log_id,occupancy_id,flock_no,grade_code,
          quantity,report_hash,source_key,evidence_file_id,evidence_checksum,snapshot) VALUES($1,$2,'COMP-A',$3,$4,'RAW-OCC','FLOCK-A','GRADE_1',100,$5,$6,'RAW-EVIDENCE',repeat('a',64),$7)`,
          [randomUUID(),d.doc.id,source.id,source.dailyLogId,source.reportHash,key,JSON.stringify(source)]);
      }
      const receipt:any={documentId:d.doc.id,documentNo:d.doc.document_no,quantity:100,postingDate:day,inventoryCreated:false};
      if(kind==='wrong-document')receipt.documentNo='OTHER';if(kind==='wrong-date')receipt.postingDate='2026-11-17';
      if(kind==='inventory-true')receipt.inventoryCreated=true;if(kind==='missing-inventory-flag')delete receipt.inventoryCreated;
      await m.query("UPDATE production_raw_receipts SET state='POSTED',version=3,posting_date=$2,posted_at=now(),receipt=$3 WHERE id=$1",[d.doc.id,day,JSON.stringify(receipt)]);
    })).rejects.toThrow(/RAW_RECEIPT_(SOURCE_FACTS_HOLD|POSTED_FACTS_REQUIRED)/);
    expect(await counts()).toEqual({batches:0,ledger:0,segments:0,received:0});expect((await raw.get(d.doc.id)).state).toBe('DRAFT');
  });

  it('retains schema and the original unposted source fact when rollback is requested',async()=>{
    const d=await draft(),q=db.createQueryRunner();await q.connect();
    try{await expect(new OfficialRawCollectionReceipts1795005390930().down(q)).rejects.toThrow('RAW_RECEIPT_DOWN_HOLD');}
    finally{await q.release();}
    expect((await raw.get(d.doc.id)).state).toBe('DRAFT');
  });

  it('rejects a RAW handover when an earlier TEMP draft already owns its reference',async()=>{
    const ref=randomUUID();await documents.create({companyCode:'COMP-A',houseCode:'HOUSE-A',eggDate:day,warehouseCode:'WH-A',locationCode:'LOC-A',
      intentKey:randomUUID(),handoverRef:ref,items:[{gradeCode:'GRADE_1',specCode:'LOOSE',quantity:100}],evidenceFileIds:[]});
    await expect(physical(100,1,undefined,true,ref)).rejects.toMatchObject({status:409});
    expect((await db.query('SELECT count(*)::int AS n FROM production_physical_handovers'))[0].n).toBe(0);expect((await counts()).received).toBe(0);
  });
  it('allows a changed unconfirmed RAW handover to be cancelled and re-signed against the corrected source',async()=>{
    const p=await physical(100,1,undefined,false);await db.query('UPDATE pkg_source_batches SET received_qty=99,total_qty=99 WHERE id=1');
    actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E']};
    await expect(documents.confirmPhysicalHandover(p.handover.id,p.handover.version,p.handover.content_hash)).rejects.toMatchObject({status:409});maker();
    await documents.cancelPhysicalHandover(p.handover.id,p.handover.version,'Actual count corrected before receipt');
    const [report]=await db.query('SELECT id FROM brd_daily_logs');
    const h=await documents.createPhysicalHandover({companyCode:'COMP-A',houseCode:'HOUSE-A',eggDate:day,warehouseCode:'WH-A',handoverRef:p.handover.handover_ref,
      rawCollectionSourceId:'1',replacesId:p.handover.id,segments:[{dailyLogId:report.id,gradeCode:'GRADE_1',quantity:99,evidenceFileId:'RAW-EVIDENCE'}]});
    expect(h.replaces_id).toBe(p.handover.id);expect(h.payload.rawCollection.sourceSnapshot.received_qty).toBe('99');
  });
  it('allows confirmed physical cancellation only after cancelling its unposted RAW receipt',async()=>{
    const d=await draft();await db.query(`INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,uploaded_by,checksum)
      VALUES('RAW-RETURN','ACTIVE','PROTECTED','application/pdf','PRODUCTION_INBOUND','HOUSE','HOUSE-A','COMP-A','receiver',repeat('d',64))`);
    actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E']};
    await expect(documents.cancelPhysicalHandover(d.handover.id,d.handover.version+1,'Actual returned collection',['RAW-RETURN'])).rejects.toMatchObject({status:409});
    maker();await raw.cancel(d.doc.id,0);actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E']};
    expect((await documents.cancelPhysicalHandover(d.handover.id,d.handover.version+1,'Actual returned collection',['RAW-RETURN'])).state).toBe('CANCELLED');
  });
  it('holds rollback even when only a signed RAW handover exists and no RAW draft has been created',async()=>{
    await physical();const q=db.createQueryRunner();await q.connect();try{
      await expect(new OfficialRawCollectionReceipts1795005390930().down(q)).rejects.toThrow('RAW_RECEIPT_DOWN_HOLD');
    }finally{await q.release();}
    expect((await db.query('SELECT count(*)::int AS n FROM production_raw_receipts'))[0].n).toBe(0);
  });
  it('blocks an ambiguous legacy allocation to another source on a report already consumed by RAW',async()=>{
    const {approved:a}=await approved();await raw.post(a.id,a.submit_key,a.content_hash);
    await db.query(`INSERT INTO pkg_source_batches(id,house_code,flock_code,received_qty,production_date,lay_date,is_test,batch_code,source_inbound_no,shift_id,total_qty,batch_status)
      VALUES(2,'HOUSE-A','FLOCK-A',100,$1,$1,false,'OTHER-ACTUAL-SOURCE','OTHER-ACTUAL-SOURCE',1,100,'RECEIVED')`,[day]);
    const [r]=await db.query('SELECT id FROM brd_daily_logs');
    await expect(db.query(`INSERT INTO brd_egg_source_receipts(company_code,source_key,daily_log_id,occupancy_id,house_code,production_date,quantity,entry_mode)
      VALUES('COMP-A','PACKAGING:2',$1,'RAW-OCC','HOUSE-A',$2,100,'PACKAGING')`,[r.id,day])).rejects.toThrow('RAW_RECEIPT_LEGACY_REPORT_ALLOCATION_HOLD');
    expect((await counts()).received).toBe(100);
  });
  it('does not let an old AM-only allocation consume or block a separately proven PM collection',async()=>{
    await reset(true);const reports=await db.query('SELECT id FROM brd_daily_logs ORDER BY id');
    await db.query(`INSERT INTO pkg_source_batches(id,house_code,flock_code,received_qty,production_date,lay_date,is_test,batch_code,source_inbound_no,shift_id,total_qty,batch_status)
      VALUES(99,'HOUSE-A','FLOCK-A',100,$1,$1,false,'OLD-AM-SOURCE','OLD-AM-SOURCE',1,100,'RECEIVED')`,[day]);
    await db.query("INSERT INTO brd_egg_day_routes VALUES('COMP-A','HOUSE-A',$1,'PACKAGING')",[day]);
    await db.query(`INSERT INTO brd_egg_source_receipts(company_code,source_key,daily_log_id,occupancy_id,house_code,production_date,quantity,entry_mode)
      VALUES('COMP-A','PACKAGING:99',$1,'RAW-OCC','HOUSE-A',$2,100,'PACKAGING')`,[reports[0].id,day]);
    const {approved:a}=await approved(200,1,[{dailyLogId:reports[1].id,quantity:200}]);await raw.post(a.id,a.submit_key,a.content_hash);
    expect((await counts()).received).toBe(300);expect((await effectiveExactProductionByGrade(db.manager,reports[1].id)).get('GRADE_1')).toBe(200);
  });
  it.each(['warehouse','inventory'])('blocks %s admission that would claim an existing RAW source',async kind=>{
    await draft();
    const sql=kind==='warehouse'?"INSERT INTO wms_inbound VALUES('SYNTHETIC-RAW-1','PENDING')":
      "INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,source_type,source_no,qty,qty_available) VALUES('SYNTHETIC-RAW-1','COMP-B','WH-B','PRD-EGG-RAW','SKU-GRADE_1','PURCHASE','OWNED',1,1)";
    await expect(db.query(sql)).rejects.toThrow('RAW_RECEIPT_INVENTORY_REFERENCE_HOLD');expect((await counts()).batches).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM wms_inbound'))[0].n).toBe(0);
  });

  it.each(['warehouse','inventory'])('holds RAW when %s already references its actual source before the claim',async kind=>{
    const p=await physical();
    const sql=kind==='warehouse'?"INSERT INTO wms_inbound VALUES('SYNTHETIC-RAW-1','PENDING')":
      "INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,source_type,source_no,qty,qty_available) VALUES('SYNTHETIC-RAW-1','COMP-B','WH-B','PRD-EGG-RAW','SKU-GRADE_1','PURCHASE','OWNED',1,1)";
    await db.query(sql);await expect(raw.create(p.input)).rejects.toMatchObject({status:409});
    expect((await db.query('SELECT count(*)::int AS n FROM production_raw_receipts'))[0].n).toBe(0);expect((await counts()).received).toBe(0);
  });

  it('holds a frozen collection after the Singapore posting day changes without emitting source credits',async()=>{
    const d=await draft();const clock=jest.spyOn(require('../../wms/temp-production-reversal'),'singaporeBusinessDate').mockReturnValue('2026-11-17');
    let frozen:any;try{frozen=await raw.ready(d.doc.id,0,randomUUID());}finally{clock.mockRestore();}
    reviewer();const a=await raw.approve(d.doc.id,frozen.version,frozen.content_hash);maker();
    await expect(raw.post(a.id,a.submit_key,a.content_hash)).rejects.toMatchObject({status:409});expect((await counts()).received).toBe(0);
  });

  async function directPin(m:Pick<DataSource,'query'>,ref:string,house='HOUSE-A'){
    const id=randomUUID();return m.query(`INSERT INTO production_inbound_documents(id,document_no,company_code,house_code,production_date,scope_id,
      kind,intent_key,handover_ref,payload,created_by,creation_hash) VALUES($1,$2,'COMP-A',$3,$4,'40000000-0000-0000-0000-000000000001',
      'INBOUND',$6,$5,'{"warehouseCode":"WH-A","locationCode":"LOC-A","items":[]}','1',repeat('a',64))`,[id,`PIN-${id}`,house,day,ref,id]);
  }
  it('does not miss an uncommitted WMS reference when its collection row did not yet exist',async()=>{
    const q=db.createQueryRunner();await q.connect();await q.startTransaction();
    try{
      await q.query("INSERT INTO wms_inbound VALUES('SYNTHETIC-RAW-1','PENDING')");
      const p=await physical();await expect(raw.create(p.input)).rejects.toThrow('RAW_RECEIPT_SOURCE_REFERENCE_BUSY');
      expect((await counts()).received).toBe(0);await q.commitTransaction();
      await expect(raw.create(p.input)).rejects.toMatchObject({status:409});
      expect((await db.query('SELECT count(*)::int AS n FROM production_raw_receipts'))[0].n).toBe(0);
    }finally{if(q.isTransactionActive)await q.rollbackTransaction();await q.release();}
  });
  it('rejects a PIN insert with a stale RR snapshot taken before the RAW handover',async()=>{
    const q=db.createQueryRunner();await q.connect();await q.startTransaction('REPEATABLE READ');
    try{await q.query('SELECT count(*) FROM production_physical_handovers');const p=await physical();
      await expect(directPin(q,p.handover.handover_ref)).rejects.toThrow('RAW_ORIGIN_ISOLATION_HOLD');
    }finally{await q.rollbackTransaction();await q.release();}
    expect((await db.query('SELECT count(*)::int AS n FROM production_inbound_documents'))[0].n).toBe(0);
  });
  it('serializes the same company/handover reference across different houses at the database boundary',async()=>{
    const transaction=db.transaction.bind(db);let arrive!:()=>void,release!:()=>void;
    const ready=new Promise<void>(r=>arrive=r),gate=new Promise<void>(r=>release=r),ref=randomUUID();
    const spy=jest.spyOn(db,'transaction').mockImplementationOnce((async(fn:any)=>transaction(async m=>{const result=await fn(m);arrive();await gate;return result;})) as any);
    const pending=physical(100,1,undefined,false,ref);const settled=pending.then(value=>({value}),error=>({error}));
    try{await Promise.race([ready,settled.then(r=>{throw 'error' in r?r.error:Error('Handover did not enter the owned gate');})]);
      await expect(directPin(db,ref,'HOUSE-A2')).rejects.toThrow('RAW_RECEIPT_HANDOVER_BUSY');
    }finally{release();spy.mockRestore();await settled;}
    const result=await settled;if('error' in result)throw result.error;
    expect((await db.query('SELECT count(*)::int AS n FROM production_physical_handovers'))[0].n).toBe(1);
    expect((await db.query('SELECT count(*)::int AS n FROM production_inbound_documents'))[0].n).toBe(0);
  });
  it.each(['before','after','tab-after'])('normalizes padded legacy WMS references when WMS is admitted %s RAW',async order=>{
    if(order==='before')await db.query("INSERT INTO wms_inbound VALUES('PADDED-LEGACY-WMS','PENDING')");
    const p=await physical(100,1,undefined,true,undefined,order==='tab-after'?'\tPADDED-LEGACY-WMS\t':' PADDED-LEGACY-WMS ');
    if(order==='before')await expect(raw.create(p.input)).rejects.toMatchObject({status:409});
    else{await raw.create(p.input);await expect(db.query("INSERT INTO wms_inbound VALUES('PADDED-LEGACY-WMS','PENDING')")).rejects.toThrow('RAW_RECEIPT_INVENTORY_REFERENCE_HOLD');}
    expect((await counts()).received).toBe(0);
  });
  it('receives the gross collection once with exact dirty and broken segments and rejects a contradictory handover',async()=>{
    await db.query(`UPDATE brd_daily_logs SET eggs_by_grade=jsonb_set(jsonb_set(eggs_by_grade,'{DIRTY}','5'),'{BROKEN}','2');
      INSERT INTO pkg_source_batches(id,house_code,flock_code,received_qty,production_date,lay_date,is_test,batch_code,shift_id,total_qty,dirty_qty,cracked_qty,batch_status)
      VALUES(1,'HOUSE-A','FLOCK-A',100,'2026-11-18','2026-11-18',false,'SYNTHETIC-DEFECT-COLLECTION',1,100,5,2,'RECEIVED')`);
    const [r]=await db.query('SELECT id FROM brd_daily_logs'),input={companyCode:'COMP-A',houseCode:'HOUSE-A',eggDate:day,warehouseCode:'WH-A',rawCollectionSourceId:'1',
      handoverRef:randomUUID(),segments:[{dailyLogId:r.id,gradeCode:'GRADE_1',quantity:100,evidenceFileId:'RAW-EVIDENCE'}]};
    await expect(documents.createPhysicalHandover(input)).rejects.toMatchObject({status:409});
    const h=await documents.createPhysicalHandover({...input,segments:[['GRADE_1',93],['DIRTY',5],['BROKEN',2]].map(([gradeCode,quantity])=>({dailyLogId:r.id,gradeCode:String(gradeCode),quantity:Number(quantity),evidenceFileId:'RAW-EVIDENCE'}))});
    actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E']};await documents.confirmPhysicalHandover(h.id,h.version,h.content_hash);maker();
    const d=await raw.create({companyCode:'COMP-A',houseCode:'HOUSE-A',productionDate:day,warehouseCode:'WH-A',sourceBatchId:'1',handoverId:h.id,intentKey:randomUUID()}),f=await raw.ready(d.id,0,randomUUID());
    reviewer();const a=await raw.approve(d.id,f.version,f.content_hash);maker();const receipt=await raw.post(a.id,a.submit_key,a.content_hash);
    expect(receipt.quantity).toBe(100);expect(await counts()).toEqual({batches:0,ledger:0,segments:3,received:100});
  });

  it.each([false,true])('preserves ordinary inventory concurrency without RAW, with an actual matching source=%s',async matched=>{
    if(matched)await db.query(`INSERT INTO pkg_work_shifts VALUES(2,'FARM-B','2026-11-18',false);
      INSERT INTO pkg_source_batches(id,house_code,flock_code,received_qty,production_date,lay_date,is_test,batch_code,source_inbound_no,shift_id,total_qty,dirty_qty,cracked_qty,batch_status)
      VALUES(50,'HOUSE-B','FLOCK-B',2,'2026-11-18','2026-11-18',false,'OFF-ACTUAL-COLLECTION','SAME-OFF-REFERENCE',2,2,0,0,'RECEIVED')`);
    const a=db.createQueryRunner(),b=db.createQueryRunner();await a.connect();await b.connect();await a.startTransaction();await b.startTransaction();
    try{for(const [q,batch] of [[a,'OFF-CONCURRENT-1'],[b,'OFF-CONCURRENT-2']] as const)await q.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,
      product_code,sku_code,source_type,source_no,qty,qty_available) VALUES($1,'COMP-B','WH-B','PRD-EGG-RAW','SKU-GRADE_1','PURCHASE','SAME-OFF-REFERENCE',1,1)`,[batch]);
      await a.commitTransaction();await b.commitTransaction();
    }finally{if(a.isTransactionActive)await a.rollbackTransaction();if(b.isTransactionActive)await b.rollbackTransaction();await a.release();await b.release();}
    expect((await counts()).batches).toBe(2);
  });
  it('records the actual freezing user and prevents that same user from approving the frozen receipt',async()=>{
    const d=await draft();reviewer();const f=await raw.ready(d.doc.id,0,randomUUID());expect(f.ready_by).toBe('2');
    await expect(raw.approve(d.doc.id,f.version,f.content_hash)).rejects.toMatchObject({status:409});expect((await counts()).received).toBe(0);
  });

  it.each(['\t\r\nTOKEN\t','\u00a0TOKEN\ufeff','\u1680\u2007TOKEN\u2028','INTERIOR\tTOKEN',' \t '])('shares one normalization definition with legacy JavaScript trim for %j',async value=>{
    expect((await db.query('SELECT official_raw_reference_token($1) AS token',[value]))[0].token).toBe(value.trim()||null);
  });
  it('does not let another receipt reuse the same company submission identity',async()=>{
    const first=await draft(),second=await draft(100,2),key=randomUUID();await raw.ready(first.doc.id,0,key);
    await expect(raw.ready(second.doc.id,0,key)).rejects.toMatchObject({status:409});expect((await raw.get(second.doc.id)).state).toBe('DRAFT');
  });

});
