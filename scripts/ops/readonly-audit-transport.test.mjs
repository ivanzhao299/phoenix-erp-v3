import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AUDIT_BUNDLE_FILES, stageReadonlyAuditClosure } from './readonly-audit-bundle-stage.mjs';
import { auditBundleManifest } from './readonly-audit-bundle-manifest.mjs';
const ops=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(ops,'../..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/chanjet-readonly-restoration.yml'),'utf8');
const hash=v=>createHash('sha256').update(v).digest('hex');
const b64=v=>Buffer.from(v).toString('base64');
function fixture(t){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'audit-workflow-proof-'));
  t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const repo=path.join(tmp,'repo');fs.mkdirSync(path.join(repo,'scripts/ops'),{recursive:true});
  for(const file of [...AUDIT_BUNDLE_FILES,'readonly-audit-bundle-manifest.mjs','readonly-audit-bundle-stage.mjs'])fs.copyFileSync(path.join(ops,file),path.join(repo,'scripts/ops',file));
  const git=args=>execFileSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(['init','-q','--initial-branch=main']);git(['config','user.name','Fixture']);git(['config','user.email','test@example.invalid']);git(['add','.']);git(['commit','-qm','reviewed audit closure']);git(['remote','add','origin',repo]);
  const target=git(['rev-parse','HEAD']);return{tmp,repo,git,target};
}
function bindBody(){
  const begin=workflow.indexOf('              AUDIT_CLOSURE_MANIFEST_B64=');
  const end=workflow.indexOf('\n            fi',begin);
  assert.ok(begin>=0&&end>begin);return workflow.slice(begin,end).split('\n').map(x=>x.slice(14)).join('\n');
}
function stageBody(){
  const begin=workflow.indexOf('              test "$(printf \'%s\' "$AUDIT_CLOSURE_MANIFEST_B64"');
  const end=workflow.indexOf('              printf \'%s\' "$AUDIT_PROGRAM_B64"',begin);
  assert.ok(begin>=0&&end>begin);return workflow.slice(begin,end).split('\n').map(x=>x.slice(14)).join('\n');
}
function payloads(f){
  const envFile=path.join(f.tmp,'github-env');
  execFileSync('/bin/bash',['-euo','pipefail','-c',bindBody()],{cwd:f.repo,env:{...process.env,APPROVED_SHA:f.target,GITHUB_ENV:envFile}});
  return Object.fromEntries(fs.readFileSync(envFile,'utf8').trim().split('\n').map(line=>{const at=line.indexOf('=');return[line.slice(0,at),line.slice(at+1)];}));
}
function runStage(f,payload,stage){
  return spawnSync('/bin/bash',['-euo','pipefail','-c',`umask 077\ngit(){ command git -c "safe.directory=$DEPLOY_REPO_ROOT" -c core.hooksPath=/dev/null "$@"; }\n${stageBody()}`],{cwd:f.repo,encoding:'utf8',env:{...process.env,...payload,CANDIDATE_MAIN_SHA:f.target,DEPLOY_REPO_ROOT:f.repo,AUDIT_BUNDLE_STAGE:stage}});
}
test('actual workflow Bind and remote staging shell agree on decoded hashes and execute ESM CLI',t=>{
  const f=fixture(t),payload=payloads(f),stage=path.join(f.tmp,'stage');fs.mkdirSync(stage,{mode:0o700});
  assert.equal(payload.AUDIT_CLOSURE_MANIFEST_SHA256,hash(Buffer.from(payload.AUDIT_CLOSURE_MANIFEST_B64,'base64')));
  assert.equal(payload.AUDIT_STAGE_HELPER_SHA256,hash(Buffer.from(payload.AUDIT_STAGE_HELPER_B64,'base64')));
  const before=f.git(['rev-parse','HEAD']),r=runStage(f,payload,stage);assert.equal(r.status,0,r.stderr);
  const manifest=JSON.parse(Buffer.from(payload.AUDIT_CLOSURE_MANIFEST_B64,'base64'));
  for(const file of manifest.files){assert.equal(hash(fs.readFileSync(path.join(stage,file.path))),file.sha256);assert.equal(fs.lstatSync(path.join(stage,file.path)).mode&0o777,0o600);}
  assert.equal(f.git(['rev-parse','HEAD']),before);assert.equal(f.git(['status','--porcelain']),'');
  const wrong=path.join(f.tmp,'wrong-hash');fs.mkdirSync(wrong);
  const bad=runStage(f,{...payload,AUDIT_CLOSURE_MANIFEST_SHA256:hash(payload.AUDIT_CLOSURE_MANIFEST_B64)},wrong);
  assert.notEqual(bad.status,0,'old encoded-vs-decoded hash bug must fail actual shell');assert.deepEqual(fs.readdirSync(wrong),[]);
  const wrongHelper=path.join(f.tmp,'wrong-helper');fs.mkdirSync(wrongHelper);
  assert.notEqual(runStage(f,{...payload,AUDIT_STAGE_HELPER_SHA256:'0'.repeat(64)},wrongHelper).status,0);
});
test('exact closure/target/source modes and output ownership refuse malformed staging before member writes',t=>{
  const f=fixture(t);process.env.AUDIT_MANIFEST_TARGET_SHA=f.target;
  const m=auditBundleManifest(path.join(f.repo,'scripts/ops'));delete process.env.AUDIT_MANIFEST_TARGET_SHA;
  function refuse(value,target=f.target,pattern=/AUDIT_BUNDLE/){const stage=fs.mkdtempSync(path.join(f.tmp,'reject-')),manifest=path.join(stage,'manifest.json');fs.writeFileSync(manifest,JSON.stringify(value));assert.throws(()=>stageReadonlyAuditClosure(manifest,target,f.repo,stage),pattern);assert.deepEqual(fs.readdirSync(stage),['manifest.json']);}
  refuse({...m,targetSha:'0'.repeat(40)});refuse({...m,extra:'not allowed'});
  refuse({...m,files:[...m.files.slice(1)],fileCount:m.fileCount-1});
  refuse({...m,files:[m.files[0],m.files[0],...m.files.slice(2)]});
  refuse({...m,files:m.files.map((x,i)=>i?x:{...x,path:'../escape.mjs'})});
  refuse({...m,files:m.files.map((x,i)=>i?x:{...x,sha256:'0'.repeat(64)})});
  const first=m.files[0].path,src=path.join(f.repo,'scripts/ops',first);fs.unlinkSync(src);fs.symlinkSync('production-config-guard.mjs',src);f.git(['add','.']);f.git(['commit','-qm','forbidden symlink source']);
  const symlinkTarget=f.git(['rev-parse','HEAD']);refuse({...m,targetSha:symlinkTarget},symlinkTarget,/AUDIT_BUNDLE_SOURCE_MODE/);
  const inside=path.join(f.repo,'forbidden-stage');fs.mkdirSync(inside);const mf=path.join(f.tmp,'manifest.json');fs.writeFileSync(mf,JSON.stringify(m));assert.throws(()=>stageReadonlyAuditClosure(mf,f.target,f.repo,inside),/CHECKOUT_WRITE/);
});
test('names-only INPUT_ENVS is small; faithful export-plus-script remote command reproduces actual size boundary',t=>{
  const f=fixture(t),small=payloads(f);
  const base={};for(const [key,file] of Object.entries({PRODUCTION_CONTRACT_B64:'production-config-contract.json',PRODUCTION_PATH_HELPER_B64:'production-trusted-paths.mjs',PRODUCTION_CONTROL_BOOTSTRAP_B64:'production-control-bootstrap.sh',AUDIT_PROGRAM_B64:'chanjet-readonly-production-audit.mjs',AUDIT_SQL_B64:'readonly-audits/chanjet-restoration-preflight.sql'}))base[key]=b64(fs.readFileSync(path.join(ops,file)));
  const old={...base,RECOVERY_BUNDLE_B64:b64(execFileSync('tar',['-czf','-','-C',ops,...AUDIT_BUNDLE_FILES]))};
  const script=workflow.slice(workflow.indexOf('            set -Eeuo pipefail\n')).split('\n').map(x=>x.slice(12)).join('\n');
  const command=env=>Object.entries(env).map(([k,v])=>`export ${k}='${v}'`).join('\n')+'\n'+script;
  const oldCommand=command(old),newCommand=command({...base,...small});
  assert.ok(Buffer.byteLength(oldCommand)>131072);assert.equal(spawnSync('/bin/bash',['-c',oldCommand]).error?.code,'E2BIG');
  assert.ok(Buffer.byteLength(newCommand)<100000,'reserve remote command headroom');assert.equal(spawnSync('/bin/bash',['-n','-c',newCommand]).status,0);
  const names=Object.keys(old).join(',');assert.ok(Buffer.byteLength(names)<1024);
  assert.equal(spawnSync('/bin/true',[],{env:{...process.env,...old,INPUT_ENVS:names}}).status,0,'separate environment values are NOT the oversized INPUT_ENVS claim');
});
