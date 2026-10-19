/** Real services, web-push TLS and owned PG; synthetic manifest. One isolated
 * business domain, never full-factory or production reconciliation evidence. */
import 'reflect-metadata';
import * as fs from 'node:fs';import * as path from 'node:path';import * as https from 'node:https';
import {fork,ChildProcess,execFileSync} from 'node:child_process';
import {createECDH,randomBytes,createHash} from 'node:crypto';import {isIP} from 'node:net';
import {DataSource,QueryRunner} from 'typeorm';import {ClsService} from 'nestjs-cls';
import {Logger} from '@nestjs/common';import * as webpush from 'web-push';
import {NotificationDispatcherService} from './notification-dispatcher.service';
import {PushNotificationService} from './push-notification.service';
import {BackgroundManifestReader} from '../background-control/background-manifest.reader';
import {BackgroundLockBackend} from '../background-control/background-lock.backend';
import {BackgroundTaskService} from '../background-control/background-task.service';
import {BackgroundManifest} from '../background-control/background-control.types';
const url=process.env.BACKGROUND_TEST_PG_URL;
function ownedConnection(value:string|undefined){
 let target:URL;try{target=new URL(value||'');}catch{throw Error('OWNED_LOOPBACK_POSTGRES_REQUIRED');}
 if(!['postgres:','postgresql:'].includes(target.protocol)||target.hostname!=='127.0.0.1'||target.pathname!=='/fence_test'||target.username!=='fence_fixture'||!['56416','56418'].includes(target.port)||target.search||target.hash||target.password)throw Error('OWNED_LOOPBACK_POSTGRES_REQUIRED');
 return {type:'postgres' as const,host:'127.0.0.1',port:Number(target.port),username:'fence_fixture',database:'fence_test',ssl:false as const,synchronize:false,migrationsRun:false,installExtensions:false};
}
function requireOriginalSinkCompletion(input:{closeConfirmed:boolean;sinkLost:boolean;exit:{code:number|null;signal:NodeJS.Signals|null}|undefined;finalHash:string|undefined;closedHash:string|undefined}){
 if(!input.closeConfirmed||input.sinkLost||input.exit?.code!==0||input.exit?.signal!==null||!input.finalHash||input.closedHash!==input.finalHash)throw Error('ORIGINAL_TLS_SINK_COMPLETION_UNVERIFIED');
}
describe('Notification fixture connection rejects redirection before any IO',()=>{
 for(const [name,value]of [
  ['query host','postgresql://fence_fixture@127.0.0.1:56416/fence_test?host=unapproved.invalid'],
  ['query user','postgresql://fence_fixture@127.0.0.1:56416/fence_test?user=other'],
  ['fragment','postgresql://fence_fixture@127.0.0.1:56416/fence_test#anything'],
  ['protocol','https://fence_fixture@127.0.0.1:56416/fence_test'],
  ['different database','postgresql://fence_fixture@127.0.0.1:56416/postgres'],
  ['ambient password','postgresql://fence_fixture:synthetic@127.0.0.1:56416/fence_test'],
 ])it('refuses '+name,()=>expect(()=>ownedConnection(value)).toThrow('OWNED_LOOPBACK_POSTGRES_REQUIRED'));
});
(url?describe:describe.skip)('Actual isolated notification PUSH evidence and drain',()=>{
 let admin:DataSource,db:DataSource,coordinator:QueryRunner,background:BackgroundTaskService,dispatcher:NotificationDispatcherService,push:PushNotificationService;
 let child:ChildProcess,joined:Promise<{code:number|null;signal:NodeJS.Signals|null}>,directory:string,port:number,originalCa:typeof https.globalAgent.options.ca;
 const owner=randomBytes(16).toString('hex'),ids=['1','2','3','4','5'].map(c=>c.repeat(32)),observations:unknown[]=[],counterexamples:unknown[]=[];
 const pending=new Map<string,{resolve:(x:any)=>void;reject:(e:Error)=>void}>();let childClosed=false,configuredOwnedPush=false,closeInProgress=false,sinkLost=false;let finalSinkHash:string|undefined;const suiteCleanupFailures:string[]=[];let pgMajor:number;
 const manifest:BackgroundManifest={protocolVersion:1,owner:'notification-pg-'+owner,generation:1,phase:'FENCED',targetSha:'a'.repeat(40),participants:[]};
 async function rpc(operation:string,value:object={}){
  const id=randomBytes(16).toString('hex');let timer:NodeJS.Timeout|undefined;
  try{const result=await new Promise<any>((resolve,reject)=>{pending.set(id,{resolve,reject});timer=setTimeout(()=>reject(Error('OWNED_PUSH_RPC_TIMEOUT')),5000);
   child.send({id,operation,value},e=>{if(e)reject(Error('OWNED_PUSH_RPC_SEND_FAILED'));});});if(operation==='SNAPSHOT')finalSinkHash=result.journalSha256;return result;}finally{clearTimeout(timer);pending.delete(id);}
 }
 const logs=(rule:string)=>db.query('SELECT rule_code,channel,status,trigger_event FROM sys_notification_log WHERE rule_code=$1 ORDER BY id',[rule]);
 async function seed(i:number){
  const rule='owned-'+ids[i];
  await db.query(`INSERT INTO sys_notification_rules VALUES(1,$1,'owned','FIXTURE','FIXTURE','{}','USER','{"user_ids":[71]}','{PUSH}','owned-template','NORMAL',300,'ACTIVE')`,[rule]);
  await db.query(`INSERT INTO sys_notification_templates VALUES('owned-template','zh-CN','PUSH','owned {{operation}}','fixture','ACTIVE')`);
  const key=createECDH('prime256v1');key.generateKeys();
  await db.query('INSERT INTO sys_push_subscriptions(user_id,endpoint,p256dh,auth,enabled) VALUES($1,$2,$3,$4,true)',
   ['71',`https://127.0.0.1:${port}/${ids[i]}`,key.getPublicKey().toString('base64url'),randomBytes(16).toString('base64url')]);return rule;
 }
 function evaluate(snapshot:any,rows:any[],id:string){
  const events:any[]=snapshot.events;return snapshot.fatal===false&&snapshot.pendingRequests===0&&snapshot.heldResponses===0&&events.filter(e=>e.operationId===id&&e.kind==='RECEIVED').length===1
   &&events.filter(e=>e.operationId===id&&e.kind==='RESPONSE_COMMITTED'&&e.status===202).length===1
   &&rows.filter(r=>r.status==='SENT'&&r.channel==='PUSH'&&r.trigger_event.operation===id).length===1?'RECONCILED_ISOLATED_OPERATION':'HOLD';
 }
 function inspectOwnedPg(port:string){
  const id=process.env.NOTIFICATION_TEST_PG_CONTAINER;
  if(!/^[a-f0-9]{64}$/.test(id||''))throw Error('ORIGINAL_OWNED_PG_CONTAINER_ID_REQUIRED');
  const template='[{{json .Id}},{{json .Image}},{{json .State.StartedAt}},{{json .State.Running}},{{json .RestartCount}},{{json (index .Config.Labels "phoenix.fixture")}},{{json .NetworkSettings.Ports}},{{json .Mounts}},{{json .Name}},{{if (index .State "Health")}}{{json .State.Health.Status}}{{else}}null{{end}}]';
  const run=(args:string[])=>execFileSync('/usr/bin/docker',['--host','unix:///var/run/docker.sock',...args],{env:{PATH:'/usr/bin:/bin'},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:5000,maxBuffer:32768}).trim();
  const pin=JSON.parse(run(['inspect',id!,'--format',template]));
  if(pin[0]!==id||!/^sha256:[a-f0-9]{64}$/.test(pin[1])||pin[3]!==true||pin[4]!==0||pin[5]!=='background-control'||(pin[9]!==null&&pin[9]!=='healthy')||pin[8].startsWith('/phoenix-v3-')
   ||JSON.stringify(pin[6])!==JSON.stringify({'5432/tcp':[{HostIp:'127.0.0.1',HostPort:port}]})||pin[7].some((m:any)=>m.Type==='bind'))throw Error('ORIGINAL_OWNED_PG_IDENTITY_MISMATCH');
  const metadata=run(['inspect',id!,'--format','{{range .Config.Env}}{{if eq . "POSTGRES_DB=fence_test"}}DB_MATCH {{end}}{{if eq . "POSTGRES_USER=fence_fixture"}}USER_MATCH {{end}}{{end}}']);
  if(metadata!=='USER_MATCH DB_MATCH'&&metadata!=='DB_MATCH USER_MATCH')throw Error('OWNED_DATABASE_CONFIGURATION_MISMATCH');
  run(['exec',id!,'pg_isready','-q','-U','fence_fixture','-d','fence_test']);
  const serverAddress=run(['inspect',id!,'--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}']);if(isIP(serverAddress)!==4)throw Error('OWNED_PG_NETWORK_IDENTITY_REQUIRED');
  return {id:pin[0],imageId:pin[1],startedAt:pin[2],loopbackPort:port,serverAddress,actualPgIsReady:'PASS'};
 }
 let pgPin:ReturnType<typeof inspectOwnedPg>;
 beforeAll(async()=>{
  const connection=ownedConnection(url),fixturePort=String(connection.port);
  pgPin=inspectOwnedPg(fixturePort);
  if(['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','NODE_TLS_REJECT_UNAUTHORIZED'].some(k=>process.env[k]!==undefined))throw Error('REFUSE_AMBIENT_PUSH_OR_TLS_CONFIGURATION');
  const base=path.resolve(process.cwd(),'../../artifacts/maintenance-notification');fs.mkdirSync(base,{recursive:true,mode:0o700});
  directory=fs.mkdtempSync(path.join(base,'owned-'));fs.chmodSync(directory,0o700);
  const keyFile=path.join(directory,'ephemeral-test.key'),certFile=path.join(directory,'ephemeral-test.crt');
  execFileSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=owned-notification-fixture','-addext','subjectAltName=IP:127.0.0.1'],{env:{PATH:'/usr/bin:/bin'},stdio:['ignore','ignore','pipe'],timeout:10000});
  fs.chmodSync(keyFile,0o600);fs.chmodSync(certFile,0o600);
  child=fork(path.resolve(process.cwd(),'../../scripts/ci/maintenance-webpush-provider.fixture.mjs'),[],{execArgv:[],env:{PATH:'/usr/bin:/bin',OWNED_WEBPUSH_PROVIDER:'EPHEMERAL_TEST_TLS_ONLY'},stdio:['ignore','ignore','ignore','ipc']});
  joined=new Promise(resolve=>child.once('close',(code,signal)=>{childClosed=true;if(!closeInProgress)sinkLost=true;for(const p of pending.values())p.reject(Error('ORIGINAL_TLS_SINK_CLOSED'));resolve({code,signal});}));
  child.on('error',()=>{sinkLost=true;for(const p of pending.values())p.reject(Error('ORIGINAL_TLS_SINK_ERROR'));});
  child.on('message',(m:any)=>{const p=pending.get(m?.id);if(!p)return;if(m.ok===true)p.resolve(m.value);else p.reject(Error('OWNED_PUSH_PROVIDER_REFUSED'));});
  const ready=await rpc('INIT',{directory,owner,cert:fs.readFileSync(certFile,'utf8'),key:fs.readFileSync(keyFile,'utf8'),cases:ids.map((id,i)=>({id,status:i===1?503:202,hold:i===0}))});port=ready.port;
  originalCa=https.globalAgent.options.ca;https.globalAgent.options.ca=fs.readFileSync(certFile,'utf8');
  configuredOwnedPush=true;const vapid=webpush.generateVAPIDKeys();process.env.VAPID_PUBLIC_KEY=vapid.publicKey;process.env.VAPID_PRIVATE_KEY=vapid.privateKey;process.env.VAPID_SUBJECT='mailto:fixture@localhost';
  for(const name of ['log','warn','error'] as const)jest.spyOn(Logger.prototype,name).mockImplementation(()=>undefined);
  admin=await new DataSource(connection).initialize();
  pgMajor=Math.floor(Number((await admin.query('SHOW server_version_num'))[0].server_version_num)/10000);expect(pgMajor).toBe(fixturePort==='56416'?16:18);
  const actual=(await admin.query('SELECT current_database() AS database, current_user AS username, host(inet_server_addr()) AS address, inet_server_port() AS port'))[0];
  expect(actual).toEqual({database:'fence_test',username:'fence_fixture',address:pgPin.serverAddress,port:5432});
  expect(inspectOwnedPg(fixturePort)).toEqual(pgPin);
  const schema='notify_'+owner;await admin.query(`CREATE SCHEMA ${schema}`);
  db=await new DataSource({...connection,extra:{options:`-c search_path=${schema}`}}).initialize();
  await db.query(`CREATE TABLE sys_notification_rules(id int,rule_code text,rule_name text,category text,event_type text,trigger_config jsonb,recipient_strategy text,recipient_config jsonb,channels text[],template_code text,priority text,dedupe_window_sec int,status text);
   CREATE TABLE sys_notification_templates(template_code text,locale text,channel text,title_tmpl text,content_tmpl text,status text);
   CREATE TABLE sys_user_notification_prefs(user_id bigint,category text,enabled boolean,channels_opt_in jsonb);
   CREATE TABLE sys_notification_log(id bigserial,rule_code text,template_code text,recipient_user_id bigint,channel text,trigger_event jsonb,title text,content text,status text,last_error text,dedupe_key text,sent_at timestamptz,created_at timestamptz DEFAULT now());
   CREATE TABLE sys_push_subscriptions(id bigserial,user_id text,endpoint text,p256dh text,auth text,enabled boolean,updated_at timestamptz DEFAULT now());`);
  const reader=new BackgroundManifestReader();jest.spyOn(reader,'read').mockImplementation(()=>reader.validate(manifest));
  background=new BackgroundTaskService(reader,new BackgroundLockBackend(db));
  manifest.participants=[{bootId:background.identity.bootId,containerId:'f'.repeat(64),revision:manifest.targetSha,allowedKinds:['LOCAL','NOTIFICATION']}];manifest.generation++;
  await background.onModuleInit();manifest.phase='OPEN';manifest.generation++;
  push=new PushNotificationService(db,{} as ClsService,background);push.onModuleInit();dispatcher=new NotificationDispatcherService(db,push,background);
  coordinator=db.createQueryRunner();await coordinator.connect();
 },30000);
 afterEach(async()=>{
  const failures:string[]=[];
  try{await coordinator?.query('SELECT pg_advisory_unlock_all()');}catch{failures.push('PER_CASE_UNLOCK');}
  manifest.phase='OPEN';manifest.generation++;
  try{await db?.query('ALTER TABLE sys_notification_log DROP CONSTRAINT IF EXISTS fixture_reject_log;TRUNCATE sys_notification_rules,sys_notification_templates,sys_user_notification_prefs,sys_notification_log,sys_push_subscriptions;');}
  catch{failures.push('PER_CASE_DATABASE_RESET');}
  suiteCleanupFailures.push(...failures);expect(failures).toEqual([]);
 });
 afterAll(async()=>{
  const cleanupFailures:string[]=[...suiteCleanupFailures];let originalSinkClose:{code:number|null;signal:NodeJS.Signals|null}|undefined,closeConfirmed=false,closedHash:string|undefined;
  const attempt=async(code:string,action:()=>unknown)=>{try{await action();}catch{cleanupFailures.push(code);}};
  const join=async()=>{let timer:NodeJS.Timeout|undefined;try{return await Promise.race([joined,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('SINK_JOIN_TIMEOUT')),3000);})]);}finally{clearTimeout(timer);}};
  try{
   if(child){
    if(!childClosed){closeInProgress=true;await attempt('TLS_SINK_CLOSE',async()=>{const value=await rpc('CLOSE');expect(value.originalListenerClosed).toBe(true);expect(value.journalSha256).toBe(finalSinkHash);closeConfirmed=true;closedHash=value.journalSha256;});}
    else cleanupFailures.push('TLS_SINK_CLOSED_BEFORE_PROTECTED_CLOSE');
    await attempt('TLS_SINK_ORIGINAL_JOIN',async()=>{originalSinkClose=await join();expect(originalSinkClose).toEqual({code:0,signal:null});});
    if(!childClosed&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await attempt('TLS_SINK_FORCED_JOIN',join);}
    await attempt('TLS_SINK_CLOSE_UNVERIFIED',()=>requireOriginalSinkCompletion({closeConfirmed,sinkLost,exit:originalSinkClose,finalHash:finalSinkHash,closedHash}));
   }
   await attempt('BACKGROUND_SHUTDOWN',()=>background?.shutdown(2000));
   await attempt('COORDINATOR_RELEASE',()=>coordinator?.release());
   await attempt('DATABASE_POOL_CLOSE',()=>db?.destroy());
   await attempt('ADMIN_POOL_CLOSE',()=>admin?.destroy());
  }finally{
   if(configuredOwnedPush){https.globalAgent.options.ca=originalCa;delete process.env.VAPID_PUBLIC_KEY;delete process.env.VAPID_PRIVATE_KEY;delete process.env.VAPID_SUBJECT;}
   try{if(directory)fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({fixtureOnly:true,productionReceipt:false,pgMajor,databaseRuntime:pgPin,originalSinkPid:child?.pid,originalSinkClose,closeConfirmed,finalSinkHash,
    acceptance:observations.length===5&&counterexamples.length===1&&!cleanupFailures.length?'PASS_ISOLATED_DOMAIN_ONLY':'HOLD',
    sourceInputs:Object.fromEntries(['notification-dispatcher.service.ts','push-notification.service.ts','notification-dispatcher.pg.spec.ts'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex')])),
    providerSourceSha256:createHash('sha256').update(fs.readFileSync(path.resolve(process.cwd(),'../../scripts/ci/maintenance-webpush-provider.fixture.mjs'))).digest('hex'),
    source:'ACTUAL_NOTIFICATION_SERVICES_AND_WEB_PUSH',manifestAuthority:'SYNTHETIC_TEST_ONLY',scope:'OPERATION_ASSOCIATION_ONE_ISOLATED_DOMAIN_NOT_COMPLETE_FACTORY',payloadContentMatch:'NOT_VERIFIED_ENCRYPTED_BODY_ONLY',
    fullFactory:false,cleanupFailures,observations,counterexamples},null,2),{mode:0o600});}finally{jest.restoreAllMocks();}
  }
  expect(cleanupFailures).toEqual([]);
 });
 it('holds the real PG execution lock until an actual in-flight TLS send settles',async()=>{
  const rule=await seed(0),work=dispatcher.fire(rule,{operation:ids[0]});let captured:any;const deadline=Date.now()+5000;
  while(true){captured=await rpc('SNAPSHOT');if(captured.heldResponses===1)break;if(Date.now()>=deadline)throw Error('ACTUAL_PUSH_NOT_OBSERVED');await new Promise(r=>setTimeout(r,10));}
  expect(captured.pendingRequests).toBe(1);expect((await coordinator.query('SELECT pg_try_advisory_lock(17455,2) AS ok'))[0].ok).toBe(false);
  expect((await coordinator.query('SELECT pg_try_advisory_lock(17455,1) AS ok'))[0].ok).toBe(true);
  await expect(dispatcher.fire(rule,{operation:'new-denied'})).rejects.toThrow('ADMISSION_GATE_FENCED');
  await rpc('RELEASE',{operationId:ids[0]});await work;
  expect((await coordinator.query('SELECT pg_try_advisory_lock(17455,2) AS ok'))[0].ok).toBe(true);
  const evidence=await rpc('SNAPSHOT'),rows=await logs(rule);expect(evidence.fatal).toBe(false);expect(evidence.pendingRequests).toBe(0);
  const verdict=evaluate(evidence,rows,ids[0]);expect(verdict).toBe('RECONCILED_ISOLATED_OPERATION');observations.push({scenario:'ACTUAL_TLS_INFLIGHT_DRAIN',verdict,journalSha256:evidence.journalSha256});
 },15000);
 it('detects real provider 503 despite a SENT dispatcher log',async()=>{
  const rule=await seed(1);await dispatcher.fire(rule,{operation:ids[1]});const evidence=await rpc('SNAPSHOT'),rows=await logs(rule);
  expect(rows.map((r:any)=>r.status)).toEqual(['SENT']);expect(evidence.events.some((e:any)=>e.operationId===ids[1]&&e.status===503)).toBe(true);
  const verdict=evaluate(evidence,rows,ids[1]);expect(verdict).toBe('HOLD');observations.push({scenario:'PROVIDER_503_WITH_SENT_LOG',verdict,journalSha256:evidence.journalSha256});
 });
 it('detects accepted external send followed by actual PostgreSQL log failure',async()=>{
  const rule=await seed(2);await db.query("ALTER TABLE sys_notification_log ADD CONSTRAINT fixture_reject_log CHECK(status<>'SENT')");
  await dispatcher.fire(rule,{operation:ids[2]});const evidence=await rpc('SNAPSHOT'),rows=await logs(rule);expect(rows).toEqual([]);
  expect(evidence.events.some((e:any)=>e.operationId===ids[2]&&e.status===202)).toBe(true);const verdict=evaluate(evidence,rows,ids[2]);
  expect(verdict).toBe('HOLD');observations.push({scenario:'EXTERNAL_ACCEPTED_LOG_COMMIT_FAILED',verdict,journalSha256:evidence.journalSha256});
 });
 it('observes one send and persisted dedupe for the repeated actual operation',async()=>{
  const rule=await seed(3);await dispatcher.fire(rule,{operation:ids[3]});await dispatcher.fire(rule,{operation:ids[3]});
  const evidence=await rpc('SNAPSHOT'),rows=await logs(rule);expect(rows.map((r:any)=>r.status)).toEqual(['SENT','DEDUPED']);
  expect(evidence.events.filter((e:any)=>e.operationId===ids[3]&&e.kind==='RECEIVED')).toHaveLength(1);
  const verdict=evaluate(evidence,rows,ids[3]);expect(verdict).toBe('RECONCILED_ISOLATED_OPERATION');observations.push({scenario:'ACTUAL_DEDUPED_OPERATION',verdict,journalSha256:evidence.journalSha256});
 });
 it('holds when an extra actual push occurs outside dispatcher dedupe',async()=>{
  const rule=await seed(4);await dispatcher.fire(rule,{operation:ids[4]});
  await push.sendToUser(71,{title:'owned '+ids[4],body:'fixture'});
  const evidence=await rpc('SNAPSHOT'),rows=await logs(rule);
  expect(evidence.events.filter((e:any)=>e.operationId===ids[4]&&e.kind==='RECEIVED')).toHaveLength(2);
  expect(rows.map((r:any)=>r.status)).toEqual(['SENT']);const verdict=evaluate(evidence,rows,ids[4]);
  expect(verdict).toBe('HOLD');observations.push({scenario:'EXTRA_EXTERNAL_SEND',verdict,journalSha256:evidence.journalSha256});
 });

 it('refuses an actual original TLS sink that exits after SNAPSHOT without protected CLOSE',async()=>{
  const root=fs.mkdtempSync(path.join(path.dirname(directory),'owned-'));fs.chmodSync(root,0o700);
  const other=fork(path.resolve(process.cwd(),'../../scripts/ci/maintenance-webpush-provider.fixture.mjs'),[],{execArgv:[],env:{PATH:'/usr/bin:/bin',OWNED_WEBPUSH_PROVIDER:'EPHEMERAL_TEST_TLS_ONLY'},stdio:['ignore','ignore','ignore','ipc']});
  let closed=false;const done=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>other.once('close',(code,signal)=>{closed=true;resolve({code,signal});}));
  const read=async(operation:string,value:object)=>{const id=randomBytes(16).toString('hex');let timer:NodeJS.Timeout|undefined;
   try{return await new Promise<any>((resolve,reject)=>{const listener=(message:any)=>{if(message.id===id){other.off('message',listener);message.ok===true?resolve(message.value):reject(Error('NEGATIVE_TLS_SINK_REFUSED'));}};
    other.on('message',listener);timer=setTimeout(()=>{other.off('message',listener);reject(Error('NEGATIVE_TLS_SINK_TIMEOUT'));},3000);other.send({id,operation,value});});}finally{clearTimeout(timer);}};
  try{
   await read('INIT',{directory:root,owner,cert:fs.readFileSync(path.join(directory,'ephemeral-test.crt'),'utf8'),key:fs.readFileSync(path.join(directory,'ephemeral-test.key'),'utf8'),cases:[{id:'6'.repeat(32),status:202,hold:false}]});
   const last=await read('SNAPSHOT',{});expect(last.fatal).toBe(false);expect(last.pendingRequests).toBe(0);
   expect(other.kill('SIGTERM')).toBe(true);let timer:NodeJS.Timeout|undefined;let exit;
   try{exit=await Promise.race([done,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('NEGATIVE_ORIGINAL_CLOSE_TIMEOUT')),3000);})]);}finally{clearTimeout(timer);}
   expect(exit).toEqual({code:null,signal:'SIGTERM'});
   expect(()=>requireOriginalSinkCompletion({closeConfirmed:false,sinkLost:true,exit,finalHash:last.journalSha256,closedHash:undefined})).toThrow('ORIGINAL_TLS_SINK_COMPLETION_UNVERIFIED');
   counterexamples.push({scenario:'ACTUAL_SINK_EXIT_AFTER_SNAPSHOT_WITHOUT_PROTECTED_CLOSE',expectedVerdict:'HOLD',originalExit:exit,protectedCloseConfirmed:false});
  }finally{if(!closed&&other.exitCode===null&&other.signalCode===null){other.kill('SIGKILL');await done;}}
 });

});
