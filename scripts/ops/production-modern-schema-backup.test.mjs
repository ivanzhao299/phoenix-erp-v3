import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {closeModernSchemaPreparationReadClient,createModernSchemaBackup} from './production-modern-schema-backup.mjs';
import {publicModernSchemaPreparationFailure} from './production-modern-schema-public-preparation.mjs';

const hold='MODERN_SCHEMA_BACKUP_HOLD=';
const privateFailure=()=>Error('fixture private table address SQL or argv');
function fixture(t,breakAt=new Set()){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-backup-phase-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const log=[],records=[];
 const inject=step=>{log.push(step);if(breakAt.has(step))throw privateFailure();};
 const rows=(...values)=>({rows:values});
 const database={name:'fixture',username:'fixture',systemIdentifier:'1',primary:true,serverVersionNum:160014,
  timezone:'UTC',encoding:'UTF8',collate:'C',ctype:'C',provider:'c',collationVersion:null,actualCollationVersion:null,bytes:'1000'};
 const versionFile=path.join(directory,'versions');
 fs.writeFileSync(versionFile,'pg_dump (PostgreSQL) 16.14\npg_restore (PostgreSQL) 16.14\n');
 const databasePin={id:'a'.repeat(64),image:'sha256:'+'b'.repeat(64),startedAt:'2026-11-20T00:00:00Z',restartCount:0};
 const client={
  async query(sql){
   if(sql==='ROLLBACK'){inject('rollback');return rows();}
   if(sql.includes('pg_stat_activity')){inject('remote-db-check');return rows({count:0});}
   if(sql.startsWith('BEGIN')){inject('begin');return rows();}
   if(sql==="SET LOCAL idle_in_transaction_session_timeout='90s'"){inject('fenced-idle-budget');return rows();}
   if(sql.startsWith('SET LOCAL'))return rows();
   if(sql.includes('pg_database_collation_actual_version'))return rows(database);
   if(sql.includes("current_setting('transaction_isolation')"))return rows({...database,readonly:'on',isolation:'repeatable read'});
   if(sql.includes('FROM pg_class c JOIN pg_namespace')){inject('facts');return rows();}
   if(sql.includes('jsonb_build_object')){inject('ledger');return rows({jsonb_build_object:'{"legacy":[],"typeorm":[]}'});}
   if(sql.includes('pg_export_snapshot')){inject('snapshot');return rows({snapshot:'00000003-0000001B-1'});}
   assert.fail('Unexpected read in the fixture');
  },
  async close(){inject('read-channel-close');},
 };
 const privateRuntime={
  guard(){inject('source-guard');},createDirectory(){return directory;},
  async run({stem}){inject(stem);return {stdout:stem==='backup-tool-versions'?versionFile:path.join(directory,stem),exitCode:0};},
  async digest(file){inject('digest');return {path:file,bytes:100,sha256:'b'.repeat(64)};},
  publishJson(file,value){inject(path.basename(file));records.push(value);},
 };
 const dependencies={
  inspect:()=>[databasePin.id,databasePin.image,databasePin.startedAt,true,'healthy',0].map(value=>JSON.stringify(value)).join('\t'),
  remoteProcesses(){inject('remote-native-check');return '';},
  onDumpStopped(){inject('remote-notify');},
 };
 return {log,records,client,database,run:(stage='prepare',overrides={})=>createModernSchemaBackup({owner:'9001-1',stage,client,databasePin,privateRuntime},{...dependencies,...overrides})};
}

test('preparation backup classifies source, tool, disk, facts, ledger, snapshot, execution and verification failure without raw content',async t=>{
 for(const [step,code] of [
  ['source-guard','SOURCE_GUARD'],['backup-tool-versions','VERSION'],['facts','FACTS'],['ledger','LEDGER'],
  ['snapshot','EXPORT_SNAPSHOT'],['database-dump','EXECUTION'],['backup-full-parse','VERIFICATION'],
 ]){
  const f=fixture(t,new Set([step]));
  await assert.rejects(f.run(),{message:hold+code});
  if(step!=='source-guard'){
   assert.ok(f.log.includes('rollback'));
   assert.equal(f.log.includes('remote-native-check'),['database-dump','backup-full-parse'].includes(step));
   assert.deepEqual(f.records,[{schema:'phoenix.modern-schema-private-backup-hold/v1',failure:code,cleanup:[]}]);
  }
 }
 const f=fixture(t);f.database.bytes='99999999999999999999';
 await assert.rejects(f.run(),{message:hold+'DISK'});
 assert.equal(f.records[0].failure,'DISK');
});

test('rollback failure cannot skip independent remote proof, overwrite the original reason, or leak private exceptions',async t=>{
 const f=fixture(t,new Set(['database-dump','rollback','remote-db-check','read-channel-close']));
 let backup;
 await assert.rejects(f.run(),error=>{
  backup=error;
  return error.message===hold+'CLEANUP_UNRESOLVED'&&error.cause?.message===hold+'EXECUTION';
 });
 assert.ok(f.log.includes('remote-db-check')&&f.log.includes('remote-native-check'));
 assert.equal(f.log.includes('remote-notify'),false);
 assert.deepEqual(f.records,[{schema:'phoenix.modern-schema-private-backup-hold/v1',failure:'EXECUTION',cleanup:['ROLLBACK','REMOTE_CLOSE']}]);
 await assert.rejects(closeModernSchemaPreparationReadClient(f.client,'BACKUP',backup,record=>f.records.push(record)),error=>{
  assert.equal(error.cause?.message,hold+'EXECUTION');
  assert.deepEqual(error.cleanup,['ROLLBACK','REMOTE_CLOSE','READ_CHANNEL_CLOSE']);
  assert.equal(publicModernSchemaPreparationFailure('BACKUP',error),'BACKUP_CLEANUP_UNRESOLVED');
  assert.doesNotMatch(JSON.stringify(f.records)+String(error.cause),/fixture private/);
  return true;
 });
 assert.deepEqual(f.records[1],{schema:'phoenix.modern-schema-private-backup-hold/v1',failure:'EXECUTION',
  cleanup:['ROLLBACK','REMOTE_CLOSE','READ_CHANNEL_CLOSE']});
 const beforeLaunch=fixture(t,new Set(['facts','rollback','remote-db-check']));
 await assert.rejects(beforeLaunch.run(),error=>error.message===hold+'CLEANUP_UNRESOLVED'&&error.cause?.message===hold+'FACTS');
 assert.equal(beforeLaunch.log.includes('remote-db-check'),false);
 assert.deepEqual(beforeLaunch.records[0].cleanup,['ROLLBACK']);
});

test('cleanup alone remains HOLD, successful cleanup preserves the original receipt, and no backup verification follows unresolved cleanup',async t=>{
 const failed=fixture(t,new Set(['rollback']));
 await assert.rejects(failed.run(),error=>error.message===hold+'CLEANUP_UNRESOLVED'&&error.cause===undefined);
 assert.ok(failed.log.includes('remote-notify'));
 assert.equal(failed.log.includes('backup-toc'),false);
 const f=fixture(t),backup=await f.run();
 assert.equal(backup.receipt.fullParseVerified,true);
 assert.equal(backup.receipt.productionRestore,false);
 assert.equal(f.records.length,1);
 assert.equal(f.log.includes('fenced-idle-budget'),false);
 assert.ok(f.log.indexOf('remote-notify')<f.log.indexOf('backup-toc'));
 const brokenDbProof=fixture(t,new Set(['remote-db-check']));
 await assert.rejects(brokenDbProof.run(),{message:hold+'CLEANUP_UNRESOLVED'});
 assert.ok(brokenDbProof.log.includes('remote-native-check'));
 assert.equal(brokenDbProof.log.includes('remote-notify'),false);
 const unwritable=fixture(t,new Set(['facts','backup-hold.json']));
 await assert.rejects(unwritable.run(),{message:hold+'FACTS'});
});

test('fenced evidence and pg_dump share the exported snapshot, and a rejected consumer prevents the dump',async t=>{
 const f=fixture(t);let observed;
 const backup=await f.run('fenced',{assertFenced:async()=>{},onSnapshotReady:async source=>{
  f.log.push('snapshot-consumer');observed=source;
 }});
 assert.equal(observed,backup.source);
 assert.ok(f.log.indexOf('begin')<f.log.indexOf('fenced-idle-budget'));
 assert.ok(f.log.indexOf('fenced-idle-budget')<f.log.indexOf('backup-tool-versions'));
 assert.ok(f.log.indexOf('snapshot')<f.log.indexOf('snapshot-consumer'));
 assert.ok(f.log.indexOf('snapshot-consumer')<f.log.indexOf('database-dump'));
 assert.ok(f.log.indexOf('database-dump')<f.log.indexOf('rollback'));
 const refuse=fixture(t);
 await assert.rejects(refuse.run('fenced',{assertFenced:async()=>{},onSnapshotReady:async()=>{throw privateFailure();}}),
  {message:hold+'SOURCE_GUARD'});
 assert.ok(refuse.log.includes('rollback'));
 assert.equal(refuse.log.includes('database-dump'),false);
 assert.equal(refuse.log.includes('remote-native-check'),false);
 assert.deepEqual(refuse.records,[{schema:'phoenix.modern-schema-private-backup-hold/v1',failure:'SOURCE_GUARD',cleanup:[]}]);
});
