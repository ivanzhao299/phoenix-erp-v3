import test from 'node:test';import assert from 'node:assert/strict';
import {parseModernSchemaLease,originalModernSchemaSessionPredicate,pinOriginalModernSchemaSession,assertModernSchemaLeaseStillOriginal,readLinuxProcessIdentity,assertOriginalModernSchemaProcess} from './production-modern-schema-session-lease.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
const observation=()=>({name:'owned_fixture',schema:'public',primary:true,systemIdentifier:'1234567890123456789',databaseOid:12345,postmasterStartMicros:'1795046400123456',holders:[{sessionPid:23456,databaseOid:12345,backendStartMicros:'1795046400654321'}]});
test('only the exact observed original channel with both exclusive keys can pin the lease',async()=>{
 const value=observation(),context={databaseIdentitySha256:canonicalDigest({name:value.name,schema:'public',systemIdentifier:value.systemIdentifier})},queries=[];
 const session={connected:()=>true,sealForModernSchema(){},query:async sql=>{queries.push(sql);return true;}};
 const result=await pinOriginalModernSchemaSession(session,context,{read:()=>value});assert.equal(result.sessionPid,23456);assert.equal(queries.length,1);assert.ok(queries[0].includes('pg_backend_pid()=23456'));
 await assert.rejects(pinOriginalModernSchemaSession({...session,query:async()=>false},context,{read:()=>value}),/ORIGINAL_CHANNEL_NOT_OBSERVED_HOLDER/);
 await assert.rejects(pinOriginalModernSchemaSession(session,{databaseIdentitySha256:'a'.repeat(64)},{read:()=>value}),/ORIGINAL_CHANNEL_NOT_OBSERVED_HOLDER/);
});
test('lost, multiple, wrong database, fractional or injected identities cannot become SQL or lease proof',()=>{
 for(const change of [v=>v.primary=false,v=>v.holders=[],v=>v.holders.push(v.holders[0]),v=>v.holders=[null],v=>v.holders[0].databaseOid++,v=>v.holders[0].backendStartMicros='123.4',v=>v.databaseOid='12345']){
  const value=observation();change(value);assert.throws(()=>parseModernSchemaLease(value),/LEASE_HOLD=/);
 }
 const lease=parseModernSchemaLease(observation());assert.throws(()=>originalModernSchemaSessionPredicate({...lease,backendStartMicros:"1';SELECT true"}),/LEASE_HOLD=/);
 for(const change of [v=>v.holders[0].sessionPid++,v=>v.holders[0].backendStartMicros='1795046400654322',v=>v.postmasterStartMicros='1795046400123457',v=>v.systemIdentifier='2234567890123456789']){
  const value=observation();change(value);assert.throws(()=>assertModernSchemaLeaseStillOriginal(lease,{read:()=>value}),/ORIGINAL_SESSION_LOST_OR_REPLACED/);
 }
});
test('lost locks during the original-channel round trip cannot produce a lease',async()=>{
 const value=observation(),context={databaseIdentitySha256:canonicalDigest({name:value.name,schema:'public',systemIdentifier:value.systemIdentifier})};let sealed=false;
 const session={connected:()=>true,sealForModernSchema(){sealed=true;},query:async()=>{value.holders=[];return true;}};
 await assert.rejects(pinOriginalModernSchemaSession(session,context,{read:()=>value}),/DUAL_LOCK_SESSION_REQUIRED/);assert.equal(sealed,false);
});
test('real Linux process identity accepts this original process and refuses a reused identity',()=>{
 const actual=readLinuxProcessIdentity(process.pid);assert.equal(assertOriginalModernSchemaProcess(actual),true);
 assert.throws(()=>assertOriginalModernSchemaProcess({...actual,startTicks:String(BigInt(actual.startTicks)+1n)}),/SUPERVISOR_DEAD_OR_REUSED/);
 const readProcess=pid=>pid===10?{pid:10,parentPid:1,startTicks:'123',bootId:actual.bootId}:{pid,parentPid:1,startTicks:'456',bootId:actual.bootId};
 assert.throws(()=>assertOriginalModernSchemaProcess(readProcess(10),{readProcess,pid:20}),/DESCENDANT_REQUIRED/);
});
