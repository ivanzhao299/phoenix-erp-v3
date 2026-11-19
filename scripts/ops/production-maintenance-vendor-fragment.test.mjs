import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readMaintenanceVendorFragment,partitionMaintenanceSchedulerUnits,normalizeMaintenanceSystemdDefinition,isMaintenanceSystemdMask,maintenanceSchedulerRejectionDiagnostic,observeMaintenanceSchedulerLinkDiagnostic} from './production-maintenance-root-readers.mjs';
import {ancestors} from './production-trusted-paths.mjs';
import path from 'node:path';

const cases=[
 ['dracut-cmdline.service','77dracut-systemd'],['dracut-initqueue.service','77initqueue'],
 ['dracut-mount.service','77dracut-systemd'],['dracut-pre-mount.service','77dracut-systemd'],
 ['dracut-pre-pivot.service','77dracut-systemd'],['dracut-pre-trigger.service','77dracut-systemd'],
 ['dracut-pre-udev.service','77dracut-systemd'],['dracut-shutdown-onfailure.service','77dracut-systemd'],
 ['dracut-shutdown.service','77dracut-systemd'],
];
function fixture([unit,module]=cases[0]){
 const name='/usr/lib/systemd/system/'+unit,target=`/usr/lib/dracut/modules.d/${module}/${unit}`;
 let inode=1;
 const stat=(kind,extra={})=>({dev:1,ino:inode++,uid:0,gid:0,nlink:1,size:0,mtimeMs:1,ctimeMs:1,
  mode:kind==='dir'?0o40755:kind==='link'?0o120777:0o100644,
  isFile:()=>kind==='file',isDirectory:()=>kind==='dir',isSymbolicLink:()=>kind==='link',...extra});
 const bytes=Buffer.from('[Service]\nExecStart=/usr/bin/true\n');
 const states=new Map([...new Set([...ancestors(path.dirname(name)),...ancestors(path.dirname(target))])].map(p=>[p,stat('dir')]));
 states.set(name,stat('link',{size:target.length}));states.set(target,stat('file',{size:bytes.length}));
 const f={request:{name,source:'SYSTEMD_FRAGMENT',loaded:true,unitId:unit},states,target,bytes,stat,linkText:target,closed:0,opened:0,reads:0,aclCalls:0};
 const io={lstatSync(p){if(!states.has(p))throw Object.assign(Error('missing'),{code:'ENOENT'});return states.get(p);},
  readlinkSync(){return f.linkText;},openSync(p,flags){assert.equal(p,target);assert.equal(flags,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);f.opened++;f.descriptor=states.get(p);f.onOpen?.();return 9;},
  fstatSync(fd){assert.equal(fd,9);return f.descriptor;},
  readSync(fd,b,offset,length){assert.equal(fd,9);f.reads++;f.onRead?.();const count=Math.min(length,Math.max(0,f.bytes.length-offset));f.bytes.copy(b,offset,offset,offset+count);return count;},
  closeSync(fd){assert.equal(fd,9);f.closed++;}};
 f.dependencies={fs:io,acls(names){f.aclCalls++;f.onAcl?.(names);return names.map(p=>f.aclPath===p?[true,false]:[false,false]);}};
 f.read=()=>readMaintenanceVendorFragment(f.request,f.dependencies);return f;
}
for(const row of cases)test('exact loaded vendor mapping: '+row[0],()=>{
 const f=fixture(row),out=f.read();assert.deepEqual(out.bytes,f.bytes);assert.equal(out.identity.fragment,f.request.name);
 assert.equal(out.identity.target,f.target);assert.equal(out.identity.linkText,f.target);
 assert.equal(out.identity.contentSha256,createHash('sha256').update(f.bytes).digest('hex'));
 assert.equal(f.opened,1);assert.equal(f.closed,1);assert.equal(f.aclCalls,2);
});
test('protected paths require fragment source, loaded state and exact Id; unrelated paths retain the original reader',()=>{
 for(const change of [{source:'CRON_D'},{source:'SYSTEMD_DROPIN'},{loaded:false},{unitId:'dracut-mount.service'},{unitId:'dracut-extra.service'}]){
  const f=fixture();Object.assign(f.request,change);assert.throws(f.read,/VENDOR_CONTEXT/);assert.equal(f.opened,0);
 }
 for(const name of ['/usr/lib/systemd/system-evil/dracut-cmdline.service','/lib/systemd/system/dracut-cmdline.service','/unrelated.service']){
  const f=fixture();f.request.name=name;assert.equal(f.read(),null);assert.equal(f.opened,0);
 }
});
test('relative and absolute targets retain exact resolved mapping and raw spelling in the pin',()=>{
 const f=fixture();f.linkText=path.relative(path.dirname(f.request.name),f.target);const result=f.read();
 assert.equal(result.identity.linkText,'../../dracut/modules.d/77dracut-systemd/dracut-cmdline.service');
 assert.equal(result.identity.target,f.target);
});
test('wrong module, name, escaping and malformed direct targets fail closed',()=>{
 for(const target of ['/usr/lib/dracut/modules.d/77initqueue/dracut-cmdline.service','/usr/lib/dracut/modules.d/77dracut-systemd/dracut-mount.service',
  '../dracut/modules.d/77dracut-systemd/dracut-cmdline.service','/private/unit','',fixture().target+'\0','x'.repeat(4097),fixture().target+'/']){
  const f=fixture();f.linkText=target;assert.throws(f.read,/VENDOR_LINK/);assert.equal(f.opened,0);
 }
});
test('chain, dangling, FIFO, oversize, owner, write bits and special modes are rejected before open',()=>{
 for(const change of ['chain','dangling','fifo','oversize','sourceMissing','sourceRegular','targetOwner','targetGroupWrite','targetOtherWrite','targetSpecial','targetHardlink','linkOwner','linkHardlink','parentOwner','parentWrite','parentSpecial','parentSymlink']){
  const f=fixture(),s=f.states.get(f.target),parent='/usr/lib/dracut';
  if(change==='chain')f.states.set(f.target,f.stat('link'));
  if(change==='dangling')f.states.delete(f.target);
  if(change==='fifo')f.states.set(f.target,f.stat('fifo'));
  if(change==='oversize')s.size=1048577;
  if(change==='sourceMissing')f.states.delete(f.request.name);
  if(change==='sourceRegular')f.states.set(f.request.name,f.stat('file'));
  if(change==='targetOwner')s.uid=1000;
  if(change==='targetGroupWrite')s.mode|=0o020;
  if(change==='targetOtherWrite')s.mode|=0o002;
  if(change==='targetSpecial')s.mode|=0o4000;
  if(change==='targetHardlink')s.nlink=2;
  if(change==='linkOwner')f.states.get(f.request.name).uid=1000;
  if(change==='linkHardlink')f.states.get(f.request.name).nlink=2;
  if(change==='parentOwner')f.states.get(parent).uid=1000;
  if(change==='parentWrite')f.states.get(parent).mode|=0o020;
  if(change==='parentSpecial')f.states.get(parent).mode|=0o1000;
  if(change==='parentSymlink')f.states.set(parent,f.stat('link'));
  assert.throws(f.read,/ROOT_READER_VENDOR_/);assert.equal(f.opened,0,change);
 }
});
test('extended ACL on target or any ancestor and unreadable ACL metadata fails closed',()=>{
 const base=fixture();for(const p of [...base.states.keys()].filter(p=>p!==base.request.name)){const f=fixture();f.aclPath=p;assert.throws(f.read,/VENDOR_ACL/);assert.equal(f.opened,0);}
 const f=fixture();f.dependencies.acls=()=>{throw Error('CONFIG_HOLD=ACL_METADATA_UNAVAILABLE');};assert.throws(f.read,/VENDOR_UNVERIFIED/);
});
test('descriptor mismatch and every post-read replacement close the descriptor and HOLD',()=>{
 for(const change of ['descriptor','target','linkIdentity','linkText','parent','acl','contentSize']){
  const f=fixture();
  if(change==='descriptor')f.onOpen=()=>{f.descriptor={...f.descriptor,ino:999};};
  else f.onRead=()=>{
   if(change==='target')f.states.set(f.target,{...f.states.get(f.target),ino:999});
   if(change==='linkIdentity')f.states.set(f.request.name,{...f.states.get(f.request.name),ino:999});
   if(change==='linkText')f.linkText='/private/other';
   if(change==='parent')f.states.set('/usr/lib',{...f.states.get('/usr/lib'),ino:999});
   if(change==='acl')f.aclPath=f.target;
   if(change==='contentSize')f.bytes=Buffer.concat([f.bytes,Buffer.from('!')]);
  };
  assert.throws(f.read,/ROOT_READER_VENDOR_/);assert.equal(f.opened,1);assert.equal(f.closed,1,change);
 }
});
test('target boundary reads at most one MiB plus a sentinel and read errors always close',()=>{
 const f=fixture();f.bytes=Buffer.alloc(1048576,1);f.states.get(f.target).size=f.bytes.length;assert.equal(f.read().bytes.length,1048576);assert.equal(f.closed,1);
 const broken=fixture();broken.dependencies.fs.readSync=()=>{throw Error('EIO');};assert.throws(broken.read,/VENDOR_UNVERIFIED/);assert.equal(broken.closed,1);
});
test('pin changes for link identity and target identity even when content stays equal',()=>{
 const first=fixture().read();for(const p of ['source','target','parent']){
  const f=fixture();f.states.get(p==='source'?f.request.name:p==='target'?f.target:'/usr/lib').ino=999;
  const next=f.read();assert.deepEqual(next.bytes,first.bytes);assert.notDeepEqual(next.identity,first.identity);
 }
});
test('capture applies the exact vendor capability before generic ENOENT and regular-file paths',()=>{
 const source=fs.readFileSync(new URL('./production-maintenance-root-readers.mjs',import.meta.url),'utf8');
 const capture=source.slice(source.indexOf('export function captureMaintenanceSchedulers('));
 const file=capture.slice(capture.indexOf('const file='),capture.indexOf("file('/etc/crontab'"));
 assert.ok(file.indexOf('readMaintenanceVendorFragment({name,source,loaded,unitId})')<file.indexOf('fs.lstatSync(name)'));
 assert.ok(file.indexOf('readMaintenanceVendorFragment({name,source,loaded,unitId})')<file.indexOf('if(!stat.isFile()'));
});
test('actual capture body rejects missing/replaced/context-mismatched protected fragments instead of generic fallback or masking',()=>{
 // Compile the unchanged capture function body with local IO boundaries, not
 // a second implementation. This proves wiring; the real root/systemd host
 // acceptance remains the separate PG16/18 first-switch jobs.
 const source=fs.readFileSync(new URL('./production-maintenance-root-readers.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('export function captureMaintenanceSchedulers('),source.indexOf('/** Mutable executor/control rows')).trim().replace(/^export /,'');
 assert.ok(body.endsWith('}'));
 const hold=reason=>{throw Error('MAINTENANCE_HOLD='+reason);};
 for(const change of ['valid','missing','regular','unloaded','wrongId','dropin','masked']){
  const f=fixture();if(change==='missing')f.states.delete(f.request.name);
  if(change==='regular')f.states.set(f.request.name,f.stat('file',{size:12}));
  const id=change==='wrongId'?'other.service':f.request.unitId;
  const loaded=change==='unloaded'?'not-found':change==='masked'?'masked':'loaded';
  const properties=`Id=${id}\nLoadState=${loaded}\nExecStart=\n${change==='dropin'?'DropInPaths':'FragmentPath'}=${f.request.name}`;
  const io={...f.dependencies.fs,constants:fs.constants,existsSync:p=>p==='/usr/bin/systemctl',
   readdirSync:()=>{throw Object.assign(Error('absent'),{code:'ENOENT'});},
   readFileSync:()=>{throw Error('GENERIC_VENDOR_READ_MUST_NOT_RUN');}};
  const vendor=new Map([[f.request.unitId,{fragment:f.request.name,target:f.target}]]);
  const boundaries={guard:()=>{},fs:io,hash:b=>createHash('sha256').update(b).digest('hex'),CONTRACT:{repository:'/data/phoenix-erp'},
   readMaintenanceVendorFragment:r=>readMaintenanceVendorFragment(r,f.dependencies),hold,path,
   partitionMaintenanceSchedulerUnits,normalizeMaintenanceSystemdDefinition,isMaintenanceSystemdMask,VENDOR_FRAGMENTS:vendor,
   maintenanceSchedulerRejectionDiagnostic,observeMaintenanceSchedulerLinkDiagnostic,
   run:(_program,args)=>args[0]==='list-unit-files'?id+' static':properties};
  const capture=Function(...Object.keys(boundaries),body+';return captureMaintenanceSchedulers;')(...Object.values(boundaries));
  if(change==='valid')assert.equal(capture().filter(r=>r.id===f.request.name).length,1);
  else assert.throws(capture,/ROOT_READER_VENDOR_/,change);
 }
});
test('raw target traversal cannot hide a symlink ancestor before dot-dot normalization',()=>{
 const f=fixture();f.linkText='/usr/lib/dracut/hidden/../modules.d/77dracut-systemd/dracut-cmdline.service';
 f.states.set('/usr/lib/dracut/hidden',f.stat('link'));assert.throws(f.read,/VENDOR_PARENT/);assert.equal(f.opened,0);
});
