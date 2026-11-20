/** Real Docker/psql connection, actual read-only snapshots, no host pg library. */
import test from 'node:test';import assert from 'node:assert/strict';import {spawn,execFileSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {collectConfirmedLegacyScope,readConfirmedScopeInAuditSnapshot,verifyConfirmedModernSchemaSources} from './production-modern-schema-confirmed-scope.mjs';
import {collectLegacyEggAuditEvidence} from './production-legacy-egg-audit-evidence.mjs';
import {LEDGER_SQL,digest} from './chanjet-admission-schema-receipt.mjs';
test('persistent actual psql returns collector rows without rounding original JSON and enforces native READ ONLY',{skip:process.env.MODERN_SCHEMA_READ_PG!=='1'},async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),labels=JSON.parse(execFileSync('/usr/bin/docker',['inspect','phoenix-temp-reversal-20261118','--format','{{json .Config.Labels}}'],{encoding:'utf8'}));assert.equal(labels['phoenix.fixture'],'temp-reversal');
 const client=new ModernSchemaReadClient({guard(){},spawn:(binary,args,options)=>{
  assert.equal(binary,'/usr/bin/docker');const actual=[...args];assert.equal(actual[actual.indexOf('phoenix-v3-db')],'phoenix-v3-db');actual[actual.indexOf('phoenix-v3-db')]='phoenix-temp-reversal-20261118';
  actual[actual.length-1]=actual.at(-1).replace('"$POSTGRES_DB"','modern_schema_fixed_scope_20261119').replace('"$POSTGRES_USER"','postgres');return spawn(binary,actual,options);
 }});
 try{
  await client.start();const {rows:[identity]}=await client.query(`SELECT current_database() AS name,current_schema() AS schema,system_identifier::text AS "systemIdentifier" FROM pg_control_system()`);assert.equal(identity.name,'modern_schema_fixed_scope_20261119');
  const data="quote ' and $1 ; \\! never a command",result=await client.query('SELECT $1::text AS data,$2::text[] AS items',[data,[data,'safe']]);assert.equal(result.rows[0].data,data);assert.deepEqual(result.rows[0].items,[data,'safe']);
  assert.equal((await client.query('SELECT 1 AS n -- trailing comment')).rows[0].n,1);
  const fixed=await collectConfirmedLegacyScope(client,{verifySources:()=>verifyConfirmedModernSchemaSources(root)});
  const {rows:[{jsonb_build_object:raw}]}=await client.query(LEDGER_SQL),ledgerSha256=digest(JSON.stringify(JSON.parse(raw)));
  const calls={audit:0,references:0};
  const observed={query(sql,parameters){
   if(sql.trimStart().startsWith('WITH report_grade'))calls.audit++;
   if(/^SELECT \d+ AS ordinal, EXISTS/.test(sql))calls.references++;
   return client.query(sql,parameters);
  }};
  const options={targetSha:'c811330e4182660e299d8bf44a35794ba0846470',floorSha:'101916efbcd60956c9f8321d4859931049f966c3',
   runningApiSha:'cb42966edfa717b0984936951143d84973c1a263',ledgerSha256,migrationEvidenceSha256:'a'.repeat(64),databaseIdentity:identity,manifest:fixed.manifest};
  const audited=await collectLegacyEggAuditEvidence(observed,options,{
   async confirmScopeInSnapshot(raw){
    const {rows:[snapshot]}=await client.query(`SELECT current_setting('transaction_read_only') AS readonly,
     current_setting('transaction_isolation') AS level`);
    assert.deepEqual(snapshot,{readonly:'on',level:'repeatable read'});
    const reread=await readConfirmedScopeInAuditSnapshot(observed,raw,fixed.confirmedScopeInput.sourceDirectiveSha256);
    assert.deepEqual(reread.manifest,fixed.manifest);
    assert.equal(reread.originalAudit,raw);
   },
  });
  assert.equal(audited.evidence.reason,'MATCHED_CLAIM_PENDING_INDEPENDENT_REVIEW');assert.equal(audited.evidence.releaseAuthorized,false);assert.equal(audited.evidence.referenceCoverage.inspected.length,41);
  assert.deepEqual(calls,{audit:1,references:7});
  const corrupt={
   async query(sql,parameters){
    const result=await client.query(sql,parameters);
    return /^SELECT \d+ AS ordinal, EXISTS/.test(sql)?{rows:result.rows.slice(1)}:result;
   },
  };
  await assert.rejects(collectLegacyEggAuditEvidence(corrupt,options),/REFERENCE_RESULT_REQUIRED/);
  await client.query('BEGIN READ ONLY');const {rows:[state]}=await client.query("SELECT current_setting('transaction_read_only') AS readonly, pg_backend_pid() AS pid");assert.equal(state.readonly,'on');await client.query('ROLLBACK');
  assert.throws(()=>client.query('UPDATE inv_batches SET qty=0'),/READ_STATEMENT_REQUIRED/);
  // One single line exceeds the transport cap; chunk admission must reject
  // before readline can accumulate the complete PostgreSQL value.
  await assert.rejects(client.query("SELECT repeat('x',17000000) AS oversized"),/FRAME_SIZE/);
 }finally{await client.close();}
});
