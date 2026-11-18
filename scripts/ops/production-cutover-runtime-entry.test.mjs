import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'../..'),entry=path.join(root,'apps/api/dist/scripts/production-cutover-apply.js');
const directory=fs.mkdtempSync(path.join(root,'artifacts/cutover-runtime-entry-')),preload=path.join(directory,'forbid-effects.cjs');
fs.writeFileSync(preload,`const {createRequire}=require('node:module');
const load=createRequire(${JSON.stringify(path.join(root,'apps/api/package.json'))});
load('typeorm').DataSource.prototype.initialize=function(){throw Error('OWNED_DATABASE_INITIALIZATION_ATTEMPT');};
require('node:net').Socket.prototype.connect=function(){throw Error('OWNED_NETWORK_CONNECTION_ATTEMPT');};
`,{mode:0o600});
const invoke=args=>spawnSync(process.execPath,['--require',preload,entry,...args],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'production'}});

test('actual compiled cutover module self-check starts no database or network and never claims host admission',()=>{
  assert.equal(fs.existsSync(entry),true,'Build API before this compiled entry test');const result=invoke(['--self-check']);
  assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');
  assert.deepEqual(JSON.parse(result.stdout),{protocol:'phoenix.production-cutover-runtime/1',moduleOnly:true,databaseInitialized:false,activationAuthorized:false});
});
test('direct execution and unsupported apply arguments reject before any database or network initialization',()=>{
  for(const args of [[],['apply'],['--self-check','extra']]){
    const result=invoke(args);assert.equal(result.status,2,result.stderr);assert.equal(result.stdout,'');
    assert.equal(result.stderr,'PRODUCTION_CUTOVER=HOLD_TRUSTED_HOST_REQUIRED;databaseInitialized=false\n');
  }
});
