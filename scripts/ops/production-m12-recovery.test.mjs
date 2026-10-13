import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { captureSnapshot, summarizeStartupLogs } from './production-deployment-evidence.mjs';
import { assessRecovery, planRecoveredState, replayStartupWindow, RECOVERY_SCHEMA, COMPLETE_ABORT_TRANSACTION as f, COMPLETE_ABORT_POINT } from './production-deployment-recovery.mjs';
const ops = path.dirname(new URL(import.meta.url).pathname);
const hash = x => createHash('sha256').update(x).digest('hex');
const image = c => `sha256:${c.repeat(64)}`;
const clone = x => JSON.parse(JSON.stringify(x));
const startupTime = '2026-10-12T00:00:01Z', capturedAt = '2026-10-12T00:00:04Z';
const template = JSON.parse(fs.readFileSync(new URL('../../docs/ops/templates/m12-complete-abort-receipt.template.json', import.meta.url)));
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm12-recovery-cli-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'state'); fs.mkdirSync(dir, { mode: 0o700 });
  const write = (name, value) => { const dest = path.join(dir, name); fs.writeFileSync(dest, JSON.stringify(value), { mode: 0o600 }); return dest; };
  const previous = { api: { imageId: image('c'), revision: f.previousFloorSha }, web: { imageId: image('b'), revision: 'b'.repeat(40) } };
  const candidate = { imageId: image('a'), revision: f.targetSha };
  const metadata = Object.fromEntries(['db', 'api', 'web'].map((s, i) => [s, { id: String(i+1).repeat(64), created: '2026-10-11T23:00:00Z',
    image: s === 'api' ? candidate.imageId : s === 'web' ? previous.web.imageId : image('d'),
    state: { Running: true, StartedAt: s === 'api' ? startupTime : '2026-10-11T23:00:01Z', Health: { Status: 'healthy' } }, mounts: [], restartCount: 0,
    revision: s === 'api' ? f.targetSha : s === 'web' ? previous.web.revision : null }]));
  const inspect = args => {
    if (args[0] === 'inspect') { const x=metadata[args[1].replace('phoenix-v3-', '')]; return [x.id,x.created,x.image,x.state,x.restartCount,x.mounts].map(JSON.stringify).join('\t'); }
    const x=Object.values(metadata).find(x=>x.image===args[2]); return JSON.stringify(x.revision ? {'org.opencontainers.image.revision':x.revision} : {});
  };
  const binding = { runId:f.runId, runAttempt:1, targetSha:f.targetSha, floorSha:f.targetSha, capturedAt };
  const pre = captureSnapshot({ ...binding, phase:'PRE_SNAPSHOT',capturedAt:'2026-10-11T23:59:59Z' }, inspect);
  // PRE API was the previous pin; DB/Web metadata stays bit-identical.
  pre.containers.api = { ...pre.containers.api, id:'4'.repeat(64),image:previous.api.imageId,ociRevision:f.previousFloorSha,startedAt:'2026-10-11T23:00:01Z' };
  const post = captureSnapshot({ ...binding, phase:'POST_SNAPSHOT' }, inspect);
  const streams = { stdout:'2026-10-12T00:00:02Z API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS\n2026-10-12T00:00:03Z Nest application started\n', stderr:'2026-10-12T00:00:03Z warning: fixture\n' };
  const startup = summarizeStartupLogs({ ...binding, ...streams, containerId:post.containers.api.id, startedAt:startupTime, readinessVerified:true });
  const evidence = { pre,post,startup };
  const evidenceFiles = { pre:write('pre.json',pre), post:write('post.json',post),log:write('startup.json',startup) };
  const deployRecord = { version:3,outcome:'SWITCHING',target:f.targetSha,configSha:f.targetSha,floorSha:f.targetSha, previous,
    candidates:{api:candidate},active:{api:candidate,web:previous.web},switched:{api:true,web:false},migrationBaseline:f.previousFloorSha,
    migrationPaths:[],protectedImages:[previous.api.imageId,previous.web.imageId,candidate.imageId],expiresAt:'2026-10-12T00:30:00Z',evidence:evidenceFiles };
  const marker = { version:3,operation:'CODE_HOLD',phase:'IN_PROGRESS',runId:f.runId,target:f.targetSha,previousFloorSha:f.previousFloorSha,
    previous,candidateApi:candidate,previousEnv:{CHANJET_SYNC_POLICY:'HOLD',CHANJET_READONLY_SYNC_ENABLED:'false',CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'},nextEnv:{CHANJET_SYNC_POLICY:'HOLD',CHANJET_READONLY_SYNC_ENABLED:'false',CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'},startedAt:'2026-10-12T00:00:00Z',expiresAt:'2026-10-12T00:30:00Z' };
  const transaction={version:3,runId:f.runId,phase:'IN_PROGRESS',target:f.targetSha,configSha:f.targetSha};
  const floor={version:3,phase:'READY',floorSha:f.targetSha,chanjetPolicy:'HOLD',readonlyApproval:null};
  const active={version:3,outcome:'CONFIG_READY_HOLD',configSha:f.targetSha,floorSha:f.targetSha,active:previous,migrationBaseline:f.previousFloorSha};
  const db={mirrorRows:11,entityRows:22,arSnapshotRows:3,runningJobs:0,queuedJobs:0,writebackPending:0,wmsWritebackPending:0,remoteWriteAttempts:0,wmsRemoteWriteAttempts:0,inboundRuns:0};
  const receipt=clone(template); receipt.startup={...receipt.startup,combinedDigest:startup.combinedDigest,stdoutLineCount:startup.stdoutLineCount,stderrLineCount:startup.stderrLineCount}; receipt.dbBaseline=clone(db);
  const context={targetRunId:f.runId,approvedSha:f.targetSha,previousFloorSha:f.previousFloorSha,recoveryRunId:'998877-1',receiptSha256:hash(JSON.stringify(receipt)),now:Date.parse('2026-10-13T00:00:00Z')};
  const bundle={transaction,deployRecord,marker,floor,active,runtime:clone(deployRecord.active),containers:clone(post.containers),readinessHttp:'200',
    checkout:{head:f.targetSha,clean:true},liveEnv:{CHANJET_SYNC_POLICY:'HOLD',CHANJET_READONLY_SYNC_ENABLED:'false',CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'},
    evidence,evidenceFiles,receipt,dbEvidence:db,replay:await replayStartupWindow(evidence,()=>streams),archive:null};
  function persist() { for(const [name,value] of [['transaction.json',bundle.transaction],['policy-transition.json',bundle.marker],['floor.json',bundle.floor],['active.json',bundle.active],[`deploy-${f.runId}.json`,bundle.deployRecord],[`recovery-${f.runId}.json`,bundle.archive]]) {if(value)write(name,value);else if(fs.existsSync(path.join(dir,name)))fs.unlinkSync(path.join(dir,name));} for(const [name,data] of [['pre',bundle.evidence.pre],['post',bundle.evidence.post],['log',bundle.evidence.startup]])fs.writeFileSync(bundle.evidenceFiles[name],JSON.stringify(data)); }
  function archive(phase='ARCHIVED') {
    const recoveredAt='2026-10-13T00:00:00Z';
    const plan=planRecoveredState(bundle.deployRecord,bundle.marker,{recoveryRunId:context.recoveryRunId,recoveredAt,startupResult:'PASS_REDACTED_SUMMARY',classification:COMPLETE_ABORT_POINT,receiptSha256:context.receiptSha256});
    bundle.archive={schema:RECOVERY_SCHEMA,phase,recoveryRunId:context.recoveryRunId,recoveredAt,targetRunId:f.runId,approvedSha:f.targetSha,previousFloorSha:f.previousFloorSha,receiptSha256:context.receiptSha256,
      archived:[['transaction.json',bundle.transaction],['policy-transition.json',bundle.marker],['floor.json',bundle.floor],['active.json',bundle.active],[`deploy-${f.runId}.json`,bundle.deployRecord]].map(([name,value])=>({name,value:clone(value),sha256:hash(JSON.stringify(value))})),plan};
    return plan;
  }
  function runCli({missingReceipt=false,wrongHash=false}={}) {
    persist();
    // Real recovery/evidence/atomic modules. Host admission, sanitized runtime
    // commands and read-only SQL results are isolated local fixture shims.
    for(const name of fs.readdirSync(ops).filter(n=>/\.(mjs|json)$/.test(n)&&!n.endsWith('.test.mjs')))fs.copyFileSync(path.join(ops,name),path.join(root,name));
    fs.writeFileSync(path.join(root,'production-config-guard.mjs'), `import fs from 'node:fs';
export const CONTRACT={version:3,stateDirectory:${JSON.stringify(dir)}};
export const secureJson=f=>JSON.parse(fs.readFileSync(f));
export const verifyContext=(r,d)=>{if(r!==${JSON.stringify(root)}||d!==CONTRACT.stateDirectory)throw Error('CONFIG_HOLD=FIXTURE_CONTEXT');};
export const rollbackEligibility=()=>({allowed:true});
export const git=(r,a)=>a[0]==='rev-parse'?${JSON.stringify(bundle.checkout.head)}:${JSON.stringify(bundle.checkout.clean?'':'fixture dirty')};
`);
    fs.copyFileSync(path.join(ops,'production-trusted-paths.mjs'),path.join(root,'real-trusted.mjs'));
    fs.writeFileSync(path.join(root,'production-trusted-paths.mjs'), `import fs from 'node:fs';
export {assertSameDirectory,assertContained} from './real-trusted.mjs';
import {assertRegularFile as regular,readPinnedFile as read} from './real-trusted.mjs';
export const inspectTrustedDirectory=d=>{const s=fs.lstatSync(d);return {dev:s.dev,ino:s.ino,mode:s.mode};};
export const assertRegularFile=s=>regular(s,{uid:process.getuid()});
export const readPinnedFile=(f,o)=>read(f,{...o,uid:process.getuid()},{inspectDirectory:inspectTrustedDirectory});
`);
    // JSON local fixture drives every CLI subprocess; unknown Docker commands
    // fail 99. SQL shim requires READ ONLY and ROLLBACK, never executes SQL.
    fs.writeFileSync(path.join(root,'commands.json'),JSON.stringify({runtime:bundle.runtime,containers:bundle.containers,env:bundle.liveEnv,db:bundle.dbEvidence,streams,http:bundle.readinessHttp}));
    fs.writeFileSync(path.join(root,'commands.mjs'), `import fs from 'node:fs';const x=JSON.parse(fs.readFileSync(new URL('./commands.json',import.meta.url)));const [tool,...a]=process.argv.slice(2);
if(tool==='curl')console.log(x.http);
else if(a[0]==='inspect'){const s=a[1].replace('phoenix-v3-','');const m=x.containers[s];if(a[3]==='{{.Image}}')console.log(x.runtime[s].imageId);else if(a[3]==='{{json .Config.Env}}')console.log(JSON.stringify(Object.entries(x.env).map(([k,v])=>k+'='+v)));else console.log([m.id,m.created,m.image,{Running:m.running,StartedAt:m.startedAt,Health:{Status:m.health}},m.restartCount,m.mounts.map(v=>({Type:v.type,Source:v.source,Destination:v.destination,RW:!v.readOnly}))].map(JSON.stringify).join('\\t'));}
else if(a[0]==='image'&&a[1]==='inspect'){const m=Object.values(x.containers).find(v=>v.image===a[2]);if(a[4].includes('json'))console.log(JSON.stringify(m.ociRevision?{'org.opencontainers.image.revision':m.ociRevision}:{}));else console.log(Object.values(x.runtime).find(v=>v.imageId===a[2]).revision);}
else if(a[0]==='logs'){process.stdout.write(x.streams.stdout);process.stderr.write(x.streams.stderr);}
else if(a[0]==='exec'&&a.includes('PGOPTIONS=-c default_transaction_read_only=on')){const sql=fs.readFileSync(0,'utf8');if(!sql.startsWith('BEGIN READ ONLY;')||!sql.trim().endsWith('ROLLBACK;'))process.exit(98);console.log(JSON.stringify(x.db));}
else process.exit(99);
`);
    for(const name of ['docker','curl'])fs.writeFileSync(path.join(root,name),`#!/bin/sh\nexec '${process.execPath}' '${path.join(root,'commands.mjs')}' '${name}' "$@"\n`,{mode:0o700});
    const runtimeFile=path.join(root,'capture-production-runtime.mjs');fs.writeFileSync(runtimeFile,fs.readFileSync(runtimeFile,'utf8').replace("PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'",`PATH: ${JSON.stringify(root)}`));
    fs.mkdirSync(path.join(root,'scripts/ops/readonly-audits'),{recursive:true});fs.writeFileSync(path.join(root,'scripts/ops/readonly-audits/chanjet-restoration-preflight.sql'),'SELECT fixture;');
    const before=Object.fromEntries(fs.readdirSync(dir).map(n=>[n,fs.readFileSync(path.join(dir,n),'utf8')]));
    const bytes=JSON.stringify(bundle.receipt);
    const result=spawnSync(process.execPath,[path.join(root,'production-deployment-recovery.mjs')],{cwd:root,encoding:'utf8',timeout:15000,env:{PATH:root,RECOVERY_EXECUTE:'true',RECOVERY_TARGET_RUN_ID:context.targetRunId,RECOVERY_APPROVED_SHA:context.approvedSha,RECOVERY_PREVIOUS_FLOOR_SHA:context.previousFloorSha,RECOVERY_RUN_ID:context.recoveryRunId,...(missingReceipt?{}:{RECOVERY_STARTUP_RECEIPT_B64:Buffer.from(bytes).toString('base64'),RECOVERY_STARTUP_RECEIPT_SHA256:wrongHash?'0'.repeat(64):hash(bytes)})}});
    return {result,before};
  }
  return {root,dir,bundle,context,streams,archive,runCli};
}

test('filled synthetic receipt template validates; placeholder template stays ineligible',async t=>{
  const {bundle,context}=await fixture(t);assert.deepEqual(assessRecovery(bundle,context),{eligible:true,reasons:[],resumeFrom:null});
  assert.equal(assessRecovery({...bundle,receipt:template},context).eligible,false);
});
test('new receipt is frozen; the old SIGPIPE label and ordinary PASS remain blocked',async t=>{
  const {bundle,context}=await fixture(t);
  for(const [r,c] of [[{...bundle.receipt,abortPoint:'DISK_REPORT_SIGPIPE'},context],[bundle.receipt,{...context,targetRunId:'38333221688-1'}],[bundle.receipt,{...context,approvedSha:'a'.repeat(40)}],[bundle.receipt,{...context,previousFloorSha:'b'.repeat(40)}]])assert.equal(assessRecovery({...bundle,receipt:r},c).eligible,false);
});
test('rejection matrix binds history, files, replay, live identity, DB and expiry',async t=>{
  const cases=[
    ['receipt run',b=>b.receipt.runId='99-1'],['receipt SHA',b=>b.receipt.targetSha='a'.repeat(40)],['receipt previous floor',b=>b.receipt.previousFloorSha='a'.repeat(40)],
    ['receipt missing',b=>b.receipt=null],['receipt attempt',b=>b.receipt.runAttempt=2],['unknown raw field',b=>b.receipt.rawLog='fixture'],
    ['marker previous floor',b=>b.marker.previousFloorSha='a'.repeat(40)],['marker previous pins',b=>b.marker.previous.api.revision='a'.repeat(40)],['deploy old API',b=>b.deployRecord.previous.api.revision='a'.repeat(40)],
    ['digest receipt',b=>b.receipt.startup.combinedDigest='0'.repeat(64)],['digest replay',b=>b.replay.combinedDigest='0'.repeat(64)],['replay schema',b=>b.replay.schemaWriteCount=1],['replay error',b=>b.replay.errorLineCount=1],['replay SQL',b=>b.replay.sqlShapeCount=1],['replay window',b=>b.replay.windowVerified=false],['replay compat',b=>b.replay.schemaCompatibilityPass=false],
    ['startup result',b=>b.evidence.startup.result='HOLD_STARTUP_ERROR'],['startup counts',b=>b.evidence.startup.errorSignalCount=1],['startup compat',b=>b.evidence.startup.eventCounts.SCHEMA_COMPATIBILITY_PASS=0],['receipt counts',b=>b.receipt.startup.stdoutLineCount=999],['receipt compat',b=>b.receipt.startup.schemaCompatibilityPass=false],
    ['PRE API history',b=>b.evidence.pre.containers.api.ociRevision='a'.repeat(40)],['protected image missing',b=>b.deployRecord.protectedImages.pop()],['marker old policy',b=>b.marker.previousEnv.CHANJET_SYNC_POLICY='READONLY_ACTIVE'],['time order',b=>b.evidence.post.capturedAt='2026-10-11T00:00:00Z'],
    ['PRE attempt',b=>b.evidence.pre.deployRunAttempt=2],['POST SHA',b=>b.evidence.post.targetSha='a'.repeat(40)],['startup run',b=>b.evidence.startup.deployRunId='99-1'],
    ['live API',b=>b.containers.api.id='9'.repeat(64)],['live DB mounts',b=>b.containers.db.mounts=[{}]],['PRE Web',b=>b.evidence.pre.containers.web.id='9'.repeat(64)],
    ['DB missing',b=>delete b.dbEvidence.entityRows],['DB drift',b=>b.dbEvidence.entityRows++],['DB receipt missing',b=>delete b.receipt.dbBaseline.entityRows],['flags',b=>b.liveEnv.CHANJET_READONLY_SYNC_ENABLED='true'],['readiness',b=>b.readinessHttp='500'],
    ['deploy expiry',b=>b.deployRecord.expiresAt='2099-01-01T00:00:00Z'],['marker expiry',b=>b.marker.expiresAt='2099-01-01T00:00:00Z'],['checkout',b=>b.checkout.clean=false],['migration',b=>b.deployRecord.migrationPaths=['fixture']],
  ];
  const {bundle,context}=await fixture(t);
  for(const [name,mutate]of cases){const b=clone(bundle);mutate(b);assert.equal(assessRecovery(b,context).eligible,false,name);}
});
for(const phase of ['ARCHIVED','ACTIVE_WRITTEN','DEPLOY_WRITTEN'])test(`strict full-plan and applied-state binding at ${phase}`,async t=>{
  const {bundle,context,archive}=await fixture(t);const plan=archive(phase);
  if(phase!=='ARCHIVED')bundle.active=clone(plan.active);if(phase==='DEPLOY_WRITTEN')bundle.deployRecord=clone(plan.deployRecord);
  assert.equal(assessRecovery(bundle,context).eligible,true);
  for(const mutate of [b=>b.archive.plan.active.protectedImages.push(image('9')),b=>b.archive.plan.deployRecord.previous.web.revision='9'.repeat(40),b=>b.archive.plan.deployRecord.recovery.recoveryRunId='777-1',b=>b.archive.archived[0].sha256='0'.repeat(64),b=>b.archive.archived.pop(),b=>b.archive.previousFloorSha='9'.repeat(40),b=>b.active.extra='unexpected']){const b=clone(bundle);mutate(b);assert.equal(assessRecovery(b,context).eligible,false);}
});
function assertComplete(dir,result){assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr+result.stdout);assert.equal((result.stdout.match(/DEPLOYMENT_RECOVERY=COMPLETE/g)||[]).length,1);
  for(const n of ['active.json',`deploy-${f.runId}.json`])assert.equal(JSON.parse(fs.readFileSync(path.join(dir,n))).outcome,'SUCCESS');
  const archive=JSON.parse(fs.readFileSync(path.join(dir,`recovery-${f.runId}.json`)));
  assert.equal(archive.phase,'COMPLETE');assert.equal(archive.previousFloorSha,f.previousFloorSha);
  const deploy=JSON.parse(fs.readFileSync(path.join(dir,`deploy-${f.runId}.json`)));
  assert.equal(deploy.recovery.classification,COMPLETE_ABORT_POINT);assert.equal(deploy.recovery.receiptSha256,archive.receiptSha256);
  assert.equal(archive.plan.active.active.api.revision,f.targetSha);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'floor.json'))),archive.archived.find(x=>x.name==='floor.json').value);
  for(const n of ['transaction.json','policy-transition.json'])assert.equal(fs.existsSync(path.join(dir,n)),false);
}
test('real recovery CLI finalizes the new path and refuses a second completion',async t=>{
  const x=await fixture(t);assertComplete(x.dir,x.runCli().result);
  const saved=Object.fromEntries(fs.readdirSync(x.dir).map(n=>[n,fs.readFileSync(path.join(x.dir,n),'utf8')]));
  // Read back the applied phase; a second invocation must be terminal HOLD.
  for(const [key,name]of [['active','active.json'],['deployRecord',`deploy-${f.runId}.json`],['archive',`recovery-${f.runId}.json`]])x.bundle[key]=JSON.parse(saved[name]);x.bundle.transaction=null;x.bundle.marker=null;
  const {result,before}=x.runCli();assert.equal(result.status,1);assert.match(result.stdout,/ALREADY_COMPLETE/);for(const[n,bytes]of Object.entries(before))assert.equal(fs.readFileSync(path.join(x.dir,n),'utf8'),bytes);
});
for(const [name,phase,mode] of [['active write before phase update','ARCHIVED','active'],['deploy write before phase update','ACTIVE_WRITTEN','deploy'],['partial marker cleanup','DEPLOY_WRITTEN','cleanup']])test(`real recovery CLI resumes ${name}`,async t=>{
  const x=await fixture(t);const plan=x.archive(phase);x.bundle.active=clone(plan.active);if(mode!=='active')x.bundle.deployRecord=clone(plan.deployRecord);if(mode==='cleanup')x.bundle.transaction=null;
  x.context.recoveryRunId='998878-1';assertComplete(x.dir,x.runCli().result);
  const a=JSON.parse(fs.readFileSync(path.join(x.dir,`recovery-${f.runId}.json`)));assert.equal(a.recoveryRunId,'998877-1');assert.ok(a.resumedByRunIds.includes('998878-1'));
});
for(const [name,mutate,options]of [['missing receipt',()=>{},{missingReceipt:true}],['receipt transport hash',()=>{},{wrongHash:true}],['wrong run',x=>x.context.targetRunId='99-1'],['wrong target',x=>x.context.approvedSha='0'.repeat(40)],['wrong previous floor',x=>x.context.previousFloorSha='0'.repeat(40)],['marker history',x=>x.bundle.marker.previousFloorSha='0'.repeat(40)],['deploy history',x=>x.bundle.deployRecord.previous.api.revision='0'.repeat(40)],['digest mismatch',x=>x.bundle.receipt.startup.combinedDigest='0'.repeat(64)],['PRE old API',x=>x.bundle.evidence.pre.containers.api.ociRevision='0'.repeat(40)],['protected image missing',x=>x.bundle.deployRecord.protectedImages.pop()],['marker historical policy',x=>x.bundle.marker.nextEnv.CHANJET_SYNC_POLICY='READONLY_ACTIVE'],['stored verify binding',x=>x.bundle.evidence.pre.phase='WRONG'],['replay error',x=>x.streams.stdout+='2026-10-12T00:00:03Z fatal: fixture\n'],['replay schema write',x=>x.streams.stdout+='2026-10-12T00:00:03Z ALTER TABLE fixture ADD example int\n'],['flags',x=>x.bundle.liveEnv.CHANJET_ERP_INBOUND_SYNC_ENABLED='true'],['expiry',x=>x.bundle.marker.expiresAt='2099-01-01T00:00:00Z'],['bad stored startup',x=>x.bundle.evidence.startup.result='HOLD_STARTUP_ERROR'],['live DB drift',x=>x.bundle.containers.db.id='9'.repeat(64)],['DB drift',x=>x.bundle.dbEvidence.entityRows++],['forged plan',x=>{x.archive();x.bundle.archive.plan.active.protectedImages.push(image('9'));}]])test(`real recovery CLI ${name} HOLD writes no state`,async t=>{
  const x=await fixture(t);mutate(x);const {result,before}=x.runCli(options);assert.equal(result.status,1,result.stdout+result.stderr);assert.doesNotMatch(result.stdout,/=COMPLETE/);
  assert.deepEqual(fs.readdirSync(x.dir).sort(),Object.keys(before).sort());for(const[n,bytes]of Object.entries(before))assert.equal(fs.readFileSync(path.join(x.dir,n),'utf8'),bytes);
});
