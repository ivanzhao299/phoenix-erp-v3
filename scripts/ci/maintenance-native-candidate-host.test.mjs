import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { requireNativeHostRequest, writeOwnedFixtureReadonlyJson, buildReadableFixturePayload, createOwnedFixturePublicShadow, nativeFd9Denial, nativeFd9Stdio } from './maintenance-native-candidate-host.fixture.mjs';
import { OwnedErpCandidateCapsule } from './maintenance-erp-candidate.fixture.mjs';

test('FD9 counterexamples require their precise denial rather than any guard failure',()=>{
  assert.equal(nativeFd9Denial('missing',{code:'EBADF',syscall:'fstat'}),true);
  assert.equal(nativeFd9Denial('wrong',{message:'CONFIG_HOLD=HOST_LOCK_REQUIRED:1:2:3:4'}),true);
  assert.equal(nativeFd9Denial('same-inode-unlocked',{message:'CONFIG_HOLD=WORKFLOW_FD9_NOT_LOCK_OWNER'}),true);
  for(const mode of ['missing','wrong','same-inode-unlocked'])for(const error of [{message:'CONFIG_HOLD=ROOT_ACTIONS_IDENTITY_REQUIRED'},{code:'ENOENT',syscall:'fstat'},{message:'CONFIG_HOLD=HOST_LOCK_REQUIRED'},{message:'unrelated'}])assert.equal(nativeFd9Denial(mode,error),false);
  assert.deepEqual(nativeFd9Stdio(),['ignore','pipe','pipe','ignore','ignore','ignore','ignore','ignore','ignore',9]);
});
test('real local FD9 keeps the same locked open description only with explicit inheritance',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-native-fd9-')),lock=path.join(directory,'mutation.lock');
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));fs.writeFileSync(lock,'',{mode:0o600});
  const trusted=new URL('../ops/production-trusted-paths.mjs',import.meta.url).href,fixture=new URL('./maintenance-native-candidate-host.fixture.mjs',import.meta.url).href;
  const program=`import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
    import {assertWorkflowFd9Lock} from ${JSON.stringify(trusted)};import {nativeFd9Stdio} from ${JSON.stringify(fixture)};
    const lock=process.argv[1];assertWorkflowFd9Lock(lock,process.pid);
    const positive='import {assertWorkflowFd9Lock} from '+JSON.stringify(${JSON.stringify(trusted)})+';assertWorkflowFd9Lock(process.argv[1],process.pid)';
    execFileSync(process.execPath,['--input-type=module','-e',positive,lock],{stdio:nativeFd9Stdio()});
    const unlocked='import assert from "node:assert/strict";import {assertWorkflowFd9Lock} from '+JSON.stringify(${JSON.stringify(trusted)})+';assert.throws(()=>assertWorkflowFd9Lock(process.argv[1],process.pid),/WORKFLOW_FD9_NOT_LOCK_OWNER/)';
    execFileSync('/bin/bash',['-c','exec 9<>"$3"; "$1" --input-type=module -e "$2" "$3"','owned-local-unlocked',process.execPath,unlocked,lock],{stdio:nativeFd9Stdio()});
    const missing='import assert from "node:assert/strict";import fs from "node:fs";fs.closeSync(9);assert.throws(()=>fs.fstatSync(9),{code:"EBADF",syscall:"fstat"})';
    execFileSync(process.execPath,['--input-type=module','-e',missing],{stdio:nativeFd9Stdio()});
    const absent=(()=>{try{execFileSync(process.execPath,['--input-type=module','-e',positive,lock],{stdio:['ignore','pipe','pipe']});return false;}catch{return true;}})();assert.equal(absent,true);
    assertWorkflowFd9Lock(lock,process.pid);`;
  execFileSync('/bin/bash',['-c','exec 9<>"$1"; flock -n 9 || exit 6; "$2" --input-type=module -e "$3" "$1"','owned-local-fd9',lock,process.execPath,program],{stdio:['ignore','pipe','pipe']});
});
test('native entry refuses an absent hosted fixture request before fixed-path I/O',()=>{
  assert.throws(()=>requireNativeHostRequest({}));
});
test('portable capsule cannot redirect native PG bind to an arbitrary directory',async()=>{
  const capsule=Object.create(OwnedErpCandidateCapsule.prototype);let calls=0;
  capsule.docker=()=>{calls++;throw Error('DOCKER_MUST_NOT_BE_REACHED');};
  await assert.rejects(()=>capsule.startPostgres(16,{nativeDataSource:'/tmp/unapproved-native-data'}));
  assert.equal(calls,0);
});
test('fixture initial manifest stays exactly 0444 under restrictive umask and refuses overwrite',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-native-readonly-')),file=path.join(directory,'manifest.json');
  const previous=process.umask(0o077);
  try {writeOwnedFixtureReadonlyJson(file,{fixtureOnly:true});assert.equal(fs.statSync(file).mode&0o777,0o444);
    assert.throws(()=>writeOwnedFixtureReadonlyJson(file,{changed:true}),/EEXIST/);assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{fixtureOnly:true});}
  finally {process.umask(previous);}
});
test('runtime build output is readable while restrictive control umask is restored on success and failure',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-native-build-')),file=path.join(directory,'runtime.js');
  const previous=process.umask(0o077);
  try {await buildReadableFixturePayload(async()=>fs.writeFileSync(file,'owned-fixture-only'));assert.equal(fs.statSync(file).mode&0o777,0o644);
    assert.equal(process.umask(),0o077);await assert.rejects(()=>buildReadableFixturePayload(async()=>{throw Error('EXPECTED_BUILD_FAILURE');}),/EXPECTED_BUILD_FAILURE/);
    assert.equal(process.umask(),0o077);}
  finally {process.umask(previous);}
});

test('owned public shadow keeps0555/0444 under umask077 and refuses existing targets',()=>{
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-native-shadow-')),directory=path.join(parent,'shadow');
  const previous=process.umask(0o077);
  try{const value={fixtureOnly:true},identity=createOwnedFixturePublicShadow(directory,value),actual=fs.lstatSync(directory);
    assert.equal(actual.mode&0o7777,0o555);assert.equal(actual.dev,identity.dev);assert.equal(actual.ino,identity.ino);
    assert.equal(fs.statSync(path.join(directory,'manifest.json')).mode&0o7777,0o444);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8')),value);
    assert.throws(()=>createOwnedFixturePublicShadow(directory,{changed:true}),/EEXIST/);assert.equal(process.umask(),0o077);
  }finally{process.umask(previous);}
});
