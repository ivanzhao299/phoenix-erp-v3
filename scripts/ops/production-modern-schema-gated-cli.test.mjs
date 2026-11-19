import test from 'node:test';import assert from 'node:assert/strict';
import {validateModernSchemaCliBackend,runModernSchemaGatedCli} from './production-modern-schema-gated-cli.mjs';
import {parseModernSchemaMigrationRun} from './production-modern-schema-migration-driver.mjs';
const binding={owner:'1234-1',contextDigest:'a'.repeat(64),nonce:'b'.repeat(64),mode:'run'};
const proof={schema:'phoenix.modern-schema-migration-backend/v1',...binding,backend:{pid:42,databaseOid:100,database:'owned_clone',systemIdentifier:'1234567890123456789',postmasterStartMicros:'1234567890123456',backendStartMicros:'1234567890123457',applicationName:'phoenix-schema-1234-1-run',readonly:false,primary:true}};
test('gate evidence requires the exact native first backend and fails on readonly-mode, nonce, identity or extra fields',()=>{
 assert.deepEqual(validateModernSchemaCliBackend(proof,binding),proof);
 for(const mutate of [v=>v.nonce='c'.repeat(64),v=>v.backend.pid=0,v=>v.backend.readonly=true,v=>v.backend.backendStartMicros=1234,v=>v.backend.extra=true]){
  const bad=structuredClone(proof);mutate(bad);assert.throws(()=>validateModernSchemaCliBackend(bad,binding),/GATED_CLI_HOLD=/);
 }
});
test('a gated CLI has no default production authority',async()=>{
 await assert.rejects(runModernSchemaGatedCli({...binding,mode:'run',imageId:'sha256:'+'a'.repeat(64),networkId:'b'.repeat(64),environment:{DB_HOST:'db',DB_PORT:'5432',DB_USER:'owned',DB_PASSWORD:'synthetic',DB_NAME:'owned'}}),/FIXED_GATED_CLI_SCOPE_REQUIRED/);
});
test('original schema script arguments are fixed to one run then one readonly show; credential text is data',()=>{
 const imageId='sha256:'+'a'.repeat(64),networkName='phoenix-erp_default',password="synthetic'`$(never execute)";
 const args=['run','--name','phoenix-migrate-schema-first-abcdefgh','--user','phoenix','--network',networkName,
  '-e','DB_HOST=db','-e','DB_PORT=5432','-e','DB_USER=owned','-e','DB_PASSWORD='+password,'-e','DB_NAME=owned','-e','PGOPTIONS=-c lock_timeout=5s -c statement_timeout=120s',
  '--entrypoint','./node_modules/.bin/typeorm',imageId,'-d','dist/database/data-source.js','migration:run','--transaction','all'];
 const parsed=parseModernSchemaMigrationRun(args,{imageId,networkName,mode:'run'});assert.equal(parsed.environment.DB_PASSWORD,password);
 for(const change of [a=>a[5]='root',a=>a[a.length-1]='each',a=>a.push('--privileged'),a=>a[2]='replay-unowned']){
  const bad=[...args];change(bad);assert.throws(()=>parseModernSchemaMigrationRun(bad,{imageId,networkName,mode:'run'}),/MIGRATION_DRIVER_HOLD=/);
 }
});
