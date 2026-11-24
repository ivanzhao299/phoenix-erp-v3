import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=fs.readFileSync(path.join(root,'.github/workflows/controlled-pending-migration-apply.yml'),'utf8');
const start=source.indexOf('              # BEGIN pending-migration backup:');
const end=source.indexOf('              # END pending-migration backup.',start);
assert.ok(start>0&&end>start);
const block=source.slice(start,end).split('\n').map(line=>line.slice(14)).join('\n');
const enabled=process.env.PENDING_MIGRATION_BACKUP_PG_FIXTURE==='1';
test('pending apply backs up after audit/ledger guards and before any DDL; inspect exits first',()=>{
 assert.ok(source.indexOf('if [ "$PHASE" = inspect ]; then')<start);
 assert.ok(source.indexOf('test "$AUDIT_CONCLUSION" = GO')<start);
 assert.ok(source.indexOf('HOLD_LEDGER_MOVED')<start);
 assert.ok(end<source.indexOf('PRESERVE_ARTIFACTS=true bash scripts/deploy-schema-first.sh',end));
 assert.match(block,/BACKUP_PARENT=\/opt\/phoenix-erp-backups/);
 assert.match(block,/pending-migration-\$\{MIGRATION_RUN_ID\}/);
 assert.match(block,/pending-migration-backup-paths\.mjs" prepare/);assert.match(block,/chmod 600/);assert.match(block,/2097152/);
 assert.ok(block.indexOf('verify "$MIGRATION_RUN_ID"')<block.indexOf('docker exec -i phoenix-v3-db sh'));
 assert.ok(block.lastIndexOf('verify "$MIGRATION_RUN_ID"')>block.indexOf('> "$BACKUP_FILE"'));
 const recheck=source.indexOf('FINAL_VET_INSPECTION_SHA256="$(vet_inspection)"',end);
 const verify=source.indexOf('node "$STAGE/pending-migration-backup-paths.mjs" verify "$MIGRATION_RUN_ID"',end);
 const ddl=source.indexOf('PRESERVE_ARTIFACTS=true bash scripts/deploy-schema-first.sh',end);
 assert.ok(end<recheck&&recheck<verify&&verify<ddl);
 assert.match(source.slice(verify,ddl),/^node "\$STAGE\/pending-migration-backup-paths\.mjs" verify "\$MIGRATION_RUN_ID"\s+$/);
 assert.match(block,/pg_restore --exit-on-error --no-owner --no-privileges --file=\/dev\/null/);
 assert.match(block,/sha256sum --check --status/);
 assert.doesNotMatch(block,/\b(?:rm|find)\s/);
});

for(const major of [16,18])test(`actual PG${major} custom archive/full parse, failure gates and retained backups`,{skip:!enabled,timeout:180000},async()=>{
 const directory=fs.mkdtempSync(path.join(root,'artifacts/pending-backup-'));
 const container=`flock-pending-backup-${major}-${process.pid}-${randomBytes(4).toString('hex')}`;
 const docker=execFileSync('/bin/sh',['-c','command -v docker'],{encoding:'utf8'}).trim();assert.ok(path.isAbsolute(docker));
 const call=(args,input)=>execFileSync(docker,args,{input,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']});
 const backupParent=path.join(directory,'backups'),bin=path.join(directory,'bin'),trace=path.join(directory,'docker-trace');
 fs.mkdirSync(bin,{mode:0o700});
 fs.writeFileSync(path.join(bin,'docker'),`#!${process.execPath}\nconst{spawnSync}=require('node:child_process'),fs=require('node:fs');const args=process.argv.slice(2);if(args[0]!=='exec'||args[1]!=='-i'||args[2]!=='phoenix-v3-db')process.exit(90);args[2]=process.env.OWNED_DB;fs.appendFileSync(process.env.OWNED_TRACE,JSON.stringify(args)+'\\n');if(args[3]==='pg_restore'&&args.some(x=>x.startsWith('-d')||x.startsWith('--dbname')))process.exit(91);const r=spawnSync(${JSON.stringify(docker)},args,{input:fs.readFileSync(0),maxBuffer:8*1024*1024,timeout:30000});if(r.error)process.exit(92);if(args[3]==='sh'&&process.env.OWNED_FAULT==='empty')process.exit(0);if(args[3]==='sh'&&process.env.OWNED_FAULT==='truncated')r.stdout=r.stdout.subarray(0,Math.floor(r.stdout.length*0.7));process.stdout.write(r.stdout||Buffer.alloc(0));process.stderr.write(r.stderr||Buffer.alloc(0));process.exit(r.status??93);\n`,{mode:0o700});
 fs.writeFileSync(path.join(bin,'df'),'#!/bin/bash\nif [ "$OWNED_FAULT" = low-space ]; then printf "Filesystem 1024-blocks Used Available Capacity Mounted\\nowned 1 0 1 0%% /\\n"; else exec /usr/bin/df "$@"; fi\n',{mode:0o700});
 // Actual archive commands run against owned PG. Production root/mount path
 // authority is separately exercised with the real trusted validator and
 // adversarial metadata in backup-paths.test; it is not claimed by this adapter.
 const body=block.replace('BACKUP_PARENT=/opt/phoenix-erp-backups','BACKUP_PARENT="$OWNED_BACKUP_PARENT"')
  .replace('node "$STAGE/pending-migration-backup-paths.mjs" prepare "$MIGRATION_RUN_ID"','mkdir -p "$BACKUP_PARENT"; mkdir -m 700 "$BACKUP_DIR"')
  .replaceAll('node "$STAGE/pending-migration-backup-paths.mjs" verify "$MIGRATION_RUN_ID"','true # owned archive test path adapter');
 const run=(runId,fault='')=>spawnSync('/bin/bash',['-c','set -Eeuo pipefail\numask 077\n'+body+'\necho OWNED_MIGRATION_WOULD_START\n'],{encoding:'utf8',timeout:60000,cwd:root,env:{PATH:bin+':'+process.env.PATH,MIGRATION_RUN_ID:runId,TARGET_SHA:'a'.repeat(40),OWNED_BACKUP_PARENT:backupParent,OWNED_DB:container,OWNED_TRACE:trace,OWNED_FAULT:fault}});
 let created=false;
 try{
  call(['run','--rm','-d','--network','none','--name',container,'--label','phoenix.fixture=pending-migration-backup','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=postgres','-e','POSTGRES_DB=postgres',`postgres:${major}-alpine`]);created=true;
  const until=Date.now()+30000;let ready=false;
  while(Date.now()<until){const r=spawnSync(docker,['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],{timeout:3000,stdio:'ignore'});if(r.status===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}
  assert.ok(ready,'Owned PostgreSQL readiness must be real');
  call(['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],"CREATE TABLE owned_backup_sample(id integer PRIMARY KEY,payload text); INSERT INTO owned_backup_sample SELECT n,md5(random()::text)||md5(random()::text)||md5(random()::text) FROM generate_series(1,3000) n;");
  const good=run('901-1');assert.equal(good.status,0,good.stderr);assert.match(good.stdout,/VERIFIED_CUSTOM_ARCHIVE_FULL_PARSE/);assert.match(good.stdout,/OWNED_MIGRATION_WOULD_START/);
  const first=path.join(backupParent,'pending-migration-901-1'),file=path.join(first,'phoenix_erp_pre_aaaaaaaaaaaa.dump'),sum=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(fs.statSync(first).mode&0o777,0o700);
  for(const name of fs.readdirSync(first))assert.equal(fs.statSync(path.join(first,name)).mode&0o777,0o600,name);
  assert.ok(fs.readFileSync(file+'.sha256','utf8').startsWith(sum+'  '));
  const calls=fs.readFileSync(trace,'utf8').trim().split('\n').map(JSON.parse);assert.equal(calls.length,3);assert.ok(calls[2].includes('--file=/dev/null'));assert.ok(calls.every(a=>!a.includes('--dbname')));
  const again=run('901-1');assert.notEqual(again.status,0);assert.doesNotMatch(again.stdout,/OWNED_MIGRATION_WOULD_START/);assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sum);
  for(const [runId,fault] of [['902-1','empty'],['903-1','truncated'],['904-1','low-space']]){
   const r=run(runId,fault);assert.notEqual(r.status,0,fault);assert.doesNotMatch(r.stdout,/OWNED_MIGRATION_WOULD_START|VERIFIED_CUSTOM_ARCHIVE_FULL_PARSE/,fault);
   if(fault==='truncated'){const toc=path.join(backupParent,'pending-migration-'+runId,'archive-toc.txt');assert.ok(fs.statSync(toc).size>0,'TOC readable but full archive parse must fail');}
  }
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sum,'Earlier verified backup is retained');
  assert.notEqual(run('../escape').status,0);
 }finally{
  if(created)call(['stop','--time','5',container]);
  // Only task-created artifacts, scoped to the unique directory above.
  fs.rmSync(directory,{recursive:true});
 }
});
