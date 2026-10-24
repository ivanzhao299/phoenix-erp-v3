/** One object-scoped owner decision for the OLD untracked authentication
 * lineage. Never derived from a maintenance grant, COMMENT or zero counters.
 * The trusted operator records the actual separate human decision; readers are
 * read-only and require that exact statement's digest in the release context. */
import path from 'node:path';
import {CONTRACT,verifyContext,secureJson} from './production-config-guard.mjs';
import {readRegisteredOwnerMaintenanceGrant} from './production-maintenance-owner-authority.mjs';
import {canonicalDigest,bindingDigest,same,HASH,MAINTENANCE_AUTHORITY_SCHEMA,hold,iso} from './production-maintenance-receipts.mjs';
const fields=['schema','origin','authorizationRef','authorizationDigest','previousFloorSha','targetSha','oldApiContainerId','domain','objects','noReplay','businessMutation','window'];
export function validateOwnerAuthUnknownDecision(value,context,now=Date.now()){
 const object=`api/${context.preSnapshot.api.id}/chanjet-auth-lineage`;
 if(!value||!same(Object.keys(value).sort(),[...fields].sort())||value.schema!=='phoenix.owner-scoped-auth-unknown-decision/v1'
  ||value.origin!=='TRUSTED_INTERACTIVE_USER'||value.authorizationRef!=='OWNER_SCOPED_AUTH_UNKNOWN_NO_REPLAY'
  ||!HASH.test(value.authorizationDigest||'')||value.previousFloorSha!==context.previousFloorSha||value.targetSha!==context.targetSha
  ||value.oldApiContainerId!==context.preSnapshot.api.id||value.domain!=='CHANJET_AUTH_REQUESTS'||!same(value.objects,[object])
  ||value.noReplay!==true||value.businessMutation!==false||!iso(value.window?.start)||!iso(value.window?.end)
  ||Date.parse(value.window.start)>Date.parse(context.window.start)||Date.parse(value.window.end)<Date.parse(context.window.end)
  ||now<Date.parse(context.window.start)||now>=Date.parse(context.window.end)
  ||canonicalDigest(value)!==context.scopedUnknownDecisionSha256)hold('EXACT_OWNER_AUTH_UNKNOWN_DECISION_REQUIRED');
 return value;
}
export function readOwnerAuthUnknownDecision(context){
 verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
 const value=secureJson(path.join(CONTRACT.stateDirectory,`owner-scoped-auth-unknown-${context.targetSha}.json`));
 validateOwnerAuthUnknownDecision(value,context);verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);return value;
}
export function createOwnerAuthUnknownApproval(context,maintenanceApproval,evidence,decision){
 validateOwnerAuthUnknownDecision(decision,context);
 const payload={domain:decision.domain,reconciliationEvidenceSha256:evidence.evidenceSha256,objects:decision.objects,noReplay:true,businessMutation:false,
  scopeDigest:maintenanceApproval.payloadSha256,decisionSha256:canonicalDigest(decision)};
 return {schema:MAINTENANCE_AUTHORITY_SCHEMA,authorityKind:'OWNER_DELEGATED',decision:'AUTHORIZED',purpose:'UNKNOWN_EFFECTS',
  bindingDigest:bindingDigest(context),payload,payloadSha256:canonicalDigest(payload),ownerGrantSha256:maintenanceApproval.ownerGrantSha256};
}
export function isOwnerAuthUnknownApproval(approval,expected){
 try{return approval&&same(Object.keys(approval).sort(),['schema','authorityKind','decision','purpose','bindingDigest','payload','payloadSha256','ownerGrantSha256'].sort())
  &&approval.payload&&same(Object.keys(approval.payload).sort(),['domain','reconciliationEvidenceSha256','objects','noReplay','businessMutation','scopeDigest','decisionSha256'].sort())
  &&approval.schema===MAINTENANCE_AUTHORITY_SCHEMA&&approval.authorityKind==='OWNER_DELEGATED'&&approval.decision==='AUTHORIZED'
  &&approval.purpose==='UNKNOWN_EFFECTS'&&expected.purpose==='UNKNOWN_EFFECTS'&&approval.bindingDigest===bindingDigest(expected.context)
  &&expected.bindingDigest===approval.bindingDigest&&HASH.test(approval.ownerGrantSha256||'')&&HASH.test(approval.payloadSha256||'')
  &&canonicalDigest(approval.payload)===approval.payloadSha256&&approval.payload.domain==='CHANJET_AUTH_REQUESTS'
  &&HASH.test(approval.payload.reconciliationEvidenceSha256||'')&&HASH.test(approval.payload.scopeDigest||'')
  &&approval.payload.decisionSha256===expected.context.scopedUnknownDecisionSha256
  &&same(approval.payload.objects,[`api/${expected.context.preSnapshot.api.id}/chanjet-auth-lineage`])
  &&approval.payload.noReplay===true&&approval.payload.businessMutation===false;
 }catch{return false;}
}
export async function verifyOwnerAuthUnknownAuthority(approval,expected,maintenanceApproval){
 if(!isOwnerAuthUnknownApproval(approval,expected)||approval.ownerGrantSha256!==maintenanceApproval.ownerGrantSha256
  ||approval.payload.scopeDigest!==maintenanceApproval.payloadSha256)return false;
 try{
  const parent=await readRegisteredOwnerMaintenanceGrant(maintenanceApproval,{...expected,purpose:'MAINTENANCE'});
  if(!parent)return false;readOwnerAuthUnknownDecision(expected.context);return true;
 }catch{return false;}
}
