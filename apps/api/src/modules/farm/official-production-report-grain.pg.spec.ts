import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { installProductionInboundFixture } from '../sales-v2/services/production-inbound.pg-fixture';
import { FlockBaseSchema1794899000000 } from '../../database/migrations/1794899000000-FlockBaseSchema';
import { OfficialProductionReportGrain1794975000000 } from '../../database/migrations/1794975000000-OfficialProductionReportGrain';
import { ProductionAnalyticsService } from '../analytics/services/production-analytics.service';
import { GenericCrudService } from '../generic-crud/generic-crud.service';
import { assertNewHandoverGrades } from './daily-report-grades';
import { lockProductionSourceReports } from '../sales-v2/services/production-source-facts';
import { FarmService, OrgScope } from './farm.service';
import { readFlockActionEligibility } from './flock-lifecycle-queries';
import { FlockLifecycleService } from './flock-lifecycle.service';
import { applyFlockLossCache, planFlockLossCache } from '../../tools/flock-loss-cache-repair';
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
  it('distinguishes a legacy flock present on the report date from a later placement',async()=>{
    await run('up');
    await db.query(`INSERT INTO brd_flocks(flock_no,house_code,farm_code,status,current_qty,start_date)
      VALUES('FUTURE-PLACEMENT','HOUSE-A','FARM-A','LAYING',100,'2026-11-19')`);
    const {rows}=await farm.getDailyHenReport('2026-11-18',scope);
    expect(rows.find(r=>r.flock_no==='FLOCK-A')).toMatchObject({entry_candidate:true,entry_verified:true});
    expect(rows.find(r=>r.flock_no==='FUTURE-PLACEMENT')).toMatchObject({entry_candidate:false});
    await db.query("UPDATE brd_flocks SET start_date='2026-11-18',status='INACTIVE',current_qty=0 WHERE flock_no='FUTURE-PLACEMENT'");
    const ambiguous=await farm.getDailyHenReport('2026-11-18',scope);
    expect(ambiguous.rows.find(r=>r.flock_no==='FLOCK-A')).toMatchObject({entry_verified:false});
  });

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
    await expect(db.query("UPDATE brd_daily_logs SET eggs_produced=71 WHERE log_date='2026-11-17'")).rejects.toThrow('ARCHIVED');
  });
  it('posts the sole missing previous-month formal shift only with authorization bound to its original draft', async () => {
    await run('up');
    const [calendar]=await db.query(`SELECT (now() AT TIME ZONE 'Asia/Singapore')::date::text AS today,
      (date_trunc('month',now() AT TIME ZONE 'Asia/Singapore')-interval '1 month')::date::text AS baseline,
      (date_trunc('month',now() AT TIME ZONE 'Asia/Singapore')-interval '1 month'+interval '1 day')::date::text AS day`);
    await db.query("UPDATE brd_flocks SET start_date=$1 WHERE flock_no='FLOCK-A'",[calendar.baseline]);
    await post({kind:'HISTORY_AUTH',businessDate:calendar.today,periodFrom:calendar.baseline,periodTo:calendar.baseline,authorizedSourceKey:'baseline-old'});
    await post({kind:'BASELINE',businessDate:calendar.baseline,sourceKey:'baseline-old',quantity:1000,expectedLegacyQty:1000});
    await draft();
    await db.query("UPDATE production_cutover_scopes SET first_production_date=$1",[calendar.day]);
    await db.query("UPDATE production_cutover_scopes SET state='FENCED';UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now()");
    const [o]=await lifecycle.occupancies(scope);
    const input=report('AM',100);
    await db.query(`INSERT INTO brd_daily_logs(flock_no,house_code,farm_code,company_code,site_code,log_date,business_date,
      shift,occupancy_id,eggs_by_grade,eggs_produced,mortality_qty,elimination_qty)
      SELECT flock_no,house_code,farm_code,company_code,site_code,$1,$1,'AM',id,$2,100,0,0 FROM brd_flock_occupancies WHERE id=$3`,
      [calendar.day,JSON.stringify(input.eggs_by_grade),o.occupancy_id]);
    const [am]=await db.query("SELECT to_jsonb(d) AS fact FROM brd_daily_logs d WHERE shift='AM'");
    const coord={houseCode:'HOUSE-A',flockNo:'FLOCK-A',businessDate:calendar.day,occupancyId:o.occupancy_id};
    expect(await lifecycle.missingFormalShifts(coord,scope,maker)).toEqual(['PM']);
    await expect(farm.submitBreedingDailyLog({...report('PM'),log_date:calendar.day},scope)).rejects.toThrow();
    const key='named-pm';
    const auth={kind:'HISTORY_AUTH',businessDate:calendar.today,periodFrom:calendar.day,periodTo:calendar.day,authorizedSourceKey:key};
    await post(auth);
    const payload={kind:'REPORT_CORRECTION',sourceKey:key,houseCode:coord.houseCode,flockNo:coord.flockNo,businessDate:coord.businessDate,
      dailyLogId:0,expectedReportHash:'SHIFT_ABSENT',supplementShift:'PM',supplementOccupancyId:o.occupancy_id,
      expectedVersion:0,reason:'fixture signed late shift',responsible:maker.id,evidence:['FILE-count'],differenceReceipt:'LATE-SHIFT',
      correction:{eggsByGrade:report('PM',200).eggs_by_grade,feedConsumed:null,waterConsumed:null,notes:'fixture'}};
    await expect(lifecycle.create({...payload,supplementShift:undefined,supplementOccupancyId:undefined,expectedReportHash:'ABSENT'},scope,maker)).rejects.toThrow('已有日报');
    let doc=await lifecycle.create(payload,scope,maker);
    expect((await lifecycle.create(payload,scope,maker)).id).toBe(doc.id);
    await expect(lifecycle.create({...payload,sourceKey:'other-pm'},scope,maker)).rejects.toThrow('在途补录');
    doc=await lifecycle.transition(doc.id,'submit',doc.version,scope,maker);
    doc=await lifecycle.transition(doc.id,'approve',doc.version,scope,reviewer);
    expect((await readFlockActionEligibility(db.manager,doc.id,scope,maker)).blockers).toContain('FLOCK_FORMAL_SHIFT_AUTH_REQUIRED');
    await expect(lifecycle.transition(doc.id,'post',doc.version,scope,maker)).rejects.toThrow('影响期间');
    const authorized=await post(auth);
    expect(authorized.payload.authorizedShiftDocumentId).toBe(doc.id);
    expect((await readFlockActionEligibility(db.manager,doc.id,scope,maker)).blockers).not.toContain('FLOCK_FORMAL_SHIFT_AUTH_REQUIRED');
    await lifecycle.transition(doc.id,'post',doc.version,scope,maker);
    expect((await db.query("SELECT to_jsonb(d) AS fact FROM brd_daily_logs d WHERE shift='AM'"))[0]).toEqual(am);
    const [pm]=await db.query("SELECT occupancy_id,eggs_produced,mortality_qty,elimination_qty FROM brd_daily_logs WHERE shift='PM'");
    expect(pm).toEqual({occupancy_id:o.occupancy_id,eggs_produced:200,mortality_qty:0,elimination_qty:0});
    expect(await lifecycle.missingFormalShifts(coord,scope,maker)).toEqual([]);
  });

  it('plans and repairs only the approved cache columns, deferring rows used by in-flight corrections',async()=>{
    await run('up');await managed();await activate();
    await farm.submitBreedingDailyLog(report(),scope);await farm.submitBreedingDailyLog(report('PM',200),scope);
    // Fixture only: model a pre-rebuild cache error.
    await db.query("UPDATE brd_daily_logs SET mortality_qty=8,elimination_qty=3");
    const repairScope={company:'COMP-A',houses:['HOUSE-A'],from:'2026-11-18',through:'2026-11-18'};
    const first=await planFlockLossCache(db,repairScope);
    expect(first.eligible).toBe(2);
    const [am]=(await lifecycle.reports(scope)).filter((r:any)=>r.shift==='AM');
    await lifecycle.create({kind:'REPORT_CORRECTION',sourceKey:'feed-only',houseCode:'HOUSE-A',flockNo:'FLOCK-A',
      businessDate:'2026-11-18',dailyLogId:am.id,expectedReportHash:am.report_hash,expectedVersion:0,
      reason:'feed-only fixture',responsible:maker.id,evidence:['FILE-count'],differenceReceipt:'FEED',
      correction:{eggsByGrade:am.eggs_by_grade,feedConsumed:4,waterConsumed:null,notes:am.notes??''}},scope,maker);
    await expect(applyFlockLossCache(db,repairScope,first.digest)).rejects.toThrow('REPAIR_PLAN_CHANGED');
    const next=await planFlockLossCache(db,repairScope);
    expect(next.rows.find(row=>row.shift==='AM')?.holds).toContain('IN_FLIGHT_REPORT_CORRECTION');
    const result=await applyFlockLossCache(db,repairScope,next.digest);
    expect(result.updatedIds).toHaveLength(1);
    expect(await db.query('SELECT shift,mortality_qty,elimination_qty,eggs_produced FROM brd_daily_logs ORDER BY shift')).toEqual([
      {shift:'AM',mortality_qty:8,elimination_qty:3,eggs_produced:100},
      {shift:'PM',mortality_qty:0,elimination_qty:0,eggs_produced:200},
    ]);
    await expect(applyFlockLossCache(db,repairScope,next.digest)).rejects.toThrow('REPAIR_PLAN_CHANGED');
    expect((await farm.getDailyHenReport('2026-11-18',scope)).totals).toMatchObject({eggs:300,mortality:0,elimination:0});
  });

  it('holds a stale cache whose same-house event points to a different historical occupancy',async()=>{
    await run('up');await managed();
    await farm.submitBreedingDailyLog(report('DAILY',100),scope);
    const older=randomUUID();
    await db.query(`INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,
      ended_on,capacity_snapshot,opened_document_id) SELECT $1,flock_no,house_code,company_code,farm_code,site_code,
      began_on-1,began_on,capacity_snapshot,opened_document_id FROM brd_flock_occupancies WHERE flock_no='FLOCK-A'`,[older]);
    await db.query(`INSERT INTO brd_flock_events(id,document_id,line_no,flock_no,occupancy_id,company_code,farm_code,site_code,
      house_code,business_date,kind,quantity_delta,actor,approved_by)
      SELECT $1,opened_document_id,99,flock_no,id,company_code,farm_code,site_code,house_code,'2026-11-18','MORTALITY',-5,'fixture','fixture'
      FROM brd_flock_occupancies WHERE id=$2`,[randomUUID(),older]);
    await db.query("UPDATE brd_daily_logs SET mortality_qty=5");
    const repairScope={company:'COMP-A',houses:['HOUSE-A'],from:'2026-11-18',through:'2026-11-18'};
    const plan=await planFlockLossCache(db,repairScope);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].holds).toContain('LOSS_SOURCE_IDENTITY');
    expect(plan.eligible).toBe(0);
    expect((await applyFlockLossCache(db,repairScope,plan.digest)).updatedIds).toEqual([]);
    expect(await db.query('SELECT mortality_qty FROM brd_daily_logs')).toEqual([{mortality_qty:5}]);
  });

  it('normalizes at entry and replays a signed report without updating its tuple or hash after catalog changes', async () => {
    await run('up'); await managed(); await activate();
    const input = {...report(), eggs_by_grade:{...report().eggs_by_grade, GRADE_1:'100'}};
    for (const value of ['', '1e2', '0.3', true, -1, 2147483648, '9007199254740993']) {
      await expect(farm.submitBreedingDailyLog({...input, eggs_by_grade:{...input.eggs_by_grade, GRADE_1:value}},scope)).rejects.toThrow();
    }
    await expect(farm.submitBreedingDailyLog({...input, eggs_by_grade:{...input.eggs_by_grade, EXTRA:0}},scope)).rejects.toThrow();
    await farm.submitBreedingDailyLog(input,scope);
    const source = () => db.transaction(m => lockProductionSourceReports(m,{companyCode:'COMP-A',houseCode:'HOUSE-A',productionDate:input.log_date}));
    const tuple = () => db.query('SELECT xmin::text,to_jsonb(d) AS fact FROM brd_daily_logs d');
    const before = await tuple(), signed = await source();
    await db.transaction(m => assertNewHandoverGrades(m,signed));
    expect(signed[0].eggs_by_grade.GRADE_1).toBe(100);
    const {GRADE_0, ...missingZero} = input.eggs_by_grade;
    expect(GRADE_0).toBe(0);
    await expect(farm.submitBreedingDailyLog({...input, eggs_by_grade:missingZero},scope)).rejects.toThrow('已确认');
    await db.query("UPDATE product_grades SET status='INACTIVE' WHERE grade_code='GRADE_1'; INSERT INTO product_grades(grade_code,status) VALUES('NEW_GRADE','ACTIVE')");
    await farm.submitBreedingDailyLog({...input, eggs_by_grade:{...input.eggs_by_grade,GRADE_1:100}},scope);
    expect(await source()).toEqual(signed); expect(await tuple()).toEqual(before);
    await expect(farm.submitBreedingDailyLog({...input,shift:'PM'},scope)).rejects.toThrow('未启用');
    const {GRADE_1, ...newGrades} = input.eggs_by_grade;
    expect(GRADE_1).toBe('100');
    await expect(farm.submitBreedingDailyLog({...input,shift:'PM',eggs_by_grade:newGrades},scope)).rejects.toThrow('全部库存分级');
    await farm.submitBreedingDailyLog({...input,shift:'PM',eggs_by_grade:{...newGrades,NEW_GRADE:0}},scope);
  });

  it('reconciles production, occupancy losses and partial measurements across daily, trend, BI and scoped export', async () => {
    await run('up'); await managed(); await activate();
    await db.query('ALTER TABLE sys_organizations ADD COLUMN IF NOT EXISTS org_name text');
    const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date());
    const previous = new Date(Date.parse(day)-86400000).toISOString().slice(0,10);
    await farm.submitBreedingDailyLog({...report(),log_date:previous,feed_consumed:0,water_consumed:null},scope);
    await farm.submitBreedingDailyLog({...report('PM',200),log_date:previous,feed_consumed:null,water_consumed:null},scope);
    const loss = {kind:'MORTALITY',quantity:1,disposalMethod:'fixture',receiver:'receiver'};
    await post({...loss,businessDate:previous}); await post({...loss,businessDate:day,expectedVersion:1});
    const bi = new ProductionAnalyticsService(db.manager), crud = new GenericCrudService(db.manager);
    const reportScope = {isGlobal:false,allowedBreedingCompanyCodes:['COMP-A']} as any;
    const first = await farm.getDailyHenReport(previous,scope);
    expect(first.totals).toMatchObject({eggs:300,mortality:1,feed:0,feed_missing:1,water:null,water_missing:2});
    const trend = (await farm.getFarmTrend(7,scope)).rows;
    expect(trend.find((r:any) => r.date === previous)).toMatchObject({eggs:300,mortality:1});
    expect(trend.find((r:any) => r.date === day)).toMatchObject({eggs:null,mortality:1,report_count:0});
    const daily = await bi.compute({dateFrom:previous,dateTo:day},scope);
    expect(daily.trend30Day).toMatchObject([{eggs:300,deaths:1,feed_missing:1,water_l:null},{eggs:null,deaths:1,report_count:0}]);
    const rows = await crud.exportDailyReports(previous,{},reportScope);
    expect(rows.reduce((n,r)=>n+Number(r.eggs_produced??0),0)).toBe(300);
    expect(rows.reduce((n,r)=>n+Number(r.mortality_qty),0)).toBe(1);
    expect(rows.map(r=>r.row_kind).sort()).toEqual(['FLOCK_EVENT','REPORT','REPORT']);
    expect(await crud.exportDailyReports(day,{},{...reportScope,allowedBreedingCompanyCodes:['COMP-B']})).toEqual([]);
    const onlyLoss = await crud.exportDailyReports(day,{},reportScope);
    expect(onlyLoss).toHaveLength(1); expect(onlyLoss[0]).toMatchObject({row_kind:'FLOCK_EVENT',mortality_qty:1});
    expect((await farm.getDailyHenReport(day,scope)).rows.find(r=>r.house_code==='HOUSE-A')).toMatchObject({has_daily_log:false,mortality:1,water:null});
  });

  it('keeps pre-transfer mortality at its original house on an event-only transfer day', async () => {
    await run('up'); await managed();
    await db.query("INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,store_code,uploaded_by) SELECT 'FILE-A2',status,visibility,mime_type,module_code,owner_type,'HOUSE-A2',company_code,store_code,uploaded_by FROM file_metadata WHERE file_id='FILE-count'");
    for (const kind of ['CLEAN_START','CLEAN_ACCEPT']) {
      await post({kind,houseCode:'HOUSE-A2',flockNo:undefined,expectedHouseVersion:0,evidence:['FILE-A2']});
    }
    const day = '2026-11-18';
    await post({kind:'MORTALITY',businessDate:day,quantity:1,disposalMethod:'fixture',receiver:'receiver'});
    await post({kind:'TRANSFER',businessDate:day,expectedVersion:1,targetHouseCode:'HOUSE-A2'});
    const result = await farm.getDailyHenReport(day,scope);
    expect(result.rows.find(r=>r.house_code==='HOUSE-A')).toMatchObject({entry_candidate:false,mortality:1,current_qty:0,has_daily_log:false});
    expect(result.rows.find(r=>r.house_code==='HOUSE-A2')).toMatchObject({entry_candidate:true,entry_verified:true,mortality:0,current_qty:999,has_daily_log:false});
    expect(result.totals).toMatchObject({mortality:1,current_qty:999,logged_houses:0,lay_rate:null});
    await post({kind:'MORTALITY',houseCode:'HOUSE-A2',businessDate:day,expectedVersion:2,quantity:3,
      disposalMethod:'fixture',receiver:'receiver',evidence:['FILE-A2']});
    await farm.submitBreedingDailyLog({...report('DAILY',100),house_code:'HOUSE-A2'},scope);
    await db.query("UPDATE brd_daily_logs SET mortality_qty=4 WHERE house_code='HOUSE-A2'");
    const bounded={company:'COMP-A',houses:['HOUSE-A2'],from:day,through:day};
    const repair=await planFlockLossCache(db,bounded);
    expect(repair.rows).toMatchObject([{previous_mortality:4,mortality:3,holds:[]}]);
    await applyFlockLossCache(db,bounded,repair.digest);
    const corrected=await farm.getDailyHenReport(day,scope);
    expect(corrected.rows.find(r=>r.house_code==='HOUSE-A')).toMatchObject({mortality:1});
    expect(corrected.rows.find(r=>r.house_code==='HOUSE-A2')).toMatchObject({mortality:3,eggs:100});
    expect(corrected.totals).toMatchObject({mortality:4,current_qty:996});

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
