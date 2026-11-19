import {writeHenhouse} from '../generic-crud/henhouse-write-policy';
import {freezeOwnedFlockClock} from '../../test-fixtures/flock-business-clock';
import {FlockReportCorrection1794903000000} from '../../database/migrations/1794903000000-FlockReportCorrection';
import {MonDeviceService} from '../iot/mon-device.service';
import {lockManagedActivity,recordFlockActivity} from './flock-activity-source';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { FlockProductionProvenance1794901000000 } from '../../database/migrations/1794901000000-FlockProductionProvenance';
import { FlockActivitySources1794902000000 } from '../../database/migrations/1794902000000-FlockActivitySources';
import {recordFlockProductionSources,inheritFlockProductionSources} from './flock-production-source';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { FlockLifecycleLedger1794900000000 } from '../../database/migrations/1794900000000-FlockLifecycleLedger';
import { FlockActor, FlockLifecycleService } from './flock-lifecycle.service';
import {FarmService,OrgScope} from './farm.service';
import {OrgOwnershipService} from '../org/services/org-ownership.service';
import { lifecycleDailyBalance } from './flock-lifecycle-daily';

const url=process.env.FLOCK_LEDGER_PG_URL;
const suite=url?describe:describe.skip;
const scope: OrgScope={isGlobal:false,farmCode:null,siteCode:null,companyCodes:['CA']};
const admin: FlockActor={id:'keeper',admin:true};
const approver: FlockActor={id:'reviewer',admin:true};
suite('approved flock ledger on isolated PostgreSQL',()=>{
 let releaseBusinessClock:(()=>void)|undefined;
  let ds: DataSource; let s: FlockLifecycleService;
  let key=0;
  const create=(p: Record<string,unknown>,sc=scope,actor=admin)=>s.create({sourceKey:`fixture-${++key}`,houseCode:'HA',businessDate:'2026-11-10',
    ...(p.kind==='CLOSE'?{finalProductionStatus:'CONFIRMED_ZERO'}:{}),expectedVersion:0,reason:'physical evidence',evidence:[p.houseCode==='HA2'?'FILE-fixture-HA2':'FILE-fixture'],responsible:'count-keeper',differenceReceipt:'DIFF-1',...p},sc,actor);
  const post=async(d: any)=>{
    d=await s.transition(d.id,'submit',d.version,scope,admin);
    d=await s.transition(d.id,'approve',d.version,scope,approver);
    return s.transition(d.id,'post',d.version,scope,admin);
  };
  const baseline=async()=>post(await create({kind:'BASELINE',flockNo:'FA',quantity:100,expectedLegacyQty:100}));
  const bal=async()=> (await ds.query("SELECT * FROM brd_flock_balances WHERE flock_no='FA'"))[0];
  const count=async(t: string)=>Number((await ds.query(`SELECT COUNT(*) AS n FROM ${t}`))[0].n);
  const clean=async(houseCode: string)=>{
    await post(await create({kind:'CLEAN_START',houseCode,expectedHouseVersion:0}));
    await post(await create({kind:'CLEAN_ACCEPT',houseCode,expectedHouseVersion:0}));
  };
  beforeAll(async()=>{
    const u=new URL(url!);
    if(u.hostname!=='127.0.0.1' || u.pathname!=='/phoenix_flock_lifecycle') throw new Error('Owned loopback lifecycle fixture required');
    ds=await new DataSource({type:'postgres',url,synchronize:false,migrationsRun:false,installExtensions:false}).initialize();
  releaseBusinessClock=freezeOwnedFlockClock(url!);
    const dictSource=readFileSync(resolve(__dirname,'../../../ddl/19_seed_sys_dict.sql'),'utf8');
    const start=dictSource.indexOf('CREATE TABLE IF NOT EXISTS sys_dict');
    await ds.query(dictSource.slice(start,dictSource.indexOf(');',start)+2));
    await ds.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_fixture_dict ON sys_dict(dict_type,dict_code);
      CREATE TABLE IF NOT EXISTS file_metadata(file_id text PRIMARY KEY,status text,deleted_at timestamptz,visibility text,mime_type text,
        module_code text,owner_type text,owner_id text,company_code text,store_code text,uploaded_by text);
      CREATE TABLE IF NOT EXISTS prc2_suppliers(supplier_code text PRIMARY KEY,status text,is_active boolean,shared_scope text,owner_company_code text);
      CREATE TABLE IF NOT EXISTS sal_customers(customer_no text PRIMARY KEY,company_code text,status text);
      CREATE TABLE IF NOT EXISTS brd_farms(farm_code text PRIMARY KEY,company_code text,mapped_site_code text,status text);
      CREATE TABLE IF NOT EXISTS brd_houses(house_code text PRIMARY KEY,house_name text,farm_code text,max_capacity int,status text);
      CREATE TABLE IF NOT EXISTS brd_flocks(flock_no text PRIMARY KEY,house_code text,farm_code text,company_code text,site_code text,
        breed_code text,strain text,breed_type text,placement_date date,start_date date,placement_age int,initial_qty int,current_qty int,
        status text,elimination_date date,current_lay_rate numeric,updated_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS brd_daily_logs(id serial PRIMARY KEY,house_code text,flock_no text,log_date date,shift text,
        mortality_qty integer DEFAULT 0,elimination_qty integer DEFAULT 0,opening_qty int,closing_qty int,eggs_produced int DEFAULT 0,lay_rate numeric,eggs_by_grade jsonb);`);
    await ds.query(`ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS farm_name text;ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS eggs_by_grade jsonb,ADD COLUMN IF NOT EXISTS company_code text,ADD COLUMN IF NOT EXISTS farm_code text,ADD COLUMN IF NOT EXISTS site_code text,ADD COLUMN IF NOT EXISTS feed_consumed numeric,ADD COLUMN IF NOT EXISTS water_consumed numeric,ADD COLUMN IF NOT EXISTS note text,ADD COLUMN IF NOT EXISTS dirty_eggs integer,ADD COLUMN IF NOT EXISTS broken_eggs integer,ADD COLUMN IF NOT EXISTS business_date date,ADD COLUMN IF NOT EXISTS operator text;
      CREATE TABLE IF NOT EXISTS inv_batches(batch_no text PRIMARY KEY,quality_grade text,qty numeric);
      CREATE TABLE IF NOT EXISTS product_grades(grade_code text PRIMARY KEY,is_saleable boolean,status text);
      CREATE TABLE IF NOT EXISTS mon_device_property_history(erp_house_code text,property_code text,value numeric,collect_time bigint,log_date date);
      CREATE TABLE IF NOT EXISTS mon_device_realtime_snapshot(erp_house_code text,property_code text,value numeric,collect_time bigint);
      CREATE TABLE IF NOT EXISTS mon_device_property_daily_agg(erp_house_code text,property_code text,agg_date date,max_val numeric,avg_val numeric);`);
    const q=ds.createQueryRunner();await new FlockLifecycleLedger1794900000000().up(q);await new FlockProductionProvenance1794901000000().up(q);await new FlockActivitySources1794902000000().up(q);await new FlockReportCorrection1794903000000().up(q);await q.release();
    s=new FlockLifecycleService(ds.manager);
  });
  beforeEach(async()=>{
    await ds.query(`TRUNCATE inv_batches,product_grades,mon_device_property_history,mon_device_realtime_snapshot,mon_device_property_daily_agg,brd_flock_admission_receipts,prc2_suppliers,brd_flock_activity_sources,brd_flock_sales_settlements,inv_flock_source_links,brd_egg_source_receipts,brd_egg_day_routes,file_metadata,sal_customers,brd_flock_document_audits,brd_flock_events,brd_flock_held_balances,brd_flock_house_states,
      brd_flock_daily_balances,brd_flock_balances,brd_flock_occupancies,brd_flock_documents,brd_daily_logs,brd_flocks,brd_houses,brd_farms CASCADE;
      INSERT INTO brd_farms(farm_code,company_code,mapped_site_code,status) VALUES('A','CA','SA','ACTIVE'),('B','CB','SB','ACTIVE'),('A2','CA','SA2','ACTIVE');
      INSERT INTO brd_houses VALUES('HA','house A','A',200,'ACTIVE'),('HA2','house A2','A',200,'ACTIVE'),('HB','house B','B',200,'ACTIVE'),('HX','other site','A2',200,'ACTIVE');
      INSERT INTO brd_flocks(flock_no,house_code,farm_code,company_code,site_code,breed_code,start_date,initial_qty,current_qty,status)
        VALUES('FA','HA','A','CA','SA','BREED','2026-01-01',120,100,'LAYING');
      INSERT INTO sys_dict(dict_type,dict_code,dict_label_zh,dict_label_en,sort_no,status) VALUES('BRD_BREED','BREED','Approved breed','Breed',1,'ACTIVE'),('SYS_CURRENCY','CNY','人民币','CNY',1,'ACTIVE') ON CONFLICT DO NOTHING;
      INSERT INTO product_grades VALUES('GRADE_1',true,'ACTIVE'),('DIRTY',false,'ACTIVE'),('BROKEN',false,'ACTIVE');
      INSERT INTO sal_customers VALUES('CUST','CA','ACTIVE');
      INSERT INTO prc2_suppliers VALUES('SUPPLIER-1','ACTIVE',true,'GROUP',NULL);
      INSERT INTO file_metadata VALUES('FILE-fixture','ACTIVE',NULL,'PROTECTED','application/pdf','FLOCK_LIFECYCLE','HOUSE','HA','CA','SA','keeper'),
      ('FILE-fixture-HA2','ACTIVE',NULL,'PROTECTED','application/pdf','FLOCK_LIFECYCLE','HOUSE','HA2','CA','SA','keeper');`);
  });
  afterAll(async()=>{if(ds?.isInitialized)await ds.destroy();releaseBusinessClock?.();});
  it('uses collection instants across Singapore midnight and never UTC aggregates or an unproved counter delta',async()=>{
    await ds.query(`INSERT INTO mon_device_property_history VALUES
      ('HA','2488',100,$1,'2026-11-10'),('HA','2488',106,$2,'2026-11-10'),('HA','2488',120,$3,'2026-11-11'),
      ('HA','2484',2,$1,'2026-11-10'),('HA','2484',2.4,$2,'2026-11-10'),('HA','2001',28,$2,'2026-11-10')`,[Date.parse('2026-11-10T15:59:59Z'),Date.parse('2026-11-10T16:00:00Z'),Date.parse('2026-11-11T16:00:00Z')]);
    await ds.query("INSERT INTO mon_device_property_daily_agg VALUES('HA','2488','2026-11-11',99999,99999)");
    const iot=new MonDeviceService(ds.manager,{} as never);
    const r=await iot.generateDailyReportFromIoT('HA','2026-11-11');
    expect(r).toMatchObject({ok:true,feedKg:'6.00',waterL:'400.00',avgTemp:'28.00',businessTimeZone:'Asia/Singapore'});
    expect(await iot.generateDailyReportFromIoT('HA','2026-11-11',{snapshotHour:24})).toMatchObject({ok:false});
    await ds.query("UPDATE mon_device_property_history SET value=90 WHERE property_code='2488' AND collect_time=$1",[Date.parse('2026-11-10T16:00:00Z')]);
    expect(await iot.generateDailyReportFromIoT('HA','2026-11-11')).toMatchObject({feedKg:null,usageStatus:'INCOMPLETE_OR_COUNTER_RESET'});
    expect(await iot.generateDailyReportFromIoT('HA','2026-11-09')).toMatchObject({feedKg:null,waterL:null});
  });
  it('keeps ordinary reports read-only after closing and ignores supplied legacy occupancy ids',async()=>{
    const legacy:any={occupancy_id:'forged',log_date:'2026-11-11'};
    expect(await lifecycleDailyBalance(ds.manager,{flock_no:'FA'},undefined,legacy,{})).toBeNull();expect(legacy.occupancy_id).toBeNull();
    await baseline();await post(await create({kind:'CULL',flockNo:'FA',quantity:100,positionCode:'P1',businessDate:'2026-11-11'}));
    await post(await create({kind:'CLOSE',flockNo:'FA',expectedVersion:1,businessDate:'2026-11-11'}));
    await expect(lifecycleDailyBalance(ds.manager,{flock_no:'FA'},undefined,{house_code:'HA',log_date:'2026-11-11',shift:'DAILY'},{})).rejects.toThrow('日报只读');
  });
  it('amends a closed report through an independently approved immutable snapshot, without reopening or double loss',async()=>{
    await baseline();await ds.query(`INSERT INTO brd_daily_logs(flock_no,house_code,log_date,shift,eggs_produced,eggs_by_grade,occupancy_id,opening_qty,closing_qty,feed_consumed,water_consumed)
      SELECT 'FA','HA','2026-11-11','DAILY',50,'{"GRADE_1":50}',id,100,100,8,10 FROM brd_flock_occupancies WHERE flock_no='FA'`);
    await post(await create({kind:'CULL',flockNo:'FA',quantity:100,positionCode:'P1',businessDate:'2026-11-12'}));
    await post(await create({kind:'CLOSE',flockNo:'FA',expectedVersion:1,businessDate:'2026-11-12'}));
    const [r]=await s.reports(scope);const correction={eggsByGrade:{GRADE_1:55},feedConsumed:9,waterConsumed:11,notes:'Signed correction'};
    const d=await create({kind:'REPORT_CORRECTION',flockNo:'FA',businessDate:r.log_date,expectedVersion:2,dailyLogId:Number(r.id),expectedReportHash:r.report_hash,correction});
    await expect(s.transition(d.id,'approve',0,scope,admin)).rejects.toThrow();
    const done=await post(d);expect(done.payload.originalReport.eggs_produced).toBe(50);expect(done.payload.correction.eggsByGrade.GRADE_1).toBe(55);
    expect((await ds.query('SELECT eggs_produced,feed_consumed,occupancy_id FROM brd_daily_logs'))[0]).toMatchObject({eggs_produced:55,feed_consumed:'9',occupancy_id:r.occupancy_id});
    expect(await bal()).toMatchObject({quantity:0,version:3});expect((await bal()).closed_on).not.toBeNull();
    expect((await ds.query("SELECT current_qty,status FROM brd_flocks WHERE flock_no='FA'"))[0]).toEqual({current_qty:0,status:'RETIRED'});
    expect((await ds.query("SELECT COUNT(*)::int AS n FROM brd_flock_events WHERE kind='CULL'"))[0].n).toBe(1);
    await expect(create({kind:'REPORT_CORRECTION',flockNo:'FA',businessDate:r.log_date,expectedVersion:3,dailyLogId:Number(r.id),expectedReportHash:r.report_hash,correction})).rejects.toThrow('原日报已变化');
    await expect(new FlockReportCorrection1794903000000().down(ds.createQueryRunner())).rejects.toThrow('DOWN_HOLD');
  });
  it('refuses report snapshot races and reductions below exact downstream source receipts atomically',async()=>{
    await baseline();await ds.query(`INSERT INTO brd_daily_logs(flock_no,house_code,log_date,shift,eggs_produced,eggs_by_grade,occupancy_id)
      SELECT 'FA','HA','2026-11-11','DAILY',50,'{"GRADE_1":50}',id FROM brd_flock_occupancies WHERE flock_no='FA'`);
    const [r]=await s.reports(scope);const correction={eggsByGrade:{GRADE_1:10},feedConsumed:0,waterConsumed:0,notes:''};
    const d=await create({kind:'REPORT_CORRECTION',flockNo:'FA',businessDate:r.log_date,dailyLogId:Number(r.id),expectedReportHash:r.report_hash,correction});
    await ds.query("INSERT INTO inv_batches VALUES('SRC','GRADE_1',40)");
    await ds.query(`INSERT INTO inv_flock_source_links(id,batch_no,origin_batch_no,daily_log_id,occupancy_id,flock_no,house_code,company_code,production_date,source_key,source_input_qty,batch_output_qty,allocated_output_qty,precision,source_profile_snapshot)
      VALUES('REPORT-LINK','SRC','SRC',$1,$2,'FA','HA','CA','2026-11-11','TEMP:SRC',40,40,40,'EXACT','{}')`,[r.id,r.occupancy_id]);
    await expect(post(d)).rejects.toThrow('少于已接收');expect((await ds.query('SELECT eggs_produced FROM brd_daily_logs'))[0].eggs_produced).toBe(50);expect((await bal()).version).toBe(0);
    const safe=await create({kind:'REPORT_CORRECTION',flockNo:'FA',businessDate:r.log_date,dailyLogId:Number(r.id),expectedReportHash:r.report_hash,correction:{...correction,eggsByGrade:{GRADE_1:50}}});
    await ds.query("UPDATE brd_daily_logs SET note='Concurrent real edit'");await expect(post(safe)).rejects.toThrow('原日报已变化');
  });
  it('freezes confirmed daily facts on every ordinary save while preserving exact retries and first reporting',async()=>{
    await baseline();const next:any={house_code:'HA',log_date:'2026-11-11',shift:'DAILY',eggs_produced:50,eggs_by_grade:{GRADE_1:50},feed_consumed:null,water_consumed:null,note:'signed actual report'};
    const initial=await lifecycleDailyBalance(ds.manager,{flock_no:'FA'},undefined,next,{});expect(initial?.quantity).toBe(100);
    const prior={id:999,...next};for(const patch of [{operator:'fake actor'},{project_code:'forged project'},{mortality_reason:'forged reason'},{egg_count:12},{note:'bypass approval'},{feed_consumed:0},{eggs_produced:60,eggs_by_grade:{GRADE_1:60}}]){
      await expect(lifecycleDailyBalance(ds.manager,{flock_no:'FA'},prior,{...next,...patch},{})).rejects.toThrow('已确认');
    }
    expect((await lifecycleDailyBalance(ds.manager,{flock_no:'FA'},prior,{...next},{}))?.quantity).toBe(100);expect((await bal()).quantity).toBe(100);
  });
  it('holds missing final production until a real report or signed zero, then permits controlled supplement without reopening',async()=>{
    await baseline();await post(await create({kind:'CULL',flockNo:'FA',quantity:100,positionCode:'P1',businessDate:'2026-11-11'}));
    const close=await create({kind:'CLOSE',flockNo:'FA',expectedVersion:1,businessDate:'2026-11-11',finalProductionStatus:'REPORTED'});
    await expect(post(close)).rejects.toThrow('关闭当天DAILY');await s.transition(close.id,'cancel',2,scope,admin);
    await post(await create({kind:'CLOSE',flockNo:'FA',expectedVersion:1,businessDate:'2026-11-11'}));
    const d=await create({kind:'REPORT_CORRECTION',flockNo:'FA',businessDate:'2026-11-11',expectedVersion:2,dailyLogId:0,expectedReportHash:'ABSENT',correction:{eggsByGrade:{GRADE_1:15},feedConsumed:2,waterConsumed:3,notes:'Signed correction of original zero confirmation'}});
    const done=await post(d);expect(done.payload.originalReport).toBeNull();expect(done.payload.originalOccupancyId).toBeTruthy();expect(done.payload.originalZeroConfirmation.statement).toBe('CONFIRMED_ZERO');expect((await s.detail(done.payload.originalZeroConfirmation.documentId,scope)).amendments[0].id).toBe(done.id);
    const [r]=await ds.query("SELECT eggs_produced,closing_qty,elimination_qty,occupancy_id FROM brd_daily_logs WHERE flock_no='FA'");expect(r).toMatchObject({eggs_produced:15,closing_qty:0,elimination_qty:100,occupancy_id:done.payload.originalOccupancyId});expect((await bal()).quantity).toBe(0);expect((await bal()).closed_on).not.toBeNull();
    await expect(create({kind:'REPORT_CORRECTION',flockNo:'FA',businessDate:'2026-11-12',expectedVersion:3,dailyLogId:0,expectedReportHash:'ABSENT',correction:{eggsByGrade:{GRADE_1:0},feedConsumed:0,waterConsumed:0,notes:''}})).rejects.toThrow('无法证明');
  });
  it('rejects ordinary cross-month first reporting and permits only the exactly authorized approved supplement',async()=>{
    const opening=await create({kind:'BASELINE',flockNo:'FA',businessDate:'2026-10-10',quantity:100,expectedLegacyQty:100});
    await post(await create({kind:'HISTORY_AUTH',flockNo:'FA',businessDate:'2026-11-17',periodFrom:'2026-10-01',periodTo:'2026-10-31',authorizedSourceKey:opening.source_key}));await post(opening);
    const farm=new FarmService(ds.manager,new OrgOwnershipService(ds.manager));
    await expect(farm.submitBreedingDailyLog({house_code:'HA',flock_no:'FA',log_date:'2026-10-11',eggs_by_grade:{GRADE_1:10}},scope)).rejects.toThrow('跨月缺失日报');expect(await count('brd_daily_logs')).toBe(0);
    const d=await create({kind:'REPORT_CORRECTION',flockNo:'FA',businessDate:'2026-10-11',dailyLogId:0,expectedReportHash:'ABSENT',correction:{eggsByGrade:{GRADE_1:10},feedConsumed:1,waterConsumed:2,notes:'Actual signed historical supplement'}});
    await expect(post(d)).rejects.toThrow('跨月历史更正');expect(await count('brd_daily_logs')).toBe(0);
    await post(await create({kind:'HISTORY_AUTH',flockNo:'FA',businessDate:'2026-11-17',periodFrom:'2026-10-11',periodTo:'2026-10-11',authorizedSourceKey:d.source_key}));
    await s.transition(d.id,'post',2,scope,admin);expect(await count('brd_daily_logs')).toBe(1);expect((await bal()).quantity).toBe(100);
  });
  it('preserves unknown actual feed and water through a note-only approved amendment',async()=>{
    await baseline();await ds.query(`INSERT INTO brd_daily_logs(flock_no,house_code,log_date,shift,eggs_produced,eggs_by_grade,occupancy_id) SELECT 'FA','HA','2026-11-11','DAILY',50,'{"GRADE_1":50}',id FROM brd_flock_occupancies WHERE flock_no='FA'`);
    const [r]=await s.reports(scope);await post(await create({kind:'REPORT_CORRECTION',flockNo:'FA',businessDate:r.log_date,dailyLogId:Number(r.id),expectedReportHash:r.report_hash,correction:{eggsByGrade:{GRADE_1:50},feedConsumed:null,waterConsumed:null,notes:'Only the signed remark is corrected'}}));
    expect((await ds.query('SELECT feed_consumed,water_consumed,note FROM brd_daily_logs'))[0]).toEqual({feed_consumed:null,water_consumed:null,note:'Only the signed remark is corrected'});
  });
  it('refreshes the latest lay-rate projection without replacing it when an older report is amended',async()=>{
    await baseline();await ds.query(`INSERT INTO brd_daily_logs(flock_no,house_code,log_date,shift,eggs_produced,eggs_by_grade,occupancy_id,closing_qty,lay_rate)
      SELECT 'FA','HA','2026-11-11','DAILY',50,'{"GRADE_1":50}',id,100,50 FROM brd_flock_occupancies WHERE flock_no='FA';
      INSERT INTO brd_daily_logs(flock_no,house_code,log_date,shift,eggs_produced,eggs_by_grade,occupancy_id,closing_qty,lay_rate)
      SELECT 'FA','HA','2026-11-12','DAILY',60,'{"GRADE_1":60}',id,100,60 FROM brd_flock_occupancies WHERE flock_no='FA';`);
    const records=await s.reports(scope);for(const [day,qty,version,expected] of [['2026-11-11',55,0,60],['2026-11-12',65,1,65]] as const){const r=records.find((r:any)=>r.log_date===day);await post(await create({kind:'REPORT_CORRECTION',flockNo:'FA',businessDate:day,expectedVersion:version,dailyLogId:Number(r.id),expectedReportHash:r.report_hash,correction:{eggsByGrade:{GRADE_1:qty},feedConsumed:null,waterConsumed:null,notes:''}}));expect(Number((await ds.query("SELECT current_lay_rate FROM brd_flocks WHERE flock_no='FA'"))[0].current_lay_rate)).toBe(expected);expect((await bal()).quantity).toBe(100);}
  });
  it('keeps a house with real held birds operational and rejects a delivery dated before the held source',async()=>{
    await baseline();await post(await create({kind:'CULL',flockNo:'FA',quantity:10,positionCode:'PEN-1',businessDate:'2026-11-12'}));const [held]=await ds.query('SELECT id FROM brd_flock_held_balances');
    await expect(post(await create({kind:'SELL_HELD',flockNo:'FA',quantity:5,heldId:held.id,expectedVersion:1,expectedHeldVersion:0,businessDate:'2026-11-11',customerCode:'CUST',currencyCode:'CNY',unitPrice:2,salesRef:'SIGNED-RECEIPT',receiver:'customer'}))).rejects.toThrow('实际淘汰/待售来源日');
    const [pending]=await ds.query("SELECT id FROM brd_flock_documents WHERE kind='SELL_HELD'");await s.transition(pending.id,'cancel',2,scope,admin);
    await post(await create({kind:'CULL',flockNo:'FA',quantity:90,positionCode:'PEN-1',expectedVersion:1,businessDate:'2026-11-12'}));await post(await create({kind:'CLOSE',flockNo:'FA',expectedVersion:2,businessDate:'2026-11-12'}));
    await expect(writeHenhouse(ds.manager,{status:'INACTIVE'},{pkName:'house_code',id:'HA'})).rejects.toThrow('实际待售鸡余额');expect((await ds.query("SELECT status FROM brd_houses WHERE house_code='HA'"))[0].status).toBe('ACTIVE');
  });
  it('never signs an unknown legacy balance as a fabricated zero',async()=>{
    await ds.query("UPDATE brd_flocks SET current_qty=NULL WHERE flock_no='FA'");await expect(post(await create({kind:'BASELINE',flockNo:'FA',quantity:100,expectedLegacyQty:0}))).rejects.toThrow('旧档案余额');expect(await count('brd_flock_balances')).toBe(0);expect((await ds.query("SELECT current_qty FROM brd_flocks WHERE flock_no='FA'"))[0].current_qty).toBeNull();
  });
  it('preserves unknown legacy history and admits only an approved count baseline',async()=>{
    await expect(post(await create({kind:'MORTALITY',flockNo:'FA',quantity:2,disposalMethod:'verified disposal',receiver:'witness'}))).rejects.toThrow('基线');
    await baseline();expect((await bal()).quantity).toBe(100);
    expect((await ds.query("SELECT initial_qty,current_qty FROM brd_flocks WHERE flock_no='FA'"))[0]).toEqual({initial_qty:120,current_qty:100});
    expect(await count('brd_flock_events')).toBe(1);
  });
  it('requires evidence, count snapshot, standard breed and unique active identity',async()=>{
    await expect(create({kind:'BASELINE',flockNo:'FA',quantity:100,expectedLegacyQty:100,evidence:[]})).rejects.toThrow('证据');
    await expect(post(await create({kind:'BASELINE',flockNo:'FA',quantity:99,expectedLegacyQty:101}))).rejects.toThrow('旧档案');
    expect(await count('brd_flock_events')).toBe(0);
  });
  it('replays exact idempotency, rejects content conflicts and concurrently creates once',async()=>{
    const p={kind:'BASELINE',flockNo:'FA',quantity:100,expectedLegacyQty:100,sourceKey:'same-source'};
    const [a,b]=await Promise.all([create(p),create(p)]);expect(a.id).toBe(b.id);
    await expect(create({...p,quantity:99})).rejects.toThrow('幂等');
    await post(a);await s.transition(a.id,'post',0,scope,admin);
    expect(await count('brd_flock_events')).toBe(1);
  });
  it('enforces independent approval, actions and stale document versions',async()=>{
    let d=await create({kind:'BASELINE',flockNo:'FA',quantity:100,expectedLegacyQty:100});
    d=await s.transition(d.id,'submit',0,scope,admin);
    await expect(s.transition(d.id,'approve',1,scope,admin)).rejects.toThrow('制单人');
    await expect(s.transition(d.id,'approve',0,scope,approver)).rejects.toThrow('版本');
    await expect(create({kind:'MORTALITY',flockNo:'FA',quantity:1,disposalMethod:'disposal',receiver:'witness'},scope,{id:'reader',permissions:['MENU_FARM_DATA:V']})).rejects.toThrow('权限');
  });
  it('rejects cross-company, site escalation, empty scope and foreign target',async()=>{
    for(const sc of [{...scope,companyCodes:[]},{...scope,companyCodes:[],siteCodes:['SA2']}]) {
      await expect(create({kind:'BASELINE',flockNo:'FA',quantity:100,expectedLegacyQty:100},sc)).rejects.toThrow('无权');
    }
    await expect(create({kind:'TRANSFER',flockNo:'FA',targetHouseCode:'HB'})).rejects.toThrow('无权');
    expect((await s.overview({...scope,companyCodes:[],farmCodes:['A2']})).map((r:any)=>r.house_code)).toEqual(['HX']);
    expect(await s.list({...scope,companyCodes:[]})).toHaveLength(0);
  });
  it('accumulates mortality and culls once; sales only consume held balance',async()=>{
    await baseline();
    await post(await create({kind:'MORTALITY',flockNo:'FA',quantity:5,disposalMethod:'incinerated',receiver:'vet',businessDate:'2026-11-11'}));
    await post(await create({kind:'CULL',flockNo:'FA',quantity:10,positionCode:'PEN-1',expectedVersion:1,businessDate:'2026-11-12'}));
    const [held]=await ds.query('SELECT * FROM brd_flock_held_balances');expect(held.quantity).toBe(10);
    await post(await create({kind:'SELL_HELD',customerCode:'CUST',currencyCode:'CNY',unitPrice:10,receiver:'customer-witness',flockNo:'FA',quantity:6,heldId:held.id,salesRef:'DISPATCH-1',expectedHeldVersion:0,expectedVersion:2,businessDate:'2026-11-13'}));
    expect((await bal()).quantity).toBe(85);expect((await ds.query('SELECT quantity FROM brd_flock_held_balances'))[0].quantity).toBe(4);
  });
  it('serializes conflicting operators and rejects stale balance, negative/decimal/overdraw',async()=>{
    await baseline();
    const a=await create({kind:'CULL',flockNo:'FA',quantity:60,positionCode:'P1',businessDate:'2026-11-11'});
    const b=await create({kind:'CULL',flockNo:'FA',quantity:60,positionCode:'P2',businessDate:'2026-11-11'});
    const results=await Promise.allSettled([post(a),post(b)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await bal()).quantity).toBe(40);
    expect(await count('brd_flock_held_balances')).toBe(1);
    await expect(create({kind:'CULL',flockNo:'FA',quantity:1.5,positionCode:'P1'})).rejects.toThrow('整数');
    await expect(post(await create({kind:'CULL',flockNo:'FA',quantity:41,positionCode:'P1',expectedVersion:1,businessDate:'2026-11-12'}))).rejects.toThrow('余额');
    expect(await count('brd_flock_held_balances')).toBe(1);
  });
  it('rolls back all facts/projections on overcapacity adjustment',async()=>{
    await baseline();
    await expect(post(await create({kind:'ADJUST',flockNo:'FA',quantity:101,businessDate:'2026-11-11'}))).rejects.toThrow('容量');
    expect((await bal()).quantity).toBe(100);expect(await count('brd_flock_events')).toBe(1);
  });
  it('does not deduct event losses again through the daily report',async()=>{
    await baseline();await post(await create({kind:'CULL',flockNo:'FA',quantity:10,positionCode:'P1',businessDate:'2026-11-11'}));
    const next:any={house_code:'HA',log_date:'2026-11-11',shift:'DAILY',eggs_produced:50,eggs_by_grade:{GRADE_1:50}};
    const result=await lifecycleDailyBalance(ds.manager,{flock_no:'FA'},undefined,next,{});
    expect(result).toMatchObject({quantity:90,opening:100,closing:90});expect(next.elimination_qty).toBe(10);
    await expect(lifecycleDailyBalance(ds.manager,{flock_no:'FA'},undefined,{...next},{elimination_qty:1})).rejects.toThrow('重复扣减');
    await expect(lifecycleDailyBalance(ds.manager,{flock_no:'FA'},undefined,{...next,shift:'AM'},{})).rejects.toThrow('DAILY');
    expect((await bal()).quantity).toBe(90);
  });
  it('rejects future facts and baseline-before/after ambiguous legacy reports',async()=>{
    await expect(post(await create({kind:'BASELINE',flockNo:'FA',quantity:100,expectedLegacyQty:100,businessDate:'2099-01-01'}))).rejects.toThrow('未来');
    await ds.query("INSERT INTO brd_daily_logs(flock_no,house_code,log_date,shift) VALUES('FA','HA','2026-11-11','DAILY')");
    await expect(baseline()).rejects.toThrow('基线后');
  });
  it('transfers entire flock atomically to cleaned empty house without changing total',async()=>{
    await baseline();await clean('HA2');
    await post(await create({kind:'TRANSFER',flockNo:'FA',targetHouseCode:'HA2',businessDate:'2026-11-11'}));
    expect(await bal()).toMatchObject({house_code:'HA2',quantity:100,version:1});
    const rows=await ds.query('SELECT house_code,began_on::text,ended_on::text FROM brd_flock_occupancies ORDER BY began_on');
    expect(rows).toMatchObject([{house_code:'HA',ended_on:'2026-11-11'},{house_code:'HA2',began_on:'2026-11-11',ended_on:null}]);
    expect((await ds.query('SELECT SUM(quantity_delta)::integer AS n FROM brd_flock_events'))[0].n).toBe(100);
  });
  it('rejects occupied/unclean target, partial and same-day transfer, preserving source',async()=>{
    await baseline();
    await expect(post(await create({kind:'TRANSFER',flockNo:'FA',targetHouseCode:'HA2',businessDate:'2026-11-11'}))).rejects.toThrow('空舍');
    await clean('HA2');
    await expect(post(await create({kind:'TRANSFER',flockNo:'FA',targetHouseCode:'HA2'}))).rejects.toThrow('同日');
    expect((await bal()).house_code).toBe('HA');
  });
  it('requires zero close, independent cleaning and next-day new flock with preserved history',async()=>{
    await baseline();
    const close=await create({kind:'CLOSE',flockNo:'FA',businessDate:'2026-11-11'});
    await expect(post(close)).rejects.toThrow('归零');
    await s.transition(close.id,'cancel',2,scope,admin);
    await post(await create({kind:'CULL',flockNo:'FA',quantity:100,positionCode:'P1',businessDate:'2026-11-11'}));
    await post(await create({kind:'CLOSE',flockNo:'FA',expectedVersion:1,businessDate:'2026-11-11'}));
    await post(await create({kind:'CLEAN_START',expectedHouseVersion:1,businessDate:'2026-11-12'}));
    await post(await create({kind:'CLEAN_ACCEPT',expectedHouseVersion:2,businessDate:'2026-11-12'}));
    const next=await post(await create({kind:'ADMIT',quantity:80,expectedHouseVersion:3,businessDate:'2026-11-12',sourceKind:'SUPPLIER',sourceCode:'SUPPLIER-1',sourceReceipt:'RECEIPT-1',breedCode:'BREED',placementAge:120}));
    expect(next.flock_no).not.toBe('FA');
    expect((await ds.query("SELECT current_qty,status FROM brd_flocks WHERE flock_no='FA'"))[0]).toEqual({current_qty:0,status:'RETIRED'});
    expect(await count('brd_flock_occupancies')).toBe(2);
  });
  it('reverses once and replays historical daily balances; facts cannot be edited',async()=>{
    await baseline();
    const death=await post(await create({kind:'MORTALITY',flockNo:'FA',quantity:10,disposalMethod:'dispose',receiver:'vet',businessDate:'2026-11-11'}));
    await post(await create({kind:'ADJUST',flockNo:'FA',quantity:-5,expectedVersion:1,businessDate:'2026-11-12'}));
    await post(await create({kind:'REVERSE',flockNo:'FA',originalDocumentId:death.id,expectedVersion:2,businessDate:'2026-11-13',replacementKind:'MORTALITY',replacementQuantity:4,disposalMethod:'corrected disposal',receiver:'vet'}));
    expect((await bal()).quantity).toBe(91);
    expect((await ds.query("SELECT closing_qty FROM brd_flock_daily_balances WHERE balance_date='2026-11-11'"))[0].closing_qty).toBe(96);
    await expect(ds.query('UPDATE brd_flock_events SET quantity_delta=0')).rejects.toThrow('immutable');
    await expect(ds.query('DELETE FROM brd_flock_events')).rejects.toThrow('immutable');
    await expect(ds.query("UPDATE brd_flock_documents SET payload='{}',version=version+1 WHERE id=$1",[death.id])).rejects.toThrow('immutable');
    await expect(post(await create({kind:'REVERSE',flockNo:'FA',originalDocumentId:death.id,expectedVersion:3,businessDate:'2026-11-14'}))).rejects.toThrow('已冲销');
  });
  it('refuses reversal of culls already dispatched',async()=>{
    await baseline();const cull=await post(await create({kind:'CULL',flockNo:'FA',quantity:10,positionCode:'P1',businessDate:'2026-11-11'}));
    const [held]=await ds.query('SELECT * FROM brd_flock_held_balances');
    await post(await create({kind:'SELL_HELD',customerCode:'CUST',currencyCode:'CNY',unitPrice:10,receiver:'customer-witness',flockNo:'FA',quantity:6,heldId:held.id,salesRef:'S1',expectedHeldVersion:0,expectedVersion:1,businessDate:'2026-11-12'}));
    await expect(post(await create({kind:'REVERSE',flockNo:'FA',originalDocumentId:cull.id,expectedVersion:2,businessDate:'2026-11-13'}))).rejects.toThrow('已交付');
    expect((await bal()).quantity).toBe(90);
  });
  it('supports idempotent upgrade and refuses destructive down with posted facts',async()=>{
    await baseline();const q=ds.createQueryRunner();
    await new FlockLifecycleLedger1794900000000().up(q);
    await expect(new FlockLifecycleLedger1794900000000().down(q)).rejects.toThrow('contains facts');await q.release();
    expect((await bal()).quantity).toBe(100);
  });
  it('refuses down with only an unposted document and with only a source route or receipt',async()=>{
    await create({kind:'BASELINE',flockNo:'FA',quantity:100,expectedLegacyQty:100});const q=ds.createQueryRunner();
    await expect(new FlockLifecycleLedger1794900000000().down(q)).rejects.toThrow('brd_flock_documents');expect(await count('brd_flock_documents')).toBe(1);
    await ds.query("INSERT INTO brd_egg_day_routes VALUES('CA','HA','2026-11-10','TEMP_PRODUCTION')");
    await expect(new FlockProductionProvenance1794901000000().down(q)).rejects.toThrow('brd_egg_day_routes');expect(await count('brd_egg_day_routes')).toBe(1);await q.release();
  });
  it('rejects a historically overcapacity correction even if final quantity is within capacity',async()=>{
    await ds.query("UPDATE brd_houses SET max_capacity=100 WHERE house_code='HA'");await baseline();
    const death=await post(await create({kind:'MORTALITY',flockNo:'FA',quantity:20,disposalMethod:'verified',receiver:'vet',businessDate:'2026-11-11'}));
    await post(await create({kind:'ADJUST',flockNo:'FA',quantity:20,expectedVersion:1,businessDate:'2026-11-12'}));
    await post(await create({kind:'MORTALITY',flockNo:'FA',quantity:20,disposalMethod:'verified',receiver:'vet',expectedVersion:2,businessDate:'2026-11-13'}));
    await expect(post(await create({kind:'REVERSE',flockNo:'FA',originalDocumentId:death.id,expectedVersion:3,businessDate:'2026-11-14'}))).rejects.toThrow('历史占栏超容量');
    expect((await bal()).quantity).toBe(80);expect(await count('brd_flock_events')).toBe(4);
  });
  it('corrects a retired flock through reversed mortality and real holding reclassification without reopening it',async()=>{
    await baseline();const d=await post(await create({kind:'MORTALITY',flockNo:'FA',quantity:100,disposalMethod:'recorded incorrectly',receiver:'vet',businessDate:'2026-11-11'}));
    await post(await create({kind:'CLOSE',flockNo:'FA',expectedVersion:1,businessDate:'2026-11-12'}));
    await post(await create({kind:'REVERSE',flockNo:'FA',originalDocumentId:d.id,expectedVersion:2,businessDate:'2026-11-13',replacementKind:'CULL',replacementQuantity:100,positionCode:'actual-holding-pen'}));
    expect((await bal()).quantity).toBe(0);expect((await bal()).closed_on).not.toBeNull();expect((await ds.query('SELECT quantity FROM brd_flock_held_balances'))[0].quantity).toBe(100);
    expect((await ds.query("SELECT status FROM brd_flocks WHERE flock_no='FA'"))[0].status).toBe('RETIRED');
  });
  it('checks the original affected period and requires a posted authorization bound to this exact source',async()=>{
    const authorize=async(source:string)=>post(await create({kind:'HISTORY_AUTH',flockNo:'FA',periodFrom:'2026-10-01',periodTo:'2026-10-31',authorizedSourceKey:source}));
    await authorize('oct-baseline');await post(await create({kind:'BASELINE',sourceKey:'oct-baseline',flockNo:'FA',quantity:100,expectedLegacyQty:100,businessDate:'2026-10-20'}));
    await authorize('oct-death');const original=await post(await create({kind:'MORTALITY',sourceKey:'oct-death',flockNo:'FA',quantity:10,disposalMethod:'verified disposal',receiver:'vet',businessDate:'2026-10-21'}));
    const reversal=await create({kind:'REVERSE',flockNo:'FA',originalDocumentId:original.id,expectedVersion:1,businessDate:'2026-11-13',sourceKey:'real-reversal'});
    await expect(post(reversal)).rejects.toThrow('影响期间');expect((await bal()).quantity).toBe(90);
    await authorize('unrelated-source');await expect(s.transition(reversal.id,'post',2,scope,admin)).rejects.toThrow('影响期间');
    await authorize('real-reversal');await s.transition(reversal.id,'post',2,scope,admin);expect((await bal()).quantity).toBe(100);
  });
  it('preserves original activity location and rejects a backdated fact from before the current occupancy',async()=>{
    await baseline();await clean('HA2');await post(await create({kind:'TRANSFER',flockNo:'FA',targetHouseCode:'HA2',businessDate:'2026-11-11'}));
    await expect(ds.transaction(async m=>{const o=await lockManagedActivity(m,'FA');await recordFlockActivity(m,'MEDICATION','old-date',o,'2026-11-10');})).rejects.toThrow('早于当前占栏');
    for(const day of ['2026-11-11','2026-11-12'])await ds.transaction(async m=>{const o=await lockManagedActivity(m,'FA');await recordFlockActivity(m,'MEDICATION',day,o,day);});
    expect((await ds.query('SELECT house_code,business_date::text AS day FROM brd_flock_activity_sources ORDER BY business_date')).map((r:any)=>[r.house_code,r.day])).toEqual([['HA2','2026-11-11'],['HA2','2026-11-12']]);
  });
  it('uses stable report/occupancy provenance, inherits child batches and blocks a second route atomically',async()=>{
    await baseline();
    await ds.query(`CREATE TABLE IF NOT EXISTS inv_batches(batch_no text PRIMARY KEY,quality_grade text,qty numeric);
      CREATE TABLE IF NOT EXISTS pkg_source_batches(id int PRIMARY KEY,house_code text,flock_code text,received_qty int,production_date date,lay_date date,is_test boolean);
      CREATE TABLE IF NOT EXISTS pkg_grading_records(id int PRIMARY KEY,code text,is_test boolean);
      CREATE TABLE IF NOT EXISTS pkg_grading_source_links(grading_id int,source_batch_id int,input_qty int);
      CREATE TABLE IF NOT EXISTS pkg_packing_records(code text PRIMARY KEY,grading_code text,grading_codes_json jsonb,is_test boolean);
      TRUNCATE inv_batches,pkg_source_batches,pkg_grading_records,pkg_grading_source_links,pkg_packing_records;
      INSERT INTO inv_batches VALUES('SOURCE','GRADE_1',50),('CHILD','GRADE_1',20);
      INSERT INTO pkg_source_batches VALUES(1,'HA','FA',50,'2026-11-11','2026-11-11',false);
      INSERT INTO pkg_grading_records VALUES(1,'G1',false);INSERT INTO pkg_grading_source_links VALUES(1,1,50);
      INSERT INTO pkg_packing_records VALUES('PKG-1','G1','["G1"]',false);
      INSERT INTO brd_daily_logs(house_code,flock_no,log_date,shift,eggs_produced,eggs_by_grade,occupancy_id)
        SELECT 'HA','FA','2026-11-11','DAILY',100,'{"GRADE_1":100}',id FROM brd_flock_occupancies WHERE flock_no='FA';`);
    const profiles=[{houseCode:'HA',profileCode:'APPROVED',productMode:'STANDARD',varietyCode:null}];
    await ds.transaction(m=>recordFlockProductionSources(m,{companyCode:'CA',eggDate:'2026-11-11',qty:50,qualityGrade:'GRADE_1',sourceType:'TEMP_PRODUCTION'},'SOURCE',profiles,scope));
    await ds.transaction(m=>inheritFlockProductionSources(m,'SOURCE','CHILD',20));
    const links=await ds.query('SELECT batch_no,flock_no,occupancy_id,allocated_output_qty,precision FROM inv_flock_source_links ORDER BY batch_no');
    expect(links).toMatchObject([{batch_no:'CHILD',flock_no:'FA',allocated_output_qty:null,precision:'INHERITED'},{batch_no:'SOURCE',flock_no:'FA',precision:'EXACT'}]);
    await expect(ds.transaction(async m=>{await m.query("INSERT INTO inv_batches VALUES('BAD','GRADE_1',50)");await recordFlockProductionSources(m,{companyCode:'CA',eggDate:'2026-11-11',qty:50,qualityGrade:'GRADE_1',sourceType:'PACKAGING',packagingBatchRef:'PKG-1'},'BAD',profiles,scope);})).rejects.toThrow('两路重复入账');
    expect(await ds.query("SELECT * FROM inv_batches WHERE batch_no='BAD'")).toHaveLength(0);expect(await count('brd_egg_source_receipts')).toBe(1);
  });

});
