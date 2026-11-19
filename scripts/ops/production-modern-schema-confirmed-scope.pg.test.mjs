/** Opt-in only: existing owned PG18 clone. Never creates a production receipt. */
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {collectConfirmedLegacyScope,verifyConfirmedModernSchemaSources,reviewConfirmedLegacyScope} from './production-modern-schema-confirmed-scope.mjs';
import {collectLegacyEggAuditEvidence} from './production-legacy-egg-audit-evidence.mjs';
import {LEDGER_SQL} from './chanjet-admission-schema-receipt.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {losslessJsonFacts} from './production-lossless-json.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),enabled=process.env.MODERN_SCHEMA_SCOPE_PG==='1';
test('actual PG18 fixed identities and explicit zero report grades preserve HOLD and full reference coverage',{skip:!enabled},async()=>{
 const meta=JSON.parse(execFileSync('/usr/bin/docker',['inspect','phoenix-temp-reversal-20261118','--format','{{json .Config.Labels}}'],{encoding:'utf8'}));assert.equal(meta['phoenix.fixture'],'temp-reversal');
 const {Client}=createRequire(path.join(root,'apps/api/package.json'))('pg'),client=new Client({host:'127.0.0.1',port:44889,user:'postgres',database:'modern_schema_fixed_scope_20261119'});
 await client.connect();try{
  const {rows:[databaseIdentity]}=await client.query(`SELECT current_database() AS name,current_schema() AS schema,system_identifier::text AS "systemIdentifier" FROM pg_control_system()`);
  assert.equal(databaseIdentity.name,'modern_schema_fixed_scope_20261119');
  const {rows:[version]}=await client.query("SELECT current_setting('server_version_num')::int AS version,(SELECT count(*)::int FROM migrations) AS ledger");assert.ok(version.version>=180000);assert.equal(version.ledger,274);
  const fixed=await collectConfirmedLegacyScope(client,{verifySources:()=>verifyConfirmedModernSchemaSources(root)});
  assert.equal(fixed.manifest.groups.length,2);assert.equal(fixed.manifest.classification,'USER_CONFIRMED_TEST_OR_MISENTRY');
  const {rows:[{jsonb_build_object:ledgerRaw}]}=await client.query(LEDGER_SQL),ledgerSha256=createHash('sha256').update(JSON.stringify(JSON.parse(ledgerRaw))).digest('hex');
  const result=await collectLegacyEggAuditEvidence(client,{targetSha:'c811330e4182660e299d8bf44a35794ba0846470',floorSha:'101916efbcd60956c9f8321d4859931049f966c3',runningApiSha:'cb42966edfa717b0984936951143d84973c1a263',
   ledgerSha256,migrationEvidenceSha256:'a'.repeat(64),databaseIdentity,manifest:fixed.manifest});
  assert.equal(result.evidence.originalConclusion,'HOLD');assert.equal(result.evidence.reason,'MATCHED_CLAIM_PENDING_INDEPENDENT_REVIEW');assert.equal(result.evidence.releaseAuthorized,false);
  assert.deepEqual(result.evidence.referenceCoverage.missing,[]);assert.deepEqual(result.evidence.referenceCoverage.matches,[]);assert.deepEqual(result.evidence.referenceCoverage.uninspectedSources,[]);
  const {rows:[dailyDrift]}=await client.query(`SELECT jsonb_build_array(jsonb_set(to_jsonb(d),'{eggs_by_grade,GRADE_0}','540.00000000000001'::jsonb))::text AS raw FROM brd_daily_logs d WHERE id=106`);
  assert.equal(JSON.parse(dailyDrift.raw)[0].eggs_by_grade.GRADE_0,540);
  assert.throws(()=>reviewConfirmedLegacyScope({originalAudit:fixed.originalAudit,dailyRowsRaw:dailyDrift.raw,sourceDirectiveSha256:verifyConfirmedModernSchemaSources(root)}),/EXACT_DAILY_VECTOR_MOVED/);
  await client.query('BEGIN READ ONLY');try{
   const first=(await client.query("SELECT ($1::jsonb||jsonb_build_object('unit_cost',100000000000.000020::numeric(18,6)))::text AS exact",[result.originalAudit])).rows[0].exact;
   const second=(await client.query("SELECT ($1::jsonb||jsonb_build_object('unit_cost',100000000000.000021::numeric(18,6)))::text AS exact",[result.originalAudit])).rows[0].exact;
   const getCost=raw=>JSON.parse(raw).unit_cost;
   assert.equal(getCost(first),getCost(second));assert.notDeepEqual(losslessJsonFacts(first,{omitTopLevel:['checked_at']}),losslessJsonFacts(second,{omitTopLevel:['checked_at']}));
  }finally{await client.query('ROLLBACK');}
  const out=path.join(root,`artifacts/production-inbound-installments-20261118/modern-schema-fixed-scope-pg18-${Date.now()}-${process.pid}.json`);
  fs.writeFileSync(out,JSON.stringify({fixtureOnly:true,productionAuthorized:false,database:databaseIdentity.name,ledgerRows:274,groups:2,scopeSha256:canonicalDigest(fixed.manifest),
   referenceTables:result.evidence.referenceCoverage.inspected.length,originalConclusion:'HOLD',releaseAuthorized:false,exactNumericDriftDetected:true,exactDailyDriftDetected:true,fixtureBusinessWrites:0})+'\n',{mode:0o600,flag:'wx'});
 }finally{await client.end();}
});
