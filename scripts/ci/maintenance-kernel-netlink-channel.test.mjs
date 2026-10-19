/** Pure parent transcript checks; no actual Netlink/socket acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NetlinkTranscript,openOwnedNetlinkChannel} from './maintenance-kernel-netlink-channel.fixture.mjs';
const nonce='a'.repeat(36),namespace='net:[12345]';
const digest=value=>createHash('sha256').update(value).digest('hex');
function batch({start=0,chain='0'.repeat(64),port=1234,time=100}={}){
 const rows=[
  {messageType:2575,sequence:start+1,deliveryGroup:0,messagePortId:port,frameSha256:'a'.repeat(64),kind:'GENERATION',operation:15,family:0,generation:42},
  {messageType:2,sequence:start+1,deliveryGroup:0,messagePortId:port,frameSha256:'b'.repeat(64),kind:'ACK',requestSequence:start+1,requestPortId:port}
 ].map((r,i)=>({...r,localIndex:start+i+1,receivedMonotonicNs:String(time+i)}));
 for(const row of rows)chain=digest(chain+JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]]))));
 return {nonce,originalSocketPortId:port,membership:[7],namespace,generation:42,acknowledged:true,eventCount:start+2,eventChainSha256:chain,events:rows,multicastReadiness:'NOT_PROVED_REQUIRES_PARENT_SENTINEL',continuousIngressProof:false,productionAuthority:false,fixtureOnly:true};
}
test('original transcript hash chain continues across fresh deltas without claiming continuity',()=>{
 const t=new NetlinkTranscript(namespace),first=batch();assert.deepEqual(t.accept(first,nonce),first);
 const second=batch({start:2,chain:first.eventChainSha256,time:200});t.accept(second,nonce);
 assert.equal(t.snapshot().eventCount,4);assert.equal(t.snapshot().continuousIngressProof,false);
});
for(const [name,change]of[
 ['lost event',v=>v.events.shift()],['duplicate event',v=>v.events.push(v.events[0])],['changed frame',v=>v.events[0].generation=43],
 ['extra metadata',v=>v.events[0].rawName='FOREIGN'],['wrong hash',v=>v.eventChainSha256='0'.repeat(64)],
 ['wrong nonce',v=>v.nonce='b'.repeat(36)],['namespace change',v=>v.namespace='net:[67890]'],['unknown group',v=>v.membership=[8]],
 ['premature continuity claim',v=>v.continuousIngressProof=true],['production claim',v=>v.productionAuthority=true],
])test('invalid '+name+' poisons transcript permanently',()=>{
 const t=new NetlinkTranscript(namespace),v=batch();change(v);assert.throws(()=>t.accept(v,nonce));
 assert.equal(t.snapshot().failed,true);assert.throws(()=>t.accept(batch(),nonce));
});
test('validly rehashed replacement socket and backwards time both fail across deltas',()=>{
 for(const options of [{port:9876,time:200},{port:1234,time:1}]){
  const t=new NetlinkTranscript(namespace),first=batch();t.accept(first,nonce);
  assert.throws(()=>t.accept(batch({start:2,chain:first.eventChainSha256,...options}),nonce));
 }
});
test('parent refuses a channel before spawning without explicit owned-VM boundary',()=>{
 const previous=process.env.RUNNER_ENVIRONMENT;delete process.env.RUNNER_ENVIRONMENT;let registered=false;
 try{assert.throws(()=>openOwnedNetlinkChannel({owner:'123-1',registerOwnedChild:()=>{registered=true;}}),/EXCLUSIVE_VM_REQUIRED/);assert.equal(registered,false);}
 finally{if(previous===undefined)delete process.env.RUNNER_ENVIRONMENT;else process.env.RUNNER_ENVIRONMENT=previous;}
});
