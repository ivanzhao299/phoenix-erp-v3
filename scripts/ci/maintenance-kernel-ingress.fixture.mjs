/** Explicit exclusive GitHub-hosted VM experiment, never a production adapter.
 * Success proves fixed IPv4 packet paths, not host ownership, drain or OPEN. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { compileOwnedIngressRules, projectOwnedIngressTable, ingressIdentity } from './maintenance-kernel-ingress-policy.mjs';
import {kernelRemaining,kernelCommandTimeout,boundedOwnedHttpProbe,ownedHttpProbeProgram} from './maintenance-kernel-ingress-probes.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const env = { PATH: '/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', DOCKER_HOST: 'unix:///var/run/docker.sock' };
const IPv4 = value => typeof value==='string' && value.split('.').length===4 && value.split('.').every(p=>/^(0|[1-9][0-9]{0,2})$/.test(p)&&Number(p)<=255);
const serverCode = "const http=require('http');process.on('SIGTERM',()=>process.exit(0));http.createServer((q,s)=>{s.setHeader('Connection','close');s.setHeader('x-phoenix-fixture',process.env.OWNED_KERNEL_RESPONSE);s.end('owned-kernel-fixture')}).listen(3100,'0.0.0.0')";
const probeCode = ownedHttpProbeProgram;
function safeFailure(error) { return /^KERNEL_FIXTURE_[A-Z_]+$/.test(error?.message||'')?error.message:error?.code==='ERR_ASSERTION'?'KERNEL_FIXTURE_ASSERTION':'KERNEL_FIXTURE_COMMAND_OUTCOME_UNKNOWN'; }

export async function runOwnedKernelIngress() {
  assert.equal(process.getuid(),0);assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');
  assert.equal(process.env.NATIVE_KERNEL_INGRESS,'EXCLUSIVE_GITHUB_VM_ONLY');
  const major=Number(process.env.NATIVE_PG_MAJOR);assert.ok([16,18].includes(major));
  const output=process.env.NATIVE_KERNEL_OUTPUT;assert.ok(typeof output==='string'&&output.startsWith('/home/runner/work/_temp/phoenix-kernel-')&&path.normalize(output)===output);
  assert.equal(fs.existsSync(output),false);fs.mkdirSync(output,{mode:0o700});
  const source=process.env.GITHUB_WORKSPACE;assert.ok(source&&fs.realpathSync(source)===source);
  const sourceSha=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:source,env,encoding:'utf8',timeout:10000,killSignal:'SIGKILL',maxBuffer:4096,stdio:['ignore','pipe','pipe']}).trim();assert.match(sourceSha,/^[a-f0-9]{40}$/);assert.equal(sourceSha,process.env.GITHUB_SHA);
  const hostNetworkNamespace=fs.readlinkSync('/proc/self/ns/net');assert.match(hostNetworkNamespace,/^net:\[\d+\]$/);
  const helperSha256=hash(fs.readFileSync(new URL(import.meta.url))),policySha256=hash(fs.readFileSync(new URL('./maintenance-kernel-ingress-policy.mjs',import.meta.url))),probesSha256=hash(fs.readFileSync(new URL('./maintenance-kernel-ingress-probes.mjs',import.meta.url)));
  const owner=randomUUID().replaceAll('-','');const remaining=kernelRemaining();
  const receipt={schema:'phoenix.owned-kernel-ingress-experiment/v1',fixtureOnly:true,productionReceipt:false,sourceSha,helperSha256,policySha256,probesSha256,probeProgramSha256:hash(ownedHttpProbeProgram),owner,pgMajor:major,
    runtimeKind:'SYNTHETIC_HTTP_REAL_POSTGRES_AND_KERNEL',hostNetworkNamespace,probeDebts:[],resources:[],intents:[],cases:[],outcome:'PENDING',continuousIngressProof:false,inflightDrain:'NOT_PROVED',fullFactory:false,productionAuthority:false};
  const file=path.join(output,'result.json');
  const save=()=>fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});save();
  const run=(program,args,options={})=>{delete receipt.failedCommand;const timeout=kernelCommandTimeout(remaining(),options.timeout??10000);let value;try{value=execFileSync(program,args,{input:options.input,env,encoding:'utf8',maxBuffer:1024*1024,stdio:['pipe','pipe','pipe'],timeout,killSignal:'SIGKILL'});}catch(error){const stderr=String(error.stderr||'');receipt.failedCommand={program:path.basename(program),argvSha256:hash(JSON.stringify(args)),status:Number.isInteger(error.status)?error.status:null,signal:typeof error.signal==='string'?error.signal:null,stderrSha256:hash(stderr),...(program==='/usr/sbin/nft'&&args.includes('--file')?{ownedProgramDiagnostic:stderr.slice(0,4096)}:{})};save();throw error;}remaining();return value.trim();};
  const docker=(args,options)=>run('/usr/bin/docker',['--host','unix:///var/run/docker.sock',...args],options);
  let nftSequence=0;
  const nft=(args,input)=>{
    if(input===undefined)return run('/usr/sbin/nft',args);
    assert.equal(typeof input,'string');assert.ok(Buffer.byteLength(input)>0&&Buffer.byteLength(input)<=65536);assert.equal(args.at(-1),'-');assert.ok(args.includes('--file'));
    // Some installed libnftables builds reject a pipe-backed /dev/stdin. Stage
    // only this experiment's program as a new root-owned regular file instead.
    const relative=`nft-program-${++nftSequence}.rules`,programFile=path.join(output,relative),bytes=Buffer.from(input);
    const fd=fs.openSync(programFile,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    const pin=()=>{const st=fs.lstatSync(programFile);assert.ok(st.isFile()&&!st.isSymbolicLink());assert.equal(st.uid,0);assert.equal(st.nlink,1);assert.equal(st.mode&0o777,0o600);assert.equal(hash(fs.readFileSync(programFile)),hash(bytes));return {dev:st.dev,ino:st.ino,size:st.size,mtimeMs:st.mtimeMs,ctimeMs:st.ctimeMs};};
    const before=pin();(receipt.nftPrograms??=[]).push({relative,sha256:hash(bytes),pin:before});save();
    let result,commandError,verificationError;
    try{result=run('/usr/sbin/nft',[...args.slice(0,-1),programFile]);}catch(error){commandError=error;}
    try{assert.deepEqual(pin(),before);remaining();}catch(error){verificationError=error;receipt.nftProgramVerification={relative,outcome:'HOLD',commandAlsoFailed:Boolean(commandError)};save();}
    if(commandError||verificationError)throw new AggregateError([commandError,verificationError].filter(Boolean),'KERNEL_FIXTURE_PROGRAM_OR_COMMAND_FAILURE');
    return result;
  };
  const labels=['--label',`phoenix.test.owner=${owner}`,'--label','phoenix.test.kind=kernel-ingress'];
  const intent=(operation,details)=>{const value={operation,details,sequence:receipt.intents.length+1,outcome:'INTENT'};receipt.intents.push(value);save();return value;};
  const capture=(id,role)=>{assert.match(id,/^[a-f0-9]{64}$/);const row=JSON.parse(docker(['inspect',id,'--format','[{{json .Id}},{{json .Image}},{{json .State}},{{json .RestartCount}},{{json .Config.Labels}},{{json .Mounts}},{{json .HostConfig.Privileged}},{{json .HostConfig.PidMode}}]']));assert.equal(row[0],id);assert.equal(row[4]['phoenix.test.owner'],owner);assert.equal(row[4]['phoenix.test.kind'],'kernel-ingress');assert.equal(row[3],0);assert.equal(row[2].OOMKilled,false);assert.equal(row[6],false);assert.equal(row[7],'');assert.ok(row[5].every(m=>m.Type==='tmpfs'),'KERNEL_FIXTURE_UNAPPROVED_DATA_MOUNT');assert.ok([receipt.images.node,receipt.images.pg].includes(row[1]));
    const pin={id,imageId:row[1],startedAt:row[2].StartedAt,restartCount:row[3],running:row[2].Running,pid:row[2].Pid,exitCode:row[2].ExitCode};
    if(!receipt.resources.some(x=>x.id===id)){receipt.resources.push({type:'container',role,creationPin:pin,id});save();}return pin;};
  const create=(role,args)=>{const name=`phoenix-kernel-${owner}-${role}`;const q=intent('CREATE_OWNED_CONTAINER',{role,name,argvSha256:hash(JSON.stringify(args))});const id=docker(['create','--name',name,...labels,...args]);q.id=id;q.outcome='CREATED';capture(id,role);save();return id;};
  const start=(id,role,attach=false)=>{capture(id,role);const q=intent('START_OWNED_CONTAINER',{id,role});const result=docker(['start',...(attach?['--attach']:[]),id]);q.outcome='RETURNED';save();capture(id,role);return result;};
  const hostProbe=(target,expectedMarker)=>{assert.ok(IPv4(target));return boundedOwnedHttpProbe(`http://${target}:3100/`,{requestFactory:http.get,remaining,ledger:receipt.probeDebts,expectedMarker});};
  const peerProbe=(peer,target,expectedMarker)=>{assert.ok(IPv4(target));capture(peer,'peer');return JSON.parse(docker(['exec',peer,'node','-e',probeCode,`http://${target}:3100/`,expectedMarker]));};
  const markerFor=id=>owner+'-'+receipt.resources.find(r=>r.id===id).role;
  const serviceProbe=id=>JSON.parse(docker(['exec',id,'node','-e',probeCode,'http://127.0.0.1:3100/',markerFor(id)]));
  const targetIp=id=>{const row=JSON.parse(docker(['inspect',id,'--format','{{json .NetworkSettings.Networks}}']));assert.deepEqual(Object.keys(row),[networkName]);const ip=row[networkName].IPAddress;assert.ok(IPv4(ip));assert.ok(!row[networkName].GlobalIPv6Address);return ip;};
  let networkName,networkId,scope,compiled,baseline;
  const checkpoint=(name,observed)=>{receipt.checkpoint={name,...(observed?{observed}: {})};save();};
  const kernel=()=>['inet','bridge'].map(family=>{
    const raw=nft(['--json','--handle','list','table',family,compiled.table]);assert.ok(Buffer.byteLength(raw)<=32768);
    const observed=JSON.parse(raw);(receipt.ownedKernelObservations??={})[family]=observed;save();
    return projectOwnedIngressTable(observed,family,{...scope,owner:compiled.table.slice('phoenix_fixture_'.length)});
  });
  const identity=()=>{assert.equal(fs.readlinkSync('/proc/self/ns/net'),hostNetworkNamespace);const nowInterface=JSON.parse(run('/usr/sbin/ip',['-json','-details','link','show','dev',scope.bridge]));assert.equal(nowInterface.length,1);assert.equal(nowInterface[0].ifindex,receipt.network.interfaceIndex);assert.equal(nowInterface[0].linkinfo.info_kind,'bridge');const tables=kernel();assert.deepEqual(ingressIdentity(tables),baseline);return tables;};
  const remove=()=>{identity();const q=intent('REMOVE_EXACT_OWNED_RULE_TABLES',{table:compiled.table});nft(['--file','-'],`delete table bridge ${compiled.table}\ndelete table inet ${compiled.table}\n`);q.outcome='REMOVED';save();};
  try {
    const nodeImage=JSON.parse(docker(['image','inspect','node:20-alpine','--format','{{json .Id}}']));const pgImage=JSON.parse(docker(['image','inspect',`postgres:${major}-alpine`,'--format','{{json .Id}}']));
    receipt.images={node:nodeImage,pg:pgImage};assert.match(nodeImage,/^sha256:[a-f0-9]{64}$/);assert.match(pgImage,/^sha256:[a-f0-9]{64}$/);
    networkName=`phoenix-kernel-${owner}`;const networkIntent=intent('CREATE_OWNED_PRIVATE_IPV4_BRIDGE',{name:networkName});networkId=docker(['network','create',...labels,networkName]);networkIntent.id=networkId;networkIntent.outcome='CREATED';save();
    const net=JSON.parse(docker(['network','inspect',networkId]))[0];assert.equal(net.Id,networkId);assert.equal(net.Driver,'bridge');assert.equal(net.Internal,false);assert.equal(net.EnableIPv6,false);assert.equal(net.Labels['phoenix.test.owner'],owner);assert.equal(net.IPAM.Config.length,1);
    const bridge=net.Options?.['com.docker.network.bridge.name']||'br-'+networkId.slice(0,12);assert.match(bridge,/^br-[a-f0-9]{12}$/);
    const iface=JSON.parse(run('/usr/sbin/ip',['-json','-details','link','show','dev',bridge]));assert.equal(iface.length,1);assert.equal(iface[0].ifname,bridge);assert.equal(iface[0].linkinfo.info_kind,'bridge');
    scope={owner,bridge,subnet:net.IPAM.Config[0].Subnet,port:3100};compiled=compileOwnedIngressRules(scope);receipt.network={id:networkId,scope,interfaceIndex:iface[0].ifindex,ipv6:'DISABLED_AND_IPV4_ONLY_PUBLISH_REQUIRED'};receipt.programSha256=compiled.programSha256;receipt.resources.push({type:'network',id:networkId,owner});save();
    const db=create('db',['--network',networkName,'--restart=no','--env','POSTGRES_HOST_AUTH_METHOD=trust','--tmpfs',(major===16?'/var/lib/postgresql/data':'/var/lib/postgresql')+':rw,nosuid,nodev,size=268435456,mode=1777',pgImage]);start(db,'db');
    for(let i=0;;i++){capture(db,'db');try{docker(['exec',db,'pg_isready','-q','-U','postgres']);break;}catch(error){if(![1,2].includes(error.status))throw error;}assert.ok(i<40);await new Promise(r=>setTimeout(r,100));}
    const dbIp=targetIp(db);const peer=create('peer',['--network',networkName,'--restart=no','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',nodeImage,'node','-e','setInterval(()=>{},1000)']);start(peer,'peer');
    const api=(role)=>{const id=create(role,['--network',networkName,'--restart=no','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--publish','127.0.0.1:3100:3100','--env',`OWNED_KERNEL_RESPONSE=${owner}-${role}`,nodeImage,'node','-e',serverCode]);start(id,role);return id;};
    const healthy=async(id)=>{checkpoint('OWNED_SERVICE_HEALTH');for(let i=0;;i++){capture(id,'api');const probe=serviceProbe(id);if(probe.kind==='HTTP'&&probe.status===200)break;assert.deepEqual(probe,{kind:'ERROR',code:'ECONNREFUSED'});assert.ok(i<40);await new Promise(r=>setTimeout(r,50));}
      const ports=JSON.parse(docker(['inspect',id,'--format','{{json .NetworkSettings.Ports}}']));checkpoint('OWNED_PUBLISHED_PORT_BINDING',{ports});assert.deepEqual(ports,{'3100/tcp':[{HostIp:'127.0.0.1',HostPort:'3100'}]});checkpoint('OWNED_TARGET_IPV4');return targetIp(id);};
    let sqlSequence=0;
    const dbProbe=(id)=>{const client=create(`sql${++sqlSequence}`,['--network',`container:${id}`,'--restart=no','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--tmpfs',(major===16?'/var/lib/postgresql/data':'/var/lib/postgresql')+':rw,nosuid,nodev,size=1048576,mode=1777',pgImage,'psql','-h',dbIp,'-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-c','SELECT 1']);const result=start(client,'sql',true);const pin=capture(client,'sql');assert.equal(pin.running,false);assert.equal(pin.exitCode,0);assert.equal(result,'1');return {result:1,clientId:client,namespaceOf:id};};
    const old=api('old');const oldIp=await healthy(old);checkpoint('BASELINE_HOST_PUBLISHED');assert.equal((await hostProbe('127.0.0.1',markerFor(old))).status,200);checkpoint('BASELINE_PEER');assert.equal(peerProbe(peer,oldIp,markerFor(old)).status,200);checkpoint('BASELINE_DATABASE');const beforeDb=dbProbe(old);receipt.baselineDatabase=beforeDb;save();
    const assertAbsent=()=>{const tables=JSON.parse(nft(['--json','list','tables']));assert.ok(Array.isArray(tables.nftables));assert.ok(!tables.nftables.some(x=>x.table?.name===compiled.table),'KERNEL_FIXTURE_FOREIGN_EXISTING_TABLE');};
    checkpoint('OWNED_TABLE_ABSENCE');assertAbsent();checkpoint('OWNED_RULE_COMPILE_CHECK');nft(['--json','--check','--file','-'],compiled.program);checkpoint('OWNED_RULE_INSTALL');const install=intent('INSTALL_OWNED_IPV4_RULES',{table:compiled.table,programSha256:compiled.programSha256});nft(['--json','--file','-'],compiled.program);install.outcome='INSTALLED';checkpoint('OWNED_KERNEL_BASELINE_IDENTITY');baseline=ingressIdentity(kernel());receipt.kernelBaseline=baseline;save();
    const packets=(tables,chain)=>tables.flat().filter(r=>r.kind==='rule'&&r.chain===chain).reduce((n,r)=>n+r.packets,0);
    const denied=async(id,ip,stage)=>{
      const pin=capture(id,'api');assert.equal(pin.running,true);assert.equal(serviceProbe(id).status,200);const pre=identity();
      const host=await hostProbe('127.0.0.1',markerFor(id));const afterHost=identity();assert.deepEqual(host,{kind:'ERROR',code:'FIXTURE_TIMEOUT'});assert.ok(packets(afterHost,'host_published')>packets(pre,'host_published'));
      const direct=await hostProbe(ip,markerFor(id));const afterDirect=identity();assert.deepEqual(direct,{kind:'ERROR',code:'FIXTURE_TIMEOUT'});assert.ok(packets(afterDirect,'host_direct')>packets(afterHost,'host_direct'));
      const peerResult=peerProbe(peer,ip,markerFor(id));const afterPeer=identity();assert.deepEqual(peerResult,{kind:'ERROR',code:'FIXTURE_TIMEOUT'});
      const peerPath={bridgePeer:packets(afterPeer,'peer')-packets(afterDirect,'peer'),routed:packets(afterPeer,'routed')-packets(afterDirect,'routed')};assert.ok(peerPath.bridgePeer>0||peerPath.routed>0);
      const dbResult=dbProbe(id);const post=identity();remaining();assert.deepEqual(capture(id,'api'),pin);
      receipt.cases.push({stage,executor:pin,host,direct,peer:peerResult,peerDropPath:peerPath,loopback:{status:200},database:dbResult,kernelCounters:post});save();
    };
    await denied(old,oldIp,'OLD_RUNNING_KERNEL_FENCED');
    const stop=intent('STOP_OWNED_SYNTHETIC_OLD',{id:old,protocol:'SIGTERM_STOP30_SINGLE_ATTEMPT'});docker(['stop','--signal','SIGTERM','--time','30',old],{timeout:Math.min(35000,remaining())});const oldAfter=capture(old,'old');assert.equal(oldAfter.running,false);assert.equal(oldAfter.pid,0);assert.equal(oldAfter.exitCode,0);stop.outcome='STOPPED_RETAINED';identity();save();
    const candidate=api('candidate');const candidateIp=await healthy(candidate);await denied(candidate,candidateIp,'CANDIDATE_STARTS_BEHIND_PREEXISTING_KERNEL_FENCE');
    remove();assert.equal((await hostProbe('127.0.0.1',markerFor(candidate))).status,200);assert.equal(peerProbe(peer,candidateIp,markerFor(candidate)).status,200);receipt.cases.push({stage:'EXPERIMENT_FENCE_REMOVAL_NOT_PUBLIC_OPEN',host:200,peer:200,database:dbProbe(candidate)});save();
    // Independent negative scenario: install a NEW owner-scoped table, then
    // deliberately remove both of its exact host rules. Never repair/reinstall a failed guard.
    compiled=compileOwnedIngressRules({...scope,owner:randomUUID().replaceAll('-','')});const negative=intent('NEW_RULE_LOSS_COUNTEREXAMPLE',{table:compiled.table,programSha256:compiled.programSha256});assertAbsent();nft(['--json','--file','-'],compiled.program);negative.outcome='INSTALLED';baseline=ingressIdentity(kernel());identity();const hostRules=kernel()[0].filter(r=>r.kind==='rule'&&['host_published','host_direct'].includes(r.chain));assert.equal(hostRules.length,2);
    const loss=intent('DELETE_EXACT_OWNED_HOST_RULES_FOR_COUNTEREXAMPLE',{table:compiled.table,handles:hostRules.map(r=>({chain:r.chain,handle:r.handle}))});nft(['--file','-'],hostRules.map(r=>`delete rule inet ${compiled.table} ${r.chain} handle ${r.handle}`).join('\n')+'\n');loss.outcome='DELETED';save();assert.equal((await hostProbe('127.0.0.1',markerFor(candidate))).status,200);assert.throws(()=>identity());const before=receipt.intents.length;assert.throws(()=>remove());assert.equal(receipt.intents.length,before);
    receipt.cases.push({stage:'RULE_LOSS_HOLD_NO_RELEASE',observedHostReachable:true,removedOwnedHostRules:2,identityCheck:'REJECTED',releaseAttempt:'REJECTED_BEFORE_EFFECT',remainingRules:'RETAINED_ON_EXPERIMENT_VM'});
    assert.equal(hash(fs.readFileSync(new URL(import.meta.url))),helperSha256);assert.equal(hash(fs.readFileSync(new URL('./maintenance-kernel-ingress-policy.mjs',import.meta.url))),policySha256);assert.equal(hash(fs.readFileSync(new URL('./maintenance-kernel-ingress-probes.mjs',import.meta.url))),probesSha256);remaining();
    receipt.outcome='PASS_COMPONENT_ONLY';receipt.cleanupComplete=false;receipt.retainedOwnedResources=true;receipt.negativeRulesRetained=true;receipt.resourceLifecycleAcceptance='NOT_VERIFIED_RETAINED_COMPONENT_EXPERIMENT_ONLY';save();remaining();return receipt;
  } catch(error) {const at=/maintenance-kernel-ingress\.fixture\.mjs:(\d+):(\d+)/.exec(error?.stack||'');if(at)receipt.failureLocation={line:Number(at[1]),column:Number(at[2])};receipt.outcome='HOLD';receipt.failureClass=safeFailure(error);receipt.commandOutcomeMayBeUnknown=true;receipt.cleanupComplete=false;receipt.automaticRetry=false;save();throw Error(receipt.failureClass);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){runOwnedKernelIngress().then(r=>console.log(JSON.stringify({outcome:r.outcome,sourceSha:r.sourceSha,pgMajor:r.pgMajor,productionAuthority:false}))).catch(e=>{console.error(safeFailure(e));process.exitCode=1;});}
