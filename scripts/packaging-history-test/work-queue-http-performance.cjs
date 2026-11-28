// Real Nest/JWT HTTP benchmark against only the dedicated synthetic PG18 clone.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {fork}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const apiDeps=path.join(root,'apps/api/node_modules');
const artifacts=path.join(root,'artifacts/packaging-history-local');
const fixturePath=path.join(artifacts,'work-queue-performance-fixture.json');
const db={host:'127.0.0.1',port:55432,name:'packaging_queue_perf',user:'postgres'};
let apiPort=Number(process.env.QUEUE_HTTP_API_PORT||0);

function assertEnvironment(){
 const requested=new URL(process.env.PACKAGING_QUEUE_PERF_DATABASE_URL||'');
 if(process.env.NODE_ENV!=='test'||requested.protocol!=='postgresql:'
   ||!['127.0.0.1','localhost'].includes(requested.hostname)||Number(requested.port)!==db.port
   ||decodeURIComponent(requested.username)!==db.user||requested.password
   ||requested.pathname!=='/'+db.name||requested.search||requested.hash)
  throw Error('EXPLICIT_LOCAL_PACKAGING_QUEUE_PERF_DATABASE_REQUIRED');
}
function percentile(samples,fraction){
 const sorted=[...samples].sort((a,b)=>a-b);
 return sorted[Math.ceil(fraction*sorted.length)-1];
}
function sourceHashes(){
 return Object.fromEntries(['apps/api/src/modules/bff/packaging-work-queue.service.ts',
  'apps/api/src/modules/bff/packaging-history.service.ts',
  'apps/api/src/modules/sales-v2/services/initial-egg-inventory-route.ts'].map(file=>[
  file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),
 ]));
}
async function reserveLoopbackPort(){
 const net=require('node:net');
 const server=net.createServer();
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
 });
 const port=server.address().port;
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 return port;
}
function serve(){
 const net=require('node:net');
 const connect=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function(...args){
  let address=args[0];if(Array.isArray(address))address=address[0];
  const host=typeof address==='object'?address.host:typeof args[1]==='string'?args[1]:'localhost';
  const port=typeof address==='object'?address.port:address;
  if(!['127.0.0.1','localhost','::1'].includes(host||'localhost')||![db.port,apiPort].includes(Number(port)))
   throw Error('LOCAL_PERF_OUTBOUND_BLOCKED');
  return connect.apply(this,args);
 };
 const ts=require(path.join(apiDeps,'typescript'));
 require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(
  fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,
   experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,filename);
 require(path.join(apiDeps,'reflect-metadata'));
 (async()=>{
  const {NestFactory}=require(path.join(apiDeps,'@nestjs/core'));
  const config=require(path.join(apiDeps,'@nestjs/config')).ConfigModule;
  const configForRoot=config.forRoot;
  config.forRoot=function(options){return configForRoot.call(this,{...options,ignoreEnvFile:true});};
  const schedule=require(path.join(apiDeps,'@nestjs/schedule')).ScheduleModule;
  const scheduleForRoot=schedule.forRoot;
  schedule.forRoot=function(options){return scheduleForRoot.call(this,{...options,cronJobs:false,intervals:false,timeouts:false});};
  const {AppModule}=require(path.join(root,'apps/api/src/app.module.ts'));
  const app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});
  const ds=app.get(require(path.join(apiDeps,'typeorm')).DataSource);
  const [identity]=await ds.query("SELECT current_database() database,current_setting('server_version_num')::int version");
  if(identity.database!==db.name||identity.version<180000)throw Error('SYNTHETIC_PG18_CLONE_REQUIRED');
  await require(path.join(root,'apps/api/src/common/guards/menu-registry.service.ts')).hydrateMenuRegistry(ds.manager);
  await app.listen(apiPort,'127.0.0.1');
  process.stdout.write('QUEUE_HTTP_API_READY\n');
 })().catch(error=>{
  process.stderr.write('QUEUE_HTTP_API_FAILED '+error.name+' '+String(error.message).slice(0,260)+'\n');
  process.exit(1);
 });
}
async function waitForServer(child){
 let output='';
 child.stdout.on('data',chunk=>{output+=chunk.toString();});
 child.stderr.on('data',chunk=>{output+=chunk.toString();});
 for(let attempt=0;attempt<100;attempt++){
  if(output.includes('QUEUE_HTTP_API_READY'))return;
  if(output.includes('QUEUE_HTTP_API_FAILED')||child.exitCode!==null)throw Error('API_START_FAILED '+output.slice(-700));
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw Error('API_START_TIMEOUT '+output.slice(-500));
}
async function stopServer(child){
 if(!child||child.exitCode!==null)return;
 child.kill('SIGTERM');
 await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,10000))]);
 if(child.exitCode===null)child.kill('SIGKILL');
}
async function createAccount(ds,fixture){
 const suffix=crypto.randomUUID().replace(/-/g,'').slice(0,12);
 const username='TEST-QUEUE-HTTP-'+suffix,roleCode='TEST-QUEUE-HTTP-'+suffix;
 const runner=ds.createQueryRunner();
 await runner.connect();
 await runner.startTransaction();
 try{
  const [org]=await runner.query("SELECT id FROM sys_organizations WHERE org_code=$1 AND org_type='COMPANY'",[fixture.prefix+'-C']);
  if(!org)throw Error('FIXTURE_COMPANY_ORG_MISSING');
  const [user]=await runner.query("INSERT INTO sys_user(username,real_name,password_hash,status) VALUES($1,$1,'HTTP-BENCH-NO-PASSWORD',1) RETURNING user_id::text id,perms_version",[username]);
  const [role]=await runner.query("INSERT INTO sys_role(role_code,role_name_zh,role_type) VALUES($1,$1,'BUSINESS') RETURNING role_id id",[roleCode]);
  await runner.query('INSERT INTO sys_user_role(user_id,role_id,is_primary) VALUES($1,$2,true)',[user.id,role.id]);
  await runner.query("INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes) SELECT $1,menu_id,'V' FROM sys_menu WHERE menu_code='MENU_PKG_OP'",[role.id]);
  await runner.query("INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) VALUES($1,$2,'COMPANY')",[user.id,org.id]);
  await runner.query('INSERT INTO sys_user_farm_scopes(user_id,farm_code) VALUES($1,$2)',[user.id,fixture.farm]);
  await runner.query('INSERT INTO sys_user_warehouse_scopes(user_id,warehouse_code) VALUES($1,$2)',[user.id,fixture.warehouse]);
  const [currentUser]=await runner.query('SELECT perms_version FROM sys_user WHERE user_id=$1',[user.id]);
  await runner.commitTransaction();
  return {userId:user.id,roleId:role.id,username:username,roleCode:roleCode,permsVersion:Number(currentUser.perms_version||1)};
 }catch(error){
  await runner.rollbackTransaction();
  throw error;
 }finally{
  await runner.release();
 }
}
async function deleteAccount(ds,account){
 if(!account)return;
 await ds.query('DELETE FROM sys_user_farm_scopes WHERE user_id=$1',[account.userId]);
 await ds.query('DELETE FROM sys_user_warehouse_scopes WHERE user_id=$1',[account.userId]);
 await ds.query('DELETE FROM sys_user_orgs WHERE user_id=$1',[account.userId]);
 await ds.query('DELETE FROM sys_user_role WHERE user_id=$1',[account.userId]);
 await ds.query('DELETE FROM sys_role_menu_permission WHERE role_id=$1',[account.roleId]);
 await ds.query('DELETE FROM sys_user WHERE user_id=$1',[account.userId]);
 await ds.query('DELETE FROM sys_role WHERE role_id=$1',[account.roleId]);
}
async function getQueue(token,params){
 const query=new URLSearchParams(params),start=performance.now();
 const response=await fetch('http://127.0.0.1:'+apiPort+'/api/packaging/terminal/work-queue?'+query,
  {headers:{Authorization:'Bearer '+token}});
 const elapsed=performance.now()-start,body=await response.json();
 if(response.status!==200||body.code!==200||!body.data)
  throw Error('QUEUE_HTTP_'+response.status+'_'+String(body.message||body.error||'BAD_RESPONSE').slice(0,150));
 return {elapsed:elapsed,data:body.data};
}
async function measure(token,fixture,bucket,pageSize,nextPage,ds){
 const [shift]=await ds.query('UPDATE pkg_work_shifts SET status=$2 WHERE id=$1 RETURNING id',[fixture.shiftId,bucket==='CURRENT'?'OPEN':'CLOSED']);
 if(!shift)throw Error('FIXTURE_SHIFT_MISSING');
 const params={bucket:bucket,siteCode:fixture.farm,pageSize:String(pageSize)};
 if(bucket==='CURRENT')params.shiftId=fixture.shiftId;
 if(nextPage){
  const first=await getQueue(token,params);
  if(!first.data.nextCursor)throw Error(bucket+'_FIRST_PAGE_CURSOR_MISSING');
  params.cursor=first.data.nextCursor;
 }
 const samples=[];
 let counts={};
 for(let index=0;index<26;index++){
  const result=await getQueue(token,params);
  if(result.data.items.length!==pageSize)throw Error(bucket+'_PAGE_SIZE_MISMATCH');
  samples.push(result.elapsed);counts=result.data.counts;
 }
 return {samples:samples.length,httpRequestsPerPage:1,firstMs:Number(samples[0].toFixed(2)),
  p95Ms:Number(percentile(samples.slice(1),.95).toFixed(2)),
  p99Ms:Number(percentile(samples.slice(1),.99).toFixed(2)),responseCounts:counts};
}
async function main(){
 assertEnvironment();
 apiPort=await reserveLoopbackPort();
 if(!fs.existsSync(fixturePath))throw Error('PERFORMANCE_FIXTURE_MANIFEST_REQUIRED');
 const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
 if(!/^TEST-[a-f0-9]+$/.test(fixture.prefix)||fixture.syntheticScale!==5000)throw Error('EXPECTED_SYNTHETIC_5000_ROW_FIXTURE');
 fixture.warehouse=fixture.warehouse||fixture.prefix+'-W';
 const {DataSource}=require(path.join(apiDeps,'typeorm'));
 const ds=new DataSource({type:'postgres',host:db.host,port:db.port,username:db.user,database:db.name,entities:[],logging:false});
 await ds.initialize();
 const [identity]=await ds.query("SELECT current_database() database,current_setting('server_version_num')::int version");
 if(identity.database!==db.name||identity.version<180000)throw Error('SYNTHETIC_PG18_CLONE_REQUIRED');
 const [counts]=await ds.query("SELECT (SELECT count(*)::int FROM pkg_source_batches WHERE batch_code LIKE $1||'-WAIT-%') waiting_sources,(SELECT count(*)::int FROM pkg_grading_records WHERE code LIKE $1||'-GRADE-%') gradings,(SELECT count(*)::int FROM pkg_packing_records WHERE code LIKE $1||'-PACK-%') packings,(SELECT count(*)::int FROM pkg_handover_records WHERE code LIKE $1||'-PARTIAL-%') partial_handovers",[fixture.prefix]);
 if(counts.waiting_sources!==5000||counts.gradings!==5000||counts.packings!==5000||counts.partial_handovers!==2000)throw Error('SYNTHETIC_SCALE_FIXTURE_MISMATCH');
 let account,child;
 try{
  account=await createAccount(ds,fixture);
  const jwt=require(path.join(apiDeps,'jsonwebtoken')),secret=crypto.randomBytes(48).toString('hex');
  const token=jwt.sign({sub:account.userId,userId:account.userId,username:account.username,real_name:account.username,
   role:account.roleCode,roles:[account.roleCode],permissions:['MENU_PKG_OP:V'],store_code:'ALL',locale:'zh-CN',
   perms_version:account.permsVersion},secret,{expiresIn:'1h'});
  const env={PATH:process.env.PATH||'',TZ:'UTC',NODE_PATH:apiDeps,NODE_ENV:'test',DB_HOST:db.host,DB_PORT:String(db.port),
   DB_USER:db.user,DB_NAME:db.name,DB_PASSWORD:'',JWT_SECRET:secret,ENABLE_DEV_LOGIN:'false',QUEUE_HTTP_API_PORT:String(apiPort)};
  child=fork(__filename,['--serve'],{env:env,stdio:['ignore','pipe','pipe','ipc']});
  await waitForServer(child);
  const operations=[['current-first-25','CURRENT',25,false],['current-next-25','CURRENT',25,true],
   ['carryover-first-25','CARRYOVER',25,false],['carryover-next-25','CARRYOVER',25,true],
   ['review-first-25','REVIEW',25,false],['review-next-25','REVIEW',25,true],['carryover-first-100','CARRYOVER',100,false]];
  const sourceBefore=sourceHashes();
  const measurements={};
  for(const operation of operations){
   measurements[operation[0]]=await measure(token,fixture,operation[1],operation[2],operation[3],ds);
  }
  await ds.query("UPDATE pkg_work_shifts SET status='CLOSED' WHERE id=$1",[fixture.shiftId]);
  const sourceAfter=sourceHashes();
  const sourceUnchanged=JSON.stringify(sourceBefore)===JSON.stringify(sourceAfter);
  const passed=sourceUnchanged&&Object.values(measurements).every(row=>row.p95Ms<=1000);
  const result={generatedAt:new Date().toISOString(),environment:{database:identity.database,postgresVersion:identity.version,
   syntheticScale:fixture.syntheticScale,host:db.host,concurrency:1,samplesPerOperation:26,excludedWarmupSamples:1,
   cacheState:'warm local PostgreSQL and application caches'},
   measuredThrough:'real AppModule HTTP, JWT strategy, MenuGuard, DataScope and queue SQL',
   thresholdP95Ms:1000,fixture:{prefix:fixture.prefix,farm:fixture.farm,shiftId:fixture.shiftId,counts:counts},
   sourceBefore,sourceAfter,sourceUnchanged,measurements,passed};
  fs.mkdirSync(artifacts,{recursive:true});
  const output=path.join(artifacts,'work-queue-http-performance-'+Date.now()+'.json');
  fs.writeFileSync(output,JSON.stringify(result,null,2));
  process.stdout.write(JSON.stringify({output:output,passed:passed,measurements:measurements},null,2)+'\n');
  if(!passed)process.exitCode=2;
 }finally{
  await stopServer(child);
  await deleteAccount(ds,account);
  await ds.destroy();
 }
}
if(process.argv.includes('--serve'))serve();
else main().catch(error=>{
 process.stderr.write('QUEUE_HTTP_PERF_FAILED '+error.name+' '+String(error.message).replace(/password|token|secret|credential/gi,'[REDACTED]').slice(0,400)+'\n');
 process.exitCode=1;
});
