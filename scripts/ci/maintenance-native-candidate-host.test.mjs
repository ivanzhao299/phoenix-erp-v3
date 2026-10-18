import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requireNativeHostRequest, writeOwnedFixtureReadonlyJson, buildReadableFixturePayload } from './maintenance-native-candidate-host.fixture.mjs';
import { OwnedErpCandidateCapsule } from './maintenance-erp-candidate.fixture.mjs';

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
