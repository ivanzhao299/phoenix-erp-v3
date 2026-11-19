/** Fixed source of the user's confirmed legacy exception. This is an explicit
 * task directive carried by reviewed code, not a recovered signed host file,
 * physical stock count, human signature, or independent GitHub approval.
 * Its registration is valid only for the exact observed two historical rows. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CONTRACT} from './production-config-guard.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {losslessJsonFacts} from './production-lossless-json.mjs';
import {auditSql} from './audit-daily-egg-inbound.mjs';
import {observedLegacyEggGroups,LEGACY_EGG_TEST_MANIFEST} from './production-legacy-egg-audit-evidence.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_SCOPE_HOLD='+code);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const CONFIRMED_MODERN_SCHEMA_DIRECTIVE=Object.freeze({
 schema:'phoenix.fixed-modern-schema-user-directive/v1',origin:'TRUSTED_INTERACTIVE_USER',
 sourceChat:'01a1e72a-aa96-7ce0-8632-7b8c10abdd01',authorizationRef:'MODERN_DEFAULT_OFF_SCHEMA_RELEASE',
 approvedPlan:'docs/production-inbound-installments-implementation-plan-20261118.md',
 approvedPlanSha256:'f3e6dfa834b582306b655862c2a6a57b078f8edf931cf3cf7c8c8201cc0635c8',
 sourceEvidence:'scripts/ops/readonly-audits/daily-egg-grade-evidence-20261117.sql',
 sourceEvidenceSha256:'09c6cc77db256b2d7441d923dd5cf0bdef165418fe53ec8aa1a6f8a6676cc3fd',
 userStatement:'GRADE_4 and GRADE_5, 30 eggs each, are test entries or mistaken entries',
 classification:'USER_CONFIRMED_TEST_OR_MISENTRY',schemaOnlyException:true,
 featureRollout:'OFF',businessActivation:false,physicalInventoryVerified:false,
});
export function verifyConfirmedModernSchemaSources(root=CONTRACT.repository,io=fs){
 for(const [file,hash]of [[CONFIRMED_MODERN_SCHEMA_DIRECTIVE.approvedPlan,CONFIRMED_MODERN_SCHEMA_DIRECTIVE.approvedPlanSha256],
  [CONFIRMED_MODERN_SCHEMA_DIRECTIVE.sourceEvidence,CONFIRMED_MODERN_SCHEMA_DIRECTIVE.sourceEvidenceSha256]]){
  const absolute=path.join(root,file),stat=io.lstatSync(absolute);
  if(!stat.isFile()||stat.isSymbolicLink()||sha(io.readFileSync(absolute))!==hash)fail('REVIEWED_FIXED_SOURCE_CHANGED');
 }
 return canonicalDigest(CONFIRMED_MODERN_SCHEMA_DIRECTIVE);
}
const known=[{grade:'GRADE_4',batchId:413,batchNo:'EGG-20261117-00005',ledgerId:649,sku:'SKU-4-LOOSE',product:'PRD-EGG-4'},
 {grade:'GRADE_5',batchId:415,batchNo:'EGG-20261117-00007',ledgerId:651,sku:'SKU-5-LOOSE',product:'PRD-EGG-5'}];
const originalDailyVector=Object.freeze({GRADE_0:540,GRADE_1:11880,GRADE_2:32760,GRADE_3:1980,DIRTY:540,BROKEN:230});
const counters=['daily_duplicate_groups','daily_unknown_identity_rows','daily_mixed_summary_groups','duplicate_source_groups','unbalanced_production_batches'];
/** Pure fixed check; additional groups, changed identities and any existing
 * consumption remain HOLD. No journal or daily row can be corrected here. */
export function reviewConfirmedLegacyScope({originalAudit,dailyRowsRaw,sourceDirectiveSha256}){
 if(sourceDirectiveSha256!==canonicalDigest(CONFIRMED_MODERN_SCHEMA_DIRECTIVE))fail('FIXED_DIRECTIVE_REQUIRED');
 let audit,exactAudit;try{audit=JSON.parse(originalAudit);exactAudit=losslessJsonFacts(originalAudit,{omitTopLevel:['checked_at']});}catch{fail('EXACT_ORIGINAL_AUDIT_REQUIRED');}
 const groups=observedLegacyEggGroups(audit);
 if(audit.conclusion!=='HOLD'||!counters.every(key=>audit[key]===0)||audit.overposted_grade_groups!==2||groups?.length!==2)fail('ONLY_TWO_CONFIRMED_GROUPS_ALLOWED');
 for(const expected of known){
  const matches=audit.overposted_grades.filter(group=>group.grade===expected.grade),group=matches[0];
  if(matches.length!==1||group.log_date!=='2026-11-17'||group.house_code!=='HOUSE_MS_01'||group.reported_qty!==0||group.inbound_qty!==30||group.over_qty!==30
   ||group.inbound_batches.length!==1||group.inbound_ledger.length!==1)fail('CONFIRMED_GROUP_MOVED');
  const batch=group.inbound_batches[0],entry=group.inbound_ledger[0];
  if(batch.id!==expected.batchId||batch.batch_no!==expected.batchNo||entry.id!==expected.ledgerId||entry.batch_no!==expected.batchNo
   ||batch.company_code!=='COMP-LAO-AGRI'||batch.source_no!=='DAILY-2026-11-17-HOUSE_MS_01-4c5f2ca'
   ||batch.warehouse_code!=='LPH_MS_EGG_FARM'||batch.location_code!=='MSCSKW001'||batch.sku_code!==expected.sku||batch.product_code!==expected.product
   ||batch.qty!==30||batch.qty_available!==30||entry.qty_change!==30||entry.log_date!=='2026-11-17')fail('CONFIRMED_CUSTODY_MOVED');
 }
 let dailyRows,dailyExact;try{dailyRows=JSON.parse(dailyRowsRaw);dailyExact=losslessJsonFacts(dailyRowsRaw);}catch{fail('EXACT_RAW_DAILY_REQUIRED');}
 if(!Array.isArray(dailyRows)||dailyRows.length!==1)fail('EXACT_DAILY_ROW_REQUIRED');const daily=dailyRows[0];
 if(daily.id!==106||daily.log_date!=='2026-11-17'||daily.house_code!=='HOUSE_MS_01'||daily.shift!=='DAILY'
  ||!daily.eggs_by_grade||Object.getPrototypeOf(daily.eggs_by_grade)!==Object.prototype)fail('ORIGINAL_DAILY_FACTS_MOVED');
 const exactDaily=dailyExact?.[0]==='array'&&dailyExact[1].length===1&&dailyExact[1][0];
 const exactGrades=exactDaily?.[0]==='object'&&exactDaily[1].find(([key])=>key==='eggs_by_grade')?.[1];
 if(exactGrades?.[0]!=='object')fail('EXACT_RAW_DAILY_REQUIRED');
 const quantities=exactGrades[1].map(([grade,node])=>{
  const expected=['GRADE_4','GRADE_5'].includes(grade)?0:originalDailyVector[grade];
  if(!Number.isSafeInteger(expected)||node[0]!=='number'||!new RegExp('^'+expected+'(?:\\.0+)?$').test(node[1]))fail('EXACT_DAILY_VECTOR_MOVED');
  return [grade,expected];
 });
 if(quantities.filter(([grade])=>!['GRADE_4','GRADE_5'].includes(grade)).length!==6
  ||quantities.some(([grade,value])=>['GRADE_4','GRADE_5'].includes(grade)?value!==0:!Object.hasOwn(originalDailyVector,grade)||originalDailyVector[grade]!==value))fail('ORIGINAL_DAILY_FACTS_MOVED');
 const amounts=quantities.map(([,value])=>value);
 if(amounts.some(value=>!Number.isSafeInteger(value)||value<0)||amounts.reduce((a,b)=>a+b,0)!==47930)fail('ORIGINAL_DAILY_TOTAL_MOVED');
 // The frozen factual scope is stable across a new snapshot timestamp. Raw
 // original bytes/SHA are separately bound by the preparation context.
 const businessEvidence={schema:'phoenix.confirmed-legacy-scope-review/v1',sourceDirectiveSha256,
  stableExactAuditSha256:canonicalDigest(exactAudit),dailyRowsSha256:canonicalDigest(dailyExact),known:structuredClone(known),
  classification:CONFIRMED_MODERN_SCHEMA_DIRECTIVE.classification,originalConclusion:'HOLD',physicalInventoryVerified:false,releaseAuthorized:false};
 const manifest={schema:LEGACY_EGG_TEST_MANIFEST,classification:CONFIRMED_MODERN_SCHEMA_DIRECTIVE.classification,businessEvidenceSha256:canonicalDigest(businessEvidence),groups};
 return {manifest,businessEvidence,originalAudit};
}
export async function collectConfirmedLegacyScope(client,dependencies={}){
 const sourceDirectiveSha256=(dependencies.verifySources??verifyConfirmedModernSchemaSources)();
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  await client.query("SET LOCAL search_path=public");await client.query("SET LOCAL statement_timeout='20s'");await client.query("SET LOCAL lock_timeout='3s'");await client.query('SET LOCAL row_security=off');
  const {rows:[{jsonb_build_object:originalAudit}]}=await client.query(auditSql);
  const {rows:[{daily}]}=await client.query(`SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]'::jsonb)::text AS daily
   FROM brd_daily_logs d WHERE d.id=106 OR (d.log_date=DATE '2026-11-17' AND d.house_code='HOUSE_MS_01')`);
  return reviewConfirmedLegacyScope({originalAudit,dailyRowsRaw:daily,sourceDirectiveSha256});
 }finally{await client.query('ROLLBACK');}
}
