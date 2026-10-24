import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PersistentMaintenanceIngressController} from './production-maintenance-ingress-controller.mjs';
import {compileOwnedIngressRules} from './maintenance-ingress-policy.mjs';
import {bindingDigest} from './production-maintenance-receipts.mjs';
import {fixture,harness,now} from '../ci/maintenance-transition-fixture.mjs';
const secret='DO_NOT_EXPORT_SENSITIVE_SENTINEL';
function setup(options={}){
 const f=fixture(),networkId='5'.repeat(64),bridge='br-'+networkId.slice(0,12);
 f.context.networkIsolation={networks:[{id:networkId,name:'owned-test',driver:'bridge'}]};
 const h=harness(f),scope={networkId,bridge,interfaceIndex:9,subnet:'172.30.0.0/24',port:3100};
 const compiled=compileOwnedIngressRules({owner:bindingDigest(f.context).slice(0,32),bridge,subnet:scope.subnet,port:3100},'phoenix_maintenance');
 const state={installed:false,clock:now,bootId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',namespace:'net:[123]',interfaceIndex:9,ipv6:false,subnet:scope.subnet,mutationCalls:[],reads:[],formalCalls:0};
 const kernel=family=>({nftables:[{table:{family,name:compiled.table,handle:1}},...compiled.definitions.filter(d=>d.family===family).flatMap((d,i)=>[
  {chain:{family,table:compiled.table,name:d.chain,type:'filter',hook:d.hook,prio:d.priority,policy:'accept',handle:i*2+2}},
  {rule:{family,table:compiled.table,chain:d.chain,handle:i*2+3,expr:structuredClone(d.expr).map(e=>e.counter?{counter:{packets:state.packets||0,bytes:0}}:e)}}])]});
 const run=(binary,args,opts)=>{
  state.reads.push([binary,args]);assert.ok(opts.timeoutMs>0&&opts.timeoutMs<=10000);
  if(binary==='/usr/bin/docker'&&args.at(-1)==='{{json .HostConfig.PortBindings}}')return JSON.stringify(state.ports||{'3100/tcp':[{HostIp:'127.0.0.1',HostPort:'3100'}]});
  if(binary==='/usr/bin/docker')return [networkId,'bridge','local',state.ipv6,[{Subnet:state.subnet}],{},state.members||Object.fromEntries(['api','web','db'].map(name=>[f.context.preSnapshot[name].id,{Name:'phoenix-v3-'+name}])),{'com.docker.compose.project':'phoenix-erp'}].map(JSON.stringify).join('\t');
  if(binary==='/usr/sbin/ip')return JSON.stringify([{ifindex:state.interfaceIndex,ifname:bridge,linkinfo:{info_kind:'bridge'}}]);
  assert.equal(binary,'/usr/sbin/nft');
  if(args.includes('--file')){const program=h.store.read(args.at(-1));state.mutationCalls.push({args,program});if(program.nftables[0].add)state.installed=true;else state.installed=false;if(options.commandThrows){throw Error(secret);}return '';}
  if(args.at(-1)==='tables')return JSON.stringify({nftables:state.installed?[{table:{family:'inet',name:compiled.table}},{table:{family:'bridge',name:compiled.table}}]:[]});
  assert.equal(state.installed,true);const value=kernel(args.at(-2));if(state.ruleChanged)value.nftables.find(row=>row.rule).rule.handle+=100;return JSON.stringify(value);
 };
 const authority={verifyExclusiveWriter:async request=>{assert.equal(request.model,'TRUSTED_ROOT_FD9_EXCLUSIVE_WRITER');assert.equal(request.contextDigest,bindingDigest(f.context));return options.allow!==false;},verifyFormalOpen:async()=>{state.formalCalls++;return options.formal===true;},...options.authority};
 const controller=new PersistentMaintenanceIngressController({context:f.context,scope,authority,store:h.store},{guard:()=>{},run,now:()=>state.clock,readHostIdentity:()=>({bootId:state.bootId,networkNamespace:state.namespace})});
 return {controller,state,h,scope,compiled,authority,close(){fs.rmSync(h.directory,{recursive:true});}};
}
async function use(options,action){const f=setup(options);try{await action(f);}finally{f.close();}}

test('unverified exclusive-writer authority denies all kernel effects',()=>use({allow:false},async({controller,state})=>{await assert.rejects(controller.install(),/EXCLUSIVE_WRITER_NOT_VERIFIED/);assert.equal(state.mutationCalls.length,0);assert.equal(controller.status().state,'HOLD');}));
test('real create-only intent files precede one atomic two-family installation; counter changes preserve identity',()=>use({},async({controller,state,h})=>{
 const installed=await controller.install();assert.equal(installed.state,'FENCED');assert.equal(installed.productionAuthority,false);assert.equal(installed.rootAdversaryResistance,false);
 assert.equal(state.mutationCalls.length,1);const commands=state.mutationCalls[0].program.nftables;assert.deepEqual(commands.filter(row=>row.add?.table).map(row=>row.add.table.family),['inet','bridge']);
 const files=fs.readdirSync(h.directory);assert.ok(files.some(name=>name.includes('install-intent')));assert.ok(files.some(name=>name.includes('installed')));
 for(const name of files){assert.equal(fs.statSync(h.directory+'/'+name).mode&0o777,0o600);}
 state.packets=30;assert.equal((await controller.observe()).identityDigest,installed.identityDigest);assert.equal(state.mutationCalls.length,1);
}));
test('missing formal completion retains rules and permanently refuses release retry',()=>use({},async({controller,state})=>{
 await controller.install();await assert.rejects(controller.release(),/FORMAL_OPEN_NOT_VERIFIED/);assert.equal(state.installed,true);assert.equal(state.mutationCalls.length,1);await assert.rejects(controller.release());assert.equal(state.mutationCalls.length,1);
}));
test('only independently consumed formal open plus fresh identity permits a single exact-owned delete batch',()=>use({formal:true},async({controller,state,compiled})=>{
 await controller.install();const released=await controller.release();assert.equal(released.state,'RELEASED');assert.equal(state.formalCalls,2);assert.equal(state.installed,false);assert.equal(state.mutationCalls.length,2);
 assert.deepEqual(state.mutationCalls[1].program,{nftables:['bridge','inet'].map(family=>({delete:{table:{family,name:compiled.table}}}))});await assert.rejects(controller.release());assert.equal(state.mutationCalls.length,2);
}));
test('ambiguous install outcome is sticky HOLD without retry or automatic delete',()=>use({commandThrows:true},async({controller,state})=>{
 await assert.rejects(controller.install(),error=>error.message==='MAINTENANCE_INGRESS_HOLD=VALIDATION_OR_EFFECT_UNVERIFIED'&&!error.message.includes(secret));assert.equal(state.installed,true);assert.equal(state.mutationCalls.length,1);
 await assert.rejects(controller.install());await assert.rejects(controller.observe());await assert.rejects(controller.release());assert.equal(state.installed,true);assert.equal(state.mutationCalls.length,1);
}));
for(const field of ['ruleChanged','bootId','namespace','interfaceIndex','ipv6','subnet'])test(`physical ${field} drift retains rules and refuses release`,()=>use({formal:true},async({controller,state})=>{
 await controller.install();Object.assign(state,{[field]:{ruleChanged:true,bootId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',namespace:'net:[124]',interfaceIndex:10,ipv6:true,subnet:'172.31.0.0/24'}[field]});
 await assert.rejects(controller.observe());await assert.rejects(controller.release());assert.equal(state.installed,true);assert.equal(state.mutationCalls.length,1);
}));
test('expired window never automatically removes installed persistent rules',()=>use({formal:true},async({controller,state})=>{await controller.install();state.clock+=3600000;await assert.rejects(controller.observe(),/DEADLINE_OR_WINDOW/);assert.equal(state.installed,true);assert.equal(state.mutationCalls.length,1);}));
test('concurrent observe/release cannot race a verifier into an unfence effect',()=>use({formal:true},async({controller,state,authority})=>{
 await controller.install();let unblock;authority.verifyExclusiveWriter=()=>new Promise(resolve=>{unblock=resolve;});const observed=controller.observe();await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(controller.release(),/SINGLE_RELEASE_FROM_FENCED_REQUIRED/);unblock(true);await assert.rejects(observed);assert.equal(state.mutationCalls.length,1);assert.equal(state.installed,true);
}));
test('late authority resolution after a real bounded wait cannot revive admission',{timeout:12000},()=>use({},async({controller,state,authority})=>{
 let resolve;authority.verifyExclusiveWriter=()=>new Promise(done=>{resolve=done;});await assert.rejects(controller.install(),/AUTHORITY_TIMEOUT/);assert.equal(controller.status().pendingAuthorityReads,1);resolve(true);await new Promise(done=>setImmediate(done));assert.equal(controller.status().pendingAuthorityReads,0);assert.equal(controller.status().state,'HOLD');assert.equal(state.mutationCalls.length,0);
}));
test('kernel release result unknown is not retried, restored or called RELEASED',()=>use({formal:true},async({controller,state})=>{
 await controller.install();state.ruleChanged=true;await assert.rejects(controller.release());assert.equal(controller.status().state,'HOLD');assert.equal(state.mutationCalls.length,1);
}));

test('unknown neighbour on a shared bridge refuses before any rule installation',()=>use({},async({controller,state,h})=>{
 state.members=Object.fromEntries(['api','web','db'].map(name=>[h.context.preSnapshot[name].id,{Name:'phoenix-v3-'+name}]));
 state.members['f'.repeat(64)]={Name:'neighbour-service'};
 await assert.rejects(controller.install());assert.equal(state.mutationCalls.length,0);
}));

test('unowned or different published endpoint never permits localhost ingress rule installation',()=>use({},async({controller,state})=>{
 state.ports={'3100/tcp':[{HostIp:'127.0.0.1',HostPort:'13100'}]};
 await assert.rejects(controller.install(),/EXCLUSIVE_PUBLISHED_ERP_PORT_REQUIRED/);assert.equal(state.mutationCalls.length,0);
}));
test('fixed upstream HOLD classification remains diagnostic without granting ingress or exposing arbitrary errors',()=>use({authority:{verifyExclusiveWriter:async()=>{throw Error('MAINTENANCE_HOLD=ROOT_SOURCE_HOST_REGISTRY_CHANGED');}}},async({controller,state})=>{
 await assert.rejects(controller.install(),error=>error.message==='MAINTENANCE_INGRESS_HOLD=VALIDATION_OR_EFFECT_UNVERIFIED'&&error.ingressFailureClass==='MAINTENANCE_HOLD=ROOT_SOURCE_HOST_REGISTRY_CHANGED');
 assert.equal(controller.status().state,'HOLD');assert.equal(state.mutationCalls.length,0);
}));
