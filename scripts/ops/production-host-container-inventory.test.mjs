import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {CONTRACT} from './production-config-guard.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {diagnoseProductionHostContainerOwnership,legacyContainerIdentity,LEGACY_CONTAINER_FIELDS} from './production-host-container-inventory.mjs';

const cid=char=>char.repeat(64),rev=char=>char.repeat(40),image=char=>'sha256:'+cid(char);
const target=rev('a'),privateValue='PRIVATE_FIXTURE_SENTINEL';
const schema='phoenix.maintenance-reviewed-host-ownership/v1';
const prefix='HOST_CONTAINER_OWNERSHIP_DIAGNOSIS=';
const coreHolds=['HOLD_CORE_RECORD','HOLD_CORE_ROSTER','HOLD_CORE_RUNTIME_STATE','HOLD_CORE_HEALTH','HOLD_CORE_IMAGE_IDENTITY'];
const quoted=rows=>rows.map(row=>row.map(value=>JSON.stringify(value)).join('\t')).join('\n');
function fixture(){
  const apiRev=rev('b'),webRev=rev('c'),foreign=cid('4'),gone=cid('5');
  const services=['api','web','db'];
  const rows=services.map((service,i)=>[cid(String(i+1)),image(String(i+6)),'/phoenix-v3-'+service,'2026-11-19T12:00:00Z',0,21,true,false,'','fixture-net',null,
    'phoenix-erp','running','healthy','always',[],null,null,'','',false,false]);
  rows.push([foreign,image('9'),'/'+privateValue,'2026-11-19T12:00:00Z',2,0,false,false,'','none',['/private-fixture/'+privateValue+':/bind:ro'],
    '', 'exited',null,'no',[{Type:'bind',Source:'/private-fixture/'+privateValue,Destination:'/bind'}],
    [privateValue],[privateValue],'',privateValue,false,false]);
  const images=[[image('6'),apiRev],[image('7'),webRev]];
  const pin={id:foreign,identitySha256:canonicalDigest(legacyContainerIdentity(rows[3])),owner:privateValue};
  const active={value:{version:CONTRACT.version,outcome:'SUCCESS',active:{api:{revision:apiRev,imageId:image('6')},web:{revision:webRev,imageId:image('7')}}},digest:cid('b')};
  const registry={value:{schema,evidenceSha256:cid('e'),hostProcesses:[],containers:[pin,{...pin,id:gone}]},digest:cid('f')};
  const readRecord=name=>name==='active.json'?active:registry;
  const docker=args=>{
    if(args[0]==='ps'){assert.deepEqual(args,['ps','-a','--no-trunc','-q']);return rows.map(row=>row[0]).reverse().join('\n');}
    if(args[0]==='inspect'){
      assert.deepEqual(args.slice(0,4),['inspect','--type','container','--format']);
      assert.deepEqual(args[4].split('\t').slice(0,11),LEGACY_CONTAINER_FIELDS.slice(0,11));
      assert.match(args[4].split('\t')[11],/with index \.Config "Labels".*"com\.docker\.compose\.project"/);
      assert.doesNotMatch(args[4],/\.Config\.Env|\.NetworkSettings|compose\.service|\.HostConfig\.(?:PortBindings|ReadonlyRootfs)/);
      assert.match(args[4],/\{\{json \.Mounts\}\}/);
      assert.match(args[4].split('\t')[13],/if or \(eq \.Name "\/phoenix-v3-api"\) \(eq \.Name "\/phoenix-v3-web"\) \(eq \.Name "\/phoenix-v3-db"\)/);
      return quoted(args.slice(5).map(id=>rows.find(row=>row[0]===id)));
    }
    assert.deepEqual(args.slice(0,3),['image','inspect','--format']);
    const coreImageIds=new Set(rows.filter(row=>['/phoenix-v3-api','/phoenix-v3-web'].includes(row[2])).map(row=>row[1]));
    assert.deepEqual(args.slice(4),images.map(row=>row[0]).filter(id=>coreImageIds.has(id)));
    assert.match(args[3],/org\.opencontainers\.image\.revision/);
    assert.doesNotMatch(args[3],/org\.opencontainers\.image\.source/);
    return quoted(args.slice(4).map(id=>images.find(row=>row[0]===id)));
  };
  return {run:overrides=>diagnoseProductionHostContainerOwnership(target,{docker,readRecord,guard(){},...overrides}),
    docker,readRecord,rows,images,pin,registry,active,foreign};
}

test('container identity format and mapping match the actual legacy observer',()=>{
  const source=fs.readFileSync(new URL('./production-maintenance-root-readers.mjs',import.meta.url),'utf8');
  const start=source.indexOf('const containerFormat='),end=source.indexOf('/** Read-only ownership audit candidates.');
  assert.ok(start>=0&&end>start);
  const observer=Function('docker','canonicalDigest','CONTRACT','hold',
    source.slice(start,end)+'\nreturn containerIdentity;');
  for(const row of fixture().rows){
    const legacy=observer(args=>{
      assert.deepEqual(args,['inspect',row[0],'--format',LEGACY_CONTAINER_FIELDS.join('\t')]);
      return quoted([row.slice(0,12)]);
    },canonicalDigest,CONTRACT,assert.fail);
    assert.deepEqual(legacy(row[0]),legacyContainerIdentity(row));
  }
});

test('exact generic pin yields only a fixed aggregate result, never release authority',()=>{
  const f=fixture();
  assert.equal(f.run(),'NO_GENERIC_MISMATCH');
  f.rows[3][2]='/renamed-'+privateValue;
  assert.equal(f.run(),'IDENTITY_CHANGED');
  f.rows.pop();
  assert.equal(f.run(),'NO_GENERIC_MISMATCH');
});

test('the generic diagnosis excludes other release branches without granting admission',()=>{
  for(const alter of [
    row=>{row[7]=true;},
    row=>{row[9]='host';},
    row=>{row[2]='/watchtower-fixture';},
    row=>{row[11]='phoenix-erp';},
    row=>{row[1]=image('6');},
    row=>{row[15]=[{Type:'bind',Source:CONTRACT.controlRoot+'/'+privateValue}];},
    row=>{row[18]='readonly-inventory';},
    row=>{row[2]='/phoenix-migrate-schema-first-1234abcd';row[15]=[];row[19]='phoenix';
      row[16]=['./node_modules/.bin/typeorm'];row[17]=['-d','dist/database/data-source.js','migration:show'];},
  ]){
    const f=fixture();
    f.registry.value.containers=[];
    assert.equal(f.run(),'NO_PIN');
    alter(f.rows[3]);
    assert.equal(f.run(),'NO_GENERIC_MISMATCH');
  }
  const unproven=fixture();
  unproven.registry.value.containers=[];
  unproven.rows[3][18]='rehearsal-candidate-api';
  assert.equal(unproven.run(),'NO_PIN');
  unproven.rows[3][2]='/phoenix-migrate-schema-first-1234abcd';
  assert.equal(unproven.run(),'NO_PIN');
});

test('registry reports missing, stale, ambiguous and unusable pins without admitting release',()=>{
  for(const [change,status] of [
    [f=>{f.registry.value.containers=[];},'NO_PIN'],
    [f=>{f.pin.identitySha256=cid('0');},'IDENTITY_CHANGED'],
    [f=>{f.pin.owner='';},'OWNER_UNUSABLE'],
    [f=>f.registry.value.containers.push({...f.pin}),'AMBIGUOUS_PINS'],
    [f=>{f.pin.owner='';f.rows.push([cid('5'),...f.rows[3].slice(1)]);},'MIXED'],
  ]){
    const f=fixture();change(f);
    assert.equal(f.run(),status);
  }
  const f=fixture();
  assert.throws(()=>f.run({readRecord:name=>name==='active.json'?f.active:null}),/HOLD_REGISTRY_UNVERIFIED/);
  f.registry.value.evidenceSha256=privateValue;
  assert.throws(()=>f.run(),/HOLD_REGISTRY_UNVERIFIED/);
});

test('core is selected by fixed names independently of project and auxiliary labels',()=>{
  const f=fixture();
  f.rows[0][11]=null;
  f.rows[1][11]='unrelated-fixture-project';
  f.rows[2][11]='';
  f.rows[3][11]='phoenix-erp';
  f.registry.value.containers=[];
  assert.equal(f.run(),'NO_GENERIC_MISMATCH');
  f.rows[3][11]='';
  assert.equal(f.run(),'NO_PIN');
});

test('core failures use distinct fixed codes without including service names or values',()=>{
  for(const [mutate,code] of [
    [f=>{f.active.value.outcome=privateValue;},'HOLD_CORE_RECORD'],
    [f=>{f.active.value.active.web.imageId=privateValue;},'HOLD_CORE_RECORD'],
    [f=>{f.rows[0][2]='/renamed-core-fixture';},'HOLD_CORE_ROSTER'],
    [f=>{f.rows.push([cid('5'),...f.rows[1].slice(1)]);},'HOLD_CORE_ROSTER'],
    [f=>{f.rows[1][5]=0;},'HOLD_CORE_RUNTIME_STATE'],
    [f=>{f.rows[2][6]=false;},'HOLD_CORE_RUNTIME_STATE'],
    [f=>{f.rows[2][13]='unhealthy';},'HOLD_CORE_HEALTH'],
    [f=>{f.rows[2][13]=null;},'HOLD_CORE_HEALTH'],
    [f=>{f.active.value.active.api.revision=rev('f');},'HOLD_CORE_IMAGE_IDENTITY'],
    [f=>{f.active.value.active.api.imageId=image('f');},'HOLD_CORE_IMAGE_IDENTITY'],
    [f=>{f.images[0][1]=null;},'HOLD_CORE_IMAGE_IDENTITY'],
  ]){
    const f=fixture();
    mutate(f);
    assert.throws(()=>f.run(),{message:prefix+code});
  }
  const f=fixture();
  assert.throws(()=>f.run({readRecord:name=>name==='active.json'?null:f.readRecord(name)}),{message:prefix+'HOLD_CORE_RECORD'});
});

test('disappearance, movement and protected record changes withhold the entire census',()=>{
  const f=fixture();
  let lists=0;
  assert.throws(()=>f.run({docker:args=>args[0]==='ps'&&++lists===2?f.docker(args).replace(f.foreign+'\n',''):f.docker(args)}),/HOLD_CONTAINER_ROSTER_CHANGED/);
  let inspections=0;
  assert.throws(()=>f.run({docker:args=>{
    if(args[0]==='inspect'&&++inspections===2)f.rows[3][4]++;
    return f.docker(args);
  }}),/HOLD_CONTAINER_OBSERVATION_CHANGED/);
  inspections=0;
  assert.throws(()=>f.run({docker:args=>{
    if(args[0]==='inspect'&&++inspections===2)f.rows[3][15]=[];
    return f.docker(args);
  }}),/HOLD_CONTAINER_OBSERVATION_CHANGED/);
  let imageReads=0;
  assert.throws(()=>f.run({docker:args=>{
    if(args[0]==='image'&&++imageReads===2)f.images[0][1]=rev('f');
    return f.docker(args);
  }}),/HOLD_CONTAINER_OBSERVATION_CHANGED/);
  assert.throws(()=>f.run({docker:args=>args[0]==='inspect'?'':f.docker(args)}),/HOLD_OBSERVATION_UNAVAILABLE/);
  let registryReads=0;
  assert.throws(()=>f.run({readRecord:name=>name==='active.json'?f.active:{...f.registry,filePin:[String(++registryReads)]}}),/HOLD_PROTECTED_RECORD_CHANGED/);
});

test('mount order is immaterial while all mount values and the legacy bind order still matter',()=>{
  const mount=(source,destination)=>({Type:'bind',Source:source,Destination:destination,RW:false});
  const first=mount('/fixture/one','/one'),second=mount('/fixture/two','/two');
  const run=mutate=>{
    const f=fixture(),row=f.rows[3];
    row[10]=['/fixture/two:/two:ro','/fixture/one:/one:ro'];
    row[15]=[first,second,{...first}];
    f.pin.identitySha256=canonicalDigest(legacyContainerIdentity(row));
    let inspections=0;
    return f.run({docker:args=>{
      if(args[0]==='inspect'&&++inspections===2)mutate(row);
      return f.docker(args);
    }});
  };
  assert.equal(run(row=>{row[15]=[second,{...first},first];}),'NO_GENERIC_MISMATCH');
  for(const change of [
    row=>{row[15]=[second,first];},
    row=>{row[15]=[second,first,{...first},mount('/fixture/three','/three')];},
    row=>{row[15]=[second,first,{...first,Source:'/fixture/new'}];},
    row=>{row[15]=[second,first,{...first,RW:true}];},
    row=>{row[10].reverse();},
  ]){
    assert.throws(()=>run(change),/HOLD_CONTAINER_OBSERVATION_CHANGED/);
  }
});

const workflow=fs.readFileSync(new URL('../../.github/workflows/production-state-materialization.yml',import.meta.url),'utf8');
function actualWorkflowBlocks(){
  const start=workflow.indexOf('            if [ "${INCLUDE_CONTAINER_INVENTORY:-false}" = true ]; then');
  const end=workflow.indexOf('\n            test "$(git -C "$DEPLOY_PATH" branch',start);
  assert.ok(start>0&&end>start);
  const writer=workflow.indexOf('      - name: Write state materialization');
  const writerStart=workflow.indexOf('          set -euo pipefail',writer);
  const writerEnd=workflow.indexOf('\n      - name: Upload state materialization',writer);
  return {
    remote:workflow.slice(start,end).split('\n').map(line=>line.slice(12)).join('\n'),
    writer:workflow.slice(writerStart,writerEnd).split('\n').map(line=>line.slice(10)).join('\n'),
  };
}
test('the actual workflow default bypasses diagnosis and opt-in exits before other state output',t=>{
  assert.match(workflow,/include_container_inventory:\n\s+description: [^\n]+\n\s+required: false\n\s+default: false\n\s+type: boolean/);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-host-inventory-transport-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const script=actualWorkflowBlocks().remote;
  const invoke=extra=>spawnSync('/bin/bash',['-Eeuo','pipefail','-c',`
    git() {
      if [ "$FAIL_CHECKOUT" = "$3" ]; then printf '%s\\n' "$PRIVATE" >&2; return 1; fi
      [ "$3" != branch ] || printf '%s\\n' main
    }
  `+script+'\nprintf "%s\\n" OLD_STATE_PATH'],{
    env:{PATH:process.env.PATH,TMPDIR:directory,DEPLOY_PATH:'/fixture',PRIVATE:privateValue,FAIL_CHECKOUT:'',EXPECTED_MAIN_SHA:target,
      HOST_INVENTORY_BUNDLE_SHA:cid('a'),HOST_INVENTORY_BUNDLE:privateValue,...extra},encoding:'utf8',
  });
  for(const selection of [{},{INCLUDE_CONTAINER_INVENTORY:'false'}]){
    const disabled=invoke(selection);
    assert.equal(disabled.status,0);
    assert.equal(disabled.stdout+disabled.stderr,'OLD_STATE_PATH\n');
    assert.deepEqual(fs.readdirSync(directory),[]);
  }
  for(const [extra,expected] of [[{},'HOLD_SOURCE_UNAVAILABLE'],[{FAIL_CHECKOUT:'branch'},'HOLD_SOURCE_UNAVAILABLE'],
    [{FAIL_CHECKOUT:'status'},'HOLD_SOURCE_UNAVAILABLE'],
    [{RECORD_NAME:privateValue},'HOLD_INCOMPATIBLE_INPUT']]){
    const result=invoke({INCLUDE_CONTAINER_INVENTORY:'true',...extra});
    assert.equal(result.status,0);
    assert.equal(result.stdout,prefix+expected+'\n');
    assert.equal(result.stderr,'');
  }
});

test('both actual workflow filters publish only a fixed verdict, including with hostile helper output',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-host-diagnosis-filter-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const helper='scripts/ops/production-host-container-inventory.mjs';
  fs.mkdirSync(path.dirname(path.join(directory,helper)),{recursive:true});
  const blocks=actualWorkflowBlocks();
  const environment={PATH:process.env.PATH,TMPDIR:directory,DEPLOY_PATH:'/fixture',EXPECTED_MAIN_SHA:target,INCLUDE_CONTAINER_INVENTORY:'true'};
  const valid=prefix+'NO_GENERIC_MISMATCH\n',invalid=prefix+'HOLD_INVALID_DIAGNOSIS\n';
  const separator='===============================================';
  const banner=[separator,'✅ Successfully executed commands to all hosts.',separator].join('\n');
  for(const [stdout,stderr,exit,result] of [
    [valid,'',0,valid],
    ...coreHolds.map(code=>[prefix+code+'\n','',0,prefix+code+'\n']),
    [prefix+'HOLD_CORE_IDENTITY\n','',0,invalid],
    [valid+privateValue+'\n','',0,invalid],
    [privateValue+'\n'+valid,'',0,invalid],
    [valid+'\n','',0,invalid],
    [valid+banner+'\n','',0,invalid],
    [valid.trimEnd()+'\0','',0,invalid],
    [prefix+privateValue+'\n','',0,invalid],
    [valid,privateValue,0,invalid],
    [valid,'',1,invalid],
    [privateValue.repeat(500),'',0,invalid],
    [valid,privateValue.repeat(500),0,invalid],
  ]){
    fs.writeFileSync(path.join(directory,helper),`process.stdout.write(${JSON.stringify(stdout)});
      process.stderr.write(${JSON.stringify(stderr)});process.exitCode=${exit};`);
    const archive=spawnSync('tar',['-czf','-','-C',directory,helper]);
    assert.equal(archive.status,0);
    const bundle=archive.stdout.toString('base64');
    const transport=spawnSync('/bin/bash',['-Eeuo','pipefail','-c',
      'git() { if [ "$3" = branch ]; then printf "main\\n"; fi; }\n'+blocks.remote+'\nprintf "%s\\n" OLD_STATE_PATH'],{
      cwd:directory,env:{...environment,HOST_INVENTORY_BUNDLE:bundle,
        HOST_INVENTORY_BUNDLE_SHA:createHash('sha256').update(bundle).digest('hex')},encoding:'utf8',
    });
    assert.equal(transport.status,0);
    assert.equal(transport.stdout,result);
    assert.equal(transport.stderr,'');
  }
  const observed=prefix+'HOLD_CONTAINER_OBSERVATION_CHANGED\n';
  for(const [dump,expected] of [[valid,valid],[valid.trimEnd(),valid],[privateValue,invalid],
    ...coreHolds.map(code=>[prefix+code+'\n'+banner,prefix+code+'\n']),
    [prefix+'HOLD_CORE_IDENTITY\n'+banner,invalid],
    [valid+privateValue,invalid],[valid+'\n',invalid],[prefix+'HOLD_EXECUTION_UID\n',prefix+'HOLD_EXECUTION_UID\n'],
    [observed+banner,observed],[observed+banner+'\n',observed],
    [valid+'\n'+banner,invalid],[valid+banner+'\n\n',invalid],
    [valid+banner+'\n'+privateValue,invalid],[privateValue+'\n'+valid+banner,invalid],
    [valid+banner.slice(1),invalid],[valid+banner.slice(0,-1),invalid],
    [valid+banner.replace('all hosts.','all hosts!'),invalid],[valid+banner+'\u001b[0m',invalid],
    [valid+banner.replaceAll('\n','\r\n'),invalid],[prefix+privateValue+'\n'+banner,invalid]]){
    const artifact=spawnSync('/bin/bash',['-c',blocks.writer],{
      cwd:directory,env:{...environment,STATE_DUMP:dump},encoding:'utf8',
    });
    assert.deepEqual([artifact.status,artifact.stdout,artifact.stderr],[0,'','']);
    assert.equal(fs.readFileSync(path.join(directory,'production-state-materialization.txt'),'utf8'),expected);
  }
});
