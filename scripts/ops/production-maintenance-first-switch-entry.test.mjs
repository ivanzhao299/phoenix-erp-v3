import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {validateLegacyDispatchScope} from './production-maintenance-bootstrap.mjs';
import {validateMaintenanceReleaseInput} from './production-maintenance-release-input.mjs';
import {verifyMaintenanceRegistry} from './production-maintenance-root-sources.mjs';
const valid=()=>({DEPLOY_MODE:'api',BUILD_API:'true',BUILD_WEB:'false',RUN_MIG:'false',PRESERVE_ARTIFACTS:'true',ROTATE_CHANJET_CREDENTIALS:'false',ONE_TIME_CONFIG_FLOOR_TRANSITION:'false',TARGET_SHA:'a'.repeat(40),APPROVED_CONFIG_FLOOR_SHA:'a'.repeat(40),APPROVED_PREVIOUS_FLOOR_SHA:'b'.repeat(40),DEPLOY_RUN_ID:'123456-1'});
test('formal legacy scope is exact API-only and never enables migration/Web',()=>{assert.equal(validateLegacyDispatchScope(valid()).owner,'123456-1');for(const [key,value]of Object.entries({DEPLOY_MODE:'full',BUILD_WEB:'true',RUN_MIG:'true',APPROVED_CONFIG_FLOOR_SHA:'b'.repeat(40),ROTATE_CHANJET_CREDENTIALS:'true'}))assert.throws(()=>validateLegacyDispatchScope({...valid(),[key]:value}),/API_ONLY_DISPATCH/);});
test('source artifact requires complete pinned evidence and exact target',()=>{const receipt=Buffer.from('{"fixture":"source only"}'),digest=createHash('sha256').update(receipt).digest('hex'),target='a'.repeat(40);const value={ownerSource:{repository:'ivanzhao299/phoenix-erp-v3',prNumber:457,sourceHeadSha:'b'.repeat(40),sourceTreeSha:'c'.repeat(40),expectedMainSha:target,reviewId:123,delegateUserId:7245339,delegateLogin:'emvia',ownerDelegationDigest:'d'.repeat(64),sourceReviewReceiptDigest:digest,pinnedReviewRecordSha256:'e'.repeat(64)},sourceReviewReceiptBase64:receipt.toString('base64')};assert.deepEqual(validateMaintenanceReleaseInput(JSON.stringify(value),target).receipt,receipt);assert.throws(()=>validateMaintenanceReleaseInput(JSON.stringify(value),'f'.repeat(40)),/INVALID/);value.sourceReviewReceiptBase64=Buffer.from('changed').toString('base64');assert.throws(()=>validateMaintenanceReleaseInput(JSON.stringify(value),target),/INVALID/);});
test('registry permits exact live executor transition while retaining foreign identity',()=>{const foreign={id:'3'.repeat(64),classification:'NON_ERP_PINNED',erpControlReference:false,identitySha256:'4'.repeat(64)},old={id:'1'.repeat(64),classification:'ERP_EXECUTOR',erpControlReference:true,identitySha256:'2'.repeat(64)},before={schema:'phoenix.maintenance-host-registry/v1',containers:[old,foreign],hostProcesses:[],schedulers:[]};const after=structuredClone(before);after.containers[0]={...old,id:'5'.repeat(64),identitySha256:'6'.repeat(64)};assert.equal(verifyMaintenanceRegistry(before,after),true);after.containers[1].identitySha256='7'.repeat(64);assert.throws(()=>verifyMaintenanceRegistry(before,after),/HOST_REGISTRY_CHANGED/);});
test('workflow route exits before modern control and stages preserved source paths',()=>{const source=fs.readFileSync('.github/workflows/deploy.yml','utf8'),branch=source.indexOf('if [ -n "${MAINTENANCE_RELEASE_INPUT:-}" ]');assert.ok(branch>source.indexOf('git fetch origin main'));const run=source.indexOf('production-maintenance-bootstrap.mjs" run',branch),exit=source.indexOf('exit 0',run),modern=source.indexOf('background-deployment-session.mjs" run',exit);assert.ok(run>branch&&exit>run&&modern>exit);assert.match(source.slice(branch,exit),/git show "\$TARGET_SHA:\$helper" > "\$LEGACY_STAGE\/\$helper"/);assert.match(source,/actions: read/);assert.match(source,/pull-requests: read/);});
test('known auth and external push blockers are checked before typed factory STOP',()=>{const reader=fs.readFileSync('scripts/ops/production-maintenance-root-readers.mjs','utf8'),sources=fs.readFileSync('scripts/ops/production-maintenance-root-sources.mjs','utf8');assert.match(reader,/pushInitialized!==false\)hold\('ROOT_READER_EXTERNAL_PUSH_RECONCILIATION_REQUIRED_BEFORE_STOP'/);assert.match(sources,/await readers.assertReconciliationReady/);assert.match(reader,/return readOwnerAuthUnknownDecision\(context\)/);});
test('recovery layer verification accepts both classic and OCI-layout archives with prefixed stream digests',async()=>{
  const reader=fs.readFileSync('scripts/ops/production-maintenance-root-readers.mjs','utf8');
  assert.match(reader,/const expected=ociBlobs\?'sha256:'\+layer\.slice\('blobs\/sha256\/'\.length\):diffIds\[index\]/);
  const {execFileSync}=await import('node:child_process'),{mkdtempSync:mk,rmSync:rm,writeFileSync:wf}=fs,os=await import('node:os'),path=await import('node:path');
  const root=mk(path.join(os.tmpdir(),'phoenix-layer-forms-'));
  try{
    const byte=form=>Buffer.from('layer-bytes:'+form+':'+Date.now());
    for(const form of ['classic','oci']){
      const layerBytes=byte(form),layerHex=createHash('sha256').update(layerBytes).digest('hex'),dir=path.join(root,form);
      fs.mkdirSync(dir,{recursive:true});
      if(form==='classic'){
        const layerDir=path.join(dir,layerHex);fs.mkdirSync(layerDir,{recursive:true});wf(path.join(layerDir,'layer.tar'),layerBytes);
        wf(path.join(dir,'config.json'),JSON.stringify({rootfs:{diff_ids:['sha256:'+layerHex]},config:{Labels:{'org.opencontainers.image.revision':'a'.repeat(40)}}}));
        wf(path.join(dir,'manifest.json'),JSON.stringify([{Config:'config.json',Layers:[layerHex+'/layer.tar']}]));
      }else{
        const blobs=path.join(dir,'blobs','sha256');fs.mkdirSync(blobs,{recursive:true});wf(path.join(blobs,layerHex),layerBytes);
        wf(path.join(dir,'config.json'),JSON.stringify({rootfs:{diff_ids:['sha256:'+'0'.repeat(64)]},config:{Labels:{'org.opencontainers.image.revision':'a'.repeat(40)}}}));
        wf(path.join(dir,'manifest.json'),JSON.stringify([{Config:'blobs/sha256/'+'0'.repeat(64),Layers:['blobs/sha256/'+layerHex]}]));
      }
      execFileSync('tar',['-cf',path.join(dir,'image.tar'),'-C',dir,'manifest.json','config.json',form==='classic'?layerHex:'blobs']);
      const archive=path.join(dir,'image.tar');
      const manifest=JSON.parse(execFileSync('tar',['-xOf',archive,'manifest.json'],{encoding:'utf8',maxBuffer:1024*1024}));
      const layers=manifest[0].Layers,ociBlobs=layers.every(name=>/^blobs\/sha256\/[a-f0-9]{64}$/.test(name));
      const streamed='sha256:'+createHash('sha256').update(execFileSync('tar',['-xOf',archive,layers[0]],{maxBuffer:64*1024*1024})).digest('hex');
      // The pinned expression: an OCI blob's own content address and a classic
      // diff_id are both prefixed digest strings.
      const expected=ociBlobs?'sha256:'+layers[0].slice('blobs/sha256/'.length):'sha256:'+layerHex;
      assert.equal(streamed,expected);
    }
  }finally{rm(root,{recursive:true,force:true});}
});
