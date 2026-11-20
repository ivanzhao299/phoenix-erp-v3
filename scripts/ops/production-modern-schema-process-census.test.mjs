import assert from 'node:assert/strict';
import test from 'node:test';
import {collectStableModernProcessCensus} from './production-maintenance-root-readers.mjs';

const errno=code=>Object.assign(new Error('fixture native read'),{code});

test('a missing procfs link while a task exits discards the incomplete census',()=>{
 let sweeps=0;
 const calls=[];
 const result=collectStableModernProcessCensus({
  list:()=>++sweeps===1?[101,202,303]:[101,303,404],
  observe(pid){
   calls.push([sweeps,pid]);
   if(pid===202)throw errno('ENOENT');
   return {pid,sweep:sweeps};
  },
  present:pid=>pid===202&&sweeps===1,
 });
 assert.deepEqual(result,[101,303,404].map(pid=>({pid,sweep:2})));
 assert.deepEqual(calls,[[1,101],[1,202],[2,101],[2,303],[2,404]]);
});

test('an incomplete live task remains mandatory if omitted from a replacement enumeration',()=>{
 let sweeps=0;
 assert.throws(()=>collectStableModernProcessCensus({
  list:()=>++sweeps===1?[101]:[],
  observe(){throw errno('ESRCH');},
  present:()=>true,
 }),/ROOT_READER_MODERN_PROCESS_VISIBILITY_REQUIRED/);
 assert.equal(sweeps,3);
});

test('permission errors and unidentifiable live tasks never become an accepted empty census',()=>{
 for(const code of ['EACCES','EPERM','EIO']){
  let sweeps=0;
  assert.throws(()=>collectStableModernProcessCensus({
   list:()=>{sweeps++;return [101];},
   observe(){throw errno(code);},
   present:()=>false,
  }),/ROOT_READER_MODERN_PROCESS_VISIBILITY_REQUIRED/);
  assert.equal(sweeps,1);
 }
 assert.deepEqual(collectStableModernProcessCensus({list:()=>[101],observe(){throw errno('ESRCH');},present:()=>false}),[]);
});

test('a new complete census observes a still-present PID and fails closed on reuse or unresolved links',()=>{
 let sweeps=0;
 const observations=collectStableModernProcessCensus({
  list:()=>{sweeps++;return [101];},
  observe(pid){if(sweeps===1)throw errno('ENOENT');return {pid,startTicks:'432'};},
  present:()=>true,
 });
 assert.deepEqual(observations,[{pid:101,startTicks:'432'}]);
 assert.throws(()=>collectStableModernProcessCensus({
  list:()=>[101],observe(){throw errno('ENOENT');},present:()=>true,
 }),{nativeProcessCensusReason:'PROC_ENTRY_CHURN_PERSISTS'});
 assert.throws(()=>collectStableModernProcessCensus({
  list:()=>[101],observe(){throw Error('MAINTENANCE_HOLD=ROOT_READER_PROCESS_REUSED');},present:()=>true,
 }),{nativeProcessCensusReason:'IDENTITY_UNVERIFIED'});
});
