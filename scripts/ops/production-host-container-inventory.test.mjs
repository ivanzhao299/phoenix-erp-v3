import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {CONTRACT} from './production-config-guard.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {collectProductionHostContainerInventory,legacyContainerIdentity,LEGACY_CONTAINER_FIELDS} from './production-host-container-inventory.mjs';

const cid=char=>char.repeat(64),rev=char=>char.repeat(40),image=char=>'sha256:'+cid(char);
const target=rev('a'),privateValue='PRIVATE_FIXTURE_SENTINEL';
const schema='phoenix.maintenance-reviewed-host-ownership/v1';
const quoted=rows=>rows.map(row=>row.map(value=>JSON.stringify(value)).join('\t')).join('\n');
function fixture(){
  const apiRev=rev('b'),webRev=rev('c'),foreign=cid('4'),gone=cid('5');
  const services=['api','web','db'];
  const rows=services.map((service,i)=>[cid(String(i+1)),image(String(i+6)),'/phoenix-v3-'+service,'2026-11-19T12:00:00Z',0,21,true,false,'','fixture-net',null,
    'phoenix-erp',service,'running','healthy','always',false,[],{}, {fixture:{}},null,null,'','']);
  rows.push([foreign,image('9'),'/'+privateValue,'2026-11-19T12:00:00Z',2,0,false,false,'','none',[CONTRACT.repository+'/'+privateValue+':/bind:ro'],
    '', '', 'exited',null,'no',true,[{Type:'bind',Source:CONTRACT.repository+'/'+privateValue,Destination:'/bind'}],{}, {none:{}},
    [privateValue],[privateValue],'',privateValue]);
  const images=[[image('6'),apiRev,'https://github.com/ivanzhao299/phoenix-erp'],
    [image('7'),webRev,'https://github.com/ivanzhao299/phoenix-erp-v3'],[image('8'),'',''],[image('9'),rev('d'),privateValue]];
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
      assert.doesNotMatch(args[4],/\.Config\.Env/);
      return quoted(args.slice(5).map(id=>rows.find(row=>row[0]===id)));
    }
    assert.deepEqual(args.slice(0,3),['image','inspect','--format']);
    return quoted(args.slice(4).map(id=>images.find(row=>row[0]===id)));
  };
  return {run:overrides=>collectProductionHostContainerInventory(target,{docker,readRecord,guard(){},...overrides}),
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

test('stable roster corroborates core, exact pins and removed registry IDs without private names or values',()=>{
  const f=fixture(),result=f.run();
  assert.deepEqual(result.containers.map(row=>row.classification),['CORE_API','CORE_WEB','CORE_DB','AUXILIARY_PHOENIX_SHAPE']);
  assert.equal(result.containers[0].oci.knownProjectSource,true);
  assert.equal(result.containers[0].oci.matchesActiveApi,true);
  assert.equal(result.containers[0].oci.matchesActiveWeb,false);
  assert.equal(result.registryOnlyCidCount,1);
  assert.equal(result.releaseAuthorized,false);
  const observed=result.containers[3];
  assert.deepEqual(observed.ownership,{status:'EXACT_PIN',registered:1,identityMatches:1,qualifiedMatches:1});
  assert.equal(observed.oci.knownProjectSource,false);
  assert.equal(observed.runtime.pidZero,true);
  assert.equal(observed.runtime.bindMountCount,1);
  assert.equal(observed.runtime.network,'NONE');
  const output=JSON.stringify(result);
  for(const forbidden of [privateValue,CONTRACT.repository,'/phoenix-v3-api',image('9'),rev('d'),'/bind'])assert.equal(output.includes(forbidden),false);
  f.rows[3][2]='/phoenix-migrate-schema-first-1234abcd';
  assert.equal(f.run().containers[3].classification,'AUXILIARY_PHOENIX_SHAPE');
  f.images[3][2]='https://github.com/ivanzhao299/phoenix-erp';
  f.rows[3][10]=null;
  f.rows[3][17]=[];
  f.rows[3][20]=['./node_modules/.bin/typeorm'];
  f.rows[3][21]=['-d','dist/database/data-source.js','migration:show'];
  f.rows[3][23]='phoenix';
  assert.equal(f.run().containers[3].classification,'HISTORICAL_SCHEMA_TOOL_SHAPE');
});

test('registry reports missing, stale, ambiguous and unusable pins without admitting release',()=>{
  for(const [change,status] of [
    [f=>{f.registry.value.containers=[];},'NO_PIN'],
    [f=>{f.pin.identitySha256=cid('0');},'IDENTITY_CHANGED'],
    [f=>{f.pin.owner='';},'OWNER_UNUSABLE'],
    [f=>f.registry.value.containers.push({...f.pin}),'AMBIGUOUS_PINS'],
  ]){
    const f=fixture();change(f);
    const observation=f.run();
    assert.equal(observation.containers[3].ownership.status,status);
    assert.equal(observation.releaseAuthorized,false);
  }
  const f=fixture(),missing=f.run({readRecord:name=>name==='active.json'?f.active:null});
  assert.equal(missing.registry,'ABSENT');
  assert.equal(missing.containers[3].ownership.status,'NO_PIN');
  f.registry.value.evidenceSha256=privateValue;
  assert.throws(()=>f.run(),/HOLD_REGISTRY_UNVERIFIED/);
});

test('core drift, disappearance, movement and record changes withhold the entire census',()=>{
  const f=fixture();
  for(const [mutate,revert,expected] of [
    [()=>{f.rows[2][14]='unhealthy';},()=>{f.rows[2][14]='healthy';},/HOLD_CORE_IDENTITY/],
    [()=>{f.active.value.active.api.revision=rev('f');},()=>{f.active.value.active.api.revision=rev('b');},/HOLD_CORE_IDENTITY/],
  ]){
    mutate();assert.throws(()=>f.run(),expected);revert();
  }
  let lists=0;
  assert.throws(()=>f.run({docker:args=>args[0]==='ps'&&++lists===2?f.docker(args).replace(f.foreign+'\n',''):f.docker(args)}),/HOLD_CONTAINER_ROSTER_CHANGED/);
  let inspections=0;
  assert.throws(()=>f.run({docker:args=>{
    if(args[0]==='inspect'&&++inspections===2)f.rows[3][4]++;
    return f.docker(args);
  }}),/HOLD_CONTAINER_OBSERVATION_CHANGED/);
  assert.throws(()=>f.run({docker:args=>args[0]==='inspect'?'':f.docker(args)}),/HOLD_OBSERVATION_UNAVAILABLE/);
  let registryReads=0;
  assert.throws(()=>f.run({readRecord:name=>name==='active.json'?f.active:{...f.registry,filePin:[String(++registryReads)]}}),/HOLD_PROTECTED_RECORD_CHANGED/);
});

test('the actual workflow keeps inventory disabled by default and rejects a bad transport digest',t=>{
  const workflow=fs.readFileSync(new URL('../../.github/workflows/production-state-materialization.yml',import.meta.url),'utf8');
  assert.match(workflow,/include_container_inventory:\n\s+description: [^\n]+\n\s+required: false\n\s+default: false\n\s+type: boolean/);
  const start=workflow.indexOf('            if [ "${INCLUDE_CONTAINER_INVENTORY:-false}" = true ]; then');
  const end=workflow.indexOf('\n            find "$STATE_DIR"',start);
  assert.ok(start>0&&end>start);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-host-inventory-transport-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const invoke=extra=>spawnSync('/bin/bash',['-Eeuo','pipefail','-c',workflow.slice(start,end)],{
    env:{PATH:process.env.PATH,tmp:directory,EXPECTED_MAIN_SHA:target,HOST_INVENTORY_BUNDLE_SHA:cid('a'),
      HOST_INVENTORY_BUNDLE:privateValue,...extra},encoding:'utf8',
  });
  for(const selection of [{},{INCLUDE_CONTAINER_INVENTORY:'false'}]){
    const disabled=invoke(selection);
    assert.equal(disabled.status,0);
    assert.equal(disabled.stdout+disabled.stderr,'');
    assert.deepEqual(fs.readdirSync(directory),[]);
  }
  const corrupt=invoke({INCLUDE_CONTAINER_INVENTORY:'true'});
  assert.equal(corrupt.status,0);
  assert.equal(corrupt.stdout,'HOST_CONTAINER_INVENTORY=HOLD_SOURCE_UNAVAILABLE\n');
  assert.equal(corrupt.stderr,'');
});
