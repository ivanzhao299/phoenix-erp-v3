// Run from the production checkout with its trusted SSH environment and FD9.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {atomicState} from './production-atomic-state.mjs';
import {assertLatestMain} from './background-deployment-session.mjs';
import {captureRuntime} from './capture-production-runtime.mjs';
import {assertFloor, CONTRACT, git, guardProduction, requireCleanMain} from './production-config-guard.mjs';
import {verifyHeldFollowUp} from './production-held-follow-up.mjs';
import {canonicalDigest, same} from './production-maintenance-receipts.mjs';
import {ModernSchemaRegistry} from './production-modern-schema-registration.mjs';

const runtimeSha='beff6954f08f1393457524476e3b62eba6a8bf4e';
const apiOwner='45299623179-1', webOwner='45300728078-1';
const opsFile='scripts/ops/production-modern-schema-rehearsal.mjs';
const reviewedCleanupBlob='103fff2cda4ff2c580af23e3489b5bd637dc01a9';
const allowed=new Set([opsFile,'scripts/ops/production-modern-schema-rehearsal.test.mjs',
 'scripts/ops/production-modern-schema-rehearsal.pg.test.mjs','scripts/ops/production-rehearsal-cleanup-publish.mjs']);
const origin='erp.eggslao.com', vhost='/etc/nginx/conf.d/'+origin+'.conf';
const originalHash='2843bf385f4ee46c0d3fcb13ecd6712d0af564cc1cd87a5fb01eda90480b9e6e';
const heldHash='b9c3ab91d4fbfebba33dfe262531a7d620e846d5b780644264d61296eb1d4ba8';
const intentName='schema-release-1123-origin-open-intent.json';
const attemptName='schema-release-1123-origin-open-attempt.json';
const terminalName='schema-release-1123-origin-open.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const native=(executable,args)=>execFileSync(executable,args,{env:{PATH:'/usr/sbin:/usr/bin:/bin'},encoding:'utf8',
 timeout:12000,stdio:['ignore','pipe','pipe']}).trim();
function readVhost(){
 const state=fs.lstatSync(vhost);
 assert(state.isFile()&&state.uid===0&&state.gid===0&&state.nlink===1&&(state.mode&0o7777)===0o644,'untrusted vhost');
 return fs.readFileSync(vhost);
}
function workers(){
 const master=fs.readFileSync('/run/nginx.pid','utf8').trim();
 assert(/^[1-9][0-9]*$/.test(master),'nginx master missing');
 const processes={};
 for(const pid of fs.readFileSync(`/proc/${master}/task/${master}/children`,'utf8').trim().split(/\s+/)){
  if(!/^[1-9][0-9]*$/.test(pid))continue;
  try{
   if(!fs.readFileSync(`/proc/${pid}/cmdline`).includes(Buffer.from('nginx: worker process')))continue;
   const started=fs.readFileSync(`/proc/${pid}/stat`,'utf8').split(/\)\s/).at(-1).trim().split(/\s+/)[19];
   assert(/^\d+$/.test(started),'nginx worker identity missing');
   processes[pid]=started;
  }catch(error){if(error.code!=='ENOENT')throw error;}
 }
 return {master,processes};
}
function edgeProbe(held){
 const routes=[['http','/',held?503:301],['https','/',held?503:200],
  ['https','/login',held?503:200],['https','/api/health',held?503:200]];
 for(const [scheme,route,expected] of routes){
  const response=native('/usr/bin/curl',['-q','--noproxy','*','--resolve',origin+':80:127.0.0.1',
   '--resolve',origin+':443:127.0.0.1','--max-time','4','-sSL','-o','/dev/null','-w','%{http_code}',
   ...(scheme==='http'?['--max-redirs','0','--no-location']:[]),scheme+'://'+origin+route]);
  assert.equal(response,String(expected),`origin route ${scheme}${route}`);
 }
}
function install(bytes,expected){
 assert.equal(sha(readVhost()),expected,'installed vhost changed');
 const directory=fs.mkdtempSync(path.join(path.dirname(vhost),'.phoenix-origin-')), staged=path.join(directory,'vhost');
 try{
  const file=fs.openSync(staged,'wx',0o644);
  try{fs.fchmodSync(file,0o644);fs.writeFileSync(file,bytes);fs.fsyncSync(file);}finally{fs.closeSync(file);}
  assert.equal(sha(readVhost()),expected,'installed vhost changed during staging');
  fs.renameSync(staged,vhost);
  const parent=fs.openSync(path.dirname(vhost),'r');
  try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
 }finally{
  if(fs.existsSync(staged))fs.unlinkSync(staged);
  fs.rmdirSync(directory);
 }
}
function reload(){
 native('/usr/sbin/nginx',['-t']);
 native('/usr/bin/systemctl',['reload','nginx']);
}
async function observeEdge(before,held){
 for(let attempt=0;attempt<60;attempt++){
  const current=workers();
  assert.equal(current.master,before.master,'nginx master changed');
  if(Object.keys(current.processes).length&&Object.entries(before.processes).every(([pid,start])=>current.processes[pid]!==start)){
   try{edgeProbe(held);return current;}catch(error){if(attempt===59)throw error;}
  }
  await delay(500);
 }
 throw Error('public origin or prior worker retirement unverified');
}

async function publish(target,operation){
 const root=CONTRACT.repository;
 assert(/^[a-f0-9]{40}$/.test(target||'')&&target!==runtimeSha&&['inspect','apply'].includes(operation),'exact publication input required');
 const store=new ModernSchemaRegistry();
 store.guard();
 requireCleanMain(root);
 assertLatestMain(target);
 const head=git(root,['rev-parse','HEAD']);
 assert([runtimeSha,target].includes(head),'unexpected production checkout');
 git(root,['merge-base','--is-ancestor',runtimeSha,target]);
 const changed=git(root,['diff','--name-only','--no-renames',runtimeSha,target]).split('\n');
 assert(changed.length===allowed.size&&changed.every(file=>allowed.has(file)),'unexpected publication scope');
 const floor=store.read('floor.json');
 assertFloor(root,floor,target,{targetTree:true});
 guardProduction(root,store.directory,captureRuntime());
 const original=execFileSync('/usr/bin/git',['-c','safe.directory='+root,'show',target+':nginx/'+origin+'.conf'],{cwd:root});
 assert.equal(sha(original),originalHash,'reviewed origin bytes changed');
 const server=Buffer.from('\nserver {\n'), injected=Buffer.from('\nserver {\n    # Phoenix maintenance 45144287071-1\n    return 503;\n');
 const held=Buffer.from(original.toString('utf8').replaceAll(server.toString(),injected.toString()),'utf8');
 assert.equal(sha(held),heldHash,'rollback bytes changed');
 const currentHash=sha(readVhost()), prior=store.exists(intentName)?store.read(intentName):null;
 const binding={schema:'phoenix.rehearsal-cleanup-publication/v1',target,runtimeSha,apiOwner,webOwner,
  cleanupBlob:git(root,['rev-parse',target+':'+opsFile]),originalHash,heldHash};
 assert(currentHash===heldHash||prior&&currentHash===originalHash,'unknown public ingress state');
 assert.equal(binding.cleanupBlob,reviewedCleanupBlob,'cleanup source is outside reviewed publication');
 if(prior)assert(same(prior.binding,binding),'existing intent belongs to another publication');
 const pending=prior&&store.exists(attemptName)?store.read(attemptName):null;
 if(pending)assert.equal(pending.intentSha256,canonicalDigest(prior),'opening attempt binding changed');
 if(pending&&currentHash===heldHash){
  const verifiedHeld=pending.phase==='REHELD'?pending.reheld:pending.workers;
  assert(same(verifiedHeld,workers()),'held nginx generation changed');
 }
 if(currentHash===originalHash)assert(pending?.phase==='APPLYING','no registered opening attempt');
 if(!store.exists(terminalName)){
  const checked=verifyHeldFollowUp('admit',{
   DEPLOY_MODE:'web',DEPLOY_RUN_ID:Date.now()+'-1',TARGET_SHA:runtimeSha,HELD_FOLLOW_UP:`web-${apiOwner}-verify-${webOwner}`,
   APPROVE_PRODUCTION:'true',PRESERVE_ARTIFACTS:'true',BUILD_API:'false',BUILD_WEB:'true',RUN_MIG:'false',
   ROTATE_CHANJET_CREDENTIALS:'false',ONE_TIME_CONFIG_FLOOR_TRANSITION:'false',
  },{latestMain:()=>assertLatestMain(target),...(pending?{edge:()=>edgeProbe(currentHash===heldHash)}:{})});
  assert.equal(checked.receiptOnly,true,'prior Web seal unverified');
 }
 if(operation==='inspect'){
  console.log(JSON.stringify({operation,target,runtimeSha,head,currentlyHeld:currentHash===heldHash,cleanupBlob:binding.cleanupBlob}));
  return;
 }
 if(head!==target)git(root,['merge','--ff-only',target]);
 requireCleanMain(root,target);
 guardProduction(root,store.directory,captureRuntime());
 const receiptName=`schema-release-1123-ops-published-${target}.json`;
 if(!store.exists(receiptName))store.immutable(receiptName,{binding,publishedAt:new Date().toISOString()});
 else assert(same(store.read(receiptName).binding,binding),'checkout publication receipt changed');
 if(store.exists(terminalName)){
  const terminal=store.read(terminalName);
  assert(prior&&same(terminal.binding,binding)&&terminal.intentSha256===canonicalDigest(prior)&&
   terminal.attemptSha256===canonicalDigest(store.read(attemptName))&&currentHash===originalHash,'public terminal changed');
  edgeProbe(false);
  console.log(JSON.stringify(terminal));
  return;
 }
 native('/usr/bin/systemctl',['is-active','--quiet','nginx']);
 native('/usr/sbin/nginx',['-t']);
 const intent=prior??{binding,registeredAt:new Date().toISOString()};
 if(!prior)store.immutable(intentName,intent);
 const intentHash=canonicalDigest(intent);
 if(currentHash===heldHash){
  const before=workers();
  assert(Object.keys(before.processes).length>0,'running nginx workers required');
  atomicState(store.file(attemptName),{intentSha256:intentHash,phase:'APPLYING',workers:before,startedAt:new Date().toISOString()});
 }
 const attempt=store.read(attemptName);
 assert.equal(attempt.intentSha256,intentHash,'opening attempt binding changed');
 assertLatestMain(target);
 try{
  if(currentHash===heldHash){install(original,heldHash);reload();}
  const current=await observeEdge(attempt.workers,false);
  assert.equal(sha(readVhost()),originalHash,'restored origin changed');
  guardProduction(root,store.directory,captureRuntime());
  assertLatestMain(target);
  const terminal={binding,intentSha256:intentHash,attemptSha256:canonicalDigest(attempt),openedAt:new Date().toISOString(),workers:current,
   outcome:'OPEN',probe:{http:301,httpsHome:200,httpsLogin:200,httpsHealth:200}};
  store.immutable(terminalName,terminal);
  console.log(JSON.stringify(terminal));
 }catch(error){
  if(!store.exists(terminalName)&&sha(readVhost())===originalHash){
   const opening=workers();
   install(held,originalHash);
   reload();
   const reheld=await observeEdge(opening,true);
   atomicState(store.file(attemptName),{...attempt,phase:'REHELD',reheld,rollbackAt:new Date().toISOString()});
  }
  throw error;
 }
}
try{await publish(process.argv[3],process.argv[2]);}
catch(error){console.error('PHOENIX_CLEANUP_PUBLISH_HOLD='+error.message.split('\n')[0]);process.exitCode=1;}
