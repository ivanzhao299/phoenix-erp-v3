import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { installProductionInboundFixture } from '../sales-v2/services/production-inbound.pg-fixture';
import { FlockBaseSchema1794899000000 } from '../../database/migrations/1794899000000-FlockBaseSchema';
import { OfficialProductionReportGrain1794975000000 } from '../../database/migrations/1794975000000-OfficialProductionReportGrain';
import { FarmService, OrgScope } from './farm.service';
import { FlockLifecycleService } from './flock-lifecycle.service';
import { OrgOwnershipService } from '../org/services/org-ownership.service';

const url=process.env.OFFICIAL_INVENTORY_PG_URL;
const suite=url?describe:describe.skip;
const scope:OrgScope={isGlobal:false,farmCode:null,siteCode:null,companyCodes:['COMP-A']};
const maker={id:'fixture-system',admin:true};const reviewer={id:'fixture-reviewer',admin:true};
suite('official report grain — real Farm writes, cutover concurrency and reversible legacy keys',()=>{
  let db:DataSource;let farm:FarmService;let lifecycle:FlockLifecycleService;let schema:string;
  const migration=new OfficialProductionReportGrain1794975000000();
  const report=(shift='AM',quantity=100)=>({house_code:'HOUSE-A',flock_no:'FLOCK-A',log_date:'2026-11-18',shift,
    eggs_by_grade:{GRADE_0:0,GRADE_1:quantity,GRADE_2:0,GRADE_3:0,GRADE_4:0,GRADE_5:0,DIRTY:0,BROKEN:0}});
  const run=async(action:'up'|'down')=>{const q=db.createQueryRunner();await q.connect();try{await migration[action](q);}finally{await q.release();}};
  beforeEach(async()=>{
    const parsed=new URL(url!);if(parsed.hostname!=='127.0.0.1'||!['/installments_fixture','/phoenix_temp_reversal_fixture'].includes(parsed.pathname))throw new Error('Owned loopback fixture required');
    schema=`report_grain_${process.pid}_${randomUUID().slice(0,8)}`;
    db=await new DataSource({type:'postgres',url,entities:[],synchronize:false,migrationsRun:false,installExtensions:false,
      extra:{options:`-c search_path=${schema}`,max:6}}).initialize();
    if(!(await db.query('SHOW server_version'))[0].server_version.startsWith('18.'))throw new Error('PostgreSQL 18 required');
    await db.query(`CREATE SCHEMA "${schema}"`);await installProductionInboundFixture(db,['GRADE_0','GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','DIRTY','BROKEN'],{reportGrain:false});
    const q=db.createQueryRunner();await q.connect();try{await new FlockBaseSchema1794899000000().up(q);}finally{await q.release();}
    farm=new FarmService(db.manager,new OrgOwnershipService(db.manager));lifecycle=new FlockLifecycleService(db.manager);
  });
  afterEach(async()=>{if(db?.isInitialized){await db.query(`DROP SCHEMA "${schema}" CASCADE`);await db.destroy();}});
  const post=async(p:any)=>{let d=await lifecycle.create({sourceKey:randomUUID(),houseCode:'HOUSE-A',flockNo:'FLOCK-A',businessDate:'2026-11-16',
    expectedVersion:0,reason:'Synthetic isolated physical evidence',evidence:['FILE-count'],responsible:'fixture-system',differenceReceipt:'SYNTHETIC',...p},scope,maker);
    d=await lifecycle.transition(d.id,'submit',d.version,scope,maker);d=await lifecycle.transition(d.id,'approve',d.version,scope,reviewer);
    return lifecycle.transition(d.id,'post',d.version,scope,maker);};
  async function draft(){await db.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
    VALUES('20000000-0000-0000-0000-000000000001','COMP-A','HOUSE-A',1,'2026-11-18','DRAFT','WH-A','FLOCK-A','PROFILE-A',repeat('a',64),'{"synthetic":true}','fixture');`);}
  const activate=async()=>{await draft();await db.query("UPDATE production_cutover_scopes SET state='FENCED';UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now()");};
  async function managed(){await post({kind:'BASELINE',quantity:1000,expectedLegacyQty:1000});}
  it('submits AM 100 and PM 200 through Farm, retries the same report and rejects DAILY overlap',async()=>{
    await run('up');await managed();await activate();
    await farm.submitBreedingDailyLog(report(),scope);await farm.submitBreedingDailyLog(report('PM',200),scope);
    await farm.submitBreedingDailyLog(report(),scope);
    expect((await db.query('SELECT shift,eggs_produced,mortality_qty FROM brd_daily_logs ORDER BY shift'))).toEqual([
      {shift:'AM',eggs_produced:100,mortality_qty:0},{shift:'PM',eggs_produced:200,mortality_qty:0}]);
    await expect(farm.submitBreedingDailyLog(report('DAILY',300),scope)).rejects.toThrow();
    await expect(farm.submitBreedingDailyLog(report('AM',99),scope)).rejects.toThrow('已确认');
    expect(Number((await db.query("SELECT current_lay_rate FROM brd_flocks WHERE flock_no='FLOCK-A'"))[0].current_lay_rate)).toBe(30);
  });
  it('preserves archived report caches and counts one death once with two shift reports',async()=>{
    await run('up');await managed();await farm.submitBreedingDailyLog({...report('DAILY',70),log_date:'2026-11-17'},scope);
    const [old]=await db.query('SELECT to_jsonb(d) AS row FROM brd_daily_logs d');await activate();
    await farm.submitBreedingDailyLog(report(),scope);await farm.submitBreedingDailyLog(report('PM',200),scope);
    await db.query("UPDATE sys_dict SET status='INACTIVE' WHERE dict_type='PRODUCTION_REPORT_SHIFT' AND dict_code='AM'");
    await post({kind:'MORTALITY',businessDate:'2026-11-18',quantity:1,disposalMethod:'Approved fixture disposal',receiver:'fixture receiver'});
    expect((await db.query("SELECT to_jsonb(d) AS row FROM brd_daily_logs d WHERE log_date='2026-11-17'"))[0]).toEqual(old);
    expect((await db.query("SELECT sum(mortality_qty)::int AS n FROM brd_daily_logs WHERE log_date='2026-11-18'"))[0].n).toBe(0);
    expect((await farm.getDailyHenReport('2026-11-18',scope)).totals).toMatchObject({mortality:1,eggs:300,current_qty:999});
    expect((await farm.getFarmTrend(7,scope)).rows.find((r:any)=>r.date==='2026-11-18')).toMatchObject({mortality:1,eggs:300});
    await expect(db.query("UPDATE brd_daily_logs SET eggs_produced=71 WHERE log_date='2026-11-17'")).rejects.toThrow('ARCHIVED');
  });
  it('corrects an actual AM report through approval and closes only the zero-balance flock with both final shifts',async()=>{
    await run('up');await managed();await activate();await farm.submitBreedingDailyLog(report(),scope);await farm.submitBreedingDailyLog(report('PM',200),scope);
    const am=(await lifecycle.reports(scope)).find((r:any)=>r.shift==='AM');
    await post({kind:'REPORT_CORRECTION',businessDate:'2026-11-18',dailyLogId:Number(am.id),expectedReportHash:am.report_hash,
      correction:{eggsByGrade:{...report().eggs_by_grade,GRADE_1:120},feedConsumed:null,waterConsumed:null,notes:'Actual approved synthetic correction'}});
    expect((await farm.getProductionReports('2026-11-18','HOUSE-A',scope)).map((r:any)=>r.eggs_by_grade.GRADE_1)).toEqual([120,200]);
    expect(Number((await db.query("SELECT current_lay_rate FROM brd_flocks WHERE flock_no='FLOCK-A'"))[0].current_lay_rate)).toBe(32);
    await post({kind:'CULL',businessDate:'2026-11-18',expectedVersion:1,quantity:1000,positionCode:'SYNTHETIC-HOLDING'});
    await post({kind:'CLOSE',businessDate:'2026-11-18',expectedVersion:2,finalProductionStatus:'REPORTED'});
    expect((await db.query("SELECT quantity,closed_on::text FROM brd_flock_balances WHERE flock_no='FLOCK-A'"))[0]).toEqual({quantity:0,closed_on:'2026-11-18'});
    expect((await db.query("SELECT ended_on::text FROM brd_flock_occupancies WHERE flock_no='FLOCK-A'"))[0].ended_on).toBe('2026-11-19');
    expect((await farm.getProductionReports('2026-11-18','HOUSE-A',scope))).toHaveLength(2);
  });
  for(const kind of ['constraint','index','native-three'])it(`keeps OFF policy and restores exact ${kind} definitions on empty OFF down`,async()=>{
    if(kind==='constraint')await db.query('ALTER TABLE brd_daily_logs ADD CONSTRAINT legacy_house_day UNIQUE(house_code,log_date)');
    if(kind==='index')await db.query('CREATE UNIQUE INDEX legacy_house_day ON brd_daily_logs USING btree(log_date DESC,house_code) INCLUDE(shift)');
    const before=await db.query("SELECT c.relname,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='brd_daily_logs'::regclass AND i.indisunique ORDER BY c.relname");
    await run('up');await db.query("INSERT INTO brd_daily_logs(house_code,log_date,shift) VALUES('HOUSE-A','2026-11-17','AM')");
    const pm=db.query("INSERT INTO brd_daily_logs(house_code,log_date,shift) VALUES('HOUSE-A','2026-11-17','PM')");
    if(kind==='native-three')await pm;else await expect(pm).rejects.toThrow('LEGACY_DAILY_UNIQUENESS');
    await db.query("INSERT INTO brd_daily_logs(house_code,log_date,shift) VALUES('HOUSE-A','2026-11-17','AM') ON CONFLICT(log_date,house_code,shift) DO UPDATE SET eggs_produced=1");
    await db.query('TRUNCATE brd_daily_logs');await run('down');
    expect(await db.query("SELECT c.relname,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='brd_daily_logs'::regclass AND i.indisunique ORDER BY c.relname")).toEqual(before);
  });
  it('removes a supported legacy day key only for controlled AM/PM, while rejecting incomplete formal grades',async()=>{
    await db.query('CREATE UNIQUE INDEX legacy_house_day ON brd_daily_logs(house_code,log_date)');await run('up');await managed();await activate();
    await expect(farm.submitBreedingDailyLog({...report(),eggs_by_grade:{GRADE_1:100}},scope)).rejects.toThrow('全部库存分级');
    await farm.submitBreedingDailyLog(report(),scope);await farm.submitBreedingDailyLog(report('PM',200),scope);
    expect((await farm.getProductionReports('2026-11-18','HOUSE-A',scope)).map((r:any)=>r.shift)).toEqual(['AM','PM']);
    await expect(run('down')).rejects.toThrow('DOWN_HOLD');
  });
  it('retains a nondefault index operator class for separate review',async()=>{
    await db.query('CREATE UNIQUE INDEX special_house_day ON brd_daily_logs(house_code text_pattern_ops,log_date)');
    await expect(run('up')).rejects.toThrow('semantics review');
    expect((await db.query("SELECT to_regclass('special_house_day') AS relation"))[0].relation).toBe('special_house_day');
  });
  it('does not promote a legitimate OFF report at the proposed first date into official quota',async()=>{
    await run('up');await managed();await draft();await farm.submitBreedingDailyLog(report('DAILY'),scope);
    await expect(db.query("UPDATE production_cutover_scopes SET state='FENCED'")).rejects.toThrow('FIRST_DAY_HOLD');
    expect((await db.query('SELECT state FROM production_cutover_scopes'))[0].state).toBe('DRAFT');
    expect((await db.query('SELECT count(*)::int AS n FROM brd_daily_logs'))[0].n).toBe(1);
  });
  for(const action of ['up','down'] as const)it(`holds ${action} before DDL when an external migration transaction has a stale snapshot`,async()=>{
    if(action==='down')await run('up');const q=db.createQueryRunner();await q.connect();await q.startTransaction('REPEATABLE READ');
    try{await q.query('SELECT count(*) FROM production_cutover_scopes');await draft();
      await expect(migration[action](q)).rejects.toThrow('ISOLATION_HOLD');
    }finally{await q.rollbackTransaction();await q.release();}
    expect((await db.query('SELECT count(*)::int AS n FROM production_cutover_scopes'))[0].n).toBe(1);
    expect((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid='brd_daily_logs'::regclass AND tgname='trg_official_production_report'"))[0].n).toBe(action==='down'?1:0);
  });
  it('holds unsupported deferrable uniqueness without losing original DDL',async()=>{
    await db.query('ALTER TABLE brd_daily_logs ADD CONSTRAINT deferred_house_day UNIQUE(house_code,log_date) DEFERRABLE');
    await expect(run('up')).rejects.toThrow('semantics review');
    expect((await db.query("SELECT conname FROM pg_constraint WHERE conname='deferred_house_day' AND conrelid='brd_daily_logs'::regclass"))).toHaveLength(1);
    expect((await db.query("SELECT 1 FROM typeorm_metadata WHERE name='OfficialProductionReportGrain1794975000000'"))).toHaveLength(0);
  });
  it('rejects a stale repeatable-read writer even when its snapshot cannot see a later cutover',async()=>{
    await run('up');const q=db.createQueryRunner();await q.connect();await q.startTransaction('REPEATABLE READ');
    try{await q.query('SELECT count(*) FROM production_cutover_scopes');await activate();
      await expect(q.query("INSERT INTO brd_daily_logs(house_code,log_date,shift) VALUES('HOUSE-A','2026-11-17','DAILY')")).rejects.toThrow('ISOLATION_HOLD');
    }finally{await q.rollbackTransaction();await q.release();}
  });
  it('scope insertion and FENCE cannot pass an older report writer; later archived changes hold',async()=>{
    await run('up');const q=db.createQueryRunner();await q.connect();await q.startTransaction();
    try{await q.query("INSERT INTO brd_daily_logs(house_code,log_date,shift) VALUES('HOUSE-A','2026-11-17','DAILY')");
      await expect(draft()).rejects.toThrow('OFFICIAL_REPORT_BUSY');await q.commitTransaction();
    }finally{if(q.isTransactionActive)await q.rollbackTransaction();await q.release();}
    await activate();await expect(db.query("UPDATE brd_daily_logs SET eggs_produced=10")).rejects.toThrow('ARCHIVED');
    await expect(db.query('DELETE FROM brd_daily_logs')).rejects.toThrow('ARCHIVED');
    await expect(run('down')).rejects.toThrow('DOWN_HOLD');
  });
  it('holds a writer behind a house owner immediately and forbids importing OFF report identities into ACTIVE',async()=>{
    await run('up');await managed();
    await db.query("INSERT INTO brd_daily_logs(house_code,log_date,shift,flock_no) VALUES('HOUSE-A2','2026-11-18','AM','FLOCK-A')");await activate();
    const q=db.createQueryRunner();await q.connect();await q.startTransaction();
    try{await q.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext('HOUSE-A'))");
      await expect(db.query("INSERT INTO brd_daily_logs(house_code,log_date,shift) VALUES('HOUSE-A','2026-11-18','AM')")).rejects.toThrow('OFFICIAL_REPORT_BUSY');
    }finally{await q.rollbackTransaction();await q.release();}
    await expect(db.query("UPDATE brd_daily_logs SET house_code='HOUSE-A' WHERE house_code='HOUSE-A2'")).rejects.toThrow('IDENTITY_IMMUTABLE');
    await expect(db.query("INSERT INTO brd_daily_logs(house_code,log_date,shift,flock_no) VALUES('HOUSE-A','2026-11-18','AM','FLOCK-A')")).rejects.toThrow('SOURCE_IDENTITY_HOLD');
  });
});
