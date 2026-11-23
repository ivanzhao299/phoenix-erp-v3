/** Fixed read-only diagnostic for the interrupted 1123 handoff. This entry
 * cannot start a release, change a manifest, invoke a migration or remove ingress. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {ModernSchemaRegistry} from './production-modern-schema-registration.mjs';
import {modernSchemaReleaseBinding,validateModernSchemaPending} from './production-modern-schema-state.mjs';
import {verifyModernSchemaStage} from './production-modern-schema-stage.mjs';
import {ModernSchemaIngress} from './production-modern-schema-ingress.mjs';
import {ingressIdentity} from './maintenance-ingress-policy.mjs';
import {readPublicManifest,assertSameBinding} from './background-control-manifest.mjs';
import {inspectApiParticipant,verifyParticipantStatus} from './background-control-coordinator.mjs';
import {ModernSchemaControlSession,pinOriginalModernSchemaSession,verifyOriginalModernSchemaAdmission} from './production-modern-schema-session-lease.mjs';
import {modernSchemaOriginalSessionExitSql,closeModernSchemaOriginalSession} from './production-modern-schema-completion.mjs';
import {classifyModernSchemaDatabaseExecutors,MODERN_SCHEMA_EXECUTOR_SQL,inspectModernSchemaContainer} from './production-modern-schema-executors.mjs';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {captureModernSchemaFacts,defaultOffEvidenceFromFacts} from './production-modern-schema-facts.mjs';
import {captureModernSchemaLedger} from './production-modern-schema-schema-result.mjs';

export const heldOwner='45144287071-1';
export const heldTarget='98dfab3411fbddb8c1646f2db20df2799291cd3d';
const contextPin='abb46c79c3ae051af149933c512531200f31374fc5579ebb7e2e521340e0c69e';
const pendingPin='c8415dc078bcfa3546e47f567031adb5495632a76a17ab86a7abab3178d4c9dc';
const baselinePin='cca24f95e5f524c40d2a7f0fb447557cebfeaa0548551328f42b81abe2ed1a7e';
const bootAt='2026-11-23T10:15:31.984687687Z';
const edgePin='b9c3ab91d4fbfebba33dfe262531a7d620e846d5b780644264d61296eb1d4ba8';
const assert=(ok,code)=>{if(!ok)throw Error('HELD_FACTS_HOLD='+code);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export function participantStartMicros(iso){
 assert(typeof iso==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(iso)&&Number.isFinite(Date.parse(iso)),'BOOT_TIME');
 return String(BigInt(Date.parse(iso))*1000n+BigInt(iso.slice(-4,-1)));
}

export function compareHeldFacts(before,after){
 const group=(key,name)=>{
  const index=rows=>new Map(rows.map(r=>[JSON.stringify([r.schema,r[name]]),r]));
  const a=index(before[key]),b=index(after[key]);
  assert(a.size===before[key].length&&b.size===after[key].length,'DUPLICATE_FACT');
  return [...new Set([...a.keys(),...b.keys()])].filter(k=>!a.has(k)||!b.has(k)||!same(a.get(k),b.get(k))).length;
 };
 assert(same(before.database,after.database)&&before.readOnly===true&&after.readOnly===true&&before.releaseAuthorized===false&&after.releaseAuthorized===false,'DATABASE_FACT_SCOPE');
 return {outcome:same(before,after)?'MATCH':'DIFFERENCE',before:canonicalDigest(before),after:canonicalDigest(after),
  changedTables:group('tables','table'),changedSequences:group('sequences','name'),releaseAuthorized:false};
}

let lastProbe=0;
export function assertHeldEdge(directory,{forceProbe=false}={}){
 const conf='/etc/nginx/conf.d/erp.eggslao.com.conf';
 const st=fs.lstatSync(conf);
 assert(st.isFile()&&st.uid===0&&st.gid===0&&st.nlink===1&&(st.mode&0o777)===0o644&&sha(fs.readFileSync(conf))===edgePin,'VHOST_CHANGED');
 const archive=path.join(directory,'public-edge-hold-'+heldOwner);
 const receipt=name=>{
  const file=path.join(archive,name),stat=fs.lstatSync(file);
  assert(stat.isFile()&&stat.nlink===1&&stat.uid===0&&(stat.mode&0o777)===0o600,'EDGE_RECEIPT');
  return JSON.parse(fs.readFileSync(file));
 };
 const intent=receipt('intent.json'),drained=receipt('workers-drained.json');
 assert(intent.owner===heldOwner&&intent.held===edgePin&&drained.owner===heldOwner&&drained.held===edgePin&&
  Object.keys(intent.workers).length>0&&Object.keys(drained.workers).length>0,'EDGE_DRAIN_RECEIPT');
 const master=fs.readFileSync('/run/nginx.pid','utf8').trim();
 assert(/^[1-9][0-9]*$/.test(master),'NGINX_MASTER_PID');
 const children=fs.readFileSync('/proc/'+master+'/task/'+master+'/children','utf8').trim().split(/\s+/);
 const current={};
 for(const pid of children){
  if(!/^[1-9][0-9]*$/.test(pid))continue;
  if(fs.readFileSync('/proc/'+pid+'/cmdline').includes(Buffer.from('nginx: worker process')))
   current[pid]=fs.readFileSync('/proc/'+pid+'/stat','utf8').split(/\)\s/).at(-1).trim().split(/\s+/)[19];
 }
 assert(same(current,drained.workers),'ACTIVE_NGINX_WORKERS_CHANGED');
 if(forceProbe||performance.now()-lastProbe>=20000||lastProbe===0){
  for(const url of ['http://erp.eggslao.com/','https://erp.eggslao.com/','https://erp.eggslao.com/login','https://erp.eggslao.com/api/health']){
   const code=execFileSync('/usr/bin/curl',['-q','--noproxy','*','--resolve','erp.eggslao.com:80:127.0.0.1','--resolve','erp.eggslao.com:443:127.0.0.1','--max-time','4','-sS','-o','/dev/null','-w','%{http_code}',url],
    {env:{PATH:'/usr/bin:/bin'},encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']});
   assert(code==='503','ACTIVE_PUBLIC_VHOST_CHANGED');
  }
  lastProbe=performance.now();
 }
 for(const [pid,tick] of Object.entries(intent.workers)){
  assert(/^[1-9][0-9]*$/.test(pid),'EDGE_WORKER_PID');
  const file='/proc/'+pid+'/stat';
  if(fs.existsSync(file))assert(fs.readFileSync(file,'utf8').split(/\)\s/).at(-1).trim().split(/\s+/)[19]!==tick,'EDGE_WORKER_NOT_DRAINED');
 }
}

async function inspectHeld(env){
 assert(env.ORIGINAL_RELEASE_OWNER===heldOwner&&env.TARGET_SHA===heldTarget&&env.OPERATOR_RECOVERY_MODE==='check-held','EXACT_INCIDENT');
 const owner=env.OPERATOR_RECOVERY_OWNER,store=new ModernSchemaRegistry(),dir=store.directory;
 verifyModernSchemaStage({owner,targetSha:env.MODERN_SCHEMA_EXECUTION_SHA});
 const prep=store.read('schema-release-preparation-'+heldOwner+'.json'),{context}=prep;
 const {preparationSha256,...preparationContent}=prep;
 assert(canonicalDigest(preparationContent)===preparationSha256&&canonicalDigest(prep.originalSnapshot.containers)===context.runtimeSnapshotSha256&&canonicalDigest(context)===contextPin,'HISTORICAL_PREPARATION');
 const source=label=>store.read('schema-release-'+label+'-'+heldOwner+'.json');
 const binding=modernSchemaReleaseBinding(context,prep.preparationSha256);
 const pending=validateModernSchemaPending(store.read('schema-release-pending.json'),binding);
 const step=store.read('schema-release-step-'+heldOwner+'-5-fresh-rechecked.json');
 const baseline=source('before-facts'),closed=source('session-closed'),installed=source('ingress-installed');
 assert(pending.stateDigest===pendingPin&&pending.owner===heldOwner&&pending.sequence===5&&pending.status==='HOLD'&&
  pending.receiptSha256===canonicalDigest(step)&&step.payload.evidence.factsSha256===baselinePin&&canonicalDigest(baseline)===baselinePin&&
  closed.originalLeaseSha256===canonicalDigest(pending.lease)&&closed.transportClosed===true&&closed.outcome==='ORIGINAL_SESSION_ABSENT','PROTECTED_HOLD_CHANGED');
 const {api,db,web}=prep.originalSnapshot.containers;
 const fenced=readPublicManifest(),control=store.read('background-control.json');
 assertSameBinding(control,binding);
 assert(control.phase==='FENCED'&&fenced.targetSha===heldTarget&&fenced.phase==='FENCED'&&fenced.owner===heldOwner&&control.generation===fenced.generation&&control.manifestDigest===sha(JSON.stringify(fenced)),'ORIGINAL_CONTROL');
 const host=()=>{
  store.guard();assertHeldEdge(dir);
  assert(Date.now()<Date.parse('2026-11-23T15:07:52Z')&&!fs.existsSync('/proc/'+pending.supervisor.pid)&&
   same(store.read('floor.json'),prep.floor)&&same(store.read('active.json'),prep.active)&&
   same(store.read('schema-release-pending.json'),pending)&&same(readPublicManifest(),fenced)&&same(store.read('background-control.json'),control)&&
   !['transaction.json','policy-transition.json','cutover-pending.json'].some(n=>store.exists(n))&&
   !fs.readdirSync(dir).some(n=>n.startsWith('schema-release-step-'+heldOwner+'-')&&!/^([0-5])-/.test(n.slice(('schema-release-step-'+heldOwner+'-').length))),'HELD_STATE_CHANGED');
  assert(!['migration','body'].some(n=>fs.existsSync(path.join(dir,'schema-release-'+n+'-'+heldOwner)))&&!store.exists('schema-release-schema-receipt-'+heldOwner+'.json'),'DDL_INTENT');
 };
 host();const session=new ModernSchemaControlSession(),reader=new ModernSchemaReadClient({databaseContainer:db.id});
 let lease;
 try{
  await session.start();assert(await session.tryLock(1)&&await session.tryLock(2),'DUAL_LEASE_BUSY');
  lease=await pinOriginalModernSchemaSession(session,context);
  assert(same(lease.database,pending.lease.database)&&BigInt(lease.backendStartMicros)>BigInt(pending.lease.backendStartMicros),'OLD_LEASE');
  const admission=()=>verifyOriginalModernSchemaAdmission({session,lease,observeHost:host});
  const ingress=new ModernSchemaIngress({context,scope:prep.ingressScope,privateRuntime:{guard:store.guard},admit:admission});
  await reader.start();
  const verify=async()=>{
   await admission();await ingress.check('HELD_FACTS_READ');
   assert(same(ingress.host,installed.host)&&canonicalDigest(ingressIdentity(ingress.tables()))===installed.identitySha256,'NATIVE_INGRESS');
   for(const pin of [api,db,web]){
    const actual=inspectModernSchemaContainer(pin.id);
    assert(actual.imageId===pin.image&&actual.state.Health?.Status==='healthy'&&actual.state.Running&&actual.restarts===pin.restartCount&&actual.state.StartedAt===(pin===api?bootAt:pin.startedAt),'LIVE_RUNTIME');
   }
   const prior=prep.originalBackground.participant,actual=inspectApiParticipant(prior,prep.floor.project);
   const status=verifyParticipantStatus(actual,{...prior,bootId:actual.status.bootId},fenced);
   assert(status.inFlight===0&&status.taskGraphs===0&&status.pendingChildren===0&&actual.startedAt===bootAt&&status.bootId!==prior.bootId,'ORIGINAL_NOT_QUIESCENT');
   const {rows:[old]}=await reader.query(modernSchemaOriginalSessionExitSql(pending.lease));
   assert(old.originalSessionPresent===false&&old.primary===true&&old.postmasterStartMicros===lease.database.postmasterStartMicros,'ORIGINAL_SESSION_PRESENT');
   for(let attempt=0;attempt<4;attempt++){
    const {rows:[{observation}]}=await reader.query(MODERN_SCHEMA_EXECUTOR_SQL);
    const native=JSON.parse(observation);
    classifyModernSchemaDatabaseExecutors(native,{runtimeAddress:prep.hostSurface.runtimeAddress,originalLease:lease});
    const control=status.controlSession;
    assert(native.sessions.filter(s=>s.pid===control.sessionPid&&s.databaseOid===control.databaseOid&&s.applicationName===control.applicationName&&
     s.backendStartMicros===participantStartMicros(control.backendStartedAtUs)&&s.clientAddress===prep.hostSurface.runtimeAddress).length===1,'BOOT_SESSION');
    if(!native.workers.length&&native.sessions.every(s=>!s.openTransaction))return;
    await delay(60);
   }
   assert(false,'ACTIVE_EXECUTOR');
  };
  await verify();
  await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  let facts;
  try{
   const ledger=await captureModernSchemaLedger(reader);
   assert(ledger.sha256===context.beforeLedgerSha256,'LEDGER_CHANGED');
   facts=await captureModernSchemaFacts(reader,{withinSnapshot:true});
  }finally{await reader.query('ROLLBACK');}
  await verify();
  assert(defaultOffEvidenceFromFacts(context.runtimeSha,facts,{stage:'BEFORE_SCHEMA',floor:prep.floor,plan:context}).verified,'ROLLOUT_DRIFT');
  const result=compareHeldFacts(baseline,facts);
  const exit=await closeModernSchemaOriginalSession({coordinator:{close:()=>session.close()},lease,client:reader,guard:host});
  assert(exit.outcome==='ORIGINAL_SESSION_ABSENT'&&exit.transportClosed,'LEASE_EXIT');
  const deltas=(items,observed,field)=>{
   const key=r=>JSON.stringify([r.schema,r[field]]);
   const index=new Map(observed.map(r=>[key(r),r]));
   const previous=new Set(items.map(key));
   return [...items.filter(r=>!index.has(key(r))||!same(r,index.get(key(r)))),
    ...observed.filter(r=>!previous.has(key(r)))].map(r=>({schema:r.schema,name:r[field]}));
  };
  store.immutable('schema-release-held-facts-'+owner+'.json',{schema:'phoenix.held-facts-inspection/v1',
   owner,originalOwner:heldOwner,executionSha:env.MODERN_SCHEMA_EXECUTION_SHA,pendingSha256:canonicalDigest(pending),
   leaseExit:exit,originalBootAt:bootAt,checkedAt:new Date().toISOString(),result,
   changedTables:deltas(baseline.tables,facts.tables,'table'),changedSequences:deltas(baseline.sequences,facts.sequences,'name')});
  return result;
 }finally{try{await reader.close();}finally{await session.close();}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;
 try{result=await inspectHeld(process.env);}
 catch(error){result={outcome:'HOLD',code:/^[A-Z_]+_HOLD=[A-Z0-9_]+$/.test(error.message)?error.message:'HELD_FACTS_HOLD=UNCLASSIFIED',releaseAuthorized:false};}
 console.log(JSON.stringify(result));if(result.outcome!=='MATCH')process.exitCode=1;
}
