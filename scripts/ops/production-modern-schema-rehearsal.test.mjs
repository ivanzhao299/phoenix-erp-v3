import test from 'node:test';import assert from 'node:assert/strict';
import {compareRestoredModernSchemaTables,rehearseModernSchemaRelease,modernSchemaRuntimeStatements} from './production-modern-schema-rehearsal.mjs';
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
