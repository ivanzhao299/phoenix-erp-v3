// Dedicated local PG18 only; synthetic TEST records, no production data or auth.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),ts=require('../../apps/api/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,f);
const {DataSource}=require('../../apps/api/node_modules/typeorm');
const {packingHistoryFixture}=require('../../apps/api/src/modules/bff/packaging-history.fixture.ts');
const {DataScopeService}=require('../../apps/api/src/modules/org/services/data-scope.service.ts');
const {PackagingHandoverService}=require('../../apps/api/src/modules/bff/packaging-handover.service.ts');
const {PackagingBoxService}=require('../../apps/api/src/modules/bff/packaging-box.service.ts');
const {PackagingWorkflowPolicy}=require('../../apps/api/src/modules/bff/packaging-workflow-policy.ts');
const {PackagingHistoryController}=require('../../apps/api/src/modules/bff/packaging-history.controller.ts');
const {PackagingHistoryService}=require('../../apps/api/src/modules/bff/packaging-history.service.ts');
const dir=path.resolve('artifacts/packaging-history-local');
(async()=>{const ds=new DataSource({type:'postgres',host:'127.0.0.1',port:55432,username:'postgres',database:'packaging_history_test',entities:[path.resolve('apps/api/src/**/*.entity.ts')],logging:false});try{
 await ds.initialize();await ds.query("SET statement_timeout='15s'");const [identity]=await ds.query("SELECT current_database() db,current_setting('server_version_num') version");if(identity.db!=='packaging_history_test'||+identity.version<180000)throw Error('ISOLATION_REQUIRED');
 const fixturePath=path.join(dir,'performance-fixture-distinct-rebuild5.json');let f;
 if(fs.existsSync(fixturePath))f=JSON.parse(fs.readFileSync(fixturePath));else{
  f=await packingHistoryFixture(ds);f.size=5000;
  await ds.query(`INSERT INTO pkg_packing_records(code,shift_id,production_date,batches_json,grading_codes_json,total_eggs,total_boxes)
    SELECT $1||'-PERF-'||n,$2,'2026-01-02',$3::jsonb,$4::jsonb,50,2 FROM generate_series(1,$5::int) n`,[f.prefix,f.shiftId,JSON.stringify(f.outputs),JSON.stringify([f.prefix]),f.size]);
  await ds.query(`INSERT INTO inv_batches(batch_no,product_code,sku_code,spec_code,company_code,warehouse_code,location_code,qty,qty_available,packaging_batch_ref,source_type,egg_date)
    SELECT $1||'-PERF-B-'||n||'-'||g,$1,$2::jsonb->(g-1)->>'skuCode',$2::jsonb->(g-1)->>'specId',$3,$4,$5,CASE g WHEN 1 THEN 30 ELSE 20 END,CASE g WHEN 1 THEN 30 ELSE 20 END,$1||'-PERF-'||n,'PACKAGING','2026-01-02'
    FROM generate_series(1,$6::int) n CROSS JOIN generate_series(1,2) g`,[f.prefix,JSON.stringify(f.outputs),f.company,f.warehouse,f.location,f.size]);
  await ds.query(`INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no,sku_code,company_code,warehouse_code,location_code)
    SELECT batch_no,'PACKAGING_INBOUND',qty,packaging_batch_ref,sku_code,company_code,warehouse_code,location_code FROM inv_batches WHERE company_code=$1`,[f.company]);
  await ds.query(`INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status)
    SELECT $1||'-PERF-'||n,$2,$3,'2026-01-02',50,'RECEIVED' FROM generate_series(1,$4::int)n`,[f.prefix,f.house,f.shiftId,f.size]);
  await ds.query(`INSERT INTO pkg_grading_records(code,shift_id,production_date,idempotency_key,payload_hash,outputs_json,total_output)
    SELECT $1||'-PERF-'||n,$2,'2026-01-02',$1||'-PERF-'||n,'TEST','{}',50 FROM generate_series(1,$3::int)n`,[f.prefix,f.shiftId,f.size]);
  await ds.query(`INSERT INTO pkg_grading_source_links(grading_id,source_batch_id,input_qty) SELECT g.id,s.id,50 FROM pkg_grading_records g JOIN pkg_source_batches s ON s.batch_code=g.code WHERE g.shift_id=$1 AND g.code<>$2`,[f.shiftId,f.prefix]);
  await ds.query(`UPDATE pkg_packing_records SET grading_codes_json=jsonb_build_array(code) WHERE shift_id=$1 AND code<>$2`,[f.shiftId,f.prefix]);
  fs.writeFileSync(fixturePath,JSON.stringify(f,null,2));await ds.query('ANALYZE');
 }
 // Synthetic legacy evidence distribution, not an official stock movement test.
 await ds.query(`INSERT INTO pkg_handover_records(code,shift_id,packing_code,boxes_json,box_count,location,receiver,production_date)
 SELECT $1||'-PERF-H-'||n,$2,$1||'-PERF-'||n,'["TEST-BOX-A","TEST-BOX-B"]',CASE WHEN n<=1000 THEN 2 ELSE 1 END,$3,'TEST ONLY','2026-01-02' FROM generate_series(1,2000)n ON CONFLICT(code) DO NOTHING`,[f.prefix,f.shiftId,f.location]);
 const [org]=await ds.query(`INSERT INTO sys_organizations(org_code,org_name,org_type,company_code) VALUES($1,$1,'COMPANY',$1) ON CONFLICT(org_code) DO UPDATE SET org_name=EXCLUDED.org_name RETURNING id`,[f.company]);
 await ds.query('INSERT INTO sys_user_orgs(user_id,org_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[f.actor,org.id]);
 await ds.query('INSERT INTO sys_user_farm_scopes(user_id,farm_code) VALUES($1,$2) ON CONFLICT DO NOTHING',[f.actor,f.farm]);
 const candidates=await ds.query(`INSERT INTO sys_user(username,real_name,password_hash,status) SELECT $1||'-REC-'||n,$1||'-REC-'||n,'TEST-NON-LOGIN',1 FROM generate_series(1,5000)n ON CONFLICT(username) DO UPDATE SET real_name=EXCLUDED.real_name RETURNING user_id`,[f.prefix]);
 await ds.query('INSERT INTO sys_user_orgs(user_id,org_id) SELECT unnest($1::bigint[]),$2 ON CONFLICT DO NOTHING',[candidates.map(x=>x.user_id),org.id]);
 const create=conn=>{
  const repos=['SysDataScopeEntity','SysUserOrgEntity','SysUserProjectScopeEntity','SysUserWarehouseScopeEntity','SysUserFarmScopeEntity','SysOrganizationEntity'].map(n=>conn.getRepository(n));
  const scopes=new DataScopeService(...repos,{get:()=>undefined},{});
  const history=new PackagingHistoryService(conn.manager,scopes);
  const workflow=new PackagingHandoverService(history,new PackagingBoxService(),new PackagingWorkflowPolicy(),{});
  return {history,workflow,controller:new PackagingHistoryController(history,workflow),scopes};
 };
 const services=create(ds),svc=services.history;
 const realScope=await svc.scope(f.req);if(realScope.isGlobal||!realScope.allowedCompanyCodes.includes(f.company)||!realScope.allowedWarehouseCodes.includes(f.warehouse))throw Error('REAL_SCOPE_FIXTURE_MISMATCH');
 const [counts]=await ds.query(`SELECT (SELECT count(*)::int FROM pkg_packing_records WHERE shift_id=$1) records,(SELECT count(*)::int FROM inv_batches WHERE company_code=$2) inventory,(SELECT count(*)::int FROM inv_ledger WHERE company_code=$2) ledger,(SELECT count(*)::int FROM pkg_grading_records WHERE shift_id=$1) grading,(SELECT count(*)::int FROM sys_user WHERE username LIKE $3) recipients`,[f.shiftId,f.company,f.prefix+'-REC-%']);
 if(counts.records!==5001||counts.inventory!==10000||counts.ledger!==10000||counts.grading!==5001||counts.recipients!==5000)throw Error('PERF_FIXTURE_COUNTS_MISMATCH '+JSON.stringify(counts));
 const [registered]=await ds.query('SELECT count(*)::int n FROM pkg_packing_boxes WHERE packing_id=$1',[f.packingId]);
 if(!registered.n){const policy=new PackagingWorkflowPolicy();policy.get=async()=>({version:'PERF-TEST',R:true,B:true,P:true,V:true,H:true,Q:true,encodingVersion:'TEST-NON-BUSINESS-v1',receiptMode:'C'});
 const writer=new PackagingHandoverService(svc,new PackagingBoxService(),policy,{});const d=await writer.detail(f.prefix,f.req);
 await writer.command('REGISTER',f.prefix,require('node:crypto').randomUUID(),{expectedRevision:d.revision,registrationKind:'FIRST_LABEL_CONFIRMED',reason:'TEST software fixture',items:f.outputs.map((_,outputOrdinal)=>({outputOrdinal,boxOrdinal:1,declaration:'TEST only'}))},f.req);}
 const full=await services.workflow.detail(f.prefix,f.req);if(full.boxes.length!==2||!full.events.some(e=>e.event_type==='REGISTRATION'))throw Error('WORKFLOW_DETAIL_FIXTURE_MISMATCH');
 const probe=await svc.list({companyCode:f.company,pageSize:'25'},f.req);if(probe.totalMatching!==5001||probe.items.length!==25)throw Error('PERF_RESULT_MISMATCH');
 if((await services.workflow.detail(f.prefix+'-PERF-2500',f.req)).record.code!==f.prefix+'-PERF-2500')throw Error('PERF_DETAIL_MISMATCH');
 if(process.argv.includes('--plan')){const plans={};for(const report of [false,true]){let captured;await svc.rows(realScope,{query:async(sql,params)=>{captured={sql,params};return []; }},undefined,{q:{companyCode:f.company,dateFrom:'2026-01-02',dateTo:'2026-01-02'},size:26,cursor:null,report});await ds.query('SET jit=off');plans[report?'report':'list']=await ds.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+captured.sql,captured.params);}const file=path.join(dir,'performance-plan-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify(plans,null,2));console.log('PLAN',file);return;}
 const stateCounts={};for(const state of ['PENDING','COMMITTED','HANDOVER_ONLY','INVENTORY_ONLY'])stateCounts[state]=(await svc.list({companyCode:f.company,handoverState:state,pageSize:'25'},f.req)).totalMatching;if(JSON.stringify(Object.values(stateCounts))!==JSON.stringify([1,1000,1000,3000]))throw Error('PERF_STATE_MISMATCH '+JSON.stringify(stateCounts));
 const operationsFor=s=>({list:()=>s.history.list({companyCode:f.company,pageSize:'25'},f.req),detail:()=>s.workflow.detail(f.prefix,f.req),committedDetail:()=>s.workflow.detail(f.prefix+'-PERF-500',f.req),report:()=>s.history.summary({dateFrom:'2026-01-02',dateTo:'2026-01-02',aggregation:'DAY'},f.req),recipients:()=>s.controller.candidates(f.prefix,{kind:'RECEIVER',warehouseCode:f.warehouse,paged:'1',limit:'50',search:f.prefix+'-REC-'},f.req)});const operations=operationsFor(services);
 const result={identity,verifiedDatabaseCounts:counts,stateCounts,realDataScope:realScope,fixture:{records:f.size+1,inventory:2*f.size,ledger:2*f.size,distribution:'5000 distinct grading/source chains in one dense day and site; two groups each; 1 registered PENDING, 1000 legacy COMMITTED, 1000 partial HANDOVER_ONLY, 3000 INVENTORY_ONLY; other companies remain scope-hidden background; synthetic TEST, no physical facts'},environment:{node:process.version,cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem(),concurrency:1},cache:'5 fresh datasource/service sessions per endpoint (cold session/plan, connection setup excluded), 20 warm reads; PG shared/OS caches remain warm, NOT cold disk',measurements:{}};
 for(const [name,run] of Object.entries(operations)){
  console.log('PERF_START',name,new Date().toISOString());
  const samples=[];for(let i=0;i<21;i++){const start=performance.now();await run();samples.push(performance.now()-start);}
  const cold=[];for(let i=0;i<5;i++){const fresh=new DataSource({...ds.options});try{await fresh.initialize();const s=create(fresh);s.scopes.invalidate(f.actor);const start=performance.now();await operationsFor(s)[name]();cold.push(performance.now()-start);}finally{if(fresh.isInitialized)await fresh.destroy();}}
  const warm=samples.slice(1).sort((a,b)=>a-b);result.measurements[name]={coldSessionSamplesMs:cold,coldSessionP95Ms:[...cold].sort((a,b)=>a-b)[4],firstReadMs:samples[0],warmSamples:20,p95Ms:warm[Math.ceil(.95*warm.length)-1],samplesMs:samples};console.log('PERF_DONE',name,JSON.stringify({firstReadMs:samples[0],p95Ms:result.measurements[name].p95Ms,coldSessionP95Ms:result.measurements[name].coldSessionP95Ms}));
 }
 result.indexes=await ds.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('pkg_packing_records','inv_batches','inv_ledger','pkg_grading_source_links','pkg_packing_events','pkg_handover_records') ORDER BY tablename,indexname");
 result.passed=Object.values(result.measurements).every(x=>x.p95Ms<=1000&&x.firstReadMs<=1000&&x.coldSessionP95Ms<=1000);
 const file=path.join(dir,'performance-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify(result,null,2));console.log(JSON.stringify({file,measurements:result.measurements,passed:result.passed}));if(!result.passed)process.exitCode=1;
 }catch(e){console.log('PERFORMANCE_FAILED',e.code||e.name,e.message);process.exitCode=1;}finally{if(ds.isInitialized)await ds.destroy();}})();
