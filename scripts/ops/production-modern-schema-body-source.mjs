/** The runner supplies no body. The host reads the exact T Git blob and only
 * the already reviewed common perform_deployment function. */
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const fail=code=>{throw Error('MODERN_SCHEMA_BODY_SOURCE_HOLD='+code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function extractModernSchemaDeploymentBody(source){
 if(typeof source!=='string'||Buffer.byteLength(source)>262144||source.includes('\0'))fail('BOUNDED_WORKFLOW_REQUIRED');
 const start='            perform_deployment() {\n',end='\n            }\n\n            if { ';
 if(source.split(start).length!==2||source.split(end).length!==2)fail('UNIQUE_REVIEWED_FUNCTION_REQUIRED');
 const first=source.indexOf(start),last=source.indexOf(end,first);if(last<=first)fail('COMPLETE_REVIEWED_FUNCTION_REQUIRED');
 const body=source.slice(first,last+'\n            }'.length).split('\n').map(line=>line.startsWith('            ')?line.slice(12):line).join('\n')+'\n';
 if(!body.startsWith('perform_deployment() {\n')||!/\nproduction_state complete\n/.test(body)||!body.includes('MODERN_SCHEMA_BODY_SUPERVISED')
  ||/\bset\s+-[^\s]*x\b/.test(body))fail('REVIEWED_TYPED_BODY_REQUIRED');
 return {body,bodySha256:hash(body),workflowSha256:hash(source)};
}
export function readCommittedModernSchemaDeploymentBody(root,targetSha){
 if(!/^[a-f0-9]{40}$/.test(targetSha??''))fail('EXACT_COMMIT_REQUIRED');
 const args=['--no-replace-objects','-c',`safe.directory=${root}`,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false'];
 const options={cwd:root,env:{PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1'},encoding:'utf8',timeout:10000,maxBuffer:262144,stdio:['ignore','pipe','pipe']};
 try{
  if(!/^100(?:644|755) blob [a-f0-9]{40}\t\.github\/workflows\/deploy\.yml\n$/.test(execFileSync('/usr/bin/git',[...args,'ls-tree',targetSha,'--','.github/workflows/deploy.yml'],options)))fail('REGULAR_WORKFLOW_BLOB_REQUIRED');
  return extractModernSchemaDeploymentBody(execFileSync('/usr/bin/git',[...args,'show',targetSha+':.github/workflows/deploy.yml'],options));
 }catch(error){if(error.message.startsWith('MODERN_SCHEMA_BODY_SOURCE_HOLD='))throw error;fail('COMMITTED_WORKFLOW_UNAVAILABLE');}
}
