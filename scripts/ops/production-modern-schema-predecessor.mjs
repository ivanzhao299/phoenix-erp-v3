import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {readHeldModernSchemaApiBody} from './production-modern-schema-terminal.mjs';

import {losslessJsonFacts} from './production-lossless-json.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {CONTRACT} from './production-config-guard.mjs';
export function frozenGroupsDigest(raw){
 const facts=losslessJsonFacts(raw);
 const groups=facts?.[0]==='object'&&facts[1].find(([name])=>name==='overposted_grades')?.[1];
 if(groups?.[0]!=='array'||groups[1].length!==2)fail();
 return canonicalDigest(groups);
}
export const previousOwner='44917766283-1';
export const previousTarget='eaeec067bbc5f0e9c70cefc50b665d988d55b153';
const completedBy='44974413964-1';
const fail=()=>{throw Error('MODERN_SCHEMA_SUCCESSOR_HOLD=PREDECESSOR_RECEIPTS_CHANGED');};

/** Re-read the original native schema and sealed historical CLI-result labels
 * through the same reader that completed its separate forward-API recovery. */
export function readCompletedModernSchemaPredecessor(store,plan,{readBody=readHeldModernSchemaApiBody,read=filename=>JSON.parse(readPinnedFile(filename,{contract:CONTRACT}))}={}){
 const prior=name=>store.read('schema-release-'+name+'-'+previousOwner+'.json');
 const prepared=prior('preparation'),intent=prior('forward-api-intent'),terminal=prior('forward-api-terminal');
 const deployment=store.read('deploy-'+previousOwner+'.json');
 const lease=store.read('schema-release-forward-api-lease-closed-'+completedBy+'.json');
 const {context,preparationSha256}=prepared;
 if(context.owner!==previousOwner||context.targetSha!==previousTarget||context.pendingMigrations?.length!==20||
    context.sourceInventorySha256!==plan.runtimeInventorySha256||
    intent.schema!=='phoenix.modern-forward-api-intent/v1'||intent.owner!==previousOwner||intent.targetSha!==previousTarget||
    intent.pendingSha256!==canonicalDigest(intent.pending)||intent.migrationAuthorized!==false||intent.defaultOff!==true||
    terminal.schema!=='phoenix.modern-forward-api-terminal/v1'||terminal.owner!==previousOwner||terminal.targetSha!==previousTarget||
    terminal.completionOwner!==completedBy||terminal.outcome!=='SUCCESS'||terminal.defaultOff!==true||
    terminal.intentSha256!==canonicalDigest(intent)||terminal.leaseExitSha256!==canonicalDigest(lease)||
    lease.intentSha256!==terminal.intentSha256||lease.owner!==previousOwner||lease.recoveryOwner!==completedBy||
    lease.targetSha!==previousTarget||lease.outcome!=='ORIGINAL_SESSION_ABSENT'||lease.transportClosed!==true||
    terminal.formalDeploymentSha256!==canonicalDigest(deployment)||intent.formalDeploymentSha256!==terminal.formalDeploymentSha256||
    deployment.target!==previousTarget||deployment.outcome!=='SUCCESS'||deployment.deployMode!=='api'||
    intent.afterLedgerSha256!==plan.beforeLedgerSha256||terminal.afterLedgerSha256!==plan.beforeLedgerSha256)fail();
 const held=readBody({store,context,preparationSha256,prepared,pending:intent.pending});
 if(held.schemaReceiptSha256!==terminal.schemaReceiptSha256||intent.schemaReceiptSha256!==held.schemaReceiptSha256||
    intent.bodyReceiptSha256!==canonicalDigest(held.bodyReceipt)||held.bundle.afterLedgerSha256!==plan.beforeLedgerSha256||
    !same(held.bundle.perMigrationReceipts.map(row=>row.path).sort(),context.changedMigrationPaths))fail();
 const backupStep=store.read('schema-release-step-'+previousOwner+'-6-backup-verified.json').payload.evidence;
 const rehearsal=read(backupStep.rehearsalFile),driver=read(held.bundle.driverReceiptFile);
 if(canonicalDigest(rehearsal)!==backupStep.rehearsalSha256||canonicalDigest(driver)!==held.bundle.driverReceiptSha256)fail();
 const resources=[...prepared.ownedResources,...rehearsal.resources,driver.run,driver.show];
 const afterAudit=read(held.bundle.afterRawAuditFile);
 if(canonicalDigest(afterAudit)!==held.bundle.afterRawAuditSha256)fail();
 return {resources,afterFrozenGroupsSha256:frozenGroupsDigest(afterAudit.originalAudit),owner:previousOwner,targetSha:previousTarget,completionOwner:completedBy,terminalSha256:canonicalDigest(terminal),
  schemaReceiptSha256:held.schemaReceiptSha256,afterLedgerSha256:plan.beforeLedgerSha256,priorUnitCount:20};
}
