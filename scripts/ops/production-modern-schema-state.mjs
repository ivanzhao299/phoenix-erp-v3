/** Durable pending begins before the first maintenance effect. Every step is
 * create-only evidence followed by an atomic marker, never an automatic retry. */
import path from 'node:path';
import {CONTRACT} from './production-config-guard.mjs';
import {atomicState} from './production-atomic-state.mjs';
import {SCHEMA_RELEASE_PURPOSE,validateBinding,assertSameBinding} from './background-control-manifest.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {readRegisteredModernSchemaApproval,validateModernSchemaContext} from './production-modern-schema-authority.mjs';
import {ModernSchemaRegistry} from './production-modern-schema-registration.mjs';
import {assertModernReleaseAdmission} from './production-maintenance-admission.mjs';
import {readLinuxProcessIdentity,assertOriginalModernSchemaProcess,assertModernSchemaLeaseStillOriginal} from './production-modern-schema-session-lease.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_STATE_HOLD='+code);};
export const MODERN_SCHEMA_PHASES=Object.freeze(['REGISTERED','DRAINED','INGRESS_FENCED','R_STOP_INTENT','R_STOPPED','FRESH_RECHECKED','BACKUP_VERIFIED','DDL_STARTED','SCHEMA_RECEIPTED','API_BODY','API_VERIFIED','OPEN_INTENT','OPEN_PUBLISHED','INGRESS_RELEASED','COMPLETED_OPEN']);
export function modernSchemaReleaseBinding(input,preparationSha256){
 const context=validateModernSchemaContext(input);if(!/^[a-f0-9]{64}$/.test(preparationSha256??''))fail('PREPARATION_REQUIRED');
 return validateBinding({owner:context.owner,previousFloorSha:context.runtimeSha,targetSha:context.targetSha,deployMode:'api',
  ...(context.floorSha!==context.runtimeSha?{previousConfigFloorSha:context.floorSha}:{}),purpose:SCHEMA_RELEASE_PURPOSE,
  schemaRelease:{contextDigest:canonicalDigest(context),preparationSha256}});
}
export function validateModernSchemaPending(value,binding){
 if(!value||value.schema!=='phoenix.modern-schema-release-pending/v1')fail('PENDING_REQUIRED');assertSameBinding(value,binding);
 const {stateDigest,...content}=value;
 if(canonicalDigest(content)!==stateDigest||!MODERN_SCHEMA_PHASES.includes(value.phase)||!['RUNNING','HOLD'].includes(value.status)
  ||!Number.isSafeInteger(value.sequence)||value.sequence<0||value.sequence>64||!value.supervisor||!value.supervisor.pid
  ||!/^[a-f0-9]{64}$/.test(value.receiptSha256??'')||!Number.isFinite(Date.parse(value.updatedAt)))fail('PENDING_DIGEST_OR_PHASE');return value;
}
export class ModernSchemaReleaseState {
 constructor(context,preparationSha256,dependencies={}){
  this.context=validateModernSchemaContext(context);this.binding=modernSchemaReleaseBinding(context,preparationSha256);
  this.store=dependencies.store??new ModernSchemaRegistry(dependencies);this.now=dependencies.now??Date.now;
  this.authority=dependencies.authority??(()=>readRegisteredModernSchemaApproval(this.context));
  this.readProcess=dependencies.readProcess??readLinuxProcessIdentity;this.checkProcess=dependencies.checkProcess??assertOriginalModernSchemaProcess;
  this.checkLease=dependencies.checkLease??assertModernSchemaLeaseStillOriginal;
  this.noOtherRelease=dependencies.noOtherRelease??assertModernReleaseAdmission;
  this.writeAtomic=dependencies.writeAtomic??((value)=>atomicState(path.join(this.store.directory,'schema-release-pending.json'),value));
 }
 read(){this.store.guard();return validateModernSchemaPending(this.store.read('schema-release-pending.json'),this.binding);}
 #authorize(state,leaseRequired){
  this.authority();this.checkProcess(state.supervisor);
  if(process.pid!==state.supervisor.pid)fail('ORIGINAL_SUPERVISOR_WRITER_REQUIRED');
  if(this.now()<Date.parse(this.context.window.start)||this.now()>=Date.parse(this.context.window.end))fail('WINDOW_EXPIRED');
  if(leaseRequired){if(!state.lease)fail('ORIGINAL_LEASE_REQUIRED');this.checkLease(state.lease);}
 }
 claim(){
  this.noOtherRelease();for(const marker of ['transaction.json','policy-transition.json'])if(this.store.exists(marker))fail('UNFINISHED_DEPLOYMENT_TRANSACTION');
  this.store.guard();const authority=this.authority(),supervisor=this.readProcess(process.pid),updatedAt=new Date(this.now()).toISOString();
  const receipt={schema:'phoenix.modern-schema-release-step/v1',...this.binding,sequence:0,from:null,to:'REGISTERED',previousDigest:null,
   payload:{approvalSha256:authority.approvalSha256,supervisor},recordedAt:updatedAt};
  this.store.immutable(`schema-release-step-${this.context.owner}-0-registered.json`,receipt);
  const content={schema:'phoenix.modern-schema-release-pending/v1',...this.binding,phase:'REGISTERED',status:'RUNNING',sequence:0,
   supervisor,lease:null,receiptSha256:canonicalDigest(receipt),updatedAt};
  // Pending is root/fsynced before FENCE, restart changes, TERM or any DDL.
  this.store.immutable('schema-release-pending.json',{...content,stateDigest:canonicalDigest(content)});return this.read();
 }
 advance(from,to,payload,{lease=null}={}){
  const before=this.read(),index=MODERN_SCHEMA_PHASES.indexOf(from);
  if(before.phase!==from||before.status!=='RUNNING'||index<0||MODERN_SCHEMA_PHASES[index+1]!==to)fail('SINGLE_NEXT_STEP_REQUIRED');
  this.#authorize(before,index>=1);
  if(to==='DRAINED'&&!lease)fail('NATIVE_ORIGINAL_LEASE_REQUIRED');if(lease&&to!=='DRAINED')fail('LEASE_REPLACEMENT_FORBIDDEN');
  if(to==='DRAINED')this.checkLease(lease);
  const sequence=before.sequence+1,recordedAt=new Date(this.now()).toISOString();
  const receipt={schema:'phoenix.modern-schema-release-step/v1',...this.binding,sequence,from,to,previousDigest:before.receiptSha256,payload:structuredClone(payload),recordedAt};
  const name=`schema-release-step-${this.context.owner}-${sequence}-${to.toLowerCase().replaceAll('_','-')}.json`;
  this.store.immutable(name,receipt);this.#authorize(lease?{...before,lease}:before,index>=1||to==='DRAINED');
  if(!same(this.read(),before))fail('PENDING_MOVED');
  const {stateDigest,...prior}=before,content={...prior,phase:to,sequence,lease:lease??prior.lease,receiptSha256:canonicalDigest(receipt),updatedAt:recordedAt};
  this.writeAtomic({...content,stateDigest:canonicalDigest(content)});const after=this.read();this.#authorize(after,true);return after;
 }
 hold(reason){
  if(!/^[A-Z0-9_]{1,100}$/.test(reason))fail('FIXED_REASON_REQUIRED');const state=this.read(),{stateDigest,...content}=state;
  const next={...content,status:'HOLD',holdReason:reason,updatedAt:new Date(this.now()).toISOString()};this.writeAtomic({...next,stateDigest:canonicalDigest(next)});return this.read();
 }
 /** An orphan DDL intent counts too: marker replacement may have failed. */
 ddlIntentExists(){
  return this.store.exists(`schema-release-step-${this.context.owner}-7-ddl-started.json`)
   ||MODERN_SCHEMA_PHASES.indexOf(this.read().phase)>=MODERN_SCHEMA_PHASES.indexOf('DDL_STARTED');
 }
}
/** Observation result only, never permission to restore or retry. Dedicated
 * recovery must acquire its own FD9/dual session and remeasure these facts. */
export function classifyModernSchemaRecovery({pending,ddlIntentExists,facts}){
 const index=MODERN_SCHEMA_PHASES.indexOf(pending?.phase);if(index<0||typeof ddlIntentExists!=='boolean')fail('RECOVERY_STATE_REQUIRED');
 if(ddlIntentExists||index>=MODERN_SCHEMA_PHASES.indexOf('DDL_STARTED'))return {disposition:index>=MODERN_SCHEMA_PHASES.indexOf('SCHEMA_RECEIPTED')?'FORWARD_API_VERIFICATION_REQUIRED':'DDL_RESULT_UNKNOWN_KEEP_FENCED',automaticRetry:false,automaticRollback:false,releaseAuthorized:false};
 const required=['ledgerUnchanged','schemaUnchanged','businessFactsUnchanged','floorPinsUnchanged','transactionAbsent','allExecutorsAccountedFor','originalImagePresent'];
 if(!facts||!required.every(key=>facts[key]===true))return {disposition:'PRE_DDL_FACTS_UNPROVED_KEEP_FENCED',automaticRetry:false,automaticRollback:false,releaseAuthorized:false};
 return {disposition:index>=MODERN_SCHEMA_PHASES.indexOf('R_STOP_INTENT')?'ELIGIBLE_FOR_CONTROLLED_ORIGINAL_R_RESTORE':'ELIGIBLE_FOR_CONTROLLED_PRE_EFFECT_ABORT',
  automaticRetry:false,automaticRollback:false,releaseAuthorized:false};
}
