import assert from 'node:assert/strict';
import test from 'node:test';
import {ModernSchemaIngress} from './production-modern-schema-ingress.mjs';
import {compileOwnedIngressRules} from './maintenance-ingress-policy.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {modernSchemaFixture} from '../ci/modern-schema-release.fixture.mjs';

function fixture(options={}) {
  const {context}=modernSchemaFixture();
  const networkId='9'.repeat(64),bridge='br-'+networkId.slice(0,12);
  const scope={networkId,bridge,interfaceIndex:75,subnet:'172.29.248.0/24',port:options.port??3100};
  context.ingressScopeSha256=canonicalDigest(scope);
  const definition=compileOwnedIngressRules({owner:canonicalDigest(context).slice(0,32),bridge,subnet:scope.subnet,port:3100},'phoenix_maintenance');
  const state={files:new Map(),effects:[],installed:false,formalOpen:true,installations:0,failAfterDenialEffect:false,failNextNetwork:false};
  const list=(family)=>({nftables:[{table:{family,name:definition.table,handle:2+100*state.installations}},
    ...definition.definitions.filter(row=>row.family===family).flatMap((row,index)=>[
      {chain:{family,table:definition.table,name:row.chain,type:'filter',hook:row.hook,prio:row.priority,policy:'accept',handle:index*2+3+100*state.installations}},
      {rule:{family,table:definition.table,chain:row.chain,handle:index*2+4+100*state.installations,expr:row.expr}},
    ])]});
  const changeProgram=kind=>{
    const key=[...state.files.keys()].find(file=>file.includes(kind+'-program'));
    if(key)state.files.set(key,Buffer.from('{"nftables":[]}\n'));
  };
  const controller=new ModernSchemaIngress({context,scope,privateRuntime:{
    directory:'/unused/owned-in-memory-fixture',
    guard(){},
    publishJson(file,value){assert.equal(state.files.has(file),false);state.files.set(file,Buffer.from(JSON.stringify(value)+'\n'));},
  },async admit(operation){
    if(options.changeDuring===operation)changeProgram(operation==='INSTALL'?'install':'release');
    return operation!=='RELEASE_VERIFIED_FENCED'||state.formalOpen;
  }},{
    readProgram:file=>state.files.get(file),
    run(binary,args){
      if(binary==='/usr/bin/docker'){
        if(state.failNextNetwork){state.failNextNetwork=false;throw Error('temporary native observation unavailable');}
        return JSON.stringify([{Id:networkId,Driver:'bridge',Scope:'local',EnableIPv6:false,IPAM:{Config:[{Subnet:scope.subnet}]}}]);
      }
      if(binary==='/usr/sbin/ip')return JSON.stringify([{ifindex:scope.interfaceIndex,ifname:bridge,linkinfo:{info_kind:'bridge'}}]);
      assert.equal(binary,'/usr/sbin/nft');
      if(args.includes('--file')){
        const program=JSON.parse(state.files.get(args.at(-1)));
        state.effects.push(program);
        state.installed=Boolean(program.nftables[0]?.add);
        if(state.installed)state.installations++;
        if(state.failAfterDenialEffect&&state.effects.length===3)state.failNextNetwork=true;
        if(options.changeAfterEffect)changeProgram('install');
        return '';
      }
      if(args.at(-1)==='tables'){
        return JSON.stringify({nftables:state.installed?['bridge','inet'].map(family=>({table:{family,name:definition.table}})):[]});
      }
      assert.equal(state.installed,true);
      return JSON.stringify(list(args.at(-2)));
    },
  });
  return {controller,state,context};
}

test('only the approved IPv4 API port can build the modern ingress controller',()=>{
  assert.throws(()=>fixture({port:5432}),/EXACT_NATIVE_SCOPE_REQUIRED/);
});
test('exact copied programs install and release both families only once',async()=>{
  const {controller,state}=fixture();
  assert.equal((await controller.install()).state,'FENCED');
  assert.equal(state.installed,true);
  assert.equal((await controller.releaseBeforeOpen()).outcome,'EXACT_OWNED_TABLES_ABSENT');
  assert.equal(state.installed,false);
  assert.equal(state.effects.length,2);
  await assert.rejects(controller.releaseBeforeOpen(),/SINGLE_VERIFIED_OPEN_RELEASE_REQUIRED/);
});
test('an edited program after async installation admission never reaches nft',async()=>{
  const {controller,state}=fixture({changeDuring:'INSTALL'});
  await assert.rejects(controller.install(),/NATIVE_PROGRAM_CHANGED/);
  assert.equal(state.effects.length,0);
});
test('edited deletion program keeps owned ingress installed and cannot retry',async()=>{
  const {controller,state}=fixture({changeDuring:'RELEASE_VERIFIED_FENCED'});
  await controller.install();
  await assert.rejects(controller.releaseBeforeOpen(),/NATIVE_PROGRAM_CHANGED/);
  assert.equal(state.installed,true);
  assert.equal(state.effects.length,1);
  await assert.rejects(controller.releaseBeforeOpen());
  assert.equal(state.effects.length,1);
});
test('formal READY with public FENCED must precede every owned ingress deletion',async()=>{
  const {controller,state}=fixture();
  await controller.install();
  state.formalOpen=false;
  await assert.rejects(controller.releaseBeforeOpen(),/ORIGINAL_NATIVE_ADMISSION_REQUIRED/);
  assert.equal(state.installed,true);
  assert.equal(state.effects.length,1);
});
test('program bytes changing after a native effect produces HOLD without deleting the fence',async()=>{
  const {controller,state}=fixture({changeAfterEffect:true});
  await assert.rejects(controller.install(),/NATIVE_PROGRAM_CHANGED/);
  assert.equal(state.installed,true);
  assert.equal(state.effects.length,1);
  await assert.rejects(controller.releaseBeforeOpen());
  assert.equal(state.effects.length,1);
});

test('original recovery permits only the protected verified R, with its own live admission',async()=>{
  const {controller,state,context}=fixture();
  await controller.install();
  await assert.rejects(controller.releaseRecoveredOriginal(()=>true),/PROTECTED_ORIGINAL_RECOVERY_REQUIRED/);
  assert.equal(state.installed,true);
  const filename=controller.runtime.directory+'/schema-release-original-recovery-verified-'+context.owner+'.json';
  state.files.set(filename,Buffer.from(JSON.stringify({schema:'phoenix.modern-schema-original-recovery-proof/v1',
    owner:context.owner,contextDigest:canonicalDigest(context),targetSha:context.runtimeSha,attemptedTargetSha:context.targetSha,
    outcome:'ABORTED_BEFORE_DDL_ORIGINAL_R_RECOVERED',formalTargetSuccess:false,schemaChanged:false})));
  const operations=[];
  const result=await controller.releaseRecoveredOriginal(async operation=>{operations.push(operation);return true;});
  assert.equal(result.outcome,'EXACT_OWNED_TABLES_ABSENT');
  assert.ok(operations.includes('RELEASE_RECOVERED_ORIGINAL'));
  assert.ok(!operations.includes('RELEASE_VERIFIED_FENCED'));
});

test('after a released ingress, failure may reinstall denial but can never resume the release',async()=>{
 const {controller,state}=fixture();await controller.install();await controller.releaseBeforeOpen();
 const proof=await controller.reinstateForFailure(async operation=>operation==='DENY_FAILURE');
 assert.equal(proof.state,'DENIED');assert.equal(state.installed,true);assert.equal(state.effects.length,3);
 await assert.rejects(controller.releaseBeforeOpen());
 assert.equal((await controller.reinstateForFailure(()=>true)).state,'DENIED');assert.equal(state.effects.length,3);
});
test('failure denial still requires original root admission and an unchanged installation program',async()=>{
 const {controller,state}=fixture();await controller.install();await controller.releaseBeforeOpen();
 await assert.rejects(controller.reinstateForFailure(()=>false));assert.equal(state.installed,false);
 const file=[...state.files.keys()].find(key=>key.includes('install-program'));
 state.files.set(file,Buffer.from('{}\n'));
 await assert.rejects(controller.reinstateForFailure(()=>true),/NATIVE_PROGRAM_CHANGED/);assert.equal(state.installed,false);
});
test('an installation rejected before its first program can still establish failure-only denial',async()=>{
 const {controller,state}=fixture();controller.admit=()=>false;
 await assert.rejects(controller.install());assert.equal(state.files.size,0);
 assert.equal((await controller.reinstateForFailure(()=>true)).state,'DENIED');assert.equal(state.installed,true);
});
test('a rebuilt fence survives lost observation and is retried against its new native handles',async()=>{
 const {controller,state}=fixture();await controller.install();await controller.releaseBeforeOpen();state.failAfterDenialEffect=true;
 await assert.rejects(controller.reinstateForFailure(()=>true),/temporary native observation unavailable/);
 assert.equal(state.installed,true);assert.equal(state.effects.length,3);
 assert.equal((await controller.reinstateForFailure(()=>true)).state,'DENIED');assert.equal(state.effects.length,3);
});
