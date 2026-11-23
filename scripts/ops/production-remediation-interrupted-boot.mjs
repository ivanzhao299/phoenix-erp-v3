/** Native start witness for the one interrupted pre-DDL recovery. The original
 * command output and boot time corroborate identity. Only a fresh measurement
 * under a new lease can certify the running database. */
import fs from 'node:fs';
import path from 'node:path';
import {CONTRACT} from './production-config-guard.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {heldOwner,heldTarget,assertHeldEdge} from './production-remediation-held-facts.mjs';

export const cutoff=Date.parse('2026-11-23T15:07:52Z');
export const interruptedBoot='2026-11-23T10:15:31.984687687Z';
const check=(ok,code)=>{if(!ok)throw Error('INTERRUPTED_BOOT_HOLD='+code);};
export function exactHeldAttempt(pending){
 return pending.owner===heldOwner&&pending.targetSha===heldTarget&&pending.sequence===5&&pending.phase==='FRESH_RECHECKED'&&
  pending.status==='HOLD'&&pending.stateDigest==='c8415dc078bcfa3546e47f567031adb5495632a76a17ab86a7abab3178d4c9dc';
}
function pinnedOutput(file){
 const before=fs.lstatSync(file,{bigint:true});
 const bytes=readPinnedFile(file,{contract:CONTRACT});
 const after=fs.lstatSync(file,{bigint:true});
 check(['ino','dev','mtimeNs','ctimeNs','size'].every(k=>before[k]===after[k]),'COMMAND_OUTPUT_CHANGED');
 return {bytes,mtimeNs:after.mtimeNs};
}
export function verifyCommandBoot({apiId,bootAt,stdout,stderr}){
 check(/^[a-f0-9]{64}$/.test(apiId)&&stdout.bytes.equals(Buffer.from(apiId+'\n'))&&stderr.bytes.length===0&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{9}Z$/.test(bootAt),'ORIGINAL_START_OUTPUT');
 const time=BigInt(Date.parse(bootAt))*1000000n+BigInt(bootAt.slice(-7,-1));
 check(stderr.mtimeNs<=time&&time<=stdout.mtimeNs&&stdout.mtimeNs-stderr.mtimeNs<=20_000_000_000n,'ORIGINAL_BOOT_OUTSIDE_COMMAND');
}
export function readInterruptedBoot(store,scope,inspectionOwner){
 const {pending,preparation,steps,beforeFactsSha256,catalog,policy}=scope,{context,preparationSha256}=preparation;
 check(exactHeldAttempt(pending)&&typeof inspectionOwner==='string'&&/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/.test(inspectionOwner)&&inspectionOwner!==heldOwner,'EXACT_SCOPE');
 const read=kind=>store.read('schema-release-'+kind+'-'+heldOwner+'.json');
 const intent=read('original-recovery-intent'),before=read('recovery-before-schema'),inspected=store.read('schema-release-held-facts-'+inspectionOwner+'.json');
 const {api,db}=preparation.originalSnapshot.containers;
 check(intent.schema==='phoenix.modern-schema-original-recovery-intent/v1'&&intent.owner===heldOwner&&intent.contextDigest===canonicalDigest(context)&&
  intent.preparationSha256===preparationSha256&&same(intent.originalLease,pending.lease)&&intent.originalContainerId===api.id&&intent.originalImageId===api.image&&
  same(intent.originalRestartPolicy,policy)&&intent.pendingSha256===canonicalDigest(pending)&&intent.originalLedgerSha256===context.beforeLedgerSha256&&
  beforeFactsSha256===steps[5].payload.evidence.factsSha256&&intent.beforeFactsSha256===beforeFactsSha256&&intent.automaticRetry===false&&
  intent.beforeCatalogSha256===canonicalDigest(before)&&before.owner===heldOwner&&before.stage==='recovery-before'&&before.schema===catalog.schema&&
  before.schemaSha256===catalog.schemaSha256&&same(before.databasePin,db)&&before.readOnly===true&&before.releaseAuthorized===false,'RECOVERY_INTENT');
 check(inspected.schema==='phoenix.held-facts-inspection/v1'&&inspected.owner===inspectionOwner&&inspected.originalOwner===heldOwner&&
  inspected.pendingSha256===canonicalDigest(pending)&&inspected.originalBootAt===interruptedBoot&&inspected.leaseExit?.outcome==='ORIGINAL_SESSION_ABSENT'&&
  inspected.leaseExit.transportClosed===true&&inspected.leaseExit.originalLeaseSha256!==canonicalDigest(pending.lease)&&
  same(inspected.result,{outcome:'MATCH',before:beforeFactsSha256,after:beforeFactsSha256,changedTables:0,changedSequences:0,releaseAuthorized:false})&&
  same(inspected.changedTables,[])&&same(inspected.changedSequences,[]),'INDEPENDENT_MATCH_REQUIRED');
 const raw=JSON.parse(readPinnedFile(path.join(store.directory,'.transport-'+inspectionOwner+'-recover-check-held.receipt'),{contract:CONTRACT}));
 check(same(raw,inspected.result),'FORMAL_INSPECTION_RETURN');
 const dir=path.join(store.directory,'schema-release-recovery-'+heldOwner);
 verifyCommandBoot({apiId:api.id,bootAt:interruptedBoot,stdout:pinnedOutput(path.join(dir,'original-r-start.stdout')),stderr:pinnedOutput(path.join(dir,'original-r-start.stderr'))});
 return {inspectionOwner,inspectionSha256:canonicalDigest(inspected),intentSha256:canonicalDigest(intent),catalog:before,bootAt:interruptedBoot};
}
export function guardInterruptedEdge(directory){
 check(Date.now()<cutoff,'CUMULATIVE_WINDOW_EXPIRED');assertHeldEdge(directory);
}
