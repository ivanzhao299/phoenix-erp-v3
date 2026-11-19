/** Exact staged T source graph, not the old R working tree. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {CONTRACT,git,verifyContext} from './production-config-guard.mjs';import {assertRegularFile,inspectTrustedDirectory} from './production-trusted-paths.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_STAGE_HOLD='+code);};
export function verifyModernSchemaStage({owner,targetSha},dependencies={}){
 const root=dependencies.root??CONTRACT.repository,stateDirectory=dependencies.stateDirectory??CONTRACT.stateDirectory;
 const guard=dependencies.guard??(()=>verifyContext(root,stateDirectory));guard();
 const directory=dependencies.stageDirectory??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 if(directory!==path.join(stateDirectory,'modern-schema-stage-'+owner)||fs.realpathSync(directory)!==directory)fail('EXACT_ROOT_STAGED_ENTRY_REQUIRED');
 inspectTrustedDirectory(directory,CONTRACT);const manifest='scripts/ops/modern-schema-stage-files.txt';
 const files=git(root,['show',targetSha+':'+manifest]).split('\n');
 if(!files.length||files.length>512||new Set(files).size!==files.length||!files.includes(manifest)||!files.includes('scripts/ops/production-modern-schema-release.mjs'))fail('COMPLETE_CREATE_ONLY_STAGE_MANIFEST_REQUIRED');
 const digest=createHash('sha256');
 for(const file of files){
  if(!/^(?:scripts\/(?:ops|ci)\/[A-Za-z0-9_./-]+|scripts\/(?:ledger-preflight\.mjs|deploy-schema-first\.sh)|apps\/api\/src\/common\/database\/api-bootstrap-schema-contract\.json|\.github\/workflows\/deploy\.yml|docker-compose\.yml)$/.test(file)
   ||file.includes('/../')||file.includes('/./'))fail('FIXED_STAGE_SOURCE_SCOPE_REQUIRED');
  const absolute=path.join(directory,file),stat=fs.lstatSync(absolute);assertRegularFile(stat);
  const expected=execFileSync('/usr/bin/git',['--no-replace-objects','-c',`safe.directory=${root}`,'-c','core.hooksPath=/dev/null','show',targetSha+':'+file],
   {cwd:root,env:{PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1'},timeout:10000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}),actual=fs.readFileSync(absolute);
  const object=git(root,['ls-tree',targetSha,'--',file]);if(!/^100(?:644|755) blob [a-f0-9]{40}\t/.test(object)||!actual.equals(expected))fail('STAGED_SOURCE_BYTES_CHANGED');
  digest.update(file+'\0').update(createHash('sha256').update(actual).digest('hex')+'\n');
 }
 const allowed=new Set(files);const walk=base=>{for(const entry of fs.readdirSync(base,{withFileTypes:true})){
  const absolute=path.join(base,entry.name),stat=fs.lstatSync(absolute);if(stat.isSymbolicLink())fail('STAGE_LINK_OR_EXTRA_FILE');
  if(stat.isDirectory()){inspectTrustedDirectory(absolute,CONTRACT);walk(absolute);}else if(!allowed.has(path.relative(directory,absolute)))fail('STAGE_LINK_OR_EXTRA_FILE');
 }};walk(directory);guard();return {schema:'phoenix.modern-schema-staged-source/v1',owner,targetSha,directory,files,sha256:digest.digest('hex'),readOnly:true};
}
