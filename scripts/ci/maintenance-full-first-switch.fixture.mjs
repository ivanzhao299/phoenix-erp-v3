/** ONE complete factory exercise in an exclusive disposable hosted VM.
 * Actual old226 source/new source, Docker switch, root/FD9, source readers,
 * PostgreSQL, ingress, snapshots, startup, formal SUCCESS and OPEN. Authority is
 * explicitly synthetic fixture data: no GitHub review or production receipt. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {OwnedErpCandidateCapsule} from './maintenance-erp-candidate.fixture.mjs';
const root='/data/phoenix-erp',state='/var/lib/phoenix-erp/production-deployment-state',old='226878864f184d26f41a890e666ebed52547db14',webSha='23c7af86dd122379d01248a3b9542b8165f31498';
const output=path.join(root,'artifacts/maintenance-native-candidate-host');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const env={PATH:process.env.PATH,DOCKER_HOST:'unix:///var/run/docker.sock',DOCKER_CONFIG:'/home/phoenix-codex-deploy/.docker'};
const run=(program,args,{input,timeout=10000,maxBuffer=1024*1024,buffer=false,cwd=root}={})=>{
 try{return execFileSync(program,args,{cwd,input,env,encoding:buffer?undefined:'utf8',timeout,maxBuffer,stdio:['pipe','pipe','pipe']});}
 catch(error){error.fixtureCommand={program:path.basename(program),operation:args[0],status:error.status??null,
  diagnostic:String(error.stderr||'').split('\n').filter(line=>/^(?:ERROR:|Error:|error:|docker:|nft:)/.test(line.trim())).map(line=>line.slice(0,240)).slice(0,4)};throw error;}
};
const git=args=>run('/usr/bin/git',['-c',`safe.directory=${root}`,'-c','core.hooksPath=/dev/null',...args]).trim();
const docker=(args,options)=>run('/usr/bin/docker',args,options).trim();
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fixtureAdmitted=false;
const result={schema:'phoenix.full-legacy-first-switch-fixture/v1',fixtureOnly:true,productionReceipt:false,productionAuthority:false,
 authority:'SYNTHETIC_ROOT_FIXTURE_ONLY',webImplementation:'OWNED_HTTP_PROTOCOL_PEER_NOT_NEXT_UAT',outcome:'PENDING',fullFactory:true,productionMutation:false};
const save=()=>{fs.mkdirSync(output,{recursive:true,mode:0o700});fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});};
let watchdog;
const armWatchdog=()=>{watchdog=setTimeout(()=>{result.outcome='HOLD';result.failureClass='FIXTURE_TIMEOUT';result.failureAt=new Date().toISOString();save();console.error(result.failureClass);process.exit(124);},15*60*1000);};
async function healthy(id){const until=Date.now()+60000;while(Date.now()<until){const row=JSON.parse(docker(['inspect',id,'--format','{{json .State}}']));if(!row.Running)throw Error('FULL_FIXTURE_RUNTIME_EXITED');if(row.Health?.Status==='healthy')return;await wait(200);}throw Error('FULL_FIXTURE_HEALTH_TIMEOUT');}
async function databaseReady(id){const until=Date.now()+60000;while(Date.now()<until){try{docker(['exec',id,'pg_isready','-h','127.0.0.1','-U','erp_fixture_admin','-d','api_bootstrap_fixture']);return;}catch{await wait(250);}}throw Error('FULL_FIXTURE_DATABASE_READY_TIMEOUT');}
async function main(){
 armWatchdog();
 assert.equal(process.getuid(),0);assert.equal(process.env.NATIVE_FIXTURE_HOSTED,'github-hosted-exclusive-vm');assert.equal(process.env.NATIVE_FIXTURE_FLOW,'legacy-first-switch');assert.equal(process.cwd(),root);assert.equal(Number(process.versions.node.split('.')[0]),20);
 const marker=JSON.parse(fs.readFileSync(path.join(state,'native-candidate-host-fixture.json')));
 assert.equal(marker.fixtureOnly,true);assert.equal(marker.productionReceipt,false);assert.equal(marker.parentShellPid,process.ppid);assert.equal(marker.sourceSha,git(['rev-parse','HEAD']));assert.equal(docker(['ps','-aq']),'');
 fixtureAdmitted=true;
 const sourceHead=marker.sourceSha,major=Number(process.env.NATIVE_FIXTURE_MAJOR),owner=`${Date.now()}-${process.pid}`,baseOwner=`${Date.now()}-${process.pid+1}`;
 assert.ok([16,18].includes(major));Object.assign(result,{sourceHead,major,owner,stage:'BUILD_ACTUAL_SOURCE_IMAGES'});save();
 fs.appendFileSync(path.join(root,'.git/info/exclude'),'\n/artifacts/\n/node_modules\n/apps/api/node_modules\n');
 const current=new OwnedErpCandidateCapsule({owner}),legacy=new OwnedErpCandidateCapsule({owner:baseOwner});
 const prior=process.umask(0o022);try{await current.build();await legacy.build({sourceRevision:old});}finally{process.umask(prior);}
 const currentBase=current.imageId,legacyImage=legacy.imageId,currentBaseTag=`phoenix-${owner}:candidate`;
 assert.equal(docker(['image','inspect',currentBaseTag,'--format','{{.Id}}']),currentBase);
 // Remove only the capsule's preload *entry command*, not application code.
 // Egress is physically constrained by this owned internal network instead.
 const build=path.join(state,'full-fixture-image-context');fs.mkdirSync(build,{mode:0o700});
 // Fixture-only compose overlays alter no application source and are committed
 // only in this disposable clone. Target/manifest/OCI all bind that exact tree.
 let compose=fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8');
 compose=compose.replace('image: postgres:16-alpine',`image: postgres:${major}-alpine`);
 fs.writeFileSync(path.join(root,'docker-compose.yml'),compose);
 git(['-c','user.name=Owned isolated fixture','-c','user.email=fixture@example.invalid','add','docker-compose.yml']);
 git(['-c','user.name=Owned isolated fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-qm','fixture: bind exclusive full first-switch target']);
 const target=git(['rev-parse','HEAD']);result.targetSha=target;result.applicationSourceSha=sourceHead;
 fs.writeFileSync(path.join(build,'Dockerfile'),`FROM ${currentBaseTag}\nLABEL org.opencontainers.image.revision=${target}\nCMD ["node","dist/main.js"]\n`,{mode:0o600});
 result.stage='BUILD_PINNED_CANDIDATE_IMAGE';save();
 const candidateTag=`phoenix-full-${owner}:candidate`;
 docker(['build','--network=none','--pull=false','-t',candidateTag,build],{timeout:120000});
 assert.equal(docker(['image','inspect',currentBaseTag,'--format','{{.Id}}']),currentBase);
 const candidateImage=docker(['image','inspect',candidateTag,'--format','{{.Id}}']);result.candidateImageId=candidateImage;result.previousImageId=legacyImage;
 result.stage='BUILD_OWNED_WEB_PEER';save();
 fs.writeFileSync(path.join(build,'Dockerfile'),`FROM node:20-bookworm-slim\nLABEL org.opencontainers.image.revision=${webSha}\nCMD ["node","-e","require('http').createServer((q,s)=>s.end('owned Web peer')).listen(3000,'0.0.0.0')"]\n`,{mode:0o600});
 const webTag=`phoenix-full-${owner}:web`;docker(['build','--network=none','--pull=false','-t',webTag,build],{timeout:60000});
 // A private bare origin makes main drift and fast-forward checks real Git I/O.
 const origin='/data/full-fixture-origin.git';git(['clone','--bare','--no-hardlinks',root,origin]);run('/usr/bin/git',['-C',origin,'update-ref','refs/heads/main',target]);
 git(['remote','set-url','origin',origin]);git(['fetch','origin','main']);
 const stage=path.join(state,`full-stage-${owner}`);fs.mkdirSync(stage,{mode:0o700});
 const helpers=git(['ls-tree','-r','--name-only',target,'--','scripts/ops','apps/api/src/common/database/api-bootstrap-schema-contract.json','docker-compose.yml']).split('\n').filter(file=>/^scripts\/ops\/[a-z0-9-]+\.(mjs|json|py|sh)$/.test(file)||['apps/api/src/common/database/api-bootstrap-schema-contract.json','docker-compose.yml'].includes(file));
 for(const file of helpers){const destination=path.join(stage,file);fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});fs.writeFileSync(destination,run('/usr/bin/git',['-c',`safe.directory=${root}`,'show',`${target}:${file}`],{buffer:true}),{mode:0o600});}
 fs.copyFileSync(path.join(stage,'apps/api/src/common/database/api-bootstrap-schema-contract.json'),path.join(stage,'scripts/ops/api-bootstrap-schema-contract.json'));
 const load=name=>import(pathToFileURL(path.join(stage,'scripts/ops',name)).href);
 const {canonicalDigest,bindingDigest,MAINTENANCE_AUTHORITY_SCHEMA}=await load('production-maintenance-receipts.mjs');
 const {captureRuntime}=await load('capture-production-runtime.mjs');
 const {observeMaintenanceProcessIdentity,verifyInstalledMaintenanceGuard}=await load('production-maintenance-root-readers.mjs');
 const {prepareMaintenanceRuntimeMaterials}=await load('production-maintenance-bootstrap.mjs');
 const {RELEASE_SCOPE}=await load('production-maintenance-deployment-session.mjs');
 const {runProductionMaintenanceSession}=await load('production-maintenance-production-entry.mjs');
 result.stage='START_OWNED_DATABASE_AND_LEGACY';save();
 const network=docker(['network','create','--label','com.docker.compose.project=phoenix-erp','--label',`phoenix.test.owner=${owner}`,'phoenix-erp_default']);
 // Docker internal bridges intentionally omit published ports. Use a normal
 // exclusive bridge and block its external forwarding before any app starts;
 // host published HTTP and same-bridge DB traffic remain real and reachable.
 const bridge='br-'+network.slice(0,12),egressFile=path.join(state,'full-fixture-egress.rules');
 assert.match(bridge,/^br-[a-f0-9]{12}$/);
 const egressProgram=`table inet phoenix_fixture_egress { chain forward { type filter hook forward priority -200; policy accept; iifname "${bridge}" oifname != "${bridge}" counter drop; }\n}\n`;
 fs.writeFileSync(egressFile,egressProgram,{mode:0o600,flag:'wx'});run('/usr/sbin/nft',['--file',egressFile]);
 result.fixtureEgress={bridge,programSha256:hash(egressProgram),scope:'EXCLUSIVE_VM_BRIDGE_FORWARDING_ONLY'};save();
 result.stage='START_DATABASE';save();
 const pgId=docker(['run','-d','--name','phoenix-v3-db','--label','com.docker.compose.project=phoenix-erp','--label','com.docker.compose.service=db','--network',network,'--network-alias','db','--restart=no',
  '--mount','type=bind,source=/data/maintenance-native-pg,target=/var/lib/postgresql/data','-e','PGDATA=/var/lib/postgresql/data','-e','POSTGRES_USER=erp_fixture_admin','-e','POSTGRES_DB=api_bootstrap_fixture','-e','POSTGRES_HOST_AUTH_METHOD=trust','--health-cmd','true','--health-interval','30s','--health-timeout','2s','--health-retries','40',`postgres:${major}-alpine`]);
 await healthy(pgId);await databaseReady(pgId);
 result.stage='CREATE_ISOLATED_SCHEMA';save();const sql=s=>docker(['exec','-i',pgId,'psql','-U','erp_fixture_admin','-d','api_bootstrap_fixture','-X','-qAt','-v','ON_ERROR_STOP=1'],{input:s});
 sql(fs.readFileSync(path.join(root,'scripts/ci/api-bootstrap-schema-fixture.sql'),'utf8')+`\nCREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE sys_menu(menu_code text);CREATE TABLE sys_chanjet_state(key varchar(16) PRIMARY KEY,app_ticket text,certificate text,tokens jsonb,updated_at timestamptz);
CREATE TABLE sys_notification_log(channel text,status text);CREATE TABLE mon_house_device_mapping(status text,vendor_house_id bigint);
CREATE TABLE mon_device_realtime_snapshot(id bigint,erp_house_code text,property_code text,value numeric,is_alarm boolean,collect_time bigint);
CREATE TABLE mon_device_property_dict(property_code text);
CREATE TABLE mon_device_property_history(id bigserial,erp_house_code text,property_code text,collect_time bigint,log_date date);
CREATE INDEX idx_mon_history_search ON mon_device_property_history(erp_house_code,property_code,log_date);
CREATE TABLE mon_device_alert_event(id bigint,erp_house_code text,property_code text,status text,property_name text,current_val numeric,created_at timestamptz);
CREATE TABLE sys_alerts(id bigint,alert_type text,title text,related_path text,resolved boolean,detail jsonb,created_at timestamptz);
CREATE TABLE sys_chanjet_api_budget(budget_key text,request_count integer,updated_at timestamptz);
CREATE TABLE chanjet_sync_jobs(status text,request_scope jsonb);CREATE TABLE chanjet_execution_admissions(phase text);CREATE TABLE chanjet_execution_requests(kind text,status text,result text);
CREATE ROLE erp_candidate_writer LOGIN;GRANT CONNECT ON DATABASE api_bootstrap_fixture TO erp_candidate_writer;GRANT USAGE,CREATE ON SCHEMA public TO erp_candidate_writer;GRANT ALL ON ALL TABLES IN SCHEMA public TO erp_candidate_writer;GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO erp_candidate_writer;`);
 result.stage='START_WEB_PEER_AND_OLD_API';save();
 const webId=docker(['run','-d','--name','phoenix-v3-web','--label','com.docker.compose.project=phoenix-erp','--label','com.docker.compose.service=web','--network',network,'--restart=no','-p','127.0.0.1:3000:3000','--health-cmd',"node -e \"fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1))\"",'--health-interval','1s',webTag]);
 const values={NODE_ENV:'production',APP_ENV:'production',PORT:'3100',DB_HOST:'db',DB_PORT:'5432',DB_USER:'erp_candidate_writer',DB_PASSWORD:'',DB_NAME:'api_bootstrap_fixture',JWT_SECRET:'owned-fixture-secret-at-least-32-characters',CHANJET_SYNC_POLICY:'HOLD',CHANJET_READONLY_SYNC_ENABLED:'false',CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'};
 const apiId=docker(['run','-d','--name','phoenix-v3-api','--label','com.docker.compose.project=phoenix-erp','--label','com.docker.compose.service=api','--network',network,'--network-alias','api','--restart=unless-stopped','-p','127.0.0.1:3100:3100','--mount','type=bind,source=/data/maintenance-native-uploads,target=/app/uploads',...Object.entries(values).flatMap(([k,v])=>['-e',`${k}=${v}`]),legacyImage,'node','dist/main.js']);
 result.stage='WAIT_OLD_API_HEALTH';save();await healthy(apiId);await healthy(webId);result.stage='READ_ACTUAL_OLD_404';save();
 const http=run('/usr/bin/curl',['-s','-o','/dev/null','--max-time','3','-w','%{http_code}','http://127.0.0.1:3100/api/internal/background/status']).trim();assert.equal(http,'404');result.oldControlHttp=Number(http);result.stage='VERIFY_INSTALLED_OLD_GUARD';save();
 const envValues={...values,PHOENIX_DATA_MOUNT_GUARD:'true',PHOENIX_PG_DATA_DIR:'/data/maintenance-native-pg',PHOENIX_UPLOADS_DIR:'/data/maintenance-native-uploads'};
 fs.writeFileSync(path.join(root,'.env'),Object.entries(envValues).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
 // Preserve every existing branch; only this disposable clone gets an old main.
 if(git(['branch','--list','main']))git(['branch','-m','main','fixture-original-main']);git(['switch','-c','main',old]);
 const actual=captureRuntime(),tuple=Object.fromEntries(['PHOENIX_DATA_MOUNT_GUARD','PHOENIX_PG_DATA_DIR','PHOENIX_UPLOADS_DIR','CHANJET_READONLY_SYNC_ENABLED','CHANJET_ERP_INBOUND_SYNC_ENABLED'].map(k=>[k,envValues[k]]));
 write(path.join(state,'floor.json'),{version:3,floorSha:old,phase:'READY',chanjetPolicy:'HOLD',readonlyApproval:null,project:'phoenix-erp',operationalTuple:tuple});
 write(path.join(state,'active.json'),{version:3,configSha:old,floorSha:old,outcome:'SUCCESS',active:actual,protectedImages:[actual.api.imageId,actual.web.imageId]});
 verifyInstalledMaintenanceGuard();
 const processPins=[];
 for(const name of fs.readdirSync('/proc').filter(n=>/^[1-9][0-9]*$/.test(n))){const pid=Number(name);if([process.pid,process.ppid].includes(pid))continue;let exe;
  try{exe=fs.readlinkSync(`/proc/${pid}/exe`);}catch(error){if(['ENOENT','ESRCH'].includes(error.code))continue;throw error;}
  if(!/\/(?:node|nodejs|python[0-9.]*|java|pm2|supervisord|nomad|kubelet)$/.test(exe))continue;
  const v=observeMaintenanceProcessIdentity(pid);processPins.push({pid,identitySha256:canonicalDigest(v),owner:'EXCLUSIVE_DISPOSABLE_VM_RUNNER_OR_OWNED_CONTAINER'});
 }
 // Active container namespaces are excluded by the real registry reader. This
 // file is explicit fixture ownership material, never production classification.
 write(path.join(state,'maintenance-host-ownership-registry.json'),{schema:'phoenix.maintenance-reviewed-host-ownership/v1',evidenceSha256:hash(JSON.stringify({fixtureOnly:true,processPins,network})),hostProcesses:processPins,containers:[]});
 const window={start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+29*60000).toISOString()};
 write(path.join(state,`owner-scoped-auth-unknown-${target}.json`),{schema:'phoenix.owner-scoped-auth-unknown-decision/v1',origin:'TRUSTED_INTERACTIVE_USER',authorizationRef:'OWNER_SCOPED_AUTH_UNKNOWN_NO_REPLAY',authorizationDigest:hash('SYNTHETIC_FIXTURE_NOT_A_USER_DECISION'),previousFloorSha:old,targetSha:target,oldApiContainerId:apiId,domain:'CHANJET_AUTH_REQUESTS',objects:[`api/${apiId}/chanjet-auth-lineage`],noReplay:true,businessMutation:false,window});
 const oldBoundary=(Math.floor(Date.now()/60000)+1)*60000+1500;result.stage='LEGACY_NEXT_REAL_SCHEDULER_BOUNDARY';save();
 while(Date.now()<oldBoundary)await wait(Math.min(250,oldBoundary-Date.now()));
 await healthy(apiId);result.oldSchedulerBoundaryObservedAt=new Date().toISOString();
 // Reconcile runner processes that appeared after the initial host snapshot.
 // Each late pin is accepted only after two identical identity reads, with no
 // repository/control reference; production readers never use this fixture
 // reconciliation path and remain default-deny for unknown host processes.
 const ownershipFile=path.join(state,'maintenance-host-ownership-registry.json'),ownership=JSON.parse(fs.readFileSync(ownershipFile));
 const latePins=[...ownership.hostProcesses];
 for(const name of fs.readdirSync('/proc').filter(n=>/^[1-9][0-9]*$/.test(n))){
  const pid=Number(name);if([process.pid,process.ppid].includes(pid)||latePins.some(pin=>pin.pid===pid))continue;
  let exe;try{exe=fs.readlinkSync(`/proc/${pid}/exe`);}catch(error){if(['ENOENT','ESRCH'].includes(error.code))continue;throw error;}
  if(!/\/(?:node|nodejs|python[0-9.]*|java|pm2|supervisord|nomad|kubelet)$/.test(exe))continue;
  let first,second;try{first=observeMaintenanceProcessIdentity(pid);second=observeMaintenanceProcessIdentity(pid);}catch(error){if(['ENOENT','ESRCH'].includes(error.code))continue;throw error;}
  if(first.erpControlReference||canonicalDigest(first)!==canonicalDigest(second))continue;
  latePins.push({pid,identitySha256:canonicalDigest(first),owner:'EXCLUSIVE_DISPOSABLE_VM_RUNNER_STABLE_IDENTITY'});
 }
 if(latePins.length!==ownership.hostProcesses.length){
  const updated={...ownership,hostProcesses:latePins};updated.evidenceSha256=hash(JSON.stringify({fixtureOnly:true,processPins:latePins,network}));
  fs.writeFileSync(ownershipFile,JSON.stringify(updated)+'\n',{mode:0o600});
 }
 result.stage='ACTUAL_SOURCE_PRE_RECOVERY_AND_FIVE_DOMAIN_BASELINE';save();
 const material=await prepareMaintenanceRuntimeMaterials({owner,targetSha:target,previousFloorSha:old,previousWebSha:webSha,window,image:candidateImage});
 const {context,packet,recoveryPlan,payload}=material;
 const grant={schema:'phoenix.owner-delegated-maintenance-grant/v1',repository:'ivanzhao299/phoenix-erp-v3',authorityKind:'OWNER_DELEGATED',authorizationOrigin:'TRUSTED_INTERACTIVE_USER',authorizationRef:'OWNER_EXECUTION_ORDER_V2_20261019',authorizationDigest:hash('SYNTHETIC_FIXTURE_ONLY'),delegate:{githubUserId:7245339,githubLogin:'emvia'},context,
  source:{headSha:sourceHead,treeSha:git(['rev-parse',`${sourceHead}^{tree}`]),prNumber:1,reviewId:1,reviewRecordDigest:hash('FIXTURE_NO_GITHUB_REVIEW'),sourceProvenanceDigest:hash('FIXTURE_NO_GITHUB_PROVENANCE'),mergedMainSha:target},
  dispatch:{runId:Number(owner.split('-')[0]),attempt:Number(owner.split('-')[1]),actorId:7245339,workflowSha:target,workflowPath:'.github/workflows/deploy.yml',event:'workflow_dispatch'},maintenanceWindowConfirmationDigest:hash('FIXTURE_WINDOW_ONLY'),scope:RELEASE_SCOPE,payloadSha256:canonicalDigest(payload),
  evidence:{preSnapshotDigest:canonicalDigest(context.preSnapshot),recoveryMaterialDigest:canonicalDigest(packet.recovery.files),candidateImageId:candidateImage,releaseArtifactId:1,releaseArtifactDigest:hash('FIXTURE_NO_ACTIONS_ARTIFACT')},registeredAt:new Date().toISOString(),expiresAt:context.window.end};
 const approval={schema:MAINTENANCE_AUTHORITY_SCHEMA,authorityKind:'OWNER_DELEGATED',decision:'AUTHORIZED',purpose:'MAINTENANCE',bindingDigest:bindingDigest(context),payload,payloadSha256:canonicalDigest(payload),ownerGrantSha256:canonicalDigest(grant)};
 write(path.join(state,`maintenance-owner-grant-${owner}.json`),grant);write(path.join(state,`maintenance-root-source-data-${owner}.json`),packet);
 write(path.join(state,`maintenance-release-plan-${owner}.json`),{schema:'phoenix.legacy-maintenance-release-plan/v1',context,scope:RELEASE_SCOPE,approvedPreviousFloorSha:old,approvedFloorSha:target,approval,recoveryPlan});
 Object.assign(process.env,{DEPLOY_RUN_ID:owner,DEPLOY_RUN_ATTEMPT:owner.split('-')[1],TARGET_SHA:target,APPROVED_CONFIG_FLOOR_SHA:target,APPROVED_PREVIOUS_FLOOR_SHA:old,DEPLOY_MODE:'api',BUILD_API:'true',BUILD_WEB:'false',RUN_MIG:'false',PRESERVE_ARTIFACTS:'true',ROTATE_CHANJET_CREDENTIALS:'false',ONE_TIME_CONFIG_FLOOR_TRANSITION:'false'});
 result.stage='ONE_DEFAULT_FACTORY_OLD_TO_NEW';save();
 const final=await runProductionMaintenanceSession();assert.equal(final.formalDeploymentOutcome,'SUCCESS');
 const currentFloor=JSON.parse(fs.readFileSync(path.join(state,'floor.json'))),formal=JSON.parse(fs.readFileSync(path.join(state,`deploy-${owner}.json`))),manifest=JSON.parse(fs.readFileSync('/var/lib/phoenix-background-control/manifest.json'));
 assert.equal(currentFloor.floorSha,target);assert.equal(currentFloor.phase,'READY');assert.equal(formal.outcome,'SUCCESS');assert.equal(formal.switched.web,false);assert.equal(manifest.phase,'OPEN');
 assert.equal(docker(['inspect','phoenix-v3-web','--format','{{.Id}}']),webId);assert.equal(docker(['inspect','phoenix-v3-db','--format','{{.Id}}']),pgId);
 for(const marker of ['maintenance-current.json','maintenance-transaction.json','transaction.json','policy-transition.json'])assert.equal(fs.existsSync(path.join(state,marker)),false,marker);
 result.stage='OPEN_NEXT_REAL_SCHEDULER_BOUNDARY';save();
 const openBoundary=(Math.floor(Date.now()/60000)+1)*60000+1500;while(Date.now()<openBoundary)await wait(Math.min(250,openBoundary-Date.now()));
 await healthy(docker(['inspect','phoenix-v3-api','--format','{{.Id}}']));
 const switches=JSON.parse(docker(['exec','phoenix-v3-api','node','-e',"console.log(JSON.stringify({policy:process.env.CHANJET_SYNC_POLICY,readonly:process.env.CHANJET_READONLY_SYNC_ENABLED,inbound:process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED}))"]));
 assert.deepEqual(switches,{policy:'HOLD',readonly:'false',inbound:'false'});result.openSchedulerBoundaryObservedAt=new Date().toISOString();
 clearTimeout(watchdog);result.outcome='PASS';result.stage='FULL_FACTORY_COMPLETED';result.session=final;result.actualFloor=currentFloor;result.actualDeployment=formal;result.publicPhase=manifest.phase;result.webDbIdentity='UNCHANGED';
 result.evidence=Object.fromEntries(['pre','post','log'].map(kind=>[kind,JSON.parse(fs.readFileSync(path.join(state,`maintenance-formal-${kind}-${owner}.json`)))]));save();
 console.log(JSON.stringify({outcome:'PASS',major,targetSha:target,fullFactory:true,fixtureOnly:true,productionReceipt:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)try{await main();}catch(error){clearTimeout(watchdog);result.outcome='HOLD';result.failureClass=/^\w+_HOLD=[A-Z0-9_]+$/.test(error?.message||'')?error.message:error?.code==='ERR_ASSERTION'?'FIXTURE_ASSERTION':'FIXTURE_UNVERIFIED_FAILURE';result.failureAt=new Date().toISOString();if(fixtureAdmitted&&result.owner){try{const owned=JSON.parse(fs.readFileSync(path.join(state,`maintenance-${result.owner}.json`)));result.ownedPhase={phase:owned.phase,status:owned.status,receiptCount:(owned.receipts||[]).length};}catch{result.ownedPhase='NOT_CREATED';}}result.errorType=error?.name||'Error';result.commandExit=Number.isInteger(error?.status)?error.status:null;result.failedCommand=error.fixtureCommand||null;result.ingressCommand=error.ingressCommand||null;result.ingressFailureClass=error.ingressFailureClass||null;result.preAdmissionDifference=error.preAdmissionDifference||null;result.registryDifference=error.registryDifference||null;result.unverifiedHostProcess=error.unverifiedHostProcess||null;result.databaseQuiescenceCounts=error.databaseQuiescenceCounts||null;if(/^FULL_FIXTURE_[A-Z_]+$/.test(error?.message||''))result.failureClass=error.message;result.failureFrames=String(error?.stack||'').split('\n').slice(1,9).filter(line=>/^\s+at /.test(line)).map(line=>line.replaceAll(root,'<owned-root>'));if(fixtureAdmitted)save();console.error(result.failureClass);process.exitCode=1;}
