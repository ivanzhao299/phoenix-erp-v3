/** Opt-in real isolated restore + official immutable R/T AppModule runs.
 * Only the explicitly owned local native source fixture is read. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';
import {createModernSchemaBackup} from './production-modern-schema-backup.mjs';
import {collectModernSchemaPlan} from './production-modern-schema-plan.mjs';
import {rehearseModernSchemaRelease} from './production-modern-schema-rehearsal.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
test('the owned same-major PostgreSQL snapshot restores into a new isolated DB and both official images stay read-only across Cron minute',{
 skip:process.env.MODERN_SCHEMA_REHEARSAL_PG!=='1',timeout:300000},async()=>{
 const previousUmask=process.umask(0o077);
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),directory=fs.mkdtempSync(path.join(root,'artifacts/modern-schema-native-rehearsal-'));
 const docker=(args,input)=>execFileSync('/usr/bin/docker',args,{input,env:executionEnv(),encoding:'utf8',timeout:20000,maxBuffer:65536,stdio:['pipe','pipe','pipe']}).trim();
 const sourceName=process.env.MODERN_SCHEMA_REHEARSAL_PG_SOURCE??'phoenix-modern-schema-native-20261119';
 assert.match(sourceName,/^phoenix-modern-schema-native-(?:pg16-)?20[0-9]{6}$/);
 const source=docker(['inspect',sourceName,'--format','{{.Id}}\t{{.Image}}\t{{.State.StartedAt}}\t{{.RestartCount}}\t{{index .Config.Labels "phoenix.fixture"}}']).split('\t');assert.equal(source[4],'modern-schema-source');
 const databasePin={id:source[0],image:source[1],startedAt:source[2],restartCount:Number(source[3])},owner=Date.now()+'-1';
 const privateRuntime=new ModernSchemaPrivateRuntime({directory,root,expectedUid:process.getuid(),guard(){},inspectDirectory:dir=>{const stat=fs.lstatSync(dir);assert.equal(stat.isDirectory(),true);assert.equal(stat.uid,process.getuid());assert.equal(stat.mode&0o777,0o700);return {dev:stat.dev,ino:stat.ino,mode:stat.mode};}});
 const client=new ModernSchemaReadClient({databaseContainer:databasePin.id,guard(){}});await client.start();
 try{
  const candidateImageId=docker(['image','inspect','phoenix-installments-local-api:c811330e','--format','{{.Id}}']),runtimeImageId=docker(['image','inspect','phoenix-installments-local-api:cb42966e','--format','{{.Id}}']);
  const {plan}=await collectModernSchemaPlan(client,{owner,targetSha:'c811330e4182660e299d8bf44a35794ba0846470',runtimeSha:'cb42966edfa717b0984936951143d84973c1a263',candidateImageId},{root,guard(){}});
  assert.equal(plan.pendingCount,20);const backup=await createModernSchemaBackup({owner,stage:'prepare',client,databasePin,privateRuntime});
  const helper=(control,script,input)=>{
   assert.equal(path.dirname(control),path.join(directory,'schema-release-prepare-rehearsal-'+owner));
   const id=docker(['create','--pull=never','-i','--network=none','--label',`phoenix.fixture=modern-schema-rehearsal-root-${owner}`,
    '--mount',`type=bind,source=${control},target=/control`,'node:20-bookworm-slim','node','-e',script]);assert.match(id,/^[a-f0-9]{64}$/);docker(['start','-a','-i',id],input);
   assert.equal(docker(['inspect',id,'--format','{{.State.ExitCode}}']),'0');
  };
  const result=await rehearseModernSchemaRelease({owner,stage:'prepare',backup,plan,runtimeImageId,privateRuntime},{gatedCli:process.env.MODERN_SCHEMA_GATED_REHEARSAL_PG==='1',
   prepareMigrationGate:control=>helper(control,"const fs=require('fs');fs.chownSync('/control',0,0);fs.chmodSync('/control',0o755);for(const name of ['preload.cjs','launch.cjs']){fs.chownSync('/control/'+name,0,0);fs.chmodSync('/control/'+name,0o444)}"),
   publishMigrationPermit:(control,permit)=>helper(control,"const fs=require('fs');let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>{const fd=fs.openSync('/control/permit.json','wx',0o444);fs.writeFileSync(fd,data);fs.fchmodSync(fd,0o444);fs.fsyncSync(fd);fs.closeSync(fd)})",JSON.stringify(permit)+'\n'),
   preparePublicDirectory:control=>helper(control,"const fs=require('fs');fs.chownSync('/control',0,0);fs.chmodSync('/control',0o755)"),
   publishPublicManifest:(file,manifest)=>helper(path.dirname(file),"const fs=require('fs');let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>{const fd=fs.openSync('/control/manifest.json','wx',0o444);fs.writeFileSync(fd,data);fs.fsyncSync(fd);fs.closeSync(fd)})",JSON.stringify(manifest)+'\n')
  });
  assert.equal(result.evidence.outcome,'PASS');assert.equal(result.evidence.backgroundWrites,0);assert.equal(result.evidence.defaultOffEvidence.featureRollout,'OFF');
  assert.equal(result.evidence.cloneDatabaseMajor,Math.trunc(backup.source.database.serverVersionNum/10000));
  assert.equal(result.resources.find(resource=>resource.role==='rehearsal-database')?.databaseMajor,result.evidence.cloneDatabaseMajor);
  for(const resource of result.resources)assert.equal(docker(['inspect',resource.containerId,'--format','{{.State.Running}}\t{{.State.ExitCode}}\t{{.State.OOMKilled}}']),'false\t0\tfalse');
  privateRuntime.publishJson(path.join(directory,'native-proof.json'),{fixtureOnly:true,productionMutation:false,outcome:'PASS',directory,receipt:result.evidence});
 }finally{await client.close();process.umask(previousUmask);}
});
