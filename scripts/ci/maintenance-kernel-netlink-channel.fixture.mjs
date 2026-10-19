/** Isolated hosted-VM, read-only original Netlink child transport. This is not
 * a production observer, authority, continuous fence or completed factory. */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const source=fileURLToPath(new URL('./maintenance-kernel-netlink.fixture.py',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Error('KERNEL_NETLINK_CHANNEL_HOLD='+code);};
const exact=(value,keys)=>assert.deepEqual(Object.keys(value).sort(),keys.sort());
const canonical=value=>JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])));

/** Pure transcript integrity check, not a completeness or kernel-source proof.
 * Kernel delivery/identity checks are performed by the original Python socket. */
export class NetlinkTranscript {
  #count=0;#chain='0'.repeat(64);#port=null;#namespace;#failed=false;#time=0n;
  constructor(namespace){assert.match(namespace,/^net:\[\d+\]$/);this.#namespace=namespace;}
  accept(value,nonce){
    try{
      if(this.#failed)fail('TRANSCRIPT_ALREADY_FAILED');
      exact(value,['nonce','originalSocketPortId','membership','namespace','generation','acknowledged','eventCount','eventChainSha256','events','multicastReadiness','continuousIngressProof','productionAuthority','fixtureOnly']);
      assert.equal(value.nonce,nonce);assert.equal(value.namespace,this.#namespace);assert.deepEqual(value.membership,[7]);
      assert.ok(Number.isInteger(value.originalSocketPortId)&&value.originalSocketPortId>0&&value.originalSocketPortId<=0xffffffff);
      if(this.#port!==null)assert.equal(value.originalSocketPortId,this.#port);
      assert.equal(value.acknowledged,true);assert.equal(value.fixtureOnly,true);assert.equal(value.productionAuthority,false);assert.equal(value.continuousIngressProof,false);
      assert.equal(value.multicastReadiness,'NOT_PROVED_REQUIRES_PARENT_SENTINEL');
      assert.ok(Number.isInteger(value.generation)&&value.generation>=0&&value.generation<=0xffffffff);
      assert.ok(Array.isArray(value.events)&&value.events.length>=2&&value.events.length<=256);
      let count=this.#count,chain=this.#chain;let previousTime=this.#time;
      for(const row of value.events){
        const keys=['messageType','sequence','deliveryGroup','messagePortId','frameSha256','kind','localIndex','receivedMonotonicNs'];
        if(row.kind==='ACK')keys.push('requestSequence','requestPortId');
        else if(row.kind==='GENERATION')keys.push('operation','family','generation');
        else if(row.kind==='NFT')keys.push('operation','family','tableScope');
        else fail('FRAME_KIND');
        exact(row,keys);assert.equal(row.localIndex,++count);assert.match(row.frameSha256,/^[a-f0-9]{64}$/);
        assert.ok([0,7].includes(row.deliveryGroup));assert.match(row.receivedMonotonicNs,/^[0-9]{1,24}$/);
        const now=BigInt(row.receivedMonotonicNs);assert.ok(now>=previousTime);previousTime=now;
        chain=hash(chain+canonical(row));
      }
      assert.equal(value.eventCount,count);assert.equal(value.eventChainSha256,chain);
      this.#port=value.originalSocketPortId;this.#count=count;this.#chain=chain;this.#time=previousTime;
      return structuredClone(value);
    }catch(error){this.#failed=true;throw error;}
  }
  snapshot(){return {eventCount:this.#count,eventChainSha256:this.#chain,originalSocketPortId:this.#port,failed:this.#failed,continuousIngressProof:false};}
}

export function openOwnedNetlinkChannel({owner,registerOwnedChild}){
  if(!/^[0-9]{1,20}-[0-9]{1,10}$/.test(owner)||typeof registerOwnedChild!=='function')fail('OWNER_OR_REGISTRATION');
  if(process.getuid?.()!==0||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||fs.existsSync('/.dockerenv'))fail('EXCLUSIVE_VM_REQUIRED');
  const sourceSha256=hash(fs.readFileSync(source)),namespace=fs.readlinkSync('/proc/self/ns/net'),transcript=new NetlinkTranscript(namespace);
  const child=spawn('/usr/bin/python3',['-I','-u',source,'--owned-readonly-channel',owner],{env:{PATH:'/usr/bin:/bin',RUNNER_ENVIRONMENT:'github-hosted'},stdio:['pipe','pipe','pipe']});
  let closed=false,fatal=false,closing=false,pending=null,buffer=Buffer.alloc(0),stderrBytes=0,closePromise=null;
  const poison=code=>{fatal=true;if(pending)pending.reject(Error('KERNEL_NETLINK_CHANNEL_HOLD='+code));};
  const joined=new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;if(!closing||code!==0||signal!==null)poison('CHILD_CLOSE');if(pending){pending.reject(Error('KERNEL_NETLINK_CHANNEL_HOLD=CLOSED_WITH_PENDING'));pending=null;}resolve({code,signal});}));
  child.on('error',()=>poison('CHILD_ERROR'));child.stdin.on('error',()=>poison('INPUT_ERROR'));
  child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;poison(stderrBytes>4096?'STDERR_BUDGET':'CHILD_REPORTED_HOLD');});
  child.stdout.on('data',chunk=>{
    try{
      buffer=Buffer.concat([buffer,chunk]);if(buffer.length>262144)fail('OUTPUT_BUDGET');
      while(buffer.includes(10)){
        const index=buffer.indexOf(10),line=buffer.subarray(0,index);buffer=buffer.subarray(index+1);
        if(!pending)fail('UNSOLICITED_RESPONSE');
        const current=pending;pending=null;
        try{current.resolve(JSON.parse(line.toString('utf8')));}catch(error){current.reject(error);throw error;}
      }
    }catch{poison('INVALID_OUTPUT');}
  });
  try{registerOwnedChild(child);}catch(error){
    // Registration failure is real supervision debt. Closing this channel only
    // terminates its locally created read-only child; it never changes rules.
    fatal=true;child.stdin.end();throw Object.assign(error,{ownedChild:child,originalClose:joined});
  }
  const rpc=async(request,{timeoutMs=3000,signal}={})=>{
    if(closed||pending||signal?.aborted||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)fail('RPC_BOUNDARY');
    if(fatal&&request.operation!=='CLOSE')fail('FAILED_CHANNEL');
    const deadline=performance.now()+timeoutMs;let timer,abort;
    try{
      const result=await new Promise((resolve,reject)=>{
        pending={resolve,reject};
        const cancel=()=>{fatal=true;reject(Error('KERNEL_NETLINK_CHANNEL_HOLD=DEADLINE_OR_ABORT'));};
        timer=setTimeout(cancel,timeoutMs);abort=cancel;signal?.addEventListener('abort',abort,{once:true});
        child.stdin.write(JSON.stringify(request)+'\n',error=>{if(error)poison('WRITE_FAILED');});
      });
      if(performance.now()>=deadline||signal?.aborted){fatal=true;fail('LATE_RESPONSE');}
      return result;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  };
  const cleanupDebt=()=>({childPid:child.pid,originalChildClosed:closed,pendingRequests:pending?1:0,failed:fatal,bufferedBytes:buffer.length,stderrBytes,fixtureOnly:true,productionAuthority:false});
  return Object.freeze({
    sourceSha256,childPid:child.pid,namespace,
    table:'phoenix_fixture_'+hash(owner).slice(0,32),readinessTable:'phoenix_ready_'+hash(owner).slice(0,32),
    async probe(options={}){
      try{
        const nonce=options.nonce??randomUUID(),result=await rpc({operation:'PROBE',nonce},options);
        if(fatal||hash(fs.readFileSync(source))!==sourceSha256||fs.readlinkSync('/proc/self/ns/net')!==namespace)fail('SOURCE_OR_CHANNEL_CHANGED');
        return transcript.accept(result,nonce);
      }catch(error){fatal=true;throw error;}
    },
    cleanupDebt,
    close({timeoutMs=3000}={}){
      if(closePromise)return closePromise;
      return closePromise=(async()=>{
        if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)fail('CLOSE_BUDGET');
        const deadline=performance.now()+timeoutMs;
        const remaining=()=>{const left=Math.floor(deadline-performance.now());if(left<1)fail('CLOSE_DEADLINE');return left;};
        closing=true;let closeReply=false;
        try{
          if(!closed&&!pending){const value=await rpc({operation:'CLOSE'},{timeoutMs:remaining()});exact(value,['originalSocketClosed','kernelRulesRemoved']);assert.equal(value.originalSocketClosed,true);assert.equal(value.kernelRulesRemoved,false);closeReply=true;}
          else if(!closed)child.stdin.end();
          let timer;let result;
          try{result=await Promise.race([joined,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('KERNEL_NETLINK_CHANNEL_HOLD=JOIN_TIMEOUT')),remaining());})]);}finally{clearTimeout(timer);}
          remaining();
          if(fatal||!closeReply||result.code!==0||result.signal!==null||buffer.length||pending)fail('UNCLEAN_CLOSE');
          return {originalChildClosed:true,childPid:child.pid,code:result.code,signal:result.signal,kernelRulesRemoved:false,finalIntervalSeal:false,fixtureOnly:true,productionAuthority:false};
        }catch(error){fatal=true;throw Object.assign(error,{ownedChild:child,originalClose:joined,cleanupDebt:cleanupDebt()});}
      })();
    }
  });
}
