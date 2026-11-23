import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {parseSuccessorAction,successorBinding,successorDecisions,successorPlan,successorRuntime,validPublicInspection} from './production-modern-schema-successor.mjs';
import {defaultOffEvidenceFromFacts,captureModernSchemaDefaultOff} from './production-modern-schema-facts.mjs';
import {frozenGroupsDigest} from './production-modern-schema-predecessor.mjs';
import {checkSuccessorWeb} from './production-modern-schema-web-successor.mjs';
const h=n=>n.repeat(64),sha=n=>n.repeat(40),img=n=>'sha256:'+h(n);
const owner='1234-1',floor=sha('b'),target=sha('c');
const names=['1795400100000-ProductionDocumentContinuations','1795400200000-ProductionFinanceReview','1795400300000-CutoverStateReceipts'];
const blobs=['4dbf4aa3d1ae76a3622db747e5d646bb2c959e86','d135f8b988d2db6163b9bb54f422cf7fb5924e19','31dbb08ac8979b5c9aadcd70e8f7d1f8b1b2879a'];
function candidate(){
 const units=names.map((file,i)=>{
  const [timestamp,name]=file.split('-');
  return {timestamp:Number(timestamp),effectiveName:name+timestamp,path:'apps/api/src/database/migrations/'+file+'.ts',
    sourceBlob:blobs[i],compiledSha256:h(String(i+1))};
 });
 return {runtimeSha:successorRuntime,targetSha:target,candidateImageId:img('d'),sourceInventorySha256:'ba7ee5773047ea5676e7314b2726cae35f1398f139869cda1699aaa830c4b275',candidateInventorySha256:h('f'),
  runtimeInventorySha256:'c061666c12adc75ae20fbc68d76af9c69be81ce107fa9c728b7acf0e0824ce91',
  beforeLedgerSha256:'4bd27f1eb8eb96fa1dfd18e39ef2f81aaaa9628c396d3b2413451845336381e4',pendingMigrations:units,changedMigrationPaths:units.map(u=>u.path)};
}
function preview(){
 const binding=successorBinding(floor,candidate());
 const content={schema:'phoenix.remediation-1123-inspection/v1',owner,binding,restoreMs:999,originalReadyMs:1111,rehearsalMs:4000,
  apiAccess:{pilotStatus:'PILOT_NOT_READY'},auditEvidenceSha256:h('9'),runtimeImageId:img('4'),webImageId:img('5'),historicalAudit:'HOLD',historicalQuantity:60,productionMutation:false,businessActivation:false,
  predecessorSha256:h('7'),testManifestSha256:h('8'),rehearsalSha256:h('9'),defaultOffEvidenceSha256:h('0'),hostSurfaceSha256:h('1')};
 return {...content,inspectionSha256:canonicalDigest(content)};
}
const selection=p=>'approve1123-'+owner+'-'+p.inspectionSha256+'-700-800-1795401000-1795404600';
test('reviewed predecessor, source blobs, compiled units and exact immutable inspection bind the control instruction',()=>{
 const p=preview(),binding=p.binding;
 assert.equal(successorPlan(binding),true);
 const request=selection(p),store={read:name=>{assert.equal(name,'schema-release-1123-inspect-'+owner+'.json');return p;}};
 const approved=successorDecisions(store,request,floor,candidate());
 assert.equal(approved.approval.acceptanceRunId,'800');assert.equal(approved.webImageId,p.webImageId);
 assert.equal(approved.recoveryReserveMs,Math.ceil((p.restoreMs+p.originalReadyMs)*1.25)+150000);
 for(const mutate of [v=>v.pendingMigrations.pop(),v=>v.pendingMigrations[0].sourceBlob=sha('1'),v=>v.pendingMigrations[0].compiledSha256=h('f'),
  v=>v.candidateImageId=img('3'),v=>v.targetSha=sha('a'),v=>v.beforeLedgerSha256=h('1'),v=>v.runtimeInventorySha256=h('2')]){
  const changed=candidate();mutate(changed);assert.throws(()=>successorDecisions(store,request,floor,changed));
 }
 for(const value of ['inspect1123',request.replace(p.inspectionSha256,h('0')),request.replace('1795404600','1795401001'),request.replace('1795404600','1795424600')]){
  assert.throws(()=>successorDecisions(store,value,floor,candidate()));
 }
 assert.equal(parseSuccessorAction('1234-1'),null);
 assert.throws(()=>successorDecisions({read:()=>({...p,webImageId:img('9')})},request,floor,candidate()));
 const publicValue={schema:'phoenix.remediation-1123-public-inspection/v1',owner,targetSha:target,binding,
  restoreMs:p.restoreMs,originalReadyMs:p.originalReadyMs,rehearsalMs:p.rehearsalMs,webImageId:p.webImageId,runtimeImageId:p.runtimeImageId,
  pilotStatus:'PILOT_NOT_READY',predecessorSha256:p.predecessorSha256,inspectionSha256:p.inspectionSha256};
 assert.equal(validPublicInspection(publicValue,{owner,targetSha:target}),true);
 assert.equal(validPublicInspection({...publicValue,other:'secret'},{owner,targetSha:target}),false);
});
const existing=['production_cutover_scopes','production_batch_qualifications','production_cutover_apply_admissions','production_cutover_apply_results',
 'production_inventory_domains','production_inventory_domain_states','production_opening_domain_claims'];
test('all released OFF authorities must exist before the successor and every new state receipt must be observed after schema',async()=>{
 const facts={tables:existing.map(table=>({schema:'public',table,rows:0})),newTables:[],businessDataSha256:h('f')};
 const options={plan:candidate(),floor:{readonlyApproval:null,chanjetPolicy:'HOLD'}};
 const before=()=>defaultOffEvidenceFromFacts(target,facts,{...options,stage:'BEFORE_SCHEMA'});
 assert.equal(before().observedTables.at(-1).presence,'ABSENT_BEFORE_SCHEMA');
 assert.throws(()=>defaultOffEvidenceFromFacts(target,facts,options),/MISSING/);
 const row=facts.tables.pop();assert.throws(before,/PRESENCE_CHANGED/);facts.tables.push(row);
 facts.newTables.push({schema:'public',table:'production_cutover_state_receipts',rows:0});assert.throws(before,/PRESENCE_CHANGED/);
 const after=defaultOffEvidenceFromFacts(target,facts,options);assert.equal(after.observedTables.length,8);
 const rows=after.observedTables.map(({table})=>({table,rows:'0'})),client={query:async sql=>{assert.ok(existing.every(table=>sql.includes(table)));return {rows};}};
 assert.equal((await captureModernSchemaDefaultOff(client,target,options)).verified,true);
 rows[7].rows='1';await assert.rejects(captureModernSchemaDefaultOff(client,target,options),/ACTIVATION/);
});
test('prior historical custody comparison preserves precision even beyond the JavaScript integer range',()=>{
 const raw='{"checked_at":"one","overposted_grades":[{"quantity":30,"amount":9007199254740993},{"quantity":30}]}';
 assert.equal(frozenGroupsDigest(raw),frozenGroupsDigest(raw.replace('one','two')));
 assert.notEqual(frozenGroupsDigest(raw),frozenGroupsDigest(raw.replace('0993','0992')));
 assert.throws(()=>frozenGroupsDigest('{"overposted_grades":[]}'));
});
test('same-version Web cannot switch on an omitted or unrelated API owner, or on a moved image',()=>{
 const p=preview(),selectionText=selection(p),context={...candidate(),floorSha:floor,owner:'6789-1'},objects=new Map();
 const store={guard(){},exists:key=>objects.has(key),read:key=>{assert.ok(objects.has(key));return objects.get(key);}};
 objects.set('schema-release-1123-inspect-'+owner+'.json',p);
 const decisions=successorDecisions(store,selectionText,floor,context);
 context.window=decisions.approval.window;
 objects.set('schema-release-1123-api-access-'+context.owner+'.json',{targetSha:target,contextDigest:canonicalDigest(context),apiAccess:{businessAccess:'AVAILABLE',pilotStatus:'PILOT_NOT_READY'}});
 const consumed={owner:context.owner,targetSha:target,authorizationDigest:h('4'),preparationSha256:h('2')};
 objects.set('schema-release-1123-consumed-'+target+'.json',consumed);
 objects.set('schema-release-preparation-'+context.owner+'.json',{context,successorDecisions:decisions,preparationSha256:h('2')});
 const formal={target,outcome:'SUCCESS',deployMode:'api',active:{api:{imageId:context.candidateImageId}}};
 objects.set('deploy-'+context.owner+'.json',formal);
 objects.set('schema-release-terminal-'+context.owner+'.json',{schema:'phoenix.modern-schema-terminal-open/v1',phase:'COMPLETED_OPEN',
  defaultOff:true,contextDigest:canonicalDigest(context),formalDeploymentSha256:canonicalDigest(formal)});
 const env={TARGET_SHA:target,DEPLOY_MODE:'web',RUN_MIG:'false',BUILD_API:'false',BUILD_WEB:'true',APPROVE_PRODUCTION:'true',PRESERVE_ARTIFACTS:'true',
   MODERN_SCHEMA_WEB_SELECTION:'web1123-'+context.owner};
 const pins={api:{revision:target,imageId:context.candidateImageId},web:{revision:target,imageId:p.webImageId}};
 const deps={store,now:()=>Date.parse(context.window.start),readApproval:()=>({grant:{authorizationDigest:consumed.authorizationDigest}}),captureRuntime:()=>pins,image:()=>p.webImageId+' '+target};
 checkSuccessorWeb('admit',env,deps);checkSuccessorWeb('before',env,deps);checkSuccessorWeb('after',env,deps);
 for(const phase of ['admit','before','after'])assert.throws(()=>checkSuccessorWeb(phase,{...env,DEPLOY_MODE:'full',BUILD_API:'true',MODERN_SCHEMA_WEB_SELECTION:''},deps));
 assert.throws(()=>checkSuccessorWeb('before',{...env,MODERN_SCHEMA_WEB_SELECTION:''},deps));
 assert.throws(()=>checkSuccessorWeb('before',env,{...deps,image:()=>img('0')+' '+target}));
 pins.web.imageId=img('2');assert.throws(()=>checkSuccessorWeb('after',env,deps));
 pins.web.imageId=p.webImageId;const webOwner='7777-1';
 objects.set('deploy-'+webOwner+'.json',{target,outcome:'SUCCESS',deployMode:'web',active:pins});
 store.immutable=(key,value)=>{assert.equal(objects.has(key),false);objects.set(key,value);};
 checkSuccessorWeb('seal',{...env,DEPLOY_RUN_ID:webOwner},deps);
 checkSuccessorWeb('admit',{...env,DEPLOY_MODE:'full',BUILD_API:'true',MODERN_SCHEMA_WEB_SELECTION:''},deps);
});

test('software requires usable new objects while an unchanged, unregistered owner remains PILOT_NOT_READY',async()=>{
 const {classifyRuntimeAccess,runtimeAccessProgram}=await import('./production-modern-schema-runtime-access.mjs');
 const {Script}=await import('node:vm');new Script(runtimeAccessProgram);
 const identity={roleOid:'42',databaseOid:'31',postmasterStartMicros:'12345',sameNativeLogin:true};
 const alias=(keys,value)=>Object.fromEntries(keys.map(key=>[key,value]));
 const tables=['production_cutover_control_environments','production_cutover_apply_admissions','production_cutover_apply_results'];
 const fns=['consume_production_cutover_admission(uuid,text)','record_production_cutover_apply_result(uuid)','lock_production_cutover_authority(uuid)'];
 const business=['production_inbound_reissues','production_finance_review_files','production_cutover_state_receipts','production_cutover_state_origins'];
 const data={identity,enrollment:{environments:0,enrolled:false},acl:{currentIsSessionUser:true,pilotIsolation:'HOLD',businessAccess:'EXPANSION_NOT_INSTALLED',
  elevated:true,controlTables:alias(tables,'WRITABLE'),executorFunctions:alias(fns,'EXECUTABLE'),business:alias(business,'ABSENT'),result:'ROLE_BOUNDARY_HOLD'}};
 const before=classifyRuntimeAccess(data);assert.equal(before.pilotStatus,'PILOT_NOT_READY');
 const after=structuredClone(data);after.acl.business=alias(business,'AVAILABLE');after.acl.businessAccess='AVAILABLE';
 assert.equal(classifyRuntimeAccess(after,before).businessAccess,'AVAILABLE');
 for(const mutate of [v=>v.identity.sameNativeLogin=false,v=>v.identity.roleOid='55',v=>v.enrollment={environments:1,enrolled:true},
  v=>v.acl.business.production_inbound_reissues='MISSING_INSERT',v=>v.acl.controlTables[tables[0]]='PROTECTED']){
   const changed=structuredClone(after);mutate(changed);assert.throws(()=>classifyRuntimeAccess(changed,before));
 }
});

test('prior twenty native receipts, completed lease and two frozen rows bind the next release',async()=>{
 const {readCompletedModernSchemaPredecessor:readPrior,previousOwner:old,previousTarget:revision}=await import('./production-modern-schema-predecessor.mjs');
 const plan=candidate(),completed='44974413964-1',oldPaths=Array.from({length:20},(_,i)=>'migration-'+String(i).padStart(2,'0'));
 const prepared={context:{owner:old,targetSha:revision,sourceInventorySha256:plan.runtimeInventorySha256,pendingMigrations:oldPaths,changedMigrationPaths:oldPaths},
  preparationSha256:h('2'),ownedResources:[]};
 const deployment={target:revision,outcome:'SUCCESS',deployMode:'api'},bodyReceipt={outcome:'BODY_COMPLETE'},pending={scope:'original-applied'};
 const intent={schema:'phoenix.modern-forward-api-intent/v1',owner:old,targetSha:revision,pending,pendingSha256:canonicalDigest(pending),
  migrationAuthorized:false,defaultOff:true,formalDeploymentSha256:canonicalDigest(deployment),afterLedgerSha256:plan.beforeLedgerSha256,
  schemaReceiptSha256:h('6'),bodyReceiptSha256:canonicalDigest(bodyReceipt)};
 const lease={owner:old,recoveryOwner:completed,targetSha:revision,intentSha256:canonicalDigest(intent),outcome:'ORIGINAL_SESSION_ABSENT',transportClosed:true};
 const terminal={...intent,schema:'phoenix.modern-forward-api-terminal/v1',completionOwner:completed,outcome:'SUCCESS',leaseExitSha256:canonicalDigest(lease),intentSha256:canonicalDigest(intent)};
 const after={originalAudit:'{"overposted_grades":[{"quantity":30},{"quantity":30}]}'},driver={run:{},show:{}},rehearsal={resources:[]};
 const held={schemaReceiptSha256:h('6'),bodyReceipt,bundle:{afterLedgerSha256:plan.beforeLedgerSha256,afterRawAuditFile:'audit',afterRawAuditSha256:canonicalDigest(after),
  driverReceiptFile:'driver',driverReceiptSha256:canonicalDigest(driver),perMigrationReceipts:oldPaths.map(path=>({path}))}};
 const step={payload:{evidence:{rehearsalFile:'rehearsal',rehearsalSha256:canonicalDigest(rehearsal)}}};
 const files={['schema-release-preparation-'+old+'.json']:prepared,['schema-release-forward-api-intent-'+old+'.json']:intent,
  ['schema-release-forward-api-terminal-'+old+'.json']:terminal,['deploy-'+old+'.json']:deployment,['schema-release-forward-api-lease-closed-'+completed+'.json']:lease,
  ['schema-release-step-'+old+'-6-backup-verified.json']:step};
 const deps={readBody:()=>held,read:name=>({audit:after,driver,rehearsal})[name]},store={read:name=>files[name]};
 const proof=readPrior(store,plan,deps);assert.equal(proof.priorUnitCount,20);assert.equal(proof.afterFrozenGroupsSha256,frozenGroupsDigest(after.originalAudit));
 after.originalAudit=after.originalAudit.replace('30','31');
 assert.throws(()=>readPrior(store,plan,deps),/PREDECESSOR_RECEIPTS_CHANGED/);
});

test('blank-floor inspect binds the actual process environment used by the floor guard, approval cannot infer one',async()=>{
 const {spawnSync}=await import('node:child_process');
 const source=`import {modernSchemaDispatchFromEnvironment as parse} from './scripts/ops/production-modern-schema-preparation.mjs';
 const dispatch=parse(process.env,()=>'${floor}');if(dispatch.floorSha!==process.env.APPROVED_PREVIOUS_FLOOR_SHA||dispatch.floorSha!=='${floor}')process.exit(9);`;
 const env={DEPLOY_MODE:'api',BUILD_API:'true',BUILD_WEB:'false',RUN_MIG:'false',APPROVE_PRODUCTION:'true',PRESERVE_ARTIFACTS:'true',
  ROTATE_CHANJET_CREDENTIALS:'false',ONE_TIME_CONFIG_FLOOR_TRANSITION:'false',TARGET_SHA:target,APPROVED_CONFIG_FLOOR_SHA:target,
  APPROVED_PREVIOUS_FLOOR_SHA:'',DEPLOY_RUN_ID:owner,DEPLOY_RUN_ATTEMPT:'1',MODERN_SCHEMA_1123_ACTION:'inspect1123',
  API_IMAGE:'ghcr.io/ivanzhao299/phoenix-erp-v3/api:sha-'+target};
 const invoke=action=>spawnSync(process.execPath,['--input-type=module','-e',source],{cwd:new URL('../../',import.meta.url),env:{...env,MODERN_SCHEMA_1123_ACTION:action},encoding:'utf8'});
 assert.equal(invoke('inspect1123').status,0);
 assert.notEqual(invoke(selection(preview())).status,0);assert.notEqual(invoke('').status,0);
});
