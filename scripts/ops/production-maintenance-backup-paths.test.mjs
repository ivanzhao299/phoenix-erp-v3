import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {CONTRACT} from './production-config-guard.mjs';
import {inspectTrustedDirectory,ancestors} from './production-trusted-paths.mjs';
import {preparePendingMigrationBackupPaths,verifyPendingMigrationBackupPaths} from './pending-migration-backup-paths.mjs';
function fixture(){
 const runId='123-1',parent='/opt/phoenix-erp-backups',directory=parent+'/pending-migration-'+runId;
 const stage=CONTRACT.stateDirectory+'/migration-apply-'+runId,states=new Map(),files=new Map();let ino=1;
 const stat=(extra={})=>({dev:1,ino:ino++,uid:0,gid:0,mode:0o40755,nlink:1,size:0,mtimeMs:1,ctimeMs:1,isDirectory:()=>true,isSymbolicLink:()=>false,isFile:()=>false,...extra});
 for(const p of [...new Set([...ancestors('/opt'),...ancestors(stage)])])states.set(p,stat({mode:p===CONTRACT.controlRoot||p.startsWith(CONTRACT.controlRoot+'/')?0o40700:0o40755}));
 const f={runId,parent,directory,stage,states,files,stat,acl:[],mounts:[{id:'1',device:'1:1',target:'/',root:'/',filesystem:'ext4'}],mkdirs:[]};
 const io={lstatSync(p){const s=states.get(p);if(!s)throw Object.assign(Error('absent'),{code:'ENOENT'});return s;},realpathSync:p=>p,
  mkdirSync(p,{mode}){if(states.has(p))throw Object.assign(Error('exists'),{code:'EEXIST'});f.mkdirs.push(p);states.set(p,stat({mode:0o40000|mode}));f.onMkdir?.(p);},
  writeFileSync(p,bytes,options){assert.equal(options.flag,'wx');assert.equal(options.mode,0o600);if(files.has(p))throw Error('EEXIST');files.set(p,bytes);f.onWrite?.();}};
 const inspect=p=>inspectTrustedDirectory(p,CONTRACT,{fs:io,mounts:()=>f.mounts,acls:names=>names.map(n=>f.acl.includes(n)?[true,false]:[false,false])});
 f.dependencies={fs:io,inspect,uid:0,guard:()=>{},readPin:p=>Buffer.from(files.get(p))};
 f.prepare=()=>preparePendingMigrationBackupPaths(runId,f.dependencies);f.verify=()=>verifyPendingMigrationBackupPaths(runId,f.dependencies);return f;
}
test('actual trusted-directory validator permits exclusive private backup namespace and stable verify',()=>{
 const f=fixture();f.prepare();assert.deepEqual(f.mkdirs,[f.parent,f.directory]);assert.equal(f.states.get(f.directory).mode&0o7777,0o700);f.verify();
 assert.throws(f.prepare,/exists/,'Never reuse an existing run directory');
});
test('failed real-context boundary or untrusted existing STAGE causes zero namespace/pin mutations',()=>{
 const locked=fixture();locked.dependencies.guard=()=>{throw Error('CONFIG_HOLD=HOST_LOCK_NOT_HELD');};assert.throws(locked.prepare,/HOST_LOCK_NOT_HELD/);assert.equal(locked.mkdirs.length,0);assert.equal(locked.files.size,0);
 const stage=fixture();stage.states.get(stage.stage).uid=1000;assert.throws(stage.prepare,/UNTRUSTED_ANCESTOR/);assert.equal(stage.mkdirs.length,0);assert.equal(stage.files.size,0);
 const missing=fixture();missing.states.delete(missing.stage);assert.throws(missing.prepare,/CONFIG_HOLD=/);assert.equal(missing.mkdirs.length,0);assert.equal(missing.files.size,0);
});
test('untrusted /opt or existing backup parent is rejected without chmod or run creation',()=>{
 for(const target of ['/opt','/opt/phoenix-erp-backups'])for(const kind of ['symlink','owner','writable','acl','unknownAcl']){
  const f=fixture();if(!f.states.has(target))f.states.set(target,f.stat());const s=f.states.get(target);
  if(kind==='symlink')s.isSymbolicLink=()=>true;
  if(kind==='owner')s.uid=1000;
  if(kind==='writable')s.mode|=0o020;
  if(kind==='acl')f.acl.push(target);
  if(kind==='unknownAcl')f.dependencies.inspect=()=>{throw Error('CONFIG_HOLD=ACL_METADATA_UNAVAILABLE');};
  assert.throws(f.prepare,/CONFIG_HOLD=/,target+kind);assert.ok(!f.states.has(f.directory));
 }
});
test('an independent backup mount or root filesystem outside CONTRACT is HOLD',()=>{
 for(const change of ['nested','root']){const f=fixture();
  if(change==='nested')f.mounts.push({id:'2',device:'2:1',target:'/opt',root:'/',filesystem:'ext4'});else f.mounts[0].filesystem='overlay';
  assert.throws(f.prepare,/UNEXPECTED_CONTROL_MOUNT/);assert.equal(f.mkdirs.length,0);
 }
});
test('parent replacement during creation and directory/ACL/mount replacement after dump refuse DDL verification',()=>{
 const create=fixture();create.onMkdir=p=>{if(p===create.directory)create.states.get(create.parent).ino=999;};assert.throws(create.prepare,/PATH_CHANGED/);
 for(const change of ['parent','run','stage','acl','mount']){const f=fixture();f.prepare();
  if(change==='parent')f.states.get(f.parent).ino=999;
  if(change==='run')f.states.get(f.directory).ino=999;
  if(change==='stage')f.states.get(f.stage).ino=999;
  if(change==='acl')f.acl.push(f.parent);
  if(change==='mount')f.mounts[0].id='changed';
  assert.throws(f.verify,/CONFIG_HOLD=/,change);
 }
});
test('wrong pin identity, world-accessible run and non-root CLI fail closed',()=>{
 const f=fixture();f.prepare();const key=[...f.files.keys()][0];const pin=JSON.parse(f.files.get(key));pin.runId='999-1';f.files.set(key,JSON.stringify(pin));assert.throws(f.verify,/PIN_IDENTITY/);
 const mode=fixture();mode.onMkdir=p=>{if(p===mode.directory)mode.states.get(p).mode=0o40755;};assert.throws(mode.prepare,/RUN_DIRECTORY_MODE/);
 assert.throws(()=>preparePendingMigrationBackupPaths(f.runId,{...f.dependencies,uid:1000}),/ROOT_ACTIONS_IDENTITY_REQUIRED/);
 if(process.getuid()!==0){const cli=spawnSync(process.execPath,[path.resolve('scripts/ops/pending-migration-backup-paths.mjs'),'prepare','123-1'],{encoding:'utf8',timeout:5000});assert.notEqual(cli.status,0);assert.match(cli.stderr,/ROOT_ACTIONS_IDENTITY_REQUIRED/);}
});
