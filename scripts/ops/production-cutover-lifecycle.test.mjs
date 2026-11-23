import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {BackgroundManifestPublisher} from './background-control-manifest.mjs';
import {BackgroundFenceCoordinator} from './background-control-coordinator.mjs';
import {ingressSurface,pilotLifecycle,runCutoverWorker,validateSiteAuthority} from './production-cutover-host.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';

const native=['1','inet'].includes(process.env.PHOENIX_OWNED_CUTOVER_NATIVE);
const inetOnly=process.env.PHOENIX_OWNED_CUTOVER_NATIVE==='inet';
const sha='a'.repeat(40),sum='b'.repeat(64),net='d'.repeat(64),containerId='e'.repeat(64),bridge='br-'+net.slice(0,12);
const participant={containerId,revision:sha,bootId:'11000000-0000-4000-8000-000000000004',allowedKinds:['LOCAL']};
const participants=[participant];
const network={Id:net,Driver:'bridge',Scope:'local',EnableIPv6:false,IPAM:{Config:[{Subnet:'172.27.192.0/24'}]},Containers:{[containerId]:{}}};
const shell=(program,args,opts)=>execFileSync(program,args,{encoding:'utf8',...opts});
const childProgram=`const rl=require('node:readline').createInterface({input:process.stdin});
let seq=0,op,receipt;const emit=value=>console.log(JSON.stringify(value));
rl.on('line',line=>{const v=JSON.parse(line);seq++;
if(seq===1){op=v.operation;receipt={manifestId:v.permit.manifestId,mode:v.permit.mode,contentHash:v.permit.contentHash,totalOpening:4};
emit({step:'BACKEND',backend:{pid:482,database_oid:'123',start_micros:'1111',server_micros:'1000'}});}
else if(seq===2&&v.step==='CONTINUE'&&op==='recover'){emit({step:'OUTCOME',outcome:process.argv[1]==='absent'?{status:'UNPROVEN'}:{status:'COMMITTED',receipt}});rl.close();}
else if(seq===2&&v.step==='CONTINUE'||seq===3&&v.step==='VERIFIED'){emit({step:'RECHECK'});}
else if(seq===4&&v.step==='VERIFIED'){emit({step:'OUTCOME',outcome:process.argv[1]==='lost'?{status:'UNPROVEN'}:{status:'COMMITTED',receipt}});rl.close();}
else process.exit(9);});`;

function fixture(t,number,{lost=false,interruptRelease=false}={}){
  const binding={owner:'123-'+number,purpose:'PRODUCTION_CUTOVER',previousFloorSha:sha,targetSha:sha,cutover:{
    admissionId:'11000000-0000-4000-8000-000000000001',manifestId:'22000000-0000-4000-8000-000000000002',
    manifestVersion:2,mode:'INIT',contentHash:sum,snapshotSha256:sum}};
  const owner=canonicalDigest(binding).slice(0,32),events=[],held=new Set();
  let bridgeProjection=[],visibleCommit=!lost,connected=true,attempts=0,freshReaders=0,rechecks=0;
  const values=new Map(),read=k=>values.get(k)??null,write=(k,v)=>values.set(k,structuredClone(v));
  if(native)shell('/sbin/ip',['link','add',bridge,'type','bridge']);
  t.after(()=>{if(native){
    const active=JSON.parse(shell('/usr/sbin/nft',['--json','list','tables'])).nftables.flatMap(row=>row.table?[row.table]:[]);
    for(const table of active)if(table.name==='phoenix_maintenance_'+owner)
      shell('/usr/sbin/nft',['delete','table',table.family,table.name]);
    shell('/sbin/ip',['link','del',bridge]);
  }});
  const [link]=native?JSON.parse(shell('/sbin/ip',['-json','link','show','dev',bridge])):[{ifindex:12}];
  const siteProof={schema:'phoenix.cutover-ingress-drain/1',owner:binding.owner,generation:6,manifestId:binding.cutover.manifestId,
    inFlightDrainDigest:sum,networkId:net,interfaceIndex:link.ifindex,approvedIngressCoverageDigest:sum,
    ruleScope:{owner,bridge,subnet:'172.27.192.0/24',port:3100}};
  const a={schema:'phoenix.production-cutover-site-authority/1',binding,environmentId:'OWNED',environmentGeneration:1,
    project:'phoenix_fixture',database:'fixture',executorRole:'dedicated_executor',operatorId:'3',peerUid:500,peerGid:500,clusterIdentifier:'1',
    sourceAttestationSha256:sum,drainAttestationSha256:canonicalDigest(siteProof),deploymentEvidenceSha256:sum,treeSha256:sum,fenceGeneration:6,
    windowStart:new Date(Date.now()-60000).toISOString(),windowEnd:new Date(Date.now()+60000).toISOString(),
    bundle:{revision:sha,bundleId:'33000000-0000-4000-8000-000000000003',imageId:'sha256:'+sum}};
  const permit=validateSiteAuthority(a,binding,{generation:6},'prepare'),initial={protocolVersion:1,owner:'122-1',phase:'OPEN',generation:5,targetSha:sha,participants};
  const manifestDigest=createHash('sha256').update(JSON.stringify(initial)).digest('hex');
  write('public',initial);write('private',{...initial,previousFloorSha:sha,manifestDigest});write('highwater',5);
  const publisher=new BackgroundManifestPublisher({},{
    guard:()=>{},inspect:()=>{},readPrivate:()=>read('private'),readPublic:()=>read('public'),readCutoverPending:()=>read('pending'),
    readSchemaReleasePending:()=>null,writePrivate:v=>write('private',v),writePublic:v=>{write('public',v);events.push(v.phase);},
    readHighWater:()=>read('highwater'),writeHighWater:v=>write('highwater',v),
    verifyCutoverReleaseAuthority:(_,generation)=>read('open-intent')?.generation===generation,
  });
  const api=()=>({containerId,revision:sha,startedAt:'2026-11-23T01:00:00Z',restartCount:0,status:{protocolVersion:1,bootId:participant.bootId,poisoned:false,stopping:false,
    phase:read('public').phase,owner:read('public').owner,generation:read('public').generation,
    inFlight:0,pendingChildren:0,taskGraphs:0,controlSession:{connected:true,broken:false,sessionPid:381,databaseOid:123,backendStartedAt:'2026-11-23T01:00:00.000Z'}}});
  const session={tryLock:async k=>{held.add(k);return true;},unlock:async k=>held.delete(k),close:async()=>{connected=false;held.clear();},
    connected:()=>connected,ping:async()=>connected,verifyParticipants:async()=>true,
    query:async sql=>{assert.match(sql,/pg_postmaster_start_time.*482/);return connected;}};
  let fakeInstalled=false;
  const ingress=()=>{
    if(!native)return {install(){fakeInstalled=true;events.push('INSTALL');return sum;},identity(){assert.ok(fakeInstalled);return sum;},
      families:()=>fakeInstalled?['bridge','inet']:[],release(expected){assert.equal(expected,sum);release();fakeInstalled=false;}};
    const io=(command,args)=>{
      if(command.endsWith('/docker'))return args[0]==='network'?[network]:{fixture:{NetworkID:net}};
      if(command.endsWith('/ip'))return JSON.parse(shell('/sbin/ip',args));
      if(inetOnly&&args.includes('table')&&args.includes('bridge')){
        return {nftables:bridgeProjection};
      }
      const output=JSON.parse(shell(command,args));
      if(inetOnly&&args.includes('tables')&&bridgeProjection.length)output.nftables.push(bridgeProjection[0]);
      return output;
    };
    const surface=ingressSurface(a,binding,{participants,generation:6},siteProof,io);
    const effect=program=>{
      const family=row=>Object.values(Object.values(row)[0])[0].family;
      const commands=inetOnly?program.nftables.filter(row=>family(row)==='inet'):program.nftables;
      shell('/usr/sbin/nft',['--json','--file','-'],{input:JSON.stringify({nftables:commands})});
      if(inetOnly)bridgeProjection=program.nftables.flatMap((row,index)=>{
        if(!row.add||family(row)!=='bridge')return [];
        const [kind]=Object.keys(row.add),body=row.add[kind],{type,policy,hook,prio,...fields}=body;
        const chain=kind==='chain'?{type,policy,hook,prio}:{};
        return [{[kind]:{...fields,...chain,handle:index+1}}];
      });
    };
    return {...surface,install(){events.push('INSTALL');return surface.install(effect);},
      release(expected){release();surface.release(expected,effect);}};
  };
  function release(){
    assert.equal(read('public').phase,'OPEN');
    assert.deepEqual([...held],[1,2]);
    events.push('RELEASE');
    if(interruptRelease){interruptRelease=false;throw Error('OWNED_RELEASE_INTERRUPTED');}
  }
  async function run(operation){
    connected=true;
    const coordinator=new BackgroundFenceCoordinator({binding,project:a.project,participants},{publisher,session,
      inspectParticipant:async()=>api(),inventory:()=>[containerId]});
    if(read('public').phase==='FENCED')coordinator.manifest=read('public');
    try{
      return await pilotLifecycle(operation,{binding,permit,publisher,coordinator,participants,ingress,read,write,guard:()=>{},
        assertDrained:manifest=>coordinator.inspectParticipants(participants,manifest,true),
        archive(){events.push('ARCHIVE');write('archived',read('pending'));values.delete('pending');},
        worker:(op,check)=>{
          if(op==='execute')attempts++;else freshReaders++;
          return runCutoverWorker({operation:op,a,permit,control:session,check:async()=>{rechecks++;await check();},
            launch:()=>spawn(process.execPath,['-e',childProgram,op==='recover'&&!visibleCommit?'absent':lost?'lost':'normal'],{stdio:['pipe','pipe','pipe']}),
            onBackend:v=>write('backend',v)});
        }});
    }finally{await coordinator.close();}
  }
  return {run,read,events,ingress,showCommit:()=>{visibleCommit=true;},counts:()=>({attempts,freshReaders,rechecks})};
}

test('prepared pilot creates dedicated FENCED and COMMITTED_OPEN transitions',async t=>{
  const f=fixture(t,1);
  const ingressProbe=()=>fetch('http://127.0.0.1:3100',{signal:AbortSignal.timeout(500)});
  if(native){
    const server=createServer((_,res)=>res.end('owned'));
    await new Promise(resolve=>server.listen(3100,'127.0.0.1',resolve));
    t.after(()=>{server.closeAllConnections();server.close();});
    assert.equal(await (await ingressProbe()).text(),'owned');
  }
  assert.equal(await f.run('prepare'),'FENCED');
  if(native)await assert.rejects(ingressProbe(),{name:'TimeoutError'});
  assert.equal(f.read('pending').phase,'PREPARED');assert.equal(f.ingress().families().length,2);
  assert.equal(await f.run('execute'),'COMMITTED_OPEN');
  assert.deepEqual(f.events,['INSTALL','FENCED','OPEN','RELEASE','ARCHIVE']);
  assert.deepEqual(f.counts(),{attempts:1,freshReaders:1,rechecks:2});
  assert.equal(f.ingress().families().length,0);assert.equal(f.read('pending'),null);assert.equal(f.read('archived').phase,'PREPARED');
  if(native)assert.equal(await (await ingressProbe()).text(),'owned');
});

test('lost COMMIT acknowledgement retains both fences and permits only original read-only reconciliation',async t=>{
  const f=fixture(t,2,{lost:true});
  assert.equal(await f.run('prepare'),'FENCED');assert.equal(await f.run('execute'),'UNPROVEN');
  assert.equal(f.read('public').phase,'FENCED');assert.equal(f.ingress().families().length,2);assert.ok(f.read('attempt'));
  await assert.rejects(f.run('execute'),/USE_ORIGINAL_RECOVERY/);
  assert.equal(await f.run('recover'),'UNPROVEN');
  assert.equal(f.read('public').phase,'FENCED');assert.equal(f.ingress().families().length,2);
  f.showCommit();
  assert.equal(await f.run('recover'),'COMMITTED_OPEN');
  assert.deepEqual(f.counts(),{attempts:1,freshReaders:3,rechecks:2});assert.equal(f.read('pending'),null);
});

test('interruption after proven OPEN keeps owned ingress and exact original recovery can release it',async t=>{
  const f=fixture(t,3,{interruptRelease:true});
  assert.equal(await f.run('prepare'),'FENCED');await assert.rejects(f.run('execute'),/OWNED_RELEASE_INTERRUPTED/);
  assert.equal(f.read('public').phase,'OPEN');assert.equal(f.ingress().families().length,2);assert.ok(f.read('open-intent'));assert.ok(f.read('pending'));
  assert.equal(await f.run('recover'),'COMMITTED_OPEN');assert.equal(f.ingress().families().length,0);assert.equal(f.read('pending'),null);
});
