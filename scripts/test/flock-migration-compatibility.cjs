/* Owned loopback fixture only. Never imports the application data source or .env. */
const {createRequire}=require('node:module');
const {readFileSync,readdirSync}=require('node:fs');
const {resolve}=require('node:path');
const {spawnSync}=require('node:child_process');
const apiRequire=createRequire(resolve('apps/api/package.json'));
const {DataSource}=apiRequire('typeorm');
(async()=>{
 const address=process.env.FLOCK_COMPAT_PG_URL;if(!address)throw Error('FLOCK_COMPAT_PG_URL required');
 const u=new URL(address);if(u.hostname!=='127.0.0.1'||u.pathname!=='/phoenix_flock_compat')throw Error('Owned compatibility fixture required');
 const container=process.env.FLOCK_COMPAT_CONTAINER||'phoenix-flock-ledger-20261117';
 const binding=spawnSync('docker',['inspect','--format','{{(index (index .NetworkSettings.Ports \"5432/tcp\") 0).HostIp}}:{{(index (index .NetworkSettings.Ports \"5432/tcp\") 0).HostPort}}',container],{encoding:'utf8'});
 if(binding.status!==0||binding.stdout.trim()!=='127.0.0.1:'+u.port)throw Error('Fixture URL does not match the owned Docker loopback binding');
 const ds=await new DataSource({type:'postgres',url:address,synchronize:false,migrationsRun:false,installExtensions:false}).initialize();
 try {
  if(Number((await ds.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema='public'"))[0].n)!==0)throw Error('An empty owned compatibility fixture is required; this script never resets an existing database');
  const sqlFiles=[...readdirSync('apps/api/ddl').filter(x=>x.endsWith('.sql')).sort().map(x=>'apps/api/ddl/'+x),'apps/api/migrations/v3_schema_complete.sql',
   ...readdirSync('apps/api/migrations').filter(x=>/^2026.*\.sql$/.test(x)).sort().map(x=>'apps/api/migrations/'+x)];
  for(const file of sqlFiles){
   // Match psql migration behavior, including psql meta commands and explicit transactions.
   const r=spawnSync('docker',['exec','-i',process.env.FLOCK_COMPAT_CONTAINER||'phoenix-flock-ledger-20261117','psql','-U','postgres','-d','phoenix_flock_compat','-v','ON_ERROR_STOP=1'],{input:readFileSync(file),encoding:'utf8'});
   if(r.status!==0){console.error('Baseline failed:',file);console.error((r.stderr||'').split('\n').filter(x=>/ERROR:|DETAIL:/.test(x)).slice(0,3).join('\n'));throw Error('Frozen baseline install blocked');}
  }
  console.log('Frozen baseline SQL installed:',sqlFiles.length);
  const migrations=readdirSync('apps/api/dist/database/migrations').filter(x=>/^\d.*\.js$/.test(x)).sort();
  const q=ds.createQueryRunner();await q.connect();
  for(const file of migrations){
   const mod=require(resolve('apps/api/dist/database/migrations',file));const C=Object.values(mod).find(x=>typeof x==='function');if(!C)continue;
   try {await q.startTransaction();await new C().up(q);await q.commitTransaction();}
   catch(e){await q.rollbackTransaction();console.error('TS migration failed:',file,e.code||'',e.message);throw Error('TS upgrade blocked');}
  }
  console.log('TypeORM TS chain applied:',migrations.length);
  for(const table of ['brd_farms','brd_houses','brd_flocks','brd_daily_logs','brd_flock_documents','inv_flock_source_links'])if(!await q.hasTable(table))throw Error('Fresh installation missing '+table);
  for(const [table,col] of [['brd_farms','store_code'],['brd_flocks','store_code'],['brd_farms','location'],['brd_farms','manager'],['brd_farms','houses'],['brd_farms','capacity'],['brd_houses','max_capacity'],['brd_flocks','breed_code'],['brd_flocks','planned_elimination_date'],['brd_daily_logs','occupancy_id']])if(!await q.hasColumn(table,col))throw Error('Fresh installation missing '+table+'.'+col);
  console.log('Fresh lifecycle tables and required columns verified');
  const {FlockLifecycleService}=require(resolve('apps/api/dist/modules/farm/flock-lifecycle.service.js'));
  const {FarmService}=require(resolve('apps/api/dist/modules/farm/farm.service.js'));
  const {OrgOwnershipService}=require(resolve('apps/api/dist/modules/org/services/org-ownership.service.js'));
  await q.startTransaction();
  try {
   const [clock]=await q.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Singapore')::date::text AS day");
   await q.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_label_zh,status) VALUES('BRD_BREED','COMPAT_BREED','Compatibility fixture','ACTIVE') ON CONFLICT(dict_type,dict_code) DO NOTHING`);
   await q.query(`INSERT INTO brd_farms(farm_code,farm_name,company_code,mapped_site_code,status) VALUES('COMPAT_FARM','Owned fixture farm','COMPAT_COMPANY','COMPAT_SITE','ACTIVE');
     INSERT INTO brd_houses(house_code,house_name,farm_code,max_capacity,capacity,status) VALUES('COMPAT_HOUSE','Owned fixture house','COMPAT_FARM',1000,1000,'ACTIVE')`);
   await q.query(`INSERT INTO file_metadata(file_id,original_name,stored_name,storage_path,mime_type,size_bytes,checksum,module_code,owner_type,owner_id,company_code,store_code,uploaded_by,status,visibility)
    VALUES('FILE-compat-count','count.pdf','count.pdf','uploads/contracts/count.pdf','application/pdf',24,'fixture','FLOCK_LIFECYCLE','HOUSE','COMPAT_HOUSE','COMPAT_COMPANY','COMPAT_SITE','compat-maker','ACTIVE','PROTECTED')`);
   const lifecycle=new FlockLifecycleService(q.manager);const global={isGlobal:true,farmCode:null,siteCode:null};
   const maker={id:'compat-maker',admin:true},reviewer={id:'compat-reviewer',admin:true};
   let serial=0;
   const post=async body=>{let d=await lifecycle.create({sourceKey:'compat-'+(++serial),houseCode:'COMPAT_HOUSE',businessDate:clock.day,expectedVersion:0,reason:'owned compatibility fixture',responsible:'compat-maker',evidence:['FILE-compat-count'],...body},global,maker);
    d=await lifecycle.transition(d.id,'submit',0,global,maker);d=await lifecycle.transition(d.id,'approve',d.version,global,reviewer);return lifecycle.transition(d.id,'post',d.version,global,maker);};
   await post({kind:'CLEAN_START',expectedHouseVersion:0});await post({kind:'CLEAN_ACCEPT',expectedHouseVersion:0});
   const admitted=await post({kind:'ADMIT',sourceKind:'INTERNAL',sourceFarmCode:'COMPAT_FARM',sourceReceipt:'COMPAT-REAL-RECEIPT',breedCode:'COMPAT_BREED',placementAge:120,quantity:100,expectedHouseVersion:1});
   const grades=await q.query("SELECT grade_code FROM product_grades WHERE status='ACTIVE' AND is_saleable=true ORDER BY grade_code LIMIT 1");
   if(!grades.length)throw Error('Fresh installation has no ACTIVE saleable grade fixture');
   const farm=new FarmService(q.manager,new OrgOwnershipService(q.manager));
   const daily={house_code:'COMPAT_HOUSE',flock_no:admitted.flock_no,log_date:clock.day,shift:'DAILY',eggs_by_grade:{[grades[0].grade_code]:10}};
   await farm.submitBreedingDailyLog(daily,global);await farm.submitBreedingDailyLog(daily,global);
   await post({kind:'MORTALITY',flockNo:admitted.flock_no,quantity:3,disposalMethod:'fixture verified disposal',receiver:'compat-witness'});
   const [state]=await q.query(`SELECT f.current_qty,b.quantity,d.closing_qty,d.mortality_qty,(SELECT count(*)::int FROM brd_daily_logs WHERE house_code='COMPAT_HOUSE') AS reports
      FROM brd_flocks f JOIN brd_flock_balances b ON b.flock_no=f.flock_no JOIN brd_daily_logs d ON d.flock_no=f.flock_no WHERE f.flock_no=$1`,[admitted.flock_no]);
   if(Number(state.current_qty)!==97||Number(state.quantity)!==97||Number(state.closing_qty)!==97||Number(state.mortality_qty)!==3||state.reports!==1)throw Error('Fresh lifecycle/daily projection smoke failed');
   const [original]=await lifecycle.reports(global);
   await post({kind:'REPORT_CORRECTION',flockNo:admitted.flock_no,expectedVersion:1,dailyLogId:Number(original.id),expectedReportHash:original.report_hash,differenceReceipt:'COMPAT_SIGNED_REPORT_CORRECTION',correction:{eggsByGrade:{[grades[0].grade_code]:11},feedConsumed:null,waterConsumed:null,notes:'Signed actual correction'}});
   const [corrected]=await q.query('SELECT eggs_produced,closing_qty,feed_consumed,water_consumed FROM brd_daily_logs WHERE id=$1',[original.id]);
   if(corrected.eggs_produced!==11||Number(corrected.closing_qty)!==97||corrected.feed_consumed!==null||corrected.water_consumed!==null)throw Error('Fresh approved report correction failed');
   console.log('Fresh approved report correction preserves quantity 97 and unknown consumption');
   console.log('Fresh real service smoke passed: clean/admit, idempotent DAILY UPSERT, mortality/event/balance/report=97');
  } finally {await q.rollbackTransaction();}
  for(const name of ['FlockLifecycleLedger1794900000000','FlockProductionProvenance1794901000000','FlockActivitySources1794902000000','FlockReportCorrection1794903000000']){
   const file=migrations.find(f=>f.includes(name.replace(/\d+$/,'')));const C=require(resolve('apps/api/dist/database/migrations',file))[name];
   await new C().up(q);
  }
  console.log('Flock additive upgrade is idempotent');
  for(const prefix of ['1794903000000','1794902000000','1794901000000','1794900000000','1794899000000']){
   const file=migrations.find(f=>f.startsWith(prefix));const C=Object.values(require(resolve('apps/api/dist/database/migrations',file)))[0];await new C().down(q);
  }
  console.log('Unused flock installation reverted without removing historical business tables');
  await q.release();
 }finally{await ds.destroy();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
