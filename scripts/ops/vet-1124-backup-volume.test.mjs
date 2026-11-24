import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { archiveEvidence, physicalPins, physicalParent, volumeUuid } from './vet-1124-backup-volume.mjs';
const run = physicalParent + '/pending-migration-123-1';
function fixture() {
  const rdev = (259 << 8) | 1;
  const f = {alias:physicalParent, uuid:volumeUuid, device:rdev, writable:'', acl:'', missing:false, symlink:'', nested:false};
  const root = {id:'1',target:'/',root:'/',device:'259:4',filesystem:'ext4'};
  const data = {id:'2',target:'/data',root:'/',device:'259:1',filesystem:'ext4'};
  const options = {
    io: {
      lstatSync: name => ({isDirectory:()=>true,isSymbolicLink:()=>name==='/opt/phoenix-erp-backups'||name===f.symlink,
        ino:1, uid:0, mode:name===f.writable?0o40775:name.startsWith(physicalParent)?0o40700:0o40755,
        dev:name.startsWith('/data')?f.device:rdev+3}),
      realpathSync: name => name==='/opt/phoenix-erp-backups'?f.alias:name,
      statSync: name => ({isBlockDevice:()=>name==='/dev/disk/by-uuid/'+volumeUuid,rdev}),
    },
    optPins:()=>[], acls:names=>names.map(n=>[n===f.acl,false]),
    mountedVolume:()=>f.uuid+'  259:1',
    mountInfo:()=>f.missing?[root]:f.nested?[root,data,{...data,id:'3',target:run+'/mounted'}]:[root,data],
  };
  return {f, check:()=>physicalPins(run,options)};
}
test('approved physical root has an exact data mount, block identity, protected ancestry and fixed alias',()=>{
  const {check}=fixture();
  assert.equal(check().volumeUuid,volumeUuid);
  for(const changed of [{alias:'/elsewhere'}, {uuid:'wrong'}, {device:1}, {missing:true}, {nested:true},
    {writable:'/data/backups/opt'}, {acl:'/data/backups'}, {symlink:'/data/backups/opt'}]){
    const {f,check}=fixture();Object.assign(f,changed);assert.throws(check,/BACKUP_PATH_HOLD/);
  }
  assert.throws(()=>physicalPins(physicalParent+'/another-path'),/NAMESPACE/);
});

test('the receipt hashes the opened archive and rejects a changed or linked file', t=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'vet-archive-'));
  t.after(()=>fs.rmSync(scratch,{recursive:true,force:true}));
  const local=path.join(scratch,'sample');
  fs.writeFileSync(local,'actual bytes',{mode:0o600});
  const digest=createHash('sha256').update('actual bytes').digest('hex');
  // The sandbox uses the test owner's UID. Model the observed root owner only.
  const owned = stat => Object.assign(stat,{uid:0});
  const adapter={...fs, lstatSync:()=>owned(fs.lstatSync(local)), fstatSync:fd=>owned(fs.fstatSync(fd)),
    openSync:(_path,flags)=>fs.openSync(local,flags)};
  const read=()=>archiveEvidence(run,'123-1','a'.repeat(40),digest,adapter);
  const receipt=read();assert.equal(receipt.sha256,digest);
  const actual=fs.statSync(local);assert.deepEqual(receipt.archivePin,[actual.dev,actual.ino,actual.size,actual.mtimeMs,actual.ctimeMs]);
  fs.appendFileSync(local,'changed');assert.throws(read,/ARCHIVE_CHANGED/);
  fs.linkSync(local,local+'-linked');assert.throws(read,/FILE_PERMISSIONS_OR_LINK/);
});
