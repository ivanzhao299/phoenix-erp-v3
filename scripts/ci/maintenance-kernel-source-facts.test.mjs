import test from 'node:test';
import assert from 'node:assert/strict';
import {validateKernelSourceFacts,collectOwnedKernelSourceFacts} from './maintenance-kernel-source-facts.fixture.mjs';
const fixture=()=>({release:'6.8.0-1030-azure',version:'#35~22.04.1-Ubuntu SMP test',architecture:'x86_64',bootId:'12345678-1234-1234-1234-123456789abc',networkNamespace:'net:[4026531833]',
 versionSignature:{state:'PRESENT',value:'Ubuntu 6.8.0-1030.35~22.04.1-azure 6.8.12'},
 installedImagePackage:{state:'INSTALLED_METADATA_ONLY',name:'linux-image-6.8.0-1030-azure',version:'6.8.0-1030.35~22.04.1',sourceName:'linux-signed-azure',sourceVersion:'6.8.0-1030.35~22.04.1'},
 livepatch:{state:'DIRECTORY_PRESENT',entries:[]},tainted:0});
test('installed signed-wrapper package and no patches cannot prove running source or grant a barrier',()=>{
 const value=validateKernelSourceFacts(fixture());
 assert.equal(value.sourceBinding,'UNVERIFIED');assert.equal(value.runningBinaryToPackageBinding,'UNVERIFIED');assert.equal(value.barrierCapability,false);assert.equal(value.productionAuthority,false);assert.equal(value.continuousIngressProof,false);
});
test('unavailable signature/package/livepatch remain explicit unknown facts',()=>{
 const value=fixture();value.versionSignature={state:'UNAVAILABLE',value:null};value.installedImagePackage={state:'QUERY_UNAVAILABLE',name:'linux-image-'+value.release,version:null,sourceName:null,sourceVersion:null};value.livepatch={state:'DIRECTORY_UNAVAILABLE',entries:[]};
 assert.equal(validateKernelSourceFacts(value).sourceBinding,'UNVERIFIED');
});
test('facts are copied rather than aliased to a mutable caller',()=>{const input=fixture(),result=validateKernelSourceFacts(input);input.release='changed';assert.equal(result.facts.release,'6.8.0-1030-azure');});
for(const [name,change]of [
 ['shell release',value=>value.release='6.8;bad'],['multiline version',value=>value.version='one\ntwo'],['unknown architecture',value=>value.architecture='unknown'],
 ['invalid boot',value=>value.bootId='unknown'],['namespace',value=>value.networkNamespace='net:[0]'],['unknown taint',value=>value.tainted=null],
 ['signature unknown text',value=>value.versionSignature.value=null],['invented signature',value=>value.versionSignature.state='VERIFIED'],
 ['different package',value=>value.installedImagePackage.name='linux-image-other'],['missing source',value=>value.installedImagePackage.sourceVersion=null],
 ['unknown metadata field',value=>value.installedImagePackage.trusted=true],['package unavailable with invented value',value=>value.installedImagePackage.state='QUERY_UNAVAILABLE'],
 ['unsafe livepatch path',value=>value.livepatch.entries=[{name:'../other',enabled:false}]],['unknown patch enabled',value=>value.livepatch.entries=[{name:'patch',enabled:'UNKNOWN'}]],
 ['duplicate patches',value=>value.livepatch.entries=[{name:'patch',enabled:false},{name:'patch',enabled:true}]],['caller authority',value=>value.barrierCapability=true],
])test('reject malformed facts: '+name,()=>{const value=fixture();change(value);assert.throws(()=>validateKernelSourceFacts(value),/KERNEL_SOURCE_FACTS_HOLD=/);});
test('ordinary local process cannot collect privileged exclusive-host facts',()=>{
 if(process.getuid?.()!==0||process.env.RUNNER_ENVIRONMENT!=='github-hosted')assert.throws(()=>collectOwnedKernelSourceFacts(),/KERNEL_SOURCE_FACTS_HOLD=/);
});
