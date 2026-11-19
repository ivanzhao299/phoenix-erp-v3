import assert from 'node:assert/strict';import test from 'node:test';
import {classifyModernSchemaDatabaseExecutors} from './production-modern-schema-executors.mjs';
const originalLease={database:{databaseOid:16400,systemIdentifier:'5839',postmasterStartMicros:'10000'},sessionPid:321,backendStartMicros:'11000'};
const session=(pid,address,app='ordinary')=>({pid,databaseOid:16400,backendStartMicros:String(11000+pid),clientAddress:address,openTransaction:false,applicationName:app});
const original={...session(321,null),backendStartMicros:'11000'};
const observation=()=>({primary:true,statsComplete:true,databaseOid:16400,systemIdentifier:'5839',postmasterStartMicros:'10000',preparedTransactions:0,enabledSubscriptions:0,
 workers:[],observerPid:100,sessions:[original]});
const scope={runtimeAddress:'172.29.248.4',originalLease,oldRuntimeStopped:true};
test('after R stops, the old address, a copied application name, or a replacement S cannot become owned executors',()=>{
 for(const other of [session(400,scope.runtimeAddress),session(400,null,'phoenix-modern-schema-read'),{...original,pid:322}]){
  const value=observation();value.sessions.push(other);assert.throws(()=>classifyModernSchemaDatabaseExecutors(value,scope),/UNKNOWN_OR_NEW_DATABASE_EXECUTOR/);
 }
 const missing=observation();missing.sessions=[];assert.throws(()=>classifyModernSchemaDatabaseExecutors(missing,scope),/ORIGINAL_CONTROL_SESSION_MISSING/);
});
test('prepared transactions, subscriptions, invisible stats and unknown workers stop release even with no runtime sessions',()=>{
 for(const change of [{preparedTransactions:1},{enabledSubscriptions:1},{statsComplete:false},{workers:[{pid:400,databaseOid:16400,type:'logical replication worker'}]}]){
  assert.throws(()=>classifyModernSchemaDatabaseExecutors({...observation(),...change},scope),/HOLD=/);
 }
});
test('only the exact root-native migration backend can transact during the controlled CLI phase',()=>{
 const value=observation(),actual={...session(400,'172.29.248.8','phoenix-schema-owned-run'),openTransaction:true};value.sessions.push(actual);
 const migration={address:actual.clientAddress,sessionPid:actual.pid,backendStartMicros:actual.backendStartMicros,applicationName:actual.applicationName,containerIdentityVerified:true};
 assert.deepEqual(classifyModernSchemaDatabaseExecutors(value,{...scope,migration}).migrationSessionPids,[400]);
 for(const change of [{sessionPid:401},{backendStartMicros:'99999'},{address:'172.29.248.9'},{containerIdentityVerified:false}]){
  assert.throws(()=>classifyModernSchemaDatabaseExecutors(value,{...scope,migration:{...migration,...change}}),/HOLD=/);
 }
});
