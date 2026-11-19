/** Native session cleanup is observed from a different read-only backend.
 * A local docker/psql child exiting is never proof its server session ended. */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {PUBLIC_DIRECTORY,inspectPublicDirectory} from './background-control-manifest.mjs';
import {assertSameDirectory} from './production-trusted-paths.mjs';
import {originalModernSchemaSessionPredicate} from './production-modern-schema-session-lease.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_COMPLETION_HOLD='+code);};
/** A visible rename is not a durability proof. The original root retries this
 * before releasing S after any uncertain public publication response. */
export function confirmModernSchemaPublicDurability(read,guard,dependencies={}){
 if(typeof read!=='function'||typeof guard!=='function')fail('ORIGINAL_PUBLIC_OBSERVER_REQUIRED');
 const io=dependencies.fs??fs,inspect=dependencies.inspect??inspectPublicDirectory;
 guard();const first=read();if(!first)return null;
 const before=inspect(PUBLIC_DIRECTORY),fd=io.openSync(PUBLIC_DIRECTORY,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 let durable=false;try{io.fsyncSync(fd);durable=true;}finally{try{io.closeSync(fd);}catch(error){if(!durable)throw error;}}
 assertSameDirectory(before,inspect(PUBLIC_DIRECTORY));guard();const second=read();
 if(!same(first,second))fail('PUBLIC_PROJECTION_CHANGED_DURING_DURABILITY_CHECK');
 return {...second,durabilityConfirmed:true};
}
/** Observation after a possibly lost publication response. Expiry cannot
 * revoke an already durable, fully evidenced public admission decision. */
export function observeCommittedModernSchemaOpen({context,store,publisher,lease}){
 const name=`schema-release-open-commit-intent-${context.owner}.json`;
 const manifest=publisher.readPublic();
 if(manifest?.phase!=='OPEN'||manifest.owner!==context.owner||manifest.targetSha!==context.targetSha)return null;
 if(!store.exists(name))return null;
 const intent=store.read(name);
 if(intent.schema!=='phoenix.modern-schema-open-commit-intent/v1'||intent.owner!==context.owner||intent.targetSha!==context.targetSha
  ||intent.contextDigest!==canonicalDigest(context)||intent.defaultOff!==true||!same(intent.originalLease,lease)
  ||intent.expectedPublicManifestSha256!==canonicalDigest(intent.expectedPublicManifest))fail('COMMIT_INTENT_UNVERIFIED');
 const control=publisher.readPrivate();
 if(!same(manifest,intent.expectedPublicManifest)||control?.phase!=='OPEN'||control.owner!==context.owner||control.targetSha!==context.targetSha
  ||control.generation!==manifest.generation||publisher.readHighWater()<manifest.generation
  ||control.manifestDigest!==createHash('sha256').update(JSON.stringify(manifest)).digest('hex'))fail('COMMITTED_PUBLIC_PROJECTION_UNVERIFIED');
 return {backgroundAdmissionCommitted:true,openCommitIntentSha256:canonicalDigest(intent),publicManifestSha256:canonicalDigest(manifest)};
}
export function modernSchemaOriginalSessionExitSql(lease){
 originalModernSchemaSessionPredicate(lease); // Strict native identity validation.
 return `SELECT NOT pg_is_in_recovery() AS primary,(SELECT oid::bigint FROM pg_database WHERE datname=current_database()) AS "databaseOid",
  (SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",
  trunc(extract(epoch FROM pg_postmaster_start_time())*1000000)::text AS "postmasterStartMicros",
  EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=${lease.sessionPid} AND datid=${lease.database.databaseOid}
   AND trunc(extract(epoch FROM backend_start)*1000000)::text='${lease.backendStartMicros}') AS "originalSessionPresent"`;
}
export async function closeModernSchemaOriginalSession({coordinator,lease,client,guard},dependencies={}){
 if(typeof guard!=='function'||!client||!coordinator)fail('ORIGINAL_CLEANUP_REQUIRED');
 const sql=modernSchemaOriginalSessionExitSql(lease),now=dependencies.now??(()=>performance.now()),pause=dependencies.pause??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 await guard();let transportClosed=true;try{await coordinator.close();}catch{transportClosed=false;}
 const deadline=now()+10000;
 for(;;){
  await guard();const {rows:[observed]}=await client.query(sql);
  if(observed?.primary!==true||observed.databaseOid!==lease.database.databaseOid||observed.systemIdentifier!==lease.database.systemIdentifier
    ||observed.postmasterStartMicros!==lease.database.postmasterStartMicros||typeof observed.originalSessionPresent!=='boolean')fail('ORIGINAL_PRIMARY_IDENTITY_UNVERIFIED');
  if(!observed.originalSessionPresent)return {schema:'phoenix.modern-schema-original-session-closed/v1',originalLeaseSha256:canonicalDigest(lease),
    outcome:'ORIGINAL_SESSION_ABSENT',transportClosed,nativeObservation:observed,checkedAt:new Date().toISOString()};
  if(now()>=deadline)fail('ORIGINAL_SERVER_SESSION_REMAINS');await pause(100);
 }
}
