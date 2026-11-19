import { OfficialRawCollectionReceipts1795005390930 } from '../../../database/migrations/1795005390930-OfficialRawCollectionReceipts';
import 'reflect-metadata';
import { WmsService } from '../../wms/wms.service';
import { OfficialInventoryLedgerCost1794977000000 } from '../../../database/migrations/1794977000000-OfficialInventoryLedgerCost';
import { ProductionCutoverManifests1794976000000 } from '../../../database/migrations/1794976000000-ProductionCutoverManifests';
import { OfficialProductionReportGrain1794975000000 } from '../../../database/migrations/1794975000000-OfficialProductionReportGrain';
import { DataSource } from 'typeorm';
import { installProductionInboundFixture } from './production-inbound.pg-fixture';
import { OfficialInventoryCutover1794971000000 } from '../../../database/migrations/1794971000000-OfficialInventoryCutover';
import { ProductionInboundDocuments1794972000000 } from '../../../database/migrations/1794972000000-ProductionInboundDocuments';
import { ProductionHandoverAndPeriods1794973000000 } from '../../../database/migrations/1794973000000-ProductionHandoverAndPeriods';
import { ProductionInstallmentDictionaries1794974000000 } from '../../../database/migrations/1794974000000-ProductionInstallmentDictionaries';
const url=process.env.OFFICIAL_INVENTORY_PG_URL;const suite=url?describe:describe.skip;
suite('formal installment migration reversals — owned PostgreSQL 18',()=>{
  let db:DataSource;const schema=`inbound_migrations_${process.pid}`;
  const chain=[new OfficialInventoryCutover1794971000000(),new ProductionInboundDocuments1794972000000(),
    new ProductionHandoverAndPeriods1794973000000(),new ProductionInstallmentDictionaries1794974000000(),new OfficialProductionReportGrain1794975000000(),new ProductionCutoverManifests1794976000000(),new OfficialInventoryLedgerCost1794977000000(),new OfficialRawCollectionReceipts1795005390930()];
  beforeAll(async()=>{
    const u=new URL(url!);if(u.hostname!=='127.0.0.1'||!['/phoenix_temp_reversal_fixture','/installments_fixture'].includes(u.pathname))throw Error('Owned loopback fixture required');
    db=await new DataSource({type:'postgres',url,entities:[],synchronize:false,migrationsRun:false,installExtensions:false,extra:{options:`-c search_path=${schema}`,max:5}}).initialize();
    if(!(await db.query('SHOW server_version'))[0].server_version.startsWith('18.'))throw Error('PostgreSQL 18 required');
    await db.query(`CREATE SCHEMA "${schema}"`);await installProductionInboundFixture(db,['GRADE_1']);
    await db.query(`ALTER TABLE pkg_source_batches ADD COLUMN batch_code text,ADD COLUMN source_inbound_no text,ADD COLUMN shift_id int,
      ADD COLUMN total_qty int,ADD COLUMN dirty_qty int DEFAULT 0,ADD COLUMN cracked_qty int DEFAULT 0,ADD COLUMN batch_status text;
      CREATE TABLE pkg_work_shifts(id int PRIMARY KEY,site_id text,production_date date,is_test boolean);
      CREATE TABLE inv_source_mode(scope_level text,scope_code text,mode text);`);
    const raw=db.createQueryRunner();await raw.connect();try{await chain[7].up(raw);}finally{await raw.release();}
  });
  afterEach(async()=>{await db.query('TRUNCATE production_posting_period_events');});
  afterAll(async()=>{if(db?.isInitialized){await db.query(`DROP SCHEMA "${schema}" CASCADE`);await db.destroy();}});
  it('empty OFF expansion reverses in order and reinstalls without scope activation',async()=>{
    const q=db.createQueryRunner();await q.connect();try{
      for(const migration of [...chain].reverse())await migration.down(q);
      for(const migration of chain)await migration.up(q);
      expect((await q.query('SELECT count(*)::int AS n FROM production_cutover_scopes'))[0].n).toBe(0);
      expect((await q.query("SELECT count(*)::int AS n FROM sys_dict WHERE dict_type='PRODUCTION_INBOUND_DOCUMENT_STATE'"))[0].n).toBe(5);
      expect((await q.query("SELECT count(*)::int AS n FROM sys_dict WHERE dict_type='PRODUCTION_RAW_RECEIPT_STATE'"))[0].n).toBe(5);
    }finally{await q.release();}
  });
  it('retains both dictionaries and schema when an independent signed period event exists',async()=>{
    await db.query(`INSERT INTO production_posting_period_events(id,company_code,period_month,state,version,signed_by,
      evidence_file_id,evidence_checksum,reason) VALUES('40000000-0000-0000-0000-000000000001','COMP-A','2026-11','CLOSED',1,'fixture','SYNTHETIC',repeat('a',64),'Synthetic signed event')`);
    const q=db.createQueryRunner();await q.connect();try{
      await expect(chain[3].down(q)).rejects.toThrow('PRODUCTION_DICTIONARY_DOWN_HOLD');
      await expect(chain[2].down(q)).rejects.toThrow('PRODUCTION_HANDOVER_PERIOD_DOWN_HOLD');
      expect((await q.query("SELECT count(*)::int AS n FROM sys_dict WHERE dict_type='PRODUCTION_POSTING_PERIOD_STATE'"))[0].n).toBe(2);
      expect((await q.query('SELECT count(*)::int AS n FROM production_posting_period_events'))[0].n).toBe(1);
    }finally{await q.release();}
  });
  it('waits for an in-flight signed fact and rechecks it before dictionary deletion',async()=>{
    const writer=db.createQueryRunner(),rollback=db.createQueryRunner();await writer.connect();await rollback.connect();
    await writer.startTransaction();let pending:Promise<void>|undefined;
    try{
      await writer.query(`INSERT INTO production_posting_period_events(id,company_code,period_month,state,version,signed_by,
        evidence_file_id,evidence_checksum,reason) VALUES('40000000-0000-0000-0000-000000000002','COMP-A','2026-11','OPEN',1,'fixture','SYNTHETIC',repeat('b',64),'Synthetic in-flight signed event')`);
      const [{pid:rollbackPid}]=await rollback.query('SELECT pg_backend_pid() AS pid');
      pending=chain[3].down(rollback);const result=pending.then(()=>null,error=>error);
      let blocked=false;for(let i=0;i<100&&!blocked;i++){
        blocked=(await writer.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',[rollbackPid]))[0].blocked;
        if(!blocked)await new Promise(done=>setTimeout(done,10));
      }
      expect(blocked).toBe(true);await writer.commitTransaction();expect(String(await result)).toContain('PRODUCTION_DICTIONARY_DOWN_HOLD');
      expect((await db.query("SELECT count(*)::int AS n FROM sys_dict WHERE dict_type='PRODUCTION_POSTING_PERIOD_STATE'"))[0].n).toBe(2);
    }finally{if(writer.isTransactionActive)await writer.rollbackTransaction();if(pending)await pending.catch(()=>{});await writer.release();await rollback.release();}
  });
  it('installs the cost trigger between a real purchase qualification and its ledger without reverse table-lock waiting',async()=>{
    const initial=db.createQueryRunner();await initial.connect();try{await chain[6].down(initial);}finally{await initial.release();}
    await db.query(`CREATE TABLE IF NOT EXISTS prc2_receipts(id bigint PRIMARY KEY,receipt_no text,company_code text,warehouse_code text,status text);
      CREATE TABLE IF NOT EXISTS prc2_receipt_items(id bigint PRIMARY KEY,receipt_id bigint,item_code text,actual_qty numeric,unit text);
      INSERT INTO prc2_receipts VALUES(1,'SYNTHETIC-MIGRATION-PURCHASE','COMP-A','WH-A','CONFIRMED');
      INSERT INTO prc2_receipt_items VALUES(1,1,'SKU-GRADE_1',100,'枚');
      UPDATE wms_warehouses SET type='PURCHASE_RECV' WHERE warehouse_code='WH-A';
      INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
        VALUES('60000000-0000-0000-0000-000000000001','COMP-A','HOUSE-A',1,'2026-11-19','DRAFT','WH-A','FLOCK-A','PROFILE-A',repeat('a',64),'{}','fixture');
      INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code)
        VALUES('60000000-0000-0000-0000-000000000001','COMP-A','WH-A','PRD-EGG-RAW');
      UPDATE production_cutover_scopes SET state='FENCED';UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now();`);
    const producer=db.createQueryRunner(),installer=db.createQueryRunner();await producer.connect();await installer.connect();
    let release!:()=>void,arrive!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>arrive=r);
    await producer.startTransaction();const query=producer.manager.query.bind(producer.manager);
    producer.manager.query=(async(sql:string,...parameters:any[])=>{
      if(sql.includes('INSERT INTO inv_ledger')){arrive();await gate;}return (query as any)(sql,...parameters);
    }) as any;
    const wms=new WmsService(db.manager,{get:()=>({isGlobal:true})} as any);
    const pending=wms.inboundFromReceipt(producer.manager,{refNo:'SYNTHETIC-MIGRATION-PURCHASE',warehouseCode:'WH-A',operator:'fixture',
      items:[{receiptItemId:'1',itemCode:'SKU-GRADE_1',skuCode:'SKU-GRADE_1',qty:100,unit:'枚',unitCost:0}]}).then(value=>({value}),error=>({error}));
    let installed=false;
    try{
      await Promise.race([ready,pending.then(r=>{throw 'error' in r?r.error:new Error('Purchase never reached its original ledger');})]);
      await installer.startTransaction();await installer.query("SET LOCAL lock_timeout='1s'");
      await chain[6].up(installer);await installer.commitTransaction();installed=true;
      release();const result=await pending;if('error' in result)throw result.error;await producer.commitTransaction();
      expect((await db.query('SELECT cost_status FROM production_batch_qualifications'))[0].cost_status).toBe('UNKNOWN');
      expect((await db.query('SELECT qty FROM inv_batches'))[0].qty).toBe('100');
      expect((await db.query('SELECT cost_change FROM inv_ledger'))[0].cost_change).toBeNull();
    }finally{
      release();if(installer.isTransactionActive)await installer.rollbackTransaction();await pending;if(producer.isTransactionActive)await producer.rollbackTransaction();
      producer.manager.query=query;await producer.release();await installer.release();
      await db.query('TRUNCATE production_batch_qualifications,production_inventory_domains,production_cutover_scopes,inv_ledger,inv_batches,prc2_receipt_items,prc2_receipts CASCADE');
      if(!installed){const repair=db.createQueryRunner();await repair.connect();try{await chain[6].up(repair);}finally{await repair.release();}}
    }
  });

});
