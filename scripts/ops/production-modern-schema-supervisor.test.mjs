import assert from 'node:assert/strict';
import test from 'node:test';
import {assertModernSchemaWindowBudget} from './production-modern-schema-supervisor.mjs';

test('the fenced database sample reserves two further scans and release overhead before DDL',()=>{
 const end='2026-11-20T00:30:00.000Z',deadline=Date.parse(end),factsElapsedMs=191329;
 const reserve=Math.ceil(factsElapsedMs*2*1.15)+240000;
 assert.doesNotThrow(()=>assertModernSchemaWindowBudget({end,factsElapsedMs,operation:'ddl'},deadline-reserve));
 for(const inputs of [
  {end,factsElapsedMs}, {end,factsElapsedMs:null}, {end,factsElapsedMs:-1}, {end:'invalid',factsElapsedMs},
 ]){
  assert.throws(()=>assertModernSchemaWindowBudget({...inputs,operation:'ddl'},deadline-reserve+1),/INSUFFICIENT_WINDOW_BEFORE_DDL/);
 }
});

test('rehearsal retains a separate window for two recovery scans before the original API can reopen',()=>{
 const end='2026-11-20T00:30:00.000Z',deadline=Date.parse(end),factsElapsedMs=191329;
 const reserve=Math.ceil(factsElapsedMs*2*1.15)+150000;
 assert.doesNotThrow(()=>assertModernSchemaWindowBudget({end,factsElapsedMs,operation:'recoverOriginal'},deadline-reserve));
 assert.throws(()=>assertModernSchemaWindowBudget({end,factsElapsedMs,operation:'recoverOriginal'},deadline-reserve+1),/INSUFFICIENT_WINDOW_TO_RECOVER_ORIGINAL/);
});
