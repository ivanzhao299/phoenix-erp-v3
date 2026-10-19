/** A protected registration of real user-channel delegation, not a GitHub
 * APPROVE and not authority derived from a COMMENT or a supplied digest.
 * Runtime consumption is read-only. The trusted GitHub bootstrap cannot create
 * the user instruction or window confirmation it consumes. No CLI or
 * environment approval bypass exists. */
import fs from 'node:fs';
import path from 'node:path';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {inspectTrustedDirectory,assertSameDirectory,readPinnedFile} from './production-trusted-paths.mjs';
import {canonicalDigest,bindingDigest,validateMaintenanceContext,same,HASH,SHA,iso,MAINTENANCE_AUTHORITY_SCHEMA} from './production-maintenance-receipts.mjs';
const GRANT_SCHEMA='phoenix.owner-delegated-maintenance-grant/v1';
const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&same(Object.keys(value).sort(),[...keys].sort());
const SCOPE=Object.freeze({mode:'api',buildApi:true,buildWeb:false,runMigration:false,chanjetPolicy:'HOLD',readonlySync:false,inboundSync:false,rotateCredentials:false,automaticRollback:false});
const fail=code=>Error('OWNER_MAINTENANCE_AUTHORITY_HOLD='+code);
export function isOwnerDelegatedMaintenanceApproval(approval,expected){
 try{
  validateMaintenanceContext(expected.context);
  return exact(approval,['schema','authorityKind','decision','purpose','bindingDigest','payload','payloadSha256','ownerGrantSha256'])
   &&approval.schema===MAINTENANCE_AUTHORITY_SCHEMA&&approval.authorityKind==='OWNER_DELEGATED'&&approval.decision==='AUTHORIZED'
   &&approval.purpose==='MAINTENANCE'&&expected.purpose==='MAINTENANCE'
   &&approval.bindingDigest===bindingDigest(expected.context)&&approval.bindingDigest===expected.bindingDigest&&expected.targetSha===expected.context.targetSha
   &&HASH.test(approval.payloadSha256)&&canonicalDigest(approval.payload)===approval.payloadSha256&&HASH.test(approval.ownerGrantSha256)
   &&approval.payload?.protocol==='STOP_AND_RECONCILE'&&Array.isArray(approval.payload.operations)
   &&approval.payload.operations.length>0&&approval.payload.operations.every(operation=>['FENCE_INGRESS','DISABLE_RESTART_POLICY','DISCONNECT_LEGACY_NETWORKS','STOP_LEGACY','RECONCILE','PREPARE_PROMOTION','REPLACE_CANDIDATE','START_CANDIDATE','VERIFY_CANDIDATE','OPEN_CANDIDATE'].includes(operation))&&new Set(approval.payload.operations).size===approval.payload.operations.length
   &&(!expected.operation||approval.payload.operations.includes(expected.operation));
 }catch{return false;}
}
export function validateRegisteredOwnerMaintenanceGrant(grant,approval,expected,now=Date.now()){
 if(!isOwnerDelegatedMaintenanceApproval(approval,expected))throw fail('EXACT_OWNER_APPROVAL_REQUIRED');
 const fields=['schema','repository','authorityKind','authorizationOrigin','authorizationRef','authorizationDigest','delegate','context','source','dispatch','maintenanceWindowConfirmationDigest','scope','payloadSha256','evidence','registeredAt','expiresAt'];
 if(!exact(grant,fields)||grant.schema!==GRANT_SCHEMA||grant.repository!=='ivanzhao299/phoenix-erp-v3'||grant.authorityKind!=='OWNER_DELEGATED'||grant.authorizationOrigin!=='TRUSTED_INTERACTIVE_USER'
  ||!['OWNER_DIRECT_AUTHORIZATION_20261018_AND_EXPEDITED_20261019','OWNER_EXECUTION_ORDER_V2_20261019'].includes(grant.authorizationRef)||!HASH.test(grant.authorizationDigest)
  ||canonicalDigest(grant)!==approval.ownerGrantSha256||!same(grant.context,expected.context)||!same(grant.scope,SCOPE)||grant.payloadSha256!==approval.payloadSha256
  ||!HASH.test(grant.maintenanceWindowConfirmationDigest)||!iso(grant.registeredAt)||!iso(grant.expiresAt)||grant.expiresAt!==expected.context.window.end
  ||!Number.isFinite(now)||Date.parse(grant.registeredAt)>now||now<Date.parse(expected.context.window.start)||now>=Date.parse(grant.expiresAt))throw fail('GRANT_SCOPE_TIME_OR_DIGEST');
 const delegate=grant.delegate,dispatch=grant.dispatch,source=grant.source,evidence=grant.evidence;
 if(!exact(delegate,['githubUserId','githubLogin'])||delegate.githubUserId!==7245339||delegate.githubLogin!=='emvia'
  ||!exact(dispatch,['runId','attempt','actorId','workflowSha','workflowPath','event'])||!Number.isSafeInteger(dispatch.runId)||dispatch.runId<1
  ||!Number.isSafeInteger(dispatch.attempt)||dispatch.attempt<1||`${dispatch.runId}-${dispatch.attempt}`!==expected.context.owner
  ||dispatch.actorId!==delegate.githubUserId||dispatch.workflowSha!==expected.targetSha||dispatch.workflowPath!=='.github/workflows/deploy.yml'||dispatch.event!=='workflow_dispatch')throw fail('DISPATCH_OR_DELEGATE_BINDING');
 if(!exact(source,['headSha','treeSha','prNumber','reviewId','reviewRecordDigest','sourceProvenanceDigest','mergedMainSha'])
  ||!SHA.test(source.headSha)||!SHA.test(source.treeSha)||!Number.isSafeInteger(source.prNumber)||source.prNumber<1||!Number.isSafeInteger(source.reviewId)||source.reviewId<1
  ||!HASH.test(source.reviewRecordDigest)||!HASH.test(source.sourceProvenanceDigest)||source.mergedMainSha!==expected.targetSha)throw fail('SOURCE_BINDING');
 if(!exact(evidence,['preSnapshotDigest','recoveryMaterialDigest','candidateImageId','releaseArtifactId','releaseArtifactDigest'])
  ||evidence.preSnapshotDigest!==canonicalDigest(expected.context.preSnapshot)||!HASH.test(evidence.recoveryMaterialDigest)
  ||evidence.candidateImageId!==expected.context.candidate.imageId||!Number.isSafeInteger(evidence.releaseArtifactId)||evidence.releaseArtifactId<1||!HASH.test(evidence.releaseArtifactDigest))throw fail('RELEASE_MATERIAL_BINDING');
 return true;
}
/** Production defaults retain real root/trusted-path/FD9 protection. A plan or
 * candidate cannot select a filename, register a grant or clear a revocation.
 * The same run's effects re-read the exact protected registration every time. */
export async function readRegisteredOwnerMaintenanceGrant(approval,expected,dependencies={}){
 try{
  if(!isOwnerDelegatedMaintenanceApproval(approval,expected))return false;
  const directory=dependencies.directory||CONTRACT.stateDirectory,guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,directory));
  const inspect=dependencies.inspectDirectory||(value=>inspectTrustedDirectory(value,CONTRACT)),io=dependencies.fs||fs,uid=dependencies.expectedUid??0,now=dependencies.now||Date.now;
  guard();const before=inspect(directory),file=path.join(directory,`maintenance-owner-grant-${expected.context.owner}.json`),revocation=path.join(directory,`maintenance-owner-revoked-${expected.context.owner}.json`);
  const notRevoked=()=>{try{io.lstatSync(revocation);return false;}catch(error){return error.code==='ENOENT';}};
  if(!notRevoked())return false;
  const read=()=>JSON.parse(readPinnedFile(file,{contract:CONTRACT,uid},{fs:io,inspectDirectory:inspect}));
  const first=read();validateRegisteredOwnerMaintenanceGrant(first,approval,expected,now());
  guard();const second=read();if(!same(first,second)||!notRevoked())return false;
  validateRegisteredOwnerMaintenanceGrant(second,approval,expected,now());assertSameDirectory(before,inspect(directory));guard();return structuredClone(second);
 }catch{return false;}
}

export async function verifyRegisteredOwnerMaintenanceAuthority(approval,expected,dependencies={}){
 return Boolean(await readRegisteredOwnerMaintenanceGrant(approval,expected,dependencies));
}
