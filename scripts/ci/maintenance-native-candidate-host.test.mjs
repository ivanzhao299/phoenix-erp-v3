import assert from 'node:assert/strict';
import test from 'node:test';
import { requireNativeHostRequest } from './maintenance-native-candidate-host.fixture.mjs';
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
