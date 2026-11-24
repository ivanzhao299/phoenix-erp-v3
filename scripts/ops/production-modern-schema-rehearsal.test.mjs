import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {compareRestoredModernSchemaTables,rehearseModernSchemaRelease,modernSchemaRuntimeStatements,selectRehearsalSubnet,readDockerRehearsalPrefixes} from './production-modern-schema-rehearsal.mjs';
import {classifySql} from '../ci/api-bootstrap-mutations.mjs';
test('another connection cannot use the observer application name or a rolled-back SELECT INTO to hide a write attempt',()=>{
 const prefix=pid=>`bootstrap-db=owned_clone user=postgres app=phoenix-modern-schema-read pid=${pid} LOG:  statement: `;
 const log=prefix(100)+'SELECT \'begin\';\n'+prefix(101)+'SELECT 1 INTO TEMP hidden_background_write;\n'+prefix(100)+'SELECT \'end\';\n';
 const rows=modernSchemaRuntimeStatements(log,{observer:{pid:100,database:'owned_clone',app:'phoenix-modern-schema-read'},begin:"SELECT 'begin'",end:"SELECT 'end'"});
 assert.equal(rows.length,1);assert.equal(rows[0].pid,101);assert.equal(classifySql(rows[0].sql),'SCHEMA_MUTATION');
 assert.throws(()=>modernSchemaRuntimeStatements(log+prefix(100)+"SELECT 'end';\n",{observer:{pid:100,database:'owned_clone',app:'phoenix-modern-schema-read'},begin:"SELECT 'begin'",end:"SELECT 'end'"}),/UNIQUE_NATIVE_OBSERVER_BOUNDARIES/);
});
test('live exported-row snapshot allows a later non-MVCC sequence value; fully fenced restore requires exact sequences',()=>{
 const source={tables:[{schema:'public',table:'example',rows:1,sha256:'a'.repeat(64)}],sequences:[{name:'example_id_seq',lastValue:'1',isCalled:true}]};
 const restored=structuredClone(source);restored.sequences[0].lastValue='2';
 assert.equal(compareRestoredModernSchemaTables(source,restored),true);
 assert.throws(()=>compareRestoredModernSchemaTables(source,restored,{fenced:true}),/QUIESCENT_SEQUENCE_RESTORE_MISMATCH/);
 restored.tables[0].sha256='b'.repeat(64);assert.throws(()=>compareRestoredModernSchemaTables(source,restored),/SNAPSHOT_TABLE_RESTORE_MISMATCH/);
});
test('no rehearsal may run with a caller-declared fenced stage and no native fence admission',async()=>{
 await assert.rejects(rehearseModernSchemaRelease({owner:'1234-1',stage:'fenced',backup:{receipt:{owner:'1234-1',stage:'fenced',sourceLedgerSha256:'c'.repeat(64)}},
  plan:{targetSha:'a'.repeat(40),runtimeSha:'b'.repeat(40),candidateImageId:'sha256:'+'a'.repeat(64),beforeLedgerSha256:'c'.repeat(64)},runtimeImageId:'sha256:'+'b'.repeat(64),privateRuntime:{createDirectory(){assert.fail('Must not create');}}}),/EXACT_PROTECTED_REHEARSAL_REQUIRED/);
});
test('an exhausted recovery budget stops fenced rehearsal before any Docker operation',async()=>{
 const database={name:'clone_source'},owner='1234-1';
 const candidateImageId='sha256:'+'a'.repeat(64),beforeLedgerSha256='c'.repeat(64);
 await assert.rejects(rehearseModernSchemaRelease({owner,stage:'fenced',
  backup:{source:{database},receipt:{owner,stage:'fenced',sourceDatabase:database,sourceLedgerSha256:beforeLedgerSha256}},
  plan:{targetSha:'a'.repeat(40),runtimeSha:'b'.repeat(40),candidateImageId,beforeLedgerSha256},runtimeImageId:'sha256:'+'b'.repeat(64),
  privateRuntime:{createDirectory:()=>'/unused',run(){assert.fail('Must not create any resource');}}},
 {assertFenced:async()=>{},assertRecoveryWindow(){throw Error('OUTSIDE_RECOVERY_BUDGET');}}),/OUTSIDE_RECOVERY_BUDGET/);
});


test('an explicit internal /28 avoids Docker pools, host route blocks and assigned host addresses',()=>{
 assert.equal(selectRehearsalSubnet(['default','172.31.48.0/20'],['172.17.0.0/16','fd00::/64']),'10.254.113.0/28');
 assert.equal(selectRehearsalSubnet(['default','10.254.113.7','10.254.113.32/28'],['10.254.113.16/28','172.17.0.0/16']),'10.254.113.48/28');
 assert.throws(()=>selectRehearsalSubnet(['default','10.254.112.0/23'],['172.17.0.0/16']),/ADDRESS_RESERVE_EXHAUSTED/);
 assert.throws(()=>selectRehearsalSubnet(['default','127.0.0.0/8'],[]),/COMPLETE_NETWORK_INVENTORY/);
 assert.throws(()=>selectRehearsalSubnet(['default',null],['172.17.0.0/16']),/COMPLETE_NETWORK_INVENTORY/);
});


test('a missing IPv4 pool on any addressable Docker network makes selection fail closed',()=>{
 const bridge={Driver:'bridge',EnableIPv4:true,IPAM:{Config:[{Subnet:'172.17.0.0/16'}]}};
 assert.deepEqual(readDockerRehearsalPrefixes([bridge,{Driver:'host',IPAM:{}},{Driver:'null'}]),['172.17.0.0/16']);
 assert.throws(()=>readDockerRehearsalPrefixes([bridge,{Driver:'bridge',EnableIPv4:true}]),/COMPLETE_NETWORK_INVENTORY/);
 assert.throws(()=>readDockerRehearsalPrefixes([bridge,{Driver:'bridge',EnableIPv4:true,IPAM:{Config:[{Subnet:'fd00::/64'}]}}]),/COMPLETE_NETWORK_INVENTORY/);
});

test('a database creation failure releases the unused tagged volume, but a changed volume identity blocks removal',async t=>{
 for(const changed of [false,true])await t.test(changed?'changed ownership':'verified ownership',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-volume-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true}));
  const owner='1234-1',stage='prepare',volume='d'.repeat(64),network='e'.repeat(64);
  const image='sha256:'+'a'.repeat(64),ledger='c'.repeat(64);
  const database={serverVersionNum:160000,backupToolMajor:16,provider:'c',name:'clone',username:'postgres',collate:'C',ctype:'C'};
  const events=[],receipts=[];
  const runtime={createDirectory:()=>directory,guard(){},publishJson:(file,value)=>receipts.push([path.basename(file),value]),
   async run({args}){
    const [type,action]=args;
    events.push([type,action]);
    let output='';
    if(type==='network'&&action==='create')output=network;
    else if(type==='network'&&action==='inspect')output=JSON.stringify([{Id:network,Internal:true,EnableIPv6:false,Driver:'bridge'}]);
    else if(type==='volume'&&action==='create'){
     for(const label of [`phoenix.schema.owner=${owner}`,'phoenix.schema.role=rehearsal-data',`phoenix.schema.stage=${stage}`,'phoenix.schema.lifecycle=temporary'])assert.ok(args.includes(label));
     output=volume;
    }else if(type==='volume'&&action==='inspect'){
     const previousInspections=events.filter(([resource,verb])=>resource==='volume'&&verb==='inspect').length;
     output=JSON.stringify([{Name:volume,Driver:'local',Labels:{'phoenix.schema.owner':changed&&previousInspections>1?'9999-1':owner,
      'phoenix.schema.role':'rehearsal-data','phoenix.schema.stage':stage,'phoenix.schema.lifecycle':'temporary'}}]);
    }else if(type==='create')throw Error('MOCK_DATABASE_CREATE_FAILURE');
    else if(type==='volume'&&action==='rm')assert.deepEqual(args,['volume','rm',volume]);
    else assert.fail(`Unexpected Docker command: ${args.join(' ')}`);
    const stdout=path.join(directory,`${events.length}.stdout`);
    fs.writeFileSync(stdout,output);
    return {stdout};
   }};
  await assert.rejects(rehearseModernSchemaRelease({owner,stage,
   backup:{source:{database},receipt:{owner,stage,sourceDatabase:database,sourceLedgerSha256:ledger,databasePin:{id:'f'.repeat(64),image}}},
   plan:{targetSha:'a'.repeat(40),runtimeSha:'b'.repeat(40),candidateImageId:image,beforeLedgerSha256:ledger},
   runtimeImageId:image,privateRuntime:runtime}),changed?/NEW_LOCAL_VOLUME_REQUIRED/:/MOCK_DATABASE_CREATE_FAILURE/);
  assert.equal(events.some(([type,action])=>type==='volume'&&action==='rm'),!changed);
  assert.equal(receipts.some(([name,value])=>name==='rehearsal-volume-disposition.json'&&value.disposition==='REMOVED'),!changed);
 });
});
