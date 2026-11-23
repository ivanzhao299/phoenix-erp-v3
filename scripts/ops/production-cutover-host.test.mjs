import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {validateSiteAuthority,workerArgs,verifySiteEvidence} from './production-cutover-host.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';

const sha='a'.repeat(40),sum='f'.repeat(64);
const binding={owner:'123-1',previousFloorSha:sha,targetSha:sha,purpose:'PRODUCTION_CUTOVER',cutover:{
  admissionId:'11000000-0000-4000-8000-000000000001',manifestId:'22000000-0000-4000-8000-000000000002',manifestVersion:3,
  snapshotSha256:sum,contentHash:'b'.repeat(64),mode:'INIT'}};
function authority(){return {schema:'phoenix.production-cutover-site-authority/1',binding,environmentId:'OWNED',environmentGeneration:1,
  project:'phoenix_fixture',database:'fixture',executorRole:'dedicated_executor',operatorId:'3',peerUid:500,peerGid:500,clusterIdentifier:'1',
  sourceAttestationSha256:sum,drainAttestationSha256:sum,deploymentEvidenceSha256:sum,treeSha256:sum,fenceGeneration:6,
  windowStart:new Date(Date.now()-60000).toISOString(),windowEnd:new Date(Date.now()+60000).toISOString(),
  bundle:{revision:sha,bundleId:'33000000-0000-4000-8000-000000000003',imageId:'sha256:'+sum}};}

test('exact independent site authority, original fence and closed time window control execution',()=>{
  const a=authority(),record={generation:6};
  assert.equal(validateSiteAuthority(a,binding,record,'execute').authoritySha256,canonicalDigest(a));
  for(const change of [{peerUid:0},{peerGid:0},{fenceGeneration:7},{operatorId:null},{database:'bad/path'},
    {windowEnd:new Date(Date.now()-5).toISOString()},{sourceAttestationSha256:null},{bundle:{...a.bundle,revision:'c'.repeat(40)}}])
    assert.throws(()=>validateSiteAuthority({...a,...change},binding,record,'execute'));
  assert.throws(()=>validateSiteAuthority(a,{...binding,cutover:{...binding.cutover,mode:'ATTACH'}},record,'recover'));
  assert.equal(validateSiteAuthority({...a,windowEnd:'2000-01-01T00:00:00Z'},binding,record,'recover').mode,'INIT');
});
test('worker has fixed command and immutable image, isolated network, non-root peer and sole read-only socket mount',()=>{
  const a=authority();const args=workerArgs(a);
  for(const flag of ['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pull=never','500:500',a.bundle.imageId])assert.ok(args.includes(flag));
  assert.equal(args.filter(v=>v==='--mount').length,1);assert.equal(args.includes('--env-file'),false);
  assert.deepEqual(args.slice(-2),['/app/dist/scripts/production-cutover-worker.js','--host-stdio']);
});
test('opaque site documents or changes to source/deployment identity fail closed before host commands',()=>{
  const a=authority(),wrong={};a.sourceAttestationSha256=canonicalDigest(wrong);a.drainAttestationSha256=canonicalDigest(wrong);
  assert.throws(()=>verifySiteEvidence(a,binding,{generation:6},wrong,wrong,()=>assert.fail()),/SOURCE_ATTESTATION/);
  const source={schema:'phoenix.cutover-source-attestation/1',revision:sha,imageId:a.bundle.imageId,treeSha256:sum,reviewedBuildDigest:sum,nativeAbiRehearsalDigest:sum};
  a.sourceAttestationSha256=canonicalDigest(source);
  assert.throws(()=>verifySiteEvidence(a,binding,{generation:6},source,wrong,()=>assert.fail()),/DRAIN_ATTESTATION/);
});
test('ordinary invocation cannot initialize a worker or activate a pilot',()=>{
  const run=spawnSync(process.execPath,['scripts/ops/production-cutover-host.mjs'],{encoding:'utf8'});
  assert.equal(run.status,2);assert.equal(run.stdout,'');assert.equal(run.stderr,'PRODUCTION_CUTOVER=HOLD\n');
});
