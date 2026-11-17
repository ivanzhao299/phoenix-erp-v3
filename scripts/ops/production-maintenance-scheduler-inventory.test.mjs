import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {partitionMaintenanceSchedulerUnits,isMaintenanceSystemdMask,normalizeMaintenanceSystemdDefinition,maintenanceSchedulerRejectionDiagnostic,readMaintenanceSchedulerDiagnostic,classifyMaintenanceSchedulerTarget,observeMaintenanceSchedulerLinkDiagnostic} from './production-maintenance-root-readers.mjs';

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


test('scheduler HOLD diagnostics contain only fixed source/reason enums',()=>{
 const sources=['CRONTAB','CRON_D','USER_CRONTABS','CRON_SPOOL','SYSTEMD_FRAGMENT','SYSTEMD_DROPIN'];
 const stat=(kind,size=1)=>({isSymbolicLink:()=>kind==='link',isDirectory:()=>kind==='directory',isFile:()=>kind==='file',size});
 for(const source of sources)for(const [kind,size,reason] of [['link',1,'SYMLINK'],['directory',1,'DIRECTORY'],['socket',1,'OTHER_SPECIAL'],['file',1048577,'OVERSIZE']]){
  const value=maintenanceSchedulerRejectionDiagnostic(stat(kind,size),source);
  assert.deepEqual(value,{source,reason});
  assert.deepEqual(readMaintenanceSchedulerDiagnostic({schedulerFileDiagnostic:{...value,path:'/private/secret',uid:123,content:'PRIVATE'}}),{source,reason});
 }
 assert.equal(maintenanceSchedulerRejectionDiagnostic(stat('file',1048576),'CRON_D'),null);
 assert.equal(maintenanceSchedulerRejectionDiagnostic(stat('link'),'/private/path'),null);
 for(const value of [undefined,{source:'PATH=/private',reason:'SYMLINK'},{source:'CRON_D',reason:'PRIVATE'}])assert.equal(readMaintenanceSchedulerDiagnostic({schedulerFileDiagnostic:value}),null);
});
test('diagnosis retains exact scheduler rejection and stable-read safeguards',()=>{
 const reader=fs.readFileSync(new URL('./production-maintenance-root-readers.mjs',import.meta.url),'utf8');
 assert.match(reader,/if\(!stat\.isFile\(\)\|\|stat\.isSymbolicLink\(\)\|\|stat\.size>1024\*1024\)\{/);
 assert.match(reader,/hold\('ROOT_READER_SCHEDULER_FILE_UNVERIFIED'\)/);
 assert.match(reader,/schedulerFileDiagnostic=maintenanceSchedulerRejectionDiagnostic\(stat,source\)/);
 assert.match(reader,/if\(source==='SYSTEMD_FRAGMENT'&&stat\.isSymbolicLink\(\)\)/);
 assert.match(reader,/stat\.ino!==after\.ino\|\|stat\.mtimeMs!==after\.mtimeMs\|\|stat\.size!==after\.size/);
 assert.match(reader,/if\(stat\.isDirectory\(\)&&directory==='\/var\/spool\/cron'\)continue/);
 const fixture=fs.readFileSync(new URL('../ci/maintenance-full-first-switch.fixture.mjs',import.meta.url),'utf8');
 assert.match(fixture,/result\.schedulerFileDiagnostic=readMaintenanceSchedulerDiagnostic\(error\)/);
});


test('fragment diagnostics classify fixed roots without path-prefix confusion or escapes',()=>{
 for(const root of ['/usr/lib/systemd/system','/lib/systemd/system','/etc/systemd/system'])assert.equal(classifyMaintenanceSchedulerTarget(root+'/unit.service'),'SYSTEM_UNIT_DIR');
 assert.equal(classifyMaintenanceSchedulerTarget('/run/systemd/system/unit.service'),'RUNTIME_UNIT_DIR');
 for(const name of ['/usr/lib/systemd/system-evil/unit','/usr/lib/systemd/system/../../private/unit','/private/unit'])assert.equal(classifyMaintenanceSchedulerTarget(name),'OTHER');
});
test('rejected fragment link diagnostics reveal only bounded enums, including broken and chained links',()=>{
 const directory=fs.mkdtempSync(path.resolve('artifacts/scheduler-diagnostic-')),target=path.join(directory,'target'),link=path.join(directory,'link'),chain=path.join(directory,'chain');
 try{
  fs.writeFileSync(target,'SYNTHETIC PRIVATE CONTENT');fs.symlinkSync('target',link);fs.symlinkSync('link',chain);
  const original=fs.lstatSync(link),value=observeMaintenanceSchedulerLinkDiagnostic(link,original,true);
  assert.deepEqual(value,{loadStateClass:'LOADED',targetClass:'OTHER',targetType:'REGULAR',linkShape:'SINGLE',stability:'STABLE'});
  assert.equal(observeMaintenanceSchedulerLinkDiagnostic(chain,fs.lstatSync(chain),false).linkShape,'CHAIN');
  fs.unlinkSync(target);assert.equal(observeMaintenanceSchedulerLinkDiagnostic(link,fs.lstatSync(link),true).targetType,'MISSING');
  const safe=readMaintenanceSchedulerDiagnostic({schedulerFileDiagnostic:{source:'SYSTEMD_FRAGMENT',reason:'SYMLINK',...value,path:link,targetText:'PRIVATE',uid:123,hash:'PRIVATE'}});
  assert.deepEqual(safe,{source:'SYSTEMD_FRAGMENT',reason:'SYMLINK',...value});
  assert.doesNotMatch(JSON.stringify(safe),/PRIVATE|scheduler-diagnostic|uid|hash|path|targetText/);
  const invalid=readMaintenanceSchedulerDiagnostic({schedulerFileDiagnostic:{...safe,targetType:'/private/value'}});assert.equal(invalid.targetType,undefined);
 }finally{for(const name of [chain,link,target])if(fs.existsSync(name)||(()=>{try{return fs.lstatSync(name).isSymbolicLink();}catch{return false;}})())fs.unlinkSync(name);fs.rmdirSync(directory);}
});
test('fragment diagnostic catches link replacement and never propagates observation failures',()=>{
 const directory=fs.mkdtempSync(path.resolve('artifacts/scheduler-diagnostic-')),target=path.join(directory,'target'),other=path.join(directory,'other'),link=path.join(directory,'link'),readlink=fs.readlinkSync;
 try{
  fs.writeFileSync(target,'A');fs.writeFileSync(other,'B');fs.symlinkSync('target',link);const initial=fs.lstatSync(link);let changed=false;
  fs.readlinkSync=(name,...args)=>{const text=readlink(name,...args);if(name===link&&!changed){changed=true;fs.unlinkSync(link);fs.symlinkSync('other',link);}return text;};
  assert.equal(observeMaintenanceSchedulerLinkDiagnostic(link,initial,true).stability,'CHANGED');
  fs.readlinkSync=()=>{throw Error('PRIVATE FAILURE');};
  assert.deepEqual(observeMaintenanceSchedulerLinkDiagnostic(link,initial,true),{loadStateClass:'LOADED',targetClass:'UNRESOLVED',targetType:'UNREADABLE',linkShape:'UNRESOLVED',stability:'UNVERIFIED'});
 }finally{fs.readlinkSync=readlink;for(const name of [link,target,other])fs.unlinkSync(name);fs.rmdirSync(directory);}
});
