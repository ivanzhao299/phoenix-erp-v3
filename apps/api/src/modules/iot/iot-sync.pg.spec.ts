/** Real IoT service, native fetch, independent provider and original owned PG.
 * Direct method fixture only: not startup/schema-preflight or production proof. */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fork,ChildProcess,execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {DataSource,QueryRunner} from 'typeorm';
import {Logger} from '@nestjs/common';
import {IotSyncService} from './iot-sync.service';
import {CronMonitorService} from '../system-monitor/services/cron-monitor.service';
import {SysAlertsService} from '../system-monitor/services/sys-alerts.service';
import {BackgroundManifestReader} from '../background-control/background-manifest.reader';
import {BackgroundLockBackend} from '../background-control/background-lock.backend';
import {BackgroundTaskService} from '../background-control/background-task.service';
import {BackgroundManifest} from '../background-control/background-control.types';
import {ownedConnection,inspectOwnedPg} from '../../test-fixtures/owned-background-pg';

type SinkEvent={index:number;kind:string;requestKind:string;operationId:string;status?:number;responseSha256?:string};
type Sink={events:SinkEvent[];fatal:boolean;pendingRequests:number;heldResponses:number;journalSha256:string};
type Reading={erp_house_code:string;property_code:string;value:string;collect_time:string};
type Rows={snapshot:Reading[];history:Reading[];alertCount:number;systemAlertCount:number};
type Scenario={id:string;houseId:number;property:string;reading:number;collectTime:number;hold:boolean};
const url=process.env.BACKGROUND_TEST_PG_URL;
const digest=(input:string|Buffer)=>createHash('sha256').update(input).digest('hex');

(url?describe:describe.skip)('Actual isolated IoT sends, commits and drain',()=>{
 const owner=randomBytes(16).toString('hex');
 const cases:Scenario[]=Array.from({length:5},(_,i)=>({id:String(i+1).repeat(32),houseId:i+1,property:'fixture_temperature',reading:23.5,collectTime:1792000000000+i*3600000,hold:i===4}));
 const observations:unknown[]=[],cleanupFailures:string[]=[],ownedWork=new Set<Promise<unknown>>();
 let admin:DataSource,db:DataSource,coordinator:QueryRunner,background:BackgroundTaskService;
 let child:ChildProcess,joined:Promise<{code:number|null;signal:NodeJS.Signals|null}>,directory:string,port:number,pgMajor:number;
 let pgPin:ReturnType<typeof inspectOwnedPg>,closed=false,closing=false,lost=false,finalHash:string|undefined,caseStartIndex=0;
 const pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
 const manifest:BackgroundManifest={protocolVersion:1,owner:'iot-pg-'+owner,generation:1,phase:'FENCED',targetSha:'a'.repeat(40),participants:[]};
 async function rpc(operation:string,value:object={}){
  const id=randomBytes(16).toString('hex');let timer:NodeJS.Timeout|undefined;
  try{
   const result=await new Promise<any>((resolve,reject)=>{
    pending.set(id,{resolve,reject});timer=setTimeout(()=>reject(Error('OWNED_IOT_RPC_TIMEOUT')),5000);
    child.send({id,operation,value},error=>{if(error)reject(Error('OWNED_IOT_RPC_SEND_FAILED'));});
   });
   if(operation==='SNAPSHOT')finalHash=result.journalSha256;return result;
  }finally{clearTimeout(timer);pending.delete(id);}
 }
 function newService(scenario:Scenario){
  const alerts=new SysAlertsService(db),service=new IotSyncService(db.manager,new CronMonitorService(db,alerts),alerts,background);
  // Write known test-only fields before invoking any lifecycle/operation. Never
  // read their original values, mock fetch or alter production endpoint policy.
  Object.assign(service,{API_BASE:`http://127.0.0.1:${port}`,APP_ID:'dummy-'+scenario.id,APP_SECRET:'test-only-'+scenario.id,accessToken:null,expireTime:0});
  return service;
 }
 function run(service:IotSyncService){
  const work=service.syncAllRealtime();ownedWork.add(work);
  void work.then(()=>ownedWork.delete(work),()=>ownedWork.delete(work));return work;
 }
 async function seed(index:number){
  const scenario=cases[index];
  const before:Sink=await rpc('SNAPSHOT');expect(before.fatal).toBe(false);expect(before.pendingRequests).toBe(0);expect(before.heldResponses).toBe(0);caseStartIndex=before.events.length;
  await db.query("INSERT INTO mon_house_device_mapping VALUES($1,$2,'ACTIVE')",['fixture-house',scenario.houseId]);
  await db.query("INSERT INTO mon_device_property_dict(property_code,name_zh,unit,system_category,metric_type,display_level) VALUES($1,'fixture','C','fixture','continuous',1)",[scenario.property]);
  return {scenario,service:newService(scenario)};
 }
 async function actualRows():Promise<Rows>{
  const fields='erp_house_code,property_code,value::text,collect_time::text';
  return {snapshot:await db.query(`SELECT ${fields} FROM mon_device_realtime_snapshot ORDER BY property_code`),history:await db.query(`SELECT ${fields} FROM mon_device_property_history ORDER BY property_code`),
   alertCount:Number((await db.query('SELECT count(*) FROM mon_device_alert_event'))[0].count),systemAlertCount:Number((await db.query('SELECT count(*) FROM sys_alerts'))[0].count)};
 }
 function evaluate(sink:Sink,rows:Rows,scenario:Scenario){
  const delta=sink.events.slice(caseStartIndex),events=delta.filter(event=>event.operationId===scenario.id);
  const expected=[{erp_house_code:'fixture-house',property_code:scenario.property,value:String(scenario.reading),collect_time:String(scenario.collectTime)}];
  const response=JSON.stringify({success:true,data:[{propertys:[{code:scenario.property,value:scenario.reading,lastUpdateTime:scenario.collectTime}]}]});
  return sink.fatal===false&&sink.pendingRequests===0&&sink.heldResponses===0&&events.length===4&&delta.length===events.length
   &&['AUTH','DATA'].every(kind=>events.filter(event=>event.kind==='RECEIVED'&&event.requestKind===kind).length===1&&events.filter(event=>event.kind==='RESPONSE_COMMITTED'&&event.requestKind===kind&&event.status===200).length===1)
   &&events.find(event=>event.kind==='RESPONSE_COMMITTED'&&event.requestKind==='DATA')?.responseSha256===digest(response)
   &&JSON.stringify(rows.snapshot)===JSON.stringify(expected)&&JSON.stringify(rows.history)===JSON.stringify(expected)&&rows.alertCount===0&&rows.systemAlertCount===0?'RECONCILED_ISOLATED_OPERATION':'HOLD';
 }
 async function recordScenario(name:string,scenario:Scenario,expected:string){
  const sink:Sink=await rpc('SNAPSHOT'),rows=await actualRows(),verdict=evaluate(sink,rows,scenario);
  expect(verdict).toBe(expected);return {rows,receipt:{scenario:name,operationId:scenario.id,verdict,rows,journalSha256:sink.journalSha256}};
 }
 beforeAll(async()=>{
  const connection=ownedConnection(url),fixturePort=String(connection.port);
  pgPin=inspectOwnedPg(fixturePort,process.env.IOT_TEST_PG_CONTAINER);
  execFileSync('/usr/bin/git',['diff','--quiet','HEAD','--','src/modules/iot/iot-sync.service.ts'],{stdio:['ignore','ignore','pipe']});
  if(process.env.IOT_DEMO_FALLBACK!==undefined)throw Error('REFUSE_AMBIENT_IOT_FALLBACK');
  const base=path.resolve(process.cwd(),'../../artifacts/maintenance-iot');fs.mkdirSync(base,{recursive:true,mode:0o700});
  directory=fs.mkdtempSync(path.join(base,'owned-'));fs.chmodSync(directory,0o700);
  child=fork(path.resolve(process.cwd(),'../../scripts/ci/maintenance-iot-provider.fixture.mjs'),[],{execArgv:[],env:{PATH:'/usr/bin:/bin',OWNED_IOT_PROVIDER:'SYNTHETIC_LOOPBACK_ONLY'},stdio:['ignore','ignore','ignore','ipc']});
  joined=new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;if(!closing)lost=true;for(const item of pending.values())item.reject(Error('ORIGINAL_IOT_PROVIDER_CLOSED'));resolve({code,signal});}));
  child.on('error',()=>{lost=true;for(const item of pending.values())item.reject(Error('ORIGINAL_IOT_PROVIDER_ERROR'));});
  child.on('message',(message:any)=>{const item=pending.get(message?.id);if(item){if(message.ok===true)item.resolve(message.value);else item.reject(Error('OWNED_IOT_PROVIDER_REFUSED'));}});
  const ready=await rpc('INIT',{directory,owner,cases});port=ready.port;
  for(const name of ['log','debug','warn','error'] as const)jest.spyOn(Logger.prototype,name).mockImplementation(()=>undefined);
  admin=await new DataSource(connection).initialize();
  pgMajor=Math.floor(Number((await admin.query('SHOW server_version_num'))[0].server_version_num)/10000);expect(pgMajor).toBe(fixturePort==='56416'?16:18);
  expect((await admin.query('SELECT current_database() AS database,current_user AS username,host(inet_server_addr()) AS address,inet_server_port() AS port'))[0]).toEqual({database:'fence_test',username:'fence_fixture',address:pgPin.serverAddress,port:5432});
  expect(inspectOwnedPg(fixturePort,process.env.IOT_TEST_PG_CONTAINER)).toEqual(pgPin);
  const schema='iot_'+owner;await admin.query(`CREATE SCHEMA ${schema}`);
  db=await new DataSource({...connection,extra:{options:`-c search_path=${schema}`}}).initialize();
  await db.query(`CREATE TABLE mon_house_device_mapping(erp_house_code text,vendor_house_id int,status text);
   CREATE TABLE mon_device_property_dict(property_code text PRIMARY KEY,name_zh text,unit text,system_category text,metric_type text,display_level int,ui_component_type text,threshold_high numeric,threshold_low numeric);
   CREATE TABLE mon_device_realtime_snapshot(id uuid,erp_house_code text,property_code text,value numeric,is_alarm int,collect_time bigint,created_at timestamptz,updated_at timestamptz,UNIQUE(erp_house_code,property_code));
   CREATE TABLE mon_device_property_history(id uuid,erp_house_code text,property_code text,value numeric,collect_time bigint,log_date date,created_at timestamptz);
   CREATE TABLE mon_device_alert_event(id bigserial,erp_house_code text,property_code text,property_name text,alert_type text,current_val numeric,threshold_val numeric,unit text,status text,alert_no text,triggered_at bigint,created_at timestamptz,updated_at timestamptz,resolve_note text,resolved_at timestamptz);
   CREATE TABLE sys_alerts(id bigserial,alert_type text,severity text,title text,detail jsonb,related_path text,resolved boolean DEFAULT false,created_at timestamptz DEFAULT now());`);
  const reader=new BackgroundManifestReader();jest.spyOn(reader,'read').mockImplementation(()=>reader.validate(manifest));
  background=new BackgroundTaskService(reader,new BackgroundLockBackend(db));
  manifest.participants=[{bootId:background.identity.bootId,containerId:'f'.repeat(64),revision:manifest.targetSha,allowedKinds:['LOCAL','EXTERNAL_READ']}];manifest.generation++;
  await background.onModuleInit();manifest.phase='OPEN';manifest.generation++;
  coordinator=db.createQueryRunner();await coordinator.connect();
 },30000);
 afterEach(async()=>{
  const errors:string[]=[];
  if(ownedWork.size){
   errors.push('OWNED_WORK_UNSETTLED_AT_CASE_END');
   try{
    const sink:Sink=await rpc('SNAPSHOT');
    for(const scenario of cases.filter(value=>value.hold))if(sink.events.some(event=>event.operationId===scenario.id&&event.kind==='RECEIVED'&&event.requestKind==='DATA')&&!sink.events.some(event=>event.operationId===scenario.id&&event.kind==='RESPONSE_COMMITTED'&&event.requestKind==='DATA'))await rpc('RELEASE',{operationId:scenario.id});
    let timer:NodeJS.Timeout|undefined;
    try{await Promise.race([Promise.allSettled([...ownedWork]),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('OWNED_WORK_SETTLEMENT_TIMEOUT')),3000);})]);}finally{clearTimeout(timer);}
   }catch{errors.push('OWNED_WORK_SETTLEMENT_UNVERIFIED');}
  }
  try{await coordinator?.query('SELECT pg_advisory_unlock_all()');}catch{errors.push('COORDINATOR_UNLOCK');}
  manifest.phase='OPEN';manifest.generation++;
  if(ownedWork.size===0){try{await db?.query('ALTER TABLE mon_device_property_history DROP CONSTRAINT IF EXISTS fixture_reject_history;TRUNCATE mon_house_device_mapping,mon_device_property_dict,mon_device_realtime_snapshot,mon_device_property_history,mon_device_alert_event,sys_alerts;');}catch{errors.push('DATABASE_RESET');}}
  else errors.push('DATABASE_RESET_REFUSED_WHILE_WORK_UNSETTLED');
  cleanupFailures.push(...errors);expect(errors).toEqual([]);
 });
 afterAll(async()=>{
  let exit:{code:number|null;signal:NodeJS.Signals|null}|undefined,closeConfirmed=false,closedHash:string|undefined;
  const attempt=async(code:string,action:()=>unknown)=>{try{await action();}catch{cleanupFailures.push(code);}};
  const join=async()=>{let timer:NodeJS.Timeout|undefined;try{return await Promise.race([joined,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('ORIGINAL_IOT_JOIN_TIMEOUT')),3000);})]);}finally{clearTimeout(timer);}};
  try{
   if(child){
    if(!closed){closing=true;await attempt('PROTECTED_CLOSE',async()=>{const value=await rpc('CLOSE');expect(value.originalListenerClosed).toBe(true);expect(value.journalSha256).toBe(finalHash);closedHash=value.journalSha256;closeConfirmed=true;});}
    else cleanupFailures.push('ORIGINAL_PROVIDER_CLOSED_BEFORE_PROTECTED_CLOSE');
    await attempt('ORIGINAL_PROVIDER_JOIN',async()=>{exit=await join();expect(exit).toEqual({code:0,signal:null});});
    if(!closed&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await attempt('OWNED_PROVIDER_FORCED_JOIN',join);}
    if(!closeConfirmed||lost||exit?.code!==0||exit.signal!==null||!finalHash||closedHash!==finalHash)cleanupFailures.push('ORIGINAL_PROVIDER_COMPLETION_UNVERIFIED');
   }
   await attempt('BACKGROUND_SHUTDOWN',()=>background?.shutdown(2000));
   await attempt('COORDINATOR_RELEASE',()=>coordinator?.release());
   await attempt('DATABASE_POOL_CLOSE',()=>db?.destroy());
   await attempt('ADMIN_POOL_CLOSE',()=>admin?.destroy());
   if(directory)fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({fixtureOnly:true,productionAuthority:false,scope:'ONE_ISOLATED_IOT_OPERATION_NOT_COMPLETE_FACTORY',fullFactory:false,startupLifecycle:'NOT_RUN',manifestAuthority:'SYNTHETIC_TEST_ONLY',
    pgMajor,databaseRuntime:pgPin,originalProviderPid:child?.pid,originalProviderExit:exit,closeConfirmed,finalHash,
    acceptance:observations.length===5&&!cleanupFailures.length?'PASS_ISOLATED_DOMAIN_ONLY':'HOLD',cleanupFailures,observations,
    serviceGitBlob:execFileSync('/usr/bin/git',['rev-parse','HEAD:apps/api/src/modules/iot/iot-sync.service.ts'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),
    testSourceSha256:digest(fs.readFileSync(__filename)),providerSourceSha256:digest(fs.readFileSync(path.resolve(process.cwd(),'../../scripts/ci/maintenance-iot-provider.fixture.mjs')))},null,2),{mode:0o600});
  }finally{jest.restoreAllMocks();}
  expect(cleanupFailures).toEqual([]);
 });
 it('reconciles actual auth/data HTTP responses with both committed IoT tables',async()=>{
  const {service,scenario}=await seed(0);expect(await run(service)).toEqual({successHouses:1,totalUpdated:1,error:null});
  const {receipt}=await recordScenario('ACTUAL_PROVIDER_AND_BOTH_COMMITS',scenario,'RECONCILED_ISOLATED_OPERATION');observations.push(receipt);
 });
 it('holds on actual history CHECK rejection even when real service reports success',async()=>{
  const {service,scenario}=await seed(1);await db.query("ALTER TABLE mon_device_property_history ADD CONSTRAINT fixture_reject_history CHECK(property_code<>'fixture_temperature')");
  expect(await run(service)).toEqual({successHouses:1,totalUpdated:1,error:null});
  const {rows,receipt}=await recordScenario('ACTUAL_HISTORY_COMMIT_FAILED_AFTER_SNAPSHOT',scenario,'HOLD');expect(rows.snapshot).toHaveLength(1);expect(rows.history).toEqual([]);observations.push(receipt);
 });
 it('holds on an extra actual history row outside the frozen operation',async()=>{
  const {service,scenario}=await seed(2);await run(service);
  await db.query("INSERT INTO mon_device_property_history VALUES(gen_random_uuid(),'fixture-house','fixture_extra',99,$1,'2026-10-14',now())",[scenario.collectTime]);
  const {rows,receipt}=await recordScenario('EXTRA_DATABASE_COMMIT',scenario,'HOLD');expect(rows.history).toHaveLength(2);observations.push(receipt);
 });
 it('does not mistake history hour dedupe for exactly one external operation',async()=>{
  // Two real isolated service instances avoid changing the production per-instance
  // rate limiter. This models repeated admission, not shared token-cache behavior.
  const {service,scenario}=await seed(3);await run(service);await run(newService(scenario));
  const {rows,receipt}=await recordScenario('DUPLICATE_EXTERNAL_FETCH_WITH_HISTORY_DEDUPE',scenario,'HOLD');expect(rows.snapshot).toHaveLength(1);expect(rows.history).toHaveLength(1);observations.push(receipt);
 });
 it('retains real execution ownership until the actual provider response and commits settle',async()=>{
  const {service,scenario}=await seed(4),work=run(service);const deadline=Date.now()+5000;
  while(true){const value:Sink=await rpc('SNAPSHOT');if(value.heldResponses===1)break;if(Date.now()>=deadline)throw Error('ACTUAL_PROVIDER_REQUEST_NOT_OBSERVED');await new Promise(resolve=>setTimeout(resolve,10));}
  expect((await coordinator.query('SELECT pg_try_advisory_lock(17455,2) AS ok'))[0].ok).toBe(false);
  expect((await coordinator.query('SELECT pg_try_advisory_lock(17455,1) AS ok'))[0].ok).toBe(true);
  await expect(run(service)).rejects.toThrow('ADMISSION_GATE_FENCED');
  await rpc('RELEASE',{operationId:scenario.id});expect(await work).toEqual({successHouses:1,totalUpdated:1,error:null});
  expect((await coordinator.query('SELECT pg_try_advisory_lock(17455,2) AS ok'))[0].ok).toBe(true);
  const {receipt}=await recordScenario('ACTUAL_IO_AND_COMMIT_DRAIN',scenario,'RECONCILED_ISOLATED_OPERATION');observations.push(receipt);
 },15000);
});
