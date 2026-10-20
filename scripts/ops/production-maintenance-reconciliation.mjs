/** The same five-domain closure contract at promotion and replacement.
 * A scoped UNKNOWN remains UNKNOWN and requires its separate real authority
 * receipt bound to this exact reconciliation, run, object and maintenance grant. */
import {LEGACY_EVIDENCE_DOMAINS} from './background-control-legacy-transition.mjs';
import {canonicalDigest,bindingDigest,same,hold,HASH} from './production-maintenance-receipts.mjs';
import {isOwnerAuthUnknownApproval} from './production-maintenance-owner-unknown.mjs';
export async function verifyCommittedLegacyReconciliation({envelope,context,state,store,maintenanceApproval,verifyAuthority=async()=>false}){
 const body=envelope?.body;
 if(!HASH.test(envelope?.evidenceSha256||'')||!body||body.approvedScopeDigest!==maintenanceApproval.payloadSha256
  ||!Array.isArray(body.domains)||body.domains.length!==LEGACY_EVIDENCE_DOMAINS.length
  ||new Set(body.domains.map(row=>row.domain)).size!==LEGACY_EVIDENCE_DOMAINS.length)hold('FIVE_RECONCILIATION_DOMAINS_REQUIRED');
 const unknown=body.domains.some(row=>row.unknownEffects!==0);
 if(unknown&&!Array.isArray(state?.receipts))hold('COMMITTED_UNKNOWN_AUTHORITY_REQUIRED');
 const records=(state?.receipts||[]).map(ref=>store.readReceipt(ref));
 if(unknown){
  if(!same(store.readOwnedState(),state))hold('COMMITTED_RECONCILIATION_STATE_CHANGED');
  const matched=records.filter(row=>row.kind==='RECONCILIATION');
  if(matched.length!==1||!same(matched[0].payload,envelope))hold('COMMITTED_RECONCILIATION_NOT_IN_CHAIN');
  const stop=records.findIndex(row=>row.kind==='STOP_LEGACY'),reconcile=records.findIndex(row=>row.kind==='RECONCILIATION');
  if(stop<0||reconcile<=stop||records.some((row,index)=>row.kind==='UNKNOWN_EFFECTS_AUTHORITY'&&(index<=stop||index>=reconcile)))hold('COMMITTED_UNKNOWN_CHAIN_ORDER');
 }
 const approvals=records.filter(row=>row.kind==='UNKNOWN_EFFECTS_AUTHORITY').map(row=>row.payload),used=new Set();
 for(const domain of LEGACY_EVIDENCE_DOMAINS){
  const row=body.domains.find(row=>row.domain===domain);
  if(!row||!Number.isSafeInteger(row.unknownEffects)||row.unknownEffects<0||row.pendingWrites!==0||row.requiresReplay!==false||row.requiresBusinessMutation!==false)hold('COMMITTED_DOMAIN_UNRECONCILED');
  if(row.unknownEffects===0){if(row.disposition!=='RECONCILED')hold('COMMITTED_DOMAIN_UNRECONCILED');continue;}
  if(domain!=='CHANJET_AUTH_REQUESTS'||row.disposition!=='SCOPED_NO_REPLAY_ACCEPTED'||row.unknownEffects!==1
   ||!same(row.unknownObjects,[`api/${context.preSnapshot.api.id}/chanjet-auth-lineage`]))hold('COMMITTED_UNKNOWN_SCOPE_REQUIRED');
  const matches=approvals.filter(a=>a.payload?.domain===domain);if(matches.length!==1)hold('COMMITTED_UNKNOWN_AUTHORITY_REQUIRED');
  const approval=matches[0],expected={purpose:'UNKNOWN_EFFECTS',context,bindingDigest:bindingDigest(context),targetSha:context.targetSha};
  if(!isOwnerAuthUnknownApproval(approval,expected)||approval.ownerGrantSha256!==maintenanceApproval.ownerGrantSha256
   ||approval.payload.scopeDigest!==maintenanceApproval.payloadSha256||approval.payload.reconciliationEvidenceSha256!==envelope.evidenceSha256
   ||!same(approval.payload.objects,row.unknownObjects)||canonicalDigest(approval.payload)!==approval.payloadSha256
   ||await verifyAuthority(approval,expected)!==true)hold('COMMITTED_UNKNOWN_AUTHORITY_REJECTED');
  if(!same(store.readOwnedState(),state))hold('COMMITTED_RECONCILIATION_STATE_CHANGED');
  used.add(approval);
 }
 if(used.size!==approvals.length)hold('COMMITTED_EXTRA_UNKNOWN_AUTHORITY');
 return true;
}
