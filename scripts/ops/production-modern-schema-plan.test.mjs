import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {deriveModernSchemaPlan,bindCompiledSchemaInventory,readCommittedSchemaInventory,collectModernSchemaPlan} from './production-modern-schema-plan.mjs';
const hash=c=>c.repeat(64),sha=c=>c.repeat(40);
function unit(n){const timestamp=1795000000000+n,name='OwnedMigration'+n;return {path:`apps/api/src/database/migrations/${timestamp}-${name}.ts`,sourceBlob:sha('a'),timestamp,className:name+timestamp,effectiveName:name+timestamp,sourceSha256:hash('b')};}
function fixture(count=2){
 const source=Array.from({length:count},(_,n)=>unit(n+1)),compiled=source.map(u=>({file:path.posix.basename(u.path,'.ts')+'.js',className:u.className,effectiveName:u.effectiveName,timestamp:u.timestamp,compiledSha256:hash('c')}));
 const legacyTime=1790000000000.625;
 return {targetSha:sha('d'),runtimeSha:sha('e'),candidateImageId:'sha256:'+hash('f'),source,runtimeSource:[source[0]],compiled,
  ledger:{legacy:[{filename:'20260101_owned.sql',applied_at:legacyTime}],typeorm:[{timestamp:Math.round(legacyTime),name:'20260101_owned'},{timestamp:source[0].timestamp,name:source[0].effectiveName}]},
  canonicalLegacy:['20260101_owned.sql'],retired:[],changedMigrationPaths:source.slice(1).map(x=>x.path)};
}
test('complete pending is computed from all exact image/ledger tuples, beyond the twenty-item diagnostic sample',()=>{
 const f=fixture(27),plan=deriveModernSchemaPlan(f);assert.equal(plan.pendingCount,26);assert.equal(plan.pendingMigrations.length,26);assert.equal(plan.ledgerValidation.diagnostics.canonical_typeorm_pending.length,20);
 assert.equal(plan.beforeLedgerSha256,createHash('sha256').update(JSON.stringify(f.ledger)).digest('hex'));assert.equal(plan.releaseAuthorized,false);assert.equal(plan.readOnly,true);
});
test('an old runtime source that is genuinely missing from the ledger is pending even outside changed paths',()=>{
 const f=fixture();f.ledger.typeorm=f.ledger.typeorm.filter(x=>x.name!==f.source[0].effectiveName);const plan=deriveModernSchemaPlan(f);
 assert.equal(plan.pendingCount,2);assert.equal(plan.changedMigrationPaths.length,1);assert.deepEqual(plan.pendingMigrations.map(x=>x.effectiveName),f.source.map(x=>x.effectiveName));
});
test('exact timestamp/name and bridge checks cannot be replaced by basename aliases or diagnostics',()=>{
 for(const change of [f=>f.ledger.typeorm[1].timestamp++,f=>f.ledger.typeorm[1].name='OwnedMigration1',f=>f.ledger.typeorm.push({...f.ledger.typeorm[1]}),
  f=>f.ledger.typeorm[0].timestamp++,f=>f.ledger.legacy.push({...f.ledger.legacy[0]}),f=>f.ledger.legacy[0].filename='unknown.sql',f=>f.ledger.typeorm.push({timestamp:1792000000000,name:'UnknownApplied1792000000000'})]){
  const f=fixture();change(f);assert.throws(()=>deriveModernSchemaPlan(f),/HOLD=/);
 }
});
test('a source already applied beyond R needs independent protected prior provenance and is never replayed',()=>{
 const f=fixture();f.ledger.typeorm.push({timestamp:f.source[1].timestamp,name:f.source[1].effectiveName});
 assert.throws(()=>deriveModernSchemaPlan(f),/PRIOR_APPLY_PROVENANCE_REQUIRED/);let checked=0;
 const plan=deriveModernSchemaPlan(f,{verifyPriorProvenance:u=>{checked++;assert.equal(u.path,f.source[1].path);return true;}});assert.equal(checked,1);assert.equal(plan.pendingCount,0);
});
test('R sources cannot be modified or removed while pretending this is an additive schema release',()=>{
 for(const change of [f=>f.source[0]={...f.source[0],sourceBlob:sha('c')},f=>f.runtimeSource.push(unit(99)),f=>f.changedMigrationPaths=[],f=>f.changedMigrationPaths.push('scripts/deploy-schema-first.sh')]){
  const f=fixture();change(f);assert.throws(()=>deriveModernSchemaPlan(f),/SOURCE_CHANGED_OR_REMOVED|EXACT_ADDITIVE/);
 }
});
test('all compiled files must match the exact source unit, raw effective name and actual compiled bytes hash',()=>{
 for(const change of [f=>f.compiled.pop(),f=>f.compiled[0].effectiveName+=' ',f=>f.compiled[0].timestamp++,f=>f.compiled[0].file='other.js',
  f=>f.compiled[0].className='Other',f=>f.compiled[0].compiledSha256=null,f=>f.compiled[1]={...f.compiled[0]}]){
  const f=fixture();change(f);assert.throws(()=>bindCompiledSchemaInventory(f.source,f.compiled),/HOLD=/);
 }
});
test('the actual committed R105 and c811125 are regular source blobs with exact additive identities',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),r=readCommittedSchemaInventory(root,'cb42966edfa717b0984936951143d84973c1a263'),t=readCommittedSchemaInventory(root,'c811330e4182660e299d8bf44a35794ba0846470');
 assert.equal(r.length,105);assert.equal(t.length,125);for(const u of r)assert.deepEqual(t.find(v=>v.path===u.path),u);assert.equal(t.filter(u=>!r.some(v=>v.path===u.path)).length,20);
});
test('unsafe source arguments cannot cause a Git, Docker or database operation',async()=>{
 let guard=false;await assert.rejects(collectModernSchemaPlan({query:()=>assert.fail('No database read')},{targetSha:'--help',runtimeSha:sha('e'),candidateImageId:'sha256:'+hash('f'),owner:'1-1'},
  {guard:()=>{guard=true;},inspectImage:()=>assert.fail('No Docker operation')}),/EXACT_PLAN_BINDING/);assert.equal(guard,false);
});
