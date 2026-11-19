import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {digest,LEDGER_SQL} from './chanjet-admission-schema-receipt.mjs';
import {assertExactModernSchemaAfterLedger,captureModernSchemaLedger} from './production-modern-schema-schema-result.mjs';

test('the modern effect keeps one after-schema facts scan and rechecks live evidence after protected receipts',()=>{
 const source=fs.readFileSync(new URL('./production-modern-schema-schema-result.mjs',import.meta.url),'utf8');
 const effect=source.slice(source.indexOf('export async function verifyModernSchemaEffect'));
 assert.equal([...effect.matchAll(/\bcaptureModernSchemaFacts\s*\(/g)].length,1);
 assert.equal([...effect.matchAll(/\bcaptureModernSchemaLedger\s*\(/g)].length,2);
 assert.doesNotMatch(effect,/privateRuntime\.run\b|withKnownReadonlyWriter|onReceiptWriter|assertScopeMigrationsReceipted|readProductionLedger/);
 const firstFacts=effect.indexOf('await captureModernSchemaFacts');
 const publication=effect.indexOf('await publishVerifiedMigrationApplyReceipts');
 const postLedger=effect.lastIndexOf('await captureModernSchemaLedger');
 const postAudit=effect.lastIndexOf('await audit()');
 const liveDefaultOff=effect.indexOf('await captureModernSchemaDefaultOff');
 const formalReceipt=effect.indexOf('privateRuntime.publishJson(file,bundle)');
 assert.ok(firstFacts<publication&&publication<postLedger&&postLedger<postAudit&&postAudit<liveDefaultOff&&liveDefaultOff<formalReceipt);
 assert.match(effect,/verifyScopeRegistryReceiptsFromLedger\(root,\{[^\n]+\},afterLedger,\{directory\}\)/);
});

test('precise after-ledger proof comes from the supplied client and rejects a changed or repeated unit',async()=>{
 const before={legacy:[{filename:'baseline.sql',applied_at:10}],typeorm:[{name:'Existing1',timestamp:1}]};
 const unit={effectiveName:'Pending2',timestamp:2};
 const after={legacy:structuredClone(before.legacy),typeorm:[...before.typeorm,{name:unit.effectiveName,timestamp:unit.timestamp}]};
 const proof=await captureModernSchemaLedger({async query(sql){
  assert.equal(sql,LEDGER_SQL);
  return {rows:[{jsonb_build_object:JSON.stringify(after)}]};
 }});
 assert.deepEqual(proof,{ledger:after,sha256:digest(JSON.stringify(after))});
 const context={beforeLedgerSha256:digest(JSON.stringify(before)),pendingMigrations:[unit]};
 assert.equal(assertExactModernSchemaAfterLedger(before,proof.ledger,context),true);
 for(const ledger of [
  {...after,legacy:[]},
  {...after,typeorm:[...after.typeorm,after.typeorm[1]]},
  {...after,typeorm:[before.typeorm[0],{...after.typeorm[1],name:'Different2'}]},
 ]){
  assert.throws(()=>assertExactModernSchemaAfterLedger(before,ledger,context),/EXACT_BEFORE_AFTER_NATIVE_LEDGER_REQUIRED/);
 }
});
