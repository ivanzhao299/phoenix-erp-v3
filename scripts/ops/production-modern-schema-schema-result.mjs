/** Verify the actual atomic CLI result before the ordinary API body. Original
 * per-unit receipt format and its default trust boundary remain unchanged. */
import fs from 'node:fs';import path from 'node:path';
import {CONTRACT,git} from './production-config-guard.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {LEDGER_SQL,digest,validateRegistryReceipt,verifyScopeRegistryReceiptsFromLedger} from './chanjet-admission-schema-receipt.mjs';
import {publishVerifiedMigrationApplyReceipts} from './record-migration-apply-receipt.mjs';
import {captureModernSchemaFacts,assertModernSchemaBusinessUnchanged,captureModernSchemaDefaultOff,defaultOffEvidenceFromFacts} from './production-modern-schema-facts.mjs';
import {collectLegacyEggAuditEvidence} from './production-legacy-egg-audit-evidence.mjs';import {modernSchemaMigrationEvidenceDigest} from './production-modern-schema-audit-recheck.mjs';
import {verifyModernSchemaAuditAfterSchema} from './production-modern-schema-post-audit.mjs';
import {assertBootstrapSchemaEvidence,bootstrapSchemaSql} from './api-bootstrap-schema-preflight.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_EFFECT_HOLD='+code);};
export async function captureModernSchemaLedger(client){const {rows:[{jsonb_build_object:raw}]}=await client.query(LEDGER_SQL);const ledger=JSON.parse(raw);return {ledger,sha256:digest(JSON.stringify(ledger))};}
export function assertExactModernSchemaAfterLedger(before,after,context){
 if(digest(JSON.stringify(before))!==context.beforeLedgerSha256||!same(before.legacy,after.legacy)||after.typeorm.length!==before.typeorm.length+context.pendingMigrations.length
  ||!before.typeorm.every(row=>after.typeorm.some(next=>same(row,next)))||!context.pendingMigrations.every(unit=>after.typeorm.filter(row=>row.name===unit.effectiveName&&String(row.timestamp)===String(unit.timestamp)).length===1))fail('EXACT_BEFORE_AFTER_NATIVE_LEDGER_REQUIRED');return true;
}
export async function verifyModernSchemaEffect({context,preparationSha256,rootLease,preparation,beforeFacts,beforeAudit,beforeLedger,driverReceipt,fencedBackup,privateRuntime,migrationDirectory,admit},dependencies={}){
 const client=dependencies.client,root=dependencies.root??CONTRACT.repository,directory=privateRuntime.directory;
 if(!client||typeof admit!=='function'||driverReceipt?.outcome!=='SUCCESS'||driverReceipt.contextDigest!==canonicalDigest(context)||fencedBackup.receipt.stage!=='fenced'
  ||driverReceipt.backupSha256!==fencedBackup.receipt.backup.sha256)fail('ACTUAL_ORIGINAL_DRIVER_AND_BACKUP_REQUIRED');
 const check=async()=>{privateRuntime.guard();if(await admit()!==true)fail('ORIGINAL_NATIVE_LEASE_REQUIRED');privateRuntime.guard();};await check();
 const verifiedLedger=await captureModernSchemaLedger(client),{ledger:afterLedger,sha256:afterLedgerSha256}=verifiedLedger;
 assertExactModernSchemaAfterLedger(beforeLedger,afterLedger,context);
 const afterFacts=await captureModernSchemaFacts(client,{projection:beforeFacts});assertModernSchemaBusinessUnchanged(beforeFacts,afterFacts);await check();
 const databaseIdentity={name:rootLease.database.name,schema:rootLease.database.schema,systemIdentifier:rootLease.database.systemIdentifier};
 const audit=()=>collectLegacyEggAuditEvidence(client,{targetSha:context.targetSha,floorSha:context.floorSha,runningApiSha:context.runtimeSha,ledgerSha256:afterLedgerSha256,
  migrationEvidenceSha256:modernSchemaMigrationEvidenceDigest(context),databaseIdentity,manifest:preparation.manifest});
 verifyModernSchemaAuditAfterSchema({context,before:beforeAudit,after:await audit(),afterLedgerSha256});
 const contract=JSON.parse(git(root,['show',context.targetSha+':apps/api/src/common/database/api-bootstrap-schema-contract.json']));
 const {rows:[schemaRow]}=await client.query(bootstrapSchemaSql(contract)),schemaEvidence=typeof schemaRow.json_build_object==='string'?JSON.parse(schemaRow.json_build_object):schemaRow.json_build_object;
 const schemaResult=assertBootstrapSchemaEvidence(contract,schemaEvidence);await check();
 const receiptScript=new URL('./record-migration-apply-receipt.mjs',import.meta.url).pathname;
 if(!fs.readFileSync(receiptScript).equals(Buffer.from(git(root,['show',context.targetSha+':scripts/ops/record-migration-apply-receipt.mjs'])+'\n')))fail('EXACT_RECEIPT_WRITER_SOURCE_REQUIRED');
 await publishVerifiedMigrationApplyReceipts({root,directory,targetSha:context.targetSha,runId:context.owner,
  beforeLedgerSha256:context.beforeLedgerSha256,verifiedLedger,pendingMigrations:context.pendingMigrations,
  publish:(file,receipt)=>privateRuntime.publishJson(file,receipt)});
 await check();
 const registry=await verifyScopeRegistryReceiptsFromLedger(root,{baseline:context.runtimeSha,target:context.targetSha,changed:context.changedMigrationPaths},afterLedger,{directory});
 const units=context.pendingMigrations.map(unit=>{
  const record=registry.find(row=>row.migrationPath===unit.path);
  if(!record)fail('ORIGINAL_PER_UNIT_RECEIPT_MISMATCH');
  const {file:receiptFile,receipt}=record;validateRegistryReceipt(receipt,{migrationPath:unit.path,sourceBlob:unit.sourceBlob});
  if(receipt.runId!==context.owner||receipt.sourceSha!==context.targetSha||receipt.beforeLedgerSha256!==context.beforeLedgerSha256||receipt.afterLedgerSha256!==afterLedgerSha256)fail('ORIGINAL_PER_UNIT_RECEIPT_MISMATCH');
  return {path:unit.path,receiptFile,receiptSha256:canonicalDigest(receipt)};
 });
 if((await captureModernSchemaLedger(client)).sha256!==afterLedgerSha256)fail('AFTER_LEDGER_CHANGED_DURING_RECEIPTS');await check();
 const afterAudit=await audit();
 const auditComparison=verifyModernSchemaAuditAfterSchema({context,before:beforeAudit,after:afterAudit,afterLedgerSha256});
 const off=defaultOffEvidenceFromFacts(context.targetSha,afterFacts);
 await captureModernSchemaDefaultOff(client,context.targetSha);await check();
 const beforeFactsFile=path.join(directory,`schema-release-before-facts-${context.owner}.json`),afterFactsFile=path.join(directory,`schema-release-after-facts-${context.owner}.json`);
 const beforeRawAuditFile=path.join(directory,`schema-release-before-audit-${context.owner}.json`),afterRawAuditFile=path.join(directory,`schema-release-after-audit-${context.owner}.json`);
 privateRuntime.publishJson(afterFactsFile,afterFacts);privateRuntime.publishJson(afterRawAuditFile,afterAudit);
 const bundle={schema:'phoenix.modern-schema-effect-receipt/v1',owner:context.owner,contextDigest:canonicalDigest(context),preparationSha256,targetSha:context.targetSha,runtimeSha:context.runtimeSha,
  beforeLedgerSha256:context.beforeLedgerSha256,afterLedgerSha256,pendingPlanSha256:canonicalDigest(context.pendingMigrations),sourceInventorySha256:context.sourceInventorySha256,candidateInventorySha256:context.candidateInventorySha256,
  backupSha256:fencedBackup.receipt.backup.sha256,originalLease:rootLease,driverReceiptFile:path.join(migrationDirectory,'schema-driver-receipt.json'),driverReceiptSha256:canonicalDigest(driverReceipt),
  beforeFactsFile,beforeFactsSha256:canonicalDigest(beforeFacts),afterFactsFile,afterFactsSha256:canonicalDigest(afterFacts),businessDataSha256:beforeFacts.businessDataSha256,defaultOffEvidence:off,
  beforeRawAuditFile,beforeRawAuditSha256:canonicalDigest(beforeAudit),afterRawAuditFile,afterRawAuditSha256:canonicalDigest(afterAudit),perMigrationReceipts:units,
  schemaEvidence:schemaResult,auditComparison,outcome:'SUCCESS_SCHEMA_ONLY',schemaApplied:true,businessActivation:false,originalConclusion:'HOLD',createdAt:new Date().toISOString()};
 const file=path.join(directory,`schema-release-schema-receipt-${context.owner}.json`);await check();privateRuntime.publishJson(file,bundle);await check();return {file,bundle,afterFacts,afterAudit};
}
