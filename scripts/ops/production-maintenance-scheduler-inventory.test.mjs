import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {partitionMaintenanceSchedulerUnits,isMaintenanceSystemdMask,normalizeMaintenanceSystemdDefinition} from './production-maintenance-root-readers.mjs';

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

const execBlock=(metadata='start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0',command='/usr/lib/update-notifier/package-data-downloader',ignore='no')=>`Id=update-notifier-download.service\nLoadState=loaded\nExecStart={ path=${command} ; argv[]=${command} --flag ; ignore_errors=${ignore} ; ${metadata} }\nWorkingDirectory=/`;
test('normal systemd last-run changes retain the complete loaded command definition',()=>{
 const before=execBlock(),after=execBlock('start_time=[Tue 2026-10-20 01:48:00 UTC] ; stop_time=[Tue 2026-10-20 01:48:02 UTC] ; pid=9876 ; code=exited ; status=0');
 assert.equal(normalizeMaintenanceSystemdDefinition(before),normalizeMaintenanceSystemdDefinition(after));
 assert.match(normalizeMaintenanceSystemdDefinition(before),/argv\[\]=.* --flag ; ignore_errors=no/);
 for(const changed of [execBlock(undefined,'/usr/bin/other'),execBlock(undefined,undefined,'yes'),before.replace('--flag','--different'),before.replace('WorkingDirectory=/','WorkingDirectory=/data/phoenix-erp')])assert.notEqual(normalizeMaintenanceSystemdDefinition(before),normalizeMaintenanceSystemdDefinition(changed));
});
test('unknown systemd execution serialization remains HOLD rather than dropping a command',()=>{
 for(const block of [execBlock().replace(' ; pid=0',' ; future_field=1 ; pid=0'),execBlock().replace(' ; stop_time=[n/a]',''),execBlock().replace('ignore_errors=no','ignore_errors=UNKNOWN')])assert.throws(()=>normalizeMaintenanceSystemdDefinition(block),/SYSTEMD_EXEC_DEFINITION_FORMAT/);
 assert.equal(normalizeMaintenanceSystemdDefinition('Id=masked.service\nLoadState=masked'),'Id=masked.service\nLoadState=masked');
});

test('ambiguous argv metadata and compound textual commands remain HOLD',()=>{
 const collision='ExecStart={ path=/bin/echo ; argv[]=/bin/echo ; start_time=[ARG_A] ; stop_time=[x] ; pid=1 ; code=exited ; status=0 } { path=ARG ; argv[]=ARG ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0 }';
 assert.throws(()=>normalizeMaintenanceSystemdDefinition(collision),/SYSTEMD_EXEC_DEFINITION_FORMAT/);
 const single=execBlock().split('\n').find(line=>line.startsWith('ExecStart='));
 assert.throws(()=>normalizeMaintenanceSystemdDefinition(single+' ; '+single.slice(10)),/SYSTEMD_EXEC_DEFINITION_FORMAT/);
});

test('typed D-Bus fallback preserves compound commands and argv sentinel bytes without ambiguity',()=>{
 const command=['/bin/sh',['/bin/sh','-c','{ echo " ; start_time=[sentinel] } { path=ARG"; }'],false,0,0,0,0,0,0,0],other=['/bin/echo',['/bin/echo','second'],true,0,0,0,0,0,0,0];
 const typed={type:'a(sasbttttuii)',data:[command,other]},block='Id=test.service\nExecStart=AMBIGUOUS_HUMAN_TEXT';
 const output=normalizeMaintenanceSystemdDefinition(block,typed);assert.match(output,/sentinel/);assert.match(output,/second/);
 const later=structuredClone(typed);later.data[0][3]=123456789;later.data[0][7]=1234;assert.equal(output,normalizeMaintenanceSystemdDefinition(block,later));
 later.data[0][1][2]+=' CHANGED';assert.notEqual(output,normalizeMaintenanceSystemdDefinition(block,later));
 for(const value of [{type:'unknown',data:[command]},{type:typed.type,data:[]},{type:typed.type,data:[command.slice(0,9)]},{type:typed.type,data:[command.map((v,i)=>i===2?'false':v)]}])assert.throws(()=>normalizeMaintenanceSystemdDefinition(block,value),/SYSTEMD_TYPED_EXEC_FORMAT/);
});
