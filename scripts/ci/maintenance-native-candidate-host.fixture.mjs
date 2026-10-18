/** Native collector in an exclusive disposable hosted VM. Real default guards,
 * paths, FD9, Docker/API/PG and file readers; synthetic maintenance history and
 * authority. Never a release receipt, full lease or production admission. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { OwnedErpCandidateCapsule } from './maintenance-erp-candidate.fixture.mjs';
import { actualPhaseMaterials, stablePhaseStatus } from './maintenance-erp-phase-correlation.fixture.mjs';
import { toStopped } from './maintenance-transition-fixture.mjs';
import { CONTRACT, verifyContext, secureJson } from '../ops/production-config-guard.mjs';
import { MaintenanceReceiptStore, bindingDigest } from '../ops/production-maintenance-receipts.mjs';
import { LegacyMaintenanceTransition } from '../ops/production-maintenance-transition.mjs';
import { RootControlLease } from '../ops/production-maintenance-root-lease.mjs';
import { validateCandidateReplacement } from '../ops/production-maintenance-replacement.mjs';
import { collectCandidateServerBinding, collectCandidateLeaseBinding, inspectCandidateStorage, CANDIDATE_DOCKER_LIST_COUNTS } from '../ops/production-maintenance-candidate-binding.mjs';
import { PUBLIC_DIRECTORY, HOLD_KINDS, inspectPublicDirectory, atomicPublicManifest } from '../ops/background-control-manifest.mjs';

const output='/data/phoenix-erp/artifacts/maintenance-native-candidate-host';
const hash=value=>createHash('sha256').update(value).digest('hex');
const env={PATH:process.env.PATH,DOCKER_HOST:'unix:///var/run/docker.sock'};
const run=(program,args,options={})=>execFileSync(program,args,{env,encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['ignore','pipe','pipe'],...options}).trim();
const save=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
const writePrivate=(name,value)=>fs.writeFileSync(path.join(CONTRACT.stateDirectory,name),JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});
const check=()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const info=()=>fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').filter(line=>line.split(' ')[4]===PUBLIC_DIRECTORY);
async function joinChildren(children) {
  let timer;try {await Promise.race([Promise.all(children.map(c=>c.done)),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('NATIVE_FIXTURE_HOLD=CHILD_STDIO_CLOSE_UNVERIFIED')),10000);
  })]);}finally{clearTimeout(timer);}assert.ok(children.every(c=>c.closed));
}
function nativeFd9Counterexamples() {
  check();
  const probe=`import {CONTRACT,verifyContext} from './scripts/ops/production-config-guard.mjs';
    try{verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);process.exitCode=3;}
    catch(e){const missing=e.code==='ENOENT'&&e.path==='/proc/'+process.ppid+'/fd/9';
      const wrong=e.message==='CONFIG_HOLD=HOST_LOCK_REQUIRED';
      if((process.argv[1]==='missing'&&missing)||(process.argv[1]==='wrong'&&wrong)){process.stdout.write('EXPECTED_NATIVE_GUARD_DENIAL');process.exitCode=42;}else process.exitCode=4;}`;
  const other=path.join(CONTRACT.stateDirectory,'native-fixture-negative.lock');fs.writeFileSync(other,'',{mode:0o600,flag:'wx'});
  for(const mode of ['missing','wrong']) {
    let failure;
    try{run('/bin/bash',['-c',mode==='missing'
      ? 'exec 9>&-; "$1" --input-type=module -e "$2" missing; result=$?; exit "$result"'
      : 'exec 9<>"$3"; flock -n 9 || exit 6; "$1" --input-type=module -e "$2" wrong; result=$?; exit "$result"',
      'owned-fd9-negative',process.execPath,probe,other],{cwd:CONTRACT.repository});}catch(error){failure=error;}
    assert.equal(failure?.status,42);assert.equal(String(failure.stdout).trim(),'EXPECTED_NATIVE_GUARD_DENIAL');check();
  }
  return ['NATIVE_PARENT_FD9_MISSING_REJECTED','NATIVE_PARENT_FD9_WRONG_INODE_REJECTED'];
}

export function requireNativeHostRequest(e=process.env) {
  assert.equal(process.getuid(),0); assert.equal(e.NATIVE_FIXTURE_HOSTED,'github-hosted-exclusive-vm');
  assert.ok(['16','18'].includes(e.NATIVE_FIXTURE_MAJOR)); assert.match(e.NATIVE_FIXTURE_SHA,/^[a-f0-9]{40}$/);
  assert.equal(fs.realpathSync(process.cwd()),CONTRACT.repository); assert.equal(Number(process.versions.node.split('.')[0]),20);
  assert.equal(run('git',['-C',CONTRACT.repository,'rev-parse','HEAD']),e.NATIVE_FIXTURE_SHA);
  assert.equal(run('git',['-C',CONTRACT.repository,'status','--porcelain','--untracked-files=no']),'');
  assert.ok(fs.lstatSync(path.join(CONTRACT.repository,'.git')).isDirectory());
  check(); inspectPublicDirectory();
  const marker=secureJson('/var/lib/phoenix-erp/production-deployment-state/native-candidate-host-fixture.json');
  assert.equal(marker.schema,'phoenix.exclusive-native-host-fixture/v1');assert.equal(marker.fixtureOnly,true);assert.equal(marker.productionReceipt,false);
  assert.equal(marker.sourceSha,e.NATIVE_FIXTURE_SHA);assert.equal(marker.major,Number(e.NATIVE_FIXTURE_MAJOR));assert.equal(marker.parentShellPid,process.ppid);
  assert.ok(Number.isFinite(Date.parse(marker.createdAt))&&Date.now()>=Date.parse(marker.createdAt)&&Date.now()-Date.parse(marker.createdAt)<600000);
  assert.equal(marker.resourceDirectory,e.NATIVE_FIXTURE_OUTPUT);
  assert.ok(!fs.existsSync(path.join(CONTRACT.stateDirectory,'floor.json')));assert.ok(!fs.existsSync(path.join(PUBLIC_DIRECTORY,'manifest.json')));
}

export function writeOwnedFixtureReadonlyJson(file,value) {
  assert.equal(path.basename(file),'manifest.json');const parent=path.dirname(file),stat=fs.lstatSync(parent);
  assert.ok(stat.isDirectory()&&!stat.isSymbolicLink());assert.equal(stat.uid,process.getuid());assert.equal(fs.realpathSync(parent),parent);
  const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o444);
  try {fs.fchmodSync(fd,0o444);fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  const directory=fs.openSync(parent,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}
}
export function createOwnedFixturePublicShadow(directory,manifest) {
  const parent=path.dirname(directory),parentStat=fs.lstatSync(parent);
  assert.ok(parentStat.isDirectory()&&!parentStat.isSymbolicLink());assert.equal(parentStat.uid,process.getuid());assert.equal(fs.realpathSync(parent),parent);
  fs.mkdirSync(directory,{mode:0o700}); // EEXIST refuses an unrelated existing object.
  const fd=fs.openSync(directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  try {
    const owned=fs.fstatSync(fd);assert.ok(owned.isDirectory());assert.equal(owned.uid,process.getuid());
    writeOwnedFixtureReadonlyJson(path.join(directory,'manifest.json'),manifest);
    fs.fchmodSync(fd,0o555);fs.fsyncSync(fd);
    const actual=fs.lstatSync(directory);assert.equal(actual.dev,owned.dev);assert.equal(actual.ino,owned.ino);assert.equal(actual.mode&0o7777,0o555);
    return {dev:actual.dev,ino:actual.ino};
  } finally {fs.closeSync(fd);}
}
export async function buildReadableFixturePayload(action) {
  const previous=process.umask(0o022);
  try{return await action();}finally{process.umask(previous);}
}
function checkActualImageReadable(capsule,creation) {
  creation.attempted=true;creation.name=`phoenix-native-${capsule.owner}-image-read-probe`;creation.state='CREATE_OUTCOME_UNVERIFIED';
  capsule.record({nativeImageReadProbe:creation});
  const program=`const fs=require('fs');const checks=[],metadata=[];
    const code=e=>['EACCES','ENOENT','ENOTDIR','MODULE_NOT_FOUND'].includes(e.code)?e.code:'UNVERIFIED';
    for(const [name,p] of [['preload','/app/fixture-preload.cjs'],['compiledMain','/app/dist/main.js'],['packageJson','/app/package.json']]){
      try{fs.accessSync(p,fs.constants.R_OK);checks.push({name,readable:true});}catch(e){checks.push({name,readable:false,code:code(e)});}}
    try{fs.accessSync(require.resolve('pg'),fs.constants.R_OK);checks.push({name:'pgEntry',readable:true});}catch(e){checks.push({name:'pgEntry',readable:false,code:code(e)});}
    for(const [name,p] of [['app','/app'],['dist','/app/dist'],['modules','/app/node_modules'],['capsule','/app/node_modules/.capsule'],['preload','/app/fixture-preload.cjs']]){
      try{const s=fs.statSync(p);metadata.push({name,mode:s.mode&4095,uid:s.uid,gid:s.gid,directory:s.isDirectory()});}catch(e){metadata.push({name,code:code(e)});}}
    process.stdout.write(JSON.stringify({uid:process.getuid(),runtimePayloadReadable:checks.every(c=>c.readable),checks,metadata}));`;
  const id=capsule.own(capsule.docker(['create','--pull=never','--name',creation.name,...capsule.labels(),'--network=none','--read-only','--cap-drop=ALL',
    '--security-opt=no-new-privileges','--entrypoint','node',capsule.imageId,'-e',program]),'native-image-read-probe');
  creation.id=id;creation.state='OWNED_ID_VERIFIED';
  const value=JSON.parse(capsule.docker(['start','-a',id]));creation.result=value;
  assert.equal(value.uid,1000);assert.equal(value.runtimePayloadReadable,true);
  assert.deepEqual(value.checks.map(c=>c.name),['preload','compiledMain','packageJson','pgEntry']);assert.ok(value.checks.every(c=>c.readable===true));
  assert.equal(capsule.inspectContainer(id).State.ExitCode,0);
}

async function startNativeApi(capsule,pg,manifest,creation) {
  writeOwnedFixtureReadonlyJson(path.join(PUBLIC_DIRECTORY,'manifest.json'),manifest);
  inspectPublicDirectory();
  const values={NODE_ENV:'production',APP_ENV:'production',PORT:'3100',DB_HOST:'fixture-db',DB_PORT:'5432',DB_USER:'erp_candidate_writer',DB_NAME:'api_bootstrap_fixture',
    DB_PASSWORD:'',JWT_SECRET:'owned-erp-candidate-fixture-only-at-least-32-characters',CHANJET_SYNC_POLICY:'HOLD',CHANJET_READONLY_SYNC_ENABLED:'false',
    CHANJET_ERP_INBOUND_SYNC_ENABLED:'false',CHANJET_APP_KEY:'owned-fixture-app-key',CHANJET_APP_SECRET:'owned-fixture-app-secret',
    CHANJET_PROVIDER_BASE_URL:'http://127.0.0.1:3099',ERP_CANDIDATE_FIXTURE:capsule.owner,ERP_CAPTURE_APP:`native-${capsule.owner}`};
  creation.attempted=true;creation.name=`phoenix-native-${capsule.owner}`;creation.state='CREATE_OUTCOME_UNVERIFIED';
  capsule.record({nativeApiCreation:creation});
  const created=capsule.docker(['run','--pull=never','--name',creation.name,'-d',...capsule.labels(),'--label','com.docker.compose.project=phoenix-test','--label','com.docker.compose.service=api',
    '--network',pg.networkId,'--restart=no','--cap-drop=ALL','--security-opt=no-new-privileges',
    '--mount',`type=bind,source=${PUBLIC_DIRECTORY},target=/run/phoenix-background-control,readonly`,
    '--mount','type=bind,source=/data/maintenance-native-uploads,target=/app/uploads',
    ...Object.entries(values).flatMap(([key,value])=>['-e',`${key}=${value}`]),capsule.imageId]);
  assert.match(created,/^[a-f0-9]{64}$/);creation.returnedId=created;
  const id=capsule.own(created,'native-candidate');creation.state='OWNED_ID_VERIFIED';
  const candidate={id,pg,mode:'FENCED',publicSource:PUBLIC_DIRECTORY}; const end=Date.now()+45000;
  try {
    while(true){
      const runtime=capsule.inspectContainer(id); assert.equal(runtime.State.Running,true);
      try {const ready=capsule.request(candidate,'/api/readiness');if(ready.status===200&&runtime.State.Health?.Status==='healthy')break;} catch { /* Bounded initial startup. */ }
      assert.ok(Date.now()<end,'NATIVE_API_STARTUP_TIMEOUT'); await wait(100);
    }
  }catch{
    const stopped=capsule.inspectContainer(id),logs=capsule.logs(id);
    creation.startupDiagnostic={running:stopped.State.Running,status:stopped.State.Status,exitCode:stopped.State.ExitCode,oomKilled:stopped.State.OOMKilled,
      logSha256:hash(logs),signals:Object.fromEntries(['EACCES','PUBLIC_FILE_UNTRUSTED','PUBLIC_MANIFEST','BACKGROUND_STARTUP_HOLD','OWNED_ERP_CAPSULE_REQUIRED','MODULE_NOT_FOUND','SCHEMA'].map(code=>[code,logs.includes(code)]))};
    throw Error('NATIVE_FIXTURE_HOLD=API_STARTUP_CONTRACT_FAILED');
  }
  const status=await stablePhaseStatus(()=>capsule.status(candidate)); capsule.verifySession(candidate,status);
  assert.equal(status.owner,capsule.owner); assert.equal(status.generation,1);
  assert.equal(capsule.request(candidate,'/api/auth/login',{method:'POST',body:{}}).status,503);
  return {candidate,status};
}

async function exerciseNative() {
  requireNativeHostRequest(); fs.mkdirSync(output,{recursive:true,mode:0o700});
  const major=Number(process.env.NATIVE_FIXTURE_MAJOR),owner=`${Date.now()}-${process.pid}`;
  const capsule=new OwnedErpCandidateCapsule({owner}); let root,candidate,release,firstFailure,releaseSaved=false;
  const children=[],observations=[],counterexamples=[],apiCreation={attempted:false,state:'NOT_ATTEMPTED'},imageReadProbe={attempted:false,state:'NOT_ATTEMPTED'};
  const result={schema:'phoenix.native-host-candidate-fixture/v1',outcome:'FAIL',fixtureOnly:true,productionReceipt:false,
    sourceSha:process.env.NATIVE_FIXTURE_SHA,major,owner,registryInstalled:false,productionAuthorized:false,
    authority:'SYNTHETIC_TEST_ONLY',maintenanceReplacementAndHistory:'SYNTHETIC_TEST_ONLY',
    actualIo:['DEFAULT_ROOT_TRUSTED_PATHS_FD9','DEFAULT_STORAGE_FINDMNT','DEFAULT_PUBLIC_PRIVATE_FILE_READERS','DOCKER_RUNTIME_OCI_MOUNTS','ACTUAL_SOURCE_BUILT_API','ACTUAL_PG_CATALOG_ORIGINAL_ROOT'],
    fullCandidateLease:'NOT_RUN',continuousIngressProof:false,fiveDomainReconciliation:'NOT_RUN',formalDeploymentCompletion:'NOT_RUN',actualWebHttp:'NOT_RUN',resources:'OWNED_VM_RETAINED'};
  try {
    counterexamples.push(...nativeFd9Counterexamples());
    result.stage='BUILD_ACTUAL_SOURCE_IMAGE';result.imageBuild={attempted:true,tag:`phoenix-${owner}:candidate`,state:'BUILD_OUTCOME_UNVERIFIED'};
    // Only runtime build output needs ordinary read/traverse permissions. Host
    // control files keep explicit0600/0700 and the original restrictive umask.
    await buildReadableFixturePayload(()=>capsule.build());assert.equal(capsule.sourceSha,result.sourceSha);result.imageBuild.state='OWNED_ID_VERIFIED';result.imageBuild.id=capsule.imageId;
    result.stage='ACTUAL_UNPRIVILEGED_IMAGE_READ_PROBE';checkActualImageReadable(capsule,imageReadProbe);
    result.buildProvenance={sourceSha:result.sourceSha,pnpmLockSha256:hash(fs.readFileSync(path.join(CONTRACT.repository,'pnpm-lock.yaml'))),
      physicalSourcePackageMode:fs.statSync(path.join(CONTRACT.repository,'apps/api/package.json')).mode&0o777,
      runtimePackageSource:'EXACT_GIT_ARCHIVE_TRACKED_MODE_NOT_PRIVATE_CHECKOUT_MODE',
      dependencyInstallSource:'SYMLINK_TO_SAME_SHA_HOSTED_RUNNER_PNPM_FROZEN_LOCKFILE',runnerCheckout:process.env.NATIVE_FIXTURE_SOURCE,
      scope:'TRACKED_SOURCE_CLEAN_UNTRACKED_FIXTURE_OUTPUT_AND_DEPENDENCY_LINKS_EXCLUDED'};
    result.stage='START_ACTUAL_BOUND_POSTGRES';const pg=await capsule.startPostgres(major,{nativeDataSource:'/data/maintenance-native-pg'});
    const actualPg=capsule.inspectContainer(pg.id);
    const nativePgMount=actualPg.Mounts.find(m=>m.Source==='/data/maintenance-native-pg');
    assert.ok(nativePgMount&&nativePgMount.Type==='bind'&&nativePgMount.RW===true);
    const manifest={protocolVersion:1,phase:'FENCED',owner,generation:1,targetSha:capsule.sourceSha,participants:[]};
    result.stage='START_ACTUAL_BOUND_API';({candidate}=await startNativeApi(capsule,pg,manifest,apiCreation));
    // Evaluate the production expressions in Docker's actual Go template engine.
    // Nil/empty real host lists must read0; synthetic empty/nonempty list values
    // test template semantics without granting a container any new capability.
    result.stage='ACTUAL_DOCKER_LIST_TEMPLATE_MATRIX';result.dockerListTemplateCases=[];
    for(const expression of CANDIDATE_DOCKER_LIST_COUNTS){
      const field=/\.HostConfig\.(CapAdd|Devices|DeviceRequests)/.exec(expression)?.[0];assert.ok(field);
      const expressions=[expression,expression.replace(field,'(slice (split "fixture" ",") 0 0)'),expression.replace(field,'(split "fixture" ",")')];
      const values=capsule.docker(['inspect',candidate.id,'--format',expressions.map(v=>'{{json '+v+'}}').join('\t')]).split('\t').map(JSON.parse);
      assert.deepEqual(values,[0,0,1]);result.dockerListTemplateCases.push({field,actualEmptyCount:values[0],syntheticEmptyCount:values[1],syntheticNonemptyCount:values[2]});
    }
    const runtime=capsule.inspectContainer(candidate.id),dbRuntime=capsule.inspectContainer(pg.id),status=await stablePhaseStatus(()=>capsule.status(candidate));
    const database={containerId:pg.id,imageId:dbRuntime.Image,containerStartedAt:dbRuntime.State.StartedAt,
      ...JSON.parse(capsule.sql(pg,`SELECT json_build_object('databaseOid',(SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=current_database()),
      'postmasterStartedAt',to_char(pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'clusterSystemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()));`))};
    const material=actualPhaseMaterials({owner,sourceSha:capsule.sourceSha,imageId:capsule.imageId,runtime,status,dbRuntime,database});
    const context=material.context,store=new MaintenanceReceiptStore(context);
    const h={...material,store,engine:new LegacyMaintenanceTransition({context},{store,adapters:material.adapters,now:Date.now,
      // These callbacks authorize ONLY the synthetic fixture history. No default
      // reader, root guard, mount/catalog/API operation is replaced below.
      verifyAuthority:async()=>true,verifyEvidence:async()=>true})};
    const floor={version:3,floorSha:context.targetSha,phase:'READY',chanjetPolicy:'HOLD',readonlyApproval:null,project:context.replacement.project,
      operationalTuple:{PHOENIX_DATA_MOUNT_GUARD:'true',PHOENIX_PG_DATA_DIR:'/data/maintenance-native-pg',PHOENIX_UPLOADS_DIR:'/data/maintenance-native-uploads',
        CHANJET_READONLY_SYNC_ENABLED:'false',CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'}};
    writePrivate('floor.json',floor);
    writePrivate('maintenance-public-control.json',{schema:'phoenix.legacy-public-control/v1',contextDigest:bindingDigest(context),owner,
      previousFloorSha:context.previousFloorSha,targetSha:context.targetSha,stateDigest:'8'.repeat(64),phase:'PUBLISHING_LEGACY_FENCE',manifestDigest:hash(JSON.stringify(manifest)),
      generation:1,capturedAt:new Date().toISOString()});
    const originalStart=material.adapters.startCandidate;
    material.adapters.startCandidate=async request=>{
      root=new RootControlLease({context,approval:material.material.approval,expectedStateDigest:request.state.stateDigest,database,
        registerOwnedChild(child){const entry={pid:child.pid,closed:false};entry.done=new Promise(resolve=>child.once('close',()=>{entry.closed=true;resolve();}));children.push(entry);return {registered:true,pid:child.pid};}},
      {store,admit:async()=>true});
      await root.acquire({timeoutMs:120000}); return originalStart(request);
    };
    result.stage='BUILD_REAL_LOCAL_SYNTHETIC_HISTORY';await toStopped(h); await h.engine.reconcile({evidence:h.reconciliation});await h.engine.preparePromotion();await h.engine.replaceCandidate();
    result.stage='VALIDATE_TEST_REPLACEMENT_MATERIAL';const replacementState=store.readState();
    validateCandidateReplacement(h.engine.receipt(replacementState,'CANDIDATE_REPLACEMENT'),context);
    result.stage='ACQUIRE_ORIGINAL_NATIVE_ROOT';await h.engine.startCandidate();
    const originalVerify=material.adapters.verifyCandidate;
    const collect=async(mode,leasePhases=false)=>{
      const state=store.readState();
      const request={context,expectedStateDigest:state.stateDigest,replacementEvidence:h.engine.receipt(state,'CANDIDATE_REPLACEMENT'),rootLease:root,mode,timeoutMs:30000};
      // Intentionally no dependency injection: all collector/default I/O is real.
      const value=await (leasePhases?collectCandidateLeaseBinding:collectCandidateServerBinding)(request);
      assert.equal(value.result,'OBSERVATION_ONLY');assert.equal(value.registryInstalled,false);assert.equal(value.admissionOrApprovalGranted,false);
      observations.push(value);result.completedObservationCount=observations.length;return value;
    };
    material.adapters.verifyCandidate=async request=>{
      result.stage='DEFAULT_PRE_ADOPTION_COLLECTOR';await collect('PRE_ADOPTION');
      result.stage='ACTUAL_PUBLIC_BIND_GUARD_COUNTEREXAMPLE';
      const before=fs.statSync(PUBLIC_DIRECTORY),shadow='/data/native-public-shadow';
      const shadowIdentity=createOwnedFixturePublicShadow(shadow,manifest);result.shadowMount={source:shadow,target:PUBLIC_DIRECTORY,state:'MOUNT_OUTCOME_UNVERIFIED'};
      writePrivate('native-fixture-shadow-intent.json',result.shadowMount);
      assert.deepEqual(info(),[]);let ownedMount;
      try {
        run('/usr/bin/mount',['--bind',shadow,PUBLIC_DIRECTORY]);ownedMount=info();assert.equal(ownedMount.length,1);
        assert.equal(fs.statSync(PUBLIC_DIRECTORY).dev,shadowIdentity.dev);assert.equal(fs.statSync(PUBLIC_DIRECTORY).ino,shadowIdentity.ino);
        result.shadowMount.state='OWNED_MOUNT_VERIFIED';
        assert.throws(()=>inspectPublicDirectory(),error=>{
          result.publicGuardObservedCode=/^(?:BACKGROUND_HOLD|CONFIG_HOLD)=([A-Z0-9_]+)$/.exec(error?.message||'')?.[1]||'UNVERIFIED';
          return ['PUBLIC_DIRECTORY_UNAPPROVED_MOUNT','UNEXPECTED_CONTROL_MOUNT'].includes(result.publicGuardObservedCode);
        });
        await assert.rejects(()=>collect('PRE_ADOPTION'),/^Error: CANDIDATE_BINDING_HOLD=OBSERVATION_UNVERIFIED$/);
        counterexamples.push('ACTUAL_PUBLIC_BIND_REJECTED');
      } finally {
        // If native mount completion/identity cannot be established, retain it
        // as UNKNOWN rather than unmounting an unproven object.
        if(ownedMount?.length===1&&result.shadowMount.state==='OWNED_MOUNT_VERIFIED'){
          assert.deepEqual(info(),ownedMount);assert.equal(fs.statSync(PUBLIC_DIRECTORY).dev,shadowIdentity.dev);assert.equal(fs.statSync(PUBLIC_DIRECTORY).ino,shadowIdentity.ino);
          run('/usr/bin/umount',[PUBLIC_DIRECTORY]);assert.equal(fs.statSync(PUBLIC_DIRECTORY).ino,before.ino);assert.equal(fs.statSync(PUBLIC_DIRECTORY).dev,before.dev);result.shadowMount.state='RELEASED';}
        else assert.deepEqual(info(),[]);
      }
      result.stage='ACTUAL_STORAGE_GUARD_COUNTEREXAMPLE';const bounds={check(){},remaining:()=>3000};
      assert.throws(()=>inspectCandidateStorage({...floor.operationalTuple,PHOENIX_PG_DATA_DIR:CONTRACT.stateDirectory},bounds),/STORAGE_MOUNT_REQUIRED/);
      counterexamples.push('ACTUAL_FINDMNT_WRONG_STORAGE_REJECTED');
      manifest.generation=2;manifest.participants=[{bootId:status.bootId,containerId:candidate.id,revision:context.targetSha,allowedKinds:[...HOLD_KINDS]}];
      writePrivate('background-control.json',{protocolVersion:1,owner,previousFloorSha:context.previousFloorSha,targetSha:context.targetSha,generation:2,phase:'FENCED',
        manifestDigest:hash(JSON.stringify(manifest)),maintenanceContextDigest:bindingDigest(context),maintenanceStateDigest:request.state.stateDigest,
        adoptionEvidenceSha256:'d'.repeat(64),updatedAt:new Date().toISOString()});
      atomicPublicManifest(PUBLIC_DIRECTORY,manifest,inspectPublicDirectory);
      const adoptionEnd=Date.now()+5000;
      while(true){
        const live=await stablePhaseStatus(()=>capsule.status(candidate));assert.equal(live.bootId,status.bootId);
        if(live.generation===2)break;assert.equal(live.generation,1);assert.ok(Date.now()<adoptionEnd,'NATIVE_ADOPTION_PROJECTION_TIMEOUT');await wait(25);
      }
      result.stage='DEFAULT_ADOPTED_COLLECTOR';await collect('ADOPTED');return originalVerify(request);
    };
    await h.engine.verifyCandidate();result.stage='DEFAULT_PHASE_AWARE_COLLECTOR';await collect('ADOPTED',true);
    assert.equal(observations.length,3);assert.equal(children.length,1);
    assert.ok(observations.every(v=>v.rootBefore.observation.backends[0].pid===observations[0].rootBefore.observation.backends[0].pid));
    const beforeFiles=[];
    for(const name of fs.readdirSync(CONTRACT.stateDirectory).sort()){
      if(!/^maintenance-[a-z0-9-]+\.json$/.test(name)&&!['floor.json','background-control.json'].includes(name))continue;
      const raw=fs.readFileSync(path.join(CONTRACT.stateDirectory,name));beforeFiles.push({name,size:raw.length,sha256:hash(raw)});
    }
    save('protocol-file-manifest.json',{fixtureOnly:true,productionReceipt:false,sourceSha:result.sourceSha,files:beforeFiles});
    release=await root.close({timeoutMs:120000});await joinChildren(children);
    const gone=capsule.sql(pg,`SELECT count(*) FROM pg_stat_activity WHERE application_name='phoenix-maintenance-control:${owner}';`);assert.equal(gone,'0');
    capsule.verifySession(candidate);check();inspectPublicDirectory();
    result.outcome='PASS';result.runtime={id:candidate.id,imageId:capsule.imageId,revision:result.sourceSha,dbId:pg.id};
    result.originalControlChild={pid:children[0].pid,closed:true};result.rootBackendCountAfterClose=0;
    save('candidate-binding.json',{fixtureOnly:true,productionReceipt:false,outcome:'PASS',complete:true,sourceSha:result.sourceSha,observations});
    save('root-release.json',{fixtureOnly:true,productionReceipt:false,sourceSha:result.sourceSha,release});
    releaseSaved=true;
  } catch(error) {
    firstFailure=error;result.outcome='FAIL';result.failureClass=/^[A-Z_]+=([A-Z0-9_]+)$/.exec(error?.message||'')?.[0]||'NATIVE_FIXTURE_UNVERIFIED_FAILURE';
  } finally {
    if(root){try {if(!release)release=await root.close({timeoutMs:120000});}catch {result.rootCleanup='UNVERIFIED';result.outcome='FAIL';}}
    try {await joinChildren(children);}catch {result.childJoin='UNVERIFIED';result.outcome='FAIL';}
    if(release){
      try {assert.equal(release.ownedBackendGone,true);assert.equal(release.localClientClosed,true);assert.equal(release.owner,owner);
        assert.equal(release.productionReleaseAuthorized,false);assert.equal(release.candidateProof,false);
        if(!releaseSaved){save('root-release.json',{fixtureOnly:true,productionReceipt:false,sourceSha:result.sourceSha,release});releaseSaved=true;}
        result.rootCleanup=children.every(c=>c.closed)?'VERIFIED_OWNED_ROOT_RELEASE_ONLY':'UNVERIFIED_CHILD_STDIO';
      }catch{result.rootCleanup='UNVERIFIED';result.outcome='FAIL';}
    }
    if(observations.length&&!fs.existsSync(path.join(output,'candidate-binding.json'))){
      try{save('candidate-binding.json',{fixtureOnly:true,productionReceipt:false,outcome:'FAIL',complete:false,sourceSha:result.sourceSha,observations});}
      catch{result.observationArchive='UNVERIFIED';result.outcome='FAIL';}
    }
    result.ownedChildren=children.map(c=>({pid:c.pid,closed:c.closed}));result.apiCreation=apiCreation;result.imageReadProbe=imageReadProbe;
    result.pgCreationAttempts=capsule.nativeHostCreationAttempts||[];
    if(apiCreation.state==='CREATE_OUTCOME_UNVERIFIED'||imageReadProbe.state==='CREATE_OUTCOME_UNVERIFIED'||result.pgCreationAttempts.some(c=>c.state!=='OWNED_ID_VERIFIED'))result.outcome='FAIL';
    // Only immutable full IDs already proven owned by this capsule are stopped.
    // Images, networks, files and mounts are retained for VM disposal, not
    // described as a completed recovery or all-resources cleanup proof.
    result.containerDisposition=[];
    for(const resource of capsule.resources.filter(r=>r.type==='container').reverse()){
      try {const before=capsule.inspectContainer(resource.id);if(before.State.Running)capsule.docker(['stop','--time','35',resource.id],{timeout:45000});
        const after=capsule.inspectContainer(resource.id);
        result.containerDisposition.push({id:resource.id,state:after.State.Running?'UNVERIFIED':'STOPPED_RETAINED',exitCode:after.State.ExitCode,oomKilled:after.State.OOMKilled});
        if(after.State.Running||after.State.OOMKilled||after.State.ExitCode!==0)result.outcome='FAIL';
      }catch {result.outcome='FAIL';result.containerDisposition.push({id:resource.id,state:'UNVERIFIED'});}
    }
    save('guard-counterexamples.json',{fixtureOnly:true,productionReceipt:false,sourceSha:result.sourceSha,counterexamples});save('result.json',result);
  }
  assert.equal(firstFailure,undefined,'NATIVE_COLLECTOR_OR_DEFAULT_GUARD_FAILED');assert.equal(result.outcome,'PASS');
  console.log(JSON.stringify({outcome:result.outcome,major,sourceSha:result.sourceSha,productionReceipt:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname) {
  try{await exerciseNative();}catch{console.error('NATIVE_CANDIDATE_HOST_FIXTURE_FAILED');process.exitCode=1;}
}
