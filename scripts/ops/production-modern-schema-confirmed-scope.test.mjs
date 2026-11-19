import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {reviewConfirmedLegacyScope,verifyConfirmedModernSchemaSources,CONFIRMED_MODERN_SCHEMA_DIRECTIVE} from './production-modern-schema-confirmed-scope.mjs';
import {fixedScopeFixture} from '../ci/modern-schema-release.fixture.mjs';
const changeDaily=(f,action)=>{const rows=JSON.parse(f.dailyRowsRaw);action(rows);f.dailyRowsRaw=JSON.stringify(rows);};
test('fixed source validates the unchanged approved plan and exact readonly evidence SQL',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');assert.equal(verifyConfirmedModernSchemaSources(root),canonicalDigest(CONFIRMED_MODERN_SCHEMA_DIRECTIVE));
 assert.equal(verifyConfirmedModernSchemaSources(root,undefined,'c811330e4182660e299d8bf44a35794ba0846470'),canonicalDigest(CONFIRMED_MODERN_SCHEMA_DIRECTIVE));
});
test('actual user statement is a narrow scope claim, with original HOLD and no stock-count or release claim',()=>{
 const f=fixedScopeFixture(),before=structuredClone(f),result=reviewConfirmedLegacyScope(f);
 assert.equal(result.manifest.classification,'USER_CONFIRMED_TEST_OR_MISENTRY');assert.equal(result.manifest.groups.length,2);assert.equal(result.businessEvidence.originalConclusion,'HOLD');
 assert.equal(result.businessEvidence.releaseAuthorized,false);assert.equal(result.businessEvidence.physicalInventoryVerified,false);assert.deepEqual(f,before);
});
test('explicit zero GRADE_4/5 report keys remain zero without inferring an allocation',()=>{
 const f=fixedScopeFixture();changeDaily(f,rows=>{rows[0].eggs_by_grade.GRADE_4=0;rows[0].eggs_by_grade.GRADE_5=0;});assert.equal(reviewConfirmedLegacyScope(f).businessEvidence.releaseAuthorized,false);
});
for(const [name,change]of [
 ['another group',a=>a.overposted_grades[0].grade='GRADE_6'],['batch ID',a=>a.overposted_grades[0].inbound_batches[0].id=414],
 ['ledger date',a=>a.overposted_grades[0].inbound_ledger[0].log_date='2026-11-18'],['ledger ID',a=>a.overposted_grades[0].inbound_ledger[0].id=650],['batch number',a=>a.overposted_grades[0].inbound_batches[0].batch_no='OTHER'],
 ['consumption',a=>a.overposted_grades[0].inbound_batches[0].qty_available=29],['extra journal',a=>a.overposted_grades[0].inbound_ledger.push({...a.overposted_grades[0].inbound_ledger[0],id:999})],
 ['different source',a=>a.overposted_grades[0].inbound_batches[0].source_no='OTHER'],['structural blocker',a=>a.daily_duplicate_groups=1],['GO rewrite',a=>a.conclusion='GO'],
 ['warehouse',a=>{a.overposted_grades[0].inbound_batches[0].warehouse_code='OTHER';a.overposted_grades[0].inbound_ledger[0].warehouse_code='OTHER';}],
 ['location',a=>a.overposted_grades[0].inbound_batches[0].location_code='OTHER'],
 ['SKU',a=>{a.overposted_grades[0].inbound_batches[0].sku_code='OTHER';a.overposted_grades[0].inbound_ledger[0].sku_code='OTHER';}],
 ['product',a=>a.overposted_grades[0].inbound_batches[0].product_code='OTHER']
])test('fixed review refuses '+name,()=>{const f=fixedScopeFixture(),a=JSON.parse(f.originalAudit);change(a);f.originalAudit=JSON.stringify(a);assert.throws(()=>reviewConfirmedLegacyScope(f),/SCOPE_HOLD=/);});
test('the original report cannot be completed or reallocated to make the exception pass',()=>{
 for(const change of [f=>changeDaily(f,rows=>rows[0].id=107),f=>changeDaily(f,rows=>rows.push(rows[0])),f=>changeDaily(f,rows=>rows[0].eggs_by_grade.GRADE_4=30),
  f=>changeDaily(f,rows=>rows[0].eggs_by_grade.BROKEN=231),f=>changeDaily(f,rows=>rows[0].shift='ALL'),f=>f.sourceDirectiveSha256='f'.repeat(64),
  f=>changeDaily(f,rows=>{rows[0].eggs_by_grade.GRADE_0++;rows[0].eggs_by_grade.GRADE_1--;}),
  f=>changeDaily(f,rows=>{rows[0].eggs_by_grade.OTHER=rows[0].eggs_by_grade.DIRTY;delete rows[0].eggs_by_grade.DIRTY;})]){
  const f=fixedScopeFixture();change(f);assert.throws(()=>reviewConfirmedLegacyScope(f),/SCOPE_HOLD=/);
 }
});

test('exact raw report quantities cannot round or underflow into the confirmed vector',()=>{
 for(const change of [raw=>raw.replace('"GRADE_0":540','"GRADE_0":540.00000000000001'),raw=>raw.replace('"GRADE_0":540','"GRADE_4":1e-999,"GRADE_0":540'),raw=>raw.replace('"GRADE_0":540','"GRADE_0":"540"')]){
  const f=fixedScopeFixture();f.dailyRowsRaw=change(f.dailyRowsRaw);assert.throws(()=>reviewConfirmedLegacyScope(f),/EXACT_DAILY_VECTOR_MOVED/);
 }
});
