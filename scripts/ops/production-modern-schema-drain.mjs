/** Persist the original coordinator's native drain in the unchanged location
 * consumed by the formal promotion/Compose guard. Never accept caller JSON. */
import path from 'node:path';
import {assertSameBinding} from './background-control-manifest.mjs';
import {modernSchemaReleaseBinding} from './production-modern-schema-state.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {assertModernSchemaLeaseStillOriginal,originalModernSchemaSessionPredicate} from './production-modern-schema-session-lease.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_DRAIN_HOLD='+code);};
export async function persistModernSchemaOriginalDrain({context,preparationSha256,rootLease,coordinator,privateRuntime,drain,admit},dependencies={}){
 const binding=modernSchemaReleaseBinding(context,preparationSha256),checkLease=dependencies.checkLease??assertModernSchemaLeaseStillOriginal;
 if(typeof admit!=='function'||!rootLease||!coordinator?.publisher||!coordinator.session||!drain)fail('ORIGINAL_NATIVE_COORDINATOR_REQUIRED');
 const check=async()=>{
  privateRuntime.guard();if(await admit()!==true||coordinator.closed||!coordinator.ready||!coordinator.session.connected()
    ||checkLease(rootLease)!==true||await coordinator.session.query(originalModernSchemaSessionPredicate(rootLease))!==true)fail('ORIGINAL_NATIVE_DUAL_SESSION_REQUIRED');
  privateRuntime.guard();
 };
 await check();assertSameBinding(coordinator.binding,binding);assertSameBinding(drain,binding);
 const owned=coordinator.publisher.assertOwned(binding),participants=await coordinator.verifyQuiescent();
 if(drain.protocolVersion!==1||drain.outcome!=='DRAINED'||!Number.isSafeInteger(drain.generation)||drain.generation!==owned.record.generation
   ||owned.record.phase!=='FENCED'||owned.record.holdReason||owned.manifest.phase!=='FENCED'||!Array.isArray(participants)||participants.length!==1||!same(participants,drain.participants))fail('EXACT_ORIGINAL_DRAIN_REQUIRED');
 await check();const file=path.join(privateRuntime.directory,`background-drain-${context.owner}.json`);
 privateRuntime.publishJson(file,drain);
 await check();if(!same(await coordinator.verifyQuiescent(),participants))fail('ORIGINAL_EXECUTOR_CHANGED_AFTER_PUBLICATION');
 return {file,sha256:canonicalDigest(drain)};
}
