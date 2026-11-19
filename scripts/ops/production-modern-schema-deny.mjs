/** Safe denial only. A failed release can never turn public OPEN into an
 * unattended background grant merely by closing the original SQL session. */
import {createHash} from 'node:crypto';
import {assertSameBinding,validateManifest} from './background-control-manifest.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {assertOriginalModernSchemaProcess} from './production-modern-schema-session-lease.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_DENY_HOLD='+code);};
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function ownedOpen(publicCurrent,current,{state,context,pending}){
 if(publicCurrent.targetSha===context.targetSha){
  if(current.purpose)assertSameBinding(current,state.binding);else if(pending.phase!=='COMPLETED_OPEN')fail('UNEXPECTED_ORDINARY_OPEN');
  return;
 }
 // Original-R recovery can fail after publishing its OPEN and before its
 // durable terminal unlink. Only the exact protected recovery proof admits
 // denial of that projection; this never authorizes another OPEN.
 const proof=state.store.read(`schema-release-original-recovery-verified-${context.owner}.json`);
 const intent=state.store.read(`schema-release-original-recovery-intent-${context.owner}.json`);
 if(publicCurrent.targetSha!==context.runtimeSha||state.ddlIntentExists()||!['R_STOPPED','FRESH_RECHECKED','BACKUP_VERIFIED'].includes(pending.phase)
  ||proof.schema!=='phoenix.modern-schema-original-recovery-proof/v1'||proof.owner!==context.owner||proof.contextDigest!==canonicalDigest(context)
  ||proof.targetSha!==context.runtimeSha||proof.attemptedTargetSha!==context.targetSha||proof.outcome!=='ABORTED_BEFORE_DDL_ORIGINAL_R_RECOVERED'
  ||proof.schemaChanged!==false||proof.formalTargetSuccess!==false||proof.intentSha256!==canonicalDigest(intent)
  ||!same(proof.originalLease,pending.lease)||!same(publicCurrent.participants,[proof.originalRuntime]))fail('EXACT_ORIGINAL_RECOVERY_REQUIRED');
}
export function denyModernSchemaBackground({state,context,publisher,reason='SCHEMA_RELEASE_FAILED'}){
 publisher.guard();const pending=state.read();assertSameBinding(pending,state.binding);
 if(pending.supervisor.pid!==process.pid||assertOriginalModernSchemaProcess(pending.supervisor)!==true||!/^[A-Z0-9_]{1,100}$/.test(reason))fail('ORIGINAL_DENY_SUPERVISOR_REQUIRED');
 const current=publisher.readPrivate(),publicCurrent=publisher.readPublic();
 if(current?.phase==='PUBLISHING_FENCE'&&current.owner===context.owner){
  assertSameBinding(current,state.binding);
  const expected=validateManifest({protocolVersion:1,phase:'FENCED',owner:context.owner,generation:current.generation,targetSha:context.targetSha,
   participants:state.store.read(`schema-release-preparation-${context.owner}.json`).originalBackground.manifest.participants});
  if(current.manifestDigest!==sha(expected)||publicCurrent?.phase!=='FENCED'&&!same(publicCurrent,state.store.read(`schema-release-preparation-${context.owner}.json`).originalBackground.manifest)
    ||publicCurrent?.phase==='FENCED'&&!same(publicCurrent,expected))fail('PUBLISHING_FENCE_STATE_CHANGED');
  publisher.writePublic(expected);publisher.writePrivate({...current,phase:'FENCED',holdReason:reason});
  publisher.writeHighWater(Math.max(current.generation,publisher.readHighWater()));publisher.guard();
  if(!same(publisher.readPublic(),expected)||publisher.readPrivate().manifestDigest!==sha(expected)||publisher.readPrivate().phase!=='FENCED')fail('DURABLE_DENIAL_UNCONFIRMED');
  return {backgroundDenied:true,phase:'FENCED',generation:expected.generation};
 }
 if(publicCurrent?.phase==='OPEN'){
  for(const [suffix,key] of [['open-commit-intent','expectedPublicManifest'],['original-recovery-open-commit-intent','publicManifest']]){
   const name=`schema-release-${suffix}-${context.owner}.json`;
   if(state.store.exists(name)&&same(state.store.read(name)[key],publicCurrent))fail('PUBLIC_OPEN_ALREADY_COMMITTED_FORWARD_ONLY');
  }
 }
 if(publicCurrent?.owner===context.owner&&['OPEN','FENCED'].includes(publicCurrent.phase)&&current?.phase==='CODE_HOLD'&&current.owner===context.owner){
  assertSameBinding(current,state.binding);ownedOpen(publicCurrent,current,{state,context,pending});
  const manifest=validateManifest({...publicCurrent,phase:'CODE_HOLD',generation:current.generation});
  if(current.generation<=publicCurrent.generation||current.manifestDigest!==sha(manifest)||publisher.readHighWater()<current.generation)fail('DENIAL_INTERMEDIATE_STATE_CHANGED');
  publisher.writePublic(manifest);publisher.guard();
  if(!same(publisher.readPrivate(),current)||!same(publisher.readPublic(),manifest))fail('DURABLE_DENIAL_UNCONFIRMED');
  return {backgroundDenied:true,phase:'CODE_HOLD',generation:manifest.generation};
 }
 if(publicCurrent?.owner===context.owner&&publicCurrent.phase==='FENCED'&&current?.phase==='OPEN'&&current.owner===context.owner){
  if(current.targetSha===context.targetSha){
   const intent=state.store.read(`schema-release-open-commit-intent-${context.owner}.json`);
   assertSameBinding(current,state.binding);
   if(intent.schema!=='phoenix.modern-schema-open-commit-intent/v1'||intent.contextDigest!==canonicalDigest(context)
     ||intent.fencedPublicManifestSha256!==canonicalDigest(publicCurrent)||current.manifestDigest!==sha(intent.expectedPublicManifest)
     ||current.generation!==intent.expectedPublicManifest?.generation)fail('PRE_PUBLIC_COMMIT_STATE_CHANGED');
  }else{
   const intent=state.store.read(`schema-release-original-recovery-open-commit-intent-${context.owner}.json`);
   if(intent.schema!=='phoenix.modern-schema-recovery-open-commit-intent/v1'||intent.contextDigest!==canonicalDigest(context)
     ||intent.fencedManifestSha256!==canonicalDigest(publicCurrent)||intent.ordinaryControlSha256!==canonicalDigest(current)
     ||intent.publicManifest?.targetSha!==context.runtimeSha)fail('PRE_PUBLIC_RECOVERY_COMMIT_STATE_CHANGED');
   ownedOpen(intent.publicManifest,current,{state,context,pending});
  }
  const generation=Math.max(current.generation,publisher.readHighWater())+1;
  const manifest=validateManifest({...publicCurrent,phase:'CODE_HOLD',generation});
  const record={...state.binding,protocolVersion:1,phase:'CODE_HOLD',generation,manifestDigest:sha(manifest),holdReason:reason,updatedAt:new Date().toISOString()};
  publisher.writeHighWater(generation);publisher.writePrivate(record);publisher.writePublic(manifest);publisher.guard();
  if(!same(publisher.readPrivate(),record)||!same(publisher.readPublic(),manifest))fail('DURABLE_DENIAL_UNCONFIRMED');
  return {backgroundDenied:true,phase:'CODE_HOLD',generation};
 }
 if(publicCurrent?.owner===context.owner&&['FENCED','CODE_HOLD'].includes(publicCurrent.phase)&&current?.owner===context.owner
  &&current.phase===publicCurrent.phase&&current.generation===publicCurrent.generation&&current.manifestDigest===sha(publicCurrent)){
  assertSameBinding(current,state.binding);publisher.guard();return {backgroundDenied:true,phase:publicCurrent.phase};
 }
 if(!publicCurrent||publicCurrent.owner!==context.owner||publicCurrent.phase!=='OPEN'||!current||current.owner!==context.owner)fail('OWNED_OPEN_REQUIRED_FOR_DENIAL');
 if(current.phase!=='OPEN'||current.generation!==publicCurrent.generation||current.manifestDigest!==sha(publicCurrent))fail('OWNED_OPEN_REQUIRED_FOR_DENIAL');
 // After terminal normalization the still-present pending marker plus original
 // supervisor owns the denial; no unrelated ordinary release can enter FD9.
 ownedOpen(publicCurrent,current,{state,context,pending});
 const generation=Math.max(current.generation,publisher.readHighWater())+1;if(!Number.isSafeInteger(generation))fail('GENERATION_EXHAUSTED');
 const manifest=validateManifest({...publicCurrent,phase:'CODE_HOLD',generation});
 const record={...state.binding,protocolVersion:1,phase:'CODE_HOLD',generation,manifestDigest:sha(manifest),holdReason:reason,updatedAt:new Date().toISOString()};
 publisher.writeHighWater(generation);publisher.writePrivate(record);publisher.writePublic(manifest);publisher.guard();
 if(!same(publisher.readPrivate(),record)||!same(publisher.readPublic(),manifest))fail('DURABLE_DENIAL_UNCONFIRMED');
 return {schema:'phoenix.modern-schema-background-denied/v1',owner:context.owner,contextDigest:canonicalDigest(context),generation,backgroundDenied:true,phase:'CODE_HOLD'};
}
