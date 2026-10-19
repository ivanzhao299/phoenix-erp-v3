import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {observeRecoveryCoreMaterials,RECOVERY_CORE_FILES} from './production-maintenance-recovery-materials.mjs';
import {bindingDigest,canonicalDigest,MAINTENANCE_CONTEXT_SCHEMA} from './production-maintenance-receipts.mjs';
import {CONTRACT} from './production-config-guard.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),now=Date.parse('2026-10-18T01:10:00.000Z'),time=n=>new Date(now+n).toISOString();
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-owned-materials-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const owner='123456-1',directory=path.join(root,'maintenance-materials-'+owner);fs.mkdirSync(directory,{mode:0o700});
 const put=(file,bytes)=>{const p=path.join(directory,file);fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,bytes,{mode:0o600});};
 const pin=(n,revision='a'.repeat(40))=>({id:n.repeat(64),imageId:'sha256:'+n.repeat(64),revision,startedAt:time(-86400000),restartCount:0,running:true,health:'healthy'});
 const api=pin('1'),web=pin('2','c'.repeat(40)),db={...pin('3'),mountsSha256:'4'.repeat(64)};delete db.revision;
 const targetSha='b'.repeat(40),manifest={schema:'phoenix.maintenance-core-helper-files/v1',targetSha,files:RECOVERY_CORE_FILES.map(file=>{const bytes='fixture-source:'+file;put('helpers/'+file,bytes);return {path:file,sha256:hash(bytes)};})};
 const context={schema:MAINTENANCE_CONTEXT_SCHEMA,protocolVersion:1,owner,previousFloorSha:'a'.repeat(40),previousApiSha:'a'.repeat(40),previousWebSha:'c'.repeat(40),targetSha,window:{start:time(-10000),end:time(100000)},candidate:{revision:targetSha,imageId:'sha256:'+'5'.repeat(64)},sourceHelperSha256:canonicalDigest(manifest),schemaEvidenceSha256:'7'.repeat(64),migrationPaths:[],preSnapshot:{api,web,db},executors:[api]};
 const procedure='HOLD. Contact approved operator. No automatic rollback, restore or replay.\n';
 const plan={bindingDigest:bindingDigest(context),strategy:'COMPATIBLE_CANDIDATE_OR_HOLD',automaticOldRuntimeRollback:false,automaticDatabaseRestore:false,businessReplay:false,responsibleOperator:'on-call',procedureSha256:hash(procedure),stopConditions:['INGRESS_LOST','UNKNOWN_SIDE_EFFECTS','CANDIDATE_FAILED','FLOOR_STATE_INCONSISTENT'],materials:[{kind:'CANDIDATE_IMAGE',sha256:'5'.repeat(64),imageId:context.candidate.imageId,revision:targetSha},{kind:'SOURCE_HELPERS',sha256:context.sourceHelperSha256},{kind:'PRE_SNAPSHOT',sha256:canonicalDigest(context.preSnapshot)},{kind:'RECOVERY_PROCEDURE',sha256:hash(procedure)}]};
 put('helpers.json',JSON.stringify(manifest));put('pre.json',JSON.stringify({owner,targetSha,previousFloorSha:context.previousFloorSha,runtime:context.preSnapshot}));put('procedure.txt',procedure);
 const calls=[],controller=new AbortController(),request={context,recoveryPlan:plan,signal:controller.signal};
 const inspect=dir=>{const values=[];let current=dir;while(current.startsWith(root)){const stat=fs.lstatSync(current);assert.equal(stat.isDirectory()&&!stat.isSymbolicLink(),true);assert.equal(stat.uid,process.getuid());assert.equal(stat.mode&0o7777,0o700);values.push([current,stat.dev,stat.ino,stat.uid,stat.mode]);if(current===root)break;current=path.dirname(current);}return values;};
 const dependencies={guard:()=>{},stateDirectory:root,expectedUid:process.getuid(),inspectDirectory:inspect,now:()=>now,run:args=>{calls.push(args);return args.at(-1)==='{{.Id}}'?context.candidate.imageId:context.targetSha;}};
 return {root,directory,put,context,plan,manifest,controller,request,dependencies,calls,read:()=>observeRecoveryCoreMaterials(request,dependencies)};
}
test('actual pinned file bytes and local exact image are observed without recovery or approval claims',t=>{
 const f=fixture(t),out=f.read();assert.equal(out.status,'CORE_MATERIALS_OBSERVED');assert.equal(out.files.length,34);assert.equal(out.image.digestKind,'DOCKER_IMAGE_CONFIG_ID');
 for(const key of ['recoveryReady','productionMutation','admissionOrApprovalGranted','registryInstalled'])assert.equal(out[key],false);
 assert.ok(out.unverified.includes('OLD_INSTALLED_GUARD_CLOSURE'));assert.equal(f.calls.length,2);assert.ok(f.calls.every(args=>args[0]==='image'&&args[1]==='inspect'&&args[2]===f.context.candidate.imageId));
 assert.ok(!JSON.stringify(out).includes('Contact approved operator'));assert.ok(RECOVERY_CORE_FILES.every(file=>CONTRACT.criticalFiles.includes(file)));
});
test('the physical core helper closure can actually load the session with its retained-controller dependency',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-owned-helper-import-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 for(const relative of RECOVERY_CORE_FILES){
  const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  fs.copyFileSync(path.join(source,relative),file);fs.chmodSync(file,0o600);
 }
 const loaded=await import(pathToFileURL(path.join(root,'scripts/ops/production-maintenance-deployment-session.mjs')).href);
 assert.equal(typeof loaded.LegacyMaintenanceDeploymentSession,'function');
 assert.ok(loaded.SESSION_STEPS.includes('BOOTSTRAP_CONTROLLERS'));
 // Loading source creates no factory, approval or production mutation.
 assert.deepEqual(fs.readdirSync(root).sort(),['apps','docker-compose.yml','scripts']);
});
test('default production guard denies an isolated unprivileged context rather than using fixture authority',t=>{
 const f=fixture(t);f.context.window={start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+60000).toISOString()};f.plan.bindingDigest=bindingDigest(f.context);assert.throws(()=>observeRecoveryCoreMaterials(f.request),/CONFIG_HOLD|ROOT|CONTEXT|ENOENT/);assert.equal(f.calls.length,0);
});
test('missing and tampered physical materials fail before any image observation',t=>{
 for(const file of ['pre.json','procedure.txt','helpers.json','helpers/'+RECOVERY_CORE_FILES[0]]){
  const f=fixture(t);fs.unlinkSync(path.join(f.directory,file));assert.throws(f.read);assert.equal(f.calls.length,0);
  const g=fixture(t);g.put(file,'tampered');assert.throws(g.read);assert.equal(g.calls.length,0);
 }
});
test('symlinks hardlinks and broad permissions cannot replace protected materials',t=>{
 for(const change of ['symlink','hardlink','mode']){
  const f=fixture(t),file=path.join(f.directory,'procedure.txt');
  if(change==='mode')fs.chmodSync(file,0o644);else{const target=path.join(f.directory,'owned-copy');fs.renameSync(file,target);change==='symlink'?fs.symlinkSync(target,file):fs.linkSync(target,file);}
  assert.throws(f.read,/FILE_PERMISSIONS_OR_LINK/);assert.equal(f.calls.length,0);
 }
});
test('helper manifests cannot omit duplicate add or traverse files even with freshly matching plan hashes',t=>{
 for(const change of ['missing','duplicate','extra','traverse']){
  const f=fixture(t);if(change==='missing')f.manifest.files.pop();if(change==='duplicate')f.manifest.files[1]=f.manifest.files[0];if(change==='extra')f.manifest.files.push({path:'extra.mjs',sha256:'a'.repeat(64)});if(change==='traverse')f.manifest.files[0].path='../procedure.txt';
  f.context.sourceHelperSha256=canonicalDigest(f.manifest);f.plan.materials.find(m=>m.kind==='SOURCE_HELPERS').sha256=f.context.sourceHelperSha256;f.plan.bindingDigest=bindingDigest(f.context);f.put('helpers.json',JSON.stringify(f.manifest));assert.throws(f.read,/CORE_HELPER_MANIFEST/);
 }
});
test('old-context PRE and wrong image hash cannot be accepted as current recovery inputs',t=>{
 const f=fixture(t);const pre=JSON.parse(fs.readFileSync(path.join(f.directory,'pre.json')));pre.owner='123456-2';f.put('pre.json',JSON.stringify(pre));assert.throws(f.read,/PRE_BINDING/);
 const g=fixture(t);g.plan.materials[0].sha256='6'.repeat(64);assert.throws(g.read,/IMAGE_CONFIG_ID/);
 const h=fixture(t);h.plan.materials.push(h.plan.materials[0]);assert.throws(h.read,/FOUR_UNIQUE/);
});
test('wrong image ID revision or missing local image never triggers pulling or a fallback',t=>{
 for(const fault of ['id','revision','missing']){
  const f=fixture(t);f.dependencies.run=args=>{f.calls.push(args);if(fault==='missing')throw Error('DO_NOT_RELAY_PRIVATE_ERROR');return args.at(-1)==='{{.Id}}'?(fault==='id'?'sha256:'+'9'.repeat(64):f.context.candidate.imageId):(fault==='revision'?'9'.repeat(40):f.context.targetSha);};
  assert.throws(f.read,error=>/LOCAL_IMAGE_IDENTITY/.test(error.message)&&!error.message.includes('PRIVATE'));assert.ok(f.calls.every(args=>args[0]==='image'&&args[1]==='inspect'));
 }
});
test('plan mutation material replacement abort and deadline changes reject results',t=>{
 for(const fault of ['context','plan','file','abort','timeout']){
  const f=fixture(t),run=f.dependencies.run;let ticks=now;
  f.dependencies.now=()=>ticks;f.dependencies.run=args=>{const value=run(args);if(fault==='context')f.context.schemaEvidenceSha256='8'.repeat(64);if(fault==='plan')f.plan.responsibleOperator='changed';if(fault==='file')f.put('procedure.txt','changed');if(fault==='abort')f.controller.abort();if(fault==='timeout')ticks+=10001;return value;};
  assert.throws(f.read,/REQUEST_CHANGED|MATERIAL_REPLACED|MATERIAL_CHANGED|ABORTED|DEADLINE/);
 }
});
test('oversized empty and replaced parent directories fail closed',t=>{
 for(const bytes of [Buffer.alloc(0),Buffer.alloc(1024*1024+1)]){const f=fixture(t);f.put('procedure.txt',bytes);assert.throws(f.read,/FILE_SIZE/);}
 const f=fixture(t);fs.chmodSync(path.join(f.directory,'helpers'),0o755);assert.throws(f.read);assert.equal(f.calls.length,0);
});


test('actual owned scratch image config ID and OCI revision are checked without starting a container',{skip:process.env.RECOVERY_MATERIAL_LOCAL_IMAGE_FIXTURE!=='1',timeout:60000},t=>{
 const f=fixture(t),owner=randomUUID(),tag='phoenix-owned-recovery-material:'+owner;
 const source=path.join(f.root,'image');fs.mkdirSync(source,{mode:0o700});
 fs.writeFileSync(path.join(source,'Dockerfile'),'FROM scratch\nLABEL phoenix.fixture.owner="'+owner+'" org.opencontainers.image.revision="'+f.context.targetSha+'"\n',{mode:0o600});
 const docker=args=>execFileSync('/usr/bin/docker',args,{env:{PATH:'/usr/bin:/bin',DOCKER_HOST:'unix:///var/run/docker.sock'},encoding:'utf8',timeout:30000,maxBuffer:16384,stdio:['ignore','pipe','pipe']}).trim();
 let id,observation;
 try{
  id=docker(['build','--quiet','--network','none','--pull=false','--tag',tag,source]);assert.match(id,/^sha256:[a-f0-9]{64}$/);
  assert.equal(docker(['image','inspect',id,'--format','{{index .Config.Labels "phoenix.fixture.owner"}}']),owner);
  f.context.candidate.imageId=id;f.plan.materials[0].imageId=id;f.plan.materials[0].sha256=id.slice(7);f.plan.bindingDigest=bindingDigest(f.context);
  delete f.dependencies.run;
  const out=f.read();observation=out;assert.equal(out.image.imageId,id);assert.equal(out.image.revision,f.context.targetSha);assert.equal(out.recoveryReady,false);
 }finally{if(id){assert.equal(docker(['image','inspect',id,'--format','{{index .Config.Labels "phoenix.fixture.owner"}}']),owner);docker(['image','rm',id]);assert.equal(docker(['image','ls','--quiet','--no-trunc','--filter','label=phoenix.fixture.owner='+owner]),'');}}
 const receipts=new URL('../../artifacts/maintenance-recovery-core-materials/',import.meta.url);fs.mkdirSync(receipts,{recursive:true,mode:0o700});
 const receipt=new URL(owner+'.json',receipts);fs.writeFileSync(receipt,JSON.stringify({schema:'phoenix.owned-core-material-fixture/v1',owner,imageId:id,observation,result:'PASS',ownedImageCleanup:'CONFIRMED',productionConnectionExecuted:false,productionMutation:false},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log('OWNED_CORE_MATERIAL_RECEIPT='+receipt.pathname);
});


test('same-byte atomic inode replacement between final identity check and reread is rejected',t=>{
 const f=fixture(t),target=path.join(f.directory,'procedure.txt'),io=Object.create(fs);let reads=0;
 io.lstatSync=file=>{const stat=fs.lstatSync(file);if(file===target&&++reads===5){const next=target+'.owned-next';fs.writeFileSync(next,fs.readFileSync(file),{mode:0o600,flag:'wx'});fs.renameSync(next,file);}return stat;};
 f.dependencies.fs=io;assert.throws(f.read,/MATERIAL_REPLACED/);assert.ok(reads>=6);
});
test('replacing a signal cannot change the operation cancellation identity',t=>{
 const f=fixture(t),run=f.dependencies.run;f.dependencies.run=args=>{f.request.signal=new AbortController().signal;return run(args);};assert.throws(f.read,/SIGNAL_CHANGED/);
});
