import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assertHeldEdge,heldOwner} from './production-remediation-held-facts.mjs';
import {exactHeldAttempt,cutoff} from './production-remediation-interrupted-boot.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {ModernSchemaIngress} from './production-modern-schema-ingress.mjs';
import {ingressIdentity} from './maintenance-ingress-policy.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {CONTRACT,git} from './production-config-guard.mjs';
import {successorIncidentDeadline} from './production-modern-schema-successor.mjs';

export const sealedHandoffRevision='ccfed8be2eaabb52f9da9770424ebb34bd0a8964';
const extensionFiles=new Set([
 'docs/ops/production-remediation-1123-controlled-release.md',
 'scripts/ops/production-modern-schema-executors.mjs',
 'scripts/ops/production-modern-schema-preparation.mjs',
 'scripts/ops/production-modern-schema-successor.mjs',
 'scripts/ops/production-modern-schema-successor.test.mjs',
 'scripts/ops/production-modern-schema-supervisor.mjs',
 'scripts/ops/production-modern-schema-web-successor.mjs',
 'scripts/ops/production-remediation-fence-transfer.mjs',
 'scripts/ops/production-remediation-handoff.test.mjs',
 'scripts/ops/production-remediation-held-resources.mjs',
]);
export function isReviewedContinuation(source,target,read=args=>git(CONTRACT.repository,args,{timeoutMs:5000})){
 if(source!==sealedHandoffRevision||!/^[a-f0-9]{40}$/.test(target)||target===source)return false;
 const parents=read(['show','-s','--format=%P',target]).split(' ');
 if(![1,2].includes(parents.length)||parents[0]!==source)return false;
 const paths=read(['diff','--name-only','--no-renames',source,target,'--']).split('\n');
 return paths.includes('scripts/ops/production-modern-schema-successor.mjs')&&
  paths.includes('scripts/ops/production-remediation-fence-transfer.mjs')&&paths.every(file=>extensionFiles.has(file));
}


const key='schema-release-1123-handoff-'+heldOwner+'.json';
const check=(ok,code)=>{if(!ok)throw Error('HANDOFF_TRANSFER_HOLD='+code);};
export function readHeldHandoff(store,target,review=isReviewedContinuation){
 if(!store.exists(key))return null;
 const entry=store.read(key),archive=store.read('schema-release-operator-archive-'+entry.recoveryOwner+'.json');
 const extended=entry.executionSha!==target&&review(entry.executionSha,target);
 check(entry.schema==='phoenix.1123-interrupted-handoff/v1'&&entry.owner===heldOwner&&(entry.executionSha===target||extended)&&
  (!extended||entry.recoveryOwner==='45173837813-1'&&entry.inspectionOwner==='45168560404-1'&&entry.generation===113)&&
  entry.archiveSha256===canonicalDigest(archive)&&exactHeldAttempt(archive.pending)&&entry.pendingSha256===canonicalDigest(archive.pending)&&
  entry.formalTargetSuccess===false&&entry.outerIngressHeld===true&&same(entry.backgroundGrants,[])&&
  archive.heldInspection===entry.inspectionOwner&&archive.outerIngressHeld===true&&archive.schemaChanged===false&&archive.markerArchived===true,'EXACT_HANDOFF_REQUIRED');
 const original=store.read('schema-release-preparation-'+heldOwner+'.json'),verified=store.read('schema-release-operator-original-verified-'+entry.recoveryOwner+'.json');
 check(entry.verifiedSha256===canonicalDigest(verified)&&entry.ingressIdentitySha256===verified.verification.ingressIdentitySha256&&
  verified.owner===heldOwner&&verified.recoveryOwner===entry.recoveryOwner&&same(verified.participant.allowedKinds,[]),'ARCHIVE_PROOF');
 const opened=store.read('schema-release-operator-public-open-verified-'+entry.recoveryOwner+'.json');
 check(archive.publicOpenSha256===canonicalDigest(opened)&&opened.schema==='phoenix.modern-operator-original-open/v1'&&
  opened.owner===heldOwner&&opened.recoveryOwner===entry.recoveryOwner&&opened.formalTargetSuccess===false&&
  opened.originalRuntimeSha===original.context.runtimeSha&&opened.manifest.targetSha===original.context.runtimeSha&&
  opened.manifest.phase==='OPEN'&&opened.manifest.generation===entry.generation&&same(opened.manifest.participants,[verified.participant]),
  'ARCHIVED_OPEN_MANIFEST');
 return {entry,original,extended,manifest:opened.manifest};
}
const deadline=handoff=>handoff.extended?successorIncidentDeadline:cutoff;
export function checkHeldWindow(handoff,window){
 if(handoff)check(Number.isFinite(Date.parse(window.end))&&Date.parse(window.end)<=deadline(handoff),'CUMULATIVE_CUTOFF');
}
export function guardHeldContinuation(handoff,directory){
 check(Date.now()<deadline(handoff),'CUMULATIVE_CUTOFF');
 assertHeldEdge(directory);
}
function requireNative(controller,proof){
 check(same(controller.host,proof.host)&&controller.names().length===2&&canonicalDigest(ingressIdentity(controller.tables()))===proof.identitySha256,'INGRESS_CHANGED');
}
export async function checkHeldNative({handoff,store,runtime,admit}){
 guardHeldContinuation(handoff,store.directory);
 check(await admit()===true,'LEASE_REQUIRED');
 const original=handoff.original,proof=store.read('schema-release-ingress-installed-'+heldOwner+'.json');
 const ingress=new ModernSchemaIngress({context:original.context,scope:original.ingressScope,privateRuntime:runtime,admit});
 check(proof.identitySha256===handoff.entry.ingressIdentitySha256,'ARCHIVED_INGRESS_CHANGED');
 await ingress.check('RETAINED_INGRESS');requireNative(ingress,proof);
 return {ingress,proof,recheck:()=>requireNative(ingress,proof)};
}

/** The old native guard is carried across both formal transactions. Final
 * retirement is replayable after committed Web SUCCESS. Public 503 remains. */
export async function retireVerifiedIngress({ingress,proof,store,runtime,owner,binding,verify,authorizeRemoval,apply}){
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
 if(!prior){await authorizeRemoval();requireNative(ingress,proof);}
 if(!store.exists(key('remove-program')))runtime.publishJson(file,program);
 ingress.assertProgram(file,program);
 if(!prior)store.immutable(key('remove-intent'),intent);
 await recheck();
 const count=observed();
 if(count!==0){
  requireNative(ingress,proof); // rejects a lone family or changed handles
  ingress.assertProgram(file,program);
  await authorizeRemoval();
  try{
   if(apply)await apply(file);
   else execFileSync('/usr/sbin/nft',['--json','--file',file],{env:executionEnv(),stdio:'ignore',timeout:5000});
  }catch{}
 }
 check(observed()===0,'NATIVE_REMOVE_UNCONFIRMED');
 await recheck();store.immutable(key('removed'),sealed);
}
