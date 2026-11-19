import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {MODERN_SCHEMA_SCOPE,MODERN_SCHEMA_CONTEXT,validateModernSchemaContext,validateRegisteredModernSchemaApproval,validateRegisteredFrozenLegacyScope,readRegisteredModernSchemaApproval} from './production-modern-schema-authority.mjs';
const hash=c=>c.repeat(64),sha=c=>c.repeat(40),time=n=>new Date(Date.UTC(2026,10,19,0,n)).toISOString(),now=Date.parse(time(5));
import {modernSchemaFixture as fixture} from '../ci/modern-schema-release.fixture.mjs';

function registration(){
 const f=fixture(),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),directory=fs.mkdtempSync(path.join(root,'artifacts/modern-schema-authority-'));
 const grantFile=path.join(directory,`schema-release-approval-${f.context.owner}.json`),frozenFile=path.join(directory,`schema-release-frozen-test-${f.context.owner}-${f.context.testManifestSha256}.json`);
 const persist=()=>{fs.writeFileSync(grantFile,JSON.stringify(f.grant),{mode:0o600});fs.writeFileSync(frozenFile,JSON.stringify(f.frozen),{mode:0o600});};
 const deps={directory,guard:()=>{},inspectDirectory:()=>{const s=fs.statSync(directory);return {dev:s.dev,ino:s.ino,uid:s.uid,mode:s.mode};},expectedUid:process.getuid(),now:()=>now};
 return {...f,directory,grantFile,frozenFile,persist,deps};
}
for(const conclusion of ['HOLD','GO'])test(`${conclusion} binds the narrow approval independently from source or audit claims`,()=>{
 const f=fixture(conclusion);assert.equal(validateRegisteredModernSchemaApproval(f.grant,f.context,now),true);assert.equal(validateRegisteredFrozenLegacyScope(f.frozen,f.grant,f.context),true);
 assert.equal(f.grant.scope.businessCutover,false);assert.equal(f.grant.scope.featureRollout,'OFF');assert.equal(f.grant.scope.runDeployMigration,false);assert.equal(f.grant.scope.legacyFirstSwitch,false);
});
for(const [name,change]of [
 ['floor',f=>f.grant.context.floorSha=sha('d')],['runtime',f=>f.grant.context.runtimeSha=sha('d')],['target',f=>f.grant.context.targetSha=sha('d')],
 ['pending omitted',f=>f.grant.context.pendingMigrations=[]],['source mutation',f=>f.grant.context.pendingMigrations[0].sourceBlob=sha('e')],['different image',f=>f.grant.context.candidateImageId='sha256:'+hash('e')],
 ['different ledger',f=>f.grant.context.beforeLedgerSha256=hash('e')],['other run',f=>f.grant.context.owner='1234-2'],
 ['full scope',f=>f.grant.scope.deployMode='full'],['Web switch',f=>f.grant.scope.buildWeb=true],['business activation',f=>f.grant.scope.businessCutover=true],['rollout enabled',f=>f.grant.scope.featureRollout='ON'],
 ['automatic rollback',f=>f.grant.scope.automaticRollback=true],['legacy first switch',f=>f.grant.scope.legacyFirstSwitch=true],['body migrations',f=>f.grant.scope.runDeployMigration=true],
 ['caller assertion',f=>f.grant.authorizationOrigin='CALLER'],['COMMENT source authority',f=>f.grant.authorizationRef='OWNER_DELEGATED_COMMENT'],
 ['no independent review',f=>f.grant.technicalReview=null],['claim approves release',f=>f.grant.technicalReview.decision='MATCHED_CLAIM_PENDING_INDEPENDENT_REVIEW'],
 ['wrong audit fingerprint',f=>f.grant.technicalReview.originalAuditSha256=hash('e')],['no custody',f=>delete f.grant.technicalReview.custodyEvidenceSha256],
 ['future registration',f=>f.grant.registeredAt=time(6)],['unknown authority field',f=>f.grant.permission='ADMIN']
])test(`registered ${name} cannot be reused for another schema effect`,()=>{const f=fixture();change(f);assert.throws(()=>validateRegisteredModernSchemaApproval(f.grant,f.context,now),/MODERN_SCHEMA_HOLD=/);});
test('pending identities require complete sorted unique exact source and compiled tuples',()=>{
 for(const change of [c=>c.pendingMigrations=[],c=>c.pendingMigrations.push(c.pendingMigrations[0]),c=>c.pendingMigrations[0].effectiveName='Different1795029621917',
  c=>c.pendingMigrations[0].timestamp='1795029621917',c=>c.pendingMigrations[0].compiledSha256=null,c=>c.pendingMigrations[0].path='../escape',c=>c.changedMigrationPaths.push('apps/api/migrations/legacy.sql')]){
  const c=fixture().context;change(c);assert.throws(()=>validateModernSchemaContext(c),/MODERN_SCHEMA_HOLD=/);
 }
});
test('expired windows, malformed clocks and runtime-equals-target hold before effects',()=>{
 const f=fixture();for(const at of [NaN,Date.parse(time(0))-1,Date.parse(time(20))])assert.throws(()=>validateRegisteredModernSchemaApproval(f.grant,f.context,at),/WINDOW_CLOSED/);
 for(const change of [c=>c.runtimeSha=c.targetSha,c=>c.floorSha=c.targetSha,c=>c.window.end='not-a-date',c=>c.window.end='2026-99-99T00:00:00.000Z',c=>c.window.end=time(40)]){
  const c=fixture().context;change(c);assert.throws(()=>validateModernSchemaContext(c),/MODERN_SCHEMA_HOLD=/);
 }
});
test('matching untrusted groups or a copied business hash cannot replace the protected frozen registration',()=>{
 for(const change of [f=>f.frozen.authorizationOrigin='CALLER',f=>f.frozen.manifest.groups[0].quantity=31,f=>f.frozen.manifestSha256=hash('e'),
  f=>f.frozen.businessEvidenceSha256=hash('e'),f=>f.frozen.custodian=f.frozen.technicalReviewer,f=>f.frozen.frozenAt=time(3),f=>delete f.frozen.manifest.groups,f=>f.frozen.manifest.groups=[],f=>f.frozen.manifest.groups[0].batches=[],f=>f.frozen.manifest.groups[0].batches[0].quantity=29]){
  const f=fixture();change(f);f.grant.frozenRegistrationSha256=canonicalDigest(f.frozen);assert.throws(()=>validateRegisteredFrozenLegacyScope(f.frozen,f.grant,f.context),/TRUSTED_FROZEN_SCOPE/);
 }
});
test('only the exact protected run registration can be consumed; synthetic local files never bypass production FD9',()=>{
 const f=registration();assert.throws(()=>readRegisteredModernSchemaApproval(f.context,f.deps),/PROTECTED_APPROVAL_UNAVAILABLE/);
 f.persist();const proof=readRegisteredModernSchemaApproval(f.context,f.deps);assert.equal(proof.approvalSha256,canonicalDigest(f.grant));assert.equal(proof.contextDigest,canonicalDigest(f.context));
 assert.throws(()=>readRegisteredModernSchemaApproval(f.context));
});
test('dangling revocation and late revocation prevent consumption without clearing any file',()=>{
 for(const late of [false,true]){
  const f=registration();f.persist();const revoked=path.join(f.directory,`schema-release-revoked-${f.context.owner}.json`);let calls=0;
  if(!late)fs.symlinkSync(path.join(f.directory,'missing'),revoked);
  const guard=()=>{if(++calls===2&&late)fs.symlinkSync(path.join(f.directory,'missing'),revoked);};
  assert.throws(()=>readRegisteredModernSchemaApproval(f.context,{...f.deps,guard}),/REVOKED/);assert.equal(fs.lstatSync(revoked).isSymbolicLink(),true);
 }
});
test('symlink, hardlink or public mode is not protected registration',()=>{
 for(const kind of ['symlink','hardlink','mode']){
  const f=registration();f.persist();
  if(kind==='mode')fs.chmodSync(f.grantFile,0o644);if(kind==='hardlink')fs.linkSync(f.grantFile,f.grantFile+'.second');
  if(kind==='symlink'){fs.renameSync(f.grantFile,f.grantFile+'.actual');fs.symlinkSync(f.grantFile+'.actual',f.grantFile);}
  assert.throws(()=>readRegisteredModernSchemaApproval(f.context,f.deps),/PROTECTED_APPROVAL_UNAVAILABLE/);
 }
});

test('revocation or window closure in the last guard is observed before returning',()=>{
 for(const kind of ['revoke','expiry']){const f=registration();f.persist();let calls=0,clock=now;
  const guard=()=>{if(++calls===3){if(kind==='revoke')fs.writeFileSync(path.join(f.directory,`schema-release-revoked-${f.context.owner}.json`),'{}',{mode:0o600});else clock=Date.parse(f.context.window.end);}};
  assert.throws(()=>readRegisteredModernSchemaApproval(f.context,{...f.deps,guard,now:()=>clock}),/REVOKED|WINDOW_CLOSED/);
 }
});
