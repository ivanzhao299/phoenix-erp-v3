import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {partitionMaintenanceSchedulerUnits,isMaintenanceSystemdMask} from './production-maintenance-root-readers.mjs';

test('actual uninstantiated template does not abort ordinary unit properties or disappear',()=>{
 const result=partitionMaintenanceSchedulerUnits('apport-coredump-hook@.service static -\ncron.service enabled enabled\ngetty@tty1.service enabled enabled\n');
 assert.deepEqual(result.instances,['cron.service','getty@tty1.service']);
 assert.deepEqual(result.templates,['apport-coredump-hook@.service']);
 assert.equal(result.entries.length,3);
});
test('masked template state is explicit and unmasking returns its definitions to capture',()=>{
 const masked=partitionMaintenanceSchedulerUnits('example@.service masked enabled');
 assert.deepEqual(masked.templates,[]);
 assert.deepEqual(masked.maskedTemplates,[{name:'example@.service',state:'masked'}]);
 assert.deepEqual(partitionMaintenanceSchedulerUnits('example@.service disabled enabled').templates,['example@.service']);
});
test('unknown states, ambiguous duplicates and malformed identifiers fail closed',()=>{
 for(const text of ['cron.service UNVERIFIED enabled','cron.service enabled\ncron.service disabled','../cron.service enabled'])assert.throws(()=>partitionMaintenanceSchedulerUnits(text),/ROOT_READER_UNIT_INVENTORY/);
});

test('explicit systemd mask sentinel is retained as masked state rather than read as a regular definition',()=>{
 assert.equal(isMaintenanceSystemdMask('/dev/null',['LoadState=masked','ExecStart=']),true);
 assert.equal(isMaintenanceSystemdMask('/dev/null',['LoadState=masked']),true); // systemctl omits nonexistent/empty service fields
 assert.equal(isMaintenanceSystemdMask('/dev/null',['LoadState=loaded','ExecStart=']),false);
 assert.equal(isMaintenanceSystemdMask('/dev/null',['LoadState=masked','ExecStart=/usr/bin/example']),false);
 assert.equal(isMaintenanceSystemdMask('/dev/zero',['LoadState=masked','ExecStart=']),false);
});
test('a legitimate dot-prefixed instance remains an instance',()=>{
 assert.deepEqual(partitionMaintenanceSchedulerUnits('example@.bar.service enabled').instances,['example@.bar.service']);
});

test('Ubuntu masked unit FragmentPath symlink is resolved only to the exact empty mask sentinel',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-mask-observation-')),file=path.join(dir,'sudo.service');
 try{
  fs.symlinkSync('/dev/null',file);
  assert.equal(isMaintenanceSystemdMask(file,['LoadState=masked','ExecStart=']),true);
  assert.equal(isMaintenanceSystemdMask(file,['LoadState=loaded','ExecStart=']),false);
  fs.unlinkSync(file);fs.writeFileSync(file,'[Service]\nExecStart=/usr/bin/example\n');
  assert.equal(isMaintenanceSystemdMask(file,['LoadState=masked','ExecStart=']),false);
 }finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
});
