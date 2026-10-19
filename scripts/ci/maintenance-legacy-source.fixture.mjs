/** Real old-source protocol counterexample, never a completed transition,
 * five-domain reconciliation, continuous ingress or production receipt. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {OwnedErpCandidateCapsule} from './maintenance-erp-candidate.fixture.mjs';
import {CONTRACT} from '../ops/production-config-guard.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
export function requireLegacySourceExperiment(environment=process.env){
 assert.equal(environment.LEGACY_SOURCE_PROTOCOL_FIXTURE,'OWNED_ISOLATED_ONLY','LEGACY_SOURCE_FIXTURE_REQUIRES_EXPLICIT_OWNED_MODE');
 assert.notEqual(fs.realpathSync(root),CONTRACT.repository,'LEGACY_SOURCE_FIXTURE_REFUSES_PRODUCTION_CHECKOUT');
 assert.equal(Number(process.versions.node.split('.')[0]),20);
}
export async function runActualLegacySourceExperiment(){
 requireLegacySourceExperiment();
 const owner=`${Date.now()}-${process.pid}`,capsule=new OwnedErpCandidateCapsule({owner});
 const result={schema:'phoenix.actual-legacy-source-protocol/v1',owner,result:'PENDING',fixtureOnly:true,productionReceipt:false,productionAuthority:false,
  sourceSha:'226878864f184d26f41a890e666ebed52547db14',cases:[],fullFactory:false,oldToNewSwitch:'NOT_RUN',continuousIngressProof:false,fiveDomainReconciliation:'NOT_RUN',resourcesRetained:true};
 const file=path.join(capsule.root,'legacy-source-protocol.json');
 const save=()=>fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{mode:0o600});save();
 try{
  const prior=process.umask(0o022);try{await capsule.build({sourceRevision:result.sourceSha});}finally{process.umask(prior);}
  result.imageId=capsule.imageId;save();
  for(const major of [16,18]){
   result.stage=`PG${major}_OWNED_DATABASE_PREPARATION`;save();
   const pg=await capsule.startPostgres(major),dbBefore=capsule.inspectContainer(pg.id),before=capsule.fingerprint(pg);
   result.stage=`PG${major}_ACTUAL_LEGACY_STARTUP`;save();
   const legacy=await capsule.startLegacySource(pg);
   result.stage=`PG${major}_NEXT_REAL_SCHEDULER_BOUNDARY`;save();
   const readyAt=Date.now(),boundary=(Math.floor(readyAt/60000)+1)*60000+1500,monoEnd=performance.now()+75000;
   while(Date.now()<boundary){assert.ok(performance.now()<monoEnd,'LEGACY_SOURCE_BOUNDARY_DEADLINE');await new Promise(resolve=>setTimeout(resolve,Math.min(250,boundary-Date.now())));}
   const stable=capsule.inspectContainer(legacy.id);assert.equal(stable.State.Running,true);assert.equal(stable.State.StartedAt,legacy.originalPin.startedAt);assert.equal(stable.RestartCount,0);
   const observedStatus=capsule.request(legacy,'/api/internal/background/status');assert.equal(observedStatus.status,404);
   const network=capsule.network(legacy);
   const observed={pgMajor:major,readyAt:new Date(readyAt).toISOString(),nextBoundaryObservedAt:new Date().toISOString(),schedulerBoundary:new Date(boundary).toISOString(),
    runtime:legacy.originalPin,modernStatusHttp:observedStatus.status,mountedModernManifest:'FENCED_BUT_PROTOCOL_UNSUPPORTED',networkEvents:network,
    beforeFingerprint:before,fingerprintOnlyNotBusinessReconciliation:true,stop:'NOT_ATTEMPTED'};
   result.cases.push(observed);save();
   result.stage=`PG${major}_ONE_OWNED_LEGACY_STOP`;observed.stop='ATTEMPT_STARTED';save();
   observed.stop=await capsule.stopLegacySource(legacy);observed.afterFingerprint=capsule.fingerprint(pg);save();
   // Only this test's original database is stopped after its old API and
   // tagged backend disappearance are observed. No resource is removed.
   const dbLive=capsule.inspectContainer(pg.id);assert.equal(dbLive.Image,dbBefore.Image);assert.equal(dbLive.State.StartedAt,dbBefore.State.StartedAt);
   capsule.docker(['stop','--time','10',pg.id],{timeout:15000});
   const dbAfter=capsule.inspectContainer(pg.id);assert.equal(dbAfter.State.Running,false);assert.equal(dbAfter.State.OOMKilled,false);
   observed.databaseStop={id:pg.id,imageId:dbAfter.Image,startedAt:dbAfter.State.StartedAt,exitCode:dbAfter.State.ExitCode,running:false};save();
  }
  result.result='PASS_ACTUAL_LEGACY_UNSUPPORTED_PROTOCOL_AND_OWNED_STOP_ONLY';result.stage='COMPONENT_COMPLETE';save();return result;
 }catch(error){
  result.result='HOLD';result.failureClass=error?.code==='ERR_ASSERTION'?'ASSERTION':/^ERP_CANDIDATE_FIXTURE_HOLD=[A-Z_]+$/.test(error?.message??'')?error.message:'UNVERIFIED';
  result.automaticRetry=false;result.automaticCleanup=false;save();throw error;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runActualLegacySourceExperiment().then(value=>console.log(JSON.stringify({result:value.result,owner:value.owner,imageId:value.imageId,productionAuthority:false})),()=>{
  console.error('ACTUAL_LEGACY_SOURCE_EXPERIMENT_HOLD');process.exitCode=64;
 });
}
