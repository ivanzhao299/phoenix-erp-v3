import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ownedFixtureDeadline} from './owned-fixture-deadline.mjs';
test('absolute expiry and cancellation never let late success finalize as PASS',()=>{
  let now=100;const controller=new AbortController(),deadline=ownedFixtureDeadline({signal:controller.signal,timeoutMs:10,now:()=>now});
  assert.equal(deadline.finalize({result:'PASS'}).result,'PASS');now=110;assert.throws(()=>deadline.assertActive(),/DEADLINE/);assert.equal(deadline.finalize({result:'PASS'}).result,'FAIL');
  now=101;controller.abort();assert.equal(deadline.finalize({result:'PASS'}).result,'FAIL');
});
test('actual node:test timeout aborts a late async callback and its receipt stays FAIL',()=>{
  const base=path.resolve('artifacts/owned-fixture-deadline');fs.mkdirSync(base,{recursive:true,mode:0o700});const dir=fs.mkdtempSync(path.join(base,'owned-'));
  const receipt=path.join(dir,'late.json'),program=path.join(dir,'late.test.mjs'),helper=new URL('./owned-fixture-deadline.mjs',import.meta.url).href;
  fs.writeFileSync(program,`import test from 'node:test';import fs from 'node:fs';import {setTimeout as delay} from 'node:timers/promises';import {ownedFixtureDeadline} from ${JSON.stringify(helper)};
test('controlled late completion',{timeout:40},async t=>{const limit=ownedFixtureDeadline({signal:t.signal,timeoutMs:1000});await delay(100);const result=limit.finalize({result:'PASS',cleanup:'COMPLETED'});fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify(result));});\n`,{mode:0o600});
  // Do not inherit NODE_TEST_CONTEXT: a nested runner must be independent.
  const result=spawnSync(process.execPath,['--test',program],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000,maxBuffer:65536});assert.equal(result.status,1);assert.match(result.stdout,/testTimeoutFailure|timed out/);
  const value=JSON.parse(fs.readFileSync(receipt));assert.equal(value.result,'FAIL');assert.equal(value.failure,'OWNED_FIXTURE_DEADLINE_EXCEEDED');assert.equal(value.cleanup,'COMPLETED');
});
test('cleanup crossing the absolute deadline fails harness even before its longer timeout',()=>{
  const base=path.resolve('artifacts/owned-fixture-deadline');fs.mkdirSync(base,{recursive:true,mode:0o700});const dir=fs.mkdtempSync(path.join(base,'owned-'));
  const receipt=path.join(dir,'cleanup.json'),program=path.join(dir,'cleanup.test.mjs'),helper=new URL('./owned-fixture-deadline.mjs',import.meta.url).href;
  fs.writeFileSync(program,`import test from 'node:test';import fs from 'node:fs';import {setTimeout as delay} from 'node:timers/promises';import {ownedFixtureDeadline,assertSuccessfulFixtureRecord} from ${JSON.stringify(helper)};
test('controlled slow cleanup',{timeout:1000},async t=>{const limit=ownedFixtureDeadline({signal:t.signal,timeoutMs:20});await delay(50);const result=limit.finalize({result:'PASS',cleanup:'COMPLETED'});fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify(result));assertSuccessfulFixtureRecord(result);});\n`,{mode:0o600});
  const result=spawnSync(process.execPath,['--test',program],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000,maxBuffer:65536});assert.equal(result.status,1);assert.match(result.stdout,/OWNED_FIXTURE_FINAL_RECEIPT_FAILED/);assert.doesNotMatch(result.stdout,/testTimeoutFailure/);
  const value=JSON.parse(fs.readFileSync(receipt));assert.equal(value.result,'FAIL');assert.equal(value.cleanup,'COMPLETED');
});
