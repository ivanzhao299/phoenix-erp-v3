import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {heldOwner} from './production-remediation-held-facts.mjs';
import {exactHeldAttempt,guardInterruptedEdge,cutoff} from './production-remediation-interrupted-boot.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {ModernSchemaIngress} from './production-modern-schema-ingress.mjs';
import {ingressIdentity} from './maintenance-ingress-policy.mjs';
import {executionEnv} from './capture-production-runtime.mjs';

const key='schema-release-1123-handoff-'+heldOwner+'.json';
const check=(ok,code)=>{if(!ok)throw Error('HANDOFF_TRANSFER_HOLD='+code);};
export function readHeldHandoff(store,target){
 if(!store.exists(key))return null;
 const entry=store.read(key),archive=store.read('schema-release-operator-archive-'+entry.recoveryOwner+'.json');
 check(entry.schema==='phoenix.1123-interrupted-handoff/v1'&&entry.owner===heldOwner&&entry.executionSha===target&&
  entry.archiveSha256===canonicalDigest(archive)&&exactHeldAttempt(archive.pending)&&entry.pendingSha256===canonicalDigest(archive.pending)&&
  entry.formalTargetSuccess===false&&entry.outerIngressHeld===true&&same(entry.backgroundGrants,[])&&
  archive.heldInspection===entry.inspectionOwner&&archive.outerIngressHeld===true&&archive.schemaChanged===false&&archive.markerArchived===true,'EXACT_HANDOFF_REQUIRED');
 const original=store.read('schema-release-preparation-'+heldOwner+'.json'),verified=store.read('schema-release-operator-original-verified-'+entry.recoveryOwner+'.json');
 check(entry.verifiedSha256===canonicalDigest(verified)&&entry.ingressIdentitySha256===verified.verification.ingressIdentitySha256&&
  verified.owner===heldOwner&&verified.recoveryOwner===entry.recoveryOwner&&same(verified.participant.allowedKinds,[]),'ARCHIVE_PROOF');
 return {entry,original};
}
export function checkHeldWindow(handoff,window){
 if(handoff)check(Number.isFinite(Date.parse(window.end))&&Date.parse(window.end)<=cutoff,'CUMULATIVE_CUTOFF');
}
function requireNative(controller,proof){
 check(same(controller.host,proof.host)&&controller.names().length===2&&canonicalDigest(ingressIdentity(controller.tables()))===proof.identitySha256,'INGRESS_CHANGED');
}
export async function checkHeldNative({handoff,store,runtime,admit}){
 guardInterruptedEdge(store.directory);
 check(await admit()===true,'LEASE_REQUIRED');
 const original=handoff.original,proof=store.read('schema-release-ingress-installed-'+heldOwner+'.json');
 const ingress=new ModernSchemaIngress({context:original.context,scope:original.ingressScope,privateRuntime:runtime,admit});
 check(proof.identitySha256===handoff.entry.ingressIdentitySha256,'ARCHIVED_INGRESS_CHANGED');
 await ingress.check('RETAINED_INGRESS');requireNative(ingress,proof);
 return {ingress,proof,recheck:()=>requireNative(ingress,proof)};
}

/** The old native guard is carried across both formal transactions. Final
 * retirement is replayable after committed Web SUCCESS. Public 503 remains. */
export async function retireVerifiedIngress({ingress,proof,store,runtime,owner,binding,verify,apply}){
 const program={nftables:['bridge','inet'].map(family=>({delete:{table:{family,name:ingress.compiled.table}}}))};
 const key=suffix=>'schema-release-handoff-'+suffix+'-'+owner+'.json';
 const file=store.file(key('remove-program'));
 const intent={...binding,oldIdentity:proof.identitySha256,programSha256:canonicalDigest(program)};
 const sealed={...intent,oldAbsent:true,outerIngressHeld:true};
 const observed=()=>ingress.names().length;
 const recheck=async()=>{check(await verify()===true,'COMPLETED_WEB_AND_EDGE_REQUIRED');};
 await recheck();
 if(store.exists(key('removed'))){
  check(store.exists(key('remove-intent'))&&same(store.read(key('remove-intent')),intent)&&same(store.read(key('removed')),sealed)&&observed()===0,'SEALED_REPLAY_CHANGED');
  ingress.assertProgram(file,program);return;
 }
 const prior=store.exists(key('remove-intent'));
 if(prior)check(same(store.read(key('remove-intent')),intent),'NATIVE_REMOVE_INTENT_CHANGED');
 if(!prior)requireNative(ingress,proof);
 if(!store.exists(key('remove-program')))runtime.publishJson(file,program);
 ingress.assertProgram(file,program);
 if(!prior)store.immutable(key('remove-intent'),intent);
 await recheck();
 const count=observed();
 if(count!==0){
  requireNative(ingress,proof); // rejects a lone family or changed handles
  ingress.assertProgram(file,program);
  try{
   if(apply)await apply(file);
   else execFileSync('/usr/sbin/nft',['--json','--file',file],{env:executionEnv(),stdio:'ignore',timeout:5000});
  }catch{}
 }
 check(observed()===0,'NATIVE_REMOVE_UNCONFIRMED');
 await recheck();store.immutable(key('removed'),sealed);
}
